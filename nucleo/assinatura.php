<?php
/* =====================================================================
   SGClim — nucleo/assinatura.php  (v1.30.0 · v1.33.0)
   Assinatura de cada empresa: plano, teste grátis, cobrança no Asaas,
   aviso de atraso e modo de consulta (somente leitura).
   v1.33.0: cobrança só por Pix e só mensal (regras formaPagamento e
   permiteAnual); regra padrão de comissão para quem se cadastra sozinho.

   Situação gravada (assinaturas.situacao):
     teste     → período grátis (até teste_ate), sem cobrança criada ainda
     cortesia  → sem cobrança até teste_ate, combinado à parte (empresas do MVP); sem limite de usuários (v1.31.0)
     ativa     → assinatura criada no Asaas (paga ou aguardando pagamento)
     cancelada → cancelou; usa até pago_ate e depois fica só consulta
     isenta    → não paga (ex.: Konstante)
   Fase calculada na hora (assinatura_estado), sem depender de tarefa agendada:
     livre · isenta · teste · teste_fim · cortesia · cortesia_fim · ativa · atrasada · bloqueada · cancelada · encerrada
   Fases com leitura = true: teste_fim, cortesia_fim, bloqueada, encerrada.

   Sem o SQL 30 rodado, nada aqui restringe: tudo continua liberado.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once __DIR__ . '/asaas.php';

function assinatura_tabelas_ok() {
    static $ok = null;
    if ($ok !== null) return $ok;
    try { valor("SELECT 1 FROM assinaturas LIMIT 1"); valor("SELECT 1 FROM planos LIMIT 1"); $ok = true; }
    catch (Throwable $e) { $ok = false; }
    return $ok;
}

function assinatura_regras() {
    static $r = null;
    if ($r !== null) return $r;
    /* v1.33.0: formaPagamento PIX (só Pix) ou UNDEFINED (a pessoa escolhe Pix, boleto ou cartão na fatura);
       permiteAnual false = só mensal. Para liberar cartão e anual depois, basta mudar em Console › Assinaturas › Regras. */
    $r = ['diasTeste' => 14, 'diasBloqueio' => 10, 'planoTeste' => 'completo', 'formaPagamento' => 'PIX', 'permiteAnual' => false];
    try {
        $j = json_decode((string) valor("SELECT valor FROM plat_config WHERE chave = 'assinatura_regras'"), true);
        if (is_array($j)) $r = array_merge($r, array_intersect_key($j, $r));
    } catch (Throwable $e) {}
    $r['diasTeste'] = max(0, (int) $r['diasTeste']);
    $r['diasBloqueio'] = max(0, (int) $r['diasBloqueio']);
    $r['formaPagamento'] = $r['formaPagamento'] === 'UNDEFINED' ? 'UNDEFINED' : 'PIX';
    $r['permiteAnual'] = !empty($r['permiteAnual']);
    return $r;
}

/* ---------- planos ---------- */

function plano_por_id($id) { return $id ? linha("SELECT * FROM planos WHERE id = ?", [(int) $id]) : null; }
function plano_por_chave($c) { return linha("SELECT * FROM planos WHERE chave = ?", [(string) $c]); }
function plano_modulos($p) { return $p ? array_values(array_filter(array_map('trim', explode(',', (string) $p['modulos'])))) : []; }

/* v1.38.0: PREÇO DE LANÇAMENTO DESLIGADO para todas as empresas (decisão do Eneas, 12/11/2026): nesta fase não há
   desconto automático; desconto só por cupom criado no Console › Indicações e cupons, caso a caso.
   Os dados (planos_promo, assinatura_promos) ficam guardados: para religar no futuro, troque para true. */
const PRECO_LANCAMENTO = false;

/* v1.32.0: preço de lançamento do plano (null = sem promoção). $paraAssinar = só se ainda dá para assinar com ela */
function plano_promo($p, $paraAssinar = true) {
    static $ok = null;
    if (!$p || !PRECO_LANCAMENTO) return null;
    if ($ok === null) { try { valor("SELECT 1 FROM planos_promo LIMIT 1"); valor("SELECT 1 FROM assinatura_promos LIMIT 1"); $ok = true; } catch (Throwable $e) { $ok = false; } }
    if (!$ok) return null;
    $r = linha("SELECT * FROM planos_promo WHERE plano_id = ?", [(int) $p['id']]);
    if (!$r) return null;
    if ($paraAssinar && ((int) $r['ativo'] !== 1 || ($r['ate'] && $r['ate'] < date('Y-m-d')))) return null;
    return $r;
}

