<?php
/* =====================================================================
   SGClim — api/plat_assinaturas.php  (v1.30.0)
   Console da plataforma › Assinaturas e Planos:
   situação de cada empresa, receita mensal, isentar, estender teste,
   sincronizar com o Asaas, editar planos e regras.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

function plat_assin_exigir_sql() {
    if (!assinatura_tabelas_ok()) erro('Rode o SQL 30 (assinaturas) no banco para usar esta tela.', 503, 'SEM_SQL');
}

function plat_assin_empresa($t) {
    $tid = (int) $t['id'];
    $a = assinatura_linha($tid);
    $e = assinatura_estado($tid, true);
    return [
        'id' => $tid, 'nome' => $t['nome'], 'ativa' => (int) $t['ativo'] === 1,
        'fase' => $e['fase'], 'situacao' => $e['situacao'], 'leitura' => $e['leitura'],
        'plano' => $e['plano'] ? $e['plano']['nome'] : null, 'planoId' => $e['plano'] ? $e['plano']['id'] : null,
        'ciclo' => $e['ciclo'], 'extras' => $e['extras'], 'valor' => $e['valor'],
        'mensal' => $e['valor'] !== null ? round($e['ciclo'] === 'anual' ? $e['valor'] / 12 : $e['valor'], 2) : null,
        'testeAte' => $e['testeAte'], 'diasTeste' => $e['diasTeste'], 'atrasoDias' => $e['atrasoDias'], 'pagoAte' => $e['pagoAte'],
        'aberta' => $e['aberta'], 'usuarios' => usuarios_internos_ativos($tid), 'limite' => $e['limiteUsuarios'],
        'asaasCliente' => $a['asaas_cliente'] ?? null, 'asaasAssinatura' => $a['asaas_assinatura'] ?? null,
        'observacao' => $a['observacao'] ?? null, 'cobrancaEmail' => $a['cobranca_email'] ?? null,
        'sincronizadoEm' => $a['sincronizado_em'] ?? null, 'inicioEm' => $a['inicio_em'] ?? null,
        'indicador' => plat_vinc_txt($tid),   /* v1.31.0 */
        'indicadorId' => ($v = vinculo_de($tid)) && $v['indicador_id'] ? (int) $v['indicador_id'] : null,
    ];
}

/* v1.31.0: "indicado por Fulano · cupom X" para a lista de empresas */
function plat_vinc_txt($tid) {
    $v = vinculo_de($tid);
    if (!$v) return null;
    $p = [];
    if ($v['indicador_id']) { $n = valor("SELECT nome FROM indicadores WHERE id = ?", [(int) $v['indicador_id']]); if ($n) $p[] = 'indicada por ' . $n; }
    if ($v['cupom_id']) { $k = valor("SELECT codigo FROM cupons WHERE id = ?", [(int) $v['cupom_id']]); if ($k) $p[] = 'cupom ' . $k . ((int) $v['cupom_encerrado'] === 1 ? ' (encerrado)' : ''); }
    return $p ? implode(' · ', $p) : null;
}

function plat_ind_exigir_sql() {
    if (!indicacao_tabelas_ok()) erro('Rode o SQL 31 (indicações e cupons) no banco para usar esta tela.', 503, 'SEM_SQL');
}

