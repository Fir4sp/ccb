<?php
/* =====================================================================
   SGClim — api/assinatura.php  (v1.30.0)
   Configurações › Assinatura da empresa: ver situação, escolher plano,
   assinar (Asaas), mudar plano/usuários, cancelar e pagar a fatura.
   Só o administrador da empresa mexe; "estado" qualquer usuário consulta.
   v1.33.0: cobrança mensal só por Pix (regras formaPagamento/permiteAnual);
   ação pix devolve o QR Code e o copia e cola da fatura em aberto.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

function assin_tela($tid) {
    $tid = (int) $tid;
    $a = assinatura_linha($tid);
    $e = assinatura_estado($tid, true);
    $planos = array_map('plano_publico', linhas("SELECT * FROM planos WHERE ativo = 1 ORDER BY ordem, preco_mensal"));
    $cob = [];
    foreach (linhas("SELECT * FROM assinatura_cobrancas WHERE tenant_id = ? AND status <> 'DELETED' ORDER BY vencimento DESC LIMIT 24", [$tid]) as $c)
        $cob[] = ['id' => $c['id'], 'vencimento' => $c['vencimento'], 'valor' => (float) $c['valor'], 'status' => $c['status'],
                  'statusTxt' => asaas_status_txt($c['status']), 'forma' => $c['forma'] ? asaas_forma_txt($c['forma']) : null,
                  'link' => $c['link'], 'pagoEm' => $c['pago_em'],
                  'pago' => in_array($c['status'], ASAAS_PAGOS, true), 'aberta' => in_array($c['status'], ASAAS_ABERTOS, true)];
    $t = linha("SELECT nome, razao_social, cnpj FROM tenants WHERE id = ?", [$tid]);
    $adm = linha("SELECT email, telefone FROM usuarios WHERE tenant_id = ? AND perfil = 'admin' AND status = 'ativo' AND excluido_em IS NULL ORDER BY id LIMIT 1", [$tid]);
    return [
        'estado' => $e,
        'planos' => $planos,
        'cobrancas' => $cob,
        'usuariosAtivos' => usuarios_internos_ativos($tid),
        'regras' => assinatura_regras(),
        'cobrancaConfigurada' => asaas_configurado(),
        'ambiente' => asaas_ambiente(),
        'dadosCobranca' => [
            'nome' => $a['cobranca_nome'] ?? null ?: ($t['razao_social'] ?: $t['nome']),
            'doc' => $a['cobranca_doc'] ?? null ?: $t['cnpj'],
            'email' => $a['cobranca_email'] ?? null ?: ($adm['email'] ?? ''),
            'celular' => $a['cobranca_celular'] ?? null ?: ($adm['telefone'] ?? ''),
        ],
        'sincronizadoEm' => $a['sincronizado_em'] ?? null,
        'vinculo' => assin_vinculo_publico($tid),   /* v1.31.0 */
        'promo' => PRECO_LANCAMENTO && ($pm = promo_linha($tid)) ? ['faturas' => (int) $pm['faturas'], 'encerrado' => (int) $pm['encerrado'] === 1,
                    'pagas' => count(faturas_pagas($tid))] : null,   /* v1.32.0: preço de lançamento da empresa */
    ];
}

/* v1.31.0: cupom em vigor e código já informado (pedido de acesso) */
function assin_vinculo_publico($tid) {
    $v = vinculo_de($tid);
    if (!$v) return ['cupom' => null, 'indicado' => false, 'codigoInformado' => null];
    $k = $v['cupom_id'] ? linha("SELECT * FROM cupons WHERE id = ?", [(int) $v['cupom_id']]) : null;
    return [
        'cupom' => $k ? ['codigo' => $k['codigo'], 'texto' => cupom_texto($k), 'encerrado' => (int) $v['cupom_encerrado'] === 1, 'tipo' => $k['tipo'], 'valor' => (float) $k['valor']] : null,
        'indicado' => !empty($v['indicador_id']),
        'codigoInformado' => $v['codigo_informado'],
    ];
}

