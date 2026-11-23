<?php
declare(strict_types=1);

/**
 * Testes da v1.9.1 (excluir pedido e usuário) e da v1.10.0 (relatório de visita do CNS Limpeza + consolidado por casa).
 * Incluído por testes.php no fim. Usa $cida (Coordenação CNS), $olga (orientadora 8.1: casa1 e casa2),
 * $bia (orientadora 8.3), $rita (casa1), $celio (Compras), $adminA, $adminB, $casa1..3, $casaB, jpeg(), baixar().
 */

echo "\nv1.10 — checklist da visita (editável pela Coordenação CNS)\n";
[$st] = $rita->req('GET', '/cns/checklist');
ok('a casa não vê o checklist (403)', $st === 403, $st);
[$st] = $olga->req('POST', '/cns/checklist', ['texto' => 'Banheiros limpos']);
ok('a orientadora não edita o checklist (403)', $st === 403, $st);
[$st, $r] = $olga->req('POST', '/cns/visitas', ['casa_id' => $casa1['id']]);
ok('sem checklist não dá para começar a visita', $st === 422 && str_contains($r['erro'] ?? '', 'checklist'), $r);
[$st, $r] = $cida->req('POST', '/cns/checklist', ['texto' => '']);
ok('item sem texto é recusado', $st === 422 && isset($r['campos']['texto']), $r);
[$st, $i1] = $cida->req('POST', '/cns/checklist', ['texto' => 'Banheiros limpos e abastecidos', 'secao' => 'Banheiros']);
[, $i2] = $cida->req('POST', '/cns/checklist', ['texto' => 'DML organizado', 'secao' => 'DML']);
[, $i3] = $cida->req('POST', '/cns/checklist', ['texto' => 'Produtos dentro da validade', 'secao' => 'DML']);
ok('Coordenação cria itens com seção', $st === 200 && $i1['secao'] === 'Banheiros' && $i1['ativo'] === true, $i1);
[$st, $lista] = $cida->req('PUT', '/cns/checklist/ordem', ['ids' => [$i3['id'], $i1['id'], $i2['id']]]);
ok('Coordenação reordena os itens', $st === 200 && array_column($lista, 'id') === [$i3['id'], $i1['id'], $i2['id']], array_column($lista, 'id'));
[$st, $r] = $cida->req('PUT', "/cns/checklist/{$i2['id']}", ['texto' => 'DML organizado e limpo', 'secao' => 'DML', 'ativo' => true]);
ok('Coordenação edita o texto', $st === 200 && $r['texto'] === 'DML organizado e limpo', $r);
[, $iTmp] = $cida->req('POST', '/cns/checklist', ['texto' => 'Item que vai sair']);
$cida->req('PUT', "/cns/checklist/{$iTmp['id']}", ['texto' => 'Item que vai sair', 'ativo' => false]);
[, $ativos] = $olga->req('GET', '/cns/checklist');
[, $todos] = $cida->req('GET', '/cns/checklist?todos=1');
ok('item desativado some do checklist, mas a Coordenação ainda vê', count($ativos) === 3 && count($todos) === 4, [count($ativos), count($todos)]);
[, $chkB] = $adminB->req('GET', '/cns/checklist');
ok('outro tenant não vê o checklist do tenant A', !is_array($chkB) || !in_array($i1['id'], array_column(array_filter($chkB, 'is_array'), 'id'), true), $chkB);

