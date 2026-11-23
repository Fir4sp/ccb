<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Anexos, Auditoria, Catalogo, Chamados as R, Db, HttpErro, Ordens, Requisicao, Resposta, Sessao, Validar};

/** Chamados de manutenção. As regras do fluxo ficam em Ccb\Chamados; a execução, na Ordem de Serviço (Ccb\Ordens). */
final class ChamadosControlador
{
    private const POR_PAGINA = 50;

    // ---------------------------------------------------------------- listas

    public static function listar(Requisicao $r): array
    {
        Acesso::exigir('chamados.ver');
        $t = Sessao::tenantId();
        [$vis, $pv] = R::filtroVisiveis();
        if ($vis === '0') return ['pagina' => 1, 'itens' => [], 'total' => 0];

        $sql = R::SELECT . ' WHERE ch.tenant_id = ? AND ' . $vis;
        $p = array_merge([$t], $pv);
        $filtro = is_string($r->query['filtro'] ?? null) ? $r->query['filtro'] : 'abertos';
        if ($filtro === 'abertos' || $filtro === 'para_mim') {
            $sql .= ' AND ch.status NOT IN ' . Db::in(R::FINAIS);
            $p = array_merge($p, R::FINAIS);
        } elseif ($filtro === 'encerrados') {
            $sql .= ' AND ch.status IN ' . Db::in(R::FINAIS);
            $p = array_merge($p, R::FINAIS);
        }
        if (!empty($r->query['status']) && isset(R::STATUS[$r->query['status']])) {
            $sql .= ' AND ch.status = ?';
            $p[] = $r->query['status'];
        }
        if (($r->query['area_id'] ?? '') === 'sem') {
            $sql .= ' AND ch.area_id IS NULL';
        } elseif (!empty($r->query['area_id']) && ctype_digit((string) $r->query['area_id'])) {
            $sql .= ' AND ch.area_id = ?';
            $p[] = (int) $r->query['area_id'];
        }
        if (!empty($r->query['tipo']) && isset(R::TIPOS[$r->query['tipo']])) {
            $sql .= ' AND ch.tipo = ?';
            $p[] = $r->query['tipo'];
        }
        if (!empty($r->query['casa_id']) && ctype_digit((string) $r->query['casa_id'])) {
            $sql .= ' AND ch.casa_id = ?';
            $p[] = (int) $r->query['casa_id'];
        }
        if (!empty($r->query['grupo_id']) && ctype_digit((string) $r->query['grupo_id'])) {
            $sql .= ' AND c.grupo_id = ?';
            $p[] = (int) $r->query['grupo_id'];
        }
        if (!empty($r->query['busca']) && is_string($r->query['busca'])) {
            $b = trim($r->query['busca']);
            $num = ltrim($b, '#');
            if (preg_match('/^os\s*0*(\d+)$/i', $b, $mOs)) {
                $sql .= ' AND os.numero = ?';
                $p[] = (int) $mOs[1];
            } elseif (ctype_digit($num)) {
                $sql .= ' AND ch.numero = ?';
                $p[] = (int) $num;
            } else {
                $sql .= ' AND (ch.titulo LIKE ? OR ch.descricao LIKE ? OR c.nome LIKE ?)';
                $like = '%' . addcslashes(mb_substr($b, 0, 60), '%_\\') . '%';
                array_push($p, $like, $like, $like);
            }
        }
        // Urgentes e emergências primeiro; depois os mais recentes.
        $ordem = " ORDER BY (ch.status IN ('encerrado','cancelado')), (ch.prioridade = 'emergencia') DESC, ch.urgente DESC, ch.atualizado_em DESC";
        $pagina = max(1, (int) ($r->query['pagina'] ?? 1));

        if ($filtro === 'para_mim') {
            $linhas = array_values(array_filter(Db::all($sql . $ordem, $p), fn($c) => R::paraMim($c)));
            $total = count($linhas);
            $linhas = array_slice($linhas, ($pagina - 1) * self::POR_PAGINA, self::POR_PAGINA);
        } else {
            $total = (int) Db::one('SELECT COUNT(*) n FROM (' . $sql . ') x', $p)['n'];
            $linhas = Db::all($sql . $ordem . ' LIMIT ' . self::POR_PAGINA . ' OFFSET ' . (($pagina - 1) * self::POR_PAGINA), $p);
        }
        $andamento = self::andamentos($t, array_filter(array_map(fn($c) => $c['os_id'] === null ? null : (int) $c['os_id'], $linhas)));
        $fotos = self::primeirasFotos($t, array_map(fn($c) => (int) $c['id'], $linhas));
        return [
            'pagina' => $pagina,
            'total'  => $total,
            'itens'  => array_map(fn($c) => self::resumoItem($c, $andamento) + ['foto_url' => $fotos[(int) $c['id']] ?? null, 'para_mim' => R::paraMim($c)], $linhas),
        ];
    }

    /** Contadores para a tela inicial. */
    public static function resumo(Requisicao $r): array
    {
        if (!Acesso::tem('chamados.ver')) return ['para_mim' => 0, 'abertos' => 0, 'urgentes' => 0, 'por_status' => []];
        $t = Sessao::tenantId();
        [$vis, $pv] = R::filtroVisiveis();
        if ($vis === '0') return ['para_mim' => 0, 'abertos' => 0, 'urgentes' => 0, 'por_status' => [], 'por_tipo' => ['servico' => 0, 'obra' => 0], 'por_area' => []];
        $linhas = Db::all(R::SELECT . ' WHERE ch.tenant_id = ? AND ' . $vis . ' AND ch.status NOT IN ' . Db::in(R::FINAIS),
            array_merge([$t], $pv, R::FINAIS));
        $porStatus = [];
        $porTipo = ['servico' => 0, 'obra' => 0];
        $porArea = [];
        $paraMim = $urgentes = 0;
        foreach ($linhas as $c) {
            $porStatus[$c['status']] = ($porStatus[$c['status']] ?? 0) + 1;
            $porTipo[$c['tipo']]++;
            $k = $c['area_id'] === null ? 'sem' : (string) $c['area_id'];
            $porArea[$k] = ($porArea[$k] ?? 0) + 1;
            if (R::paraMim($c)) $paraMim++;
            if ((int) $c['urgente'] === 1 || $c['prioridade'] === 'emergencia') $urgentes++;
        }
        return ['para_mim' => $paraMim, 'abertos' => count($linhas), 'urgentes' => $urgentes, 'por_status' => $porStatus, 'por_tipo' => $porTipo, 'por_area' => $porArea];
    }

