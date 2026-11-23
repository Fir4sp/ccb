<?php
declare(strict_types=1);

namespace Ccb;

/**
 * Ordem de Serviço (v1.6.0). Nasce sozinha quando o chamado é aprovado, uma por chamado.
 *
 *   aberta → (iniciar) → em_andamento ⇄ pausada → concluida      (cancelada quando o chamado é cancelado)
 *
 * - Etapas: cada uma recebe OK, Não OK, Não se aplica ou "em andamento" com percentual.
 *   O andamento da OS é a média das etapas que se aplicam (OK = 100%, Não OK = 0%).
 * - Não OK gera uma PENDÊNCIA, que não trava a OS e pode ser resolvida depois, mesmo com a OS concluída.
 * - Para concluir, toda etapa precisa estar marcada (nenhuma "a fazer" ou "em andamento").
 * - Tipo Obra: teto (vem da aprovação do chamado) e gastos. Gasto acima do teto é aceito, a obra fica
 *   em vermelho e só conclui depois que os Procuradores aprovarem um teto novo.
 * - Quem executa: as mesmas pessoas que executam o chamado (Chamados::podeExecutar).
 */
final class Ordens
{
    public const STATUS = [
        'aberta'       => 'A iniciar',
        'em_andamento' => 'Em andamento',
        'pausada'      => 'Pausada',
        'concluida'    => 'Concluída',
        'cancelada'    => 'Cancelada',
    ];
    public const FINAIS = ['concluida', 'cancelada'];
    public const SITUACOES = [
        'pendente'   => 'A fazer',
        'andamento'  => 'Em andamento',
        'ok'         => 'OK',
        'nao_ok'     => 'Não OK',
        'nao_aplica' => 'Não se aplica',
    ];
    public const CATEGORIAS_GASTO = [
        'material' => 'Material', 'mao_de_obra' => 'Mão de obra', 'servico' => 'Serviço contratado',
        'equipamento' => 'Equipamento', 'outros' => 'Outros',
    ];
    /** Percentual do teto a partir do qual a obra aparece em alerta. */
    public const ALERTA = 0.8;

