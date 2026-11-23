<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Auditoria, Catalogo, Db, HttpErro, Requisicao, Resposta, Sessao, Validar};

final class UsuariosControlador
{
    public static function perfis(Requisicao $r): array
    {
        Acesso::exigir('admin.usuarios');
        return array_map(
            fn($p) => ['codigo' => $p['codigo'], 'nome' => $p['nome'], 'escopo' => $p['escopo'], 'descricao' => $p['descricao']],
            Db::all('SELECT codigo, nome, escopo, descricao FROM perfis ORDER BY id')
        );
    }

    public static function listar(Requisicao $r): array
    {
        Acesso::exigir('admin.usuarios');
        $t = Sessao::tenantId();
        $sql = 'SELECT u.id, u.nome, u.email, u.telefone, u.ativo, u.ultimo_login_em,
                       GROUP_CONCAT(DISTINCT p.nome ORDER BY p.id SEPARATOR ", ") AS perfis,
                       (SELECT GROUP_CONCAT(a.nome ORDER BY a.ordem SEPARATOR ", ") FROM areas_membros am JOIN areas a ON a.id = am.area_id WHERE am.usuario_id = u.id) AS areas
                  FROM usuarios u
             LEFT JOIN usuarios_perfis up ON up.usuario_id = u.id
             LEFT JOIN perfis p ON p.id = up.perfil_id
                 WHERE u.tenant_id = ?';
        $p = [$t];
        if (!empty($r->query['busca']) && is_string($r->query['busca'])) {
            $sql .= ' AND (u.nome LIKE ? OR u.email LIKE ?)';
            $b = '%' . addcslashes(mb_substr($r->query['busca'], 0, 60), '%_\\') . '%';
            array_push($p, $b, $b);
        }
        if (!empty($r->query['casa_id']) && ctype_digit((string) $r->query['casa_id'])) {
            $sql .= ' AND u.id IN (SELECT usuario_id FROM usuarios_casas WHERE tenant_id = ? AND casa_id = ?)';
            array_push($p, $t, (int) $r->query['casa_id']);
        }
        $linhas = Db::all($sql . ' GROUP BY u.id ORDER BY u.nome', $p);
        return array_map(function ($u) {
            $u['id'] = (int) $u['id'];
            $u['ativo'] = (bool) $u['ativo'];
            return $u;
        }, $linhas);
    }

    public static function ver(Requisicao $r, int $id): array
    {
        Acesso::exigir('admin.usuarios');
        return self::carregar(Sessao::tenantId(), $id);
    }

    public static function criar(Requisicao $r): never
    {
        Acesso::exigir('admin.usuarios');
        $t = Sessao::tenantId();
        $d = (new Validar($r->corpo))->texto('nome', true, 150, 3)->email('email')->texto('telefone', false, 20)->senha('senha')->ok();
        if (Db::one('SELECT id FROM usuarios WHERE email = ?', [$d['email']])) {
            throw HttpErro::invalido(['email' => 'Este e-mail já está cadastrado.']);
        }
        $v = self::validarVinculos($r->corpo, $t);
        $id = Db::transacao(function () use ($t, $d, $v) {
            $id = Db::insert(
                'INSERT INTO usuarios (tenant_id, nome, email, telefone, senha_hash, trocar_senha) VALUES (?,?,?,?,?,1)',
                [$t, $d['nome'], $d['email'], $d['telefone'], Sessao::hash($d['senha'])]
            );
            self::gravarVinculos($t, $id, $v);
            return $id;
        });
        $novo = self::carregar($t, $id);
        Auditoria::registrar('criar', 'usuarios', $id, null, $novo);
        Resposta::json($novo, 201);
    }

    public static function editar(Requisicao $r, int $id): array
    {
        Acesso::exigir('admin.usuarios');
        $t = Sessao::tenantId();
        $antes = self::carregar($t, $id);
        $d = (new Validar($r->corpo))->texto('nome', true, 150, 3)->email('email')->texto('telefone', false, 20)
            ->booleano('ativo', $antes['ativo'])->ok();
        if (Db::one('SELECT id FROM usuarios WHERE email = ? AND id <> ?', [$d['email'], $id])) {
            throw HttpErro::invalido(['email' => 'Este e-mail já está cadastrado.']);
        }
        $v = self::validarVinculos($r->corpo, $t);
        if ($id === Sessao::usuario()['id']) {
            if (!$d['ativo']) throw HttpErro::invalido(['ativo' => 'Você não pode desativar o próprio acesso.']);
            if (!in_array('administrador', array_column($v['perfis'], 'codigo'), true)) {
                throw HttpErro::invalido(['perfis' => 'Você não pode remover o próprio perfil de Administrador.']);
            }
        }
        Db::transacao(function () use ($t, $id, $d, $v) {
            Db::run('UPDATE usuarios SET nome = ?, email = ?, telefone = ?, ativo = ? WHERE tenant_id = ? AND id = ?',
                [$d['nome'], $d['email'], $d['telefone'], $d['ativo'], $t, $id]);
            Db::run('DELETE FROM usuarios_perfis WHERE tenant_id = ? AND usuario_id = ?', [$t, $id]);
            Db::run('DELETE FROM usuarios_casas WHERE tenant_id = ? AND usuario_id = ?', [$t, $id]);
            Db::run('DELETE FROM orientadoras_casas WHERE tenant_id = ? AND usuario_id = ?', [$t, $id]);
            Db::run('DELETE FROM areas_membros WHERE tenant_id = ? AND usuario_id = ?', [$t, $id]);
            self::gravarVinculos($t, $id, $v);
        });
        Acesso::limparCache();
        $depois = self::carregar($t, $id);
        Auditoria::registrar('editar', 'usuarios', $id, $antes, $depois);
        return $depois;
    }

