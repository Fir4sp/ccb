<?php
declare(strict_types=1);

/**
 * Testes da v1.1.0 (página da casa) e da Fase 3 (chamados).
 * Incluído por testes.php: usa $BASE, $adminA, $adminB, $casa1..3, $g81, $g82, $SENHA, ok() e db().
 * Neste ponto a alçada da Coordenação do tenant A já foi mudada para R$ 450.
 */

function jpeg(int $w = 900, int $h = 600): string
{
    $im = imagecreatetruecolor($w, $h);
    imagefill($im, 0, 0, imagecolorallocate($im, 30, 77, 92));
    ob_start();
    imagejpeg($im, null, 80);
    return 'data:image/jpeg;base64,' . base64_encode((string) ob_get_clean());
}
$PDF = 'data:application/pdf;base64,' . base64_encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

function baixar(Cliente $c, string $url): array
{
    // url vem como /api/anexos/N...
    [$st, $corpo] = $c->req('GET', substr($url, 4));
    return [$st, $corpo];
}

$criarU = fn(array $dados) => $adminA->req('POST', '/usuarios', $dados + ['senha' => $SENHA]);
function entrar(string $email): Cliente
{
    global $BASE, $SENHA;
    $c = new Cliente($BASE);
    $c->entrar($email, $SENHA);
    return $c;
}

// ------------------------------------------------------------------ Página da casa
echo "\nPágina da Casa de Oração (v1.1.0)\n";
[$st, $r] = $adminA->req('PUT', '/casas/' . $casa1['id'], ['grupo_id' => $g81, 'codigo' => 'CO-01', 'nome' => 'Casa Jardim',
    'horarios_culto' => 'Domingo 18h30 · Quarta 19h30', 'capacidade' => '180', 'observacoes' => 'Chave com o porteiro.']);
ok('salva horários de culto, capacidade e observações', $st === 200 && $r['capacidade'] === 180 && $r['horarios_culto'] === 'Domingo 18h30 · Quarta 19h30', $r);
[$st, $r] = $adminA->req('PUT', '/casas/' . $casa1['id'], ['grupo_id' => $g81, 'codigo' => 'CO-01', 'nome' => 'Casa Jardim', 'capacidade' => 'muitas']);
ok('capacidade precisa ser número', $st === 422 && isset($r['campos']['capacidade']), $r);

[$st, $lista] = $adminA->req('POST', '/casas/' . $casa1['id'] . '/ministerio', ['cargo' => 'Ancião', 'nome' => 'Irmão José', 'telefone' => '(11) 98888-7777']);
[, $lista] = $adminA->req('POST', '/casas/' . $casa1['id'] . '/ministerio', ['cargo' => 'Diácono', 'nome' => 'Irmão Pedro']);
ok('cadastra o ministério da casa', $st === 200 && count($lista) === 2 && $lista[0]['cargo'] === 'Ancião', $lista);
[$st, $r] = $adminA->req('POST', '/casas/' . $casa1['id'] . '/ministerio', ['cargo' => 'Ancião', 'nome' => 'X', 'telefone' => 'abc']);
ok('telefone inválido é recusado', $st === 422 && isset($r['campos']['telefone']), $r);
[, $lista] = $adminA->req('PUT', '/casas/' . $casa1['id'] . '/ministerio/ordem', ['ordem' => [$lista[1]['id'], $lista[0]['id']]]);
ok('reordena o ministério', $lista[0]['nome'] === 'Irmão Pedro', $lista);
[, $lista] = $adminA->req('PUT', '/casas/' . $casa1['id'] . '/ministerio/' . $lista[0]['id'], ['cargo' => 'Diácono', 'nome' => 'Irmão Pedro Lima']);
ok('edita um nome do ministério', $lista[0]['nome'] === 'Irmão Pedro Lima', $lista);
[, $lista] = $adminA->req('DELETE', '/casas/' . $casa1['id'] . '/ministerio/' . $lista[0]['id']);
ok('tira alguém do ministério', count($lista) === 1, $lista);

