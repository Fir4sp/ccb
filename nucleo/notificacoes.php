<?php
/* =====================================================================
   KONSTANTE SaaS — nucleo/notificacoes.php  (v1.19.0)
   notificar()  grava a notificação de cada pessoa (sino do app) e agenda
                o aviso no celular (push), enviado DEPOIS da resposta ir
                para o navegador — quem salvou não espera o envio.
   Push: padrão Web Push (VAPID + aes128gcm), sem biblioteca externa.
   As chaves VAPID são criadas no primeiro uso e ficam em plat_config.
   Nada aqui derruba a ação principal: qualquer falha é engolida.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

const PUSH_CONTATO = 'mailto:eneas@xclim.com.br';
const PUSH_MAX_FALHAS = 5;

/* link: 'tarefa:12', 'os:5', 'chamado:9' ou 'url:/caminho' */
function notificar($tid, $usuarios, $titulo, $texto, $link = null, $tipo = null, $exceto = null) {
    $tid = (int) $tid;
    $ids = array_values(array_unique(array_filter(array_map('intval', (array) $usuarios))));
    if ($exceto) $ids = array_values(array_diff($ids, [(int) $exceto]));
    if (!$ids) return [];
    $novas = [];
    try {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $validos = array_map('intval', array_column(linhas(
            "SELECT id FROM usuarios WHERE tenant_id = ? AND status = 'ativo' AND excluido_em IS NULL AND id IN ($in)",
            array_merge([$tid], $ids)), 'id'));
        foreach ($validos as $uid) {
            q("INSERT INTO notificacoes (tenant_id, usuario_id, titulo, tipo, texto, link) VALUES (?, ?, ?, ?, ?, ?)",
              [$tid, $uid, mb_substr((string) $titulo, 0, 150), $tipo ? mb_substr($tipo, 0, 40) : null,
               mb_substr((string) $texto, 0, 500), $link ? mb_substr($link, 0, 255) : null]);
            $novas[] = (int) db()->lastInsertId();
        }
    } catch (Throwable $e) { error_log('[KSAAS notificar] ' . $e->getMessage()); return []; }
    if ($novas) push_agendar($novas);
    return $novas;
}

/* pessoas do escritório (admin e coordenação) — destino padrão */
function usuarios_escritorio($tid, $soAdmin = false) {
    try {
        return array_map('intval', array_column(linhas(
            "SELECT id FROM usuarios WHERE tenant_id = ? AND status = 'ativo' AND excluido_em IS NULL AND perfil " .
            ($soAdmin ? "= 'admin'" : "IN ('admin','coord')"), [(int) $tid]), 'id'));
    } catch (Throwable $e) { return []; }
}

/* ---------------- fila de push (enviada no fim da requisição) ---------------- */

function push_agendar($ids) {
    static $registrado = false;
    $GLOBALS['K_PUSH_FILA'] = array_merge($GLOBALS['K_PUSH_FILA'] ?? [], $ids);
    if ($registrado) return;
    $registrado = true;
    register_shutdown_function('push_fim_da_requisicao');
}

