<?php
declare(strict_types=1);

namespace Ccb;

/**
 * Regras dos chamados de manutenção. Tudo aqui é decidido no servidor.
 *
 * Fluxo (v1.6.0 — tudo nasce de um chamado):
 *   aberto → (triagem: prioridade, responsável e se é SERVIÇO ou OBRA) → em_orcamento → [aguardando_parecer]
 *          → aguardando_aprovacao → aprovado (gera a Ordem de Serviço) → em_execucao (OS iniciada)
 *          → concluido (OS concluída) → (casa confirma) → encerrado
 *   Saída: cancelado (com motivo), que também cancela a OS.
 *   A execução (etapas, gastos, teto) acontece na Ordem de Serviço: ver Ccb\Ordens.
 *
 * Obra: o valor enviado é o TETO da obra e quem aprova são sempre os Procuradores.
 *
 * Alçadas (Administração → Alçadas e regras):
 *   valor ≤ alçada da Coordenação → Coordenação do grupo; ≤ alçada da Gestão → Gestão; acima → Procurador.
 *   Quem tem alçada maior também pode aprovar as menores.
 *   Reaprovação: durante o serviço, se o valor subir R$ 2.000 (configurável) ou mais acima do aprovado,
 *   volta para os Procuradores; se subir menos, mas passar para uma alçada maior, volta para essa alçada.
 */
final class Chamados
{
    public const STATUS = [
        'aberto'               => 'Aguardando triagem',
        'em_orcamento'         => 'Em orçamento',
        'aguardando_parecer'   => 'Aguardando Segurança do Trabalho',
        'aguardando_aprovacao' => 'Aguardando aprovação',
        'aprovado'             => 'Aprovado · OS aberta',
        'em_execucao'          => 'Em execução',
        'concluido'            => 'Aguardando confirmação',
        'encerrado'            => 'Encerrado',
        'cancelado'            => 'Cancelado',
    ];
    public const FINAIS = ['encerrado', 'cancelado'];
    public const TIPOS = ['servico' => 'Serviço', 'obra' => 'Obra'];
    public const PRIORIDADES = ['baixa', 'normal', 'alta', 'emergencia'];
    public const NIVEL_NOME = ['coordenacao' => 'Coordenação do grupo', 'gestao' => 'Gestão de Manutenção', 'procurador' => 'Procuradores'];
    public const CATEGORIAS_ANEXO = ['foto', 'documento', 'orcamento', 'nota'];
    public const SITUACOES_MATERIAL = ['a_comprar' => 'A comprar', 'comprado' => 'Comprado', 'entregue' => 'Entregue', 'cancelado' => 'Cancelado'];

    /** Ações que pedem providência do usuário (entram em "Para você"). */
    private const PRINCIPAIS = ['triar', 'enviar_orcamento', 'parecer', 'aprovar', 'confirmar'];

    private static array $cacheCasasUsuario = [];
    private static array $cacheGrupoTemCoord = [];

    // ---------------------------------------------------------------- consultas

    public const SELECT = 'SELECT ch.*, c.nome AS casa_nome, c.codigo AS casa_codigo, c.grupo_id, g.nome AS grupo_nome,
            cat.nome AS categoria_nome, cat.icone AS categoria_icone,
            os.id AS os_id, os.numero AS os_numero, os.status AS os_status, ar.nome AS area_nome,
            ua.nome AS aberto_por_usuario, ur.nome AS responsavel_nome, uap.nome AS aprovado_por_nome, up.nome AS parecer_por_nome
          FROM chamados ch
          JOIN casas_oracao c ON c.id = ch.casa_id
          JOIN grupos g ON g.id = c.grupo_id
          LEFT JOIN chamados_categorias cat ON cat.id = ch.categoria_id
          LEFT JOIN areas ar ON ar.id = ch.area_id
          JOIN usuarios ua ON ua.id = ch.aberto_por
          LEFT JOIN ordens_servico os ON os.tenant_id = ch.tenant_id AND os.chamado_id = ch.id
          LEFT JOIN usuarios ur ON ur.id = ch.responsavel_id
          LEFT JOIN usuarios uap ON uap.id = ch.aprovado_por
          LEFT JOIN usuarios up ON up.id = ch.parecer_por';

