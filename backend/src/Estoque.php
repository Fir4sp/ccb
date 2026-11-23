<?php
declare(strict_types=1);

namespace Ccb;

/**
 * Saldos e movimentos dos DMLs (Fase 6). Toda mudança de saldo passa por aqui:
 * a linha do saldo é travada, o saldo nunca fica negativo e cada mudança vira um movimento.
 */
final class Estoque
{
    public const ORIGENS = [
        'compra' => 'Chegada da compra', 'distribuicao' => 'Entrega do ciclo', 'inventario' => 'Contagem',
        'manual' => 'Lançamento manual', 'envio' => 'Envio avulso',
    ];

    public static function local(int $t, int $id): array
    {
        $l = Db::one('SELECT l.*, c.nome AS casa_nome, c.codigo AS casa_codigo, g.nome AS grupo
                        FROM locais_estoque l LEFT JOIN casas_oracao c ON c.id = l.casa_id LEFT JOIN grupos g ON g.id = c.grupo_id
                       WHERE l.tenant_id = ? AND l.id = ?', [$t, $id]);
        if (!$l) throw HttpErro::naoEncontrado('Estoque');
        return $l;
    }

    public static function central(int $t): array
    {
        $l = Db::one("SELECT * FROM locais_estoque WHERE tenant_id = ? AND tipo = 'central'", [$t]);
        if (!$l) throw new \RuntimeException('DML Central não encontrado.');
        return $l;
    }

    public static function localDaCasa(int $t, int $casaId): ?array
    {
        return Db::one("SELECT * FROM locais_estoque WHERE tenant_id = ? AND tipo = 'local' AND casa_id = ?", [$t, $casaId]);
    }

    /** Quem vê este DML: Central para quem trabalha com a limpeza; o da casa para quem vê a casa. */
    public static function podeVer(array $l): bool
    {
        if (!Acesso::tem('cns.ver')) return false;
        if ($l['tipo'] === 'central') return Acesso::tem('cns.gerir') || Acesso::tem('cns.compras') || Acesso::tem('cns.conferir');
        return Acesso::podeVerCasa((int) $l['casa_id']);
    }

    /** Quem conta (inventário): Central só a Coordenação CNS; o da casa também a orientadora do grupo. */
    public static function podeContar(array $l): bool
    {
        if (Acesso::tem('cns.gerir')) return true;
        if ($l['tipo'] !== 'local') return false;
        return in_array((int) $l['casa_id'], Acesso::casasDaOrientadora(), true);
    }

    /** Quantidade atual (sem travar). */
    public static function saldo(int $localId, int $produtoId): int
    {
        return (int) (Db::one('SELECT quantidade FROM estoque_saldos WHERE local_id = ? AND produto_id = ?', [$localId, $produtoId])['quantidade'] ?? 0);
    }

    /** Soma (ou tira, com $delta negativo) do saldo. Precisa estar dentro de uma transação. */
    public static function mover(int $t, int $localId, int $produtoId, int $delta, string $tipo, string $origem, array $refs = [], ?string $motivo = null): int
    {
        if ($delta === 0) return self::saldo($localId, $produtoId);
        Db::run('INSERT IGNORE INTO estoque_saldos (tenant_id, local_id, produto_id, quantidade) VALUES (?,?,?,0)', [$t, $localId, $produtoId]);
        $atual = (int) Db::one('SELECT quantidade FROM estoque_saldos WHERE local_id = ? AND produto_id = ? FOR UPDATE', [$localId, $produtoId])['quantidade'];
        $novo = $atual + $delta;
        if ($novo < 0) {
            $nome = Db::one('SELECT nome FROM cns_produtos WHERE id = ?', [$produtoId])['nome'] ?? 'produto';
            throw HttpErro::invalido(['quantidade' => "$nome: só há $atual no estoque."]);
        }
        Db::run('UPDATE estoque_saldos SET quantidade = ? WHERE local_id = ? AND produto_id = ?', [$novo, $localId, $produtoId]);
        self::registrar($t, $localId, $produtoId, $tipo, $origem, $delta, $novo, $refs, $motivo);
        return $novo;
    }

    /** Contagem: o saldo passa a ser o que foi contado. Devolve a diferença. */
    public static function contar(int $t, int $localId, int $produtoId, int $contado, int $inventarioId): int
    {
        Db::run('INSERT IGNORE INTO estoque_saldos (tenant_id, local_id, produto_id, quantidade) VALUES (?,?,?,0)', [$t, $localId, $produtoId]);
        $atual = (int) Db::one('SELECT quantidade FROM estoque_saldos WHERE local_id = ? AND produto_id = ? FOR UPDATE', [$localId, $produtoId])['quantidade'];
        Db::run('UPDATE estoque_saldos SET quantidade = ?, contado_em = NOW() WHERE local_id = ? AND produto_id = ?', [$contado, $localId, $produtoId]);
        if ($contado !== $atual) {
            self::registrar($t, $localId, $produtoId, 'inventario', 'inventario', $contado - $atual, $contado, ['inventario_id' => $inventarioId], null);
        }
        return $contado - $atual;
    }

    private static function registrar(int $t, int $localId, int $produtoId, string $tipo, string $origem, int $delta, int $saldo, array $refs, ?string $motivo): void
    {
        Db::run('INSERT INTO estoque_movimentos (tenant_id, local_id, produto_id, tipo, origem, quantidade, saldo_apos, ciclo_id, inventario_id, outro_local_id, motivo, usuario_id)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [$t, $localId, $produtoId, $tipo, $origem, $delta, $saldo, $refs['ciclo_id'] ?? null, $refs['inventario_id'] ?? null, $refs['outro_local_id'] ?? null,
             $motivo !== null ? mb_substr($motivo, 0, 300) : null, Sessao::usuario()['id']]);
    }
}
