<?php
declare(strict_types=1);

/** Testes da v1.8.0: lista de materiais e documentos (PDF) no chamado. Incluído por testes.php no fim. */

echo "\nLista de materiais e documentos do chamado\n";
[$st, $c8] = $rita->req('POST', '/chamados', ['casa_id' => $casa1['id'], 'categoria_id' => $cat('Outros'), 'assunto' => 'Pintura da sala de reuniões',
    'descricao' => 'Paredes manchadas e descascando perto da janela.']);
ok('chamado aberto pela casa', $st === 201 && $c8['materiais'] === [] && $c8['pode_editar_materiais'] === true, $c8['pode_editar_materiais'] ?? $c8);
$base = '/chamados/' . $c8['id'];
[$st, $r] = $rita->req('POST', $base . '/materiais', ['descricao' => 'Tinta branca fosca 18 L', 'quantidade' => '2', 'unidade' => 'lata']);
ok('quem abriu inclui material enquanto o chamado está aberto', $st === 200 && count($r['materiais']) === 1 && $r['materiais'][0]['quantidade'] == 2, $r['materiais'] ?? $r);
[$st, $r] = $rita->req('POST', $base . '/materiais', ['descricao' => 'Lixa', 'quantidade' => '0']);
ok('quantidade zero é recusada', $st === 422 && isset($r['campos']['quantidade']), $r);
[$st, $r] = $rita->req('POST', $base . '/anexos', ['categoria' => 'documento', 'nome' => 'croqui.pdf', 'arquivo' => $PDF]);
ok('a casa anexa um documento em PDF', $st === 200 && count(array_filter($r['anexos'], fn($a) => $a['categoria'] === 'documento')) === 1, $r['anexos'] ?? $r);
[$st] = $rita->req('POST', $base . '/anexos', ['categoria' => 'orcamento', 'nome' => 'orc.pdf', 'arquivo' => $PDF]);
ok('orçamento continua só para quem cuida do serviço (403)', $st === 403, $st);
[$st] = $lucia->req('POST', $base . '/materiais', ['descricao' => 'Rolo', 'quantidade' => 1]);
ok('outra casa não mexe na lista (404)', $st === 404, $st);

$carlos->req('POST', $base . '/acoes', ['acao' => 'triar', 'prioridade' => 'normal']);
[$st] = $rita->req('POST', $base . '/materiais', ['descricao' => 'Rolo', 'quantidade' => 1]);
ok('depois da triagem a casa não mexe mais na lista (403)', $st === 403, $st);
[$st, $r] = $carlos->req('POST', $base . '/materiais', ['descricao' => 'Massa corrida 25 kg', 'quantidade' => '1,5', 'unidade' => 'saco', 'valor_unitario' => '74,50']);
$mid = end($r['materiais'])['id'];
ok('a manutenção inclui com valor e quantidade fracionada', $st === 200 && end($r['materiais'])['quantidade'] == 1.5 && end($r['materiais'])['valor_unitario'] == 74.5, end($r['materiais']));
[$st, $r] = $carlos->req('PUT', $base . '/materiais/' . $mid, ['situacao' => 'comprado']);
ok('muda a situação sem perder o resto', $st === 200 && end($r['materiais'])['situacao'] === 'comprado' && end($r['materiais'])['valor_unitario'] == 74.5
    && str_contains(end($r['eventos'])['texto'], 'comprado'), end($r['materiais']));
[$st] = $carlos->req('PUT', $base . '/materiais/' . $mid, ['situacao' => 'sumiu']);
ok('situação inválida é recusada', $st === 422, $st);
[$st, $r] = $rita->req('GET', $base);
ok('a casa vê a lista (só leitura)', $st === 200 && count($r['materiais']) === 2 && $r['pode_editar_materiais'] === false, $r['pode_editar_materiais'] ?? $r);
[$st, $r] = $carlos->req('DELETE', $base . '/materiais/' . $mid);
ok('tira da lista e registra no histórico', $st === 200 && count($r['materiais']) === 1 && str_contains(end($r['eventos'])['texto'], 'Tirou da lista'), end($r['eventos']));
[$st] = $carlos->req('DELETE', '/chamados/' . $c7['id'] . '/materiais/' . $r['materiais'][0]['id']);
ok('material de outro chamado não é encontrado (404)', $st === 404, $st);
$carlos->req('POST', $base . '/acoes', ['acao' => 'cancelar', 'texto' => 'Teste da lista de materiais.']);
[$st] = $carlos->req('POST', $base . '/materiais', ['descricao' => 'Rolo', 'quantidade' => 1]);
ok('chamado finalizado não aceita material (409)', $st === 409, $st);
