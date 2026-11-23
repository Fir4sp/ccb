<?php
declare(strict_types=1);

/**
 * Testes da v1.6.0: Ordem de Serviço (etapas, pendências, evolução) e Obra como tipo de OS (teto e gastos).
 * Incluído por testes.php depois de testes_fase3.php: usa $adminA, $adminB, $casa1, $rita, $lucia, $carlos, $paulo,
 * $pedro, $edson, $elias, $sara, $id2, $ch4, $PDF, $criarU, $cat, entrar(), jpeg(), baixar(), ok() e db().
 */

$criarU(['nome' => 'Érica Engenharia', 'email' => 'erica@a.test', 'perfis' => [['perfil' => 'engenharia']]]);
$criarU(['nome' => 'Célio Compras', 'email' => 'celio@a.test', 'perfis' => [['perfil' => 'compras']]]);
$erica = entrar('erica@a.test');
$celio = entrar('celio@a.test');
$etapaPorNome = fn(array $o, string $nome) => array_values(array_filter($o['etapas'], fn($e) => $e['nome'] === $nome))[0];

// ------------------------------------------------------------------ Modelos de etapas
echo "\nModelos de etapas\n";
[$st, $modelos] = $edson->req('GET', '/modelos-etapas');
ok('organização nasce com 6 modelos (Pintura, Troca de piso…)', $st === 200 && count($modelos) === 6 && in_array('Pintura', array_column($modelos, 'nome'), true), array_column($modelos, 'nome'));
$pintura = array_values(array_filter($modelos, fn($m) => $m['nome'] === 'Pintura'))[0];
ok('modelo Pintura já traz massa corrida e as demãos', in_array('Massa corrida', $pintura['etapas'], true) && in_array('Segunda demão', $pintura['etapas'], true), $pintura['etapas']);
[$st] = $rita->req('POST', '/modelos-etapas', ['nome' => 'Teste', 'etapas' => ['a', 'b']]);
ok('a casa não cria modelo (403)', $st === 403, $st);
[$st, $r] = $edson->req('POST', '/modelos-etapas', ['nome' => 'Bebedouro', 'etapas' => []]);
ok('modelo precisa de pelo menos uma etapa', $st === 422 && isset($r['campos']['etapas']), $r);
[$st, $beb] = $edson->req('POST', '/modelos-etapas', ['nome' => 'Bebedouro', 'etapas' => ['Desligar e esvaziar', 'Trocar o filtro', 'Higienizar', '  ', 'Testar a água']]);
ok('a equipe de manutenção cria um modelo (linhas vazias saem)', $st === 201 && $beb['etapas'] === ['Desligar e esvaziar', 'Trocar o filtro', 'Higienizar', 'Testar a água'], $beb);
[$st] = $carlos->req('POST', '/modelos-etapas', ['nome' => 'Bebedouro', 'etapas' => ['x y']]);
ok('nome de modelo repetido é recusado', $st === 422, $st);
[, $beb] = $carlos->req('PUT', '/modelos-etapas/' . $beb['id'], ['nome' => 'Bebedouro', 'etapas' => ['Desligar', 'Trocar o filtro', 'Testar'], 'ativo' => false]);
[, $lista] = $edson->req('GET', '/modelos-etapas');
ok('modelo desativado some da lista de uso', !in_array('Bebedouro', array_column($lista, 'nome'), true), array_column($lista, 'nome'));
[, $lista] = $edson->req('GET', '/modelos-etapas?todos=1');
ok('na administração ele continua, desativado e editado', in_array('Bebedouro', array_column($lista, 'nome'), true) && end($lista)['etapas'] === ['Desligar', 'Trocar o filtro', 'Testar'], end($lista));
[, $listaB] = $adminB->req('GET', '/modelos-etapas?todos=1');
ok('modelos de um tenant não aparecem no outro', count($listaB) === 6, count($listaB));
[$st] = $adminB->req('PUT', '/modelos-etapas/' . $beb['id'], ['nome' => 'Invadido', 'etapas' => ['x y']]);
ok('outro tenant não edita o modelo (404)', $st === 404, $st);

