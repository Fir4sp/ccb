<?php
/* KONSTANTE SaaS — api/notificacoes.php  (v1.19.0 · v1.21.0: lista só não lidas)
   Sino do app e notificações no celular (push).
   contar · listar · ler · ler_todas · push_chave · push_inscrever · push_remover · push_testar
   Cada pessoa só enxerga e marca as próprias notificações. */
if (!defined('KSAAS')) { http_response_code(403); exit; }
require_once dirname(__DIR__) . '/nucleo/notificacoes.php';

function nt_publica($n) {
    return ['id' => (int) $n['id'], 'titulo' => $n['titulo'], 'texto' => $n['texto'], 'link' => $n['link'], 'tipo' => $n['tipo'],
            'lida' => $n['lida_em'] !== null, 'criadoEm' => $n['criado_em']];
}
function nt_nao_lidas($u) {
    return (int) valor("SELECT COUNT(*) FROM notificacoes WHERE tenant_id = ? AND usuario_id = ? AND lida_em IS NULL", [(int) $u['tenant_id'], (int) $u['id']]);
}

return [

    'contar' => function ($d) {
        $u = eu();
        return ['naoLidas' => nt_nao_lidas($u)];
    },

    /* v1.21.0: a lista mostra só as NÃO lidas (lida sai da lista); {lidas:1} mostra as lidas dos últimos 30 dias */
    'listar' => function ($d) {
        $u = eu();
        $rows = !empty($d['lidas'])
            ? linhas("SELECT * FROM notificacoes WHERE tenant_id = ? AND usuario_id = ? AND lida_em IS NOT NULL AND criado_em >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                       ORDER BY criado_em DESC, id DESC LIMIT 40", [(int) $u['tenant_id'], (int) $u['id']])
            : linhas("SELECT * FROM notificacoes WHERE tenant_id = ? AND usuario_id = ? AND lida_em IS NULL ORDER BY criado_em DESC, id DESC LIMIT 60",
                     [(int) $u['tenant_id'], (int) $u['id']]);
        $temPush = false;
        try { $temPush = (bool) valor("SELECT 1 FROM push_inscricoes WHERE tenant_id = ? AND usuario_id = ? LIMIT 1", [(int) $u['tenant_id'], (int) $u['id']]); } catch (Throwable $e) {}
        return ['itens' => array_map('nt_publica', $rows), 'naoLidas' => nt_nao_lidas($u), 'pushNoServidor' => $temPush];
    },

    'ler' => function ($d) {
        $u = eu();
        q("UPDATE notificacoes SET lida_em = NOW() WHERE id = ? AND tenant_id = ? AND usuario_id = ? AND lida_em IS NULL",
          [(int) ($d['id'] ?? 0), (int) $u['tenant_id'], (int) $u['id']]);
        return ['naoLidas' => nt_nao_lidas($u)];
    },

    'ler_todas' => function ($d) {
        $u = eu();
        q("UPDATE notificacoes SET lida_em = NOW() WHERE tenant_id = ? AND usuario_id = ? AND lida_em IS NULL", [(int) $u['tenant_id'], (int) $u['id']]);
        return ['naoLidas' => 0];
    },

    /* chave pública VAPID para o aparelho se inscrever */
    'push_chave' => function ($d) {
        eu();
        if (!push_suportado()) erro('O servidor ainda não aceita notificações no celular (precisa de PHP 7.3 ou mais novo com OpenSSL e cURL).', 501, 'PUSH_SERVIDOR');
        $v = push_chaves(true);
        if (!$v) erro('Não foi possível preparar as notificações. Confira se o SQL 13 foi rodado.', 500, 'PUSH_CHAVES');
        return ['chave' => $v['publica']];
    },

    /* {endpoint, keys:{p256dh, auth}, aparelho} — a mesma inscrição passa a ser desta pessoa */
    'push_inscrever' => function ($d) {
        $u = eu();
        $ep = (string) ($d['endpoint'] ?? '');
        $k = is_array($d['keys'] ?? null) ? $d['keys'] : [];
        $p = (string) ($k['p256dh'] ?? ''); $a = (string) ($k['auth'] ?? '');
        if (!preg_match('#^https://[^\s]{10,1000}$#', $ep) || !preg_match('/^[A-Za-z0-9_-]{80,120}$/', $p) || !preg_match('/^[A-Za-z0-9_-]{16,40}$/', $a))
            erro('Inscrição inválida. Tente ativar de novo.');
        $hash = hash('sha256', $ep);
        q("DELETE FROM push_inscricoes WHERE endpoint_hash = ?", [$hash]);
        q("INSERT INTO push_inscricoes (tenant_id, usuario_id, endpoint, endpoint_hash, p256dh, auth, aparelho) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [(int) $u['tenant_id'], (int) $u['id'], $ep, $hash, $p, $a, txt_ou_null($d['aparelho'] ?? '', 120)]);
        auditar('push_ativar', 'push_inscricoes', null, txt($d['aparelho'] ?? '', 120));
        return true;
    },

    'push_remover' => function ($d) {
        $u = eu();
        $ep = (string) ($d['endpoint'] ?? '');
        if ($ep !== '') q("DELETE FROM push_inscricoes WHERE endpoint_hash = ? AND tenant_id = ? AND usuario_id = ?", [hash('sha256', $ep), (int) $u['tenant_id'], (int) $u['id']]);
        return true;
    },

    /* manda uma notificação de teste para a própria pessoa */
    'push_testar' => function ($d) {
        $u = eu();
        notificar((int) $u['tenant_id'], [(int) $u['id']], 'Notificações ligadas', 'É assim que os avisos do sistema vão chegar neste aparelho.', null, 'teste');
        return true;
    },
];