[$st, $fotos] = $adminA->req('POST', '/casas/' . $casa1['id'] . '/fotos', ['arquivo' => jpeg(3000, 2000), 'nome' => 'fachada.jpg']);
ok('envia foto da casa; a primeira vira capa', $st === 200 && count($fotos) === 1 && $fotos[0]['capa'] === true, $fotos);
ok('foto grande é reduzida para 1600 px', ($fotos[0]['largura'] ?? 0) === 1600 && ($fotos[0]['altura'] ?? 0) === 1067, $fotos[0] ?? null);
[, $fotos] = $adminA->req('POST', '/casas/' . $casa1['id'] . '/fotos', ['arquivo' => jpeg(), 'nome' => 'salao.jpg']);
[, $fotos] = $adminA->req('PUT', '/casas/' . $casa1['id'] . '/fotos/' . $fotos[1]['id'], ['capa' => true]);
ok('troca a foto de capa', $fotos[1]['capa'] === true && $fotos[0]['capa'] === false, $fotos);
[, $fotos] = $adminA->req('PUT', '/casas/' . $casa1['id'] . '/fotos/' . $fotos[0]['id'], ['legenda' => 'Fachada']);
ok('salva legenda da foto', $fotos[0]['legenda'] === 'Fachada', $fotos);
[$st] = $adminA->req('POST', '/casas/' . $casa1['id'] . '/fotos', ['arquivo' => 'data:text/plain;base64,' . base64_encode('<?php echo 1;'), 'nome' => 'x.php']);
ok('arquivo que não é imagem é recusado', $st === 422, $st);
[$st] = $adminA->req('POST', '/casas/' . $casa1['id'] . '/fotos', ['arquivo' => $PDF]);
ok('PDF não entra como foto da casa', $st === 422, $st);
$arquivoNoDisco = db('SELECT caminho FROM anexos WHERE id = ?', [$fotos[0]['id']])[0]['caminho'];
ok('arquivo fica guardado fora do site (nucleo/arquivos)', is_file(__DIR__ . '/../arquivos/' . $arquivoNoDisco), $arquivoNoDisco);
[, $lista] = $adminA->req('GET', '/casas');
$c1 = array_values(array_filter($lista, fn($c) => $c['id'] === $casa1['id']))[0];
ok('lista de casas traz a miniatura da capa', str_contains((string) $c1['capa_url'], '/api/anexos/'), $c1);
[, $fotos] = $adminA->req('DELETE', '/casas/' . $casa1['id'] . '/fotos/' . $fotos[1]['id']);
ok('apagar a capa passa a capa para a próxima foto', count($fotos) === 1 && $fotos[0]['capa'] === true, $fotos);

// usuários da Fase 3
$criarU(['nome' => 'Rita da Casa Jardim', 'email' => 'rita@a.test', 'perfis' => [['perfil' => 'casa_oracao']], 'casas' => [['casa_id' => $casa1['id'], 'funcao' => 'manutencao']]]);
$criarU(['nome' => 'Lúcia da Bela Vista', 'email' => 'lucia@a.test', 'perfis' => [['perfil' => 'casa_oracao']], 'casas' => [['casa_id' => $casa3['id'], 'funcao' => 'manutencao']]]);
$criarU(['nome' => 'Carlos Coord 8.1', 'email' => 'carlos@a.test', 'perfis' => [['perfil' => 'coordenacao_manutencao', 'grupo_id' => $g81]]]);
[, $eq] = $criarU(['nome' => 'Edson Equipe', 'email' => 'edson@a.test', 'perfis' => [['perfil' => 'equipe_manutencao']]]);
$criarU(['nome' => 'Elias Equipe', 'email' => 'elias@a.test', 'perfis' => [['perfil' => 'equipe_manutencao']]]);
$criarU(['nome' => 'Sara Segurança', 'email' => 'sara@a.test', 'perfis' => [['perfil' => 'seguranca_trabalho']]]);
$criarU(['nome' => 'Pedro Procurador', 'email' => 'pedro@a.test', 'perfis' => [['perfil' => 'procurador']]]);
$criarU(['nome' => 'Olga Orientadora', 'email' => 'olga@a.test', 'perfis' => [['perfil' => 'orientadora_cns', 'grupo_id' => $g81]]]);
$rita = entrar('rita@a.test');
$lucia = entrar('lucia@a.test');
$carlos = entrar('carlos@a.test');
$edson = entrar('edson@a.test');
$elias = entrar('elias@a.test');
$sara = entrar('sara@a.test');
$pedro = entrar('pedro@a.test');
$olga = entrar('olga@a.test');
$paulo = entrar('paulo@a.test');
$joao2 = entrar('joao@a.test');

