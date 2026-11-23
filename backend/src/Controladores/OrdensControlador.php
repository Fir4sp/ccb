<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Anexos, Auditoria, Chamados, Chamados as C, Db, HttpErro, Ordens as R, Requisicao, Resposta, Sessao, Validar};

/** v1.6.0 — Ordens de Serviço: etapas, pendências, gráfico de evolução e, na obra, teto e gastos. */
final class OrdensControlador
{
    private const POR_PAGINA = 50;

    // ---------------------------------------------------------------- listas

    public static function listar(Requisicao $r): array
    {
        Acesso::exigir('chamados.ver');
        $t = Sessao::tenantId();
        [$vis, $pv] = C::filtroVisiveis();
        if ($vis === '0') return ['pagina' => 1, 'total' => 0, 'itens' => []];
        $sql = R::SELECT . ' WHERE os.tenant_id = ? AND ' . $vis;
        $p = array_merge([$t], $pv);
        $filtro = is_string($r->query['filtro'] ?? null) ? $r->query['filtro'] : 'ativas';
        if ($filtro === 'ativas' || $filtro === 'para_mim') $sql .= " AND os.status NOT IN ('concluida','cancelada')";
        elseif ($filtro === 'finalizadas') $sql .= " AND os.status IN ('concluida','cancelada')";
        elseif ($filtro === 'pendencias') $sql .= " AND EXISTS (SELECT 1 FROM os_pendencias pp WHERE pp.tenant_id = os.tenant_id AND pp.os_id = os.id AND pp.status = 'aberta')";
        if (!empty($r->query['tipo']) && in_array($r->query['tipo'], ['servico', 'obra'], true)) { $sql .= ' AND os.tipo = ?'; $p[] = $r->query['tipo']; }
        if (!empty($r->query['casa_id']) && ctype_digit((string) $r->query['casa_id'])) { $sql .= ' AND ch.casa_id = ?'; $p[] = (int) $r->query['casa_id']; }
        if (!empty($r->query['busca']) && is_string($r->query['busca'])) {
            $b = trim($r->query['busca']);
            if (preg_match('/^(?:os)?\s*#?0*(\d+)$/i', $b, $m)) { $sql .= ' AND (os.numero = ? OR ch.numero = ?)'; array_push($p, (int) $m[1], (int) $m[1]); }
            else {
                $like = '%' . addcslashes(mb_substr($b, 0, 60), '%_\\') . '%';
                $sql .= ' AND (ch.titulo LIKE ? OR ch.descricao LIKE ? OR c.nome LIKE ?)';
                array_push($p, $like, $like, $like);
            }
        }
        $ordem = " ORDER BY (os.status IN ('concluida','cancelada')), (pedido_pendente_id IS NULL), FIELD(os.status, 'em_andamento','pausada','aberta'), os.atualizado_em DESC";
        $linhas = Db::all($sql . $ordem, $p);
        if ($filtro === 'para_mim') $linhas = array_values(array_filter($linhas, fn($o) => R::paraMim($o)));
        $pagina = max(1, (int) ($r->query['pagina'] ?? 1));
        $total = count($linhas);
        $linhas = array_slice($linhas, ($pagina - 1) * self::POR_PAGINA, self::POR_PAGINA);
        return ['pagina' => $pagina, 'total' => $total, 'itens' => array_map(fn($o) => self::item($o) + ['para_mim' => R::paraMim($o)], $linhas)];
    }

