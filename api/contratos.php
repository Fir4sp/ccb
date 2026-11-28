<?php
/* =====================================================================
   KONSTANTE SaaS — api/contratos.php  ·  CRM › Contratos (v1.15.0 · v1.25.0: cobrança mensal no Financeiro)
   Gestão comercial do contrato: solicitação → proposta → negociação →
   assinatura → vigência → renovação/encerramento. O contrato operacional
   continua sendo o plano de PMOC (pmoc_planos.contrato_id liga os dois).

   Tabelas: contratos (+ colunas do 10_contratos.sql), contrato_eventos,
   contrato_versoes, anexos (dono_tipo 'contrato').
   contratos.dados = {escopo, naoIncluso, condicoes, equipe, equipamentos:[{tipo, capacidade, qtd, local}], modeloId,
                      tiposEquip, areas, modeloIndicado, qtdEquip,
                      niveis:{lista:[{id, nome, preco, mostrar}], itens:[{nome, em:[ids]}], recomendado, escolhido}}

   Admin vê e edita tudo; coordenação opera o funil sem ver valores;
   técnico e cliente não acessam.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once dirname(__DIR__) . '/nucleo/anexos.php';
require_once dirname(__DIR__) . '/nucleo/fin_contratos.php';   /* v1.25.0: cobrança mensal no Financeiro */
date_default_timezone_set('America/Sao_Paulo');

const CT_POR_PAGINA = 50;
const CT_STATUS = [
    'Solicitado'       => 'funil',
    'Em elaboração'    => 'funil',
    'Proposta enviada' => 'funil',
    'Em negociação'    => 'funil',
    'Ativo'            => 'ativo',
    'Suspenso'         => 'ativo',
    'Não aprovado'     => 'perdido',
    'Encerrado'        => 'encerrado',
];
const CT_ENVIADA = 'Proposta enviada';
const CT_MODALIDADES = ['PMOC residente', 'PMOC volante', 'Manutenção preventiva', 'Manutenção corretiva', 'Outro'];
const CT_PERIODICIDADES = ['Equipe residente', 'Semanal', 'Quinzenal', 'Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Sob demanda'];
const CT_A_VENCER_DIAS = 60;
const CT_VENCENDO_DIAS = 3;   /* proposta "vencendo" = faltam 3 dias ou menos */

function ct_ve_valores($u) { return ve_valores($u); }   /* v1.22.0 */
function ct_json($v) { $d = json_decode((string) ($v ?? ''), true); return is_array($d) ? $d : []; }
function ct_enc($v) { return json_encode($v, JSON_UNESCAPED_UNICODE); }
function ct_hoje() { return date('Y-m-d'); }

function ct_data($v, $rotulo) {
    $v = trim((string) ($v ?? ''));
    if ($v === '') return null;
    $d = DateTime::createFromFormat('Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) erro("Data inválida em $rotulo.");
    return $v;
}
function ct_dinheiro($v, $rotulo) {
    if ($v === null || $v === '') return null;
    if (is_string($v)) {
        $v = str_replace(['R$', ' '], '', trim($v));
        if (strpos($v, ',') !== false) $v = str_replace(',', '.', str_replace('.', '', $v));
        elseif (preg_match('/^\d{1,3}(\.\d{3})+$/', $v)) $v = str_replace('.', '', $v);
    }
    if (!is_numeric($v) || $v < 0 || $v > 99999999) erro("Valor inválido em $rotulo.");
    return round(0 + $v, 2);
}
function ct_int($v, $min, $max) {
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) return null;
    $n = (int) $v;
    return ($n < $min || $n > $max) ? null : $n;
}
/* fim da vigência = início + N meses − 1 dia */
function ct_fim_de($inicio, $meses) {
    if (!$inicio || !$meses) return null;
    $d = new DateTime($inicio);
    $d->modify('+' . (int) $meses . ' months')->modify('-1 day');
    return $d->format('Y-m-d');
}

/* conteúdo da proposta guardado em JSON (limpo e com tamanho limitado) */
/* v1.15.0: níveis de cobertura (Essencial/Completo/Premium…) — itens editáveis por contrato */
function ct_niveis_limpos($n) {
    if (!is_array($n)) return null;
    $lista = []; $ids = [];
    foreach (is_array($n['lista'] ?? null) ? $n['lista'] : [] as $x) {
        if (!is_array($x)) continue;
        $id = preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($x['id'] ?? '')));
        $nome = txt($x['nome'] ?? '', 40);
        if ($id === '' || $nome === '' || isset($ids[$id])) continue;
        $preco = null;
        if (isset($x['preco']) && $x['preco'] !== '' && $x['preco'] !== null) $preco = ct_dinheiro($x['preco'], 'preço do nível ' . $nome);
        $lista[] = ['id' => mb_substr($id, 0, 20), 'nome' => $nome, 'preco' => $preco, 'mostrar' => !array_key_exists('mostrar', $x) || !empty($x['mostrar'])];
        $ids[$id] = 1;
        if (count($lista) >= 5) break;
    }
    $itens = [];
    foreach (is_array($n['itens'] ?? null) ? $n['itens'] : [] as $x) {
        if (!is_array($x)) continue;
        $nome = txt($x['nome'] ?? '', 120);
        if ($nome === '') continue;
        $em = array_values(array_filter(array_map('strval', is_array($x['em'] ?? null) ? $x['em'] : []), function ($i) use ($ids) { return isset($ids[$i]); }));
        $itens[] = ['nome' => $nome, 'em' => $em];
        if (count($itens) >= 40) break;
    }
    $rec = (string) ($n['recomendado'] ?? ''); $esc = (string) ($n['escolhido'] ?? '');
    return ['lista' => $lista, 'itens' => $itens, 'recomendado' => isset($ids[$rec]) ? $rec : '', 'escolhido' => isset($ids[$esc]) ? $esc : ''];
}