function plano_publico($p) {
    if (!$p) return null;
    $mensal = (float) $p['preco_mensal'];
    $pr = plano_promo($p);
    $prRaw = plano_promo($p, false);
    return [
        'promo' => $pr ? ['precoMensal' => (float) $pr['preco_mensal'], 'precoAnual' => round((float) $pr['preco_mensal'] * (int) $p['meses_anual'], 2),
                          'meses' => (int) $pr['meses'], 'ate' => $pr['ate']] : null,
        'promoCadastro' => $prRaw ? ['precoMensal' => (float) $prRaw['preco_mensal'], 'meses' => (int) $prRaw['meses'], 'ate' => $prRaw['ate'], 'ativo' => (int) $prRaw['ativo'] === 1] : null,
        'id' => (int) $p['id'], 'chave' => $p['chave'], 'nome' => $p['nome'], 'descricao' => $p['descricao'],
        'precoMensal' => $mensal, 'mesesAnual' => (int) $p['meses_anual'], 'precoAnual' => round($mensal * (int) $p['meses_anual'], 2),
        'usuariosInclusos' => (int) $p['usuarios_inclusos'], 'precoUsuarioExtra' => (float) $p['preco_usuario_extra'],
        'modulos' => plano_modulos($p), 'ativo' => (int) $p['ativo'] === 1, 'ordem' => (int) $p['ordem'],
        'itens' => planos_itens()[(string) $p['id']] ?? null,   /* v1.38.0: lista escrita no Console (null = automática) */
    ];
}

/* v1.38.0: itens que aparecem no cartão do plano, escritos no Console › Planos (plat_config 'planos_itens' = {id: [linhas]}).
   Só texto de venda: o que a empresa pode usar continua decidido pelos módulos do plano. */
function planos_itens($recarregar = false) {
    static $c = null;
    if ($c !== null && !$recarregar) return $c;
    $c = [];
    try { $j = json_decode((string) valor("SELECT valor FROM plat_config WHERE chave = 'planos_itens'"), true); if (is_array($j)) $c = $j; } catch (Throwable $e) {}
    return $c;
}

/* valor por ciclo (mensal ou anual) */
function assinatura_valor($p, $ciclo, $extras) {
    $mensal = (float) $p['preco_mensal'] + max(0, (int) $extras) * (float) $p['preco_usuario_extra'];
    return round($ciclo === 'anual' ? $mensal * (int) $p['meses_anual'] : $mensal, 2);
}

/* ---------- assinatura da empresa ---------- */

function assinatura_linha($tid) {
    if (!assinatura_tabelas_ok()) return null;
    return linha("SELECT * FROM assinaturas WHERE tenant_id = ?", [(int) $tid]);
}

/* empresa nova: começa o teste grátis */
function assinatura_criar_teste($tid) {
    if (!assinatura_tabelas_ok()) return;
    $r = assinatura_regras();
    $p = plano_por_chave($r['planoTeste']);
    q("INSERT IGNORE INTO assinaturas (tenant_id, situacao, plano_id, teste_ate) VALUES (?, 'teste', ?, DATE_ADD(CURDATE(), INTERVAL ? DAY))",
      [(int) $tid, $p ? (int) $p['id'] : null, $r['diasTeste']]);
}

/* pessoas que contam no limite do plano: usuários ativos da equipe (cliente do portal não conta) */
function usuarios_internos_ativos($tid, $excetoId = 0) {
    return (int) valor("SELECT COUNT(*) FROM usuarios WHERE tenant_id = ? AND status = 'ativo' AND excluido_em IS NULL AND perfil <> 'cliente' AND id <> ?",
                       [(int) $tid, (int) $excetoId]);
}

function dias_entre($de, $ate) { return (int) floor((strtotime($ate . ' 12:00') - strtotime($de . ' 12:00')) / 86400); }