[$st, $r] = $rita->req('GET', '/casas/' . $casa1['id']);
ok('usuária da casa vê ministério e fotos', $st === 200 && count($r['ministerio']) === 1 && count($r['fotos']) === 1 && $r['pode_editar'] === false, $r);
[$st] = $rita->req('POST', '/casas/' . $casa1['id'] . '/ministerio', ['cargo' => 'Ancião', 'nome' => 'Tentativa']);
ok('usuária da casa não edita o ministério (403)', $st === 403, $st);
[$st] = $lucia->req('POST', '/casas/' . $casa1['id'] . '/fotos', ['arquivo' => jpeg()]);
ok('quem não vê a casa recebe 404 ao mandar foto', $st === 404, $st);
[$st] = baixar($rita, $fotos[0]['url']);
ok('usuária da casa abre a foto da própria casa', $st === 200, $st);
[$st] = baixar($lucia, $fotos[0]['url']);
ok('foto de outra casa não abre, nem com o endereço (404)', $st === 404, $st);
[$st] = baixar($adminB, $fotos[0]['url']);
ok('foto não abre para outro tenant (404)', $st === 404, $st);

// ------------------------------------------------------------------ Chamados: abertura e escopo
echo "\nChamados — abertura e escopo\n";
[, $cats] = $rita->req('GET', '/chamados/categorias');
ok('organização nasce com 12 categorias de chamado', count($cats) === 12, $cats);
$cat = fn(string $nome) => array_values(array_filter($cats, fn($c) => $c['nome'] === $nome))[0]['id'];
$hidraulica = $cat('Hidráulica e esgoto');
$eletrica = $cat('Elétrica');

[$st, $r] = $rita->req('POST', '/chamados', ['casa_id' => $casa1['id'], 'categoria_id' => $hidraulica, 'descricao' => 'curto']);
ok('descrição muito curta é recusada', $st === 422 && isset($r['campos']['descricao']), $r);
[$st, $r] = $rita->req('POST', '/chamados', ['casa_id' => $casa3['id'], 'categoria_id' => $hidraulica, 'descricao' => 'Vazamento na pia da cozinha']);
ok('casa não abre chamado para outra casa', $st === 422 && isset($r['campos']['casa_id']), $r);
[$st, $ch] = $rita->req('POST', '/chamados', ['casa_id' => $casa1['id'], 'categoria_id' => $hidraulica, 'local' => 'Banheiro masculino',
    'descricao' => 'A descarga não para de correr água.', 'urgente' => true]);
ok('casa abre chamado', $st === 201 && $ch['status'] === 'aberto' && $ch['numero'] === 1 && $ch['urgente'] === true, $ch);
ok('título montado com o tipo e o local', $ch['titulo'] === 'Hidráulica e esgoto — Banheiro masculino', $ch['titulo']);
ok('quem abriu pode cancelar enquanto está na triagem', in_array('cancelar', $ch['acoes'], true) && !in_array('triar', $ch['acoes'], true), $ch['acoes']);
$id = $ch['id'];
[, $f] = $rita->req('POST', "/chamados/$id/anexos", ['arquivo' => jpeg(), 'categoria' => 'foto']);
ok('casa manda foto do problema', count($f['anexos']) === 1 && $f['anexos'][0]['imagem'] === true, $f['anexos'] ?? $f);
[$st] = $rita->req('POST', "/chamados/$id/anexos", ['arquivo' => $PDF, 'categoria' => 'orcamento']);
ok('casa não anexa orçamento (403)', $st === 403, $st);