function ct_dados_limpos($d, $atual, $admin = true) {
    $out = $atual;
    if ($admin && array_key_exists('niveis', $d)) $out['niveis'] = ct_niveis_limpos($d['niveis']);
    if (array_key_exists('qtdEquip', $d)) $out['qtdEquip'] = ct_int($d['qtdEquip'], 1, 99999);
    foreach (['tiposEquip' => 300, 'areas' => 300, 'modeloIndicado' => 600] as $k => $max) if (array_key_exists($k, $d)) $out[$k] = txt($d[$k], $max);
    foreach (['escopo' => 8000, 'naoIncluso' => 4000, 'condicoes' => 4000, 'equipe' => 2000] as $k => $max)
        if (array_key_exists($k, $d)) $out[$k] = txt($d[$k], $max);
    if (array_key_exists('modeloId', $d)) $out['modeloId'] = txt($d['modeloId'], 40);
    if (array_key_exists('equipamentos', $d)) {
        $eq = [];
        foreach (is_array($d['equipamentos']) ? $d['equipamentos'] : [] as $x) {
            if (!is_array($x)) continue;
            $tipo = txt($x['tipo'] ?? '', 120);
            if ($tipo === '') continue;
            $q = is_numeric($x['qtd'] ?? null) ? max(1, min(9999, (int) $x['qtd'])) : 1;
            $eq[] = ['tipo' => $tipo, 'capacidade' => txt($x['capacidade'] ?? '', 40), 'qtd' => $q, 'local' => txt($x['local'] ?? '', 150)];
            if (count($eq) >= 300) break;
        }
        $out['equipamentos'] = $eq;
    }
    return $out;
}

/* ---------- formato enviado ao app ---------- */

const CT_SELECT = "SELECT ct.*, cl.nome AS cliente_nome, cl.numero AS cliente_numero, u.nome AS responsavel_nome, ch.numero AS chamado_numero,
                          (SELECT COUNT(*) FROM anexos a WHERE a.tenant_id = ct.tenant_id AND a.dono_tipo = 'contrato' AND a.dono_id = ct.id AND a.excluido_em IS NULL) AS anexos_qtd,
                          (SELECT MAX(v.versao) FROM contrato_versoes v WHERE v.tenant_id = ct.tenant_id AND v.contrato_id = ct.id) AS versao_atual
                     FROM contratos ct
                     JOIN clientes cl ON cl.tenant_id = ct.tenant_id AND cl.id = ct.cliente_id
                     LEFT JOIN usuarios u ON u.tenant_id = ct.tenant_id AND u.id = ct.responsavel_id
                     LEFT JOIN chamados ch ON ch.tenant_id = ct.tenant_id AND ch.id = ct.chamado_id";

function ct_niveis_para($n, $verPreco) {
    if (!is_array($n)) return null;
    if (!$verPreco) foreach ($n['lista'] as $i => $x) $n['lista'][$i]['preco'] = null;
    return $n;
}
function ct_publico($c, $u) {
    $dados = ct_json($c['dados']);
    $hoje = ct_hoje();
    $out = [
        'id'            => (int) $c['id'],
        'numero'        => (int) $c['numero'],
        'clienteId'     => (int) $c['cliente_id'],
        'clienteNome'   => $c['cliente_nome'] ?? null,
        'clienteNumero' => isset($c['cliente_numero']) ? (int) $c['cliente_numero'] : null,
        'titulo'        => $c['titulo'],
        'chamadoId'     => $c['chamado_id'] !== null ? (int) $c['chamado_id'] : null,
        'chamadoNumero' => isset($c['chamado_numero']) && $c['chamado_numero'] !== null ? (int) $c['chamado_numero'] : null,
        'comQuemFalar'  => $c['com_quem_falar'],
        'responsavelId' => $c['responsavel_id'] !== null ? (int) $c['responsavel_id'] : null,
        'responsavelNome' => $c['responsavel_nome'] ?? null,
        'modalidade'    => $c['tipo'],
        'periodicidade' => $c['periodicidade'],
        'status'        => $c['status'],
        'categoria'     => CT_STATUS[$c['status']] ?? 'funil',
        'solicitadoEm'  => $c['solicitado_em'],
        'enviadoEm'     => $c['enviado_em'],
        'validadeDias'  => (int) $c['validade_dias'],
        'assinadoEm'    => $c['assinado_em'],
        'encerradoEm'   => $c['encerrado_em'],
        'inicio'        => $c['inicio'],
        'fim'           => $c['fim'],
        'vigenciaMeses' => $c['vigencia_meses'] !== null ? (int) $c['vigencia_meses'] : null,
        'renovacaoAuto' => (int) $c['renovacao_auto'] === 1,
        'reajuste'      => $c['reajuste'],
        'diaVencimento' => $c['dia_vencimento'] !== null ? (int) $c['dia_vencimento'] : null,
        'proximoRetorno'=> $c['proximo_retorno'],
        'motivo'        => $c['motivo'],
        'obs'           => $c['obs'],
        'escopo'        => $dados['escopo'] ?? '',
        'naoIncluso'    => $dados['naoIncluso'] ?? '',
        'condicoes'     => $dados['condicoes'] ?? '',
        'equipe'        => $dados['equipe'] ?? '',
        'equipamentos'  => $dados['equipamentos'] ?? [],
        'modeloId'      => $dados['modeloId'] ?? '',
        'tiposEquip'    => $dados['tiposEquip'] ?? '',
        'areas'         => $dados['areas'] ?? '',
        'modeloIndicado'=> $dados['modeloIndicado'] ?? '',
        'qtdEquip'      => isset($dados['qtdEquip']) ? $dados['qtdEquip'] : null,
        'niveis'        => ct_niveis_para($dados['niveis'] ?? null, ct_ve_valores($u)),
        'anexosQtd'     => (int) ($c['anexos_qtd'] ?? 0),
        'versaoAtual'   => $c['versao_atual'] !== null ? (int) $c['versao_atual'] : 0,
        'criadoEm'      => $c['criado_em'],
        'atualizadoEm'  => $c['atualizado_em'],
        'proposta'      => null,
        'vigencia'      => null,
    ];
    /* validade da proposta enviada: só sinaliza, o status não muda sozinho */
    if ($c['status'] === CT_ENVIADA && $c['enviado_em']) {
        $vence = date('Y-m-d', strtotime($c['enviado_em'] . ' +' . (int) $c['validade_dias'] . ' days'));
        $resta = (int) round((strtotime($vence) - strtotime($hoje)) / 86400);
        $out['proposta'] = ['venceEm' => $vence, 'diasRestantes' => $resta,
                            'situacao' => $resta < 0 ? 'vencida' : ($resta <= CT_VENCENDO_DIAS ? 'vencendo' : 'valida')];
    }
    /* vigência do contrato ativo */
    if (in_array($c['status'], ['Ativo', 'Suspenso'], true) && $c['fim']) {
        $resta = (int) round((strtotime($c['fim']) - strtotime($hoje)) / 86400);
        $out['vigencia'] = ['diasRestantes' => $resta,
                            'situacao' => $resta < 0 ? 'vencido' : ($resta <= CT_A_VENCER_DIAS ? 'a_vencer' : 'vigente')];
    }
    if (ct_ve_valores($u)) $out['valorMensal'] = $c['valor_mensal'] === null ? null : (float) $c['valor_mensal'];
    return $out;
}

