<?php
/* =====================================================================
   KONSTANTE SaaS — nucleo/email.php  ·  envio de e-mail (v1.17.0)
   Usa o mail() da Hostinger. O remetente precisa existir como caixa de
   e-mail no domínio, senão cai no spam. No MVP sai de eneas@xclim.com.br (v1.29.0: nome SGClim).
   Pode ser trocado em nucleo/config.php:
     define('MAIL_DE', 'eneas@xclim.com.br');
     define('MAIL_NOME', 'SGClim');
     define('MAIL_AVISO', 'eneas@xclim.com.br');   // recebe os pedidos de acesso
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

function mail_de()    { return defined('MAIL_DE') ? MAIL_DE : 'eneas@xclim.com.br'; }
function mail_nome()  { return defined('MAIL_NOME') ? MAIL_NOME : 'SGClim'; }
function mail_aviso() { return defined('MAIL_AVISO') ? MAIL_AVISO : 'eneas@xclim.com.br'; }

/* endereço público do sistema (https://sgclim.xclim.com.br/) */
function url_sistema() {
    $host = $_SERVER['HTTP_HOST'] ?? 'sgclim.xclim.com.br';
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    return ($https ? 'https' : 'http') . '://' . $host . (defined('BASE_PATH') ? BASE_PATH : '/');
}

/* corpo padrão com a marca; $html já vem montado e escapado */
function email_modelo($titulo, $html) {
    $e = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
    return '<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;background:#eef1f6;font-family:Segoe UI,Arial,sans-serif;color:#1a1d21">' .
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:24px 0"><tr><td align="center">' .
      '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden">' .
      '<tr><td style="background:#043dac;color:#fff;padding:18px 24px;font-size:18px;font-weight:700">SGClim <span style="font-weight:400;font-size:13px;opacity:.85">· Sistema de gestão</span></td></tr>' .
      '<tr><td style="padding:24px"><h1 style="font-size:19px;margin:0 0 12px;color:#043dac">' . $e($titulo) . '</h1>' . $html . '</td></tr>' .
      '<tr><td style="padding:14px 24px;background:#f6f8fb;font-size:11px;color:#8a92a0">Dúvidas? É só responder este e-mail.</td></tr>' .
      '</table></td></tr></table></body></html>';
}

/* envia e devolve true/false (não derruba a ação se o e-mail falhar) */
function enviar_email($para, $assunto, $html) {
    if (!filter_var($para, FILTER_VALIDATE_EMAIL)) return false;
    $de = mail_de();
    $cab = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        'From: =?UTF-8?B?' . base64_encode(mail_nome()) . '?= <' . $de . '>',
        'Reply-To: ' . mail_aviso(),
        'X-Mailer: SGClim',
    ];
    $ass = '=?UTF-8?B?' . base64_encode($assunto) . '?=';
    try {
        $ok = @mail($para, $ass, chunk_split(base64_encode($html)), implode("\r\n", $cab), '-f' . $de);
    } catch (Throwable $x) { $ok = false; }
    if (!$ok) error_log('KSAAS email falhou para ' . $para . ': ' . $assunto);
    return (bool) $ok;
}
