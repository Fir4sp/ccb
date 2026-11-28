<?php
/* =====================================================================
   KONSTANTE SaaS — nucleo/ia.php  (v1.21.0)
   Adaptador de IA, independente de fornecedor. O resto do sistema só usa:
     ia_configurada()                       → há chave no config.php?
     ia_conversar($sistema, $hist, $ferr, $executar)  → conversa com ferramentas
     ia_texto($sistema, $pedido)            → um texto só (ex.: descritivo)
     ia_pesquisar($pergunta, $sistema)      → resposta com busca na internet
   Configuração (nucleo/config.php — nunca vai em pacote):
     define('IA_FORNECEDOR', 'gemini');
     define('IA_CHAVE', 'chave do Google AI Studio');
     define('IA_MODELO', 'gemini-flash-latest');   (opcional)
     define('IA_PRAZO', 80);                       (opcional — segundos máximos por pedido)
     define('IA_PENSAMENTO', 'baixo');             (opcional — 'padrao' deixa o modelo pensar à vontade, mais lento)
   Trocar de fornecedor = escrever outro bloco igual ao do Gemini abaixo.
   A chave fica só no servidor; o navegador nunca a vê.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

class ErroIa extends Exception {
    public $tipo;   /* limite | limite_dia | chave | rede | demora | resposta */
    public function __construct($msg, $tipo = 'resposta') { parent::__construct($msg); $this->tipo = $tipo; }
}

function ia_cfg($nome, $padrao = null) { return defined($nome) ? constant($nome) : $padrao; }
function ia_configurada() { return trim((string) ia_cfg('IA_CHAVE', '')) !== ''; }
function ia_fornecedor() { return (string) ia_cfg('IA_FORNECEDOR', 'gemini'); }

function ia_conversar($sistema, $hist, $ferramentas, $executar, $opc = []) {
    if (!ia_configurada()) throw new ErroIa('Assistente sem chave configurada.', 'chave');
    if (ia_fornecedor() === 'gemini') return gemini_conversar($sistema, $hist, $ferramentas, $executar, $opc);
    throw new ErroIa('Fornecedor de IA não suportado: ' . ia_fornecedor(), 'chave');
}

function ia_texto($sistema, $pedido, $opc = []) {
    return ia_conversar($sistema, [['papel' => 'usuario', 'texto' => $pedido]], [], null, $opc);
}

function ia_pesquisar($pergunta, $sistema) {
    if (!ia_configurada()) throw new ErroIa('Assistente sem chave configurada.', 'chave');
    if (ia_fornecedor() === 'gemini') return gemini_pesquisar($pergunta, $sistema);
    throw new ErroIa('Fornecedor de IA não suportado: ' . ia_fornecedor(), 'chave');
}

/* ---------- HTTP (curl; sem curl, usa stream do PHP) ---------- */
function ia_http_post($url, $cabecalhos, $corpo, $timeout = 50) {
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => $corpo, CURLOPT_HTTPHEADER => $cabecalhos,
            CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => $timeout,
        ]);
        $txt = curl_exec($c);
        $cod = (int) curl_getinfo($c, CURLINFO_HTTP_CODE);
        if ($txt === false) { error_log('[KSAAS ia] curl: ' . curl_error($c)); $txt = ''; $cod = 0; }
        curl_close($c);
        return [$cod, (string) $txt];
    }
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => implode("\r\n", $cabecalhos), 'content' => $corpo,
                                             'timeout' => $timeout, 'ignore_errors' => true]]);
    $txt = @file_get_contents($url, false, $ctx);
    $cod = 0;
    foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $cod = (int) $m[1];
    return [$cod, $txt === false ? '' : $txt];
}

/* =====================================================================
   GEMINI (Google AI Studio)
   ===================================================================== */

/* v1.21.0: prazo total do pedido. O app espera até ~110 s; a IA tem até IA_PRAZO (padrão 80 s) somando
   todas as idas ao Gemini. Sem isso, várias rodadas de 50 s estouravam e o app mostrava "sem conexão". */
function ia_prazo_restante() {
    if (!isset($GLOBALS['IA_FIM'])) $GLOBALS['IA_FIM'] = microtime(true) + (int) ia_cfg('IA_PRAZO', 80);
    return $GLOBALS['IA_FIM'] - microtime(true);
}

/* v1.21.0: "pensamento" do modelo no mínimo — é o que mais deixava o Assistente lento.
   Gemini 2.x: thinkingBudget 0 (Flash) · Gemini 3 e "-latest": thinkingLevel low.
   Se o modelo recusar o parâmetro, a chamada é refeita sem ele (e lembra disso). */
function gemini_pensamento($modelo) {
    if (!empty($GLOBALS['IA_SEM_THINKING']) || ia_cfg('IA_PENSAMENTO', 'baixo') === 'padrao') return null;
    $m = strtolower($modelo);
    if (strpos($m, 'gemini-2.0') !== false || strpos($m, 'gemini-1') !== false) return null;
    if (strpos($m, 'gemini-2.5') !== false) return strpos($m, 'pro') !== false ? ['thinkingBudget' => 128] : ['thinkingBudget' => 0];
    return ['thinkingLevel' => 'low'];
}

