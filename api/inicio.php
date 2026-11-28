<?php
/* KONSTANTE SaaS — api/inicio.php  ·  tela Início, "o meu dia" (v1.9.0 · v1.21.0: números do celular)
   v1.35.1: minhasTarefas, minhasOS e meuPmoc (o que é da pessoa) para o Início do celular.
   Ação: resumo — numa chamada só:
     os       OS de hoje e atrasadas (técnico: só as dele)
     tarefas  as minhas tarefas de hoje e atrasadas
     parados  chamados parados há mais de 3 dias em "Falta enviar orçamento" / "Aguardando aprovação" (escritório)
     numeros  indicadores rápidos (valores só para o administrador)
     v1.14.0: propostas vencendo (3 dias ou menos), vencidas e retornos marcados até hoje (escritório) */
if (!defined('KSAAS')) { http_response_code(403); exit; }

date_default_timezone_set('America/Sao_Paulo');
require_once dirname(__DIR__) . '/nucleo/pmoc_tecnico.php';   /* v1.39.0 */

const IN_DIAS_PARADO = 3;

return [

    'resumo' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $uid = (int) $u['id'];
        $hoje = date('Y-m-d');
        $escritorio = tem_perfil($u, 'admin', 'coord', 'comercial');   /* v1.22.0 */
        $admin = ve_valores($u);

        /* ---- OS de hoje e atrasadas ---- */
        /* v1.27.0: no Início cada um vê só as OS que são DELE (responsável ou escalado), inclusive o escritório.
           As demais ficam em Ordens de serviço. */
        $wt = " AND (o.responsavel_id = ? OR EXISTS (SELECT 1 FROM os_visitas v JOIN os_visita_tecnicos vt ON vt.tenant_id = v.tenant_id AND vt.visita_id = v.id
                 WHERE v.tenant_id = o.tenant_id AND v.os_id = o.id AND v.excluido_em IS NULL AND vt.usuario_id = ?))";
        $pt = [$uid, $uid];
        $os = array_map(function ($o) use ($hoje) {
            return ['id' => (int) $o['id'], 'numero' => $o['numero'], 'clienteNome' => $o['cliente_nome'], 'status' => $o['status'],
                    'dataPrev' => $o['data_prev'], 'horaPrev' => $o['hora_prev'] ? substr($o['hora_prev'], 0, 5) : null,
                    'atrasada' => ((json_decode((string) $o['checklist'], true)['prazo'] ?? null) ?: $o['data_prev']) < $hoje];
        }, linhas("SELECT o.id, o.numero, o.status, o.data_prev, o.hora_prev, o.checklist, cl.nome AS cliente_nome
                     FROM ordens_servico o JOIN clientes cl ON cl.tenant_id = o.tenant_id AND cl.id = o.cliente_id
                    WHERE o.tenant_id = ? AND o.excluido_em IS NULL AND o.status NOT IN ('Concluída','Cancelada','Serviço finalizado')
                      AND o.data_prev IS NOT NULL AND o.data_prev <= ?" . $wt . "
                    ORDER BY o.data_prev, o.hora_prev LIMIT 30", array_merge([$tid, $hoje], $pt)));

        /* ---- minhas tarefas de hoje e atrasadas ---- */
        $tarefas = array_map(function ($t) use ($hoje) {
            return ['id' => (int) $t['id'], 'titulo' => $t['titulo'], 'status' => $t['status'], 'prioridade' => $t['prioridade'],
                    'data' => $t['data'], 'hora' => $t['hora'] ? substr($t['hora'], 0, 5) : null, 'clienteNome' => $t['cliente_nome'],
                    'atrasada' => $t['data'] < $hoje];
        }, linhas("SELECT t.id, t.titulo, t.status, t.prioridade, t.data, t.hora, cl.nome AS cliente_nome
                     FROM tarefas t LEFT JOIN clientes cl ON cl.tenant_id = t.tenant_id AND cl.id = t.cliente_id
                    WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status NOT IN ('feita','cancelada') AND t.data IS NOT NULL AND t.data <= ?
                      AND (t.para_todos = 1 OR EXISTS (SELECT 1 FROM tarefa_responsaveis r WHERE r.tenant_id = t.tenant_id AND r.tarefa_id = t.id AND r.usuario_id = ?)
                           OR (t.criado_por = ? AND NOT EXISTS (SELECT 1 FROM tarefa_responsaveis r2 WHERE r2.tenant_id = t.tenant_id AND r2.tarefa_id = t.id)))
                    ORDER BY t.data, FIELD(t.prioridade,'urgente','alta','normal','baixa'), t.hora LIMIT 30", [$tid, $hoje, $uid, $uid]));

        $out = ['os' => $os, 'tarefas' => $tarefas, 'parados' => [], 'propostas' => [], 'numeros' => null, 'diasParado' => IN_DIAS_PARADO];

        /* ---- v1.35.1: o que é DA PESSOA (tela Início do celular): todas as tarefas pendentes destinadas a ela,
           todas as OS abertas em que é responsável ou está escalada e os planos PMOC do mês que são dela ---- */
        $out['minhasTarefas'] = [];
        try {
            $out['minhasTarefas'] = array_map(function ($t) use ($hoje) {
                return ['id' => (int) $t['id'], 'titulo' => $t['titulo'], 'status' => $t['status'], 'prioridade' => $t['prioridade'],
                        'data' => $t['data'], 'hora' => $t['hora'] ? substr($t['hora'], 0, 5) : null, 'clienteNome' => $t['cliente_nome'],
                        'atrasada' => $t['data'] !== null && $t['data'] < $hoje];
            }, linhas("SELECT t.id, t.titulo, t.status, t.prioridade, t.data, t.hora, cl.nome AS cliente_nome
                         FROM tarefas t LEFT JOIN clientes cl ON cl.tenant_id = t.tenant_id AND cl.id = t.cliente_id
                        WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.status NOT IN ('feita','cancelada')
                          AND (t.para_todos = 1 OR EXISTS (SELECT 1 FROM tarefa_responsaveis r WHERE r.tenant_id = t.tenant_id AND r.tarefa_id = t.id AND r.usuario_id = ?)
                               OR (t.criado_por = ? AND NOT EXISTS (SELECT 1 FROM tarefa_responsaveis r2 WHERE r2.tenant_id = t.tenant_id AND r2.tarefa_id = t.id)))
                        ORDER BY t.data IS NULL, t.data, FIELD(t.prioridade,'urgente','alta','normal','baixa'), t.hora LIMIT 20", [$tid, $uid, $uid]));
        } catch (Throwable $e) { /* módulo de tarefas sem SQL 06 */ }

        $out['minhasOS'] = array_map(function ($o) use ($hoje) {
            $prazo = (json_decode((string) $o['checklist'], true)['prazo'] ?? null) ?: $o['data_prev'];
            return ['id' => (int) $o['id'], 'numero' => $o['numero'], 'clienteNome' => $o['cliente_nome'], 'status' => $o['status'],
                    'dataPrev' => $o['data_prev'], 'horaPrev' => $o['hora_prev'] ? substr($o['hora_prev'], 0, 5) : null,
                    'atrasada' => $prazo !== null && $prazo < $hoje];
        }, linhas("SELECT o.id, o.numero, o.status, o.data_prev, o.hora_prev, o.checklist, cl.nome AS cliente_nome
                     FROM ordens_servico o JOIN clientes cl ON cl.tenant_id = o.tenant_id AND cl.id = o.cliente_id
                    WHERE o.tenant_id = ? AND o.excluido_em IS NULL AND o.status NOT IN ('Concluída','Cancelada','Serviço finalizado')" . $wt . "
                    ORDER BY o.data_prev IS NULL, o.data_prev, o.hora_prev LIMIT 20", array_merge([$tid], $pt)));

        /* PMOC do mês destinado à pessoa: técnico do mês = ela; sem técnico do mês, vale a escala do plano.
           v1.39.0: com o endereço (plano ou cadastro do cliente) para o botão "Abrir mapa" — nucleo/pmoc_tecnico.php */
        $out['meuPmoc'] = pmoc_do_usuario($tid, $uid);

        /* v1.21.0: números do celular (só contagens, nada de R$) */
        $minhas = "t.tenant_id = ? AND t.excluido_em IS NULL AND t.status NOT IN ('feita','cancelada')
                   AND (t.para_todos = 1 OR EXISTS (SELECT 1 FROM tarefa_responsaveis r WHERE r.tenant_id = t.tenant_id AND r.tarefa_id = t.id AND r.usuario_id = ?)
                        OR (t.criado_por = ? AND NOT EXISTS (SELECT 1 FROM tarefa_responsaveis r2 WHERE r2.tenant_id = t.tenant_id AND r2.tarefa_id = t.id)))";
        $osAbertas = (int) valor("SELECT COUNT(*) FROM ordens_servico WHERE tenant_id = ? AND excluido_em IS NULL AND status NOT IN ('Concluída','Cancelada','Serviço finalizado')", [$tid]);
        $cel = ['osAbertas' => $osAbertas, 'minhasTarefas' => 0, 'minhasAtrasadas' => 0, 'osHoje' => count($os), 'chamadosAtivos' => null, 'atrasadasEquipe' => null];
        try {
            $cel['minhasTarefas'] = (int) valor("SELECT COUNT(*) FROM tarefas t WHERE $minhas", [$tid, $uid, $uid]);
            $cel['minhasAtrasadas'] = (int) valor("SELECT COUNT(*) FROM tarefas t WHERE $minhas AND t.data IS NOT NULL AND t.data < ?", [$tid, $uid, $uid, $hoje]);
        } catch (Throwable $e) { /* módulo de tarefas sem SQL 06 */ }
        if ($escritorio) {
            $cel['chamadosAtivos'] = (int) valor("SELECT COUNT(*) FROM chamados WHERE tenant_id = ? AND excluido_em IS NULL AND status NOT IN ('Concluído','Não Aprovado')", [$tid]);
            try { $cel['atrasadasEquipe'] = (int) valor("SELECT COUNT(*) FROM tarefas WHERE tenant_id = ? AND excluido_em IS NULL AND status NOT IN ('feita','cancelada') AND data < ?", [$tid, $hoje]); }
            catch (Throwable $e) {}
        }
        $out['cel'] = $cel;
        if (!$escritorio) return $out;

        /* ---- chamados parados ---- */
        $limite = date('Y-m-d H:i:s', strtotime('-' . IN_DIAS_PARADO . ' days'));
        $out['parados'] = array_map(function ($c) use ($admin) {
            $r = ['id' => (int) $c['id'], 'numero' => (int) $c['numero'], 'clienteNome' => $c['cliente_nome'], 'status' => $c['status'],
                  'tipoServico' => $c['tipo_servico'], 'comQuemFalar' => $c['com_quem_falar'], 'atualizadoEm' => $c['atualizado_em'],
                  'dias' => (int) floor((time() - strtotime($c['atualizado_em'])) / 86400)];
            if ($admin) $r['valor'] = $c['valor'] === null ? null : (float) $c['valor'];
            return $r;
        }, linhas("SELECT ch.id, ch.numero, ch.status, ch.tipo_servico, ch.com_quem_falar, ch.atualizado_em, ch.valor, cl.nome AS cliente_nome
                     FROM chamados ch JOIN clientes cl ON cl.tenant_id = ch.tenant_id AND cl.id = ch.cliente_id
                    WHERE ch.tenant_id = ? AND ch.excluido_em IS NULL AND ch.status IN ('Falta enviar orçamento','Aguardando aprovação') AND ch.atualizado_em < ?
                    ORDER BY ch.atualizado_em LIMIT 15", [$tid, $limite]));

        /* ---- v1.14.0: propostas vencendo/vencidas e retornos marcados até hoje ---- */
        $out['propostas'] = [];
        foreach (linhas("SELECT ch.id, ch.numero, ch.status, ch.com_quem_falar, ch.valor, cl.nome AS cliente_nome,
                                (SELECT DATEDIFF(DATE_ADD(DATE(o.enviado_em), INTERVAL o.validade_dias DAY), CURDATE()) FROM orcamentos o
                                  WHERE o.tenant_id = ch.tenant_id AND o.chamado_id = ch.id AND o.excluido_em IS NULL AND o.enviado_em IS NOT NULL ORDER BY o.versao DESC LIMIT 1) AS resta
                           FROM chamados ch JOIN clientes cl ON cl.tenant_id = ch.tenant_id AND cl.id = ch.cliente_id
                          WHERE ch.tenant_id = ? AND ch.excluido_em IS NULL AND ch.status = 'Aguardando aprovação'", [$tid]) as $c) {
            if ($c['resta'] === null || (int) $c['resta'] > 3) continue;
            $r = ['id' => (int) $c['id'], 'numero' => (int) $c['numero'], 'clienteNome' => $c['cliente_nome'], 'comQuemFalar' => $c['com_quem_falar'],
                  'tipo' => (int) $c['resta'] < 0 ? 'vencida' : 'vencendo', 'dias' => (int) $c['resta']];
            if ($admin) $r['valor'] = $c['valor'] === null ? null : (float) $c['valor'];
            $out['propostas'][$r['id']] = $r;
        }
        try {
            foreach (linhas("SELECT ch.id, ch.numero, ch.com_quem_falar, ch.valor, ch.proximo_retorno, cl.nome AS cliente_nome
                               FROM chamados ch JOIN clientes cl ON cl.tenant_id = ch.tenant_id AND cl.id = ch.cliente_id
                              WHERE ch.tenant_id = ? AND ch.excluido_em IS NULL AND ch.proximo_retorno IS NOT NULL AND ch.proximo_retorno <= ?
                                AND ch.status NOT IN ('Concluído','Não Aprovado') ORDER BY ch.proximo_retorno LIMIT 30", [$tid, $hoje]) as $c) {
                $r = isset($out['propostas'][(int) $c['id']]) ? $out['propostas'][(int) $c['id']]
                   : ['id' => (int) $c['id'], 'numero' => (int) $c['numero'], 'clienteNome' => $c['cliente_nome'], 'comQuemFalar' => $c['com_quem_falar'], 'tipo' => 'retorno', 'dias' => null];
                $r['retorno'] = $c['proximo_retorno'];
                if ($admin && !array_key_exists('valor', $r)) $r['valor'] = $c['valor'] === null ? null : (float) $c['valor'];
                $out['propostas'][$r['id']] = $r;
            }
        } catch (Throwable $e) { /* SQL 09 ainda não rodado */ }
        $out['propostas'] = array_values($out['propostas']);
        usort($out['propostas'], function ($a, $b) { return ($a['dias'] ?? 99) <=> ($b['dias'] ?? 99); });

        /* ---- números ---- */
        $n = function ($sql, $p) { return valor($sql, $p); };
        $num = [
            'aEnviar'     => (int) $n("SELECT COUNT(*) FROM chamados WHERE tenant_id = ? AND excluido_em IS NULL AND status = 'Falta enviar orçamento'", [$tid]),
            'aguardando'  => (int) $n("SELECT COUNT(*) FROM chamados WHERE tenant_id = ? AND excluido_em IS NULL AND status = 'Aguardando aprovação'", [$tid]),
            'osFaturar'   => (int) $n("SELECT COUNT(*) FROM ordens_servico WHERE tenant_id = ? AND excluido_em IS NULL AND status = 'Serviço finalizado'", [$tid]),
            'tarefasAtrasadas' => (int) $n("SELECT COUNT(*) FROM tarefas WHERE tenant_id = ? AND excluido_em IS NULL AND status NOT IN ('feita','cancelada') AND data < ?", [$tid, $hoje]),
        ];
        if ($admin) {
            $num['aguardandoValor'] = (float) $n("SELECT COALESCE(SUM(valor),0) FROM chamados WHERE tenant_id = ? AND excluido_em IS NULL AND status = 'Aguardando aprovação'", [$tid]);
            $num['aReceber'] = (float) $n("SELECT COALESCE(SUM(GREATEST(COALESCE(valor,0) - recebido, 0)),0) FROM chamados
                                            WHERE tenant_id = ? AND excluido_em IS NULL AND status IN ('Aprovado','Em Andamento','Aguardando 2ª etapa','Falta pagamento','Concluído')", [$tid]);
        }
        $out['numeros'] = $num;
        return $out;
    },
];