function push_fim_da_requisicao() {
    $ids = $GLOBALS['K_PUSH_FILA'] ?? [];
    if (!$ids) return;
    /* entrega a resposta ao navegador antes de falar com os servidores de push */
    if (function_exists('litespeed_finish_request')) @litespeed_finish_request();
    elseif (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
    ignore_user_abort(true);
    @set_time_limit(20);
    try { push_enviar_notificacoes($ids); } catch (Throwable $e) { error_log('[KSAAS push] ' . $e->getMessage()); }
}

function push_enviar_notificacoes($ids) {
    try { if (db()->inTransaction()) db()->rollBack(); } catch (Throwable $e) {}
    $in = implode(',', array_fill(0, count($ids), '?'));
    /* só o que de fato ficou gravado (se a ação deu erro e desfez, não avisa) */
    $notas = linhas("SELECT * FROM notificacoes WHERE id IN ($in)", $ids);
    if (!$notas) return;
    $vapid = push_chaves(false);
    if (!$vapid) return;
    $envios = [];
    foreach ($notas as $n) {
        $subs = linhas("SELECT * FROM push_inscricoes WHERE tenant_id = ? AND usuario_id = ?", [$n['tenant_id'], $n['usuario_id']]);
        if (!$subs) continue;
        $naoLidas = (int) valor("SELECT COUNT(*) FROM notificacoes WHERE tenant_id = ? AND usuario_id = ? AND lida_em IS NULL", [$n['tenant_id'], $n['usuario_id']]);
        $payload = json_encode([
            'titulo' => $n['titulo'] ?: 'Novidade no sistema',
            'texto'  => $n['texto'],
            'link'   => $n['link'],
            'id'     => (int) $n['id'],
            'naoLidas' => $naoLidas,
        ], JSON_UNESCAPED_UNICODE);
        foreach ($subs as $s) $envios[] = ['sub' => $s, 'payload' => $payload];
    }
    if ($envios) push_disparar($envios, $vapid);
}

/* ---------------- chaves VAPID ---------------- */

function b64u($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_dec($s) { $s = strtr((string) $s, '-_', '+/'); return base64_decode($s . str_repeat('=', (4 - strlen($s) % 4) % 4)); }

function push_suportado() {
    return function_exists('openssl_pkey_derive') && function_exists('openssl_pkey_new') && function_exists('curl_init')
        && in_array('aes-128-gcm', openssl_get_cipher_methods(), true);
}

/* {publica: base64url de 65 bytes, privada: PEM}; cria na primeira vez se $criar */
function push_chaves($criar = true) {
    try {
        $v = valor("SELECT valor FROM plat_config WHERE chave = 'vapid'");
        if ($v) { $j = json_decode((string) $v, true); if (!empty($j['publica']) && !empty($j['privada'])) return $j; }
    } catch (Throwable $e) { return null; }
    if (!$criar || !push_suportado()) return null;
    $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if (!$k) return null;
    openssl_pkey_export($k, $pem);
    $det = openssl_pkey_get_details($k);
    $pub = "\x04" . str_pad($det['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($det['ec']['y'], 32, "\0", STR_PAD_LEFT);
    $j = ['publica' => b64u($pub), 'privada' => $pem];
    q("INSERT IGNORE INTO plat_config (chave, valor) VALUES ('vapid', ?)", [json_encode($j)]);
    /* se dois pedidos criaram ao mesmo tempo, vale o que ficou gravado */
    $v = json_decode((string) valor("SELECT valor FROM plat_config WHERE chave = 'vapid'"), true);
    return $v ?: $j;
}

/* ponto P-256 cru (65 bytes) → chave pública PEM */
function push_pem_publica($raw) {
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/* assinatura DER do openssl → r||s (64 bytes) do JWT ES256 */
function push_der_para_raw($der) {
    $pos = 2;
    if (ord($der[1]) & 0x80) $pos += ord($der[1]) & 0x7f;
    $out = '';
    for ($i = 0; $i < 2; $i++) {
        $pos++;                       // 0x02
        $len = ord($der[$pos++]);
        $n = substr($der, $pos, $len); $pos += $len;
        $n = ltrim($n, "\0");
        $out .= str_pad($n, 32, "\0", STR_PAD_LEFT);
    }
    return $out;
}

function push_jwt($aud, $vapid) {
    $cab = b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $corpo = b64u(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => PUSH_CONTATO]));
    $dados = $cab . '.' . $corpo;
    $priv = openssl_pkey_get_private($vapid['privada']);
    if (!$priv || !openssl_sign($dados, $sig, $priv, OPENSSL_ALGO_SHA256)) return null;
    return $dados . '.' . b64u(push_der_para_raw($sig));
}

/* criptografia do conteúdo (RFC 8291, aes128gcm) */
function push_cifrar($payload, $p256dh, $auth) {
    $uaPub = b64u_dec($p256dh);
    $authSec = b64u_dec($auth);
    if (strlen($uaPub) !== 65 || strlen($authSec) < 16) return null;
    $eph = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if (!$eph) return null;
    $det = openssl_pkey_get_details($eph);
    $asPub = "\x04" . str_pad($det['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($det['ec']['y'], 32, "\0", STR_PAD_LEFT);
    $segredo = openssl_pkey_derive(openssl_pkey_get_public(push_pem_publica($uaPub)), $eph, 32);
    if ($segredo === false) return null;
    $segredo = str_pad($segredo, 32, "\0", STR_PAD_LEFT);
    $prkKey = hash_hmac('sha256', $segredo, $authSec, true);
    $ikm = hash_hmac('sha256', "WebPush: info\0" . $uaPub . $asPub . "\x01", $prkKey, true);
    $sal = random_bytes(16);
    $prk = hash_hmac('sha256', $ikm, $sal, true);
    $cek = substr(hash_hmac('sha256', "Content-Encoding: aes128gcm\0\x01", $prk, true), 0, 16);
    $nonce = substr(hash_hmac('sha256', "Content-Encoding: nonce\0\x01", $prk, true), 0, 12);
    $tag = '';
    $cifrado = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    if ($cifrado === false) return null;
    return $sal . pack('N', 4096) . chr(65) . $asPub . $cifrado . $tag;
}

function push_disparar($envios, $vapid) {
    $mh = curl_multi_init();
    $alcas = [];
    $jwts = [];
    foreach ($envios as $i => $e) {
        $s = $e['sub'];
        $url = $s['endpoint'];
        $p = parse_url($url);
        if (empty($p['scheme']) || $p['scheme'] !== 'https' || empty($p['host'])) continue;
        $aud = 'https://' . $p['host'];
        if (!isset($jwts[$aud])) $jwts[$aud] = push_jwt($aud, $vapid);
        $corpo = push_cifrar($e['payload'], $s['p256dh'], $s['auth']);
        if (!$jwts[$aud] || $corpo === null) continue;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => $corpo, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/octet-stream', 'Content-Encoding: aes128gcm',
                'TTL: 86400', 'Urgency: high',
                'Authorization: vapid t=' . $jwts[$aud] . ', k=' . $vapid['publica'],
            ],
        ]);
        curl_multi_add_handle($mh, $ch);
        $alcas[$i] = $ch;
    }
    if (!$alcas) { curl_multi_close($mh); return; }
    do { $st = curl_multi_exec($mh, $ativos); if ($ativos) curl_multi_select($mh, 1.0); } while ($ativos && $st === CURLM_OK);
    foreach ($alcas as $i => $ch) {
        $cod = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $sid = (int) $envios[$i]['sub']['id'];
        try {
            if ($cod >= 200 && $cod < 300) q("UPDATE push_inscricoes SET falhas = 0, ultimo_envio = NOW() WHERE id = ?", [$sid]);
            elseif ($cod === 404 || $cod === 410) q("DELETE FROM push_inscricoes WHERE id = ?", [$sid]);   // aparelho desinscrito
            else {
                q("UPDATE push_inscricoes SET falhas = falhas + 1 WHERE id = ?", [$sid]);
                q("DELETE FROM push_inscricoes WHERE id = ? AND falhas >= ?", [$sid, PUSH_MAX_FALHAS]);
                if ($cod) error_log('[KSAAS push] HTTP ' . $cod . ' ' . substr((string) curl_multi_getcontent($ch), 0, 200));
            }
        } catch (Throwable $e) {}
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
}
