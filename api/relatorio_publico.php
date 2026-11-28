<?php
/* KONSTANTE SaaS — api/relatorio_publico.php  ·  relatório da OS por link (v1.19.0)
   Usado só pela porta /saas/r/api.php (sem login). O relatório é achado pelo código
   aleatório do link (os_links.token, 32 hex), nunca por id. Fotos: r/foto.php.
   ver {t} → empresa, OS e o HTML do relatório como foi enviado. */
if (!defined('KSAAS') || !defined('KPUB')) { http_response_code(403); exit; }
require_once dirname(__DIR__) . '/nucleo/notificacoes.php';
const RP_MAX_ERROS_IP = 30;

function rp_link($d) {
    $chaveIp = 'rel:' . ip();
    if (login_bloqueado_seg($chaveIp) > 0) erro('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429, 'BLOQUEADO');
    $tok = strtolower((string) ($d['t'] ?? ''));
    if (!preg_match('/^[a-f0-9]{32}$/', $tok)) { login_falhou($chaveIp, RP_MAX_ERROS_IP); erro('Link inválido. Confira se o endereço veio inteiro.', 404, 'LINK'); }
    try { $l = linha("SELECT * FROM os_links WHERE token = ?", [$tok]); }
    catch (Throwable $e) { erro('Página indisponível no momento.', 503, 'INDISPONIVEL'); }
    if (!$l) { login_falhou($chaveIp, RP_MAX_ERROS_IP); erro('Relatório não encontrado. O link pode estar incompleto.', 404, 'LINK'); }
    $t = linha("SELECT * FROM tenants WHERE id = ?", [(int) $l['tenant_id']]);
    if (!$t || (int) $t['ativo'] !== 1) erro('Página indisponível no momento.', 403, 'DESATIVADO');
    $o = linha("SELECT o.*, cl.nome AS cliente_nome FROM ordens_servico o LEFT JOIN clientes cl ON cl.tenant_id = o.tenant_id AND cl.id = o.cliente_id
                 WHERE o.id = ? AND o.tenant_id = ?", [(int) $l['os_id'], (int) $l['tenant_id']]);
    if (!$o || $o['excluido_em'] !== null) erro('Este relatório não está mais disponível.', 404, 'LINK');
    return [$l, $t, $o];
}

return [
    'ver' => function ($d) {
        [$l, $t, $o] = rp_link($d);
        $tid = (int) $l['tenant_id'];
        $equipe = false;
        if (!empty($_COOKIE['KSAAS'])) { try { $u = eu(false); $equipe = $u && (int) $u['tenant_id'] === $tid && $u['perfil'] !== 'cliente'; } catch (Throwable $e) {} }
        if (!$equipe && $l['revogado_em'] === null) {
            q("UPDATE os_links SET visualizacoes = visualizacoes + 1, primeira_vis = COALESCE(primeira_vis, NOW()), ultima_vis = NOW() WHERE id = ?", [$l['id']]);
            if ($l['primeira_vis'] === null) {
                $quem = array_values(array_filter([(int) $l['criado_por']]));
                notificar($tid, $quem ?: usuarios_escritorio($tid, true), 'Relatório da OS ' . $o['numero'] . ' aberto pelo cliente',
                          ($o['cliente_nome'] ?: 'Cliente') . ' abriu o link do relatório agora.', 'os:' . (int) $o['id'], 'relatorio_visto');
            }
        }
        $emp = json_decode((string) valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'empresa'", [$tid]), true) ?: [];
        $cor = is_string($t['cor_primaria']) && preg_match('/^#[0-9a-fA-F]{6}$/', $t['cor_primaria']) ? $t['cor_primaria'] : '#111111';
        $html = null;
        if ($l['revogado_em'] === null) {
            $tok = $l['token'];
            $html = preg_replace_callback('/__ANEXO_(\d+)__/', function ($m) use ($tok) { return 'foto.php?t=' . $tok . '&amp;a=' . (int) $m[1]; }, (string) $l['html']);
        }
        return [
            'empresa' => ['nome' => ($emp['nome'] ?? '') !== '' ? $emp['nome'] : $t['nome'], 'telefone' => $emp['telefone'] ?? null, 'cor' => $cor],
            'os' => ['numero' => $o['numero'], 'cliente' => $o['cliente_nome'], 'status' => $o['status']],
            'atualizado' => $l['revogado_em'] !== null,
            'html' => $html,
        ];
    },
];
