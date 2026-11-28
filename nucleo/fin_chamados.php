<?php
/* =====================================================================
   KONSTANTE SaaS — nucleo/fin_chamados.php  (v1.23.0)
   Liga o chamado ao Financeiro sem duplicar dados.
   • Chamado GANHO (Aprovado, Em Andamento, Aguardando 2ª etapa, Falta pagamento, Concluído)
     → um título "a receber" por parcela das condições de pagamento do orçamento,
       SEM vencimento (as datas são digitadas depois, e podem mudar à vontade).
       Chave única: chamado:<id>:<n> — nunca cria duas vezes.
   • Valor do chamado mudou:
       - nada recebido ainda → as parcelas são recalculadas (vencimentos digitados ficam);
       - já houve recebimento → não mexe sozinho; avisa o administrador/financeiro.
   • Chamado volta para aberto, Não Aprovado ou excluído → parcelas SEM baixa são canceladas
     (nunca apagadas); com baixa, avisa.
   • chamados.recebido passa a refletir as baixas (o CRM continua lendo a mesma coluna).
   Nada aqui pode derrubar a ação do chamado: qualquer falha vai só para o log.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

const FCH_GANHO = ['Aprovado', 'Em Andamento', 'Aguardando 2ª etapa', 'Falta pagamento', 'Concluído'];

/* Financeiro instalado (SQL 16) e liberado para a empresa? */
function fch_ativo($tid) {
    static $cache = [];
    if (isset($cache[$tid])) return $cache[$tid];
    try { valor("SELECT 1 FROM fin_titulos LIMIT 0"); } catch (Throwable $e) { return $cache[$tid] = false; }
    if (function_exists('modulo_liberado') && !modulo_liberado('erp', $tid)) return $cache[$tid] = false;
    return $cache[$tid] = true;
}

function fch_br($n) { return 'R$ ' . number_format((float) $n, 2, ',', '.'); }

/* categoria das receitas de chamado: a padrão "Serviços avulsos", senão a 1ª receita bruta ativa */
function fch_categoria($tid) {
    $id = valor("SELECT id FROM fin_categorias WHERE tenant_id = ? AND excluido_em IS NULL AND ativa = 1 AND tipo = 'receita' AND nome LIKE 'Serviços avulsos%' ORDER BY id LIMIT 1", [$tid]);
    if (!$id) $id = valor("SELECT id FROM fin_categorias WHERE tenant_id = ? AND excluido_em IS NULL AND ativa = 1 AND tipo = 'receita' AND grupo_dre = 'receita_bruta' ORDER BY ordem, id LIMIT 1", [$tid]);
    return $id ? (int) $id : null;
}

