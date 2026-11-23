<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Anexos, Auditoria, Db, Estoque, HttpErro, Requisicao, Resposta, Sessao, Validar};

/**
 * CNS Limpeza — a loja de produtos das Casas de Oração.
 *
 * CICLO (aberto → fechado → comprado → distribuido): só um aberto por vez. Abre pela agenda da Coordenação CNS
 *   (todo mês, no dia marcado) ou na mão. Depois de fechado, a Coordenação consolida com o DML Central e libera
 *   a lista de compra (liberado_compras_em); Compras registra a compra; a Coordenação recebe no Central e entrega.
 * PEDIDO de cada casa no ciclo:
 *   rascunho → enviado → conferido (1ª análise: orientadora do grupo) → aprovado (análise final: Coordenação CNS) → entregue
 *   Em qualquer análise pode voltar para a casa (devolvido). Casa sem orientadora: a Coordenação faz as duas de uma vez.
 *   A casa vê o preço de cada produto e o total do pedido.
 */
final class CnsControlador
{
    public const STATUS_PEDIDO = [
        'rascunho' => 'Ainda não enviado', 'enviado' => 'Com a orientadora', 'devolvido' => 'Devolvido para ajuste',
        'conferido' => 'Com a coordenação', 'aprovado' => 'Aprovado', 'entregue' => 'Recebido', 'cancelado' => 'Fora deste ciclo',
    ];
    public const STATUS_CICLO = ['aberto' => 'Recebendo pedidos', 'fechado' => 'Fechado, em consolidação', 'comprado' => 'Comprado, aguardando entrega', 'distribuido' => 'Entregue às casas'];
    public const CATEGORIAS = [
        'limpeza' => 'Limpeza geral', 'banheiro' => 'Banheiro', 'cozinha' => 'Cozinha', 'descartaveis' => 'Descartáveis',
        'utensilios' => 'Utensílios', 'epi' => 'EPI e calçados', 'equipamentos' => 'Dispensers e peças', 'outros' => 'Outros',
    ];
    private const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    private const MAX_QTD = 999;

    // ================================================================ papéis

    private static function podePedir(int $casaId): bool
    {
        return Acesso::tem('cns.pedir') && Acesso::podeVerCasa($casaId);
    }

    private static function ehOrientadoraDa(int $casaId): bool
    {
        static $c = null;
        $c ??= Acesso::casasDaOrientadora();
        return in_array($casaId, $c, true);
    }