function indicador_publico($i) {
    $id = (int) $i['id'];
    $emp = linhas("SELECT t.id, t.nome FROM assinatura_vinculos v JOIN tenants t ON t.id = v.tenant_id WHERE v.indicador_id = ? ORDER BY t.nome", [$id]);
    $tot = [];
    foreach (linhas("SELECT status, SUM(valor) v, COUNT(*) n FROM comissoes WHERE indicador_id = ? GROUP BY status", [$id]) as $r) $tot[$r['status']] = round((float) $r['v'], 2);
    return [
        'id' => $id, 'nome' => $i['nome'], 'telefone' => $i['telefone'], 'email' => $i['email'], 'pix' => $i['pix'], 'documento' => $i['documento'],
        'codigo' => $i['codigo'], 'tipo' => $i['tipo'], 'percentual' => (float) $i['percentual'], 'meses' => (int) $i['meses'], 'valorFixo' => (float) $i['valor_fixo'],
        'ativo' => (int) $i['ativo'] === 1, 'observacao' => $i['observacao'],
        /* v1.33.0: cadastro feito pelo próprio indicador em /indique/ */
        'pixTipo' => $i['pix_tipo'] ?? null, 'cidade' => $i['cidade'] ?? null, 'atuacao' => $i['atuacao'] ?? null,
        'origem' => $i['origem'] ?? 'console', 'aceiteEm' => $i['aceite_em'] ?? null, 'criadoEm' => $i['criado_em'] ?? null,
        'regraTxt' => indicacao_regra_txt($i),
        'empresas' => array_map(function ($e) { return ['id' => (int) $e['id'], 'nome' => $e['nome']]; }, $emp),
        'pendente' => $tot['pendente'] ?? 0, 'pago' => $tot['paga'] ?? 0,
    ];
}

function cupom_publico($k) {
    return ['id' => (int) $k['id'], 'codigo' => $k['codigo'], 'descricao' => $k['descricao'], 'tipo' => $k['tipo'], 'valor' => (float) $k['valor'],
            'faturas' => (int) $k['faturas'], 'validade' => $k['validade'], 'limite' => $k['limite'] !== null ? (int) $k['limite'] : null, 'usos' => (int) $k['usos'],
            'planos' => array_values(array_filter(array_map('trim', explode(',', (string) $k['planos'])))), 'ativo' => (int) $k['ativo'] === 1, 'texto' => cupom_texto($k)];
}

function codigo_livre($codigo, $tabela, $id) {
    $outra = $tabela === 'indicadores' ? 'cupons' : 'indicadores';
    if (valor("SELECT id FROM $tabela WHERE codigo = ? AND id <> ?", [$codigo, (int) $id])) erro('Esse código já está em uso.');
    if (valor("SELECT id FROM $outra WHERE codigo = ?", [$codigo])) erro('Esse código já é usado por ' . ($outra === 'cupons' ? 'um cupom' : 'um indicador') . '.');
}

function plat_assin_tenant($id) {
    $t = linha("SELECT id, nome, ativo FROM tenants WHERE id = ?", [(int) $id]);
    if (!$t) erro('Empresa não encontrada.', 404);
    return $t;
}

