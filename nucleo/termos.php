<?php
/* KONSTANTE SaaS — nucleo/termos.php  (v1.14.0)
   Versão vigente dos Termos de Uso e da Política de Privacidade da plataforma.
   Ao publicar texto novo em legal/, troque a versão aqui: todos os usuários
   aceitam de novo no próximo acesso (o aceite fica em termos_aceites). */
if (!defined('KSAAS')) { http_response_code(403); exit; }

const TERMOS_VERSAO = '2026-10-27';   /* v1.30.0: planos, pagamento e atraso; Asaas na Privacidade */
const TERMOS_DOCS = ['termos', 'privacidade'];

/* true se o usuário ainda não aceitou a versão vigente (sem a tabela = não bloqueia ninguém) */
function termos_pendentes($u) {
    try {
        $n = (int) valor("SELECT COUNT(*) FROM termos_aceites WHERE usuario_id = ? AND versao = ? AND documento IN ('termos','privacidade')", [(int) $u['id'], TERMOS_VERSAO]);
        return $n < count(TERMOS_DOCS);
    } catch (Throwable $e) { return false; }
}

function termos_registrar($u) {
    foreach (TERMOS_DOCS as $doc)
        q("INSERT IGNORE INTO termos_aceites (tenant_id, usuario_id, documento, versao, ip) VALUES (?, ?, ?, ?, ?)",
          [(int) $u['tenant_id'], (int) $u['id'], $doc, TERMOS_VERSAO, ip()]);
}
