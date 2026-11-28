<?php
/* KONSTANTE SaaS — api/os.php  ·  ordens de serviço (Operacional)
   Ações: opcoes, resumo, listar, obter, criar, salvar, mudar_status, excluir, foto.enviar, foto.excluir,
          assinatura.enviar, assinatura.limpar, finalizar,
          tarefas.salvar, etapa.status, evento.criar, pendencia.criar, pendencia.resolver,
          material.criar, material.excluir
   Admin e coordenação fazem tudo. Técnico só enxerga as OS em que está escalado
   (o app de campo chega na v1.6.0). Numeração: OS avulsa = número do chamado
   (590, 590-2…); OS de contrato terá sequência própria (módulo PMOC). */
if (!defined('KSAAS')) { http_response_code(403); exit; }
require_once dirname(__DIR__) . '/nucleo/notificacoes.php';   /* v1.19.0 */

require_once dirname(__DIR__) . '/nucleo/anexos.php';
require_once dirname(__DIR__) . '/nucleo/pmoc_tecnico.php';   /* v1.39.0: PMOC do mês do técnico na tela de OS */

/* datas de OS sempre no horário de Brasília (o banco já usa -03:00) */
date_default_timezone_set('America/Sao_Paulo');

const OS_STATUS = ['Aberta', 'Agendada', 'Em deslocamento', 'Em execução', 'Pausada', 'Aguardando material',
                   'Aguardando retorno', 'Com pendência', 'Serviço finalizado', 'Concluída', 'Cancelada'];
const OS_ENCERRADAS = ['Concluída', 'Cancelada'];
const OS_ETAPA_STATUS = ['pendente', 'execucao', 'concluida', 'na', 'problema', 'naofeito'];   /* v1.34.0: NF = não feito (padrão do PMOC) */
const OS_PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'];
const OS_POR_PAGINA = 60;

const OS_CHECKLISTS_PADRAO = [
    ['nome' => 'Instalação', 'termos' => ['instala'], 'itens' => ['Passagem de infra', 'Fazer o dreno', 'Instalação de evaporadoras', 'Instalação de condensadoras', 'Elétrica', 'Vácuo', 'Start-up']],
    ['nome' => 'Higienização', 'termos' => ['higien', 'limpeza'], 'itens' => ['Higienização da evaporadora', 'Higienização da condensadora', 'Limpeza de filtros', 'Limpeza da bandeja e dreno', 'Teste de funcionamento']],
    ['nome' => 'Manutenção preventiva', 'termos' => ['preventiva'], 'itens' => ['Limpeza de filtros', 'Verificação do dreno', 'Temperatura de insuflamento', 'Corrente elétrica do compressor', 'Higienização da turbina', 'Teste de funcionamento']],
    ['nome' => 'Manutenção corretiva', 'termos' => ['corretiva'], 'itens' => ['Diagnóstico do defeito', 'Substituição de peça', 'Teste de estanqueidade', 'Teste de funcionamento']],
    ['nome' => 'Personalizada', 'termos' => [], 'itens' => []],
];

function os_checklists($tid) {
    $v = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'checklists_os'", [$tid]);
    $l = $v ? json_decode((string) $v, true) : null;
    return is_array($l) && $l ? $l : OS_CHECKLISTS_PADRAO;
}
function os_eh_tecnico($u) { return so_tecnico($u); }   /* v1.22.0: técnico que também é coordenador opera como escritório */

/* técnico só vê OS em que está escalado ou é o responsável;
   v1.13.0: cliente (área do cliente) só vê as OS das próprias unidades, só leitura */
function os_filtro_tecnico($u) {
    if (($u['perfil'] ?? '') === 'cliente') {
        $uni = unidades_cliente($u) ?: [0];
        return [" AND o.cliente_id IN (" . implode(',', array_map('intval', $uni)) . ")", []];
    }
    if (!os_eh_tecnico($u)) return ['', []];
    return [" AND (o.responsavel_id = ? OR EXISTS (SELECT 1 FROM os_visitas v JOIN os_visita_tecnicos vt ON vt.tenant_id = v.tenant_id AND vt.visita_id = v.id
                 WHERE v.tenant_id = o.tenant_id AND v.os_id = o.id AND v.excluido_em IS NULL AND vt.usuario_id = ?))", [(int) $u['id'], (int) $u['id']]];
}

const OS_SELECT = "SELECT o.*, cl.nome AS cliente_nome, cl.endereco AS cliente_endereco, cl.contato AS cliente_contato, cl.telefone AS cliente_telefone,
                          ch.numero AS chamado_numero, ch.tipo_servico AS chamado_tipo, ch.necessidade AS chamado_descricao, ch.com_quem_falar AS chamado_contato, u.nome AS responsavel_nome,
                          ch.cliente_id AS chamado_cliente_id, chc.nome AS chamado_cliente_nome,
                          eq.tag AS equip_tag, eq.ambiente AS equip_ambiente, eq.dados AS equip_dados,
                          (SELECT COUNT(*) FROM os_etapas e WHERE e.tenant_id = o.tenant_id AND e.os_id = o.id AND e.excluido_em IS NULL) AS etapas_total,
                          (SELECT COUNT(*) FROM os_etapas e WHERE e.tenant_id = o.tenant_id AND e.os_id = o.id AND e.excluido_em IS NULL AND e.status IN ('concluida','na')) AS etapas_feitas,
                          (SELECT COUNT(*) FROM os_pendencias p WHERE p.tenant_id = o.tenant_id AND p.os_id = o.id AND p.excluido_em IS NULL AND p.status = 'aberta') AS pendencias_abertas
                     FROM ordens_servico o
                     JOIN clientes cl ON cl.tenant_id = o.tenant_id AND cl.id = o.cliente_id
                     LEFT JOIN chamados ch ON ch.tenant_id = o.tenant_id AND ch.id = o.chamado_id
                     LEFT JOIN clientes chc ON chc.tenant_id = ch.tenant_id AND chc.id = ch.cliente_id
                     LEFT JOIN usuarios u ON u.tenant_id = o.tenant_id AND u.id = o.responsavel_id
                     LEFT JOIN equipamentos eq ON eq.tenant_id = o.tenant_id AND eq.id = o.equipamento_id";   /* v1.28.0: equipamento da OS */

function os_meta($o) { $m = json_decode((string) ($o['checklist'] ?? ''), true); return is_array($m) ? $m : []; }