/* confere o código digitado ao assinar. Devolve [tipo, linha] ou lança erro. */
function assin_codigo($codigo, $plano, $tid) {
    $codigo = codigo_limpo($codigo);
    if ($codigo === '') return [null, null];
    $r = codigo_resolver($codigo);
    if (!$r) erro('Código "' . $codigo . '" não encontrado. Confira e tente de novo, ou deixe em branco.', 400, 'CODIGO');
    if ($r['tipo'] === 'cupom') {
        /* v1.32.0: cupom não acumula com o preço de lançamento */
        if ($plano && (plano_promo($plano) && !promo_linha($tid) || promo_em_vigor($tid)))
            erro('O plano ' . $plano['nome'] . ' já está com o preço de lançamento, que não acumula com cupom. Deixe o código em branco.', 400, 'CODIGO');
        $v = vinculo_de($tid);
        if ($v && $v['cupom_id'] && (int) $v['cupom_id'] !== (int) $r['linha']['id']) erro('Esta empresa já usou outro cupom.', 400, 'CODIGO');
        if (!($v && (int) $v['cupom_id'] === (int) $r['linha']['id'])) { $prob = cupom_problema($r['linha'], $plano); if ($prob) erro($prob, 400, 'CODIGO'); }
    }
    return [$r['tipo'], $r['linha']];
}

/* lê e confere plano, ciclo e usuários extras escolhidos */
function assin_escolha($d, $tid) {
    $p = plano_por_id((int) ($d['planoId'] ?? 0));
    if (!$p || (int) $p['ativo'] !== 1) erro('Escolha um dos planos disponíveis.');
    $ciclo = ($d['ciclo'] ?? 'mensal') === 'anual' && assinatura_regras()['permiteAnual'] ? 'anual' : 'mensal';   /* v1.33.0: só mensal */
    $extras = max(0, min(200, (int) ($d['extras'] ?? 0)));
    $ativos = usuarios_internos_ativos($tid);
    $limite = (int) $p['usuarios_inclusos'] + $extras;
    if ($ativos > $limite)
        erro('A empresa tem ' . $ativos . ' usuários ativos na equipe e esse plano cobre ' . $limite .
             '. Acrescente ' . ($ativos - $limite) . ' usuário(s) extra(s) ou inative quem não usa mais.', 400, 'LIMITE_USUARIOS');
    return [$p, $ciclo, $extras];
}

