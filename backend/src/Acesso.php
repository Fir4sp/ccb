<?php
declare(strict_types=1);

namespace Ccb;

/**
 * Controle de acesso: perfis (RBAC) + escopo organizacional.
 * Toda checagem acontece aqui, no servidor.
 */
final class Acesso
{
    private static ?array $cache = null;

    /** Perfis, permissões e grupos de escopo do usuário logado. */
    public static function contexto(): array
    {
        if (self::$cache !== null) return self::$cache;
        $u = Sessao::usuario();
        if ($u['tenant_id'] === null) {
            return self::$cache = ['perfis' => [], 'permissoes' => [], 'grupos' => [], 'grupos_perfil' => [], 'areas' => [], 'escopo_tenant' => false];
        }
        $linhas = Db::all(
            'SELECT p.codigo, p.escopo, up.grupo_id
               FROM usuarios_perfis up JOIN perfis p ON p.id = up.perfil_id
              WHERE up.usuario_id = ? AND up.tenant_id = ?',
            [$u['id'], $u['tenant_id']]
        );
        $perfis = array_values(array_unique(array_column($linhas, 'codigo')));
        $permissoes = [];
        foreach ($perfis as $p) {
            $permissoes = array_merge($permissoes, Catalogo::permissoesDoPerfil($p));
        }
        // Áreas de atendimento: quem é de uma área vê e trabalha nos chamados encaminhados a ela.
        $areas = array_map('intval', array_column(Db::all(
            'SELECT am.area_id FROM areas_membros am JOIN areas a ON a.id = am.area_id WHERE am.tenant_id = ? AND am.usuario_id = ? AND a.ativo = 1',
            [$u['tenant_id'], $u['id']]), 'area_id'));
        if ($areas) $permissoes = array_merge($permissoes, ['chamados.ver', 'chamados.orcar', 'chamados.executar']);
        $grupos = [];
        $gruposPerfil = [];
        $escopoTenant = false;
        foreach ($linhas as $l) {
            if ($l['escopo'] === 'tenant') $escopoTenant = true;
            if ($l['escopo'] === 'grupo' && $l['grupo_id']) {
                $grupos[] = (int) $l['grupo_id'];
                $gruposPerfil[$l['codigo']][] = (int) $l['grupo_id'];
            }
        }
        return self::$cache = [
            'perfis'        => $perfis,
            'permissoes'    => array_values(array_unique($permissoes)),
            'grupos'        => array_values(array_unique($grupos)),
            'grupos_perfil' => $gruposPerfil,
            'areas'         => $areas,
            'escopo_tenant' => $escopoTenant,
        ];
    }

    public static function tem(string $permissao): bool
    {
        return in_array($permissao, self::contexto()['permissoes'], true);
    }

    public static function exigir(string $permissao): void
    {
        if (!self::tem($permissao)) throw HttpErro::proibido();
    }

    public static function temPerfil(string $perfil): bool
    {
        return in_array($perfil, self::contexto()['perfis'], true);
    }

    /**
     * IDs das casas que o usuário pode ver, somando todos os seus perfis:
     * escopo tenant → todas; grupo → casas dos grupos (inclui a orientadora do grupo); casa → casas vinculadas.
     */
    public static function casasVisiveis(): array
    {
        $u = Sessao::usuario();
        $t = Sessao::tenantId();
        $ctx = self::contexto();
        if ($ctx['escopo_tenant']) {
            return array_map('intval', array_column(Db::all('SELECT id FROM casas_oracao WHERE tenant_id = ?', [$t]), 'id'));
        }
        $ids = [];
        if ($ctx['grupos']) {
            $ids = array_merge($ids, array_column(Db::all(
                'SELECT id FROM casas_oracao WHERE tenant_id = ? AND grupo_id IN ' . Db::in($ctx['grupos']),
                array_merge([$t], $ctx['grupos'])
            ), 'id'));
        }
        if (self::temPerfil('casa_oracao')) {
            $ids = array_merge($ids, array_column(Db::all(
                'SELECT casa_id AS id FROM usuarios_casas WHERE tenant_id = ? AND usuario_id = ?', [$t, $u['id']]
            ), 'id'));
        }
        return array_values(array_unique(array_map('intval', $ids)));
    }

    /** Grupos em que o usuário tem este perfil (perfis de escopo "grupo"). */
    public static function gruposDoPerfil(string $perfil): array
    {
        return self::contexto()['grupos_perfil'][$perfil] ?? [];
    }

    /** Casas dos grupos em que o usuário é Orientadora CNS. */
    public static function casasDaOrientadora(): array
    {
        $g = self::gruposDoPerfil('orientadora_cns');
        if (!$g) return [];
        return array_map('intval', array_column(Db::all('SELECT id FROM casas_oracao WHERE tenant_id = ? AND grupo_id IN ' . Db::in($g),
            array_merge([Sessao::tenantId()], $g)), 'id'));
    }

    /** Áreas do usuário logado. */
    public static function areas(): array
    {
        return self::contexto()['areas'];
    }

    public static function ehDaArea(?int $areaId): bool
    {
        return $areaId !== null && in_array($areaId, self::areas(), true);
    }

    public static function podeVerCasa(int $casaId): bool
    {
        return in_array($casaId, self::casasVisiveis(), true);
    }

    public static function limparCache(): void
    {
        self::$cache = null;
    }
}
