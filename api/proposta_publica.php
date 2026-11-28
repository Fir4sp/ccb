<?php
/* KONSTANTE SaaS — api/proposta_publica.php  ·  página pública da proposta (v1.18.0)
   Usado só pela porta /saas/p/api.php (sem login). A proposta é achada pelo código
   aleatório do link (proposta_links.token, 32 hex), nunca por id.
   ver      {t}                         → empresa, resumo, HTML da proposta (versão atual)
   responder{t, v, resposta, nome, obs?} → aprovar (chamado vai para "Aprovado") ou recusar (só registra)
   Visualização da própria equipe (logada neste aparelho) não conta. Códigos errados em
   sequência bloqueiam o IP por 15 minutos. */
if (!defined('KSAAS') || !defined('KPUB')) { http_response_code(403); exit; }

date_default_timezone_set('America/Sao_Paulo');
require_once dirname(__DIR__) . '/nucleo/notificacoes.php';   /* v1.19.0 */
require_once dirname(__DIR__) . '/nucleo/modulos.php';
require_once dirname(__DIR__) . '/nucleo/fin_chamados.php';     /* v1.23.0 */
const PP_MAX_ERROS_IP = 30;
const PP_ABERTOS = ['Falta enviar orçamento', 'Aguardando aprovação'];