echo "\nv1.10 — relatório de visita\n";
[$st] = $rita->req('POST', '/cns/visitas', ['casa_id' => $casa1['id']]);
ok('a casa não faz visita (403)', $st === 403, $st);
[$st] = $olga->req('POST', '/cns/visitas', ['casa_id' => $casa3['id']]);
ok('orientadora não faz visita em casa de outro grupo', $st === 403, $st);
[$st, $r] = $olga->req('POST', '/cns/visitas', ['casa_id' => $casa1['id'], 'data_visita' => date('Y-m-d', strtotime('+10 days'))]);
ok('data da visita no futuro é recusada', $st === 422 && isset($r['campos']['data_visita']), $r);
[$st, $v] = $olga->req('POST', '/cns/visitas', ['casa_id' => $casa1['id']]);
ok('orientadora começa a visita na casa do grupo dela', $st === 200 && $v['status'] === 'rascunho' && $v['data_visita'] === date('Y-m-d') && count($v['itens']) === 3, $v);
ok('a visita copia os itens na ordem do checklist', array_column($v['itens'], 'texto') === ['Produtos dentro da validade', 'Banheiros limpos e abastecidos', 'DML organizado e limpo'], array_column($v['itens'], 'texto'));
$cida->req('PUT', "/cns/checklist/{$i1['id']}", ['texto' => 'Texto novo depois da visita', 'secao' => 'Banheiros', 'ativo' => true]);
[, $v] = $olga->req('GET', "/cns/visitas/{$v['id']}");
ok('mudar o checklist depois não muda a visita já começada', $v['itens'][1]['texto'] === 'Banheiros limpos e abastecidos', $v['itens'][1]);
[$st] = $bia->req('GET', "/cns/visitas/{$v['id']}");
ok('orientadora de outro grupo não abre a visita (404)', $st === 404, $st);
[$st] = $rita->req('GET', "/cns/visitas/{$v['id']}");
ok('a casa não abre a visita', in_array($st, [403, 404], true), $st);
[$st] = $adminB->req('GET', "/cns/visitas/{$v['id']}");
ok('outro tenant não abre a visita', in_array($st, [403, 404], true), $st);
[$st, $r] = $olga->req('POST', "/cns/visitas/{$v['id']}/acoes", ['acao' => 'concluir']);
ok('não conclui com item sem marcar', $st === 422 && str_contains($r['erro'] ?? '', 'Faltam 3'), $r);
$itens = $v['itens'];
[$st, $r] = $olga->req('PUT', "/cns/visitas/{$v['id']}", ['data_visita' => date('Y-m-d'), 'itens' => [['id' => $itens[0]['id'], 'resposta' => 'talvez']]]);
ok('resposta fora da lista é recusada', $st === 422, $r);
[$st, $v] = $olga->req('PUT', "/cns/visitas/{$v['id']}", ['data_visita' => date('Y-m-d'), 'observacao' => 'Casa bem cuidada.', 'itens' => [
    ['id' => $itens[0]['id'], 'resposta' => 'ok'],
    ['id' => $itens[1]['id'], 'resposta' => 'ajustar', 'obs' => 'Faltou papel toalha'],
    ['id' => $itens[2]['id'], 'resposta' => 'na'],
]]);
ok('orientadora marca os itens e escreve observações', $st === 200 && $v['itens'][1]['resposta'] === 'ajustar' && $v['itens'][1]['obs'] === 'Faltou papel toalha' && $v['observacao'] === 'Casa bem cuidada.', $v);
[$st, $v] = $olga->req('POST', "/cns/visitas/{$v['id']}/fotos", ['arquivo' => jpeg(), 'legenda' => 'Banheiro feminino']);
ok('orientadora envia foto com legenda', $st === 200 && count($v['fotos']) === 1 && $v['fotos'][0]['legenda'] === 'Banheiro feminino', $v['fotos']);
[$st, $r] = $olga->req('POST', "/cns/visitas/{$v['id']}/fotos", ['arquivo' => $PDF]);
ok('PDF não entra como foto da visita', $st === 422, $r);
$foto = $v['fotos'][0];
[$st] = baixar($olga, $foto['url']);
[$st2] = baixar($bia, $foto['url']);
[$st3] = baixar($rita, $foto['url']);
ok('a foto abre para quem vê a visita e dá 404 para os outros', $st === 200 && $st2 === 404 && $st3 === 404, [$st, $st2, $st3]);
[$st, $v] = $olga->req('PUT', "/cns/visitas/{$v['id']}/fotos/{$foto['id']}", ['legenda' => 'Banheiro feminino (pia)']);
ok('orientadora muda a legenda', $st === 200 && $v['fotos'][0]['legenda'] === 'Banheiro feminino (pia)', $v['fotos']);
[$st, $v] = $olga->req('POST', "/cns/visitas/{$v['id']}/acoes", ['acao' => 'concluir']);
ok('orientadora conclui a visita', $st === 200 && $v['status'] === 'concluida' && $v['concluida_por'] !== null && $v['pode_editar'] === false, $v);
[$st] = $olga->req('PUT', "/cns/visitas/{$v['id']}", ['data_visita' => date('Y-m-d')]);
[$st2] = $olga->req('POST', "/cns/visitas/{$v['id']}/fotos", ['arquivo' => jpeg()]);
ok('visita concluída não muda mais (409)', $st === 409 && $st2 === 409, [$st, $st2]);
[$st] = $olga->req('DELETE', "/cns/visitas/{$v['id']}");
ok('concluída, só a Coordenação exclui', $st === 409, $st);
[, $lista] = $cida->req('GET', '/cns/visitas');
$linha = array_values(array_filter($lista, fn($x) => $x['id'] === $v['id']))[0] ?? null;
ok('Coordenação vê a visita na lista, com resumo', $linha && $linha['qtd_ajustar'] === 1 && $linha['qtd_fotos'] === 1 && $linha['casa']['nome'] === 'Casa Jardim', $linha);
[, $listaBia] = $bia->req('GET', '/cns/visitas');
ok('orientadora de outro grupo não vê a visita na lista', !in_array($v['id'], array_column($listaBia, 'id'), true), $listaBia);
[$st, $v] = $cida->req('POST', "/cns/visitas/{$v['id']}/acoes", ['acao' => 'reabrir']);
ok('Coordenação reabre a visita', $st === 200 && $v['status'] === 'rascunho', $v);
[$st, $v2] = $cida->req('POST', '/cns/visitas', ['casa_id' => $casa3['id']]);
ok('Coordenação visita qualquer casa', $st === 200 && $v2['casa']['id'] === $casa3['id'], $v2);
[$st] = $olga->req('DELETE', "/cns/visitas/{$v2['id']}");
ok('orientadora não exclui visita que não vê', $st === 404, $st);
[$st, $v3] = $olga->req('POST', '/cns/visitas', ['casa_id' => $casa2['id']]);
$v3 = $olga->req('POST', "/cns/visitas/{$v3['id']}/fotos", ['arquivo' => jpeg()])[1];
$fotoV3 = $v3['fotos'][0]['id'];
[$st] = $olga->req('DELETE', "/cns/visitas/{$v3['id']}");
$sobrou = db('SELECT excluido_em FROM anexos WHERE id = ?', [$fotoV3]);
ok('quem fez exclui o rascunho e a foto vai junto', $st === 200 && $sobrou[0]['excluido_em'] !== null, [$st, $sobrou]);
$aud = array_column(db("SELECT acao FROM auditoria WHERE entidade = 'cns_visitas'"), 'acao');
ok('auditoria registra criar, concluir, reabrir e excluir', !array_diff(['criar', 'concluir', 'reabrir', 'excluir'], $aud), $aud);

