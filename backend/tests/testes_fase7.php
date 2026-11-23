<?php
declare(strict_types=1);

/** Testes da v1.7.0: áreas de atendimento e assunto livre. Incluído por testes.php no fim. */

echo "\nÁreas de atendimento\n";
[$st, $areas] = $adminA->req('GET', '/areas?todas=1');
ok('organização nasce com as 7 áreas do SharePoint', $st === 200 && count($areas) === 7 && $areas[0]['nome'] === 'Civil', array_column($areas, 'nome'));
$area = fn(string $n) => array_values(array_filter($areas, fn($a) => $a['nome'] === $n))[0]['id'];
[$st] = $carlos->req('POST', '/areas', ['nome' => 'Hidráulica']);
ok('só o administrador cria área (403)', $st === 403, $st);
[$st, $hid] = $adminA->req('POST', '/areas', ['nome' => 'Hidráulica', 'descricao' => 'Água e esgoto']);
ok('administrador cria área', $st === 201 && $hid['nome'] === 'Hidráulica', $hid);
[$st] = $adminA->req('POST', '/areas', ['nome' => 'Hidráulica']);
ok('área repetida é recusada', $st === 422, $st);

[$st, $r] = $adminA->req('POST', '/usuarios', ['nome' => 'Sem Nada', 'email' => 'semnada@a.test', 'senha' => $SENHA]);
ok('usuário sem perfil e sem área é recusado', $st === 422 && isset($r['campos']['perfis']), $r);
[$st, $ivo] = $adminA->req('POST', '/usuarios', ['nome' => 'Ivo Informática', 'email' => 'ivo@a.test', 'senha' => $SENHA, 'areas' => [$area('Informática')]]);
ok('usuário só com área (sem perfil) é aceito', $st === 201 && $ivo['areas'] === [$area('Informática')] && $ivo['perfis'] === [], $ivo);
[, $lstU] = $adminA->req('GET', '/usuarios?busca=Ivo');
ok('lista de usuários mostra as áreas', ($lstU[0]['areas'] ?? '') === 'Informática', $lstU);
$ivoC = entrar('ivo@a.test');
[, $lst] = $ivoC->req('GET', '/chamados?filtro=todos');
ok('quem é só da área não vê nada enquanto nada foi encaminhado a ela', $lst['total'] === 0, $lst['total']);

echo "\nChamado encaminhado para uma área\n";
[$st, $c7] = $rita->req('POST', '/chamados', ['casa_id' => $casa1['id'], 'categoria_id' => $cat('Outros'), 'assunto' => 'Internet da secretaria caindo',
    'descricao' => 'O roteador desliga sozinho várias vezes por dia.']);
ok('o assunto escrito vira o título do chamado', $st === 201 && $c7['titulo'] === 'Internet da secretaria caindo', $c7['titulo'] ?? $c7);
[$st, $r] = $carlos->req('POST', '/chamados/' . $c7['id'] . '/acoes', ['acao' => 'triar', 'prioridade' => 'normal', 'area_id' => 999999]);
ok('área inexistente é recusada', $st === 422 && isset($r['campos']['area_id']), $r);
[$st, $r] = $carlos->req('POST', '/chamados/' . $c7['id'] . '/acoes', ['acao' => 'triar', 'prioridade' => 'normal', 'area_id' => $area('Informática'), 'responsavel_id' => $uCasa['id']]);
ok('responsável precisa ser da área ou da manutenção', $st === 422 && isset($r['campos']['responsavel_id']), $r);
[$st, $r] = $carlos->req('POST', '/chamados/' . $c7['id'] . '/acoes', ['acao' => 'triar', 'prioridade' => 'normal', 'area_id' => $area('Informática')]);
ok('Coordenação encaminha para Informática', $st === 200 && ($r['area']['nome'] ?? '') === 'Informática' && str_contains(end($r['eventos'])['texto'], 'Encaminhado para Informática'), $r['area'] ?? $r);
[, $res] = $ivoC->req('GET', '/chamados/resumo');
ok('a área recebe o aviso "Para você"', $res['para_mim'] === 1, $res);
[, $lst] = $ivoC->req('GET', '/chamados?filtro=todos');
ok('quem é da área vê só os chamados dela', $lst['total'] === 1 && $lst['itens'][0]['id'] === $c7['id'], $lst['total']);
[, $lst] = $carlos->req('GET', '/chamados?filtro=todos&area_id=' . $area('Informática'));
ok('filtro por área', $lst['total'] === 1, $lst['total']);
[$st, $r] = $ivoC->req('POST', '/chamados/' . $c7['id'] . '/acoes', ['acao' => 'enviar_orcamento', 'valor' => 250, 'servico' => 'Trocar o roteador']);
ok('quem é da área faz o orçamento', $st === 200 && $r['status'] === 'aguardando_aprovacao', $r);
[, $r] = $carlos->req('POST', '/chamados/' . $c7['id'] . '/acoes', ['acao' => 'aprovar']);
[, $o] = $ivoC->req('POST', '/ordens/' . $r['os']['id'] . '/etapas', ['nome' => 'Trocar o roteador']);
[$st, $o] = $ivoC->req('POST', '/ordens/' . $r['os']['id'] . '/acoes', ['acao' => 'iniciar']);
ok('quem é da área monta e inicia a OS', $st === 200 && $o['status'] === 'em_andamento' && ($o['area']['nome'] ?? '') === 'Informática', $o);
[$st] = $lucia->req('GET', '/chamados/' . $c7['id']);
ok('outra casa continua sem ver (404)', $st === 404, $st);
[, $r] = $carlos->req('POST', '/chamados/' . $c7['id'] . '/acoes', ['acao' => 'atribuir', 'area_id' => $area('Elétrica')]);
ok('mudar de área fica na linha do tempo', ($r['area']['nome'] ?? '') === 'Elétrica' && str_contains(end($r['eventos'])['texto'], 'Encaminhado para Elétrica'), end($r['eventos']));
[$st] = $ivoC->req('GET', '/chamados/' . $c7['id']);
ok('saiu da área, quem era dela deixa de ver (404)', $st === 404, $st);
[$st] = $ivoC->req('GET', '/ordens/' . $o['id']);
ok('e também a OS (404)', $st === 404, $st);
$carlos->req('POST', '/chamados/' . $c7['id'] . '/acoes', ['acao' => 'atribuir', 'area_id' => $area('Informática')]);
$adminA->req('PUT', '/areas/' . $area('Informática'), ['nome' => 'Informática', 'ativo' => false]);
[$st] = $ivoC->req('GET', '/chamados/' . $c7['id']);
ok('área desativada não dá mais acesso', in_array($st, [403, 404], true), $st);
[, $lista] = $carlos->req('GET', '/areas');
ok('área desativada some da triagem', !in_array('Informática', array_column($lista, 'nome'), true), array_column($lista, 'nome'));
