<?php
/* =====================================================================
   SGClim — nucleo/config.exemplo.php
   MODELO do nucleo/config.php. O arquivo real fica SÓ no servidor
   (Hostinger) e nunca vai para o GitHub (.gitignore).
   Para instalar: copie como config.php e preencha os valores.
   ===================================================================== */
if (!defined('KSAAS') && !defined('KPLAT') && !defined('KPUB')) { http_response_code(403); exit; }

/* ---------- banco de dados (MySQL) ---------- */
define('DB_HOST',    'localhost');
define('DB_NOME',    'nome_do_banco');
define('DB_USUARIO', 'usuario_do_banco');
define('DB_SENHA',   'senha_do_banco');

/* ---------- endereço ---------- */
define('BASE_PATH', '/');                 // '/' em sgclim.xclim.com.br

/* ---------- assistente de IA (nucleo/ia.php) ---------- */
define('IA_FORNECEDOR', 'gemini');
define('IA_CHAVE',      'chave da API do fornecedor');
// define('IA_MODELO',     'gemini-flash-latest');
// define('IA_PRAZO',      80);           // segundos por pedido
// define('IA_PENSAMENTO', 'baixo');
// define('IA_LIMITE_DIA', 150);          // pedidos por empresa por dia
// define('IA_URL_BASE',   'https://generativelanguage.googleapis.com/v1beta/models/');

/* ---------- cobrança Asaas (nucleo/asaas.php) ---------- */
define('ASAAS_AMBIENTE',      'producao');  // 'producao' ou 'sandbox' (teste)
define('ASAAS_CHAVE',         '$aact_...');
define('ASAAS_WEBHOOK_TOKEN', 'texto cadastrado no webhook do Asaas');
// define('ASAAS_URL', '...');               // opcional

/* ---------- acesso do Claude por chave (v1.37.0, nucleo/base.php › ponte_usuario) ---------- */
// define('PONTE_CHAVE',   'texto aleatório com 32 ou mais caracteres');   // o mesmo cadastrado no ambiente do Claude
// define('PONTE_USUARIO', 'email@do.usuario');                           // e-mail (ou id) do usuário criado para o Claude

/* ---------- e-mail (nucleo/email.php) ---------- */
define('MAIL_DE',    'eneas@xclim.com.br');
define('MAIL_NOME',  'SGClim');
define('MAIL_AVISO', 'eneas@xclim.com.br');  // recebe os pedidos de acesso