function ct_da_empresa($id, $tid) {
    $c = linha(CT_SELECT . " WHERE ct.id = ? AND ct.tenant_id = ? AND ct.excluido_em IS NULL", [(int) $id, $tid]);
    if (!$c) erro('Contrato não encontrado.', 404, 'NAO_ENCONTRADO');
    return $c;
}

function ct_evento($cid, $tipo, $texto, $retorno = null) {
    $u = eu();
    q("INSERT INTO contrato_eventos (tenant_id, contrato_id, tipo, texto, retorno, usuario_id) VALUES (?, ?, ?, ?, ?, ?)",
      [(int) $u['tenant_id'], (int) $cid, $tipo, $texto === null ? null : mb_substr($texto, 0, 4000), $retorno, (int) $u['id']]);
}

/* datas que acompanham o status (só preenche o que está vazio; nada é apagado) */
function ct_datas_do_status($novo, $antigo, &$campos, $atual) {
    if ($novo === $antigo) return;
    $hoje = ct_hoje();
    if ($novo === CT_ENVIADA) $campos['enviado_em'] = $hoje;   /* reenvio = nova validade */
    if ($novo === 'Ativo') {
        $ass = $campos['assinado_em'] ?? ($atual['assinado_em'] ?? null);
        if (!$ass) $campos['assinado_em'] = $hoje;
        $ini = $campos['inicio'] ?? ($atual['inicio'] ?? null);
        if (!$ini) { $ini = $campos['assinado_em'] ?? $ass ?? $hoje; $campos['inicio'] = $ini; }
        $fim = $campos['fim'] ?? ($atual['fim'] ?? null);
        $meses = $campos['vigencia_meses'] ?? ($atual['vigencia_meses'] ?? null);
        if (!$fim && $meses) $campos['fim'] = ct_fim_de($ini, $meses);
        $campos['encerrado_em'] = null;
    }
    if ($novo === 'Encerrado' || $novo === 'Não aprovado') $campos['encerrado_em'] = $hoje;
    if (in_array($novo, ['Solicitado', 'Em elaboração', 'Proposta enviada', 'Em negociação'], true)) $campos['encerrado_em'] = null;
}

/* fotografia do que foi enviado ao cliente (para a aba Versões) */
function ct_retrato($c) {
    $d = ct_json($c['dados']);
    return [
        'titulo' => $c['titulo'], 'modalidade' => $c['tipo'], 'periodicidade' => $c['periodicidade'],
        'inicio' => $c['inicio'], 'fim' => $c['fim'], 'vigenciaMeses' => $c['vigencia_meses'] !== null ? (int) $c['vigencia_meses'] : null,
        'renovacaoAuto' => (int) $c['renovacao_auto'] === 1, 'reajuste' => $c['reajuste'],
        'diaVencimento' => $c['dia_vencimento'] !== null ? (int) $c['dia_vencimento'] : null,
        'validadeDias' => (int) $c['validade_dias'], 'comQuemFalar' => $c['com_quem_falar'],
        'escopo' => $d['escopo'] ?? '', 'naoIncluso' => $d['naoIncluso'] ?? '', 'condicoes' => $d['condicoes'] ?? '',
        'equipe' => $d['equipe'] ?? '', 'equipamentos' => $d['equipamentos'] ?? [], 'modeloId' => $d['modeloId'] ?? '',
        'tiposEquip' => $d['tiposEquip'] ?? '', 'areas' => $d['areas'] ?? '', 'modeloIndicado' => $d['modeloIndicado'] ?? '',
        'qtdEquip' => $d['qtdEquip'] ?? null, 'niveis' => $d['niveis'] ?? null,
        'valorMensal' => $c['valor_mensal'] === null ? null : (float) $c['valor_mensal'],
    ];
}
/* grava versão nova só se o conteúdo mudou desde a última */
function ct_versionar($c) {
    $tid = (int) $c['tenant_id'];
    $ret = ct_retrato($c);
    $enc = ct_enc($ret);
    $ult = linha("SELECT versao, dados FROM contrato_versoes WHERE tenant_id = ? AND contrato_id = ? ORDER BY versao DESC LIMIT 1", [$tid, (int) $c['id']]);
    if ($ult && $ult['dados'] === $enc) return (int) $ult['versao'];
    $n = $ult ? (int) $ult['versao'] + 1 : 1;
    q("INSERT INTO contrato_versoes (tenant_id, contrato_id, versao, valor_mensal, dados, criado_por) VALUES (?, ?, ?, ?, ?, ?)",
      [$tid, (int) $c['id'], $n, $c['valor_mensal'], $enc, (int) eu()['id']]);
    ct_evento($c['id'], 'versao', 'Versão ' . $n . ' da proposta gerada' . ($c['valor_mensal'] !== null ? ' · R$ ' . number_format((float) $c['valor_mensal'], 2, ',', '.') . '/mês' : ''));
    return $n;
}