/* tudo o que o sistema precisa saber da assinatura, calculado na hora */
function assinatura_estado($tid, $recarregar = false) {
    static $cache = [];
    $tid = (int) $tid;
    if (!$recarregar && isset($cache[$tid])) return $cache[$tid];
    $a = assinatura_linha($tid);
    $hoje = date('Y-m-d');
    $e = ['fase' => 'livre', 'leitura' => false, 'situacao' => null, 'plano' => null, 'modulos' => null, 'ciclo' => 'mensal',
          'extras' => 0, 'valor' => null, 'testeAte' => null, 'diasTeste' => null, 'atrasoDias' => 0, 'diasParaBloqueio' => null,
          'vencidaDesde' => null, 'proxima' => null, 'aberta' => null, 'pagoAte' => null, 'limiteUsuarios' => null,
          'temAssinatura' => false];
    if (!$a) return $cache[$tid] = $e;

    $r = assinatura_regras();
    $p = plano_por_id($a['plano_id']);
    $e['situacao'] = $a['situacao'];
    $e['plano'] = plano_publico($p);
    $e['ciclo'] = $a['ciclo'] === 'anual' ? 'anual' : 'mensal';
    $e['extras'] = (int) $a['usuarios_extras'];
    $e['valor'] = $a['valor'] !== null ? (float) $a['valor'] : null;
    $e['testeAte'] = $a['teste_ate'];
    $e['pagoAte'] = $a['pago_ate'];
    $e['temAssinatura'] = !empty($a['asaas_assinatura']) && $a['situacao'] === 'ativa';
    if ($a['situacao'] === 'isenta') { $e['fase'] = 'isenta'; return $cache[$tid] = $e; }

    $e['modulos'] = $p ? plano_modulos($p) : null;
    $e['limiteUsuarios'] = $p ? (int) $p['usuarios_inclusos'] + (int) $a['usuarios_extras'] : null;

    /* cobranças em aberto: a mais antiga vencida decide o atraso; a próxima é a que a pessoa paga */
    $abertas = [];
    try {
        $abertas = linhas("SELECT * FROM assinatura_cobrancas WHERE tenant_id = ? AND status IN ('" . implode("','", ASAAS_ABERTOS) . "') ORDER BY vencimento", [$tid]);
    } catch (Throwable $x) {}
    if ($abertas) {
        $c = $abertas[0];
        $e['aberta'] = ['id' => $c['id'], 'vencimento' => $c['vencimento'], 'valor' => (float) $c['valor'], 'link' => $c['link'], 'status' => $c['status']];
        $e['proxima'] = $e['aberta'];
    }

    if ($a['situacao'] === 'teste' || $a['situacao'] === 'cortesia') {
        $falta = $a['teste_ate'] ? dias_entre($hoje, $a['teste_ate']) : -1;
        $e['diasTeste'] = max(0, $falta);   /* 0 = último dia */
        $f = $a['situacao'];                /* teste · cortesia */
        if ($f === 'cortesia') $e['limiteUsuarios'] = null;
        if ($falta >= 0) $e['fase'] = $f;
        else { $e['fase'] = $f . '_fim'; $e['leitura'] = true; }
        return $cache[$tid] = $e;
    }

    if ($a['situacao'] === 'cancelada') {
        if ($a['pago_ate'] && $a['pago_ate'] >= $hoje) $e['fase'] = 'cancelada';
        else { $e['fase'] = 'encerrada'; $e['leitura'] = true; }
        return $cache[$tid] = $e;
    }

    /* ativa */
    $e['fase'] = 'ativa';
    if ($a['teste_ate'] && $a['teste_ate'] >= $hoje) $e['diasTeste'] = dias_entre($hoje, $a['teste_ate']);   /* assinou durante o teste */
    if ($abertas && $abertas[0]['vencimento'] < $hoje) {
        $atraso = dias_entre($abertas[0]['vencimento'], $hoje);
        $e['atrasoDias'] = $atraso;
        $e['vencidaDesde'] = $abertas[0]['vencimento'];
        $e['diasParaBloqueio'] = max(0, $r['diasBloqueio'] - $atraso);
        if ($atraso >= $r['diasBloqueio']) { $e['fase'] = 'bloqueada'; $e['leitura'] = true; }
        else $e['fase'] = 'atrasada';
    }
    return $cache[$tid] = $e;
}

/* módulos que o plano libera (null = sem restrição de plano) */
function assinatura_modulos($tid) {
    try { return assinatura_estado($tid)['modulos']; } catch (Throwable $e) { return null; }
}