[$st] = $lucia->req('GET', "/chamados/$id");
ok('outra casa não vê o chamado (404)', $st === 404, $st);
[$st] = $joao2->req('GET', "/chamados/$id");
ok('Coordenação de outro grupo não vê o chamado (404)', $st === 404, $st);
[$st] = $olga->req('GET', "/chamados/$id");
ok('Orientadora CNS não acessa chamados de manutenção (403)', $st === 403, $st);
[$st] = $adminB->req('GET', "/chamados/$id");
ok('outro tenant não vê o chamado (404)', $st === 404, $st);
[$st] = baixar($lucia, $f['anexos'][0]['url']);
ok('foto do chamado não abre para quem não vê o chamado', $st === 404, $st);
[, $lst] = $lucia->req('GET', '/chamados');
ok('lista da outra casa vem vazia', $lst['total'] === 0, $lst);

[, $res] = $carlos->req('GET', '/chamados/resumo');
ok('Coordenação do grupo vê o chamado em "Para você"', $res['para_mim'] === 1 && $res['urgentes'] === 1, $res);
[, $res] = $paulo->req('GET', '/chamados/resumo');
ok('Gestão não recebe aviso da triagem quando o grupo tem Coordenação', $res['para_mim'] === 0 && $res['abertos'] === 1, $res);
[, $lst] = $carlos->req('GET', '/chamados?filtro=para_mim');
ok('filtro "Para você" traz o chamado', $lst['total'] === 1 && $lst['itens'][0]['id'] === $id && $lst['itens'][0]['foto_url'] !== null, $lst);
[, $lst] = $carlos->req('GET', '/chamados?busca=%231');
ok('busca pelo número do chamado', $lst['total'] === 1, $lst);

