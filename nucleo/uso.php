<?php
/* =====================================================================
   KONSTANTE SaaS — nucleo/uso.php  (v1.20.0)
   Indicador de uso: cada ação feita por um usuário logado soma 1 em
   uso_diario (empresa × usuário × dia × módulo). Alimenta Console › Uso.
   Nunca derruba a ação: sem a tabela (SQL 14 ainda não rodado), nada acontece.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

/* prefixo da ação → grupo mostrado no Console */
const USO_GRUPO = [
    'auth' => 'acesso', 'inicio' => 'inicio',
    'clientes' => 'crm', 'chamados' => 'crm', 'catalogo' => 'crm', 'contratos' => 'contratos',
    'os' => 'os', 'tarefas' => 'tarefas', 'pmoc' => 'pmoc', 'assistente' => 'assistente',
    'usuarios' => 'empresa', 'config' => 'empresa', 'suporte' => 'empresa', 'anexos' => 'outros',
];
/* checagens automáticas que o app faz sozinho não contam como uso */
const USO_IGNORAR = '/^(notificacoes\.|anexos\.|auth\.(logout|eu)$)/';   /* v1.36.0: abrir foto e conferir sessão não gravam no banco */

function uso_registrar($acao) {
    if (defined('KPLAT') || defined('KPUB')) return;
    if (preg_match(USO_IGNORAR, $acao)) return;
    try {
        $u = eu(false);
        if (!$u) return;
        $pref = explode('.', $acao)[0];
        $grupo = USO_GRUPO[$pref] ?? 'outros';
        q("INSERT INTO uso_diario (tenant_id, usuario_id, dia, modulo, acoes, primeiro, ultimo)
           VALUES (?, ?, CURDATE(), ?, 1, NOW(), NOW())
           ON DUPLICATE KEY UPDATE acoes = acoes + 1, ultimo = NOW()",
          [(int) $u['tenant_id'], (int) $u['id'], $grupo]);
    } catch (Throwable $e) { /* uso nunca derruba a ação */ }
}
