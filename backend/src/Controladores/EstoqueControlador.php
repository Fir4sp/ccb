<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Auditoria, Db, Estoque as E, HttpErro, Requisicao, Sessao, Validar};

/** Fase 6 — DML Central e DMLs das casas. */
final class EstoqueControlador
{
    /** DMLs que o usuário vê, com um resumo de cada. */
    public static function locais(Requisicao $r): array
    {
        Acesso::exigir('cns.ver');
        $t = Sessao::tenantId();
        $res = ['central' => null, 'casas' => []];
        $central = E::central($t);
        if (E::podeVer($central)) {
            $abaixo = Db::all('SELECT p.id, p.nome, p.minimo_central, COALESCE(s.quantidade, 0) qtd FROM cns_produtos p
                                 LEFT JOIN estoque_saldos s ON s.produto_id = p.id AND s.local_id = ?
                                WHERE p.tenant_id = ? AND p.ativo = 1 AND p.minimo_central IS NOT NULL AND COALESCE(s.quantidade, 0) < p.minimo_central
                                ORDER BY p.nome', [$central['id'], $t]);
            $res['central'] = self::resumoLocal($central) + ['abaixo_minimo' => array_map(fn($a) => ['id' => (int) $a['id'], 'nome' => $a['nome'],
                'quantidade' => (int) $a['qtd'], 'minimo' => (int) $a['minimo_central']], $abaixo)];
        }
        $casas = Acesso::casasVisiveis();
        if ($casas) {
            $linhas = Db::all("SELECT l.*, c.nome casa_nome, c.codigo casa_codigo, g.nome grupo FROM locais_estoque l JOIN casas_oracao c ON c.id = l.casa_id JOIN grupos g ON g.id = c.grupo_id
                                WHERE l.tenant_id = ? AND l.tipo = 'local' AND c.ativo = 1 AND l.casa_id IN " . Db::in($casas) . ' ORDER BY g.nome, c.nome', array_merge([$t], $casas));
            foreach ($linhas as $l) $res['casas'][] = self::resumoLocal($l);
        }
        return $res;
    }

    private static function resumoLocal(array $l): array
    {
        $s = Db::one('SELECT COUNT(*) n, COALESCE(SUM(quantidade), 0) total, MAX(contado_em) contado FROM estoque_saldos WHERE local_id = ? AND quantidade > 0', [$l['id']]);
        $inv = Db::one('SELECT MAX(criado_em) em FROM estoque_inventarios WHERE local_id = ?', [$l['id']]);
        return [
            'id' => (int) $l['id'], 'tipo' => $l['tipo'], 'nome' => $l['nome'],
            'casa' => $l['casa_id'] ? ['id' => (int) $l['casa_id'], 'nome' => $l['casa_nome'] ?? null, 'grupo' => $l['grupo'] ?? null] : null,
            'produtos' => (int) $s['n'], 'unidades' => (int) $s['total'], 'ultima_contagem' => $inv['em'],
            'pode_contar' => E::podeContar($l),
        ];
    }

    public static function ver(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        $l = E::local($t, $id);
        if (!E::podeVer($l)) throw HttpErro::naoEncontrado('Estoque');
        $central = $l['tipo'] === 'central';
        $saldos = Db::all("SELECT p.id, p.nome, p.embalagem, p.unidade, p.categoria, p.foto_id, p.ativo, p.minimo_central,
                                  COALESCE(s.quantidade, 0) qtd, s.contado_em
                             FROM cns_produtos p LEFT JOIN estoque_saldos s ON s.produto_id = p.id AND s.local_id = ?
                            WHERE p.tenant_id = ? AND (p.ativo = 1 OR s.quantidade > 0)
                            ORDER BY FIELD(p.categoria,'limpeza','banheiro','cozinha','descartaveis','utensilios','outros'), p.ordem, p.nome", [$id, $t]);
        $movs = Db::all('SELECT m.*, p.nome produto, u.nome usuario, ol.nome outro_local FROM estoque_movimentos m
                           JOIN cns_produtos p ON p.id = m.produto_id JOIN usuarios u ON u.id = m.usuario_id LEFT JOIN locais_estoque ol ON ol.id = m.outro_local_id
                          WHERE m.tenant_id = ? AND m.local_id = ? ORDER BY m.id DESC LIMIT 80', [$t, $id]);
        $inv = Db::all('SELECT i.*, u.nome usuario FROM estoque_inventarios i JOIN usuarios u ON u.id = i.usuario_id WHERE i.tenant_id = ? AND i.local_id = ? ORDER BY i.id DESC LIMIT 10', [$t, $id]);
        $acoes = [];
        if (E::podeContar($l)) $acoes[] = 'contar';
        if ($central && Acesso::tem('cns.gerir')) array_push($acoes, 'entrada', 'saida', 'enviar');
        return [
            'local' => self::resumoLocal($l),
            'acoes' => $acoes,
            'saldos' => array_map(fn($s) => [
                'produto_id' => (int) $s['id'], 'nome' => $s['nome'], 'embalagem' => $s['embalagem'], 'unidade' => $s['unidade'], 'categoria' => $s['categoria'],
                'mini_url' => $s['foto_id'] ? '/api/anexos/' . $s['foto_id'] . '?mini=1' : null, 'ativo' => (bool) $s['ativo'],
                'quantidade' => (int) $s['qtd'], 'contado_em' => $s['contado_em'],
                'minimo' => $central && $s['minimo_central'] !== null ? (int) $s['minimo_central'] : null,
            ], $saldos),
            'movimentos' => array_map(fn($m) => [
                'id' => (int) $m['id'], 'produto' => $m['produto'], 'tipo' => $m['tipo'], 'origem' => $m['origem'], 'origem_nome' => E::ORIGENS[$m['origem']],
                'quantidade' => (int) $m['quantidade'], 'saldo_apos' => (int) $m['saldo_apos'], 'motivo' => $m['motivo'],
                'outro_local' => $m['outro_local'], 'usuario' => $m['usuario'], 'criado_em' => $m['criado_em'],
            ], $movs),
            'inventarios' => array_map(fn($i) => ['id' => (int) $i['id'], 'usuario' => $i['usuario'], 'diferencas' => (int) $i['diferencas'], 'observacao' => $i['observacao'], 'criado_em' => $i['criado_em']], $inv),
        ];
    }

    /** Contagem: cada produto informado passa a ter o saldo contado. */
    public static function contar(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        Db::transacao(function () use ($r, $t, $id) {
            $l = E::local($t, $id);
            if (!E::podeVer($l)) throw HttpErro::naoEncontrado('Estoque');
            if (!E::podeContar($l)) throw HttpErro::proibido();
            $v = (new Validar($r->corpo))->texto('observacao', false, 1000);
            $itens = self::itens($t, $r->corpo, $v, 0);
            $obs = $v->ok()['observacao'];
            if (!$itens) throw HttpErro::invalido(['itens' => 'Conte pelo menos um produto.']);
            $inv = Db::insert('INSERT INTO estoque_inventarios (tenant_id, local_id, usuario_id, observacao) VALUES (?,?,?,?)', [$t, $id, Sessao::usuario()['id'], $obs]);
            $dif = 0;
            foreach ($itens as $pid => $q) if (E::contar($t, $id, $pid, $q, $inv) !== 0) $dif++;
            Db::run('UPDATE estoque_inventarios SET diferencas = ? WHERE id = ?', [$dif, $inv]);
            Auditoria::registrar('contar_estoque', 'locais_estoque', $id, null, ['inventario_id' => $inv, 'produtos' => count($itens), 'diferencas' => $dif]);
        });
        return self::ver($r, $id);
    }

    /** DML Central: entrada (doação, compra avulsa), saída (perda, uso) ou envio avulso para uma casa. */
    public static function movimentar(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        Db::transacao(function () use ($r, $t, $id) {
            $l = E::local($t, $id);
            if (!E::podeVer($l)) throw HttpErro::naoEncontrado('Estoque');
            if ($l['tipo'] !== 'central' || !Acesso::tem('cns.gerir')) throw HttpErro::proibido();
            $tipo = $r->corpo['tipo'] ?? null;
            $v = (new Validar($r->corpo))->texto('motivo', true, 300, 3);
            if (!in_array($tipo, ['entrada', 'saida', 'enviar'], true)) $v->erro('tipo', 'Escolha entrada, saída ou envio.');
            $destino = null;
            if ($tipo === 'enviar') {
                $casaId = (int) ($r->corpo['casa_id'] ?? 0);
                $destino = $casaId && Acesso::podeVerCasa($casaId) ? E::localDaCasa($t, $casaId) : null;
                if (!$destino) $v->erro('casa_id', 'Escolha a casa.');
            }
            $itens = self::itens($t, $r->corpo, $v, 1);
            $motivo = $v->ok()['motivo'];
            if (!$itens) throw HttpErro::invalido(['itens' => 'Informe pelo menos um produto.']);
            foreach ($itens as $pid => $q) {
                if ($tipo === 'entrada') E::mover($t, $id, $pid, $q, 'entrada', 'manual', [], $motivo);
                elseif ($tipo === 'saida') E::mover($t, $id, $pid, -$q, 'saida', 'manual', [], $motivo);
                else {
                    E::mover($t, $id, $pid, -$q, 'saida', 'envio', ['outro_local_id' => $destino['id']], $motivo);
                    E::mover($t, (int) $destino['id'], $pid, $q, 'entrada', 'envio', ['outro_local_id' => $id], $motivo);
                }
            }
            Auditoria::registrar('estoque_' . $tipo, 'locais_estoque', $id, null, ['itens' => $itens, 'motivo' => $motivo, 'destino' => $destino['id'] ?? null]);
        });
        return self::ver($r, $id);
    }

    /** [produto_id => quantidade] a partir de itens [{produto_id, quantidade}] (ou "contado"). */
    public static function itens(int $t, array $corpo, Validar $v, int $minimo): array
    {
        $validos = array_flip(array_map('intval', array_column(Db::all('SELECT id FROM cns_produtos WHERE tenant_id = ?', [$t]), 'id')));
        $res = [];
        foreach ((is_array($corpo['itens'] ?? null) ? $corpo['itens'] : []) as $i => $it) {
            $pid = (int) ($it['produto_id'] ?? 0);
            $q = filter_var($it['quantidade'] ?? $it['contado'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 99999]]);
            if (!isset($validos[$pid]) || $q === false) { $v->erro("itens.$i", 'Quantidade inválida.'); continue; }
            if ($q < $minimo) continue;
            $res[$pid] = $q;
        }
        return $res;
    }
}