// ------------------------------------------------------------------ OS de serviço: etapas e evolução
echo "\nOrdem de Serviço — etapas e evolução\n";
[, $ch2] = $carlos->req('GET', "/chamados/$id2");
$os2 = $ch2['os']['id'];
ok('o chamado aprovado depois do parecer também gerou a OS', $ch2['os']['rotulo'] === 'OS 0002' && $ch2['os']['status'] === 'aberta', $ch2['os']);
[$st, $o] = $rita->req('GET', "/ordens/$os2");
ok('a casa acompanha a OS da própria casa', $st === 200 && $o['chamado']['numero'] === 2 && $o['pode_editar_etapas'] === false, $o);
[$st] = $lucia->req('GET', "/ordens/$os2");
ok('outra casa não vê a OS (404)', $st === 404, $st);
[$st] = $adminB->req('GET', "/ordens/$os2");
ok('outro tenant não vê a OS (404)', $st === 404, $st);
$eletricaModelo = array_values(array_filter($modelos, fn($m) => $m['nome'] === 'Elétrica'))[0];
[$st] = $rita->req('POST', "/ordens/$os2/etapas", ['modelo_id' => $eletricaModelo['id']]);
ok('a casa não mexe nas etapas (409)', $st === 409, $st);
[$st, $o] = $edson->req('POST', "/ordens/$os2/etapas", ['modelo_id' => $eletricaModelo['id']]);
ok('a equipe usa o modelo Elétrica: entram as 7 etapas', $st === 200 && count($o['etapas']) === 7 && $o['progresso'] == 0, $o);
[$st, $r] = $edson->req('PUT', "/ordens/$os2/etapas/" . $o['etapas'][0]['id'], ['situacao' => 'ok']);
ok('antes de iniciar a OS não dá para marcar etapas', $st === 409 && str_contains($r['erro'], 'Inicie'), $r);
[, $o] = $edson->req('POST', "/ordens/$os2/acoes", ['acao' => 'iniciar']);
ok('equipe inicia e fica responsável', $o['status'] === 'em_andamento' && ($o['responsavel']['nome'] ?? '') === 'Edson Equipe', $o);
[$st] = $elias->req('PUT', "/ordens/$os2/etapas/" . $o['etapas'][0]['id'], ['situacao' => 'ok']);
ok('outro membro da equipe não marca a OS do colega (409)', $st === 409, $st);
$e = $o['etapas'];
[, $o] = $edson->req('PUT', "/ordens/$os2/etapas/" . $e[0]['id'], ['situacao' => 'ok']);
[$st, $r] = $edson->req('PUT', "/ordens/$os2/etapas/" . $e[1]['id'], ['situacao' => 'andamento', 'percentual' => 0]);
ok('em andamento precisa de um percentual', $st === 422 && isset($r['campos']['percentual']), $r);
[, $o] = $edson->req('PUT', "/ordens/$os2/etapas/" . $e[1]['id'], ['situacao' => 'andamento', 'percentual' => 50]);
ok('andamento da OS = média das etapas (100 + 50) / 7', $o['progresso'] == 21.4 && $o['contagem']['ok'] === 1 && $o['contagem']['andamento'] === 1, $o['progresso']);
[, $o] = $edson->req('PUT', "/ordens/$os2/etapas/" . $e[6]['id'], ['situacao' => 'nao_aplica']);
ok('"Não se aplica" sai da conta: (100 + 50) / 6', $o['progresso'] == 25.0, $o['progresso']);
[$st, $r] = $edson->req('PUT', "/ordens/$os2/etapas/" . $e[2]['id'], ['situacao' => 'nao_ok']);
ok('Não OK exige dizer o que não está OK', $st === 422 && isset($r['campos']['observacao']), $r);
[, $o] = $edson->req('PUT', "/ordens/$os2/etapas/" . $e[2]['id'], ['situacao' => 'nao_ok', 'observacao' => 'Faltou cabo de 6 mm; volto na semana que vem.']);
ok('Não OK gera uma pendência e não conta no andamento', count($o['pendencias']) === 1 && $o['pendencias_abertas'] === 1 && $o['etapas'][2]['pendencia_id'] !== null && $o['progresso'] == 25.0, $o['pendencias']);
[, $o] = $edson->req('PUT', "/ordens/$os2/etapas/" . $e[2]['id'], ['situacao' => 'nao_ok', 'observacao' => 'Faltou cabo de 6 mm e conector.']);
ok('marcar Não OK de novo atualiza a mesma pendência', count($o['pendencias']) === 1 && $o['pendencias'][0]['descricao'] === 'Faltou cabo de 6 mm e conector.', $o['pendencias']);
[, $res] = $carlos->req('GET', '/ordens/resumo');
ok('resumo mostra a pendência aberta', $res['pendencias'] === 1 && $res['em_andamento'] === 1, $res);
[, $pend] = $carlos->req('GET', '/ordens/pendencias');
ok('lista de pendências traz a OS, o chamado e a casa', count($pend) === 1 && $pend[0]['os']['rotulo'] === 'OS 0002' && $pend[0]['casa']['id'] === $casa1['id'], $pend);
[, $pendL] = $lucia->req('GET', '/ordens/pendencias');
ok('outra casa não vê a pendência', $pendL === [], $pendL);

