<?php
declare(strict_types=1);

namespace Ccb;

/**
 * Catálogo de perfis e permissões definido pelo sistema.
 * É sincronizado no banco pelo bin/migrar.php (idempotente).
 * Novas permissões entram aqui junto com o módulo que as usa — nunca antes.
 */
final class Catalogo
{
    /** codigo => [nome, escopo, descricao] */
    public const PERFIS = [
        'administrador'          => ['Administrador', 'tenant', 'Gerencia usuários, casas, grupos e configurações.'],
        'casa_oracao'            => ['Casa de Oração', 'casa', 'Abre e acompanha solicitações da própria casa. Não aprova.'],
        'coordenacao_manutencao' => ['Coordenação de Manutenção', 'grupo', 'Triagem dos chamados das casas do seu grupo.'],
        'gestao_manutencao'      => ['Gestão de Manutenção', 'tenant', 'Avaliação de todos os chamados, serviços e obras.'],
        'equipe_manutencao'      => ['Equipe de Manutenção', 'tenant', 'Executa os serviços atribuídos.'],
        'orientadora_cns'        => ['Orientadora CNS', 'grupo', 'Primeira análise dos pedidos de limpeza e contagem do DML das casas do seu grupo.'],
        'coordenacao_cns'        => ['Coordenação CNS', 'tenant', 'Abre os pedidos, faz a análise final, consolida com o DML Central e libera a compra.'],
        'compras'                => ['Compras', 'tenant', 'Cotações e aquisições dos módulos (inclui a compra do material de limpeza).'],
        'seguranca_trabalho'     => ['Segurança do Trabalho', 'tenant', 'Parecer obrigatório nas categorias marcadas.'],
        'procurador'             => ['Procurador', 'tenant', 'Aprova valores acima da alçada da Gestão e todas as obras.'],
        'engenharia'             => ['Engenharia', 'tenant', 'Propõe, fiscaliza e conclui as obras.'],
    ];

    /** codigo => [modulo, descricao] */
    public const PERMISSOES = [
        'casas.ver'            => ['organizacao', 'Ver Casas de Oração dentro do próprio escopo'],
        'admin.grupos'         => ['administracao', 'Cadastrar e editar grupos'],
        'admin.casas'          => ['administracao', 'Cadastrar e editar Casas de Oração'],
        'admin.usuarios'       => ['administracao', 'Cadastrar usuários e definir perfis'],
        'admin.configuracoes'  => ['administracao', 'Alterar alçadas e configurações do tenant'],
        'admin.auditoria'      => ['administracao', 'Consultar a auditoria'],
        'admin.categorias'     => ['administracao', 'Cadastrar categorias de chamado'],
        'admin.areas'          => ['administracao', 'Cadastrar as áreas de atendimento'],
        // Fase 3 — Chamados
        'chamados.ver'         => ['chamados', 'Ver chamados das casas do próprio escopo'],
        'chamados.abrir'       => ['chamados', 'Abrir chamado para uma casa do próprio escopo'],
        'chamados.triar'       => ['chamados', 'Fazer a triagem: prioridade, responsável, serviço ou obra, e cancelar'],
        'chamados.orcar'       => ['chamados', 'Registrar o orçamento do serviço e enviar para aprovação'],
        'chamados.aprovar'     => ['chamados', 'Aprovar ou devolver orçamentos dentro da própria alçada'],
        'chamados.parecer'     => ['chamados', 'Dar o parecer de Segurança do Trabalho'],
        'chamados.executar'    => ['chamados', 'Iniciar, ajustar valor e concluir o serviço'],
        'chamados.confirmar'   => ['chamados', 'Confirmar que o problema foi resolvido ou reabrir'],
        // v1.6.0 — Ordens de Serviço (o módulo de Obras virou o tipo "Obra" da OS)
        'obras.valores'        => ['ordens', 'Ver teto, gastos e saldo das obras'],
        'obras.gastos'         => ['ordens', 'Lançar e estornar gastos das obras'],
        'obras.aprovar'        => ['ordens', 'Aprovar o teto das obras e os aumentos'],
        'etapas.modelos'       => ['ordens', 'Criar e editar os modelos de etapas'],
        // Fase 5 — CNS Limpeza
        'cns.ver'              => ['cns', 'Ver os pedidos de limpeza das casas do próprio escopo'],
        'cns.pedir'            => ['cns', 'Fazer o pedido de limpeza das casas do próprio escopo'],
        'cns.conferir'         => ['cns', 'Conferir e aprovar pedidos de limpeza'],
        'cns.gerir'            => ['cns', 'Catálogo, ciclos de pedido, análise final, consolidação e distribuição'],
        'cns.compras'          => ['cns', 'Ver o consolidado com preços e registrar a compra'],
    ];

