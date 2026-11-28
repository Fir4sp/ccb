<?php
/* =====================================================================
   KONSTANTE SaaS — nucleo/roteador.php
   Recebe {"acao":"modulo.verbo","dados":{...}}, confere a origem e chama
   o módulo. Usado pelas duas portas: api.php (empresas) e
   plataforma/api.php (console da plataforma).
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/modulos.php';   /* v1.19.0: liberação de módulos por empresa */
require_once __DIR__ . '/uso.php';       /* v1.20.0: indicador de uso (Console › Uso) */
require_once __DIR__ . '/assinatura.php'; /* v1.30.0: planos, teste grátis, cobrança e modo de consulta */

function rotear(array $modulos) {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header('Cache-Control: no-store');
    try {
        $metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $ehUpload = $metodo === 'POST' && !empty($_FILES);

        if ($metodo === 'GET') {
            $acao  = (string) ($_GET['acao'] ?? '');
            $dados = $_GET;
            /* verificação rápida de instalação: api.php?acao=saude */
            if ($acao === 'saude') { valor("SELECT 1"); require_once __DIR__ . '/notificacoes.php';
                ok(['banco' => 'conectado', 'php' => PHP_VERSION, 'push' => push_suportado()]); }   /* v1.19.0: push */
            if ($acao !== 'anexos.abrir') erro('Use POST.', 405, 'METODO');
        } elseif ($metodo === 'POST') {
            /* só aceitamos chamadas feitas pelo próprio app, que envia este cabeçalho */
            if (($_SERVER['HTTP_X_KSAAS'] ?? '') !== '1') erro('Requisição inválida.', 400, 'ORIGEM');
            if ($ehUpload) {
                $acao  = (string) ($_POST['acao'] ?? '');
                $dados = $_POST;
            } else {
                $corpo = json_decode(file_get_contents('php://input'), true);
                if (!is_array($corpo)) erro('Corpo da requisição inválido.', 400, 'JSON');
                $acao  = (string) ($corpo['acao'] ?? '');
                $dados = is_array($corpo['dados'] ?? null) ? $corpo['dados'] : [];
            }
        } else {
            erro('Método não permitido.', 405, 'METODO');
        }

        if (!preg_match('/^([a-z]+)\.([a-z_.]+)$/', $acao, $m) || !isset($modulos[$m[1]])) {
            erro('Ação desconhecida.', 404, 'ACAO');
        }
        $GLOBALS['K_ACAO'] = [$m[1], $m[2]];   /* v1.22.0: regra dos perfis no CRM */
        exigir_modulo_da_api($m[1]);   /* v1.19.0: módulo desligado para a empresa não responde */
        assinatura_exigir_escrita($m[1], $m[2]);   /* v1.30.0: atraso / teste vencido → só consulta */
        exigir_recurso_da_api($m[1], $m[2]);       /* v1.32.0: Financeiro avançado só no Premium */
        $acoes = require dirname(__DIR__) . '/api/' . $modulos[$m[1]] . '.php';
        if (!isset($acoes[$m[2]])) erro('Ação desconhecida.', 404, 'ACAO');

        /* v1.12.0: envio repetido de uma alteração feita sem internet (mesmo _sync) não grava duas vezes */
        $sync = sync_chave($dados);
        if ($sync && sync_ja_recebido($sync)) ok(['_duplicado' => true]);
        $res = $acoes[$m[2]]($dados);
        if ($sync) sync_registrar($sync, $acao);
        uso_registrar($acao);   /* v1.20.0 */
        ok($res);

    } catch (ErroApi $e) {
        rotear_desfazer();
        http_response_code($e->http);
        echo json_encode(['ok' => false, 'erro' => $e->getMessage(), 'codigo' => $e->codigo], JSON_UNESCAPED_UNICODE);
    } catch (Throwable $e) {
        rotear_desfazer();
        http_response_code(500);
        $msg = MOSTRAR_ERROS ? $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')'
                             : 'Erro interno. Tente de novo; se continuar, avise o suporte.';
        error_log('[KSAAS] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        echo json_encode(['ok' => false, 'erro' => $msg, 'codigo' => 'INTERNO'], JSON_UNESCAPED_UNICODE);
    }
}

function rotear_desfazer() {
    try { if (db()->inTransaction()) db()->rollBack(); } catch (Throwable $e) {}
}

/* ---------- alterações vindas da fila do aparelho (v1.12.0) ----------
   Cada alteração feita no app leva um código único (_sync). Se a internet cair
   depois de o servidor gravar, o aparelho reenvia — e aqui ela é reconhecida.
   Sem a tabela sync_recebidos (SQL 07 ainda não rodado), tudo segue como antes. */
function sync_chave($dados) {
    $k = is_array($dados) ? (string) ($dados['_sync'] ?? '') : '';
    return preg_match('/^[a-z0-9]{8,40}$/', $k) ? $k : null;
}
function sync_tenant() {
    if (defined('KPLAT') || defined('KPUB')) return null;
    try { $u = eu(false); return $u ? (int) $u['tenant_id'] : null; } catch (Throwable $e) { return null; }
}
function sync_ja_recebido($k) {
    $t = sync_tenant(); if (!$t) return false;
    try { return (bool) valor("SELECT 1 FROM sync_recebidos WHERE tenant_id = ? AND chave = ?", [$t, $k]); } catch (Throwable $e) { return false; }
}
function sync_registrar($k, $acao) {
    $t = sync_tenant(); if (!$t) return;
    try {
        q("INSERT IGNORE INTO sync_recebidos (tenant_id, chave, acao) VALUES (?, ?, ?)", [$t, $k, mb_substr($acao, 0, 60)]);
    } catch (Throwable $e) { /* nunca derruba a ação */ }
}
