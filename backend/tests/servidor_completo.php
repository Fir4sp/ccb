<?php
// Servidor de desenvolvimento: entrega o app (frontend/dist) e a API no mesmo endereço,
// igual ao que acontece na hospedagem.  php -S 127.0.0.1:8100 -t ../frontend/dist tests/servidor_completo.php
$caminho = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($caminho, '/api/')) {
    require __DIR__ . '/../public/index.php';
    return true;
}
if ($caminho !== '/' && is_file($_SERVER['DOCUMENT_ROOT'] . $caminho)) {
    return false;
}
readfile($_SERVER['DOCUMENT_ROOT'] . '/index.html');
