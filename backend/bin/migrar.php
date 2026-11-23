<?php
declare(strict_types=1);

/**
 * Aplica as migrações pendentes e sincroniza o catálogo de perfis/permissões.
 * Uso:  php bin/migrar.php   (pode rodar várias vezes: só aplica o que falta)
 */

require __DIR__ . '/../src/bootstrap.php';
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

foreach (Ccb\Instalacao::migrar() as $nome) echo "Aplicado: $nome\n";
echo "Banco atualizado; catálogo de perfis e permissões sincronizado.\n";