[, $o] = $edson->req('POST', "/ordens/$os2/etapas", ['nome' => 'Trocar a tomada do púlpito']);
ok('etapa personalizada entra no fim da lista', end($o['etapas'])['nome'] === 'Trocar a tomada do púlpito' && count($o['etapas']) === 8, array_column($o['etapas'], 'nome'));
$nova = end($o['etapas'])['id'];
[$st] = $edson->req('DELETE', "/ordens/$os2/etapas/" . $e[0]['id']);
ok('etapa já marcada não é apagada (409)', $st === 409, $st);
[, $o] = $edson->req('DELETE', "/ordens/$os2/etapas/$nova");
ok('etapa que ainda não foi marcada pode ser tirada', count($o['etapas']) === 7, count($o['etapas']));
$ids = array_column($o['etapas'], 'id');
[, $o] = $edson->req('PUT', "/ordens/$os2/etapas/ordem", ['ordem' => array_reverse($ids)]);
ok('reordena as etapas', $o['etapas'][0]['id'] === end($ids), array_column($o['etapas'], 'id'));
[$st] = $edson->req('PUT', "/ordens/$os2/etapas/ordem", ['ordem' => [$ids[0]]]);
ok('reordenar com lista incompleta é recusado', $st === 422, $st);
[, $o] = $edson->req('PUT', "/ordens/$os2/etapas/" . $e[0]['id'], ['nome' => 'Desligar o circuito, sinalizar e travar']);
ok('renomeia a etapa sem mudar a marcação', $etapaPorNome($o, 'Desligar o circuito, sinalizar e travar')['situacao'] === 'ok', $o['etapas']);

[, $o] = $edson->req('POST', "/ordens/$os2/etapas/" . $e[0]['id'] . '/fotos', ['arquivo' => jpeg(), 'legenda' => 'Quadro desligado']);
$foto = $etapaPorNome($o, 'Desligar o circuito, sinalizar e travar')['fotos'][0] ?? null;
ok('foto na etapa', $foto !== null && $foto['legenda'] === 'Quadro desligado', $foto);
[$st] = baixar($rita, $foto['url']);
ok('a casa abre a foto da etapa', $st === 200, $st);
[$st] = baixar($lucia, $foto['url']);
ok('outra casa não abre a foto da etapa (404)', $st === 404, $st);

