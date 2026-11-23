<?php
declare(strict_types=1);

// Carrega as classes sem Composer (o projeto não tem dependências externas).
foreach (['Config', 'Db', 'Http', 'Catalogo', 'Sessao', 'Acesso', 'Auditoria', 'Roteador', 'Instalacao', 'Anexos', 'Chamados', 'Ordens', 'Estoque'] as $arq) {
    require_once __DIR__ . "/$arq.php";
}
foreach (glob(__DIR__ . '/Controladores/*.php') as $arq) {
    require_once $arq;
}

date_default_timezone_set('America/Sao_Paulo');
mb_internal_encoding('UTF-8');
