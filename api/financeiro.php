<?php
/* =====================================================================
   KONSTANTE SaaS — api/financeiro.php  ·  ERP › Financeiro (v1.22.0 · v1.25.0: DRE, impostos, rentabilidade, contratos · v1.25.3: vínculo com chamado/contrato · v1.26.0: DRE no formato xFin, subcategorias)
   Ações com o prefixo "fin." (módulo liberável "erp").

   Regra central (não misturar previsto com realizado):
   • TÍTULO (fin_titulos) = conta a receber / a pagar = a PREVISÃO.
   • MOVIMENTO (fin_movimentos) = o que de fato entrou/saiu da conta = o REALIZADO.
     Baixa de título gera movimento; tarifa, ajuste e transferência são movimentos sem título.
   • Saldo da conta = saldo inicial + movimentos a partir da data do saldo inicial.
   • Saldo projetado = saldo de hoje + a receber − a pagar até a data escolhida.
   Nada é apagado: estorno marca excluido_em; título cancelado continua visível.
   Acesso: administrador e financeiro (perfis acumulados valem).
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once dirname(__DIR__) . '/nucleo/anexos.php';
require_once dirname(__DIR__) . '/nucleo/fin_chamados.php';   /* v1.23.0 */
require_once dirname(__DIR__) . '/nucleo/fin_contratos.php';  /* v1.25.0 */
date_default_timezone_set('America/Sao_Paulo');

const FIN_POR_PAGINA = 50;
const FIN_TIPOS_CONTA = ['banco' => 'Conta bancária', 'caixa' => 'Caixa (dinheiro)', 'cartao' => 'Cartão de crédito', 'aplicacao' => 'Aplicação'];
/* v1.26.0: mesmos códigos de antes (nenhum lançamento muda), nomes no formato do xFin.
   custo_direto = Custos e despesas VARIÁVEIS (entram antes da margem de contribuição)
   despesa_operacional = Custos e despesas FIXAS (depois da margem) */
