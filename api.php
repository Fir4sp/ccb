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
    'pmoc'     => 'pmoc',
    'suporte'  => 'suporte',   /* v1.14.0: central de ajuda */
    'contratos'=> 'contratos', /* v1.15.0: CRM › Contratos */
    'notificacoes' => 'notificacoes', /* v1.19.0: sino e push */
    'assistente'   => 'assistente',   /* v1.20.0: Assistente de IA */
    'fin'          => 'financeiro',   /* v1.22.0: ERP › Financeiro */
    'assinatura'   => 'assinatura',   /* v1.30.0: plano e cobrança da empresa */
]);
