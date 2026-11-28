<?php
/* KONSTANTE SaaS — api/equip_publico.php  ·  ficha pública do equipamento (etiqueta QR) — v1.13.0
   Usado só pela porta /saas/q/api.php (sem login). O equipamento é achado pelo código
   aleatório da etiqueta (equipamentos.qr_token), nunca por id. Mostra a ficha e o histórico
   de serviços, sem valores e sem fotos. Códigos errados em sequência bloqueiam o IP por 15 min. */
if (!defined('KSAAS') || !defined('KPUB')) { http_response_code(403); exit; }

const QR_MAX_ERROS_IP = 30;

function qr_json($v) { $d = json_decode((string) ($v ?? ''), true); return is_array($d) ? $d : []; }
function qr_cor($c, $padrao) { return is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c) ? $c : $padrao; }
function qr_primeiro_nome($n) { $p = preg_split('/\s+/', trim((string) $n)); return $p && $p[0] !== '' ? $p[0] : null; }
function qr_logo($t) {
    if (empty($t['logo_anexo_id'])) return null;
    $a = linha("SELECT caminho, mime FROM anexos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$t['logo_anexo_id'], $t['id']]);
    if (!$a || strpos((string) $a['mime'], 'image/') !== 0) return null;
    $arq = ARQUIVOS_DIR . '/' . $a['caminho'];
    if (!is_file($arq) || filesize($arq) > 1500000) return null;
    return 'data:' . $a['mime'] . ';base64,' . base64_encode(file_get_contents($arq));
}

return [

    /* {t} → empresa, equipamento, preventivas, pendências abertas, ocorrências */
    'ficha' => function ($d) {
        $chaveIp = 'qr:' . ip();
        if (login_bloqueado_seg($chaveIp) > 0) erro('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429, 'BLOQUEADO');
        $tok = strtolower((string) ($d['t'] ?? ''));
        if (!preg_match('/^[a-f0-9]{24}$/', $tok)) { login_falhou($chaveIp, QR_MAX_ERROS_IP); erro('Etiqueta inválida.', 404, 'QR'); }
        $e = linha("SELECT e.*, c.nome AS cliente_nome FROM equipamentos e JOIN clientes c ON c.tenant_id = e.tenant_id AND c.id = e.cliente_id
                     WHERE e.qr_token = ? AND e.excluido_em IS NULL", [$tok]);
        if (!$e) { login_falhou($chaveIp, QR_MAX_ERROS_IP); erro('Este equipamento não foi encontrado. A etiqueta pode ser antiga.', 404, 'QR'); }
        $tid = (int) $e['tenant_id'];
        $t = linha("SELECT * FROM tenants WHERE id = ?", [$tid]);
        if (!$t || (int) $t['ativo'] !== 1) erro('Ficha indisponível no momento.', 403, 'DESATIVADO');
        $emp = qr_json(valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'empresa'", [$tid]));
        $x = qr_json($e['dados']);

        $prev = [];
        foreach (linhas("SELECT ano, mes, status, dados FROM pmoc_visitas WHERE tenant_id = ? AND equipamento_id = ? AND excluido_em IS NULL AND status IN ('feita','andamento')
                          ORDER BY ano DESC, mes DESC LIMIT 24", [$tid, (int) $e['id']]) as $v) {
            $dv = qr_json($v['dados']);
            $an = 0; $nf = 0; foreach ($dv['itens'] ?? [] as $r) { if ($r === 'an') $an++; if ($r === 'nf') $nf++; }
            /* v1.34.0: Não OK = pendência · NF = executado parcialmente · só OK/N/A = executado */
            $prev[] = ['ano' => (int) $v['ano'], 'mes' => (int) $v['mes'], 'status' => $v['status'], 'data' => isset($dv['feitaEm']) ? substr((string) $dv['feitaEm'], 0, 10) : null,
                       'tecnico' => qr_primeiro_nome($dv['tecnico'] ?? ''), 'anomalias' => $an, 'naoFeitos' => $nf,
                       'resultado' => $an ? 'pendencia' : ($nf ? 'parcial' : 'executado')];
        }
        $pend = [];
        foreach (linhas("SELECT dados FROM pmoc_visitas WHERE tenant_id = ? AND equipamento_id = ? AND excluido_em IS NULL AND dados LIKE '%\"pend\"%'", [$tid, (int) $e['id']]) as $v)
            foreach (qr_json($v['dados'])['pend'] ?? [] as $p) if (empty($p['resolvida']))
                $pend[] = ['texto' => mb_substr((string) ($p['texto'] ?? ''), 0, 300), 'desde' => isset($p['em']) ? substr((string) $p['em'], 0, 10) : null, 'prioridade' => $p['prioridade'] ?? null];
        $oc = [];
        try {
            foreach (linhas("SELECT numero, status, orientacoes, criado_em, fechada_em FROM ordens_servico WHERE tenant_id = ? AND equipamento_id = ? AND excluido_em IS NULL AND status <> 'Cancelada'
                              ORDER BY criado_em DESC LIMIT 12", [$tid, (int) $e['id']]) as $o)
                $oc[] = ['numero' => $o['numero'], 'status' => $o['status'], 'descricao' => mb_substr((string) $o['orientacoes'], 0, 200),
                         'data' => substr((string) ($o['fechada_em'] ?: $o['criado_em']), 0, 10)];
        } catch (Throwable $ex) { /* SQL 08 ainda não rodado */ }
        $ev = [];
        foreach (array_reverse(is_array($x['historico'] ?? null) ? $x['historico'] : []) as $h)
            $ev[] = ['tipo' => $h['tipoEvento'] ?? 'evento', 'data' => isset($h['data']) ? substr((string) $h['data'], 0, 10) : null, 'motivo' => mb_substr((string) ($h['motivo'] ?? ''), 0, 200)];

        return [
            'empresa' => ['nome' => ($emp['nome'] ?? '') !== '' ? $emp['nome'] : $t['nome'], 'telefone' => $emp['telefone'] ?? null, 'email' => $emp['email'] ?? null,
                          'corPrimaria' => qr_cor($t['cor_primaria'], '#0b1730'), 'corSecundaria' => qr_cor($t['cor_secundaria'], '#1f6feb'), 'logo' => qr_logo($t)],
            'equipamento' => ['tag' => $e['tag'], 'ambiente' => $e['ambiente'], 'andar' => $x['andar'] ?? null, 'tipo' => $e['tipo'], 'marca' => $e['marca'], 'modelo' => $e['modelo'],
                              'capacidadeBtu' => $e['capacidade_btu'] !== null ? (int) $e['capacidade_btu'] : null, 'gas' => $x['gas'] ?? null, 'status' => $x['status'] ?? null,
                              'dataInstalacao' => $x['dataInstalacao'] ?? null, 'cliente' => $e['cliente_nome']],
            'preventivas' => $prev, 'pendencias' => $pend, 'ocorrencias' => $oc, 'eventos' => $ev,
        ];
    },
];
