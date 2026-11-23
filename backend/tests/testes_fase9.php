<?php
declare(strict_types=1);

/**
 * Testes da v1.9.0: loja de limpeza — agenda automática, preço e total para a casa, tamanhos, fornecedor,
 * 1ª análise (orientadora do grupo) + análise final (Coordenação CNS), consolidação com o DML Central e lista por fornecedor.
 * Incluído por testes.php no fim. Usa $cida (Coordenação CNS), $olga e $ana (orientadoras 8.1), $bia (orientadora 8.3),
 * $rita (casa1), $lucia (casa3, grupo 8.2 sem orientadora), $celio (Compras).
 */

echo "\nLoja v1.9 — agenda de abertura automática\n";
[$st] = $rita->req('GET', '/cns/agenda');
ok('a casa não vê a agenda (403)', $st === 403, $st);
[$st, $r] = $cida->req('PUT', '/cns/agenda', ['ativa' => true, 'dia_abertura' => 29, 'dia_prazo' => 10]);
ok('dia de abertura vai de 1 a 28', $st === 422 && isset($r['campos']['dia_abertura']), $r);
[$st, $r] = $cida->req('PUT', '/cns/agenda', ['ativa' => true, 'dia_abertura' => 5, 'dia_prazo' => 5]);
ok('prazo e abertura no mesmo dia são recusados', $st === 422 && isset($r['campos']['dia_prazo']), $r);
// Sem ciclo aberto e sem referência de mês, para o teste valer em qualquer dia do mês.
db('UPDATE cns_ciclos SET referencia = NULL');
$antes = (int) db('SELECT COUNT(*) n FROM cns_ciclos WHERE tenant_id = (SELECT tenant_id FROM usuarios WHERE email = ?)', ['cida@a.test'])[0]['n'];
// Abre dia 28 e o prazo é dia 27 do mês seguinte: qualquer dia de hoje cai dentro de uma janela.
[$st, $ag] = $cida->req('PUT', '/cns/agenda', ['ativa' => true, 'dia_abertura' => 28, 'dia_prazo' => 27]);
ok('Coordenação liga a agenda', $st === 200 && $ag['ativa'] === true && $ag['dia_abertura'] === 28 && $ag['dia_prazo'] === 27, $ag);
[, $res] = $rita->req('GET', '/cns/resumo');
$auto = $res['ciclo'];
ok('dentro da janela, o ciclo do mês abre sozinho', $auto !== null && $auto['status'] === 'aberto' && $auto['automatico'] === true && substr($auto['prazo'], 8, 2) === '27', $auto);
$meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
ok('o nome é o mês do prazo', $auto['nome'] === $meses[(int) substr($auto['prazo'], 5, 2) - 1] . '/' . substr($auto['prazo'], 0, 4), $auto['nome']);
$lucia->req('GET', '/cns/resumo');
$cida->req('GET', '/cns/ciclos');
$depois = (int) db('SELECT COUNT(*) n FROM cns_ciclos WHERE tenant_id = (SELECT tenant_id FROM usuarios WHERE email = ?)', ['cida@a.test'])[0]['n'];
ok('abre uma vez só, mesmo com vários acessos', $depois === $antes + 1, [$antes, $depois]);
$ev = db("SELECT usuario_id, texto FROM cns_eventos WHERE ciclo_id = ? AND tipo = 'ciclo_aberto'", [$auto['id']]);
ok('o histórico mostra que foi o sistema', count($ev) === 1 && $ev[0]['usuario_id'] === null && str_contains($ev[0]['texto'], 'automaticamente'), $ev);
[, $cfg] = $adminA->req('GET', '/configuracoes');
ok('a agenda não aparece nas configurações do administrador', !array_key_exists('cns_agenda_ativa', $cfg), array_keys($cfg));
[$st] = $adminA->req('PUT', '/configuracoes', $cfg);
ok('e as configurações continuam salvando', $st === 200, $st);