    /** perfil => permissões. Todo perfil enxerga casas no seu escopo. */
    public static function permissoesDoPerfil(string $perfil): array
    {
        $base = ['casas.ver'];
        $chamados = [
            'administrador'          => ['chamados.ver'],
            'casa_oracao'            => ['chamados.ver', 'chamados.abrir', 'chamados.confirmar'],
            'coordenacao_manutencao' => ['chamados.ver', 'chamados.abrir', 'chamados.triar', 'chamados.orcar', 'chamados.aprovar', 'chamados.executar', 'chamados.confirmar'],
            'gestao_manutencao'      => ['chamados.ver', 'chamados.abrir', 'chamados.triar', 'chamados.orcar', 'chamados.aprovar', 'chamados.executar', 'chamados.confirmar'],
            'equipe_manutencao'      => ['chamados.ver', 'chamados.orcar', 'chamados.executar'],
            'compras'                => ['chamados.ver', 'chamados.orcar'],
            'seguranca_trabalho'     => ['chamados.ver', 'chamados.parecer'],
            'procurador'             => ['chamados.ver', 'chamados.aprovar'],
            'engenharia'             => ['chamados.ver', 'chamados.abrir', 'chamados.triar', 'chamados.orcar', 'chamados.executar', 'chamados.confirmar'],
        ][$perfil] ?? [];
        $obras = [
            'administrador'          => ['obras.valores', 'etapas.modelos'],
            'coordenacao_manutencao' => ['obras.valores', 'etapas.modelos'],
            'gestao_manutencao'      => ['obras.valores', 'obras.gastos', 'etapas.modelos'],
            'equipe_manutencao'      => ['obras.valores', 'etapas.modelos'],
            'compras'                => ['obras.valores', 'obras.gastos'],
            'seguranca_trabalho'     => ['obras.valores'],
            'procurador'             => ['obras.valores', 'obras.aprovar'],
            'engenharia'             => ['obras.valores', 'obras.gastos', 'etapas.modelos'],
        ][$perfil] ?? [];
        $cns = [
            'administrador'   => ['cns.ver'],
            'casa_oracao'     => ['cns.ver', 'cns.pedir'],
            'orientadora_cns' => ['cns.ver', 'cns.pedir', 'cns.conferir'],
            'coordenacao_cns' => ['cns.ver', 'cns.pedir', 'cns.conferir', 'cns.gerir', 'cns.compras'],
            'compras'         => ['cns.ver', 'cns.compras'],
        ][$perfil] ?? [];
        $base = array_merge($base, $chamados, $obras, $cns);
        if ($perfil === 'administrador') {
            return array_merge($base, ['admin.grupos', 'admin.casas', 'admin.usuarios', 'admin.configuracoes', 'admin.auditoria', 'admin.categorias', 'admin.areas']);
        }
        return $base;
    }

    /** Alçada de aprovação de cada perfil, da menor para a maior. */
    public const NIVEIS = ['coordenacao' => 1, 'gestao' => 2, 'procurador' => 3];

    /** Categorias iniciais de chamado: [nome, ícone, exige parecer da Segurança do Trabalho]. */
    public const CATEGORIAS_PADRAO = [
        ['Elétrica', 'raio', 1],
        ['Hidráulica e esgoto', 'gota', 0],
        ['Telhado, forro e calhas', 'telhado', 1],
        ['Ar-condicionado e ventiladores', 'vento', 0],
        ['Portas, janelas e fechaduras', 'chave', 0],
        ['Pintura e paredes', 'pincel', 0],
        ['Piso e calçada', 'piso', 0],
        ['Som e instrumentos', 'som', 0],
        ['Incêndio e segurança', 'escudo', 1],
        ['Móveis e bancos', 'banco', 0],
        ['Jardim e área externa', 'folha', 0],
        ['Outros', 'outros', 0],
    ];

    /** Configurações iniciais de todo tenant novo (podem ser alteradas pelo administrador). */
    public const CONFIG_PADRAO = [
        'alcada_coordenacao_max'   => '500.00',
        'alcada_gestao_max'        => '1000.00',
        'reaprovacao_aumento_min'  => '2000.00',
        'orcamento_obrigatorio_acima' => '500.00',
        'retencao_fotos_servico_meses' => '24',
        'retencao_documentos_meses'    => '60',
    ];