[$st, $r] = $edson->req('POST', "/ordens/$os2/acoes", ['acao' => 'concluir', 'texto' => 'Concluído.']);
ok('não conclui com etapas sem marcar', $st === 422 && str_contains($r['campos']['texto'] ?? '', 'sem marcar'), $r);
[, $o] = $edson->req('POST', "/ordens/$os2/acoes", ['acao' => 'pausar', 'texto' => 'Esperando o cabo chegar.']);
ok('pausa a OS com motivo', $o['status'] === 'pausada' && in_array('retomar', $o['acoes'], true), $o['acoes']);
[$st] = $edson->req('PUT', "/ordens/$os2/etapas/" . $e[3]['id'], ['situacao' => 'ok']);
ok('com a OS pausada não marca etapas (409)', $st === 409, $st);
$edson->req('POST', "/ordens/$os2/acoes", ['acao' => 'retomar']);
foreach ([$e[1], $e[3], $e[4], $e[5]] as $x) [, $o] = $edson->req('PUT', "/ordens/$os2/etapas/" . $x['id'], ['situacao' => 'ok']);
ok('com a pendência, a OS fica em 5 de 6 etapas', round($o['progresso']) == 83, $o['progresso']);
[$st, $o] = $edson->req('POST', "/ordens/$os2/acoes", ['acao' => 'concluir', 'texto' => 'Disjuntor trocado; falta o circuito do ar.']);
ok('a pendência não trava a conclusão', $st === 200 && $o['status'] === 'concluida' && $o['pendencias_abertas'] === 1, $o);
[, $chv] = $rita->req('GET', "/chamados/$id2");
ok('o chamado espera a confirmação da casa', $chv['status'] === 'concluido' && str_contains(end($chv['eventos'])['texto'], 'pendência'), end($chv['eventos']));
[$st] = $edson->req('PUT', "/ordens/$os2/etapas/" . $e[3]['id'], ['situacao' => 'andamento', 'percentual' => 10]);
ok('OS concluída não deixa remarcar etapas (409)', $st === 409, $st);
[$st] = $rita->req('POST', "/ordens/$os2/pendencias/" . $o['pendencias'][0]['id'] . '/resolver', ['texto' => 'ok']);
ok('a casa não resolve pendência (403)', $st === 403, $st);
[$st, $r] = $edson->req('POST', "/ordens/$os2/pendencias/" . $o['pendencias'][0]['id'] . '/resolver', []);
ok('resolver pede o que foi feito', $st === 422, $r);
[$st, $o] = $edson->req('POST', "/ordens/$os2/pendencias/" . $o['pendencias'][0]['id'] . '/resolver', ['texto' => 'Cabo de 6 mm passado e ligado.']);
ok('pendência resolvida depois, com a OS já concluída: a etapa vira OK e chega a 100%', $st === 200 && $o['pendencias_abertas'] === 0 && $o['progresso'] == 100, $o['progresso'] ?? $o);
[$st] = $edson->req('POST', "/ordens/$os2/pendencias/" . $o['pendencias'][0]['id'] . '/resolver', ['texto' => 'de novo']);
ok('não resolve duas vezes (409)', $st === 409, $st);
ok('o gráfico de evolução tem os pontos do dia, terminando em 100%', count($o['evolucao']) >= 1 && end($o['evolucao'])['percentual'] == 100, $o['evolucao']);
ok('cada mudança de andamento fica guardada', (int) db('SELECT COUNT(*) n FROM os_progresso WHERE os_id = ?', [$os2])[0]['n'] >= 8, null);
[, $r] = $rita->req('POST', "/chamados/$id2/acoes", ['acao' => 'confirmar']);
ok('a casa confirma e o chamado encerra', $r['status'] === 'encerrado', $r['status']);
[$st] = $edson->req('POST', "/ordens/$os2/gastos", ['categoria' => 'material', 'descricao' => 'Cabo', 'valor' => 10]);
ok('serviço não tem gastos (409)', $st === 409, $st);
$dupla = null;
try { $et = db('SELECT id, os_id, tenant_id FROM os_etapas WHERE os_id = ? LIMIT 1', [$os2])[0];
      $u = db('SELECT id FROM usuarios WHERE email = ?', ['edson@a.test'])[0]['id'];
      db("INSERT INTO os_pendencias (tenant_id, os_id, etapa_id, descricao, aberta_por) VALUES (?,?,?,?,?)", [$et['tenant_id'], $os2, $et['id'], 'a', $u]);
      db("INSERT INTO os_pendencias (tenant_id, os_id, etapa_id, descricao, aberta_por) VALUES (?,?,?,?,?)", [$et['tenant_id'], $os2, $et['id'], 'b', $u]); }