function gemini_chamar($corpo, $timeout = 45) {
    $modelo = (string) ia_cfg('IA_MODELO', 'gemini-flash-latest');
    $url = (string) ia_cfg('IA_URL_BASE', 'https://generativelanguage.googleapis.com/v1beta/models/') . rawurlencode($modelo) . ':generateContent';
    $pens = gemini_pensamento($modelo);
    if ($pens) $corpo['generationConfig']['thinkingConfig'] = $pens;

    for ($tentativa = 1; ; $tentativa++) {
        $resta = ia_prazo_restante();
        if ($resta < 6) throw new ErroIa('A IA demorou demais para responder.', 'demora');
        $limite = (int) max(5, min($timeout, $resta - 2));
        $t0 = microtime(true);
        [$cod, $txt] = ia_http_post($url, ['Content-Type: application/json', 'x-goog-api-key: ' . trim((string) IA_CHAVE)],
                                    json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $limite);
        $j = json_decode($txt, true);
        if ($cod === 200 && is_array($j)) return [$j, json_decode($txt)];
        $msg = is_array($j) ? (string) ($j['error']['message'] ?? '') : '';
        $st  = is_array($j) ? (string) ($j['error']['status'] ?? '') : '';
        error_log('[KSAAS ia] gemini HTTP ' . $cod . ' ' . $st . ' (' . round(microtime(true) - $t0, 1) . ' s, tentativa ' . $tentativa . ') ' . mb_substr($msg, 0, 300));

        /* modelo não aceita o ajuste de pensamento → tira e tenta de novo na hora */
        if ($cod === 400 && isset($corpo['generationConfig']['thinkingConfig']) && stripos($msg, 'think') !== false) {
            unset($corpo['generationConfig']['thinkingConfig']);
            $GLOBALS['IA_SEM_THINKING'] = true;
            continue;
        }
        $limiteGoogle = $cod === 429 || $st === 'RESOURCE_EXHAUSTED';
        $instavel = $cod === 0 || $cod === 500 || $cod === 502 || $cod === 503 || $cod === 504;
        /* limite por minuto da chave gratuita ou Google instável: espera um pouco e tenta mais 1 vez */
        if (($limiteGoogle || $instavel) && $tentativa < 2 && ia_prazo_restante() > 20) {
            $espera = $limiteGoogle ? 4 : 2;
            if (preg_match('/retry in ([\d.]+)s/i', $msg, $m)) $espera = (int) ceil(min(10, (float) $m[1]));
            sleep($espera);
            continue;
        }
        if ($limiteGoogle) {
            $dia = stripos($msg, 'per day') !== false || stripos($msg, 'PerDay') !== false;
            throw new ErroIa($dia ? 'Limite diário da chave gratuita do Gemini atingido.' : 'Limite por minuto do Gemini atingido.', $dia ? 'limite_dia' : 'limite');
        }
        if ($cod === 401 || $cod === 403 || stripos($msg, 'API key') !== false) throw new ErroIa('Chave do Gemini inválida ou sem permissão.', 'chave');
        if ($cod === 404) throw new ErroIa('Modelo de IA não encontrado (IA_MODELO no config.php).', 'chave');
        if ($cod === 0) throw new ErroIa(microtime(true) - $t0 >= $limite - 1 ? 'A IA demorou demais para responder.' : 'Sem conexão do servidor com o Gemini.', microtime(true) - $t0 >= $limite - 1 ? 'demora' : 'rede');
        if ($cod >= 500) throw new ErroIa('Gemini indisponível no momento.', 'rede');
        throw new ErroIa('Resposta inválida da IA' . ($msg ? ': ' . mb_substr($msg, 0, 200) : '.'), 'resposta');
    }
}

function gemini_tokens(&$uso, $j) {
    $m = $j['usageMetadata'] ?? [];
    $uso['entrada'] += (int) ($m['promptTokenCount'] ?? 0);
    $uso['saida']   += (int) ($m['candidatesTokenCount'] ?? 0) + (int) ($m['thoughtsTokenCount'] ?? 0);
}

/* texto final da resposta (ignora as partes de "pensamento") */
function gemini_texto($partes) {
    $t = '';
    foreach ($partes as $p) if (isset($p['text']) && empty($p['thought'])) $t .= $p['text'];
    return trim($t);
}

function gemini_ferramentas($ferramentas) {
    $decl = [];
    foreach ($ferramentas as $f) {
        $decl[] = ['name' => $f['nome'], 'description' => $f['descricao'], 'parameters' => $f['parametros']];
    }
    return $decl ? [['functionDeclarations' => $decl]] : null;
}