/* resumo que vai junto com a sessão (auth.eu) para o aviso no topo */
function assinatura_resumo_sessao($tid, $admin) {
    try { $e = assinatura_estado($tid); } catch (Throwable $x) { return null; }
    if ($e['fase'] === 'livre' || $e['fase'] === 'isenta') return ['fase' => $e['fase'], 'leitura' => false];
    return [
        'fase' => $e['fase'], 'leitura' => $e['leitura'], 'plano' => $e['plano'] ? $e['plano']['nome'] : null,
        'diasTeste' => $e['diasTeste'], 'testeAte' => $e['testeAte'], 'atrasoDias' => $e['atrasoDias'],
        'diasParaBloqueio' => $e['diasParaBloqueio'], 'vencidaDesde' => $e['vencidaDesde'], 'pagoAte' => $e['pagoAte'],
        'temAssinatura' => $e['temAssinatura'],
        'link' => $admin && $e['aberta'] ? $e['aberta']['link'] : null,
    ];
}

/* ---------- modo de consulta (somente leitura) ---------- */

/* o que continua funcionando com a assinatura em atraso: consultar, entrar, pagar e pedir ajuda */
const ASSIN_MODULOS_LIVRES = ['auth', 'assinatura', 'suporte', 'notificacoes'];
const ASSIN_LEITURAS = '/(^|\.)(listar|obter|opcoes|resumo|tudo|ler|painel|buscar|eventos|versoes|arquivos|fluxo|detalhe|dre|rentabilidade|pessoas|faturas|itens|historico|qr|excluidas|categorias|solicitacao|do_chamado|link_cadastro|abrir|estado)$/';
const ASSIN_LEITURAS_EXATAS = ['proposta.status', 'link.status'];

function assinatura_exigir_escrita($modulo, $acao) {
    if (defined('KPLAT') || defined('KPUB')) return;
    if (in_array($modulo, ASSIN_MODULOS_LIVRES, true)) return;
    if (preg_match(ASSIN_LEITURAS, $acao) || in_array($acao, ASSIN_LEITURAS_EXATAS, true)) return;
    $u = eu(false);
    if (!$u) return;
    try { $e = assinatura_estado((int) $u['tenant_id']); } catch (Throwable $x) { return; }
    if (!$e['leitura']) return;
    $msg = $e['fase'] === 'cortesia_fim' ? 'O período sem cobrança combinado terminou. O sistema está em modo de consulta até a assinatura ser feita.'
         : ($e['fase'] === 'teste_fim' ? 'O período de teste terminou. O sistema está em modo de consulta até a assinatura ser feita.'
         : ($e['fase'] === 'encerrada' ? 'A assinatura foi cancelada. O sistema está em modo de consulta.'
         : 'A assinatura está com pagamento em atraso. O sistema está em modo de consulta até o pagamento ser confirmado.'));
    if (!tem_perfil($u, 'admin')) $msg .= ' Fale com o administrador da sua empresa.';
    erro($msg, 402, 'SOMENTE_LEITURA');
}

/* limite de usuários do plano (chamado ao criar ou ativar usuário da equipe) */
function assinatura_conferir_limite($tid, $excetoId = 0) {
    try { $e = assinatura_estado($tid); } catch (Throwable $x) { return; }
    if ($e['limiteUsuarios'] === null) return;
    if (usuarios_internos_ativos($tid, $excetoId) + 1 > $e['limiteUsuarios'])
        erro('O plano ' . ($e['plano']['nome'] ?? '') . ' permite ' . $e['limiteUsuarios'] . ' usuários ativos na equipe. ' .
             'Inative alguém ou acrescente usuários em Configurações › Assinatura.', 402, 'LIMITE_USUARIOS');
}

/* ---------- cobranças (espelho do Asaas) ---------- */

