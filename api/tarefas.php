<?php
/* KONSTANTE SaaS — api/tarefas.php  ·  tarefas (v1.9.0)
   Ações: opcoes, resumo, listar, obter, salvar, status, checklist, blocos, comentar,
          anexo.enviar, anexo.excluir, excluir
   Quem vê: admin e coordenação veem todas; técnico vê as dele (responsável ou "para todos").
   Quem edita tudo: admin, coordenação ou quem criou. Os responsáveis mudam status,
   marcam o checklist, escrevem nos blocos, comentam e anexam fotos.
   Repetição: ao concluir uma tarefa que se repete, nasce a próxima (uma só vez). */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once dirname(__DIR__) . '/nucleo/anexos.php';
require_once dirname(__DIR__) . '/nucleo/notificacoes.php';   /* v1.19.0 */
date_default_timezone_set('America/Sao_Paulo');

const TF_STATUS = ['aberta', 'andamento', 'aguardando', 'feita', 'cancelada'];
const TF_PRIO   = ['baixa', 'normal', 'alta', 'urgente'];
const TF_FREQ   = ['semanal', 'mensal', 'trimestral', 'anual'];
const TF_POR_PAGINA = 200;

function tf_escritorio($u) { return tem_perfil($u, 'admin', 'coord', 'comercial', 'financeiro'); }   /* v1.22.0 */

/* técnico (e quem marca "só as minhas") vê as tarefas em que é responsável ou "para todos" */
function tf_filtro_meu($uid) {
    return [" AND (t.para_todos = 1 OR t.criado_por = ? OR EXISTS (SELECT 1 FROM tarefa_responsaveis r WHERE r.tenant_id = t.tenant_id AND r.tarefa_id = t.id AND r.usuario_id = ?))", [$uid, $uid]];
}

const TF_SELECT = "SELECT t.*, cl.nome AS cliente_nome, cl.numero AS cliente_numero, cr.nome AS criador_nome
                     FROM tarefas t
                     LEFT JOIN clientes cl ON cl.tenant_id = t.tenant_id AND cl.id = t.cliente_id
                     LEFT JOIN usuarios cr ON cr.tenant_id = t.tenant_id AND cr.id = t.criado_por";

function tf_json($v, $padrao = []) { $j = json_decode((string) $v, true); return is_array($j) ? $j : $padrao; }

/* checklist: [{nome, feito, subs:[{nome, feito}]}] — devolve [feitos, total] */
function tf_conta_itens($itens) {
    $f = 0; $t = 0;
    foreach ($itens as $it) {
        $subs = $it['subs'] ?? [];
        if ($subs) foreach ($subs as $s) { $t++; if (!empty($s['feito'])) $f++; }
        else { $t++; if (!empty($it['feito'])) $f++; }
    }
    return [$f, $t];
}

