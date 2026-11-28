<?php
/* =====================================================================
   KONSTANTE SaaS — nucleo/modulos.php  (v1.19.0)
   Liberação de módulos por empresa.
   Cada módulo tem um estágio global (tabela modulos):
     desligado → ninguém vê
     teste     → só as empresas ligadas no Console (tenant_modulos.ativo = 1)
     geral     → todas, menos as desligadas no Console (tenant_modulos.ativo = 0)
   O CRM (clientes, chamados, catálogo), o Início, Usuários e Configurações
   são o núcleo do sistema e não entram aqui.
   Sem o SQL 13 rodado, tudo continua liberado como antes.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

/* módulo da API (prefixo da ação) → módulo liberável */
const MODULO_DA_API = [
    'contratos'  => 'contratos',
    'os'         => 'os',
    'tarefas'    => 'tarefas',
    'pmoc'       => 'pmoc',
    'assistente' => 'assistente',
    'erp'        => 'erp',
    'fin'        => 'erp',   /* v1.22.0: ações do Financeiro (api/financeiro.php) */
];

/* lista das chaves liberadas para a empresa; null = tabela ainda não existe (tudo liberado) */
function modulos_liberados($tid) {
    static $cache = [];
    $tid = (int) $tid;
    if (array_key_exists($tid, $cache)) return $cache[$tid];
    try {
        $rows = linhas("SELECT m.chave, m.estagio, tm.ativo
                          FROM modulos m
                          LEFT JOIN tenant_modulos tm ON tm.modulo = m.chave AND tm.tenant_id = ?
                         ORDER BY m.ordem, m.chave", [$tid]);
    } catch (Throwable $e) { return $cache[$tid] = null; }
    $ok = [];
    foreach ($rows as $r) if (modulo_efetivo($r['estagio'], $r['ativo'])) $ok[] = $r['chave'];
    /* v1.30.0: o plano da assinatura limita os módulos (isenta ou sem assinatura: sem limite) */
    $doPlano = function_exists('assinatura_modulos') ? assinatura_modulos($tid) : null;
    if ($doPlano !== null) $ok = array_values(array_intersect($ok, $doPlano));
    /* v1.32.0: recurso "Financeiro avançado" (DRE, fluxo, rentabilidade, conciliação) vem junto do Financeiro
       quando o plano inclui (ou quando não há plano: isenta, sem assinatura) */
    if (in_array('erp', $ok, true) && ($doPlano === null || in_array('erp_avancado', $doPlano, true))) $ok[] = 'erp_avancado';
    return $cache[$tid] = $ok;
}

function modulo_efetivo($estagio, $ativo) {
    if ($estagio === 'desligado') return false;
    if ($ativo !== null) return (int) $ativo === 1;
    return $estagio === 'geral';
}

function modulo_liberado($chave, $tid) {
    $l = modulos_liberados($tid);
    return $l === null || in_array($chave, $l, true);
}

/* usado pelo roteador: barra ações de módulo desligado para a empresa logada */
function exigir_modulo_da_api($prefixo) {
    if (defined('KPLAT') || defined('KPUB')) return;
    if (!isset(MODULO_DA_API[$prefixo])) return;
    $u = eu(false);
    if (!$u) return;   /* sem sessão: a própria ação responde "entre novamente" */
    if (!modulo_liberado(MODULO_DA_API[$prefixo], (int) $u['tenant_id']))
        erro('Este módulo não está liberado para a sua empresa.', 403, 'MODULO');
}

/* v1.32.0: ações do Financeiro avançado — só no plano que inclui erp_avancado */
const FIN_AVANCADO = '/^(fluxo|fluxo\.[a-z_.]+|dre|dre\.[a-z_.]+|rentabilidade|rentabilidade\.[a-z_.]+|extrato\.[a-z_.]+|conciliacao\.[a-z_.]+|conciliar|conciliar_auto|importacoes\.[a-z_.]+|importacao\.[a-z_.]+)$/';
function exigir_recurso_da_api($prefixo, $acao) {
    if (defined('KPLAT') || defined('KPUB')) return;
    if ($prefixo !== 'fin' || !preg_match(FIN_AVANCADO, $acao)) return;
    $u = eu(false);
    if (!$u) return;
    if (!modulo_liberado('erp_avancado', (int) $u['tenant_id']))
        erro('DRE, fluxo de caixa, rentabilidade e conciliação bancária fazem parte do plano Premium. Veja em Empresa › Assinatura.', 403, 'PLANO');
}