echo "\nLoja v1.9 — catálogo com fornecedor e tamanhos\n";
$prodBase = ['unidade' => 'par', 'categoria' => 'epi', 'fornecedor' => 'Soft Works', 'familia' => 'Sapato antiderrapante BB65'];
[$st, $r] = $cida->req('POST', '/cns/produtos', $prodBase + ['nome' => 'Sapato BB65 nº 36']);
ok('produto com família exige o tamanho', $st === 422 && isset($r['campos']['variacao']), $r);
[$st, $s36] = $cida->req('POST', '/cns/produtos', $prodBase + ['nome' => 'Sapato BB65 nº 36', 'variacao' => '36', 'preco_ref' => '59,90']);
[, $s37] = $cida->req('POST', '/cns/produtos', $prodBase + ['nome' => 'Sapato BB65 nº 37', 'variacao' => '37', 'preco_ref' => '59,90']);
ok('Coordenação cadastra o produto com tamanho e fornecedor', $st === 201 && $s36['familia'] === 'Sapato antiderrapante BB65' && $s36['variacao'] === '36' && $s36['fornecedor'] === 'Soft Works' && $s36['categoria'] === 'epi', $s36);
[$st, $r] = $cida->req('POST', '/cns/produtos', ['nome' => 'Saboneteira espuma', 'unidade' => 'unidade', 'categoria' => 'equipamentos', 'fornecedor' => 'Fortcom']);
ok('categoria nova: dispensers e peças', $st === 201 && $r['categoria'] === 'equipamentos', $r);
$prod = array_column($cida->req('GET', '/cns/produtos')[1]['produtos'], null, 'nome');
$agua = $prod['Água sanitária']['id'];
$papel = $prod['Papel higiênico']['id'];
$cida->req('PUT', "/cns/produtos/$agua", ['nome' => 'Água sanitária', 'embalagem' => 'galão 5 L', 'unidade' => 'galão', 'categoria' => 'limpeza', 'preco_ref' => '10,50', 'fornecedor' => 'Lótus', 'minimo_central' => 8]);

