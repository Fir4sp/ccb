<?php
declare(strict_types=1);

/**
 * Testes da Fase 6 (Estoques). Incluído por testes.php depois de testes_fase5.php.
 * Ponto de partida: o ciclo de Novembro foi recebido no Central e entregue.
 * Casa 1 recebeu 2 água sanitária + 2 papel higiênico; casa 3 recebeu 4 água + 2 desinfetante + 1 cera.
 */

echo "\nEstoques — DMLs e entrega do ciclo\n";
$saldoDe = fn(array $local, int $produto) => (array_values(array_filter($local['saldos'], fn($s) => $s['produto_id'] === $produto))[0]['quantidade'] ?? null);

[, $locais] = $rita->req('GET', '/estoque/locais');
ok('a casa vê só o DML da própria casa', $locais['central'] === null && count($locais['casas']) === 1 && $locais['casas'][0]['casa']['id'] === $casa1['id'], $locais);
$dml1 = $locais['casas'][0]['id'];
[, $l1] = $rita->req('GET', "/estoque/locais/$dml1");
ok('a entrega do ciclo entrou no DML da casa', $saldoDe($l1, $agua) === 2 && $saldoDe($l1, $papel) === 2 && $l1['movimentos'][0]['origem'] === 'distribuicao', [$saldoDe($l1, $agua), $saldoDe($l1, $papel)]);
ok('a casa só consulta (não conta nem lança)', $l1['acoes'] === [], $l1['acoes']);
[, $lc] = $cida->req('GET', '/estoque/locais');
$central = $lc['central']['id'];
[, $c] = $cida->req('GET', "/estoque/locais/$central");
ok('o DML Central ficou zerado depois de entregar tudo', $saldoDe($c, $agua) === 0 && $saldoDe($c, $papel) === 0, [$saldoDe($c, $agua), $saldoDe($c, $papel)]);
$tipos = array_count_values(array_column($c['movimentos'], 'origem'));
ok('o Central registra a chegada da compra e a saída da entrega', ($tipos['compra'] ?? 0) === 4 && ($tipos['distribuicao'] ?? 0) === 5, $tipos);
[$st] = $rita->req('GET', "/estoque/locais/$central");
ok('a casa não vê o DML Central (404)', $st === 404, $st);
[$st] = $lucia->req('GET', "/estoque/locais/$dml1");
ok('outra casa não vê o DML (404)', $st === 404, $st);
[$st] = $adminB->req('GET', "/estoque/locais/$dml1");
ok('outro tenant não vê o DML (404)', $st === 404, $st);

echo "\nEstoques — contagem nas casas\n";
[$st] = $rita->req('POST', "/estoque/locais/$dml1/contagem", ['itens' => [['produto_id' => $agua, 'contado' => 1]]]);
ok('a casa não faz a contagem (403)', $st === 403, $st);
[$st] = $bia->req('POST', "/estoque/locais/$dml1/contagem", ['itens' => [['produto_id' => $agua, 'contado' => 1]]]);
ok('orientadora de outro grupo não conta (404)', $st === 404, $st);
[$st, $l1] = $olga->req('POST', "/estoque/locais/$dml1/contagem", ['itens' => [['produto_id' => $agua, 'contado' => 1], ['produto_id' => $papel, 'contado' => 2]], 'observacao' => 'Visita de outubro']);
ok('a orientadora conta o DML da casa', $st === 200 && $saldoDe($l1, $agua) === 1 && $l1['inventarios'][0]['diferencas'] === 1, $l1['inventarios'][0] ?? $l1);
ok('a diferença vira movimento de contagem (consumo)', $l1['movimentos'][0]['origem'] === 'inventario' && $l1['movimentos'][0]['quantidade'] === -1, $l1['movimentos'][0]);
[$st] = $olga->req('POST', "/estoque/locais/$dml1/contagem", ['itens' => [['produto_id' => $agua, 'contado' => -2]]]);
ok('contagem negativa é recusada', $st === 422, $st);

echo "\nEstoques — DML Central\n";
[$st] = $olga->req('POST', "/estoque/locais/$central/contagem", ['itens' => [['produto_id' => $agua, 'contado' => 9]]]);
ok('orientadora vê o Central mas não conta (403)', $st === 403, $st);
[$st] = $olga->req('POST', "/estoque/locais/$central/movimentos", ['tipo' => 'entrada', 'motivo' => 'Doação', 'itens' => [['produto_id' => $agua, 'quantidade' => 1]]]);
ok('só a Coordenação CNS lança no Central (403)', $st === 403, $st);
[$st, $r] = $cida->req('POST', "/estoque/locais/$central/movimentos", ['tipo' => 'entrada', 'itens' => [['produto_id' => $agua, 'quantidade' => 10]]]);
ok('lançamento exige motivo', $st === 422 && isset($r['campos']['motivo']), $r);
[, $c] = $cida->req('POST', "/estoque/locais/$central/movimentos", ['tipo' => 'entrada', 'motivo' => 'Doação de um irmão', 'itens' => [['produto_id' => $agua, 'quantidade' => 10]]]);
ok('entrada manual no Central', $saldoDe($c, $agua) === 10, $saldoDe($c, $agua));
[, $c] = $cida->req('POST', "/estoque/locais/$central/movimentos", ['tipo' => 'saida', 'motivo' => 'Galão furado', 'itens' => [['produto_id' => $agua, 'quantidade' => 3]]]);
ok('saída manual no Central', $saldoDe($c, $agua) === 7, $saldoDe($c, $agua));
[$st, $r] = $cida->req('POST', "/estoque/locais/$central/movimentos", ['tipo' => 'saida', 'motivo' => 'Teste', 'itens' => [['produto_id' => $agua, 'quantidade' => 20]]]);
ok('o saldo nunca fica negativo', $st === 422 && str_contains($r['campos']['quantidade'] ?? '', 'só há 7'), $r);
[, $c] = $cida->req('POST', "/estoque/locais/$central/movimentos", ['tipo' => 'enviar', 'casa_id' => $casa3['id'], 'motivo' => 'Faltou para a Santa Ceia', 'itens' => [['produto_id' => $agua, 'quantidade' => 2]]]);
$dml3 = $lc['casas'][array_search($casa3['id'], array_map(fn($x) => $x['casa']['id'], $lc['casas']), true)]['id'];
[, $l3] = $lucia->req('GET', "/estoque/locais/$dml3");
ok('envio avulso sai do Central e entra na casa', $saldoDe($c, $agua) === 5 && $saldoDe($l3, $agua) === 6, [$saldoDe($c, $agua), $saldoDe($l3, $agua)]);
[, $p] = $cida->req('PUT', '/cns/produtos/' . $agua, ['nome' => 'Água sanitária', 'embalagem' => 'galão 5 L', 'unidade' => 'galão', 'categoria' => 'limpeza', 'minimo_central' => 8]);
[, $lc] = $cida->req('GET', '/estoque/locais');
ok('o Central avisa o que está abaixo do mínimo', ($lc['central']['abaixo_minimo'][0]['nome'] ?? '') === 'Água sanitária' && $lc['central']['abaixo_minimo'][0]['quantidade'] === 5, $lc['central']['abaixo_minimo']);