// ------------------------------------------------------------------ Fluxo completo com alçadas e reaprovação
echo "\nChamados — triagem, orçamento, alçadas e reaprovação\n";
[$st] = $rita->req('POST', "/chamados/$id/acoes", ['acao' => 'triar', 'prioridade' => 'alta']);
ok('casa não faz triagem (409)', $st === 409, $st);
[$st, $r] = $carlos->req('POST', "/chamados/$id/acoes", ['acao' => 'triar']);
ok('triagem exige prioridade', $st === 422 && isset($r['campos']['prioridade']), $r);
[$st, $r] = $carlos->req('POST', "/chamados/$id/acoes", ['acao' => 'triar', 'prioridade' => 'alta', 'responsavel_id' => $uCasa['id']]);
ok('responsável precisa ser da equipe, compras, coordenação ou gestão', $st === 422 && isset($r['campos']['responsavel_id']), $r);
[$st, $r] = $carlos->req('POST', "/chamados/$id/acoes", ['acao' => 'triar', 'prioridade' => 'alta', 'responsavel_id' => $eq['id'], 'texto' => 'Edson vê amanhã.']);
ok('Coordenação faz a triagem e passa para a equipe', $st === 200 && $r['status'] === 'em_orcamento' && $r['responsavel']['id'] === $eq['id'], $r);
[$st] = $elias->req('POST', "/chamados/$id/acoes", ['acao' => 'enviar_orcamento', 'valor' => 100, 'servico' => 'Trocar reparo']);
ok('outro membro da equipe não mexe no chamado de um colega (409)', $st === 409, $st);
[$st, $r] = $edson->req('POST', "/chamados/$id/acoes", ['acao' => 'enviar_orcamento', 'valor' => 'abc', 'servico' => 'Trocar o reparo da válvula']);
ok('valor inválido é recusado', $st === 422 && isset($r['campos']['valor']), $r);
[$st, $r] = $edson->req('POST', "/chamados/$id/acoes", ['acao' => 'enviar_orcamento', 'valor' => '300,00', 'servico' => 'Trocar o reparo da válvula']);
ok('orçamento de R$ 300 vai para a Coordenação', $st === 200 && $r['status'] === 'aguardando_aprovacao' && $r['nivel_aprovacao'] === 'coordenacao', $r);
[$st] = $edson->req('POST', "/chamados/$id/acoes", ['acao' => 'aprovar']);
ok('equipe não aprova (409)', $st === 409, $st);
[, $res] = $carlos->req('GET', '/chamados/resumo');
ok('aprovação aparece em "Para você" da Coordenação', $res['para_mim'] === 1, $res);
[$st, $r] = $carlos->req('POST', "/chamados/$id/acoes", ['acao' => 'aprovar']);
ok('Coordenação aprova dentro da alçada', $st === 200 && $r['status'] === 'aprovado' && $r['valor_aprovado'] == 300 && $r['aprovado_por'] === 'Carlos Coord 8.1', $r);
ok('aprovado, o chamado gera a Ordem de Serviço', ($r['os']['rotulo'] ?? '') === 'OS 0001' && $r['os']['status'] === 'aberta' && $r['tipo'] === 'servico', $r['os'] ?? $r);
$os = $r['os']['id'];
[$st, $r] = $carlos->req('POST', "/chamados/$id/acoes", ['acao' => 'aprovar']);
ok('aprovar duas vezes não passa (409)', $st === 409, $r);
[$st] = $rita->req('POST', "/ordens/$os/acoes", ['acao' => 'iniciar']);
ok('casa não inicia a OS (409)', $st === 409, $st);
[, $o] = $edson->req('POST', "/ordens/$os/acoes", ['acao' => 'iniciar']);
[, $r] = $edson->req('GET', "/chamados/$id");
ok('equipe inicia a OS e o chamado fica em execução', $o['status'] === 'em_andamento' && $r['status'] === 'em_execucao' && $r['os']['status'] === 'em_andamento', [$o['status'] ?? $o, $r['status']]);
[, $r] = $edson->req('POST', "/chamados/$id/acoes", ['acao' => 'ajustar_valor', 'valor' => 420, 'texto' => 'Precisou de mais uma peça']);
ok('aumento pequeno dentro da mesma alçada não para o serviço', $r['status'] === 'em_execucao' && $r['valor_estimado'] == 420 && $r['valor_aprovado'] == 300, $r);
[$st, $r] = $edson->req('POST', "/chamados/$id/acoes", ['acao' => 'ajustar_valor', 'valor' => 800, 'texto' => 'Cano quebrado na parede']);
ok('acima de R$ 500 exige orçamento anexado', $st === 422 && isset($r['campos']['valor']), $r);
[, $r] = $edson->req('POST', "/chamados/$id/anexos", ['arquivo' => $PDF, 'categoria' => 'orcamento', 'nome' => 'orcamento.pdf']);
ok('equipe anexa orçamento em PDF', count(array_filter($r['anexos'], fn($a) => $a['categoria'] === 'orcamento')) === 1, $r['anexos'] ?? $r);
[$st, $r] = $edson->req('POST', "/chamados/$id/acoes", ['acao' => 'ajustar_valor', 'valor' => 800, 'texto' => 'Cano quebrado na parede']);
ok('valor que passa para a alçada da Gestão volta para aprovação', $st === 200 && $r['status'] === 'aguardando_aprovacao' && $r['em_reaprovacao'] === true && $r['nivel_aprovacao'] === 'gestao', $r);
[$st] = $carlos->req('POST', "/chamados/$id/acoes", ['acao' => 'aprovar']);
ok('Coordenação não aprova acima da sua alçada (409)', $st === 409, $st);
[, $res] = $paulo->req('GET', '/chamados/resumo');
ok('Gestão recebe o aviso da aprovação', $res['para_mim'] === 1, $res);
[$st, $r] = $paulo->req('POST', "/chamados/$id/acoes", ['acao' => 'aprovar']);
ok('Gestão aprova o aumento e o serviço continua', $st === 200 && $r['status'] === 'em_execucao' && $r['valor_aprovado'] == 800, $r);
[, $r] = $edson->req('POST', "/chamados/$id/acoes", ['acao' => 'ajustar_valor', 'valor' => 2900, 'texto' => 'Trocar toda a tubulação']);
ok('aumento de R$ 2.000 ou mais vai para os Procuradores', $r['status'] === 'aguardando_aprovacao' && $r['nivel_aprovacao'] === 'procurador', $r);
[$st] = $paulo->req('POST', "/chamados/$id/acoes", ['acao' => 'aprovar']);
ok('Gestão não aprova a reaprovação dos Procuradores (409)', $st === 409, $st);
[$st, $r] = $pedro->req('POST', "/chamados/$id/acoes", ['acao' => 'devolver']);
ok('devolver exige motivo', $st === 422, $r);
[, $r] = $pedro->req('POST', "/chamados/$id/acoes", ['acao' => 'devolver', 'texto' => 'Fazer só o trecho do banheiro']);
ok('Procurador recusa o aumento: segue com o valor já aprovado', $r['status'] === 'em_execucao' && $r['valor_estimado'] == 800 && $r['nivel_aprovacao'] === 'gestao', $r);
[$st, $r] = $edson->req('POST', "/ordens/$os/acoes", ['acao' => 'concluir', 'valor' => 780, 'texto' => 'Feito tudo']);
ok('OS sem etapas não conclui', $st === 422 && str_contains($r['campos']['texto'] ?? '', 'etapas'), $r);
[, $o] = $edson->req('POST', "/ordens/$os/etapas", ['nome' => 'Trocar o trecho de tubulação']);
$edson->req('PUT', "/ordens/$os/etapas/" . $o['etapas'][0]['id'], ['situacao' => 'ok']);
[$st, $r] = $edson->req('POST', "/ordens/$os/acoes", ['acao' => 'concluir', 'valor' => 1500, 'texto' => 'Feito']);
ok('não conclui com valor acima do aprovado sem nova aprovação', $st === 422 && isset($r['campos']['valor']), $r);
[$st, $o] = $edson->req('POST', "/ordens/$os/acoes", ['acao' => 'concluir', 'valor' => 780, 'texto' => 'Trecho trocado e testado.']);
[, $r] = $edson->req('GET', "/chamados/$id");
ok('equipe conclui a OS e o chamado espera a confirmação da casa', $st === 200 && $o['status'] === 'concluida' && $r['status'] === 'concluido' && $r['valor_final'] == 780, [$st, $r['status'] ?? $r]);
[, $res] = $rita->req('GET', '/chamados/resumo');
ok('casa recebe o aviso para confirmar', $res['para_mim'] === 1, $res);
[$st, $r] = $rita->req('POST', "/chamados/$id/acoes", ['acao' => 'reabrir', 'texto' => 'Ainda pinga um pouco.']);
ok('casa reabre se o problema não foi resolvido: a OS volta para andamento', $st === 200 && $r['status'] === 'em_execucao' && $r['os']['status'] === 'em_andamento', $r);
$edson->req('POST', "/ordens/$os/acoes", ['acao' => 'concluir', 'texto' => 'Vedação refeita.']);
[$st, $r] = $rita->req('POST', "/chamados/$id/acoes", ['acao' => 'confirmar']);
ok('casa confirma e o chamado é encerrado', $st === 200 && $r['status'] === 'encerrado' && $r['acoes'] === [], $r);
$exp = db("SELECT categoria, expira_em FROM anexos WHERE dono_tipo = 'chamado' AND dono_id = ?", [$id]);
ok('prazo de guarda das fotos e documentos começa a contar', count($exp) === 2 && !in_array(null, array_column($exp, 'expira_em'), true), $exp);
[$st] = $rita->req('POST', "/chamados/$id/comentarios", ['texto' => 'Obrigada']);
ok('chamado encerrado não aceita mais nada (409)', $st === 409, $st);
$tipos = array_column($r['eventos'], 'tipo');
ok('linha do tempo registra cada passo, inclusive os da OS', $tipos[0] === 'abertura' && in_array('os_gerada', $tipos, true) && in_array('etapa', $tipos, true) && in_array('reaprovacao', $tipos, true) && in_array('devolucao', $tipos, true) && end($tipos) === 'confirmacao', $tipos);
$aud = db("SELECT acao FROM auditoria WHERE entidade = 'chamados' AND entidade_id = ?", [$id]);
ok('cada ação fica na auditoria', count($aud) >= 10 && in_array('aprovar', array_column($aud, 'acao'), true), count($aud));