    /** Administrador define uma senha provisória; o usuário troca no próximo acesso. */
    public static function redefinirSenha(Requisicao $r, int $id): array
    {
        Acesso::exigir('admin.usuarios');
        $t = Sessao::tenantId();
        self::carregar($t, $id);
        $d = (new Validar($r->corpo))->senha('senha')->ok();
        Db::run('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE tenant_id = ? AND id = ?', [Sessao::hash($d['senha']), $t, $id]);
        Auditoria::registrar('redefinir_senha', 'usuarios', $id, null, null);
        return ['ok' => true];
    }

    /**
     * Exclui o usuário de vez. Só é possível enquanto ele não tem histórico
     * (chamados, OS, pedidos, gastos...). Com histórico, o caminho é desativar o acesso.
     */
    public static function excluir(Requisicao $r, int $id): array
    {
        Acesso::exigir('admin.usuarios');
        $t = Sessao::tenantId();
        $antes = self::carregar($t, $id);
        if ($id === Sessao::usuario()['id']) {
            throw new HttpErro(422, 'Você não pode excluir o próprio usuário.');
        }
        if (in_array('administrador', array_column($antes['perfis'], 'perfil'), true)) {
            $outros = (int) Db::one(
                'SELECT COUNT(DISTINCT u.id) n FROM usuarios u
                   JOIN usuarios_perfis up ON up.tenant_id = u.tenant_id AND up.usuario_id = u.id
                   JOIN perfis p ON p.id = up.perfil_id
                  WHERE u.tenant_id = ? AND u.id <> ? AND u.ativo = 1 AND p.codigo = ?',
                [$t, $id, 'administrador']
            )['n'];
            if ($outros === 0) throw new HttpErro(422, 'Este é o único administrador ativo. Defina outro administrador antes de excluir.');
        }
        try {
            Db::transacao(function () use ($t, $id) {
                Db::run('DELETE FROM usuarios_perfis WHERE tenant_id = ? AND usuario_id = ?', [$t, $id]);
                Db::run('DELETE FROM usuarios_casas WHERE tenant_id = ? AND usuario_id = ?', [$t, $id]);
                Db::run('DELETE FROM orientadoras_casas WHERE tenant_id = ? AND usuario_id = ?', [$t, $id]);
                Db::run('DELETE FROM areas_membros WHERE tenant_id = ? AND usuario_id = ?', [$t, $id]);
                Db::run('DELETE FROM usuarios WHERE tenant_id = ? AND id = ?', [$t, $id]);
            });
        } catch (\PDOException $e) {
            // 1451: o usuário aparece em registros do sistema (chave estrangeira).
            if ((int) ($e->errorInfo[1] ?? 0) === 1451) {
                throw new HttpErro(409, 'Este usuário já tem histórico no sistema (chamados, ordens de serviço, pedidos ou estoque) e não pode ser excluído. Desmarque "Acesso ativo" para bloquear a entrada dele.');
            }
            throw $e;
        }
        Acesso::limparCache();
        Auditoria::registrar('excluir', 'usuarios', $id, $antes, null);
        return ['ok' => true];
    }

    // ---------------------------------------------------------------- vínculos

