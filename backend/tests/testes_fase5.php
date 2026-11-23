<?php
declare(strict_types=1);

/**
 * Testes da Fase 5 (CNS Limpeza). Incluído por testes.php depois de testes_fase4.php.
 * Casas: $casa1 e $casa2 (Grupo 8.1, orientadoras Olga e Ana; usuária Rita na casa1), $casa3 (Grupo 8.2, usuária Lúcia, sem orientadora).
 * Bia é orientadora do Grupo 8.3 (sem casas aqui): serve para checar que orientadora de outro grupo não vê nada.
 */

echo "\nCNS Limpeza — ciclo e catálogo\n";
$criarU(['nome' => 'Cida Coordenação CNS', 'email' => 'cida@a.test', 'perfis' => [['perfil' => 'coordenacao_cns']]]);
$cida = entrar('cida@a.test');
$ana = entrar('ana@a.test');
$criarU(['nome' => 'Bia Orientadora 8.3', 'email' => 'bia@a.test', 'perfis' => [['perfil' => 'orientadora_cns', 'grupo_id' => $grupos[2]['id']]]]);
$bia = entrar('bia@a.test');
$hoje = date('Y-m-d');
$semana = date('Y-m-d', strtotime('+7 days'));

[$st, $r] = $rita->req('GET', '/cns/loja?casa_id=' . $casa1['id']);
ok('sem ciclo aberto, a loja avisa e não mostra produtos', $st === 200 && $r['ciclo'] === null && $r['produtos'] === [], $r);
[$st] = $rita->req('POST', '/cns/ciclos', ['nome' => 'Novembro', 'prazo' => $semana]);
ok('casa não abre ciclo (403)', $st === 403, $st);
[$st, $r] = $cida->req('POST', '/cns/ciclos', ['nome' => 'Novembro/2026', 'prazo' => '2020-01-01']);
ok('prazo no passado é recusado', $st === 422 && isset($r['campos']['prazo']), $r);
[$st, $ciclo] = $cida->req('POST', '/cns/ciclos', ['nome' => 'Novembro/2026', 'prazo' => $semana]);
ok('Coordenação CNS abre o ciclo com prazo', $st === 201 && $ciclo['status'] === 'aberto' && $ciclo['prazo'] === $semana, $ciclo);
[$st] = $cida->req('POST', '/cns/ciclos', ['nome' => 'Outro', 'prazo' => $semana]);
ok('só um ciclo aberto por vez (409)', $st === 409, $st);

[, $loja] = $rita->req('GET', '/cns/loja?casa_id=' . $casa1['id']);
ok('a loja mostra os 17 produtos do catálogo inicial', count($loja['produtos']) === 17 && $loja['pedido'] === null && $loja['acoes'] === ['editar'], [count($loja['produtos']), $loja['acoes']]);
ok('a casa recebe o campo de preço, mas não o fornecedor nem o estoque do Central', array_key_exists('preco_ref', $loja['produtos'][0]) && $loja['produtos'][0]['fornecedor'] === null && $loja['produtos'][0]['no_central'] === null);
$prod = array_column($loja['produtos'], 'id', 'nome');
$agua = $prod['Água sanitária'];
$papel = $prod['Papel higiênico'];
$sabao = $prod['Sabão em pó'];