echo "\nv1.9.1 — excluir usuário e pedido\n";
[, $novo] = $adminA->req('POST', '/usuarios', ['nome' => 'Pessoa Sem Historico', 'email' => 'semhist@a.test', 'senha' => $SENHA, 'perfis' => [['perfil' => 'compras']]]);
ok('cria usuário para excluir', isset($novo['id']), $novo);
[$st] = $adminA->req('DELETE', "/usuarios/{$novo['id']}");
ok('administrador exclui usuário sem histórico', $st === 200 && !db('SELECT id FROM usuarios WHERE id = ?', [$novo['id']]), $st);
$idOlga = (int) db('SELECT id FROM usuarios WHERE email = ?', ['olga@a.test'])[0]['id'];
[$st, $r] = $adminA->req('DELETE', "/usuarios/$idOlga");
ok('usuário com histórico não é excluído (409)', $st === 409, $r);
[$st] = $olga->req('DELETE', '/usuarios/' . $idOlga);
ok('quem não é administrador não exclui usuário', $st === 403, $st);
$pedOutro = db('SELECT id FROM cns_pedidos WHERE casa_id = ? LIMIT 1', [$casa3['id']]);
if ($pedOutro) {
    [$st] = $olga->req('DELETE', '/cns/pedidos/' . $pedOutro[0]['id']);
    ok('orientadora não exclui pedido de casa de outro grupo', in_array($st, [403, 404], true), $st);
}