catch (PDOException $ex) { $dupla = $ex->getCode(); }
ok('o próprio banco impede duas pendências abertas na mesma etapa', $dupla === '23000', $dupla);

// ------------------------------------------------------------------ Obra: chamado → aprovação do teto → OS
echo "\nObra — do chamado à OS com teto\n";
$o4 = $ch4['id'];
[$st, $r] = $erica->req('POST', "/chamados/$o4/acoes", ['acao' => 'enviar_orcamento', 'valor' => '200.000,00', 'servico' => 'Recuperar a laje, trocar o forro e pintar o salão.']);
ok('Engenharia manda o teto da obra (vai primeiro para a Segurança, por ser telhado)', $st === 200 && $r['status'] === 'aguardando_parecer' && $r['nivel_aprovacao'] === 'procurador', $r);
$sara->req('POST', "/chamados/$o4/acoes", ['acao' => 'parecer', 'resultado' => 'com_ressalvas', 'texto' => 'Andaime com guarda-corpo.']);
[$st] = $paulo->req('POST', "/chamados/$o4/acoes", ['acao' => 'aprovar']);
ok('obra não é aprovada pela Gestão (409)', $st === 409, $st);
[, $res] = $pedro->req('GET', '/chamados/resumo');
ok('Procurador recebe o aviso da obra', $res['para_mim'] === 1 && $res['por_tipo']['obra'] === 1, $res);
[$st, $r] = $pedro->req('POST', "/chamados/$o4/acoes", ['acao' => 'aprovar', 'texto' => 'Aprovado.']);
ok('Procuradores aprovam e nasce a OS do tipo obra', $st === 200 && $r['status'] === 'aprovado' && $r['os']['rotulo'] === 'OS 0003', $r['os'] ?? $r);
$oid = $r['os']['id'];
[, $o] = $erica->req('GET', "/ordens/$oid");
ok('a OS da obra já vem com o teto aprovado', $o['tipo'] === 'obra' && $o['teto'] == 200000 && $o['saldo'] == 200000 && count($o['tetos']) === 1 && $o['tetos'][0]['status'] === 'aprovado', $o);
[$st, $r] = $rita->req('GET', "/chamados/$o4");
ok('a casa vê o chamado da obra sem os valores', $r['valor_aprovado'] === null && $r['valor_estimado'] === null && $r['ve_valores'] === false
    && !array_filter($r['eventos'], fn($e) => $e['valor'] !== null), $r);
[$st] = $celio->req('POST', "/ordens/$oid/gastos", ['categoria' => 'material', 'descricao' => 'Tinta', 'valor' => 100]);
ok('não lança gasto antes de a obra começar (409)', $st === 409, $st);
[, $o] = $erica->req('POST', "/ordens/$oid/acoes", ['acao' => 'iniciar']);
ok('Engenharia inicia a obra e fica responsável', $o['status'] === 'em_andamento' && ($o['responsavel']['nome'] ?? '') === 'Érica Engenharia', $o['responsavel'] ?? $o);