    /** Carrega um chamado visível ao usuário. Fora do escopo: 404, sem revelar que existe. */
    public static function carregar(int $id, bool $paraAtualizar = false): array
    {
        $t = Sessao::tenantId();
        Acesso::exigir('chamados.ver');
        // Dentro de transação, trava só a linha do chamado: duas pessoas aprovando ao mesmo tempo não passam juntas.
        if ($paraAtualizar) Db::run('SELECT id FROM chamados WHERE tenant_id = ? AND id = ? FOR UPDATE', [$t, $id]);
        $c = Db::one(self::SELECT . ' WHERE ch.tenant_id = ? AND ch.id = ?', [$t, $id]);
        if (!$c || !self::podeVer($c)) throw HttpErro::naoEncontrado('Chamado');
        return $c;
    }

    // ---------------------------------------------------------------- papéis do usuário diante de um chamado

    /** Vê o chamado quem vê a casa ou quem é da área para onde ele foi encaminhado. */
    public static function podeVer(array $c): bool
    {
        return Acesso::podeVerCasa((int) $c['casa_id']) || Acesso::ehDaArea($c['area_id'] === null ? null : (int) $c['area_id']);
    }

    /** Filtro SQL de visibilidade (casas do escopo + áreas do usuário). Devolve [sql, params]. */
    public static function filtroVisiveis(string $aliasChamado = 'ch'): array
    {
        $casas = Acesso::casasVisiveis();
        $areas = Acesso::areas();
        $partes = [];
        $p = [];
        if ($casas) { $partes[] = "$aliasChamado.casa_id IN " . Db::in($casas); $p = array_merge($p, $casas); }
        if ($areas) { $partes[] = "$aliasChamado.area_id IN " . Db::in($areas); $p = array_merge($p, $areas); }
        if (!$partes) return ['0', []];
        return ['(' . implode(' OR ', $partes) . ')', $p];
    }

    public static function ehDaAreaDoChamado(array $c): bool
    {
        return Acesso::ehDaArea($c['area_id'] === null ? null : (int) $c['area_id']);
    }

    public static function ehCoordenacaoDoGrupo(int $grupoId): bool
    {
        return Acesso::temPerfil('coordenacao_manutencao') && in_array($grupoId, Acesso::contexto()['grupos'], true);
    }

    public static function ehDaCasa(int $casaId): bool
    {
        if (!Acesso::temPerfil('casa_oracao')) return false;
        $u = Sessao::usuario()['id'];
        self::$cacheCasasUsuario[$u] ??= array_map('intval', array_column(
            Db::all('SELECT casa_id FROM usuarios_casas WHERE tenant_id = ? AND usuario_id = ?', [Sessao::tenantId(), $u]), 'casa_id'));
        return in_array($casaId, self::$cacheCasasUsuario[$u], true);
    }

    /** Triagem: Gestão e Engenharia em todas as casas; Coordenação nas casas do seu grupo. */
    public static function podeTriar(array $c): bool
    {
        return Acesso::tem('chamados.triar') && (Acesso::temPerfil('gestao_manutencao') || Acesso::temPerfil('engenharia')
            || self::ehCoordenacaoDoGrupo((int) $c['grupo_id']));
    }

    /** Equipe e Compras só agem no que está com elas (ou ainda sem responsável); quem faz a triagem age em tudo do seu escopo. */
    private static function ehDaEquipeResponsavel(array $c): bool
    {
        $r = $c['responsavel_id'] === null ? null : (int) $c['responsavel_id'];
        return $r === null || $r === Sessao::usuario()['id'];
    }

    public static function podeOrcar(array $c): bool
    {
        if (!Acesso::tem('chamados.orcar')) return false;
        if (self::podeTriar($c) || self::ehDaAreaDoChamado($c)) return true;
        return (Acesso::temPerfil('equipe_manutencao') || Acesso::temPerfil('compras')) && self::ehDaEquipeResponsavel($c);
    }

    public static function podeExecutar(array $c): bool
    {
        if (!Acesso::tem('chamados.executar')) return false;
        if (self::podeTriar($c) || self::ehDaAreaDoChamado($c)) return true;
        return (Acesso::temPerfil('equipe_manutencao') || Acesso::temPerfil('engenharia')) && self::ehDaEquipeResponsavel($c);
    }

