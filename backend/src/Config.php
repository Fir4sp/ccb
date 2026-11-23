<?php
declare(strict_types=1);

namespace Ccb;

/**
 * Configuração lida de config/config.local.php (não versionado).
 * Variáveis de ambiente CCB_* têm prioridade (usado nos testes).
 */
final class Config
{
    private static ?array $dados = null;

    public static function get(string $chave, mixed $padrao = null): mixed
    {
        if (self::$dados === null) {
            $arquivo = __DIR__ . '/../config/config.local.php';
            $base = is_file($arquivo) ? require $arquivo : [];
            $env = static fn(string $k, $d) => getenv($k) !== false ? getenv($k) : $d;
            $base['db'] = [
                'host'    => $env('CCB_DB_HOST', $base['db']['host'] ?? 'localhost'),
                'port'    => (int) $env('CCB_DB_PORT', $base['db']['port'] ?? 3306),
                'nome'    => $env('CCB_DB_NOME', $base['db']['nome'] ?? ''),
                'usuario' => $env('CCB_DB_USUARIO', $base['db']['usuario'] ?? ''),
                'senha'   => $env('CCB_DB_SENHA', $base['db']['senha'] ?? ''),
            ];
            $base['ambiente'] = $env('CCB_AMBIENTE', $base['ambiente'] ?? 'producao');
            $base['cookie_seguro'] = $base['ambiente'] === 'producao';
            $base['origens_permitidas'] = $base['origens_permitidas'] ?? [];
            self::$dados = $base;
        }
        return self::$dados[$chave] ?? $padrao;
    }
}