return [

    'resumo' => function ($d) {
        admin_plataforma();
        plat_assin_exigir_sql();
        $emps = array_map('plat_assin_empresa', linhas("SELECT id, nome, ativo FROM tenants ORDER BY nome"));
        $mrr = 0; $cont = [];
        foreach ($emps as $e) {
            $cont[$e['fase']] = ($cont[$e['fase']] ?? 0) + 1;
            if (in_array($e['fase'], ['ativa', 'atrasada'], true) && $e['mensal'] !== null) $mrr += $e['mensal'];
        }
        $pend = 0;
        try { if (indicacao_tabelas_ok()) $pend = round((float) valor("SELECT COALESCE(SUM(valor),0) FROM comissoes WHERE status = 'pendente'"), 2); } catch (Throwable $x) {}
        $base = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://') . preg_replace('/[^A-Za-z0-9.\-:]/', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
        return [
            'empresas' => $emps, 'contagem' => $cont, 'receitaMensal' => round($mrr, 2), 'comissoesPendentes' => $pend, 'indicacoes' => indicacao_tabelas_ok(),
            'regras' => assinatura_regras(),
            'asaas' => ['configurado' => asaas_configurado(), 'ambiente' => asaas_ambiente(),
                        'webhookToken' => defined('ASAAS_WEBHOOK_TOKEN') && ASAAS_WEBHOOK_TOKEN !== '',
                        'webhookUrl' => $base . BASE_PATH . 'webhook/asaas.php'],
            'planos' => array_map('plano_publico', linhas("SELECT * FROM planos ORDER BY ordem, preco_mensal")),
        ];
    },

    /* confere a chave do Asaas */
    'asaas_testar' => function ($d) {
        admin_plataforma();
        $r = asaas('GET', '/customers?limit=1');
        return ['ok' => true, 'ambiente' => asaas_ambiente(), 'clientes' => (int) ($r['totalCount'] ?? 0)];
    },

    /* {diasTeste, diasBloqueio, planoTeste} */
    'regras_salvar' => function ($d) {
        admin_plataforma();
        plat_assin_exigir_sql();
        $atual = assinatura_regras();
        $r = ['diasTeste' => max(0, min(90, (int) ($d['diasTeste'] ?? 14))), 'diasBloqueio' => max(0, min(60, (int) ($d['diasBloqueio'] ?? 10))),
              'planoTeste' => (string) ($d['planoTeste'] ?? 'completo'),
              /* v1.33.0: só Pix e só mensal por enquanto (mantém o que já estava se a tela não mandar) */
              'formaPagamento' => ($d['formaPagamento'] ?? $atual['formaPagamento']) === 'UNDEFINED' ? 'UNDEFINED' : 'PIX',
              'permiteAnual' => array_key_exists('permiteAnual', $d) ? !empty($d['permiteAnual']) : $atual['permiteAnual']];
        if (!plano_por_chave($r['planoTeste'])) erro('Plano do teste não encontrado.');
        q("INSERT INTO plat_config (chave, valor) VALUES ('assinatura_regras', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [json_encode($r)]);
        auditar('assinatura_regras', 'plat_config', null, json_encode($r));
        return $r;
    },

    /* {id?, chave, nome, descricao, precoMensal, mesesAnual, usuariosInclusos, precoUsuarioExtra, modulos[], ativo, ordem} */
    'plano_salvar' => function ($d) {
        admin_plataforma();
        plat_assin_exigir_sql();
        $id = (int) ($d['id'] ?? 0);
        $nome = txt($d['nome'] ?? '', 60);
        $chave = preg_replace('/[^a-z0-9_]/', '', mb_strtolower(txt(($d['chave'] ?? '') ?: $nome, 30)));
        if ($nome === '' || $chave === '') erro('Informe o nome do plano.');
        if (valor("SELECT id FROM planos WHERE chave = ? AND id <> ?", [$chave, $id])) erro('Já existe um plano com esse identificador.');
        $preco = round((float) str_replace(',', '.', (string) ($d['precoMensal'] ?? 0)), 2);
        $extra = round((float) str_replace(',', '.', (string) ($d['precoUsuarioExtra'] ?? 0)), 2);
        if ($preco <= 0) erro('Informe o preço mensal.');
        $validos = ['os', 'tarefas', 'pmoc', 'contratos', 'erp', 'erp_avancado', 'assistente'];
        $mods = array_values(array_intersect($validos, array_map('strval', (array) ($d['modulos'] ?? []))));
        $campos = [$chave, $nome, txt_ou_null($d['descricao'] ?? '', 255), $preco, max(1, min(12, (int) ($d['mesesAnual'] ?? 10))),
                   max(1, (int) ($d['usuariosInclusos'] ?? 1)), max(0, $extra), implode(',', $mods), !empty($d['ativo']) ? 1 : 0, (int) ($d['ordem'] ?? 0)];
        if ($id) {
            if (!plano_por_id($id)) erro('Plano não encontrado.', 404);
            q("UPDATE planos SET chave = ?, nome = ?, descricao = ?, preco_mensal = ?, meses_anual = ?, usuarios_inclusos = ?, preco_usuario_extra = ?, modulos = ?, ativo = ?, ordem = ? WHERE id = ?",
              array_merge($campos, [$id]));
        } else {
            q("INSERT INTO planos (chave, nome, descricao, preco_mensal, meses_anual, usuarios_inclusos, preco_usuario_extra, modulos, ativo, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", $campos);
            $id = (int) db()->lastInsertId();
        }
        /* v1.38.0: itens do cartão do plano {itens: "linha\nlinha"} — vazio = lista automática pelos módulos */
        if (array_key_exists('itens', $d)) {
            $l = array_values(array_filter(array_map(function ($x) { return txt($x, 120); }, preg_split('/\r?\n/', (string) $d['itens'])), 'strlen'));
            if (count($l) > 20) erro('No máximo 20 itens no cartão do plano.');
            $todos = planos_itens(true);
            if ($l) $todos[(string) $id] = $l; else unset($todos[(string) $id]);
            q("INSERT INTO plat_config (chave, valor) VALUES ('planos_itens', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [json_encode($todos, JSON_UNESCAPED_UNICODE)]);
            planos_itens(true);
        }
        /* v1.32.0: preço de lançamento {promoAtivo, promoPreco, promoMeses, promoAte} — v1.38.0: desligado (PRECO_LANCAMENTO) */
        if (PRECO_LANCAMENTO) try {
            $pp = round((float) str_replace(',', '.', (string) ($d['promoPreco'] ?? 0)), 2);
            if (!empty($d['promoAtivo']) || $pp > 0) {
                if (!empty($d['promoAtivo']) && ($pp <= 0 || $pp >= $preco)) erro('O preço de lançamento precisa ser maior que zero e menor que o preço normal.');
                $ate = trim((string) ($d['promoAte'] ?? ''));
                if ($ate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $ate)) erro('Data limite da promoção inválida.');
                q("INSERT INTO planos_promo (plano_id, preco_mensal, meses, ate, ativo) VALUES (?, ?, ?, ?, ?)
                   ON DUPLICATE KEY UPDATE preco_mensal = VALUES(preco_mensal), meses = VALUES(meses), ate = VALUES(ate), ativo = VALUES(ativo)",
                  [$id, $pp > 0 ? $pp : $preco, max(1, (int) ($d['promoMeses'] ?? 12)), $ate ?: null, !empty($d['promoAtivo']) ? 1 : 0]);
            }
        } catch (ErroApi $x) { throw $x; } catch (Throwable $x) { /* SQL 32 ainda não rodado */ }
        auditar('plano_salvar', 'planos', $id, $nome . ' · R$ ' . number_format($preco, 2, ',', '.'));
        $n = (int) valor("SELECT COUNT(*) FROM assinaturas WHERE plano_id = ? AND situacao = 'ativa' AND asaas_assinatura IS NOT NULL", [$id]);
        return ['plano' => plano_publico(plano_por_id($id)), 'assinantes' => $n];
    },

    /* {planoId} — leva o preço atual do plano para quem já assina (a partir da próxima fatura) */
    'plano_aplicar_preco' => function ($d) {
        admin_plataforma();
        plat_assin_exigir_sql();
        $p = plano_por_id((int) ($d['planoId'] ?? 0));
        if (!$p) erro('Plano não encontrado.', 404);
        $feitos = 0; $falhas = [];
        foreach (linhas("SELECT * FROM assinaturas WHERE plano_id = ? AND situacao = 'ativa' AND asaas_assinatura IS NOT NULL", [(int) $p['id']]) as $a) {
            $valor = assinatura_valor_final((int) $a['tenant_id'], $p, $a['ciclo'], $a['usuarios_extras']);   /* v1.31.0: respeita cupom */
            if ($a['valor'] !== null && abs((float) $a['valor'] - $valor) < 0.005) continue;
            try {
                asaas('PUT', '/subscriptions/' . rawurlencode($a['asaas_assinatura']),
                      ['value' => $valor, 'description' => assinatura_descricao($p, $a['ciclo'], $a['usuarios_extras']), 'updatePendingPayments' => false]);
                q("UPDATE assinaturas SET valor = ? WHERE tenant_id = ?", [$valor, (int) $a['tenant_id']]);
                $feitos++;
            } catch (Throwable $x) {
                $falhas[] = (string) valor("SELECT nome FROM tenants WHERE id = ?", [(int) $a['tenant_id']]) . ': ' . $x->getMessage();
            }
        }
        auditar('plano_aplicar_preco', 'planos', (int) $p['id'], $feitos . ' assinatura(s)');
        return ['atualizadas' => $feitos, 'falhas' => $falhas];
    },

    /* {empresaId, isenta: bool, observacao} */
    'empresa_isentar' => function ($d) {
        admin_plataforma();
        plat_assin_exigir_sql();
        $t = plat_assin_tenant($d['empresaId'] ?? 0);
        $a = assinatura_linha($t['id']);
        if (!empty($d['isenta'])) {
            if ($a && $a['situacao'] === 'ativa' && $a['asaas_assinatura']) erro('A empresa tem assinatura ativa no Asaas. Cancele por lá ou peça para ela cancelar antes de isentar.');
            q("INSERT INTO assinaturas (tenant_id, situacao, observacao) VALUES (?, 'isenta', ?) ON DUPLICATE KEY UPDATE situacao = 'isenta', observacao = VALUES(observacao)",
              [(int) $t['id'], txt_ou_null($d['observacao'] ?? '', 255)]);
        } else {
            if (!$a || $a['situacao'] !== 'isenta') erro('A empresa não está isenta.');
            $r = assinatura_regras();
            $p = plano_por_chave($r['planoTeste']);
            q("UPDATE assinaturas SET situacao = 'teste', plano_id = ?, teste_ate = DATE_ADD(CURDATE(), INTERVAL ? DAY), observacao = ? WHERE tenant_id = ?",
              [$p ? (int) $p['id'] : null, $r['diasTeste'], txt_ou_null($d['observacao'] ?? '', 255), (int) $t['id']]);
        }
        auditar(!empty($d['isenta']) ? 'empresa_isentar' : 'empresa_tirar_isencao', 'assinaturas', (int) $t['id'], $t['nome'], (int) $t['id']);
        return plat_assin_empresa($t);
    },

    /* {empresaId, ate: AAAA-MM-DD} — dá mais prazo de teste (empresa sem assinatura) */
    'empresa_teste' => function ($d) {
        admin_plataforma();
        plat_assin_exigir_sql();
        $t = plat_assin_tenant($d['empresaId'] ?? 0);
        $ate = (string) ($d['ate'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $ate) || $ate < date('Y-m-d')) erro('Informe uma data de hoje em diante.');
        $a = assinatura_linha($t['id']);
        if ($a && $a['situacao'] === 'ativa' && $a['asaas_assinatura']) erro('A empresa já assina. O prazo de teste não se aplica.');
        if (!$a) assinatura_criar_teste($t['id']);
        q("UPDATE assinaturas SET situacao = 'teste', teste_ate = ?, plano_id = COALESCE(plano_id, (SELECT id FROM planos WHERE chave = ?)) WHERE tenant_id = ?",
          [$ate, assinatura_regras()['planoTeste'], (int) $t['id']]);
        auditar('empresa_teste', 'assinaturas', (int) $t['id'], $t['nome'] . ' até ' . $ate, (int) $t['id']);
        return plat_assin_empresa($t);
    },

    /* v1.31.0: {empresaId, ate, planoId} — sem cobrança até a data (empresas do MVP); depois precisa assinar */
    'empresa_cortesia' => function ($d) {
        admin_plataforma();
        plat_assin_exigir_sql();
        $t = plat_assin_tenant($d['empresaId'] ?? 0);
        $ate = (string) ($d['ate'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $ate) || $ate < date('Y-m-d')) erro('Informe uma data de hoje em diante.');
        $a = assinatura_linha($t['id']);
        if ($a && $a['situacao'] === 'ativa' && $a['asaas_assinatura']) erro('A empresa já assina. Para dar cortesia, ela precisa cancelar antes.');
        $p = plano_por_id((int) ($d['planoId'] ?? 0)) ?: plano_por_chave(assinatura_regras()['planoTeste']);
        $obs = txt_ou_null($d['observacao'] ?? '', 255) ?: 'Cortesia (MVP) até ' . date('d/m/Y', strtotime($ate));
        q("INSERT INTO assinaturas (tenant_id, situacao, plano_id, teste_ate, observacao) VALUES (?, 'cortesia', ?, ?, ?)
           ON DUPLICATE KEY UPDATE situacao = 'cortesia', plano_id = VALUES(plano_id), teste_ate = VALUES(teste_ate), observacao = VALUES(observacao)",
          [(int) $t['id'], $p ? (int) $p['id'] : null, $ate, $obs]);
        auditar('empresa_cortesia', 'assinaturas', (int) $t['id'], $t['nome'] . ' até ' . $ate, (int) $t['id']);
        return plat_assin_empresa($t);
    },

    /* ---------- v1.31.0: indicadores, comissões e cupons ---------- */

    'indicadores' => function ($d) {
        admin_plataforma();
        plat_ind_exigir_sql();
        return array_map('indicador_publico', linhas("SELECT * FROM indicadores ORDER BY ativo DESC, nome"));
    },

    /* {id?, nome, telefone, email, pix, documento, codigo, tipo, percentual, meses, valorFixo, ativo, observacao} */
    'indicador_salvar' => function ($d) {
        admin_plataforma();
        plat_ind_exigir_sql();
        $id = (int) ($d['id'] ?? 0);
        $nome = txt($d['nome'] ?? '', 150);
        if ($nome === '') erro('Informe o nome de quem indica.');
        $codigo = codigo_limpo(($d['codigo'] ?? '') ?: preg_replace('/\s.*/', '', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nome)) . rand(10, 99));
        if (strlen($codigo) < 3) erro('O código precisa ter pelo menos 3 letras ou números.');
        codigo_livre($codigo, 'indicadores', $id);
        $tipo = ($d['tipo'] ?? 'percentual') === 'fixo' ? 'fixo' : 'percentual';
        $num = function ($v) { return round((float) str_replace(',', '.', (string) $v), 2); };
        $pct = $num($d['percentual'] ?? 10);
        if ($tipo === 'percentual' && ($pct <= 0 || $pct > 100)) erro('Informe o percentual da comissão (1 a 100).');
        $fixo = $num($d['valorFixo'] ?? 0);
        if ($tipo === 'fixo' && $fixo <= 0) erro('Informe o valor fixo da comissão.');
        $c = [$nome, txt_ou_null($d['telefone'] ?? '', 30), txt_ou_null(mb_strtolower($d['email'] ?? ''), 190), txt_ou_null($d['pix'] ?? '', 150),
              txt_ou_null($d['documento'] ?? '', 20), $codigo, $tipo, $pct, max(0, (int) ($d['meses'] ?? 12)), $fixo, !empty($d['ativo']) ? 1 : 0, txt_ou_null($d['observacao'] ?? '', 255)];
        if ($id) q("UPDATE indicadores SET nome = ?, telefone = ?, email = ?, pix = ?, documento = ?, codigo = ?, tipo = ?, percentual = ?, meses = ?, valor_fixo = ?, ativo = ?, observacao = ? WHERE id = ?", array_merge($c, [$id]));
        else { q("INSERT INTO indicadores (nome, telefone, email, pix, documento, codigo, tipo, percentual, meses, valor_fixo, ativo, observacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", $c); $id = (int) db()->lastInsertId(); }
        if (indicacao_sql34_ok()) {   /* v1.33.0 */
            $pt = (string) ($d['pixTipo'] ?? '');
            q("UPDATE indicadores SET pix_tipo = ?, cidade = ?, atuacao = ? WHERE id = ?",
              [in_array($pt, ['cpf', 'cnpj', 'celular', 'email', 'aleatoria'], true) ? $pt : null, txt_ou_null($d['cidade'] ?? '', 120), txt_ou_null($d['atuacao'] ?? '', 60), $id]);
        }
        auditar('indicador_salvar', 'indicadores', $id, $nome . ' · ' . $codigo);
        return indicador_publico(linha("SELECT * FROM indicadores WHERE id = ?", [$id]));
    },

    /* {empresaId, indicadorId|null} — liga (ou desliga) uma empresa a quem indicou */
    'empresa_indicador' => function ($d) {
        admin_plataforma();
        plat_ind_exigir_sql();
        $t = plat_assin_tenant($d['empresaId'] ?? 0);
        $iid = (int) ($d['indicadorId'] ?? 0) ?: null;
        if ($iid && !valor("SELECT id FROM indicadores WHERE id = ?", [$iid])) erro('Indicador não encontrado.');
        vinculo_gravar($t['id'], ['indicador_id' => $iid]);
        auditar('empresa_indicador', 'assinatura_vinculos', (int) $t['id'], $t['nome'] . ' → ' . ($iid ?: 'nenhum'), (int) $t['id']);
        return plat_assin_empresa($t);
    },

    /* v1.33.0: regra de comissão de quem se cadastra sozinho em /indique/ */
    'indicacao_padrao' => function ($d) {
        admin_plataforma();
        return indicacao_padrao() + ['sql34' => indicacao_sql34_ok()];
    },

    /* {percentual, meses} — não muda quem já está cadastrado */
    'indicacao_padrao_salvar' => function ($d) {
        admin_plataforma();
        $pct = round((float) str_replace(',', '.', (string) ($d['percentual'] ?? 10)), 2);
        if ($pct <= 0 || $pct > 100) erro('Informe o percentual da comissão (1 a 100).');
        $r = ['percentual' => $pct, 'meses' => max(0, min(120, (int) ($d['meses'] ?? 3)))];
        q("INSERT INTO plat_config (chave, valor) VALUES ('indicacao_padrao', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [json_encode($r)]);
        auditar('indicacao_padrao', 'plat_config', null, json_encode($r));
        return indicacao_padrao() + ['sql34' => indicacao_sql34_ok()];
    },

    /* {indicadorId?, status?} — comissões (padrão: pendentes) */
    'comissoes' => function ($d) {
        admin_plataforma();
        plat_ind_exigir_sql();
        $w = []; $p = [];
        $st = (string) ($d['status'] ?? 'pendente');
        if (in_array($st, ['pendente', 'paga', 'cancelada'], true)) { $w[] = 'c.status = ?'; $p[] = $st; }
        if (!empty($d['indicadorId'])) { $w[] = 'c.indicador_id = ?'; $p[] = (int) $d['indicadorId']; }
        $rows = linhas("SELECT c.*, i.nome AS indicador, i.pix, t.nome AS empresa, ac.vencimento, ac.pago_em AS fatura_paga
                          FROM comissoes c JOIN indicadores i ON i.id = c.indicador_id JOIN tenants t ON t.id = c.tenant_id
                          LEFT JOIN assinatura_cobrancas ac ON ac.id = c.cobranca_id
                        " . ($w ? 'WHERE ' . implode(' AND ', $w) : '') . " ORDER BY i.nome, ac.vencimento DESC LIMIT 500", $p);
        return array_map(function ($r) {
            return ['id' => (int) $r['id'], 'indicadorId' => (int) $r['indicador_id'], 'indicador' => $r['indicador'], 'pix' => $r['pix'], 'empresa' => $r['empresa'],
                    'fatura' => $r['vencimento'], 'faturaPaga' => $r['fatura_paga'], 'base' => (float) $r['base'], 'valor' => (float) $r['valor'],
                    'status' => $r['status'], 'pagoEm' => $r['pago_em']];
        }, $rows);
    },

    /* {ids: [..], pagoEm} — marca comissões como pagas (Pix feito por fora) */
    'comissoes_pagar' => function ($d) {
        admin_plataforma();
        plat_ind_exigir_sql();
        $ids = array_values(array_filter(array_map('intval', (array) ($d['ids'] ?? []))));
        if (!$ids) erro('Escolha as comissões.');
        $em = (string) ($d['pagoEm'] ?? date('Y-m-d'));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $em)) $em = date('Y-m-d');
        $in = implode(',', array_fill(0, count($ids), '?'));
        $n = q("UPDATE comissoes SET status = 'paga', pago_em = ? WHERE status = 'pendente' AND id IN ($in)", array_merge([$em], $ids))->rowCount();
        auditar('comissoes_pagar', 'comissoes', null, $n . ' comissão(ões) em ' . $em);
        return ['pagas' => $n];
    },

    'cupons' => function ($d) {
        admin_plataforma();
        plat_ind_exigir_sql();
        return array_map('cupom_publico', linhas("SELECT * FROM cupons ORDER BY ativo DESC, criado_em DESC"));
    },

    /* {id?, codigo, descricao, tipo, valor, faturas, validade, limite, planos[], ativo} */
    'cupom_salvar' => function ($d) {
        admin_plataforma();
        plat_ind_exigir_sql();
        $id = (int) ($d['id'] ?? 0);
        $codigo = codigo_limpo($d['codigo'] ?? '');
        if (strlen($codigo) < 3) erro('O código do cupom precisa ter pelo menos 3 letras ou números.');
        codigo_livre($codigo, 'cupons', $id);
        $tipo = ($d['tipo'] ?? 'percentual') === 'valor' ? 'valor' : 'percentual';
        $valor = round((float) str_replace(',', '.', (string) ($d['valor'] ?? 0)), 2);
        if ($valor <= 0 || ($tipo === 'percentual' && $valor > 100)) erro('Informe o desconto (em % até 100, ou em R$).');
        $val = trim((string) ($d['validade'] ?? ''));
        if ($val !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $val)) erro('Validade inválida.');
        $lim = trim((string) ($d['limite'] ?? ''));
        $planos = implode(',', array_map(function ($c) { return preg_replace('/[^a-z0-9_]/', '', $c); }, (array) ($d['planos'] ?? [])));
        $c = [$codigo, txt_ou_null($d['descricao'] ?? '', 150), $tipo, $valor, max(0, (int) ($d['faturas'] ?? 1)), $val ?: null, $lim === '' ? null : max(1, (int) $lim), $planos ?: null, !empty($d['ativo']) ? 1 : 0];
        if ($id) q("UPDATE cupons SET codigo = ?, descricao = ?, tipo = ?, valor = ?, faturas = ?, validade = ?, limite = ?, planos = ?, ativo = ? WHERE id = ?", array_merge($c, [$id]));
        else { q("INSERT INTO cupons (codigo, descricao, tipo, valor, faturas, validade, limite, planos, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", $c); $id = (int) db()->lastInsertId(); }
        auditar('cupom_salvar', 'cupons', $id, $codigo);
        return cupom_publico(linha("SELECT * FROM cupons WHERE id = ?", [$id]));
    },

    /* {empresaId} — confere no Asaas */
    'empresa_sincronizar' => function ($d) {
        admin_plataforma();
        plat_assin_exigir_sql();
        $t = plat_assin_tenant($d['empresaId'] ?? 0);
        if (!assinatura_sincronizar($t['id'])) erro('Esta empresa não tem assinatura no Asaas.');
        return plat_assin_empresa($t);
    },

    /* {empresaId} — cobranças da empresa */
    'empresa_cobrancas' => function ($d) {
        admin_plataforma();
        plat_assin_exigir_sql();
        $t = plat_assin_tenant($d['empresaId'] ?? 0);
        return array_map(function ($c) {
            return ['id' => $c['id'], 'vencimento' => $c['vencimento'], 'valor' => (float) $c['valor'], 'status' => $c['status'],
                    'statusTxt' => asaas_status_txt($c['status']), 'forma' => $c['forma'] ? asaas_forma_txt($c['forma']) : null,
                    'link' => $c['link'], 'pagoEm' => $c['pago_em']];
        }, linhas("SELECT * FROM assinatura_cobrancas WHERE tenant_id = ? ORDER BY vencimento DESC LIMIT 36", [(int) $t['id']]));
    },
];
