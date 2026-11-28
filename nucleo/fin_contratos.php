<?php
/* =====================================================================
   KONSTANTE SaaS — nucleo/fin_contratos.php  (v1.25.0)
   Cobrança mensal dos contratos no Financeiro.
   • Configuração por contrato em contrato_faturamento (dia, valor, categoria,
     conta, forma, mês de início). Valor vazio = valor mensal do contrato.
   • Enquanto o contrato está ATIVO, ficam lançados o mês atual + os 2 próximos
     (a receber). Chave única contrato:<id>:<AAAA-MM> — nunca duplica.
   • Mudou valor / dia / categoria (contrato ou cobrança salvos) → atualiza só as mensalidades
     do mês atual em diante SEM baixa.
   • Contrato suspenso, encerrado, excluído ou cobrança desligada → as mensalidades
     futuras sem baixa são canceladas (as já pagas ou vencidas ficam como estão).
   • Fim da vigência: não lança meses depois do fim.
   A tabela também vai servir para a nota fiscal automática (v1.26).
   Nada aqui pode derrubar a ação do contrato: qualquer falha vai só para o log.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once __DIR__ . '/fin_chamados.php';

const FCT_MESES_FRENTE = 2;      /* além do mês atual */
const FCT_MAX_RETRO = 24;        /* no máximo 24 meses para trás ao começar a cobrança */

