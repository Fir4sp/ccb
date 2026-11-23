<?php
// Copie este arquivo para config.local.php e preencha com os dados do banco criado na Hostinger.
// NUNCA envie o config.local.php para lugares públicos.
return [
    'ambiente' => 'producao',   // 'producao' exige HTTPS (cookie seguro)
    'db' => [
        'host'    => 'localhost',
        'port'    => 3306,
        'nome'    => 'u000000000_ccb',
        'usuario' => 'u000000000_ccb',
        'senha'   => 'troque-por-uma-senha-forte',
    ],
];
