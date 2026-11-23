<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Anexos, Auditoria, Db, HttpErro, Requisicao, Sessao, Validar};

/**
 * v1.10.0 — Relatório de visita do CNS Limpeza.
 * Checklist: a Coordenação CNS (cns.gerir) cria, edita, reordena e desativa os itens.
 * Visita: quem tem cns.visitas (orientadora do grupo e Coordenação CNS), só nas casas do próprio escopo.
 */
final class VisitasControlador
{
    private const RESPOSTAS = ['ok', 'ajustar', 'na'];
    private const MAX_FOTOS = 30;

    // ================================================================ checklist

    public static function checklist(Requisicao $r): array
    {
        if (!Acesso::tem('cns.visitas') && !Acesso::tem('cns.gerir')) throw HttpErro::proibido();
        return self::itens(Acesso::tem('cns.gerir') && ($r->query['todos'] ?? '') === '1');
    }

    private static function itens(bool $todos): array
    {
        return array_map([self::class, 'itemPublico'], Db::all(
            'SELECT * FROM cns_checklist_itens WHERE tenant_id = ?' . ($todos ? '' : ' AND ativo = 1') . ' ORDER BY ordem, id',
            [Sessao::tenantId()]
        ));
    }

    public static function criarItem(Requisicao $r): array
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        $d = (new Validar($r->corpo))->texto('texto', true, 200, 2)->texto('secao', false, 80)->ok();
        $ordem = (int) Db::one('SELECT COALESCE(MAX(ordem), 0) + 1 n FROM cns_checklist_itens WHERE tenant_id = ?', [$t])['n'];
        $id = Db::insert('INSERT INTO cns_checklist_itens (tenant_id, secao, texto, ordem) VALUES (?,?,?,?)', [$t, $d['secao'], $d['texto'], $ordem]);
        Auditoria::registrar('criar', 'cns_checklist_itens', $id, null, $d);
        return self::itemPublico(self::item($t, $id));
    }

    public static function editarItem(Requisicao $r, int $id): array
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        $antes = self::item($t, $id);
        $d = (new Validar($r->corpo))->texto('texto', true, 200, 2)->texto('secao', false, 80)->booleano('ativo', (bool) $antes['ativo'])->ok();
        Db::run('UPDATE cns_checklist_itens SET texto = ?, secao = ?, ativo = ? WHERE tenant_id = ? AND id = ?', [$d['texto'], $d['secao'], $d['ativo'], $t, $id]);
        Auditoria::registrar('editar', 'cns_checklist_itens', $id, $antes, $d);
        return self::itemPublico(self::item($t, $id));
    }

    /** Recebe a lista de ids na ordem nova. */
    public static function ordenarItens(Requisicao $r): array
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        $ids = array_values(array_unique(array_map('intval', array_filter((new Validar($r->corpo))->lista('ids'), 'is_numeric'))));
        Db::transacao(function () use ($t, $ids) {
            foreach ($ids as $i => $id) Db::run('UPDATE cns_checklist_itens SET ordem = ? WHERE tenant_id = ? AND id = ?', [$i + 1, $t, $id]);
        });
        return self::itens(true);
    }

    private static function item(int $t, int $id): array
    {
        return Db::one('SELECT * FROM cns_checklist_itens WHERE tenant_id = ? AND id = ?', [$t, $id]) ?? throw HttpErro::naoEncontrado('Item');
    }

    private static function itemPublico(array $i): array
    {
        return ['id' => (int) $i['id'], 'secao' => $i['secao'], 'texto' => $i['texto'], 'ordem' => (int) $i['ordem'], 'ativo' => (bool) $i['ativo']];
    }

    // ================================================================ visitas

    /** Pode ver e fazer visitas nesta casa? */
    public static function podeVisitar(int $casaId): bool
    {
        return Acesso::tem('cns.visitas') && Acesso::podeVerCasa($casaId);
    }

    public static function listar(Requisicao $r): array
    {
        Acesso::exigir('cns.visitas');
        $t = Sessao::tenantId();
        $casas = Acesso::casasVisiveis();
        if (!empty($r->query['casa_id'])) $casas = array_values(array_intersect($casas, [(int) $r->query['casa_id']]));
        if (!$casas) return [];
        $linhas = Db::all(
            'SELECT v.*, c.nome casa_nome, c.codigo casa_codigo, g.nome grupo, u.nome criado_por_nome,
                    (SELECT COUNT(*) FROM cns_visitas_itens i WHERE i.visita_id = v.id) qtd_itens,
                    (SELECT COUNT(*) FROM cns_visitas_itens i WHERE i.visita_id = v.id AND i.resposta = \'ajustar\') qtd_ajustar,
                    (SELECT COUNT(*) FROM anexos a WHERE a.tenant_id = v.tenant_id AND a.dono_tipo = \'cns_visita\' AND a.dono_id = v.id AND a.excluido_em IS NULL) qtd_fotos
               FROM cns_visitas v JOIN casas_oracao c ON c.id = v.casa_id JOIN grupos g ON g.id = c.grupo_id JOIN usuarios u ON u.id = v.criado_por
              WHERE v.tenant_id = ? AND v.casa_id IN ' . Db::in($casas) . ' ORDER BY v.data_visita DESC, v.id DESC LIMIT 200',
            array_merge([$t], $casas)
        );
        return array_map(fn($v) => [
            'id' => (int) $v['id'], 'data_visita' => $v['data_visita'], 'status' => $v['status'],
            'casa' => ['id' => (int) $v['casa_id'], 'nome' => $v['casa_nome'], 'codigo' => $v['casa_codigo'], 'grupo' => $v['grupo']],
            'criado_por' => $v['criado_por_nome'], 'qtd_itens' => (int) $v['qtd_itens'], 'qtd_ajustar' => (int) $v['qtd_ajustar'], 'qtd_fotos' => (int) $v['qtd_fotos'],
        ], $linhas);
    }

    public static function criar(Requisicao $r): array
    {
        Acesso::exigir('cns.visitas');
        $t = Sessao::tenantId();
        $d = (new Validar($r->corpo))->inteiro('casa_id')->texto('data_visita', false, 10)->ok();
        if (!self::podeVisitar($d['casa_id'])) throw HttpErro::proibido();
        $data = $d['data_visita'] ?? date('Y-m-d');
        self::validarData($data);
        $itens = Db::all('SELECT * FROM cns_checklist_itens WHERE tenant_id = ? AND ativo = 1 ORDER BY ordem, id', [$t]);
        if (!$itens) throw new HttpErro(422, 'O checklist ainda está vazio. A Coordenação CNS precisa cadastrar os itens em Limpeza → Visitas → Checklist.');
        $id = Db::transacao(function () use ($t, $d, $data, $itens) {
            $id = Db::insert('INSERT INTO cns_visitas (tenant_id, casa_id, data_visita, criado_por) VALUES (?,?,?,?)', [$t, $d['casa_id'], $data, Sessao::usuario()['id']]);
            foreach ($itens as $n => $i) {
                Db::run('INSERT INTO cns_visitas_itens (tenant_id, visita_id, item_id, secao, texto, ordem) VALUES (?,?,?,?,?,?)', [$t, $id, $i['id'], $i['secao'], $i['texto'], $n + 1]);
            }
            return $id;
        });
        Auditoria::registrar('criar', 'cns_visitas', $id, null, ['casa_id' => $d['casa_id'], 'data_visita' => $data]);
        return self::montar($t, self::carregar($t, $id));
    }

    public static function ver(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        return self::montar($t, self::carregar($t, $id));
    }

    /** Salva data, observação e respostas (só enquanto for rascunho). */
    public static function salvar(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        $v = self::carregar($t, $id);
        if ($v['status'] !== 'rascunho') throw new HttpErro(409, 'Visita concluída. Reabra para editar.');
        $d = (new Validar($r->corpo))->texto('data_visita', true, 10)->texto('observacao', false, 4000)->ok();
        self::validarData($d['data_visita']);
        $respostas = [];
        foreach ((new Validar($r->corpo))->lista('itens') as $i) {
            if (!is_array($i) || !isset($i['id'])) continue;
            $resp = $i['resposta'] ?? null;
            if ($resp !== null && !in_array($resp, self::RESPOSTAS, true)) throw HttpErro::invalido(['itens' => 'Resposta inválida.']);
            $obs = is_string($i['obs'] ?? null) ? trim($i['obs']) : null;
            if ($obs !== null && mb_strlen($obs) > 500) throw HttpErro::invalido(['itens' => 'Observação do item com mais de 500 caracteres.']);
            $respostas[(int) $i['id']] = [$resp, $obs === '' ? null : $obs];
        }
        Db::transacao(function () use ($t, $id, $d, $respostas) {
            Db::run('UPDATE cns_visitas SET data_visita = ?, observacao = ? WHERE tenant_id = ? AND id = ?', [$d['data_visita'], $d['observacao'], $t, $id]);
            foreach ($respostas as $itemId => [$resp, $obs]) {
                Db::run('UPDATE cns_visitas_itens SET resposta = ?, obs = ? WHERE tenant_id = ? AND visita_id = ? AND id = ?', [$resp, $obs, $t, $id, $itemId]);
            }
        });
        return self::montar($t, self::carregar($t, $id));
    }

    public static function acao(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        $v = self::carregar($t, $id);
        $acao = $r->corpo['acao'] ?? '';
        if ($acao === 'concluir') {
            if ($v['status'] !== 'rascunho') throw new HttpErro(409, 'A visita já está concluída.');
            $faltam = (int) Db::one('SELECT COUNT(*) n FROM cns_visitas_itens WHERE tenant_id = ? AND visita_id = ? AND resposta IS NULL', [$t, $id])['n'];
            if ($faltam > 0) throw new HttpErro(422, "Faltam $faltam item(ns) do checklist para marcar.");
            Db::run("UPDATE cns_visitas SET status = 'concluida', concluida_por = ?, concluida_em = NOW() WHERE tenant_id = ? AND id = ?", [Sessao::usuario()['id'], $t, $id]);
        } elseif ($acao === 'reabrir') {
            if ($v['status'] !== 'concluida') throw new HttpErro(409, 'A visita não está concluída.');
            if (!self::podeGerir($v)) throw HttpErro::proibido();
            Db::run("UPDATE cns_visitas SET status = 'rascunho', concluida_por = NULL, concluida_em = NULL WHERE tenant_id = ? AND id = ?", [$t, $id]);
        } else {
            throw HttpErro::invalido(['acao' => 'Ação inválida.']);
        }
        Auditoria::registrar($acao, 'cns_visitas', $id, ['status' => $v['status']], null);
        return self::montar($t, self::carregar($t, $id));
    }

    public static function excluir(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        $v = self::carregar($t, $id);
        if (!self::podeGerir($v)) throw HttpErro::proibido();
        if ($v['status'] === 'concluida' && !Acesso::tem('cns.gerir')) throw new HttpErro(409, 'Visita concluída: só a Coordenação CNS pode excluir.');
        Db::transacao(function () use ($t, $id) {
            foreach (Anexos::listar($t, 'cns_visita', $id) as $a) Anexos::excluir($t, (int) $a['id']);
            Db::run('DELETE FROM cns_visitas WHERE tenant_id = ? AND id = ?', [$t, $id]);
        });
        Auditoria::registrar('excluir', 'cns_visitas', $id, ['casa_id' => (int) $v['casa_id'], 'data_visita' => $v['data_visita']], null);
        return ['ok' => true];
    }

    public static function enviarFoto(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        $v = self::carregar($t, $id);
        if ($v['status'] !== 'rascunho') throw new HttpErro(409, 'Visita concluída. Reabra para mudar as fotos.');
        if (count(Anexos::listar($t, 'cns_visita', $id)) >= self::MAX_FOTOS) throw new HttpErro(422, 'Limite de ' . self::MAX_FOTOS . ' fotos por visita.');
        $legenda = (new Validar($r->corpo))->texto('legenda', false, 200)->ok()['legenda'];
        $a = Anexos::salvar($t, 'cns_visita', $id, 'foto_visita', $r->corpo['arquivo'] ?? null, null);
        if ($legenda !== null) Db::run('UPDATE anexos SET legenda = ? WHERE tenant_id = ? AND id = ?', [$legenda, $t, $a['id']]);
        return self::montar($t, $v);
    }

    public static function editarFoto(Requisicao $r, int $id, int $foto): array
    {
        $t = Sessao::tenantId();
        $v = self::carregar($t, $id);
        if ($v['status'] !== 'rascunho') throw new HttpErro(409, 'Visita concluída. Reabra para mudar as fotos.');
        self::fotoDaVisita($t, $id, $foto);
        $legenda = (new Validar($r->corpo))->texto('legenda', false, 200)->ok()['legenda'];
        Db::run('UPDATE anexos SET legenda = ? WHERE tenant_id = ? AND id = ?', [$legenda, $t, $foto]);
        return self::montar($t, $v);
    }

    public static function excluirFoto(Requisicao $r, int $id, int $foto): array
    {
        $t = Sessao::tenantId();
        $v = self::carregar($t, $id);
        if ($v['status'] !== 'rascunho') throw new HttpErro(409, 'Visita concluída. Reabra para mudar as fotos.');
        self::fotoDaVisita($t, $id, $foto);
        Anexos::excluir($t, $foto);
        return self::montar($t, $v);
    }

    // ================================================================ apoio

    /** Carrega a visita conferindo o acesso; quem não pode ver recebe 404. */
    public static function carregar(int $t, int $id): array
    {
        $v = Db::one('SELECT * FROM cns_visitas WHERE tenant_id = ? AND id = ?', [$t, $id]);
        if (!$v || !self::podeVisitar((int) $v['casa_id'])) throw HttpErro::naoEncontrado('Visita');
        return $v;
    }

    /** Excluir e reabrir: quem fez a visita ou a Coordenação CNS. */
    private static function podeGerir(array $v): bool
    {
        return Acesso::tem('cns.gerir') || (int) $v['criado_por'] === (int) Sessao::usuario()['id'];
    }

    private static function fotoDaVisita(int $t, int $id, int $foto): void
    {
        $ok = Db::one("SELECT 1 FROM anexos WHERE tenant_id = ? AND id = ? AND dono_tipo = 'cns_visita' AND dono_id = ? AND excluido_em IS NULL", [$t, $foto, $id]);
        if (!$ok) throw HttpErro::naoEncontrado('Foto');
    }

    private static function validarData(string $data): void
    {
        $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', $data);
        if (!$dt || $dt->format('Y-m-d') !== $data) throw HttpErro::invalido(['data_visita' => 'Data inválida.']);
        if ($data > date('Y-m-d', strtotime('+1 day'))) throw HttpErro::invalido(['data_visita' => 'A data da visita não pode ser no futuro.']);
    }

    private static function montar(int $t, array $v): array
    {
        $casa = Db::one('SELECT c.id, c.nome, c.codigo, g.nome grupo FROM casas_oracao c JOIN grupos g ON g.id = c.grupo_id WHERE c.tenant_id = ? AND c.id = ?', [$t, $v['casa_id']]);
        $nome = fn($uid) => $uid ? (Db::one('SELECT nome FROM usuarios WHERE tenant_id = ? AND id = ?', [$t, $uid])['nome'] ?? null) : null;
        $itens = Db::all('SELECT id, secao, texto, ordem, resposta, obs FROM cns_visitas_itens WHERE tenant_id = ? AND visita_id = ? ORDER BY ordem, id', [$t, $v['id']]);
        $rascunho = $v['status'] === 'rascunho';
        return [
            'id' => (int) $v['id'], 'status' => $v['status'], 'data_visita' => $v['data_visita'], 'observacao' => $v['observacao'],
            'casa' => ['id' => (int) $casa['id'], 'nome' => $casa['nome'], 'codigo' => $casa['codigo'], 'grupo' => $casa['grupo']],
            'criado_por' => $nome($v['criado_por']), 'criado_em' => $v['criado_em'],
            'concluida_por' => $nome($v['concluida_por']), 'concluida_em' => $v['concluida_em'],
            'itens' => array_map(fn($i) => ['id' => (int) $i['id'], 'secao' => $i['secao'], 'texto' => $i['texto'], 'resposta' => $i['resposta'], 'obs' => $i['obs']], $itens),
            'fotos' => Anexos::listar($t, 'cns_visita', (int) $v['id']),
            'pode_editar' => $rascunho,
            'pode_reabrir' => !$rascunho && self::podeGerir($v),
            'pode_excluir' => self::podeGerir($v) && ($rascunho || Acesso::tem('cns.gerir')),
        ];
    }
}
