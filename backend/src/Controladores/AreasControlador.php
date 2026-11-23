<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Auditoria, Db, HttpErro, Requisicao, Resposta, Sessao, Validar};

/**
 * v1.7.0 — Áreas de atendimento (Civil, Elétrica, Compras…).
 * As pessoas entram nas áreas pelo cadastro de usuário; aqui se cria, renomeia e desativa a área.
 */
final class AreasControlador
{
    /** Lista para a triagem e para a administração, com os membros de cada área. */
    public static function listar(Requisicao $r): array
    {
        if (!Acesso::tem('chamados.ver') && !Acesso::tem('admin.areas')) throw HttpErro::proibido();
        $t = Sessao::tenantId();
        $todas = Acesso::tem('admin.areas') && ($r->query['todas'] ?? '') === '1';
        $membros = [];
        foreach (Db::all('SELECT am.area_id, u.id, u.nome FROM areas_membros am JOIN usuarios u ON u.id = am.usuario_id
                           WHERE am.tenant_id = ? AND u.ativo = 1 ORDER BY u.nome', [$t]) as $m) {
            $membros[(int) $m['area_id']][] = ['id' => (int) $m['id'], 'nome' => $m['nome']];
        }
        return array_map(fn($a) => self::tipar($a) + ['membros' => $membros[(int) $a['id']] ?? []],
            Db::all('SELECT * FROM areas WHERE tenant_id = ?' . ($todas ? '' : ' AND ativo = 1') . ' ORDER BY ativo DESC, ordem, nome', [$t]));
    }

    public static function criar(Requisicao $r): never
    {
        Acesso::exigir('admin.areas');
        $t = Sessao::tenantId();
        $d = self::validar($t, $r->corpo);
        $ordem = (int) Db::one('SELECT COALESCE(MAX(ordem), 0) + 1 n FROM areas WHERE tenant_id = ?', [$t])['n'];
        $id = Db::insert('INSERT INTO areas (tenant_id, nome, descricao, ordem) VALUES (?,?,?,?)', [$t, $d['nome'], $d['descricao'], $ordem]);
        Auditoria::registrar('criar', 'areas', $id, null, $d);
        Resposta::json(self::tipar(Db::one('SELECT * FROM areas WHERE id = ?', [$id])) + ['membros' => []], 201);
    }

    public static function editar(Requisicao $r, int $id): array
    {
        Acesso::exigir('admin.areas');
        $t = Sessao::tenantId();
        $antes = Db::one('SELECT * FROM areas WHERE tenant_id = ? AND id = ?', [$t, $id]);
        if (!$antes) throw HttpErro::naoEncontrado('Área');
        $d = self::validar($t, $r->corpo, $id);
        $ativo = array_key_exists('ativo', $r->corpo) ? (filter_var($r->corpo['ativo'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0) : (int) $antes['ativo'];
        Db::run('UPDATE areas SET nome = ?, descricao = ?, ativo = ? WHERE tenant_id = ? AND id = ?', [$d['nome'], $d['descricao'], $ativo, $t, $id]);
        Auditoria::registrar('editar', 'areas', $id, $antes, $d + ['ativo' => $ativo]);
        return self::tipar(Db::one('SELECT * FROM areas WHERE id = ?', [$id])) + ['membros' => []];
    }

    private static function validar(int $t, array $corpo, ?int $id = null): array
    {
        $v = (new Validar($corpo))->texto('nome', true, 80, 2)->texto('descricao', false, 255);
        if (is_string($corpo['nome'] ?? null) && Db::one('SELECT id FROM areas WHERE tenant_id = ? AND nome = ? AND id <> ?', [$t, trim($corpo['nome']), $id ?? 0])) {
            $v->erro('nome', 'Já existe uma área com este nome.');
        }
        return $v->ok();
    }

    private static function tipar(array $a): array
    {
        return ['id' => (int) $a['id'], 'nome' => $a['nome'], 'descricao' => $a['descricao'], 'ativo' => (bool) $a['ativo']];
    }
}