/* $pg = objeto payment do Asaas */
function assinatura_gravar_cobranca($tid, $pg) {
    if (empty($pg['id']) || empty($pg['dueDate'])) return;
    $status = !empty($pg['deleted']) ? 'DELETED' : (string) ($pg['status'] ?? 'PENDING');
    $pago = $pg['paymentDate'] ?? ($pg['clientPaymentDate'] ?? ($pg['confirmedDate'] ?? null));
    q("INSERT INTO assinatura_cobrancas (id, tenant_id, assinatura, valor, vencimento, status, forma, link, pago_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE assinatura = VALUES(assinatura), valor = VALUES(valor), vencimento = VALUES(vencimento), status = VALUES(status),
                               forma = VALUES(forma), link = COALESCE(VALUES(link), link), pago_em = VALUES(pago_em)",
      [(string) $pg['id'], (int) $tid, $pg['subscription'] ?? null, (float) ($pg['value'] ?? 0), substr((string) $pg['dueDate'], 0, 10),
       $status, $pg['billingType'] ?? null, $pg['invoiceUrl'] ?? null, $pago ? substr((string) $pago, 0, 10) : null]);
}

/* busca no Asaas as cobranças da assinatura e atualiza o espelho */
function assinatura_sincronizar($tid) {
    $a = assinatura_linha($tid);
    if (!$a || empty($a['asaas_assinatura']) || !asaas_configurado()) return false;
    $r = asaas('GET', '/subscriptions/' . rawurlencode($a['asaas_assinatura']) . '/payments?limit=100');
    $forma = assinatura_regras()['formaPagamento'];
    $trocar = false;
    foreach (($r['data'] ?? []) as $pg) {
        assinatura_gravar_cobranca($tid, $pg); assinatura_pos_pagamento($tid, $pg);
        /* v1.33.0: fatura em aberto com outra forma (assinatura feita antes da regra "só Pix") */
        if ($forma === 'PIX' && in_array((string) ($pg['status'] ?? ''), ASAAS_ABERTOS, true) && ($pg['billingType'] ?? 'PIX') !== 'PIX') $trocar = true;
    }
    if ($trocar) {
        try {
            asaas('PUT', '/subscriptions/' . rawurlencode($a['asaas_assinatura']), ['billingType' => 'PIX', 'updatePendingPayments' => true]);
            auditar('assinatura_pix', 'assinaturas', (int) $tid, 'cobrança passou para Pix', (int) $tid);
            $r = asaas('GET', '/subscriptions/' . rawurlencode($a['asaas_assinatura']) . '/payments?limit=100');
            foreach (($r['data'] ?? []) as $pg) assinatura_gravar_cobranca($tid, $pg);
        } catch (Throwable $x) { error_log('[assinatura pix] ' . $x->getMessage()); }
    }
    q("UPDATE assinaturas SET sincronizado_em = NOW() WHERE tenant_id = ?", [(int) $tid]);
    assinatura_estado($tid, true);
    return true;
}

/* depois do último pagamento confirmado, até quando a empresa já pagou */
function assinatura_pago_ate($tid, $ciclo) {
    $v = valor("SELECT MAX(vencimento) FROM assinatura_cobrancas WHERE tenant_id = ? AND status IN ('" . implode("','", ASAAS_PAGOS) . "')", [(int) $tid]);
    if (!$v) return null;
    return date('Y-m-d', strtotime($v . ($ciclo === 'anual' ? ' +1 year' : ' +1 month') . ' -1 day'));
}

function assinatura_descricao($p, $ciclo, $extras) {
    $usu = (int) $p['usuarios_inclusos'] + (int) $extras;
    return 'SGClim · Plano ' . $p['nome'] . ' · ' . ($ciclo === 'anual' ? 'anual' : 'mensal') . ' · até ' . $usu . ' usuários';
}

/* avisa os administradores da empresa (sino e celular) */
function assinatura_avisar_admins($tid, $titulo, $texto) {
    try {
        require_once __DIR__ . '/notificacoes.php';
        $ids = array_column(linhas("SELECT id FROM usuarios WHERE tenant_id = ? AND perfil = 'admin' AND status = 'ativo' AND excluido_em IS NULL", [(int) $tid]), 'id');
        if ($ids) notificar((int) $tid, $ids, $titulo, $texto, 'url:' . BASE_PATH . '#/assinatura', 'assinatura');
    } catch (Throwable $e) {}
}

function assin_digitos($s) { return preg_replace('/\D+/', '', (string) $s); }

/* =====================================================================
   v1.31.0 — indicações (comissão para quem indica) e cupons de campanha
   ===================================================================== */

