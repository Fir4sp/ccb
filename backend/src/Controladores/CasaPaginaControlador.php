<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Anexos, Auditoria, Db, HttpErro, Requisicao, Sessao, Validar};

/** Página da Casa de Oração (v1.1.0): ministério e fotos. Quem edita: quem administra as casas. */
final class CasaPaginaControlador
{
    // ---------------------------------------------------------------- Ministério

    public static function ministerio(int $t, int $casaId): array
    {
        return array_map(fn($m) => [
            'id' => (int) $m['id'], 'cargo' => $m['cargo'], 'nome' => $m['nome'], 'telefone' => $m['telefone'], 'ordem' => (int) $m['ordem'],
        ], Db::all('SELECT id, cargo, nome, telefone, ordem FROM casas_ministerio WHERE tenant_id = ? AND casa_id = ? ORDER BY ordem, id', [$t, $casaId]));
    }

    public static function criarMinistro(Requisicao $r, int $id): array
    {
        $t = self::podeEditar($id);
        $d = self::validarMinistro($r->corpo);
        $ordem = (int) Db::one('SELECT COALESCE(MAX(ordem), 0) + 1 n FROM casas_ministerio WHERE tenant_id = ? AND casa_id = ?', [$t, $id])['n'];
        $mid = Db::insert('INSERT INTO casas_ministerio (tenant_id, casa_id, cargo, nome, telefone, ordem) VALUES (?,?,?,?,?,?)',
            [$t, $id, $d['cargo'], $d['nome'], $d['telefone'], $ordem]);
        Auditoria::registrar('criar', 'casas_ministerio', $mid, null, $d + ['casa_id' => $id]);
        return self::ministerio($t, $id);
    }

    public static function editarMinistro(Requisicao $r, int $id, int $mid): array
    {
        $t = self::podeEditar($id);
        $antes = self::ministro($t, $id, $mid);
        $d = self::validarMinistro($r->corpo);
        Db::run('UPDATE casas_ministerio SET cargo = ?, nome = ?, telefone = ? WHERE tenant_id = ? AND casa_id = ? AND id = ?',
            [$d['cargo'], $d['nome'], $d['telefone'], $t, $id, $mid]);
        Auditoria::registrar('editar', 'casas_ministerio', $mid, $antes, $d);
        return self::ministerio($t, $id);
    }

    public static function excluirMinistro(Requisicao $r, int $id, int $mid): array
    {
        $t = self::podeEditar($id);
        $antes = self::ministro($t, $id, $mid);
        Db::run('DELETE FROM casas_ministerio WHERE tenant_id = ? AND casa_id = ? AND id = ?', [$t, $id, $mid]);
        Auditoria::registrar('excluir', 'casas_ministerio', $mid, $antes, null);
        return self::ministerio($t, $id);
    }

    public static function ordenarMinisterio(Requisicao $r, int $id): array
    {
        $t = self::podeEditar($id);
        $ordem = is_array($r->corpo['ordem'] ?? null) ? array_values($r->corpo['ordem']) : [];
        $atuais = array_column(self::ministerio($t, $id), 'id');
        $ids = array_map('intval', $ordem);
        if (count($ids) !== count($atuais) || array_diff($ids, $atuais) || array_diff($atuais, $ids)) {
            throw HttpErro::invalido(['ordem' => 'A lista mudou. Atualize a página.']);
        }
        Db::transacao(function () use ($t, $id, $ids) {
            foreach ($ids as $i => $mid) {
                Db::run('UPDATE casas_ministerio SET ordem = ? WHERE tenant_id = ? AND casa_id = ? AND id = ?', [$i + 1, $t, $id, $mid]);
            }
        });
        return self::ministerio($t, $id);
    }

    private static function validarMinistro(array $corpo): array
    {
        $v = (new Validar($corpo))->texto('cargo', true, 80)->texto('nome', true, 150)->texto('telefone', false, 20);
        $tel = $corpo['telefone'] ?? '';
        if (is_string($tel) && trim($tel) !== '' && !preg_match('/^[\d\s()+-]{8,20}$/', trim($tel))) {
            $v->erro('telefone', 'Telefone inválido.');
        }
        return $v->ok();
    }

