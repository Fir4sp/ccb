<?php
declare(strict_types=1);

namespace Ccb;

final class Auditoria
{
    /** Campos que nunca vão para a auditoria. */
    private const OCULTAR = ['senha_hash', 'senha', 'senha_atual', 'nova_senha'];

    public static function registrar(
        string $acao,
        string $entidade,
        ?int $entidadeId,
        ?array $antes,
        ?array $depois,
        ?string $ip = null,
        ?int $tenantId = null,
        ?int $usuarioId = null,
    ): void {
        if ($usuarioId === null && isset($_SESSION['usuario_id'])) {
            $u = Sessao::usuario();
            $usuarioId = $u['id'];
            $tenantId ??= $u['tenant_id'];
        }
        Db::run(
            'INSERT INTO auditoria (tenant_id, usuario_id, acao, entidade, entidade_id, antes, depois, ip) VALUES (?,?,?,?,?,?,?,?)',
            [$tenantId, $usuarioId, $acao, $entidade, $entidadeId, self::json($antes), self::json($depois), $ip ?? ($_SERVER['REMOTE_ADDR'] ?? null)]
        );
    }

    private static function json(?array $d): ?string
    {
        if ($d === null) return null;
        foreach (self::OCULTAR as $k) unset($d[$k]);
        return json_encode($d, JSON_UNESCAPED_UNICODE);
    }
}