function indicacao_tabelas_ok() {
    static $ok = null;
    if ($ok !== null) return $ok;
    try { valor("SELECT 1 FROM assinatura_vinculos LIMIT 1"); valor("SELECT 1 FROM cupons LIMIT 1"); valor("SELECT 1 FROM indicadores LIMIT 1"); $ok = true; }
    catch (Throwable $e) { $ok = false; }
    return $ok;
}

function codigo_limpo($c) { return mb_strtoupper(preg_replace('/[^A-Za-z0-9_-]/', '', (string) $c)); }

/* v1.33.0: colunas novas do indicador (SQL 34) */
function indicacao_sql34_ok() {
    static $ok = null;
    if ($ok !== null) return $ok;
    try { valor("SELECT pix_tipo FROM indicadores LIMIT 1"); $ok = true; } catch (Throwable $e) { $ok = false; }
    return $ok;
}

/* v1.33.0: comissão de quem se cadastra sozinho em /indique/ (Console › Indicações › Regra padrão) */
function indicacao_padrao() {
    $r = ['percentual' => 10.0, 'meses' => 3];
    try {
        $j = json_decode((string) valor("SELECT valor FROM plat_config WHERE chave = 'indicacao_padrao'"), true);
        if (is_array($j)) $r = array_merge($r, array_intersect_key($j, $r));
    } catch (Throwable $e) {}
    $r['percentual'] = max(0.01, min(100, round((float) $r['percentual'], 2)));
    $r['meses'] = max(0, (int) $r['meses']);
    return $r;
}

/* "10% das 3 primeiras faturas pagas" */
function indicacao_regra_txt($i) {
    if (($i['tipo'] ?? 'percentual') === 'fixo') return 'R$ ' . number_format((float) $i['valor_fixo'], 2, ',', '.') . ' por empresa que pagar a 1ª fatura';
    $pct = rtrim(rtrim(number_format((float) $i['percentual'], 2, ',', ''), '0'), ',') . '%';
    $n = (int) $i['meses'];
    return $pct . ($n === 0 ? ' de todas as faturas pagas' : ($n === 1 ? ' da 1ª fatura paga' : ' das ' . $n . ' primeiras faturas pagas')) . ' de cada empresa indicada';
}

/* código livre entre indicadores e cupons (sem lançar erro) */
function codigo_disponivel($codigo) {
    return !valor("SELECT id FROM indicadores WHERE codigo = ?", [$codigo]) && !valor("SELECT id FROM cupons WHERE codigo = ?", [$codigo]);
}