function tf_responsaveis($ids, $tid) {
    if (!$ids) return [];
    $in = implode(',', array_fill(0, count($ids), '?'));
    return array_map(function ($r) { return ['id' => (int) $r['id'], 'nome' => $r['nome'], 'fotoId' => $r['foto_anexo_id'] !== null ? (int) $r['foto_anexo_id'] : null]; },   /* v1.35.3: foto */
        linhas("SELECT u.id, u.nome, u.foto_anexo_id FROM tarefa_responsaveis r JOIN usuarios u ON u.tenant_id = r.tenant_id AND u.id = r.usuario_id
                 WHERE r.tenant_id = ? AND r.tarefa_id IN ($in) ORDER BY u.nome", array_merge([$tid], $ids)));
}

function tf_publica($t, $tid, $completa = false, $resp = null) {
    $itens = tf_json($t['subtarefas']);
    [$f, $tot] = tf_conta_itens($itens);
    $hoje = date('Y-m-d');
    $aberta = !in_array($t['status'], ['feita', 'cancelada'], true);
    $out = [
        'id' => (int) $t['id'], 'titulo' => $t['titulo'], 'descricao' => $t['descricao'],
        'status' => $t['status'], 'prioridade' => $t['prioridade'],
        'data' => $t['data'], 'hora' => $t['hora'] ? substr($t['hora'], 0, 5) : null,
        'clienteId' => $t['cliente_id'] !== null ? (int) $t['cliente_id'] : null, 'clienteNome' => $t['cliente_nome'],
        'endereco' => $t['endereco'], 'paraTodos' => (int) $t['para_todos'] === 1,
        'responsaveis' => $resp !== null ? $resp : tf_responsaveis([(int) $t['id']], $tid),
        'itensFeitos' => $f, 'itensTotal' => $tot,
        'recorrencia' => $t['recorrencia'] ?: null, 'recorrenciaAte' => $t['recorrencia_ate'],
        'origemId' => $t['origem_id'] !== null ? (int) $t['origem_id'] : null,
        'criadoPor' => $t['criado_por'] !== null ? (int) $t['criado_por'] : null, 'criadorNome' => $t['criador_nome'],
        'criadoEm' => $t['criado_em'], 'feitaEm' => $t['feita_em'],
        'atrasada' => $aberta && $t['data'] && $t['data'] < $hoje,
        'tipo' => $t['tipo'] ?? null,   /* v1.28.1: "Solicitação do cliente" — comentários e fotos aparecem para o cliente */
    ];
    if ($completa) {
        $id = (int) $t['id'];
        $out['itens'] = $itens;
        $out['blocos'] = tf_json($t['blocos']);
        /* v1.28.1: OS abertas a partir desta solicitação */
        $out['osLigadas'] = ($t['tipo'] ?? '') === 'Solicitação do cliente'
            ? array_map(function ($o) { return ['id' => (int) $o['id'], 'numero' => $o['numero'], 'status' => $o['status']]; },
                linhas("SELECT id, numero, status FROM ordens_servico WHERE tenant_id = ? AND excluido_em IS NULL AND (checklist LIKE ? OR checklist LIKE ?) ORDER BY id",
                       [$tid, '%"tarefaId":' . $id . ',%', '%"tarefaId":' . $id . '}%'])) : [];
        $out['comentarios'] = array_map(function ($c) {
            return ['id' => (int) $c['id'], 'texto' => $c['texto'], 'autor' => $c['nome'] ?: $c['autor_nome'], 'usuarioId' => $c['usuario_id'] !== null ? (int) $c['usuario_id'] : null, 'criadoEm' => $c['criado_em']];
        }, linhas("SELECT c.*, u.nome FROM tarefa_comentarios c LEFT JOIN usuarios u ON u.tenant_id = c.tenant_id AND u.id = c.usuario_id
                    WHERE c.tenant_id = ? AND c.tarefa_id = ? AND c.excluido_em IS NULL ORDER BY c.criado_em, c.id", [$tid, $id]));
        $out['anexos'] = array_map(function ($a) {
            return ['id' => (int) $a['id'], 'legenda' => $a['nome_original'], 'mime' => $a['mime'], 'autor' => $a['autor'], 'autorId' => $a['criado_por'] !== null ? (int) $a['criado_por'] : null, 'criadoEm' => $a['criado_em']];
        }, linhas("SELECT a.id, a.nome_original, a.mime, a.criado_por, a.criado_em, u.nome AS autor FROM anexos a LEFT JOIN usuarios u ON u.tenant_id = a.tenant_id AND u.id = a.criado_por
                    WHERE a.tenant_id = ? AND a.dono_tipo = 'tarefa' AND a.dono_id = ? AND a.excluido_em IS NULL ORDER BY a.id", [$tid, $id]));
    }
    return $out;
}

/* tarefa que o usuário pode ver (técnico: só as dele) */
function tf_da_empresa($id, $u) {
    $tid = (int) $u['tenant_id'];
    $w = ''; $p = [];
    if (!tf_escritorio($u)) [$w, $p] = tf_filtro_meu((int) $u['id']);
    $t = linha(TF_SELECT . " WHERE t.id = ? AND t.tenant_id = ? AND t.excluido_em IS NULL" . $w, array_merge([$id, $tid], $p));
    if (!$t) erro('Tarefa não encontrada.', 404, 'NAO_ENCONTRADO');
    return $t;
}
function tf_pode_editar($t, $u) { return tf_escritorio($u) || (int) $t['criado_por'] === (int) $u['id']; }

function tf_data($v, $rotulo) {
    $v = trim((string) ($v ?? ''));
    if ($v === '') return null;
    $d = DateTime::createFromFormat('Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) erro("Data inválida em $rotulo.");
    return $v;
}
function tf_hora($v) {
    $v = trim((string) ($v ?? ''));
    if ($v === '') return null;
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) erro('Hora inválida.');
    return $v . ':00';
}

/* limpa o checklist que veio do navegador */
function tf_limpa_itens($l) {
    $out = [];
    foreach (is_array($l) ? $l : [] as $it) {
        $nome = txt($it['nome'] ?? '', 200);
        $subs = [];
        foreach (is_array($it['subs'] ?? null) ? $it['subs'] : [] as $s) {
            $n = txt($s['nome'] ?? '', 200);
            if ($n !== '') $subs[] = ['nome' => $n, 'feito' => !empty($s['feito'])];
        }
        if ($nome === '' && !$subs) continue;
        $out[] = ['nome' => $nome !== '' ? $nome : 'Tarefa', 'feito' => $subs ? (count(array_filter($subs, function ($s) { return $s['feito']; })) === count($subs)) : !empty($it['feito']), 'subs' => $subs];
        if (count($out) >= 100) break;
    }
    return $out;
}
function tf_limpa_blocos($l) {
    $out = [];
    foreach (is_array($l) ? $l : [] as $b) {
        $r = txt($b['rotulo'] ?? '', 120); $tx = mb_substr(trim((string) ($b['texto'] ?? '')), 0, 20000);
        if ($r === '' && $tx === '') continue;
        $out[] = ['rotulo' => $r, 'texto' => $tx];
        if (count($out) >= 40) break;
    }
    return $out;
}

function tf_gravar_resp($tarefaId, $ids, $tid) {
    q("DELETE FROM tarefa_responsaveis WHERE tenant_id = ? AND tarefa_id = ?", [$tid, $tarefaId]);
    $prim = null;
    foreach (array_unique(array_map('intval', is_array($ids) ? $ids : [])) as $uid) {
        if (!$uid || !valor("SELECT id FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$uid, $tid])) continue;
        q("INSERT INTO tarefa_responsaveis (tenant_id, tarefa_id, usuario_id) VALUES (?, ?, ?)", [$tid, $tarefaId, $uid]);
        if ($prim === null) $prim = $uid;
    }
    q("UPDATE tarefas SET responsavel_id = ? WHERE id = ? AND tenant_id = ?", [$prim, $tarefaId, $tid]);
}

/* soma o período sem estourar o fim do mês (31/01 + 1 mês = 28/02) */
function tf_somar($iso, $freq) {
    $d = new DateTime($iso);
    if ($freq === 'semanal') { $d->modify('+7 days'); return $d->format('Y-m-d'); }
    $meses = ['mensal' => 1, 'trimestral' => 3, 'anual' => 12][$freq] ?? 0;
    if (!$meses) return null;
    $dia = (int) $d->format('d');
    $d->modify('first day of this month')->modify("+$meses months");
    $ult = (int) $d->format('t');
    $d->setDate((int) $d->format('Y'), (int) $d->format('m'), min($dia, $ult));
    return $d->format('Y-m-d');
}

/* concluir uma tarefa que se repete cria a próxima (uma vez só, marcada em gerou_proxima) */
function tf_proxima($t, $tid, $uid) {
    if (!$t['recorrencia'] || (int) $t['gerou_proxima'] === 1) return null;
    $prox = tf_somar($t['data'] ?: date('Y-m-d'), $t['recorrencia']);
    if (!$prox || ($t['recorrencia_ate'] && $prox > $t['recorrencia_ate'])) return null;
    $itens = array_map(function ($it) {
        return ['nome' => $it['nome'], 'feito' => false, 'subs' => array_map(function ($s) { return ['nome' => $s['nome'], 'feito' => false]; }, $it['subs'] ?? [])];
    }, tf_json($t['subtarefas']));
    $blocos = array_map(function ($b) { return ['rotulo' => $b['rotulo'], 'texto' => '']; }, tf_json($t['blocos']));
    q("INSERT INTO tarefas (tenant_id, titulo, descricao, tipo, cliente_id, endereco, responsavel_id, para_todos, data, hora, prioridade, status,
                            subtarefas, blocos, recorrencia, recorrencia_ate, origem_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta', ?, ?, ?, ?, ?, ?)",
      [$tid, $t['titulo'], $t['descricao'], $t['tipo'], $t['cliente_id'], $t['endereco'], $t['responsavel_id'], $t['para_todos'], $prox, $t['hora'], $t['prioridade'],
       json_encode($itens, JSON_UNESCAPED_UNICODE), json_encode($blocos, JSON_UNESCAPED_UNICODE), $t['recorrencia'], $t['recorrencia_ate'], $t['id'], $uid]);
    $novo = (int) db()->lastInsertId();
    q("INSERT INTO tarefa_responsaveis (tenant_id, tarefa_id, usuario_id) SELECT tenant_id, ?, usuario_id FROM tarefa_responsaveis WHERE tenant_id = ? AND tarefa_id = ?", [$novo, $tid, $t['id']]);
    q("UPDATE tarefas SET gerou_proxima = 1 WHERE id = ? AND tenant_id = ?", [$t['id'], $tid]);
    return ['id' => $novo, 'data' => $prox];
}

/* v1.19.0: quem passou a ser responsável recebe aviso (quem fez a mudança não) */
function tf_ids_resp($tarefaId, $tid) {
    return array_map('intval', array_column(linhas("SELECT usuario_id FROM tarefa_responsaveis WHERE tenant_id = ? AND tarefa_id = ?", [$tid, $tarefaId]), 'usuario_id'));
}
function tf_avisar_novos($tarefaId, $antes, $tid, $u) {
    $novos = array_diff(tf_ids_resp($tarefaId, $tid), $antes);
    if (!$novos) return;
    $t = linha("SELECT t.titulo, t.data, t.hora, cl.nome AS cliente_nome FROM tarefas t LEFT JOIN clientes cl ON cl.tenant_id = t.tenant_id AND cl.id = t.cliente_id WHERE t.id = ? AND t.tenant_id = ?", [$tarefaId, $tid]);
    if (!$t) return;
    $quando = $t['data'] ? date('d/m', strtotime($t['data'])) . ($t['hora'] ? ' ' . substr($t['hora'], 0, 5) : '') : '';
    notificar($tid, $novos, 'Nova tarefa para você', $t['titulo'] . ($t['cliente_nome'] ? ' · ' . $t['cliente_nome'] : '') . ($quando ? ' · ' . $quando : '') . ' — por ' . explode(' ', $u['nome'])[0],
        'tarefa:' . $tarefaId, 'tarefa', (int) $u['id']);
}

return [

    'opcoes' => function ($d) {
        exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        return [
            'status' => TF_STATUS, 'prioridades' => TF_PRIO, 'frequencias' => TF_FREQ,
            'equipe' => array_map(function ($r) { return ['id' => (int) $r['id'], 'nome' => $r['nome'], 'perfil' => $r['perfil']]; },
                linhas("SELECT id, nome, perfil FROM usuarios WHERE tenant_id = ? AND excluido_em IS NULL AND status = 'ativo'
                         AND perfil IN ('admin','coord','tecnico','comercial','financeiro') ORDER BY nome", [tenant()])),
        ];
    },

    /* números do topo — sempre das tarefas que o usuário enxerga (ou só as dele) */
    'resumo' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $w = ''; $p = [];
        if (!tf_escritorio($u) || !empty($d['minhas'])) [$w, $p] = tf_filtro_meu((int) $u['id']);
        $base = "SELECT COUNT(*) FROM tarefas t WHERE t.tenant_id = ? AND t.excluido_em IS NULL" . $w;
        $par = array_merge([$tid], $p);
        $hoje = date('Y-m-d');
        $c = function ($cond, $x = []) use ($base, $par) { return (int) valor($base . " AND " . $cond, array_merge($par, $x)); };
        $abertas = "t.status NOT IN ('feita','cancelada')";
        return [
            'atrasadas' => $c("$abertas AND t.data < ?", [$hoje]),
            'hoje'      => $c("$abertas AND t.data = ?", [$hoje]),
            'semana'    => $c("$abertas AND t.data > ? AND t.data <= ?", [$hoje, date('Y-m-d', strtotime('+7 days'))]),
            'semData'   => $c("$abertas AND t.data IS NULL"),
            'feitasMes' => $c("t.status = 'feita' AND t.feita_em >= ?", [date('Y-m-01')]),
        ];
    },

    /* {filtro: pendentes|feitas|todas|atrasadas|hoje|semana|semData, minhas?, busca?, de?, ate?} */
    'listar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $where = "t.tenant_id = ? AND t.excluido_em IS NULL"; $par = [$tid];
        if (!tf_escritorio($u) || !empty($d['minhas'])) { [$w, $p] = tf_filtro_meu((int) $u['id']); $where .= $w; $par = array_merge($par, $p); }
        $hoje = date('Y-m-d');
        $ab = "t.status NOT IN ('feita','cancelada')";
        $filtros = [
            'pendentes' => [$ab, []], 'feitas' => ["t.status = 'feita'", []], 'todas' => ['1=1', []],
            'atrasadas' => ["$ab AND t.data < ?", [$hoje]], 'hoje' => ["$ab AND t.data = ?", [$hoje]],
            'semana' => ["$ab AND t.data > ? AND t.data <= ?", [$hoje, date('Y-m-d', strtotime('+7 days'))]],
            'semData' => ["$ab AND t.data IS NULL", []],
        ];
        [$cf, $pf] = $filtros[$d['filtro'] ?? 'pendentes'] ?? $filtros['pendentes'];
        $where .= " AND $cf"; $par = array_merge($par, $pf);
        $de = tf_data($d['de'] ?? '', 'início'); $ate = tf_data($d['ate'] ?? '', 'fim');
        if ($de) { $where .= " AND t.data >= ?"; $par[] = $de; }
        if ($ate) { $where .= " AND t.data <= ?"; $par[] = $ate; }
        $busca = txt($d['busca'] ?? '', 100);
        if ($busca !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $busca) . '%';
            $where .= " AND (t.titulo LIKE ? OR t.descricao LIKE ? OR cl.nome LIKE ?)";
            array_push($par, $like, $like, $like);
        }
        $ordem = ($d['filtro'] ?? '') === 'feitas'
            ? "t.feita_em DESC, t.id DESC"
            : "FIELD(t.status,'andamento','aguardando','aberta','feita','cancelada'), t.data IS NULL, t.data, FIELD(t.prioridade,'urgente','alta','normal','baixa'), t.hora IS NULL, t.hora, t.id DESC";
        $rows = linhas(TF_SELECT . " WHERE $where ORDER BY $ordem LIMIT " . TF_POR_PAGINA, $par);
        /* responsáveis de todas de uma vez */
        $ids = array_map(function ($r) { return (int) $r['id']; }, $rows);
        $mapa = [];
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            foreach (linhas("SELECT r.tarefa_id, u.id, u.nome, u.foto_anexo_id FROM tarefa_responsaveis r JOIN usuarios u ON u.tenant_id = r.tenant_id AND u.id = r.usuario_id
                              WHERE r.tenant_id = ? AND r.tarefa_id IN ($in) ORDER BY u.nome", array_merge([$tid], $ids)) as $r)
                $mapa[(int) $r['tarefa_id']][] = ['id' => (int) $r['id'], 'nome' => $r['nome'], 'fotoId' => $r['foto_anexo_id'] !== null ? (int) $r['foto_anexo_id'] : null];
        }
        return ['itens' => array_map(function ($t) use ($tid, $mapa) { return tf_publica($t, $tid, false, $mapa[(int) $t['id']] ?? []); }, $rows),
                'limite' => TF_POR_PAGINA];
    },

    'obter' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $t = tf_da_empresa((int) ($d['id'] ?? 0), $u);
        $o = tf_publica($t, (int) $u['tenant_id'], true);
        $o['podeEditar'] = tf_pode_editar($t, $u);
        return $o;
    },

    /* cria ou edita: {id?, titulo, descricao, clienteId, endereco, data, hora, prioridade, status?,
                       responsaveis:[ids], paraTodos, itens, blocos, recorrencia, recorrenciaAte} */
    'salvar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $atual = $id ? tf_da_empresa($id, $u) : null;
        if ($atual && !tf_pode_editar($atual, $u)) erro('Só quem criou a tarefa (ou o escritório) pode editar.', 403, 'SEM_PERMISSAO');
        $titulo = txt($d['titulo'] ?? '', 200);
        if ($titulo === '') erro('Descreva a tarefa.');
        $cli = (int) ($d['clienteId'] ?? 0) ?: null;
        if ($cli && !valor("SELECT id FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$cli, $tid])) $cli = null;
        $data = tf_data($d['data'] ?? '', 'data');
        $freq = in_array($d['recorrencia'] ?? '', TF_FREQ, true) ? $d['recorrencia'] : null;
        if ($freq && !$data) erro('Para repetir a tarefa, informe a data.');
        $ateRec = $freq ? tf_data($d['recorrenciaAte'] ?? '', 'repetir até') : null;
        $campos = [
            'titulo' => $titulo, 'descricao' => txt_ou_null($d['descricao'] ?? '', 5000),
            'cliente_id' => $cli, 'endereco' => txt_ou_null($d['endereco'] ?? '', 255),
            'para_todos' => !empty($d['paraTodos']) ? 1 : 0,
            'data' => $data, 'hora' => tf_hora($d['hora'] ?? ''),
            'prioridade' => in_array($d['prioridade'] ?? '', TF_PRIO, true) ? $d['prioridade'] : 'normal',
            'subtarefas' => json_encode(tf_limpa_itens($d['itens'] ?? []), JSON_UNESCAPED_UNICODE),
            'blocos' => json_encode(tf_limpa_blocos($d['blocos'] ?? []), JSON_UNESCAPED_UNICODE),
            'recorrencia' => $freq, 'recorrencia_ate' => $ateRec,
        ];
        $st = $d['status'] ?? null;
        if (in_array($st, TF_STATUS, true)) {
            $campos['status'] = $st;
            if ($st === 'feita' && (!$atual || $atual['status'] !== 'feita')) $campos['feita_em'] = date('Y-m-d H:i:s');
            if ($st !== 'feita') $campos['feita_em'] = null;
        }
        db()->beginTransaction();
        if ($atual) {
            $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
            q("UPDATE tarefas SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [$id, $tid]));
            auditar('tarefa_editar', 'tarefas', $id, $titulo);
        } else {
            $campos += ['tenant_id' => $tid, 'criado_por' => (int) $u['id']];
            q("INSERT INTO tarefas (" . implode(', ', array_keys($campos)) . ") VALUES (" . implode(', ', array_fill(0, count($campos), '?')) . ")", array_values($campos));
            $id = (int) db()->lastInsertId();
            auditar('tarefa_criar', 'tarefas', $id, $titulo);
        }
        $resp = $campos['para_todos'] ? [] : ($d['responsaveis'] ?? []);
        $antes = $atual ? tf_ids_resp($id, $tid) : [];
        tf_gravar_resp($id, $resp, $tid);
        tf_avisar_novos($id, $antes, $tid, $u);   /* v1.19.0 */
        $prox = null;
        if (($campos['status'] ?? '') === 'feita') $prox = tf_proxima(linha("SELECT * FROM tarefas WHERE id = ? AND tenant_id = ?", [$id, $tid]), $tid, (int) $u['id']);
        db()->commit();
        $o = tf_publica(tf_da_empresa($id, $u), $tid, true);
        $o['podeEditar'] = true;
        $o['proxima'] = $prox;
        return $o;
    },

    /* {id, status} — responsáveis também podem */
    'status' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $t = tf_da_empresa((int) ($d['id'] ?? 0), $u);
        $st = (string) ($d['status'] ?? '');
        if (!in_array($st, TF_STATUS, true)) erro('Status inválido.');
        if ($st === 'cancelada' && !tf_pode_editar($t, $u)) erro('Só quem criou a tarefa (ou o escritório) pode cancelar.', 403, 'SEM_PERMISSAO');
        db()->beginTransaction();
        q("UPDATE tarefas SET status = ?, feita_em = ? WHERE id = ? AND tenant_id = ?",
          [$st, $st === 'feita' ? ($t['status'] === 'feita' ? $t['feita_em'] : date('Y-m-d H:i:s')) : null, $t['id'], $tid]);
        $prox = $st === 'feita' ? tf_proxima(linha("SELECT * FROM tarefas WHERE id = ? AND tenant_id = ?", [$t['id'], $tid]), $tid, (int) $u['id']) : null;
        db()->commit();
        $o = tf_publica(tf_da_empresa((int) $t['id'], $u), $tid, true);
        $o['podeEditar'] = tf_pode_editar($t, $u);
        $o['proxima'] = $prox;
        return $o;
    },

    /* marca/desmarca o checklist: {id, itens} */
    'checklist' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $t = tf_da_empresa((int) ($d['id'] ?? 0), $u);
        $novos = tf_limpa_itens($d['itens'] ?? []);
        /* quem não edita a tarefa só marca: a estrutura (nomes) fica como estava */
        if (!tf_pode_editar($t, $u)) {
            $velhos = tf_json($t['subtarefas']);
            foreach ($velhos as $i => &$it) {
                $n = $novos[$i] ?? null;
                if (!$n) continue;
                foreach ($it['subs'] ?? [] as $j => $s) $it['subs'][$j]['feito'] = !empty($n['subs'][$j]['feito']);
                $it['feito'] = !empty($it['subs']) ? count(array_filter($it['subs'], function ($s) { return !empty($s['feito']); })) === count($it['subs']) : !empty($n['feito']);
            }
            unset($it);
            $novos = $velhos;
        }
        q("UPDATE tarefas SET subtarefas = ?, status = IF(status = 'aberta', 'andamento', status) WHERE id = ? AND tenant_id = ?",
          [json_encode($novos, JSON_UNESCAPED_UNICODE), $t['id'], $tid]);
        $o = tf_publica(tf_da_empresa((int) $t['id'], $u), $tid, true);
        $o['podeEditar'] = tf_pode_editar($t, $u);
        return $o;
    },

    /* texto dos blocos (ata, laudo, relato): {id, blocos} */
    'blocos' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $t = tf_da_empresa((int) ($d['id'] ?? 0), $u);
        q("UPDATE tarefas SET blocos = ? WHERE id = ? AND tenant_id = ?", [json_encode(tf_limpa_blocos($d['blocos'] ?? []), JSON_UNESCAPED_UNICODE), $t['id'], $tid]);
        $o = tf_publica(tf_da_empresa((int) $t['id'], $u), $tid, true);
        $o['podeEditar'] = tf_pode_editar($t, $u);
        return $o;
    },

    'comentar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $t = tf_da_empresa((int) ($d['id'] ?? 0), $u);
        $tx = mb_substr(trim((string) ($d['texto'] ?? '')), 0, 5000);
        if ($tx === '') erro('Escreva o comentário.');
        q("INSERT INTO tarefa_comentarios (tenant_id, tarefa_id, usuario_id, texto) VALUES (?, ?, ?, ?)", [$tid, $t['id'], (int) $u['id'], $tx]);
        /* v1.19.0: avisa responsáveis e quem criou (menos quem comentou) */
        $quem = tf_ids_resp((int) $t['id'], $tid);
        if ($t['criado_por']) $quem[] = (int) $t['criado_por'];
        notificar($tid, $quem, explode(' ', $u['nome'])[0] . ' comentou numa tarefa', $t['titulo'] . ': ' . mb_substr($tx, 0, 160), 'tarefa:' . (int) $t['id'], 'comentario', (int) $u['id']);
        $o = tf_publica(tf_da_empresa((int) $t['id'], $u), $tid, true);
        $o['podeEditar'] = tf_pode_editar($t, $u);
        return $o;
    },

    /* upload multipart: acao=tarefas.anexo.enviar, id, arquivo=<imagem> */
    'anexo.enviar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $t = tf_da_empresa((int) ($d['id'] ?? 0), $u);
        salvar_anexo($_FILES['arquivo'] ?? null, 'tarefa', (int) $t['id'], 'foto', true);
        $o = tf_publica(tf_da_empresa((int) $t['id'], $u), $tid, true);
        $o['podeEditar'] = tf_pode_editar($t, $u);
        return $o;
    },

    'anexo.excluir' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $t = tf_da_empresa((int) ($d['id'] ?? 0), $u);
        $a = linha("SELECT * FROM anexos WHERE id = ? AND tenant_id = ? AND dono_tipo = 'tarefa' AND dono_id = ? AND excluido_em IS NULL", [(int) ($d['anexoId'] ?? 0), $tid, $t['id']]);
        if (!$a) erro('Arquivo não encontrado.', 404, 'NAO_ENCONTRADO');
        if (!tf_pode_editar($t, $u) && (int) $a['criado_por'] !== (int) $u['id']) erro('Só quem enviou pode apagar.', 403, 'SEM_PERMISSAO');
        q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$a['id'], $tid]);
        $o = tf_publica(tf_da_empresa((int) $t['id'], $u), $tid, true);
        $o['podeEditar'] = tf_pode_editar($t, $u);
        return $o;
    },

    'excluir' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $t = tf_da_empresa((int) ($d['id'] ?? 0), $u);
        if (!tf_pode_editar($t, $u)) erro('Só quem criou a tarefa (ou o escritório) pode excluir.', 403, 'SEM_PERMISSAO');
        q("UPDATE tarefas SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$t['id'], $tid]);
        auditar('tarefa_excluir', 'tarefas', (int) $t['id'], $t['titulo']);
        return ['id' => (int) $t['id']];
    },
];