echo "\nObra — gastos contra o teto\n";
[$st, $o] = $celio->req('POST', "/ordens/$oid/gastos", ['categoria' => 'material', 'descricao' => 'Forro de PVC e estrutura', 'fornecedor' => 'Casa do Forro',
    'valor' => '120.000,00', 'data' => date('Y-m-d'), 'comprovante' => $PDF, 'comprovante_nome' => 'nota.pdf']);
ok('Compras lança gasto com nota fiscal', $st === 200 && $o['gasto'] == 120000 && $o['saldo'] == 80000 && $o['gastos'][0]['comprovante_url'] !== null, $o);
$comprovante = $o['gastos'][0]['comprovante_url'];
[$st, $o] = $celio->req('POST', "/ordens/$oid/gastos", ['categoria' => 'mao_de_obra', 'descricao' => 'Adiantamento empreiteira', 'valor' => 90000]);
ok('gasto que passa do teto é aceito e a obra fica em vermelho', $st === 200 && $o['acima_teto'] === true && $o['saldo'] == -10000, $o);
[, $chv] = $erica->req('GET', "/chamados/$o4");
ok('a linha do tempo avisa quanto passou do teto', str_contains(end($chv['eventos'])['texto'] ?? '', 'R$ 10.000,00'), end($chv['eventos']));
[, $res] = $erica->req('GET', '/ordens/resumo');
ok('quem toca a obra recebe o aviso para pedir teto novo', $res['obras_acima_teto'] === 1 && $res['para_mim'] >= 1, $res);
[, $o] = $erica->req('POST', "/ordens/$oid/etapas", ['modelo_id' => array_values(array_filter($modelos, fn($m) => $m['nome'] === 'Obra (geral)'))[0]['id']]);
foreach ($o['etapas'] as $i => $x) [, $o] = $erica->req('PUT', "/ordens/$oid/etapas/" . $x['id'], ['situacao' => $i < 2 ? 'nao_aplica' : 'ok']);
ok('etapas da obra: 8 OK e 2 que não se aplicam = 100%', $o['progresso'] == 100 && $o['contagem']['nao_aplica'] === 2, $o['progresso']);
[$st] = $erica->req('POST', "/ordens/$oid/acoes", ['acao' => 'concluir', 'texto' => 'Obra entregue e limpa.']);
ok('obra acima do teto não pode ser concluída (409)', $st === 409, $st);
[, $o] = $celio->req('POST', "/ordens/$oid/gastos/" . $o['gastos'][0]['id'] . '/estorno', ['texto' => 'Adiantamento devolvido']);
ok('estornando, a obra volta para dentro do teto', $o['acima_teto'] === false && $o['gasto'] == 120000, $o);
[$st, $r] = $celio->req('POST', "/ordens/$oid/gastos", ['categoria' => 'material', 'descricao' => 'Tinta', 'valor' => 10, 'data' => '2999-01-01']);
ok('gasto com data futura é recusado', $st === 422 && isset($r['campos']['data']), $r);
[$st] = $edson->req('POST', "/ordens/$oid/gastos", ['categoria' => 'material', 'descricao' => 'Tinta', 'valor' => 10]);
ok('Equipe não lança gastos (409)', $st === 409, $st);
[, $o] = $erica->req('POST', "/ordens/$oid/acoes", ['acao' => 'pedir_teto', 'valor' => 250000, 'texto' => 'Apareceu infiltração na laje.']);
ok('Engenharia pede aumento do teto', $o['pedido_pendente'] === true && !in_array('pedir_teto', $o['acoes'], true), $o['acoes'] ?? $o);
[$st] = $erica->req('POST', "/ordens/$oid/acoes", ['acao' => 'pedir_teto', 'valor' => 260000, 'texto' => 'Outro pedido']);
ok('só um pedido de teto aberto por vez (409)', $st === 409, $st);
[$st] = $erica->req('POST', "/ordens/$oid/acoes", ['acao' => 'concluir', 'texto' => 'Obra entregue e limpa.']);
ok('não conclui com pedido de teto em aberto (409)', $st === 409, $st);
[$st, $r] = $pedro->req('POST', "/ordens/$oid/acoes", ['acao' => 'decidir_teto', 'decisao' => 'recusar']);
ok('recusar o teto exige explicação', $st === 422 && isset($r['campos']['texto']), $r);
[, $o] = $pedro->req('POST', "/ordens/$oid/acoes", ['acao' => 'decidir_teto', 'decisao' => 'aprovar']);
ok('aumento aprovado muda o teto', $o['teto'] == 250000 && $o['status'] === 'em_andamento' && $o['pedido_pendente'] === false, $o);
[, $o] = $celio->req('POST', "/ordens/$oid/gastos", ['categoria' => 'mao_de_obra', 'descricao' => 'Pintor', 'valor' => '70.000']);
ok('"70.000" é lido como setenta mil', $o['gastos'][0]['valor'] == 70000 && $o['gasto'] == 190000 && round($o['percentual_gasto'], 2) == 0.76, $o['gastos'][0] ?? $o);
$gid = $o['gastos'][0]['id'];
[$st] = $celio->req('POST', "/ordens/$oid/gastos/$gid/estorno", []);
ok('estorno exige motivo', $st === 422, $st);
[, $o] = $celio->req('POST', "/ordens/$oid/gastos/$gid/estorno", ['texto' => 'Lançado em dobro']);
ok('gasto estornado deixa de contar, mas continua na lista', $o['gasto'] == 120000 && $o['gastos'][0]['estornado'] === true && count($o['gastos']) === 3, $o);
[$st] = $celio->req('POST', "/ordens/$oid/gastos/$gid/estorno", ['texto' => 'De novo']);
ok('não estorna duas vezes (409)', $st === 409, $st);
ok('soma por tipo de gasto', $o['por_categoria']['material'] == 120000 && $o['por_categoria']['mao_de_obra'] == 0, $o['por_categoria']);
[$st, $r] = $erica->req('POST', "/ordens/$oid/acoes", ['acao' => 'pedir_teto', 'valor' => 50000, 'texto' => 'Reduzir']);
ok('teto novo não pode ficar abaixo do gasto', $st === 422 && isset($r['campos']['valor']), $r);