// ------------------------------------------------------------------ Parecer da Segurança do Trabalho
echo "\nChamados — parecer da Segurança do Trabalho\n";
[, $ch2] = $rita->req('POST', '/chamados', ['casa_id' => $casa1['id'], 'categoria_id' => $eletrica, 'local' => 'Quadro de luz', 'descricao' => 'Disjuntor desarma quando liga o ar.']);
ok('categoria Elétrica exige parecer', $ch2['exige_parecer'] === true && $ch2['numero'] === 2, $ch2);
$id2 = $ch2['id'];
$carlos->req('POST', "/chamados/$id2/acoes", ['acao' => 'triar', 'prioridade' => 'normal']);
[, $r] = $carlos->req('POST', "/chamados/$id2/acoes", ['acao' => 'enviar_orcamento', 'valor' => 200, 'servico' => 'Trocar disjuntor']);
ok('orçamento vai primeiro para a Segurança do Trabalho', $r['status'] === 'aguardando_parecer', $r);
[$st] = $carlos->req('POST', "/chamados/$id2/acoes", ['acao' => 'aprovar']);
ok('ninguém aprova antes do parecer (409)', $st === 409, $st);
[, $res] = $sara->req('GET', '/chamados/resumo');
ok('Segurança do Trabalho recebe o aviso', $res['para_mim'] === 1, $res);
[$st, $r] = $sara->req('POST', "/chamados/$id2/acoes", ['acao' => 'parecer', 'resultado' => 'desfavoravel']);
ok('parecer desfavorável exige explicação', $st === 422 && isset($r['campos']['texto']), $r);
[, $r] = $sara->req('POST', "/chamados/$id2/acoes", ['acao' => 'parecer', 'resultado' => 'desfavoravel', 'texto' => 'Precisa de eletricista com NR-10.']);
ok('parecer desfavorável devolve para o orçamento', $r['status'] === 'em_orcamento' && $r['parecer']['resultado'] === 'desfavoravel', $r);
[, $r] = $carlos->req('POST', "/chamados/$id2/acoes", ['acao' => 'enviar_orcamento', 'valor' => 350, 'servico' => 'Eletricista NR-10 troca o disjuntor']);
ok('novo orçamento precisa de novo parecer', $r['status'] === 'aguardando_parecer', $r);
[, $r] = $sara->req('POST', "/chamados/$id2/acoes", ['acao' => 'parecer', 'resultado' => 'favoravel']);
ok('parecer favorável libera para aprovação', $r['status'] === 'aguardando_aprovacao' && $r['parecer']['por'] === 'Sara Segurança', $r);
[, $r] = $carlos->req('POST', "/chamados/$id2/acoes", ['acao' => 'aprovar']);
ok('Coordenação aprova depois do parecer', $r['status'] === 'aprovado', $r);

