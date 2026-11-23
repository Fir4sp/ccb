<?php
declare(strict_types=1);

/**
 * Popula uma organização de DEMONSTRAÇÃO com 32 casas e um usuário de cada perfil (somente ambiente de teste).
 * Uso: php bin/dados_exemplo.php --slug=demo --senha='Demo2026x'
 */

use Ccb\Db;

require __DIR__ . '/../src/bootstrap.php';
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$o = getopt('', ['slug:', 'senha:']);
if (empty($o['slug']) || empty($o['senha'])) { fwrite(STDERR, "Uso: --slug=... --senha=...\n"); exit(1); }
$t = Db::one('SELECT id FROM tenants WHERE slug = ?', [$o['slug']]);
if (!$t) { fwrite(STDERR, "Organização não encontrada\n"); exit(1); }
try {
    Ccb\Instalacao::dadosExemplo((int) $t['id'], $o['senha']);
    echo "32 casas e 11 usuários de demonstração criados (e-mails @demo.ccb, mesma senha).\n";
} catch (RuntimeException $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