[, $p] = $cida->req('PUT', '/cns/produtos/' . $papel, ['nome' => 'Papel higiênico', 'embalagem' => 'fardo 64 rolos', 'unidade' => 'fardo', 'categoria' => 'banheiro', 'max_por_pedido' => 4, 'preco_ref' => '89,90']);
ok('Coordenação ajusta limite e preço de referência', $p['max_por_pedido'] === 4 && $p['preco_ref'] == 89.9, $p);
[, $p] = $cida->req('PUT', '/cns/produtos/' . $sabao, ['nome' => 'Sabão em pó', 'embalagem' => 'caixa 1 kg', 'unidade' => 'caixa', 'categoria' => 'limpeza', 'ativo' => false]);
ok('Coordenação desativa um produto', $p['ativo'] === false, $p);
[$st, $novo] = $cida->req('POST', '/cns/produtos', ['nome' => 'Cera líquida', 'embalagem' => 'galão 5 L', 'unidade' => 'galão', 'categoria' => 'limpeza', 'preco_ref' => '45']);
ok('Coordenação cadastra produto', $st === 201 && $novo['nome'] === 'Cera líquida', $novo);
[, $p] = $cida->req('POST', '/cns/produtos/' . $agua . '/foto', ['arquivo' => jpeg(), 'nome' => 'agua.jpg']);
ok('produto ganha foto', $p['foto_url'] !== null, $p);
[$st] = baixar($rita, $p['foto_url']);
ok('a casa vê a foto do produto', $st === 200, $st);
[$st] = baixar($adminB, $p['foto_url']);
ok('outro tenant não vê a foto (404)', $st === 404, $st);
[$st] = $rita->req('POST', '/cns/produtos', ['nome' => 'X', 'unidade' => 'un', 'categoria' => 'limpeza']);
ok('casa não mexe no catálogo (403)', $st === 403, $st);