    /** A casa tem orientadora ativa no grupo dela? */
    private static function temOrientadora(int $casaId): bool
    {
        static $cache = [];
        return $cache[$casaId] ??= (bool) Db::one(
            "SELECT 1 FROM usuarios_perfis up JOIN perfis p ON p.id = up.perfil_id AND p.codigo = 'orientadora_cns'
               JOIN usuarios u ON u.id = up.usuario_id AND u.ativo = 1
               JOIN casas_oracao c ON c.grupo_id = up.grupo_id
              WHERE up.tenant_id = ? AND c.id = ? LIMIT 1", [Sessao::tenantId(), $casaId]);
    }

    /** Quem analisa o pedido neste status: 1ª análise (orientadora do grupo ou Coordenação) e análise final (só Coordenação). */
    private static function podeAnalisar(int $casaId, ?string $status): bool
    {
        if ($status === 'enviado') return Acesso::tem('cns.conferir') && (Acesso::tem('cns.gerir') || self::ehOrientadoraDa($casaId));
        if ($status === 'conferido') return Acesso::tem('cns.gerir');
        return false;
    }

    private static function prazoPassou(array $ciclo): bool
    {
        return date('Y-m-d') > $ciclo['prazo'];
    }

    private static function acoesPedido(?array $p, array $ciclo, int $casaId): array
    {
        $a = [];
        $aberto = $ciclo['status'] === 'aberto';
        $pedir = self::podePedir($casaId);
        $status = $p['status'] ?? null;
        if ($pedir && $aberto && !self::prazoPassou($ciclo) && in_array($status, [null, 'rascunho', 'devolvido'], true)) {
            $a[] = 'editar';
            if ($p && (int) ($p['qtd_itens'] ?? 0) > 0) $a[] = 'enviar';
        }
        if ($pedir && $aberto && !self::prazoPassou($ciclo) && $status === 'enviado') $a[] = 'desfazer_envio';
        if ($aberto && self::podeAnalisar($casaId, $status)) array_push($a, 'aprovar', 'devolver');
        if ($ciclo['status'] === 'distribuido' && $status === 'aprovado' && ($pedir || Acesso::tem('cns.conferir'))) $a[] = 'confirmar_recebimento';
        return $a;
    }

    /** Qual análise este usuário faria agora: 'primeira' (orientadora), 'final' (Coordenação) ou null. */
    private static function etapaAnalise(?array $p, array $acoes): ?string
    {
        if (!in_array('aprovar', $acoes, true)) return null;
        return ($p['status'] ?? null) === 'conferido' || Acesso::tem('cns.gerir') ? 'final' : 'primeira';
    }

    /** O pedido espera uma providência deste usuário? */
    private static function paraMim(?array $p, array $ciclo, int $casaId, array $acoes): bool
    {
        if (in_array('aprovar', $acoes, true)) {
            if (($p['status'] ?? null) === 'conferido') return true;
            // Pedido com a orientadora: a Coordenação só recebe o aviso das casas sem orientadora.
            return !Acesso::tem('cns.gerir') || self::ehOrientadoraDa($casaId) || !self::temOrientadora($casaId);
        }
        if (in_array('confirmar_recebimento', $acoes, true) && self::ehDaCasa($casaId)) return true;
        if (in_array('editar', $acoes, true) && self::ehDaCasa($casaId) && in_array($p['status'] ?? null, [null, 'rascunho', 'devolvido'], true)) return true;
        return false;
    }

    /** Excluir pedido (qualquer status, inclusive de ciclos antigos): Coordenação CNS em todas as casas; orientadora nas casas do grupo dela. */
    private static function podeExcluir(int $casaId): bool
    {
        return Acesso::temPerfil('coordenacao_cns') || (Acesso::temPerfil('orientadora_cns') && self::ehOrientadoraDa($casaId));
    }

    private static function ehDaCasa(int $casaId): bool
    {
        static $c = null;
        $c ??= Acesso::temPerfil('casa_oracao') ? array_map('intval', array_column(Db::all(
            'SELECT casa_id FROM usuarios_casas WHERE tenant_id = ? AND usuario_id = ?', [Sessao::tenantId(), Sessao::usuario()['id']]), 'casa_id')) : [];
        return in_array($casaId, $c, true);
    }

    // ================================================================ agenda (abertura automática)

    private static function agenda(int $t): array
    {
        $c = array_column(Db::all("SELECT chave, valor FROM configuracoes_tenant WHERE tenant_id = ? AND chave LIKE 'cns_agenda_%'", [$t]), 'valor', 'chave');
        return [
            'ativa' => ($c['cns_agenda_ativa'] ?? '0') === '1',
            'dia_abertura' => (int) ($c['cns_agenda_abertura'] ?? 1),
            'dia_prazo' => (int) ($c['cns_agenda_prazo'] ?? 10),
        ];
    }

    /** Janela de pedidos que começa no mês $ano-$mes: abre no dia de abertura; o prazo cai no mesmo mês ou no seguinte. */
    private static function janela(array $ag, int $ano, int $mes): array
    {
        $abre = sprintf('%04d-%02d-%02d', $ano, $mes, $ag['dia_abertura']);
        $base = $ag['dia_prazo'] > $ag['dia_abertura'] ? strtotime("$ano-$mes-01") : strtotime("$ano-$mes-01 +1 month");
        $prazo = date('Y-m-', $base) . sprintf('%02d', $ag['dia_prazo']);
        $ref = substr($prazo, 0, 7);
        return ['abre' => $abre, 'prazo' => $prazo, 'referencia' => $ref, 'nome' => self::nomeDoMes($ref)];
    }

    private static function nomeDoMes(string $ref): string
    {
        return self::MESES[(int) substr($ref, 5, 2) - 1] . '/' . substr($ref, 0, 4);
    }

    /** Janelas do mês passado até daqui a dois meses, em ordem. */
    private static function janelas(array $ag): array
    {
        $j = [];
        for ($i = -1; $i <= 2; $i++) {
            $m = strtotime(date('Y-m-01') . " $i month");
            $j[] = self::janela($ag, (int) date('Y', $m), (int) date('n', $m));
        }
        return $j;
    }

    /** Se a agenda estiver ligada e for época, abre o ciclo do mês (uma vez só). Roda quando alguém abre a limpeza. */
    private static function abrirAutomatico(int $t): void
    {
        static $feito = [];
        if (isset($feito[$t])) return;
        $feito[$t] = true;
        $ag = self::agenda($t);
        if (!$ag['ativa']) return;
        $hoje = date('Y-m-d');
        foreach (self::janelas($ag) as $j) {
            if ($hoje < $j['abre'] || $hoje > $j['prazo']) continue;
            if (Db::one("SELECT id FROM cns_ciclos WHERE tenant_id = ? AND (status = 'aberto' OR referencia = ?) LIMIT 1", [$t, $j['referencia']])) return;
            try {
                Db::transacao(function () use ($t, $j) {
                    $id = Db::insert('INSERT INTO cns_ciclos (tenant_id, nome, referencia, automatico, prazo, criado_por) VALUES (?,?,?,1,?,NULL)',
                        [$t, $j['nome'], $j['referencia'], $j['prazo']]);
                    Db::run('INSERT INTO cns_eventos (tenant_id, ciclo_id, tipo, texto) VALUES (?,?,?,?)',
                        [$t, $id, 'ciclo_aberto', 'Aberto automaticamente pela agenda. Prazo: ' . $j['prazo']]);
                });
            } catch (\PDOException $e) {
                if ($e->getCode() !== '23000') throw $e; // outro acesso abriu ao mesmo tempo
            }
            return;
        }
    }

    public static function verAgenda(Requisicao $r): array
    {
        Acesso::exigir('cns.gerir');
        return self::agendaPublica(Sessao::tenantId());
    }

    private static function agendaPublica(int $t): array
    {
        $ag = self::agenda($t);
        $proxima = null;
        if ($ag['ativa']) {
            $hoje = date('Y-m-d');
            foreach (self::janelas($ag) as $j) {
                if ($j['prazo'] < $hoje) continue;
                if (Db::one('SELECT id FROM cns_ciclos WHERE tenant_id = ? AND referencia = ?', [$t, $j['referencia']])) continue;
                $proxima = $j;
                break;
            }
        }
        return $ag + ['proxima' => $proxima];
    }

    public static function salvarAgenda(Requisicao $r): array
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        $v = (new Validar($r->corpo))->booleano('ativa', false);
        $dia = fn($k) => filter_var($r->corpo[$k] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 28]]);
        $abre = $dia('dia_abertura');
        $prazo = $dia('dia_prazo');
        if ($abre === false) $v->erro('dia_abertura', 'Escolha um dia de 1 a 28.');
        if ($prazo === false) $v->erro('dia_prazo', 'Escolha um dia de 1 a 28.');
        if ($abre !== false && $abre === $prazo) $v->erro('dia_prazo', 'O prazo precisa ser num dia diferente da abertura.');
        $d = $v->ok();
        $antes = self::agenda($t);
        foreach (['cns_agenda_ativa' => $d['ativa'] ? '1' : '0', 'cns_agenda_abertura' => (string) $abre, 'cns_agenda_prazo' => (string) $prazo] as $k => $valor) {
            Db::run('INSERT INTO configuracoes_tenant (tenant_id, chave, valor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [$t, $k, $valor]);
        }
        Auditoria::registrar('editar', 'cns_agenda', null, $antes, ['ativa' => (bool) $d['ativa'], 'dia_abertura' => $abre, 'dia_prazo' => $prazo]);
        self::abrirAutomatico($t);
        return self::agendaPublica($t);
    }

    // ================================================================ consultas

    private static function ciclo(int $t, int $id): array
    {
        $c = Db::one('SELECT * FROM cns_ciclos WHERE tenant_id = ? AND id = ?', [$t, $id]);
        if (!$c) throw HttpErro::naoEncontrado('Ciclo');
        return $c;
    }

    /** Ciclo em andamento: o aberto; se não houver, o mais recente ainda não entregue; senão o último. */
    private static function cicloAtual(int $t): ?array
    {
        return Db::one("SELECT * FROM cns_ciclos WHERE tenant_id = ? ORDER BY (status = 'aberto') DESC, (status <> 'distribuido') DESC, id DESC LIMIT 1", [$t]);
    }

    private static function pedidoDaCasa(int $t, int $cicloId, int $casaId): ?array
    {
        return Db::one('SELECT p.*, (SELECT COUNT(*) FROM cns_pedidos_itens i WHERE i.pedido_id = p.id) qtd_itens FROM cns_pedidos p WHERE p.tenant_id = ? AND p.ciclo_id = ? AND p.casa_id = ?',
            [$t, $cicloId, $casaId]);
    }

    private static function cicloPublico(?array $c): ?array
    {
        if (!$c) return null;
        $liberado = $c['liberado_compras_em'] ?? null;
        return [
            'id' => (int) $c['id'], 'nome' => $c['nome'], 'prazo' => $c['prazo'], 'status' => $c['status'],
            'status_nome' => $c['status'] === 'fechado' && $liberado ? 'Lista de compra com Compras' : self::STATUS_CICLO[$c['status']],
            'prazo_passou' => self::prazoPassou($c), 'observacao' => $c['observacao'], 'automatico' => (bool) ($c['automatico'] ?? false),
            'fechado_em' => $c['fechado_em'], 'liberado_compras_em' => $liberado, 'comprado_em' => $c['comprado_em'], 'distribuido_em' => $c['distribuido_em'],
            'valor_compra' => Acesso::tem('cns.compras') && $c['valor_compra'] !== null ? (float) $c['valor_compra'] : null,
            'estoque_recebido_em' => $c['estoque_recebido_em'] ?? null,
        ];
    }

    private static function produtos(int $t, bool $todos = false): array
    {
        $gestao = Acesso::tem('cns.compras') || Acesso::tem('cns.gerir');
        $central = $gestao ? array_column(Db::all('SELECT produto_id, quantidade FROM estoque_saldos WHERE local_id = ?', [Estoque::central($t)['id']]), 'quantidade', 'produto_id') : [];
        return array_map(fn($p) => [
            'minimo_central' => $gestao && $p['minimo_central'] !== null ? (int) $p['minimo_central'] : null,
            'no_central' => $gestao ? (int) ($central[$p['id']] ?? 0) : null,
            'id' => (int) $p['id'], 'codigo' => $p['codigo'], 'nome' => $p['nome'], 'familia' => $p['familia'], 'variacao' => $p['variacao'],
            'embalagem' => $p['embalagem'], 'unidade' => $p['unidade'], 'categoria' => $p['categoria'],
            'fornecedor' => $gestao ? $p['fornecedor'] : null,
            'foto_url' => $p['foto_id'] ? '/api/anexos/' . $p['foto_id'] : null,
            'mini_url' => $p['foto_id'] ? '/api/anexos/' . $p['foto_id'] . '?mini=1' : null,
            'preco_ref' => $p['preco_ref'] !== null ? (float) $p['preco_ref'] : null,
            'max_por_pedido' => $p['max_por_pedido'] === null ? null : (int) $p['max_por_pedido'], 'ativo' => (bool) $p['ativo'],
        ], Db::all('SELECT * FROM cns_produtos WHERE tenant_id = ?' . ($todos ? '' : ' AND ativo = 1') . ' ORDER BY ' . self::ordemCategoria('categoria') . ', ordem, nome', [$t]));
    }

    private static function ordemCategoria(string $coluna): string
    {
        return "FIELD($coluna," . implode(',', array_map(fn($k) => "'$k'", array_keys(self::CATEGORIAS))) . ')';
    }

    private static function pedidoCompleto(int $t, array $p, array $ciclo): array
    {
        $casa = Db::one('SELECT c.id, c.nome, c.codigo, g.nome grupo FROM casas_oracao c JOIN grupos g ON g.id = c.grupo_id WHERE c.id = ?', [$p['casa_id']]);
        $localCasa = Estoque::localDaCasa($t, (int) $p['casa_id']);
        $itens = Db::all('SELECT i.*, pr.nome, pr.embalagem, pr.unidade, pr.categoria, pr.foto_id, pr.preco_ref, s.quantidade na_casa, s.contado_em
                            FROM cns_pedidos_itens i JOIN cns_produtos pr ON pr.id = i.produto_id
                            LEFT JOIN estoque_saldos s ON s.produto_id = i.produto_id AND s.local_id = ?
                           WHERE i.tenant_id = ? AND i.pedido_id = ? ORDER BY ' . self::ordemCategoria('pr.categoria') . ', pr.ordem, pr.nome', [$localCasa['id'] ?? 0, $t, $p['id']]);
        $p['qtd_itens'] = count($itens);
        $acoes = self::acoesPedido($p, $ciclo, (int) $p['casa_id']);
        $nome = fn($id) => $id ? Db::one('SELECT nome FROM usuarios WHERE id = ?', [$id])['nome'] : null;
        $total = 0.0;
        $semPreco = 0;
        $lista = array_map(function ($i) use (&$total, &$semPreco) {
            $q = $i['quantidade_aprovada'] === null ? (int) $i['quantidade'] : (int) $i['quantidade_aprovada'];
            $preco = $i['preco_unit'] !== null ? (float) $i['preco_unit'] : ($i['preco_ref'] !== null ? (float) $i['preco_ref'] : null);
            $sub = $preco === null ? null : round($preco * $q, 2);
            if ($sub === null) { if ($q > 0) $semPreco++; } else $total += $sub;
            return [
                'produto_id' => (int) $i['produto_id'], 'nome' => $i['nome'], 'embalagem' => $i['embalagem'], 'unidade' => $i['unidade'], 'categoria' => $i['categoria'],
                'mini_url' => $i['foto_id'] ? '/api/anexos/' . $i['foto_id'] . '?mini=1' : null,
                'quantidade' => (int) $i['quantidade'], 'quantidade_aprovada' => $i['quantidade_aprovada'] === null ? null : (int) $i['quantidade_aprovada'],
                'preco' => $preco, 'subtotal' => $sub,
                'na_casa' => $i['na_casa'] === null ? null : (int) $i['na_casa'], 'contado_em' => $i['contado_em'],
            ];
        }, $itens);
        return [
            'id' => (int) $p['id'], 'status' => $p['status'], 'status_nome' => self::STATUS_PEDIDO[$p['status']],
            'casa' => ['id' => (int) $casa['id'], 'nome' => $casa['nome'], 'codigo' => $casa['codigo'], 'grupo' => $casa['grupo']],
            'ciclo' => self::cicloPublico($ciclo),
            'observacao' => $p['observacao'], 'motivo' => $p['motivo'],
            'itens' => $lista, 'total' => round($total, 2), 'sem_preco' => $semPreco,
            'estoque_casa_id' => $localCasa ? (int) $localCasa['id'] : null,
            'enviado_por' => $nome($p['enviado_por']), 'enviado_em' => $p['enviado_em'],
            'conferido_por' => $nome($p['conferido_por']), 'conferido_em' => $p['conferido_em'],
            'analisado_por' => $nome($p['analisado_por'] ?? null), 'analisado_em' => $p['analisado_em'] ?? null,
            'recebido_por' => $nome($p['recebido_por']), 'recebido_em' => $p['recebido_em'], 'recebimento_obs' => $p['recebimento_obs'],
            'tem_orientadora' => self::temOrientadora((int) $p['casa_id']),
            'pode_excluir' => self::podeExcluir((int) $p['casa_id']),
            'acoes' => $acoes, 'etapa_analise' => self::etapaAnalise($p, $acoes), 'para_mim' => self::paraMim($p, $ciclo, (int) $p['casa_id'], $acoes),
            'eventos' => array_map(fn($e) => ['id' => (int) $e['id'], 'tipo' => $e['tipo'], 'texto' => $e['texto'], 'usuario' => $e['usuario'], 'criado_em' => $e['criado_em']],
                Db::all('SELECT e.*, u.nome usuario FROM cns_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id WHERE e.tenant_id = ? AND e.pedido_id = ? ORDER BY e.id', [$t, $p['id']])),
        ];
    }

    private static function evento(int $t, int $cicloId, ?int $pedidoId, string $tipo, ?string $texto = null): void
    {
        Db::run('INSERT INTO cns_eventos (tenant_id, ciclo_id, pedido_id, usuario_id, tipo, texto) VALUES (?,?,?,?,?,?)',
            [$t, $cicloId, $pedidoId, Sessao::usuario()['id'], $tipo, $texto]);
    }

    /** Grava nos itens o preço atual do catálogo (no envio e na aprovação final). */
    private static function congelarPrecos(int $pedidoId): void
    {
        Db::run('UPDATE cns_pedidos_itens i JOIN cns_produtos pr ON pr.id = i.produto_id SET i.preco_unit = pr.preco_ref WHERE i.pedido_id = ?', [$pedidoId]);
    }

    // ================================================================ painel e loja

    /** Resumo para a tela inicial e o menu. */
    public static function resumo(Requisicao $r): array
    {
        $vazio = ['ciclo' => null, 'para_mim' => 0, 'casas' => [], 'conferir' => 0, 'tarefa_ciclo' => null];
        if (!Acesso::tem('cns.ver')) return $vazio;
        $t = Sessao::tenantId();
        self::abrirAutomatico($t);
        $ciclo = self::cicloAtual($t);
        $gerir = Acesso::tem('cns.gerir');
        $agenda = $gerir ? self::agendaPublica($t) : null;
        if (!$ciclo) return $vazio + ['pode_gerir' => $gerir, 'agenda' => $agenda];
        $casas = Acesso::casasVisiveis();
        $res = ['ciclo' => self::cicloPublico($ciclo), 'para_mim' => 0, 'casas' => [], 'conferir' => 0, 'tarefa_ciclo' => null, 'pode_gerir' => $gerir, 'agenda' => $agenda];
        $pedidos = [];
        foreach (Db::all('SELECT p.*, (SELECT COUNT(*) FROM cns_pedidos_itens i WHERE i.pedido_id = p.id) qtd_itens FROM cns_pedidos p WHERE p.tenant_id = ? AND p.ciclo_id = ?', [$t, $ciclo['id']]) as $p) {
            $pedidos[(int) $p['casa_id']] = $p;
        }
        $pedirMinhas = Acesso::tem('cns.pedir') && !Acesso::temPerfil('coordenacao_cns');
        foreach ($casas as $casaId) {
            $p = $pedidos[$casaId] ?? null;
            $acoes = self::acoesPedido($p, $ciclo, $casaId);
            $mim = self::paraMim($p, $ciclo, $casaId, $acoes);
            if ($mim) $res['para_mim']++;
            if (in_array('aprovar', $acoes, true) && $mim) $res['conferir']++;
            if ($pedirMinhas && (self::ehDaCasa($casaId) || self::ehOrientadoraDa($casaId))) {
                $res['casas'][] = ['casa_id' => $casaId, 'status' => $p['status'] ?? null, 'status_nome' => $p ? self::STATUS_PEDIDO[$p['status']] : 'Ainda não começou', 'para_mim' => $mim];
            }
        }
        if ($res['casas']) {
            $ids = array_column($res['casas'], 'casa_id');
            $nomes = array_column(Db::all('SELECT id, nome FROM casas_oracao WHERE id IN ' . Db::in($ids), $ids), 'nome', 'id');
            foreach ($res['casas'] as &$c) $c['casa_nome'] = $nomes[$c['casa_id']];
            unset($c);
            usort($res['casas'], fn($a, $b) => [!$a['para_mim'], $a['casa_nome']] <=> [!$b['para_mim'], $b['casa_nome']]);
        }
        $liberado = $ciclo['liberado_compras_em'] !== null;
        if ($gerir && $ciclo['status'] === 'aberto' && self::prazoPassou($ciclo)) $res['tarefa_ciclo'] = 'fechar';
        elseif ($gerir && $ciclo['status'] === 'fechado' && !$liberado) $res['tarefa_ciclo'] = 'consolidar';
        elseif (Acesso::tem('cns.compras') && !$gerir && $ciclo['status'] === 'fechado' && $liberado) $res['tarefa_ciclo'] = 'comprar';
        elseif ($gerir && $ciclo['status'] === 'comprado') $res['tarefa_ciclo'] = $ciclo['estoque_recebido_em'] ? 'distribuir' : 'receber';
        if ($res['tarefa_ciclo']) $res['para_mim']++;
        return $res;
    }

    /** A "loja" de uma casa no ciclo atual: produtos e o carrinho (pedido) da casa. */
    public static function loja(Requisicao $r): array
    {
        Acesso::exigir('cns.ver');
        $t = Sessao::tenantId();
        self::abrirAutomatico($t);
        $casaId = ctype_digit((string) ($r->query['casa_id'] ?? '')) ? (int) $r->query['casa_id'] : 0;
        if (!$casaId || !Acesso::podeVerCasa($casaId)) throw HttpErro::naoEncontrado('Casa de Oração');
        return self::montarLoja($t, $casaId);
    }

    private static function montarLoja(int $t, int $casaId): array
    {
        $ciclo = self::cicloAtual($t);
        $casa = Db::one('SELECT c.id, c.nome, c.codigo, g.nome grupo FROM casas_oracao c JOIN grupos g ON g.id = c.grupo_id WHERE c.tenant_id = ? AND c.id = ?', [$t, $casaId]);
        $base = ['casa' => ['id' => (int) $casa['id'], 'nome' => $casa['nome'], 'codigo' => $casa['codigo'], 'grupo' => $casa['grupo']], 'categorias' => self::CATEGORIAS];
        if (!$ciclo) return $base + ['ciclo' => null, 'pedido' => null, 'produtos' => [], 'acoes' => []];
        $p = self::pedidoDaCasa($t, (int) $ciclo['id'], $casaId);
        return $base + [
            'ciclo' => self::cicloPublico($ciclo),
            'pedido' => $p ? self::pedidoCompleto($t, $p, $ciclo) : null,
            'produtos' => self::produtos($t),
            'acoes' => self::acoesPedido($p, $ciclo, $casaId),
        ];
    }

    /** Salva o carrinho inteiro (cria o rascunho na primeira vez). */
    public static function salvarCarrinho(Requisicao $r): array
    {
        $t = Sessao::tenantId();
        $casaId = (int) ($r->corpo['casa_id'] ?? 0);
        if (!$casaId || !Acesso::podeVerCasa($casaId)) throw HttpErro::naoEncontrado('Casa de Oração');
        return Db::transacao(function () use ($r, $t, $casaId) {
            $ciclo = Db::one("SELECT * FROM cns_ciclos WHERE tenant_id = ? AND status = 'aberto' FOR UPDATE", [$t]);
            if (!$ciclo) throw new HttpErro(409, 'Não há ciclo de pedidos aberto agora.');
            $p = self::pedidoDaCasa($t, (int) $ciclo['id'], $casaId);
            if (!in_array('editar', self::acoesPedido($p, $ciclo, $casaId), true)) {
                if (!self::podePedir($casaId)) throw HttpErro::proibido();
                if (self::prazoPassou($ciclo)) throw new HttpErro(409, 'O prazo deste ciclo terminou em ' . date('d/m', strtotime($ciclo['prazo'])) . '. Fale com a orientadora.');
                throw new HttpErro(409, 'O pedido já foi enviado. Para mudar, toque em "Desfazer envio".');
            }
            $v = (new Validar($r->corpo))->texto('observacao', false, 1000);
            $produtos = array_column(Db::all('SELECT id, nome, max_por_pedido, preco_ref FROM cns_produtos WHERE tenant_id = ? AND ativo = 1', [$t]), null, 'id');
            $itens = [];
            foreach ((is_array($r->corpo['itens'] ?? null) ? $r->corpo['itens'] : []) as $i => $it) {
                $pid = (int) ($it['produto_id'] ?? 0);
                $q = filter_var($it['quantidade'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => self::MAX_QTD]]);
                if (!isset($produtos[$pid]) || $q === false) { $v->erro("itens.$i", 'Item inválido.'); continue; }
                $max = $produtos[$pid]['max_por_pedido'];
                if ($max !== null && $q > (int) $max) $v->erro("itens.$i", "{$produtos[$pid]['nome']}: no máximo $max por pedido.");
                if ($q > 0) $itens[$pid] = $q;
            }
            $d = $v->ok();
            if (!$p) {
                $pid = Db::insert('INSERT INTO cns_pedidos (tenant_id, ciclo_id, casa_id, criado_por) VALUES (?,?,?,?)', [$t, $ciclo['id'], $casaId, Sessao::usuario()['id']]);
                self::evento($t, (int) $ciclo['id'], $pid, 'criado');
            } else {
                $pid = (int) $p['id'];
            }
            Db::run('UPDATE cns_pedidos SET observacao = ? WHERE id = ?', [$d['observacao'], $pid]);
            Db::run('DELETE FROM cns_pedidos_itens WHERE tenant_id = ? AND pedido_id = ?', [$t, $pid]);
            foreach ($itens as $prod => $q) {
                Db::run('INSERT INTO cns_pedidos_itens (tenant_id, pedido_id, produto_id, quantidade, preco_unit) VALUES (?,?,?,?,?)', [$t, $pid, $prod, $q, $produtos[$prod]['preco_ref']]);
            }
            return self::montarLoja($t, $casaId);
        });
    }

    // ================================================================ ações do pedido

    public static function verPedido(Requisicao $r, int $id): array
    {
        Acesso::exigir('cns.ver');
        $t = Sessao::tenantId();
        $p = self::carregarPedido($t, $id);
        return self::pedidoCompleto($t, $p, self::ciclo($t, (int) $p['ciclo_id']));
    }

    private static function carregarPedido(int $t, int $id, bool $travar = false): array
    {
        if ($travar) Db::run('SELECT id FROM cns_pedidos WHERE tenant_id = ? AND id = ? FOR UPDATE', [$t, $id]);
        $p = Db::one('SELECT p.*, (SELECT COUNT(*) FROM cns_pedidos_itens i WHERE i.pedido_id = p.id) qtd_itens FROM cns_pedidos p WHERE p.tenant_id = ? AND p.id = ?', [$t, $id]);
        if (!$p || !Acesso::podeVerCasa((int) $p['casa_id'])) throw HttpErro::naoEncontrado('Pedido');
        return $p;
    }

    public static function acaoPedido(Requisicao $r, int $id): array
    {
        Acesso::exigir('cns.ver');
        $t = Sessao::tenantId();
        $acao = $r->corpo['acao'] ?? null;
        return Db::transacao(function () use ($r, $t, $id, $acao) {
            $p = self::carregarPedido($t, $id, true);
            $ciclo = self::ciclo($t, (int) $p['ciclo_id']);
            $acoes = self::acoesPedido($p, $ciclo, (int) $p['casa_id']);
            if (!is_string($acao) || !in_array($acao, $acoes, true) || $acao === 'editar') {
                if (in_array($acao, ['enviar', 'desfazer_envio'], true) && $ciclo['status'] === 'aberto' && self::prazoPassou($ciclo)) {
                    throw new HttpErro(409, 'O prazo deste ciclo terminou em ' . date('d/m', strtotime($ciclo['prazo'])) . '. Fale com a orientadora.');
                }
                if ($acao === 'enviar' && (int) $p['qtd_itens'] === 0) throw new HttpErro(409, 'Escolha pelo menos um produto antes de enviar.');
                throw new HttpErro(409, 'Esta ação não está disponível para você neste momento. Atualize a página.');
            }
            $eu = Sessao::usuario()['id'];
            $d = $r->corpo;
            switch ($acao) {
                case 'enviar':
                    Db::run("UPDATE cns_pedidos SET status = 'enviado', enviado_por = ?, enviado_em = NOW(), motivo = NULL WHERE id = ?", [$eu, $id]);
                    self::congelarPrecos($id);
                    self::evento($t, (int) $ciclo['id'], $id, 'enviado');
                    break;
                case 'desfazer_envio':
                    Db::run("UPDATE cns_pedidos SET status = 'rascunho' WHERE id = ?", [$id]);
                    self::evento($t, (int) $ciclo['id'], $id, 'envio_desfeito');
                    break;
                case 'aprovar':
                    $final = self::etapaAnalise($p, $acoes) === 'final';
                    $ok = (new Validar($d))->texto('texto', false, 1000);
                    $ajustes = [];
                    foreach ((is_array($d['itens'] ?? null) ? $d['itens'] : []) as $i => $it) {
                        $q = filter_var($it['quantidade_aprovada'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => self::MAX_QTD]]);
                        if ($q === false) { $ok->erro("itens.$i", 'Quantidade inválida.'); continue; }
                        $ajustes[(int) ($it['produto_id'] ?? 0)] = $q;
                    }
                    $texto = $ok->ok()['texto'];
                    $mudou = [];
                    foreach (Db::all('SELECT i.produto_id, i.quantidade, i.quantidade_aprovada, pr.nome FROM cns_pedidos_itens i JOIN cns_produtos pr ON pr.id = i.produto_id WHERE i.pedido_id = ?', [$id]) as $it) {
                        $atual = $it['quantidade_aprovada'] === null ? (int) $it['quantidade'] : (int) $it['quantidade_aprovada'];
                        $q = $ajustes[(int) $it['produto_id']] ?? $atual;
                        if ($q !== $atual) $mudou[] = "{$it['nome']}: $atual → $q";
                        Db::run('UPDATE cns_pedidos_itens SET quantidade_aprovada = ? WHERE pedido_id = ? AND produto_id = ?', [$q, $id, $it['produto_id']]);
                    }
                    $nota = trim(($mudou ? 'Ajustes: ' . implode('; ', $mudou) . '. ' : '') . ($texto ?? '')) ?: null;
                    if ($final) {
                        // Casa sem orientadora (ou a Coordenação adiantou): a 1ª análise fica registrada junto.
                        $primeira = $p['status'] === 'enviado' ? ', conferido_por = ?, conferido_em = NOW()' : '';
                        Db::run("UPDATE cns_pedidos SET status = 'aprovado', analisado_por = ?, analisado_em = NOW(), motivo = ?$primeira WHERE id = ?",
                            $primeira ? [$eu, $texto, $eu, $id] : [$eu, $texto, $id]);
                        self::congelarPrecos($id);
                        self::evento($t, (int) $ciclo['id'], $id, 'aprovado', $nota);
                    } else {
                        Db::run("UPDATE cns_pedidos SET status = 'conferido', conferido_por = ?, conferido_em = NOW(), motivo = ? WHERE id = ?", [$eu, $texto, $id]);
                        self::evento($t, (int) $ciclo['id'], $id, 'conferido', $nota);
                    }
                    break;
                case 'devolver':
                    $texto = (new Validar($d))->texto('texto', true, 1000, 5)->ok()['texto'];
                    $campo = $p['status'] === 'conferido' ? 'analisado' : 'conferido';
                    Db::run("UPDATE cns_pedidos SET status = 'devolvido', {$campo}_por = ?, {$campo}_em = NOW(), motivo = ? WHERE id = ?", [$eu, $texto, $id]);
                    self::evento($t, (int) $ciclo['id'], $id, 'devolvido', $texto);
                    break;
                case 'confirmar_recebimento':
                    $texto = (new Validar($d))->texto('texto', false, 1000)->ok()['texto'];
                    Db::run("UPDATE cns_pedidos SET status = 'entregue', recebido_por = ?, recebido_em = NOW(), recebimento_obs = ? WHERE id = ?", [$eu, $texto, $id]);
                    self::evento($t, (int) $ciclo['id'], $id, 'recebido', $texto);
                    break;
            }
            Auditoria::registrar('cns_' . $acao, 'cns_pedidos', $id, ['status' => $p['status']], null);
            return self::pedidoCompleto($t, self::carregarPedido($t, $id), self::ciclo($t, (int) $p['ciclo_id']));
        });
    }

    /** Apaga o pedido de uma casa, com itens e histórico. Não mexe no estoque já movimentado. */
    public static function excluirPedido(Requisicao $r, int $id): array
    {
        Acesso::exigir('cns.ver');
        $t = Sessao::tenantId();
        $antes = Db::transacao(function () use ($t, $id) {
            $p = self::carregarPedido($t, $id, true);
            if (!self::podeExcluir((int) $p['casa_id'])) throw HttpErro::proibido();
            $casa = Db::one('SELECT nome FROM casas_oracao WHERE id = ?', [$p['casa_id']]);
            $ciclo = Db::one('SELECT nome FROM cns_ciclos WHERE id = ?', [$p['ciclo_id']]);
            $itens = Db::all('SELECT pr.nome, i.quantidade, i.quantidade_aprovada FROM cns_pedidos_itens i JOIN cns_produtos pr ON pr.id = i.produto_id WHERE i.pedido_id = ?', [$id]);
            Db::run('DELETE FROM cns_eventos WHERE tenant_id = ? AND pedido_id = ?', [$t, $id]);
            Db::run('DELETE FROM cns_pedidos_itens WHERE tenant_id = ? AND pedido_id = ?', [$t, $id]);
            Db::run('DELETE FROM cns_pedidos WHERE tenant_id = ? AND id = ?', [$t, $id]);
            return ['casa' => $casa['nome'] ?? null, 'ciclo' => $ciclo['nome'] ?? null, 'status' => $p['status'], 'itens' => $itens];
        });
        Auditoria::registrar('excluir', 'cns_pedidos', $id, $antes, null);
        return ['ok' => true];
    }

    /** Lista de pedidos de um ciclo (análises, acompanhamento). */
    public static function listarPedidos(Requisicao $r): array
    {
        Acesso::exigir('cns.ver');
        $t = Sessao::tenantId();
        self::abrirAutomatico($t);
        $ciclo = !empty($r->query['ciclo_id']) ? self::ciclo($t, (int) $r->query['ciclo_id']) : self::cicloAtual($t);
        if (!$ciclo) return ['ciclo' => null, 'itens' => []];
        $casas = Acesso::casasVisiveis();
        if (!$casas) return ['ciclo' => self::cicloPublico($ciclo), 'itens' => []];
        $linhas = Db::all('SELECT p.*, c.nome casa_nome, c.codigo casa_codigo, g.nome grupo, u.nome enviado_por_nome,
                                  (SELECT COUNT(*) FROM cns_pedidos_itens i WHERE i.pedido_id = p.id) qtd_itens,
                                  (SELECT COALESCE(SUM(COALESCE(i.quantidade_aprovada, i.quantidade)), 0) FROM cns_pedidos_itens i WHERE i.pedido_id = p.id) qtd_total,
                                  (SELECT SUM(COALESCE(i.quantidade_aprovada, i.quantidade) * COALESCE(i.preco_unit, pr.preco_ref))
                                     FROM cns_pedidos_itens i JOIN cns_produtos pr ON pr.id = i.produto_id WHERE i.pedido_id = p.id) valor
                             FROM cns_pedidos p JOIN casas_oracao c ON c.id = p.casa_id JOIN grupos g ON g.id = c.grupo_id LEFT JOIN usuarios u ON u.id = p.enviado_por
                            WHERE p.tenant_id = ? AND p.ciclo_id = ? AND p.casa_id IN ' . Db::in($casas) . " ORDER BY FIELD(p.status,'enviado','conferido','devolvido','rascunho','aprovado','entregue','cancelado'), g.nome, c.nome",
            array_merge([$t, $ciclo['id']], $casas));
        $itens = [];
        foreach ($linhas as $p) {
            $acoes = self::acoesPedido($p, $ciclo, (int) $p['casa_id']);
            $itens[] = [
                'id' => (int) $p['id'], 'status' => $p['status'], 'status_nome' => self::STATUS_PEDIDO[$p['status']],
                'casa' => ['id' => (int) $p['casa_id'], 'nome' => $p['casa_nome'], 'codigo' => $p['casa_codigo'], 'grupo' => $p['grupo']],
                'qtd_itens' => (int) $p['qtd_itens'], 'qtd_total' => (int) $p['qtd_total'], 'valor' => $p['valor'] === null ? null : round((float) $p['valor'], 2),
                'enviado_por' => $p['enviado_por_nome'], 'enviado_em' => $p['enviado_em'],
                'para_mim' => self::paraMim($p, $ciclo, (int) $p['casa_id'], $acoes),
                'etapa_analise' => self::etapaAnalise($p, $acoes),
            ];
        }
        $semPedido = [];
        if (Acesso::tem('cns.conferir') || Acesso::tem('cns.gerir')) {
            $ids = array_map(fn($i) => $i['casa']['id'], $itens);
            $faltam = array_values(array_diff($casas, $ids));
            if ($faltam) $semPedido = Db::all('SELECT c.id, c.nome, c.codigo, g.nome grupo FROM casas_oracao c JOIN grupos g ON g.id = c.grupo_id
                                                WHERE c.ativo = 1 AND c.id IN ' . Db::in($faltam) . ' ORDER BY g.nome, c.nome', $faltam);
        }
        return ['ciclo' => self::cicloPublico($ciclo), 'itens' => $itens,
            'sem_pedido' => array_map(fn($c) => ['id' => (int) $c['id'], 'nome' => $c['nome'], 'codigo' => $c['codigo'], 'grupo' => $c['grupo']], $semPedido)];
    }

    // ================================================================ ciclos (Coordenação CNS)

    public static function listarCiclos(Requisicao $r): array
    {
        Acesso::exigir('cns.ver');
        $t = Sessao::tenantId();
        self::abrirAutomatico($t);
        return array_map(function ($c) use ($t) {
            $cont = array_column(Db::all('SELECT status, COUNT(*) n FROM cns_pedidos WHERE tenant_id = ? AND ciclo_id = ? GROUP BY status', [$t, $c['id']]), 'n', 'status');
            return self::cicloPublico($c) + ['pedidos' => array_map('intval', $cont)];
        }, Db::all('SELECT * FROM cns_ciclos WHERE tenant_id = ? ORDER BY id DESC LIMIT 24', [$t]));
    }

    public static function criarCiclo(Requisicao $r): never
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        $d = self::validarCiclo($r->corpo);
        if (Db::one("SELECT id FROM cns_ciclos WHERE tenant_id = ? AND status = 'aberto'", [$t])) {
            throw new HttpErro(409, 'Já existe um ciclo recebendo pedidos. Feche-o antes de abrir outro.');
        }
        // O mês do prazo é a referência do ciclo (a agenda automática não abre outro do mesmo mês).
        $ref = substr($d['prazo'], 0, 7);
        if (Db::one('SELECT id FROM cns_ciclos WHERE tenant_id = ? AND referencia = ?', [$t, $ref])) $ref = null;
        $id = Db::insert('INSERT INTO cns_ciclos (tenant_id, nome, referencia, prazo, observacao, criado_por) VALUES (?,?,?,?,?,?)',
            [$t, $d['nome'], $ref, $d['prazo'], $d['observacao'], Sessao::usuario()['id']]);
        self::evento($t, $id, null, 'ciclo_aberto', "Prazo: {$d['prazo']}");
        Auditoria::registrar('criar', 'cns_ciclos', $id, null, $d);
        Resposta::json(self::cicloPublico(self::ciclo($t, $id)), 201);
    }

    public static function editarCiclo(Requisicao $r, int $id): array
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        $c = self::ciclo($t, $id);
        if ($c['status'] !== 'aberto') throw new HttpErro(409, 'Só dá para mudar o ciclo enquanto ele recebe pedidos.');
        $d = self::validarCiclo($r->corpo);
        Db::run('UPDATE cns_ciclos SET nome = ?, prazo = ?, observacao = ? WHERE id = ?', [$d['nome'], $d['prazo'], $d['observacao'], $id]);
        if ($d['prazo'] !== $c['prazo']) self::evento($t, $id, null, 'prazo_alterado', "Prazo: {$c['prazo']} → {$d['prazo']}");
        Auditoria::registrar('editar', 'cns_ciclos', $id, ['nome' => $c['nome'], 'prazo' => $c['prazo']], $d);
        return self::cicloPublico(self::ciclo($t, $id));
    }

    private static function validarCiclo(array $corpo): array
    {
        $v = (new Validar($corpo))->texto('nome', true, 80, 3)->texto('observacao', false, 2000);
        $prazo = $corpo['prazo'] ?? '';
        $dt = is_string($prazo) ? \DateTime::createFromFormat('!Y-m-d', $prazo) : false;
        if (!$dt || $dt->format('Y-m-d') !== $prazo) $v->erro('prazo', 'Informe a data do prazo.');
        elseif ($prazo < date('Y-m-d')) $v->erro('prazo', 'O prazo não pode estar no passado.');
        return $v->ok() + ['prazo' => $prazo];
    }

    public static function acaoCiclo(Requisicao $r, int $id): array
    {
        $t = Sessao::tenantId();
        $acao = $r->corpo['acao'] ?? null;
        return Db::transacao(function () use ($r, $t, $id, $acao) {
            Db::run('SELECT id FROM cns_ciclos WHERE tenant_id = ? AND id = ? FOR UPDATE', [$t, $id]);
            $c = self::ciclo($t, $id);
            $eu = Sessao::usuario()['id'];
            $gerir = Acesso::tem('cns.gerir');
            $liberado = $c['liberado_compras_em'] !== null;
            if ($acao === 'fechar' && $c['status'] === 'aberto' && $gerir) {
                $aprovarPendentes = filter_var($r->corpo['aprovar_enviados'] ?? false, FILTER_VALIDATE_BOOLEAN);
                if ($aprovarPendentes) {
                    $pend = Db::all("SELECT id, status FROM cns_pedidos WHERE tenant_id = ? AND ciclo_id = ? AND status IN ('enviado','conferido')", [$t, $id]);
                    foreach ($pend as $pp) {
                        $pid = (int) $pp['id'];
                        Db::run('UPDATE cns_pedidos_itens SET quantidade_aprovada = COALESCE(quantidade_aprovada, quantidade) WHERE pedido_id = ?', [$pid]);
                        $primeira = $pp['status'] === 'enviado' ? ', conferido_por = ?, conferido_em = NOW()' : '';
                        Db::run("UPDATE cns_pedidos SET status = 'aprovado', analisado_por = ?, analisado_em = NOW()$primeira WHERE id = ?", $primeira ? [$eu, $eu, $pid] : [$eu, $pid]);
                        self::congelarPrecos($pid);
                        self::evento($t, $id, $pid, 'aprovado', 'Aprovado como estava, no fechamento do ciclo.');
                    }
                }
                $fora = array_column(Db::all("SELECT id FROM cns_pedidos WHERE tenant_id = ? AND ciclo_id = ? AND status IN ('rascunho','enviado','conferido','devolvido')", [$t, $id]), 'id');
                foreach ($fora as $pid) {
                    Db::run("UPDATE cns_pedidos SET status = 'cancelado', motivo = 'Não foi aprovado até o fechamento do ciclo.' WHERE id = ?", [$pid]);
                    self::evento($t, $id, (int) $pid, 'fora_do_ciclo', 'Não foi aprovado até o fechamento do ciclo.');
                }
                Db::run("UPDATE cns_ciclos SET status = 'fechado', fechado_em = NOW() WHERE id = ?", [$id]);
                self::evento($t, $id, null, 'ciclo_fechado', count($fora) ? count($fora) . ' pedido(s) ficaram fora.' : null);
            } elseif ($acao === 'liberar_compras' && $c['status'] === 'fechado' && !$liberado && $gerir) {
                if (isset($r->corpo['itens'])) self::gravarCompra($t, $id, $r->corpo);
                // Se a Coordenação não mexeu na lista, vale a sugestão (pedido + mínimo do Central − o que tem no Central).
                if (!Db::one('SELECT 1 FROM cns_ciclos_compra WHERE ciclo_id = ? LIMIT 1', [$id])) {
                    foreach (self::montarConsolidado($t, $c)['produtos'] as $p) {
                        if ($p['comprar'] > 0) Db::run('INSERT INTO cns_ciclos_compra (tenant_id, ciclo_id, produto_id, quantidade, preco_unit) VALUES (?,?,?,?,?)',
                            [$t, $id, $p['produto_id'], $p['comprar'], $p['preco_ref']]);
                    }
                }
                Db::run('UPDATE cns_ciclos SET liberado_compras_em = NOW() WHERE id = ?', [$id]);
                $n = (int) Db::one('SELECT COUNT(*) n FROM cns_ciclos_compra WHERE ciclo_id = ? AND quantidade > 0', [$id])['n'];
                self::evento($t, $id, null, 'compra_liberada', "$n produto(s) para comprar.");
            } elseif ($acao === 'reabrir_consolidacao' && $c['status'] === 'fechado' && $liberado && $gerir) {
                Db::run('UPDATE cns_ciclos SET liberado_compras_em = NULL WHERE id = ?', [$id]);
                self::evento($t, $id, null, 'consolidacao_reaberta', (new Validar($r->corpo))->texto('texto', false, 1000)->ok()['texto']);
            } elseif ($acao === 'comprado' && $c['status'] === 'fechado' && Acesso::tem('cns.compras')) {
                if (!$liberado) throw new HttpErro(409, 'A Coordenação CNS ainda não liberou a lista de compra deste ciclo.');
                $v = (new Validar($r->corpo))->texto('texto', false, 1000);
                $valor = null;
                if (($r->corpo['valor'] ?? '') !== '' && ($r->corpo['valor'] ?? null) !== null) {
                    $valor = Validar::reais($r->corpo['valor']);
                    if ($valor === null || $valor < 0) $v->erro('valor', 'Valor inválido.');
                }
                $texto = $v->ok()['texto'];
                Db::run("UPDATE cns_ciclos SET status = 'comprado', comprado_em = NOW(), valor_compra = ? WHERE id = ?", [$valor, $id]);
                self::evento($t, $id, null, 'ciclo_comprado', $texto);
            } elseif ($acao === 'distribuido' && $c['status'] === 'comprado' && $gerir) {
                if (!$c['estoque_recebido_em']) throw new HttpErro(409, 'Registre primeiro a chegada da compra no DML Central.');
                self::distribuirEstoque($t, $c, filter_var($r->corpo['forcar'] ?? false, FILTER_VALIDATE_BOOLEAN));
                Db::run("UPDATE cns_ciclos SET status = 'distribuido', distribuido_em = NOW() WHERE id = ?", [$id]);
                self::evento($t, $id, null, 'ciclo_distribuido');
            } else {
                throw new HttpErro(409, 'Esta ação não está disponível para você neste momento. Atualize a página.');
            }
            Auditoria::registrar('cns_ciclo_' . $acao, 'cns_ciclos', $id, ['status' => $c['status']], null);
            return self::cicloPublico(self::ciclo($t, $id));
        });
    }

    /** A Coordenação ajusta quanto comprar de cada produto (antes de liberar para Compras). */
    public static function salvarCompra(Requisicao $r, int $id): array
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $t, $id) {
            Db::run('SELECT id FROM cns_ciclos WHERE tenant_id = ? AND id = ? FOR UPDATE', [$t, $id]);
            $c = self::ciclo($t, $id);
            if ($c['status'] !== 'fechado' || $c['liberado_compras_em'] !== null) {
                throw new HttpErro(409, $c['status'] === 'aberto' ? 'Feche o ciclo antes de montar a lista de compra.' : 'A lista de compra já foi liberada. Para mudar, reabra a consolidação.');
            }
            self::gravarCompra($t, $id, $r->corpo);
            Auditoria::registrar('cns_lista_compra', 'cns_ciclos', $id, null, ['itens' => $r->corpo['itens'] ?? null]);
            return self::montarConsolidado($t, self::ciclo($t, $id));
        });
    }

    /** Grava a lista de compra inteira (o que não vier fica com a quantidade que já estava ou com a sugestão). */
    private static function gravarCompra(int $t, int $cicloId, array $corpo): void
    {
        $v = new Validar($corpo);
        $produtos = array_column(Db::all('SELECT id, preco_ref FROM cns_produtos WHERE tenant_id = ?', [$t]), 'preco_ref', 'id');
        $novos = [];
        foreach ((is_array($corpo['itens'] ?? null) ? $corpo['itens'] : []) as $i => $it) {
            $pid = (int) ($it['produto_id'] ?? 0);
            $q = filter_var($it['quantidade'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 99999]]);
            if (!array_key_exists($pid, $produtos) || $q === false) { $v->erro("itens.$i", 'Quantidade inválida.'); continue; }
            $novos[$pid] = $q;
        }
        $v->ok();
        $base = [];
        foreach (self::montarConsolidado($t, self::ciclo($t, $cicloId))['produtos'] as $p) $base[$p['produto_id']] = $p['comprar'];
        $final = array_replace($base, $novos);
        Db::run('DELETE FROM cns_ciclos_compra WHERE ciclo_id = ?', [$cicloId]);
        foreach ($final as $pid => $q) {
            Db::run('INSERT INTO cns_ciclos_compra (tenant_id, ciclo_id, produto_id, quantidade, preco_unit) VALUES (?,?,?,?,?)', [$t, $cicloId, $pid, $q, $produtos[$pid]]);
        }
    }

    /** A compra chegou: entra no DML Central (quantidades reais, que podem diferir da lista). */
    public static function receberCompra(Requisicao $r, int $id): array
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        return Db::transacao(function () use ($r, $t, $id) {
            Db::run('SELECT id FROM cns_ciclos WHERE tenant_id = ? AND id = ? FOR UPDATE', [$t, $id]);
            $c = self::ciclo($t, $id);
            if ($c['status'] !== 'comprado' || $c['estoque_recebido_em']) throw new HttpErro(409, 'A chegada desta compra já foi registrada ou a compra ainda não foi feita.');
            $v = (new Validar($r->corpo))->texto('texto', false, 1000);
            $itens = EstoqueControlador::itens($t, $r->corpo, $v, 1);
            $texto = $v->ok()['texto'];
            if (!$itens) throw HttpErro::invalido(['itens' => 'Informe o que chegou.']);
            $central = (int) Estoque::central($t)['id'];
            foreach ($itens as $pid => $q) Estoque::mover($t, $central, $pid, $q, 'entrada', 'compra', ['ciclo_id' => $id], 'Compra do ciclo ' . $c['nome']);
            Db::run('UPDATE cns_ciclos SET estoque_recebido_em = NOW() WHERE id = ?', [$id]);
            self::evento($t, $id, null, 'compra_recebida', $texto);
            Auditoria::registrar('cns_receber_compra', 'cns_ciclos', $id, null, ['itens' => $itens]);
            return self::cicloPublico(self::ciclo($t, $id));
        });
    }

    /**
     * Entrega do ciclo: sai do DML Central e entra no DML de cada casa o que foi aprovado.
     * Se faltar no Central, recusa e lista o que falta; com $forcar, entrega o que tem (por ordem de grupo e casa)
     * e registra no pedido o que faltou.
     */
    private static function distribuirEstoque(int $t, array $c, bool $forcar): void
    {
        $central = (int) Estoque::central($t)['id'];
        $linhas = Db::all("SELECT p.id pedido_id, p.casa_id, pr.id produto_id, pr.nome, COALESCE(i.quantidade_aprovada, i.quantidade) qtd
                             FROM cns_pedidos p JOIN cns_pedidos_itens i ON i.pedido_id = p.id JOIN cns_produtos pr ON pr.id = i.produto_id
                             JOIN casas_oracao ca ON ca.id = p.casa_id JOIN grupos g ON g.id = ca.grupo_id
                            WHERE p.tenant_id = ? AND p.ciclo_id = ? AND p.status IN ('aprovado','entregue') AND COALESCE(i.quantidade_aprovada, i.quantidade) > 0
                            ORDER BY g.nome, ca.nome", [$t, $c['id']]);
        $precisa = [];
        foreach ($linhas as $l) $precisa[(int) $l['produto_id']] = ($precisa[(int) $l['produto_id']] ?? 0) + (int) $l['qtd'];
        $faltas = [];
        $disponivel = [];
        foreach ($precisa as $pid => $q) {
            Db::run('INSERT IGNORE INTO estoque_saldos (tenant_id, local_id, produto_id, quantidade) VALUES (?,?,?,0)', [$t, $central, $pid]);
            $tem = (int) Db::one('SELECT quantidade FROM estoque_saldos WHERE local_id = ? AND produto_id = ? FOR UPDATE', [$central, $pid])['quantidade'];
            $disponivel[$pid] = $tem;
            if ($tem < $q) $faltas[] = ['produto_id' => $pid, 'nome' => Db::one('SELECT nome FROM cns_produtos WHERE id = ?', [$pid])['nome'], 'precisa' => $q, 'tem' => $tem];
        }
        if ($faltas && !$forcar) {
            throw new HttpErro(422, 'Falta material no DML Central para entregar tudo o que foi aprovado.', ['faltas' => json_encode($faltas, JSON_UNESCAPED_UNICODE)]);
        }
        $faltouNaCasa = [];
        foreach ($linhas as $l) {
            $pid = (int) $l['produto_id'];
            $q = min((int) $l['qtd'], $disponivel[$pid]);
            if ($q < (int) $l['qtd']) $faltouNaCasa[(int) $l['pedido_id']][] = "{$l['nome']}: faltaram " . ((int) $l['qtd'] - $q);
            if ($q <= 0) continue;
            $disponivel[$pid] -= $q;
            $localCasa = Estoque::localDaCasa($t, (int) $l['casa_id']);
            Estoque::mover($t, $central, $pid, -$q, 'saida', 'distribuicao', ['ciclo_id' => $c['id'], 'outro_local_id' => $localCasa['id']], 'Entrega do ciclo ' . $c['nome']);
            Estoque::mover($t, (int) $localCasa['id'], $pid, $q, 'entrada', 'distribuicao', ['ciclo_id' => $c['id'], 'outro_local_id' => $central], 'Entrega do ciclo ' . $c['nome']);
        }
        foreach ($faltouNaCasa as $pedidoId => $txt) self::evento($t, (int) $c['id'], $pedidoId, 'faltou_na_entrega', implode('; ', $txt) . '.');
    }

    /** Consolidação: total pedido × DML Central → lista de compra por fornecedor; gasto por casa e por grupo; separação. */
    public static function consolidado(Requisicao $r, int $id): array
    {
        if (!Acesso::tem('cns.gerir') && !Acesso::tem('cns.compras')) throw HttpErro::proibido();
        $t = Sessao::tenantId();
        return self::montarConsolidado($t, self::ciclo($t, $id));
    }

    private static function montarConsolidado(int $t, array $c): array
    {
        $id = (int) $c['id'];
        $linhas = Db::all("SELECT p.id pedido_id, p.casa_id, p.status, c.nome casa, c.codigo, g.nome grupo, pr.id produto_id,
                                  COALESCE(i.quantidade_aprovada, i.quantidade) qtd, COALESCE(i.preco_unit, pr.preco_ref) preco
                             FROM cns_pedidos p JOIN cns_pedidos_itens i ON i.pedido_id = p.id JOIN cns_produtos pr ON pr.id = i.produto_id
                             JOIN casas_oracao c ON c.id = p.casa_id JOIN grupos g ON g.id = c.grupo_id
                            WHERE p.tenant_id = ? AND p.ciclo_id = ? AND p.status IN ('aprovado','entregue') AND COALESCE(i.quantidade_aprovada, i.quantidade) > 0
                            ORDER BY g.nome, c.nome", [$t, $id]);
        $central = array_column(Db::all('SELECT produto_id, quantidade FROM estoque_saldos WHERE local_id = ?', [Estoque::central($t)['id']]), 'quantidade', 'produto_id');
        $salva = [];
        foreach (Db::all('SELECT produto_id, quantidade, preco_unit FROM cns_ciclos_compra WHERE ciclo_id = ?', [$id]) as $s) $salva[(int) $s['produto_id']] = $s;
        $catalogo = array_column(Db::all('SELECT * FROM cns_produtos WHERE tenant_id = ?', [$t]), null, 'id');

        $pedido = [];
        $grupos = [];
        foreach ($linhas as $l) {
            $pid = (int) $l['produto_id'];
            $q = (int) $l['qtd'];
            $pedido[$pid] = ($pedido[$pid] ?? 0) + $q;
            $valor = $l['preco'] === null ? null : round((float) $l['preco'] * $q, 2);
            $g = $l['grupo'];
            $grupos[$g] ??= ['grupo' => $g, 'valor' => 0.0, 'casas' => []];
            $casa = &$grupos[$g]['casas'][(int) $l['casa_id']];
            $casa ??= ['casa_id' => (int) $l['casa_id'], 'casa' => $l['casa'], 'codigo' => $l['codigo'], 'pedido_id' => (int) $l['pedido_id'], 'status' => $l['status'], 'valor' => 0.0, 'sem_preco' => 0, 'itens' => []];
            $casa['itens'][$pid] = $q;
            if ($valor === null) $casa['sem_preco']++; else { $casa['valor'] += $valor; $grupos[$g]['valor'] += $valor; }
            unset($casa);
        }
        // Produtos que entram na conta: os pedidos, os que estão abaixo do mínimo no Central e os que a Coordenação pôs na lista.
        $ids = array_keys($pedido + $salva);
        foreach ($catalogo as $pid => $p) {
            if ($p['ativo'] && $p['minimo_central'] !== null && (int) ($central[$pid] ?? 0) < (int) $p['minimo_central']) $ids[] = (int) $pid;
        }
        $produtos = [];
        foreach (array_unique($ids) as $pid) {
            $p = $catalogo[$pid];
            $total = $pedido[$pid] ?? 0;
            $tem = (int) ($central[$pid] ?? 0);
            $minimo = $p['minimo_central'] === null ? null : (int) $p['minimo_central'];
            $sugestao = max(0, $total + ($minimo ?? 0) - $tem);
            $comprar = isset($salva[$pid]) ? (int) $salva[$pid]['quantidade'] : $sugestao;
            $preco = isset($salva[$pid]) && $salva[$pid]['preco_unit'] !== null ? (float) $salva[$pid]['preco_unit'] : ($p['preco_ref'] !== null ? (float) $p['preco_ref'] : null);
            $produtos[] = [
                'produto_id' => (int) $pid, 'nome' => $p['nome'], 'embalagem' => $p['embalagem'], 'unidade' => $p['unidade'], 'categoria' => $p['categoria'],
                'fornecedor' => $p['fornecedor'], 'preco_ref' => $preco,
                'total' => $total, 'no_central' => $tem, 'minimo_central' => $minimo, 'sugestao' => $sugestao, 'comprar' => $comprar,
                'subtotal' => $preco === null ? null : round($preco * $comprar, 2),
            ];
        }
        $ordemCat = array_flip(array_keys(self::CATEGORIAS));
        usort($produtos, fn($a, $b) => [$a['fornecedor'] === null, $a['fornecedor'], $ordemCat[$a['categoria']], $a['nome']] <=> [$b['fornecedor'] === null, $b['fornecedor'], $ordemCat[$b['categoria']], $b['nome']]);
        $estimado = 0.0;
        $semPreco = 0;
        $fornecedores = [];
        foreach ($produtos as $p) {
            if ($p['comprar'] <= 0) continue;
            $f = $p['fornecedor'] ?? 'Sem fornecedor';
            $fornecedores[$f] ??= ['fornecedor' => $f, 'itens' => 0, 'valor' => 0.0, 'sem_preco' => 0];
            $fornecedores[$f]['itens']++;
            if ($p['subtotal'] === null) { $semPreco++; $fornecedores[$f]['sem_preco']++; }
            else { $estimado += $p['subtotal']; $fornecedores[$f]['valor'] += $p['subtotal']; }
        }
        $gerir = Acesso::tem('cns.gerir');
        $editavel = $gerir && $c['status'] === 'fechado' && $c['liberado_compras_em'] === null;
        $valorPedidos = array_sum(array_column($grupos, 'valor'));
        return [
            'ciclo' => self::cicloPublico($c),
            'produtos' => $produtos,
            'fornecedores' => array_values(array_map(fn($f) => ['valor' => round($f['valor'], 2)] + $f, $fornecedores)),
            'grupos' => array_values(array_map(fn($g) => ['grupo' => $g['grupo'], 'valor' => round($g['valor'], 2),
                'casas' => array_values(array_map(fn($x) => ['valor' => round($x['valor'], 2)] + $x, $g['casas']))], $grupos)),
            'casas' => count(array_unique(array_column($linhas, 'casa_id'))),
            'valor_pedidos' => round($valorPedidos, 2),
            'estimado' => round($estimado, 2),
            'sem_preco' => $semPreco,
            'lista_salva' => (bool) $salva,
            'pode_editar_compra' => $editavel,
            'pode_liberar' => $editavel,
            'pode_reabrir' => $gerir && $c['status'] === 'fechado' && $c['liberado_compras_em'] !== null,
        ];
    }

    // ================================================================ catálogo (Coordenação CNS)

    public static function listarProdutos(Requisicao $r): array
    {
        Acesso::exigir('cns.ver');
        $todos = ($r->query['todos'] ?? '') === '1' && Acesso::tem('cns.gerir');
        return ['produtos' => self::produtos(Sessao::tenantId(), $todos), 'categorias' => self::CATEGORIAS];
    }

    public static function criarProduto(Requisicao $r): never
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        $d = self::validarProduto($r->corpo);
        $ordem = (int) Db::one('SELECT COALESCE(MAX(ordem), 0) + 1 n FROM cns_produtos WHERE tenant_id = ?', [$t])['n'];
        $id = Db::insert('INSERT INTO cns_produtos (tenant_id, codigo, fornecedor, nome, familia, variacao, embalagem, unidade, categoria, preco_ref, max_por_pedido, minimo_central, ordem) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$t, $d['codigo'], $d['fornecedor'], $d['nome'], $d['familia'], $d['variacao'], $d['embalagem'], $d['unidade'], $d['categoria'], $d['preco_ref'], $d['max_por_pedido'], $d['minimo_central'], $ordem]);
        Auditoria::registrar('criar', 'cns_produtos', $id, null, $d);
        Resposta::json(self::produtoPorId($t, $id), 201);
    }

    public static function editarProduto(Requisicao $r, int $id): array
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        $antes = Db::one('SELECT * FROM cns_produtos WHERE tenant_id = ? AND id = ?', [$t, $id]);
        if (!$antes) throw HttpErro::naoEncontrado('Produto');
        $d = self::validarProduto($r->corpo, (bool) $antes['ativo']);
        Db::run('UPDATE cns_produtos SET codigo = ?, fornecedor = ?, nome = ?, familia = ?, variacao = ?, embalagem = ?, unidade = ?, categoria = ?, preco_ref = ?, max_por_pedido = ?, minimo_central = ?, ativo = ? WHERE id = ?',
            [$d['codigo'], $d['fornecedor'], $d['nome'], $d['familia'], $d['variacao'], $d['embalagem'], $d['unidade'], $d['categoria'], $d['preco_ref'], $d['max_por_pedido'], $d['minimo_central'], $d['ativo'], $id]);
        Auditoria::registrar('editar', 'cns_produtos', $id, $antes, $d);
        return self::produtoPorId($t, $id);
    }

    public static function fotoProduto(Requisicao $r, int $id): array
    {
        Acesso::exigir('cns.gerir');
        $t = Sessao::tenantId();
        $p = Db::one('SELECT * FROM cns_produtos WHERE tenant_id = ? AND id = ?', [$t, $id]);
        if (!$p) throw HttpErro::naoEncontrado('Produto');
        $a = Anexos::salvar($t, 'cns_produto', $id, 'foto', $r->corpo['arquivo'] ?? null, is_string($r->corpo['nome'] ?? null) ? $r->corpo['nome'] : null);
        Db::run('UPDATE cns_produtos SET foto_id = ? WHERE id = ?', [$a['id'], $id]);
        if ($p['foto_id']) Anexos::excluir($t, (int) $p['foto_id']);
        return self::produtoPorId($t, $id);
    }

    private static function produtoPorId(int $t, int $id): array
    {
        foreach (self::produtos($t, true) as $p) if ($p['id'] === $id) return $p;
        throw HttpErro::naoEncontrado('Produto');
    }

    private static function validarProduto(array $corpo, bool $ativoAtual = true): array
    {
        $v = (new Validar($corpo))->texto('nome', true, 120, 2)->texto('embalagem', false, 80)->texto('unidade', true, 20)->texto('codigo', false, 30)
            ->texto('fornecedor', false, 80)->texto('familia', false, 120)->texto('variacao', false, 30)
            ->inteiro('max_por_pedido', false)->inteiro('minimo_central', false)->booleano('ativo', $ativoAtual);
        if (!isset(self::CATEGORIAS[$corpo['categoria'] ?? ''])) $v->erro('categoria', 'Escolha a categoria.');
        $temFamilia = trim((string) ($corpo['familia'] ?? '')) !== '';
        $temVariacao = trim((string) ($corpo['variacao'] ?? '')) !== '';
        if ($temFamilia !== $temVariacao) $v->erro($temFamilia ? 'variacao' : 'familia', 'Preencha os dois (produto com tamanho) ou deixe os dois vazios.');
        $preco = null;
        if (($corpo['preco_ref'] ?? '') !== '' && ($corpo['preco_ref'] ?? null) !== null) {
            $preco = Validar::reais($corpo['preco_ref']);
            if ($preco === null) $v->erro('preco_ref', 'Preço inválido.');
        }
        return $v->ok() + ['categoria' => $corpo['categoria'], 'preco_ref' => $preco];
    }
}
