<?php
declare(strict_types=1);

use Ccb\{Config, HttpErro, Requisicao, Resposta, Roteador, Sessao};
use Ccb\Controladores\{AuthControlador as A, OrganizacaoControlador as O, UsuariosControlador as U};
use Ccb\Controladores\{AreasControlador as Ar, AnexosControlador as Ax, CasaPaginaControlador as P, ChamadosControlador as Ch, OrdensControlador as Os, CnsControlador as Cn, EstoqueControlador as Es};

require __DIR__ . '/../src/bootstrap.php';

ini_set('display_errors', '0');

try {
    $req = Requisicao::capturar();
    Sessao::iniciar();

    $rt = new Roteador();
    $rt->add('GET',  '/saude', fn() => ['ok' => true], true);

    // Autenticação
    $rt->add('GET',  '/auth/sessao', [A::class, 'sessao'], true);
    $rt->add('POST', '/auth/login',  [A::class, 'login'], true);
    $rt->add('POST', '/auth/logout', [A::class, 'logout'], true);
    $rt->add('GET',  '/auth/eu',     [A::class, 'eu']);
    $rt->add('POST', '/auth/senha',  [A::class, 'trocarSenha']);

    // Organização
    $rt->add('GET',  '/grupos',        [O::class, 'listarGrupos']);
    $rt->add('POST', '/grupos',        [O::class, 'criarGrupo']);
    $rt->add('PUT',  '/grupos/{id}',   [O::class, 'editarGrupo']);
    $rt->add('GET',  '/casas',         [O::class, 'listarCasas']);
    $rt->add('POST', '/casas',         [O::class, 'criarCasa']);
    $rt->add('GET',  '/casas/{id}',    [O::class, 'verCasa']);
    $rt->add('PUT',  '/casas/{id}',    [O::class, 'editarCasa']);
    $rt->add('GET',  '/configuracoes', [O::class, 'verConfiguracoes']);
    $rt->add('PUT',  '/configuracoes', [O::class, 'editarConfiguracoes']);
    $rt->add('GET',  '/auditoria',     [O::class, 'listarAuditoria']);

    // Página da casa (v1.1.0)
    $rt->add('POST',   '/casas/{id}/ministerio',        [P::class, 'criarMinistro']);
    $rt->add('PUT',    '/casas/{id}/ministerio/ordem',  [P::class, 'ordenarMinisterio']);
    $rt->add('PUT',    '/casas/{id}/ministerio/{mid}',  [P::class, 'editarMinistro']);
    $rt->add('DELETE', '/casas/{id}/ministerio/{mid}',  [P::class, 'excluirMinistro']);
    $rt->add('POST',   '/casas/{id}/fotos',             [P::class, 'enviarFoto']);
    $rt->add('PUT',    '/casas/{id}/fotos/{fid}',       [P::class, 'editarFoto']);
    $rt->add('DELETE', '/casas/{id}/fotos/{fid}',       [P::class, 'excluirFoto']);
    $rt->add('GET',    '/anexos/{id}',                  [Ax::class, 'ver']);

    // Chamados (Fase 3)
    $rt->add('GET',    '/chamados',                     [Ch::class, 'listar']);
    $rt->add('POST',   '/chamados',                     [Ch::class, 'abrir']);
    $rt->add('GET',    '/chamados/resumo',              [Ch::class, 'resumo']);
    $rt->add('GET',    '/chamados/categorias',          [Ch::class, 'categorias']);
    $rt->add('GET',    '/chamados/responsaveis',        [Ch::class, 'responsaveis']);
    $rt->add('GET',    '/chamados/{id}',                [Ch::class, 'ver']);
    $rt->add('POST',   '/chamados/{id}/acoes',          [Ch::class, 'acao']);
    $rt->add('POST',   '/chamados/{id}/comentarios',    [Ch::class, 'comentar']);
    $rt->add('POST',   '/chamados/{id}/anexos',         [Ch::class, 'enviarAnexo']);
    $rt->add('DELETE', '/chamados/{id}/anexos/{aid}',   [Ch::class, 'excluirAnexo']);
    $rt->add('POST',   '/chamados/{id}/materiais',       [Ch::class, 'adicionarMaterial']);
    $rt->add('PUT',    '/chamados/{id}/materiais/{mid}', [Ch::class, 'editarMaterial']);
    $rt->add('DELETE', '/chamados/{id}/materiais/{mid}', [Ch::class, 'excluirMaterial']);
    // Ordens de Serviço (v1.6.0)
    $rt->add('GET',    '/ordens',                       [Os::class, 'listar']);
    $rt->add('GET',    '/ordens/resumo',                [Os::class, 'resumo']);
    $rt->add('GET',    '/ordens/pendencias',            [Os::class, 'pendencias']);
    $rt->add('GET',    '/ordens/{id}',                  [Os::class, 'ver']);
    $rt->add('PUT',    '/ordens/{id}',                  [Os::class, 'editar']);
    $rt->add('POST',   '/ordens/{id}/acoes',            [Os::class, 'acao']);
    $rt->add('POST',   '/ordens/{id}/etapas',           [Os::class, 'adicionarEtapas']);
    $rt->add('PUT',    '/ordens/{id}/etapas/ordem',     [Os::class, 'ordenarEtapas']);
    $rt->add('PUT',    '/ordens/{id}/etapas/{eid}',     [Os::class, 'editarEtapa']);
    $rt->add('DELETE', '/ordens/{id}/etapas/{eid}',     [Os::class, 'excluirEtapa']);
    $rt->add('POST',   '/ordens/{id}/etapas/{eid}/fotos',        [Os::class, 'fotoEtapa']);
    $rt->add('DELETE', '/ordens/{id}/etapas/{eid}/fotos/{aid}',  [Os::class, 'excluirFotoEtapa']);
    $rt->add('POST',   '/ordens/{id}/pendencias/{pid}/resolver', [Os::class, 'resolverPendencia']);
    $rt->add('POST',   '/ordens/{id}/gastos',           [Os::class, 'lancarGasto']);
    $rt->add('POST',   '/ordens/{id}/gastos/{gid}/estorno', [Os::class, 'estornarGasto']);
    $rt->add('GET',    '/modelos-etapas',               [Os::class, 'listarModelos']);
    $rt->add('POST',   '/modelos-etapas',               [Os::class, 'criarModelo']);
    $rt->add('PUT',    '/modelos-etapas/{id}',          [Os::class, 'editarModelo']);
    // CNS Limpeza (Fase 5)
    $rt->add('GET',    '/cns/resumo',                   [Cn::class, 'resumo']);
    $rt->add('GET',    '/cns/loja',                     [Cn::class, 'loja']);
    $rt->add('PUT',    '/cns/loja',                     [Cn::class, 'salvarCarrinho']);
    $rt->add('GET',    '/cns/pedidos',                  [Cn::class, 'listarPedidos']);
    $rt->add('GET',    '/cns/pedidos/{id}',             [Cn::class, 'verPedido']);
    $rt->add('POST',   '/cns/pedidos/{id}/acoes',       [Cn::class, 'acaoPedido']);
    $rt->add('GET',    '/cns/ciclos',                   [Cn::class, 'listarCiclos']);
    $rt->add('POST',   '/cns/ciclos',                   [Cn::class, 'criarCiclo']);
    $rt->add('PUT',    '/cns/ciclos/{id}',              [Cn::class, 'editarCiclo']);
    $rt->add('POST',   '/cns/ciclos/{id}/acoes',        [Cn::class, 'acaoCiclo']);
    $rt->add('GET',    '/cns/ciclos/{id}/consolidado',  [Cn::class, 'consolidado']);
    $rt->add('POST',   '/cns/ciclos/{id}/receber',      [Cn::class, 'receberCompra']);
    $rt->add('PUT',    '/cns/ciclos/{id}/compra',       [Cn::class, 'salvarCompra']);
    $rt->add('GET',    '/cns/agenda',                   [Cn::class, 'verAgenda']);
    $rt->add('PUT',    '/cns/agenda',                   [Cn::class, 'salvarAgenda']);
    // Estoques (Fase 6)
    $rt->add('GET',    '/estoque/locais',               [Es::class, 'locais']);
    $rt->add('GET',    '/estoque/locais/{id}',          [Es::class, 'ver']);
    $rt->add('POST',   '/estoque/locais/{id}/contagem', [Es::class, 'contar']);
    $rt->add('POST',   '/estoque/locais/{id}/movimentos', [Es::class, 'movimentar']);
    $rt->add('GET',    '/cns/produtos',                 [Cn::class, 'listarProdutos']);
    $rt->add('POST',   '/cns/produtos',                 [Cn::class, 'criarProduto']);
    $rt->add('PUT',    '/cns/produtos/{id}',            [Cn::class, 'editarProduto']);
    $rt->add('POST',   '/cns/produtos/{id}/foto',       [Cn::class, 'fotoProduto']);
    $rt->add('GET',    '/categorias-chamado',           [Ch::class, 'listarCategoriasAdmin']);
    $rt->add('POST',   '/categorias-chamado',           [Ch::class, 'criarCategoria']);
    $rt->add('PUT',    '/categorias-chamado/{id}',      [Ch::class, 'editarCategoria']);

    // Áreas de atendimento (v1.7.0)
    $rt->add('GET',  '/areas',                [Ar::class, 'listar']);
    $rt->add('POST', '/areas',                [Ar::class, 'criar']);
    $rt->add('PUT',  '/areas/{id}',           [Ar::class, 'editar']);

    // Usuários
    $rt->add('GET',  '/perfis',               [U::class, 'perfis']);
    $rt->add('GET',  '/usuarios',             [U::class, 'listar']);
    $rt->add('POST', '/usuarios',             [U::class, 'criar']);
    $rt->add('GET',  '/usuarios/{id}',        [U::class, 'ver']);
    $rt->add('PUT',  '/usuarios/{id}',        [U::class, 'editar']);
    $rt->add('POST', '/usuarios/{id}/senha',  [U::class, 'redefinirSenha']);

    $rt->despachar($req);
} catch (HttpErro $e) {
    $corpo = ['erro' => $e->getMessage()];
    if ($e->campos) $corpo['campos'] = $e->campos;
    Resposta::json($corpo, $e->status);
} catch (\Throwable $e) {
    error_log('[CCB] ' . $e::class . ': ' . $e->getMessage() . ' em ' . $e->getFile() . ':' . $e->getLine());
    $corpo = ['erro' => 'Erro interno. Tente novamente em instantes.'];
    // O detalhe técnico aparece em desenvolvimento e, no servidor, só para o administrador (ajuda a achar o problema sem abrir o log).
    $mostrar = Config::get('ambiente') === 'desenvolvimento';
    if (!$mostrar) { try { $mostrar = \Ccb\Acesso::temPerfil('administrador'); } catch (\Throwable) {} }
    if ($mostrar) $corpo['detalhe'] = $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')';
    Resposta::json($corpo, 500);
}