    public static function categorias(Requisicao $r): array
    {
        Acesso::exigir('chamados.ver');
        return self::tiparCategorias(Db::all('SELECT * FROM chamados_categorias WHERE tenant_id = ? AND ativo = 1 ORDER BY ordem, nome', [Sessao::tenantId()]));
    }

    /** Pessoas que podem ficar responsáveis por um chamado (para a triagem). */
    public static function responsaveis(Requisicao $r): array
    {
        Acesso::exigir('chamados.triar');
        return array_map(fn($u) => ['id' => (int) $u['id'], 'nome' => $u['nome'], 'perfis' => explode(',', $u['perfis'])], Db::all(
            "SELECT u.id, u.nome, GROUP_CONCAT(DISTINCT p.codigo) perfis
               FROM usuarios u JOIN usuarios_perfis up ON up.usuario_id = u.id JOIN perfis p ON p.id = up.perfil_id
              WHERE u.tenant_id = ? AND u.ativo = 1 AND p.codigo IN ('equipe_manutencao','engenharia','compras','coordenacao_manutencao','gestao_manutencao')
              GROUP BY u.id ORDER BY MIN(FIELD(p.codigo, 'equipe_manutencao','engenharia','compras','coordenacao_manutencao','gestao_manutencao')), u.nome",
            [Sessao::tenantId()]));
    }

    // ---------------------------------------------------------------- abrir e ver

    public static function abrir(Requisicao $r): never
    {
        Acesso::exigir('chamados.abrir');
        $t = Sessao::tenantId();
        $v = (new Validar($r->corpo))->inteiro('casa_id')->inteiro('categoria_id')->texto('local', false, 150)->texto('assunto', false, 200, 3)
            ->texto('descricao', true, 3000, 10)->booleano('urgente', false);
        $casaId = $r->corpo['casa_id'] ?? null;
        if (ctype_digit((string) $casaId) && !Acesso::podeVerCasa((int) $casaId)) $v->erro('casa_id', 'Escolha uma das suas casas.');
        $catId = $r->corpo['categoria_id'] ?? null;
        $cat = ctype_digit((string) $catId) ? Db::one('SELECT * FROM chamados_categorias WHERE tenant_id = ? AND id = ? AND ativo = 1', [$t, (int) $catId]) : null;
        if (ctype_digit((string) $catId) && !$cat) $v->erro('categoria_id', 'Escolha o tipo do problema.');
        // Quem faz a triagem (Coordenação, Gestão, Engenharia) já pode abrir dizendo que é obra.
        $tipo = Acesso::tem('chamados.triar') && ($r->corpo['tipo'] ?? null) === 'obra' ? 'obra' : 'servico';
        $d = $v->ok();

        // Assunto escrito por quem abre; sem assunto, o título é o tipo e o local.
        $titulo = $d['assunto'] ?: mb_substr($cat['nome'] . ($d['local'] ? ' — ' . $d['local'] : ''), 0, 200);
        $id = Db::transacao(function () use ($t, $d, $cat, $titulo, $tipo) {
            $numero = (int) Db::one('SELECT COALESCE(MAX(numero), 0) + 1 n FROM chamados WHERE tenant_id = ? FOR UPDATE', [$t])['n'];
            $id = Db::insert(
                'INSERT INTO chamados (tenant_id, numero, casa_id, categoria_id, tipo, titulo, local, descricao, urgente, exige_parecer, aberto_por)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                [$t, $numero, $d['casa_id'], $cat['id'], $tipo, $titulo, $d['local'], $d['descricao'], $d['urgente'], $cat['exige_parecer_seguranca'], Sessao::usuario()['id']]
            );
            R::evento($t, $id, 'abertura', null, 'aberto', trim(($tipo === 'obra' ? 'Aberto como obra. ' : '') . ($d['urgente'] ? 'Marcado como urgente.' : '')) ?: null);
            Auditoria::registrar('criar', 'chamados', $id, null, $d + ['numero' => $numero, 'tipo' => $tipo]);
            return $id;
        });
        Resposta::json(self::detalhe(R::carregar($id)), 201);
    }

    public static function ver(Requisicao $r, int $id): array
    {
        return self::detalhe(R::carregar($id));
    }

    // ---------------------------------------------------------------- ações do fluxo

