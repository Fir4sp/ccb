<?php
/* KONSTANTE SaaS — api/chamados.php  ·  chamados (CRM)
   Ações: listar, obter, resumo, salvar, mudar_status, excluir, opcoes (orçamento fica na tabela orcamentos)
   v1.12.0: resumo por período (padrão: mês atual) e data de ganho (ganho_em).
   v1.8.0: listar aceita ativos=1 (esconde Concluído e Não Aprovado) e devolve osQtd por chamado.
   v1.14.0: validade da proposta — conta a partir do dia em que o chamado entrou em "Aguardando aprovação"
            (orcamentos.enviado_em) pelos dias da validade (padrão 15). Só sinaliza: o status não muda sozinho.
            Acompanhamento (contatos e próximo retorno) e "renovar validade".
   v1.18.0: proposta.enviar / proposta.status — página pública da proposta (pasta p/) com código
            secreto no link, enviada pelo WhatsApp; registra visualização e aprovação do cliente.
   Admin vê e edita valores; coordenação opera sem ver valores; técnico não acessa. */
if (!defined('KSAAS')) { http_response_code(403); exit; }

date_default_timezone_set('America/Sao_Paulo');   // v1.12.0: "mês atual" e datas de ganho no horário de Brasília

const CH_POR_PAGINA = 50;

/* CCB v2: status do chamado, com a categoria usada nos indicadores.
   Falta orçamento → Aguardando aprovação → Aprovado (por alçada) → Em Andamento (OS) → Concluído · ou Não Aprovado / Cancelado */
const CH_STATUS = [
    'Falta orçamento'        => 'aberto',
    'Aguardando aprovação'   => 'aberto',
    'Aprovado'               => 'ganho',
    'Em Andamento'           => 'ganho',
    'Concluído'              => 'ganho',
    'Não Aprovado'           => 'perdido',
    'Cancelado'              => 'perdido',
];
/* status que encerram o chamado: grava a data real de fechamento (ciclo) */
const CH_FINAIS = ['Concluído', 'Não Aprovado', 'Cancelado'];

/* tipos de serviço do CCB (a Coordenação muda em Configurações › Chamados); seguranca = exige parecer da Segurança do Trabalho */
const CH_TIPOS_PADRAO = [
    ['nome' => 'Elétrica', 'seguranca' => true], ['nome' => 'Hidráulica e esgoto', 'seguranca' => false],
    ['nome' => 'Civil (paredes, piso, pintura)', 'seguranca' => false], ['nome' => 'Telhado, forro e calhas', 'seguranca' => true],
    ['nome' => 'Ar-condicionado e ventiladores', 'seguranca' => false], ['nome' => 'Portas, janelas e fechaduras', 'seguranca' => false],
    ['nome' => 'Som e instrumentos', 'seguranca' => false], ['nome' => 'Incêndio e segurança', 'seguranca' => true],
    ['nome' => 'Móveis e bancos', 'seguranca' => false], ['nome' => 'Jardim e área externa', 'seguranca' => false],
    ['nome' => 'Obra', 'seguranca' => true], ['nome' => 'Outros', 'seguranca' => false],
];
const CH_ALCADAS_PADRAO = ['coord' => 500, 'gestao' => 1000];
const CH_NIVEIS = ['coord' => 1, 'gestao' => 2, 'procurador' => 3];
const CH_NIVEL_NOME = ['coord' => 'Coordenação', 'gestao' => 'Gestão', 'procurador' => 'Procurador'];
const CH_ORIGENS = [];

function ch_cfg_json($tid, $chave) {
    $v = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = ?", [$tid, $chave]);
    return $v ? json_decode((string) $v, true) : null;
}
function ch_tipos($tid) {
    $l = ch_cfg_json($tid, 'tipos_servico');
    return is_array($l) && $l ? $l : CH_TIPOS_PADRAO;
}
function ch_alcadas($tid) {
    $a = ch_cfg_json($tid, 'alcadas');
    return ['coord' => (float) ($a['coord'] ?? CH_ALCADAS_PADRAO['coord']), 'gestao' => (float) ($a['gestao'] ?? CH_ALCADAS_PADRAO['gestao'])];
}
function ch_exige_seguranca($tid, $tipo) {
    foreach (ch_tipos($tid) as $t) if (($t['nome'] ?? '') === $tipo) return !empty($t['seguranca']);
    return false;
}
/* quem precisa aprovar este valor */
function ch_nivel_exigido($tid, $valor) {
    $a = ch_alcadas($tid);
    $v = (float) ($valor ?? 0);
    return $v <= $a['coord'] ? 'coord' : ($v <= $a['gestao'] ? 'gestao' : 'procurador');
}
/* maior alçada da pessoa (0 = não aprova). O Administrador não aprova: dê a ele o perfil da alçada. */
function ch_nivel_de($u) {
    $n = 0;
    foreach (['coord', 'gestao', 'procurador'] as $p) if (tem_perfil($u, $p)) $n = max($n, CH_NIVEIS[$p]);
    return $n;
}
function ch_aprovacao($c, $u, $tid) {
    $nivel = ch_nivel_exigido($tid, $c['valor']);
    $exigeSeg = ch_exige_seguranca($tid, (string) $c['tipo_servico']);
    $nome = function ($id) use ($tid) { return $id ? valor("SELECT nome FROM usuarios WHERE id = ? AND tenant_id = ?", [(int) $id, $tid]) : null; };
    $aguardando = $c['status'] === CH_AGUARDANDO;
    $segOk = !$exigeSeg || ($c['parecer_seg'] ?? null) === 'favoravel';
    return [
        'nivelExigido' => $nivel, 'nivelNome' => CH_NIVEL_NOME[$nivel], 'valor' => $c['valor'] === null ? null : (float) $c['valor'],
        'exigeSeguranca' => $exigeSeg,
        'parecer' => ($c['parecer_seg'] ?? null) ? ['situacao' => $c['parecer_seg'], 'texto' => $c['parecer_texto'], 'por' => $nome($c['parecer_por']), 'em' => $c['parecer_em']] : null,
        'aprovado' => ($c['aprovado_por'] ?? null) ? ['por' => $nome($c['aprovado_por']), 'em' => $c['aprovado_em'], 'nivel' => $c['aprovado_nivel'], 'nivelNome' => CH_NIVEL_NOME[$c['aprovado_nivel']] ?? $c['aprovado_nivel'], 'valor' => $c['aprovado_valor'] === null ? null : (float) $c['aprovado_valor']] : null,
        'podeAprovar' => $aguardando && $segOk && ch_nivel_de($u) >= CH_NIVEIS[$nivel],
        'podeReprovar' => $aguardando && ch_nivel_de($u) >= 1,
        'podeParecer' => $aguardando && $exigeSeg && tem_perfil($u, 'seguranca'),
        'alcadas' => ch_alcadas($tid),
    ];
}
/* trava: chamado só passa para Aprovado/Em Andamento/Concluído depois de aprovado pela alçada */
function ch_conferir_passagem($statusNovo, $c) {
    if ((CH_STATUS[$statusNovo] ?? '') !== 'ganho') return;
    if (!empty($c['aprovado_por'])) return;
    erro('Este chamado ainda não foi aprovado. Use o quadro "Aprovação" (Coordenação até o valor da alçada, depois Gestão e Procurador).', 409, 'SEM_APROVACAO');
}

const CH_CAMPOS_VALOR = ['valor', 'recebido', 'custo', 'rt', 'imposto', 'notaFiscal'];
const CH_AGUARDANDO = 'Aguardando aprovação';
const CH_VENCENDO_DIAS = 3;   /* "vencendo" = faltam 3 dias ou menos */

function ch_ve_valores($u) { return ve_valores($u); }   /* v1.22.0: admin, comercial e financeiro */

