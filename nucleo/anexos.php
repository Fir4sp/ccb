<?php
/* KONSTANTE SaaS — nucleo/anexos.php
   Arquivos ficam em disco: arquivos/<tenant>/<ano>/<mes>/<aleatorio>.<ext>
   O banco guarda só o caminho. Download só via API, conferindo a empresa. */
if (!defined('KSAAS')) { http_response_code(403); exit; }

const ANEXO_TIPOS = [
    'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
    'application/pdf' => 'pdf',
];
/* v1.17.0: documentos do Office, só onde a ação pedir (ex.: arquivos de contrato) */
const ANEXO_DOCS = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx', 'application/msword' => 'doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx', 'application/vnd.ms-excel' => 'xls',
    'application/vnd.oasis.opendocument.text' => 'odt',
];

function salvar_anexo($arq, $donoTipo, $donoId, $categoria, $somenteImagem = false, $docs = false) {
    if (!is_array($arq) || ($arq['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $c = $arq['error'] ?? UPLOAD_ERR_NO_FILE;
        if ($c === UPLOAD_ERR_INI_SIZE || $c === UPLOAD_ERR_FORM_SIZE) erro('Arquivo grande demais.');
        erro('Nenhum arquivo recebido.');
    }
    if ($arq['size'] > ARQUIVO_MAX_MB * 1024 * 1024) erro('Arquivo grande demais (máx. ' . ARQUIVO_MAX_MB . ' MB).');

    /* o tipo é conferido pelo conteúdo, não pelo nome do arquivo */
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($arq['tmp_name']);
    $tipos = $docs ? ANEXO_TIPOS + ANEXO_DOCS : ANEXO_TIPOS;
    if ($docs && !isset($tipos[$mime]) && in_array($mime, ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], true)) {
        $ext = strtolower(pathinfo((string) ($arq['name'] ?? ''), PATHINFO_EXTENSION));   /* servidor antigo vê .docx como zip */
        if ($ext === 'docx') $mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        elseif ($ext === 'xlsx') $mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (!isset($tipos[$mime])) erro($docs ? 'Tipo de arquivo não aceito. Use PDF, Word, Excel ou foto (JPG, PNG, WEBP).' : 'Tipo de arquivo não aceito. Use JPG, PNG, WEBP ou PDF.');
    if ($somenteImagem && strpos($mime, 'image/') !== 0) erro('Envie uma imagem (JPG, PNG ou WEBP).');

    $larg = $alt = null;
    if (strpos($mime, 'image/') === 0) {
        $info = @getimagesize($arq['tmp_name']);
        if (!$info) erro('Imagem inválida.');
        [$larg, $alt] = $info;
    }

    $tid = tenant();
    $rel = $tid . '/' . date('Y') . '/' . date('m');
    $dir = ARQUIVOS_DIR . '/' . $rel;
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) throw new RuntimeException('Não foi possível criar a pasta de arquivos.');
    $nome = bin2hex(random_bytes(16)) . '.' . $tipos[$mime];
    if (!move_uploaded_file($arq['tmp_name'], $dir . '/' . $nome)) throw new RuntimeException('Falha ao gravar o arquivo.');

    q("INSERT INTO anexos (tenant_id, dono_tipo, dono_id, categoria, nome_original, caminho, mime, tamanho, largura, altura, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [$tid, $donoTipo, $donoId, $categoria, mb_substr((string) ($arq['name'] ?? ''), 0, 255),
       $rel . '/' . $nome, $mime, (int) $arq['size'], $larg, $alt, eu()['id']]);
    return (int) db()->lastInsertId();
}