    public static function resumo(Requisicao $r): array
    {
        $vazio = ['para_mim' => 0, 'ativas' => 0, 'em_andamento' => 0, 'pendencias' => 0, 'obras_alerta' => 0, 'obras_acima_teto' => 0, 'tetos_aguardando' => 0];
        if (!Acesso::tem('chamados.ver')) return $vazio;
        [$vis, $pv] = C::filtroVisiveis();
        if ($vis === '0') return $vazio;
        $t = Sessao::tenantId();
        $res = $vazio;
        foreach (Db::all(R::SELECT . " WHERE os.tenant_id = ? AND os.status NOT IN ('concluida','cancelada') AND " . $vis, array_merge([$t], $pv)) as $o) {
            $res['ativas']++;
            if ($o['status'] === 'em_andamento') $res['em_andamento']++;
            if (R::paraMim($o)) $res['para_mim']++;
            if ($o['pedido_pendente_id'] !== null) $res['tetos_aguardando']++;
            if (R::acimaDoTeto($o)) $res['obras_acima_teto']++;
            elseif ($o['tipo'] === 'obra' && (float) $o['teto'] > 0 && (float) $o['gasto'] >= R::ALERTA * (float) $o['teto']) $res['obras_alerta']++;
        }
        $res['pendencias'] = (int) Db::one("SELECT COUNT(*) n FROM os_pendencias p JOIN ordens_servico os ON os.id = p.os_id JOIN chamados ch ON ch.id = os.chamado_id
                                             WHERE p.tenant_id = ? AND p.status = 'aberta' AND " . $vis, array_merge([$t], $pv))['n'];
        if (!Acesso::tem('obras.valores')) { $res['obras_alerta'] = 0; $res['obras_acima_teto'] = 0; }
        return $res;
    }

    /** Todas as pendências do escopo (abertas primeiro). */
    public static function pendencias(Requisicao $r): array
    {
        Acesso::exigir('chamados.ver');
        $t = Sessao::tenantId();
        [$vis, $pv] = C::filtroVisiveis();
        if ($vis === '0') return [];
        $status = ($r->query['status'] ?? 'aberta') === 'resolvida' ? 'resolvida' : 'aberta';
        return array_map(fn($p) => self::pendenciaTipada($p) + [
            'os' => ['id' => (int) $p['os_id'], 'numero' => (int) $p['os_numero'], 'rotulo' => R::numeroFormatado((int) $p['os_numero']), 'tipo' => $p['os_tipo']],
            'chamado' => ['id' => (int) $p['chamado_id'], 'numero' => (int) $p['chamado_numero'], 'titulo' => $p['titulo']],
            'casa' => ['id' => (int) $p['casa_id'], 'nome' => $p['casa_nome']],
        ], Db::all("SELECT p.*, e.nome AS etapa_nome, ua.nome AS aberta_por_nome, ur.nome AS resolvida_por_nome,
                           os.numero AS os_numero, os.tipo AS os_tipo, ch.id AS chamado_id, ch.numero AS chamado_numero, ch.titulo, ch.casa_id, c.nome AS casa_nome
                      FROM os_pendencias p
                      JOIN os_etapas e ON e.id = p.etapa_id
                      JOIN ordens_servico os ON os.id = p.os_id
                      JOIN chamados ch ON ch.id = os.chamado_id
                      JOIN casas_oracao c ON c.id = ch.casa_id
                      JOIN usuarios ua ON ua.id = p.aberta_por
                      LEFT JOIN usuarios ur ON ur.id = p.resolvida_por
                     WHERE p.tenant_id = ? AND p.status = ? AND " . $vis . '
                     ORDER BY ' . ($status === 'aberta' ? 'p.criado_em' : 'p.resolvida_em DESC') . ' LIMIT 300',
            array_merge([$t, $status], $pv)));
    }

    public static function ver(Requisicao $r, int $id): array
    {
        return self::detalhe(R::carregar($id));
    }

    /** Previsão de início e fim. */
    public static function editar(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        $o = R::carregar($id);
        if (!R::podeEditarEtapas($o)) throw HttpErro::proibido();
        $v = new Validar($r->corpo);
        $inicio = self::data($r->corpo, 'previsao_inicio', $v);
        $fim = self::data($r->corpo, 'previsao_fim', $v);
        if ($inicio && $fim && $fim < $inicio) $v->erro('previsao_fim', 'O fim vem depois do início.');
        $v->ok();
        Db::run('UPDATE ordens_servico SET previsao_inicio = ?, previsao_fim = ? WHERE tenant_id = ? AND id = ?', [$inicio, $fim, $t, $id]);
        Auditoria::registrar('editar', 'ordens_servico', $id, array_intersect_key($o, array_flip(['previsao_inicio', 'previsao_fim'])), compact('inicio', 'fim'));
        return self::detalhe(R::carregar($id));
    }

    // ---------------------------------------------------------------- ações da OS

    public static function acao(Requisicao $r, int $id): array
    {
        $acao = $r->corpo['acao'] ?? null;
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $id, $acao, $t) {
            $o = R::carregar($id, true);
            if (!is_string($acao) || !in_array($acao, R::acoes($o), true) || $acao === 'lancar_gasto') {
                throw new HttpErro(409, in_array($o['status'], R::FINAIS, true)
                    ? 'Esta Ordem de Serviço já foi finalizada.' : 'Esta ação não está disponível para você neste momento. Atualize a página.');
            }
            $metodo = 'acao' . str_replace('_', '', ucwords($acao, '_'));
            $antes = self::retrato($o);
            self::$metodo($t, $o, $r->corpo);
            $depois = R::carregar($id);
            Auditoria::registrar($acao, 'ordens_servico', $id, $antes, self::retrato($depois));
            return self::detalhe($depois);
        });
    }

    private static function acaoIniciar(int $t, array $o, array $d): void
    {
        $ok = (new Validar($d))->texto('texto', false, 2000)->ok();
        $eu = Sessao::usuario()['id'];
        $assume = Acesso::temPerfil('equipe_manutencao') || Acesso::temPerfil('engenharia') ? $eu : null;
        Db::run("UPDATE ordens_servico SET status = 'em_andamento', iniciada_em = COALESCE(iniciada_em, NOW()) WHERE tenant_id = ? AND id = ?", [$t, $o['id']]);
        Db::run("UPDATE chamados SET status = 'em_execucao', responsavel_id = COALESCE(responsavel_id, ?) WHERE tenant_id = ? AND id = ?", [$assume, $t, $o['chamado_id']]);
        R::evento($t, $o, 'inicio', ($ok['texto'] ? $ok['texto'] . "\n" : '') . R::numeroFormatado((int) $o['numero']) . ' iniciada.', null, $o['chamado_status'], 'em_execucao');
    }

    private static function acaoPausar(int $t, array $o, array $d): void
    {
        $ok = (new Validar($d))->texto('texto', true, 2000, 5)->ok();
        Db::run("UPDATE ordens_servico SET status = 'pausada' WHERE tenant_id = ? AND id = ?", [$t, $o['id']]);
        R::evento($t, $o, 'pausa', $ok['texto']);
    }

    private static function acaoRetomar(int $t, array $o, array $d): void
    {
        $ok = (new Validar($d))->texto('texto', false, 2000)->ok();
        Db::run("UPDATE ordens_servico SET status = 'em_andamento' WHERE tenant_id = ? AND id = ?", [$t, $o['id']]);
        R::evento($t, $o, 'retomada', $ok['texto']);
    }

    private static function acaoConcluir(int $t, array $o, array $d): void
    {
        $obra = $o['tipo'] === 'obra';
        $v = (new Validar($d))->texto('texto', true, 5000, 5);
        if ((int) $o['etapas_total'] === 0) $v->erro('texto', 'Adicione as etapas do serviço antes de concluir (pode ser uma só).');
        elseif ((int) $o['etapas_abertas'] > 0) {
            $v->erro('texto', 'Ainda há ' . $o['etapas_abertas'] . ' etapa(s) sem marcar. Marque cada uma como OK, Não OK ou Não se aplica.');
        }
        $final = null;
        if (!$obra) {
            if ((int) $o['em_reaprovacao'] === 1) throw new HttpErro(409, 'O novo valor ainda está aguardando aprovação. Espere a decisão antes de concluir.');
            $final = array_key_exists('valor', $d) && $d['valor'] !== '' && $d['valor'] !== null ? Validar::reais($d['valor']) : (float) $o['valor_estimado'];
            if ($final === null || $final < 0) $v->erro('valor', 'Informe o valor final em reais.');
            elseif (Chamados::reaprovacaoPara($final, (float) $o['valor_aprovado'], $o['nivel_aprovacao'], Chamados::regras($t)) !== null) {
                $v->erro('valor', 'Este valor passa do aprovado e precisa de nova aprovação. Use "Mudou o valor" no chamado antes de concluir.');
            }
        } else {
            if ($o['pedido_pendente_id'] !== null) throw new HttpErro(409, 'Há um pedido de teto aguardando os Procuradores. Espere a decisão antes de concluir.');
            if (R::acimaDoTeto($o)) throw new HttpErro(409, 'A obra passou do teto. Peça um teto novo aos Procuradores antes de concluir.');
            $final = (float) $o['gasto'];
        }
        $ok = $v->ok();
        Db::run("UPDATE ordens_servico SET status = 'concluida', concluida_em = NOW(), relatorio_final = ? WHERE tenant_id = ? AND id = ?", [$ok['texto'], $t, $o['id']]);
        Db::run("UPDATE chamados SET status = 'concluido', valor_final = ?, concluido_em = NOW() WHERE tenant_id = ? AND id = ?", [$final, $t, $o['chamado_id']]);
        $pend = (int) $o['pendencias_abertas'];
        R::evento($t, $o, 'conclusao', $ok['texto'] . ($pend ? "\nFicou com $pend pendência(s) para resolver depois." : ''), $final, $o['chamado_status'], 'concluido');
    }

    private static function acaoPedirTeto(int $t, array $o, array $d): void
    {
        $v = (new Validar($d))->texto('texto', true, 2000, 5);
        $novo = self::valor($d, 'valor', $v, 'Informe o novo teto.');
        if ($novo !== null && $novo <= 0) $v->erro('valor', 'O teto precisa ser maior que zero.');
        elseif ($novo !== null && $novo < (float) $o['gasto']) $v->erro('valor', 'O novo teto não pode ser menor que o já gasto (' . self::reais((float) $o['gasto']) . ').');
        elseif ($novo !== null && $o['teto'] !== null && abs($novo - (float) $o['teto']) < 0.01) $v->erro('valor', 'É o mesmo valor do teto atual.');
        $ok = $v->ok();
        Db::run('INSERT INTO os_tetos (tenant_id, os_id, valor_anterior, valor_novo, motivo, pedido_por) VALUES (?,?,?,?,?,?)',
            [$t, $o['id'], $o['teto'], $novo, $ok['texto'], Sessao::usuario()['id']]);
        R::evento($t, $o, 'pedido_teto', $ok['texto'], $novo);
    }

    private static function acaoDecidirTeto(int $t, array $o, array $d): void
    {
        $decisao = $d['decisao'] ?? null;
        $v = (new Validar($d))->texto('texto', $decisao === 'recusar', 2000);
        if (!in_array($decisao, ['aprovar', 'recusar'], true)) $v->erro('decisao', 'Aprove ou recuse.');
        $ok = $v->ok();
        $pedido = Db::one('SELECT * FROM os_tetos WHERE tenant_id = ? AND id = ?', [$t, $o['pedido_pendente_id']]);
        $novo = (float) $pedido['valor_novo'];
        $eu = Sessao::usuario()['id'];
        if ($decisao === 'aprovar') {
            if ($novo < (float) $o['gasto']) throw HttpErro::invalido(['decisao' => 'O teto pedido ficou abaixo do que já foi gasto.']);
            Db::run("UPDATE os_tetos SET status = 'aprovado', decidido_por = ?, decidido_em = NOW(), resposta = ? WHERE id = ?", [$eu, $ok['texto'], $pedido['id']]);
            Db::run('UPDATE ordens_servico SET teto = ? WHERE tenant_id = ? AND id = ?', [$novo, $t, $o['id']]);
            Db::run('UPDATE chamados SET valor_aprovado = ? WHERE tenant_id = ? AND id = ?', [$novo, $t, $o['chamado_id']]);
            R::evento($t, $o, 'aumento_aprovado', $ok['texto'], $novo);
        } else {
            Db::run("UPDATE os_tetos SET status = 'recusado', decidido_por = ?, decidido_em = NOW(), resposta = ? WHERE id = ?", [$eu, $ok['texto'], $pedido['id']]);
            R::evento($t, $o, 'teto_recusado', $ok['texto'], $novo);
        }
    }

    // ---------------------------------------------------------------- etapas

    /** Adiciona uma etapa avulsa ({nome}) ou todas as de um modelo ({modelo_id}). */
    public static function adicionarEtapas(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $id, $t) {
            $o = R::carregar($id, true);
            if (!R::podeEditarEtapas($o)) throw new HttpErro(409, 'As etapas desta OS não podem ser alteradas por você agora.');
            $ordem = (int) Db::one('SELECT COALESCE(MAX(ordem), 0) n FROM os_etapas WHERE tenant_id = ? AND os_id = ?', [$t, $id])['n'];
            if (!empty($r->corpo['modelo_id'])) {
                $m = ctype_digit((string) $r->corpo['modelo_id'])
                    ? Db::one('SELECT * FROM etapas_modelos WHERE tenant_id = ? AND id = ? AND ativo = 1', [$t, (int) $r->corpo['modelo_id']]) : null;
                if (!$m) throw HttpErro::invalido(['modelo_id' => 'Escolha um dos modelos.']);
                $nomes = array_column(Db::all('SELECT nome FROM etapas_modelos_itens WHERE tenant_id = ? AND modelo_id = ? ORDER BY ordem, id', [$t, $m['id']]), 'nome');
                $texto = 'Usou o modelo "' . $m['nome'] . '" (' . count($nomes) . ' etapas).';
            } else {
                $d = (new Validar($r->corpo))->texto('nome', true, 150, 2)->ok();
                $nomes = [$d['nome']];
                $texto = 'Etapa adicionada: ' . $d['nome'] . '.';
            }
            if ((int) $o['etapas_total'] + count($nomes) > 80) throw HttpErro::invalido(['nome' => 'Uma OS pode ter até 80 etapas.']);
            foreach ($nomes as $n) Db::run('INSERT INTO os_etapas (tenant_id, os_id, ordem, nome) VALUES (?,?,?,?)', [$t, $id, ++$ordem, $n]);
            R::registrarProgresso($t, $id);
            R::evento($t, $o, 'etapas', $texto);
            return self::detalhe(R::carregar($id));
        });
    }

    /** Marca a etapa (situação, percentual, observação) ou muda o nome. */
    public static function editarEtapa(Requisicao $r, int $id, int $eid): array
    {
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $id, $eid, $t) {
            $o = R::carregar($id, true);
            $e = self::etapa($t, $id, $eid);
            $d = $r->corpo;
            $v = (new Validar($d))->texto('observacao', false, 2000);
            $mudaNome = array_key_exists('nome', $d) && trim((string) $d['nome']) !== $e['nome'];
            $mudaSituacao = array_key_exists('situacao', $d);
            if ($mudaNome) {
                if (!R::podeEditarEtapas($o)) throw new HttpErro(409, 'As etapas desta OS não podem ser alteradas por você agora.');
                $v->texto('nome', true, 150, 2);
            }
            if ($mudaSituacao && !R::podeMarcarEtapas($o)) {
                throw new HttpErro(409, $o['status'] === 'aberta' && R::podeExecutar($o)
                    ? 'Inicie a Ordem de Serviço para marcar as etapas.' : 'As etapas desta OS não podem ser marcadas por você agora.');
            }
            $sit = $mudaSituacao ? $d['situacao'] : $e['situacao'];
            if (!isset(R::SITUACOES[$sit])) $v->erro('situacao', 'Escolha a situação da etapa.');
            $pct = match ($sit) { 'ok' => 100, 'andamento' => (int) ($d['percentual'] ?? $e['percentual']), default => 0 };
            if ($sit === 'andamento' && ($pct < 1 || $pct > 99)) $v->erro('percentual', 'Em andamento: informe de 1% a 99%.');
            $obs = array_key_exists('observacao', $d) ? (is_string($d['observacao']) ? trim($d['observacao']) : null) : $e['observacao'];
            if ($sit === 'nao_ok' && !$obs) $v->erro('observacao', 'Diga o que não está OK: isso vira uma pendência.');
            $ok = $v->ok();
            $nome = $mudaNome ? $ok['nome'] : $e['nome'];
            $obs = $obs === '' ? null : $obs;

            Db::run('UPDATE os_etapas SET nome = ?, situacao = ?, percentual = ?, observacao = ?, atualizado_por = ?, atualizado_em = NOW() WHERE tenant_id = ? AND id = ?',
                [$nome, $sit, $pct, $obs, Sessao::usuario()['id'], $t, $eid]);
            if ($sit !== $e['situacao'] || ($sit === 'andamento' && $pct !== (int) $e['percentual'])) {
                $rotulo = R::SITUACOES[$sit] . ($sit === 'andamento' ? " ($pct%)" : '');
                R::evento($t, $o, 'etapa', $nome . ': ' . $rotulo . ($obs && $sit !== 'ok' ? ' — ' . rtrim($obs, '.') : '') . '.');
            }
            self::sincronizarPendencia($t, $o, $eid, $sit, $obs, $e['situacao']);
            R::registrarProgresso($t, $id);
            return self::detalhe(R::carregar($id));
        });
    }

    /** Não OK abre (ou atualiza) a pendência da etapa; sair do Não OK resolve a pendência aberta. */
    private static function sincronizarPendencia(int $t, array $o, int $eid, string $sit, ?string $obs, string $antes): void
    {
        $aberta = Db::one("SELECT * FROM os_pendencias WHERE tenant_id = ? AND etapa_id = ? AND status = 'aberta'", [$t, $eid]);
        $eu = Sessao::usuario()['id'];
        if ($sit === 'nao_ok') {
            if ($aberta) Db::run('UPDATE os_pendencias SET descricao = ? WHERE id = ?', [$obs, $aberta['id']]);
            else Db::run('INSERT INTO os_pendencias (tenant_id, os_id, etapa_id, descricao, aberta_por) VALUES (?,?,?,?,?)', [$t, $o['id'], $eid, $obs, $eu]);
        } elseif ($aberta) {
            $texto = $sit === 'ok' ? ($obs ?: 'Etapa refeita e marcada como OK.') : 'Etapa marcada como "' . R::SITUACOES[$sit] . '".';
            Db::run("UPDATE os_pendencias SET status = 'resolvida', resolvida_por = ?, resolvida_em = NOW(), resolucao = ? WHERE id = ?", [$eu, $texto, $aberta['id']]);
        }
    }

    public static function excluirEtapa(Requisicao $r, int $id, int $eid): array
    {
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($id, $eid, $t) {
            $o = R::carregar($id, true);
            if (!R::podeEditarEtapas($o)) throw new HttpErro(409, 'As etapas desta OS não podem ser alteradas por você agora.');
            $e = self::etapa($t, $id, $eid);
            if ($e['situacao'] !== 'pendente' || Db::one('SELECT 1 FROM os_pendencias WHERE tenant_id = ? AND etapa_id = ?', [$t, $eid])) {
                throw new HttpErro(409, 'Só dá para tirar etapas que ainda não foram marcadas. Se ela não vale para esta OS, marque "Não se aplica".');
            }
            Db::run("UPDATE anexos SET excluido_em = NOW() WHERE tenant_id = ? AND dono_tipo = 'os_etapa' AND dono_id = ? AND excluido_em IS NULL", [$t, $eid]);
            Db::run('DELETE FROM os_etapas WHERE tenant_id = ? AND id = ?', [$t, $eid]);
            R::registrarProgresso($t, $id);
            R::evento($t, $o, 'etapas', 'Etapa retirada: ' . $e['nome'] . '.');
            return self::detalhe(R::carregar($id));
        });
    }

    public static function ordenarEtapas(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        $o = R::carregar($id);
        if (!R::podeEditarEtapas($o)) throw new HttpErro(409, 'As etapas desta OS não podem ser alteradas por você agora.');
        $ids = array_map('intval', (new Validar($r->corpo))->lista('ordem'));
        $atuais = array_map('intval', array_column(Db::all('SELECT id FROM os_etapas WHERE tenant_id = ? AND os_id = ?', [$t, $id]), 'id'));
        $a = $ids; sort($a); $b = $atuais; sort($b);
        if ($a !== $b) throw HttpErro::invalido(['ordem' => 'A lista de etapas mudou. Atualize a página.']);
        foreach ($ids as $i => $eid) Db::run('UPDATE os_etapas SET ordem = ? WHERE tenant_id = ? AND id = ?', [$i + 1, $t, $eid]);
        return self::detalhe(R::carregar($id));
    }

    public static function fotoEtapa(Requisicao $r, int $id, int $eid): array
    {
        $t = Sessao::tenantId();
        $o = R::carregar($id);
        self::etapa($t, $id, $eid);
        if (!R::podeExecutar($o) || $o['status'] === 'cancelada') throw HttpErro::proibido();
        $a = Anexos::salvar($t, 'os_etapa', $eid, 'foto', $r->corpo['arquivo'] ?? null, is_string($r->corpo['nome'] ?? null) ? $r->corpo['nome'] : null);
        $legenda = (new Validar($r->corpo))->texto('legenda', false, 200)->ok()['legenda'];
        if ($legenda) Db::run('UPDATE anexos SET legenda = ? WHERE id = ?', [$legenda, $a['id']]);
        return self::detalhe(R::carregar($id));
    }

    public static function excluirFotoEtapa(Requisicao $r, int $id, int $eid, int $aid): array
    {
        $t = Sessao::tenantId();
        $o = R::carregar($id);
        self::etapa($t, $id, $eid);
        $a = Db::one("SELECT * FROM anexos WHERE tenant_id = ? AND id = ? AND dono_tipo = 'os_etapa' AND dono_id = ? AND excluido_em IS NULL", [$t, $aid, $eid]);
        if (!$a) throw HttpErro::naoEncontrado('Foto');
        if (in_array($o['status'], R::FINAIS, true)) throw new HttpErro(409, 'Esta Ordem de Serviço já foi finalizada.');
        if ((int) $a['criado_por'] !== Sessao::usuario()['id'] && !Chamados::podeTriar($o)) throw HttpErro::proibido();
        Anexos::excluir($t, $aid);
        return self::detalhe(R::carregar($id));
    }

    // ---------------------------------------------------------------- pendências

    public static function resolverPendencia(Requisicao $r, int $id, int $pid): array
    {
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $id, $pid, $t) {
            $o = R::carregar($id, true);
            if (!R::podeResolverPendencia($o)) throw HttpErro::proibido();
            $p = Db::one('SELECT * FROM os_pendencias WHERE tenant_id = ? AND os_id = ? AND id = ?', [$t, $id, $pid]);
            if (!$p) throw HttpErro::naoEncontrado('Pendência');
            if ($p['status'] !== 'aberta') throw new HttpErro(409, 'Esta pendência já foi resolvida.');
            $d = (new Validar($r->corpo))->texto('texto', true, 2000, 3)->ok();
            $eu = Sessao::usuario()['id'];
            Db::run("UPDATE os_pendencias SET status = 'resolvida', resolvida_por = ?, resolvida_em = NOW(), resolucao = ? WHERE id = ?", [$eu, $d['texto'], $pid]);
            // A etapa passa a OK: o que faltava foi feito.
            Db::run("UPDATE os_etapas SET situacao = 'ok', percentual = 100, atualizado_por = ?, atualizado_em = NOW() WHERE tenant_id = ? AND id = ?", [$eu, $t, $p['etapa_id']]);
            $nome = Db::one('SELECT nome FROM os_etapas WHERE id = ?', [$p['etapa_id']])['nome'];
            R::evento($t, $o, 'pendencia_resolvida', $nome . ': ' . $d['texto']);
            R::registrarProgresso($t, $id);
            Auditoria::registrar('resolver_pendencia', 'ordens_servico', $id, ['pendencia_id' => $pid], ['resolucao' => $d['texto']]);
            return self::detalhe(R::carregar($id));
        });
    }

    // ---------------------------------------------------------------- gastos (obra)

    public static function lancarGasto(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $id, $t) {
            $o = R::carregar($id, true);
            if (!in_array('lancar_gasto', R::acoes($o), true)) {
                throw new HttpErro(409, $o['tipo'] !== 'obra' ? 'Gastos são lançados só nas obras.'
                    : ($o['status'] === 'aberta' ? 'Os gastos começam a ser lançados quando a obra é iniciada.' : 'Você não pode lançar gastos nesta obra.'));
            }
            $v = (new Validar($r->corpo))->texto('descricao', true, 300, 3)->texto('fornecedor', false, 150);
            $cat = $r->corpo['categoria'] ?? null;
            if (!isset(R::CATEGORIAS_GASTO[$cat])) $v->erro('categoria', 'Escolha o tipo do gasto.');
            $valor = self::valor($r->corpo, 'valor', $v, 'Informe o valor.');
            if ($valor !== null && $valor <= 0) $v->erro('valor', 'O valor precisa ser maior que zero.');
            $data = self::data($r->corpo, 'data', $v) ?? date('Y-m-d');
            if ($data > date('Y-m-d')) $v->erro('data', 'A data não pode ser no futuro.');
            $d = $v->ok();
            // Passar do teto é aceito (o dinheiro já foi gasto), mas a obra fica em vermelho até os Procuradores aprovarem um teto novo.
            $saldo = (float) $o['teto'] - (float) $o['gasto'];
            $passou = $valor > $saldo + 0.004 && $saldo >= -0.004;
            $gid = Db::insert('INSERT INTO os_gastos (tenant_id, os_id, data, categoria, descricao, fornecedor, valor, lancado_por) VALUES (?,?,?,?,?,?,?,?)',
                [$t, $id, $data, $cat, $d['descricao'], $d['fornecedor'], $valor, Sessao::usuario()['id']]);
            if (!empty($r->corpo['comprovante'])) {
                Anexos::salvar($t, 'os_gasto', $gid, 'nota', $r->corpo['comprovante'],
                    is_string($r->corpo['comprovante_nome'] ?? null) ? $r->corpo['comprovante_nome'] : null, true);
            }
            R::evento($t, $o, 'gasto', R::CATEGORIAS_GASTO[$cat] . ': ' . $d['descricao'], $valor);
            if ($passou) R::evento($t, $o, 'acima_teto', 'A obra passou do teto em ' . self::reais($valor - $saldo) . '. É preciso pedir um teto novo aos Procuradores.');
            Auditoria::registrar('lancar_gasto', 'ordens_servico', $id, null, ['gasto_id' => $gid, 'valor' => $valor, 'categoria' => $cat]);
            return self::detalhe(R::carregar($id));
        });
    }

    public static function estornarGasto(Requisicao $r, int $id, int $gid): array
    {
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $id, $gid, $t) {
            $o = R::carregar($id, true);
            if (!Acesso::tem('obras.gastos') || $o['tipo'] !== 'obra' || in_array($o['status'], R::FINAIS, true)) throw new HttpErro(409, 'Não é possível estornar gastos desta OS.');
            $g = Db::one('SELECT * FROM os_gastos WHERE tenant_id = ? AND os_id = ? AND id = ?', [$t, $id, $gid]);
            if (!$g) throw HttpErro::naoEncontrado('Gasto');
            if ($g['estornado_em']) throw new HttpErro(409, 'Este gasto já foi estornado.');
            $d = (new Validar($r->corpo))->texto('texto', true, 300, 5)->ok();
            Db::run('UPDATE os_gastos SET estornado_em = NOW(), estornado_por = ?, motivo_estorno = ? WHERE id = ?', [Sessao::usuario()['id'], $d['texto'], $gid]);
            R::evento($t, $o, 'estorno', $g['descricao'] . ' — ' . $d['texto'], (float) $g['valor']);
            Auditoria::registrar('estornar_gasto', 'ordens_servico', $id, ['gasto_id' => $gid, 'valor' => $g['valor']], ['motivo' => $d['texto']]);
            return self::detalhe(R::carregar($id));
        });
    }

    // ---------------------------------------------------------------- modelos de etapas

    public static function listarModelos(Requisicao $r): array
    {
        Acesso::exigir('chamados.ver');
        $t = Sessao::tenantId();
        $todos = Acesso::tem('etapas.modelos') && ($r->query['todos'] ?? '') === '1';
        $modelos = Db::all('SELECT * FROM etapas_modelos WHERE tenant_id = ?' . ($todos ? '' : ' AND ativo = 1') . ' ORDER BY ativo DESC, nome', [$t]);
        $itens = [];
        foreach (Db::all('SELECT modelo_id, nome FROM etapas_modelos_itens WHERE tenant_id = ? ORDER BY ordem, id', [$t]) as $i) $itens[(int) $i['modelo_id']][] = $i['nome'];
        return array_map(fn($m) => ['id' => (int) $m['id'], 'nome' => $m['nome'], 'ativo' => (bool) $m['ativo'], 'etapas' => $itens[(int) $m['id']] ?? []], $modelos);
    }

    public static function criarModelo(Requisicao $r): never
    {
        Acesso::exigir('etapas.modelos');
        $t = Sessao::tenantId();
        [$nome, $etapas] = self::validarModelo($t, $r->corpo);
        $id = Db::transacao(function () use ($t, $nome, $etapas) {
            $id = Db::insert('INSERT INTO etapas_modelos (tenant_id, nome) VALUES (?,?)', [$t, $nome]);
            foreach ($etapas as $i => $e) Db::run('INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) VALUES (?,?,?,?)', [$t, $id, $i + 1, $e]);
            Auditoria::registrar('criar', 'etapas_modelos', $id, null, ['nome' => $nome, 'etapas' => $etapas]);
            return $id;
        });
        Resposta::json(self::modelo($t, $id), 201);
    }

    public static function editarModelo(Requisicao $r, int $id): array
    {
        Acesso::exigir('etapas.modelos');
        $t = Sessao::tenantId();
        $antes = Db::one('SELECT * FROM etapas_modelos WHERE tenant_id = ? AND id = ?', [$t, $id]);
        if (!$antes) throw HttpErro::naoEncontrado('Modelo');
        [$nome, $etapas] = self::validarModelo($t, $r->corpo, $id);
        $ativo = array_key_exists('ativo', $r->corpo) ? (filter_var($r->corpo['ativo'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0) : (int) $antes['ativo'];
        Db::transacao(function () use ($t, $id, $nome, $etapas, $ativo, $antes) {
            Db::run('UPDATE etapas_modelos SET nome = ?, ativo = ? WHERE tenant_id = ? AND id = ?', [$nome, $ativo, $t, $id]);
            // Mudar o modelo não mexe nas OS que já usaram: as etapas foram copiadas para elas.
            Db::run('DELETE FROM etapas_modelos_itens WHERE tenant_id = ? AND modelo_id = ?', [$t, $id]);
            foreach ($etapas as $i => $e) Db::run('INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) VALUES (?,?,?,?)', [$t, $id, $i + 1, $e]);
            Auditoria::registrar('editar', 'etapas_modelos', $id, ['nome' => $antes['nome'], 'ativo' => $antes['ativo']], ['nome' => $nome, 'ativo' => $ativo, 'etapas' => $etapas]);
        });
        return self::modelo($t, $id);
    }

    private static function validarModelo(int $t, array $corpo, ?int $id = null): array
    {
        $v = (new Validar($corpo))->texto('nome', true, 80, 2);
        $etapas = array_values(array_filter(array_map(fn($e) => is_string($e) ? mb_substr(trim($e), 0, 150) : '', $v->lista('etapas')), fn($e) => mb_strlen($e) >= 2));
        if (!$etapas) $v->erro('etapas', 'Coloque pelo menos uma etapa.');
        if (count($etapas) > 60) $v->erro('etapas', 'Um modelo pode ter até 60 etapas.');
        if (is_string($corpo['nome'] ?? null) && Db::one('SELECT id FROM etapas_modelos WHERE tenant_id = ? AND nome = ? AND id <> ?', [$t, trim($corpo['nome']), $id ?? 0])) {
            $v->erro('nome', 'Já existe um modelo com este nome.');
        }
        $d = $v->ok();
        return [$d['nome'], $etapas];
    }

    private static function modelo(int $t, int $id): array
    {
        $m = Db::one('SELECT * FROM etapas_modelos WHERE tenant_id = ? AND id = ?', [$t, $id]);
        return ['id' => (int) $m['id'], 'nome' => $m['nome'], 'ativo' => (bool) $m['ativo'],
            'etapas' => array_column(Db::all('SELECT nome FROM etapas_modelos_itens WHERE tenant_id = ? AND modelo_id = ? ORDER BY ordem, id', [$t, $id]), 'nome')];
    }

    // ---------------------------------------------------------------- montagem

    private static function item(array $o): array
    {
        $ve = $o['tipo'] !== 'obra' || Acesso::tem('obras.valores');
        $teto = $o['teto'] === null ? null : (float) $o['teto'];
        $gasto = (float) $o['gasto'];
        $obra = $o['tipo'] === 'obra';
        return [
            'id'            => (int) $o['id'],
            'numero'        => (int) $o['numero'],
            'rotulo'        => R::numeroFormatado((int) $o['numero']),
            'tipo'          => $o['tipo'],
            'tipo_nome'     => $obra ? 'Obra' : 'Serviço',
            'status'        => $o['status'],
            'status_nome'   => R::STATUS[$o['status']],
            'titulo'        => $o['titulo'],
            'chamado'       => ['id' => (int) $o['chamado_id'], 'numero' => (int) $o['chamado_numero'], 'status' => $o['chamado_status']],
            'casa'          => ['id' => (int) $o['casa_id'], 'nome' => $o['casa_nome'], 'codigo' => $o['casa_codigo'], 'grupo' => $o['grupo_nome']],
            'categoria'     => ['nome' => $o['categoria_nome'] ?? 'Sem tipo', 'icone' => $o['categoria_icone'] ?? 'outros'],
            'area'          => $o['area_id'] === null ? null : ['id' => (int) $o['area_id'], 'nome' => $o['area_nome']],
            'prioridade'    => $o['prioridade'],
            'urgente'       => (bool) $o['urgente'],
            'responsavel'   => $o['responsavel_id'] ? ['id' => (int) $o['responsavel_id'], 'nome' => $o['responsavel_nome']] : null,
            'progresso'     => $o['progresso'] === null ? null : (float) $o['progresso'],
            'etapas_total'  => (int) $o['etapas_total'],
            'etapas_abertas'=> (int) $o['etapas_abertas'],
            'pendencias_abertas' => (int) $o['pendencias_abertas'],
            'pedido_pendente' => $o['pedido_pendente_id'] !== null,
            'teto'          => $obra && $ve ? $teto : null,
            'gasto'         => $obra && $ve ? $gasto : null,
            'saldo'         => $obra && $ve && $teto !== null ? round($teto - $gasto, 2) : null,
            'percentual_gasto' => $obra && $ve && $teto ? round($gasto / $teto, 4) : null,
            'acima_teto'    => $obra && $ve ? R::acimaDoTeto($o) : null,
            'previsao_inicio' => $o['previsao_inicio'],
            'previsao_fim'  => $o['previsao_fim'],
            'iniciada_em'   => $o['iniciada_em'],
            'concluida_em'  => $o['concluida_em'],
            'criado_em'     => $o['criado_em'],
            'atualizado_em' => $o['atualizado_em'],
        ];
    }

    private static function detalhe(array $o): array
    {
        $t = Sessao::tenantId();
        $obra = $o['tipo'] === 'obra';
        $ve = !$obra || Acesso::tem('obras.valores');
        $acoes = R::acoes($o);
        if (!$ve) $acoes = array_values(array_diff($acoes, ['decidir_teto', 'pedir_teto', 'lancar_gasto']));
        $eu = Sessao::usuario()['id'];
        $final = in_array($o['status'], R::FINAIS, true);
        $triar = Chamados::podeTriar($o);

        $fotos = [];
        $ids = array_column(Db::all('SELECT id FROM os_etapas WHERE tenant_id = ? AND os_id = ?', [$t, $o['id']]), 'id');
        if ($ids) {
            foreach (Db::all("SELECT a.*, u.nome AS autor FROM anexos a LEFT JOIN usuarios u ON u.id = a.criado_por
                               WHERE a.tenant_id = ? AND a.dono_tipo = 'os_etapa' AND a.excluido_em IS NULL AND a.dono_id IN " . Db::in($ids) . ' ORDER BY a.id',
                         array_merge([$t], $ids)) as $a) {
                $x = Anexos::publico($a);
                $x['pode_apagar'] = !$final && ((int) $a['criado_por'] === $eu || $triar);
                $fotos[(int) $a['dono_id']][] = $x;
            }
        }
        $pendencias = Db::all('SELECT p.*, e.nome AS etapa_nome, ua.nome AS aberta_por_nome, ur.nome AS resolvida_por_nome FROM os_pendencias p
                                 JOIN os_etapas e ON e.id = p.etapa_id JOIN usuarios ua ON ua.id = p.aberta_por LEFT JOIN usuarios ur ON ur.id = p.resolvida_por
                                WHERE p.tenant_id = ? AND p.os_id = ? ORDER BY p.status = \'resolvida\', p.id DESC', [$t, $o['id']]);
        $porEtapa = [];
        foreach ($pendencias as $p) if ($p['status'] === 'aberta') $porEtapa[(int) $p['etapa_id']] = (int) $p['id'];
        $etapas = array_map(fn($e) => [
            'id' => (int) $e['id'], 'ordem' => (int) $e['ordem'], 'nome' => $e['nome'], 'situacao' => $e['situacao'],
            'situacao_nome' => R::SITUACOES[$e['situacao']], 'percentual' => (int) $e['percentual'], 'observacao' => $e['observacao'],
            'atualizado_por' => $e['atualizado_por_nome'], 'atualizado_em' => $e['atualizado_em'],
            'pendencia_id' => $porEtapa[(int) $e['id']] ?? null, 'fotos' => $fotos[(int) $e['id']] ?? [],
        ], Db::all('SELECT e.*, u.nome AS atualizado_por_nome FROM os_etapas e LEFT JOIN usuarios u ON u.id = e.atualizado_por
                     WHERE e.tenant_id = ? AND e.os_id = ? ORDER BY e.ordem, e.id', [$t, $o['id']]));
        $contagem = array_fill_keys(array_keys(R::SITUACOES), 0);
        foreach ($etapas as $e) $contagem[$e['situacao']]++;

        $extra = [
            'chamado'         => [
                'id' => (int) $o['chamado_id'], 'numero' => (int) $o['chamado_numero'], 'status' => $o['chamado_status'],
                'status_nome' => Chamados::STATUS[$o['chamado_status']], 'descricao' => $o['chamado_descricao'], 'local' => $o['local'],
                'servico' => $o['servico_descricao'], 'em_reaprovacao' => (bool) $o['em_reaprovacao'],
                'valor_aprovado' => $ve && $o['valor_aprovado'] !== null ? (float) $o['valor_aprovado'] : null,
                'valor_estimado' => $ve && $o['valor_estimado'] !== null ? (float) $o['valor_estimado'] : null,
            ],
            'relatorio_final' => $o['relatorio_final'],
            'acoes'           => $acoes,
            'para_mim'        => R::paraMim($o, $acoes),
            've_valores'      => $ve,
            'pode_editar_etapas' => R::podeEditarEtapas($o),
            'pode_marcar_etapas' => R::podeMarcarEtapas($o),
            'pode_resolver_pendencias' => R::podeResolverPendencia($o),
            'pode_enviar_fotos' => R::podeExecutar($o) && $o['status'] !== 'cancelada',
            'etapas'          => $etapas,
            'contagem'        => $contagem,
            'pendencias'      => array_map(fn($p) => self::pendenciaTipada($p), $pendencias),
            'evolucao'        => R::evolucao($t, (int) $o['id']),
            'situacoes'       => R::SITUACOES,
        ];
        if ($obra && $ve) {
            $gastos = Db::all('SELECT g.*, u.nome AS lancado_por_nome, ue.nome AS estornado_por_nome,
                                      (SELECT a.id FROM anexos a WHERE a.tenant_id = g.tenant_id AND a.dono_tipo = \'os_gasto\' AND a.dono_id = g.id AND a.excluido_em IS NULL LIMIT 1) AS comprovante_id
                                 FROM os_gastos g JOIN usuarios u ON u.id = g.lancado_por LEFT JOIN usuarios ue ON ue.id = g.estornado_por
                                WHERE g.tenant_id = ? AND g.os_id = ? ORDER BY g.data DESC, g.id DESC', [$t, $o['id']]);
            $porCategoria = array_fill_keys(array_keys(R::CATEGORIAS_GASTO), 0.0);
            foreach ($gastos as $g) if (!$g['estornado_em']) $porCategoria[$g['categoria']] += (float) $g['valor'];
            $extra['gastos'] = array_map(fn($g) => [
                'id' => (int) $g['id'], 'data' => $g['data'], 'categoria' => $g['categoria'], 'descricao' => $g['descricao'],
                'fornecedor' => $g['fornecedor'], 'valor' => (float) $g['valor'], 'lancado_por' => $g['lancado_por_nome'], 'criado_em' => $g['criado_em'],
                'estornado' => $g['estornado_em'] !== null, 'motivo_estorno' => $g['motivo_estorno'], 'estornado_por' => $g['estornado_por_nome'],
                'comprovante_url' => $g['comprovante_id'] ? '/api/anexos/' . $g['comprovante_id'] : null,
            ], $gastos);
            $extra['por_categoria'] = array_map(fn($v) => round($v, 2), $porCategoria);
            $extra['categorias_gasto'] = R::CATEGORIAS_GASTO;
            $extra['alerta'] = R::ALERTA;
            $extra['pode_estornar'] = Acesso::tem('obras.gastos') && !$final;
            $extra['tetos'] = array_map(fn($p) => [
                'id' => (int) $p['id'], 'valor_anterior' => $p['valor_anterior'] === null ? null : (float) $p['valor_anterior'],
                'valor_novo' => (float) $p['valor_novo'], 'motivo' => $p['motivo'], 'status' => $p['status'],
                'pedido_por' => $p['pedido_por_nome'], 'decidido_por' => $p['decidido_por_nome'], 'decidido_em' => $p['decidido_em'],
                'resposta' => $p['resposta'], 'criado_em' => $p['criado_em'],
            ], Db::all('SELECT t.*, up.nome AS pedido_por_nome, ud.nome AS decidido_por_nome FROM os_tetos t
                          JOIN usuarios up ON up.id = t.pedido_por LEFT JOIN usuarios ud ON ud.id = t.decidido_por
                         WHERE t.tenant_id = ? AND t.os_id = ? ORDER BY t.id DESC', [$t, $o['id']]));
            $extra['pedido_pendente_detalhe'] = array_values(array_filter($extra['tetos'], fn($p) => $p['status'] === 'pendente'))[0] ?? null;
        }
        return array_replace(self::item($o), $extra);
    }

    private static function pendenciaTipada(array $p): array
    {
        return [
            'id' => (int) $p['id'], 'etapa_id' => (int) $p['etapa_id'], 'etapa' => $p['etapa_nome'], 'descricao' => $p['descricao'],
            'status' => $p['status'], 'aberta_por' => $p['aberta_por_nome'], 'criado_em' => $p['criado_em'],
            'resolvida_por' => $p['resolvida_por_nome'], 'resolvida_em' => $p['resolvida_em'], 'resolucao' => $p['resolucao'],
        ];
    }

    private static function etapa(int $t, int $osId, int $eid): array
    {
        $e = Db::one('SELECT * FROM os_etapas WHERE tenant_id = ? AND os_id = ? AND id = ?', [$t, $osId, $eid]);
        if (!$e) throw HttpErro::naoEncontrado('Etapa');
        return $e;
    }

    private static function retrato(array $o): array
    {
        return array_intersect_key($o, array_flip(['status', 'teto', 'gasto', 'progresso', 'pedido_pendente_id']));
    }

    private static function valor(array $d, string $campo, Validar $v, string $msg): ?float
    {
        $x = Validar::reais($d[$campo] ?? null);
        if ($x === null || $x < 0 || $x > 99999999) { $v->erro($campo, $msg); return null; }
        return $x;
    }

    private static function data(array $d, string $campo, Validar $v): ?string
    {
        $x = $d[$campo] ?? null;
        if ($x === null || $x === '') return null;
        $dt = is_string($x) ? \DateTime::createFromFormat('!Y-m-d', $x) : false;
        if (!$dt || $dt->format('Y-m-d') !== $x) { $v->erro($campo, 'Data inválida.'); return null; }
        return $x;
    }

    private static function reais(float $v): string
    {
        return 'R$ ' . number_format($v, 2, ',', '.');
    }
}