/* gera código a partir do primeiro nome: JOAO47, MARIA203… */
function codigo_gerar($nome) {
    $base = mb_strtoupper(preg_replace('/[^A-Za-z]/', '', (string) iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', preg_replace('/\s.*/u', '', trim((string) $nome)))));
    $base = substr($base ?: 'SGCLIM', 0, 12);
    if (strlen($base) < 3) $base .= 'IND';
    for ($i = 0; $i < 40; $i++) {
        $c = $base . ($i < 20 ? random_int(10, 99) : random_int(100, 9999));
        if (codigo_disponivel($c)) return $c;
    }
    return $base . strtoupper(bin2hex(random_bytes(3)));
}

function vinculo_de($tid) {
    if (!indicacao_tabelas_ok()) return null;
    return linha("SELECT * FROM assinatura_vinculos WHERE tenant_id = ?", [(int) $tid]);
}

function vinculo_gravar($tid, $campos) {
    if (!indicacao_tabelas_ok()) return;
    q("INSERT IGNORE INTO assinatura_vinculos (tenant_id) VALUES (?)", [(int) $tid]);
    $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
    q("UPDATE assinatura_vinculos SET $set WHERE tenant_id = ?", array_merge(array_values($campos), [(int) $tid]));
}

/* o que um código digitado significa: indicador (comissão para quem indicou) ou cupom (desconto) */
function codigo_resolver($codigo) {
    $c = codigo_limpo($codigo);
    if ($c === '' || !indicacao_tabelas_ok()) return null;
    $i = linha("SELECT * FROM indicadores WHERE codigo = ? AND ativo = 1", [$c]);
    if ($i) return ['tipo' => 'indicador', 'linha' => $i];
    $k = linha("SELECT * FROM cupons WHERE codigo = ?", [$c]);
    if ($k) return ['tipo' => 'cupom', 'linha' => $k];
    return null;
}

/* confere se o cupom vale agora para o plano; devolve mensagem de erro ou null */
function cupom_problema($k, $plano) {
    if ((int) $k['ativo'] !== 1) return 'Este cupom não está mais ativo.';
    if ($k['validade'] && $k['validade'] < date('Y-m-d')) return 'Este cupom venceu em ' . date('d/m/Y', strtotime($k['validade'])) . '.';
    if ($k['limite'] !== null && (int) $k['usos'] >= (int) $k['limite']) return 'Este cupom já atingiu o limite de usos.';
    $pl = array_filter(array_map('trim', explode(',', (string) $k['planos'])));
    if ($pl && $plano && !in_array($plano['chave'], $pl, true)) return 'Este cupom não vale para o plano ' . $plano['nome'] . '.';
    return null;
}

function cupom_texto($k) {
    $v = $k['tipo'] === 'valor' ? 'R$ ' . number_format((float) $k['valor'], 2, ',', '.') . ' de desconto' : rtrim(rtrim(number_format((float) $k['valor'], 2, ',', ''), '0'), ',') . '% de desconto';
    $n = (int) $k['faturas'];
    return $v . ($n === 0 ? ' em todas as faturas' : ($n === 1 ? ' na 1ª fatura' : ' nas ' . $n . ' primeiras faturas'));
}

function cupom_aplicar_valor($valor, $k) {
    $d = $k['tipo'] === 'valor' ? (float) $k['valor'] : round($valor * (float) $k['valor'] / 100, 2);
    return round(max(5, $valor - $d), 2);   /* o Asaas não cobra menos de R$ 5,00 */
}

/* cupom ainda valendo para a empresa (null = sem desconto agora) */
function cupom_ativo_de($tid) {
    $v = vinculo_de($tid);
    if (!$v || !$v['cupom_id'] || (int) $v['cupom_encerrado'] === 1) return null;
    return linha("SELECT * FROM cupons WHERE id = ?", [(int) $v['cupom_id']]);
}

/* valor da assinatura levando em conta o cupom em vigor */
function assinatura_valor_final($tid, $p, $ciclo, $extras) {
    $pr = promo_em_vigor($tid) ? plano_promo($p, false) : null;   /* v1.32.0: preço de lançamento */
    if ($pr) {
        $mensal = (float) $pr['preco_mensal'] + max(0, (int) $extras) * (float) $p['preco_usuario_extra'];
        return round($ciclo === 'anual' ? $mensal * (int) $p['meses_anual'] : $mensal, 2);
    }
    $valor = assinatura_valor($p, $ciclo, $extras);
    $k = cupom_ativo_de($tid);
    return $k ? cupom_aplicar_valor($valor, $k) : $valor;
}

/* ---------- v1.32.0: preço de lançamento por empresa ---------- */

function promo_linha($tid) {
    try { return linha("SELECT * FROM assinatura_promos WHERE tenant_id = ?", [(int) $tid]); } catch (Throwable $e) { return null; }
}
function promo_em_vigor($tid) { if (!PRECO_LANCAMENTO) return false; $r = promo_linha($tid); return $r && (int) $r['encerrado'] !== 1; }

/* ao assinar: se o plano tem preço de lançamento e a empresa ainda não usou, começa a promoção */
function promo_iniciar($tid, $p, $ciclo) {
    if (!PRECO_LANCAMENTO) return false;
    $pr = plano_promo($p);
    if (!$pr || promo_linha($tid)) return false;
    $faturas = $ciclo === 'anual' ? max(1, (int) ceil((int) $pr['meses'] / 12)) : max(1, (int) $pr['meses']);
    q("INSERT IGNORE INTO assinatura_promos (tenant_id, faturas) VALUES (?, ?)", [(int) $tid, $faturas]);
    return true;
}

function faturas_pagas($tid) {
    return linhas("SELECT id, vencimento, valor FROM assinatura_cobrancas WHERE tenant_id = ? AND status IN ('" . implode("','", ASAAS_PAGOS) . "') ORDER BY vencimento, id", [(int) $tid]);
}

/* depois de cada pagamento confirmado (webhook ou sincronização): comissão e fim do cupom.
   Pode ser chamado várias vezes para o mesmo pagamento: não duplica nada. */
function assinatura_pos_pagamento($tid, $pg) {
    if (empty($pg['id'])) return;
    $status = !empty($pg['deleted']) ? 'DELETED' : (string) ($pg['status'] ?? '');
    try {
        /* estorno ou contestação: comissão ainda não paga é cancelada */
        if (in_array($status, ['REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'DELETED'], true)) {
            if (indicacao_tabelas_ok()) q("UPDATE comissoes SET status = 'cancelada' WHERE cobranca_id = ? AND status = 'pendente'", [(string) $pg['id']]);
            return;
        }
        if (!in_array($status, ASAAS_PAGOS, true)) return;
        $v = vinculo_de($tid) ?: ['indicador_id' => null];
        $pagas = faturas_pagas($tid);
        $pos = 0;
        foreach ($pagas as $i => $f) if ($f['id'] === (string) $pg['id']) $pos = $i + 1;
        if (!$pos) return;

        /* comissão de quem indicou */
        if (!empty($v['indicador_id']) && indicacao_tabelas_ok()) {
            $ind = linha("SELECT * FROM indicadores WHERE id = ?", [(int) $v['indicador_id']]);
            if ($ind && (int) $ind['ativo'] === 1) {
                $base = (float) ($pg['value'] ?? 0);
                $valor = 0;
                if ($ind['tipo'] === 'fixo') { if ($pos === 1) $valor = (float) $ind['valor_fixo']; }
                elseif ((int) $ind['meses'] === 0 || $pos <= (int) $ind['meses']) $valor = round($base * (float) $ind['percentual'] / 100, 2);
                if ($valor > 0)
                    q("INSERT IGNORE INTO comissoes (indicador_id, tenant_id, cobranca_id, base, valor) VALUES (?, ?, ?, ?, ?)",
                      [(int) $ind['id'], (int) $tid, (string) $pg['id'], $base, $valor]);
            }
        }

        /* v1.32.0: preço de lançamento: depois das N faturas, volta ao preço normal */
        $pm = PRECO_LANCAMENTO ? promo_linha($tid) : null;
        if ($pm && (int) $pm['encerrado'] !== 1 && count($pagas) >= (int) $pm['faturas']) {
            q("UPDATE assinatura_promos SET encerrado = 1 WHERE tenant_id = ?", [(int) $tid]);
            $a = assinatura_linha($tid);
            $p = $a ? plano_por_id($a['plano_id']) : null;
            if ($a && $p && $a['asaas_assinatura'] && $a['situacao'] === 'ativa') {
                $cheio = assinatura_valor($p, $a['ciclo'], $a['usuarios_extras']);
                asaas('PUT', '/subscriptions/' . rawurlencode($a['asaas_assinatura']),
                      ['value' => $cheio, 'description' => assinatura_descricao($p, $a['ciclo'], $a['usuarios_extras']), 'updatePendingPayments' => true]);
                q("UPDATE assinaturas SET valor = ? WHERE tenant_id = ?", [$cheio, (int) $tid]);
                auditar('promo_encerrada', 'assinaturas', (int) $tid, 'volta para R$ ' . number_format($cheio, 2, ',', '.'), (int) $tid);
            }
        }

        /* cupom: depois das N faturas com desconto, volta ao preço cheio no Asaas */
        $k = cupom_ativo_de($tid);
        if ($k && (int) $k['faturas'] > 0 && count($pagas) >= (int) $k['faturas']) {
            $a = assinatura_linha($tid);
            $p = $a ? plano_por_id($a['plano_id']) : null;
            vinculo_gravar($tid, ['cupom_encerrado' => 1]);
            if ($a && $p && $a['asaas_assinatura'] && $a['situacao'] === 'ativa') {
                $cheio = assinatura_valor($p, $a['ciclo'], $a['usuarios_extras']);
                asaas('PUT', '/subscriptions/' . rawurlencode($a['asaas_assinatura']),
                      ['value' => $cheio, 'description' => assinatura_descricao($p, $a['ciclo'], $a['usuarios_extras']), 'updatePendingPayments' => true]);
                q("UPDATE assinaturas SET valor = ? WHERE tenant_id = ?", [$cheio, (int) $tid]);
                auditar('cupom_encerrado', 'assinaturas', (int) $tid, $k['codigo'] . ' · volta para R$ ' . number_format($cheio, 2, ',', '.'), (int) $tid);
            }
        }
    } catch (Throwable $e) { error_log('[assinatura pos_pagamento] ' . $e->getMessage()); }
}