function ch_data($v, $rotulo, $obrigatoria = false) {
    $v = trim((string) ($v ?? ''));
    if ($v === '') { if ($obrigatoria) erro("Informe $rotulo."); return null; }
    $d = DateTime::createFromFormat('Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) erro("Data inválida em $rotulo.");
    return $v;
}
function ch_dinheiro($v, $rotulo) {
    if ($v === null || $v === '') return null;
    if (is_string($v)) {
        $v = str_replace(['R$', ' '], '', trim($v));
        if (strpos($v, ',') !== false) $v = str_replace(',', '.', str_replace('.', '', $v));   // 1.234,56
        elseif (preg_match('/^\d{1,3}(\.\d{3})+$/', $v)) $v = str_replace('.', '', $v);         // 1.500
    }
    if (!is_numeric($v) || $v < 0 || $v > 99999999) erro("Valor inválido em $rotulo.");
    return round(0 + $v, 2);
}

function chamado_publico($c, $u) {
    $out = [
        'id'           => (int) $c['id'],
        'numero'       => (int) $c['numero'],
        'clienteId'    => (int) $c['cliente_id'],
        'clienteNome'  => $c['cliente_nome'] ?? null,
        'clienteNumero'=> isset($c['cliente_numero']) ? (int) $c['cliente_numero'] : null,
        'clienteTelefone' => $c['cliente_telefone'] ?? null,   /* v1.19.0: WhatsApp › Conversar */
        'clienteContato'  => $c['cliente_contato'] ?? null,
        'comQuemFalar' => $c['com_quem_falar'],
        'status'       => $c['status'],
        'categoria'    => CH_STATUS[$c['status']] ?? 'aberto',
        'tipoServico'  => $c['tipo_servico'],
        'origem'       => $c['origem'],
        'necessidade'  => $c['necessidade'],
        'abertoEm'     => $c['aberto_em'],
        'fechadoEm'    => $c['fechado_em'],
        'andamento'    => (int) $c['andamento'],
        'obs'          => $c['obs'],
        'responsavelId'=> $c['responsavel_id'] !== null ? (int) $c['responsavel_id'] : null,
        'responsavelNome' => $c['responsavel_nome'] ?? null,
        'atualizadoEm' => $c['atualizado_em'],
        'osQtd'        => isset($c['os_qtd']) ? (int) $c['os_qtd'] : 0,
        'proximoRetorno' => $c['proximo_retorno'] ?? null,
        'proposta'     => null,
    ];
    /* v1.14.0: validade da proposta enviada */
    $out['aprovacao'] = ch_aprovacao($c, $u, (int) $c['tenant_id']);   /* CCB v2 */
    if ($c['status'] === CH_AGUARDANDO && !empty($c['orc_enviado_em'])) {
        $dias = (int) ($c['orc_validade'] ?: 15);
        $vence = date('Y-m-d', strtotime(substr($c['orc_enviado_em'], 0, 10) . ' +' . $dias . ' days'));
        $resta = (int) round((strtotime($vence) - strtotime(date('Y-m-d'))) / 86400);
        $out['proposta'] = ['enviadaEm' => $c['orc_enviado_em'], 'validadeDias' => $dias, 'venceEm' => $vence, 'diasRestantes' => $resta,
                            'situacao' => $resta < 0 ? 'vencida' : ($resta <= CH_VENCENDO_DIAS ? 'vencendo' : 'valida')];
    }
    if (ch_ve_valores($u)) {
        $out['notaFiscal'] = (int) $c['nota_fiscal'] === 1;
        foreach (['valor', 'recebido', 'custo', 'rt', 'imposto'] as $k) $out[$k] = $c[$k] === null ? null : (float) $c[$k];
    }
    return $out;
}

const CH_SELECT = "SELECT ch.*, cl.nome AS cliente_nome, cl.numero AS cliente_numero, cl.telefone AS cliente_telefone, cl.contato AS cliente_contato, u.nome AS responsavel_nome,
                          (SELECT COUNT(*) FROM ordens_servico o WHERE o.tenant_id = ch.tenant_id AND o.chamado_id = ch.id AND o.excluido_em IS NULL) AS os_qtd,
                          (SELECT o.enviado_em FROM orcamentos o WHERE o.tenant_id = ch.tenant_id AND o.chamado_id = ch.id AND o.excluido_em IS NULL ORDER BY o.versao DESC LIMIT 1) AS orc_enviado_em,
                          (SELECT o.validade_dias FROM orcamentos o WHERE o.tenant_id = ch.tenant_id AND o.chamado_id = ch.id AND o.excluido_em IS NULL ORDER BY o.versao DESC LIMIT 1) AS orc_validade
                     FROM chamados ch
                     JOIN clientes cl ON cl.tenant_id = ch.tenant_id AND cl.id = ch.cliente_id
                     LEFT JOIN usuarios u ON u.tenant_id = ch.tenant_id AND u.id = ch.responsavel_id";

function chamado_da_empresa($id, $tid) {
    $c = linha(CH_SELECT . " WHERE ch.id = ? AND ch.tenant_id = ? AND ch.excluido_em IS NULL", [$id, $tid]);
    if (!$c) erro('Chamado não encontrado.', 404, 'NAO_ENCONTRADO');
    return $c;
}

/* data de fechamento segue o status: entra num final → hoje (se vazia); sai → limpa */
/* v1.12.0: data em que o chamado virou GANHO (conta no mês do ganho, não da abertura).
   Só grava se a coluna existir (07_rodada_v112.sql); sem ela, o sistema segue como antes. */
function ch_tem_ganho_em() {
    static $tem = null;
    if ($tem === null) { try { q("SELECT ganho_em FROM chamados LIMIT 0"); $tem = true; } catch (Throwable $e) { $tem = false; } }
    return $tem;
}
function ch_ganho_em($statusNovo, $statusAtual, $ganhoAtual) {
    $novoGanho  = (CH_STATUS[$statusNovo] ?? '') === 'ganho';
    $eraGanho   = $statusAtual !== null && (CH_STATUS[$statusAtual] ?? '') === 'ganho';
    if (!$novoGanho) return null;                       // voltou para aberto/perdido: limpa
    if ($eraGanho && $ganhoAtual) return $ganhoAtual;   // continua ganho: mantém a data
    return date('Y-m-d');                               // acabou de ganhar
}

/* v1.14.0: entrou em "Aguardando aprovação" → a proposta conta como enviada hoje (nova validade).
   Ganho → orçamento aprovado; Não Aprovado → recusado. */
function ch_marcar_proposta($chId, $novo, $antigo, $tid) {
    if ($novo === $antigo) return;
    $cat = CH_STATUS[$novo] ?? '';
    if ($novo === CH_AGUARDANDO)
        q("UPDATE orcamentos SET enviado_em = NOW(), status = 'enviado' WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, $chId]);
    elseif ($cat === 'ganho' && (CH_STATUS[$antigo] ?? '') !== 'ganho')
        q("UPDATE orcamentos SET status = 'aprovado', aprovado_em = COALESCE(aprovado_em, NOW()) WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, $chId]);
    elseif ($novo === 'Não Aprovado')
        q("UPDATE orcamentos SET status = 'recusado' WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, $chId]);
}
function ch_acomp_registrar($chId, $tipo, $texto, $retorno, $tid, $uid) {
    try {
        q("INSERT INTO chamado_acompanhamentos (tenant_id, chamado_id, tipo, texto, proximo_retorno, usuario_id) VALUES (?, ?, ?, ?, ?, ?)", [$tid, $chId, $tipo, $texto, $retorno, $uid]);
        return true;
    } catch (Throwable $e) { return false; }   /* SQL 09 ainda não rodado */
}

/* ---------------- v1.18.0: link público da proposta ---------------- */
function prop_url($token) {
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $host = preg_replace('/[^A-Za-z0-9.\-:]/', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
    return ($https ? 'https://' : 'http://') . $host . BASE_PATH . 'p/?t=' . $token;
}
/* o HTML da proposta vem do app (mesmo layout do PDF). Sem scripts nem eventos: a página pública
   ainda o mostra num quadro isolado (sandbox), isto aqui é a segunda trava. */
function prop_limpar_html($html) {
    $html = preg_replace('#<script\b[^>]*>.*?</script\s*>#is', '', $html);
    $html = preg_replace('#<(iframe|object|embed|form|base|meta|link)\b[^>]*>#i', '', $html);
    $html = preg_replace('#\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $html);
    $html = preg_replace('#(href|src)\s*=\s*(["\'])\s*javascript:[^"\']*\2#i', '$1=$2#$2', $html);
    return $html;
}
/* v1.21.0: o link da proposta é FIXO por chamado. Alterar o orçamento atualiza a mesma página (versão nova),
   em vez de criar outro link e travar o antigo. Precisa do SQL 15 (colunas de versão); sem ele, segue sem versão. */
function prop_tem_versao() {
    static $tem = null;
    if ($tem === null) { try { valor("SELECT versao FROM proposta_links LIMIT 0"); $tem = true; } catch (Throwable $e) { $tem = false; } }
    return $tem;
}
function prop_link_atual($chId, $tid) {
    try { return linha("SELECT * FROM proposta_links WHERE tenant_id = ? AND chamado_id = ? ORDER BY id DESC LIMIT 1", [$tid, $chId]); }
    catch (Throwable $e) { return null; }
}
/* grava a proposta no link do chamado: mesmo link (versão +1) se ainda não respondida; senão um link novo
   (os links antigos continuam abrindo e mostram sempre a versão mais nova). Devolve [token, versao, mudou] */
function prop_gravar_link($c, $html, $orc, $tid, $uid) {
    $l = prop_link_atual((int) $c['id'], $tid);
    $temV = prop_tem_versao();
    if ($l && $l['resposta'] === null) {
        $semData = function ($h) { return preg_replace('#Data: \d{2}/\d{2}/\d{4}#', 'Data:', (string) $h); };   /* a data do dia não conta como mudança */
        $mudou = $semData($l['html']) !== $semData($html) || (float) $l['total'] !== (float) $orc['total'];
        if (!$mudou) {
            if ($l['revogado_em'] !== null) q("UPDATE proposta_links SET revogado_em = NULL WHERE id = ?", [$l['id']]);
            return [$l['token'], $temV ? (int) $l['versao'] : 1, false];
        }
        if ($temV) q("UPDATE proposta_links SET html = ?, total = ?, validade_dias = ?, versao = versao + 1, atualizado_em = NOW(), revogado_em = NULL WHERE id = ?",
                     [$html, $orc['total'], (int) ($orc['validade_dias'] ?: 15), $l['id']]);
        else q("UPDATE proposta_links SET html = ?, total = ?, validade_dias = ?, revogado_em = NULL WHERE id = ?", [$html, $orc['total'], (int) ($orc['validade_dias'] ?: 15), $l['id']]);
        return [$l['token'], $temV ? (int) $l['versao'] + 1 : 1, true];
    }
    $tok = bin2hex(random_bytes(16));
    $v = $l && $temV ? (int) $l['versao'] + 1 : 1;
    if ($temV) q("INSERT INTO proposta_links (tenant_id, chamado_id, token, html, total, validade_dias, criado_por, versao, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                 [$tid, $c['id'], $tok, $html, $orc['total'], (int) ($orc['validade_dias'] ?: 15), $uid, $v]);
    else q("INSERT INTO proposta_links (tenant_id, chamado_id, token, html, total, validade_dias, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)",
           [$tid, $c['id'], $tok, $html, $orc['total'], (int) ($orc['validade_dias'] ?: 15), $uid]);
    return [$tok, $v, true];
}

function prop_situacao_publica($l) {
    if (!$l) return null;
    return [
        'versao' => isset($l['versao']) ? (int) $l['versao'] : 1, 'atualizadoEm' => $l['atualizado_em'] ?? null,
        'versaoVista' => isset($l['versao_vista']) && $l['versao_vista'] !== null ? (int) $l['versao_vista'] : null, 'vistaEm' => $l['versao_vista_em'] ?? null,
        'versaoResposta' => isset($l['versao_resposta']) && $l['versao_resposta'] !== null ? (int) $l['versao_resposta'] : null,
        'url' => prop_url($l['token']), 'criadoEm' => $l['criado_em'], 'revogado' => $l['revogado_em'] !== null,
        'visualizacoes' => (int) $l['visualizacoes'], 'primeiraVis' => $l['primeira_vis'], 'ultimaVis' => $l['ultima_vis'],
        'resposta' => $l['resposta'], 'respondidoEm' => $l['respondido_em'], 'respostaNome' => $l['resposta_nome'], 'respostaObs' => $l['resposta_obs'],
        'total' => $l['total'] !== null ? (float) $l['total'] : null,
    ];
}

function ch_fechamento($statusNovo, $fechadoAtual, $fechadoInformado = null) {
    if (!in_array($statusNovo, CH_FINAIS, true)) return null;
    return $fechadoInformado ?: ($fechadoAtual ?: date('Y-m-d'));
}

/* ---------------- orçamento (mesma conta do painel) ----------------
   base = mão de obra + materiais × (1 + margem)        [margem padrão 15%]
   imposto = base × alíquota (se com nota) · RT = base × RT (se ligada)
   total = base + imposto + RT − desconto                                 */
function orc_num($v) {
    if (is_int($v) || is_float($v)) return (float) $v;
    $v = str_replace(['R$', ' '], '', trim((string) $v));
    if ($v === '') return 0.0;
    if (strpos($v, ',') !== false) $v = str_replace(',', '.', str_replace('.', '', $v));
    return is_numeric($v) ? (float) $v : 0.0;
}
function orc_linhas($l, $campos) {
    if (!is_array($l)) return [];
    $out = [];
    foreach (array_slice(array_values(array_filter($l, 'is_array')), 0, 300) as $r) {
        $x = [];
        foreach ($campos as $c) {
            $x[$c] = in_array($c, ['nome', 'tipo', 'un'], true) ? mb_substr(trim((string) ($r[$c] ?? '')), 0, 200) : max(0, min(99999999, orc_num($r[$c] ?? 0)));
        }
        if (isset($x['nome']) && $x['nome'] === '' && empty($x['unit'])) continue;
        if (isset($x['tipo']) && $x['tipo'] === '') continue;
        $out[] = $x;
    }
    return $out;
}
function orc_normalizar($o, $markupPadrao) {
    if (!is_array($o)) $o = [];
    $imp = is_array($o['imposto'] ?? null) ? $o['imposto'] : [];
    $rt  = is_array($o['rt'] ?? null) ? $o['rt'] : [];
    $de  = is_array($o['desconto'] ?? null) ? $o['desconto'] : [];
    $pags = [];
    foreach (array_slice(array_values(array_filter(is_array($o['pagamentos'] ?? null) ? $o['pagamentos'] : [], 'is_array')), 0, 24) as $p) {
        $pags[] = ['descricao' => mb_substr(trim((string) ($p['descricao'] ?? '')), 0, 120), 'pct' => max(0, min(100, orc_num($p['pct'] ?? 0)))];
    }
    return [
        'servicos'   => orc_linhas($o['servicos'] ?? [], ['nome', 'qtd', 'unit']),
        'materiais'  => orc_linhas($o['materiais'] ?? [], ['nome', 'qtd', 'unit', 'un']),
        'maquinas'   => orc_linhas($o['maquinas'] ?? [], ['tipo', 'metros', 'qtd']),
        'imposto'    => ['on' => !empty($imp['on']), 'pct' => max(0, min(100, orc_num($imp['pct'] ?? 0)))],
        'rt'         => ['on' => !empty($rt['on']),  'pct' => max(0, min(100, orc_num($rt['pct'] ?? 0)))],
        'desconto'   => ['tipo' => ($de['tipo'] ?? '') === 'pct' ? 'pct' : 'valor', 'valor' => max(0, orc_num($de['valor'] ?? 0))],
        'pagamentos' => $pags,
        'markup'     => isset($o['markup']) && $o['markup'] !== '' ? max(0, min(999, orc_num($o['markup']))) : $markupPadrao,
    ];
}
function orc_totais($o) {
    $soma = function ($l) { $t = 0; foreach ($l as $r) $t += $r['qtd'] * $r['unit']; return $t; };
    $mdo = $soma($o['servicos']);
    $mat = $soma($o['materiais']) * (1 + $o['markup'] / 100);
    $base = $mdo + $mat;
    $imposto = $o['imposto']['on'] ? $base * $o['imposto']['pct'] / 100 : 0;
    $rt = $o['rt']['on'] ? $base * $o['rt']['pct'] / 100 : 0;
    $sub = $base + $imposto + $rt;
    $desc = $o['desconto']['tipo'] === 'pct' ? $sub * $o['desconto']['valor'] / 100 : $o['desconto']['valor'];
    return ['mdo' => round($mdo, 2), 'materiais' => round($mat, 2), 'base' => round($base, 2), 'imposto' => round($imposto, 2),
            'rt' => round($rt, 2), 'desconto' => round(min($desc, $sub), 2), 'total' => round(max(0, $sub - $desc), 2),
            'temItens' => count($o['servicos']) > 0 || count($o['materiais']) > 0];
}
function orc_markup($tid) {
    $m = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'markup_materiais'", [$tid]);
    return ($m === false || $m === null || $m === '') ? 15.0 : (float) $m;
}
function orc_do_chamado($chamadoId, $tid) {
    $r = linha("SELECT itens FROM orcamentos WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, $chamadoId]);
    $o = $r ? json_decode((string) $r['itens'], true) : null;
    return is_array($o) ? $o : null;
}
function orc_gravar($chamadoId, $o, $t, $tid, $uid) {
    $validade = (int) (valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'validade_orcamento'", [$tid]) ?: 15);
    $campos = [$o['imposto']['pct'], $o['rt']['pct'], $o['imposto']['on'] ? 1 : 0, $t['mdo'], $t['materiais'], $t['total'],
               json_encode($o, JSON_UNESCAPED_UNICODE), $validade];
    $id = valor("SELECT id FROM orcamentos WHERE tenant_id = ? AND chamado_id = ? AND versao = 1", [$tid, $chamadoId]);
    if ($id) {
        q("UPDATE orcamentos SET aliquota = ?, rt_pct = ?, com_nota = ?, subtotal_servicos = ?, subtotal_materiais = ?, total = ?, itens = ?, validade_dias = ?, excluido_em = NULL
            WHERE id = ? AND tenant_id = ?", array_merge($campos, [$id, $tid]));
    } else {
        q("INSERT INTO orcamentos (aliquota, rt_pct, com_nota, subtotal_servicos, subtotal_materiais, total, itens, validade_dias, tenant_id, chamado_id, versao, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)", array_merge($campos, [$tid, $chamadoId, $uid]));
    }
}

return [

    /* listas para os filtros e formulários */
    'opcoes' => function ($d) {
        exigir_perfil('admin', 'coord');
        return [
            'status'  => array_map(function ($s, $c) { return ['nome' => $s, 'categoria' => $c]; }, array_keys(CH_STATUS), CH_STATUS),
            'tipos'   => array_map(function ($t) { return $t['nome']; }, ch_tipos(tenant())),
            'tiposSeguranca' => array_values(array_map(function ($t) { return $t['nome']; }, array_filter(ch_tipos(tenant()), function ($t) { return !empty($t['seguranca']); }))),
            'origens' => CH_ORIGENS,
            'alcadas' => ch_alcadas(tenant()),
            'responsaveis' => array_map(function ($r) { return ['id' => (int) $r['id'], 'nome' => $r['nome']]; },
                linhas("SELECT id, nome FROM usuarios WHERE tenant_id = ? AND excluido_em IS NULL AND status = 'ativo'
                          AND perfil IN ('admin','coord','tecnico','comercial') ORDER BY nome", [tenant()])),
        ];
    },

    /* {busca?, status?, categoria?, tipo?, clienteId?, ordem?, pagina?} */
    'listar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $where = "ch.tenant_id = ? AND ch.excluido_em IS NULL";
        $par = [$tid];

        $status = (string) ($d['status'] ?? '');
        if ($status !== '' && isset(CH_STATUS[$status])) { $where .= " AND ch.status = ?"; $par[] = $status; }
        elseif (!empty($d['ativos'])) {
            $where .= " AND ch.status NOT IN (" . implode(',', array_fill(0, count(CH_FINAIS), '?')) . ")";
            $par = array_merge($par, CH_FINAIS);
        }
        $cat = (string) ($d['categoria'] ?? '');
        if (in_array($cat, ['aberto', 'ganho', 'perdido'], true)) {
            $lista = array_keys(array_filter(CH_STATUS, function ($c) use ($cat) { return $c === $cat; }));
            $where .= " AND ch.status IN (" . implode(',', array_fill(0, count($lista), '?')) . ")";
            $par = array_merge($par, $lista);
        }
        $tipo = txt($d['tipo'] ?? '', 60);
        if ($tipo !== '') { $where .= " AND ch.tipo_servico = ?"; $par[] = $tipo; }
        /* v1.14.0: propostas vencendo / vencidas / com retorno marcado até hoje */
        $sqlVence = "(SELECT DATEDIFF(DATE_ADD(DATE(o.enviado_em), INTERVAL o.validade_dias DAY), CURDATE()) FROM orcamentos o
                       WHERE o.tenant_id = ch.tenant_id AND o.chamado_id = ch.id AND o.excluido_em IS NULL AND o.enviado_em IS NOT NULL ORDER BY o.versao DESC LIMIT 1)";
        $val = (string) ($d['validade'] ?? '');
        if ($val === 'vencendo') { $where .= " AND ch.status = ? AND $sqlVence BETWEEN 0 AND " . CH_VENCENDO_DIAS; $par[] = CH_AGUARDANDO; }
        elseif ($val === 'vencidas') { $where .= " AND ch.status = ? AND $sqlVence < 0"; $par[] = CH_AGUARDANDO; }
        elseif ($val === 'retorno') { $where .= " AND ch.proximo_retorno IS NOT NULL AND ch.proximo_retorno <= CURDATE() AND ch.status NOT IN ('Concluído','Não Aprovado')"; }
        $cli = (int) ($d['clienteId'] ?? 0);
        if ($cli) { $where .= " AND ch.cliente_id = ?"; $par[] = $cli; }

        $busca = txt($d['busca'] ?? '', 100);
        if ($busca !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $busca) . '%';
            $where .= " AND (cl.nome LIKE ? OR ch.com_quem_falar LIKE ? OR ch.necessidade LIKE ? OR ch.obs LIKE ? OR ch.numero = ?)";
            array_push($par, $like, $like, $like, $like, ctype_digit($busca) ? (int) $busca : -1);
        }

        $ordens = ['recentes' => 'ch.numero DESC', 'antigos' => 'ch.numero ASC', 'atualizados' => 'ch.atualizado_em DESC', 'cliente' => 'cl.nome ASC, ch.numero DESC'];
        $ordem = $ordens[$d['ordem'] ?? ''] ?? $ordens['recentes'];

        $from = " FROM chamados ch JOIN clientes cl ON cl.tenant_id = ch.tenant_id AND cl.id = ch.cliente_id ";
        $total  = (int) valor("SELECT COUNT(*) $from WHERE $where", $par);
        $pagina = max(1, (int) ($d['pagina'] ?? 1));

        $rows = linhas(CH_SELECT . " WHERE $where ORDER BY $ordem LIMIT " . CH_POR_PAGINA . " OFFSET " . (int) (($pagina - 1) * CH_POR_PAGINA), $par);

        /* contagem por status (respeita busca/tipo/cliente, ignora o filtro de status) */
        $wCont = "ch.tenant_id = ? AND ch.excluido_em IS NULL"; $pCont = [$tid];
        if ($tipo !== '') { $wCont .= " AND ch.tipo_servico = ?"; $pCont[] = $tipo; }
        if ($cli) { $wCont .= " AND ch.cliente_id = ?"; $pCont[] = $cli; }
        if ($busca !== '') {
            $wCont .= " AND (cl.nome LIKE ? OR ch.com_quem_falar LIKE ? OR ch.necessidade LIKE ? OR ch.obs LIKE ? OR ch.numero = ?)";
            array_push($pCont, $like, $like, $like, $like, ctype_digit($busca) ? (int) $busca : -1);
        }
        $porStatus = [];
        foreach (linhas("SELECT ch.status, COUNT(*) n $from WHERE $wCont GROUP BY ch.status", $pCont) as $r) $porStatus[$r['status']] = (int) $r['n'];

        $propostas = ['vencendo' => 0, 'vencidas' => 0, 'retorno' => 0];
        foreach (linhas("SELECT $sqlVence AS r FROM chamados ch WHERE ch.tenant_id = ? AND ch.excluido_em IS NULL AND ch.status = ?", [$tid, CH_AGUARDANDO]) as $x) {
            if ($x['r'] === null) continue;
            if ((int) $x['r'] < 0) $propostas['vencidas']++; elseif ((int) $x['r'] <= CH_VENCENDO_DIAS) $propostas['vencendo']++;
        }
        try { $propostas['retorno'] = (int) valor("SELECT COUNT(*) FROM chamados WHERE tenant_id = ? AND excluido_em IS NULL AND proximo_retorno IS NOT NULL AND proximo_retorno <= CURDATE() AND status NOT IN ('Concluído','Não Aprovado')", [$tid]); }
        catch (Throwable $e) { /* SQL 09 ainda não rodado */ }
        return ['itens' => array_map(function ($r) use ($u) { return chamado_publico($r, $u); }, $rows),
                'total' => $total, 'pagina' => $pagina, 'porPagina' => CH_POR_PAGINA, 'porStatus' => $porStatus, 'propostas' => $propostas];
    },

    'obter' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = chamado_publico(chamado_da_empresa((int) ($d['id'] ?? 0), $tid), $u);
        if (ch_ve_valores($u)) $c['orcamento'] = orc_do_chamado($c['id'], $tid);
        return $c;
    },

    /* indicadores do topo (valores só para o administrador)
       v1.12.0 — por período {de, ate} (AAAA-MM-DD); sem período = mês atual.
       Cada indicador usa a SUA data:
         oportunidades = aberto_em · ganhos = ganho_em (ou fechamento/abertura se a coluna não existir)
         perdidos = fechado_em (Não Aprovado) · novos clientes = data de criação registrada na auditoria
       "Em aberto" é a foto de agora (não depende do período). Nada é apagado nem zerado. */
    'resumo' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $de  = ch_data($d['de'] ?? '', 'o início do período');
        $ate = ch_data($d['ate'] ?? '', 'o fim do período');
        if (!$de || !$ate) { $de = date('Y-m-01'); $ate = date('Y-m-t'); }
        if ($ate < $de) erro('O fim do período não pode ser antes do início.');
        $dentro = function ($dt) use ($de, $ate) { return $dt && substr($dt, 0, 10) >= $de && substr($dt, 0, 10) <= $ate; };
        $temG = ch_tem_ganho_em();

        $novos = $ganhos = $perdidos = ['n' => 0, 'valor' => 0.0];
        $aReceber = $recebido = $imposto = $rt = 0.0; $ciclo = []; $abertoAgora = 0; $abertoValor = 0.0;
        $cols = "status, valor, recebido, imposto, rt, aberto_em, fechado_em" . ($temG ? ", ganho_em" : "");
        foreach (linhas("SELECT $cols FROM chamados WHERE tenant_id = ? AND excluido_em IS NULL", [$tid]) as $r) {
            $cat = CH_STATUS[$r['status']] ?? 'aberto';
            $v = (float) $r['valor'];
            if ($cat === 'aberto') { $abertoAgora++; $abertoValor += $v; }
            if ($dentro($r['aberto_em'])) { $novos['n']++; $novos['valor'] += $v; }
            if ($cat === 'ganho') {
                $dg = $temG ? ($r['ganho_em'] ?: ($r['fechado_em'] ?: $r['aberto_em'])) : ($r['fechado_em'] ?: $r['aberto_em']);
                if ($dentro($dg)) {
                    $ganhos['n']++; $ganhos['valor'] += $v;
                    $recebido += (float) $r['recebido']; $aReceber += max(0, $v - (float) $r['recebido']);
                    $imposto += (float) $r['imposto']; $rt += (float) $r['rt'];
                }
            }
            if ($cat === 'perdido' && $dentro($r['fechado_em'] ?: $r['aberto_em'])) { $perdidos['n']++; $perdidos['valor'] += $v; }
            if ($r['fechado_em'] && $r['aberto_em'] && $dentro($r['fechado_em'])) $ciclo[] = max(0, (strtotime($r['fechado_em']) - strtotime($r['aberto_em'])) / 86400);
        }
        /* novos clientes: só os criados de verdade (tela ou formulário público) — importações e migrações não contam */
        $novosClientes = (int) valor("SELECT COUNT(DISTINCT a.registro_id) FROM auditoria a
                                        JOIN clientes c ON c.tenant_id = a.tenant_id AND c.id = a.registro_id AND c.excluido_em IS NULL
                                       WHERE a.tenant_id = ? AND a.tabela = 'clientes' AND a.acao IN ('cliente_criar','cliente_criar_formulario')
                                         AND a.criado_em >= ? AND a.criado_em < DATE_ADD(?, INTERVAL 1 DAY)", [$tid, $de, $ate]);
        $decididas = $ganhos['n'] + $perdidos['n'];
        $out = ['de' => $de, 'ate' => $ate, 'ganhoExato' => $temG,
                'novos' => $novos['n'], 'ganho' => $ganhos['n'], 'perdido' => $perdidos['n'], 'aberto' => $abertoAgora,
                'novosClientes' => $novosClientes,
                'conversao' => $decididas ? round($ganhos['n'] / $decididas * 100, 1) : 0,
                'cicloMedio' => $ciclo ? (int) round(array_sum($ciclo) / count($ciclo)) : null];
        if (ch_ve_valores($u)) {
            $out += ['novosValor' => round($novos['valor'], 2), 'ganhoValor' => round($ganhos['valor'], 2), 'perdidoValor' => round($perdidos['valor'], 2),
                     'abertoValor' => round($abertoValor, 2), 'aReceber' => round($aReceber, 2), 'recebido' => round($recebido, 2),
                     'imposto' => round($imposto, 2), 'rt' => round($rt, 2), 'liquido' => round($ganhos['valor'] - $imposto - $rt, 2),
                     /* nomes antigos, para telas que ainda os usem */
                     'carteira' => round($ganhos['valor'], 2), 'pctRecebido' => $ganhos['valor'] > 0 ? round($recebido / $ganhos['valor'] * 100, 1) : 0];
        }
        return $out;
    },

    /* cria (sem id) ou edita (com id). Coordenação não altera valores. */
    'salvar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);

        $cliId = (int) ($d['clienteId'] ?? 0);
        $cli = $cliId ? linha("SELECT id, origem FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$cliId, $tid]) : null;
        if (!$cli) erro('Escolha a Casa de Oração do chamado.');

        $status = (string) ($d['status'] ?? 'Falta orçamento');
        if (!isset(CH_STATUS[$status])) erro('Status inválido.');
        $respId = (int) ($d['responsavelId'] ?? 0) ?: null;
        if ($respId && !valor("SELECT id FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$respId, $tid])) $respId = null;

        $abertoEm = ch_data($d['abertoEm'] ?? '', 'a data de abertura') ?: date('Y-m-d');
        $fechInf  = ch_data($d['fechadoEm'] ?? '', 'a data de fechamento');
        if ($fechInf && $fechInf < $abertoEm) erro('A data de fechamento não pode ser antes da abertura.');

        $campos = [
            'cliente_id'     => $cliId,
            'com_quem_falar' => txt_ou_null($d['comQuemFalar'] ?? '', 150),
            'status'         => $status,
            'tipo_servico'   => txt_ou_null($d['tipoServico'] ?? '', 60),
            'origem'         => txt_ou_null($d['origem'] ?? '', 60),
            'necessidade'    => txt_ou_null($d['necessidade'] ?? '', 5000),
            'aberto_em'      => $abertoEm,
            'andamento'      => max(0, min(100, (int) ($d['andamento'] ?? 0))),
            'obs'            => txt_ou_null($d['obs'] ?? '', 5000),
            'responsavel_id' => $respId,
        ];
        $orc = null; $tot = null;
        if (ch_ve_valores($u)) {
            $campos['recebido'] = ch_dinheiro($d['recebido'] ?? null, 'recebido') ?? 0;
            $campos['custo']    = ch_dinheiro($d['custo'] ?? null, 'custo');
            if (is_array($d['orcamento'] ?? null)) {
                /* igual ao painel: com nota = imposto ligado; havendo itens, valor/imposto/RT vêm do orçamento (conta feita aqui no servidor) */
                $orc = orc_normalizar($d['orcamento'], orc_markup($tid));
                $tot = orc_totais($orc);
                $campos['nota_fiscal'] = $orc['imposto']['on'] ? 1 : 0;
                if ($tot['temItens']) {
                    $campos['valor']   = $tot['total'];
                    $campos['imposto'] = $orc['imposto']['on'] ? $tot['imposto'] : null;
                    $campos['rt']      = $orc['rt']['on'] ? $tot['rt'] : null;
                } else {
                    $campos['valor'] = ch_dinheiro($d['valor'] ?? null, 'valor');
                }
            } else {
                $campos['nota_fiscal'] = !empty($d['notaFiscal']) ? 1 : 0;
                $campos['valor'] = ch_dinheiro($d['valor'] ?? null, 'valor');
            }
        }

        if ($id) {
            $atual = chamado_da_empresa($id, $tid);
            /* CCB v2: aprovação por alçada */
            if ($status !== $atual['status']) ch_conferir_passagem($status, $atual);
            if ((CH_STATUS[$status] ?? '') === 'aberto' && !empty($atual['aprovado_por'])) {
                $campos += ['aprovado_por' => null, 'aprovado_em' => null, 'aprovado_nivel' => null, 'aprovado_valor' => null];
            } elseif (!empty($atual['aprovado_por']) && array_key_exists('valor', $campos)
                      && CH_NIVEIS[ch_nivel_exigido($tid, $campos['valor'])] > (CH_NIVEIS[$atual['aprovado_nivel']] ?? 0)) {
                /* o valor subiu para uma alçada maior que a que aprovou: volta para aprovação */
                $campos += ['aprovado_por' => null, 'aprovado_em' => null, 'aprovado_nivel' => null, 'aprovado_valor' => null];
                $status = $campos['status'] = CH_AGUARDANDO;
                ch_acomp_registrar($id, 'aprovacao', 'O valor passou da alçada que aprovou (' . (CH_NIVEL_NOME[$atual['aprovado_nivel']] ?? '') . '). Voltou para aprovação.', null, $tid, (int) $u['id']);
            }
            $campos['fechado_em'] = ch_fechamento($status, $atual['fechado_em'], $fechInf);
            if (ch_tem_ganho_em()) $campos['ganho_em'] = ch_ganho_em($status, $atual['status'], $atual['ganho_em'] ?? null);
            $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
            db()->beginTransaction();
            q("UPDATE chamados SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [$id, $tid]));
            /* v1.26.1: trocou o cliente do chamado → as OS que estavam no cliente antigo vão junto.
               OS colocada de propósito em outro cliente (ex.: filial) fica como está. */
            if ((int) $atual['cliente_id'] !== $cliId) {
                $novoNome = valor("SELECT nome FROM clientes WHERE id = ? AND tenant_id = ?", [$cliId, $tid]);
                $velhoNome = valor("SELECT nome FROM clientes WHERE id = ? AND tenant_id = ?", [(int) $atual['cliente_id'], $tid]);
                foreach (linhas("SELECT id FROM ordens_servico WHERE tenant_id = ? AND chamado_id = ? AND cliente_id = ? AND excluido_em IS NULL", [$tid, $id, (int) $atual['cliente_id']]) as $os) {
                    q("UPDATE ordens_servico SET cliente_id = ? WHERE id = ? AND tenant_id = ?", [$cliId, (int) $os['id'], $tid]);
                    q("INSERT INTO os_eventos (tenant_id, os_id, tipo, texto, usuario_id) VALUES (?, ?, 'historico', ?, ?)",
                      [$tid, (int) $os['id'], 'Cliente alterado junto com o chamado ' . $atual['numero'] . ': ' . $velhoNome . ' → ' . $novoNome . '.', (int) $u['id']]);
                }
            }
            if ($orc && ($tot['temItens'] || $orc['maquinas'])) orc_gravar($id, $orc, $tot, $tid, (int) $u['id']);
            ch_marcar_proposta($id, $status, $atual['status'], $tid);
            db()->commit();
            auditar('chamado_editar', 'chamados', $id, $atual['numero'] . ($atual['status'] !== $status ? ' ' . $atual['status'] . ' → ' . $status : ''));
        } else {
            ch_conferir_passagem($status, []);   /* CCB v2: chamado novo nunca nasce aprovado */
            $campos['fechado_em'] = ch_fechamento($status, null, $fechInf);
            if (ch_tem_ganho_em()) $campos['ganho_em'] = ch_ganho_em($status, null, null);
            db()->beginTransaction();
            $campos['tenant_id']  = $tid;
            $campos['numero']     = numero_livre('chamado', 'chamados', $tid);
            $campos['criado_por'] = (int) $u['id'];
            $cols = implode(', ', array_keys($campos));
            q("INSERT INTO chamados ($cols) VALUES (" . implode(', ', array_fill(0, count($campos), '?')) . ")", array_values($campos));
            $id = (int) db()->lastInsertId();
            if ($orc && ($tot['temItens'] || $orc['maquinas'])) orc_gravar($id, $orc, $tot, $tid, (int) $u['id']);
            ch_marcar_proposta($id, $status, null, $tid);
            /* v1.19.0: chamado aberto para o cliente conclui a tarefa "fazer orçamento" do link de cadastro */
            q("UPDATE tarefas SET status = 'feita', feita_em = NOW(), chamado_id = ? WHERE tenant_id = ? AND cliente_id = ? AND tipo = 'orcamento_cadastro'
                 AND status IN ('aberta','andamento','aguardando') AND excluido_em IS NULL", [$id, $tid, (int) $campos['cliente_id']]);
            db()->commit();
            auditar('chamado_criar', 'chamados', $id, (string) $campos['numero']);
        }
        $c = chamado_publico(chamado_da_empresa($id, $tid), $u);
        if (ch_ve_valores($u)) {
            $c['orcamento'] = orc_do_chamado($id, $tid);
            $l = prop_link_atual($id, $tid);   /* v1.21.0: o app atualiza a página do link logo depois de salvar */
            $c['linkAberto'] = $l && $l['resposta'] === null;
        }
        return $c;
    },

    /* troca rápida de status (lista/kanban) */
    'mudar_status' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = chamado_da_empresa((int) ($d['id'] ?? 0), $tid);
        $status = (string) ($d['status'] ?? '');
        if (!isset(CH_STATUS[$status])) erro('Status inválido.');
        if ($status !== $c['status']) {
            ch_conferir_passagem($status, $c);   /* CCB v2 */
            q("UPDATE chamados SET status = ?, fechado_em = ? WHERE id = ? AND tenant_id = ?",
              [$status, ch_fechamento($status, $c['fechado_em']), $c['id'], $tid]);
            if ((CH_STATUS[$status] ?? '') === 'aberto')
                q("UPDATE chamados SET aprovado_por = NULL, aprovado_em = NULL, aprovado_nivel = NULL, aprovado_valor = NULL WHERE id = ? AND tenant_id = ?", [$c['id'], $tid]);
            if (ch_tem_ganho_em())
                q("UPDATE chamados SET ganho_em = ? WHERE id = ? AND tenant_id = ?", [ch_ganho_em($status, $c['status'], $c['ganho_em'] ?? null), $c['id'], $tid]);
            ch_marcar_proposta((int) $c['id'], $status, $c['status'], $tid);
            auditar('chamado_status', 'chamados', (int) $c['id'], $c['numero'] . ' ' . $c['status'] . ' → ' . $status);
        }
        return chamado_publico(chamado_da_empresa((int) $c['id'], $tid), $u);
    },

    /* CCB v2 — {id, acao: aprovar|reprovar|parecer, situacao?: favoravel|desfavoravel, texto?}
       aprovar: alçada da pessoa ≥ exigida pelo valor e, se o tipo pede, parecer favorável da Segurança do Trabalho.
       reprovar: qualquer alçada, com o motivo. parecer: perfil Segurança do Trabalho. */
    'aprovacao' => function ($d) {
        $u = exigir_perfil('coord', 'gestao', 'procurador', 'seguranca');
        $tid = tenant();
        $c = chamado_da_empresa((int) ($d['id'] ?? 0), $tid);
        $ap = ch_aprovacao($c, $u, $tid);
        $acao = (string) ($d['acao'] ?? '');
        $texto = txt($d['texto'] ?? '', 3000);
        if ($c['status'] !== CH_AGUARDANDO) erro('O chamado precisa estar em "Aguardando aprovação".', 409);
        if ($acao === 'parecer') {
            if (!$ap['podeParecer']) erro('Só a Segurança do Trabalho dá o parecer, e só nos tipos de serviço marcados.', 403, 'SEM_PERMISSAO');
            $sit = (string) ($d['situacao'] ?? '');
            if (!in_array($sit, ['favoravel', 'desfavoravel'], true)) erro('Escolha favorável ou desfavorável.');
            if ($sit === 'desfavoravel' && mb_strlen($texto) < 5) erro('Explique o motivo do parecer desfavorável.');
            q("UPDATE chamados SET parecer_seg = ?, parecer_texto = ?, parecer_por = ?, parecer_em = NOW() WHERE id = ? AND tenant_id = ?", [$sit, $texto ?: null, (int) $u['id'], $c['id'], $tid]);
            ch_acomp_registrar((int) $c['id'], 'parecer', 'Parecer da Segurança do Trabalho: ' . ($sit === 'favoravel' ? 'favorável' : 'desfavorável') . ($texto ? ' — ' . $texto : ''), null, $tid, (int) $u['id']);
            auditar('chamado_parecer', 'chamados', (int) $c['id'], $c['numero'] . ' ' . $sit);
        } elseif ($acao === 'aprovar') {
            if ($ap['exigeSeguranca'] && ($c['parecer_seg'] ?? null) !== 'favoravel') erro('Falta o parecer favorável da Segurança do Trabalho.', 409);
            if (!$ap['podeAprovar']) erro('Este valor precisa da aprovação de: ' . $ap['nivelNome'] . '.', 403, 'SEM_ALCADA');
            q("UPDATE chamados SET status = 'Aprovado', aprovado_por = ?, aprovado_em = NOW(), aprovado_nivel = ?, aprovado_valor = valor, fechado_em = ? WHERE id = ? AND tenant_id = ?",
              [(int) $u['id'], $ap['nivelExigido'], ch_fechamento('Aprovado', $c['fechado_em']), $c['id'], $tid]);
            if (ch_tem_ganho_em()) q("UPDATE chamados SET ganho_em = ? WHERE id = ? AND tenant_id = ?", [ch_ganho_em('Aprovado', $c['status'], $c['ganho_em'] ?? null), $c['id'], $tid]);
            ch_marcar_proposta((int) $c['id'], 'Aprovado', $c['status'], $tid);
            ch_acomp_registrar((int) $c['id'], 'aprovacao', 'Aprovado (' . $ap['nivelNome'] . ')' . ($c['valor'] !== null ? ' — R$ ' . number_format((float) $c['valor'], 2, ',', '.') : '') . ($texto ? ' — ' . $texto : ''), null, $tid, (int) $u['id']);
            auditar('chamado_aprovar', 'chamados', (int) $c['id'], $c['numero'] . ' ' . $ap['nivelExigido']);
        } elseif ($acao === 'reprovar') {
            if (!$ap['podeReprovar']) erro('Você não tem alçada para decidir este chamado.', 403, 'SEM_ALCADA');
            if (mb_strlen($texto) < 5) erro('Escreva o motivo de não aprovar.');
            q("UPDATE chamados SET status = 'Não Aprovado', fechado_em = ? WHERE id = ? AND tenant_id = ?", [ch_fechamento('Não Aprovado', $c['fechado_em']), $c['id'], $tid]);
            ch_marcar_proposta((int) $c['id'], 'Não Aprovado', $c['status'], $tid);
            ch_acomp_registrar((int) $c['id'], 'aprovacao', 'Não aprovado — ' . $texto, null, $tid, (int) $u['id']);
            auditar('chamado_reprovar', 'chamados', (int) $c['id'], $c['numero']);
        } else erro('Ação inválida.');
        return chamado_publico(chamado_da_empresa((int) $c['id'], $tid), $u);
    },

    'excluir' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $c = chamado_da_empresa((int) ($d['id'] ?? 0), $tid);
        q("UPDATE chamados SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$c['id'], $tid]);
        auditar('chamado_excluir', 'chamados', (int) $c['id'], $c['numero'] . ' ' . $c['cliente_nome']);
        return ['id' => (int) $c['id']];
    },

    /* ---------------- v1.14.0: acompanhamento da proposta ---------------- */

    /* {id} → histórico de contatos/renovações */
    'acomp.listar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = chamado_da_empresa((int) ($d['id'] ?? 0), $tid);
        try {
            $l = linhas("SELECT a.*, u.nome AS usuario_nome FROM chamado_acompanhamentos a LEFT JOIN usuarios u ON u.tenant_id = a.tenant_id AND u.id = a.usuario_id
                          WHERE a.tenant_id = ? AND a.chamado_id = ? ORDER BY a.criado_em DESC, a.id DESC LIMIT 100", [$tid, $c['id']]);
        } catch (Throwable $e) { return ['itens' => [], 'semTabela' => true]; }
        return ['itens' => array_map(function ($a) { return ['id' => (int) $a['id'], 'tipo' => $a['tipo'], 'texto' => $a['texto'], 'proximoRetorno' => $a['proximo_retorno'],
                                                            'usuarioNome' => $a['usuario_nome'], 'criadoEm' => $a['criado_em']]; }, $l)];
    },

    /* {id, texto, proximoRetorno?} — registra o contato e marca (ou limpa) o próximo retorno */
    'acomp.criar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = chamado_da_empresa((int) ($d['id'] ?? 0), $tid);
        $texto = txt($d['texto'] ?? '', 3000);
        $ret = ch_data($d['proximoRetorno'] ?? '', 'próximo retorno');
        if ($texto === '' && !$ret) erro('Escreva o que foi conversado ou marque a data do próximo retorno.');
        if (!ch_acomp_registrar((int) $c['id'], 'contato', $texto ?: null, $ret, $tid, (int) $u['id'])) erro('Rode antes o SQL 09 da versão 1.14.0.');
        q("UPDATE chamados SET proximo_retorno = ? WHERE id = ? AND tenant_id = ?", [$ret, $c['id'], $tid]);
        auditar('chamado_acomp', 'chamados', (int) $c['id'], $c['numero'] . ($ret ? ' retorno ' . $ret : ''));
        return chamado_publico(chamado_da_empresa((int) $c['id'], $tid), $u);
    },

    /* v1.18.0 · v1.21.0 — {id, html} → grava a proposta como está agora e devolve o link público.
       O link é o MESMO a cada reenvio (versão nova); só nasce outro depois que o cliente respondeu,
       e mesmo assim os antigos abrem a versão mais nova.
       Chamado em "Falta enviar orçamento" passa para "Aguardando aprovação" (conta a validade). */
    'proposta.enviar' => function ($d) {
        $u = exigir_perfil('admin');
        $tid = tenant();
        $c = chamado_da_empresa((int) ($d['id'] ?? 0), $tid);
        /* v1.18.0: pode reenviar em qualquer status (o link mostra a situação; só aprova se estiver em aberto) */
        $orc = linha("SELECT total, validade_dias FROM orcamentos WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, $c['id']]);
        if (!$orc || !orc_do_chamado((int) $c['id'], $tid)) erro('Salve o orçamento do chamado antes de enviar.');
        $html = (string) ($d['html'] ?? '');
        if (strlen($html) < 200 || stripos($html, '<html') === false) erro('Não foi possível montar a proposta. Atualize a página e tente de novo.');
        if (strlen($html) > 3000000) erro('A proposta ficou grande demais para o link.');
        $html = prop_limpar_html($html);
        try { valor("SELECT 1 FROM proposta_links LIMIT 0"); } catch (Throwable $e) { erro('Rode antes o SQL 12_propostas_link.sql da versão 1.18.0.'); }
        db()->beginTransaction();
        [$tok, $versao, $mudou] = prop_gravar_link($c, $html, $orc, $tid, (int) $u['id']);
        if ($c['status'] === 'Falta orçamento') {
            q("UPDATE chamados SET status = ? WHERE id = ? AND tenant_id = ?", [CH_AGUARDANDO, $c['id'], $tid]);
            ch_marcar_proposta((int) $c['id'], CH_AGUARDANDO, $c['status'], $tid);
        } elseif ($c['status'] === CH_AGUARDANDO) {
            q("UPDATE orcamentos SET enviado_em = COALESCE(enviado_em, NOW()), status = 'enviado' WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, $c['id']]);
        }
        ch_acomp_registrar((int) $c['id'], 'envio', 'Proposta enviada por link' . (!empty($d['canal']) ? ' (' . txt($d['canal'], 30) . ')' : '') . ($versao > 1 ? ' · versão ' . $versao : '') . '.', null, $tid, (int) $u['id']);
        db()->commit();
        auditar('proposta_enviar', 'chamados', (int) $c['id'], (string) $c['numero'] . ' v' . $versao);
        $cli = linha("SELECT telefone, contato FROM clientes WHERE id = ? AND tenant_id = ?", [$c['cliente_id'], $tid]);
        return ['chamado' => chamado_publico(chamado_da_empresa((int) $c['id'], $tid), $u),
                'link' => prop_situacao_publica(linha("SELECT * FROM proposta_links WHERE token = ?", [$tok])),
                'telefone' => $cli['telefone'] ?? null, 'contato' => $c['com_quem_falar'] ?: ($cli['contato'] ?? null)];
    },

    /* v1.21.0 — {id, html} → depois de salvar o chamado: se já existe link enviado e o cliente ainda não respondeu,
       a mesma página passa a mostrar a proposta nova (versão +1). Não muda status nem conta como envio. */
    'proposta.atualizar' => function ($d) {
        $u = exigir_perfil('admin');
        $tid = tenant();
        $c = chamado_da_empresa((int) ($d['id'] ?? 0), $tid);
        $l = prop_link_atual((int) $c['id'], $tid);
        if (!$l || $l['resposta'] !== null) return ['atualizado' => false];
        $orc = linha("SELECT total, validade_dias FROM orcamentos WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, $c['id']]);
        if (!$orc) return ['atualizado' => false];
        $html = (string) ($d['html'] ?? '');
        if (strlen($html) < 200 || stripos($html, '<html') === false || strlen($html) > 3000000) erro('Não foi possível atualizar a proposta do link.');
        $html = prop_limpar_html($html);
        [$tok, $versao, $mudou] = prop_gravar_link($c, $html, $orc, $tid, (int) $u['id']);
        if ($mudou) {
            ch_acomp_registrar((int) $c['id'], 'envio', 'Proposta do link atualizada · versão ' . $versao . ' (o cliente vê a nova no mesmo link).', null, $tid, (int) $u['id']);
            auditar('proposta_atualizar', 'chamados', (int) $c['id'], (string) $c['numero'] . ' v' . $versao);
        }
        return ['atualizado' => $mudou, 'versao' => $versao, 'link' => prop_situacao_publica(linha("SELECT * FROM proposta_links WHERE token = ?", [$tok]))];
    },

    /* v1.18.0 — {id} → situação do último link (visualizações e resposta do cliente) */
    'proposta.status' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = chamado_da_empresa((int) ($d['id'] ?? 0), $tid);
        try {
            $l = linha("SELECT * FROM proposta_links WHERE tenant_id = ? AND chamado_id = ? ORDER BY id DESC LIMIT 1", [$tid, $c['id']]);
            $n = (int) valor("SELECT COUNT(*) FROM proposta_links WHERE tenant_id = ? AND chamado_id = ?", [$tid, $c['id']]);
        } catch (Throwable $e) { return ['link' => null, 'envios' => 0, 'semTabela' => true]; }
        return ['link' => prop_situacao_publica($l), 'envios' => $n];
    },

    /* {id} — a proposta volta a valer pelos dias da validade, contando de hoje */
    'renovar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $c = chamado_da_empresa((int) ($d['id'] ?? 0), $tid);
        if ($c['status'] !== CH_AGUARDANDO) erro('Só dá para renovar proposta em "Aguardando aprovação".');
        $n = q("UPDATE orcamentos SET enviado_em = NOW(), status = 'enviado' WHERE tenant_id = ? AND chamado_id = ? AND excluido_em IS NULL ORDER BY versao DESC LIMIT 1", [$tid, $c['id']])->rowCount();
        if (!$n) erro('Este chamado não tem orçamento salvo.');
        $dias = (int) ($c['orc_validade'] ?: 15);
        ch_acomp_registrar((int) $c['id'], 'renovacao', 'Validade renovada por ' . $dias . ' dias.', null, $tid, (int) $u['id']);
        auditar('chamado_renovar', 'chamados', (int) $c['id'], (string) $c['numero']);
        return chamado_publico(chamado_da_empresa((int) $c['id'], $tid), $u);
    },
];