    /** Lista de materiais: quem cuida do chamado; quem abriu, enquanto ainda está aberto. */
    public static function podeEditarMateriais(array $c): bool
    {
        if (in_array($c['status'], self::FINAIS, true)) return false;
        if (self::podeTriar($c) || self::podeOrcar($c) || self::podeExecutar($c)) return true;
        return $c['status'] === 'aberto' && (int) $c['aberto_por'] === Sessao::usuario()['id'];
    }

    /** Valores de obra (teto e gastos) ficam escondidos de quem não tem obras.valores, como a casa. */
    public static function veValores(array $c): bool
    {
        return $c['tipo'] !== 'obra' || Acesso::tem('obras.valores');
    }

    /** Maior alçada do usuário para este chamado (0 = não aprova). */
    public static function alcadaDoUsuario(array $c): int
    {
        if (!Acesso::tem('chamados.aprovar')) return 0;
        if (Acesso::temPerfil('procurador')) return Catalogo::NIVEIS['procurador'];
        if (Acesso::temPerfil('gestao_manutencao')) return Catalogo::NIVEIS['gestao'];
        if (self::ehCoordenacaoDoGrupo((int) $c['grupo_id'])) return Catalogo::NIVEIS['coordenacao'];
        return 0;
    }

    public static function podeConfirmar(array $c): bool
    {
        return Acesso::tem('chamados.confirmar') && (self::ehDaCasa((int) $c['casa_id']) || self::podeTriar($c));
    }

    /** Ações disponíveis para o usuário logado neste chamado, na ordem em que aparecem na tela. */
    public static function acoes(array $c): array
    {
        $s = $c['status'];
        if (in_array($s, self::FINAIS, true)) return [];
        $a = [];
        $triar = self::podeTriar($c);
        switch ($s) {
            case 'aberto':
                if ($triar) $a[] = 'triar';
                break;
            case 'em_orcamento':
                if (self::podeOrcar($c)) $a[] = 'enviar_orcamento';
                if ($triar) array_push($a, 'atribuir', 'mudar_tipo');
                break;
            case 'aguardando_parecer':
                if (Acesso::tem('chamados.parecer')) $a[] = 'parecer';
                break;
            case 'aguardando_aprovacao':
                if (self::alcadaDoUsuario($c) >= Catalogo::NIVEIS[$c['nivel_aprovacao']]) array_push($a, 'aprovar', 'devolver');
                break;
            case 'aprovado':
                if ($triar) $a[] = 'atribuir';
                break;
            case 'em_execucao':
                // Serviço: se o valor mudar durante a execução, pode voltar para aprovação. Obra usa o teto da OS.
                if ($c['tipo'] === 'servico' && self::podeExecutar($c)) $a[] = 'ajustar_valor';
                if ($triar) $a[] = 'atribuir';
                break;
            case 'concluido':
                if (self::podeConfirmar($c)) array_push($a, 'confirmar', 'reabrir');
                break;
        }
        $abriu = (int) $c['aberto_por'] === Sessao::usuario()['id'];
        if ($triar || ($abriu && $s === 'aberto')) $a[] = 'cancelar';
        $a[] = 'comentar';
        return $a;
    }

    /** O chamado está esperando uma providência deste usuário? */
    public static function paraMim(array $c, ?array $acoes = null): bool
    {
        $acoes ??= self::acoes($c);
        $eu = Sessao::usuario()['id'];
        foreach (array_intersect($acoes, self::PRINCIPAIS) as $acao) {
            switch ($acao) {
                case 'triar':
                    // Coordenação faz a triagem do seu grupo; a Gestão só quando o grupo não tem Coordenação.
                    if (self::ehCoordenacaoDoGrupo((int) $c['grupo_id']) || !self::grupoTemCoordenacao((int) $c['grupo_id'])) return true;
                    break;
                case 'aprovar':
                    // Cada alçada vê o que é seu; as maiores podem aprovar as menores, mas sem aviso.
                    if (self::alcadaDoUsuario($c) === Catalogo::NIVEIS[$c['nivel_aprovacao']]) return true;
                    if ($c['nivel_aprovacao'] === 'coordenacao' && !self::grupoTemCoordenacao((int) $c['grupo_id']) && Acesso::temPerfil('gestao_manutencao')) return true;
                    break;
                case 'enviar_orcamento':
                    $r = $c['responsavel_id'] === null ? null : (int) $c['responsavel_id'];
                    if ($r === $eu) return true;
                    // Encaminhado para uma área: é a vez de quem é da área.
                    if ($c['area_id'] !== null) { if ($r === null && self::ehDaAreaDoChamado($c)) return true; break; }
                    if ($r === null && (Acesso::temPerfil('equipe_manutencao') || Acesso::temPerfil('compras'))) return true;
                    if ($r === null && self::ehCoordenacaoDoGrupo((int) $c['grupo_id'])) return true;
                    break;
                case 'confirmar':
                    if (self::ehDaCasa((int) $c['casa_id']) || (int) $c['aberto_por'] === $eu) return true;
                    break;
                default:
                    return true;
            }
        }
        return false;
    }

