<?php
/* =====================================================================
   KONSTANTE SaaS — api/plat_uso.php  ·  Console › Uso  (v1.20.0)
   Quanto cada empresa está usando o sistema no período.
   Ações: resumo {periodo}, detalhe {empresaId, periodo}
   periodo: "7" | "30" | "90" | "mes" (mês atual)
   Fontes: uso_diario (acessos e ações, conta a partir do SQL 14) e as datas
   de criação das próprias tabelas (registros criados, com histórico).
   ===================================================================== */
if (!defined('KSAAS') || !defined('KPLAT')) { http_response_code(403); exit; }
date_default_timezone_set('America/Sao_Paulo');

const USO_GRUPOS = ['acesso', 'inicio', 'crm', 'contratos', 'os', 'tarefas', 'pmoc', 'assistente', 'empresa', 'outros'];

function uso_periodo($d) {
    $p = (string) ($d['periodo'] ?? '30');
    $ate = date('Y-m-d');
    if ($p === 'mes') $de = date('Y-m-01');
    else { $n = in_array($p, ['7', '30', '90'], true) ? (int) $p : 30; $de = date('Y-m-d', strtotime('-' . ($n - 1) . ' days')); }
    $dias = (int) round((strtotime($ate) - strtotime($de)) / 86400) + 1;
    return [$de, $ate, $dias];
}

function uso_exige_tabela() {
    try { q("SELECT 1 FROM uso_diario LIMIT 0"); }
    catch (Throwable $e) { erro('Rode o SQL 14 (14_assistente_uso.sql) para usar esta tela.', 409, 'SQL14'); }
}

/* contagem que não derruba a tela se a coluna/tabela não existir: devolve null */
function uso_conta($sql, $p) { try { return (int) valor($sql, $p); } catch (Throwable $e) { return null; } }

/* registros criados no período, por empresa */
function uso_criados($tid, $de, $ate) {
    $fim = date('Y-m-d', strtotime($ate . ' +1 day'));
    $p = [$tid, $de, $fim];
    return [
        'clientes'   => uso_conta("SELECT COUNT(*) FROM clientes WHERE tenant_id = ? AND criado_em >= ? AND criado_em < ?", $p),
        'chamados'   => uso_conta("SELECT COUNT(*) FROM chamados WHERE tenant_id = ? AND aberto_em >= ? AND aberto_em < ?", $p),
        'orcamentos' => uso_conta("SELECT COUNT(*) FROM orcamentos WHERE tenant_id = ? AND criado_em >= ? AND criado_em < ?", $p),
        'os'         => uso_conta("SELECT COUNT(*) FROM ordens_servico WHERE tenant_id = ? AND criado_em >= ? AND criado_em < ?", $p),
        'tarefas'    => uso_conta("SELECT COUNT(*) FROM tarefas WHERE tenant_id = ? AND criado_em >= ? AND criado_em < ?", $p),
        'pmoc'       => uso_conta("SELECT COUNT(*) FROM pmoc_visitas WHERE tenant_id = ? AND status = 'feita' AND atualizado_em >= ? AND atualizado_em < ?", $p),
        'assistente' => uso_conta("SELECT COALESCE(SUM(pedidos), 0) FROM ia_uso WHERE tenant_id = ? AND dia >= ? AND dia < ?", $p),
    ];
}

/* sinal: verde = usou nos últimos 2 dias · amarelo = 3 a 7 dias · vermelho = mais de 7 dias ou nunca */
function uso_sinal($ultimo) {
    if (!$ultimo) return ['sinal' => 'vermelho', 'diasSemUso' => null];
    $d = (int) floor((strtotime(date('Y-m-d')) - strtotime(substr($ultimo, 0, 10))) / 86400);
    return ['sinal' => $d <= 2 ? 'verde' : ($d <= 7 ? 'amarelo' : 'vermelho'), 'diasSemUso' => max(0, $d)];
}

function uso_grupos_vazios() { return array_fill_keys(USO_GRUPOS, 0); }