function fct_tem($tid) {
    static $ok = null;
    if (!fch_ativo($tid)) return false;
    if ($ok === null) { try { valor("SELECT 1 FROM contrato_faturamento LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
    return $ok;
}

function fct_mes($data) { return substr((string) $data, 0, 7); }
function fct_mes_mais($mes, $n) { return date('Y-m', mktime(0, 0, 0, (int) substr($mes, 5, 2) + $n, 1, (int) substr($mes, 0, 4))); }
function fct_venc($mes, $dia) {
    $ult = (int) date('t', strtotime($mes . '-01'));
    return $mes . '-' . str_pad((string) min(max(1, (int) $dia), $ult), 2, '0', STR_PAD_LEFT);
}

/* categoria padrão: "Contratos de manutenção", senão a de chamados */
function fct_categoria($tid) {
    $id = valor("SELECT id FROM fin_categorias WHERE tenant_id = ? AND excluido_em IS NULL AND ativa = 1 AND tipo = 'receita' AND nome LIKE 'Contratos%' ORDER BY id LIMIT 1", [$tid]);
    return $id ? (int) $id : fch_categoria($tid);
}

/* parâmetros efetivos (config + contrato) */
function fct_parametros($f, $tid) {
    $valor = $f['valor'] !== null ? (float) $f['valor'] : (float) ($f['valor_mensal'] ?? 0);
    $dia = (int) ($f['dia_vencimento'] ?: ($f['ct_dia'] ?: 10));
    $ini = fct_mes($f['inicio_cobranca'] ?: ($f['inicio'] ?: date('Y-m-d')));
    $min = fct_mes_mais(date('Y-m'), -FCT_MAX_RETRO);
    if ($ini < $min) $ini = $min;
    return ['valor' => round($valor, 2), 'dia' => $dia, 'ini' => $ini, 'fim' => $f['fim'] ? fct_mes($f['fim']) : null,
            'categoria' => $f['categoria_id'] !== null ? (int) $f['categoria_id'] : fct_categoria($tid)];
}

function fct_desc($f, $mes) {
    $base = trim((string) ($f['descricao'] ?? '')) !== '' ? trim($f['descricao']) : 'Contrato ' . $f['numero'] . ($f['cliente_nome'] ? ' · ' . $f['cliente_nome'] : '');
    return mb_substr($base . ' · ' . substr($mes, 5, 2) . '/' . substr($mes, 0, 4), 0, 255);
}

/* sincroniza um contrato (ou todos da empresa). Devolve [criados, atualizados, cancelados].
   Atualizar mensalidades já lançadas só acontece quando o contrato ou a cobrança dele foi salvo
   ($contratoId informado) — assim um vencimento mudado à mão no Financeiro não volta sozinho. */
function fct_sincronizar($tid, $contratoId = 0) {
    $atualizar = (bool) $contratoId;
    $res = [0, 0, 0];
    try {
        if (!fct_tem($tid)) return $res;
        $w = "f.tenant_id = ?"; $p = [$tid];
        if ($contratoId) { $w .= " AND f.contrato_id = ?"; $p[] = (int) $contratoId; }
        $lista = linhas("SELECT f.*, ct.numero, ct.cliente_id, ct.status AS ct_status, ct.inicio, ct.fim, ct.valor_mensal, ct.dia_vencimento AS ct_dia, ct.excluido_em AS ct_exc, cl.nome AS cliente_nome
                           FROM contrato_faturamento f
                           JOIN contratos ct ON ct.tenant_id = f.tenant_id AND ct.id = f.contrato_id
                           LEFT JOIN clientes cl ON cl.tenant_id = ct.tenant_id AND cl.id = ct.cliente_id
                          WHERE $w", $p);
        $hoje = date('Y-m-d'); $mesHoje = date('Y-m');
        $lim = fct_mes_mais($mesHoje, FCT_MESES_FRENTE);
        foreach ($lista as $f) {
            $cid = (int) $f['contrato_id'];
            $pr = fct_parametros($f, $tid);
            $ativo = (int) $f['ativo'] === 1 && $f['ct_status'] === 'Ativo' && !$f['ct_exc'] && $pr['valor'] > 0;
            $quero = [];
            if ($ativo) {
                $ate = $pr['fim'] && $pr['fim'] < $lim ? $pr['fim'] : $lim;
                for ($m = $pr['ini'], $i = 0; $m <= $ate && $i < 60; $m = fct_mes_mais($m, 1), $i++) $quero[$m] = true;
            }
            $tit = [];
            foreach (linhas("SELECT * FROM fin_titulos WHERE tenant_id = ? AND origem_tipo = 'contrato' AND origem_id = ? AND excluido_em IS NULL AND status <> 'cancelado'", [$tid, $cid]) as $t)
                if (preg_match('/^contrato:\d+:(\d{4}-\d{2})$/', (string) $t['chave_origem'], $mm)) $tit[$mm[1]] = $t;

            /* cancela o que não é mais desejado (só futuro e sem baixa) */
            foreach ($tit as $m => $t) {
                if (isset($quero[$m])) continue;
                if ((float) $t['pago'] > 0 || $m < $mesHoje) continue;
                q("UPDATE fin_titulos SET status = 'cancelado', chave_origem = NULL WHERE id = ? AND tenant_id = ?", [(int) $t['id'], $tid]);
                fch_evento($tid, (int) $t['id'], 'cancelamento', 'Cancelado automaticamente: contrato ' . $f['numero'] . ((int) $f['ativo'] !== 1 ? ' com cobrança desligada.' : ' "' . $f['ct_status'] . '"' . ($f['ct_exc'] ? ' (excluído)' : '') . ' ou fora da vigência.'));
                $res[2]++;
            }
            /* cria / atualiza */
            foreach (array_keys($quero) as $m) {
                $venc = fct_venc($m, $pr['dia']);
                $desc = fct_desc($f, $m);
                if (isset($tit[$m])) {
                    $t = $tit[$m];
                    if (!$atualizar || (float) $t['pago'] > 0 || $t['status'] !== 'aberto' || $m < $mesHoje) continue;
                    $mud = [];
                    if (abs((float) $t['valor'] - $pr['valor']) > 0.004) $mud[] = 'valor ' . fch_br($t['valor']) . ' → ' . fch_br($pr['valor']);
                    if ($t['vencimento'] !== $venc) $mud[] = 'vencimento ' . ($t['vencimento'] ? date('d/m/Y', strtotime($t['vencimento'])) : 'sem data') . ' → ' . date('d/m/Y', strtotime($venc));
                    if ((int) $t['categoria_id'] !== (int) $pr['categoria'] || (int) $t['conta_id'] !== (int) $f['conta_id'] || (string) $t['forma'] !== (string) $f['forma']
                        || (int) $t['centro_id'] !== (int) $f['centro_id'] || $t['descricao'] !== $desc) $mud[] = 'dados da cobrança';
                    if (!$mud) continue;
                    q("UPDATE fin_titulos SET valor = ?, vencimento = ?, categoria_id = ?, centro_id = ?, conta_id = ?, forma = ?, descricao = ?, cliente_id = ? WHERE id = ? AND tenant_id = ?",
                      [$pr['valor'], $venc, $pr['categoria'], $f['centro_id'], $f['conta_id'], $f['forma'], $desc, $f['cliente_id'], (int) $t['id'], $tid]);
                    fch_evento($tid, (int) $t['id'], 'edicao', 'Atualizado pelo contrato ' . $f['numero'] . ': ' . implode('; ', $mud) . '.');
                    $res[1]++;
                } else {
                    try {
                        q("INSERT INTO fin_titulos (tenant_id, tipo, descricao, cliente_id, categoria_id, centro_id, conta_id, forma, valor, competencia, vencimento, status, origem_tipo, origem_id, chave_origem, obs)
                           VALUES (?, 'receber', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberto', 'contrato', ?, ?, ?)",
                          [$tid, $desc, $f['cliente_id'], $pr['categoria'], $f['centro_id'], $f['conta_id'], $f['forma'], $pr['valor'], $m . '-01', $venc, $cid, 'contrato:' . $cid . ':' . $m, $f['obs']]);
                        $nid = (int) db()->lastInsertId();
                        fch_evento($tid, $nid, 'criacao', 'Mensalidade do contrato ' . $f['numero'] . ' (' . substr($m, 5, 2) . '/' . substr($m, 0, 4) . '): ' . fch_br($pr['valor']) . '.');
                        $res[0]++;
                    } catch (Throwable $e) { /* chave já existe: segue */ }
                }
            }
        }
    } catch (Throwable $e) {
        error_log('fct_sincronizar: ' . $e->getMessage());
    }
    return $res;
}
