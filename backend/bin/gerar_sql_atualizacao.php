<?php
declare(strict_types=1);
/**
 * Gera o SQL de atualização para rodar no phpMyAdmin (a hospedagem não tem terminal).
 * Uso: php bin/gerar_sql_atualizacao.php 003_chamados.sql > 03_chamados.sql
 */
require __DIR__ . '/../src/Catalogo.php';
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
use Ccb\Catalogo;

$arq = $argv[1] ?? '';
$caminho = __DIR__ . '/../database/migrations/' . basename($arq);
if (!is_file($caminho)) { fwrite(STDERR, "Migração não encontrada\n"); exit(1); }
$q = fn(string $s) => "'" . str_replace(["\\", "'"], ["\\\\", "''"], $s) . "'";

echo "-- Sistema CCB — atualização para o phpMyAdmin (aba Importar)\n";
echo "-- Gerado de database/migrations/" . basename($arq) . ". Rode uma vez só.\n\n";
echo "SET NAMES utf8mb4;\nSTART TRANSACTION;\n\n";
echo file_get_contents($caminho), "\n";
echo "-- Catálogo de perfis e permissões\n";
foreach (Catalogo::PERMISSOES as $c => [$m, $d]) {
    echo "INSERT INTO permissoes (codigo, modulo, descricao) VALUES ({$q($c)}, {$q($m)}, {$q($d)}) ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);\n";
}
echo "DELETE FROM perfis_permissoes;\n";
foreach (array_keys(Catalogo::PERFIS) as $p) {
    foreach (Catalogo::permissoesDoPerfil($p) as $perm) {
        echo "INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = {$q($p)} AND m.codigo = {$q($perm)};\n";
    }
}
echo "\nINSERT INTO migracoes (arquivo) VALUES ({$q(basename($arq))});\nCOMMIT;\n";