function pp_json($v) { $d = json_decode((string) ($v ?? ''), true); return is_array($d) ? $d : []; }
function pp_cor($c, $padrao) { return is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c) ? $c : $padrao; }
function pp_logo($t) {
    if (empty($t['logo_anexo_id'])) return null;
    $a = linha("SELECT caminho, mime FROM anexos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$t['logo_anexo_id'], $t['id']]);
    if (!$a || strpos((string) $a['mime'], 'image/') !== 0) return null;
    $arq = ARQUIVOS_DIR . '/' . $a['caminho'];
    if (!is_file($arq) || filesize($arq) > 1500000) return null;
    return 'data:' . $a['mime'] . ';base64,' . base64_encode(file_get_contents($arq));
}

/* acha o link pelo código; erra → conta tentativa do IP */
function pp_link($d) {
    $chaveIp = 'prop:' . ip();
    if (login_bloqueado_seg($chaveIp) > 0) erro('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429, 'BLOQUEADO');
    $tok = strtolower((string) ($d['t'] ?? ''));
    if (!preg_match('/^[a-f0-9]{32}$/', $tok)) { login_falhou($chaveIp, PP_MAX_ERROS_IP); erro('Link inválido. Confira se o endereço veio inteiro.', 404, 'LINK'); }
    try { $l = linha("SELECT * FROM proposta_links WHERE token = ?", [$tok]); }
    catch (Throwable $e) { erro('Página indisponível no momento.', 503, 'INDISPONIVEL'); }
    if (!$l) { login_falhou($chaveIp, PP_MAX_ERROS_IP); erro('Proposta não encontrada. O link pode estar incompleto.', 404, 'LINK'); }
    /* v1.21.0: link antigo do mesmo chamado → abre o mais novo (nunca fica preso numa versão velha) */
    $novo = linha("SELECT * FROM proposta_links WHERE tenant_id = ? AND chamado_id = ? ORDER BY id DESC LIMIT 1", [(int) $l['tenant_id'], (int) $l['chamado_id']]);
    if ($novo) $l = $novo;
    $t = linha("SELECT * FROM tenants WHERE id = ?", [(int) $l['tenant_id']]);
    if (!$t || (int) $t['ativo'] !== 1) erro('Página indisponível no momento.', 403, 'DESATIVADO');
    $c = linha("SELECT ch.*, cl.nome AS cliente_nome FROM chamados ch JOIN clientes cl ON cl.tenant_id = ch.tenant_id AND cl.id = ch.cliente_id
                 WHERE ch.id = ? AND ch.tenant_id = ?", [(int) $l['chamado_id'], (int) $l['tenant_id']]);
    if (!$c) erro('Proposta não encontrada.', 404, 'LINK');
    return [$l, $t, $c];
}

function pp_tem_versao() {
    static $tem = null;
    if ($tem === null) { try { valor("SELECT versao FROM proposta_links LIMIT 0"); $tem = true; } catch (Throwable $e) { $tem = false; } }
    return $tem;
}

/* situação do link: o que o cliente pode fazer */
function pp_situacao($l, $c) {
    $tid = (int) $l['tenant_id'];
    $env = valor("SELECT enviado_em FROM orcamentos WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, (int) $c['id']]);
    $base = max(substr((string) $l['criado_em'], 0, 10), $env ? substr((string) $env, 0, 10) : '');   /* "renovar validade" no chamado também vale aqui */
    $vence = date('Y-m-d', strtotime($base . ' +' . (int) ($l['validade_dias'] ?: 15) . ' days'));
    $resta = (int) round((strtotime($vence) - strtotime(date('Y-m-d'))) / 86400);
    if ($l['resposta']) $sit = $l['resposta'];                                  // aprovada | recusada
    elseif ($c['excluido_em'] !== null) $sit = 'cancelada';
    elseif ($l['revogado_em'] !== null) $sit = 'atualizada';
    elseif (!in_array($c['status'], PP_ABERTOS, true)) $sit = (CH_STATUS_PUB[$c['status']] ?? '') === 'perdido' ? 'encerrada' : 'aprovada_empresa';
    elseif ($resta < 0) $sit = 'vencida';
    else $sit = 'aberta';
    return ['situacao' => $sit, 'venceEm' => $vence, 'diasRestantes' => $resta];
}
const CH_STATUS_PUB = ['Aprovado' => 'ganho', 'Em Andamento' => 'ganho', 'Aguardando 2ª etapa' => 'ganho', 'Falta pagamento' => 'ganho', 'Concluído' => 'ganho', 'Não Aprovado' => 'perdido'];

/* alguém da própria empresa logado neste aparelho? (prévia não conta como visualização) */
function pp_eh_equipe($tid) {
    if (empty($_COOKIE['KSAAS'])) return false;
    try { $u = eu(false); } catch (Throwable $e) { return false; }
    return $u && (int) $u['tenant_id'] === (int) $tid && $u['perfil'] !== 'cliente';
}

function pp_saida($l, $t, $c, $comHtml) {
    $tid = (int) $l['tenant_id'];
    $emp = pp_json(valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'empresa'", [$tid]));
    $s = pp_situacao($l, $c);
    $logo = pp_logo($t);
    $out = [
        'empresa' => ['nome' => ($emp['nome'] ?? '') !== '' ? $emp['nome'] : $t['nome'], 'telefone' => $emp['telefone'] ?? null, 'email' => $emp['email'] ?? null,
                      'corPrimaria' => pp_cor($t['cor_primaria'], '#111111'), 'corSecundaria' => pp_cor($t['cor_secundaria'], '#1f6feb'), 'logo' => $logo],
        'proposta' => ['numero' => (int) $c['numero'], 'cliente' => $c['cliente_nome'], 'aosCuidados' => $c['com_quem_falar'], 'servico' => $c['tipo_servico'],
                       'total' => $l['total'] !== null ? (float) $l['total'] : null, 'enviadaEm' => substr((string) $l['criado_em'], 0, 10),
                       'venceEm' => $s['venceEm'], 'diasRestantes' => $s['diasRestantes'], 'situacao' => $s['situacao'],
                       'resposta' => $l['resposta'], 'respondidoEm' => $l['respondido_em'], 'respostaNome' => $l['resposta_nome'],
                       /* v1.21.0 */
                       'versao' => isset($l['versao']) ? (int) $l['versao'] : 1, 'atualizadaEm' => $l['atualizado_em'] ?? null,
                       'versaoResposta' => isset($l['versao_resposta']) && $l['versao_resposta'] !== null ? (int) $l['versao_resposta'] : null],
        'html' => null,
    ];
    /* proposta substituída ou cancelada: não mostra preços antigos */
    if ($comHtml && !in_array($s['situacao'], ['atualizada', 'cancelada'], true)) {
        $h = (string) $l['html'];
        $h = $logo ? str_replace('__LOGO__', $logo, $h) : preg_replace('#<img[^>]*__LOGO__[^>]*>#', '', $h);
        $out['html'] = $h;
    }
    return $out;
}

/* v1.19.0: quem recebe o aviso da proposta — responsável do chamado, senão quem enviou o link,
   senão quem abriu o chamado, senão os administradores */
function pp_avisar($l, $c, $titulo, $texto, $tipo) {
    $tid = (int) $l['tenant_id'];
    $quem = array_values(array_filter([(int) ($c['responsavel_id'] ?? 0), (int) ($l['criado_por'] ?? 0), (int) ($c['criado_por'] ?? 0)]));
    $quem = $quem ? [$quem[0]] : usuarios_escritorio($tid, true);
    notificar($tid, $quem, $titulo, $texto, 'chamado:' . (int) $c['id'], $tipo);
}

return [

    'ver' => function ($d) {
        [$l, $t, $c] = pp_link($d);
        if (!pp_eh_equipe($l['tenant_id'])) {
            q("UPDATE proposta_links SET visualizacoes = visualizacoes + 1, primeira_vis = COALESCE(primeira_vis, NOW()), ultima_vis = NOW() WHERE id = ?", [$l['id']]);
            /* v1.21.0: guarda qual versão o cliente viu e quando (prova de que viu a proposta alterada) */
            if (pp_tem_versao() && (int) ($l['versao_vista'] ?? 0) !== (int) $l['versao']) {
                q("UPDATE proposta_links SET versao_vista = versao, versao_vista_em = NOW() WHERE id = ?", [$l['id']]);
                $tid = (int) $l['tenant_id'];
                try { q("INSERT INTO chamado_acompanhamentos (tenant_id, chamado_id, tipo, texto, usuario_id) VALUES (?, ?, 'visualizacao', ?, NULL)",
                        [$tid, (int) $c['id'], 'Cliente abriu a proposta no link · versão ' . (int) $l['versao'] . '.']); } catch (Throwable $e) { /* SQL 09 */ }
                if ($l['primeira_vis'] !== null)   /* 1ª vez já avisa abaixo; versão nova vista também avisa */
                    pp_avisar($l, $c, 'Proposta ' . $c['numero'] . ' (versão ' . (int) $l['versao'] . ') aberta', $c['cliente_nome'] . ' abriu a versão atualizada da proposta.', 'proposta_vista');
            }
            if ($l['primeira_vis'] === null && $l['revogado_em'] === null)   /* v1.19.0: só a 1ª vez */
                pp_avisar($l, $c, 'Proposta ' . $c['numero'] . ' aberta pelo cliente', $c['cliente_nome'] . ' abriu o link da proposta agora.', 'proposta_vista');
        }
        return pp_saida($l, $t, $c, true);
    },

    'responder' => function ($d) {
        [$l, $t, $c] = pp_link($d);
        $tid = (int) $l['tenant_id'];
        $resp = (string) ($d['resposta'] ?? '');
        if (!in_array($resp, ['aprovar', 'recusar'], true)) erro('Resposta inválida.');
        $nome = txt($d['nome'] ?? '', 150);
        if (mb_strlen($nome) < 3) erro('Informe o seu nome.');
        $obs = txt($d['obs'] ?? '', 1000);
        $chaveIp = 'propresp:' . ip();
        if (login_bloqueado_seg($chaveIp) > 0) erro('Muitas tentativas. Aguarde alguns minutos.', 429, 'BLOQUEADO');
        login_falhou($chaveIp, 10);   /* no máximo 10 respostas por IP a cada 15 min */

        /* v1.21.0: só aprova a versão que está na tela */
        if (pp_tem_versao() && (int) ($d['v'] ?? 0) !== (int) $l['versao'])
            erro('Esta proposta foi atualizada pela empresa enquanto a página estava aberta. Carregamos a versão nova: confira antes de responder.', 409, 'VERSAO');
        $s = pp_situacao($l, $c);
        $msg = ['aprovada' => 'Esta proposta já foi aprovada.', 'recusada' => 'Esta proposta já foi respondida.', 'atualizada' => 'Esta proposta foi atualizada. Peça o link novo à empresa.',
                'cancelada' => 'Esta proposta foi cancelada.', 'encerrada' => 'Esta proposta foi encerrada pela empresa.', 'aprovada_empresa' => 'Esta proposta já está aprovada.',
                'vencida' => 'A validade desta proposta terminou em ' . date('d/m/Y', strtotime($s['venceEm'])) . '. Fale com a empresa para renovar.'];
        if ($s['situacao'] !== 'aberta') erro($msg[$s['situacao']] ?? 'Esta proposta não aceita mais resposta.', 409, 'FECHADA');

        db()->beginTransaction();
        $n = pp_tem_versao()
            ? q("UPDATE proposta_links SET resposta = ?, respondido_em = NOW(), resposta_nome = ?, resposta_obs = ?, resposta_ip = ?, versao_resposta = versao
                  WHERE id = ? AND resposta IS NULL AND revogado_em IS NULL AND versao = ?",
                [$resp === 'aprovar' ? 'aprovada' : 'recusada', $nome, $obs ?: null, ip(), $l['id'], (int) $l['versao']])->rowCount()
            : q("UPDATE proposta_links SET resposta = ?, respondido_em = NOW(), resposta_nome = ?, resposta_obs = ?, resposta_ip = ? WHERE id = ? AND resposta IS NULL AND revogado_em IS NULL",
                [$resp === 'aprovar' ? 'aprovada' : 'recusada', $nome, $obs ?: null, ip(), $l['id']])->rowCount();
        if (!$n) { db()->rollBack(); erro('Esta proposta já foi respondida.', 409, 'FECHADA'); }
        $txt = ($resp === 'aprovar' ? 'Proposta APROVADA pelo cliente no link' : 'Cliente RECUSOU a proposta no link') . (pp_tem_versao() ? ' (versão ' . (int) $l['versao'] . ')' : '') . ' — ' . $nome . ($obs !== '' ? '. Obs.: ' . $obs : '') . '.';
        if ($resp === 'aprovar') {
            q("UPDATE chamados SET status = 'Aprovado', fechado_em = NULL WHERE id = ? AND tenant_id = ? AND status IN ('Falta enviar orçamento','Aguardando aprovação')", [$c['id'], $tid]);
            try { q("UPDATE chamados SET ganho_em = COALESCE(ganho_em, CURDATE()) WHERE id = ? AND tenant_id = ?", [$c['id'], $tid]); } catch (Throwable $e) { /* SQL 07 não rodado */ }
            q("UPDATE orcamentos SET status = 'aprovado', aprovado_em = COALESCE(aprovado_em, NOW()) WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, $c['id']]);
        }
        try { q("INSERT INTO chamado_acompanhamentos (tenant_id, chamado_id, tipo, texto, usuario_id) VALUES (?, ?, ?, ?, NULL)", [$tid, $c['id'], $resp === 'aprovar' ? 'aprovacao' : 'recusa', $txt]); }
        catch (Throwable $e) { /* SQL 09 não rodado */ }
        db()->commit();
        if ($resp === 'aprovar') fin_sincronizar_chamado((int) $c['id'], $tid, $c['status']);   /* v1.23.0: aprovação pelo link já gera as parcelas */
        auditar($resp === 'aprovar' ? 'proposta_aprovada_link' : 'proposta_recusada_link', 'chamados', (int) $c['id'], $c['numero'] . ' · ' . $nome, $tid, null);
        pp_avisar($l, $c, 'Proposta ' . $c['numero'] . ($resp === 'aprovar' ? ' aprovada pelo cliente' : ' recusada pelo cliente'),
            $c['cliente_nome'] . ' · ' . ($resp === 'aprovar' ? 'aprovada' : 'recusada') . ' por ' . $nome . ($obs !== '' ? ' — "' . mb_substr($obs, 0, 120) . '"' : ''),
            $resp === 'aprovar' ? 'proposta_aprovada' : 'proposta_recusada');   /* v1.19.0 */

        [$l, $t, $c] = pp_link($d);
        return pp_saida($l, $t, $c, false);
    },
];