return [

    'estado' => function ($d) {
        $u = eu();
        $tid = (int) $u['tenant_id'];
        if (!tem_perfil($u, 'admin')) return ['estado' => assinatura_resumo_sessao($tid, false)];
        if (!assinatura_tabelas_ok()) erro('Rode o SQL 30 (assinaturas) no banco para usar esta tela.', 503, 'SEM_SQL');
        $a = assinatura_linha($tid);
        /* confere no Asaas no máximo a cada 10 minutos, ou quando pedirem */
        if ($a && !empty($a['asaas_assinatura']) && asaas_configurado()
            && (!empty($d['sincronizar']) || !$a['sincronizado_em'] || strtotime($a['sincronizado_em']) < time() - 600)) {
            try { assinatura_sincronizar($tid); } catch (Throwable $x) { if (!empty($d['sincronizar'])) throw $x; }
        }
        return assin_tela($tid);
    },

    /* v1.31.0: {codigo, planoId} — mostra o que o código faz antes de assinar */
    'codigo_conferir' => function ($d) {
        $u = exigir_perfil('admin');
        $p = plano_por_id((int) ($d['planoId'] ?? 0));
        [$tipo, $l] = assin_codigo($d['codigo'] ?? '', $p, (int) $u['tenant_id']);
        if (!$tipo) erro('Digite o código.');
        if ($tipo === 'indicador') return ['tipo' => 'indicador', 'codigo' => $l['codigo'], 'texto' => 'Indicação registrada. Obrigado por informar!'];
        return ['tipo' => 'cupom', 'codigo' => $l['codigo'], 'texto' => cupom_texto($l), 'cupomTipo' => $l['tipo'], 'valor' => (float) $l['valor']];
    },

    /* {planoId, ciclo, extras, nome, doc, email, celular, codigo} — cria cliente e assinatura no Asaas */
    'assinar' => function ($d) {
        $u = exigir_perfil('admin');
        $tid = (int) $u['tenant_id'];
        $a = assinatura_linha($tid);
        if (!$a) erro('A assinatura desta empresa não foi iniciada. Fale com o suporte.', 400);
        if ($a['situacao'] === 'isenta') erro('Esta empresa é isenta de cobrança.');
        /* cortesia (MVP): pode assinar antes do fim; a 1ª fatura vence depois do período combinado */
        if ($a['situacao'] === 'ativa' && !empty($a['asaas_assinatura'])) erro('A empresa já tem assinatura. Use "Alterar plano".');
        [$p, $ciclo, $extras] = assin_escolha($d, $tid);

        $nome = txt($d['nome'] ?? '', 200);
        $doc = assin_digitos($d['doc'] ?? '');
        $email = mb_strtolower(txt($d['email'] ?? '', 190));
        $cel = assin_digitos($d['celular'] ?? '');
        if ($nome === '') erro('Informe o nome ou a razão social para a cobrança.');
        if (strlen($doc) !== 11 && strlen($doc) !== 14) erro('Informe um CPF ou CNPJ válido para a cobrança.');
        if (!email_valido($email)) erro('Informe um e-mail válido para receber as faturas.');
        [$codTipo, $codLinha] = assin_codigo($d['codigo'] ?? '', $p, $tid);   /* v1.31.0: indicação ou cupom */

        /* cliente no Asaas: cria uma vez e reaproveita */
        $cliente = $a['asaas_cliente'];
        $dadosCli = ['name' => $nome, 'cpfCnpj' => $doc, 'email' => $email, 'externalReference' => 'tenant:' . $tid];
        if ($cel) $dadosCli['mobilePhone'] = $cel;
        /* v1.33.1: cliente de outro ambiente (ex.: criado no sandbox) não existe na conta real: cria de novo */
        if ($cliente) { try { asaas('PUT', '/customers/' . rawurlencode($cliente), $dadosCli); } catch (ErroApi $x) { $cliente = null; } }
        if (!$cliente) { $c = asaas('POST', '/customers', $dadosCli); $cliente = $c['id'] ?? null; }
        if (!$cliente) erro('O Asaas não devolveu o cadastro do cliente. Tente de novo.', 502);
        q("UPDATE assinaturas SET asaas_cliente = ?, cobranca_nome = ?, cobranca_doc = ?, cobranca_email = ?, cobranca_celular = ? WHERE tenant_id = ?",
          [$cliente, $nome, $doc, $email, $cel ?: null, $tid]);

        /* 1ª cobrança: no dia seguinte ao fim do teste ou do período já pago (quem cancelou e voltou); senão, hoje */
        $hoje = date('Y-m-d');
        $venc = $hoje;
        foreach ([$a['teste_ate'], $a['situacao'] === 'cancelada' ? $a['pago_ate'] : null] as $lim)
            if ($lim && $lim >= $hoje) $venc = max($venc, date('Y-m-d', strtotime($lim . ' +1 day')));
        /* v1.31.0: grava indicação / cupom antes de calcular o valor */
        if ($codTipo === 'indicador') { $vv = vinculo_de($tid); if (!$vv || !$vv['indicador_id']) vinculo_gravar($tid, ['indicador_id' => (int) $codLinha['id']]); }
        if ($codTipo === 'cupom') {
            $vv = vinculo_de($tid);
            if (!$vv || (int) $vv['cupom_id'] !== (int) $codLinha['id']) {
                vinculo_gravar($tid, ['cupom_id' => (int) $codLinha['id'], 'cupom_encerrado' => 0]);
                q("UPDATE cupons SET usos = usos + 1 WHERE id = ?", [(int) $codLinha['id']]);
            }
        }
        promo_iniciar($tid, $p, $ciclo);   /* v1.32.0: preço de lançamento (uma vez por empresa) */
        $valor = assinatura_valor_final($tid, $p, $ciclo, $extras);
        $s = asaas('POST', '/subscriptions', [
            'customer' => $cliente, 'billingType' => assinatura_regras()['formaPagamento'], 'value' => $valor, 'nextDueDate' => $venc,   /* v1.33.0: PIX */
            'cycle' => $ciclo === 'anual' ? 'YEARLY' : 'MONTHLY', 'description' => assinatura_descricao($p, $ciclo, $extras),
            'externalReference' => 'tenant:' . $tid,
        ]);
        if (empty($s['id'])) erro('O Asaas não devolveu a assinatura. Tente de novo.', 502);
        q("UPDATE assinaturas SET situacao = 'ativa', plano_id = ?, ciclo = ?, usuarios_extras = ?, valor = ?, asaas_assinatura = ?,
                  inicio_em = NOW(), cancelada_em = NULL, cancel_motivo = NULL, pago_ate = NULL WHERE tenant_id = ?",
          [(int) $p['id'], $ciclo, $extras, $valor, $s['id'], $tid]);
        auditar('assinatura_criar', 'assinaturas', $tid, $p['nome'] . ' · ' . $ciclo . ' · R$ ' . number_format($valor, 2, ',', '.'));
        try { assinatura_sincronizar($tid); } catch (Throwable $x) {}
        return assin_tela($tid);
    },

    /* {planoId, ciclo, extras} — muda o plano da assinatura existente (vale também para a fatura em aberto) */
    'alterar' => function ($d) {
        $u = exigir_perfil('admin');
        $tid = (int) $u['tenant_id'];
        $a = assinatura_linha($tid);
        if (!$a || $a['situacao'] !== 'ativa' || empty($a['asaas_assinatura'])) erro('A empresa ainda não tem assinatura ativa.');
        [$p, $ciclo, $extras] = assin_escolha($d, $tid);
        $valor = assinatura_valor_final($tid, $p, $ciclo, $extras);   /* v1.31.0: mantém o cupom em vigor */
        $corpo = ['value' => $valor, 'description' => assinatura_descricao($p, $ciclo, $extras), 'updatePendingPayments' => true,
                  'billingType' => assinatura_regras()['formaPagamento']];   /* v1.33.0 */
        if ($ciclo !== $a['ciclo']) $corpo['cycle'] = $ciclo === 'anual' ? 'YEARLY' : 'MONTHLY';
        asaas('PUT', '/subscriptions/' . rawurlencode($a['asaas_assinatura']), $corpo);
        q("UPDATE assinaturas SET plano_id = ?, ciclo = ?, usuarios_extras = ?, valor = ? WHERE tenant_id = ?", [(int) $p['id'], $ciclo, $extras, $valor, $tid]);
        auditar('assinatura_alterar', 'assinaturas', $tid, $p['nome'] . ' · ' . $ciclo . ' · ' . $extras . ' extra(s) · R$ ' . number_format($valor, 2, ',', '.'));
        try { assinatura_sincronizar($tid); } catch (Throwable $x) {}
        return assin_tela($tid);
    },

    /* v1.33.0: {cobrancaId?} — QR Code e Pix copia e cola da fatura (padrão: a fatura em aberto mais antiga) */
    'pix' => function ($d) {
        $u = exigir_perfil('admin');
        $tid = (int) $u['tenant_id'];
        $id = (string) ($d['cobrancaId'] ?? '');
        $c = $id !== '' ? linha("SELECT * FROM assinatura_cobrancas WHERE id = ? AND tenant_id = ?", [$id, $tid])
                        : linha("SELECT * FROM assinatura_cobrancas WHERE tenant_id = ? AND status IN ('" . implode("','", ASAAS_ABERTOS) . "') ORDER BY vencimento LIMIT 1", [$tid]);
        if (!$c) erro('Não há fatura em aberto para pagar.', 404);
        if (!in_array($c['status'], ASAAS_ABERTOS, true)) erro('Esta fatura não está em aberto.');
        $r = asaas('GET', '/payments/' . rawurlencode($c['id']) . '/pixQrCode');
        if (empty($r['payload'])) erro('O Asaas ainda não gerou o Pix desta fatura. Abra a fatura pelo link ou tente de novo em instantes.', 502);
        return ['cobrancaId' => $c['id'], 'valor' => (float) $c['valor'], 'vencimento' => $c['vencimento'], 'link' => $c['link'],
                'imagem' => (string) ($r['encodedImage'] ?? ''), 'copiaECola' => (string) $r['payload'], 'expira' => $r['expirationDate'] ?? null];
    },

    /* {motivo} — cancela no Asaas; a empresa usa até o fim do período pago e depois fica só consulta */
    'cancelar' => function ($d) {
        $u = exigir_perfil('admin');
        $tid = (int) $u['tenant_id'];
        $a = assinatura_linha($tid);
        if (!$a || $a['situacao'] !== 'ativa' || empty($a['asaas_assinatura'])) erro('Não há assinatura ativa para cancelar.');
        try { assinatura_sincronizar($tid); } catch (Throwable $x) {}
        asaas('DELETE', '/subscriptions/' . rawurlencode($a['asaas_assinatura']));
        /* faturas em aberto deixam de valer */
        q("UPDATE assinatura_cobrancas SET status = 'DELETED' WHERE tenant_id = ? AND status IN ('PENDING','OVERDUE')", [$tid]);
        $ate = assinatura_pago_ate($tid, $a['ciclo']);
        if ($a['teste_ate'] && (!$ate || $a['teste_ate'] > $ate)) $ate = $a['teste_ate'];
        if (!$ate) $ate = date('Y-m-d', strtotime('-1 day'));
        q("UPDATE assinaturas SET situacao = 'cancelada', asaas_assinatura = NULL, pago_ate = ?, cancelada_em = NOW(), cancel_motivo = ? WHERE tenant_id = ?",
          [$ate, txt_ou_null($d['motivo'] ?? '', 255), $tid]);
        auditar('assinatura_cancelar', 'assinaturas', $tid, 'usa até ' . $ate);
        return assin_tela($tid);
    },
];
