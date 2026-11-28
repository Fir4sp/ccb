<?php
/* KONSTANTE SaaS — api/plat_auth.php  ·  login do CONSOLE DA PLATAFORMA */
if (!defined('KSAAS') || !defined('KPLAT')) { http_response_code(403); exit; }

function resposta_admin($a) {
    return [
        'usuario'     => ['id' => (int) $a['id'], 'nome' => $a['nome'], 'email' => $a['email'], 'perfil' => 'plataforma',
                          'ultimoAcesso' => $a['ultimo_acesso']],
        'trocarSenha' => (int) $a['trocar_senha'] === 1,
    ];
}

return [

    'login' => function ($d) {
        $email = mb_strtolower(txt($d['email'] ?? '', 190));
        $senha = (string) ($d['senha'] ?? '');
        if ($email === '' || $senha === '') erro('Informe e-mail e senha.');

        /* chaves de bloqueio próprias do console */
        $kEmail = 'plat:' . $email;
        $kIp    = 'platip:' . ip();
        $espera = max(login_bloqueado_seg($kEmail), login_bloqueado_seg($kIp));
        if ($espera > 0) erro('Muitas tentativas. Tente de novo em ' . ceil($espera / 60) . ' min.', 429, 'BLOQUEADO');

        $a = linha("SELECT * FROM plataforma_admins WHERE email = ?", [$email]);
        $hash = $a['senha_hash'] ?? '$2y$10$Mfv/nKA9MhcTz5RpNfiaEuSnCg2YGnzw9mhiurCV8sDqpKa7NoLcu';
        $confere = password_verify($senha, $hash);
        if (!$a || !$confere) {
            login_falhou($kEmail); login_falhou($kIp, 10);
            erro('E-mail ou senha incorretos.', 401, 'CREDENCIAIS');
        }
        if ($a['status'] !== 'ativo') erro('Acesso desativado.', 403, 'INATIVO');
        login_limpar($kEmail);

        iniciar_sessao();
        session_regenerate_id(true);
        $_SESSION['pid'] = (int) $a['id'];     // sessão do console: sem "manter conectado"
        q("UPDATE plataforma_admins SET ultimo_acesso = NOW() WHERE id = ?", [$a['id']]);
        auditar('login', 'plataforma_admins', $a['id']);
        return resposta_admin($a);
    },

    'logout' => function ($d) {
        iniciar_sessao();
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => cookie_path()]);
        return true;
    },

    'eu' => function ($d) {
        return resposta_admin(admin_plataforma());
    },

    'trocar_senha' => function ($d) {
        $a = admin_plataforma();
        $atual = (string) ($d['atual'] ?? '');
        $nova  = (string) ($d['nova'] ?? '');
        if (!password_verify($atual, $a['senha_hash'])) erro('A senha atual não confere.', 400, 'SENHA_ATUAL');
        if (!senha_valida($nova) || mb_strlen($nova) < 10) erro('A senha do console precisa ter pelo menos 10 caracteres, com letras e números.');
        if ($nova === $atual) erro('A nova senha precisa ser diferente da atual.');
        q("UPDATE plataforma_admins SET senha_hash = ?, trocar_senha = 0 WHERE id = ?", [password_hash($nova, PASSWORD_DEFAULT), $a['id']]);
        auditar('trocar_senha', 'plataforma_admins', $a['id']);
        return true;
    },
];
