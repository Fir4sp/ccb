<?php
/* =====================================================================
   SGClim — nucleo/pmoc_tecnico.php  ·  PMOC do mês destinado a um usuário (v1.39.0)
   Usado pelo Início do celular (inicio.resumo › meuPmoc) e pela tela de
   Ordens de serviço (os.resumo › meuPmoc), para o técnico ter o endereço
   e o botão "Abrir mapa" sem a equipe precisar criar uma tarefa à parte.
   Regras (as mesmas da v1.35.1/v1.38.0):
     • técnico do mês (dados.tecMes[mes]) = a pessoa; sem técnico do mês, vale a escala (dados.tecnicos);
     • plano trimestral/semestral/anual só aparece nos meses de visita (contados do mês de início).
   Endereço: o do plano (dados.endereco) ou, em branco, o do cadastro do cliente.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

function pmoc_do_usuario($tid, $uid, $mes = null, $ano = null) {
    $out = [];
    $mes = $mes ?: (int) date('n'); $ano = $ano ?: (int) date('Y');
    try {
        foreach (linhas("SELECT p.id, p.dados, c.nome AS cliente_nome, c.endereco AS cliente_endereco FROM pmoc_planos p JOIN clientes c ON c.tenant_id = p.tenant_id AND c.id = p.cliente_id
                          WHERE p.tenant_id = ? AND p.ano = ? AND p.excluido_em IS NULL ORDER BY c.nome", [$tid, $ano]) as $p) {
            $dd = json_decode((string) $p['dados'], true); if (!is_array($dd)) $dd = [];
            $mi = (int) ($dd['mesInicio'] ?? 1); if ($mi < 1 || $mi > 12) $mi = 1;
            $fq = ['T' => 3, 'S' => 6, 'A' => 12][(string) ($dd['frequencia'] ?? '')] ?? 1;
            if ($fq > 1 && ($mes < $mi || ($mes - $mi) % $fq !== 0)) continue;
            $doMes = (int) ((is_array($dd['tecMes'] ?? null) ? $dd['tecMes'] : [])[(string) $mes] ?? 0);
            $meu = $doMes ? $doMes === (int) $uid : in_array((int) $uid, array_map('intval', $dd['tecnicos'] ?? []), true);
            if (!$meu) continue;
            $ids = array_values(array_filter(array_map(function ($e) { return (int) ($e['id'] ?? 0); }, $dd['equip'] ?? [])));
            $ativos = $ids ? array_map('intval', array_column(linhas("SELECT id FROM equipamentos WHERE tenant_id = ? AND excluido_em IS NULL AND id IN (" . implode(',', $ids) . ")", [$tid]), 'id')) : [];
            $feitas = $ativos ? (int) valor("SELECT COUNT(*) FROM pmoc_visitas WHERE tenant_id = ? AND plano_id = ? AND ano = ? AND mes = ? AND status = 'feita' AND excluido_em IS NULL
                                             AND equipamento_id IN (" . implode(',', $ativos) . ")", [$tid, (int) $p['id'], $ano, $mes]) : 0;
            $end = trim((string) ($dd['endereco'] ?? ''));
            if ($end === '') $end = trim((string) ($p['cliente_endereco'] ?? ''));
            $out[] = ['id' => (int) $p['id'], 'clienteNome' => $p['cliente_nome'], 'endereco' => $end !== '' ? $end : null,
                      'equipamentos' => count($ativos), 'feitas' => $feitas, 'mes' => $mes, 'ano' => $ano];
        }
    } catch (Throwable $e) { /* PMOC ainda sem tabelas */ }
    return $out;
}