    private static function grupoTemCoordenacao(int $grupoId): bool
    {
        return self::$cacheGrupoTemCoord[$grupoId] ??= (bool) Db::one(
            "SELECT 1 FROM usuarios_perfis up JOIN perfis p ON p.id = up.perfil_id JOIN usuarios u ON u.id = up.usuario_id
              WHERE up.tenant_id = ? AND p.codigo = 'coordenacao_manutencao' AND up.grupo_id = ? AND u.ativo = 1 LIMIT 1",
            [Sessao::tenantId(), $grupoId]);
    }

    // ---------------------------------------------------------------- alçadas

    public static function regras(int $t): array
    {
        $cfg = array_merge(Catalogo::CONFIG_PADRAO, array_column(Db::all('SELECT chave, valor FROM configuracoes_tenant WHERE tenant_id = ?', [$t]), 'valor', 'chave'));
        return array_map('floatval', $cfg);
    }

    /** Alçada exigida para um valor. Obra: sempre os Procuradores. */
    public static function nivelPara(float $valor, array $regras, string $tipo = 'servico'): string
    {
        if ($tipo === 'obra') return 'procurador';
        if ($valor <= $regras['alcada_coordenacao_max']) return 'coordenacao';
        if ($valor <= $regras['alcada_gestao_max']) return 'gestao';
        return 'procurador';
    }

    /**
     * Um valor novo, durante o serviço, precisa de nova aprovação? Devolve a alçada exigida, ou null se não precisa.
     * A comparação é sempre com o último valor aprovado por alguém, para que vários aumentos pequenos não escapem.
     */
    public static function reaprovacaoPara(float $novo, float $aprovado, string $nivelAprovado, array $regras): ?string
    {
        if ($novo <= $aprovado) return null;
        if ($novo - $aprovado >= $regras['reaprovacao_aumento_min']) return 'procurador';
        $nivel = self::nivelPara($novo, $regras);
        return Catalogo::NIVEIS[$nivel] > Catalogo::NIVEIS[$nivelAprovado] ? $nivel : null;
    }

    // ---------------------------------------------------------------- linha do tempo

    public static function evento(int $t, int $chamadoId, string $tipo, ?string $de, ?string $para, ?string $texto = null, ?float $valor = null): void
    {
        Db::run('INSERT INTO chamados_eventos (tenant_id, chamado_id, usuario_id, tipo, status_de, status_para, texto, valor) VALUES (?,?,?,?,?,?,?,?)',
            [$t, $chamadoId, Sessao::usuario()['id'], $tipo, $de, $para, $texto, $valor]);
    }

    /** Começa a contar o prazo de guarda das fotos e documentos quando o chamado termina. */
    public static function iniciarPrazoDeGuarda(int $t, int $chamadoId): void
    {
        $r = self::regras($t);
        Db::run("UPDATE anexos SET expira_em = DATE_ADD(NOW(), INTERVAL ? MONTH)
                  WHERE tenant_id = ? AND dono_tipo = 'chamado' AND dono_id = ? AND categoria = 'foto' AND excluido_em IS NULL",
            [(int) $r['retencao_fotos_servico_meses'], $t, $chamadoId]);
        Db::run("UPDATE anexos SET expira_em = DATE_ADD(NOW(), INTERVAL ? MONTH)
                  WHERE tenant_id = ? AND dono_tipo = 'chamado' AND dono_id = ? AND categoria IN ('orcamento','nota') AND excluido_em IS NULL",
            [(int) $r['retencao_documentos_meses'], $t, $chamadoId]);
    }
}