    /** Catálogo inicial da CNS Limpeza: [nome, embalagem, unidade, categoria]. */
    public const PRODUTOS_CNS_PADRAO = [
        ['Água sanitária', 'galão 5 L', 'galão', 'limpeza'],
        ['Desinfetante', 'galão 5 L', 'galão', 'limpeza'],
        ['Detergente', 'frasco 500 ml', 'frasco', 'cozinha'],
        ['Sabão em pó', 'caixa 1 kg', 'caixa', 'limpeza'],
        ['Limpa-vidros', 'frasco 500 ml', 'frasco', 'limpeza'],
        ['Álcool 70%', 'frasco 1 L', 'frasco', 'limpeza'],
        ['Sabonete líquido', 'galão 5 L', 'galão', 'banheiro'],
        ['Papel higiênico', 'fardo 64 rolos', 'fardo', 'banheiro'],
        ['Papel toalha interfolhado', 'fardo 1.000 folhas', 'fardo', 'banheiro'],
        ['Saco de lixo 100 L', 'pacote 100 un.', 'pacote', 'descartaveis'],
        ['Saco de lixo 50 L', 'pacote 100 un.', 'pacote', 'descartaveis'],
        ['Copo descartável 200 ml', 'pacote 100 un.', 'pacote', 'descartaveis'],
        ['Esponja dupla face', 'unidade', 'unidade', 'utensilios'],
        ['Pano de chão', 'unidade', 'unidade', 'utensilios'],
        ['Luva de borracha', 'par', 'par', 'utensilios'],
        ['Vassoura', 'unidade', 'unidade', 'utensilios'],
        ['Rodo', 'unidade', 'unidade', 'utensilios'],
    ];

    /** Modelos iniciais de etapas da Ordem de Serviço (editáveis em Administração → Modelos de etapas). */
    public const MODELOS_ETAPAS_PADRAO = [
        'Pintura' => ['Proteção do piso e dos móveis', 'Raspagem e lixamento', 'Correção de trincas', 'Massa corrida', 'Lixamento da massa',
            'Selador ou fundo', 'Primeira demão', 'Segunda demão', 'Acabamento e retoques', 'Limpeza final'],
        'Troca de piso' => ['Retirada dos móveis', 'Retirada do piso antigo', 'Regularização do contrapiso', 'Assentamento do piso',
            'Rejunte', 'Rodapé', 'Limpeza final'],
        'Elétrica' => ['Desligar o circuito e sinalizar', 'Identificar o problema', 'Passagem de cabos e infraestrutura',
            'Troca de componentes', 'Teste dos circuitos', 'Organização do quadro', 'Liberação para uso'],
        'Hidráulica' => ['Fechar o registro', 'Localizar o vazamento ou defeito', 'Abertura (parede ou piso)', 'Troca de tubos e peças',
            'Teste de vazamento', 'Fechamento e acabamento', 'Limpeza final'],
        'Telhado e calhas' => ['Isolamento da área e EPIs', 'Inspeção do telhado', 'Troca de telhas', 'Limpeza das calhas',
            'Vedação', 'Teste com água', 'Limpeza final'],
        'Obra (geral)' => ['Mobilização e canteiro', 'Demolição e retirada de entulho', 'Fundação e estrutura', 'Alvenaria',
            'Instalações elétricas', 'Instalações hidráulicas', 'Cobertura', 'Revestimentos e piso', 'Pintura', 'Limpeza e entrega'],
    ];

    /** Áreas iniciais de atendimento: [nome, descrição] (Administração → Áreas). */
    public const AREAS_PADRAO = [
        ['Civil', 'Alvenaria, telhado, pisos, pintura, esquadrias e obras'],
        ['Elétrica', 'Instalações elétricas, quadros, iluminação e ventiladores'],
        ['Elétrica - Alarme/Luz/Som Emergência', 'Alarme, luz de emergência e sistema de som'],
        ['Informática', 'Computadores, internet e equipamentos'],
        ['Manutenção de Órgão', 'Órgãos e instrumentos'],
        ['Compras', 'Aquisição de materiais, equipamentos e serviços'],
        ['Segurança', 'Segurança do Trabalho: trabalho em altura, EPIs, avaliações'],
    ];

    public const FUNCOES_CASA = ['manutencao', 'escrita', 'limpeza', 'outra'];
}