echo "\nCNS Limpeza — pedido da casa\n";
[$st, $r] = $rita->req('PUT', '/cns/loja', ['casa_id' => $casa1['id'], 'itens' => [['produto_id' => $papel, 'quantidade' => 5]]]);
ok('respeita o limite por pedido', $st === 422 && str_contains(json_encode($r['campos'], JSON_UNESCAPED_UNICODE), 'no máximo 4'), $r);
[$st, $r] = $rita->req('PUT', '/cns/loja', ['casa_id' => $casa1['id'], 'itens' => [['produto_id' => $sabao, 'quantidade' => 1]]]);
ok('produto desativado não entra no pedido', $st === 422, $r);
[$st, $r] = $rita->req('PUT', '/cns/loja', ['casa_id' => $casa1['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => -1]]]);
ok('quantidade negativa é recusada', $st === 422, $r);
[$st, $loja] = $rita->req('PUT', '/cns/loja', ['casa_id' => $casa1['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 3], ['produto_id' => $papel, 'quantidade' => 2], ['produto_id' => $prod['Rodo'], 'quantidade' => 0]]]);
ok('casa monta o carrinho (item com zero sai)', $st === 200 && $loja['pedido']['status'] === 'rascunho' && count($loja['pedido']['itens']) === 2 && in_array('enviar', $loja['acoes'], true), $loja['pedido'] ?? $loja);
$pid1 = $loja['pedido']['id'];
[$st] = $rita->req('PUT', '/cns/loja', ['casa_id' => $casa3['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 1]]]);
ok('casa não faz pedido para outra casa (404)', $st === 404, $st);
[$st] = $olga->req('GET', "/cns/pedidos/$pid1");
ok('a orientadora do grupo vê o pedido', $st === 200, $st);
[$st] = $ana->req('GET', "/cns/pedidos/$pid1");
ok('a outra orientadora do mesmo grupo também vê', $st === 200, $st);
[$st] = $bia->req('GET', "/cns/pedidos/$pid1");
ok('orientadora de outro grupo não vê o pedido (404)', $st === 404, $st);
[$st] = $olga->req('POST', "/cns/pedidos/$pid1/acoes", ['acao' => 'aprovar']);
ok('não se aprova pedido que não foi enviado (409)', $st === 409, $st);
[, $r] = $rita->req('POST', "/cns/pedidos/$pid1/acoes", ['acao' => 'enviar']);
ok('casa envia o pedido', $r['status'] === 'enviado' && $r['enviado_por'] === 'Rita da Casa Jardim', $r);
[$st] = $rita->req('PUT', '/cns/loja', ['casa_id' => $casa1['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 9]]]);
ok('pedido enviado não muda sem desfazer o envio (409)', $st === 409, $st);
[, $r] = $rita->req('POST', "/cns/pedidos/$pid1/acoes", ['acao' => 'desfazer_envio']);
ok('casa desfaz o envio para corrigir', $r['status'] === 'rascunho', $r);
$rita->req('POST', "/cns/pedidos/$pid1/acoes", ['acao' => 'enviar']);

echo "\nCNS Limpeza — conferência\n";
[, $res] = $olga->req('GET', '/cns/resumo');
ok('orientadora recebe o aviso de conferência', $res['conferir'] === 1 && $res['para_mim'] >= 1, $res);
[, $r] = $olga->req('POST', "/cns/pedidos/$pid1/acoes", ['acao' => 'aprovar', 'itens' => [['produto_id' => $agua, 'quantidade_aprovada' => 2]], 'texto' => 'Ainda tem um galão no DML.']);
$itens = array_column($r['itens'], 'quantidade_aprovada', 'produto_id');
ok('orientadora faz a 1ª análise ajustando a quantidade: vai para a coordenação', $r['status'] === 'conferido' && $r['status_nome'] === 'Com a coordenação' && $itens[$agua] === 2 && $itens[$papel] === 2, $r);
ok('o ajuste fica registrado no pedido', str_contains(end($r['eventos'])['texto'] ?? '', 'Água sanitária: 3 → 2'), end($r['eventos']));
[$st] = $olga->req('POST', "/cns/pedidos/$pid1/acoes", ['acao' => 'aprovar']);
ok('a orientadora não faz a análise final (409)', $st === 409, $st);
[, $res] = $cida->req('GET', '/cns/resumo');
ok('a Coordenação recebe o aviso da análise final', $res['conferir'] === 1, $res);
[, $r] = $cida->req('GET', "/cns/pedidos/$pid1");
ok('para a Coordenação, é a análise final', $r['etapa_analise'] === 'final' && $r['para_mim'] === true && $r['conferido_por'] === 'Olga Orientadora', $r);
[, $r] = $cida->req('POST', "/cns/pedidos/$pid1/acoes", ['acao' => 'aprovar', 'itens' => [['produto_id' => $agua, 'quantidade_aprovada' => 2]]]);
ok('Coordenação aprova na análise final (mantendo o ajuste da orientadora)', $r['status'] === 'aprovado' && $r['analisado_por'] === 'Cida Coordenação CNS' && array_column($r['itens'], 'quantidade_aprovada', 'produto_id')[$agua] === 2, $r);

[, $loja3] = $lucia->req('PUT', '/cns/loja', ['casa_id' => $casa3['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 4], ['produto_id' => $novo['id'], 'quantidade' => 1]]]);
$pid3 = $loja3['pedido']['id'];
$lucia->req('POST', "/cns/pedidos/$pid3/acoes", ['acao' => 'enviar']);
[, $res] = $cida->req('GET', '/cns/resumo');
ok('sem orientadora, a Coordenação CNS recebe o aviso', $res['conferir'] === 1, $res);
[$st] = $cida->req('POST', "/cns/pedidos/$pid3/acoes", ['acao' => 'devolver']);
ok('devolver exige motivo', $st === 422, $st);
[, $r] = $cida->req('POST', "/cns/pedidos/$pid3/acoes", ['acao' => 'devolver', 'texto' => 'Faltou o desinfetante?']);
ok('Coordenação devolve para ajuste', $r['status'] === 'devolvido' && $r['motivo'] === 'Faltou o desinfetante?', $r);
[, $loja3] = $lucia->req('PUT', '/cns/loja', ['casa_id' => $casa3['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 4], ['produto_id' => $novo['id'], 'quantidade' => 1], ['produto_id' => $prod['Desinfetante'], 'quantidade' => 2]]]);
ok('a casa corrige o pedido devolvido', count($loja3['pedido']['itens']) === 3, $loja3['pedido']);
$lucia->req('POST', "/cns/pedidos/$pid3/acoes", ['acao' => 'enviar']);
[, $lst] = $cida->req('GET', '/cns/pedidos');
ok('a lista mostra quais casas ainda não pediram', array_column($lst['sem_pedido'], 'id') === [$casa2['id']], $lst['sem_pedido']);
[, $loja2] = $ana->req('PUT', '/cns/loja', ['casa_id' => $casa2['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 1]]]);
ok('orientadora também pode montar o pedido da casa', $loja2['pedido']['status'] === 'rascunho', $loja2['pedido']);
[, $lst] = $cida->req('GET', '/cns/pedidos');
ok('a lista mostra os pedidos das três casas, enviados primeiro', count($lst['itens']) === 3 && $lst['sem_pedido'] === [] && $lst['itens'][0]['status'] === 'enviado', [count($lst['itens']), $lst['itens'][0]['status'] ?? null]);

echo "\nCNS Limpeza — prazo, fechamento e compra\n";
db('UPDATE cns_ciclos SET prazo = ? WHERE id = ?', [date('Y-m-d', strtotime('-1 day')), $ciclo['id']]);
[$st, $r] = $lucia->req('POST', "/cns/pedidos/$pid3/acoes", ['acao' => 'desfazer_envio']);
ok('depois do prazo a casa não mexe mais no pedido', $st === 409 && str_contains($r['erro'], 'prazo'), $r);
[$st] = $ana->req('PUT', '/cns/loja', ['casa_id' => $casa2['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 2]]]);
ok('nem no carrinho', $st === 409, $st);
[, $res] = $cida->req('GET', '/cns/resumo');
ok('Coordenação recebe o aviso para fechar o ciclo', $res['tarefa_ciclo'] === 'fechar', $res);
[$st] = $rita->req('POST', '/cns/ciclos/' . $ciclo['id'] . '/acoes', ['acao' => 'fechar']);
ok('casa não fecha o ciclo (409)', $st === 409, $st);
[$st] = $celio->req('GET', '/cns/ciclos/' . $ciclo['id'] . '/consolidado');
ok('Compras vê o consolidado', $st === 200, $st);
[, $c] = $cida->req('POST', '/cns/ciclos/' . $ciclo['id'] . '/acoes', ['acao' => 'fechar', 'aprovar_enviados' => true]);
ok('Coordenação fecha o ciclo aprovando os enviados', $c['status'] === 'fechado', $c);
$st3 = db('SELECT status FROM cns_pedidos WHERE id = ?', [$pid3])[0]['status'];
$st2 = db('SELECT status, motivo FROM cns_pedidos WHERE id = ?', [$loja2['pedido']['id']])[0];
ok('pedido enviado entra como estava; rascunho fica fora', $st3 === 'aprovado' && $st2['status'] === 'cancelado', [$st3, $st2]);

[$st] = $rita->req('GET', '/cns/ciclos/' . $ciclo['id'] . '/consolidado');
ok('casa não vê o consolidado (403)', $st === 403, $st);
[, $cons] = $celio->req('GET', '/cns/ciclos/' . $ciclo['id'] . '/consolidado');
$tot = array_column($cons['produtos'], 'total', 'nome');
ok('consolidado soma o aprovado por produto', $tot['Água sanitária'] === 6 && $tot['Papel higiênico'] === 2 && $tot['Desinfetante'] === 2 && $tot['Cera líquida'] === 1, $tot);
ok('consolidado separa por grupo e casa', count($cons['grupos']) === 2 && $cons['casas'] === 2, $cons['grupos']);
ok('estimativa usa os preços de referência', abs($cons['estimado'] - (2 * 89.9 + 45)) < 0.01 && $cons['sem_preco'] === 2, [$cons['estimado'], $cons['sem_preco']]);

[$st] = $cida->req('POST', '/cns/ciclos/' . $ciclo['id'] . '/acoes', ['acao' => 'distribuido']);
ok('não distribui antes da compra (409)', $st === 409, $st);
[$st, $r] = $celio->req('POST', '/cns/ciclos/' . $ciclo['id'] . '/acoes', ['acao' => 'comprado']);
ok('Compras só compra depois que a Coordenação libera a lista (409)', $st === 409 && str_contains($r['erro'], 'liberou'), $r);
[, $res] = $cida->req('GET', '/cns/resumo');
ok('Coordenação recebe o aviso para consolidar', $res['tarefa_ciclo'] === 'consolidar', $res['tarefa_ciclo']);
[$st, $cons2] = $cida->req('PUT', '/cns/ciclos/' . $ciclo['id'] . '/compra', ['itens' => [['produto_id' => $agua, 'quantidade' => 10]]]);
$compra = array_column($cons2['produtos'], 'comprar', 'nome');
ok('Coordenação ajusta quanto comprar (o resto fica com a sugestão)', $st === 200 && $compra['Água sanitária'] === 10 && $compra['Papel higiênico'] === 2 && $cons2['lista_salva'] === true, $compra);
[$st] = $celio->req('PUT', '/cns/ciclos/' . $ciclo['id'] . '/compra', ['itens' => [['produto_id' => $agua, 'quantidade' => 1]]]);
ok('Compras não mexe na lista da Coordenação (403)', $st === 403, $st);
[, $c] = $cida->req('POST', '/cns/ciclos/' . $ciclo['id'] . '/acoes', ['acao' => 'liberar_compras']);
ok('Coordenação libera a lista para Compras', $c['liberado_compras_em'] !== null && $c['status_nome'] === 'Lista de compra com Compras', $c);
[$st] = $cida->req('PUT', '/cns/ciclos/' . $ciclo['id'] . '/compra', ['itens' => [['produto_id' => $agua, 'quantidade' => 1]]]);
ok('lista liberada não muda sem reabrir (409)', $st === 409, $st);
[, $res] = $celio->req('GET', '/cns/resumo');
ok('Compras recebe o aviso da compra', $res['tarefa_ciclo'] === 'comprar', $res);
[, $c] = $celio->req('POST', '/cns/ciclos/' . $ciclo['id'] . '/acoes', ['acao' => 'comprado', 'valor' => '1.234,50', 'texto' => 'Atacadão']);
ok('Compras registra a compra', $c['status'] === 'comprado' && $c['valor_compra'] == 1234.5, $c);
[$st] = $rita->req('POST', "/cns/pedidos/$pid1/acoes", ['acao' => 'confirmar_recebimento']);
ok('casa só confirma depois da entrega (409)', $st === 409, $st);
// (Fase 6) antes de entregar, a compra entra no DML Central
$cida->req('POST', '/cns/ciclos/' . $ciclo['id'] . '/receber', ['itens' => array_map(fn($p) => ['produto_id' => $p['produto_id'], 'quantidade' => $p['total']], $cons['produtos'])]);
$cida->req('POST', '/cns/ciclos/' . $ciclo['id'] . '/acoes', ['acao' => 'distribuido']);
[, $res] = $rita->req('GET', '/cns/resumo');
ok('casa recebe o aviso para confirmar o recebimento', $res['para_mim'] === 1, $res);
[, $r] = $rita->req('POST', "/cns/pedidos/$pid1/acoes", ['acao' => 'confirmar_recebimento', 'texto' => 'Veio tudo certo.']);
ok('casa confirma que recebeu', $r['status'] === 'entregue' && $r['recebido_por'] === 'Rita da Casa Jardim', $r);

[$st, $c2] = $cida->req('POST', '/cns/ciclos', ['nome' => 'Dezembro/2026', 'prazo' => $semana]);
ok('com o anterior encerrado, abre o próximo ciclo', $st === 201, $c2);
$dupla = null;
try { db("UPDATE cns_ciclos SET status = 'aberto' WHERE id = ?", [$ciclo['id']]); } catch (PDOException $e) { $dupla = $e->getCode(); }
ok('o próprio banco impede dois ciclos abertos', $dupla === '23000', $dupla);
[$st] = $adminB->req('GET', "/cns/pedidos/$pid1");
ok('outro tenant não vê o pedido (404)', $st === 404, $st);
[, $pb] = $adminB->req('GET', '/cns/produtos');
ok('cada tenant tem o seu catálogo', count($pb['produtos']) === 17, count($pb['produtos']));