echo "\nObra — quem vê o quê e conclusão\n";
[$st, $o] = $rita->req('GET', "/ordens/$oid");
ok('a casa acompanha a obra e as etapas, sem os valores', $st === 200 && $o['teto'] === null && !isset($o['gastos']) && $o['ve_valores'] === false && $o['progresso'] == 100, $o);
[$st] = baixar($rita, $comprovante);
ok('a casa não abre a nota fiscal (404)', $st === 404, $st);
[$st] = baixar($carlos, $comprovante);
ok('Coordenação do grupo abre a nota fiscal', $st === 200, $st);
[, $lst] = $rita->req('GET', '/ordens');
ok('lista de OS da casa: valores escondidos na obra', $lst['total'] >= 1 && $lst['itens'][0]['gasto'] === null, $lst['itens'][0] ?? $lst);
[, $lst] = $erica->req('GET', '/ordens?tipo=obra');
ok('filtro de OS por tipo', $lst['total'] === 1 && $lst['itens'][0]['id'] === $oid, $lst['total']);
[, $lst] = $carlos->req('GET', '/chamados?busca=OS%203');
ok('busca o chamado pelo número da OS', $lst['total'] === 1 && $lst['itens'][0]['id'] === $o4, $lst['total']);
[$st, $r] = $erica->req('POST', "/ordens/$oid/acoes", ['acao' => 'concluir', 'texto' => 'ok']);
ok('concluir exige relatório final', $st === 422, $r);
[$st, $o] = $erica->req('POST', "/ordens/$oid/acoes", ['acao' => 'concluir', 'texto' => 'Forro trocado, laje impermeabilizada e salão pintado.']);
ok('Engenharia conclui a obra com relatório', $st === 200 && $o['status'] === 'concluida' && $o['relatorio_final'] !== null && $o['saldo'] == 130000, $o);
[$st] = $celio->req('POST', "/ordens/$oid/gastos", ['categoria' => 'material', 'descricao' => 'Tinta', 'valor' => 10]);
ok('obra concluída não aceita gastos (409)', $st === 409, $st);
$aud = db("SELECT acao FROM auditoria WHERE entidade = 'ordens_servico' AND entidade_id = ?", [$oid]);
ok('cada passo da obra fica na auditoria', count($aud) >= 7 && in_array('lancar_gasto', array_column($aud, 'acao'), true) && in_array('estornar_gasto', array_column($aud, 'acao'), true), count($aud));
$dupla = null;
try { db("INSERT INTO os_tetos (tenant_id, os_id, valor_novo, motivo, pedido_por) SELECT tenant_id, id, 1, 'x', ? FROM ordens_servico WHERE id = ?", [$u, $oid]);
      db("INSERT INTO os_tetos (tenant_id, os_id, valor_novo, motivo, pedido_por) SELECT tenant_id, id, 2, 'y', ? FROM ordens_servico WHERE id = ?", [$u, $oid]); }