/* parcelas desejadas: [{n, descricao, valor}] a partir das condições de pagamento (% do orçamento) */
function fch_parcelas($tid, $c) {
    $total = round((float) $c['valor'], 2);
    if ($total <= 0) return [];
    $pags = [];
    try {
        $o = linha("SELECT itens FROM orcamentos WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, (int) $c['id']]);
        $j = $o ? json_decode((string) $o['itens'], true) : null;
        foreach ((is_array($j['pagamentos'] ?? null) ? $j['pagamentos'] : []) as $p) {
            $pct = (float) str_replace(',', '.', (string) ($p['pct'] ?? 0));
            if ($pct > 0) $pags[] = ['descricao' => trim((string) ($p['descricao'] ?? '')), 'pct' => $pct];
        }
    } catch (Throwable $e) { /* sem orçamento: uma parcela só */ }
    $soma = array_sum(array_column($pags, 'pct'));
    if (!$pags || abs($soma - 100) > 0.01) $pags = [['descricao' => '', 'pct' => 100]];
    $out = []; $acum = 0.0; $n = count($pags);
    foreach ($pags as $i => $p) {
        $v = $i === $n - 1 ? round($total - $acum, 2) : round($total * $p['pct'] / 100, 2);
        $acum += $v;
        $out[] = ['n' => $i + 1, 'descricao' => $p['descricao'], 'valor' => $v, 'pct' => $p['pct']];
    }
    return $out;
}

function fch_desc($c, $p, $n) {
    return mb_substr('Chamado ' . $c['numero'] . ' · ' . ($c['cliente_nome'] ?? '') . ($n > 1 ? ' · ' . $p['n'] . '/' . $n : '') . ($p['descricao'] !== '' ? ' · ' . $p['descricao'] : ''), 0, 255);
}

function fch_evento($tid, $tituloId, $tipo, $texto) {
    $uid = null; try { $u = eu(false); $uid = $u ? (int) $u['id'] : null; } catch (Throwable $e) {}
    q("INSERT INTO fin_eventos (tenant_id, titulo_id, tipo, texto, usuario_id) VALUES (?, ?, ?, ?, ?)", [$tid, $tituloId, $tipo, mb_substr($texto, 0, 500), $uid]);
}

/* avisa administradores e financeiro (uma vez por texto) */
function fch_avisar($tid, $c, $titulo, $texto, $chave) {
    try {
        if (valor("SELECT 1 FROM fin_eventos WHERE tenant_id = ? AND tipo = 'aviso' AND texto = ? LIMIT 1", [$tid, $chave])) return;
        $primeiro = valor("SELECT id FROM fin_titulos WHERE tenant_id = ? AND origem_tipo = 'chamado' AND origem_id = ? ORDER BY id LIMIT 1", [$tid, (int) $c['id']]);
        if ($primeiro) fch_evento($tid, (int) $primeiro, 'aviso', $chave);
        if (!function_exists('notificar')) require_once __DIR__ . '/notificacoes.php';
        $ids = array_map('intval', array_column(linhas("SELECT DISTINCT u.id FROM usuarios u LEFT JOIN usuario_perfis p ON p.tenant_id = u.tenant_id AND p.usuario_id = u.id
              AND p.perfil IN ('admin','financeiro') AND (p.valido_ate IS NULL OR p.valido_ate >= CURDATE())
             WHERE u.tenant_id = ? AND u.status = 'ativo' AND u.excluido_em IS NULL AND (u.perfil IN ('admin','financeiro') OR p.id IS NOT NULL)", [$tid]), 'id'));
        if ($ids) notificar($tid, $ids, $titulo, $texto, 'chamado:' . (int) $c['id'], 'financeiro');
    } catch (Throwable $e) { error_log('[KSAAS fin] aviso: ' . $e->getMessage()); }
}

/* recebido do chamado = soma das baixas das parcelas + o que já tinha sido recebido antes da importação
   (guardado na chave do saldo importado: chamado:<id>:imp:<valor>) */
function fch_atualizar_recebido($tid, $chId) {
    try {
        $l = linhas("SELECT pago, chave_origem FROM fin_titulos WHERE tenant_id = ? AND origem_tipo = 'chamado' AND origem_id = ? AND excluido_em IS NULL", [$tid, $chId]);
        if (!$l) return;
        $rec = 0.0;
        foreach ($l as $t) {
            $rec += (float) $t['pago'];
            if (preg_match('/:imp:([\d.]+)$/', (string) $t['chave_origem'], $m)) $rec += (float) $m[1];
        }
        q("UPDATE chamados SET recebido = ? WHERE id = ? AND tenant_id = ?", [round($rec, 2), $chId, $tid]);
    } catch (Throwable $e) { error_log('[KSAAS fin] recebido: ' . $e->getMessage()); }
}

/* ponto único: chamar depois de qualquer mudança de status/valor do chamado.
   $statusAntes: status antes da mudança (null = chamado novo). As parcelas só NASCEM quando o chamado
   ENTRA em ganho; chamado que já era ganho antes do Financeiro entra pela importação (Ajustes). */
function fin_sincronizar_chamado($chId, $tid, $statusAntes = '') {
    try {
        if (!fch_ativo($tid)) return;
        $c = linha("SELECT ch.*, cl.nome AS cliente_nome FROM chamados ch LEFT JOIN clientes cl ON cl.tenant_id = ch.tenant_id AND cl.id = ch.cliente_id
                     WHERE ch.id = ? AND ch.tenant_id = ?", [(int) $chId, $tid]);
        if (!$c) return;
        $tit = linhas("SELECT * FROM fin_titulos WHERE tenant_id = ? AND origem_tipo = 'chamado' AND origem_id = ? AND excluido_em IS NULL ORDER BY parcela, id", [$tid, (int) $c['id']]);
        $ganho = $c['excluido_em'] === null && in_array($c['status'], FCH_GANHO, true);

        /* não está (mais) ganho: cancela o que não tem baixa */
        if (!$ganho) {
            $comBaixa = 0;
            foreach ($tit as $t) {
                if ($t['status'] === 'cancelado') continue;
                if ((float) $t['pago'] > 0) { $comBaixa++; continue; }
                q("UPDATE fin_titulos SET status = 'cancelado' WHERE id = ? AND tenant_id = ?", [$t['id'], $tid]);
                fch_evento($tid, (int) $t['id'], 'cancelamento', 'Cancelado automaticamente: chamado ' . $c['numero'] . ($c['excluido_em'] ? ' excluído.' : ' foi para "' . $c['status'] . '".'));
            }
            if ($comBaixa) fch_avisar($tid, $c, 'Chamado ' . $c['numero'] . ' com recebimento', 'O chamado saiu de "ganho" mas já tem valor recebido no Financeiro. Confira.',
                                       'Chamado ' . $c['numero'] . ' saiu de ganho (' . $c['status'] . ') com recebimento registrado.');
            return;
        }

        $quero = fch_parcelas($tid, $c);
        if (!$quero) return;
        $entrouAgora = $statusAntes === null || ($statusAntes !== '' && !in_array($statusAntes, FCH_GANHO, true));
        if (!$tit && !$entrouAgora) return;   /* ganho antigo sem parcelas: só pela importação */
        /* saldo importado (v1.23.0) ou lançamentos ajustados à mão: não recalcula sozinho */
        $importado = array_filter($tit, function ($t) { return strpos((string) $t['chave_origem'], ':imp') !== false; });
        if ($importado) { fch_atualizar_recebido($tid, (int) $c['id']); return; }

        $porN = []; foreach ($tit as $t) if (preg_match('/^chamado:\d+:(\d+)$/', (string) $t['chave_origem'], $m)) $porN[(int) $m[1]] = $t;
        $pagoAlgum = array_sum(array_map(function ($t) { return (float) $t['pago']; }, $tit)) > 0;
        $totalAtual = round(array_sum(array_map(function ($t) { return $t['status'] === 'cancelado' ? 0 : (float) $t['valor']; }, $tit)), 2);
        $totalNovo = round(array_sum(array_column($quero, 'valor')), 2);

        if ($pagoAlgum) {
            if (abs($totalAtual - $totalNovo) > 0.009)
                fch_avisar($tid, $c, 'Valor do chamado ' . $c['numero'] . ' mudou', 'Agora ' . fch_br($totalNovo) . '; no Financeiro estão ' . fch_br($totalAtual) . ' e já há recebimento. Ajuste as parcelas.',
                           'Valor do chamado ' . $c['numero'] . ' mudou para ' . fch_br($totalNovo) . ' (Financeiro: ' . fch_br($totalAtual) . ').');
            fch_atualizar_recebido($tid, (int) $c['id']);
            return;
        }

        $cat = fch_categoria($tid);
        $comp = !empty($c['ganho_em']) ? substr($c['ganho_em'], 0, 10) : date('Y-m-d');
        $n = count($quero);
        $tinha = (bool) $tit;
        foreach ($quero as $p) {
            $desc = fch_desc($c, $p, $n);
            if (isset($porN[$p['n']])) {
                $t = $porN[$p['n']];
                $mud = [];
                if (abs((float) $t['valor'] - $p['valor']) > 0.004) $mud[] = 'valor ' . fch_br($t['valor']) . ' → ' . fch_br($p['valor']);
                if ($t['status'] === 'cancelado') $mud[] = 'reaberto (chamado ganho de novo)';
                if ($mud || $t['descricao'] !== $desc || (int) $t['parcelas'] !== $n) {
                    q("UPDATE fin_titulos SET valor = ?, descricao = ?, parcelas = ?, cliente_id = ?, status = 'aberto' WHERE id = ? AND tenant_id = ?",
                      [$p['valor'], $desc, $n, $c['cliente_id'], $t['id'], $tid]);
                    if ($mud) fch_evento($tid, (int) $t['id'], 'edicao', 'Atualizado pelo chamado ' . $c['numero'] . ': ' . implode('; ', $mud) . '.');
                }
            } else {
                q("INSERT INTO fin_titulos (tenant_id, tipo, descricao, cliente_id, categoria_id, valor, competencia, vencimento, status, parcela, parcelas, origem_tipo, origem_id, chave_origem, criado_por)
                   VALUES (?, 'receber', ?, ?, ?, ?, ?, NULL, 'aberto', ?, ?, 'chamado', ?, ?, NULL)",
                  [$tid, $desc, $c['cliente_id'], $cat, $p['valor'], $comp, $p['n'], $n, (int) $c['id'], 'chamado:' . (int) $c['id'] . ':' . $p['n']]);
                $nid = (int) db()->lastInsertId();
                fch_evento($tid, $nid, 'criacao', 'Criado pela aprovação do chamado ' . $c['numero'] . ': ' . fch_br($p['valor']) . ($n > 1 ? ' (' . rtrim(rtrim(number_format($p['pct'], 2, ',', ''), '0'), ',') . '%)' : '') . '. Defina o vencimento.');
            }
        }
        /* parcelas que sobraram (orçamento passou a ter menos parcelas) */
        foreach ($porN as $k => $t) if ($k > $n && $t['status'] !== 'cancelado') {
            q("UPDATE fin_titulos SET status = 'cancelado' WHERE id = ? AND tenant_id = ?", [$t['id'], $tid]);
            fch_evento($tid, (int) $t['id'], 'cancelamento', 'Cancelado: o chamado ' . $c['numero'] . ' passou a ter ' . $n . ' parcela(s).');
        }
        if (!$tinha) auditar('fin_chamado_titulos', 'chamados', (int) $c['id'], $c['numero'] . ' · ' . $n . ' parcela(s) · ' . fch_br($totalNovo), $tid);
        fch_atualizar_recebido($tid, (int) $c['id']);
    } catch (Throwable $e) {
        error_log('[KSAAS fin] sincronizar chamado ' . $chId . ': ' . $e->getMessage());
    }
}
