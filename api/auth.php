<?php
/* KONSTANTE SaaS — api/auth.php  ·  login, logout, eu, trocar_senha, foto (v1.35.0) */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once dirname(__DIR__) . '/nucleo/termos.php';
require_once dirname(__DIR__) . '/nucleo/anexos.php';   /* v1.35.1: foto do usuário (salvar_anexo) */   /* v1.14.0: aceite dos Termos de Uso e da Política de Privacidade */

function resposta_eu($u) {
    if (!isset($u['perfis'])) $u['perfis'] = perfis_carregar($u);   /* v1.22.0 */
    $t = linha("SELECT * FROM tenants WHERE id = ?", [$u['tenant_id']]);
    return [
        'usuario'     => usuario_publico($u),
        'trocarSenha' => (int) $u['trocar_senha'] === 1,
        'termosPendentes' => termos_pendentes($u),
        'termosVersao' => TERMOS_VERSAO,
        'empresa'     => tenant_publico($t),
        'modulos'     => modulos_liberados((int) $u['tenant_id']),   /* v1.19.0: null = todos (SQL 13 não rodado) */
        'assinatura'  => function_exists('assinatura_resumo_sessao') ? assinatura_resumo_sessao((int) $u['tenant_id'], tem_perfil($u, 'admin')) : null,   /* v1.30.0 */
    ];
}

return [

    'login' => function ($d) {
        $email = mb_strtolower(txt($d['email'] ?? '', 190));
        $senha = (string) ($d['senha'] ?? '');
        if ($email === '' || $senha === '') erro('Informe e-mail e senha.');

        $kEmail = 'login:' . $email;
        $kIp    = 'ip:' . ip();
        $espera = max(login_bloqueado_seg($kEmail), login_bloqueado_seg($kIp));
        if ($espera > 0) erro('Muitas tentativas. Tente de novo em ' . ceil($espera / 60) . ' min.', 429, 'BLOQUEADO');

        $u = linha("SELECT u.*, t.ativo AS tenant_ativo
                      FROM usuarios u JOIN tenants t ON t.id = u.tenant_id
                     WHERE u.email = ? AND u.excluido_em IS NULL", [$email]);

        /* mesmo tempo de resposta com ou sem usuário (não revela e-mails cadastrados) */
        $hash = $u['senha_hash'] ?? '$2y$10$s4hGfHHYO0C6w25t2X3rAuyvKQazXG2A9lUBvcC1vve1n4tGKQe4m';
        $confere = password_verify($senha, $hash);

        if (!$u || !$confere) {
            login_falhou($kEmail); login_falhou($kIp, LOGIN_MAX_FALHAS_IP);
            erro('E-mail ou senha incorretos.', 401, 'CREDENCIAIS');
        }
        if ($u['status'] !== 'ativo')        erro('Usuário inativo. Fale com o administrador da sua empresa.', 403, 'INATIVO');
        if ((int) $u['tenant_ativo'] !== 1)  erro('Empresa inativa. Fale com o suporte.', 403, 'EMPRESA_INATIVA');

        login_limpar($kEmail);

        if (password_needs_rehash($u['senha_hash'], PASSWORD_DEFAULT)) {
            q("UPDATE usuarios SET senha_hash = ? WHERE id = ?", [password_hash($senha, PASSWORD_DEFAULT), $u['id']]);
        }

        iniciar_sessao();
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $u['id'];
        $_SESSION['tid'] = (int) $u['tenant_id'];
        if (!empty($d['lembrar'])) {
            /* mantém conectado por 30 dias */
            setcookie(session_name(), session_id(), [
                'expires'  => time() + 60 * 60 * 24 * 30,
                'path'     => cookie_path(),
                'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
                'httponly' => true,
                'samesite' => 'Strict',
            ]);
        }
        q("UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?", [$u['id']]);
        auditar('login', 'usuarios', $u['id'], null, $u['tenant_id'], $u['id']);
        return resposta_eu($u);
    },

    'logout' => function ($d) {
        iniciar_sessao();
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => cookie_path()]);
        return true;
    },

    'eu' => function ($d) {
        return resposta_eu(eu());
    },

    /* v1.14.0: {aceito: true} — registra versão, data e IP */
    'aceitar_termos' => function ($d) {
        $u = eu();
        if (empty($d['aceito'])) erro('Marque que leu e concorda para continuar.');
        try { termos_registrar($u); } catch (Throwable $e) { erro('Não foi possível registrar o aceite. Tente de novo.', 500); }
        auditar('termos_aceite', 'usuarios', (int) $u['id'], 'versão ' . TERMOS_VERSAO);
        return resposta_eu($u);
    },

    /* v1.35.0: foto do usuário (a própria) — arquivo em "arquivo"; guarda em usuarios.foto_anexo_id */
    'foto' => function ($d) {
        $u = eu();
        if (!array_key_exists('foto_anexo_id', $u)) erro('O banco ainda não está pronto para a foto. Rode o SQL 36 (36_foto_usuario.sql) no phpMyAdmin.', 409, 'SQL36');
        try {
            $aid = salvar_anexo($_FILES['arquivo'] ?? null, 'usuario', (int) $u['id'], 'foto', true);
        } catch (ErroApi $x) { throw $x; } catch (Throwable $x) {
            erro('O banco ainda não aceita a foto da pessoa. Rode o SQL 36 (36_foto_usuario.sql) no phpMyAdmin.', 409, 'SQL36');
        }
        $antiga = $u['foto_anexo_id'] ?? null;
        q("UPDATE usuarios SET foto_anexo_id = ? WHERE id = ? AND tenant_id = ?", [$aid, $u['id'], $u['tenant_id']]);
        if ($antiga) q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ? AND dono_tipo = 'usuario'", [(int) $antiga, $u['tenant_id']]);
        auditar('usuario_foto', 'usuarios', (int) $u['id']);
        return ['fotoId' => $aid];
    },

    'foto_remover' => function ($d) {
        $u = eu();
        $antiga = $u['foto_anexo_id'] ?? null;
        q("UPDATE usuarios SET foto_anexo_id = NULL WHERE id = ? AND tenant_id = ?", [$u['id'], $u['tenant_id']]);
        if ($antiga) q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ? AND dono_tipo = 'usuario'", [(int) $antiga, $u['tenant_id']]);
        return ['fotoId' => null];
    },

    'trocar_senha' => function ($d) {
        $u = eu();
        $atual = (string) ($d['atual'] ?? '');
        $nova  = (string) ($d['nova'] ?? '');
        if (!password_verify($atual, $u['senha_hash'])) erro('A senha atual não confere.', 400, 'SENHA_ATUAL');
        if (!senha_valida($nova)) erro('A nova senha precisa ter pelo menos 8 caracteres, com letras e números.');
        if ($nova === $atual) erro('A nova senha precisa ser diferente da atual.');
        q("UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ? AND tenant_id = ?",
          [password_hash($nova, PASSWORD_DEFAULT), $u['id'], $u['tenant_id']]);
        auditar('trocar_senha', 'usuarios', $u['id']);
        return true;
    },
];