catch (PDOException $ex) { $dupla = $ex->getCode(); }
ok('o próprio banco impede dois pedidos de teto abertos', $dupla === '23000', $dupla);

// ------------------------------------------------------------------ Engenharia abre obra direto e cancelamento
echo "\nObra aberta pela Engenharia e cancelamento\n";
[$st, $c5] = $erica->req('POST', '/chamados', ['casa_id' => $casa1['id'], 'categoria_id' => $cat('Piso e calçada'), 'local' => 'Calçada externa',
    'descricao' => 'Refazer toda a calçada da frente.', 'tipo' => 'obra']);
ok('Engenharia já abre o chamado como obra', $st === 201 && $c5['tipo'] === 'obra', $c5);
[$st, $c6] = $rita->req('POST', '/chamados', ['casa_id' => $casa1['id'], 'categoria_id' => $cat('Piso e calçada'), 'descricao' => 'Piso solto perto da porta.', 'tipo' => 'obra']);
ok('a casa abre sempre como serviço (o tipo é decidido na triagem)', $st === 201 && $c6['tipo'] === 'servico', $c6['tipo'] ?? $c6);
[, $r] = $erica->req('POST', '/chamados/' . $c5['id'] . '/acoes', ['acao' => 'triar', 'prioridade' => 'normal']);
ok('a triagem mantém o tipo escolhido', $r['tipo'] === 'obra' && $r['status'] === 'em_orcamento', $r);
$erica->req('POST', '/chamados/' . $c5['id'] . '/acoes', ['acao' => 'enviar_orcamento', 'valor' => 30000, 'servico' => 'Demolir e refazer a calçada.']);
[, $r] = $pedro->req('POST', '/chamados/' . $c5['id'] . '/acoes', ['acao' => 'aprovar']);
$os5 = $r['os']['id'];
[, $r] = $erica->req('POST', '/chamados/' . $c5['id'] . '/acoes', ['acao' => 'cancelar', 'texto' => 'Vai entrar na reforma maior.']);
[, $o] = $erica->req('GET', "/ordens/$os5");
ok('cancelar o chamado cancela a OS', $r['status'] === 'cancelado' && $o['status'] === 'cancelada' && $o['acoes'] === [], [$r['status'], $o['status']]);
[$st] = $erica->req('POST', "/ordens/$os5/etapas", ['nome' => 'Demolição']);
ok('OS cancelada não aceita etapas (409)', $st === 409, $st);