const FIN_GRUPOS_DRE = [
    'receita_bruta' => 'Receita bruta', 'deducoes' => 'Deduções sobre vendas (impostos)', 'custo_direto' => 'Custos e despesas variáveis',
    'despesa_operacional' => 'Custos e despesas fixas', 'receita_financeira' => 'Receitas financeiras e não operacionais', 'despesa_financeira' => 'Despesas financeiras e não operacionais',
    'tributo_lucro' => 'IR e CSLL', 'fora_dre' => 'Não listar no DRE (só caixa)',
];
/* exemplos mostrados no cadastro da categoria */
const FIN_GRUPOS_DICA = [
    'receita_bruta' => 'Serviços, contratos de manutenção, obras.',
    'deducoes' => 'Impostos sobre a nota (DAS, ISS), descontos e cancelamentos.',
    'custo_direto' => 'Sobe e desce com o volume de serviço: materiais, peças, terceiros da obra, combustível do serviço, comissão/RT, taxa de cartão.',
    'despesa_operacional' => 'Existe mesmo sem serviço no mês: salários, pró-labore, aluguel, contador, sistemas, veículos, marketing.',
    'receita_financeira' => 'Rendimentos de aplicação, juros recebidos, venda de bem usado.',
    'despesa_financeira' => 'Tarifas bancárias, juros, multas, IOF.',
    'tributo_lucro' => 'IRPJ e CSLL (no Simples Nacional já estão dentro do DAS).',
    'fora_dre' => 'Mexe no caixa mas não é lucro nem prejuízo: transferências entre contas, retirada de lucros, empréstimo (entrada e pagamento do principal), compra de bem, aporte dos sócios.',
];
const FIN_FORMAS = ['Pix', 'Boleto', 'Transferência', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Débito automático', 'Cheque', 'Outro'];
const FIN_STATUS = ['aberto', 'parcial', 'quitado', 'cancelado'];

/* categorias que toda empresa recebe no primeiro acesso (editáveis) */
const FIN_CATEGORIAS_PADRAO = [
    ['receita', 'Serviços avulsos (chamados)', 'receita_bruta'],
    ['receita', 'Contratos de manutenção', 'receita_bruta'],
    ['receita', 'Outras receitas de serviço', 'receita_bruta'],
    ['receita', 'Rendimentos de aplicação', 'receita_financeira'],
    ['receita', 'Reembolsos recebidos', 'fora_dre'],
    ['receita', 'Aporte dos sócios / empréstimo recebido', 'fora_dre'],
    ['despesa', 'Impostos sobre faturamento (DAS / ISS)', 'deducoes'],
    ['despesa', 'Materiais e peças', 'custo_direto'],
    ['despesa', 'Mão de obra terceirizada', 'custo_direto'],
    ['despesa', 'RT / comissões', 'custo_direto'],
    ['despesa', 'Salários e encargos', 'despesa_operacional'],
    ['despesa', 'Combustível, pedágio e deslocamento', 'despesa_operacional'],
    ['despesa', 'Veículos (manutenção, seguro, IPVA)', 'despesa_operacional'],
    ['despesa', 'Aluguel e condomínio', 'despesa_operacional'],
    ['despesa', 'Ferramentas e equipamentos', 'despesa_operacional'],
    ['despesa', 'Software, telefone e internet', 'despesa_operacional'],
    ['despesa', 'Contabilidade e serviços', 'despesa_operacional'],
    ['despesa', 'Marketing', 'despesa_operacional'],
    ['despesa', 'Outras despesas', 'despesa_operacional'],
    ['despesa', 'Tarifas bancárias', 'despesa_financeira'],
    ['despesa', 'Juros e multas', 'despesa_financeira'],
    ['despesa', 'IRPJ / CSLL', 'tributo_lucro'],
    ['despesa', 'Retirada dos sócios (pró-labore / lucros)', 'fora_dre'],
    ['despesa', 'Pagamento de empréstimo', 'fora_dre'],
];

/* ---------------- auxiliares ---------------- */

function fin_u() { return exigir_perfil('admin', 'financeiro'); }

function fin_tabelas() {
    static $ok = null;
    if ($ok === null) { try { valor("SELECT 1 FROM fin_titulos LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
    if (!$ok) erro('O Financeiro ainda não foi instalado. Rode o SQL 16 (16_financeiro_perfis.sql) da versão 1.22.0.', 409, 'SQL16');
}

/* v1.26.3: empresa nova já nasce no modelo categoria (macro) › plano de contas, como no xFin.
   Os nomes "Serviços avulsos (chamados)" e "Contratos de manutenção" são os que o chamado e o contrato procuram. */
const FIN_PLANO_PADRAO = [
    ['receita', 'Receita com contratos', 'receita_bruta', ['Contratos de manutenção']],
    ['receita', 'Receita com serviços', 'receita_bruta', ['Serviços avulsos (chamados)', 'Outras receitas de serviço']],
    ['receita', 'Receitas financeiras', 'receita_financeira', ['Rendimentos de aplicação']],
    ['receita', 'Entradas fora do resultado', 'fora_dre', ['Aporte dos sócios', 'Empréstimo recebido', 'Reembolsos recebidos']],
    ['despesa', 'Impostos sobre vendas', 'deducoes', ['DAS / ISS']],
    ['despesa', 'Custos variáveis', 'custo_direto', ['Materiais e peças', 'Mão de obra terceirizada', 'Comissões / RT']],
    ['despesa', 'Gastos com pessoal', 'despesa_operacional', ['Salários', 'Encargos e benefícios', 'Pró-labore']],
    ['despesa', 'Despesa fixa', 'despesa_operacional', ['Aluguel', 'Contabilidade', 'Software, telefone e internet', 'Veículos', 'Combustível']],
    ['despesa', 'Gastos com marketing', 'despesa_operacional', ['Marketing']],
    ['despesa', 'Despesas financeiras', 'despesa_financeira', ['Tarifas bancárias', 'Juros e multas']],
    ['despesa', 'Saídas fora do resultado', 'fora_dre', ['Retirada de lucros', 'Pagamento de empréstimo', 'Compra de bens']],
];
function fin_padroes($tid) {
    if ((int) valor("SELECT COUNT(*) FROM fin_categorias WHERE tenant_id = ?", [$tid])) return;
    if (fin_tem_subcat() && fin_tem_codigo()) {
        foreach (FIN_PLANO_PADRAO as $i => [$tipo, $macro, $grupo, $planos]) {
            q("INSERT INTO fin_categorias (tenant_id, nome, tipo, grupo_dre, ordem, codigo) VALUES (?, ?, ?, ?, ?, ?)", [$tid, $macro, $tipo, $grupo, $i, $i + 1]);
            $pai = (int) db()->lastInsertId();
            foreach ($planos as $j => $nome)
                q("INSERT INTO fin_categorias (tenant_id, nome, tipo, grupo_dre, ordem, codigo, pai_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [$tid, $nome, $tipo, $grupo, $j, $j + 1, $pai]);
        }
        return;
    }
    foreach (FIN_CATEGORIAS_PADRAO as $i => [$tipo, $nome, $grupo])
        q("INSERT INTO fin_categorias (tenant_id, nome, tipo, grupo_dre, ordem) VALUES (?, ?, ?, ?, ?)", [$tid, $nome, $tipo, $grupo, $i]);
}

/* "1.234,56" · "1234.56" · 1234.56 → 1234.56 */
function fin_num($v) {
    if (is_int($v) || is_float($v)) return round((float) $v, 2);
    $s = preg_replace('/[^\d,.\-]/', '', (string) $v);
    if ($s === '' || $s === '-') return 0.0;
    if (strpos($s, ',') !== false) $s = str_replace(',', '.', str_replace('.', '', $s));
    elseif (preg_match('/^-?\d{1,3}(\.\d{3})+$/', $s)) $s = str_replace('.', '', $s);   /* "20.000" = vinte mil */
    return round((float) $s, 2);
}
function fin_valor($v, $rotulo = 'o valor') {
    $n = fin_num($v);
    if ($n <= 0) erro('Informe ' . $rotulo . ' (maior que zero).');
    if ($n > 99999999) erro('Valor alto demais.');
    return $n;
}
function fin_data($v, $obrigatoria, $rotulo = 'a data') {
    $v = trim((string) ($v ?? ''));
    if ($v === '') { if ($obrigatoria) erro('Informe ' . $rotulo . '.'); return null; }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) || !checkdate((int) substr($v, 5, 2), (int) substr($v, 8, 2), (int) substr($v, 0, 4))) erro('Data inválida em ' . $rotulo . '.');
    return $v;
}
function fin_br($n) { return 'R$ ' . number_format((float) $n, 2, ',', '.'); }
function fin_dbr($d) { return $d ? date('d/m/Y', strtotime($d)) : 'sem data'; }
function fin_hoje() { return date('Y-m-d'); }
function fin_id_da_empresa($tabela, $id, $tid, $rotulo) {
    $id = (int) $id;
    if (!$id) return null;
    if (!valor("SELECT id FROM $tabela WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid])) erro($rotulo . ' não encontrado(a).');
    return $id;
}

function fin_evento($tid, $tituloId, $tipo, $texto) {
    q("INSERT INTO fin_eventos (tenant_id, titulo_id, tipo, texto, usuario_id) VALUES (?, ?, ?, ?, ?)", [$tid, $tituloId, $tipo, mb_substr($texto, 0, 500), (int) eu()['id']]);
}

function fin_titulo_da_empresa($id, $tid) {
    $t = linha("SELECT * FROM fin_titulos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) $id, $tid]);
    if (!$t) erro('Lançamento não encontrado.', 404, 'NAO_ENCONTRADO');
    return $t;
}

/* soma das baixas → pago e situação do título */
function fin_recalcular($tid, $id) {
    $t = linha("SELECT * FROM fin_titulos WHERE id = ? AND tenant_id = ?", [$id, $tid]);
    if (!$t) return;
    $r = linha("SELECT COALESCE(SUM(ABS(valor)), 0) AS pago, MAX(data) AS ultima FROM fin_movimentos WHERE tenant_id = ? AND titulo_id = ? AND excluido_em IS NULL", [$tid, $id]);
    $pago = round((float) $r['pago'], 2);
    $st = $t['status'] === 'cancelado' ? 'cancelado' : ($pago >= (float) $t['valor'] - 0.004 ? 'quitado' : ($pago > 0 ? 'parcial' : 'aberto'));
    q("UPDATE fin_titulos SET pago = ?, status = ?, quitado_em = ? WHERE id = ? AND tenant_id = ?", [$pago, $st, $st === 'quitado' ? $r['ultima'] : null, $id, $tid]);
}

function fin_saldo_conta($tid, $c, $ate = null) {
    $ate = $ate ?: fin_hoje();
    $s = (float) valor("SELECT COALESCE(SUM(valor), 0) FROM fin_movimentos WHERE tenant_id = ? AND conta_id = ? AND excluido_em IS NULL AND data >= ? AND data <= ?",
                       [$tid, (int) $c['id'], $c['saldo_inicial_em'], $ate]);
    return round((float) $c['saldo_inicial'] + $s, 2);
}

function fin_conta_publica($tid, $c) {
    return ['id' => (int) $c['id'], 'nome' => $c['nome'], 'tipo' => $c['tipo'], 'tipoNome' => FIN_TIPOS_CONTA[$c['tipo']] ?? $c['tipo'],
            'banco' => $c['banco'], 'agencia' => $c['agencia'], 'numero' => $c['numero'],
            'saldoInicial' => (float) $c['saldo_inicial'], 'saldoInicialEm' => $c['saldo_inicial_em'], 'ativa' => (int) $c['ativa'] === 1,
            'integracao' => $c['integracao'], 'saldo' => fin_saldo_conta($tid, $c)] + fin_conta_cartao_publica($tid, $c);
}
/* v1.25.2: dados do cartão (limite, dias, fatura atual) */
function fin_conta_cartao_publica($tid, $c) {
    if ($c['tipo'] !== 'cartao' || !array_key_exists('dia_vencimento', $c)) return [];
    $o = ['limite' => $c['limite'] !== null ? (float) $c['limite'] : null, 'diaMelhorCompra' => $c['dia_melhor_compra'] !== null ? (int) $c['dia_melhor_compra'] : null,
          'diaVencimento' => $c['dia_vencimento'] !== null ? (int) $c['dia_vencimento'] : null];
    $saldo = fin_saldo_conta($tid, $c, '9999-12-31');   /* inclui parcelas futuras */
    $o['usado'] = round(max(0, -$saldo), 2);
    $o['disponivel'] = $o['limite'] !== null ? round($o['limite'] + min(0, $saldo), 2) : null;
    if (fin_cartao_ok($c)) {
        $hoje = fin_hoje();
        $k = fin_fatura_de($c, $hoje);
        $fs = fin_faturas_cartao($tid, $c);
        $o['faturaAtual'] = ['chave' => $k, 'vencimento' => fin_fatura_venc($c, $k), 'fechamento' => fin_fatura_fech($c, $k), 'saldo' => $fs[$k]['saldo'] ?? 0.0];
        $prox = null; foreach ($fs as $kk => $x) if ($x['saldo'] > 0.004 && $kk < $k) { $prox = ['chave' => $kk, 'vencimento' => $x['vencimento'], 'saldo' => $x['saldo']]; break; }
        $o['faturaFechada'] = $prox;   /* fatura já fechada ainda não paga */
    }
    return $o;
}

const FIN_SELECT_TITULO = "SELECT t.*, chm.numero AS chamado_numero, ctr.numero AS contrato_numero, cl.nome AS cliente_nome, f.nome AS fornecedor_nome, cat.nome AS categoria_nome, cen.nome AS centro_nome, ct.nome AS conta_nome,
                             (SELECT COUNT(*) FROM anexos a WHERE a.tenant_id = t.tenant_id AND a.dono_tipo = 'fin' AND a.dono_id = t.id AND a.excluido_em IS NULL) AS anexos_qtd
                           FROM fin_titulos t
                           LEFT JOIN clientes cl ON cl.tenant_id = t.tenant_id AND cl.id = t.cliente_id
                           LEFT JOIN fornecedores f ON f.tenant_id = t.tenant_id AND f.id = t.fornecedor_id
                           LEFT JOIN fin_categorias cat ON cat.tenant_id = t.tenant_id AND cat.id = t.categoria_id
                           LEFT JOIN fin_centros cen ON cen.tenant_id = t.tenant_id AND cen.id = t.centro_id
                           LEFT JOIN fin_contas ct ON ct.tenant_id = t.tenant_id AND ct.id = t.conta_id
                           LEFT JOIN chamados chm ON chm.tenant_id = t.tenant_id AND t.origem_tipo = 'chamado' AND chm.id = t.origem_id
                           LEFT JOIN contratos ctr ON ctr.tenant_id = t.tenant_id AND t.origem_tipo = 'contrato' AND ctr.id = t.origem_id";

function fin_titulo_publico($t) {
    $hoje = fin_hoje();
    $aberto = in_array($t['status'], ['aberto', 'parcial'], true);
    $saldo = round((float) $t['valor'] - (float) $t['pago'], 2);
    return [
        'id' => (int) $t['id'], 'tipo' => $t['tipo'], 'descricao' => $t['descricao'],
        'clienteId' => $t['cliente_id'] !== null ? (int) $t['cliente_id'] : null, 'fornecedorId' => $t['fornecedor_id'] !== null ? (int) $t['fornecedor_id'] : null,
        'pessoa' => $t['cliente_nome'] ?? $t['fornecedor_nome'] ?? null,
        'categoriaId' => $t['categoria_id'] !== null ? (int) $t['categoria_id'] : null, 'categoria' => $t['categoria_nome'] ?? null,
        'centroId' => $t['centro_id'] !== null ? (int) $t['centro_id'] : null, 'centro' => $t['centro_nome'] ?? null,
        'contaId' => $t['conta_id'] !== null ? (int) $t['conta_id'] : null, 'conta' => $t['conta_nome'] ?? null,
        'forma' => $t['forma'], 'valor' => (float) $t['valor'], 'pago' => (float) $t['pago'], 'saldo' => $aberto ? $saldo : 0.0,
        'competencia' => $t['competencia'], 'vencimento' => $t['vencimento'], 'status' => $t['status'],
        'vencido' => $aberto && $t['vencimento'] !== null && $t['vencimento'] < $hoje,
        'semVencimento' => $aberto && $t['vencimento'] === null,
        'quitadoEm' => $t['quitado_em'], 'parcela' => (int) $t['parcela'], 'parcelas' => (int) $t['parcelas'], 'grupo' => $t['grupo'],
        'origemTipo' => $t['origem_tipo'], 'origemId' => $t['origem_id'] !== null ? (int) $t['origem_id'] : null,
        'chamadoNumero' => isset($t['chamado_numero']) && $t['chamado_numero'] !== null ? (int) $t['chamado_numero'] : null,
        'contratoNumero' => isset($t['contrato_numero']) && $t['contrato_numero'] !== null ? (int) $t['contrato_numero'] : null,
        'importado' => strpos((string) $t['chave_origem'], ':imp') !== false,
        'comNota' => array_key_exists('com_nota', $t) && $t['com_nota'] !== null ? (int) $t['com_nota'] === 1 : null,
        'documento' => $t['documento'], 'obs' => $t['obs'], 'anexosQtd' => (int) ($t['anexos_qtd'] ?? 0),
        'vinculoTipo' => !empty($t['vinculo_tipo']) ? $t['vinculo_tipo'] : null, 'vinculoId' => !empty($t['vinculo_id']) ? (int) $t['vinculo_id'] : null,   /* v1.25.3 */
        'criadoEm' => $t['criado_em'],
    ];
}

/* v1.38.0: A pagar / A receber › Todos (e Pagos/Recebidos) com os movimentos avulsos junto.
   As duas fontes são ordenadas e paginadas juntas no banco (UNION), então nada pula nem repete entre páginas. */
function fin_listar_com_avulsos($tid, $tipo, $d, $fromTit, $pTit, $dataTit, $tot, $pagina, $de, $ate, $busca) {
    $vinc = fin_tem_vinculo();
    $wm = "m.tenant_id = ? AND m.tipo = 'avulso' AND m.titulo_id IS NULL AND m.excluido_em IS NULL AND m.valor " . ($tipo === 'pagar' ? '< 0' : '> 0');
    $pm = [$tid];
    if ($de) { $wm .= " AND m.data >= ?"; $pm[] = $de; }
    if ($ate) { $wm .= " AND m.data <= ?"; $pm[] = $ate; }
    foreach (['centroId' => 'm.centro_id', 'contaId' => 'm.conta_id'] as $k => $col)
        if (!empty($d[$k])) { $wm .= " AND $col = ?"; $pm[] = (int) $d[$k]; }
    if (!empty($d['categoriaId'])) $wm .= " AND m.categoria_id IN (" . fin_cat_ids($tid, $d['categoriaId']) . ")";
    if ($busca !== '') {
        $l = '%' . $busca . '%';
        $wm .= " AND (m.descricao LIKE ? OR cta.nome LIKE ?" . ($vinc && ctype_digit($busca) ? " OR (m.vinculo_tipo = 'chamado' AND m.vinculo_id IN (SELECT id FROM chamados WHERE tenant_id = m.tenant_id AND numero = ?))" : '') . ")";
        array_push($pm, $l, $l); if ($vinc && ctype_digit($busca)) $pm[] = (int) $busca;
    }
    $fromMov = " FROM fin_movimentos m LEFT JOIN fin_contas cta ON cta.tenant_id = m.tenant_id AND cta.id = m.conta_id WHERE $wm";
    $tm = linha("SELECT COUNT(*) AS n, COALESCE(SUM(ABS(m.valor)), 0) AS valor" . $fromMov, $pm);
    $chaves = linhas("SELECT o, id FROM (SELECT 't' AS o, t.id, $dataTit AS dt $fromTit UNION ALL SELECT 'm' AS o, m.id, m.data AS dt $fromMov) u
                       ORDER BY dt DESC, id DESC LIMIT " . FIN_POR_PAGINA . " OFFSET " . (($pagina - 1) * FIN_POR_PAGINA), array_merge($pTit, $pm));
    $idsT = []; $idsM = [];
    foreach ($chaves as $c) { if ($c['o'] === 't') $idsT[] = (int) $c['id']; else $idsM[] = (int) $c['id']; }
    $porT = []; $porM = [];
    if ($idsT) foreach (linhas(FIN_SELECT_TITULO . " WHERE t.tenant_id = ? AND t.id IN (" . implode(',', $idsT) . ")", [$tid]) as $t)
        $porT[(int) $t['id']] = array_merge(fin_titulo_publico($t), ['origem' => 'titulo']);
    if ($idsM) foreach (linhas("SELECT m.*, cta.nome AS conta_nome, cat.nome AS categoria_nome, cen.nome AS centro_nome" . ($vinc ? '' : ', NULL AS vinculo_tipo, NULL AS vinculo_id') . "
                                 FROM fin_movimentos m
                                 LEFT JOIN fin_contas cta ON cta.tenant_id = m.tenant_id AND cta.id = m.conta_id
                                 LEFT JOIN fin_categorias cat ON cat.tenant_id = m.tenant_id AND cat.id = m.categoria_id
                                 LEFT JOIN fin_centros cen ON cen.tenant_id = m.tenant_id AND cen.id = m.centro_id
                                WHERE m.tenant_id = ? AND m.id IN (" . implode(',', $idsM) . ")", [$tid]) as $m) {
        $v = (float) $m['valor'];
        $porM[(int) $m['id']] = ['origem' => 'movimento', 'id' => (int) $m['id'], 'tipo' => $v > 0 ? 'entrada' : 'saida', 'data' => $m['data'], 'valor' => abs($v),
            'descricao' => $m['descricao'], 'categoriaId' => $m['categoria_id'] !== null ? (int) $m['categoria_id'] : null, 'categoria' => $m['categoria_nome'],
            'centroId' => $m['centro_id'] !== null ? (int) $m['centro_id'] : null, 'centro' => $m['centro_nome'],
            'contaId' => (int) $m['conta_id'], 'conta' => $m['conta_nome'], 'conciliado' => (int) $m['conciliado'] === 1,
            'vinculoTipo' => !empty($m['vinculo_tipo']) ? $m['vinculo_tipo'] : null, 'vinculoId' => !empty($m['vinculo_id']) ? (int) $m['vinculo_id'] : null];
    }
    $itens = [];
    foreach ($chaves as $c) { $x = $c['o'] === 't' ? ($porT[(int) $c['id']] ?? null) : ($porM[(int) $c['id']] ?? null); if ($x) $itens[] = $x; }
    return ['itens' => fin_vinculos_rotular($tid, $itens), 'total' => (int) $tot['n'] + (int) $tm['n'], 'totalAvulsos' => (int) $tm['n'],
            'somaValor' => round((float) $tot['valor'] + (float) $tm['valor'], 2), 'somaSaldo' => round((float) $tot['saldo'], 2),
            'porPagina' => FIN_POR_PAGINA, 'pagina' => $pagina];
}

/* ---------------- v1.25.3: vínculo opcional com chamado ou contrato ---------------- */
/* Lançamentos (a pagar, a receber, tarifa/ajuste, compra no cartão, lançado do extrato) podem apontar para
   um chamado ou contrato. Não muda valor nem DRE; serve para a rentabilidade e para achar os lançamentos.
   Título gerado pelo próprio chamado/contrato (origem) já está ligado a ele e não usa estas colunas. */
function fin_tem_vinculo() {
    static $ok = null;
    if ($ok === null) { try { valor("SELECT vinculo_tipo FROM fin_titulos LIMIT 0"); valor("SELECT vinculo_tipo FROM fin_movimentos LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
    return $ok;
}
/* {vinculo: "chamado:ID" | "contrato:ID" | ""} → [tipo, id]. Novo vínculo só com chamado em aberto ou contrato ativo;
   o vínculo que o lançamento já tinha continua valendo mesmo depois que o chamado/contrato encerra. */
function fin_vinculo_ler($d, $tid, $atual = null, $encerrados = false) {
    $v = trim((string) ($d['vinculo'] ?? ''));
    if ($v === '' || $v === '0') return [null, null];
    if (!preg_match('/^(chamado|contrato):(\d+)$/', $v, $m)) erro('Vínculo inválido.');
    $tipo = $m[1]; $id = (int) $m[2];
    if ($atual && ($atual['vinculo_tipo'] ?? null) === $tipo && (int) ($atual['vinculo_id'] ?? 0) === $id) return [$tipo, $id];
    /* v1.37.0: ajuste feito pela Rentabilidade pode ligar a um serviço já concluído (acertar o custo de quem já terminou) */
    if ($encerrados) {
        $ok = $tipo === 'chamado'
            ? valor("SELECT id FROM chamados WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL AND status <> 'Não Aprovado'", [$id, $tid])
            : valor("SELECT id FROM contratos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
        if (!$ok) erro($tipo === 'chamado' ? 'Chamado não encontrado (ou não aprovado).' : 'Contrato não encontrado.');
        return [$tipo, $id];
    }
    if ($tipo === 'chamado') {
        if (!valor("SELECT id FROM chamados WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL AND status NOT IN ('Concluído','Não Aprovado')", [$id, $tid]))
            erro('Chamado não encontrado ou já encerrado (concluído ou não aprovado).');
    } elseif (!valor("SELECT id FROM contratos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL AND status = 'Ativo'", [$id, $tid]))
        erro('Contrato não encontrado ou não está ativo.');
    return [$tipo, $id];
}
/* nomes ("Chamado 612 · Cliente") para uma lista de títulos públicos */
function fin_vinculos_rotular($tid, array $itens) {
    $ids = ['chamado' => [], 'contrato' => []];
    foreach ($itens as $x) if (!empty($x['vinculoTipo']) && isset($ids[$x['vinculoTipo']])) $ids[$x['vinculoTipo']][(int) $x['vinculoId']] = 1;
    $rot = [];
    foreach (['chamado' => 'chamados', 'contrato' => 'contratos'] as $tp => $tab) {
        if (!$ids[$tp]) continue;
        foreach (linhas("SELECT x.id, x.numero, cl.nome FROM $tab x LEFT JOIN clientes cl ON cl.tenant_id = x.tenant_id AND cl.id = x.cliente_id
                          WHERE x.tenant_id = ? AND x.id IN (" . implode(',', array_map('intval', array_keys($ids[$tp]))) . ")", [$tid]) as $r)
            $rot[$tp . ':' . $r['id']] = ($tp === 'chamado' ? 'Chamado ' : 'Contrato ') . $r['numero'] . ($r['nome'] ? ' · ' . $r['nome'] : '');
    }
    foreach ($itens as &$x) if (!empty($x['vinculoTipo'])) $x['vinculo'] = $rot[$x['vinculoTipo'] . ':' . $x['vinculoId']] ?? (($x['vinculoTipo'] === 'chamado' ? 'Chamado' : 'Contrato') . ' (excluído)');
    unset($x);
    return $itens;
}
/* grava o vínculo num movimento avulso recém-criado (sem o SQL 21, ignora) */
function fin_vinculo_mov($tid, $movId, $vt, $vi) {
    if ($vt && fin_tem_vinculo()) q("UPDATE fin_movimentos SET vinculo_tipo = ?, vinculo_id = ? WHERE id = ? AND tenant_id = ?", [$vt, $vi, $movId, $tid]);
}

/* ---------------- v1.37.0: rentabilidade lançamento a lançamento ----------------
   A mesma regra para Cliente, Chamado, Contrato e para o detalhe:
   • receita  = contas a receber (competência) + entradas avulsas ligadas a chamado/contrato (data);
   • custo    = contas a pagar e saídas avulsas ligadas ao chamado/contrato, de categoria "custo direto";
   • despesa  = as mesmas, das outras categorias (deduções ficam de fora: imposto vem pela alíquota do mês);
   • estimado = custo + RT digitados no chamado ganho no período, SÓ quando nenhum custo foi lançado para ele
                (assim não conta duas vezes). */

/* alíquota efetiva de cada mês: guia apurada ÷ base; sem guia, a provisão */
function fin_rent_taxa($tid, $de, $ate, $cfg) {
    $pct = (float) $cfg['provisaoPct'] / 100;
    $taxa = [];
    foreach (fin_impostos_meses($tid, fin_meses_entre($de, $ate), $cfg) as $m => $im)
        $taxa[$m] = $im['base'] > 0 && $im['apurado'] !== null ? $im['apurado'] / $im['base'] : ($im['situacao'] === 'provisao' ? $pct : 0.0);
    return function ($m) use ($taxa, $pct) { return $taxa[$m] ?? $pct; };
}

/* lançamentos do período, um por linha, já com o serviço (chamado/contrato) e o cliente de cada um */
function fin_rent_itens($tid, $d1, $d2, $inOp, $tx) {
    $tem = fin_tem_vinculo();
    $cats = fin_cats_mapa($tid);
    $itens = [];
    foreach (linhas("SELECT t.id, t.tipo, t.valor, t.pago, t.status, t.descricao, t.competencia, DATE_FORMAT(t.competencia, '%Y-%m') AS mes, t.cliente_id, t.categoria_id,
                            t.origem_tipo, t.origem_id, " . ($tem ? "t.vinculo_tipo, t.vinculo_id" : "NULL AS vinculo_tipo, NULL AS vinculo_id") . ",
                            " . fin_sql_nota('t') . " AS nf, cl.nome AS cliente_nome, f.nome AS fornecedor_nome
                       FROM fin_titulos t LEFT JOIN clientes cl ON cl.tenant_id = t.tenant_id AND cl.id = t.cliente_id
                       LEFT JOIN fornecedores f ON f.tenant_id = t.tenant_id AND f.id = t.fornecedor_id
                      WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status <> 'cancelado' AND t.competencia BETWEEN ? AND ?
                        AND (t.categoria_id IS NULL OR t.categoria_id IN ($inOp))", [$tid, $d1, $d2]) as $t) {
        $gr = $t['categoria_id'] ? ($cats[(int) $t['categoria_id']][2] ?? null) : null;
        if ($gr === 'deducoes') continue;
        $xt = in_array($t['origem_tipo'], ['chamado', 'contrato'], true) ? $t['origem_tipo'] : ($t['vinculo_tipo'] ?: null);
        $xid = $xt ? (int) ($t['origem_tipo'] === $xt ? $t['origem_id'] : $t['vinculo_id']) : 0;
        $rec = $t['tipo'] === 'receber';
        $v = (float) $t['valor'];
        $itens[] = ['origem' => 'titulo', 'id' => (int) $t['id'], 'tipo' => $t['tipo'], 'data' => $t['competencia'], 'descricao' => $t['descricao'],
                    'pessoa' => $rec ? $t['cliente_nome'] : $t['fornecedor_nome'], 'categoria' => $t['categoria_id'] ? ($cats[(int) $t['categoria_id']][0] ?? null) : null,
                    'classe' => $rec ? 'receita' : ($gr === 'custo_direto' ? 'custo' : 'despesa'), 'valor' => $v,
                    'imposto' => $rec && ($gr === 'receita_bruta' || $gr === null) && (int) $t['nf'] === 1 ? $v * $tx($t['mes']) : 0.0,
                    'recebido' => $rec ? (float) $t['pago'] : 0.0, 'aberto' => $rec && in_array($t['status'], ['aberto', 'parcial'], true) ? $v - (float) $t['pago'] : 0.0,
                    'status' => $t['status'], 'xt' => $xt, 'xid' => $xid, 'clienteTitulo' => $t['cliente_id'] !== null ? (int) $t['cliente_id'] : null];
    }
    if ($tem) foreach (linhas("SELECT m.id, m.valor, m.data, m.descricao, m.categoria_id, m.centro_id, m.vinculo_tipo, m.vinculo_id, c.nome AS conta
                                 FROM fin_movimentos m LEFT JOIN fin_contas c ON c.tenant_id = m.tenant_id AND c.id = m.conta_id
                                WHERE m.tenant_id = ? AND m.vinculo_tipo IS NOT NULL AND m.titulo_id IS NULL AND m.excluido_em IS NULL AND m.data BETWEEN ? AND ?
                                  AND m.categoria_id IN ($inOp)", [$tid, $d1, $d2]) as $m) {
        $gr = $cats[(int) $m['categoria_id']][2] ?? null;
        if ($gr === 'deducoes') continue;
        $v = (float) $m['valor'];
        $itens[] = ['origem' => 'movimento', 'id' => (int) $m['id'], 'tipo' => $v > 0 ? 'entrada' : 'saida', 'data' => $m['data'], 'descricao' => $m['descricao'],
                    'pessoa' => $m['conta'], 'categoria' => $cats[(int) $m['categoria_id']][0] ?? null, 'categoriaId' => (int) $m['categoria_id'], 'centroId' => $m['centro_id'] !== null ? (int) $m['centro_id'] : null,
                    'classe' => $v > 0 ? 'receita' : ($gr === 'custo_direto' ? 'custo' : 'despesa'), 'valor' => abs($v), 'imposto' => 0.0,
                    'recebido' => $v > 0 ? $v : 0.0, 'aberto' => 0.0, 'status' => null, 'xt' => $m['vinculo_tipo'], 'xid' => (int) $m['vinculo_id'], 'clienteTitulo' => null];
    }
    /* nome do serviço e cliente de cada chamado/contrato */
    $refs = fin_rent_refs($tid, $itens);
    foreach ($itens as &$x) {
        $r = $x['xt'] ? ($refs[$x['xt'] . ':' . $x['xid']] ?? null) : null;
        $x['servico'] = $x['xt'] ? ($r ? $r['nome'] : ($x['xt'] === 'chamado' ? 'Chamado' : 'Contrato') . ' (excluído)') : null;
        $x['servicoSub'] = $r ? $r['sub'] : null;
        $x['servicoCurto'] = $r ? $r['curto'] : $x['servico'];
        /* cliente: a receber → o do lançamento; custo/despesa → o do serviço ligado (senão o do lançamento) */
        $x['clienteId'] = $x['tipo'] === 'receber' ? ($x['clienteTitulo'] ?? ($r ? $r['clienteId'] : null)) : ($r && $r['clienteId'] ? $r['clienteId'] : $x['clienteTitulo']);
        $x['clienteNome'] = null;
        unset($x['clienteTitulo']);
    }
    unset($x);
    $ids = [];
    foreach ($itens as $x) if ($x['clienteId']) $ids[(int) $x['clienteId']] = 1;
    $nomes = [];
    if ($ids) foreach (linhas("SELECT id, nome FROM clientes WHERE tenant_id = ? AND id IN (" . implode(',', array_keys($ids)) . ")", [$tid]) as $c) $nomes[(int) $c['id']] = $c['nome'];
    foreach ($itens as &$x) $x['clienteNome'] = $x['clienteId'] ? ($nomes[(int) $x['clienteId']] ?? 'Cliente excluído') : null;
    unset($x);
    return $itens;
}

/* "chamado:ID" / "contrato:ID" → nome, complemento, cliente */
function fin_rent_refs($tid, array $itens, array $extra = []) {
    $ids = ['chamado' => [], 'contrato' => []];
    foreach ($itens as $x) if ($x['xt'] && isset($ids[$x['xt']])) $ids[$x['xt']][(int) $x['xid']] = 1;
    foreach ($extra as $k) { [$a, $b] = explode(':', $k); $ids[$a][(int) $b] = 1; }
    $out = [];
    if ($ids['chamado']) foreach (linhas("SELECT x.id, x.numero, x.status, x.tipo_servico, x.cliente_id, cl.nome FROM chamados x LEFT JOIN clientes cl ON cl.tenant_id = x.tenant_id AND cl.id = x.cliente_id
                                           WHERE x.tenant_id = ? AND x.id IN (" . implode(',', array_keys($ids['chamado'])) . ")", [$tid]) as $r)
        $out['chamado:' . $r['id']] = ['nome' => 'Chamado ' . $r['numero'] . ($r['nome'] ? ' · ' . $r['nome'] : ''), 'curto' => 'Chamado ' . $r['numero'],
                                       'sub' => trim(($r['tipo_servico'] ?: '') . ' · ' . $r['status'], ' ·'), 'clienteId' => $r['cliente_id'] !== null ? (int) $r['cliente_id'] : null];
    if ($ids['contrato']) foreach (linhas("SELECT x.id, x.numero, x.status, x.valor_mensal, x.cliente_id, cl.nome FROM contratos x LEFT JOIN clientes cl ON cl.tenant_id = x.tenant_id AND cl.id = x.cliente_id
                                            WHERE x.tenant_id = ? AND x.id IN (" . implode(',', array_keys($ids['contrato'])) . ")", [$tid]) as $r)
        $out['contrato:' . $r['id']] = ['nome' => 'Contrato ' . $r['numero'] . ($r['nome'] ? ' · ' . $r['nome'] : ''), 'curto' => 'Contrato ' . $r['numero'],
                                        'sub' => $r['status'] . ($r['valor_mensal'] !== null ? ' · ' . fin_br($r['valor_mensal']) . '/mês' : ''), 'clienteId' => $r['cliente_id'] !== null ? (int) $r['cliente_id'] : null];
    return $out;
}

/* chamados ganhos no período com custo/RT digitado e NENHUM custo lançado para eles → custo estimado */
function fin_rent_estimados($tid, $d1, $d2) {
    $in = "'" . implode("','", FCH_GANHO) . "'";
    $tem = fin_tem_vinculo();
    $out = [];
    foreach (linhas("SELECT ch.id, ch.numero, ch.cliente_id, cl.nome, COALESCE(ch.custo, 0) + COALESCE(ch.rt, 0) AS est
                       FROM chamados ch LEFT JOIN clientes cl ON cl.tenant_id = ch.tenant_id AND cl.id = ch.cliente_id
                      WHERE ch.tenant_id = ? AND ch.excluido_em IS NULL AND ch.status IN ($in) AND ch.ganho_em BETWEEN ? AND ?
                        AND COALESCE(ch.custo, 0) + COALESCE(ch.rt, 0) > 0
                        AND NOT EXISTS (SELECT 1 FROM fin_titulos t WHERE t.tenant_id = ch.tenant_id AND t.tipo = 'pagar' AND t.excluido_em IS NULL AND t.status <> 'cancelado'
                                          AND ((t.origem_tipo = 'chamado' AND t.origem_id = ch.id)" . ($tem ? " OR (t.vinculo_tipo = 'chamado' AND t.vinculo_id = ch.id)" : "") . "))" .
                    ($tem ? " AND NOT EXISTS (SELECT 1 FROM fin_movimentos m WHERE m.tenant_id = ch.tenant_id AND m.vinculo_tipo = 'chamado' AND m.vinculo_id = ch.id
                                                AND m.titulo_id IS NULL AND m.excluido_em IS NULL AND m.valor < 0)" : ""), [$tid, $d1, $d2]) as $r)
        $out[] = ['xt' => 'chamado', 'xid' => (int) $r['id'], 'servico' => 'Chamado ' . $r['numero'] . ($r['nome'] ? ' · ' . $r['nome'] : ''),
                  'clienteId' => $r['cliente_id'] !== null ? (int) $r['cliente_id'] : null, 'clienteNome' => $r['nome'], 'valor' => round((float) $r['est'], 2)];
    return $out;
}

/* soma uma lista de lançamentos numa linha de rentabilidade */
function fin_rent_somar(array &$l, array $x) {
    $l['qtd']++;
    if ($x['classe'] === 'receita') { $l['receita'] += $x['valor']; $l['recebido'] += $x['recebido']; $l['aberto'] += $x['aberto']; $l['imposto'] += $x['imposto']; }
    elseif ($x['classe'] === 'custo') $l['custo'] += $x['valor'];
    else $l['despesa'] += $x['valor'];
}
function fin_rent_linha($k, $nome, $sub = null) {
    return ['k' => $k, 'nome' => $nome, 'sub' => $sub, 'qtd' => 0, 'receita' => 0.0, 'custo' => 0.0, 'estimado' => 0.0, 'imposto' => 0.0, 'despesa' => 0.0, 'recebido' => 0.0, 'aberto' => 0.0];
}
function fin_rent_fechar(array $x) {
    foreach (['receita', 'custo', 'estimado', 'imposto', 'despesa', 'recebido', 'aberto'] as $c) $x[$c] = round($x[$c] ?? 0, 2);
    $x['resultado'] = round($x['receita'] - $x['custo'] - $x['imposto'] - $x['despesa'], 2);
    $x['margem'] = $x['receita'] > 0 ? round($x['resultado'] / $x['receita'] * 100, 1) : null;
    return $x;
}

/* soma de títulos em aberto (saldo) com filtro extra */
function fin_soma_aberto($tid, $tipo, $extra = '', $par = []) {
    return round((float) valor("SELECT COALESCE(SUM(valor - pago), 0) FROM fin_titulos WHERE tenant_id = ? AND tipo = ? AND excluido_em IS NULL AND status IN ('aberto','parcial')" . $extra,
                               array_merge([$tid, $tipo], $par)), 2);
}

/* config do financeiro (config chave 'financeiro') */
function fin_config($tid) {
    $v = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'financeiro'", [$tid]);
    $c = $v === false ? [] : (json_decode((string) $v, true) ?: []);
    return array_merge(['provisaoPct' => 6.0, 'provisaoBase' => 'faturamento', 'avisoDias' => 3], $c);
}

/* ---------------- v1.24.0: caixa, recorrências, extrato ---------------- */

/* Movimentos que contam como CAIXA da empresa (visão consolidada):
   • só contas que não são cartão (compra no cartão não tira dinheiro do banco na hora);
   • transferência entre duas contas da empresa não conta; pagar a fatura do cartão (banco → cartão) conta como saída. */
function fin_sql_caixa($a = 'm') {
    return " AND $a.conta_id IN (SELECT cc.id FROM fin_contas cc WHERE cc.tenant_id = $a.tenant_id AND cc.tipo <> 'cartao')
             AND ($a.tipo <> 'transferencia' OR EXISTS (SELECT 1 FROM fin_movimentos xx JOIN fin_contas cx ON cx.tenant_id = xx.tenant_id AND cx.id = xx.conta_id
                  WHERE xx.tenant_id = $a.tenant_id AND xx.transferencia = $a.transferencia AND xx.id <> $a.id AND xx.excluido_em IS NULL AND cx.tipo = 'cartao'))";
}

function fin_tem_v124() {
    static $ok = null;
    if ($ok === null) { try { valor("SELECT 1 FROM fin_extrato LIMIT 0"); valor("SELECT 1 FROM fin_recorrencias LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
    return $ok;
}
function fin_exigir_v124() { if (!fin_tem_v124()) erro('Rode antes o SQL 17 (17_fluxo_conciliacao.sql) da versão 1.24.0.', 409, 'SQL17'); }

/* data da ocorrência k de uma recorrência (mesmo dia do início; mês curto = último dia) */
function fin_rec_data($inicio, $k, $meses) {
    [$y, $m, $dd] = array_map('intval', explode('-', $inicio));
    $t = $m - 1 + $k * $meses;
    $y += intdiv($t, 12); $m = $t % 12 + 1;
    $ult = (int) date('t', mktime(0, 0, 0, $m, 1, $y));
    return sprintf('%04d-%02d-%02d', $y, $m, min($dd, $ult));
}
const FIN_REC_HORIZONTE = 92;   /* dias à frente que ficam lançados */

/* cria os lançamentos das recorrências até o horizonte (chave rec:<id>:<data> — nunca duplica) */
function fin_gerar_recorrencias($tid, $somenteId = 0) {
    if (!fin_tem_v124()) return;
    $lim = date('Y-m-d', strtotime('+' . FIN_REC_HORIZONTE . ' days'));
    $w = "tenant_id = ? AND excluido_em IS NULL AND ativa = 1 AND (gerado_ate IS NULL OR gerado_ate < ?)"; $p = [$tid, $lim];
    if ($somenteId) { $w .= " AND id = ?"; $p[] = $somenteId; }
    foreach (linhas("SELECT * FROM fin_recorrencias WHERE $w", $p) as $r) {
        $ate = $r['fim'] && $r['fim'] < $lim ? $r['fim'] : $lim;
        $ult = $r['gerado_ate'];
        for ($k = 0; $k < 600; $k++) {
            $dt = fin_rec_data($r['inicio'], $k, max(1, (int) $r['intervalo_meses']));
            if ($dt > $ate) break;
            if ($r['gerado_ate'] && $dt <= $r['gerado_ate']) continue;
            $ch = 'rec:' . (int) $r['id'] . ':' . $dt;
            try {
                q("INSERT INTO fin_titulos (tenant_id, tipo, descricao, cliente_id, fornecedor_id, categoria_id, centro_id, conta_id, forma, valor, competencia, vencimento, status, origem_tipo, origem_id, chave_origem, obs)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberto', 'recorrencia', ?, ?, ?)",
                  [$tid, $r['tipo'], mb_substr($r['descricao'] . ' · ' . substr($dt, 5, 2) . '/' . substr($dt, 0, 4), 0, 255), $r['cliente_id'], $r['fornecedor_id'], $r['categoria_id'], $r['centro_id'],
                   $r['conta_id'], $r['forma'], $r['valor'], $dt, $dt, (int) $r['id'], $ch, $r['obs']]);
            } catch (Throwable $e) { /* já existia (chave única): segue */ }
            $ult = $dt;
        }
        q("UPDATE fin_recorrencias SET gerado_ate = ? WHERE id = ? AND tenant_id = ?", [max((string) $ult, $ate), $r['id'], $tid]);
    }
}

/* tira os lançamentos futuros ainda não pagos de uma recorrência (para regerar com os dados novos) */
function fin_rec_limpar_futuro($tid, $recId) {
    $hoje = fin_hoje();
    q("UPDATE fin_titulos SET excluido_em = NOW(), chave_origem = NULL WHERE tenant_id = ? AND origem_tipo = 'recorrencia' AND origem_id = ? AND excluido_em IS NULL
         AND status = 'aberto' AND pago = 0 AND vencimento >= ?", [$tid, $recId, $hoje]);
    $ult = valor("SELECT MAX(vencimento) FROM fin_titulos WHERE tenant_id = ? AND origem_tipo = 'recorrencia' AND origem_id = ? AND excluido_em IS NULL", [$tid, $recId]);
    q("UPDATE fin_recorrencias SET gerado_ate = ? WHERE id = ? AND tenant_id = ?", [$ult ?: null, $recId, $tid]);
}

function fin_rec_publica($r) {
    return ['id' => (int) $r['id'], 'tipo' => $r['tipo'], 'descricao' => $r['descricao'], 'clienteId' => $r['cliente_id'] !== null ? (int) $r['cliente_id'] : null,
            'fornecedorId' => $r['fornecedor_id'] !== null ? (int) $r['fornecedor_id'] : null, 'pessoa' => $r['cliente_nome'] ?? $r['fornecedor_nome'] ?? null,
            'categoriaId' => $r['categoria_id'] !== null ? (int) $r['categoria_id'] : null, 'categoria' => $r['categoria_nome'] ?? null,
            'centroId' => $r['centro_id'] !== null ? (int) $r['centro_id'] : null, 'contaId' => $r['conta_id'] !== null ? (int) $r['conta_id'] : null,
            'forma' => $r['forma'], 'valor' => (float) $r['valor'], 'intervaloMeses' => (int) $r['intervalo_meses'], 'inicio' => $r['inicio'], 'fim' => $r['fim'],
            'ativa' => (int) $r['ativa'] === 1, 'obs' => $r['obs'], 'proxima' => $r['proxima'] ?? null, 'comNota' => (int) ($r['com_nota'] ?? 0) === 1];
}

/* ---- extrato: leitura do OFX (SGML ou XML) ---- */
function fin_ofx_ler($txt) {
    $txt = (string) $txt;
    if (!preg_match('/<OFX>/i', $txt)) erro('Arquivo OFX inválido (não achei a marca <OFX>).');
    $tag = function ($bloco, $nome) { return preg_match('/<' . $nome . '>\s*([^<\r\n]*)/i', $bloco, $m) ? trim(html_entity_decode($m[1], ENT_QUOTES | ENT_XML1, 'UTF-8')) : ''; };
    $data = function ($v) { return preg_match('/^(\d{4})(\d{2})(\d{2})/', $v, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? "$m[1]-$m[2]-$m[3]" : null; };
    $num = function ($v) { $v = trim($v); if (strpos($v, ',') !== false && strpos($v, '.') === false) $v = str_replace(',', '.', $v); return (float) preg_replace('/[^\d.\-]/', '', $v); };
    $linhas = [];
    if (preg_match_all('/<STMTTRN>(.*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/is', $txt, $mm)) {
        foreach ($mm[1] as $b) {
            $d = $data($tag($b, 'DTPOSTED'));
            if (!$d) continue;
            $desc = trim($tag($b, 'MEMO') ?: $tag($b, 'NAME'));
            if ($tag($b, 'NAME') !== '' && $tag($b, 'MEMO') !== '' && stripos($tag($b, 'MEMO'), $tag($b, 'NAME')) === false) $desc = $tag($b, 'NAME') . ' · ' . $tag($b, 'MEMO');
            $linhas[] = ['data' => $d, 'valor' => round($num($tag($b, 'TRNAMT')), 2), 'descricao' => $desc, 'documento' => $tag($b, 'CHECKNUM') ?: $tag($b, 'REFNUM'), 'id' => $tag($b, 'FITID')];
        }
    }
    $saldo = null; $saldoEm = null;
    if (preg_match('/<LEDGERBAL>(.*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/is', $txt, $lb)) { $v = $tag($lb[1], 'BALAMT'); if ($v !== '') { $saldo = round($num($v), 2); $saldoEm = $data($tag($lb[1], 'DTASOF')); } }
    return [$linhas, $saldo, $saldoEm];
}

function fin_sem_acento($s) { return strtolower(trim(preg_replace('/\s+/', ' ', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', (string) $s) ?: (string) $s))); }

/* grava o movimento que a conciliação criou ou ligou e marca a linha do extrato */
function fin_extrato_ligar($tid, $e, $movId) {
    q("UPDATE fin_movimentos SET conciliado = 1, extrato_id = ? WHERE id = ? AND tenant_id = ?", [$e['id'], $movId, $tid]);
    q("UPDATE fin_extrato SET status = 'conciliado', movimento_id = ?, conciliado_por = ?, conciliado_em = NOW() WHERE id = ? AND tenant_id = ?", [$movId, (int) eu()['id'], $e['id'], $tid]);
}

/* sugestões de correspondência para uma linha do extrato */
function fin_sugestoes($tid, $e) {
    $v = (float) $e['valor'];
    $movs = linhas("SELECT m.id, m.data, m.valor, COALESCE(m.descricao, t.descricao) AS descricao, ABS(DATEDIFF(m.data, ?)) AS dist
                      FROM fin_movimentos m LEFT JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                     WHERE m.tenant_id = ? AND m.conta_id = ? AND m.excluido_em IS NULL AND m.conciliado = 0 AND ABS(m.valor - ?) < 0.005
                       AND m.data BETWEEN DATE_SUB(?, INTERVAL 5 DAY) AND DATE_ADD(?, INTERVAL 5 DAY) ORDER BY dist, m.id LIMIT 3",
                   [$e['data'], $tid, $e['conta_id'], $v, $e['data'], $e['data']]);
    $tits = linhas("SELECT t.id, t.descricao, t.vencimento, t.valor - t.pago AS saldo, COALESCE(cl.nome, f.nome) AS pessoa,
                           CASE WHEN t.vencimento IS NULL THEN 999 ELSE ABS(DATEDIFF(t.vencimento, ?)) END AS dist
                      FROM fin_titulos t LEFT JOIN clientes cl ON cl.tenant_id = t.tenant_id AND cl.id = t.cliente_id LEFT JOIN fornecedores f ON f.tenant_id = t.tenant_id AND f.id = t.fornecedor_id
                     WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status IN ('aberto','parcial') AND t.tipo = ? AND ABS((t.valor - t.pago) - ?) < 0.005
                       AND (t.vencimento IS NULL OR t.vencimento BETWEEN DATE_SUB(?, INTERVAL 45 DAY) AND DATE_ADD(?, INTERVAL 45 DAY))
                     ORDER BY dist, t.id LIMIT 3",
                   [$e['data'], $tid, $v > 0 ? 'receber' : 'pagar', abs($v), $e['data'], $e['data']]);
    $o = [];
    foreach ($movs as $m) $o[] = ['tipo' => 'mov', 'id' => (int) $m['id'], 'texto' => 'Já lançado: ' . ($m['descricao'] ?: 'movimento') . ' (' . fin_dbr($m['data']) . ')', 'dist' => (int) $m['dist']];
    foreach ($tits as $t) $o[] = ['tipo' => 'titulo', 'id' => (int) $t['id'], 'texto' => ($v > 0 ? 'Receber: ' : 'Pagar: ') . $t['descricao'] . ($t['pessoa'] ? ' · ' . $t['pessoa'] : '') . ' (venc. ' . fin_dbr($t['vencimento']) . ')', 'dist' => (int) $t['dist']];
    return $o;
}

/* ---------------- ações ---------------- */

/* ---------------- v1.25.0: DRE, impostos, rentabilidade, contratos ---------------- */

const FIN_DRE_ORDEM = ['receita_bruta', 'deducoes', 'custo_direto', 'despesa_operacional', 'receita_financeira', 'despesa_financeira', 'tributo_lucro'];

function fin_tem_v125() {
    static $ok = null;
    if ($ok === null) { try { valor("SELECT 1 FROM contrato_faturamento LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
    return $ok;
}
function fin_exigir_v125() { if (!fin_tem_v125()) erro('Rode antes o SQL 18 (18_dre_contratos.sql) da versão 1.25.0.', 409, 'SQL18'); }

/* v1.25.1: provisão de impostos só sobre receita COM nota fiscal */
function fin_tem_nota() {
    static $ok = null;
    if ($ok === null) { try { valor("SELECT com_nota FROM fin_titulos LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
    return $ok;
}
/* expressão SQL: o lançamento a receber tem nota? (1/0)
   explícito no lançamento → senão chamado (campo nota fiscal) → contrato (cobrança, padrão sim) → recorrente → manual = não */
function fin_sql_nota($a = 't') {
    $ch = "COALESCE((SELECT chn.nota_fiscal FROM chamados chn WHERE chn.tenant_id = $a.tenant_id AND chn.id = $a.origem_id), 0)";
    if (!fin_tem_nota()) return "(CASE WHEN $a.origem_tipo = 'chamado' THEN $ch WHEN $a.origem_tipo = 'contrato' THEN 1 ELSE 0 END)";
    return "(CASE WHEN $a.com_nota IS NOT NULL THEN $a.com_nota
                  WHEN $a.origem_tipo = 'chamado' THEN $ch
                  WHEN $a.origem_tipo = 'contrato' THEN COALESCE((SELECT cfn.com_nota FROM contrato_faturamento cfn WHERE cfn.tenant_id = $a.tenant_id AND cfn.contrato_id = $a.origem_id), 1)
                  WHEN $a.origem_tipo = 'recorrencia' THEN COALESCE((SELECT rcn.com_nota FROM fin_recorrencias rcn WHERE rcn.tenant_id = $a.tenant_id AND rcn.id = $a.origem_id), 0)
                  ELSE 0 END)";
}
/* receita bruta COM nota por mês (base da provisão).
   competência: lançamentos a receber pela competência; caixa: recebimentos desses lançamentos pela data. */
function fin_base_nota($tid, $de, $ate, $regime, $centroId = 0) {
    $d1 = $de . '-01'; $d2 = fin_mes_fim($ate);
    $nota = fin_sql_nota('t');
    $cat = "(t.categoria_id IS NULL OR t.categoria_id IN (SELECT cb.id FROM fin_categorias cb WHERE cb.tenant_id = t.tenant_id AND cb.grupo_dre = 'receita_bruta'))";
    $out = [];
    if ($regime === 'caixa') {
        $w = ''; $p = [$tid, $d1, $d2];
        if ($centroId) { $w = " AND COALESCE(t.centro_id, m.centro_id) = ?"; $p[] = $centroId; }
        $l = linhas("SELECT DATE_FORMAT(m.data, '%Y-%m') AS mes, SUM(m.valor) AS v FROM fin_movimentos m JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                      WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.transferencia IS NULL AND m.data BETWEEN ? AND ? AND t.tipo = 'receber' AND $cat AND $nota = 1$w GROUP BY mes", $p);
    } else {
        $w = ''; $p = [$tid, $d1, $d2];
        if ($centroId) { $w = " AND t.centro_id = ?"; $p[] = $centroId; }
        $l = linhas("SELECT DATE_FORMAT(t.competencia, '%Y-%m') AS mes, SUM(t.valor) AS v FROM fin_titulos t
                      WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status <> 'cancelado' AND t.competencia BETWEEN ? AND ? AND t.tipo = 'receber' AND $cat AND $nota = 1$w GROUP BY mes", $p);
    }
    foreach ($l as $r) $out[$r['mes']] = round((float) $r['v'], 2);
    return $out;
}

/* "AAAA-MM" válido (ou o padrão) */
function fin_mes($v, $padrao) {
    $v = substr(trim((string) ($v ?? '')), 0, 7);
    return preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $v) ? $v : $padrao;
}
function fin_meses_entre($de, $ate) {
    $l = [];
    for ($m = $de, $i = 0; $m <= $ate && $i < 36; $m = date('Y-m', strtotime($m . '-01 +1 month')), $i++) $l[] = $m;
    return $l;
}
function fin_mes_fim($m) { return date('Y-m-t', strtotime($m . '-01')); }

function fin_config_gravar($tid, $c) {
    $j = json_encode($c, JSON_UNESCAPED_UNICODE);
    if (valor("SELECT chave FROM config WHERE tenant_id = ? AND chave = 'financeiro'", [$tid]) === false) q("INSERT INTO config (tenant_id, chave, valor) VALUES (?, 'financeiro', ?)", [$tid, $j]);
    else q("UPDATE config SET valor = ? WHERE tenant_id = ? AND chave = 'financeiro'", [$j, $tid]);
}

/* categorias da empresa: id => [nome, tipo, grupo, pai] */
function fin_cats_mapa($tid) {
    $m = [];
    foreach (linhas("SELECT id, nome, tipo, grupo_dre" . (fin_tem_subcat() ? ", pai_id" : ", NULL AS pai_id") . " FROM fin_categorias WHERE tenant_id = ?", [$tid]) as $c)
        $m[(int) $c['id']] = [$c['nome'], $c['tipo'], $c['grupo_dre'], $c['pai_id'] !== null ? (int) $c['pai_id'] : 0];
    return $m;
}
/* v1.26.0: subcategoria (categoria "dentro de" outra) — SQL 22 */
function fin_tem_subcat() {
    static $ok = null;
    if ($ok === null) { try { valor("SELECT pai_id FROM fin_categorias LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
    return $ok;
}
/* v1.26.3: código da categoria (1, 2, 3…) e do plano de contas dentro dela (6.1, 6.2…) — SQL 23 */
function fin_tem_codigo() {
    static $ok = null;
    if ($ok === null) { try { valor("SELECT codigo FROM fin_categorias LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
    return $ok;
}
function fin_proximo_codigo($tid, $pai) {
    return 1 + (int) valor("SELECT COALESCE(MAX(codigo), 0) FROM fin_categorias WHERE tenant_id = ? AND excluido_em IS NULL AND " . ($pai ? "pai_id = ?" : "pai_id IS NULL"), $pai ? [$tid, $pai] : [$tid]);
}
/* preenche o código de quem ainda não tem (só a coluna nova; nada mais muda) */
function fin_codigos_preencher($tid) {
    if (!fin_tem_codigo() || !fin_tem_subcat()) return;
    if (!(int) valor("SELECT COUNT(*) FROM fin_categorias WHERE tenant_id = ? AND codigo IS NULL AND excluido_em IS NULL", [$tid])) return;
    foreach (linhas("SELECT id FROM fin_categorias WHERE tenant_id = ? AND pai_id IS NULL AND codigo IS NULL AND excluido_em IS NULL ORDER BY tipo DESC, ordem, id", [$tid]) as $r)
        q("UPDATE fin_categorias SET codigo = ? WHERE id = ? AND tenant_id = ?", [fin_proximo_codigo($tid, 0), (int) $r['id'], $tid]);
    foreach (linhas("SELECT id, pai_id FROM fin_categorias WHERE tenant_id = ? AND pai_id IS NOT NULL AND codigo IS NULL AND excluido_em IS NULL ORDER BY pai_id, ordem, id", [$tid]) as $r)
        q("UPDATE fin_categorias SET codigo = ? WHERE id = ? AND tenant_id = ?", [fin_proximo_codigo($tid, (int) $r['pai_id']), (int) $r['id'], $tid]);
}

/* a categoria e as subcategorias dela, para filtros: "12,40,41" */
function fin_cat_ids($tid, $id) {
    $id = (int) $id;
    if (!$id || !fin_tem_subcat()) return (string) $id;
    $l = array_map('intval', array_column(linhas("SELECT id FROM fin_categorias WHERE tenant_id = ? AND pai_id = ?", [$tid, $id]), 'id'));
    return implode(',', array_merge([$id], $l));
}

/* valores com sinal (+ entra, − sai) por mês e categoria.
   competência: títulos não cancelados pela competência + movimentos avulsos pela data.
   caixa: tudo o que passou pelas contas (baixas e avulsos), sem transferências. */
function fin_dre_bruto($tid, $de, $ate, $regime, $centroId = 0) {
    $out = [];
    $add = function ($mes, $cat, $v) use (&$out) {
        $k = $cat ? (int) $cat : ($v >= 0 ? 0 : -1);   /* 0 = receita sem categoria, -1 = despesa sem categoria */
        $out[$mes][$k] = round(($out[$mes][$k] ?? 0) + $v, 2);
    };
    $d1 = $de . '-01'; $d2 = fin_mes_fim($ate);
    if ($regime === 'caixa') {
        $w = ''; $p = [$tid, $d1, $d2];
        if ($centroId) { $w = " AND COALESCE(t.centro_id, m.centro_id) = ?"; $p[] = $centroId; }
        foreach (linhas("SELECT DATE_FORMAT(m.data, '%Y-%m') AS mes, COALESCE(t.categoria_id, m.categoria_id) AS cat, SUM(m.valor) AS v
                           FROM fin_movimentos m LEFT JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                          WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.transferencia IS NULL AND m.data BETWEEN ? AND ?$w
                          GROUP BY mes, cat", $p) as $r) $add($r['mes'], $r['cat'], (float) $r['v']);
        return $out;
    }
    $w = ''; $p = [$tid, $d1, $d2];
    if ($centroId) { $w = " AND t.centro_id = ?"; $p[] = $centroId; }
    foreach (linhas("SELECT DATE_FORMAT(t.competencia, '%Y-%m') AS mes, t.categoria_id AS cat, t.tipo, SUM(t.valor) AS v
                       FROM fin_titulos t WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status <> 'cancelado' AND t.competencia BETWEEN ? AND ?$w
                      GROUP BY mes, cat, t.tipo", $p) as $r) $add($r['mes'], $r['cat'], $r['tipo'] === 'receber' ? (float) $r['v'] : -(float) $r['v']);
    $w = ''; $p = [$tid, $d1, $d2];
    if ($centroId) { $w = " AND m.centro_id = ?"; $p[] = $centroId; }
    foreach (linhas("SELECT DATE_FORMAT(m.data, '%Y-%m') AS mes, m.categoria_id AS cat, SUM(m.valor) AS v
                       FROM fin_movimentos m WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.titulo_id IS NULL AND m.transferencia IS NULL AND m.data BETWEEN ? AND ?$w
                      GROUP BY mes, cat", $p) as $r) $add($r['mes'], $r['cat'], (float) $r['v']);
    return $out;
}

/* grupo da DRE de uma chave de categoria */
function fin_dre_grupo($k, $cats) {
    if ($k === 0) return 'receita_bruta';
    if ($k === -1) return 'despesa_operacional';
    return $cats[$k][2] ?? 'despesa_operacional';
}

/* impostos por mês (empresa toda, por competência):
   base (faturamento ou recebimentos), provisão = % × base, apurado = guias lançadas na categoria de deduções. */
function fin_impostos_meses($tid, $meses, $cfg) {
    if (!$meses) return [];
    $cats = fin_cats_mapa($tid);
    $de = $meses[0]; $ate = end($meses);
    $comp = fin_dre_bruto($tid, $de, $ate, 'competencia');
    $base = fin_base_nota($tid, $de, $ate, $cfg['provisaoBase'] === 'recebimento' ? 'caixa' : 'competencia');   /* v1.25.1: só receita com nota */
    $fat = [];
    foreach ($comp as $m => $l) foreach ($l as $k => $v) if (fin_dre_grupo($k, $cats) === 'receita_bruta') $fat[$m] = ($fat[$m] ?? 0) + $v;
    $apur = []; $qtd = [];
    foreach ($comp as $m => $l) foreach ($l as $k => $v) if (fin_dre_grupo($k, $cats) === 'deducoes') { $apur[$m] = ($apur[$m] ?? 0) - $v; $qtd[$m] = 1; }
    $zer = array_flip((array) ($cfg['impostosZerados'] ?? []));
    $pct = (float) $cfg['provisaoPct'];
    $out = [];
    foreach ($meses as $m) {
        $b = round(max(0, $base[$m] ?? 0), 2);
        $prov = round($b * $pct / 100, 2);
        $temGuia = isset($qtd[$m]);
        $sit = $temGuia ? 'apurado' : (isset($zer[$m]) ? 'zerado' : 'provisao');
        $ap = $temGuia ? round($apur[$m], 2) : ($sit === 'zerado' ? 0.0 : null);
        $out[$m] = ['mes' => $m, 'base' => $b, 'faturado' => round($fat[$m] ?? 0, 2), 'provisao' => $prov, 'apurado' => $ap, 'situacao' => $sit,
                    'usado' => $ap !== null ? $ap : $prov, 'diferenca' => $ap !== null ? round($ap - $prov, 2) : null,
                    'aliquotaReal' => $ap !== null && $b > 0 ? round($ap / $b * 100, 2) : null];
    }
    return $out;
}

function fin_cobranca_publica($tid, $ct, $f) {
    $hoje = date('Y-m');
    $tits = linhas("SELECT id, competencia, vencimento, valor, pago, status FROM fin_titulos WHERE tenant_id = ? AND origem_tipo = 'contrato' AND origem_id = ? AND excluido_em IS NULL AND status <> 'cancelado'
                     ORDER BY competencia DESC, id DESC LIMIT 24", [$tid, (int) $ct['id']]);
    $aberto = 0.0; $vencido = 0.0;
    foreach ($tits as $t) if (in_array($t['status'], ['aberto', 'parcial'], true)) {
        $s = (float) $t['valor'] - (float) $t['pago']; $aberto += $s;
        if ($t['vencimento'] && $t['vencimento'] < date('Y-m-d')) $vencido += $s;
    }
    return [
        'contratoId' => (int) $ct['id'], 'numero' => (int) $ct['numero'], 'cliente' => $ct['cliente_nome'] ?? null, 'statusContrato' => $ct['status'],
        'valorMensal' => $ct['valor_mensal'] !== null ? (float) $ct['valor_mensal'] : null, 'diaContrato' => $ct['dia_vencimento'] !== null ? (int) $ct['dia_vencimento'] : null,
        'inicioContrato' => $ct['inicio'], 'fimContrato' => $ct['fim'],
        'configurado' => (bool) $f,
        'ativo' => $f ? (int) $f['ativo'] === 1 : false,
        'diaVencimento' => $f && $f['dia_vencimento'] !== null ? (int) $f['dia_vencimento'] : null,
        'valor' => $f && $f['valor'] !== null ? (float) $f['valor'] : null,
        'categoriaId' => $f && $f['categoria_id'] !== null ? (int) $f['categoria_id'] : null,
        'centroId' => $f && $f['centro_id'] !== null ? (int) $f['centro_id'] : null,
        'contaId' => $f && $f['conta_id'] !== null ? (int) $f['conta_id'] : null,
        'forma' => $f['forma'] ?? null, 'inicioCobranca' => $f && $f['inicio_cobranca'] ? substr($f['inicio_cobranca'], 0, 7) : null,
        'descricao' => $f['descricao'] ?? null, 'obs' => $f['obs'] ?? null, 'comNota' => $f ? (int) ($f['com_nota'] ?? 1) === 1 : true,
        'emAberto' => round($aberto, 2), 'vencido' => round($vencido, 2),
        'mensalidades' => array_map(function ($t) { return ['id' => (int) $t['id'], 'mes' => substr($t['competencia'], 0, 7), 'vencimento' => $t['vencimento'], 'valor' => (float) $t['valor'],
                                                            'pago' => (float) $t['pago'], 'status' => $t['status']]; }, $tits),
        'mesAtual' => $hoje,
    ];
}

/* ---------------- v1.25.2: cartão de crédito (faturas) ---------------- */

function fin_tem_cartao() {
    static $ok = null;
    if ($ok === null) { try { valor("SELECT dia_vencimento FROM fin_contas LIMIT 0"); valor("SELECT fatura FROM fin_movimentos LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
    return $ok;
}
/* v1.39.0: aviso único quando faltam as colunas do cartão (antes o cadastro aceitava e descartava em silêncio) */
const FIN_MSG_SQL_CARTAO = 'O banco de dados ainda não tem a estrutura do cartão de crédito (limite, melhor dia de compra, vencimento da fatura). Peça ao administrador para rodar o SQL da versão 1.39.0 (sql_v1.39.0.sql).';
function fin_exigir_cartao() { if (!fin_tem_cartao()) erro(FIN_MSG_SQL_CARTAO, 409, 'SQL20'); }
function fin_cartao_ok($c) { return $c['tipo'] === 'cartao' && !empty($c['dia_vencimento']) && !empty($c['dia_melhor_compra']); }

/* em que fatura cai uma compra feita em $data (chave = mês do vencimento AAAA-MM).
   A partir do "melhor dia de compra" a compra vai para a fatura seguinte. */
function fin_fatura_de($c, $data, $mais = 0) {
    $b = max(1, min(31, (int) $c['dia_melhor_compra'])); $v = max(1, min(31, (int) $c['dia_vencimento']));
    [$y, $m, $d] = array_map('intval', explode('-', substr($data, 0, 10)));
    $fech = $m + ($d >= $b ? 1 : 0);                 /* mês do fechamento */
    $venc = $fech + ($v >= $b ? 0 : 1) + $mais;      /* vencimento antes do melhor dia = mês seguinte ao fechamento */
    return date('Y-m', mktime(0, 0, 0, $venc, 1, $y));
}
function fin_fatura_venc($c, $chave) {
    $ult = (int) date('t', strtotime($chave . '-01'));
    return $chave . '-' . str_pad((string) min((int) $c['dia_vencimento'], $ult), 2, '0', STR_PAD_LEFT);
}
function fin_fatura_fech($c, $chave) {
    /* fechamento = véspera do melhor dia, no mês do fechamento */
    $b = (int) $c['dia_melhor_compra']; $v = (int) $c['dia_vencimento'];
    $mesF = $v >= $b ? $chave : date('Y-m', strtotime($chave . '-01 -1 month'));
    $d = date('Y-m-d', strtotime($mesF . '-' . str_pad((string) min($b, (int) date('t', strtotime($mesF . '-01'))), 2, '0', STR_PAD_LEFT) . ' -1 day'));
    return $d;
}

/* faturas de um cartão: [chave => [compras, creditos, saldo, vencimento, fechamento]]
   compras = lançamentos negativos; créditos = pagamentos/estornos. Pagamento sem fatura marcada
   abate as faturas mais antigas primeiro. O saldo inicial negativo vira a 1ª fatura. */
function fin_faturas_cartao($tid, $c) {
    if (!fin_tem_cartao() || !fin_cartao_ok($c)) return [];
    $f = []; $livre = 0.0;
    $add = function ($k, $campo, $v) use (&$f) { if (!isset($f[$k])) $f[$k] = ['compras' => 0.0, 'creditos' => 0.0]; $f[$k][$campo] += $v; };
    if ((float) $c['saldo_inicial'] < 0) {
        $k0 = substr($c['saldo_inicial_em'], 0, 7);   /* a fatura em aberto no dia do saldo inicial = a 1ª que vence a partir dele */
        $k = fin_fatura_venc($c, $k0) >= $c['saldo_inicial_em'] ? $k0 : date('Y-m', strtotime($k0 . '-01 +1 month'));
        $add($k, 'compras', -(float) $c['saldo_inicial']);
    } elseif ((float) $c['saldo_inicial'] > 0) $livre += (float) $c['saldo_inicial'];
    foreach (linhas("SELECT data, valor, fatura FROM fin_movimentos WHERE tenant_id = ? AND conta_id = ? AND excluido_em IS NULL AND data >= ? ORDER BY data, id",
                    [$tid, (int) $c['id'], $c['saldo_inicial_em']]) as $m) {
        $v = (float) $m['valor'];
        if ($v < 0) $add($m['fatura'] ?: fin_fatura_de($c, $m['data']), 'compras', -$v);
        elseif ($m['fatura']) $add($m['fatura'], 'creditos', $v);
        else $livre += $v;
    }
    ksort($f);
    foreach ($f as $k => &$x) {
        $x['saldo'] = round($x['compras'] - $x['creditos'], 2);
        if ($x['saldo'] > 0 && $livre > 0) { $u = min($livre, $x['saldo']); $x['creditos'] += $u; $x['saldo'] = round($x['saldo'] - $u, 2); $livre -= $u; }
        $x['compras'] = round($x['compras'], 2); $x['creditos'] = round($x['creditos'], 2);
        $x['vencimento'] = fin_fatura_venc($c, $k); $x['fechamento'] = fin_fatura_fech($c, $k);
    } unset($x);
    return $f;
}

/* faturas em aberto de todos os cartões: [[contaId, conta, chave, vencimento, saldo]] */
function fin_faturas_abertas($tid) {
    if (!fin_tem_cartao()) return [];
    $out = [];
    foreach (linhas("SELECT * FROM fin_contas WHERE tenant_id = ? AND excluido_em IS NULL AND tipo = 'cartao'", [$tid]) as $c)
        foreach (fin_faturas_cartao($tid, $c) as $k => $x)
            if ($x['saldo'] > 0.004) $out[] = ['contaId' => (int) $c['id'], 'conta' => $c['nome'], 'chave' => $k, 'vencimento' => $x['vencimento'], 'saldo' => $x['saldo']];
    return $out;
}
/* contas a pagar em aberto lançadas para um cartão: o dinheiro só sai no vencimento da fatura */
function fin_cartoes_mapa($tid) {
    static $cache = [];
    if (isset($cache[$tid])) return $cache[$tid];
    $m = [];
    if (fin_tem_cartao()) foreach (linhas("SELECT * FROM fin_contas WHERE tenant_id = ? AND excluido_em IS NULL AND tipo = 'cartao'", [$tid]) as $c) if (fin_cartao_ok($c)) $m[(int) $c['id']] = $c;
    return $cache[$tid] = $m;
}

/* previsto extra do fluxo: contas a pagar lançadas no cartão (saem no vencimento da fatura) e faturas em aberto.
   Devolve [[k, valorSaida, item]] já com a data ajustada (vencidos → hoje). */
function fin_prev_cartoes($tid, $hoje, $wt = '', $pt = [], $comFaturas = true) {
    $cards = fin_cartoes_mapa($tid);
    $out = [];
    if (!$cards) return $out;
    $ids = implode(',', array_keys($cards));
    foreach (linhas("SELECT t.id, t.descricao, t.vencimento, t.valor - t.pago AS saldo, t.conta_id FROM fin_titulos t
                      WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.tipo = 'pagar' AND t.status IN ('aberto','parcial') AND t.vencimento IS NOT NULL
                        AND t.conta_id IN ($ids)" . $wt, array_merge([$tid], $pt)) as $t) {
        $c = $cards[(int) $t['conta_id']];
        $dt = max(fin_fatura_venc($c, fin_fatura_de($c, $t['vencimento'])), $hoje);
        $out[] = [$dt, (float) $t['saldo'], ['tipo' => 'titulo', 'id' => (int) $t['id'], 'descricao' => $t['descricao'] . ' (no cartão ' . $c['nome'] . ')', 'data' => $dt]];
    }
    if ($comFaturas) foreach (fin_faturas_abertas($tid) as $f) {
        $dt = max($f['vencimento'], $hoje);
        $out[] = [$dt, $f['saldo'], ['tipo' => 'fatura', 'contaId' => $f['contaId'], 'chave' => $f['chave'], 'descricao' => 'Fatura ' . $f['conta'] . ' · vence ' . date('d/m', strtotime($f['vencimento'])), 'data' => $dt, 'vencimento' => $f['vencimento']]];
    }
    return $out;
}
/* filtro SQL para tirar do previsto normal as contas a pagar lançadas em cartão configurado */
function fin_sql_sem_cartao($tid, $a = 't') {
    $cards = fin_cartoes_mapa($tid);
    return $cards ? " AND ($a.tipo <> 'pagar' OR $a.conta_id IS NULL OR $a.conta_id NOT IN (" . implode(',', array_keys($cards)) . "))" : '';
}

return [

    /* tudo que as telas precisam para montar filtros e formulários */
    'opcoes' => function ($d) {
        $u = fin_u(); fin_tabelas();
        $tid = tenant();
        fin_padroes($tid);
        fin_codigos_preencher($tid);    /* v1.26.3 */
        fin_gerar_recorrencias($tid);   /* v1.24.0 */
        fct_sincronizar($tid);          /* v1.25.0: mensalidades dos contratos */
        return [
            'contas' => array_map(function ($c) use ($tid) { return fin_conta_publica($tid, $c); },
                        linhas("SELECT * FROM fin_contas WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY ativa DESC, ordem, nome", [$tid])),
            'categorias' => array_map(function ($c) { return ['id' => (int) $c['id'], 'nome' => $c['nome'], 'tipo' => $c['tipo'], 'grupoDre' => $c['grupo_dre'], 'ativa' => (int) $c['ativa'] === 1,
                                                              'paiId' => !empty($c['pai_id']) ? (int) $c['pai_id'] : null, 'codigo' => isset($c['codigo']) ? (int) $c['codigo'] : null]; },
                        linhas("SELECT * FROM fin_categorias WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY tipo DESC, ordem, nome", [$tid])),
            'centros' => array_map(function ($c) { return ['id' => (int) $c['id'], 'nome' => $c['nome'], 'ativo' => (int) $c['ativo'] === 1]; },
                        linhas("SELECT * FROM fin_centros WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY nome", [$tid])),
            'tiposConta' => FIN_TIPOS_CONTA, 'gruposDre' => FIN_GRUPOS_DRE, 'gruposDica' => FIN_GRUPOS_DICA, 'formas' => FIN_FORMAS, 'temSubcategoria' => fin_tem_subcat(), 'temCodigo' => fin_tem_codigo(),
            'config' => fin_config($tid), 'hoje' => fin_hoje(),
            'temVinculo' => fin_tem_vinculo(),   /* v1.25.3 */
            'temCartao' => fin_tem_cartao(),   /* v1.39.0: a tela avisa quando falta o SQL do cartão */
        ];
    },

    /* painel: {de, ate, contaId?, centroId?} */
    'painel' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $hoje = fin_hoje();
        $de = fin_data($d['de'] ?? '', false) ?: date('Y-m-01');
        $ate = fin_data($d['ate'] ?? '', false) ?: date('Y-m-t');
        if ($ate < $de) [$de, $ate] = [$ate, $de];
        $contaId = (int) ($d['contaId'] ?? 0);
        $centroId = (int) ($d['centroId'] ?? 0);

        $contas = linhas("SELECT * FROM fin_contas WHERE tenant_id = ? AND excluido_em IS NULL AND ativa = 1 ORDER BY ordem, nome", [$tid]);
        $lc = []; $consolidado = 0.0; $cartoes = 0.0;
        foreach ($contas as $c) {
            $p = fin_conta_publica($tid, $c);
            $lc[] = $p;
            if ($contaId && (int) $c['id'] !== $contaId) continue;
            if ($c['tipo'] === 'cartao') $cartoes += $p['saldo']; else $consolidado += $p['saldo'];
        }

        /* realizado (movimentos), sem transferências entre contas */
        /* v1.24.0: conta escolhida = tudo dela; sem conta = caixa da empresa (cartão só quando a fatura é paga) */
        $wm = ''; $pm = [];
        if ($contaId) { $wm .= " AND m.conta_id = ?"; $pm[] = $contaId; } else $wm .= fin_sql_caixa('m');
        if ($centroId) { $wm .= " AND m.centro_id = ?"; $pm[] = $centroId; }
        $mov = function ($de, $ate) use ($tid, $wm, $pm) {
            $r = linha("SELECT COALESCE(SUM(CASE WHEN m.valor > 0 THEN m.valor END), 0) AS ent, COALESCE(SUM(CASE WHEN m.valor < 0 THEN -m.valor END), 0) AS sai
                          FROM fin_movimentos m WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.data BETWEEN ? AND ?" . $wm, array_merge([$tid, $de, $ate], $pm));
            return [round((float) $r['ent'], 2), round((float) $r['sai'], 2)];
        };
        [$entHoje, $saiHoje] = $mov($hoje, $hoje);
        [$entPer, $saiPer] = $mov($de, $ate);

        /* previsto (títulos em aberto) */
        $wt = ''; $pt = [];
        if ($contaId) { $wt .= " AND conta_id = ?"; $pt[] = $contaId; }
        if ($centroId) { $wt .= " AND centro_id = ?"; $pt[] = $centroId; }
        $rec = fin_soma_aberto($tid, 'receber', $wt, $pt);
        $pag = fin_soma_aberto($tid, 'pagar', $wt, $pt);
        $recVenc = fin_soma_aberto($tid, 'receber', $wt . " AND vencimento < ?", array_merge($pt, [$hoje]));
        $pagVenc = fin_soma_aberto($tid, 'pagar', $wt . " AND vencimento < ?", array_merge($pt, [$hoje]));
        $recSem = fin_soma_aberto($tid, 'receber', $wt . " AND vencimento IS NULL", $pt);
        $pagSem = fin_soma_aberto($tid, 'pagar', $wt . " AND vencimento IS NULL", $pt);
        $fimProj = max($ate, $hoje);
        $recAte = fin_soma_aberto($tid, 'receber', $wt . " AND vencimento <= ?", array_merge($pt, [$fimProj]));
        $pagAte = fin_soma_aberto($tid, 'pagar', $wt . " AND vencimento <= ?", array_merge($pt, [$fimProj]));
        /* v1.25.2: faturas de cartão em aberto até a data do projetado (sem filtro de conta/centro) */
        $fatAte = 0.0;
        if (!$contaId && !$centroId) foreach (fin_faturas_abertas($tid) as $f) if ($f['vencimento'] <= $fimProj) $fatAte += $f['saldo'];
        $fatAte = round($fatAte, 2);
        $recPer = fin_soma_aberto($tid, 'receber', $wt . " AND vencimento BETWEEN ? AND ?", array_merge($pt, [$de, $ate]));
        $pagPer = fin_soma_aberto($tid, 'pagar', $wt . " AND vencimento BETWEEN ? AND ?", array_merge($pt, [$de, $ate]));

        /* gráfico: por dia (até 62 dias) ou por mês */
        $dias = (int) round((strtotime($ate) - strtotime($de)) / 86400) + 1;
        $porMes = $dias > 62;
        $chave = $porMes ? "DATE_FORMAT(m.data, '%Y-%m')" : "m.data";
        $serie = [];
        foreach (linhas("SELECT $chave AS k, COALESCE(SUM(CASE WHEN m.valor > 0 THEN m.valor END), 0) AS ent, COALESCE(SUM(CASE WHEN m.valor < 0 THEN -m.valor END), 0) AS sai
                           FROM fin_movimentos m WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.data BETWEEN ? AND ?" . $wm . " GROUP BY k ORDER BY k",
                        array_merge([$tid, $de, $ate], $pm)) as $r)
            $serie[(string) $r['k']] = ['ent' => round((float) $r['ent'], 2), 'sai' => round((float) $r['sai'], 2)];
        $pontos = [];
        if ($porMes) { for ($m = substr($de, 0, 7); $m <= substr($ate, 0, 7); $m = date('Y-m', strtotime($m . '-01 +1 month'))) $pontos[] = ['k' => $m] + ($serie[$m] ?? ['ent' => 0, 'sai' => 0]); }
        else { for ($x = $de; $x <= $ate; $x = date('Y-m-d', strtotime($x . ' +1 day'))) $pontos[] = ['k' => $x] + ($serie[$x] ?? ['ent' => 0, 'sai' => 0]); }

        /* listas curtas: vencidos e próximos 7 dias */
        $lista = function ($extra, $par) use ($tid, $wt, $pt) {
            return array_map('fin_titulo_publico', linhas(FIN_SELECT_TITULO . " WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status IN ('aberto','parcial')" .
                str_replace(['conta_id', 'centro_id'], ['t.conta_id', 't.centro_id'], $wt) . $extra . " ORDER BY t.vencimento, t.id LIMIT 12", array_merge([$tid], $pt, $par)));
        };
        return [
            'de' => $de, 'ate' => $ate, 'hoje' => $hoje, 'porMes' => $porMes,
            'contas' => $lc, 'saldoConsolidado' => round($consolidado, 2), 'saldoCartoes' => round($cartoes, 2),
            'hojeEntradas' => $entHoje, 'hojeSaidas' => $saiHoje,
            'periodoEntradas' => $entPer, 'periodoSaidas' => $saiPer, 'resultadoPeriodo' => round($entPer - $saiPer, 2),
            'aReceber' => $rec, 'aPagar' => $pag, 'receberVencido' => $recVenc, 'pagarVencido' => $pagVenc,
            'receberSemVencimento' => $recSem, 'pagarSemVencimento' => $pagSem,
            'receberNoPeriodo' => $recPer, 'pagarNoPeriodo' => $pagPer,
            'projetadoAte' => $fimProj, 'saldoProjetado' => round($consolidado + $recAte - $pagAte - $fatAte, 2), 'faturasAte' => $fatAte,
            'serie' => $pontos,
            'vencidos' => $lista(" AND t.vencimento < ?", [$hoje]),
            'proximos' => $lista(" AND t.vencimento BETWEEN ? AND ?", [$hoje, date('Y-m-d', strtotime('+7 days'))]),
            'semConta' => !$contas,
        ];
    },

    /* v1.27.1: painel enxuto — saldo das contas, projetado do mês (recebimentos × saídas) e entradas/saídas da semana.
       {mes: 'YYYY-MM', semana: 'YYYY-MM-DD' (qualquer dia; vira a segunda-feira), contaId, centroId} */
    'painel.resumo' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $hoje = fin_hoje();
        $mes = preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', (string) ($d['mes'] ?? '')) ? (string) $d['mes'] : date('Y-m');
        $mDe = $mes . '-01'; $mAte = date('Y-m-t', strtotime($mDe));
        $ref = fin_data($d['semana'] ?? '', false) ?: $hoje;
        $sDe = date('Y-m-d', strtotime($ref . ' -' . ((int) date('N', strtotime($ref)) - 1) . ' days'));
        $sAte = date('Y-m-d', strtotime($sDe . ' +6 days'));
        $contaId = (int) ($d['contaId'] ?? 0);
        $centroId = (int) ($d['centroId'] ?? 0);

        $contas = []; $consolidado = 0.0; $cartoes = 0.0;
        foreach (linhas("SELECT * FROM fin_contas WHERE tenant_id = ? AND excluido_em IS NULL AND ativa = 1 ORDER BY ordem, nome", [$tid]) as $c) {
            $p = fin_conta_publica($tid, $c);
            $contas[] = $p;
            if ($contaId && (int) $c['id'] !== $contaId) continue;
            if ($c['tipo'] === 'cartao') $cartoes += $p['saldo']; else $consolidado += $p['saldo'];
        }

        /* realizado: mesma regra do painel completo (sem transferências entre contas; cartão só quando a fatura é paga) */
        $wm = ''; $pm = [];
        if ($contaId) { $wm .= " AND m.conta_id = ?"; $pm[] = $contaId; } else $wm .= fin_sql_caixa('m');
        if ($centroId) { $wm .= " AND m.centro_id = ?"; $pm[] = $centroId; }
        $r = linha("SELECT COALESCE(SUM(CASE WHEN m.valor > 0 THEN m.valor END), 0) AS ent, COALESCE(SUM(CASE WHEN m.valor < 0 THEN -m.valor END), 0) AS sai
                      FROM fin_movimentos m WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.data BETWEEN ? AND ?" . $wm, array_merge([$tid, $mDe, $mAte], $pm));
        $wt = ''; $pt = [];
        if ($contaId) { $wt .= " AND conta_id = ?"; $pt[] = $contaId; }
        if ($centroId) { $wt .= " AND centro_id = ?"; $pt[] = $centroId; }
        $faturas = (!$contaId && !$centroId) ? fin_faturas_abertas($tid) : [];
        $fatMes = 0.0; foreach ($faturas as $f) if ($f['vencimento'] >= $mDe && $f['vencimento'] <= $mAte) $fatMes += $f['saldo'];
        $mesOut = [
            'mes' => $mes, 'de' => $mDe, 'ate' => $mAte,
            'recebido' => round((float) $r['ent'], 2), 'pago' => round((float) $r['sai'], 2),
            'aReceber' => fin_soma_aberto($tid, 'receber', $wt . " AND vencimento BETWEEN ? AND ?", array_merge($pt, [$mDe, $mAte])),
            'aPagar' => round(fin_soma_aberto($tid, 'pagar', $wt . " AND vencimento BETWEEN ? AND ?", array_merge($pt, [$mDe, $mAte])) + $fatMes, 2),
            'faturas' => round($fatMes, 2),
            'receberVencido' => fin_soma_aberto($tid, 'receber', $wt . " AND vencimento < ?", array_merge($pt, [min($mDe, $hoje)])),
            'pagarVencido' => fin_soma_aberto($tid, 'pagar', $wt . " AND vencimento < ?", array_merge($pt, [min($mDe, $hoje)])),
        ];

        /* semana: o que entrou/saiu (realizado) + o que vence nela (previsto / vencido) */
        $itens = []; $ids = [];
        foreach (linhas("SELECT m.id, m.data, m.valor, m.tipo, m.descricao, m.titulo_id, t.descricao AS titulo_desc, cat.nome AS categoria
                           FROM fin_movimentos m LEFT JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                           LEFT JOIN fin_categorias cat ON cat.tenant_id = m.tenant_id AND cat.id = COALESCE(m.categoria_id, t.categoria_id)
                          WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.data BETWEEN ? AND ?" . $wm . " ORDER BY m.data, m.id LIMIT 300",
                        array_merge([$tid, $sDe, $sAte], $pm)) as $m) {
            $itens[] = ['data' => $m['data'], 'descricao' => ($m['descricao'] ?: $m['titulo_desc']) ?: ($m['tipo'] === 'transferencia' ? 'Pagamento de fatura' : 'Movimento'),
                        'categoria' => $m['categoria'], 'pessoa' => null, 'valor' => round((float) $m['valor'], 2), 'situacao' => 'realizado',
                        'tituloId' => $m['titulo_id'] !== null ? (int) $m['titulo_id'] : null];
            if ($m['titulo_id'] !== null) $ids[(int) $m['titulo_id']] = true;
        }
        $pessoas = [];
        if ($ids) foreach (linhas("SELECT t.id, cl.nome AS cn, f.nome AS fn FROM fin_titulos t LEFT JOIN clientes cl ON cl.tenant_id = t.tenant_id AND cl.id = t.cliente_id
                                     LEFT JOIN fornecedores f ON f.tenant_id = t.tenant_id AND f.id = t.fornecedor_id
                                    WHERE t.tenant_id = ? AND t.id IN (" . implode(',', array_keys($ids)) . ")", [$tid]) as $x) $pessoas[(int) $x['id']] = $x['cn'] ?: $x['fn'];
        foreach ($itens as $i => $x) if ($x['tituloId'] && isset($pessoas[$x['tituloId']])) $itens[$i]['pessoa'] = $pessoas[$x['tituloId']];
        foreach (linhas(FIN_SELECT_TITULO . " WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status IN ('aberto','parcial') AND t.vencimento BETWEEN ? AND ?" .
                        str_replace(['conta_id', 'centro_id'], ['t.conta_id', 't.centro_id'], $wt) . " ORDER BY t.vencimento, t.id LIMIT 300", array_merge([$tid, $sDe, $sAte], $pt)) as $t) {
            $p = fin_titulo_publico($t);
            $itens[] = ['data' => $p['vencimento'], 'descricao' => $p['descricao'], 'categoria' => $p['categoria'], 'pessoa' => $p['pessoa'],
                        'valor' => $p['tipo'] === 'receber' ? $p['saldo'] : -$p['saldo'], 'situacao' => $p['vencido'] ? 'vencido' : 'previsto', 'tituloId' => $p['id']];
        }
        foreach ($faturas as $f) if ($f['vencimento'] >= $sDe && $f['vencimento'] <= $sAte)
            $itens[] = ['data' => $f['vencimento'], 'descricao' => 'Fatura do cartão ' . $f['conta'], 'categoria' => null, 'pessoa' => null,
                        'valor' => -round($f['saldo'], 2), 'situacao' => $f['vencimento'] < $hoje ? 'vencido' : 'previsto', 'tituloId' => null];
        usort($itens, function ($a, $b) { return strcmp($a['data'], $b['data']) ?: ($a['situacao'] === 'realizado' ? -1 : 1); });
        $ent = 0.0; $sai = 0.0; $entR = 0.0; $saiR = 0.0;
        foreach ($itens as $x) {
            if ($x['valor'] >= 0) { $ent += $x['valor']; if ($x['situacao'] === 'realizado') $entR += $x['valor']; }
            else { $sai -= $x['valor']; if ($x['situacao'] === 'realizado') $saiR -= $x['valor']; }
        }
        return [
            'hoje' => $hoje, 'contas' => $contas, 'saldoConsolidado' => round($consolidado, 2), 'saldoCartoes' => round($cartoes, 2), 'semConta' => !$contas,
            'mes' => $mesOut,
            'semana' => ['de' => $sDe, 'ate' => $sAte, 'itens' => $itens, 'entradas' => round($ent, 2), 'saidas' => round($sai, 2),
                         'entradasRealizadas' => round($entR, 2), 'saidasRealizadas' => round($saiR, 2)],
        ];
    },

    /* v1.25.3: chamados em aberto e contratos ativos para vincular a um lançamento: {busca} (nº ou nome do cliente) */
    'vinculos.buscar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $b = txt($d['busca'] ?? '', 60);
        $filtro = function ($a) use ($b) {
            if ($b === '') return ['', []];
            return [" AND (cl.nome LIKE ?" . (ctype_digit($b) ? " OR $a.numero = ?" : '') . ")", ctype_digit($b) ? ['%' . $b . '%', (int) $b] : ['%' . $b . '%']];
        };
        $out = [];
        $enc = !empty($d['encerrados']);   /* v1.37.0: ajuste pela Rentabilidade também acha chamado concluído e contrato encerrado */
        [$w, $p] = $filtro('ct');
        foreach (linhas("SELECT ct.id, ct.numero, ct.status, ct.valor_mensal, cl.nome FROM contratos ct LEFT JOIN clientes cl ON cl.tenant_id = ct.tenant_id AND cl.id = ct.cliente_id
                          WHERE ct.tenant_id = ? AND ct.excluido_em IS NULL" . ($enc ? "" : " AND ct.status = 'Ativo'") . "$w ORDER BY ct.numero DESC LIMIT 15", array_merge([$tid], $p)) as $r)
            $out[] = ['valor' => 'contrato:' . $r['id'], 'tipo' => 'contrato', 'nome' => 'Contrato ' . $r['numero'] . ($r['nome'] ? ' · ' . $r['nome'] : ''),
                      'sub' => ($enc ? 'Contrato · ' . $r['status'] : 'Contrato ativo') . ($r['valor_mensal'] !== null ? ' · ' . fin_br($r['valor_mensal']) . '/mês' : '')];
        [$w, $p] = $filtro('ch');
        foreach (linhas("SELECT ch.id, ch.numero, ch.status, ch.tipo_servico, cl.nome FROM chamados ch LEFT JOIN clientes cl ON cl.tenant_id = ch.tenant_id AND cl.id = ch.cliente_id
                          WHERE ch.tenant_id = ? AND ch.excluido_em IS NULL AND ch.status " . ($enc ? "<> 'Não Aprovado'" : "NOT IN ('Concluído','Não Aprovado')") . "$w ORDER BY ch.numero DESC LIMIT 25", array_merge([$tid], $p)) as $r)
            $out[] = ['valor' => 'chamado:' . $r['id'], 'tipo' => 'chamado', 'nome' => 'Chamado ' . $r['numero'] . ($r['nome'] ? ' · ' . $r['nome'] : ''),
                      'sub' => trim(($r['tipo_servico'] ?: '') . ' · ' . $r['status'], ' ·')];
        return $out;
    },

    /* {tipo: receber|pagar, filtro: abertos|vencidos|semvenc|quitados|cancelados|todos, busca, de, ate, categoriaId, centroId, contaId, pagina} */
    'titulos.listar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $tipo = ($d['tipo'] ?? '') === 'pagar' ? 'pagar' : 'receber';
        $w = "t.tenant_id = ? AND t.tipo = ? AND t.excluido_em IS NULL"; $p = [$tid, $tipo];
        $hoje = fin_hoje();
        $f = (string) ($d['filtro'] ?? 'abertos');
        if ($f === 'abertos') $w .= " AND t.status IN ('aberto','parcial')";
        elseif ($f === 'vencidos') { $w .= " AND t.status IN ('aberto','parcial') AND t.vencimento < ?"; $p[] = $hoje; }
        elseif ($f === 'semvenc') $w .= " AND t.status IN ('aberto','parcial') AND t.vencimento IS NULL";
        elseif ($f === 'quitados') $w .= " AND t.status = 'quitado'";
        elseif ($f === 'cancelados') $w .= " AND t.status = 'cancelado'";
        $de = fin_data($d['de'] ?? '', false); $ate = fin_data($d['ate'] ?? '', false);
        /* v1.38.0: {comAvulsos: 1} em Todos e Pagos/Recebidos junta os movimentos AVULSOS (lançados direto do extrato,
           tarifa, ajuste) — saídas em A pagar, entradas em A receber; transferência entre contas fica de fora.
           Em Todos a data passa a ser a mostrada na lista: quitação (se quitado) ou vencimento. */
        $avulsos = !empty($d['comAvulsos']) && in_array($f, ['todos', 'quitados'], true) && empty($d['vinculo']);
        $dataTit = $f === 'quitados' ? 't.quitado_em' : 'COALESCE(t.quitado_em, t.vencimento, t.competencia)';
        $campoData = $f === 'quitados' ? 't.quitado_em' : ($avulsos ? 'COALESCE(t.quitado_em, t.vencimento)' : 't.vencimento');
        if ($de) { $w .= " AND $campoData >= ?"; $p[] = $de; }
        if ($ate) { $w .= " AND $campoData <= ?"; $p[] = $ate; }
        foreach (['centroId' => 't.centro_id', 'contaId' => 't.conta_id'] as $k => $col)
            if (!empty($d[$k])) { $w .= " AND $col = ?"; $p[] = (int) $d[$k]; }
        if (!empty($d['categoriaId'])) $w .= " AND t.categoria_id IN (" . fin_cat_ids($tid, $d['categoriaId']) . ")";   /* v1.26.0: com as subcategorias */
        $busca = txt($d['busca'] ?? '', 80);
        if ($busca !== '') {
            $w .= " AND (t.descricao LIKE ? OR t.documento LIKE ? OR cl.nome LIKE ? OR f.nome LIKE ?" . (ctype_digit($busca) ? " OR (t.origem_tipo = 'chamado' AND t.origem_id IN (SELECT id FROM chamados WHERE tenant_id = t.tenant_id AND numero = ?))"
                . (fin_tem_vinculo() ? " OR (t.vinculo_tipo = 'chamado' AND t.vinculo_id IN (SELECT id FROM chamados WHERE tenant_id = t.tenant_id AND numero = ?))" : '') : '') . ")";
            $l = '%' . $busca . '%'; array_push($p, $l, $l, $l, $l); if (ctype_digit($busca)) { $p[] = (int) $busca; if (fin_tem_vinculo()) $p[] = (int) $busca; }
        }
        /* v1.25.3: {vinculo: "chamado:ID"|"contrato:ID"} — o que veio dele e o que foi ligado a ele */
        if (preg_match('/^(chamado|contrato):(\d+)$/', (string) ($d['vinculo'] ?? ''), $mv)) {
            $w .= fin_tem_vinculo() ? " AND ((t.origem_tipo = ? AND t.origem_id = ?) OR (t.vinculo_tipo = ? AND t.vinculo_id = ?))" : " AND t.origem_tipo = ? AND t.origem_id = ?";
            array_push($p, $mv[1], (int) $mv[2]); if (fin_tem_vinculo()) array_push($p, $mv[1], (int) $mv[2]);
        }
        $from = " FROM fin_titulos t LEFT JOIN clientes cl ON cl.tenant_id = t.tenant_id AND cl.id = t.cliente_id LEFT JOIN fornecedores f ON f.tenant_id = t.tenant_id AND f.id = t.fornecedor_id WHERE $w";
        $tot = linha("SELECT COUNT(*) AS n, COALESCE(SUM(t.valor), 0) AS valor, COALESCE(SUM(CASE WHEN t.status IN ('aberto','parcial') THEN t.valor - t.pago ELSE 0 END), 0) AS saldo" . $from, $p);
        $pagina = max(1, (int) ($d['pagina'] ?? 1));
        if ($avulsos) return fin_listar_com_avulsos($tid, $tipo, $d, $from, $p, $dataTit, $tot, $pagina, $de, $ate, $busca);
        $ordem = $f === 'quitados' ? 't.quitado_em DESC, t.id DESC' : ($f === 'todos' || $f === 'cancelados' ? 't.id DESC' : 't.vencimento IS NULL, t.vencimento, t.id');
        $itens = linhas(FIN_SELECT_TITULO . " WHERE " . $w . " ORDER BY $ordem LIMIT " . FIN_POR_PAGINA . " OFFSET " . (($pagina - 1) * FIN_POR_PAGINA), $p);
        return ['itens' => fin_vinculos_rotular($tid, array_map('fin_titulo_publico', $itens)), 'total' => (int) $tot['n'], 'somaValor' => round((float) $tot['valor'], 2),
                'somaSaldo' => round((float) $tot['saldo'], 2), 'porPagina' => FIN_POR_PAGINA, 'pagina' => $pagina];
    },

    'titulo.obter' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $t = linha(FIN_SELECT_TITULO . " WHERE t.id = ? AND t.tenant_id = ? AND t.excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid]);
        if (!$t) erro('Lançamento não encontrado.', 404, 'NAO_ENCONTRADO');
        $o = fin_vinculos_rotular($tid, [fin_titulo_publico($t)])[0];   /* v1.25.3 */
        $o['notaEfetiva'] = (int) valor("SELECT " . fin_sql_nota('t') . " FROM fin_titulos t WHERE t.id = ? AND t.tenant_id = ?", [$o['id'], $tid]) === 1;   /* v1.25.1 */
        $o['baixas'] = array_map(function ($m) {
            return ['id' => (int) $m['id'], 'data' => $m['data'], 'valor' => abs((float) $m['valor']), 'conta' => $m['conta_nome'], 'descricao' => $m['descricao'],
                    'conciliado' => (int) $m['conciliado'] === 1, 'estornado' => $m['excluido_em'] !== null, 'criadoEm' => $m['criado_em']];
        }, linhas("SELECT m.*, c.nome AS conta_nome FROM fin_movimentos m LEFT JOIN fin_contas c ON c.tenant_id = m.tenant_id AND c.id = m.conta_id
                    WHERE m.tenant_id = ? AND m.titulo_id = ? ORDER BY m.data, m.id", [$tid, $o['id']]));
        $o['eventos'] = array_map(function ($e) { return ['tipo' => $e['tipo'], 'texto' => $e['texto'], 'quem' => $e['nome'], 'em' => $e['criado_em']]; },
            linhas("SELECT e.*, u.nome FROM fin_eventos e LEFT JOIN usuarios u ON u.tenant_id = e.tenant_id AND u.id = e.usuario_id
                     WHERE e.tenant_id = ? AND e.titulo_id = ? ORDER BY e.id DESC LIMIT 60", [$tid, $o['id']]));
        $o['anexos'] = array_map(function ($a) { return ['id' => (int) $a['id'], 'nome' => $a['nome_original'], 'mime' => $a['mime'], 'em' => $a['criado_em']]; },
            linhas("SELECT * FROM anexos WHERE tenant_id = ? AND dono_tipo = 'fin' AND dono_id = ? AND excluido_em IS NULL ORDER BY id", [$tid, $o['id']]));
        if ($o['grupo']) $o['irmaos'] = array_map(function ($x) { return ['id' => (int) $x['id'], 'parcela' => (int) $x['parcela'], 'vencimento' => $x['vencimento'], 'valor' => (float) $x['valor'], 'status' => $x['status']]; },
            linhas("SELECT id, parcela, vencimento, valor, status FROM fin_titulos WHERE tenant_id = ? AND grupo = ? AND excluido_em IS NULL ORDER BY parcela", [$tid, $o['grupo']]));
        return $o;
    },

    /* criar (com parcelas) ou editar.
       {id?, tipo, descricao, clienteId?|fornecedorId?, categoriaId, centroId?, contaId?, forma?, valor, competencia, vencimento?, documento?, obs?,
        parcelas? (só ao criar: divide o valor em N parcelas mensais a partir do vencimento), forcar? (ignora o aviso de duplicado)} */
    'titulo.salvar' => function ($d) {
        $u = fin_u(); fin_tabelas();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $atual = $id ? fin_titulo_da_empresa($id, $tid) : null;
        $tipo = $atual ? $atual['tipo'] : (($d['tipo'] ?? '') === 'pagar' ? 'pagar' : 'receber');
        $descricao = txt($d['descricao'] ?? '', 255);
        if ($descricao === '') erro('Informe a descrição.');
        $valor = fin_valor($d['valor'] ?? 0);
        $cliente = $tipo === 'receber' ? fin_id_da_empresa('clientes', $d['clienteId'] ?? 0, $tid, 'Cliente') : null;
        $forn = $tipo === 'pagar' ? fin_id_da_empresa('fornecedores', $d['fornecedorId'] ?? 0, $tid, 'Fornecedor') : null;
        $cat = fin_id_da_empresa('fin_categorias', $d['categoriaId'] ?? 0, $tid, 'Categoria');
        if (!$cat) erro('Escolha a categoria (ela decide a linha da DRE).');
        $catTipo = valor("SELECT tipo FROM fin_categorias WHERE id = ? AND tenant_id = ?", [$cat, $tid]);
        if ($catTipo !== ($tipo === 'receber' ? 'receita' : 'despesa')) erro('A categoria escolhida é de ' . ($catTipo === 'receita' ? 'receita' : 'despesa') . '. Escolha uma de ' . ($tipo === 'receber' ? 'receita' : 'despesa') . '.');
        $centro = fin_id_da_empresa('fin_centros', $d['centroId'] ?? 0, $tid, 'Centro de custo');
        $conta = fin_id_da_empresa('fin_contas', $d['contaId'] ?? 0, $tid, 'Conta');
        $forma = txt_ou_null($d['forma'] ?? '', 30);
        $venc = fin_data($d['vencimento'] ?? '', false, 'o vencimento');
        $comp = fin_data($d['competencia'] ?? '', false, 'a competência') ?: ($atual ? $atual['competencia'] : ($venc ?: fin_hoje()));
        $campos = ['descricao' => $descricao, 'cliente_id' => $cliente, 'fornecedor_id' => $forn, 'categoria_id' => $cat, 'centro_id' => $centro, 'conta_id' => $conta,
                   'forma' => $forma, 'valor' => $valor, 'competencia' => $comp, 'vencimento' => $venc,
                   'documento' => txt_ou_null($d['documento'] ?? '', 60), 'obs' => txt_ou_null($d['obs'] ?? '', 2000)];
        /* v1.25.1: com nota? (só a receber). null = segue a origem (chamado/contrato/recorrente) */
        if (fin_tem_nota() && array_key_exists('comNota', $d))
            $campos['com_nota'] = $tipo !== 'receber' || $d['comNota'] === null || $d['comNota'] === '' ? null : (!empty($d['comNota']) ? 1 : 0);
        /* v1.25.3: chamado ou contrato (opcional). Título que veio do chamado/contrato já é dele. */
        if (fin_tem_vinculo() && array_key_exists('vinculo', $d) && !($atual && in_array($atual['origem_tipo'], ['chamado', 'contrato'], true)))
            [$campos['vinculo_tipo'], $campos['vinculo_id']] = fin_vinculo_ler($d, $tid, $atual);

        if ($atual) {
            if ($atual['status'] === 'cancelado') erro('Lançamento cancelado. Reabra antes de editar.');
            /* v1.23.0: parcela gerada pelo chamado — o valor vem do orçamento do chamado */
            if ($atual['origem_tipo'] === 'chamado' && strpos((string) $atual['chave_origem'], ':imp') === false && abs((float) $atual['valor'] - $valor) > 0.004)
                erro('Esta parcela vem do chamado: para mudar o valor, altere o orçamento ou as condições de pagamento do chamado.');
            if ($valor < (float) $atual['pago'] - 0.004) erro('O valor não pode ficar menor que o já ' . ($tipo === 'receber' ? 'recebido' : 'pago') . ' (' . fin_br($atual['pago']) . ').');
            db()->beginTransaction();
            $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
            q("UPDATE fin_titulos SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [$id, $tid]));
            $mud = [];
            if ((float) $atual['valor'] !== $valor) $mud[] = 'valor ' . fin_br($atual['valor']) . ' → ' . fin_br($valor);
            if ((string) $atual['vencimento'] !== (string) $venc) $mud[] = 'vencimento ' . fin_dbr($atual['vencimento']) . ' → ' . fin_dbr($venc);
            if ($atual['descricao'] !== $descricao) $mud[] = 'descrição alterada';
            if ((int) $atual['categoria_id'] !== (int) $cat) $mud[] = 'categoria alterada';
            if ((string) $atual['competencia'] !== (string) $comp) $mud[] = 'competência ' . fin_dbr($atual['competencia']) . ' → ' . fin_dbr($comp);
            if (array_key_exists('vinculo_tipo', $campos) && ((string) ($atual['vinculo_tipo'] ?? '') !== (string) $campos['vinculo_tipo'] || (int) ($atual['vinculo_id'] ?? 0) !== (int) $campos['vinculo_id']))
                $mud[] = $campos['vinculo_tipo'] ? 'vinculado ao ' . $campos['vinculo_tipo'] . ' ' . valor("SELECT numero FROM " . ($campos['vinculo_tipo'] === 'chamado' ? 'chamados' : 'contratos') . " WHERE id = ? AND tenant_id = ?", [$campos['vinculo_id'], $tid]) : 'vínculo com chamado/contrato retirado';
            if (array_key_exists('com_nota', $campos) && (string) ($atual['com_nota'] ?? '') !== (string) $campos['com_nota']) $mud[] = $campos['com_nota'] === null ? 'nota: conforme a origem' : ($campos['com_nota'] ? 'com nota fiscal' : 'sem nota fiscal');
            if ($mud) fin_evento($tid, $id, 'edicao', 'Alterado: ' . implode('; ', $mud) . '.');
            fin_recalcular($tid, $id);
            db()->commit();
            auditar('fin_titulo_editar', 'fin_titulos', $id, $descricao . ($mud ? ' · ' . implode('; ', $mud) : ''));
            return fin_titulo_publico(linha(FIN_SELECT_TITULO . " WHERE t.id = ? AND t.tenant_id = ?", [$id, $tid]));
        }

        $n = max(1, min(60, (int) ($d['parcelas'] ?? 1)));
        if ($n > 1 && !$venc) erro('Para parcelar, informe o vencimento da 1ª parcela.');
        $base = floor($valor / $n * 100) / 100;
        $resto = round($valor - $base * $n, 2);
        /* aviso de duplicado: mesma pessoa, mesmo valor e mesmo vencimento */
        if (empty($d['forcar'])) {
            $v1 = round($base + $resto, 2);
            $dup = linha("SELECT id, descricao FROM fin_titulos WHERE tenant_id = ? AND tipo = ? AND excluido_em IS NULL AND status <> 'cancelado' AND valor = ?
                            AND " . ($venc ? "vencimento = ?" : "vencimento IS NULL") . " AND " . ($cliente ? "cliente_id = ?" : ($forn ? "fornecedor_id = ?" : "cliente_id IS NULL AND fornecedor_id IS NULL")) . " LIMIT 1",
                         array_values(array_filter([$tid, $tipo, $v1, $venc, $cliente ?: $forn], function ($x) { return $x !== null && $x !== 0; })));
            if ($dup) erro('Já existe um lançamento igual (mesmo valor, vencimento e ' . ($tipo === 'receber' ? 'cliente' : 'fornecedor') . '): "' . $dup['descricao'] . '". Confirme para lançar mesmo assim.', 409, 'DUPLICADO');
        }
        /* v1.27.0: lançar já pago/recebido no mesmo passo {jaPago, pagoEm, pagoConta} (só sem parcelas) */
        $jaPago = !empty($d['jaPago']) && $n === 1;
        if ($jaPago) {
            $pgData = fin_data($d['pagoEm'] ?? '', false) ?: fin_hoje();
            $pgConta = fin_id_da_empresa('fin_contas', $d['pagoConta'] ?? ($conta ?? 0), $tid, 'Conta');
            if (!$pgConta) erro('Escolha a conta em que o dinheiro ' . ($tipo === 'receber' ? 'entrou' : 'saiu') . '.');
            $pgC = linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ?", [$pgConta, $tid]);
            if ($pgData < $pgC['saldo_inicial_em']) erro('A data é anterior ao saldo inicial da conta ' . $pgC['nome'] . ' (' . fin_dbr($pgC['saldo_inicial_em']) . ').');
        }
        $grupo = $n > 1 ? bin2hex(random_bytes(8)) : null;
        $ids = [];
        db()->beginTransaction();
        for ($i = 1; $i <= $n; $i++) {
            $c = $campos;
            $c['valor'] = $i === 1 ? round($base + $resto, 2) : $base;
            if ($n > 1) {
                $c['vencimento'] = date('Y-m-d', strtotime($venc . ' +' . ($i - 1) . ' month'));
                if ((int) substr($c['vencimento'], 8, 2) !== (int) substr($venc, 8, 2)) $c['vencimento'] = date('Y-m-t', strtotime(substr($c['vencimento'], 0, 7) . '-01 -1 month'));   /* 31/01 + 1 mês = fim de fevereiro */
                $c['descricao'] = mb_substr($descricao . ' (' . $i . '/' . $n . ')', 0, 255);
            }
            $c += ['tenant_id' => $tid, 'tipo' => $tipo, 'status' => 'aberto', 'parcela' => $i, 'parcelas' => $n, 'grupo' => $grupo, 'origem_tipo' => 'manual', 'criado_por' => (int) $u['id']];
            q("INSERT INTO fin_titulos (" . implode(', ', array_keys($c)) . ") VALUES (" . implode(', ', array_fill(0, count($c), '?')) . ")", array_values($c));
            $nid = (int) db()->lastInsertId();
            $ids[] = $nid;
            fin_evento($tid, $nid, 'criacao', 'Lançado: ' . fin_br($c['valor']) . ', vencimento ' . fin_dbr($c['vencimento']) . '.');
            if ($jaPago) {
                q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, titulo_id, categoria_id, centro_id, descricao, criado_por) VALUES (?, ?, ?, ?, 'baixa', ?, ?, ?, ?, ?)",
                  [$tid, $pgConta, $pgData, $tipo === 'receber' ? $c['valor'] : -$c['valor'], $nid, $cat, $centro, mb_substr($descricao, 0, 255), (int) $u['id']]);
                fin_recalcular($tid, $nid);
                fin_evento($tid, $nid, 'baixa', ($tipo === 'receber' ? 'Recebido ' : 'Pago ') . fin_br($c['valor']) . ' em ' . fin_dbr($pgData) . ' · ' . $pgC['nome'] . ' (lançado já ' . ($tipo === 'receber' ? 'recebido' : 'pago') . ').');
            }
        }
        db()->commit();
        auditar('fin_titulo_criar', 'fin_titulos', $ids[0], ($tipo === 'receber' ? 'A receber' : 'A pagar') . ' · ' . $descricao . ' · ' . fin_br($valor) . ($n > 1 ? ' em ' . $n . 'x' : ''));
        return ['ids' => $ids, 'titulo' => fin_titulo_publico(linha(FIN_SELECT_TITULO . " WHERE t.id = ? AND t.tenant_id = ?", [$ids[0], $tid]))];
    },

    /* registrar recebimento / pagamento (total ou parcial): {id, valor?, data?, contaId, obs?} */
    'titulo.baixar' => function ($d) {
        $u = fin_u(); fin_tabelas();
        $tid = tenant();
        $t = fin_titulo_da_empresa($d['id'] ?? 0, $tid);
        if (!in_array($t['status'], ['aberto', 'parcial'], true)) erro($t['status'] === 'quitado' ? 'Este lançamento já está quitado.' : 'Lançamento cancelado.');
        $saldo = round((float) $t['valor'] - (float) $t['pago'], 2);
        $valor = isset($d['valor']) && $d['valor'] !== '' ? fin_valor($d['valor']) : $saldo;
        if ($valor > $saldo + 0.004) erro('O valor passa do que falta (' . fin_br($saldo) . '). Juros ou multa: aumente o valor do lançamento antes, ou lance à parte.');
        $data = fin_data($d['data'] ?? '', false) ?: fin_hoje();
        $conta = fin_id_da_empresa('fin_contas', $d['contaId'] ?? ($t['conta_id'] ?? 0), $tid, 'Conta');
        if (!$conta) erro('Escolha a conta em que o dinheiro ' . ($t['tipo'] === 'receber' ? 'entrou' : 'saiu') . '.');
        $c = linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ?", [$conta, $tid]);
        if ($data < $c['saldo_inicial_em']) erro('A data é anterior ao saldo inicial da conta ' . $c['nome'] . ' (' . fin_dbr($c['saldo_inicial_em']) . ').');
        db()->beginTransaction();
        q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, titulo_id, categoria_id, centro_id, descricao, criado_por) VALUES (?, ?, ?, ?, 'baixa', ?, ?, ?, ?, ?)",
          [$tid, $conta, $data, $t['tipo'] === 'receber' ? $valor : -$valor, (int) $t['id'], $t['categoria_id'], $t['centro_id'],
           mb_substr($t['descricao'] . (txt($d['obs'] ?? '', 200) !== '' ? ' · ' . txt($d['obs'], 200) : ''), 0, 255), (int) $u['id']]);
        fin_recalcular($tid, (int) $t['id']);
        fin_evento($tid, (int) $t['id'], 'baixa', ($t['tipo'] === 'receber' ? 'Recebido ' : 'Pago ') . fin_br($valor) . ' em ' . fin_dbr($data) . ' · ' . $c['nome'] . '.');
        if ($t['origem_tipo'] === 'chamado' && $t['origem_id']) fch_atualizar_recebido($tid, (int) $t['origem_id']);   /* v1.23.0: "Recebido" do chamado */
        db()->commit();
        auditar('fin_baixa', 'fin_titulos', (int) $t['id'], $t['descricao'] . ' · ' . fin_br($valor));
        return fin_titulo_publico(linha(FIN_SELECT_TITULO . " WHERE t.id = ? AND t.tenant_id = ?", [(int) $t['id'], $tid]));
    },

    /* desfaz uma baixa (o movimento fica marcado como estornado): {movimentoId, motivo?} */
    'baixa.estornar' => function ($d) {
        $u = fin_u(); fin_tabelas();
        $tid = tenant();
        $m = linha("SELECT * FROM fin_movimentos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL AND titulo_id IS NOT NULL", [(int) ($d['movimentoId'] ?? 0), $tid]);
        if (!$m) erro('Baixa não encontrada.', 404);
        if ((int) $m['conciliado'] === 1) erro('Esta baixa já foi conciliada com o extrato. Desfaça a conciliação antes.');
        db()->beginTransaction();
        q("UPDATE fin_movimentos SET excluido_em = NOW(), excluido_por = ? WHERE id = ? AND tenant_id = ?", [(int) $u['id'], $m['id'], $tid]);
        fin_recalcular($tid, (int) $m['titulo_id']);
        $tt = linha("SELECT origem_tipo, origem_id FROM fin_titulos WHERE id = ? AND tenant_id = ?", [(int) $m['titulo_id'], $tid]);
        if ($tt && $tt['origem_tipo'] === 'chamado' && $tt['origem_id']) fch_atualizar_recebido($tid, (int) $tt['origem_id']);   /* v1.23.0 */
        fin_evento($tid, (int) $m['titulo_id'], 'estorno', 'Baixa de ' . fin_br(abs($m['valor'])) . ' (' . fin_dbr($m['data']) . ') estornada' . (txt($d['motivo'] ?? '', 200) !== '' ? ': ' . txt($d['motivo'], 200) : '') . '.');
        db()->commit();
        auditar('fin_estorno', 'fin_titulos', (int) $m['titulo_id'], fin_br(abs($m['valor'])));
        return fin_titulo_publico(linha(FIN_SELECT_TITULO . " WHERE t.id = ? AND t.tenant_id = ?", [(int) $m['titulo_id'], $tid]));
    },

    /* {id, motivo} — só sem baixas */
    'titulo.cancelar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $t = fin_titulo_da_empresa($d['id'] ?? 0, $tid);
        if ((float) $t['pago'] > 0) erro('Este lançamento tem ' . ($t['tipo'] === 'receber' ? 'recebimento' : 'pagamento') . ' registrado. Estorne as baixas antes de cancelar.');
        $motivo = txt($d['motivo'] ?? '', 300);
        if ($motivo === '') erro('Informe o motivo do cancelamento.');
        q("UPDATE fin_titulos SET status = 'cancelado' WHERE id = ? AND tenant_id = ?", [$t['id'], $tid]);
        fin_evento($tid, (int) $t['id'], 'cancelamento', 'Cancelado: ' . $motivo);
        auditar('fin_titulo_cancelar', 'fin_titulos', (int) $t['id'], $t['descricao'] . ' · ' . $motivo);
        return fin_titulo_publico(linha(FIN_SELECT_TITULO . " WHERE t.id = ? AND t.tenant_id = ?", [(int) $t['id'], $tid]));
    },

    'titulo.reabrir' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $t = fin_titulo_da_empresa($d['id'] ?? 0, $tid);
        if ($t['status'] !== 'cancelado') erro('Só lançamento cancelado pode ser reaberto.');
        q("UPDATE fin_titulos SET status = 'aberto' WHERE id = ? AND tenant_id = ?", [$t['id'], $tid]);
        fin_recalcular($tid, (int) $t['id']);
        fin_evento($tid, (int) $t['id'], 'reabertura', 'Lançamento reaberto.');
        auditar('fin_titulo_reabrir', 'fin_titulos', (int) $t['id'], $t['descricao']);
        return fin_titulo_publico(linha(FIN_SELECT_TITULO . " WHERE t.id = ? AND t.tenant_id = ?", [(int) $t['id'], $tid]));
    },

    /* excluir de vez só o que foi lançado à mão, por engano, sem baixa (some das listas; fica na auditoria) */
    'titulo.excluir' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $t = fin_titulo_da_empresa($d['id'] ?? 0, $tid);
        if ($t['origem_tipo'] !== 'manual') erro('Lançamento gerado por outro módulo (chamado/contrato) não pode ser excluído: cancele-o.');
        if ((int) valor("SELECT COUNT(*) FROM fin_movimentos WHERE tenant_id = ? AND titulo_id = ?", [$tid, $t['id']])) erro('Lançamento com baixa (mesmo estornada) não pode ser excluído: cancele-o.');
        q("UPDATE fin_titulos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$t['id'], $tid]);
        auditar('fin_titulo_excluir', 'fin_titulos', (int) $t['id'], $t['descricao'] . ' · ' . fin_br($t['valor']));
        return true;
    },

    /* anexo do lançamento (boleto, nota, comprovante): multipart {id, arquivo} */
    'titulo.anexo.enviar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $t = fin_titulo_da_empresa($d['id'] ?? 0, $tid);
        $aid = salvar_anexo($_FILES['arquivo'] ?? null, 'fin', (int) $t['id'], 'titulo', false, true);
        fin_evento($tid, (int) $t['id'], 'anexo', 'Arquivo anexado: ' . mb_substr((string) ($_FILES['arquivo']['name'] ?? ''), 0, 150));
        return ['id' => $aid];
    },
    'titulo.anexo.excluir' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $a = linha("SELECT * FROM anexos WHERE id = ? AND tenant_id = ? AND dono_tipo = 'fin' AND excluido_em IS NULL", [(int) ($d['anexoId'] ?? 0), $tid]);
        if (!$a) erro('Arquivo não encontrado.', 404);
        q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$a['id'], $tid]);
        fin_evento($tid, (int) $a['dono_id'], 'anexo', 'Arquivo removido: ' . $a['nome_original']);
        return true;
    },

    /* ---------------- movimentos da conta ---------------- */

    /* extrato interno da conta: {contaId, de, ate} */
    'movimentos.listar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $c = linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['contaId'] ?? 0), $tid]);
        if (!$c) erro('Conta não encontrada.', 404);
        $de = fin_data($d['de'] ?? '', false) ?: date('Y-m-01');
        $ate = fin_data($d['ate'] ?? '', false) ?: date('Y-m-t');
        if ($de < $c['saldo_inicial_em']) $de = $c['saldo_inicial_em'];
        $anterior = fin_saldo_conta($tid, $c, date('Y-m-d', strtotime($de . ' -1 day')));
        if ($de === $c['saldo_inicial_em']) $anterior = (float) $c['saldo_inicial'];
        $saldo = $anterior;
        $itens = [];
        foreach (linhas("SELECT m.*, t.descricao AS titulo_desc, cat.nome AS categoria_nome FROM fin_movimentos m
                           LEFT JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                           LEFT JOIN fin_categorias cat ON cat.tenant_id = m.tenant_id AND cat.id = COALESCE(m.categoria_id, t.categoria_id)
                          WHERE m.tenant_id = ? AND m.conta_id = ? AND m.excluido_em IS NULL AND m.data BETWEEN ? AND ? ORDER BY m.data, m.id",
                        [$tid, $c['id'], $de, $ate]) as $m) {
            $saldo = round($saldo + (float) $m['valor'], 2);
            $itens[] = ['id' => (int) $m['id'], 'data' => $m['data'], 'valor' => (float) $m['valor'], 'tipo' => $m['tipo'], 'descricao' => $m['descricao'] ?: $m['titulo_desc'],
                        'categoria' => $m['categoria_nome'], 'tituloId' => $m['titulo_id'] !== null ? (int) $m['titulo_id'] : null, 'saldo' => $saldo,
                        'conciliado' => (int) $m['conciliado'] === 1, 'transferencia' => $m['transferencia']];
        }
        return ['conta' => fin_conta_publica($tid, $c), 'de' => $de, 'ate' => $ate, 'saldoAnterior' => round($anterior, 2), 'saldoFinal' => $saldo, 'itens' => $itens];
    },

    /* movimento sem título (tarifa, rendimento, ajuste): {contaId, data, sentido: entrada|saida, valor, categoriaId, centroId?, descricao} */
    'movimento.salvar' => function ($d) {
        $u = fin_u(); fin_tabelas();
        $tid = tenant();
        $conta = fin_id_da_empresa('fin_contas', $d['contaId'] ?? 0, $tid, 'Conta');
        if (!$conta) erro('Escolha a conta.');
        $c = linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ?", [$conta, $tid]);
        $valor = fin_valor($d['valor'] ?? 0);
        $data = fin_data($d['data'] ?? '', false) ?: fin_hoje();
        if ($data < $c['saldo_inicial_em']) erro('A data é anterior ao saldo inicial da conta (' . fin_dbr($c['saldo_inicial_em']) . ').');
        $entrada = ($d['sentido'] ?? '') === 'entrada';
        $cat = fin_id_da_empresa('fin_categorias', $d['categoriaId'] ?? 0, $tid, 'Categoria');
        if (!$cat) erro('Escolha a categoria.');
        $desc = txt($d['descricao'] ?? '', 255);
        if ($desc === '') erro('Informe a descrição.');
        [$vt, $vi] = fin_vinculo_ler($d, $tid);   /* v1.25.3 */
        q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, categoria_id, centro_id, descricao, criado_por) VALUES (?, ?, ?, ?, 'avulso', ?, ?, ?, ?)",
          [$tid, $conta, $data, $entrada ? $valor : -$valor, $cat, fin_id_da_empresa('fin_centros', $d['centroId'] ?? 0, $tid, 'Centro de custo'), $desc, (int) $u['id']]);
        $id = (int) db()->lastInsertId();
        fin_vinculo_mov($tid, $id, $vt, $vi);
        auditar('fin_movimento', 'fin_movimentos', $id, ($entrada ? '+' : '−') . fin_br($valor) . ' · ' . $desc);
        return ['id' => $id];
    },

    /* {deId, paraId, valor, data, descricao?} — não é receita nem despesa */
    'transferir' => function ($d) {
        $u = fin_u(); fin_tabelas();
        $tid = tenant();
        $de = fin_id_da_empresa('fin_contas', $d['deId'] ?? 0, $tid, 'Conta de origem');
        $para = fin_id_da_empresa('fin_contas', $d['paraId'] ?? 0, $tid, 'Conta de destino');
        if (!$de || !$para || $de === $para) erro('Escolha duas contas diferentes.');
        $valor = fin_valor($d['valor'] ?? 0);
        $data = fin_data($d['data'] ?? '', false) ?: fin_hoje();
        $cs = []; foreach (linhas("SELECT * FROM fin_contas WHERE tenant_id = ? AND id IN (?, ?)", [$tid, $de, $para]) as $c) $cs[(int) $c['id']] = $c;
        foreach ($cs as $c) if ($data < $c['saldo_inicial_em']) erro('A data é anterior ao saldo inicial da conta ' . $c['nome'] . '.');
        $g = bin2hex(random_bytes(8));
        $desc = txt($d['descricao'] ?? '', 200) ?: ('Transferência ' . $cs[$de]['nome'] . ' → ' . $cs[$para]['nome']);
        db()->beginTransaction();
        q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, descricao, transferencia, criado_por) VALUES (?, ?, ?, ?, 'transferencia', ?, ?, ?)", [$tid, $de, $data, -$valor, $desc, $g, (int) $u['id']]);
        q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, descricao, transferencia, criado_por) VALUES (?, ?, ?, ?, 'transferencia', ?, ?, ?)", [$tid, $para, $data, $valor, $desc, $g, (int) $u['id']]);
        /* v1.25.2: pagamento de fatura — marca a fatura paga no lado do cartão */
        $fat = (string) ($d['fatura'] ?? '');
        if ($fat !== '' && preg_match('/^\d{4}-\d{2}$/', $fat) && fin_tem_cartao() && $cs[$para]['tipo'] === 'cartao')
            q("UPDATE fin_movimentos SET fatura = ? WHERE id = ? AND tenant_id = ?", [$fat, (int) db()->lastInsertId(), $tid]);
        db()->commit();
        auditar('fin_transferencia', 'fin_contas', $de, $desc . ' · ' . fin_br($valor));
        return true;
    },

    /* estorna movimento sem título (avulso ou transferência — os dois lados juntos) */
    'movimento.estornar' => function ($d) {
        $u = fin_u(); fin_tabelas();
        $tid = tenant();
        $m = linha("SELECT * FROM fin_movimentos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid]);
        if (!$m) erro('Movimento não encontrado.', 404);
        if ($m['titulo_id']) erro('Este movimento é baixa de um lançamento: estorne pelo lançamento.');
        if ((int) $m['conciliado'] === 1) erro('Movimento conciliado com o extrato. Desfaça a conciliação antes.');
        if ($m['transferencia']) q("UPDATE fin_movimentos SET excluido_em = NOW(), excluido_por = ? WHERE tenant_id = ? AND transferencia = ?", [(int) $u['id'], $tid, $m['transferencia']]);
        else q("UPDATE fin_movimentos SET excluido_em = NOW(), excluido_por = ? WHERE id = ? AND tenant_id = ?", [(int) $u['id'], $m['id'], $tid]);
        auditar('fin_movimento_estornar', 'fin_movimentos', (int) $m['id'], fin_br($m['valor']) . ' · ' . $m['descricao']);
        return true;
    },

    /* ---------------- cadastros ---------------- */

    'conta.salvar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $nome = txt($d['nome'] ?? '', 80);
        if ($nome === '') erro('Dê um nome à conta (ex.: Cora PJ, Caixa).');
        $tipo = isset(FIN_TIPOS_CONTA[$d['tipo'] ?? '']) ? $d['tipo'] : 'banco';
        $em = fin_data($d['saldoInicialEm'] ?? '', true, 'a data do saldo inicial');
        $campos = ['nome' => $nome, 'tipo' => $tipo, 'banco' => txt_ou_null($d['banco'] ?? '', 60), 'agencia' => txt_ou_null($d['agencia'] ?? '', 20),
                   'numero' => txt_ou_null($d['numero'] ?? '', 30), 'saldo_inicial' => fin_num($d['saldoInicial'] ?? 0), 'saldo_inicial_em' => $em,
                   'ativa' => array_key_exists('ativa', $d) && !$d['ativa'] ? 0 : 1];
        /* v1.39.0: sem as colunas do cartão, avisa em vez de gravar só o nome e jogar fora limite e dias */
        if ($tipo === 'cartao' && !fin_tem_cartao()) erro(FIN_MSG_SQL_CARTAO, 409, 'SQL20');
        if (fin_tem_cartao()) {   /* v1.25.2: cartão */
            $dia = function ($v, $r) { $v = (int) $v; if (!$v) return null; if ($v < 1 || $v > 31) erro($r . ': dia entre 1 e 31.'); return $v; };
            $ehCartao = $tipo === 'cartao';
            $campos['limite'] = $ehCartao && trim((string) ($d['limite'] ?? '')) !== '' ? fin_num($d['limite']) : null;
            $campos['dia_melhor_compra'] = $ehCartao ? $dia($d['diaMelhorCompra'] ?? 0, 'Melhor dia de compra') : null;
            $campos['dia_vencimento'] = $ehCartao ? $dia($d['diaVencimento'] ?? 0, 'Vencimento da fatura') : null;
            if ($ehCartao && (!$campos['dia_melhor_compra'] || !$campos['dia_vencimento'])) erro('No cartão, informe o melhor dia de compra e o dia de vencimento da fatura.');
        }
        if ($id) {
            $a = linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
            if (!$a) erro('Conta não encontrada.', 404);
            if ($em > $a['saldo_inicial_em'] && (int) valor("SELECT COUNT(*) FROM fin_movimentos WHERE tenant_id = ? AND conta_id = ? AND excluido_em IS NULL AND data < ?", [$tid, $id, $em]))
                erro('Há movimentos antes de ' . fin_dbr($em) . ' nesta conta. Escolha uma data de saldo inicial igual ou anterior a eles.');
            $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
            q("UPDATE fin_contas SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [$id, $tid]));
            auditar('fin_conta_editar', 'fin_contas', $id, $nome . ' · saldo inicial ' . fin_br($campos['saldo_inicial']) . ' em ' . fin_dbr($em));
        } else {
            $campos['tenant_id'] = $tid;
            q("INSERT INTO fin_contas (" . implode(', ', array_keys($campos)) . ") VALUES (" . implode(', ', array_fill(0, count($campos), '?')) . ")", array_values($campos));
            $id = (int) db()->lastInsertId();
            auditar('fin_conta_criar', 'fin_contas', $id, $nome);
        }
        return fin_conta_publica($tid, linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ?", [$id, $tid]));
    },
    /* conta com movimento não some: fica inativa */
    'conta.excluir' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        if (!valor("SELECT id FROM fin_contas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid])) erro('Conta não encontrada.', 404);
        $usada = (int) valor("SELECT COUNT(*) FROM fin_movimentos WHERE tenant_id = ? AND conta_id = ? AND excluido_em IS NULL", [$tid, $id]);
        q($usada ? "UPDATE fin_contas SET ativa = 0 WHERE id = ? AND tenant_id = ?" : "UPDATE fin_contas SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$id, $tid]);
        auditar('fin_conta_excluir', 'fin_contas', $id, $usada ? 'inativada' : 'excluída');
        return ['inativada' => (bool) $usada];
    },

    'categoria.salvar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $nome = txt($d['nome'] ?? '', 80);
        if ($nome === '') erro('Informe a descrição.');
        $tipo = ($d['tipo'] ?? '') === 'despesa' ? 'despesa' : 'receita';
        $grupo = isset(FIN_GRUPOS_DRE[$d['grupoDre'] ?? '']) ? $d['grupoDre'] : ($tipo === 'receita' ? 'receita_bruta' : 'despesa_operacional');
        $ativa = array_key_exists('ativa', $d) && !$d['ativa'] ? 0 : 1;
        /* v1.26.0: "dentro de" outra categoria (um nível só). A subcategoria segue a linha da DRE da categoria. */
        $pai = null;
        if (fin_tem_subcat() && (int) ($d['paiId'] ?? 0)) {
            $pc = linha("SELECT * FROM fin_categorias WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) $d['paiId'], $tid]);
            if (!$pc) erro('Categoria não encontrada.');
            if ((int) $pc['id'] === $id) erro('Escolha outra categoria.');
            if (!empty($pc['pai_id'])) erro('"' . $pc['nome'] . '" é um plano de contas, não uma categoria.');
            if ($pc['tipo'] !== $tipo) erro('A categoria "' . $pc['nome'] . '" é de ' . ($pc['tipo'] === 'receita' ? 'crédito (receita)' : 'débito (despesa)') . '.');
            if ($id && (int) valor("SELECT COUNT(*) FROM fin_categorias WHERE tenant_id = ? AND pai_id = ? AND excluido_em IS NULL", [$tid, $id]))
                erro('Esta categoria tem planos de contas: mova ou exclua os planos antes de transformá-la em plano.');
            $pai = (int) $pc['id'];
            $grupo = $pc['grupo_dre'];
        }
        if ($id) {
            $a = linha("SELECT * FROM fin_categorias WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
            if (!$a) erro('Categoria não encontrada.', 404);
            if ($a['tipo'] !== $tipo && (int) valor("SELECT COUNT(*) FROM fin_titulos WHERE tenant_id = ? AND categoria_id = ? AND excluido_em IS NULL", [$tid, $id]))
                erro('Categoria já usada em lançamentos: não dá para trocar entre receita e despesa.');
            if ($a['tipo'] !== $tipo && fin_tem_subcat() && (int) valor("SELECT COUNT(*) FROM fin_categorias WHERE tenant_id = ? AND pai_id = ? AND excluido_em IS NULL", [$tid, $id]))
                erro('Esta categoria tem planos de contas: não dá para trocar entre crédito e débito.');
            q("UPDATE fin_categorias SET nome = ?, tipo = ?, grupo_dre = ?, ativa = ? WHERE id = ? AND tenant_id = ?", [$nome, $tipo, $grupo, $ativa, $id, $tid]);
            /* v1.26.3: código — mudou de categoria ganha o próximo número dela; senão vale o digitado */
            if (fin_tem_codigo() && fin_tem_subcat()) {
                $cod = (int) ($d['codigo'] ?? 0);
                if ((int) ($a['pai_id'] ?? 0) !== (int) $pai) $cod = $cod && $cod !== (int) $a['codigo'] ? $cod : fin_proximo_codigo($tid, (int) $pai);
                if ($cod > 0) q("UPDATE fin_categorias SET codigo = ? WHERE id = ? AND tenant_id = ?", [$cod, $id, $tid]);
            }
            if (fin_tem_subcat()) {
                q("UPDATE fin_categorias SET pai_id = ? WHERE id = ? AND tenant_id = ?", [$pai, $id, $tid]);
                q("UPDATE fin_categorias SET grupo_dre = ? WHERE tenant_id = ? AND pai_id = ?", [$grupo, $tid, $id]);   /* as subcategorias acompanham a linha da DRE */
            }
        } else {
            q("INSERT INTO fin_categorias (tenant_id, nome, tipo, grupo_dre, ativa, ordem) VALUES (?, ?, ?, ?, ?, 999)", [$tid, $nome, $tipo, $grupo, $ativa]);
            $id = (int) db()->lastInsertId();
            if ($pai) q("UPDATE fin_categorias SET pai_id = ? WHERE id = ? AND tenant_id = ?", [$pai, $id, $tid]);
            if (fin_tem_codigo()) q("UPDATE fin_categorias SET codigo = ? WHERE id = ? AND tenant_id = ?", [(int) ($d['codigo'] ?? 0) ?: fin_proximo_codigo($tid, (int) $pai), $id, $tid]);
        }
        auditar('fin_categoria', 'fin_categorias', $id, $nome . ' · ' . FIN_GRUPOS_DRE[$grupo]);
        return ['id' => $id];
    },
    'categoria.excluir' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        if (fin_tem_subcat() && (int) valor("SELECT COUNT(*) FROM fin_categorias WHERE tenant_id = ? AND pai_id = ? AND excluido_em IS NULL AND ativa = 1", [$tid, $id]))
            erro('Esta categoria tem planos de contas ativos. Exclua ou mova os planos antes.');
        $usada = (int) valor("SELECT COUNT(*) FROM fin_titulos WHERE tenant_id = ? AND categoria_id = ? AND excluido_em IS NULL", [$tid, $id])
               + (int) valor("SELECT COUNT(*) FROM fin_movimentos WHERE tenant_id = ? AND categoria_id = ? AND excluido_em IS NULL", [$tid, $id]);
        q($usada ? "UPDATE fin_categorias SET ativa = 0 WHERE id = ? AND tenant_id = ?" : "UPDATE fin_categorias SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$id, $tid]);
        return ['inativada' => (bool) $usada];
    },

    'centro.salvar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $nome = txt($d['nome'] ?? '', 80);
        if ($nome === '') erro('Informe o nome do centro de custo.');
        $ativo = array_key_exists('ativo', $d) && !$d['ativo'] ? 0 : 1;
        if ($id) q("UPDATE fin_centros SET nome = ?, ativo = ? WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$nome, $ativo, $id, $tid]);
        else { q("INSERT INTO fin_centros (tenant_id, nome, ativo) VALUES (?, ?, ?)", [$tid, $nome, $ativo]); $id = (int) db()->lastInsertId(); }
        return ['id' => $id];
    },
    'centro.excluir' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $usado = (int) valor("SELECT COUNT(*) FROM fin_titulos WHERE tenant_id = ? AND centro_id = ? AND excluido_em IS NULL", [$tid, $id]);
        q($usado ? "UPDATE fin_centros SET ativo = 0 WHERE id = ? AND tenant_id = ?" : "UPDATE fin_centros SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$id, $tid]);
        return ['inativado' => (bool) $usado];
    },

    'fornecedores.listar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $w = "f.tenant_id = ? AND f.excluido_em IS NULL"; $p = [$tid];
        $b = txt($d['busca'] ?? '', 80);
        if ($b !== '') { $w .= " AND (f.nome LIKE ? OR f.documento LIKE ? OR f.email LIKE ?)"; $l = '%' . $b . '%'; array_push($p, $l, $l, $l); }
        return array_map(function ($f) {
            return ['id' => (int) $f['id'], 'nome' => $f['nome'], 'documento' => $f['documento'], 'email' => $f['email'], 'telefone' => $f['telefone'],
                    'chavePix' => $f['chave_pix'], 'categoriaId' => $f['categoria_id'] !== null ? (int) $f['categoria_id'] : null, 'obs' => $f['obs'],
                    'ativo' => (int) $f['ativo'] === 1, 'aPagar' => round((float) $f['a_pagar'], 2)];
        }, linhas("SELECT f.*, (SELECT COALESCE(SUM(t.valor - t.pago), 0) FROM fin_titulos t WHERE t.tenant_id = f.tenant_id AND t.fornecedor_id = f.id AND t.excluido_em IS NULL AND t.status IN ('aberto','parcial')) AS a_pagar
                     FROM fornecedores f WHERE $w ORDER BY f.ativo DESC, f.nome LIMIT 300", $p));
    },
    'fornecedor.salvar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $nome = txt($d['nome'] ?? '', 150);
        if ($nome === '') erro('Informe o nome do fornecedor.');
        $doc = preg_replace('/\D/', '', (string) ($d['documento'] ?? ''));
        if ($doc !== '' && !in_array(strlen($doc), [11, 14], true)) erro('CPF/CNPJ inválido (11 ou 14 números).');
        if ($doc !== '' && valor("SELECT id FROM fornecedores WHERE tenant_id = ? AND documento = ? AND excluido_em IS NULL AND id <> ?", [$tid, $doc, $id])) erro('Já existe fornecedor com esse CPF/CNPJ.');
        $email = mb_strtolower(txt($d['email'] ?? '', 190));
        if ($email !== '' && !email_valido($email)) erro('E-mail inválido.');
        $campos = ['nome' => $nome, 'documento' => $doc ?: null, 'email' => $email ?: null, 'telefone' => txt_ou_null($d['telefone'] ?? '', 30),
                   'chave_pix' => txt_ou_null($d['chavePix'] ?? '', 120), 'categoria_id' => fin_id_da_empresa('fin_categorias', $d['categoriaId'] ?? 0, $tid, 'Categoria'),
                   'obs' => txt_ou_null($d['obs'] ?? '', 2000), 'ativo' => array_key_exists('ativo', $d) && !$d['ativo'] ? 0 : 1];
        if ($id) {
            if (!valor("SELECT id FROM fornecedores WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid])) erro('Fornecedor não encontrado.', 404);
            $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
            q("UPDATE fornecedores SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [$id, $tid]));
        } else {
            $campos['tenant_id'] = $tid;
            q("INSERT INTO fornecedores (" . implode(', ', array_keys($campos)) . ") VALUES (" . implode(', ', array_fill(0, count($campos), '?')) . ")", array_values($campos));
            $id = (int) db()->lastInsertId();
        }
        auditar('fin_fornecedor', 'fornecedores', $id, $nome);
        return ['id' => $id, 'nome' => $nome, 'categoriaId' => $campos['categoria_id']];
    },
    'fornecedor.excluir' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $usado = (int) valor("SELECT COUNT(*) FROM fin_titulos WHERE tenant_id = ? AND fornecedor_id = ? AND excluido_em IS NULL", [$tid, $id]);
        q($usado ? "UPDATE fornecedores SET ativo = 0 WHERE id = ? AND tenant_id = ?" : "UPDATE fornecedores SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$id, $tid]);
        auditar('fin_fornecedor_excluir', 'fornecedores', $id, $usado ? 'inativado' : 'excluído');
        return ['inativado' => (bool) $usado];
    },

    /* busca de cliente (a receber) ou fornecedor (a pagar) para o formulário: {tipo, busca} */
    'pessoas' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $b = txt($d['busca'] ?? '', 80);
        $l = '%' . $b . '%';
        if (($d['tipo'] ?? '') === 'pagar')
            return array_map(function ($f) { return ['id' => (int) $f['id'], 'nome' => $f['nome'], 'sub' => $f['documento'], 'categoriaId' => $f['categoria_id'] !== null ? (int) $f['categoria_id'] : null]; },
                linhas("SELECT id, nome, documento, categoria_id FROM fornecedores WHERE tenant_id = ? AND excluido_em IS NULL AND ativo = 1 AND (nome LIKE ? OR documento LIKE ?) ORDER BY nome LIMIT 20", [$tid, $l, $l]));
        return array_map(function ($c) { return ['id' => (int) $c['id'], 'nome' => $c['nome'], 'sub' => trim('nº ' . $c['numero'] . ' ' . ($c['documento'] ?? ''))]; },
            linhas("SELECT id, numero, nome, documento FROM clientes WHERE tenant_id = ? AND excluido_em IS NULL AND (nome LIKE ? OR documento LIKE ? OR numero = ?) ORDER BY nome LIMIT 20",
                   [$tid, $l, $l, ctype_digit($b) ? (int) $b : -1]));
    },

    /* ---------------- v1.24.0: fluxo de caixa ---------------- */

    /* {modo: diario|mensal, de, ate, contaId?, categoriaId?, clienteId?}
       diário: até 93 dias · mensal: até 36 meses. Realizado = movimentos; previsto = saldo dos títulos em aberto
       (vencidos entram no dia de hoje, sem vencimento ficam à parte). */
    'fluxo' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        fin_gerar_recorrencias($tid);
        $hoje = fin_hoje();
        $mensal = ($d['modo'] ?? '') === 'mensal';
        $de = fin_data($d['de'] ?? '', false) ?: ($mensal ? date('Y-m-01', strtotime('-2 months')) : date('Y-m-01'));
        $ate = fin_data($d['ate'] ?? '', false) ?: ($mensal ? date('Y-m-t', strtotime('+3 months')) : date('Y-m-t'));
        if ($mensal) { $de = substr($de, 0, 7) . '-01'; $ate = date('Y-m-t', strtotime(substr($ate, 0, 7) . '-01')); }
        if ($ate < $de) [$de, $ate] = [$ate, $de];
        $dias = (int) round((strtotime($ate) - strtotime($de)) / 86400) + 1;
        if (!$mensal && $dias > 93) erro('No fluxo diário, escolha até 3 meses. Para períodos maiores use o mensal.');
        if ($mensal && $dias > 1100) erro('No fluxo mensal, escolha até 36 meses.');
        $contaId = (int) ($d['contaId'] ?? 0); $catId = (int) ($d['categoriaId'] ?? 0); $cliId = (int) ($d['clienteId'] ?? 0);
        $filtrado = $catId || $cliId;

        /* realizado */
        $wm = ''; $pm = [];
        if ($contaId) { $wm .= " AND m.conta_id = ?"; $pm[] = $contaId; } else $wm .= fin_sql_caixa('m');
        if ($catId) $wm .= " AND COALESCE(m.categoria_id, t.categoria_id) IN (" . fin_cat_ids($tid, $catId) . ")";
        if ($cliId) { $wm .= " AND t.cliente_id = ?"; $pm[] = $cliId; }
        $k = $mensal ? "DATE_FORMAT(m.data, '%Y-%m')" : "m.data";
        $real = [];
        foreach (linhas("SELECT $k AS k, COALESCE(SUM(CASE WHEN m.valor > 0 THEN m.valor END), 0) AS ent, COALESCE(SUM(CASE WHEN m.valor < 0 THEN -m.valor END), 0) AS sai
                           FROM fin_movimentos m LEFT JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                          WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.data BETWEEN ? AND ?" . $wm . " GROUP BY k", array_merge([$tid, $de, $ate], $pm)) as $r)
            $real[(string) $r['k']] = [(float) $r['ent'], (float) $r['sai']];

        /* previsto (títulos em aberto) — vencidos caem em hoje */
        $wt = ''; $pt = [];
        if ($contaId) { $wt .= " AND t.conta_id = ?"; $pt[] = $contaId; }
        if ($catId) $wt .= " AND t.categoria_id IN (" . fin_cat_ids($tid, $catId) . ")";
        if ($cliId) { $wt .= " AND t.cliente_id = ?"; $pt[] = $cliId; }
        $kv = $mensal ? "DATE_FORMAT(GREATEST(t.vencimento, ?), '%Y-%m')" : "GREATEST(t.vencimento, ?)";
        $prev = [];
        foreach (linhas("SELECT $kv AS k, COALESCE(SUM(CASE WHEN t.tipo = 'receber' THEN t.valor - t.pago END), 0) AS ent, COALESCE(SUM(CASE WHEN t.tipo = 'pagar' THEN t.valor - t.pago END), 0) AS sai
                           FROM fin_titulos t WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status IN ('aberto','parcial') AND t.vencimento IS NOT NULL
                            AND GREATEST(t.vencimento, ?) BETWEEN ? AND ?" . $wt . ($contaId ? '' : fin_sql_sem_cartao($tid)) . " GROUP BY k", array_merge([$hoje, $tid, $hoje, $de, $ate], $pt)) as $r)
            $prev[(string) $r['k']] = [(float) $r['ent'], (float) $r['sai']];
        /* v1.25.2: no caixa da empresa, compra no cartão sai no vencimento da fatura */
        if (!$contaId) foreach (fin_prev_cartoes($tid, $hoje, $wt, $pt, !$filtrado) as [$dt, $v]) {
            if ($dt < $de || $dt > $ate) continue;
            $kk = $mensal ? substr($dt, 0, 7) : $dt;
            if (!isset($prev[$kk])) $prev[$kk] = [0.0, 0.0];
            $prev[$kk][1] += $v;
        }
        $sem = linha("SELECT COALESCE(SUM(CASE WHEN t.tipo = 'receber' THEN t.valor - t.pago END), 0) AS ent, COALESCE(SUM(CASE WHEN t.tipo = 'pagar' THEN t.valor - t.pago END), 0) AS sai
                        FROM fin_titulos t WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status IN ('aberto','parcial') AND t.vencimento IS NULL" . $wt, array_merge([$tid], $pt));

        /* saldo realizado no começo do período (sem filtro de categoria/cliente) */
        $saldoIni = null;
        if (!$filtrado) {
            $saldoIni = 0.0;
            $antes = date('Y-m-d', strtotime($de . ' -1 day'));
            foreach (linhas("SELECT * FROM fin_contas WHERE tenant_id = ? AND excluido_em IS NULL" . ($contaId ? " AND id = " . (int) $contaId : " AND tipo <> 'cartao'"), [$tid]) as $c) {
                if ($c['saldo_inicial_em'] > $ate) continue;
                /* conta que começa dentro do período: o saldo inicial dela entra no saldo de abertura (não é "entrada") */
                $saldoIni += $c['saldo_inicial_em'] > $antes ? (float) $c['saldo_inicial'] : fin_saldo_conta($tid, $c, $antes);
            }
        }

        $chaves = [];
        if ($mensal) for ($m = substr($de, 0, 7); $m <= substr($ate, 0, 7); $m = date('Y-m', strtotime($m . '-01 +1 month'))) $chaves[] = $m;
        else for ($x = $de; $x <= $ate; $x = date('Y-m-d', strtotime($x . ' +1 day'))) $chaves[] = $x;
        $sr = $saldoIni; $sp = $saldoIni;
        $hojeK = $mensal ? substr($hoje, 0, 7) : $hoje;
        $linhas = [];
        foreach ($chaves as $ch) {
            [$re, $rs] = $real[$ch] ?? [0.0, 0.0];
            [$pe, $ps] = $prev[$ch] ?? [0.0, 0.0];
            if ($sr !== null) {
                $sr = round($sr + $re - $rs, 2);
                $sp = $ch < $hojeK ? $sr : round($sp + $re - $rs + $pe - $ps, 2);   /* passado = realizado; de hoje em diante soma o previsto */
            }
            $linhas[] = ['k' => $ch, 'entReal' => round($re, 2), 'saiReal' => round($rs, 2), 'entPrev' => round($pe, 2), 'saiPrev' => round($ps, 2),
                         'saldoReal' => $ch <= $hojeK ? $sr : null, 'saldoProj' => $sp, 'passado' => $ch < $hojeK, 'hoje' => $ch === $hojeK];
        }
        $tot = function ($c) use ($linhas) { return round(array_sum(array_column($linhas, $c)), 2); };
        return ['modo' => $mensal ? 'mensal' : 'diario', 'de' => $de, 'ate' => $ate, 'hoje' => $hoje, 'filtrado' => $filtrado,
                'saldoInicial' => $saldoIni, 'linhas' => $linhas,
                'totais' => ['entReal' => $tot('entReal'), 'saiReal' => $tot('saiReal'), 'entPrev' => $tot('entPrev'), 'saiPrev' => $tot('saiPrev')],
                'semVencimento' => ['ent' => round((float) $sem['ent'], 2), 'sai' => round((float) $sem['sai'], 2)]];
    },

    /* o que compõe um dia (ou mês) do fluxo: {data | mes, contaId?} */
    'fluxo.detalhe' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $hoje = fin_hoje();
        if (!empty($d['mes']) && preg_match('/^\d{4}-\d{2}$/', $d['mes'])) { $de = $d['mes'] . '-01'; $ate = date('Y-m-t', strtotime($de)); }
        else { $de = $ate = fin_data($d['data'] ?? '', true); }
        $contaId = (int) ($d['contaId'] ?? 0);
        $wm = $contaId ? " AND m.conta_id = " . $contaId : fin_sql_caixa('m');
        $movs = array_map(function ($m) { return ['id' => (int) $m['id'], 'data' => $m['data'], 'valor' => (float) $m['valor'], 'descricao' => $m['descricao'] ?: $m['tdesc'], 'conta' => $m['conta'], 'tituloId' => $m['titulo_id'] !== null ? (int) $m['titulo_id'] : null]; },
            linhas("SELECT m.*, t.descricao AS tdesc, c.nome AS conta FROM fin_movimentos m LEFT JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                     LEFT JOIN fin_contas c ON c.tenant_id = m.tenant_id AND c.id = m.conta_id
                    WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.data BETWEEN ? AND ?" . $wm . " ORDER BY m.data, m.id LIMIT 300", [$tid, $de, $ate]));
        $tits = array_map('fin_titulo_publico', linhas(FIN_SELECT_TITULO . " WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status IN ('aberto','parcial') AND t.vencimento IS NOT NULL
                     AND GREATEST(t.vencimento, ?) BETWEEN ? AND ?" . ($contaId ? " AND t.conta_id = " . $contaId : fin_sql_sem_cartao($tid)) . " ORDER BY t.vencimento, t.id LIMIT 300", [$tid, $hoje, $de, $ate]));
        $cart = [];
        if (!$contaId) foreach (fin_prev_cartoes($tid, $hoje) as [$dt, $v, $it]) if ($dt >= $de && $dt <= $ate) $cart[] = $it + ['valor' => round($v, 2)];
        return ['de' => $de, 'ate' => $ate, 'movimentos' => $movs, 'previstos' => $tits, 'cartoes' => $cart];
    },

    /* ---------------- v1.24.0: recorrências ---------------- */

    'recorrencias.listar' => function ($d) {
        fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        return array_map('fin_rec_publica', linhas("SELECT r.*, cl.nome AS cliente_nome, f.nome AS fornecedor_nome, cat.nome AS categoria_nome,
                (SELECT MIN(t.vencimento) FROM fin_titulos t WHERE t.tenant_id = r.tenant_id AND t.origem_tipo = 'recorrencia' AND t.origem_id = r.id AND t.excluido_em IS NULL AND t.status IN ('aberto','parcial') AND t.vencimento >= CURDATE()) AS proxima
              FROM fin_recorrencias r LEFT JOIN clientes cl ON cl.tenant_id = r.tenant_id AND cl.id = r.cliente_id LEFT JOIN fornecedores f ON f.tenant_id = r.tenant_id AND f.id = r.fornecedor_id
              LEFT JOIN fin_categorias cat ON cat.tenant_id = r.tenant_id AND cat.id = r.categoria_id
             WHERE r.tenant_id = ? AND r.excluido_em IS NULL ORDER BY r.ativa DESC, r.tipo, r.descricao", [$tid]));
    },

    /* {id?, tipo, descricao, clienteId|fornecedorId, categoriaId, centroId?, contaId?, forma?, valor, intervaloMeses, inicio, fim?, ativa?, obs?} */
    'recorrencia.salvar' => function ($d) {
        $u = fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $a = $id ? linha("SELECT * FROM fin_recorrencias WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]) : null;
        if ($id && !$a) erro('Recorrência não encontrada.', 404);
        $tipo = $a ? $a['tipo'] : (($d['tipo'] ?? '') === 'receber' ? 'receber' : 'pagar');
        $desc = txt($d['descricao'] ?? '', 200);
        if ($desc === '') erro('Informe a descrição (ex.: Aluguel do galpão).');
        $cat = fin_id_da_empresa('fin_categorias', $d['categoriaId'] ?? 0, $tid, 'Categoria');
        if (!$cat) erro('Escolha a categoria.');
        if (valor("SELECT tipo FROM fin_categorias WHERE id = ? AND tenant_id = ?", [$cat, $tid]) !== ($tipo === 'receber' ? 'receita' : 'despesa')) erro('Categoria não combina com o tipo (receita/despesa).');
        $int = (int) ($d['intervaloMeses'] ?? 1);
        if (!in_array($int, [1, 2, 3, 6, 12], true)) erro('Frequência inválida.');
        $ini = fin_data($d['inicio'] ?? '', true, 'o primeiro vencimento');
        $fim = fin_data($d['fim'] ?? '', false, 'o fim');
        if ($fim && $fim < $ini) erro('O fim não pode ser antes do primeiro vencimento.');
        $c = ['descricao' => $desc, 'cliente_id' => $tipo === 'receber' ? fin_id_da_empresa('clientes', $d['clienteId'] ?? 0, $tid, 'Cliente') : null,
              'fornecedor_id' => $tipo === 'pagar' ? fin_id_da_empresa('fornecedores', $d['fornecedorId'] ?? 0, $tid, 'Fornecedor') : null,
              'categoria_id' => $cat, 'centro_id' => fin_id_da_empresa('fin_centros', $d['centroId'] ?? 0, $tid, 'Centro de custo'),
              'conta_id' => fin_id_da_empresa('fin_contas', $d['contaId'] ?? 0, $tid, 'Conta'), 'forma' => txt_ou_null($d['forma'] ?? '', 30),
              'valor' => fin_valor($d['valor'] ?? 0), 'intervalo_meses' => $int, 'inicio' => $ini, 'fim' => $fim,
              'ativa' => array_key_exists('ativa', $d) && !$d['ativa'] ? 0 : 1, 'obs' => txt_ou_null($d['obs'] ?? '', 1000)];
        if (fin_tem_nota()) $c['com_nota'] = $tipo === 'receber' && !empty($d['comNota']) ? 1 : 0;   /* v1.25.1 */
        db()->beginTransaction();
        if ($a) {
            $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($c)));
            q("UPDATE fin_recorrencias SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($c), [$id, $tid]));
            fin_rec_limpar_futuro($tid, $id);   /* futuros não pagos saem e voltam com os dados novos */
        } else {
            $c += ['tenant_id' => $tid, 'tipo' => $tipo, 'criado_por' => (int) $u['id']];
            q("INSERT INTO fin_recorrencias (" . implode(', ', array_keys($c)) . ") VALUES (" . implode(', ', array_fill(0, count($c), '?')) . ")", array_values($c));
            $id = (int) db()->lastInsertId();
        }
        fin_gerar_recorrencias($tid, $id);
        db()->commit();
        auditar('fin_recorrencia', 'fin_recorrencias', $id, $desc . ' · ' . fin_br($c['valor']) . ' a cada ' . $int . ' mês(es)' . ($c['ativa'] ? '' : ' (encerrada)'));
        return ['id' => $id];
    },

    /* encerra: lançamentos futuros não pagos saem; os já lançados e pagos ficam */
    'recorrencia.excluir' => function ($d) {
        fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $a = linha("SELECT * FROM fin_recorrencias WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
        if (!$a) erro('Recorrência não encontrada.', 404);
        db()->beginTransaction();
        fin_rec_limpar_futuro($tid, $id);
        q("UPDATE fin_recorrencias SET excluido_em = NOW(), ativa = 0 WHERE id = ? AND tenant_id = ?", [$id, $tid]);
        db()->commit();
        auditar('fin_recorrencia_excluir', 'fin_recorrencias', $id, $a['descricao']);
        return true;
    },

    /* ---------------- v1.24.0: extrato e conciliação ---------------- */

    /* {contaId, formato: ofx|csv, arquivo, conteudo (texto do OFX) | linhas:[{data, descricao, valor, documento?, id?}]} */
    'extrato.importar' => function ($d) {
        $u = fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        $conta = linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['contaId'] ?? 0), $tid]);
        if (!$conta) erro('Escolha a conta do extrato.');
        $fmt = ($d['formato'] ?? '') === 'csv' ? 'csv' : 'ofx';
        $saldo = null; $saldoEm = null;
        if ($fmt === 'ofx') {
            $txt = (string) ($d['conteudo'] ?? '');
            if (strlen($txt) > 4000000) erro('Arquivo grande demais (máx. 4 MB).');
            [$linhas, $saldo, $saldoEm] = fin_ofx_ler($txt);
        } else {
            $linhas = [];
            foreach (array_slice((array) ($d['linhas'] ?? []), 0, 5000) as $l) {
                $dt = fin_data($l['data'] ?? '', false);
                $v = round(fin_num($l['valor'] ?? 0), 2);
                if (!$dt || abs($v) < 0.005) continue;
                $linhas[] = ['data' => $dt, 'valor' => $v, 'descricao' => txt($l['descricao'] ?? '', 255), 'documento' => txt($l['documento'] ?? '', 80), 'id' => txt($l['id'] ?? '', 120)];
            }
        }
        if (!$linhas) erro('Não encontrei lançamentos no arquivo.');
        db()->beginTransaction();
        q("INSERT INTO fin_importacoes (tenant_id, conta_id, origem, arquivo, linhas, saldo_extrato, saldo_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [$tid, $conta['id'], $fmt, txt_ou_null($d['arquivo'] ?? '', 200), count($linhas), $saldo, $saldoEm, (int) $u['id']]);
        $imp = (int) db()->lastInsertId();
        $novas = 0; $dup = 0; $vistos = [];
        foreach ($linhas as $l) {
            /* identidade da transação: FITID do banco; sem ele, data + valor + descrição (+ nº da repetição no mesmo arquivo) */
            $base = $l['id'] !== '' ? 'id:' . $l['id'] : 'x:' . $l['data'] . '|' . number_format($l['valor'], 2, '.', '') . '|' . fin_sem_acento($l['descricao']);
            $vistos[$base] = ($vistos[$base] ?? 0) + 1;
            $hash = sha1($base . ($l['id'] !== '' ? '' : '#' . $vistos[$base]));
            try {
                q("INSERT INTO fin_extrato (tenant_id, conta_id, importacao_id, origem, data, valor, descricao, documento, id_externo, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                  [$tid, $conta['id'], $imp, $fmt, $l['data'], $l['valor'], mb_substr($l['descricao'], 0, 255) ?: null, $l['documento'] ?: null, $l['id'] ?: null, $hash]);
                $novas++;
            } catch (Throwable $e) { $dup++; }
        }
        q("UPDATE fin_importacoes SET novas = ?, duplicadas = ? WHERE id = ?", [$novas, $dup, $imp]);
        db()->commit();
        auditar('fin_extrato_importar', 'fin_contas', (int) $conta['id'], $fmt . ' · ' . $novas . ' nova(s), ' . $dup . ' repetida(s)');
        return ['importacaoId' => $imp, 'linhas' => count($linhas), 'novas' => $novas, 'duplicadas' => $dup, 'saldoExtrato' => $saldo, 'saldoEm' => $saldoEm,
                'saldoSistema' => $saldoEm ? fin_saldo_conta($tid, $conta, $saldoEm) : null];
    },

    /* {contaId, status: pendente|conciliado|ignorado|todos, de?, ate?} → linhas do extrato com sugestões (pendentes) */
    'conciliacao.listar' => function ($d) {
        fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        $conta = linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['contaId'] ?? 0), $tid]);
        if (!$conta) erro('Conta não encontrada.', 404);
        $st = in_array($d['status'] ?? '', ['pendente', 'conciliado', 'ignorado', 'todos'], true) ? $d['status'] : 'pendente';
        $w = "e.tenant_id = ? AND e.conta_id = ?"; $p = [$tid, $conta['id']];
        if ($st !== 'todos') { $w .= " AND e.status = ?"; $p[] = $st; }
        if ($x = fin_data($d['de'] ?? '', false)) { $w .= " AND e.data >= ?"; $p[] = $x; }
        if ($x = fin_data($d['ate'] ?? '', false)) { $w .= " AND e.data <= ?"; $p[] = $x; }
        $l = linhas("SELECT e.*, COALESCE(m.descricao, t.descricao) AS mov_desc, m.titulo_id FROM fin_extrato e
                       LEFT JOIN fin_movimentos m ON m.tenant_id = e.tenant_id AND m.id = e.movimento_id
                       LEFT JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                      WHERE $w ORDER BY e.data DESC, e.id DESC LIMIT 400", $p);
        $cont = [];
        foreach (linhas("SELECT status, COUNT(*) AS n FROM fin_extrato WHERE tenant_id = ? AND conta_id = ? GROUP BY status", [$tid, $conta['id']]) as $r) $cont[$r['status']] = (int) $r['n'];
        /* v1.25.3: pendentes em todas as contas (para retomar a conciliação de onde parou) */
        $pc = [];
        foreach (linhas("SELECT e.conta_id, COUNT(*) AS n, MAX(e.data) AS ate FROM fin_extrato e JOIN fin_contas c ON c.tenant_id = e.tenant_id AND c.id = e.conta_id AND c.excluido_em IS NULL
                          WHERE e.tenant_id = ? AND e.status = 'pendente' GROUP BY e.conta_id", [$tid]) as $r) $pc[] = ['contaId' => (int) $r['conta_id'], 'pendentes' => (int) $r['n'], 'ate' => $r['ate']];
        $ult = linha("SELECT saldo_extrato, saldo_em, criado_em FROM fin_importacoes WHERE tenant_id = ? AND conta_id = ? AND saldo_extrato IS NOT NULL ORDER BY saldo_em DESC, id DESC LIMIT 1", [$tid, $conta['id']]);
        return [
            'conta' => fin_conta_publica($tid, $conta),
            'contagem' => ['pendente' => $cont['pendente'] ?? 0, 'conciliado' => $cont['conciliado'] ?? 0, 'ignorado' => $cont['ignorado'] ?? 0],
            'pendentesContas' => $pc,
            'saldoExtrato' => $ult ? ['valor' => (float) $ult['saldo_extrato'], 'em' => $ult['saldo_em'], 'sistema' => $ult['saldo_em'] ? fin_saldo_conta($tid, $conta, $ult['saldo_em']) : null] : null,
            'itens' => array_map(function ($e) use ($tid) {
                $o = ['id' => (int) $e['id'], 'data' => $e['data'], 'valor' => (float) $e['valor'], 'descricao' => $e['descricao'], 'documento' => $e['documento'],
                      'status' => $e['status'], 'origem' => $e['origem'], 'ligadoA' => $e['mov_desc'], 'tituloId' => $e['titulo_id'] !== null ? (int) $e['titulo_id'] : null];
                if ($e['status'] === 'pendente') $o['sugestoes'] = fin_sugestoes($tid, $e);
                return $o;
            }, $l),
        ];
    },

    /* {extratoId, tipo: mov|titulo|novo|transferencia, movimentoId?, tituloId?, categoriaId?, centroId?, descricao?, contaId? (outra conta da transferência)} */
    'conciliar' => function ($d) {
        $u = fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        $e = linha("SELECT * FROM fin_extrato WHERE id = ? AND tenant_id = ?", [(int) ($d['extratoId'] ?? 0), $tid]);
        if (!$e) erro('Linha do extrato não encontrada.', 404);
        if ($e['status'] !== 'pendente') erro('Esta linha já foi ' . ($e['status'] === 'conciliado' ? 'conciliada.' : 'ignorada.'));
        $v = (float) $e['valor'];
        $tipo = (string) ($d['tipo'] ?? '');
        db()->beginTransaction();
        if ($tipo === 'mov') {
            $m = linha("SELECT * FROM fin_movimentos WHERE id = ? AND tenant_id = ? AND conta_id = ? AND excluido_em IS NULL", [(int) ($d['movimentoId'] ?? 0), $tid, $e['conta_id']]);
            if (!$m) erro('Movimento não encontrado nesta conta.');
            if ((int) $m['conciliado'] === 1) erro('Este movimento já está conciliado com outra linha.');
            if (abs((float) $m['valor'] - $v) > 0.004) erro('O valor do movimento (' . fin_br($m['valor']) . ') é diferente do extrato (' . fin_br($v) . ').');
            fin_extrato_ligar($tid, $e, (int) $m['id']);
        } elseif ($tipo === 'titulo') {
            $t = fin_titulo_da_empresa($d['tituloId'] ?? 0, $tid);
            if (!in_array($t['status'], ['aberto', 'parcial'], true)) erro('Este lançamento não está em aberto.');
            if (($v > 0) !== ($t['tipo'] === 'receber')) erro($v > 0 ? 'Entrada no extrato só baixa conta a receber.' : 'Saída no extrato só baixa conta a pagar.');
            $saldo = round((float) $t['valor'] - (float) $t['pago'], 2);
            if (abs($v) > $saldo + 0.004) erro('O valor do extrato (' . fin_br(abs($v)) . ') passa do que falta no lançamento (' . fin_br($saldo) . ').');
            q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, titulo_id, categoria_id, centro_id, descricao, criado_por) VALUES (?, ?, ?, ?, 'baixa', ?, ?, ?, ?, ?)",
              [$tid, $e['conta_id'], $e['data'], $v, (int) $t['id'], $t['categoria_id'], $t['centro_id'], mb_substr($t['descricao'], 0, 255), (int) $u['id']]);
            $mid = (int) db()->lastInsertId();
            fin_recalcular($tid, (int) $t['id']);
            fin_evento($tid, (int) $t['id'], 'baixa', ($t['tipo'] === 'receber' ? 'Recebido ' : 'Pago ') . fin_br(abs($v)) . ' em ' . fin_dbr($e['data']) . ' (conciliação do extrato).');
            if ($t['origem_tipo'] === 'chamado' && $t['origem_id']) fch_atualizar_recebido($tid, (int) $t['origem_id']);
            fin_extrato_ligar($tid, $e, $mid);
        } elseif ($tipo === 'novo') {
            $cat = fin_id_da_empresa('fin_categorias', $d['categoriaId'] ?? 0, $tid, 'Categoria');
            if (!$cat) erro('Escolha a categoria (ex.: Tarifas bancárias).');
            [$vt, $vi] = fin_vinculo_ler($d, $tid);   /* v1.25.3 */
            q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, categoria_id, centro_id, descricao, criado_por) VALUES (?, ?, ?, ?, 'avulso', ?, ?, ?, ?)",
              [$tid, $e['conta_id'], $e['data'], $v, $cat, fin_id_da_empresa('fin_centros', $d['centroId'] ?? 0, $tid, 'Centro de custo'),
               mb_substr(txt($d['descricao'] ?? '', 255) ?: ($e['descricao'] ?: 'Extrato'), 0, 255), (int) $u['id']]);
            $mid = (int) db()->lastInsertId();
            fin_vinculo_mov($tid, $mid, $vt, $vi);
            fin_extrato_ligar($tid, $e, $mid);
        } elseif ($tipo === 'transferencia') {
            $outra = fin_id_da_empresa('fin_contas', $d['contaId'] ?? 0, $tid, 'Conta');
            if (!$outra || $outra === (int) $e['conta_id']) erro('Escolha a outra conta da transferência.');
            $g = bin2hex(random_bytes(8));
            $desc = mb_substr($e['descricao'] ?: 'Transferência', 0, 200);
            q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, descricao, transferencia, criado_por) VALUES (?, ?, ?, ?, 'transferencia', ?, ?, ?)", [$tid, $e['conta_id'], $e['data'], $v, $desc, $g, (int) $u['id']]);
            $mid = (int) db()->lastInsertId();
            q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, descricao, transferencia, criado_por) VALUES (?, ?, ?, ?, 'transferencia', ?, ?, ?)", [$tid, $outra, $e['data'], -$v, $desc, $g, (int) $u['id']]);
            fin_extrato_ligar($tid, $e, $mid);
        } else erro('Escolha como conciliar.');
        db()->commit();
        auditar('fin_conciliar', 'fin_extrato', (int) $e['id'], $tipo . ' · ' . fin_br($v) . ' · ' . $e['descricao']);
        return true;
    },

    /* liga sozinho só o que é inequívoco: um único movimento igual (±2 dias) ou um único lançamento com o mesmo valor (±5 dias) */
    'conciliar_auto' => function ($d) {
        $u = fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        $contaId = (int) ($d['contaId'] ?? 0);
        $n = 0; $usados = ['mov' => [], 'titulo' => []];
        foreach (linhas("SELECT * FROM fin_extrato WHERE tenant_id = ? AND conta_id = ? AND status = 'pendente' ORDER BY data, id LIMIT 1000", [$tid, $contaId]) as $e) {
            $sug = fin_sugestoes($tid, $e);
            $mov = array_values(array_filter($sug, function ($s) use ($usados) { return $s['tipo'] === 'mov' && $s['dist'] <= 2 && !in_array($s['id'], $usados['mov'], true); }));
            $tit = array_values(array_filter($sug, function ($s) use ($usados) { return $s['tipo'] === 'titulo' && $s['dist'] <= 5 && !in_array($s['id'], $usados['titulo'], true); }));
            try {
                if (count($mov) === 1) {
                    db()->beginTransaction(); fin_extrato_ligar($tid, $e, $mov[0]['id']); db()->commit(); $usados['mov'][] = $mov[0]['id']; $n++;
                } elseif (!$mov && count($tit) === 1) {
                    $t = fin_titulo_da_empresa($tit[0]['id'], $tid);
                    db()->beginTransaction();
                    q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, titulo_id, categoria_id, centro_id, descricao, criado_por) VALUES (?, ?, ?, ?, 'baixa', ?, ?, ?, ?, ?)",
                      [$tid, $e['conta_id'], $e['data'], (float) $e['valor'], (int) $t['id'], $t['categoria_id'], $t['centro_id'], mb_substr($t['descricao'], 0, 255), (int) $u['id']]);
                    $mid = (int) db()->lastInsertId();
                    fin_recalcular($tid, (int) $t['id']);
                    fin_evento($tid, (int) $t['id'], 'baixa', ($t['tipo'] === 'receber' ? 'Recebido ' : 'Pago ') . fin_br(abs($e['valor'])) . ' em ' . fin_dbr($e['data']) . ' (conciliação automática).');
                    if ($t['origem_tipo'] === 'chamado' && $t['origem_id']) fch_atualizar_recebido($tid, (int) $t['origem_id']);
                    fin_extrato_ligar($tid, $e, $mid);
                    db()->commit(); $usados['titulo'][] = $tit[0]['id']; $n++;
                }
            } catch (Throwable $x) { if (db()->inTransaction()) db()->rollBack(); }
        }
        if ($n) auditar('fin_conciliar_auto', 'fin_contas', $contaId, $n . ' linha(s)');
        return ['conciliadas' => $n];
    },

    /* desfaz a ligação (o movimento continua; se foi criado pela conciliação e quiser tirar, estorne pelo extrato/lançamento) */
    'conciliacao.desfazer' => function ($d) {
        fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        $e = linha("SELECT * FROM fin_extrato WHERE id = ? AND tenant_id = ?", [(int) ($d['extratoId'] ?? 0), $tid]);
        if (!$e) erro('Linha não encontrada.', 404);
        if ($e['status'] !== 'conciliado') erro('Esta linha não está conciliada.');
        if ($e['movimento_id']) q("UPDATE fin_movimentos SET conciliado = 0, extrato_id = NULL WHERE id = ? AND tenant_id = ?", [$e['movimento_id'], $tid]);
        q("UPDATE fin_extrato SET status = 'pendente', movimento_id = NULL, conciliado_por = NULL, conciliado_em = NULL WHERE id = ? AND tenant_id = ?", [$e['id'], $tid]);
        auditar('fin_conciliacao_desfazer', 'fin_extrato', (int) $e['id'], fin_br($e['valor']) . ' · ' . $e['descricao']);
        return true;
    },

    /* {extratoId, ignorar: 1|0} — ex.: lançamento que se anulou no próprio dia */
    'extrato.ignorar' => function ($d) {
        fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        $e = linha("SELECT * FROM fin_extrato WHERE id = ? AND tenant_id = ?", [(int) ($d['extratoId'] ?? 0), $tid]);
        if (!$e || $e['status'] === 'conciliado') erro('Linha não encontrada ou já conciliada.');
        q("UPDATE fin_extrato SET status = ? WHERE id = ? AND tenant_id = ?", [!empty($d['ignorar']) ? 'ignorado' : 'pendente', $e['id'], $tid]);
        return true;
    },

    'importacoes.listar' => function ($d) {
        fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        return array_map(function ($i) { return ['id' => (int) $i['id'], 'origem' => $i['origem'], 'arquivo' => $i['arquivo'], 'linhas' => (int) $i['linhas'], 'novas' => (int) $i['novas'],
                'duplicadas' => (int) $i['duplicadas'], 'em' => $i['criado_em'], 'quem' => $i['nome'], 'pendentes' => (int) $i['pend']]; },
            linhas("SELECT i.*, u.nome, (SELECT COUNT(*) FROM fin_extrato e WHERE e.tenant_id = i.tenant_id AND e.importacao_id = i.id AND e.status = 'pendente') AS pend
                      FROM fin_importacoes i LEFT JOIN usuarios u ON u.tenant_id = i.tenant_id AND u.id = i.criado_por WHERE i.tenant_id = ? AND i.conta_id = ? ORDER BY i.id DESC LIMIT 30",
                   [$tid, (int) ($d['contaId'] ?? 0)]));
    },

    /* desfaz uma importação: tira as linhas ainda pendentes dela (as conciliadas ficam) */
    'importacao.desfazer' => function ($d) {
        fin_u(); fin_tabelas(); fin_exigir_v124();
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $n = q("DELETE FROM fin_extrato WHERE tenant_id = ? AND importacao_id = ? AND status = 'pendente'", [$tid, $id])->rowCount();
        auditar('fin_importacao_desfazer', 'fin_importacoes', $id, $n . ' linha(s) removida(s)');
        return ['removidas' => $n];
    },

    /* ---------------- v1.23.0: chamados ---------------- */

    /* parcelas a receber de um chamado: {chamadoId} (administrador, financeiro e comercial) */
    'chamado.obter' => function ($d) {
        exigir_perfil('admin', 'financeiro', 'comercial');
        $tid = tenant();
        if (!fch_ativo($tid)) return ['ativo' => false];
        $ch = linha("SELECT id, numero, status, valor, recebido FROM chamados WHERE id = ? AND tenant_id = ?", [(int) ($d['chamadoId'] ?? 0), $tid]);
        if (!$ch) erro('Chamado não encontrado.', 404);
        $l = array_map('fin_titulo_publico', linhas(FIN_SELECT_TITULO . " WHERE t.tenant_id = ? AND t.origem_tipo = 'chamado' AND t.origem_id = ? AND t.excluido_em IS NULL ORDER BY t.status = 'cancelado', t.parcela, t.id", [$tid, (int) $ch['id']]));
        $ativas = array_values(array_filter($l, function ($t) { return $t['status'] !== 'cancelado'; }));
        return ['ativo' => true, 'ganho' => in_array($ch['status'], FCH_GANHO, true), 'parcelas' => $l,
                'total' => round(array_sum(array_column($ativas, 'valor')), 2), 'recebido' => round(array_sum(array_column($ativas, 'pago')), 2),
                'semVencimento' => count(array_filter($ativas, function ($t) { return $t['semVencimento']; })),
                'valorChamado' => $ch['valor'] !== null ? (float) $ch['valor'] : null, 'podeFinanceiro' => tem_perfil(eu(), 'admin', 'financeiro')];
    },

    /* vencimentos digitados depois da aprovação (podem mudar à vontade; fica no histórico): {chamadoId, itens:[{id, vencimento}]} */
    'chamado.vencimentos' => function ($d) {
        exigir_perfil('admin', 'financeiro', 'comercial'); fin_tabelas();
        $tid = tenant();
        $chId = (int) ($d['chamadoId'] ?? 0);
        $n = 0;
        db()->beginTransaction();
        foreach ((array) ($d['itens'] ?? []) as $x) {
            $t = linha("SELECT * FROM fin_titulos WHERE id = ? AND tenant_id = ? AND origem_tipo = 'chamado' AND origem_id = ? AND excluido_em IS NULL", [(int) ($x['id'] ?? 0), $tid, $chId]);
            if (!$t || $t['status'] === 'cancelado') continue;
            $v = fin_data($x['vencimento'] ?? '', false, 'o vencimento');
            if ((string) $t['vencimento'] === (string) $v) continue;
            q("UPDATE fin_titulos SET vencimento = ? WHERE id = ? AND tenant_id = ?", [$v, $t['id'], $tid]);
            fin_evento($tid, (int) $t['id'], 'edicao', 'Vencimento ' . fin_dbr($t['vencimento']) . ' → ' . fin_dbr($v) . '.');
            $n++;
        }
        db()->commit();
        if ($n) auditar('fin_chamado_vencimentos', 'chamados', $chId, $n . ' vencimento(s)');
        return ['alterados' => $n];
    },

    /* importação única: chamados ganhos com saldo a receber e sem parcelas no Financeiro → um lançamento de saldo cada.
       {simular: 1} só lista; sem simular, grava. */
    'importar_chamados' => function ($d) {
        $u = fin_u(); fin_tabelas();
        $tid = tenant();
        fin_padroes($tid);
        $in = "'" . implode("','", FCH_GANHO) . "'";
        $l = linhas("SELECT ch.id, ch.numero, ch.status, ch.valor, ch.recebido, ch.cliente_id, cl.nome AS cliente_nome, ch.ganho_em, ch.fechado_em, ch.aberto_em
                       FROM chamados ch LEFT JOIN clientes cl ON cl.tenant_id = ch.tenant_id AND cl.id = ch.cliente_id
                      WHERE ch.tenant_id = ? AND ch.excluido_em IS NULL AND ch.status IN ($in) AND ch.valor IS NOT NULL AND ch.valor - COALESCE(ch.recebido, 0) > 0.004
                        AND NOT EXISTS (SELECT 1 FROM fin_titulos t WHERE t.tenant_id = ch.tenant_id AND t.origem_tipo = 'chamado' AND t.origem_id = ch.id)
                      ORDER BY ch.numero", [$tid]);
        $itens = array_map(function ($c) { return ['id' => (int) $c['id'], 'numero' => (int) $c['numero'], 'cliente' => $c['cliente_nome'], 'status' => $c['status'],
            'valor' => (float) $c['valor'], 'recebido' => (float) $c['recebido'], 'saldo' => round((float) $c['valor'] - (float) $c['recebido'], 2)]; }, $l);
        if (!empty($d['simular'])) return ['itens' => $itens, 'total' => round(array_sum(array_column($itens, 'saldo')), 2)];
        $cat = fch_categoria($tid);
        db()->beginTransaction();
        foreach ($l as $c) {
            $saldo = round((float) $c['valor'] - (float) $c['recebido'], 2);
            $comp = substr((string) ($c['ganho_em'] ?: ($c['fechado_em'] ?: $c['aberto_em'])), 0, 10) ?: date('Y-m-d');
            q("INSERT INTO fin_titulos (tenant_id, tipo, descricao, cliente_id, categoria_id, valor, competencia, vencimento, status, parcela, parcelas, origem_tipo, origem_id, chave_origem, obs, criado_por)
               VALUES (?, 'receber', ?, ?, ?, ?, ?, NULL, 'aberto', 1, 1, 'chamado', ?, ?, ?, ?)",
              [$tid, mb_substr('Chamado ' . $c['numero'] . ' · ' . $c['cliente_nome'] . ' · saldo a receber', 0, 255), $c['cliente_id'], $cat, $saldo, $comp, (int) $c['id'],
               'chamado:' . (int) $c['id'] . ':imp:' . number_format((float) $c['recebido'], 2, '.', ''), 'Importado do CRM: valor ' . fin_br($c['valor']) . ', já recebido ' . fin_br($c['recebido']) . '.', (int) $u['id']]);
            fin_evento($tid, (int) db()->lastInsertId(), 'criacao', 'Saldo importado do chamado ' . $c['numero'] . ': ' . fin_br($saldo) . '. Defina o vencimento.');
        }
        db()->commit();
        auditar('fin_importar_chamados', 'fin_titulos', null, count($l) . ' chamado(s) · ' . fin_br(array_sum(array_column($itens, 'saldo'))));
        return ['importados' => count($l), 'total' => round(array_sum(array_column($itens, 'saldo')), 2)];
    },

    /* =================== v1.25.0 =================== */

    /* DRE gerencial: {de: AAAA-MM, ate: AAAA-MM, regime: competencia|caixa, centroId?}
       Linhas com sinal (+ receita, − despesa). Deduções na competência: guia lançada (apurado) ou provisão. */
    'dre' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $de = fin_mes($d['de'] ?? '', date('Y') . '-01');
        $ate = fin_mes($d['ate'] ?? '', date('Y-m'));
        if ($ate < $de) [$de, $ate] = [$ate, $de];
        $meses = fin_meses_entre($de, $ate);
        $ate = end($meses);
        $regime = ($d['regime'] ?? '') === 'caixa' ? 'caixa' : 'competencia';
        $centroId = (int) ($d['centroId'] ?? 0);
        $cfg = fin_config($tid);
        $cats = fin_cats_mapa($tid);
        $bruto = fin_dre_bruto($tid, $de, $ate, $regime, $centroId);
        $imp = fin_impostos_meses($tid, $meses, $cfg);
        $n = count($meses); $idx = array_flip($meses);
        $zero = array_fill(0, $n, 0.0);

        /* por grupo → por categoria */
        $g = []; $foraDre = $zero;
        foreach ($bruto as $m => $l) {
            if (!isset($idx[$m])) continue;
            foreach ($l as $k => $v) {
                $gr = fin_dre_grupo($k, $cats);
                if ($gr === 'fora_dre') { $foraDre[$idx[$m]] += $v; continue; }
                if ($gr === 'deducoes' && $regime === 'competencia' && $centroId) continue;   /* com centro: deduções são rateadas abaixo */
                if (!isset($g[$gr][$k])) $g[$gr][$k] = $zero;
                $g[$gr][$k][$idx[$m]] += $v;
            }
        }
        /* deduções na competência: mês sem guia → provisão; com centro → rateio pela receita do centro */
        $notaProv = false;
        if ($regime === 'competencia') {
            $prov = $zero; $rateio = $zero;
            $baseCentro = $centroId ? fin_base_nota($tid, $de, $ate, $cfg['provisaoBase'] === 'recebimento' ? 'caixa' : 'competencia', $centroId) : [];
            foreach ($meses as $i => $m) {
                $im = $imp[$m];
                if ($centroId) {
                    $rb = $baseCentro[$m] ?? 0.0;   /* v1.25.1: receita com nota do centro */
                    $baseEmp = $im['base'];
                    $usar = $im['situacao'] === 'provisao' ? round(max(0, $rb) * (float) $cfg['provisaoPct'] / 100, 2) : ($baseEmp > 0 ? round($im['apurado'] * max(0, $rb) / $baseEmp, 2) : 0.0);
                    if ($im['situacao'] === 'provisao') $prov[$i] = -$usar; else $rateio[$i] = -$usar;
                } elseif ($im['situacao'] === 'provisao') $prov[$i] = -$im['provisao'];
            }
            if (array_filter($prov)) { $g['deducoes']['prov'] = $prov; $notaProv = true; }
            if (array_filter($rateio)) $g['deducoes']['rateio'] = $rateio;
        }

        /* v1.26.0: formato do xFin — grupo › categoria › subcategoria, margem de contribuição e ponto de equilíbrio */
        $soma = function ($a, $b, $s = 1) { return array_map(function ($x, $y) use ($s) { return round($x + $s * $y, 2); }, $a, $b); };
        $nomeDe = function ($k) use ($cats, $cfg) {
            if ($k === 'prov') return 'Provisão de impostos (' . str_replace('.', ',', (string) (float) $cfg['provisaoPct']) . '% — até lançar a guia)';
            if ($k === 'rateio') return 'Impostos apurados (rateio pela receita do centro)';
            if ($k === 0) return 'Receitas sem categoria';
            if ($k === -1) return 'Despesas sem categoria';
            return $cats[$k][0] ?? 'Categoria ' . $k;
        };
        $linha = function ($k, $vals, $nivel, $extra = []) use ($nomeDe) {
            return $extra + ['k' => $nivel . $k, 'rotulo' => $nomeDe($k), 'nivel' => $nivel, 'catId' => is_int($k) ? $k : null, 'provisao' => $k === 'prov',
                             'valores' => array_map(function ($x) { return round($x, 2); }, $vals), 'total' => round(array_sum($vals), 2)];
        };
        $ordenar = function (&$l) { usort($l, function ($a, $b) { return abs($b['total']) <=> abs($a['total']); }); };
        $linhas = [];
        $grupo = function ($chave, $rotulo, $grs) use (&$linhas, $g, $cats, $zero, $soma, $linha, $ordenar) {
            $pais = [];
            foreach ($grs as $gr) foreach ($g[$gr] ?? [] as $k => $vals) {
                $pai = is_int($k) && $k > 0 ? (int) ($cats[$k][3] ?? 0) : 0;
                if ($pai && isset($cats[$pai])) { $pais[$pai]['subs'][$k] = $vals; if (!isset($pais[$pai]['own'])) $pais[$pai]['own'] = $zero; }
                else $pais[$k]['own'] = isset($pais[$k]['own']) ? $soma($pais[$k]['own'], $vals) : $vals;
            }
            $tot = $zero; $filhos = [];
            foreach ($pais as $k => $x) {
                $subs = [];
                $vals = $x['own'] ?? $zero;
                foreach ($x['subs'] ?? [] as $sk => $sv) { $subs[] = $linha($sk, $sv, 'sub'); $vals = $soma($vals, $sv); }
                if ($subs && array_filter($x['own'] ?? [])) $subs[] = $linha($k, $x['own'], 'sub', ['rotulo' => 'Direto em "' . ($cats[$k][0] ?? '') . '"', 'so' => true]);
                $ordenar($subs);
                $filhos[] = $linha($k, $vals, 'cat', ['filhos' => $subs]);
                $tot = $soma($tot, $vals);
            }
            $ordenar($filhos);
            $linhas[] = ['k' => $chave, 'rotulo' => $rotulo, 'nivel' => 'grupo', 'grupo' => $grs[0], 'valores' => $tot, 'total' => round(array_sum($tot), 2), 'filhos' => $filhos];
            return $tot;
        };
        $total = function ($k, $rotulo, $vals, $final = false) use (&$linhas) {
            $linhas[] = ['k' => $k, 'rotulo' => $rotulo, 'nivel' => 'total', 'final' => $final, 'valores' => $vals, 'total' => round(array_sum($vals), 2)];
        };
        $pct = function ($k, $rotulo, $num, $den) use (&$linhas) {
            $v = array_map(function ($a, $b) { return $b > 0 ? round($a / $b, 4) : null; }, $num, $den);
            $sd = array_sum($den);
            $linhas[] = ['k' => $k, 'rotulo' => $rotulo, 'nivel' => 'pct', 'valores' => $v, 'total' => $sd > 0 ? round(array_sum($num) / $sd, 4) : null];
        };
        $rb  = $grupo('receita_bruta', '(+) Receita bruta', ['receita_bruta']);
        $ded = $grupo('deducoes', '(−) Deduções sobre vendas', ['deducoes']);
        $rl  = $soma($rb, $ded);                $total('receita_liquida', '(=) Receita líquida', $rl);
        $cv  = $grupo('variaveis', '(−) Custos e despesas variáveis', ['custo_direto']);
        $mc  = $soma($rl, $cv);                 $total('margem_contribuicao', '(=) Margem de contribuição', $mc);
        $pct('mc_pct', '% Margem de contribuição', $mc, $rb);
        $cf  = $grupo('fixas', '(−) Custos e despesas fixas', ['despesa_operacional']);
        $ro  = $soma($mc, $cf);                 $total('resultado_operacional', '(=) Resultado operacional', $ro);
        $no  = $grupo('nao_operacional', '(±) Resultado financeiro e não operacional', ['receita_financeira', 'despesa_financeira']);
        $lair = $soma($ro, $no);                $total('lair', '(=) Lucro antes do IR e CSLL (LAIR)', $lair);
        $ir  = $grupo('ir_csll', '(−) IR e CSLL', ['tributo_lucro']);
        $ll  = $soma($lair, $ir);               $total('lucro_liquido', '(=) Lucro líquido', $ll, true);
        $pct('margem_liquida', '% Margem líquida', $ll, $rb);

        /* ponto de equilíbrio: quanto precisa faturar para cobrir os custos e despesas fixas
           = fixas ÷ (% margem de contribuição sobre a receita bruta) */
        $pe = function ($f, $m, $r) { $mcp = $r > 0 ? $m / $r : 0; return $mcp > 0 ? round(-$f / $mcp, 2) : null; };
        $peM = array_map($pe, $cf, $mc, $rb);
        $peT = $pe(array_sum($cf), array_sum($mc), array_sum($rb));
        $seg = function ($p, $r) { return $p !== null && $r > 0 ? round(($r - $p) / $r, 4) : null; };
        $rbT = array_sum($rb);
        $equilibrio = [
            'valores' => $peM, 'total' => $peT,
            'falta' => array_map(function ($p, $r) { return $p !== null ? round($p - $r, 2) : null; }, $peM, $rb), 'faltaTotal' => $peT !== null ? round($peT - $rbT, 2) : null,
            'seguranca' => array_map($seg, $peM, $rb), 'segurancaTotal' => $seg($peT, $rbT),
            /* média só dos meses com movimento (um ano com 2 meses lançados não divide por 12) */
            'mediaMes' => $peT !== null ? round($peT / max(1, count(array_filter(array_map(function ($r, $f) { return abs($r) > 0.004 || abs($f) > 0.004; }, $rb, $cf)))), 2) : null,
        ];
        return ['de' => $de, 'ate' => $ate, 'meses' => $meses, 'regime' => $regime, 'centroId' => $centroId ?: null, 'linhas' => $linhas,
                'receitaBruta' => $rb, 'foraDre' => $foraDre, 'foraDreTotal' => round(array_sum($foraDre), 2), 'equilibrio' => $equilibrio,
                'impostos' => array_values($imp), 'provisaoPct' => (float) $cfg['provisaoPct'], 'provisaoBase' => $cfg['provisaoBase'], 'temProvisao' => $notaProv,
                'mesAtual' => date('Y-m')];
    },

    /* o que compõe uma célula da DRE: {mes, categoriaId (0 = receitas sem categoria, -1 = despesas sem), grupo?, regime, centroId?} */
    'dre.detalhe' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $mes = fin_mes($d['mes'] ?? '', date('Y-m'));
        $d1 = $mes . '-01'; $d2 = fin_mes_fim($mes);
        $regime = ($d['regime'] ?? '') === 'caixa' ? 'caixa' : 'competencia';
        $centroId = (int) ($d['centroId'] ?? 0);
        $cat = (int) ($d['categoriaId'] ?? 0);
        $cats = fin_cats_mapa($tid);
        $grupo = (string) ($d['grupo'] ?? '');
        /* filtro de categoria: uma categoria, "sem categoria", ou o grupo inteiro */
        if ($grupo !== '' && isset(FIN_GRUPOS_DRE[$grupo])) {
            $ids = array_keys(array_filter($cats, function ($c) use ($grupo) { return $c[2] === $grupo; }));
            $ids = $ids ? implode(',', array_map('intval', $ids)) : '0';
            $semCat = $grupo === 'receita_bruta' ? 1 : ($grupo === 'despesa_operacional' ? -1 : 0);
            $fc = function ($col, $sinalCol) use ($ids, $semCat) { return " AND ($col IN ($ids)" . ($semCat ? " OR ($col IS NULL AND $sinalCol)" : '') . ")"; };
        } else {
            $ids = $cat > 0 ? (!empty($d['so']) ? (string) $cat : fin_cat_ids($tid, $cat)) : '';   /* v1.26.0: categoria + subcategorias */
            $fc = function ($col, $sinalCol) use ($cat, $ids) { return $cat > 0 ? " AND $col IN ($ids)" : " AND $col IS NULL AND $sinalCol"; };
        }
        $titulos = []; $movs = [];
        if ($regime === 'caixa') {
            $w = $fc('COALESCE(t.categoria_id, m.categoria_id)', ($cat === -1 || ($grupo === 'despesa_operacional')) ? 'm.valor < 0' : 'm.valor > 0'); $p = [$tid, $d1, $d2];
            if ($centroId) { $w .= " AND COALESCE(t.centro_id, m.centro_id) = ?"; $p[] = $centroId; }
            $movs = linhas("SELECT m.id, m.data, m.valor, COALESCE(m.descricao, t.descricao) AS descricao, m.titulo_id, c.nome AS conta
                              FROM fin_movimentos m LEFT JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                              LEFT JOIN fin_contas c ON c.tenant_id = m.tenant_id AND c.id = m.conta_id
                             WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.transferencia IS NULL AND m.data BETWEEN ? AND ?$w ORDER BY m.data, m.id LIMIT 300", $p);
        } else {
            $w = $fc('t.categoria_id', ($cat === -1 || $grupo === 'despesa_operacional') ? "t.tipo = 'pagar'" : "t.tipo = 'receber'"); $p = [$tid, $d1, $d2];
            if ($centroId) { $w .= " AND t.centro_id = ?"; $p[] = $centroId; }
            $titulos = array_map('fin_titulo_publico', linhas(FIN_SELECT_TITULO . " WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status <> 'cancelado' AND t.competencia BETWEEN ? AND ?" .
                                                              $w . " ORDER BY t.competencia, t.id LIMIT 300", $p));
            $w = $fc('m.categoria_id', ($cat === -1 || $grupo === 'despesa_operacional') ? 'm.valor < 0' : 'm.valor > 0'); $p = [$tid, $d1, $d2];
            if ($centroId) { $w .= " AND m.centro_id = ?"; $p[] = $centroId; }
            $movs = linhas("SELECT m.id, m.data, m.valor, m.descricao, m.titulo_id, c.nome AS conta FROM fin_movimentos m LEFT JOIN fin_contas c ON c.tenant_id = m.tenant_id AND c.id = m.conta_id
                             WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.titulo_id IS NULL AND m.transferencia IS NULL AND m.data BETWEEN ? AND ?$w ORDER BY m.data, m.id LIMIT 300", $p);
        }
        return ['mes' => $mes, 'regime' => $regime, 'titulos' => $titulos,
                'movimentos' => array_map(function ($m) { return ['id' => (int) $m['id'], 'data' => $m['data'], 'valor' => (float) $m['valor'], 'descricao' => $m['descricao'], 'conta' => $m['conta'],
                                                                  'tituloId' => $m['titulo_id'] !== null ? (int) $m['titulo_id'] : null]; }, $movs)];
    },

    /* impostos: marcar mês como "sem imposto a pagar" (apurado = 0) ou desfazer. {mes, zerado} */
    'impostos.zerar' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $mes = fin_mes($d['mes'] ?? '', '');
        if ($mes === '') erro('Mês inválido.');
        $c = fin_config($tid);
        $l = array_values(array_filter((array) ($c['impostosZerados'] ?? []), function ($m) use ($mes) { return $m !== $mes; }));
        if (!empty($d['zerado'])) $l[] = $mes;
        sort($l);
        $c['impostosZerados'] = array_slice($l, -120);
        fin_config_gravar($tid, $c);
        auditar('fin_impostos_mes', 'config', null, $mes . (!empty($d['zerado']) ? ' sem imposto' : ' volta à provisão'));
        return ['ok' => true];
    },

    /* rentabilidade: {de, ate (AAAA-MM), dim: centro|cliente|servico|contrato} */
    'rentabilidade' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $de = fin_mes($d['de'] ?? '', date('Y') . '-01');
        $ate = fin_mes($d['ate'] ?? '', date('Y-m'));
        if ($ate < $de) [$de, $ate] = [$ate, $de];
        $d1 = $de . '-01'; $d2 = fin_mes_fim($ate);
        $dim = in_array($d['dim'] ?? '', ['centro', 'cliente', 'servico', 'contrato', 'chamado'], true) ? $d['dim'] : 'centro';
        $cfg = fin_config($tid);
        $pct = (float) $cfg['provisaoPct'] / 100;
        $cats = fin_cats_mapa($tid);
        /* alíquota efetiva de cada mês: guia apurada ÷ base; sem guia, a provisão */
        $taxa = [];
        foreach (fin_impostos_meses($tid, fin_meses_entre($de, $ate), $cfg) as $m => $im) $taxa[$m] = $im['base'] > 0 && $im['apurado'] !== null ? $im['apurado'] / $im['base'] : ($im['situacao'] === 'provisao' ? $pct : 0.0);
        $tx = function ($m) use ($taxa, $pct) { return $taxa[$m] ?? $pct; };
        $op = []; foreach ($cats as $id => $c) if ($c[2] !== 'fora_dre') $op[] = (int) $id;
        $inOp = $op ? implode(',', $op) : '0';
        $L = [];
        $linha = function ($k, $nome, $sub = null) use (&$L) {
            if (!isset($L[$k])) $L[$k] = fin_rent_linha($k, $nome, $sub);   /* v1.37.0 */
            return $k;
        };
        $nota = '';
        if ($dim === 'centro') {
            foreach (linhas("SELECT DATE_FORMAT(t.competencia, '%Y-%m') AS mes, t.centro_id, cen.nome, t.tipo, cat.grupo_dre AS gr, SUM(t.valor) AS v, COUNT(*) AS n,
                                    SUM(CASE WHEN " . fin_sql_nota('t') . " = 1 THEN t.valor ELSE 0 END) AS vn
                               FROM fin_titulos t LEFT JOIN fin_centros cen ON cen.tenant_id = t.tenant_id AND cen.id = t.centro_id
                               LEFT JOIN fin_categorias cat ON cat.tenant_id = t.tenant_id AND cat.id = t.categoria_id
                              WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status <> 'cancelado' AND t.competencia BETWEEN ? AND ?
                                AND (t.categoria_id IS NULL OR t.categoria_id IN ($inOp))
                              GROUP BY mes, t.centro_id, cen.nome, t.tipo, cat.grupo_dre", [$tid, $d1, $d2]) as $r) {
                $k = $linha('c' . (int) $r['centro_id'], $r['nome'] ?: 'Sem centro de custo');
                $v = (float) $r['v'];
                if ($r['gr'] === 'deducoes') continue;   /* imposto entra pela alíquota efetiva do mês (abaixo) */
                if ($r['tipo'] === 'receber') {
                    $L[$k]['receita'] += $v; $L[$k]['qtd'] += (int) $r['n'];
                    if ($r['gr'] === 'receita_bruta' || $r['gr'] === null) $L[$k]['imposto'] += (float) $r['vn'] * $tx($r['mes']);   /* só com nota */
                }
                elseif ($r['gr'] === 'custo_direto') $L[$k]['custo'] += $v;
                else $L[$k]['despesa'] += $v;
            }
            $nota = 'Receitas e despesas pela competência, pelo centro de custo de cada lançamento. Imposto só sobre receita com nota: a guia do mês rateada (ou a provisão, se a guia ainda não foi lançada).';
        } elseif ($dim === 'cliente') {
            /* v1.37.0: custos = o que foi LANÇADO ligado aos chamados/contratos do cliente (antes só contava o custo digitado no chamado) */
            foreach (fin_rent_itens($tid, $d1, $d2, $inOp, $tx) as $x) {
                if ($x['clienteId'] === null && $x['tipo'] !== 'receber') continue;   /* despesa geral da empresa: fica na DRE */
                $k = $linha('k' . (int) $x['clienteId'], $x['clienteNome'] ?: 'Sem cliente');
                $L[$k]['id'] = (int) $x['clienteId'];
                fin_rent_somar($L[$k], $x);
            }
            foreach (fin_rent_estimados($tid, $d1, $d2) as $e) {
                $k = $linha('k' . (int) $e['clienteId'], $e['clienteNome'] ?: 'Sem cliente');
                $L[$k]['id'] = (int) $e['clienteId'];
                $L[$k]['custo'] += $e['valor']; $L[$k]['estimado'] += $e['valor'];
            }
            $nota = 'Receita = contas a receber do cliente (competência) e entradas ligadas aos serviços dele. Custos e despesas = contas a pagar, compras e saídas do extrato ligadas aos chamados/contratos do cliente. Chamado sem nenhum custo lançado usa o custo + RT digitado nele (marcado como estimado). Clique no cliente para ver serviço por serviço.';
        } elseif ($dim === 'servico') {
            $in = "'" . implode("','", FCH_GANHO) . "'";
            foreach (linhas("SELECT COALESCE(NULLIF(ch.tipo_servico, ''), 'Sem tipo') AS tipo, COUNT(*) AS n, SUM(COALESCE(ch.valor, 0)) AS v, SUM(COALESCE(ch.custo, 0)) AS custo,
                                    SUM(COALESCE(ch.rt, 0)) AS rt, SUM(CASE WHEN ch.nota_fiscal = 1 THEN COALESCE(ch.imposto, 0) ELSE 0 END) AS imp,
                                    SUM(CASE WHEN ch.nota_fiscal = 1 AND COALESCE(ch.imposto, 0) = 0 THEN COALESCE(ch.valor, 0) ELSE 0 END) AS sem_imp,
                                    SUM(COALESCE(ch.recebido, 0)) AS rec
                               FROM chamados ch WHERE ch.tenant_id = ? AND ch.excluido_em IS NULL AND ch.status IN ($in) AND ch.ganho_em BETWEEN ? AND ?
                              GROUP BY tipo", [$tid, $d1, $d2]) as $r) {
                $k = $linha('s' . md5($r['tipo']), $r['tipo']);
                $L[$k]['qtd'] += (int) $r['n']; $L[$k]['receita'] += (float) $r['v']; $L[$k]['custo'] += (float) $r['custo'] + (float) $r['rt'];
                $L[$k]['imposto'] += (float) $r['imp'] + round((float) $r['sem_imp'] * $pct, 2); $L[$k]['recebido'] += (float) $r['rec'];
                $L[$k]['aberto'] += max(0, (float) $r['v'] - (float) $r['rec']);
            }
            $nota = 'Chamados ganhos no período, pelo tipo de serviço. Custo = custo + RT do chamado. Imposto só nos chamados com nota fiscal: o do orçamento; sem ele, a provisão.';
        } else {
            /* v1.25.3: contrato ou chamado = o que veio dele (mensalidades / parcelas do orçamento)
               + lançamentos vinculados a ele (a pagar, a receber, compra no cartão, tarifa/ajuste, lançado do extrato) */
            $vt = $dim; $tem = fin_tem_vinculo();
            $idExpr = $tem ? "CASE WHEN t.origem_tipo = '$vt' THEN t.origem_id ELSE t.vinculo_id END" : "t.origem_id";
            $wv = $tem ? "(t.origem_tipo = '$vt' OR t.vinculo_tipo = '$vt')" : "t.origem_tipo = '$vt'";
            $rows = linhas("SELECT DATE_FORMAT(t.competencia, '%Y-%m') AS mes, $idExpr AS xid, t.tipo, cat.grupo_dre AS gr, COUNT(*) AS n, SUM(t.valor) AS v,
                                   SUM(CASE WHEN " . fin_sql_nota('t') . " = 1 THEN t.valor ELSE 0 END) AS vn, SUM(t.pago) AS pago,
                                   SUM(CASE WHEN t.status IN ('aberto','parcial') THEN t.valor - t.pago ELSE 0 END) AS ab
                              FROM fin_titulos t LEFT JOIN fin_categorias cat ON cat.tenant_id = t.tenant_id AND cat.id = t.categoria_id
                             WHERE t.tenant_id = ? AND $wv AND t.excluido_em IS NULL AND t.status <> 'cancelado' AND t.competencia BETWEEN ? AND ?
                               AND (t.categoria_id IS NULL OR t.categoria_id IN ($inOp))
                             GROUP BY mes, xid, t.tipo, cat.grupo_dre", [$tid, $d1, $d2]);
            $movs = $tem ? linhas("SELECT m.vinculo_id AS xid, cat.grupo_dre AS gr, (m.valor > 0) AS ent, COUNT(*) AS n, SUM(ABS(m.valor)) AS v
                                     FROM fin_movimentos m LEFT JOIN fin_categorias cat ON cat.tenant_id = m.tenant_id AND cat.id = m.categoria_id
                                    WHERE m.tenant_id = ? AND m.vinculo_tipo = ? AND m.titulo_id IS NULL AND m.excluido_em IS NULL AND m.data BETWEEN ? AND ?
                                      AND m.categoria_id IN ($inOp)
                                    GROUP BY xid, cat.grupo_dre, ent", [$tid, $vt, $d1, $d2]) : [];
            $ids = [];
            foreach (array_merge($rows, $movs) as $r) if ($r['xid']) $ids[(int) $r['xid']] = 1;
            $nomes = [];
            if ($ids) foreach (linhas("SELECT x.id, x.numero, x.status, " . ($vt === 'contrato' ? "x.valor_mensal, NULL AS tipo_servico" : "NULL AS valor_mensal, x.tipo_servico") . ", cl.nome
                                         FROM " . ($vt === 'contrato' ? 'contratos' : 'chamados') . " x LEFT JOIN clientes cl ON cl.tenant_id = x.tenant_id AND cl.id = x.cliente_id
                                        WHERE x.tenant_id = ? AND x.id IN (" . implode(',', array_keys($ids)) . ")", [$tid]) as $r)
                $nomes[(int) $r['id']] = $vt === 'contrato'
                    ? ['Contrato ' . $r['numero'] . ($r['nome'] ? ' · ' . $r['nome'] : ''), $r['status'] . ($r['valor_mensal'] !== null ? ' · ' . fin_br($r['valor_mensal']) . '/mês' : '')]
                    : ['Chamado ' . $r['numero'] . ($r['nome'] ? ' · ' . $r['nome'] : ''), trim(($r['tipo_servico'] ?: '') . ' · ' . $r['status'], ' ·')];
            $chave = function ($xid) use ($linha, &$nomes, $vt, &$L) {
                $nm = $nomes[(int) $xid] ?? [($vt === 'contrato' ? 'Contrato' : 'Chamado') . ' (excluído)', null];
                $k = $linha(($vt === 'contrato' ? 't' : 'h') . (int) $xid, $nm[0], $nm[1]);
                $L[$k]['id'] = (int) $xid;   /* v1.37.0: para abrir o detalhe */
                return $k;
            };
            foreach ($rows as $r) {
                if ($r['gr'] === 'deducoes') continue;   /* imposto entra pela alíquota efetiva do mês */
                $k = $chave($r['xid']); $v = (float) $r['v'];
                $L[$k]['qtd'] += (int) $r['n'];
                if ($r['tipo'] === 'receber') {
                    $L[$k]['receita'] += $v; $L[$k]['recebido'] += (float) $r['pago']; $L[$k]['aberto'] += (float) $r['ab'];
                    if ($r['gr'] === 'receita_bruta' || $r['gr'] === null) $L[$k]['imposto'] += (float) $r['vn'] * $tx($r['mes']);   /* só com nota */
                } elseif ($r['gr'] === 'custo_direto') $L[$k]['custo'] += $v;
                else $L[$k]['despesa'] += $v;
            }
            foreach ($movs as $r) {
                if ($r['gr'] === 'deducoes') continue;
                $k = $chave($r['xid']); $v = (float) $r['v'];
                $L[$k]['qtd'] += (int) $r['n'];
                if ((int) $r['ent'] === 1) { $L[$k]['receita'] += $v; $L[$k]['recebido'] += $v; }
                elseif ($r['gr'] === 'custo_direto') $L[$k]['custo'] += $v;
                else $L[$k]['despesa'] += $v;
            }
            /* v1.37.0: chamado ganho no período sem nenhum custo lançado → custo + RT digitado nele (estimado) */
            if ($vt === 'chamado') {
                $est = fin_rent_estimados($tid, $d1, $d2);
                $faltam = [];
                foreach ($est as $e) if (!isset($nomes[$e['xid']])) $faltam[] = 'chamado:' . $e['xid'];
                foreach (fin_rent_refs($tid, [], $faltam) as $kk => $r) $nomes[(int) substr($kk, 8)] = [$r['nome'], $r['sub']];
                foreach ($est as $e) { $k = $chave($e['xid']); $L[$k]['custo'] += $e['valor']; $L[$k]['estimado'] += $e['valor']; }
            }
            $nota = $vt === 'contrato'
                ? 'Mensalidades dos contratos e lançamentos vinculados a cada contrato, pela competência (tarifas e ajustes pela data). Custos = categorias de custo direto; o resto entra em Despesas. Imposto só sobre receita com nota.'
                : 'Parcelas do orçamento de cada chamado e lançamentos vinculados a ele, pela competência (tarifas e ajustes pela data). Custos = categorias de custo direto; o resto entra em Despesas. Chamado sem nenhum custo lançado usa o custo + RT digitado nele (estimado). Imposto só sobre receita com nota.';
        }
        $out = [];
        foreach ($L as $x) $out[] = fin_rent_fechar($x);
        usort($out, function ($a, $b) { return $b['receita'] <=> $a['receita'] ?: $b['resultado'] <=> $a['resultado']; });
        $tot = ['receita' => 0, 'custo' => 0, 'estimado' => 0, 'imposto' => 0, 'despesa' => 0, 'resultado' => 0, 'recebido' => 0, 'aberto' => 0, 'qtd' => 0];
        foreach ($out as $x) foreach ($tot as $c => $_) $tot[$c] += $x[$c];
        foreach ($tot as $c => $v) $tot[$c] = round($v, 2);
        $tot['margem'] = $tot['receita'] > 0 ? round($tot['resultado'] / $tot['receita'] * 100, 1) : null;
        return ['de' => $de, 'ate' => $ate, 'dim' => $dim, 'linhas' => $out, 'totais' => $tot, 'nota' => $nota];
    },

    /* v1.37.0: detalhe de uma linha da rentabilidade — {de, ate (AAAA-MM), dim: cliente|chamado|contrato, id}
       Cliente: os serviços dele (chamado por chamado, contrato por contrato) e cada lançamento.
       Chamado/contrato: cada lançamento. Mesma regra da tabela (fin_rent_itens). */
    'rentabilidade.detalhe' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        $de = fin_mes($d['de'] ?? '', date('Y') . '-01');
        $ate = fin_mes($d['ate'] ?? '', date('Y-m'));
        if ($ate < $de) [$de, $ate] = [$ate, $de];
        $d1 = $de . '-01'; $d2 = fin_mes_fim($ate);
        $dim = in_array($d['dim'] ?? '', ['cliente', 'chamado', 'contrato'], true) ? $d['dim'] : 'cliente';
        $id = (int) ($d['id'] ?? 0);
        $cats = fin_cats_mapa($tid);
        $op = []; foreach ($cats as $cid => $c) if ($c[2] !== 'fora_dre') $op[] = (int) $cid;
        $inOp = $op ? implode(',', $op) : '0';
        $tx = fin_rent_taxa($tid, $de, $ate, fin_config($tid));
        $todos = fin_rent_itens($tid, $d1, $d2, $inOp, $tx);
        $est = fin_rent_estimados($tid, $d1, $d2);
        if ($dim === 'cliente') {
            $itens = array_values(array_filter($todos, function ($x) use ($id) {
                return $id ? (int) $x['clienteId'] === $id : ($x['clienteId'] === null && $x['tipo'] === 'receber'); }));
            $est = array_values(array_filter($est, function ($e) use ($id) { return (int) $e['clienteId'] === $id; }));
            $nome = $id ? (valor("SELECT nome FROM clientes WHERE id = ? AND tenant_id = ?", [$id, $tid]) ?: 'Cliente excluído') : 'Sem cliente';
        } else {
            $itens = array_values(array_filter($todos, function ($x) use ($dim, $id) { return $x['xt'] === $dim && (int) $x['xid'] === $id; }));
            $est = $dim === 'chamado' ? array_values(array_filter($est, function ($e) use ($id) { return $e['xid'] === $id; })) : [];
            $r = fin_rent_refs($tid, [], [$dim . ':' . $id]);
            $nome = $r[$dim . ':' . $id]['nome'] ?? (($dim === 'chamado' ? 'Chamado' : 'Contrato') . ' (excluído)');
        }
        /* serviço por serviço (só no cliente) */
        $S = [];
        $chaveS = function ($xt, $xid, $nm, $sub) use (&$S) {
            $k = $xt ? $xt . ':' . $xid : 'sem';
            if (!isset($S[$k])) { $S[$k] = fin_rent_linha($k, $xt ? $nm : 'Sem chamado ou contrato', $xt ? $sub : 'lançamentos do cliente sem serviço ligado'); $S[$k]['xt'] = $xt; $S[$k]['xid'] = $xid; }
            return $k;
        };
        $tot = fin_rent_linha('total', $nome);
        foreach ($itens as $x) { fin_rent_somar($tot, $x); if ($dim === 'cliente') fin_rent_somar($S[$chaveS($x['xt'], (int) $x['xid'], $x['servico'], $x['servicoSub'])], $x); }
        foreach ($est as $e) {
            $tot['custo'] += $e['valor']; $tot['estimado'] += $e['valor'];
            if ($dim === 'cliente') { $k = $chaveS('chamado', $e['xid'], $e['servico'], 'custo estimado (digitado no chamado)'); $S[$k]['custo'] += $e['valor']; $S[$k]['estimado'] += $e['valor']; }
        }
        $servicos = array_map('fin_rent_fechar', array_values($S));
        usort($servicos, function ($a, $b) { return ($a['xt'] === null) <=> ($b['xt'] === null) ?: $b['receita'] <=> $a['receita']; });
        usort($itens, function ($a, $b) { return strcmp($a['data'], $b['data']) ?: $a['id'] <=> $b['id']; });
        foreach ($itens as &$x) foreach (['valor', 'imposto', 'recebido', 'aberto'] as $c) $x[$c] = round($x[$c], 2);
        unset($x);
        return ['de' => $de, 'ate' => $ate, 'dim' => $dim, 'id' => $id, 'nome' => $nome, 'totais' => fin_rent_fechar($tot),
                'servicos' => $dim === 'cliente' ? $servicos : [], 'itens' => $itens, 'estimados' => $est];
    },

    /* v1.37.0: ajusta um movimento AVULSO (lançado do extrato, tarifa, ajuste) sem mexer em valor, data nem conta
       — a conciliação continua valendo. {id, categoriaId, centroId, descricao, vinculo} */
    'movimento.ajustar' => function ($d) {
        $u = fin_u(); fin_tabelas();
        $tid = tenant();
        $m = linha("SELECT * FROM fin_movimentos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid]);
        if (!$m) erro('Movimento não encontrado.', 404);
        if ($m['tipo'] !== 'avulso' || $m['titulo_id'] !== null) erro('Só dá para ajustar aqui movimento avulso. Baixa de conta: abra a conta; transferência: estorne e lance de novo.');
        $cat = fin_id_da_empresa('fin_categorias', $d['categoriaId'] ?? 0, $tid, 'Categoria');
        if (!$cat) erro('Escolha a categoria.');
        $tipoCat = valor("SELECT tipo FROM fin_categorias WHERE id = ? AND tenant_id = ?", [$cat, $tid]);
        if ($tipoCat !== ((float) $m['valor'] > 0 ? 'receita' : 'despesa')) erro((float) $m['valor'] > 0 ? 'Entrada precisa de categoria de receita.' : 'Saída precisa de categoria de despesa.');
        $centro = fin_id_da_empresa('fin_centros', $d['centroId'] ?? 0, $tid, 'Centro de custo');
        $desc = txt($d['descricao'] ?? '', 255);
        if ($desc === '') erro('Informe a descrição.');
        $sets = "categoria_id = ?, centro_id = ?, descricao = ?"; $par = [$cat, $centro, $desc];
        $vt = null; $vi = null;
        if (fin_tem_vinculo()) {
            [$vt, $vi] = fin_vinculo_ler($d, $tid, $m, true);
            $sets .= ", vinculo_tipo = ?, vinculo_id = ?"; array_push($par, $vt, $vi);
        }
        q("UPDATE fin_movimentos SET $sets WHERE id = ? AND tenant_id = ?", array_merge($par, [(int) $m['id'], $tid]));
        auditar('fin_movimento_ajuste', 'fin_movimentos', (int) $m['id'], fin_br(abs((float) $m['valor'])) . ' · ' . $desc . ($vt ? ' · ' . $vt . ' ' . $vi : ''));
        return ['id' => (int) $m['id']];
    },

    /* ---- cobrança mensal dos contratos ---- */
    'contrato.cobranca.obter' => function ($d) {
        exigir_perfil('admin', 'financeiro', 'comercial'); fin_tabelas(); fin_exigir_v125();
        $tid = tenant();
        $ct = linha("SELECT ct.*, cl.nome AS cliente_nome FROM contratos ct LEFT JOIN clientes cl ON cl.tenant_id = ct.tenant_id AND cl.id = ct.cliente_id
                      WHERE ct.id = ? AND ct.tenant_id = ? AND ct.excluido_em IS NULL", [(int) ($d['contratoId'] ?? 0), $tid]);
        if (!$ct) erro('Contrato não encontrado.', 404, 'NAO_ENCONTRADO');
        $f = linha("SELECT * FROM contrato_faturamento WHERE tenant_id = ? AND contrato_id = ?", [$tid, (int) $ct['id']]);
        $o = fin_cobranca_publica($tid, $ct, $f);
        $o['categorias'] = array_map(function ($c) { return ['id' => (int) $c['id'], 'nome' => $c['nome']]; },
            linhas("SELECT id, nome FROM fin_categorias WHERE tenant_id = ? AND excluido_em IS NULL AND ativa = 1 AND tipo = 'receita' ORDER BY ordem, nome", [$tid]));
        $o['contas'] = array_map(function ($c) { return ['id' => (int) $c['id'], 'nome' => $c['nome']]; },
            linhas("SELECT id, nome FROM fin_contas WHERE tenant_id = ? AND excluido_em IS NULL AND ativa = 1 AND tipo <> 'cartao' ORDER BY ordem, nome", [$tid]));
        $o['centros'] = array_map(function ($c) { return ['id' => (int) $c['id'], 'nome' => $c['nome']]; },
            linhas("SELECT id, nome FROM fin_centros WHERE tenant_id = ? AND excluido_em IS NULL AND ativo = 1 ORDER BY nome", [$tid]));
        $o['formas'] = FIN_FORMAS;
        $o['categoriaPadrao'] = fct_categoria($tid);
        return $o;
    },

    /* {contratoId, ativo, diaVencimento?, valor? (vazio = valor mensal do contrato), categoriaId?, centroId?, contaId?, forma?, inicioCobranca? (AAAA-MM), descricao?, obs?} */
    'contrato.cobranca.salvar' => function ($d) {
        exigir_perfil('admin', 'financeiro', 'comercial'); fin_tabelas(); fin_exigir_v125();
        $tid = tenant();
        $ct = linha("SELECT ct.*, cl.nome AS cliente_nome FROM contratos ct LEFT JOIN clientes cl ON cl.tenant_id = ct.tenant_id AND cl.id = ct.cliente_id
                      WHERE ct.id = ? AND ct.tenant_id = ? AND ct.excluido_em IS NULL", [(int) ($d['contratoId'] ?? 0), $tid]);
        if (!$ct) erro('Contrato não encontrado.', 404, 'NAO_ENCONTRADO');
        $ativo = !empty($d['ativo']) ? 1 : 0;
        $dia = (int) ($d['diaVencimento'] ?? 0);
        if ($dia && ($dia < 1 || $dia > 31)) erro('Dia de vencimento entre 1 e 31.');
        $valor = trim((string) ($d['valor'] ?? '')) === '' ? null : fin_valor($d['valor'], 'o valor da mensalidade');
        $cat = fin_id_da_empresa('fin_categorias', $d['categoriaId'] ?? 0, $tid, 'Categoria');
        if ($cat && valor("SELECT tipo FROM fin_categorias WHERE id = ? AND tenant_id = ?", [$cat, $tid]) !== 'receita') erro('Escolha uma categoria de receita.');
        $ini = fin_mes($d['inicioCobranca'] ?? '', '');
        if ($ativo) {
            if (($valor ?? (float) $ct['valor_mensal']) <= 0) erro('Informe o valor da mensalidade (o contrato está sem valor mensal).');
            if ($ini === '') $ini = date('Y-m');
            if ($ini < date('Y-m', strtotime('-' . FCT_MAX_RETRO . ' months'))) erro('O início da cobrança pode voltar no máximo ' . FCT_MAX_RETRO . ' meses.');
        }
        $campos = ['ativo' => $ativo, 'dia_vencimento' => $dia ?: null, 'valor' => $valor, 'categoria_id' => $cat,
                   'centro_id' => fin_id_da_empresa('fin_centros', $d['centroId'] ?? 0, $tid, 'Centro de custo'),
                   'conta_id' => fin_id_da_empresa('fin_contas', $d['contaId'] ?? 0, $tid, 'Conta'),
                   'forma' => txt_ou_null($d['forma'] ?? '', 30), 'inicio_cobranca' => $ini !== '' ? $ini . '-01' : null,
                   'descricao' => txt_ou_null($d['descricao'] ?? '', 120), 'obs' => txt_ou_null($d['obs'] ?? '', 1000)];
        if (fin_tem_nota()) $campos['com_nota'] = array_key_exists('comNota', $d) && !$d['comNota'] ? 0 : 1;   /* v1.25.1 */
        $ja = valor("SELECT id FROM contrato_faturamento WHERE tenant_id = ? AND contrato_id = ?", [$tid, (int) $ct['id']]);
        if ($ja) {
            $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
            q("UPDATE contrato_faturamento SET $set, atualizado_por = ? WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [(int) eu()['id'], (int) $ja, $tid]));
        } else {
            $c = $campos + ['tenant_id' => $tid, 'contrato_id' => (int) $ct['id'], 'atualizado_por' => (int) eu()['id']];
            q("INSERT INTO contrato_faturamento (" . implode(', ', array_keys($c)) . ") VALUES (" . implode(', ', array_fill(0, count($c), '?')) . ")", array_values($c));
        }
        [$cri, $atu, $can] = fct_sincronizar($tid, (int) $ct['id']);
        auditar('fin_contrato_cobranca', 'contratos', (int) $ct['id'], 'nº ' . $ct['numero'] . ($ativo ? ' cobrança ligada' : ' cobrança desligada') . " · +$cri ~$atu −$can");
        $f = linha("SELECT * FROM contrato_faturamento WHERE tenant_id = ? AND contrato_id = ?", [$tid, (int) $ct['id']]);
        $o = fin_cobranca_publica($tid, $ct, $f);
        $o['resultado'] = ['criadas' => $cri, 'atualizadas' => $atu, 'canceladas' => $can];
        return $o;
    },

    /* contratos ativos e a situação da cobrança (Financeiro › Cadastros › Contratos) */
    'contratos.cobranca.listar' => function ($d) {
        fin_u(); fin_tabelas(); fin_exigir_v125();
        $tid = tenant();
        $l = linhas("SELECT ct.id, ct.numero, ct.status, ct.valor_mensal, ct.dia_vencimento, ct.inicio, ct.fim, cl.nome AS cliente_nome,
                            f.ativo, f.valor, f.dia_vencimento AS f_dia,
                            (SELECT MIN(t.vencimento) FROM fin_titulos t WHERE t.tenant_id = ct.tenant_id AND t.origem_tipo = 'contrato' AND t.origem_id = ct.id AND t.excluido_em IS NULL AND t.status IN ('aberto','parcial')) AS proxima,
                            (SELECT COALESCE(SUM(t.valor - t.pago), 0) FROM fin_titulos t WHERE t.tenant_id = ct.tenant_id AND t.origem_tipo = 'contrato' AND t.origem_id = ct.id AND t.excluido_em IS NULL
                               AND t.status IN ('aberto','parcial') AND t.vencimento < CURDATE()) AS vencido
                       FROM contratos ct LEFT JOIN clientes cl ON cl.tenant_id = ct.tenant_id AND cl.id = ct.cliente_id
                       LEFT JOIN contrato_faturamento f ON f.tenant_id = ct.tenant_id AND f.contrato_id = ct.id
                      WHERE ct.tenant_id = ? AND ct.excluido_em IS NULL AND (ct.status IN ('Ativo','Suspenso') OR f.ativo = 1)
                      ORDER BY ct.status = 'Ativo' DESC, ct.numero", [$tid]);
        return array_map(function ($r) {
            return ['id' => (int) $r['id'], 'numero' => (int) $r['numero'], 'status' => $r['status'], 'cliente' => $r['cliente_nome'],
                    'valor' => $r['valor'] !== null ? (float) $r['valor'] : ($r['valor_mensal'] !== null ? (float) $r['valor_mensal'] : null),
                    'dia' => $r['f_dia'] !== null ? (int) $r['f_dia'] : ($r['dia_vencimento'] !== null ? (int) $r['dia_vencimento'] : null),
                    'fim' => $r['fim'], 'cobranca' => $r['ativo'] === null ? 'nao' : ((int) $r['ativo'] === 1 ? 'ligada' : 'desligada'),
                    'proxima' => $r['proxima'], 'vencido' => round((float) $r['vencido'], 2)];
        }, $l);
    },

    /* =================== v1.25.2: cartão e fluxo mensal por categoria =================== */

    /* faturas do cartão: {contaId} */
    'cartao.faturas' => function ($d) {
        fin_u(); fin_tabelas(); fin_exigir_cartao();
        $tid = tenant();
        $c = linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL AND tipo = 'cartao'", [(int) ($d['contaId'] ?? 0), $tid]);
        if (!$c) erro('Cartão não encontrado.', 404, 'NAO_ENCONTRADO');
        if (!fin_cartao_ok($c)) erro('Informe no cadastro do cartão o melhor dia de compra e o dia de vencimento da fatura.', 409, 'CARTAO_SEM_DIAS');
        $hoje = fin_hoje(); $atual = fin_fatura_de($c, $hoje);
        $l = [];
        foreach (fin_faturas_cartao($tid, $c) as $k => $x) {
            $sit = $k > $atual ? 'futura' : ($k === $atual ? 'aberta' : ($x['saldo'] <= 0.004 ? 'paga' : ($x['vencimento'] < $hoje ? 'vencida' : 'fechada')));
            $l[] = ['chave' => $k, 'situacao' => $sit] + $x;
        }
        if (!isset(array_column($l, null, 'chave')[$atual])) $l[] = ['chave' => $atual, 'situacao' => 'aberta', 'compras' => 0.0, 'creditos' => 0.0, 'saldo' => 0.0,
                                                                      'vencimento' => fin_fatura_venc($c, $atual), 'fechamento' => fin_fatura_fech($c, $atual)];
        usort($l, function ($a, $b) { return strcmp($b['chave'], $a['chave']); });
        return ['conta' => fin_conta_publica($tid, $c), 'faturas' => array_slice($l, 0, 36),
                'bancos' => array_map(function ($b) { return ['id' => (int) $b['id'], 'nome' => $b['nome']]; },
                    linhas("SELECT id, nome FROM fin_contas WHERE tenant_id = ? AND excluido_em IS NULL AND ativa = 1 AND tipo <> 'cartao' ORDER BY ordem, nome", [$tid]))];
    },

    /* lançamentos de uma fatura: {contaId, chave} */
    'cartao.fatura.itens' => function ($d) {
        fin_u(); fin_tabelas(); fin_exigir_cartao();
        $tid = tenant();
        $c = linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL AND tipo = 'cartao'", [(int) ($d['contaId'] ?? 0), $tid]);
        if (!$c || !fin_cartao_ok($c)) erro('Cartão não encontrado.', 404, 'NAO_ENCONTRADO');
        $k = fin_mes($d['chave'] ?? '', '');
        $itens = [];
        foreach (linhas("SELECT m.*, t.descricao AS tdesc, t.parcelas AS tparc, cat.nome AS categoria FROM fin_movimentos m
                           LEFT JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                           LEFT JOIN fin_categorias cat ON cat.tenant_id = m.tenant_id AND cat.id = COALESCE(t.categoria_id, m.categoria_id)
                          WHERE m.tenant_id = ? AND m.conta_id = ? AND m.excluido_em IS NULL AND m.data >= ? ORDER BY m.data, m.id", [$tid, (int) $c['id'], $c['saldo_inicial_em']]) as $m) {
            $km = $m['fatura'] ?: ((float) $m['valor'] < 0 ? fin_fatura_de($c, $m['data']) : null);
            if ($km !== $k) continue;
            $itens[] = ['id' => (int) $m['id'], 'data' => $m['data'], 'valor' => (float) $m['valor'], 'descricao' => $m['descricao'] ?: $m['tdesc'], 'categoria' => $m['categoria'],
                        'tituloId' => $m['titulo_id'] !== null ? (int) $m['titulo_id'] : null, 'pagamento' => $m['transferencia'] !== null && (float) $m['valor'] > 0];
        }
        return ['chave' => $k, 'vencimento' => fin_fatura_venc($c, $k), 'fechamento' => fin_fatura_fech($c, $k), 'itens' => $itens];
    },

    /* compra no cartão: {contaId, data, valor, descricao, fornecedorId?, categoriaId, centroId?, parcelas, documento?, obs?}
       vira conta a pagar já paga com o cartão; cada parcela entra numa fatura. Na DRE a despesa é da data da compra. */
    'cartao.compra' => function ($d) {
        $u = fin_u(); fin_tabelas(); fin_exigir_cartao();
        $tid = tenant();
        $c = linha("SELECT * FROM fin_contas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL AND tipo = 'cartao'", [(int) ($d['contaId'] ?? 0), $tid]);
        if (!$c) erro('Escolha o cartão.');
        if (!fin_cartao_ok($c)) erro('Informe no cadastro do cartão o melhor dia de compra e o dia de vencimento da fatura.');
        $data = fin_data($d['data'] ?? '', true, 'a data da compra');
        if ($data < $c['saldo_inicial_em']) erro('A data é anterior ao saldo inicial do cartão (' . fin_dbr($c['saldo_inicial_em']) . ').');
        $valor = fin_valor($d['valor'] ?? 0);
        $desc = txt($d['descricao'] ?? '', 200);
        if ($desc === '') erro('Informe a descrição da compra.');
        $cat = fin_id_da_empresa('fin_categorias', $d['categoriaId'] ?? 0, $tid, 'Categoria');
        if (!$cat) erro('Escolha a categoria (ela decide a linha da DRE).');
        if (valor("SELECT tipo FROM fin_categorias WHERE id = ? AND tenant_id = ?", [$cat, $tid]) !== 'despesa') erro('Escolha uma categoria de despesa.');
        $forn = fin_id_da_empresa('fornecedores', $d['fornecedorId'] ?? 0, $tid, 'Fornecedor');
        $centro = fin_id_da_empresa('fin_centros', $d['centroId'] ?? 0, $tid, 'Centro de custo');
        $n = max(1, min(48, (int) ($d['parcelas'] ?? 1)));
        $base = floor($valor / $n * 100) / 100; $resto = round($valor - $base * $n, 2);
        $k1 = fin_fatura_de($c, $data);
        [$vt, $vi] = fin_vinculo_ler($d, $tid);   /* v1.25.3 */
        db()->beginTransaction();
        q("INSERT INTO fin_titulos (tenant_id, tipo, descricao, fornecedor_id, categoria_id, centro_id, conta_id, forma, valor, competencia, vencimento, status, parcela, parcelas, origem_tipo, documento, obs, criado_por)
           VALUES (?, 'pagar', ?, ?, ?, ?, ?, 'Cartão de crédito', ?, ?, ?, 'aberto', 1, 1, 'cartao', ?, ?, ?)",
          [$tid, mb_substr($desc . ($n > 1 ? ' (' . $n . 'x no cartão)' : ''), 0, 255), $forn, $cat, $centro, (int) $c['id'], $valor, $data, $data,
           txt_ou_null($d['documento'] ?? '', 60), txt_ou_null($d['obs'] ?? '', 2000), (int) $u['id']]);
        $tit = (int) db()->lastInsertId();
        if ($vt && fin_tem_vinculo()) q("UPDATE fin_titulos SET vinculo_tipo = ?, vinculo_id = ? WHERE id = ? AND tenant_id = ?", [$vt, $vi, $tit, $tid]);
        for ($i = 0; $i < $n; $i++) {
            $v = $i === 0 ? round($base + $resto, 2) : $base;
            q("INSERT INTO fin_movimentos (tenant_id, conta_id, data, valor, tipo, titulo_id, categoria_id, centro_id, descricao, fatura, criado_por) VALUES (?, ?, ?, ?, 'baixa', ?, ?, ?, ?, ?, ?)",
              [$tid, (int) $c['id'], $data, -$v, $tit, $cat, $centro, mb_substr($desc . ($n > 1 ? ' ' . ($i + 1) . '/' . $n : ''), 0, 255), fin_fatura_de($c, $data, $i), (int) $u['id']]);
        }
        fin_recalcular($tid, $tit);
        fin_evento($tid, $tit, 'criacao', 'Compra no cartão ' . $c['nome'] . ': ' . fin_br($valor) . ($n > 1 ? ' em ' . $n . 'x' : '') . ' · 1ª parcela na fatura de ' . substr($k1, 5, 2) . '/' . substr($k1, 0, 4) . '.');
        db()->commit();
        auditar('fin_cartao_compra', 'fin_titulos', $tit, $c['nome'] . ' · ' . $desc . ' · ' . fin_br($valor) . ($n > 1 ? ' em ' . $n . 'x' : ''));
        return ['id' => $tit, 'fatura' => $k1, 'vencimento' => fin_fatura_venc($c, $k1)];
    },

    /* fluxo mensal por categoria: {de, ate (AAAA-MM), tipo: realizado|projetado}
       realizado = o que passou pelas contas (caixa da empresa); projetado = realizado até hoje + em aberto pelo vencimento + faturas de cartão */
    'fluxo.categorias' => function ($d) {
        fin_u(); fin_tabelas();
        $tid = tenant();
        fin_gerar_recorrencias($tid);
        $hoje = fin_hoje(); $mesHoje = substr($hoje, 0, 7);
        $de = fin_mes($d['de'] ?? '', date('Y') . '-01'); $ate = fin_mes($d['ate'] ?? '', date('Y') . '-12');
        if ($ate < $de) [$de, $ate] = [$ate, $de];
        $meses = fin_meses_entre($de, $ate); $ate = end($meses); $idx = array_flip($meses); $n = count($meses);
        $proj = ($d['tipo'] ?? '') === 'projetado';
        $cats = fin_cats_mapa($tid);
        $L = [];   /* chave => [rotulo, lado (ent|sai), valores[]] */
        $add = function ($chave, $rot, $lado, $mes, $v) use (&$L, $idx, $n) {
            if (!isset($idx[$mes]) || abs($v) < 0.005) return;
            if (!isset($L[$chave])) $L[$chave] = ['k' => $chave, 'rotulo' => $rot, 'lado' => $lado, 'valores' => array_fill(0, $n, 0.0)];
            $L[$chave]['valores'][$idx[$mes]] = round($L[$chave]['valores'][$idx[$mes]] + $v, 2);
        };
        $rotCat = function ($cat, $positivo) use ($cats) {
            if ($cat && isset($cats[(int) $cat])) return ['c' . (int) $cat, $cats[(int) $cat][0], $cats[(int) $cat][1] === 'receita' ? 'ent' : 'sai'];
            return $positivo ? ['c0', 'Entradas sem categoria', 'ent'] : ['c-1', 'Saídas sem categoria', 'sai'];
        };
        /* realizado */
        $fimReal = fin_mes_fim($ate);   /* tudo o que já foi lançado como realizado, mesmo com data futura */
        foreach (linhas("SELECT DATE_FORMAT(m.data, '%Y-%m') AS mes, COALESCE(t.categoria_id, m.categoria_id) AS cat, m.transferencia IS NOT NULL AS transf, m.valor > 0 AS pos, SUM(m.valor) AS v
                           FROM fin_movimentos m LEFT JOIN fin_titulos t ON t.tenant_id = m.tenant_id AND t.id = m.titulo_id
                          WHERE m.tenant_id = ? AND m.excluido_em IS NULL AND m.data BETWEEN ? AND ?" . fin_sql_caixa('m') . "
                          GROUP BY mes, cat, transf, pos", [$tid, $de . '-01', $fimReal]) as $r) {
            $v = (float) $r['v'];
            if ((int) $r['transf']) { $add('fat', 'Faturas de cartão', 'sai', $r['mes'], -$v); continue; }
            [$k, $rot, $lado] = $rotCat($r['cat'], $v > 0);
            $add($k, $rot, $lado, $r['mes'], $lado === 'ent' ? $v : -$v);
        }
        if ($proj) {
            foreach (linhas("SELECT DATE_FORMAT(GREATEST(t.vencimento, ?), '%Y-%m') AS mes, t.categoria_id AS cat, t.tipo, SUM(t.valor - t.pago) AS v
                               FROM fin_titulos t WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status IN ('aberto','parcial') AND t.vencimento IS NOT NULL
                                AND GREATEST(t.vencimento, ?) BETWEEN ? AND ?" . fin_sql_sem_cartao($tid) . " GROUP BY mes, cat, t.tipo",
                            [$hoje, $tid, $hoje, $de . '-01', fin_mes_fim($ate)]) as $r) {
                [$k, $rot, $lado] = $rotCat($r['cat'], $r['tipo'] === 'receber');
                if ($r['cat'] === null) $lado = $r['tipo'] === 'receber' ? 'ent' : 'sai';
                $v = (float) $r['v'];
                $add($k, $rot, $lado, $r['mes'], ($r['tipo'] === 'receber') === ($lado === 'ent') ? $v : -$v);
            }
            foreach (fin_prev_cartoes($tid, $hoje) as [$dt, $v]) $add('fat', 'Faturas de cartão', 'sai', substr($dt, 0, 7), $v);
        }
        /* saldo no começo do período: contas que não são cartão */
        $saldoIni = 0.0; $antes = date('Y-m-d', strtotime($de . '-01 -1 day'));
        foreach (linhas("SELECT * FROM fin_contas WHERE tenant_id = ? AND excluido_em IS NULL AND tipo <> 'cartao'", [$tid]) as $c) {
            if ($c['saldo_inicial_em'] > fin_mes_fim($ate)) continue;
            $saldoIni += $c['saldo_inicial_em'] > $antes ? (float) $c['saldo_inicial'] : fin_saldo_conta($tid, $c, $antes);
        }
        /* contas que começam no meio do período: o saldo inicial entra no mês em que começam (linha própria) */
        foreach (linhas("SELECT * FROM fin_contas WHERE tenant_id = ? AND excluido_em IS NULL AND tipo <> 'cartao' AND saldo_inicial_em > ? AND saldo_inicial_em <= ?", [$tid, $de . '-01', fin_mes_fim($ate)]) as $c) {
            $saldoIni -= (float) $c['saldo_inicial'];
            $add('ini', 'Saldo inicial de conta nova', 'ent', substr($c['saldo_inicial_em'], 0, 7), (float) $c['saldo_inicial']);
        }
        $ent = array_values(array_filter($L, function ($x) { return $x['lado'] === 'ent'; }));
        $sai = array_values(array_filter($L, function ($x) { return $x['lado'] === 'sai'; }));
        $ord = function ($a, $b) { return array_sum($b['valores']) <=> array_sum($a['valores']); };
        usort($ent, $ord); usort($sai, $ord);
        $te = array_fill(0, $n, 0.0); $ts = array_fill(0, $n, 0.0);
        foreach ($ent as $x) foreach ($x['valores'] as $i => $v) $te[$i] += $v;
        foreach ($sai as $x) foreach ($x['valores'] as $i => $v) $ts[$i] += $v;
        $ini = []; $fim = []; $s = $saldoIni;
        for ($i = 0; $i < $n; $i++) { $ini[] = round($s, 2); $s = round($s + $te[$i] - $ts[$i], 2); $fim[] = $s; }
        foreach ([&$ent, &$sai] as &$grp) foreach ($grp as &$x) $x['total'] = round(array_sum($x['valores']), 2);
        unset($grp, $x);
        return ['tipo' => $proj ? 'projetado' : 'realizado', 'meses' => $meses, 'mesAtual' => $mesHoje, 'entradas' => $ent, 'saidas' => $sai,
                'totalEntradas' => array_map(function ($v) { return round($v, 2); }, $te), 'totalSaidas' => array_map(function ($v) { return round($v, 2); }, $ts),
                'saldoInicial' => $ini, 'saldoFinal' => $fim];
    },

    /* provisão de impostos e avisos: {provisaoPct, provisaoBase: faturamento|recebimento, avisoDias} */
    'config.salvar' => function ($d) {
        exigir_perfil('admin', 'financeiro'); fin_tabelas();
        $tid = tenant();
        $pct = fin_num($d['provisaoPct'] ?? 0);
        if ($pct < 0 || $pct > 60) erro('A provisão de impostos precisa ficar entre 0% e 60%.');
        $c = ['provisaoPct' => $pct, 'provisaoBase' => ($d['provisaoBase'] ?? '') === 'recebimento' ? 'recebimento' : 'faturamento',
              'avisoDias' => max(0, min(30, (int) ($d['avisoDias'] ?? 3)))];
        $c = array_merge(fin_config($tid), $c);   /* v1.25.0: mantém o que não é desta tela (meses de imposto zerado) */
        fin_config_gravar($tid, $c);
        auditar('fin_config', 'config', null, 'provisão ' . $pct . '% sobre ' . $c['provisaoBase']);
        return $c;
    },
];
