<?php
// Encontra a pasta ccb_app subindo até 4 níveis a partir da pasta do site.
// Assim ela pode ficar ao lado do public_html (recomendado) ou ao lado da pasta do subdomínio.
function ccb_app_dir(): string
{
    $d = __DIR__;
    for ($i = 0; $i < 4; $i++) {
        $d = dirname($d);
        if (is_file("$d/ccb_app/src/bootstrap.php")) return "$d/ccb_app";
    }
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Pasta ccb_app não encontrada. Veja o passo 3 do Guia de Instalação.');
}
