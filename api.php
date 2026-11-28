<?php
/* KONSTANTE SaaS — api.php  ·  porta da API das EMPRESAS
   POST {"acao":"modulo.verbo","dados":{...}}   ·   GET ?acao=saude  */
define('KSAAS', 1);
require __DIR__ . '/nucleo/roteador.php';
rotear([
    'auth'     => 'auth',
    'usuarios' => 'usuarios',
    'config'   => 'config',
    'anexos'   => 'anexos',
    'clientes' => 'clientes',
    'chamados' => 'chamados',
    'catalogo' => 'catalogo',
    'os'       => 'os',
    'tarefas'  => 'tarefas',
    'inicio'   => 'inicio',
    'notificacoes' => 'notificacoes', /* v1.19.0: sino e push */
]);