// ------------------------------------------------------------------ Saídas: cancelar e Obras
echo "\nChamados — cancelar e virar obra\n";
[, $ch3] = $rita->req('POST', '/chamados', ['casa_id' => $casa1['id'], 'categoria_id' => $hidraulica, 'descricao' => 'Abri por engano, é repetido.']);
[$st, $r] = $rita->req('POST', '/chamados/' . $ch3['id'] . '/acoes', ['acao' => 'cancelar']);
ok('cancelar exige motivo', $st === 422, $r);
[, $r] = $rita->req('POST', '/chamados/' . $ch3['id'] . '/acoes', ['acao' => 'cancelar', 'texto' => 'Chamado repetido']);
ok('quem abriu cancela enquanto está na triagem', $r['status'] === 'cancelado' && $r['motivo_cancelamento'] === 'Chamado repetido', $r);
[, $ch4] = $rita->req('POST', '/chamados', ['casa_id' => $casa1['id'], 'categoria_id' => $cat('Telhado, forro e calhas'), 'descricao' => 'Rachadura grande na laje do salão.']);
$carlos->req('POST', '/chamados/' . $ch4['id'] . '/acoes', ['acao' => 'triar', 'prioridade' => 'alta']);
[$st] = $rita->req('POST', '/chamados/' . $ch4['id'] . '/acoes', ['acao' => 'cancelar', 'texto' => 'Desisti']);
ok('depois da triagem, a casa não cancela mais (409)', $st === 409, $st);
[$st] = $rita->req('POST', '/chamados/' . $ch4['id'] . '/acoes', ['acao' => 'mudar_tipo', 'tipo' => 'obra']);
ok('casa não muda o tipo (409)', $st === 409, $st);
[, $r] = $carlos->req('POST', '/chamados/' . $ch4['id'] . '/acoes', ['acao' => 'mudar_tipo', 'tipo' => 'obra', 'texto' => 'Precisa de engenharia.']);
ok('Coordenação muda o chamado para obra', $r['tipo'] === 'obra' && $r['status'] === 'em_orcamento', $r);
[, $lst] = $rita->req('GET', '/chamados?filtro=encerrados');
ok('filtro de finalizados', $lst['total'] === 2, array_column($lst['itens'], 'status'));
[, $lst] = $carlos->req('GET', '/chamados?tipo=obra');
ok('filtro por tipo: obras', $lst['total'] === 1 && $lst['itens'][0]['id'] === $ch4['id'], $lst['total']);