    public static function acao(Requisicao $r, int $id): array
    {
        $acao = $r->corpo['acao'] ?? null;
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $id, $acao, $t) {
            $c = R::carregar($id, true);
            if (!is_string($acao) || !in_array($acao, R::acoes($c), true) || $acao === 'comentar') {
                // Ação que não cabe agora: o chamado mudou ou a pessoa não tem esse papel.
                throw new HttpErro(409, in_array($c['status'], R::FINAIS, true)
                    ? 'Este chamado já foi finalizado.'
                    : 'Esta ação não está disponível para você neste momento. Atualize a página.');
            }
            $metodo = 'acao' . str_replace('_', '', ucwords($acao, '_'));
            $antes = self::retrato($c);
            self::$metodo($t, $c, $r->corpo);
            $depois = R::carregar($id);
            Auditoria::registrar($acao, 'chamados', $id, $antes, self::retrato($depois));
            return self::detalhe($depois);
        });
    }

    private static function acaoTriar(int $t, array $c, array $d): void
    {
        $v = (new Validar($d))->texto('texto', false, 2000);
        $prio = $d['prioridade'] ?? null;
        if (!in_array($prio, R::PRIORIDADES, true)) $v->erro('prioridade', 'Escolha a prioridade.');
        $tipo = $d['tipo'] ?? $c['tipo'];
        if (!isset(R::TIPOS[$tipo])) $v->erro('tipo', 'Escolha se é serviço ou obra.');
        $area = self::validarArea($t, $d, $v);
        $resp = self::validarResponsavel($t, $d, $v, $area);
        $cat = self::validarTipoProblema($t, $d, $v, $c);
        $ok = $v->ok();
        Db::run("UPDATE chamados SET status = 'em_orcamento', prioridade = ?, responsavel_id = ?, area_id = ?, tipo = ?, categoria_id = ?,
                        exige_parecer = COALESCE((SELECT exige_parecer_seguranca FROM chamados_categorias WHERE id = ?), exige_parecer)
                  WHERE tenant_id = ? AND id = ?", [$prio, $resp, $area, $tipo, $cat, $cat, $t, $c['id']]);
        $nomeArea = $area ? Db::one('SELECT nome FROM areas WHERE id = ?', [$area])['nome'] : null;
        R::evento($t, (int) $c['id'], 'triagem', $c['status'], 'em_orcamento',
            'Tipo: ' . R::TIPOS[$tipo] . '.' . ($nomeArea ? " Encaminhado para $nomeArea." : '') . ($ok['texto'] ? "\n" . $ok['texto'] : ''), null);
    }

    private static function acaoMudarTipo(int $t, array $c, array $d): void
    {
        $tipo = $d['tipo'] ?? null;
        $v = (new Validar($d))->texto('texto', false, 2000);
        if (!isset(R::TIPOS[$tipo])) $v->erro('tipo', 'Escolha se é serviço ou obra.');
        elseif ($tipo === $c['tipo']) $v->erro('tipo', 'O chamado já é ' . mb_strtolower(R::TIPOS[$tipo]) . '.');
        $ok = $v->ok();
        Db::run('UPDATE chamados SET tipo = ? WHERE tenant_id = ? AND id = ?', [$tipo, $t, $c['id']]);
        R::evento($t, (int) $c['id'], 'tipo', null, null, 'Agora é ' . mb_strtolower(R::TIPOS[$tipo]) . '.' . ($ok['texto'] ? "\n" . $ok['texto'] : ''));
    }

    private static function acaoAtribuir(int $t, array $c, array $d): void
    {
        $v = (new Validar($d))->texto('texto', false, 2000);
        $area = array_key_exists('area_id', $d) ? self::validarArea($t, $d, $v) : ($c['area_id'] === null ? null : (int) $c['area_id']);
        $resp = self::validarResponsavel($t, $d, $v, $area);
        $ok = $v->ok();
        Db::run('UPDATE chamados SET responsavel_id = ?, area_id = ? WHERE tenant_id = ? AND id = ?', [$resp, $area, $t, $c['id']]);
        $nome = $resp ? Db::one('SELECT nome FROM usuarios WHERE id = ?', [$resp])['nome'] : null;
        $nomeArea = $area ? Db::one('SELECT nome FROM areas WHERE id = ?', [$area])['nome'] : null;
        $partes = [];
        if ($area !== ($c['area_id'] === null ? null : (int) $c['area_id'])) $partes[] = $nomeArea ? "Encaminhado para $nomeArea." : 'Tirado da área.';
        $partes[] = $nome ? "Responsável: $nome." : 'Sem responsável definido.';
        if ($ok['texto']) $partes[] = $ok['texto'];
        R::evento($t, (int) $c['id'], 'atribuicao', null, null, implode(' ', $partes));
    }

    private static function acaoEnviarOrcamento(int $t, array $c, array $d): void
    {
        $obra = $c['tipo'] === 'obra';
        $v = (new Validar($d))->texto('servico', true, 3000, 5);
        $valor = self::valor($d, 'valor', $v);
        if ($obra && $valor !== null && $valor <= 0) $v->erro('valor', 'O teto da obra precisa ser maior que zero.');
        $regras = R::regras($t);
        if (!$obra && $valor !== null && $valor > $regras['orcamento_obrigatorio_acima'] && !self::temAnexo($t, (int) $c['id'], 'orcamento')) {
            $v->erro('valor', 'Acima de R$ ' . number_format($regras['orcamento_obrigatorio_acima'], 2, ',', '.') . ', anexe o orçamento (foto ou PDF) antes de enviar.');
        }
        $ok = $v->ok();
        $nivel = R::nivelPara($valor, $regras, $c['tipo']);
        $parecerValido = in_array($c['parecer_seguranca'], ['favoravel', 'com_ressalvas'], true);
        $para = ((int) $c['exige_parecer'] === 1 && !$parecerValido) ? 'aguardando_parecer' : 'aguardando_aprovacao';
        Db::run('UPDATE chamados SET status = ?, valor_estimado = ?, servico_descricao = ?, nivel_aprovacao = ?, em_reaprovacao = 0,
                        parecer_seguranca = IF(parecer_seguranca = \'desfavoravel\', NULL, parecer_seguranca)
                  WHERE tenant_id = ? AND id = ?',
            [$para, $valor, $ok['servico'], $nivel, $t, $c['id']]);
        R::evento($t, (int) $c['id'], 'orcamento', $c['status'], $para,
            $ok['servico'] . "\n" . ($obra ? 'Teto pedido aos Procuradores.' : 'Aprovação: ' . R::NIVEL_NOME[$nivel] . '.'), $valor);
    }

    private static function acaoParecer(int $t, array $c, array $d): void
    {
        $res = $d['resultado'] ?? null;
        $v = (new Validar($d))->texto('texto', $res !== 'favoravel', 2000);
        if (!in_array($res, ['favoravel', 'com_ressalvas', 'desfavoravel'], true)) $v->erro('resultado', 'Escolha o parecer.');
        $ok = $v->ok();
        $para = $res === 'desfavoravel' ? 'em_orcamento' : 'aguardando_aprovacao';
        Db::run('UPDATE chamados SET status = ?, parecer_seguranca = ?, parecer_texto = ?, parecer_por = ?, parecer_em = NOW() WHERE tenant_id = ? AND id = ?',
            [$para, $res, $ok['texto'], Sessao::usuario()['id'], $t, $c['id']]);
        $rotulo = ['favoravel' => 'Favorável', 'com_ressalvas' => 'Favorável com ressalvas', 'desfavoravel' => 'Desfavorável'][$res];
        R::evento($t, (int) $c['id'], 'parecer', $c['status'], $para, $rotulo . ($ok['texto'] ? ': ' . $ok['texto'] : '.'));
    }

    private static function acaoAprovar(int $t, array $c, array $d): void
    {
        $ok = (new Validar($d))->texto('texto', false, 2000)->ok();
        $reaprovacao = (int) $c['em_reaprovacao'] === 1;
        $para = $reaprovacao ? 'em_execucao' : 'aprovado';
        Db::run('UPDATE chamados SET status = ?, valor_aprovado = valor_estimado, em_reaprovacao = 0, aprovado_por = ?, aprovado_em = NOW() WHERE tenant_id = ? AND id = ?',
            [$para, Sessao::usuario()['id'], $t, $c['id']]);
        R::evento($t, (int) $c['id'], $reaprovacao ? 'reaprovacao' : 'aprovacao', $c['status'], $para, $ok['texto'], (float) $c['valor_estimado']);
        if (!$reaprovacao && $c['os_id'] === null) {
            $osId = Ordens::criarParaChamado($t, $c);
            $n = (int) Db::one('SELECT numero FROM ordens_servico WHERE id = ?', [$osId])['numero'];
            R::evento($t, (int) $c['id'], 'os_gerada', null, null, Ordens::numeroFormatado($n) . ' aberta' . ($c['tipo'] === 'obra' ? ' (obra, com o teto aprovado).' : '.'));
        }
    }

    private static function acaoDevolver(int $t, array $c, array $d): void
    {
        $ok = (new Validar($d))->texto('texto', true, 2000)->ok();
        if ((int) $c['em_reaprovacao'] === 1) {
            // Aumento não aprovado: o serviço segue com o valor aprovado antes.
            Db::run("UPDATE chamados SET status = 'em_execucao', valor_estimado = valor_aprovado, em_reaprovacao = 0, nivel_aprovacao = ?
                      WHERE tenant_id = ? AND id = ?",
                [R::nivelPara((float) $c['valor_aprovado'], R::regras($t)), $t, $c['id']]);
            R::evento($t, (int) $c['id'], 'devolucao', $c['status'], 'em_execucao', 'Aumento não aprovado: ' . $ok['texto'], (float) $c['valor_aprovado']);
            return;
        }
        Db::run("UPDATE chamados SET status = 'em_orcamento' WHERE tenant_id = ? AND id = ?", [$t, $c['id']]);
        R::evento($t, (int) $c['id'], 'devolucao', $c['status'], 'em_orcamento', $ok['texto']);
    }

    private static function acaoAjustarValor(int $t, array $c, array $d): void
    {
        $v = (new Validar($d))->texto('texto', true, 2000, 5);
        $novo = self::valor($d, 'valor', $v);
        $regras = R::regras($t);
        if ($novo !== null && $novo > $regras['orcamento_obrigatorio_acima'] && !self::temAnexo($t, (int) $c['id'], 'orcamento')) {
            $v->erro('valor', 'Anexe o orçamento atualizado (foto ou PDF) antes.');
        }
        $ok = $v->ok();
        $nivel = R::reaprovacaoPara($novo, (float) $c['valor_aprovado'], $c['nivel_aprovacao'], $regras);
        if ($nivel === null) {
            Db::run('UPDATE chamados SET valor_estimado = ? WHERE tenant_id = ? AND id = ?', [$novo, $t, $c['id']]);
            R::evento($t, (int) $c['id'], 'ajuste_valor', null, null, $ok['texto'], $novo);
            return;
        }
        Db::run("UPDATE chamados SET status = 'aguardando_aprovacao', valor_estimado = ?, nivel_aprovacao = ?, em_reaprovacao = 1 WHERE tenant_id = ? AND id = ?",
            [$novo, $nivel, $t, $c['id']]);
        R::evento($t, (int) $c['id'], 'pedido_reaprovacao', $c['status'], 'aguardando_aprovacao',
            $ok['texto'] . "\nNova aprovação: " . R::NIVEL_NOME[$nivel] . '.', $novo);
    }

    private static function acaoConfirmar(int $t, array $c, array $d): void
    {
        $ok = (new Validar($d))->texto('texto', false, 2000)->ok();
        Db::run("UPDATE chamados SET status = 'encerrado', encerrado_em = NOW() WHERE tenant_id = ? AND id = ?", [$t, $c['id']]);
        R::evento($t, (int) $c['id'], 'confirmacao', $c['status'], 'encerrado', $ok['texto']);
        R::iniciarPrazoDeGuarda($t, (int) $c['id']);
    }

    private static function acaoReabrir(int $t, array $c, array $d): void
    {
        $ok = (new Validar($d))->texto('texto', true, 2000, 5)->ok();
        if ($c['os_id'] === null) {
            // Chamado importado que nunca teve OS: volta para a área rever o serviço.
            Db::run("UPDATE chamados SET status = 'em_orcamento', concluido_em = NULL WHERE tenant_id = ? AND id = ?", [$t, $c['id']]);
            R::evento($t, (int) $c['id'], 'reabertura', $c['status'], 'em_orcamento', $ok['texto']);
            return;
        }
        Db::run("UPDATE chamados SET status = 'em_execucao', concluido_em = NULL WHERE tenant_id = ? AND id = ?", [$t, $c['id']]);
        // A OS volta para andamento: a equipe refaz o que precisa e conclui de novo.
        Db::run("UPDATE ordens_servico SET status = 'em_andamento', concluida_em = NULL WHERE tenant_id = ? AND chamado_id = ?", [$t, $c['id']]);
        R::evento($t, (int) $c['id'], 'reabertura', $c['status'], 'em_execucao', $ok['texto']);
    }

    private static function acaoCancelar(int $t, array $c, array $d): void
    {
        $ok = (new Validar($d))->texto('texto', true, 500, 5)->ok();
        Db::run("UPDATE chamados SET status = 'cancelado', motivo_cancelamento = ?, encerrado_em = NOW() WHERE tenant_id = ? AND id = ?", [$ok['texto'], $t, $c['id']]);
        if ($c['os_id'] !== null) {
            Db::run("UPDATE os_tetos SET status = 'recusado', decidido_por = ?, decidido_em = NOW(), resposta = 'Chamado cancelado.' WHERE tenant_id = ? AND os_id = ? AND status = 'pendente'",
                [Sessao::usuario()['id'], $t, $c['os_id']]);
            Db::run("UPDATE ordens_servico SET status = 'cancelada' WHERE tenant_id = ? AND id = ?", [$t, $c['os_id']]);
        }
        R::evento($t, (int) $c['id'], 'cancelamento', $c['status'], 'cancelado', $ok['texto']);
        R::iniciarPrazoDeGuarda($t, (int) $c['id']);
    }

    // ---------------------------------------------------------------- comentários e anexos

    public static function comentar(Requisicao $r, int $id): array
    {
        $c = R::carregar($id);
        if (!in_array('comentar', R::acoes($c), true)) throw new HttpErro(409, 'Este chamado já foi finalizado.');
        $d = (new Validar($r->corpo))->texto('texto', true, 2000)->ok();
        R::evento(Sessao::tenantId(), $id, 'comentario', null, null, $d['texto']);
        return self::detalhe(R::carregar($id));
    }

    public static function enviarAnexo(Requisicao $r, int $id): array
    {
        $c = R::carregar($id);
        $t = Sessao::tenantId();
        if (in_array($c['status'], R::FINAIS, true)) throw new HttpErro(409, 'Este chamado já foi finalizado.');
        $cat = $r->corpo['categoria'] ?? 'foto';
        if (!in_array($cat, R::CATEGORIAS_ANEXO, true)) throw HttpErro::invalido(['categoria' => 'Tipo de arquivo inválido.']);
        // Fotos e documentos: qualquer pessoa que vê o chamado. Orçamento e nota: só quem cuida do serviço.
        if (in_array($cat, ['orcamento', 'nota'], true) && !R::podeOrcar($c) && !R::podeExecutar($c)) throw HttpErro::proibido();
        $a = Anexos::salvar($t, 'chamado', $id, $cat, $r->corpo['arquivo'] ?? null,
            is_string($r->corpo['nome'] ?? null) ? $r->corpo['nome'] : null, $cat !== 'foto');
        $legenda = (new Validar($r->corpo))->texto('legenda', false, 200)->ok()['legenda'];
        if ($legenda) Db::run('UPDATE anexos SET legenda = ? WHERE id = ?', [$legenda, $a['id']]);
        R::evento($t, $id, 'anexo', null, null, ['foto' => 'Enviou uma foto.', 'documento' => 'Anexou um documento.', 'orcamento' => 'Anexou um orçamento.', 'nota' => 'Anexou uma nota fiscal.'][$cat]);
        return self::detalhe(R::carregar($id));
    }

    public static function excluirAnexo(Requisicao $r, int $id, int $aid): array
    {
        $c = R::carregar($id);
        $t = Sessao::tenantId();
        $a = Db::one("SELECT * FROM anexos WHERE tenant_id = ? AND id = ? AND dono_tipo = 'chamado' AND dono_id = ? AND excluido_em IS NULL", [$t, $aid, $id]);
        if (!$a) throw HttpErro::naoEncontrado('Arquivo');
        if (in_array($c['status'], R::FINAIS, true)) throw new HttpErro(409, 'Este chamado já foi finalizado.');
        // Orçamento já aprovado não pode sumir: é o documento da aprovação.
        if ($a['categoria'] === 'orcamento' && $c['valor_aprovado'] !== null) throw new HttpErro(409, 'Este orçamento já foi aprovado e fica guardado no chamado.');
        if ((int) $a['criado_por'] !== Sessao::usuario()['id'] && !R::podeTriar($c)) throw HttpErro::proibido();
        Anexos::excluir($t, $aid);
        R::evento($t, $id, 'anexo_excluido', null, null, 'Apagou um arquivo.');
        Auditoria::registrar('excluir_anexo', 'chamados', $id, ['anexo_id' => $aid, 'categoria' => $a['categoria']], null);
        return self::detalhe(R::carregar($id));
    }

    // ---------------------------------------------------------------- lista de materiais (v1.8.0)

    public static function adicionarMaterial(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $id, $t) {
            $c = R::carregar($id, true);
            if (!R::podeEditarMateriais($c)) throw self::semMateriais($c);
            $d = self::validarMaterial($r->corpo, R::veValores($c));
            if ((int) Db::one('SELECT COUNT(*) n FROM chamados_materiais WHERE tenant_id = ? AND chamado_id = ?', [$t, $id])['n'] >= 200) {
                throw new HttpErro(409, 'A lista chegou ao limite de 200 itens.');
            }
            $ordem = (int) Db::one('SELECT COALESCE(MAX(ordem), 0) + 1 n FROM chamados_materiais WHERE tenant_id = ? AND chamado_id = ?', [$t, $id])['n'];
            Db::insert('INSERT INTO chamados_materiais (tenant_id, chamado_id, descricao, quantidade, unidade, valor_unitario, situacao, observacao, ordem, criado_por)
                        VALUES (?,?,?,?,?,?,?,?,?,?)',
                [$t, $id, $d['descricao'], $d['quantidade'], $d['unidade'], $d['valor_unitario'], $d['situacao'], $d['observacao'], $ordem, Sessao::usuario()['id']]);
            R::evento($t, $id, 'material', null, null, 'Incluiu na lista de materiais: ' . self::qtd($d['quantidade']) . ' ' . $d['unidade'] . ' de ' . $d['descricao'] . '.');
            return self::detalhe(R::carregar($id));
        });
    }

    public static function editarMaterial(Requisicao $r, int $id, int $mid): array
    {
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $id, $mid, $t) {
            $c = R::carregar($id, true);
            $m = Db::one('SELECT * FROM chamados_materiais WHERE tenant_id = ? AND chamado_id = ? AND id = ?', [$t, $id, $mid]);
            if (!$m) throw HttpErro::naoEncontrado('Material');
            if (!R::podeEditarMateriais($c)) throw self::semMateriais($c);
            $ve = R::veValores($c);
            $d = self::validarMaterial($r->corpo + [
                'descricao' => $m['descricao'], 'quantidade' => (float) $m['quantidade'], 'unidade' => $m['unidade'],
                'situacao' => $m['situacao'], 'observacao' => $m['observacao'],
            ], $ve);
            // Quem não vê valores não apaga o valor que outra pessoa lançou.
            $valor = $ve && array_key_exists('valor_unitario', $r->corpo) ? $d['valor_unitario'] : ($m['valor_unitario'] === null ? null : (float) $m['valor_unitario']);
            Db::run('UPDATE chamados_materiais SET descricao = ?, quantidade = ?, unidade = ?, valor_unitario = ?, situacao = ?, observacao = ? WHERE tenant_id = ? AND id = ?',
                [$d['descricao'], $d['quantidade'], $d['unidade'], $valor, $d['situacao'], $d['observacao'], $t, $mid]);
            if ($d['situacao'] !== $m['situacao']) {
                R::evento($t, $id, 'material', null, null, $d['descricao'] . ': ' . strtolower(R::SITUACOES_MATERIAL[$d['situacao']]) . '.');
            }
            return self::detalhe(R::carregar($id));
        });
    }

    public static function excluirMaterial(Requisicao $r, int $id, int $mid): array
    {
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($id, $mid, $t) {
            $c = R::carregar($id, true);
            $m = Db::one('SELECT * FROM chamados_materiais WHERE tenant_id = ? AND chamado_id = ? AND id = ?', [$t, $id, $mid]);
            if (!$m) throw HttpErro::naoEncontrado('Material');
            if (!R::podeEditarMateriais($c)) throw self::semMateriais($c);
            Db::run('DELETE FROM chamados_materiais WHERE tenant_id = ? AND id = ?', [$t, $mid]);
            R::evento($t, $id, 'material', null, null, 'Tirou da lista de materiais: ' . $m['descricao'] . '.');
            Auditoria::registrar('excluir_material', 'chamados', $id, ['material' => $m['descricao'], 'quantidade' => $m['quantidade']], null);
            return self::detalhe(R::carregar($id));
        });
    }

    private static function semMateriais(array $c): HttpErro
    {
        return in_array($c['status'], R::FINAIS, true) ? new HttpErro(409, 'Este chamado já foi finalizado.') : HttpErro::proibido();
    }

    private static function validarMaterial(array $corpo, bool $veValores): array
    {
        $v = (new Validar($corpo))->texto('descricao', true, 200, 2)->texto('unidade', false, 12)->texto('observacao', false, 255);
        $q = $corpo['quantidade'] ?? 1;
        $qtd = is_int($q) || is_float($q) ? (float) $q : (is_string($q) && preg_match('/^\d{1,9}([.,]\d{1,3})?$/', trim($q)) ? (float) str_replace(',', '.', trim($q)) : null);
        if ($qtd === null || $qtd <= 0 || $qtd > 999999999) $v->erro('quantidade', 'Informe a quantidade.');
        $valor = null;
        if ($veValores && ($corpo['valor_unitario'] ?? null) !== null && $corpo['valor_unitario'] !== '') {
            $valor = Validar::reais($corpo['valor_unitario']);
            if ($valor === null || $valor < 0 || $valor > 99999999) $v->erro('valor_unitario', 'Valor inválido.');
        }
        $sit = $corpo['situacao'] ?? 'a_comprar';
        if (!is_string($sit) || !isset(R::SITUACOES_MATERIAL[$sit])) $v->erro('situacao', 'Situação inválida.');
        $d = $v->ok();
        return ['descricao' => $d['descricao'], 'quantidade' => round((float) $qtd, 3), 'unidade' => $d['unidade'] ?: 'un',
            'valor_unitario' => $valor, 'situacao' => $sit, 'observacao' => $d['observacao']];
    }

    private static function qtd(float $q): string
    {
        return rtrim(rtrim(number_format($q, 3, ',', '.'), '0'), ',');
    }

    private static function materiais(int $t, int $chamadoId, bool $ve): array
    {
        return array_map(fn($m) => [
            'id' => (int) $m['id'], 'descricao' => $m['descricao'], 'quantidade' => (float) $m['quantidade'], 'unidade' => $m['unidade'],
            'valor_unitario' => $ve && $m['valor_unitario'] !== null ? (float) $m['valor_unitario'] : null,
            'situacao' => $m['situacao'], 'situacao_nome' => R::SITUACOES_MATERIAL[$m['situacao']],
            'observacao' => $m['observacao'], 'autor' => $m['autor'], 'criado_em' => $m['criado_em'],
        ], Db::all('SELECT m.*, u.nome AS autor FROM chamados_materiais m LEFT JOIN usuarios u ON u.id = m.criado_por
                    WHERE m.tenant_id = ? AND m.chamado_id = ? ORDER BY m.ordem, m.id', [$t, $chamadoId]));
    }

    // ---------------------------------------------------------------- categorias (Administração)

    public static function listarCategoriasAdmin(Requisicao $r): array
    {
        Acesso::exigir('admin.categorias');
        return self::tiparCategorias(Db::all('SELECT * FROM chamados_categorias WHERE tenant_id = ? ORDER BY ordem, nome', [Sessao::tenantId()]));
    }

    public static function criarCategoria(Requisicao $r): never
    {
        Acesso::exigir('admin.categorias');
        $t = Sessao::tenantId();
        $d = self::validarCategoria($t, $r->corpo);
        $ordem = (int) Db::one('SELECT COALESCE(MAX(ordem), 0) + 1 n FROM chamados_categorias WHERE tenant_id = ?', [$t])['n'];
        $id = Db::insert('INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) VALUES (?,?,?,?,?)',
            [$t, $d['nome'], $d['icone'], $d['exige_parecer_seguranca'], $ordem]);
        Auditoria::registrar('criar', 'chamados_categorias', $id, null, $d);
        Resposta::json(self::tiparCategorias(Db::all('SELECT * FROM chamados_categorias WHERE tenant_id = ? AND id = ?', [$t, $id]))[0], 201);
    }

    public static function editarCategoria(Requisicao $r, int $id): array
    {
        Acesso::exigir('admin.categorias');
        $t = Sessao::tenantId();
        $antes = Db::one('SELECT * FROM chamados_categorias WHERE tenant_id = ? AND id = ?', [$t, $id]);
        if (!$antes) throw HttpErro::naoEncontrado('Categoria');
        $d = self::validarCategoria($t, $r->corpo + ['icone' => $antes['icone']], $id, (bool) $antes['ativo']);
        Db::run('UPDATE chamados_categorias SET nome = ?, icone = ?, exige_parecer_seguranca = ?, ativo = ? WHERE tenant_id = ? AND id = ?',
            [$d['nome'], $d['icone'], $d['exige_parecer_seguranca'], $d['ativo'], $t, $id]);
        Auditoria::registrar('editar', 'chamados_categorias', $id, $antes, $d);
        return self::tiparCategorias(Db::all('SELECT * FROM chamados_categorias WHERE tenant_id = ? AND id = ?', [$t, $id]))[0];
    }

    private static function validarCategoria(int $t, array $corpo, ?int $id = null, bool $ativoAtual = true): array
    {
        $v = (new Validar($corpo))->texto('nome', true, 80, 2)->texto('icone', false, 30)
            ->booleano('exige_parecer_seguranca', false)->booleano('ativo', $ativoAtual);
        if (is_string($corpo['nome'] ?? null) && Db::one('SELECT id FROM chamados_categorias WHERE tenant_id = ? AND nome = ? AND id <> ?', [$t, trim($corpo['nome']), $id ?? 0])) {
            $v->erro('nome', 'Já existe uma categoria com este nome.');
        }
        $d = $v->ok();
        $d['icone'] = in_array($d['icone'], array_column(Catalogo::CATEGORIAS_PADRAO, 1), true) ? $d['icone'] : 'outros';
        return $d;
    }

    // ---------------------------------------------------------------- montagem das respostas

    private static function resumoItem(array $c, array $andamento = []): array
    {
        $ve = R::veValores($c);
        return [
            'id'             => (int) $c['id'],
            'numero'         => (int) $c['numero'],
            'titulo'         => $c['titulo'],
            'descricao'      => mb_substr((string) $c['descricao'], 0, 160),
            'status'         => $c['status'],
            'status_nome'    => R::STATUS[$c['status']],
            'tipo'           => $c['tipo'],
            'tipo_nome'      => R::TIPOS[$c['tipo']],
            'os'             => $c['os_id'] === null ? null : [
                'id' => (int) $c['os_id'], 'numero' => (int) $c['os_numero'], 'rotulo' => Ordens::numeroFormatado((int) $c['os_numero']),
                'status' => $c['os_status'], 'status_nome' => Ordens::STATUS[$c['os_status']],
                'progresso' => $andamento[(int) $c['os_id']] ?? null,
            ],
            'urgente'        => (bool) $c['urgente'],
            'prioridade'     => $c['prioridade'],
            'casa'           => ['id' => (int) $c['casa_id'], 'nome' => $c['casa_nome'], 'codigo' => $c['casa_codigo'], 'grupo' => $c['grupo_nome']],
            'categoria'      => $c['categoria_id'] === null ? null : ['id' => (int) $c['categoria_id'], 'nome' => $c['categoria_nome'], 'icone' => $c['categoria_icone']],
            'area'           => $c['area_id'] === null ? null : ['id' => (int) $c['area_id'], 'nome' => $c['area_nome']],
            'origem'         => $c['origem'],
            'responsavel'    => $c['responsavel_id'] ? ['id' => (int) $c['responsavel_id'], 'nome' => $c['responsavel_nome']] : null,
            'valor_estimado' => $c['valor_estimado'] === null || !$ve ? null : (float) $c['valor_estimado'],
            'nivel_aprovacao'=> $c['nivel_aprovacao'],
            'criado_em'      => $c['criado_em'],
            'atualizado_em'  => $c['atualizado_em'],
        ];
    }

    private static function detalhe(array $c): array
    {
        $t = Sessao::tenantId();
        $ve = R::veValores($c);
        $acoes = R::acoes($c);
        $eventos = array_map(fn($e) => [
            'id' => (int) $e['id'], 'tipo' => $e['tipo'], 'status_de' => $e['status_de'], 'status_para' => $e['status_para'],
            'texto' => $e['texto'], 'valor' => $e['valor'] === null ? null : (float) $e['valor'],
            'usuario' => $e['usuario'], 'criado_em' => $e['criado_em'],
        ], Db::all('SELECT e.*, u.nome AS usuario FROM chamados_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
                     WHERE e.tenant_id = ? AND e.chamado_id = ? ORDER BY e.id', [$t, $c['id']]));
        if (!$ve) {
            // A casa acompanha a obra, mas sem os valores.
            $eventos = array_values(array_filter($eventos, fn($e) => !in_array($e['tipo'], ['gasto', 'estorno', 'pedido_teto', 'teto_recusado', 'aumento_aprovado', 'acima_teto'], true)));
            $eventos = array_map(fn($e) => ['valor' => null] + $e, $eventos);
        }
        $eu = Sessao::usuario()['id'];
        $podeApagarTudo = R::podeTriar($c);
        $anexos = array_map(function ($a) use ($eu, $podeApagarTudo, $c) {
            $a['pode_apagar'] = !in_array($c['status'], R::FINAIS, true)
                && ($a['criado_por'] === $eu || $podeApagarTudo)
                && !($a['categoria'] === 'orcamento' && $c['valor_aprovado'] !== null);
            return $a;
        }, Anexos::listar($t, 'chamado', (int) $c['id']));
        $regras = R::regras($t);
        $vira = fn($x) => $x === null ? null : (float) $x;

        $andamento = $c['os_id'] === null ? [] : self::andamentos($t, [(int) $c['os_id']]);
        return self::resumoItem($c, $andamento) + [
            'descricao'          => $c['descricao'],
            'local'              => $c['local'],
            'aberto_por'         => ['id' => (int) $c['aberto_por'], 'nome' => $c['aberto_por_nome'] ?: $c['aberto_por_usuario']],
            'link_externo'       => $c['link_externo'],
            'status_externo'     => $c['status_externo'],
            'servico_descricao'  => $c['servico_descricao'],
            've_valores'         => $ve,
            'valor_aprovado'     => $ve ? $vira($c['valor_aprovado']) : null,
            'valor_final'        => $ve ? $vira($c['valor_final']) : null,
            'nivel_nome'         => $c['nivel_aprovacao'] ? R::NIVEL_NOME[$c['nivel_aprovacao']] : null,
            'em_reaprovacao'     => (bool) $c['em_reaprovacao'],
            'aprovado_por'       => $c['aprovado_por'] ? $c['aprovado_por_nome'] : null,
            'aprovado_em'        => $c['aprovado_em'],
            'exige_parecer'      => (bool) $c['exige_parecer'],
            'parecer'            => $c['parecer_seguranca'] ? ['resultado' => $c['parecer_seguranca'], 'texto' => $c['parecer_texto'], 'por' => $c['parecer_por_nome'], 'em' => $c['parecer_em']] : null,
            'concluido_em'       => $c['concluido_em'],
            'encerrado_em'       => $c['encerrado_em'],
            'motivo_cancelamento'=> $c['motivo_cancelamento'],
            'acoes'              => $acoes,
            'para_mim'           => R::paraMim($c, $acoes),
            'pode_anexar_documento' => R::podeOrcar($c) || R::podeExecutar($c),
            'materiais'          => self::materiais($t, (int) $c['id'], $ve),
            'pode_editar_materiais' => R::podeEditarMateriais($c),
            'pode_escolher_tipo' => R::podeTriar($c),
            'anexos'             => $anexos,
            'eventos'            => $eventos,
            'regras'             => [
                'orcamento_obrigatorio_acima' => $regras['orcamento_obrigatorio_acima'],
                'alcada_coordenacao_max'      => $regras['alcada_coordenacao_max'],
                'alcada_gestao_max'           => $regras['alcada_gestao_max'],
                'reaprovacao_aumento_min'     => $regras['reaprovacao_aumento_min'],
            ],
        ];
    }

    /** Andamento (%) de várias OS de uma vez, para as listas. */
    private static function andamentos(int $t, array $osIds): array
    {
        if (!$osIds) return [];
        $osIds = array_values($osIds);
        $r = [];
        foreach (Db::all("SELECT os_id, ROUND(SUM(CASE situacao WHEN 'ok' THEN 100 WHEN 'andamento' THEN percentual ELSE 0 END)
                                 / NULLIF(SUM(situacao <> 'nao_aplica'), 0), 1) p
                            FROM os_etapas WHERE tenant_id = ? AND os_id IN " . Db::in($osIds) . ' GROUP BY os_id', array_merge([$t], $osIds)) as $l) {
            $r[(int) $l['os_id']] = $l['p'] === null ? null : (float) $l['p'];
        }
        return $r;
    }

    /** O que interessa guardar na auditoria (sem textos longos). */
    private static function retrato(array $c): array
    {
        return array_intersect_key($c, array_flip(['status', 'tipo', 'prioridade', 'responsavel_id', 'valor_estimado', 'valor_aprovado', 'valor_final', 'nivel_aprovacao', 'em_reaprovacao', 'parecer_seguranca']));
    }

    private static function primeirasFotos(int $t, array $ids): array
    {
        if (!$ids) return [];
        $linhas = Db::all("SELECT dono_id, MIN(id) id FROM anexos WHERE tenant_id = ? AND dono_tipo = 'chamado' AND categoria = 'foto' AND excluido_em IS NULL
                            AND dono_id IN " . Db::in($ids) . ' GROUP BY dono_id', array_merge([$t], $ids));
        $r = [];
        foreach ($linhas as $l) $r[(int) $l['dono_id']] = '/api/anexos/' . $l['id'] . '?mini=1';
        return $r;
    }

    private static function tiparCategorias(array $linhas): array
    {
        return array_map(fn($c) => [
            'id' => (int) $c['id'], 'nome' => $c['nome'], 'icone' => $c['icone'],
            'exige_parecer_seguranca' => (bool) $c['exige_parecer_seguranca'], 'ativo' => (bool) $c['ativo'],
        ], $linhas);
    }

    private static function temAnexo(int $t, int $chamadoId, string $categoria): bool
    {
        return (bool) Db::one("SELECT 1 FROM anexos WHERE tenant_id = ? AND dono_tipo = 'chamado' AND dono_id = ? AND categoria = ? AND excluido_em IS NULL LIMIT 1", [$t, $chamadoId, $categoria]);
    }

    /** Área opcional: precisa existir e estar ativa. */
    private static function validarArea(int $t, array $d, Validar $v): ?int
    {
        $id = $d['area_id'] ?? null;
        if ($id === null || $id === '') return null;
        if (!ctype_digit((string) $id) || !Db::one('SELECT 1 FROM areas WHERE tenant_id = ? AND id = ? AND ativo = 1', [$t, (int) $id])) {
            $v->erro('area_id', 'Escolha uma das áreas.');
            return null;
        }
        return (int) $id;
    }

    /** Tipo do problema na triagem: opcional; obrigatório se o chamado ainda não tem (importados). */
    private static function validarTipoProblema(int $t, array $d, Validar $v, array $c): ?int
    {
        $id = $d['categoria_id'] ?? null;
        if ($id === null || $id === '') return $c['categoria_id'] === null ? null : (int) $c['categoria_id'];
        if (!ctype_digit((string) $id) || !Db::one('SELECT 1 FROM chamados_categorias WHERE tenant_id = ? AND id = ? AND ativo = 1', [$t, (int) $id])) {
            $v->erro('categoria_id', 'Escolha o tipo do problema.');
            return null;
        }
        return (int) $id;
    }

    /**
     * Responsável opcional: alguém da área escolhida, ou da equipe, engenharia, compras, coordenação ou gestão.
     */
    private static function validarResponsavel(int $t, array $d, Validar $v, ?int $area = null): ?int
    {
        $id = $d['responsavel_id'] ?? null;
        if ($id === null || $id === '') return null;
        $ok = ctype_digit((string) $id) && (Db::one(
            "SELECT 1 FROM usuarios u JOIN usuarios_perfis up ON up.usuario_id = u.id JOIN perfis p ON p.id = up.perfil_id
              WHERE u.tenant_id = ? AND u.id = ? AND u.ativo = 1 AND p.codigo IN ('equipe_manutencao','engenharia','compras','coordenacao_manutencao','gestao_manutencao') LIMIT 1",
            [$t, (int) $id]) || ($area !== null && Db::one(
            'SELECT 1 FROM areas_membros am JOIN usuarios u ON u.id = am.usuario_id WHERE am.tenant_id = ? AND am.area_id = ? AND am.usuario_id = ? AND u.ativo = 1',
            [$t, $area, (int) $id])));
        if (!$ok) { $v->erro('responsavel_id', 'Escolha alguém da lista.'); return null; }
        return (int) $id;
    }

    /** Valor em reais: aceita 1234.5, "1234,50" ou "1.234,50". */
    private static function valor(array $d, string $campo, Validar $v): ?float
    {
        $x = Validar::reais($d[$campo] ?? null);
        if ($x === null || $x < 0 || $x > 9999999) {
            $v->erro($campo, 'Informe o valor em reais (use 0 se não houver custo).');
            return null;
        }
        return $x;
    }
}