    /** Andamento (0 a 100) calculado das etapas, direto no banco. */
    private const PROGRESSO_SQL = '(SELECT ROUND(SUM(CASE e.situacao WHEN \'ok\' THEN 100 WHEN \'andamento\' THEN e.percentual ELSE 0 END)
                                         / NULLIF(SUM(e.situacao <> \'nao_aplica\'), 0), 1)
                                     FROM os_etapas e WHERE e.tenant_id = os.tenant_id AND e.os_id = os.id)';

    public const SELECT = 'SELECT os.*, ch.numero AS chamado_numero, ch.titulo, ch.descricao AS chamado_descricao, ch.local,
            ch.casa_id, ch.responsavel_id, ch.area_id, ar.nome AS area_nome, ch.aberto_por, ch.status AS chamado_status, ch.em_reaprovacao, ch.prioridade, ch.urgente,
            ch.valor_estimado, ch.valor_aprovado, ch.nivel_aprovacao, ch.servico_descricao,
            c.nome AS casa_nome, c.codigo AS casa_codigo, c.grupo_id, g.nome AS grupo_nome,
            cat.nome AS categoria_nome, cat.icone AS categoria_icone, ur.nome AS responsavel_nome,
            ' . self::PROGRESSO_SQL . ' AS progresso,
            (SELECT COUNT(*) FROM os_etapas e WHERE e.tenant_id = os.tenant_id AND e.os_id = os.id) AS etapas_total,
            (SELECT COUNT(*) FROM os_etapas e WHERE e.tenant_id = os.tenant_id AND e.os_id = os.id AND e.situacao IN (\'pendente\',\'andamento\')) AS etapas_abertas,
            (SELECT COUNT(*) FROM os_pendencias p WHERE p.tenant_id = os.tenant_id AND p.os_id = os.id AND p.status = \'aberta\') AS pendencias_abertas,
            (SELECT COALESCE(SUM(gs.valor), 0) FROM os_gastos gs WHERE gs.tenant_id = os.tenant_id AND gs.os_id = os.id AND gs.estornado_em IS NULL) AS gasto,
            (SELECT t.id FROM os_tetos t WHERE t.tenant_id = os.tenant_id AND t.os_id = os.id AND t.status = \'pendente\' LIMIT 1) AS pedido_pendente_id
          FROM ordens_servico os
          JOIN chamados ch ON ch.tenant_id = os.tenant_id AND ch.id = os.chamado_id
          JOIN casas_oracao c ON c.id = ch.casa_id
          JOIN grupos g ON g.id = c.grupo_id
          LEFT JOIN chamados_categorias cat ON cat.id = ch.categoria_id
          LEFT JOIN areas ar ON ar.id = ch.area_id
          LEFT JOIN usuarios ur ON ur.id = ch.responsavel_id';

    /** OS visível ao usuário (mesma regra do chamado). Fora do escopo: 404. */
    public static function carregar(int $id, bool $paraAtualizar = false): array
    {
        $t = Sessao::tenantId();
        Acesso::exigir('chamados.ver');
        if ($paraAtualizar) Db::run('SELECT id FROM ordens_servico WHERE tenant_id = ? AND id = ? FOR UPDATE', [$t, $id]);
        $o = Db::one(self::SELECT . ' WHERE os.tenant_id = ? AND os.id = ?', [$t, $id]);
        if (!$o || !Chamados::podeVer($o)) throw HttpErro::naoEncontrado('Ordem de Serviço');
        return $o;
    }

    /** Cria a OS do chamado que acabou de ser aprovado. Chamada dentro da transação da aprovação. */
    public static function criarParaChamado(int $t, array $c): int
    {
        $numero = (int) Db::one('SELECT COALESCE(MAX(numero), 0) + 1 n FROM ordens_servico WHERE tenant_id = ? FOR UPDATE', [$t])['n'];
        $teto = $c['tipo'] === 'obra' ? (float) $c['valor_estimado'] : null;
        $id = Db::insert('INSERT INTO ordens_servico (tenant_id, numero, chamado_id, tipo, teto) VALUES (?,?,?,?,?)',
            [$t, $numero, $c['id'], $c['tipo'], $teto]);
        if ($teto !== null) {
            // O teto aprovado junto com o chamado fica registrado como o primeiro da obra.
            $eu = Sessao::usuario()['id'];
            Db::run("INSERT INTO os_tetos (tenant_id, os_id, valor_anterior, valor_novo, motivo, status, pedido_por, decidido_por, decidido_em)
                     VALUES (?,?,NULL,?,?,'aprovado',?,?,NOW())", [$t, $id, $teto, 'Teto aprovado junto com o chamado.', $c['aberto_por'], $eu]);
        }
        self::registrarProgresso($t, $id);
        return $id;
    }

    public static function numeroFormatado(int $n): string
    {
        return 'OS ' . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }

    // ---------------------------------------------------------------- papéis

    public static function podeExecutar(array $o): bool
    {
        return Chamados::podeExecutar($o);
    }

    /** Pendência pode ser resolvida por quem executa ou faz a triagem, a qualquer momento. */
    public static function podeResolverPendencia(array $o): bool
    {
        return Chamados::podeExecutar($o) || Chamados::podeTriar($o);
    }

    public static function podeEditarEtapas(array $o): bool
    {
        return self::podeExecutar($o) && in_array($o['status'], ['aberta', 'em_andamento', 'pausada'], true);
    }

    /** Marcar OK / Não OK / etc. só com a OS em andamento. */
    public static function podeMarcarEtapas(array $o): bool
    {
        return self::podeExecutar($o) && $o['status'] === 'em_andamento';
    }

    public static function acoes(array $o): array
    {
        $s = $o['status'];
        if (in_array($s, self::FINAIS, true)) return [];
        $a = [];
        $exec = self::podeExecutar($o);
        $obra = $o['tipo'] === 'obra';
        $pendente = $o['pedido_pendente_id'] !== null;
        if ($s === 'aberta' && $exec) $a[] = 'iniciar';
        if ($s === 'em_andamento' && $exec) array_push($a, 'concluir', 'pausar');
        if ($s === 'pausada' && $exec) $a[] = 'retomar';
        if ($obra && $pendente && Acesso::tem('obras.aprovar')) $a[] = 'decidir_teto';
        if ($obra && !$pendente && $exec && Acesso::tem('obras.valores')) $a[] = 'pedir_teto';
        if ($obra && in_array($s, ['em_andamento', 'pausada'], true) && Acesso::tem('obras.gastos')) $a[] = 'lancar_gasto';
        return $a;
    }

    /** A OS espera algo deste usuário? Iniciar, tocar a OS que está com ele, decidir teto ou pedir teto (obra em vermelho). */
    public static function paraMim(array $o, ?array $acoes = null): bool
    {
        $acoes ??= self::acoes($o);
        if (in_array('decidir_teto', $acoes, true)) return true;
        if (in_array('pedir_teto', $acoes, true) && self::acimaDoTeto($o)) return true;
        if (array_intersect($acoes, ['iniciar', 'concluir'])) {
            $r = $o['responsavel_id'] === null ? null : (int) $o['responsavel_id'];
            if ($r === Sessao::usuario()['id']) return true;
            if ($r === null && $o['area_id'] !== null) return Chamados::ehDaAreaDoChamado($o);
            if ($r === null && (Acesso::temPerfil('equipe_manutencao') || Acesso::temPerfil('engenharia'))) return true;
        }
        return false;
    }

    public static function acimaDoTeto(array $o): bool
    {
        return $o['tipo'] === 'obra' && $o['teto'] !== null && (float) $o['gasto'] > (float) $o['teto'] + 0.004;
    }

    // ---------------------------------------------------------------- andamento

    /** Andamento atual (0 a 100), ou null se a OS ainda não tem etapas que se aplicam. */
    public static function progresso(int $t, int $osId): ?float
    {
        $r = Db::one('SELECT ROUND(SUM(CASE situacao WHEN \'ok\' THEN 100 WHEN \'andamento\' THEN percentual ELSE 0 END)
                                   / NULLIF(SUM(situacao <> \'nao_aplica\'), 0), 1) p
                        FROM os_etapas WHERE tenant_id = ? AND os_id = ?', [$t, $osId]);
        return $r['p'] === null ? null : (float) $r['p'];
    }

    /** Guarda um ponto do gráfico de evolução quando o andamento muda. */
    public static function registrarProgresso(int $t, int $osId): void
    {
        $p = self::progresso($t, $osId) ?? 0.0;
        $ultimo = Db::one('SELECT percentual FROM os_progresso WHERE tenant_id = ? AND os_id = ? ORDER BY id DESC LIMIT 1', [$t, $osId]);
        if ($ultimo && abs((float) $ultimo['percentual'] - $p) < 0.05) return;
        Db::run('INSERT INTO os_progresso (tenant_id, os_id, percentual) VALUES (?,?,?)', [$t, $osId, $p]);
    }

    /** Evolução para o gráfico: o último valor de cada dia. */
    public static function evolucao(int $t, int $osId): array
    {
        $linhas = Db::all('SELECT DATE(criado_em) dia, percentual FROM os_progresso WHERE tenant_id = ? AND os_id = ? ORDER BY id', [$t, $osId]);
        $porDia = [];
        foreach ($linhas as $l) $porDia[$l['dia']] = (float) $l['percentual'];
        return array_map(fn($d, $p) => ['data' => $d, 'percentual' => $p], array_keys($porDia), array_values($porDia));
    }

    /** Linha do tempo: a OS escreve na mesma linha do tempo do chamado. */
    public static function evento(int $t, array $o, string $tipo, ?string $texto = null, ?float $valor = null, ?string $de = null, ?string $para = null): void
    {
        Chamados::evento($t, (int) $o['chamado_id'], $tipo, $de, $para, $texto, $valor);
    }
}