function os_tecnicos($osId, $tid) {
    return array_map(function ($r) { return ['id' => (int) $r['id'], 'nome' => $r['nome'], 'fotoId' => $r['foto_anexo_id'] !== null ? (int) $r['foto_anexo_id'] : null]; },   /* v1.35.3: foto */
        linhas("SELECT DISTINCT u.id, u.nome, u.foto_anexo_id FROM os_visitas v
                  JOIN os_visita_tecnicos vt ON vt.tenant_id = v.tenant_id AND vt.visita_id = v.id
                  JOIN usuarios u ON u.tenant_id = vt.tenant_id AND u.id = vt.usuario_id
                 WHERE v.tenant_id = ? AND v.os_id = ? AND v.excluido_em IS NULL ORDER BY u.nome", [$tid, $osId]));
}

function os_andar_equip($dados) { $x = json_decode((string) $dados, true); return is_array($x) && isset($x['andar']) && is_scalar($x['andar']) ? (string) $x['andar'] : null; }
function os_local_equip($andar, $amb) {
    $andar = trim((string) $andar); $amb = trim((string) $amb);
    if ($andar !== '' && mb_stripos($amb, $andar) === false) return $amb !== '' ? $andar . ' · ' . $amb : $andar;
    return $amb !== '' ? $amb : null;
}

/* v1.28.0: serviço finalizado/encerrado → guarda quem executou e tira a OS da escala dos técnicos
   (a OS sai da lista deles; o relatório continua mostrando a equipe que executou) */
function os_liberar_tecnicos($osId, $tid) {
    $tecs = os_tecnicos($osId, $tid);
    $o = linha("SELECT checklist, responsavel_id FROM ordens_servico WHERE id = ? AND tenant_id = ?", [$osId, $tid]);
    if (!$o) return;
    if ($tecs) {
        $m = os_meta($o);
        $m['executores'] = $tecs;
        q("UPDATE ordens_servico SET checklist = ? WHERE id = ? AND tenant_id = ?", [json_encode($m, JSON_UNESCAPED_UNICODE), $osId, $tid]);
        q("DELETE vt FROM os_visita_tecnicos vt JOIN os_visitas v ON v.tenant_id = vt.tenant_id AND v.id = vt.visita_id
            WHERE vt.tenant_id = ? AND v.os_id = ?", [$tid, $osId]);
    }
    /* responsável técnico (perfil só de campo) também sai */
    if ($o['responsavel_id'] && valor("SELECT 1 FROM usuarios WHERE id = ? AND tenant_id = ? AND perfil = 'tecnico'", [(int) $o['responsavel_id'], $tid]))
        q("UPDATE ordens_servico SET responsavel_id = NULL WHERE id = ? AND tenant_id = ?", [$osId, $tid]);
}

function os_publica($o, $tid, $completa = false) {
    $m = os_meta($o);
    $hoje = date('Y-m-d');
    $out = [
        'id' => (int) $o['id'], 'numero' => $o['numero'], 'tipo' => $o['tipo'], 'status' => $o['status'], 'prioridade' => $o['prioridade'],
        'chamadoId' => $o['chamado_id'] !== null ? (int) $o['chamado_id'] : null, 'chamadoNumero' => $o['chamado_numero'] !== null ? (int) $o['chamado_numero'] : null,
        'clienteId' => (int) $o['cliente_id'], 'clienteNome' => $o['cliente_nome'],
        /* v1.26.1: OS na filial, cobrança na sede (cliente do chamado) */
        'cobrancaClienteNome' => !empty($o['chamado_cliente_id']) && (int) $o['chamado_cliente_id'] !== (int) $o['cliente_id'] ? $o['chamado_cliente_nome'] : null, 'endereco' => $m['endereco'] ?? $o['cliente_endereco'],
        'contato' => $m['contato'] ?? ($o['chamado_contato'] ?: $o['cliente_contato']), 'telefone' => $m['telefone'] ?? $o['cliente_telefone'],
        'tipoServico' => $m['tipoServico'] ?? $o['chamado_tipo'], 'prazo' => $m['prazo'] ?? null,
        'dataPrev' => $o['data_prev'], 'horaPrev' => $o['hora_prev'] ? substr($o['hora_prev'], 0, 5) : null,
        'responsavelId' => $o['responsavel_id'] !== null ? (int) $o['responsavel_id'] : null, 'responsavelNome' => $o['responsavel_nome'],
        /* v1.27.2: descrição do serviço do chamado (a que foi ao cliente) — é ela que vai no relatório */
        'chamadoDescricao' => $o['chamado_descricao'] ?? null,
        'orientacoes' => $o['orientacoes'], 'fechadaEm' => $o['fechada_em'], 'criadoEm' => $o['criado_em'],
        'etapasTotal' => (int) $o['etapas_total'], 'etapasFeitas' => (int) $o['etapas_feitas'], 'pendenciasAbertas' => (int) $o['pendencias_abertas'],
        'atrasada' => !in_array($o['status'], array_merge(OS_ENCERRADAS, ['Serviço finalizado']), true) && $o['data_prev'] && (($m['prazo'] ?? null) ?: $o['data_prev']) < $hoje,   /* v1.27.0: OS de vários dias só atrasa depois do prazo */
        'tecnicos' => os_tecnicos((int) $o['id'], $tid),
        /* v1.28.0: quem executou (os técnicos saem da escala quando o serviço é finalizado) */
        'executores' => is_array($m['executores'] ?? null) ? $m['executores'] : [],
        /* v1.28.0: equipamento ligado à OS, à vista na lista e no detalhe */
        'equipamentoId' => isset($o['equipamento_id']) && $o['equipamento_id'] !== null ? (int) $o['equipamento_id'] : null,
        'equipTag' => $o['equip_tag'] ?? null,
        'equipLocal' => os_local_equip(os_andar_equip($o['equip_dados'] ?? null), $o['equip_ambiente'] ?? null),
    ];
    if ($completa) {
        $id = (int) $o['id'];
        $out['etapas'] = array_map(function ($e) { return ['id' => (int) $e['id'], 'grupo' => $e['grupo'], 'nome' => $e['nome'], 'status' => $e['status'], 'ordem' => (int) $e['ordem']]; },
            linhas("SELECT * FROM os_etapas WHERE tenant_id = ? AND os_id = ? AND excluido_em IS NULL ORDER BY ordem, id", [$tid, $id]));
        $out['eventos'] = array_map(function ($e) { return ['id' => (int) $e['id'], 'tipo' => $e['tipo'], 'texto' => $e['texto'], 'usuarioNome' => $e['usuario_nome'], 'criadoEm' => $e['criado_em']]; },
            linhas("SELECT e.*, u.nome AS usuario_nome FROM os_eventos e LEFT JOIN usuarios u ON u.tenant_id = e.tenant_id AND u.id = e.usuario_id
                     WHERE e.tenant_id = ? AND e.os_id = ? ORDER BY e.criado_em DESC, e.id DESC LIMIT 300", [$tid, $id]));
        $out['pendencias'] = array_map(function ($p) { return ['id' => (int) $p['id'], 'descricao' => $p['descricao'], 'status' => $p['status'], 'criadoEm' => $p['criado_em'], 'resolvidaEm' => $p['resolvida_em']]; },
            linhas("SELECT * FROM os_pendencias WHERE tenant_id = ? AND os_id = ? AND excluido_em IS NULL ORDER BY status, criado_em DESC", [$tid, $id]));
        $out['materiais'] = array_map(function ($r) { return ['id' => (int) $r['id'], 'material' => $r['material'], 'quantidade' => (float) $r['quantidade'], 'unidade' => $r['unidade']]; },
            linhas("SELECT * FROM os_materiais WHERE tenant_id = ? AND os_id = ? AND excluido_em IS NULL ORDER BY id", [$tid, $id]));
        $out['fotos'] = [];
        $ass = ['tecnico' => null, 'cliente' => null];
        foreach (linhas("SELECT a.id, a.categoria, a.nome_original, a.criado_em, u.nome AS autor FROM anexos a LEFT JOIN usuarios u ON u.tenant_id = a.tenant_id AND u.id = a.criado_por
                          WHERE a.tenant_id = ? AND a.dono_tipo = 'os' AND a.dono_id = ? AND a.excluido_em IS NULL ORDER BY a.id", [$tid, $id]) as $a) {
            if ($a['categoria'] === 'ass_tecnico') $ass['tecnico'] = ['anexoId' => (int) $a['id'], 'nome' => $m['assTecnicoNome'] ?? $a['autor'], 'em' => $a['criado_em']];
            elseif ($a['categoria'] === 'ass_cliente') $ass['cliente'] = ['anexoId' => (int) $a['id'], 'nome' => $o['cliente_nome_assinatura'], 'cargo' => $o['cliente_cargo'], 'em' => $a['criado_em']];
            else {
                $etapa = strpos($a['categoria'], 'etapa:') === 0 ? (int) substr($a['categoria'], 6) : null;
                $out['fotos'][] = ['id' => (int) $a['id'], 'etapaId' => $etapa, 'legenda' => $a['nome_original'], 'autor' => $a['autor'], 'criadoEm' => $a['criado_em']];
            }
        }
        $out['assinaturas'] = $ass;
        $out['conclusao'] = $m['conclusao'] ?? null;
        $out['finalizadoEm'] = $m['finalizadoEm'] ?? null;
        $v = linha("SELECT inicio, termino FROM os_visitas WHERE tenant_id = ? AND os_id = ? AND numero = 1 AND excluido_em IS NULL", [$tid, $id]);
        $out['inicioReal'] = $v ? $v['inicio'] : null;
        $out['terminoReal'] = $v ? $v['termino'] : null;
        /* v1.13.0: ocorrência do PMOC ligada a um equipamento */
        $out['equipamento'] = null;
        try {
            $eq = linha("SELECT e.id, e.tag, e.ambiente, e.tipo, e.marca, e.modelo, e.capacidade_btu FROM ordens_servico o
                           JOIN equipamentos e ON e.tenant_id = o.tenant_id AND e.id = o.equipamento_id WHERE o.id = ? AND o.tenant_id = ?", [$id, $tid]);
            if ($eq) $out['equipamento'] = ['id' => (int) $eq['id'], 'tag' => $eq['tag'], 'ambiente' => $eq['ambiente'], 'tipo' => $eq['tipo'], 'marca' => $eq['marca'],
                                            'modelo' => $eq['modelo'], 'capacidadeBtu' => $eq['capacidade_btu'] !== null ? (int) $eq['capacidade_btu'] : null];
        } catch (Throwable $e) { /* SQL 08 ainda não rodado */ }
    }
    return $out;
}

function os_da_empresa($id, $u) {
    $tid = (int) $u['tenant_id'];
    [$wt, $pt] = os_filtro_tecnico($u);
    $o = linha(OS_SELECT . " WHERE o.id = ? AND o.tenant_id = ? AND o.excluido_em IS NULL" . $wt, array_merge([$id, $tid], $pt));
    if (!$o) erro('OS não encontrada.', 404, 'NAO_ENCONTRADO');
    return $o;
}

function os_evento($osId, $tipo, $texto, $tid, $uid) {
    q("INSERT INTO os_eventos (tenant_id, os_id, tipo, texto, usuario_id) VALUES (?, ?, ?, ?, ?)", [$tid, $osId, $tipo, mb_substr($texto, 0, 5000), $uid]);
}

function os_data($v, $rotulo) {
    $v = trim((string) ($v ?? ''));
    if ($v === '') return null;
    $d = DateTime::createFromFormat('Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) erro("Data inválida em $rotulo.");
    return $v;
}
function os_hora($v) {
    $v = trim((string) ($v ?? ''));
    if ($v === '') return null;
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) erro('Hora inválida.');
    return $v . ':00';
}

/* técnicos ficam na visita nº 1 (as demais visitas chegam com o app de campo) */
function os_gravar_tecnicos($osId, $ids, $data, $hora, $tid) {
    $v = valor("SELECT id FROM os_visitas WHERE tenant_id = ? AND os_id = ? AND numero = 1", [$tid, $osId]);
    if (!$v) {
        q("INSERT INTO os_visitas (tenant_id, os_id, numero, data, hora_prev) VALUES (?, ?, 1, ?, ?)", [$tid, $osId, $data, $hora]);
        $v = (int) db()->lastInsertId();
    } else {
        q("UPDATE os_visitas SET data = ?, hora_prev = ?, excluido_em = NULL WHERE id = ? AND tenant_id = ?", [$data, $hora, $v, $tid]);
    }
    $antes = array_map('intval', array_column(linhas("SELECT usuario_id FROM os_visita_tecnicos WHERE tenant_id = ? AND visita_id = ?", [$tid, $v]), 'usuario_id'));
    q("DELETE FROM os_visita_tecnicos WHERE tenant_id = ? AND visita_id = ?", [$tid, $v]);
    $ok = [];
    foreach (array_unique(array_map('intval', is_array($ids) ? $ids : [])) as $uid) {
        if ($uid && valor("SELECT id FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$uid, $tid])) {
            q("INSERT INTO os_visita_tecnicos (tenant_id, visita_id, usuario_id) VALUES (?, ?, ?)", [$tid, $v, $uid]);
            $ok[] = $uid;
        }
    }
    /* v1.19.0: técnico escalado agora recebe aviso */
    $novos = array_diff($ok, $antes);
    if ($novos) {
        $o = linha("SELECT o.numero, cl.nome AS cliente_nome FROM ordens_servico o LEFT JOIN clientes cl ON cl.tenant_id = o.tenant_id AND cl.id = o.cliente_id WHERE o.id = ? AND o.tenant_id = ?", [$osId, $tid]);
        $eu = eu(false);
        $quando = $data ? date('d/m', strtotime($data)) . ($hora ? ' às ' . substr($hora, 0, 5) : '') : 'sem data marcada';
        if ($o) notificar($tid, $novos, 'OS ' . $o['numero'] . ' para você', ($o['cliente_nome'] ?: 'Cliente') . ' · ' . $quando, 'os:' . $osId, 'os', $eu ? (int) $eu['id'] : null);
    }
    return $ok;
}

/* [{grupo, nome, status?, id?}] → grava na ordem recebida; o que sumiu é excluído (soft) */
function os_gravar_etapas($osId, $lista, $tid) {
    $manter = [];
    $ordem = 0;
    foreach (array_slice(is_array($lista) ? $lista : [], 0, 600) as $e) {
        if (!is_array($e)) continue;
        $nome = txt($e['nome'] ?? '', 200);
        if ($nome === '') continue;
        $grupo = txt_ou_null($e['grupo'] ?? '', 60);
        $st = in_array($e['status'] ?? '', OS_ETAPA_STATUS, true) ? $e['status'] : 'pendente';
        $ordem++;
        $id = (int) ($e['id'] ?? 0);
        if ($id && valor("SELECT id FROM os_etapas WHERE id = ? AND tenant_id = ? AND os_id = ?", [$id, $tid, $osId])) {
            q("UPDATE os_etapas SET grupo = ?, nome = ?, status = ?, ordem = ?, excluido_em = NULL WHERE id = ? AND tenant_id = ?", [$grupo, $nome, $st, $ordem, $id, $tid]);
        } else {
            q("INSERT INTO os_etapas (tenant_id, os_id, grupo, nome, status, ordem) VALUES (?, ?, ?, ?, ?, ?)", [$tid, $osId, $grupo, $nome, $st, $ordem]);
            $id = (int) db()->lastInsertId();
        }
        $manter[] = $id;
    }
    $sql = "UPDATE os_etapas SET excluido_em = NOW() WHERE tenant_id = ? AND os_id = ? AND excluido_em IS NULL";
    $par = [$tid, $osId];
    if ($manter) { $sql .= " AND id NOT IN (" . implode(',', array_fill(0, count($manter), '?')) . ")"; $par = array_merge($par, $manter); }
    q($sql, $par);
}

function os_dados_cabecalho($d, $tid) {
    $resp = (int) ($d['responsavelId'] ?? 0) ?: null;
    if ($resp && !valor("SELECT id FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$resp, $tid])) $resp = null;
    $prio = in_array($d['prioridade'] ?? '', OS_PRIORIDADES, true) ? $d['prioridade'] : 'normal';
    $dataPrev = os_data($d['dataPrev'] ?? '', 'início previsto');
    $prazo = os_data($d['prazo'] ?? '', 'prazo de término');
    if ($prazo && $dataPrev && $prazo < $dataPrev) erro('O prazo de término não pode ser antes do início.');
    $meta = ['tipoServico' => txt_ou_null($d['tipoServico'] ?? '', 60), 'prazo' => $prazo,
             'endereco' => txt_ou_null($d['endereco'] ?? '', 300), 'contato' => txt_ou_null($d['contato'] ?? '', 150), 'telefone' => txt_ou_null($d['telefone'] ?? '', 40)];
    return [[
        'prioridade' => $prio, 'responsavel_id' => $resp, 'data_prev' => $dataPrev, 'hora_prev' => os_hora($d['horaPrev'] ?? ''),
        'orientacoes' => txt_ou_null($d['orientacoes'] ?? '', 5000), 'checklist' => json_encode($meta, JSON_UNESCAPED_UNICODE),
    ], $meta];
}

/* ---------- v1.19.0: link público do relatório (pasta r/) ---------- */
function os_link_url($tok) {
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $host = preg_replace('/[^A-Za-z0-9.\-:]/', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
    return ($https ? 'https://' : 'http://') . $host . BASE_PATH . 'r/?t=' . $tok;
}
function os_link_publico($l) {
    if (!$l) return null;
    return ['url' => os_link_url($l['token']), 'criadoEm' => $l['criado_em'], 'revogado' => $l['revogado_em'] !== null,
            'visualizacoes' => (int) $l['visualizacoes'], 'primeiraVis' => $l['primeira_vis'], 'ultimaVis' => $l['ultima_vis']];
}
function os_limpar_html($html) {
    $html = preg_replace('#<script\b[^>]*>.*?</script\s*>#is', '', $html);
    $html = preg_replace('#<(iframe|object|embed|form|base|meta|link)\b[^>]*>#i', '', $html);
    $html = preg_replace('#\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $html);
    $html = preg_replace('#(href|src)\s*=\s*(["\'])\s*javascript:[^"\']*\2#i', '$1=$2#$2', $html);
    $html = preg_replace('#<div class="noprint">.*?</div>#is', '', $html);
    return $html;
}

return [

    'opcoes' => function ($d) {
        exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        return [
            'status' => OS_STATUS, 'prioridades' => OS_PRIORIDADES, 'checklists' => os_checklists($tid),
            'equipe' => array_map(function ($r) { return ['id' => (int) $r['id'], 'nome' => $r['nome'], 'perfil' => $r['perfil']]; },
                linhas("SELECT id, nome, perfil FROM usuarios WHERE tenant_id = ? AND excluido_em IS NULL AND status = 'ativo'
                         AND perfil IN ('admin','coord','tecnico') ORDER BY nome", [$tid])),
        ];
    },

    /* números da visão geral + OS de hoje e atrasadas */
    'resumo' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        [$wt, $pt] = os_filtro_tecnico($u);
        $base = " FROM ordens_servico o WHERE o.tenant_id = ? AND o.excluido_em IS NULL" . $wt;
        $par = array_merge([$tid], $pt);
        $cont = function ($cond, $p = []) use ($base, $par) { return (int) valor("SELECT COUNT(*)" . $base . " AND " . $cond, array_merge($par, $p)); };
        $hoje = date('Y-m-d');
        $rows = linhas(OS_SELECT . " WHERE o.tenant_id = ? AND o.excluido_em IS NULL" . $wt .
            " AND o.status NOT IN ('Concluída','Cancelada','Serviço finalizado') AND o.data_prev IS NOT NULL AND o.data_prev <= ?
              ORDER BY o.data_prev, o.hora_prev LIMIT 50", array_merge($par, [$hoje]));
        return [
            'agendadas'   => $cont("o.status = 'Agendada'"),
            'execucao'    => $cont("o.status IN ('Em deslocamento','Em execução','Pausada')"),
            'pendencia'   => $cont("(o.status IN ('Com pendência','Aguardando material','Aguardando retorno') OR EXISTS (SELECT 1 FROM os_pendencias p WHERE p.tenant_id = o.tenant_id AND p.os_id = o.id AND p.excluido_em IS NULL AND p.status = 'aberta')) AND o.status NOT IN ('Concluída','Cancelada')"),
            'faturar'     => $cont("o.status = 'Serviço finalizado'"),
            'concluidasMes' => $cont("o.status = 'Concluída' AND o.fechada_em >= ?", [date('Y-m-01')]),
            'hoje'        => array_map(function ($o) use ($tid) { return os_publica($o, $tid); }, $rows),
            /* v1.39.0: visitas de PMOC do mês destinadas à pessoa, com endereço (botão "Abrir mapa") */
            'meuPmoc'     => modulo_liberado('pmoc', $tid) ? pmoc_do_usuario($tid, (int) $u['id']) : [],
        ];
    },

    /* {busca?, status?, grupo?: agendadas|execucao|pendencia|faturar|concluidasMes|abertas, chamadoId?, pagina?} */
    'listar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        [$wt, $pt] = os_filtro_tecnico($u);
        $where = "o.tenant_id = ? AND o.excluido_em IS NULL" . $wt;
        $par = array_merge([$tid], $pt);
        $st = (string) ($d['status'] ?? '');
        if ($st !== '' && in_array($st, OS_STATUS, true)) { $where .= " AND o.status = ?"; $par[] = $st; }
        $grupos = [
            'abertas'   => "o.status NOT IN ('Concluída','Cancelada')",
            'agendadas' => "o.status = 'Agendada'",
            'execucao'  => "o.status IN ('Em deslocamento','Em execução','Pausada')",
            'pendencia' => "(o.status IN ('Com pendência','Aguardando material','Aguardando retorno') OR EXISTS (SELECT 1 FROM os_pendencias p WHERE p.tenant_id = o.tenant_id AND p.os_id = o.id AND p.excluido_em IS NULL AND p.status = 'aberta')) AND o.status NOT IN ('Concluída','Cancelada')",
            'faturar'   => "o.status = 'Serviço finalizado'",
            'concluidasMes' => "o.status = 'Concluída' AND o.fechada_em >= '" . date('Y-m-01') . "'",
        ];
        $g = (string) ($d['grupo'] ?? '');
        if (isset($grupos[$g])) $where .= " AND " . $grupos[$g];
        /* v1.11.0: calendário — intervalo de data prevista, sem paginação (até 500) */
        $de = trim((string) ($d['de'] ?? '')); $ate = trim((string) ($d['ate'] ?? ''));
        $cal = preg_match('/^\d{4}-\d{2}-\d{2}$/', $de) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $ate);
        /* v1.27.0: OS de vários dias aparece em todos os dias até o prazo de término —
           busca as que começam até 90 dias antes da grade e filtra pelo prazo logo abaixo */
        if ($cal) { $where .= " AND o.data_prev BETWEEN ? AND ?"; array_push($par, date('Y-m-d', strtotime($de . ' -90 days')), $ate); }
        $ch = (int) ($d['chamadoId'] ?? 0);
        if ($ch) { $where .= " AND o.chamado_id = ?"; $par[] = $ch; }
        $busca = txt($d['busca'] ?? '', 100);
        if ($busca !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $busca) . '%';
            $where .= " AND (cl.nome LIKE ? OR o.numero LIKE ? OR o.orientacoes LIKE ? OR eq.tag LIKE ? OR eq.ambiente LIKE ?)";   /* v1.28.0: busca pela TAG / local */
            array_push($par, $like, $like, $like, $like, $like);
        }
        $from = " FROM ordens_servico o JOIN clientes cl ON cl.tenant_id = o.tenant_id AND cl.id = o.cliente_id
                  LEFT JOIN equipamentos eq ON eq.tenant_id = o.tenant_id AND eq.id = o.equipamento_id ";
        $total = (int) valor("SELECT COUNT(*) $from WHERE $where", $par);
        $pagina = max(1, (int) ($d['pagina'] ?? 1));
        $lim = $cal ? 500 : OS_POR_PAGINA;
        $rows = linhas(OS_SELECT . " WHERE $where ORDER BY (o.status IN ('Concluída','Cancelada')), o.data_prev IS NULL, o.data_prev, o.id DESC
                        LIMIT " . $lim . " OFFSET " . ($cal ? 0 : (($pagina - 1) * OS_POR_PAGINA)), $par);
        $itens = array_map(function ($o) use ($tid) { return os_publica($o, $tid); }, $rows);
        if ($cal) $itens = array_values(array_filter($itens, function ($o) use ($de) { return $o['dataPrev'] >= $de || (($o['prazo'] ?: $o['dataPrev']) >= $de); }));
        return ['itens' => $itens, 'total' => $cal ? count($itens) : $total, 'pagina' => $pagina, 'porPagina' => OS_POR_PAGINA];
    },

    'obter' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'cliente');   /* cliente: relatório das OS das unidades dele */
        return os_publica(os_da_empresa((int) ($d['id'] ?? 0), $u), (int) $u['tenant_id'], true);
    },

    /* cria a OS a partir de um chamado: {chamadoId, tarefas:[{grupo,nome}], tecnicos:[ids], dataPrev, horaPrev, prazo, ...} */
    'criar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $chId = (int) ($d['chamadoId'] ?? 0);
        $ch = $chId ? linha("SELECT * FROM chamados WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$chId, $tid]) : null;
        if (!$ch) erro('Escolha o chamado da OS.');
        [$campos, $meta] = os_dados_cabecalho($d, $tid);
        if (!$meta['tipoServico']) { $meta['tipoServico'] = $ch['tipo_servico']; $campos['checklist'] = json_encode($meta, JSON_UNESCAPED_UNICODE); }
        $etapas = is_array($d['etapas'] ?? null) ? $d['etapas'] : [];
        db()->beginTransaction();
        /* número = nº do chamado; 2ª OS do mesmo chamado vira 590-2, 590-3… */
        $base = (string) $ch['numero'];
        $numero = $base;
        for ($i = 2; valor("SELECT 1 FROM ordens_servico WHERE tenant_id = ? AND numero = ?", [$tid, $numero]); $i++) $numero = $base . '-' . $i;
        $campos += ['tenant_id' => $tid, 'numero' => $numero, 'tipo' => 'avulsa', 'chamado_id' => $chId,
                    'orcamento_id' => valor("SELECT id FROM orcamentos WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, $chId]) ?: null,
                    'cliente_id' => (int) $ch['cliente_id'], 'local_id' => $ch['local_id'],
                    'status' => !empty($campos['data_prev']) ? 'Agendada' : 'Aberta', 'criado_por' => (int) $u['id']];
        $cols = implode(', ', array_keys($campos));
        q("INSERT INTO ordens_servico ($cols) VALUES (" . implode(', ', array_fill(0, count($campos), '?')) . ")", array_values($campos));
        $id = (int) db()->lastInsertId();
        os_gravar_etapas($id, $etapas, $tid);
        os_gravar_tecnicos($id, $d['tecnicos'] ?? [], $campos['data_prev'], $campos['hora_prev'], $tid);
        os_evento($id, 'historico', 'OS ' . $numero . ' criada a partir do chamado ' . $ch['numero'] . '.', $tid, (int) $u['id']);
        db()->commit();
        auditar('os_criar', 'ordens_servico', $id, $numero);
        return os_publica(os_da_empresa($id, $u), $tid, true);
    },

    /* edita cabeçalho e técnicos (não mexe nas tarefas) */
    'salvar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['id'] ?? 0), $u);
        [$campos, $meta] = os_dados_cabecalho($d, $tid);
        /* v1.26.1: trocar o cliente/local da OS (ex.: filial onde o serviço é feito; a cobrança continua no cliente do chamado) */
        $novoCli = (int) ($d['clienteId'] ?? 0);
        $trocaCli = null;
        if ($novoCli && $novoCli !== (int) $o['cliente_id']) {
            $nc = linha("SELECT id, nome FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$novoCli, $tid]);
            if (!$nc) erro('Cliente não encontrado.');
            $campos['cliente_id'] = (int) $nc['id'];
            $trocaCli = 'Cliente da OS alterado: ' . $o['cliente_nome'] . ' → ' . $nc['nome'] . '.';
        }
        /* v1.28.0: equipamento da OS (escolhido entre as máquinas do cliente; vazio = sem equipamento) */
        if (array_key_exists('equipamentoId', $d)) {
            $eqId = (int) ($d['equipamentoId'] ?? 0);
            $cliOS = $campos['cliente_id'] ?? (int) $o['cliente_id'];
            if ($eqId) {
                $eqN = linha("SELECT id, tag FROM equipamentos WHERE id = ? AND tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL", [$eqId, $tid, $cliOS]);
                if (!$eqN) erro('Equipamento não encontrado neste cliente.');
                $campos['equipamento_id'] = $eqId;
            } else $campos['equipamento_id'] = null;
        } elseif (isset($campos['cliente_id']) && $o['equipamento_id']) $campos['equipamento_id'] = null;   /* trocou o cliente: a máquina antiga não vale mais */
        /* v1.13.0: editar o cabeçalho não apaga o que já estava guardado (conclusão, origem PMOC, assinaturas) */
        $campos['checklist'] = json_encode(array_merge(os_meta($o), $meta), JSON_UNESCAPED_UNICODE);
        db()->beginTransaction();
        $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
        q("UPDATE ordens_servico SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [$o['id'], $tid]));
        if ($o['status'] === 'Aberta' && $campos['data_prev']) q("UPDATE ordens_servico SET status = 'Agendada' WHERE id = ? AND tenant_id = ?", [$o['id'], $tid]);
        os_gravar_tecnicos((int) $o['id'], $d['tecnicos'] ?? [], $campos['data_prev'], $campos['hora_prev'], $tid);
        if ($trocaCli) os_evento((int) $o['id'], 'historico', $trocaCli, $tid, (int) $u['id']);
        db()->commit();
        auditar('os_editar', 'ordens_servico', (int) $o['id'], $o['numero']);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    'mudar_status' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['id'] ?? 0), $u);
        $st = (string) ($d['status'] ?? '');
        if (!in_array($st, OS_STATUS, true)) erro('Status inválido.');
        if (os_eh_tecnico($u) && in_array($st, ['Concluída', 'Cancelada'], true)) erro('Só o escritório conclui ou cancela a OS.', 403, 'SEM_PERMISSAO');
        /* v1.12.0: não sobrescreve mudança feita por outra pessoa depois que a tela foi aberta (ex.: alteração feita sem internet) */
        if (isset($d['_antes']) && $d['_antes'] !== '' && $o['status'] !== $d['_antes'] && $o['status'] !== $st)
            erro('O status da OS ' . $o['numero'] . ' foi mudado por outra pessoa para "' . $o['status'] . '". Confira antes de alterar.', 409, 'CONFLITO');
        if ($st !== $o['status']) {
            q("UPDATE ordens_servico SET status = ?, fechada_em = ? WHERE id = ? AND tenant_id = ?",
              [$st, in_array($st, OS_ENCERRADAS, true) ? ($o['fechada_em'] ?: date('Y-m-d H:i:s')) : null, $o['id'], $tid]);
            os_evento((int) $o['id'], 'status', $o['status'] . ' → ' . $st, $tid, (int) $u['id']);
            if ($st === 'Em execução') q("UPDATE os_visitas SET inicio = COALESCE(inicio, NOW()) WHERE tenant_id = ? AND os_id = ? AND numero = 1", [$tid, $o['id']]);
        }
        /* v1.28.0: finalizada/encerrada sai da escala (a resposta é montada antes, pois o técnico deixa de ver a OS) */
        if ($st === 'Serviço finalizado' || in_array($st, OS_ENCERRADAS, true)) {
            $out = os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
            os_liberar_tecnicos((int) $o['id'], $tid);
            return $out;
        }
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    'excluir' => function ($d) {
        $u = exigir_perfil('admin');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['id'] ?? 0), $u);
        /* libera o número (ex.: 590) para uma nova OS do mesmo chamado */
        q("UPDATE ordens_servico SET excluido_em = NOW(), numero = CONCAT(numero, '-x', id) WHERE id = ? AND tenant_id = ?", [$o['id'], $tid]);
        auditar('os_excluir', 'ordens_servico', (int) $o['id'], $o['numero'] . ' ' . $o['cliente_nome']);
        return ['id' => (int) $o['id']];
    },

    /* substitui a lista de tarefas/etapas da OS: {id, etapas:[{id?, grupo, nome, status}]} */
    'tarefas.salvar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['id'] ?? 0), $u);
        db()->beginTransaction();
        os_gravar_etapas((int) $o['id'], $d['etapas'] ?? [], $tid);
        db()->commit();
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    'etapa.status' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        $st = (string) ($d['status'] ?? '');
        if (!in_array($st, OS_ETAPA_STATUS, true)) erro('Status de etapa inválido.');
        $e = linha("SELECT * FROM os_etapas WHERE id = ? AND tenant_id = ? AND os_id = ? AND excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid, $o['id']]);
        if (!$e) erro('Etapa não encontrada.', 404, 'NAO_ENCONTRADO');
        if (isset($d['_antes']) && $d['_antes'] !== '' && $e['status'] !== $d['_antes'] && $e['status'] !== $st)
            erro('A etapa "' . $e['nome'] . '" da OS ' . $o['numero'] . ' foi alterada por outra pessoa. Confira antes de mudar.', 409, 'CONFLITO');
        q("UPDATE os_etapas SET status = ? WHERE id = ? AND tenant_id = ?", [$st, $e['id'], $tid]);
        if ($st === 'problema') os_evento((int) $o['id'], 'historico', 'Etapa Não OK: ' . ($e['grupo'] ? $e['grupo'] . ' › ' : '') . $e['nome'], $tid, (int) $u['id']);
        if ($st === 'naofeito') os_evento((int) $o['id'], 'historico', 'Etapa não feita (NF): ' . ($e['grupo'] ? $e['grupo'] . ' › ' : '') . $e['nome'], $tid, (int) $u['id']);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    'evento.criar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        $t = txt($d['texto'] ?? '', 5000);
        if ($t === '') erro('Escreva o registro do diário.');
        os_evento((int) $o['id'], 'diario', $t, $tid, (int) $u['id']);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    'pendencia.criar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        $t = txt($d['descricao'] ?? '', 2000);
        if ($t === '') erro('Descreva a pendência.');
        q("INSERT INTO os_pendencias (tenant_id, os_id, descricao, criado_por) VALUES (?, ?, ?, ?)", [$tid, $o['id'], $t, $u['id']]);
        os_evento((int) $o['id'], 'historico', 'Pendência aberta: ' . $t, $tid, (int) $u['id']);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    'pendencia.resolver' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        $p = linha("SELECT * FROM os_pendencias WHERE id = ? AND tenant_id = ? AND os_id = ? AND excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid, $o['id']]);
        if (!$p) erro('Pendência não encontrada.', 404, 'NAO_ENCONTRADO');
        $aberta = !empty($d['reabrir']);
        q("UPDATE os_pendencias SET status = ?, resolvida_em = ? WHERE id = ? AND tenant_id = ?", [$aberta ? 'aberta' : 'resolvida', $aberta ? null : date('Y-m-d H:i:s'), $p['id'], $tid]);
        os_evento((int) $o['id'], 'historico', ($aberta ? 'Pendência reaberta: ' : 'Pendência resolvida: ') . $p['descricao'], $tid, (int) $u['id']);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    'material.criar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        $nome = txt($d['material'] ?? '', 200);
        if ($nome === '') erro('Informe o material.');
        $qtd = str_replace(',', '.', (string) ($d['quantidade'] ?? '0'));
        if (!is_numeric($qtd) || $qtd < 0) erro('Quantidade inválida.');
        q("INSERT INTO os_materiais (tenant_id, os_id, material, quantidade, unidade) VALUES (?, ?, ?, ?, ?)", [$tid, $o['id'], $nome, round((float) $qtd, 3), txt_ou_null($d['unidade'] ?? '', 20)]);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    'material.excluir' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        q("UPDATE os_materiais SET excluido_em = NOW() WHERE id = ? AND tenant_id = ? AND os_id = ?", [(int) ($d['id'] ?? 0), $tid, $o['id']]);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },
    /* upload multipart: acao=os.foto.enviar, osId, etapaId?, legenda?, arquivo=<imagem> */
    'foto.enviar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        $cat = 'foto';
        $et = (int) ($d['etapaId'] ?? 0);
        if ($et && valor("SELECT id FROM os_etapas WHERE id = ? AND tenant_id = ? AND os_id = ? AND excluido_em IS NULL", [$et, $tid, $o['id']])) $cat = 'etapa:' . $et;
        $id = salvar_anexo($_FILES['arquivo'] ?? null, 'os', (int) $o['id'], $cat, true);
        $leg = txt($d['legenda'] ?? '', 200);
        q("UPDATE anexos SET nome_original = ? WHERE id = ? AND tenant_id = ?", [$leg !== '' ? $leg : null, $id, $tid]);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    'foto.excluir' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        $a = linha("SELECT * FROM anexos WHERE id = ? AND tenant_id = ? AND dono_tipo = 'os' AND dono_id = ? AND excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid, $o['id']]);
        if (!$a || strpos($a['categoria'], 'ass_') === 0) erro('Foto não encontrada.', 404, 'NAO_ENCONTRADO');
        if (os_eh_tecnico($u) && (int) $a['criado_por'] !== (int) $u['id']) erro('Só quem tirou a foto pode apagar.', 403, 'SEM_PERMISSAO');
        q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$a['id'], $tid]);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    /* upload multipart: acao=os.assinatura.enviar, osId, quem=tecnico|cliente, nome, cargo?, arquivo=<png> */
    'assinatura.enviar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        $quem = ($d['quem'] ?? '') === 'cliente' ? 'cliente' : 'tecnico';
        $nome = txt($d['nome'] ?? '', 150);
        if ($nome === '') erro($quem === 'cliente' ? 'Informe o nome de quem assina pelo cliente.' : 'Informe o nome do técnico.');
        q("UPDATE anexos SET excluido_em = NOW() WHERE tenant_id = ? AND dono_tipo = 'os' AND dono_id = ? AND categoria = ? AND excluido_em IS NULL", [$tid, $o['id'], 'ass_' . $quem]);
        $id = salvar_anexo($_FILES['arquivo'] ?? null, 'os', (int) $o['id'], 'ass_' . $quem, true);
        if ($quem === 'cliente') {
            q("UPDATE ordens_servico SET cliente_nome_assinatura = ?, cliente_cargo = ?, assinatura_anexo_id = ? WHERE id = ? AND tenant_id = ?",
              [$nome, txt_ou_null($d['cargo'] ?? '', 100), $id, $o['id'], $tid]);
        } else {
            $m = os_meta($o); $m['assTecnicoNome'] = $nome;
            q("UPDATE ordens_servico SET checklist = ? WHERE id = ? AND tenant_id = ?", [json_encode($m, JSON_UNESCAPED_UNICODE), $o['id'], $tid]);
        }
        os_evento((int) $o['id'], 'historico', 'Assinatura ' . ($quem === 'cliente' ? 'do cliente' : 'do técnico') . ': ' . $nome, $tid, (int) $u['id']);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    'assinatura.limpar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        $quem = ($d['quem'] ?? '') === 'cliente' ? 'cliente' : 'tecnico';
        if (in_array($o['status'], ['Serviço finalizado', 'Concluída'], true) && os_eh_tecnico($u)) erro('OS já finalizada.', 403, 'SEM_PERMISSAO');
        q("UPDATE anexos SET excluido_em = NOW() WHERE tenant_id = ? AND dono_tipo = 'os' AND dono_id = ? AND categoria = ? AND excluido_em IS NULL", [$tid, $o['id'], 'ass_' . $quem]);
        if ($quem === 'cliente') q("UPDATE ordens_servico SET assinatura_anexo_id = NULL WHERE id = ? AND tenant_id = ?", [$o['id'], $tid]);
        return os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);
    },

    /* conferência final: grava a conclusão e passa para "Serviço finalizado" (o escritório fatura e conclui) */
    'finalizar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['osId'] ?? 0), $u);
        $conc = txt($d['conclusao'] ?? '', 5000);
        if ($conc === '') erro('Escreva a conclusão do serviço.');
        $temTec = valor("SELECT 1 FROM anexos WHERE tenant_id = ? AND dono_tipo = 'os' AND dono_id = ? AND categoria = 'ass_tecnico' AND excluido_em IS NULL", [$tid, $o['id']]);
        if (!$temTec) erro('Falta a assinatura do técnico.');
        if (!$o['assinatura_anexo_id'] && empty($d['semCliente'])) erro('Falta a assinatura do cliente. Se não houver ninguém no local, marque "cliente ausente".');
        $m = os_meta($o);
        $m['conclusao'] = $conc; $m['finalizadoEm'] = date('Y-m-d H:i:s');
        if (!empty($d['semCliente'])) $m['clienteAusente'] = true;
        db()->beginTransaction();
        q("UPDATE ordens_servico SET checklist = ?, status = IF(status IN ('Concluída','Cancelada'), status, 'Serviço finalizado') WHERE id = ? AND tenant_id = ?",
          [json_encode($m, JSON_UNESCAPED_UNICODE), $o['id'], $tid]);
        q("UPDATE os_visitas SET inicio = COALESCE(inicio, NOW()), termino = NOW() WHERE tenant_id = ? AND os_id = ? AND numero = 1", [$tid, $o['id']]);
        os_evento((int) $o['id'], 'status', $o['status'] . ' → Serviço finalizado (conferência final)', $tid, (int) $u['id']);
        $out = os_publica(os_da_empresa((int) $o['id'], $u), $tid, true);   /* antes de sair da escala: o técnico deixa de ver a OS */
        os_liberar_tecnicos((int) $o['id'], $tid);   /* v1.28.0 */
        db()->commit();
        auditar('os_finalizar', 'ordens_servico', (int) $o['id'], $o['numero']);
        $out['executores'] = $out['tecnicos'];
        return $out;
    },

    /* v1.19.0 — {id, html} → link público do relatório para mandar ao cliente (WhatsApp).
       As fotos entram como __ANEXO_<id>__ e só abrem pelo link se forem desta empresa. */
    'link.enviar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['id'] ?? 0), $u);
        $html = (string) ($d['html'] ?? '');
        if (strlen($html) < 200 || stripos($html, '<html') === false) erro('Não foi possível montar o relatório. Atualize a página e tente de novo.');
        if (strlen($html) > 3000000) erro('O relatório ficou grande demais para o link.');
        try { valor("SELECT 1 FROM os_links LIMIT 0"); } catch (Throwable $e) { erro('Rode antes o SQL 13_modulos_notificacoes.sql da versão 1.19.0.'); }
        $html = os_limpar_html($html);
        preg_match_all('/__ANEXO_(\d+)__/', $html, $m);
        $ids = array_values(array_unique(array_map('intval', $m[1])));
        $ok = [];
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $ok = array_map('intval', array_column(linhas("SELECT id FROM anexos WHERE tenant_id = ? AND excluido_em IS NULL AND mime LIKE 'image/%' AND id IN ($in)", array_merge([$tid], $ids)), 'id'));
        }
        db()->beginTransaction();
        q("UPDATE os_links SET revogado_em = NOW() WHERE tenant_id = ? AND os_id = ? AND revogado_em IS NULL", [$tid, $o['id']]);
        $tok = bin2hex(random_bytes(16));
        q("INSERT INTO os_links (tenant_id, os_id, token, html, anexos, criado_por) VALUES (?, ?, ?, ?, ?, ?)",
          [$tid, $o['id'], $tok, $html, json_encode($ok), (int) $u['id']]);
        os_evento((int) $o['id'], 'historico', 'Relatório enviado ao cliente por link' . (!empty($d['canal']) ? ' (' . txt($d['canal'], 30) . ')' : '') . '.', $tid, (int) $u['id']);
        db()->commit();
        auditar('os_relatorio_link', 'ordens_servico', (int) $o['id'], $o['numero']);
        $cli = linha("SELECT telefone, contato FROM clientes WHERE id = ? AND tenant_id = ?", [$o['cliente_id'], $tid]);
        $meta = json_decode((string) $o['checklist'], true) ?: [];
        return ['link' => os_link_publico(linha("SELECT * FROM os_links WHERE token = ?", [$tok])),
                'telefone' => ($meta['telefone'] ?? '') !== '' ? $meta['telefone'] : ($cli['telefone'] ?? null),
                'contato' => ($meta['contato'] ?? '') !== '' ? $meta['contato'] : ($cli['contato'] ?? null)];
    },

    /* v1.19.0 — {id} → último link do relatório (visto pelo cliente?) */
    'link.status' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $o = os_da_empresa((int) ($d['id'] ?? 0), $u);
        try { $l = linha("SELECT * FROM os_links WHERE tenant_id = ? AND os_id = ? ORDER BY id DESC LIMIT 1", [$tid, $o['id']]); }
        catch (Throwable $e) { return ['link' => null]; }
        return ['link' => os_link_publico($l)];
    },
];