    /**
     * Regras:
     * - ao menos um perfil;
     * - perfil de escopo "grupo" exige grupo do mesmo tenant; os demais não aceitam grupo;
     * - perfil Casa de Oração exige ao menos uma casa (com função); casas só existem com esse perfil;
     * - Orientadora CNS é por grupo (escopo "grupo"), como a Coordenação de Manutenção.
     */
    private static function validarVinculos(array $corpo, int $t): array
    {
        $erros = [];
        $perfisEntrada = is_array($corpo['perfis'] ?? null) ? $corpo['perfis'] : [];
        $perfis = [];
        foreach ($perfisEntrada as $i => $p) {
            $codigo = is_array($p) ? ($p['perfil'] ?? null) : $p;
            $grupo = is_array($p) && isset($p['grupo_id']) && $p['grupo_id'] !== '' ? $p['grupo_id'] : null;
            if (!is_string($codigo) || !isset(Catalogo::PERFIS[$codigo])) { $erros["perfis.$i"] = 'Perfil inválido.'; continue; }
            $escopo = Catalogo::PERFIS[$codigo][1];
            if ($escopo === 'grupo') {
                if (!ctype_digit((string) $grupo) || !Db::one('SELECT id FROM grupos WHERE tenant_id = ? AND id = ?', [$t, (int) $grupo])) {
                    $erros["perfis.$i"] = 'Escolha o grupo deste perfil.';
                    continue;
                }
                $grupo = (int) $grupo;
            } else {
                $grupo = null;
            }
            $perfis[$codigo . ':' . ($grupo ?? 0)] = ['codigo' => $codigo, 'grupo_id' => $grupo];
        }
        // Áreas de atendimento: quem é de uma área já trabalha nos chamados dela, mesmo sem perfil.
        $areas = [];
        foreach ((is_array($corpo['areas'] ?? null) ? $corpo['areas'] : []) as $i => $areaId) {
            if (!ctype_digit((string) $areaId) || !Db::one('SELECT id FROM areas WHERE tenant_id = ? AND id = ?', [$t, (int) $areaId])) {
                $erros["areas.$i"] = 'Área inválida.'; continue;
            }
            $areas[(int) $areaId] = true;
        }
        if (!$perfis && !$areas && !$erros) $erros['perfis'] = 'Escolha ao menos um perfil ou uma área.';
        $codigos = array_column($perfis, 'codigo');

        $casas = [];
        $casasEntrada = is_array($corpo['casas'] ?? null) ? $corpo['casas'] : [];
        foreach ($casasEntrada as $i => $c) {
            $casaId = is_array($c) ? ($c['casa_id'] ?? null) : null;
            $funcao = is_array($c) ? ($c['funcao'] ?? null) : null;
            if (!ctype_digit((string) $casaId) || !Db::one('SELECT id FROM casas_oracao WHERE tenant_id = ? AND id = ?', [$t, (int) $casaId])) {
                $erros["casas.$i"] = 'Casa inválida.'; continue;
            }
            if (!in_array($funcao, Catalogo::FUNCOES_CASA, true)) { $erros["casas.$i"] = 'Escolha a função na casa.'; continue; }
            $casas[(int) $casaId] = $funcao;
        }
        if (in_array('casa_oracao', $codigos, true) && !$casas) $erros['casas'] = 'Vincule o usuário a ao menos uma Casa de Oração.';
        if (!in_array('casa_oracao', $codigos, true) && $casas) $erros['casas'] = 'Vínculo com casa só vale para o perfil Casa de Oração.';

        if ($erros) throw HttpErro::invalido($erros);
        return ['perfis' => array_values($perfis), 'casas' => $casas, 'areas' => array_keys($areas)];
    }

    private static function gravarVinculos(int $t, int $usuarioId, array $v): void
    {
        foreach ($v['perfis'] as $p) {
            Db::run('INSERT INTO usuarios_perfis (tenant_id, usuario_id, perfil_id, grupo_id) SELECT ?, ?, id, ? FROM perfis WHERE codigo = ?',
                [$t, $usuarioId, $p['grupo_id'], $p['codigo']]);
        }
        foreach ($v['casas'] as $casaId => $funcao) {
            Db::run('INSERT INTO usuarios_casas (tenant_id, usuario_id, casa_id, funcao) VALUES (?,?,?,?)', [$t, $usuarioId, $casaId, $funcao]);
        }
        foreach ($v['areas'] as $areaId) {
            Db::run('INSERT INTO areas_membros (tenant_id, area_id, usuario_id) VALUES (?,?,?)', [$t, $areaId, $usuarioId]);
        }
    }

    private static function carregar(int $t, int $id): array
    {
        $u = Db::one('SELECT id, nome, email, telefone, ativo, trocar_senha, ultimo_login_em, criado_em FROM usuarios WHERE tenant_id = ? AND id = ?', [$t, $id]);
        if (!$u) throw HttpErro::naoEncontrado('Usuário');
        $u['id'] = (int) $u['id'];
        $u['ativo'] = (bool) $u['ativo'];
        $u['trocar_senha'] = (bool) $u['trocar_senha'];
        $u['perfis'] = array_map(
            fn($p) => ['perfil' => $p['codigo'], 'grupo_id' => $p['grupo_id'] === null ? null : (int) $p['grupo_id']],
            Db::all('SELECT p.codigo, up.grupo_id FROM usuarios_perfis up JOIN perfis p ON p.id = up.perfil_id WHERE up.tenant_id = ? AND up.usuario_id = ? ORDER BY p.id', [$t, $id])
        );
        $u['casas'] = array_map(
            fn($c) => ['casa_id' => (int) $c['casa_id'], 'funcao' => $c['funcao']],
            Db::all('SELECT casa_id, funcao FROM usuarios_casas WHERE tenant_id = ? AND usuario_id = ?', [$t, $id])
        );
        $u['areas'] = array_map('intval', array_column(
            Db::all('SELECT area_id FROM areas_membros WHERE tenant_id = ? AND usuario_id = ?', [$t, $id]), 'area_id'
        ));
        return $u;
    }
}