function gemini_conversar($sistema, $hist, $ferramentas, $executar, $opc) {
    $contents = [];
    foreach ($hist as $m) {
        $txt = (string) ($m['texto'] ?? '');
        if ($txt === '') continue;
        $contents[] = ['role' => ($m['papel'] ?? '') === 'ia' ? 'model' : 'user', 'parts' => [['text' => $txt]]];
    }
    $corpo = [
        'systemInstruction' => ['parts' => [['text' => $sistema]]],
        'contents' => $contents,
        'generationConfig' => ['temperature' => $opc['temperatura'] ?? 0.4, 'maxOutputTokens' => $opc['maxTokens'] ?? 4096],
    ];
    $tools = gemini_ferramentas($ferramentas);
    if ($tools) $corpo['tools'] = $tools;

    $uso = ['entrada' => 0, 'saida' => 0];
    $usadas = [];
    for ($rodada = 0; $rodada < 6; $rodada++) {
        /* sem tempo para mais uma ida à IA: devolve o que já tem em vez de estourar */
        if ($rodada > 0 && ia_prazo_restante() < 12) {
            return ['texto' => 'Consultei o sistema, mas a resposta ficou longa demais para o tempo disponível. Peça de novo de forma mais direta (por exemplo, uma coisa de cada vez).',
                    'entrada' => $uso['entrada'], 'saida' => $uso['saida'], 'ferramentas' => $usadas];
        }
        [$j, $obj] = gemini_chamar($corpo);
        gemini_tokens($uso, $j);
        $cand = $j['candidates'][0] ?? null;
        $partes = $cand['content']['parts'] ?? [];
        $chamadas = array_values(array_filter($partes, function ($p) { return isset($p['functionCall']); }));
        if (!$chamadas || !$executar) {
            $texto = gemini_texto($partes);
            if ($texto === '') {
                $fim = (string) ($cand['finishReason'] ?? ($j['promptFeedback']['blockReason'] ?? ''));
                $texto = in_array($fim, ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'RECITATION'], true)
                    ? 'Não consigo ajudar com esse pedido.' : 'Não consegui montar a resposta. Tente perguntar de outro jeito.';
            }
            return ['texto' => $texto, 'entrada' => $uso['entrada'], 'saida' => $uso['saida'], 'ferramentas' => $usadas];
        }
        /* devolve ao modelo exatamente o que ele mandou (inclui as "assinaturas" do Gemini 3) */
        $conteudoModelo = $obj->candidates[0]->content;
        $conteudoModelo->role = 'model';
        foreach ($conteudoModelo->parts as $p) {
            if (isset($p->functionCall) && (!isset($p->functionCall->args) || $p->functionCall->args === [] )) $p->functionCall->args = new stdClass();
        }
        $corpo['contents'][] = $conteudoModelo;

        $respostas = [];
        foreach ($chamadas as $c) {
            $nome = (string) ($c['functionCall']['name'] ?? '');
            $args = is_array($c['functionCall']['args'] ?? null) ? $c['functionCall']['args'] : [];
            $usadas[] = $nome;
            try { $res = $executar($nome, $args); }
            catch (ErroApi $e) { $res = ['erro' => $e->getMessage()]; }
            catch (ErroIa $e) { throw $e; }
            catch (Throwable $e) { error_log('[KSAAS ia] ferramenta ' . $nome . ': ' . $e->getMessage()); $res = ['erro' => 'Falha interna ao executar ' . $nome . '.']; }
            $fr = ['name' => $nome, 'response' => ['resultado' => $res]];
            if (!empty($c['functionCall']['id'])) $fr['id'] = $c['functionCall']['id'];
            $respostas[] = ['functionResponse' => $fr];
        }
        $corpo['contents'][] = ['role' => 'user', 'parts' => $respostas];
    }
    return ['texto' => 'Precisei de passos demais para responder. Tente dividir o pedido em partes menores.',
            'entrada' => $uso['entrada'], 'saida' => $uso['saida'], 'ferramentas' => $usadas];
}

function gemini_pesquisar($pergunta, $sistema) {
    $corpo = [
        'systemInstruction' => ['parts' => [['text' => $sistema]]],
        'contents' => [['role' => 'user', 'parts' => [['text' => $pergunta]]]],
        'tools' => [['google_search' => new stdClass()]],
        'generationConfig' => ['temperature' => 0.2, 'maxOutputTokens' => 3072],
    ];
    [$j] = gemini_chamar($corpo, 50);
    $uso = ['entrada' => 0, 'saida' => 0];
    gemini_tokens($uso, $j);
    $cand = $j['candidates'][0] ?? [];
    $fontes = []; $vistos = [];
    foreach (($cand['groundingMetadata']['groundingChunks'] ?? []) as $g) {
        $u = (string) ($g['web']['uri'] ?? ''); $t = (string) ($g['web']['title'] ?? '');
        if ($u === '' || isset($vistos[$t ?: $u])) continue;
        $vistos[$t ?: $u] = 1;
        $fontes[] = ['titulo' => $t ?: parse_url($u, PHP_URL_HOST), 'url' => $u];
        if (count($fontes) >= 5) break;
    }
    return ['texto' => gemini_texto($cand['content']['parts'] ?? []), 'fontes' => $fontes, 'entrada' => $uso['entrada'], 'saida' => $uso['saida']];
}