return [

    'resumo' => function ($d) {
        admin_plataforma();
        uso_exige_tabela();
        [$de, $ate, $dias] = uso_periodo($d);

        $emps = linhas("SELECT id, nome, ativo, criado_em FROM tenants ORDER BY nome");
        $tot = [];
        foreach (linhas("SELECT tenant_id, perfil, COUNT(*) n FROM usuarios WHERE excluido_em IS NULL AND status = 'ativo' GROUP BY tenant_id, perfil") as $r)
            $tot[(int) $r['tenant_id']][$r['perfil'] === 'cliente' ? 'clientes' : 'equipe'] = ($tot[(int) $r['tenant_id']][$r['perfil'] === 'cliente' ? 'clientes' : 'equipe'] ?? 0) + (int) $r['n'];

        $ativos = []; $diasUso = []; $acoes = []; $grupos = [];
        foreach (linhas("SELECT x.tenant_id, (u.perfil = 'cliente') AS cli, COUNT(DISTINCT x.usuario_id) n
                           FROM uso_diario x JOIN usuarios u ON u.tenant_id = x.tenant_id AND u.id = x.usuario_id
                          WHERE x.dia BETWEEN ? AND ? GROUP BY x.tenant_id, cli", [$de, $ate]) as $r)
            $ativos[(int) $r['tenant_id']][(int) $r['cli'] ? 'clientes' : 'equipe'] = (int) $r['n'];
        foreach (linhas("SELECT tenant_id, COUNT(DISTINCT dia) n, SUM(acoes) a FROM uso_diario WHERE dia BETWEEN ? AND ? GROUP BY tenant_id", [$de, $ate]) as $r) {
            $diasUso[(int) $r['tenant_id']] = (int) $r['n']; $acoes[(int) $r['tenant_id']] = (int) $r['a'];
        }
        foreach (linhas("SELECT tenant_id, modulo, SUM(acoes) a FROM uso_diario WHERE dia BETWEEN ? AND ? GROUP BY tenant_id, modulo", [$de, $ate]) as $r)
            $grupos[(int) $r['tenant_id']][$r['modulo']] = (int) $r['a'];
        $ultimo = [];
        foreach (linhas("SELECT tenant_id, MAX(ultimo) m FROM uso_diario GROUP BY tenant_id") as $r) $ultimo[(int) $r['tenant_id']] = $r['m'];
        /* antes do SQL 14 só existe o último login */
        foreach (linhas("SELECT tenant_id, MAX(ultimo_acesso) m FROM usuarios WHERE excluido_em IS NULL GROUP BY tenant_id") as $r) {
            $t = (int) $r['tenant_id'];
            if ($r['m'] && (empty($ultimo[$t]) || $r['m'] > $ultimo[$t])) $ultimo[$t] = $r['m'];
        }

        $lista = array_map(function ($e) use ($tot, $ativos, $diasUso, $acoes, $grupos, $ultimo, $de, $ate) {
            $t = (int) $e['id'];
            return array_merge([
                'id' => $t, 'nome' => $e['nome'], 'ativa' => (int) $e['ativo'] === 1, 'criadaEm' => $e['criado_em'],
                'equipe' => $tot[$t]['equipe'] ?? 0, 'clientesPortal' => $tot[$t]['clientes'] ?? 0,
                'ativosEquipe' => $ativos[$t]['equipe'] ?? 0, 'ativosClientes' => $ativos[$t]['clientes'] ?? 0,
                'diasUso' => $diasUso[$t] ?? 0, 'acoes' => $acoes[$t] ?? 0,
                'grupos' => array_merge(uso_grupos_vazios(), $grupos[$t] ?? []),
                'ultimoUso' => $ultimo[$t] ?? null,
                'criados' => uso_criados($t, $de, $ate),
            ], uso_sinal($ultimo[$t] ?? null));
        }, $emps);

        return ['de' => $de, 'ate' => $ate, 'dias' => $dias, 'empresas' => $lista,
                'desde' => valor("SELECT MIN(dia) FROM uso_diario") ?: null];
    },

    'detalhe' => function ($d) {
        admin_plataforma();
        uso_exige_tabela();
        [$de, $ate, $dias] = uso_periodo($d);
        $tid = (int) ($d['empresaId'] ?? 0);
        $e = linha("SELECT id, nome FROM tenants WHERE id = ?", [$tid]);
        if (!$e) erro('Empresa não encontrada.', 404);

        $porUsuario = [];
        foreach (linhas("SELECT usuario_id, modulo, SUM(acoes) a, COUNT(DISTINCT dia) dd FROM uso_diario
                          WHERE tenant_id = ? AND dia BETWEEN ? AND ? GROUP BY usuario_id, modulo", [$tid, $de, $ate]) as $r)
            $porUsuario[(int) $r['usuario_id']]['grupos'][$r['modulo']] = (int) $r['a'];
        foreach (linhas("SELECT usuario_id, COUNT(DISTINCT dia) dd, SUM(acoes) a FROM uso_diario
                          WHERE tenant_id = ? AND dia BETWEEN ? AND ? GROUP BY usuario_id", [$tid, $de, $ate]) as $r) {
            $porUsuario[(int) $r['usuario_id']]['dias'] = (int) $r['dd']; $porUsuario[(int) $r['usuario_id']]['acoes'] = (int) $r['a'];
        }
        $ult = [];
        foreach (linhas("SELECT usuario_id, MAX(ultimo) m FROM uso_diario WHERE tenant_id = ? GROUP BY usuario_id", [$tid]) as $r) $ult[(int) $r['usuario_id']] = $r['m'];

        $usuarios = array_map(function ($u) use ($porUsuario, $ult) {
            $id = (int) $u['id'];
            $m = $ult[$id] ?? null;
            if ($u['ultimo_acesso'] && (!$m || $u['ultimo_acesso'] > $m)) $m = $u['ultimo_acesso'];
            return array_merge(['id' => $id, 'nome' => $u['nome'], 'perfil' => $u['perfil'], 'status' => $u['status'],
                'dias' => $porUsuario[$id]['dias'] ?? 0, 'acoes' => $porUsuario[$id]['acoes'] ?? 0,
                'grupos' => array_merge(uso_grupos_vazios(), $porUsuario[$id]['grupos'] ?? []), 'ultimoUso' => $m], uso_sinal($m));
        }, linhas("SELECT id, nome, perfil, status, ultimo_acesso FROM usuarios WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY perfil = 'cliente', nome", [$tid]));
        usort($usuarios, function ($a, $b) { return [$a['perfil'] === 'cliente', -$a['acoes'], $a['nome']] <=> [$b['perfil'] === 'cliente', -$b['acoes'], $b['nome']]; });

        /* série diária: ações e pessoas por dia */
        $serie = [];
        for ($t = strtotime($de); $t <= strtotime($ate); $t += 86400) $serie[date('Y-m-d', $t)] = ['dia' => date('Y-m-d', $t), 'acoes' => 0, 'pessoas' => 0];
        foreach (linhas("SELECT dia, SUM(acoes) a, COUNT(DISTINCT usuario_id) p FROM uso_diario WHERE tenant_id = ? AND dia BETWEEN ? AND ? GROUP BY dia", [$tid, $de, $ate]) as $r)
            if (isset($serie[$r['dia']])) $serie[$r['dia']] = ['dia' => $r['dia'], 'acoes' => (int) $r['a'], 'pessoas' => (int) $r['p']];

        $ia = null;
        try { $ia = linha("SELECT COALESCE(SUM(pedidos),0) pedidos, COALESCE(SUM(pesquisas),0) pesquisas, COALESCE(SUM(tokens_entrada),0) entrada, COALESCE(SUM(tokens_saida),0) saida, COALESCE(SUM(erros),0) erros
                            FROM ia_uso WHERE tenant_id = ? AND dia BETWEEN ? AND ?", [$tid, $de, $ate]); } catch (Throwable $x) {}

        return ['de' => $de, 'ate' => $ate, 'dias' => $dias, 'empresa' => ['id' => (int) $e['id'], 'nome' => $e['nome']],
                'usuarios' => $usuarios, 'serie' => array_values($serie), 'criados' => uso_criados($tid, $de, $ate),
                'assistente' => $ia ? array_map('intval', $ia) : null];
    },
];