function ct_where_busca($busca, &$where, &$par) {
    if ($busca === '') return;
    $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $busca) . '%';
    $where .= " AND (cl.nome LIKE ? OR ct.titulo LIKE ? OR ct.com_quem_falar LIKE ? OR ct.obs LIKE ? OR ct.numero = ?)";
    array_push($par, $like, $like, $like, $like, ctype_digit($busca) ? (int) $busca : -1);
}

/* ---------- ações ---------- */

return [

    'opcoes' => function ($d) {
        exigir_perfil('admin', 'coord');
        return [
            'status' => array_map(function ($s, $c) { return ['nome' => $s, 'categoria' => $c]; }, array_keys(CT_STATUS), CT_STATUS),
            'modalidades' => CT_MODALIDADES,
            'periodicidades' => CT_PERIODICIDADES,
            'responsaveis' => array_map(function ($r) { return ['id' => (int) $r['id'], 'nome' => $r['nome']]; },
                linhas("SELECT id, nome FROM usuarios WHERE tenant_id = ? AND excluido_em IS NULL AND status = 'ativo'
                          AND perfil IN ('admin','coord','comercial') ORDER BY nome", [tenant()])),
            'aVencerDias' => CT_A_VENCER_DIAS,
        ];
    },

    /* {busca, filtro: funil|ativos|a_vencer|vencidos|vencendo|propostas_vencidas|retorno|perdidos|encerrados|todos|<status>, clienteId, ordem, pagina} */
    'listar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $where = "ct.tenant_id = ? AND ct.excluido_em IS NULL"; $par = [$tid];
        $cli = (int) ($d['clienteId'] ?? 0);
        if ($cli) { $where .= " AND ct.cliente_id = ?"; $par[] = $cli; }
        $busca = txt($d['busca'] ?? '', 100);
        ct_where_busca($busca, $where, $par);
        $wBase = $where; $pBase = $par;

        $sqlVence = "DATEDIFF(DATE_ADD(ct.enviado_em, INTERVAL ct.validade_dias DAY), CURDATE())";
        $f = (string) ($d['filtro'] ?? 'funil');
        if (isset(CT_STATUS[$f])) { $where .= " AND ct.status = ?"; $par[] = $f; }
        elseif ($f === 'funil')     $where .= " AND ct.status IN ('Solicitado','Em elaboração','Proposta enviada','Em negociação')";
        elseif ($f === 'ativos')    $where .= " AND ct.status IN ('Ativo','Suspenso')";
        elseif ($f === 'a_vencer')  $where .= " AND ct.status IN ('Ativo','Suspenso') AND ct.fim BETWEEN CURDATE() AND CURDATE() + INTERVAL " . CT_A_VENCER_DIAS . " DAY";
        elseif ($f === 'vencidos')  $where .= " AND ct.status IN ('Ativo','Suspenso') AND ct.fim < CURDATE()";
        elseif ($f === 'vencendo')  $where .= " AND ct.status = 'Proposta enviada' AND ct.enviado_em IS NOT NULL AND $sqlVence BETWEEN 0 AND " . CT_VENCENDO_DIAS;
        elseif ($f === 'propostas_vencidas') $where .= " AND ct.status = 'Proposta enviada' AND ct.enviado_em IS NOT NULL AND $sqlVence < 0";
        elseif ($f === 'retorno')   $where .= " AND ct.proximo_retorno IS NOT NULL AND ct.proximo_retorno <= CURDATE() AND ct.status NOT IN ('Não aprovado','Encerrado')";
        elseif ($f === 'perdidos')  $where .= " AND ct.status = 'Não aprovado'";
        elseif ($f === 'encerrados') $where .= " AND ct.status = 'Encerrado'";
        /* 'todos': sem filtro */

        $ordens = ['recentes' => 'ct.numero DESC', 'antigos' => 'ct.numero ASC', 'atualizados' => 'ct.atualizado_em DESC',
                   'cliente' => 'cl.nome ASC, ct.numero DESC', 'vencimento' => 'ct.fim IS NULL, ct.fim ASC, ct.numero DESC'];
        $ordem = $ordens[$d['ordem'] ?? ''] ?? $ordens['recentes'];
        $from = " FROM contratos ct JOIN clientes cl ON cl.tenant_id = ct.tenant_id AND cl.id = ct.cliente_id ";
        $total = (int) valor("SELECT COUNT(*) $from WHERE $where", $par);
        $pagina = max(1, (int) ($d['pagina'] ?? 1));
        $lim = $f === 'quadro' ? 500 : CT_POR_PAGINA;   /* v1.17.0: quadro (kanban) traz tudo de uma vez */
        if ($f === 'quadro') { $where .= " AND (ct.status NOT IN ('Não aprovado','Encerrado') OR COALESCE(ct.encerrado_em, DATE(ct.atualizado_em)) >= CURDATE() - INTERVAL 120 DAY)"; $pagina = 1; $ordem = 'ct.atualizado_em DESC'; }
        $rows = linhas(CT_SELECT . " WHERE $where ORDER BY $ordem LIMIT " . $lim . " OFFSET " . (int) (($pagina - 1) * $lim), $par);

        /* contagens dos chips (respeitam busca e cliente) */
        $c = linha("SELECT
              SUM(ct.status IN ('Solicitado','Em elaboração','Proposta enviada','Em negociação')) AS funil,
              SUM(ct.status IN ('Ativo','Suspenso')) AS ativos,
              SUM(ct.status IN ('Ativo','Suspenso') AND ct.fim BETWEEN CURDATE() AND CURDATE() + INTERVAL " . CT_A_VENCER_DIAS . " DAY) AS a_vencer,
              SUM(ct.status IN ('Ativo','Suspenso') AND ct.fim < CURDATE()) AS vencidos,
              SUM(ct.status = 'Proposta enviada' AND ct.enviado_em IS NOT NULL AND $sqlVence BETWEEN 0 AND " . CT_VENCENDO_DIAS . ") AS vencendo,
              SUM(ct.status = 'Proposta enviada' AND ct.enviado_em IS NOT NULL AND $sqlVence < 0) AS propostas_vencidas,
              SUM(ct.proximo_retorno IS NOT NULL AND ct.proximo_retorno <= CURDATE() AND ct.status NOT IN ('Não aprovado','Encerrado')) AS retorno,
              SUM(ct.status = 'Não aprovado') AS perdidos,
              SUM(ct.status = 'Encerrado') AS encerrados,
              COUNT(*) AS todos
            $from WHERE $wBase", $pBase);
        $cont = [];
        foreach ($c as $k => $v) $cont[$k] = (int) $v;
        $porStatus = [];
        foreach (linhas("SELECT ct.status, COUNT(*) n $from WHERE $wBase GROUP BY ct.status", $pBase) as $r) $porStatus[$r['status']] = (int) $r['n'];

        return ['itens' => array_map(function ($r) use ($u) { return ct_publico($r, $u); }, $rows),
                'total' => $total, 'pagina' => $pagina, 'porPagina' => CT_POR_PAGINA, 'contagem' => $cont, 'porStatus' => $porStatus];
    },

    /* indicadores do topo */
    'resumo' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $ini = date('Y-m-01'); $fim = date('Y-m-t');
        $r = linha("SELECT
              SUM(status IN ('Ativo','Suspenso')) AS ativos,
              SUM(CASE WHEN status = 'Ativo' THEN valor_mensal ELSE 0 END) AS receita_mensal,
              SUM(status IN ('Solicitado','Em elaboração','Proposta enviada','Em negociação')) AS funil,
              SUM(CASE WHEN status IN ('Solicitado','Em elaboração','Proposta enviada','Em negociação') THEN valor_mensal ELSE 0 END) AS funil_valor,
              SUM(status IN ('Ativo','Suspenso') AND fim BETWEEN CURDATE() AND CURDATE() + INTERVAL " . CT_A_VENCER_DIAS . " DAY) AS a_vencer,
              SUM(status IN ('Ativo','Suspenso') AND fim < CURDATE()) AS vencidos,
              SUM(assinado_em BETWEEN ? AND ? AND status IN ('Ativo','Suspenso','Encerrado')) AS ganhos_mes,
              SUM(CASE WHEN assinado_em BETWEEN ? AND ? AND status IN ('Ativo','Suspenso','Encerrado') THEN valor_mensal ELSE 0 END) AS ganhos_mes_valor,
              SUM(status = 'Não aprovado' AND encerrado_em BETWEEN ? AND ?) AS perdidos_mes
            FROM contratos WHERE tenant_id = ? AND excluido_em IS NULL", [$ini, $fim, $ini, $fim, $ini, $fim, $tid]);
        $out = [];
        foreach (['ativos', 'funil', 'a_vencer', 'vencidos', 'ganhos_mes', 'perdidos_mes'] as $k) $out[$k] = (int) $r[$k];
        if (ct_ve_valores($u)) {
            $out['receitaMensal'] = (float) $r['receita_mensal'];
            $out['funilValor'] = (float) $r['funil_valor'];
            $out['ganhosMesValor'] = (float) $r['ganhos_mes_valor'];
        }
        return $out;
    },

    'obter' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = ct_da_empresa($d['id'] ?? 0, $tid);
        $out = ct_publico($c, $u);
        $out['planos'] = array_map(function ($p) { return ['id' => (int) $p['id'], 'ano' => (int) $p['ano']]; },
            linhas("SELECT id, ano FROM pmoc_planos WHERE tenant_id = ? AND contrato_id = ? AND excluido_em IS NULL ORDER BY ano DESC", [$tid, (int) $c['id']]));
        $out['planoSemContrato'] = null;   /* plano do cliente no ano, ainda não ligado a contrato */
        $p = linha("SELECT id, ano FROM pmoc_planos WHERE tenant_id = ? AND cliente_id = ? AND ano = ? AND excluido_em IS NULL AND contrato_id IS NULL",
                   [$tid, (int) $c['cliente_id'], (int) date('Y')]);
        if ($p) $out['planoSemContrato'] = ['id' => (int) $p['id'], 'ano' => (int) $p['ano']];
        $out['osQtd'] = (int) valor("SELECT COUNT(*) FROM ordens_servico WHERE tenant_id = ? AND contrato_id = ? AND excluido_em IS NULL", [$tid, (int) $c['id']]);
        return $out;
    },

    'salvar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $atual = $id ? ct_da_empresa($id, $tid) : null;
        $admin = ct_ve_valores($u);

        $cli = (int) ($d['clienteId'] ?? ($atual['cliente_id'] ?? 0));
        $clRow = $cli ? linha("SELECT id, contato FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$cli, $tid]) : null;
        if (!$clRow) erro('Escolha o cliente do contrato.');
        $status = (string) ($d['status'] ?? ($atual['status'] ?? 'Solicitado'));
        if (!isset(CT_STATUS[$status])) erro('Status inválido.');
        $resp = isset($d['responsavelId']) && $d['responsavelId'] ? (int) $d['responsavelId'] : null;
        if ($resp && !valor("SELECT id FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$resp, $tid])) $resp = null;

        $campos = [
            'cliente_id'     => $cli,
            'titulo'         => txt_ou_null($d['titulo'] ?? '', 200),
            'com_quem_falar' => txt_ou_null($d['comQuemFalar'] ?? '', 150),
            'responsavel_id' => $resp,
            'tipo'           => txt_ou_null($d['modalidade'] ?? '', 60),
            'periodicidade'  => txt_ou_null($d['periodicidade'] ?? '', 30),
            'status'         => $status,
            'solicitado_em'  => ct_data($d['solicitadoEm'] ?? '', 'Solicitado em') ?: ($atual ? $atual['solicitado_em'] : ct_hoje()),
            'proximo_retorno'=> ct_data($d['proximoRetorno'] ?? '', 'Próximo retorno'),
            'motivo'         => txt_ou_null($d['motivo'] ?? '', 255),
            'obs'            => txt_ou_null($d['obs'] ?? '', 5000),
            'dados'          => ct_enc(ct_dados_limpos($d, $atual ? ct_json($atual['dados']) : [], $admin)),
        ];
        /* datas que a coordenação pode corrigir */
        foreach (['enviadoEm' => 'enviado_em', 'assinadoEm' => 'assinado_em', 'encerradoEm' => 'encerrado_em'] as $k => $col)
            if (array_key_exists($k, $d)) $campos[$col] = ct_data($d[$k], $k);
        /* vigência e valores: só o administrador */
        if ($admin) {
            $campos['valor_mensal']   = ct_dinheiro($d['valorMensal'] ?? null, 'Valor mensal');
            $campos['vigencia_meses'] = ct_int($d['vigenciaMeses'] ?? null, 1, 240);
            $campos['inicio']         = ct_data($d['inicio'] ?? '', 'Início');
            $campos['fim']            = ct_data($d['fim'] ?? '', 'Fim');
            $campos['renovacao_auto'] = !empty($d['renovacaoAuto']) ? 1 : 0;
            $campos['reajuste']       = txt_ou_null($d['reajuste'] ?? '', 80);
            $campos['dia_vencimento'] = ct_int($d['diaVencimento'] ?? null, 1, 31);
            $v = ct_int($d['validadeDias'] ?? null, 1, 365);
            $campos['validade_dias']  = $v ?: ($atual ? (int) $atual['validade_dias'] : (int) (valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'validade_orcamento'", [$tid]) ?: 15));
            if (!$campos['fim'] && $campos['inicio'] && $campos['vigencia_meses'] && array_key_exists('vigenciaMeses', $d)) $campos['fim'] = ct_fim_de($campos['inicio'], $campos['vigencia_meses']);
            if ($campos['inicio'] && $campos['fim'] && $campos['fim'] < $campos['inicio']) erro('O fim da vigência é antes do início.');
        } elseif (!$atual) {
            $campos['validade_dias'] = (int) (valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'validade_orcamento'", [$tid]) ?: 15);
        }
        /* edição: campo que não veio na requisição fica como está (nunca apaga por omissão) */
        if ($atual) {
            $mapa = ['titulo' => 'titulo', 'com_quem_falar' => 'comQuemFalar', 'responsavel_id' => 'responsavelId', 'tipo' => 'modalidade',
                     'periodicidade' => 'periodicidade', 'solicitado_em' => 'solicitadoEm', 'proximo_retorno' => 'proximoRetorno', 'motivo' => 'motivo', 'obs' => 'obs',
                     'valor_mensal' => 'valorMensal', 'vigencia_meses' => 'vigenciaMeses', 'inicio' => 'inicio', 'fim' => 'fim', 'renovacao_auto' => 'renovacaoAuto',
                     'reajuste' => 'reajuste', 'dia_vencimento' => 'diaVencimento', 'validade_dias' => 'validadeDias'];
            foreach ($mapa as $col => $k) if (array_key_exists($col, $campos) && !array_key_exists($k, $d)) unset($campos[$col]);
        }
        if (!$atual && !$campos['com_quem_falar']) $campos['com_quem_falar'] = $clRow['contato'];
        $antigo = $atual ? $atual['status'] : null;
        ct_datas_do_status($status, $antigo, $campos, $atual);

        db()->beginTransaction();
        if ($atual) {
            $sets = []; $par = [];
            foreach ($campos as $k => $v) { $sets[] = "$k = ?"; $par[] = $v; }
            array_push($par, $id, $tid);
            q("UPDATE contratos SET " . implode(', ', $sets) . " WHERE id = ? AND tenant_id = ?", $par);
            if ($antigo !== $status) ct_evento($id, 'status', $antigo . ' → ' . $status . ($campos['motivo'] && in_array($status, ['Não aprovado', 'Encerrado'], true) ? ' · ' . $campos['motivo'] : ''));
            auditar('contrato_editar', 'contratos', $id, 'nº ' . $atual['numero']);
        } else {
            $chamado = (int) ($d['chamadoId'] ?? 0);
            if ($chamado && !valor("SELECT id FROM chamados WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$chamado, $tid])) $chamado = 0;
            $campos['chamado_id'] = $chamado ?: null;
            $campos['numero'] = numero_livre('contrato', 'contratos', $tid);
            $campos['tenant_id'] = $tid;
            $campos['criado_por'] = (int) $u['id'];
            q("INSERT INTO contratos (" . implode(', ', array_keys($campos)) . ") VALUES (" . implode(', ', array_fill(0, count($campos), '?')) . ")", array_values($campos));
            $id = (int) db()->lastInsertId();
            ct_evento($id, 'status', 'Contrato aberto como ' . $status);
            auditar('contrato_criar', 'contratos', $id, 'nº ' . $campos['numero']);
        }
        $c = ct_da_empresa($id, $tid);
        $versao = null;
        if (!empty($d['gerarVersao']) && $admin) { $versao = ct_versionar($c); $c = ct_da_empresa($id, $tid); }
        db()->commit();
        fct_sincronizar($tid, $id);   /* v1.25.0 */
        $out = ct_publico($c, $u);
        $out['versaoGerada'] = $versao;
        return $out;
    },

    'mudar_status' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = ct_da_empresa($d['id'] ?? 0, $tid);
        $novo = (string) ($d['status'] ?? '');
        if (!isset(CT_STATUS[$novo])) erro('Status inválido.');
        if ($novo === $c['status']) return ct_publico($c, $u);
        $campos = ['status' => $novo];
        ct_datas_do_status($novo, $c['status'], $campos, $c);
        db()->beginTransaction();
        $sets = []; $par = [];
        foreach ($campos as $k => $v) { $sets[] = "$k = ?"; $par[] = $v; }
        array_push($par, (int) $c['id'], $tid);
        q("UPDATE contratos SET " . implode(', ', $sets) . " WHERE id = ? AND tenant_id = ?", $par);
        ct_evento($c['id'], 'status', $c['status'] . ' → ' . $novo);
        db()->commit();
        auditar('contrato_status', 'contratos', (int) $c['id'], $c['status'] . ' → ' . $novo);
        fct_sincronizar($tid, (int) $c['id']);   /* v1.25.0 */
        return ct_publico(ct_da_empresa($c['id'], $tid), $u);
    },

    'excluir' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $c = ct_da_empresa($d['id'] ?? 0, $tid);
        q("UPDATE contratos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [(int) $c['id'], $tid]);
        auditar('contrato_excluir', 'contratos', (int) $c['id'], 'nº ' . $c['numero'] . ' ' . $c['cliente_nome']);
        fct_sincronizar($tid, (int) $c['id']);   /* v1.25.0: mensalidades futuras sem baixa são canceladas */
        return ['id' => (int) $c['id']];
    },

    /* renovação: nova data de fim e, se houver, novo valor (reajuste). Gera versão. */
    'renovar' => function ($d) {
        $u = exigir_perfil('admin');
        $tid = tenant();
        $c = ct_da_empresa($d['id'] ?? 0, $tid);
        if (!in_array($c['status'], ['Ativo', 'Suspenso', 'Encerrado'], true)) erro('Só contratos ativos ou encerrados podem ser renovados.');
        $fim = ct_data($d['fim'] ?? '', 'Novo fim');
        if (!$fim) erro('Informe a nova data de fim da vigência.');
        if ($c['fim'] && $fim <= $c['fim']) erro('A nova data de fim deve ser depois de ' . date('d/m/Y', strtotime($c['fim'])) . '.');
        $valor = ct_dinheiro($d['valorMensal'] ?? null, 'Novo valor mensal');
        if ($valor === null) $valor = $c['valor_mensal'] === null ? null : (float) $c['valor_mensal'];
        $nota = txt($d['nota'] ?? '', 500);
        db()->beginTransaction();
        q("UPDATE contratos SET fim = ?, valor_mensal = ?, status = 'Ativo', encerrado_em = NULL WHERE id = ? AND tenant_id = ?", [$fim, $valor, (int) $c['id'], $tid]);
        $txt = 'Renovado até ' . date('d/m/Y', strtotime($fim));
        if ($valor !== null && (float) $valor !== (float) $c['valor_mensal'])
            $txt .= ' · valor de R$ ' . number_format((float) $c['valor_mensal'], 2, ',', '.') . ' para R$ ' . number_format((float) $valor, 2, ',', '.');
        if ($nota !== '') $txt .= ' · ' . $nota;
        ct_evento($c['id'], 'renovacao', $txt);
        $c2 = ct_da_empresa($c['id'], $tid);
        ct_versionar($c2);
        db()->commit();
        auditar('contrato_renovar', 'contratos', (int) $c['id'], $txt);
        fct_sincronizar($tid, (int) $c['id']);   /* v1.25.0 */
        return ct_publico(ct_da_empresa($c['id'], $tid), $u);
    },

    /* ---------- acompanhamento ---------- */
    'eventos' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = ct_da_empresa($d['id'] ?? 0, $tid);
        return ['itens' => array_map(function ($e) {
            return ['id' => (int) $e['id'], 'tipo' => $e['tipo'], 'texto' => $e['texto'], 'retorno' => $e['retorno'],
                    'usuario' => $e['usuario_nome'], 'criadoEm' => $e['criado_em']];
        }, linhas("SELECT e.*, u.nome AS usuario_nome FROM contrato_eventos e LEFT JOIN usuarios u ON u.tenant_id = e.tenant_id AND u.id = e.usuario_id
                    WHERE e.tenant_id = ? AND e.contrato_id = ? ORDER BY e.id DESC LIMIT 200", [$tid, (int) $c['id']]))];
    },

    /* contato com o cliente: {id, texto, retorno?} — o retorno marcado vira o "próximo retorno" do contrato */
    'contato' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = ct_da_empresa($d['id'] ?? 0, $tid);
        $texto = txt($d['texto'] ?? '', 2000);
        $ret = ct_data($d['retorno'] ?? '', 'Retorno');
        if ($texto === '' && !$ret) erro('Escreva o que foi conversado ou marque a data de retorno.');
        ct_evento($c['id'], 'contato', $texto === '' ? null : $texto, $ret);
        q("UPDATE contratos SET proximo_retorno = ? WHERE id = ? AND tenant_id = ?", [$ret, (int) $c['id'], $tid]);
        return ['proximoRetorno' => $ret];
    },

    /* ---------- versões ---------- */
    'versoes' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $c = ct_da_empresa($d['id'] ?? 0, $tid);
        return ['itens' => array_map(function ($v) {
            return ['versao' => (int) $v['versao'], 'valorMensal' => $v['valor_mensal'] === null ? null : (float) $v['valor_mensal'],
                    'dados' => ct_json($v['dados']), 'criadoEm' => $v['criado_em'], 'usuario' => $v['usuario_nome']];
        }, linhas("SELECT v.*, u.nome AS usuario_nome FROM contrato_versoes v LEFT JOIN usuarios u ON u.tenant_id = v.tenant_id AND u.id = v.criado_por
                    WHERE v.tenant_id = ? AND v.contrato_id = ? ORDER BY v.versao DESC", [$tid, (int) $c['id']]))];
    },

    /* ---------- arquivos (contrato assinado, ART, aditivos…) ---------- */
    'arquivos' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = ct_da_empresa($d['id'] ?? 0, $tid);
        return ['itens' => array_map(function ($a) {
            return ['id' => (int) $a['id'], 'categoria' => $a['categoria'], 'nome' => $a['nome_original'], 'mime' => $a['mime'],
                    'tamanho' => (int) $a['tamanho'], 'criadoEm' => $a['criado_em'], 'usuario' => $a['usuario_nome']];
        }, linhas("SELECT a.*, u.nome AS usuario_nome FROM anexos a LEFT JOIN usuarios u ON u.tenant_id = a.tenant_id AND u.id = a.criado_por
                    WHERE a.tenant_id = ? AND a.dono_tipo = 'contrato' AND a.dono_id = ? AND a.excluido_em IS NULL ORDER BY a.id DESC", [$tid, (int) $c['id']]))];
    },

    /* upload (multipart): acao=contratos.arquivo.enviar, id, categoria, arquivo */
    'arquivo.enviar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = ct_da_empresa($d['id'] ?? 0, $tid);
        $cats = ['proposta' => 'Proposta', 'minuta' => 'Minuta', 'negociacao' => 'Negociação', 'assinado' => 'Contrato assinado', 'art' => 'ART', 'aditivo' => 'Aditivo', 'outro' => 'Outro'];
        $cat = isset($cats[$d['categoria'] ?? '']) ? $d['categoria'] : 'outro';
        $aid = salvar_anexo($_FILES['arquivo'] ?? null, 'contrato', (int) $c['id'], $cat, false, true);   /* v1.17.0: aceita Word/Excel */
        ct_evento($c['id'], 'arquivo', $cats[$cat] . ' anexado: ' . mb_substr((string) ($_FILES['arquivo']['name'] ?? ''), 0, 150));
        auditar('contrato_arquivo', 'contratos', (int) $c['id'], $cat);
        return ['id' => $aid];
    },

    'arquivo.excluir' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $a = linha("SELECT * FROM anexos WHERE id = ? AND tenant_id = ? AND dono_tipo = 'contrato' AND excluido_em IS NULL", [(int) ($d['arquivoId'] ?? 0), $tid]);
        if (!$a) erro('Arquivo não encontrado.', 404);
        q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [(int) $a['id'], $tid]);
        ct_evento($a['dono_id'], 'arquivo', 'Arquivo removido: ' . $a['nome_original']);
        return ['id' => (int) $a['id']];
    },

    /* ---------- PMOC: liga o contrato a um plano (cria o plano do ano se não houver) ---------- */
    'pmoc.ligar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = ct_da_empresa($d['id'] ?? 0, $tid);
        if (!in_array($c['status'], ['Ativo', 'Suspenso'], true)) erro('Ligue o PMOC depois que o contrato estiver ativo.');
        $ano = (int) ($d['ano'] ?? date('Y'));
        if ($ano < 2020 || $ano > 2100) erro('Ano inválido.');
        db()->beginTransaction();
        $p = linha("SELECT id, contrato_id FROM pmoc_planos WHERE tenant_id = ? AND cliente_id = ? AND ano = ? AND excluido_em IS NULL FOR UPDATE", [$tid, (int) $c['cliente_id'], $ano]);
        if ($p) {
            if ($p['contrato_id'] && (int) $p['contrato_id'] !== (int) $c['id']) erro('O plano PMOC de ' . $ano . ' deste cliente já está ligado a outro contrato.');
            q("UPDATE pmoc_planos SET contrato_id = ? WHERE id = ? AND tenant_id = ?", [(int) $c['id'], (int) $p['id'], $tid]);
            $pid = (int) $p['id'];
            ct_evento($c['id'], 'pmoc', 'Ligado ao plano PMOC ' . $ano);
        } else {
            $mes = $c['inicio'] && (int) substr($c['inicio'], 0, 4) === $ano ? (int) substr($c['inicio'], 5, 2) : 1;
            q("INSERT INTO pmoc_planos (tenant_id, cliente_id, contrato_id, ano, dados) VALUES (?, ?, ?, ?, ?)",
              [$tid, (int) $c['cliente_id'], (int) $c['id'], $ano, ct_enc(['mesInicio' => $mes, 'tecnicos' => [], 'equip' => [],
                     'frequencia' => ['Trimestral' => 'T', 'Semestral' => 'S', 'Anual' => 'A'][(string) ($c['periodicidade'] ?? '')] ?? 'M'])]);
            $pid = (int) db()->lastInsertId();
            ct_evento($c['id'], 'pmoc', 'Plano PMOC ' . $ano . ' criado (sem equipamentos — cadastre no módulo PMOC)');
            auditar('pmoc_plano_criar', 'pmoc_planos', $pid, $ano . ' via contrato ' . $c['numero']);
        }
        db()->commit();
        return ['planoId' => $pid, 'ano' => $ano];
    },

    /* chamado do tipo "Proposta de contrato" vira contrato (ou abre o que já existe) */
    'do_chamado' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $ch = linha("SELECT * FROM chamados WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['chamadoId'] ?? 0), $tid]);
        if (!$ch) erro('Chamado não encontrado.', 404);
        $ja = valor("SELECT id FROM contratos WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY id LIMIT 1", [$tid, (int) $ch['id']]);
        if ($ja) return ['id' => (int) $ja, 'novo' => false];
        db()->beginTransaction();
        $n = numero_livre('contrato', 'contratos', $tid);
        $val = (int) (valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'validade_orcamento'", [$tid]) ?: 15);
        q("INSERT INTO contratos (tenant_id, numero, cliente_id, chamado_id, com_quem_falar, responsavel_id, status, solicitado_em, validade_dias, obs, dados, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, 'Em elaboração', ?, ?, ?, ?, ?)",
          [$tid, $n, (int) $ch['cliente_id'], (int) $ch['id'], $ch['com_quem_falar'], $ch['responsavel_id'], $ch['aberto_em'], $val, $ch['obs'],
           ct_enc(['escopo' => (string) $ch['necessidade'], 'equipamentos' => []]), (int) $u['id']]);
        $id = (int) db()->lastInsertId();
        ct_evento($id, 'status', 'Contrato aberto a partir do chamado ' . $ch['numero']);
        db()->commit();
        auditar('contrato_criar', 'contratos', $id, 'nº ' . $n . ' do chamado ' . $ch['numero']);
        return ['id' => $id, 'novo' => true];
    },
];