    private static function ministro(int $t, int $casaId, int $mid): array
    {
        $m = Db::one('SELECT id, cargo, nome, telefone FROM casas_ministerio WHERE tenant_id = ? AND casa_id = ? AND id = ?', [$t, $casaId, $mid]);
        if (!$m) throw HttpErro::naoEncontrado('Registro');
        return $m;
    }

    // ---------------------------------------------------------------- Fotos

    public static function fotos(int $t, int $casaId): array
    {
        return array_map(fn($a) => [
            'id' => $a['id'], 'url' => $a['url'], 'mini_url' => $a['mini_url'], 'legenda' => $a['legenda'],
            'capa' => $a['capa'], 'largura' => $a['largura'], 'altura' => $a['altura'],
        ], Anexos::listar($t, 'casa', $casaId, ['foto_casa']));
    }

    public static function enviarFoto(Requisicao $r, int $id): array
    {
        $t = self::podeEditar($id);
        $a = Anexos::salvar($t, 'casa', $id, 'foto_casa', $r->corpo['arquivo'] ?? null, is_string($r->corpo['nome'] ?? null) ? $r->corpo['nome'] : null);
        // A primeira foto vira a capa.
        if (!Db::one("SELECT id FROM anexos WHERE tenant_id = ? AND dono_tipo = 'casa' AND dono_id = ? AND categoria = 'foto_casa' AND capa = 1 AND excluido_em IS NULL", [$t, $id])) {
            Db::run('UPDATE anexos SET capa = 1 WHERE tenant_id = ? AND id = ?', [$t, $a['id']]);
        }
        Auditoria::registrar('enviar_foto', 'casas_oracao', $id, null, ['anexo_id' => (int) $a['id']]);
        return self::fotos($t, $id);
    }

    public static function editarFoto(Requisicao $r, int $id, int $fid): array
    {
        $t = self::podeEditar($id);
        self::foto($t, $id, $fid);
        if (array_key_exists('legenda', $r->corpo)) {
            $d = (new Validar($r->corpo))->texto('legenda', false, 200)->ok();
            Db::run('UPDATE anexos SET legenda = ? WHERE tenant_id = ? AND id = ?', [$d['legenda'], $t, $fid]);
        }
        if (($r->corpo['capa'] ?? false) === true) {
            Db::transacao(function () use ($t, $id, $fid) {
                Db::run("UPDATE anexos SET capa = 0 WHERE tenant_id = ? AND dono_tipo = 'casa' AND dono_id = ?", [$t, $id]);
                Db::run('UPDATE anexos SET capa = 1 WHERE tenant_id = ? AND id = ?', [$t, $fid]);
            });
        }
        return self::fotos($t, $id);
    }

    public static function excluirFoto(Requisicao $r, int $id, int $fid): array
    {
        $t = self::podeEditar($id);
        $f = self::foto($t, $id, $fid);
        Anexos::excluir($t, $fid);
        if ((int) $f['capa'] === 1) {
            $proxima = Db::one("SELECT id FROM anexos WHERE tenant_id = ? AND dono_tipo = 'casa' AND dono_id = ? AND categoria = 'foto_casa' AND excluido_em IS NULL ORDER BY ordem, id LIMIT 1", [$t, $id]);
            if ($proxima) Db::run('UPDATE anexos SET capa = 1 WHERE id = ?', [$proxima['id']]);
        }
        Auditoria::registrar('excluir_foto', 'casas_oracao', $id, ['anexo_id' => $fid], null);
        return self::fotos($t, $id);
    }

    private static function foto(int $t, int $casaId, int $fid): array
    {
        $f = Db::one("SELECT * FROM anexos WHERE tenant_id = ? AND id = ? AND dono_tipo = 'casa' AND dono_id = ? AND categoria = 'foto_casa' AND excluido_em IS NULL", [$t, $fid, $casaId]);
        if (!$f) throw HttpErro::naoEncontrado('Foto');
        return $f;
    }

    // ---------------------------------------------------------------- util

    public static function podeEditarCasa(): bool
    {
        return Acesso::tem('admin.casas');
    }

    /** Fora do escopo responde 404; sem permissão de edição, 403. Devolve o tenant. */
    private static function podeEditar(int $casaId): int
    {
        $t = Sessao::tenantId();
        if (!Acesso::podeVerCasa($casaId)) throw HttpErro::naoEncontrado('Casa de Oração');
        if (!self::podeEditarCasa()) throw HttpErro::proibido();
        return $t;
    }
}
