<?php
/* =====================================================================
   KONSTANTE SaaS — api/mvp_publico.php  ·  pedido de acesso da landing (v1.17.0)
   Porta pública /saas/cadastro/api.php (sem login). Só grava o pedido;
   a liberação é feita no Console da plataforma.
   ===================================================================== */
if (!defined('KSAAS') || !defined('KPUB')) { http_response_code(403); exit; }
require_once dirname(__DIR__) . '/nucleo/email.php';
require_once dirname(__DIR__) . '/nucleo/notificacoes.php';   /* v1.19.0 */

const MVP_MAX_IP = 4;   // pedidos por IP a cada 15 min
const MVP_INFO_MARCA = '[Pedido de informações]';   /* v1.39.0: sem a coluna tipo, o pedido "Eu quero" vai marcado na mensagem */

/* v1.39.0: plat_cadastros.tipo = 'acesso' (teste grátis) ou 'info' (formulário "Eu quero") */
if (!function_exists('plat_tem_tipo')) {
    function plat_tem_tipo() {
        static $ok = null;
        if ($ok === null) { try { valor("SELECT tipo FROM plat_cadastros LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
        return $ok;
    }
}

return [
    /* {empresa, cnpj, responsavel, email, telefone, cidade, porte, mensagem, aceite, site (honeypot)} */
    'enviar' => function ($d) {
        $chave = 'mvp:' . ip();
        if (login_bloqueado_seg($chave) > 0) erro('Muitos envios seguidos. Aguarde alguns minutos e tente de novo.', 429, 'BLOQUEADO');
        if (trim((string) ($d['site'] ?? '')) !== '') return ['ok' => true];   /* robô preencheu o campo escondido */
        $empresa = txt($d['empresa'] ?? '', 150);
        $resp = txt($d['responsavel'] ?? '', 150);
        $email = mb_strtolower(txt($d['email'] ?? '', 190));
        $cnpj = preg_replace('/\D/', '', (string) ($d['cnpj'] ?? ''));
        $tel = txt($d['telefone'] ?? '', 30);
        if ($empresa === '') erro('Informe o nome da empresa.');
        if ($resp === '') erro('Informe o nome do responsável.');
        if (!email_valido($email)) erro('Informe um e-mail válido.');
        if ($cnpj !== '' && strlen($cnpj) !== 14) erro('O CNPJ precisa ter 14 números.');
        if (strlen(preg_replace('/\D/', '', $tel)) < 10) erro('Informe um telefone com DDD.');
        if (empty($d['aceite'])) erro('Para continuar, aceite os Termos de Uso e a Política de Privacidade.');
        if (valor("SELECT id FROM usuarios WHERE email = ? AND excluido_em IS NULL", [$email]))
            erro('Este e-mail já tem acesso ao sistema. Entre pela tela de login.');
        if (valor("SELECT id FROM plat_cadastros WHERE email = ? AND status = 'pendente'" . (plat_tem_tipo() ? " AND tipo = 'acesso'" : " AND (mensagem IS NULL OR mensagem NOT LIKE ?)"),
                  plat_tem_tipo() ? [$email] : [$email, MVP_INFO_MARCA . '%']))   /* v1.39.0: pedido "Eu quero" não bloqueia o de acesso */
            erro('Já recebemos um pedido com este e-mail. Assim que for liberado, você recebe a senha por e-mail.');
        $cnpjF = $cnpj === '' ? null : substr($cnpj, 0, 2) . '.' . substr($cnpj, 2, 3) . '.' . substr($cnpj, 5, 3) . '/' . substr($cnpj, 8, 4) . '-' . substr($cnpj, 12, 2);
        q("INSERT INTO plat_cadastros (empresa, cnpj, responsavel, email, telefone, cidade, porte, mensagem, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [$empresa, $cnpjF, $resp, $email, $tel, txt_ou_null($d['cidade'] ?? '', 120), txt_ou_null($d['porte'] ?? '', 40), txt_ou_null($d['mensagem'] ?? '', 2000), ip()]);
        /* v1.31.0: código de indicação ou cupom (link do indicador ou digitado) */
        $cod = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($d['codigo'] ?? ''));
        if ($cod !== '') { try { q("INSERT IGNORE INTO cadastro_codigos (cadastro_id, codigo) VALUES (?, ?)", [(int) db()->lastInsertId(), mb_strtoupper(mb_substr($cod, 0, 30))]); } catch (Throwable $x) {} }
        login_falhou($chave, MVP_MAX_IP);   /* conta o envio no limite por IP */
        $e = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
        enviar_email($email, 'Recebemos seu pedido de acesso', email_modelo('Pedido recebido, ' . explode(' ', $resp)[0] . '!',
            '<p>Recebemos o pedido de acesso da <b>' . $e($empresa) . '</b> ao SGClim, sistema de gestão para climatização.</p>' .
            '<p>Nossa equipe vai conferir os dados e liberar o acesso. Você vai receber outro e-mail com o link de entrada e a senha provisória.</p>'));
        enviar_email(mail_aviso(), 'Novo pedido de acesso: ' . $empresa, email_modelo('Novo pedido de acesso',
            '<p><b>' . $e($empresa) . '</b>' . ($cnpjF ? ' · CNPJ ' . $e($cnpjF) : '') . '<br>' . $e($resp) . ' · ' . $e($email) . ' · ' . $e($tel) . '</p>' .
            '<p>Aprove ou recuse no Console da plataforma, em <b>Pedidos de acesso</b>.</p>'));
        /* v1.19.0: avisa no sino/celular quem é administrador da plataforma (pela conta de mesmo e-mail numa empresa) */
        try {
            foreach (linhas("SELECT u.id, u.tenant_id FROM usuarios u JOIN plataforma_admins a ON a.email = u.email AND a.status = 'ativo'
                              WHERE u.status = 'ativo' AND u.excluido_em IS NULL") as $r)
                notificar((int) $r['tenant_id'], [(int) $r['id']], 'Novo pedido de acesso ao SGClim', $empresa . ' · ' . $resp . ' · ' . $tel, 'url:' . BASE_PATH . 'plataforma/', 'pedido_acesso');
        } catch (Throwable $x) {}
        return ['ok' => true];
    },

    /* v1.39.0: formulário "Eu quero" — quem ainda não quer testar, mas quer mais informações.
       {nome, email, whatsapp, tipoEmpresa?, funcionarios?, site (armadilha)}. Não cria empresa nem acesso:
       só registra o contato para o Console (Pedidos › Informações) e avisa no e-mail MAIL_AVISO. */
    'info' => function ($d) {
        $chave = 'mvpinfo:' . ip();
        if (login_bloqueado_seg($chave) > 0) erro('Muitos envios seguidos. Aguarde alguns minutos e tente de novo.', 429, 'BLOQUEADO');
        if (trim((string) ($d['site'] ?? '')) !== '') return ['ok' => true];   /* robô preencheu o campo escondido */
        $nome = txt($d['nome'] ?? '', 150);
        $email = mb_strtolower(txt($d['email'] ?? '', 190));
        $tel = txt($d['whatsapp'] ?? '', 30);
        $tipoEmp = txt($d['tipoEmpresa'] ?? '', 80);
        $func = txt($d['funcionarios'] ?? '', 40);
        if (mb_strlen($nome) < 2) erro('Informe o seu nome.');
        if (!email_valido($email)) erro('Informe um e-mail válido.');
        if (strlen(preg_replace('/\D/', '', $tel)) < 10) erro('Informe o WhatsApp com DDD.');
        login_falhou($chave, MVP_MAX_IP);   /* conta o envio no limite por IP (antes de gravar: repetir não passa do limite) */
        /* mesmo e-mail com pedido de informações ainda aberto: não duplica, só responde que recebeu */
        $jaTem = plat_tem_tipo()
            ? valor("SELECT id FROM plat_cadastros WHERE email = ? AND status = 'pendente' AND tipo = 'info'", [$email])
            : valor("SELECT id FROM plat_cadastros WHERE email = ? AND status = 'pendente' AND mensagem LIKE ?", [$email, MVP_INFO_MARCA . '%']);
        if ($jaTem) return ['ok' => true];
        $empresa = $tipoEmp !== '' ? $tipoEmp : 'Não informado';
        if (plat_tem_tipo())
            q("INSERT INTO plat_cadastros (empresa, responsavel, email, telefone, porte, ip, tipo) VALUES (?, ?, ?, ?, ?, ?, 'info')",
              [$empresa, $nome, $email, $tel, $func !== '' ? $func : null, ip()]);
        else
            q("INSERT INTO plat_cadastros (empresa, responsavel, email, telefone, porte, mensagem, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [$empresa, $nome, $email, $tel, $func !== '' ? $func : null, MVP_INFO_MARCA, ip()]);
        $e = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
        enviar_email(mail_aviso(), 'Pedido de informações (Eu quero): ' . $nome, email_modelo('Pedido de informações',
            '<p><b>' . $e($nome) . '</b> · ' . $e($email) . ' · WhatsApp ' . $e($tel) . '</p>' .
            '<p>Tipo de empresa: ' . $e($tipoEmp !== '' ? $tipoEmp : '—') . '<br>Funcionários: ' . $e($func !== '' ? $func : '—') . '</p>' .
            '<p>Quer mais informações sobre o SGClim (ainda não pediu teste). Veja no Console da plataforma, em <b>Pedidos › Informações</b>.</p>'));
        try {
            foreach (linhas("SELECT u.id, u.tenant_id FROM usuarios u JOIN plataforma_admins a ON a.email = u.email AND a.status = 'ativo'
                              WHERE u.status = 'ativo' AND u.excluido_em IS NULL") as $r)
                notificar((int) $r['tenant_id'], [(int) $r['id']], 'Pedido de informações (Eu quero)', $nome . ' · ' . $tel, 'url:' . BASE_PATH . 'plataforma/', 'pedido_acesso');
        } catch (Throwable $x) {}
        return ['ok' => true];
    },
];
