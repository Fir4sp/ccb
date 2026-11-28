<?php
/* =====================================================================
   SGClim — nucleo/asaas.php  (v1.30.0 · v1.33.2)
   Conversa com a API do Asaas (cobrança das assinaturas das empresas).
   Configuração em nucleo/config.php:
     define('ASAAS_AMBIENTE', 'sandbox');        // sandbox (teste) ou producao
     define('ASAAS_CHAVE', '$aact_...');         // chave de API da conta (Integrações › Chaves de API)
     define('ASAAS_WEBHOOK_TOKEN', '...');       // o mesmo texto cadastrado no webhook do Asaas
   Sem ASAAS_CHAVE o sistema funciona normalmente (teste grátis e isentas),
   só não dá para assinar.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

function asaas_configurado() { return defined('ASAAS_CHAVE') && ASAAS_CHAVE !== ''; }
function asaas_ambiente()    { return defined('ASAAS_AMBIENTE') && ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox'; }
function asaas_url_base() {
    if (defined('ASAAS_URL')) return rtrim(ASAAS_URL, '/');   /* só para testes locais */
    return asaas_ambiente() === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}

/* chamada à API. Devolve o JSON decodificado ou lança ErroApi com a mensagem do Asaas. */
function asaas($metodo, $caminho, $corpo = null) {
    if (!asaas_configurado()) erro('A cobrança ainda não está configurada na plataforma. Fale com o suporte.', 503, 'ASAAS_OFF');
    $ch = curl_init(asaas_url_base() . $caminho);
    /* v1.33.2: o Asaas (produção) recusa chamada sem User-Agent — vai no cabeçalho e também pela opção do cURL */
    /* v1.33.2: chave colada com espaço ou quebra de linha no config.php corta o cabeçalho e o Asaas não vê o User-Agent */
    $chave = preg_replace('/[\s\x00-\x1F]+/', '', (string) ASAAS_CHAVE);
    $cab = ['access_token: ' . $chave, 'Content-Type: application/json', 'Accept: application/json', 'User-Agent: SGClim-Xclim/1.33'];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $metodo,
        CURLOPT_HTTPHEADER     => $cab,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_USERAGENT      => 'SGClim-Xclim/1.33',
    ]);
    if ($corpo !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($corpo, JSON_UNESCAPED_UNICODE));
    $resp = curl_exec($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $falha = curl_error($ch);
    curl_close($ch);
    if ($resp === false) {
        error_log('[ASAAS] ' . $metodo . ' ' . $caminho . ' falhou: ' . $falha);
        erro('Não foi possível falar com o Asaas agora. Tente de novo em alguns minutos.', 502, 'ASAAS_REDE');
    }
    $j = json_decode($resp, true);
    if ($http >= 200 && $http < 300) return is_array($j) ? $j : [];
    $msg = '';
    if (is_array($j) && !empty($j['errors'][0]['description'])) $msg = $j['errors'][0]['description'];
    error_log('[ASAAS] ' . $metodo . ' ' . $caminho . ' HTTP ' . $http . ': ' . mb_substr((string) $resp, 0, 500));
    if ($http === 401) erro('A chave do Asaas não foi aceita. Confira ASAAS_CHAVE e ASAAS_AMBIENTE no config.php.', 502, 'ASAAS_CHAVE');
    erro('Asaas: ' . ($msg ?: 'não aceitou o pedido (' . $http . ').'), 400, 'ASAAS');
}

/* status do Asaas agrupados */
const ASAAS_PAGOS   = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
const ASAAS_ABERTOS = ['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS', 'DUNNING_REQUESTED'];

function asaas_status_txt($s) {
    $m = ['PENDING' => 'Aguardando pagamento', 'OVERDUE' => 'Vencida', 'RECEIVED' => 'Paga', 'CONFIRMED' => 'Paga',
          'RECEIVED_IN_CASH' => 'Paga', 'DUNNING_RECEIVED' => 'Paga', 'REFUNDED' => 'Estornada', 'REFUND_REQUESTED' => 'Estorno pedido',
          'CHARGEBACK_REQUESTED' => 'Contestada', 'CHARGEBACK_DISPUTE' => 'Contestada', 'AWAITING_CHARGEBACK_REVERSAL' => 'Contestada',
          'AWAITING_RISK_ANALYSIS' => 'Em análise', 'DUNNING_REQUESTED' => 'Em negativação', 'DELETED' => 'Cancelada'];
    return $m[$s] ?? $s;
}

function asaas_forma_txt($f) {
    $m = ['PIX' => 'Pix', 'BOLETO' => 'Boleto', 'CREDIT_CARD' => 'Cartão', 'UNDEFINED' => 'A escolher', 'DEBIT_CARD' => 'Débito'];
    return $m[$f] ?? $f;
}