echo "\nLoja v1.9 — a casa vê preço e total\n";
[, $loja] = $rita->req('GET', '/cns/loja?casa_id=' . $casa1['id']);
$naLoja = array_column($loja['produtos'], null, 'id');
ok('a casa vê o preço do produto, sem o fornecedor', $naLoja[$agua]['preco_ref'] == 10.5 && $naLoja[$agua]['fornecedor'] === null, $naLoja[$agua]);
ok('a loja traz os tamanhos para agrupar', $naLoja[$s36['id']]['familia'] === 'Sapato antiderrapante BB65' && $naLoja[$s37['id']]['variacao'] === '37', $naLoja[$s37['id']]);
[, $loja] = $rita->req('PUT', '/cns/loja', ['casa_id' => $casa1['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 2], ['produto_id' => $s37['id'], 'quantidade' => 1], ['produto_id' => $papel, 'quantidade' => 1]]]);
$pA = $loja['pedido'];
ok('o pedido mostra o total e quantos itens estão sem preço', abs($pA['total'] - (2 * 10.5 + 59.9 + 89.9)) < 0.01 && $pA['sem_preco'] === 0, [$pA['total'], $pA['sem_preco']]);
$rita->req('POST', '/cns/pedidos/' . $pA['id'] . '/acoes', ['acao' => 'enviar']);
$cida->req('PUT', "/cns/produtos/$agua", ['nome' => 'Água sanitária', 'embalagem' => 'galão 5 L', 'unidade' => 'galão', 'categoria' => 'limpeza', 'preco_ref' => '99', 'fornecedor' => 'Lótus', 'minimo_central' => 8]);
[, $pA] = $rita->req('GET', '/cns/pedidos/' . $pA['id']);
ok('mudar o preço do catálogo não muda o pedido já enviado', $pA['itens'][array_search($agua, array_column($pA['itens'], 'produto_id'), true)]['preco'] == 10.5, $pA['itens']);
$cida->req('PUT', "/cns/produtos/$agua", ['nome' => 'Água sanitária', 'embalagem' => 'galão 5 L', 'unidade' => 'galão', 'categoria' => 'limpeza', 'preco_ref' => '10,50', 'fornecedor' => 'Lótus', 'minimo_central' => 8]);

echo "\nLoja v1.9 — orientadora do grupo e as duas análises\n";
[, $res] = $olga->req('GET', '/cns/resumo');
$casasOlga = array_column($res['casas'], 'casa_id'); sort($casasOlga);
ok('a orientadora acompanha todas as casas do grupo', $casasOlga === [$casa1['id'], $casa2['id']] && $res['conferir'] === 1, $res);
[, $res] = $bia->req('GET', '/cns/resumo');
ok('orientadora de outro grupo não recebe nada', $res['conferir'] === 0 && $res['casas'] === [], $res);
[, $r] = $ana->req('GET', '/cns/pedidos/' . $pA['id']);
ok('para a orientadora é a 1ª análise', $r['etapa_analise'] === 'primeira' && $r['tem_orientadora'] === true, $r['etapa_analise']);
[, $r] = $ana->req('POST', '/cns/pedidos/' . $pA['id'] . '/acoes', ['acao' => 'aprovar']);
ok('a outra orientadora do grupo também pode fazer a 1ª análise', $r['status'] === 'conferido' && $r['conferido_por'] === 'Ana Orientadora', $r);
[, $res] = $olga->req('GET', '/cns/resumo');
ok('depois da 1ª análise, sai da lista da orientadora', $res['conferir'] === 0, $res['conferir']);
[$st, $r] = $cida->req('POST', '/cns/pedidos/' . $pA['id'] . '/acoes', ['acao' => 'devolver', 'texto' => 'Sapato só no próximo mês.']);
ok('a Coordenação pode devolver na análise final', $st === 200 && $r['status'] === 'devolvido' && $r['analisado_por'] === 'Cida Coordenação CNS', $r);
[, $loja] = $rita->req('PUT', '/cns/loja', ['casa_id' => $casa1['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 2], ['produto_id' => $papel, 'quantidade' => 1]]]);
$rita->req('POST', '/cns/pedidos/' . $pA['id'] . '/acoes', ['acao' => 'enviar']);
[, $r] = $olga->req('POST', '/cns/pedidos/' . $pA['id'] . '/acoes', ['acao' => 'aprovar']);
[, $lst] = $cida->req('GET', '/cns/pedidos');
$naLista = array_column($lst['itens'], null, 'id')[$pA['id']];
ok('a lista mostra o valor de cada pedido e que é a análise final', abs($naLista['valor'] - (21 + 89.9)) < 0.01 && $naLista['etapa_analise'] === 'final' && $naLista['para_mim'] === true, $naLista);
[, $r] = $cida->req('POST', '/cns/pedidos/' . $pA['id'] . '/acoes', ['acao' => 'aprovar']);
ok('análise final aprova', $r['status'] === 'aprovado', $r['status']);
[, $loja3] = $lucia->req('PUT', '/cns/loja', ['casa_id' => $casa3['id'], 'itens' => [['produto_id' => $agua, 'quantidade' => 1]]]);
$lucia->req('POST', '/cns/pedidos/' . $loja3['pedido']['id'] . '/acoes', ['acao' => 'enviar']);
[, $r] = $cida->req('POST', '/cns/pedidos/' . $loja3['pedido']['id'] . '/acoes', ['acao' => 'aprovar']);
ok('casa sem orientadora: a Coordenação faz as duas análises de uma vez', $r['status'] === 'aprovado' && $r['conferido_por'] === 'Cida Coordenação CNS' && $r['analisado_por'] === 'Cida Coordenação CNS', $r);

echo "\nLoja v1.9 — consolidação com o DML Central e lista por fornecedor\n";
$cida->req('POST', '/cns/ciclos/' . $auto['id'] . '/acoes', ['acao' => 'fechar']);
[, $lc] = $cida->req('GET', '/estoque/locais');
$noCentral = (int) (array_column($cida->req('GET', '/estoque/locais/' . $lc['central']['id'])[1]['saldos'] ?? [], 'quantidade', 'produto_id')[$agua] ?? 0);
[, $cons] = $cida->req('GET', '/cns/ciclos/' . $auto['id'] . '/consolidado');
$porNome = array_column($cons['produtos'], null, 'nome');
$aguaC = $porNome['Água sanitária'];
ok('sugestão = pedido + mínimo do Central − o que já tem', $aguaC['total'] === 3 && $aguaC['no_central'] === $noCentral && $aguaC['sugestao'] === max(0, 3 + 8 - $noCentral) && $aguaC['comprar'] === $aguaC['sugestao'], $aguaC);
$forn = array_column($cons['fornecedores'], null, 'fornecedor');
ok('a lista sai separada por fornecedor', isset($forn['Lótus']) && $forn['Lótus']['itens'] >= 1 && isset($forn['Sem fornecedor']), array_keys($forn));
$g81 = array_values(array_filter($cons['grupos'], fn($g) => $g['grupo'] === 'Grupo 8.1'))[0];
ok('gasto por casa e por grupo', abs($g81['casas'][0]['valor'] - (21 + 89.9)) < 0.01 && abs($g81['valor'] - (21 + 89.9)) < 0.01 && abs($cons['valor_pedidos'] - (21 + 89.9 + 10.5)) < 0.01, $g81);
ok('antes de liberar, a Coordenação pode mexer na lista', $cons['pode_editar_compra'] === true && $cons['pode_liberar'] === true, $cons['pode_editar_compra']);
[, $cons] = $celio->req('GET', '/cns/ciclos/' . $auto['id'] . '/consolidado');
ok('Compras vê a lista, mas não edita', $cons['pode_editar_compra'] === false, $cons['pode_editar_compra']);
[$st] = $cida->req('PUT', '/cns/ciclos/' . $auto['id'] . '/compra', ['itens' => [['produto_id' => $agua, 'quantidade' => -1]]]);
ok('quantidade negativa na lista é recusada', $st === 422, $st);
$cida->req('PUT', '/cns/ciclos/' . $auto['id'] . '/compra', ['itens' => [['produto_id' => $s36['id'], 'quantidade' => 4]]]);
[, $c] = $cida->req('POST', '/cns/ciclos/' . $auto['id'] . '/acoes', ['acao' => 'liberar_compras']);
[, $cons] = $celio->req('GET', '/cns/ciclos/' . $auto['id'] . '/consolidado');
$porNome = array_column($cons['produtos'], null, 'nome');
ok('dá para pôr na compra um produto que ninguém pediu (reposição)', $porNome['Sapato BB65 nº 36']['comprar'] === 4 && $porNome['Sapato BB65 nº 36']['total'] === 0 && array_column($cons['fornecedores'], null, 'fornecedor')['Soft Works']['valor'] == 239.6, $porNome['Sapato BB65 nº 36']);
[, $c] = $cida->req('POST', '/cns/ciclos/' . $auto['id'] . '/acoes', ['acao' => 'reabrir_consolidacao', 'texto' => 'Faltou conferir o galpão.']);
ok('a Coordenação reabre a consolidação enquanto Compras não comprou', $c['liberado_compras_em'] === null && $c['status_nome'] === 'Fechado, em consolidação', $c);
$cida->req('POST', '/cns/ciclos/' . $auto['id'] . '/acoes', ['acao' => 'liberar_compras']);
[, $c] = $celio->req('POST', '/cns/ciclos/' . $auto['id'] . '/acoes', ['acao' => 'comprado', 'valor' => '500']);
ok('Compras registra a compra', $c['status'] === 'comprado', $c);
[$st] = $cida->req('POST', '/cns/ciclos/' . $auto['id'] . '/acoes', ['acao' => 'reabrir_consolidacao']);
ok('depois da compra não reabre (409)', $st === 409, $st);
$cida->req('PUT', '/cns/agenda', ['ativa' => true, 'dia_abertura' => 28, 'dia_prazo' => 27]);
[, $res] = $rita->req('GET', '/cns/resumo');
ok('o mesmo mês não abre de novo depois de fechado', $res['ciclo']['id'] === $auto['id'], $res['ciclo']);
[, $ag] = $cida->req('GET', '/cns/agenda');
ok('a agenda mostra a próxima abertura', $ag['proxima'] !== null && $ag['proxima']['abre'] > date('Y-m-d', strtotime('-1 month')) && $ag['proxima']['referencia'] !== substr($auto['prazo'], 0, 7), $ag);
$cida->req('PUT', '/cns/agenda', ['ativa' => false, 'dia_abertura' => 28, 'dia_prazo' => 27]);