// ------------------------------------------------------------------ Categorias (Administração)
echo "\nCategorias de chamado\n";
[$st] = $carlos->req('GET', '/categorias-chamado');
ok('só o administrador mexe nas categorias (403)', $st === 403, $st);
[$st, $nova] = $adminA->req('POST', '/categorias-chamado', ['nome' => 'Bebedouro', 'exige_parecer_seguranca' => false]);
ok('administrador cria categoria', $st === 201 && $nova['nome'] === 'Bebedouro', $nova);
[$st, $r] = $adminA->req('POST', '/categorias-chamado', ['nome' => 'Bebedouro']);
ok('categoria repetida é recusada', $st === 422, $r);
[, $r] = $adminA->req('PUT', '/categorias-chamado/' . $nova['id'], ['nome' => 'Bebedouro', 'ativo' => false]);
[, $cats] = $rita->req('GET', '/chamados/categorias');
ok('categoria desativada some do formulário', !in_array('Bebedouro', array_column($cats, 'nome'), true), array_column($cats, 'nome'));
[, $catsB] = $adminB->req('GET', '/categorias-chamado');
ok('categorias de um tenant não aparecem no outro', count($catsB) === 12, count($catsB));
[$st] = $adminB->req('PUT', '/categorias-chamado/' . $nova['id'], ['nome' => 'Invadida']);
ok('outro tenant não edita a categoria (404)', $st === 404, $st);