echo "\nEstoques — conferência com o saldo da casa e entrega com falta\n";
[, $loja] = $rita->req('PUT', '/cns/loja', ['casa_id' => $casa1['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 3]]]);
$pidDez = $loja['pedido']['id'];
$rita->req('POST', "/cns/pedidos/$pidDez/acoes", ['acao' => 'enviar']);
[, $ped] = $olga->req('GET', "/cns/pedidos/$pidDez");
ok('na conferência, a orientadora vê quanto a casa tem e quando foi contado', $ped['itens'][0]['na_casa'] === 1 && $ped['itens'][0]['contado_em'] !== null, $ped['itens'][0]);
$olga->req('POST', "/cns/pedidos/$pidDez/acoes", ['acao' => 'aprovar']);
$cida->req('POST', "/cns/pedidos/$pidDez/acoes", ['acao' => 'aprovar']);
$cida->req('POST', '/cns/ciclos/' . $c2['id'] . '/acoes', ['acao' => 'fechar']);
$cida->req('POST', '/cns/ciclos/' . $c2['id'] . '/acoes', ['acao' => 'liberar_compras']);
$celio->req('POST', '/cns/ciclos/' . $c2['id'] . '/acoes', ['acao' => 'comprado']);
[$st, $r] = $cida->req('POST', '/cns/ciclos/' . $c2['id'] . '/acoes', ['acao' => 'distribuido']);
ok('não entrega antes de registrar a chegada da compra (409)', $st === 409 && str_contains($r['erro'], 'chegada'), $r);
[, $res] = $cida->req('GET', '/cns/resumo');
ok('a Coordenação recebe o aviso para registrar a chegada', $res['tarefa_ciclo'] === 'receber', $res['tarefa_ciclo']);
$cida->req('POST', "/estoque/locais/$central/movimentos", ['tipo' => 'saida', 'motivo' => 'Levado para o galpão', 'itens' => [['produto_id' => $agua, 'quantidade' => 5]]]);
[$st] = $rita->req('POST', '/cns/ciclos/' . $c2['id'] . '/receber', ['itens' => [['produto_id' => $agua, 'quantidade' => 1]]]);
ok('a casa não registra a chegada da compra (403)', $st === 403, $st);
[, $cc] = $cida->req('POST', '/cns/ciclos/' . $c2['id'] . '/receber', ['itens' => [['produto_id' => $agua, 'quantidade' => 1]], 'texto' => 'O fornecedor só tinha um galão.']);
ok('chegada da compra registrada no Central', $cc['estoque_recebido_em'] !== null, $cc);
[$st] = $cida->req('POST', '/cns/ciclos/' . $c2['id'] . '/receber', ['itens' => [['produto_id' => $agua, 'quantidade' => 1]]]);
ok('a chegada só é registrada uma vez (409)', $st === 409, $st);
[$st, $r] = $cida->req('POST', '/cns/ciclos/' . $c2['id'] . '/acoes', ['acao' => 'distribuido']);
$faltas = json_decode($r['campos']['faltas'] ?? '[]', true);
ok('faltando no Central, a entrega mostra o que falta', $st === 422 && ($faltas[0]['precisa'] ?? 0) === 3 && ($faltas[0]['tem'] ?? -1) === 1, $r);
[$st] = $cida->req('POST', '/cns/ciclos/' . $c2['id'] . '/acoes', ['acao' => 'distribuido', 'forcar' => true]);
[, $l1] = $rita->req('GET', "/estoque/locais/$dml1");
[, $ped] = $rita->req('GET', "/cns/pedidos/$pidDez");
ok('entregando assim mesmo, vai o que tem e o pedido registra o que faltou', $st === 200 && $saldoDe($l1, $agua) === 2 && str_contains(end($ped['eventos'])['texto'] ?? '', 'faltaram 2'), [$saldoDe($l1, $agua), end($ped['eventos'])]);
$neg = null;
try { db('UPDATE estoque_saldos SET quantidade = -1 WHERE local_id = ? AND produto_id = ?', [$dml1, $agua]); } catch (PDOException $e) { $neg = $e->getCode(); }
ok('o próprio banco não aceita saldo negativo', $neg !== null, $neg);
