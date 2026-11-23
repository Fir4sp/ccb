<?php
declare(strict_types=1);

/**
 * Cria uma organização (tenant) com configurações padrão, DML Central, grupos e o primeiro administrador.
 *
 * php bin/criar_tenant.php --nome="Administração Regional" --slug=regional \
 *     --admin-nome="Fulano" --admin-email=fulano@exemplo.org --admin-senha='SenhaForte1' [--grupos="8.1,8.2,8.3,8.4"]
 */

require __DIR__ . '/../src/bootstrap.php';
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$o = getopt('', ['nome:', 'slug:', 'admin-nome:', 'admin-email:', 'admin-senha:', 'grupos::']);
foreach (['nome', 'slug', 'admin-nome', 'admin-email', 'admin-senha'] as $obrig) {
    if (empty($o[$obrig])) { fwrite(STDERR, "Falta --$obrig\n"); exit(1); }
}
try {
    $id = Ccb\Instalacao::criarTenant($o['nome'], $o['slug'], $o['admin-nome'], $o['admin-email'], $o['admin-senha'], explode(',', $o['grupos'] ?? ''));
    echo "Organização criada (id $id). O administrador troca a senha no primeiro acesso.\n";
} catch (InvalidArgumentException $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
