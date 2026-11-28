-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados do SGClim (só a estrutura, sem dados) — exportado pelo Eneas em 28/11/2026
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `anexos`
--

CREATE TABLE `anexos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `dono_tipo` varchar(30) NOT NULL,
  `dono_id` bigint(20) UNSIGNED NOT NULL,
  `categoria` varchar(30) NOT NULL,
  `nome_original` varchar(255) DEFAULT NULL,
  `caminho` varchar(255) NOT NULL,
  `mime` varchar(80) DEFAULT NULL,
  `tamanho` int(10) UNSIGNED DEFAULT NULL,
  `largura` int(10) UNSIGNED DEFAULT NULL,
  `altura` int(10) UNSIGNED DEFAULT NULL,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `asaas_eventos`
--

CREATE TABLE `asaas_eventos` (
  `id` int(11) NOT NULL,
  `evento_id` varchar(80) NOT NULL,
  `tipo` varchar(60) NOT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  `corpo` mediumtext DEFAULT NULL,
  `recebido_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `assinaturas`
--

CREATE TABLE `assinaturas` (
  `tenant_id` int(11) NOT NULL,
  `situacao` varchar(20) NOT NULL DEFAULT 'teste',
  `plano_id` int(11) DEFAULT NULL,
  `ciclo` varchar(10) NOT NULL DEFAULT 'mensal',
  `usuarios_extras` int(11) NOT NULL DEFAULT 0,
  `valor` decimal(10,2) DEFAULT NULL,
  `teste_ate` date DEFAULT NULL,
  `pago_ate` date DEFAULT NULL,
  `cobranca_nome` varchar(200) DEFAULT NULL,
  `cobranca_doc` varchar(20) DEFAULT NULL,
  `cobranca_email` varchar(190) DEFAULT NULL,
  `cobranca_celular` varchar(30) DEFAULT NULL,
  `asaas_cliente` varchar(40) DEFAULT NULL,
  `asaas_assinatura` varchar(40) DEFAULT NULL,
  `inicio_em` datetime DEFAULT NULL,
  `cancelada_em` datetime DEFAULT NULL,
  `cancel_motivo` varchar(255) DEFAULT NULL,
  `observacao` varchar(255) DEFAULT NULL,
  `sincronizado_em` datetime DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `assinatura_cobrancas`
--

CREATE TABLE `assinatura_cobrancas` (
  `id` varchar(40) NOT NULL,
  `tenant_id` int(11) NOT NULL,
  `assinatura` varchar(40) DEFAULT NULL,
  `valor` decimal(10,2) NOT NULL DEFAULT 0.00,
  `vencimento` date NOT NULL,
  `status` varchar(40) NOT NULL,
  `forma` varchar(20) DEFAULT NULL,
  `link` varchar(255) DEFAULT NULL,
  `pago_em` date DEFAULT NULL,
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `assinatura_promos`
--

CREATE TABLE `assinatura_promos` (
  `tenant_id` int(11) NOT NULL,
  `faturas` int(11) NOT NULL,
  `encerrado` tinyint(4) NOT NULL DEFAULT 0,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `assinatura_vinculos`
--

CREATE TABLE `assinatura_vinculos` (
  `tenant_id` int(11) NOT NULL,
  `indicador_id` int(11) DEFAULT NULL,
  `cupom_id` int(11) DEFAULT NULL,
  `cupom_encerrado` tinyint(4) NOT NULL DEFAULT 0,
  `codigo_informado` varchar(30) DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `auditoria`
--

CREATE TABLE `auditoria` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED DEFAULT NULL,
  `usuario_id` bigint(20) UNSIGNED DEFAULT NULL,
  `acao` varchar(60) NOT NULL,
  `tabela` varchar(60) DEFAULT NULL,
  `registro_id` bigint(20) UNSIGNED DEFAULT NULL,
  `resumo` varchar(500) DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `cadastro_codigos`
--

CREATE TABLE `cadastro_codigos` (
  `cadastro_id` int(11) NOT NULL,
  `codigo` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `catalogo_maquinas`
--

CREATE TABLE `catalogo_maquinas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(150) NOT NULL,
  `materiais` longtext DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `ordem` int(11) NOT NULL DEFAULT 0,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `catalogo_materiais`
--

CREATE TABLE `catalogo_materiais` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `tipo` varchar(40) NOT NULL,
  `nome` varchar(200) NOT NULL,
  `unidade` varchar(20) NOT NULL DEFAULT 'un',
  `custo` decimal(12,2) NOT NULL DEFAULT 0.00,
  `markup_pct` decimal(5,2) NOT NULL DEFAULT 15.00,
  `regra` longtext DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `ordem` int(11) NOT NULL DEFAULT 0,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `catalogo_servicos`
--

CREATE TABLE `catalogo_servicos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(200) NOT NULL,
  `unidade` varchar(20) NOT NULL DEFAULT 'un',
  `valor` decimal(12,2) NOT NULL DEFAULT 0.00,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `ordem` int(11) NOT NULL DEFAULT 0,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `chamados`
--

CREATE TABLE `chamados` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `numero` bigint(20) UNSIGNED NOT NULL,
  `cliente_id` bigint(20) UNSIGNED NOT NULL,
  `local_id` bigint(20) UNSIGNED DEFAULT NULL,
  `com_quem_falar` varchar(150) DEFAULT NULL,
  `status` varchar(40) NOT NULL DEFAULT 'Falta enviar orçamento',
  `tipo_servico` varchar(60) DEFAULT NULL,
  `origem` varchar(60) DEFAULT NULL,
  `necessidade` text DEFAULT NULL,
  `aberto_em` date NOT NULL,
  `fechado_em` date DEFAULT NULL,
  `ganho_em` date DEFAULT NULL,
  `nota_fiscal` tinyint(1) NOT NULL DEFAULT 0,
  `valor` decimal(12,2) DEFAULT NULL,
  `recebido` decimal(12,2) NOT NULL DEFAULT 0.00,
  `custo` decimal(12,2) DEFAULT NULL,
  `rt` decimal(12,2) DEFAULT NULL,
  `imposto` decimal(12,2) DEFAULT NULL,
  `andamento` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `obs` text DEFAULT NULL,
  `responsavel_id` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL,
  `proximo_retorno` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `chamado_acompanhamentos`
--

CREATE TABLE `chamado_acompanhamentos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `chamado_id` bigint(20) UNSIGNED NOT NULL,
  `tipo` varchar(20) NOT NULL DEFAULT 'contato',
  `texto` text DEFAULT NULL,
  `proximo_retorno` date DEFAULT NULL,
  `usuario_id` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `clientes`
--

CREATE TABLE `clientes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `numero` bigint(20) UNSIGNED NOT NULL,
  `nome` varchar(200) NOT NULL,
  `tipo_pessoa` enum('PJ','PF') NOT NULL DEFAULT 'PJ',
  `documento` varchar(20) DEFAULT NULL,
  `contato` varchar(150) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `telefone` varchar(30) DEFAULT NULL,
  `endereco` varchar(255) DEFAULT NULL,
  `origem` varchar(60) DEFAULT NULL,
  `situacao` enum('novo','antigo') NOT NULL DEFAULT 'novo',
  `obs` text DEFAULT NULL,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `comissoes`
--

CREATE TABLE `comissoes` (
  `id` int(11) NOT NULL,
  `indicador_id` int(11) NOT NULL,
  `tenant_id` int(11) NOT NULL,
  `cobranca_id` varchar(40) NOT NULL,
  `base` decimal(10,2) NOT NULL DEFAULT 0.00,
  `valor` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` varchar(12) NOT NULL DEFAULT 'pendente',
  `pago_em` date DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `config`
--

CREATE TABLE `config` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `chave` varchar(60) NOT NULL,
  `valor` longtext DEFAULT NULL,
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `contratos`
--

CREATE TABLE `contratos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `numero` bigint(20) UNSIGNED NOT NULL,
  `cliente_id` bigint(20) UNSIGNED NOT NULL,
  `titulo` varchar(200) DEFAULT NULL,
  `chamado_id` bigint(20) UNSIGNED DEFAULT NULL,
  `com_quem_falar` varchar(150) DEFAULT NULL,
  `responsavel_id` bigint(20) UNSIGNED DEFAULT NULL,
  `tipo` varchar(60) DEFAULT NULL,
  `inicio` date DEFAULT NULL,
  `fim` date DEFAULT NULL,
  `valor_mensal` decimal(12,2) DEFAULT NULL,
  `periodicidade` varchar(30) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'Solicitado',
  `obs` text DEFAULT NULL,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL,
  `solicitado_em` date DEFAULT NULL,
  `enviado_em` date DEFAULT NULL,
  `validade_dias` smallint(5) UNSIGNED NOT NULL DEFAULT 15,
  `assinado_em` date DEFAULT NULL,
  `encerrado_em` date DEFAULT NULL,
  `vigencia_meses` smallint(5) UNSIGNED DEFAULT NULL,
  `renovacao_auto` tinyint(1) NOT NULL DEFAULT 0,
  `reajuste` varchar(80) DEFAULT NULL,
  `dia_vencimento` tinyint(3) UNSIGNED DEFAULT NULL,
  `proximo_retorno` date DEFAULT NULL,
  `motivo` varchar(255) DEFAULT NULL,
  `dados` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `contrato_eventos`
--

CREATE TABLE `contrato_eventos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `contrato_id` bigint(20) UNSIGNED NOT NULL,
  `tipo` varchar(20) NOT NULL DEFAULT 'nota',
  `texto` text DEFAULT NULL,
  `retorno` date DEFAULT NULL,
  `usuario_id` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `contrato_faturamento`
--

CREATE TABLE `contrato_faturamento` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `contrato_id` int(10) UNSIGNED NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `dia_vencimento` tinyint(3) UNSIGNED DEFAULT NULL,
  `valor` decimal(14,2) DEFAULT NULL,
  `categoria_id` int(10) UNSIGNED DEFAULT NULL,
  `centro_id` int(10) UNSIGNED DEFAULT NULL,
  `conta_id` int(10) UNSIGNED DEFAULT NULL,
  `forma` varchar(30) DEFAULT NULL,
  `com_nota` tinyint(1) NOT NULL DEFAULT 1,
  `inicio_cobranca` date DEFAULT NULL,
  `descricao` varchar(120) DEFAULT NULL,
  `obs` varchar(1000) DEFAULT NULL,
  `atualizado_por` int(10) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `contrato_versoes`
--

CREATE TABLE `contrato_versoes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `contrato_id` bigint(20) UNSIGNED NOT NULL,
  `versao` smallint(5) UNSIGNED NOT NULL,
  `valor_mensal` decimal(12,2) DEFAULT NULL,
  `dados` longtext DEFAULT NULL,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `cupons`
--

CREATE TABLE `cupons` (
  `id` int(11) NOT NULL,
  `codigo` varchar(30) NOT NULL,
  `descricao` varchar(150) DEFAULT NULL,
  `tipo` varchar(12) NOT NULL DEFAULT 'percentual',
  `valor` decimal(10,2) NOT NULL,
  `faturas` int(11) NOT NULL DEFAULT 1,
  `validade` date DEFAULT NULL,
  `limite` int(11) DEFAULT NULL,
  `usos` int(11) NOT NULL DEFAULT 0,
  `planos` varchar(255) DEFAULT NULL,
  `ativo` tinyint(4) NOT NULL DEFAULT 1,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `equipamentos`
--

CREATE TABLE `equipamentos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `cliente_id` bigint(20) UNSIGNED NOT NULL,
  `local_id` bigint(20) UNSIGNED DEFAULT NULL,
  `tag` varchar(60) DEFAULT NULL,
  `tipo` varchar(60) DEFAULT NULL,
  `marca` varchar(60) DEFAULT NULL,
  `modelo` varchar(100) DEFAULT NULL,
  `capacidade_btu` int(10) UNSIGNED DEFAULT NULL,
  `serie` varchar(100) DEFAULT NULL,
  `ambiente` varchar(150) DEFAULT NULL,
  `dados` longtext DEFAULT NULL,
  `qr_token` char(24) DEFAULT NULL,
  `ref_antiga` varchar(40) DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `equipes`
--

CREATE TABLE `equipes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(100) NOT NULL,
  `lider_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cor` varchar(9) DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `equipe_membros`
--

CREATE TABLE `equipe_membros` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `equipe_id` bigint(20) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `fin_categorias`
--

CREATE TABLE `fin_categorias` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(80) NOT NULL,
  `tipo` varchar(10) NOT NULL,
  `grupo_dre` varchar(30) NOT NULL,
  `ativa` tinyint(1) NOT NULL DEFAULT 1,
  `ordem` int(11) NOT NULL DEFAULT 0,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `excluido_em` datetime DEFAULT NULL,
  `pai_id` int(10) UNSIGNED DEFAULT NULL COMMENT 'categoria de cima (subcategoria)',
  `codigo` int(10) UNSIGNED DEFAULT NULL COMMENT 'nº da categoria ou do plano dentro dela'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `fin_centros`
--

CREATE TABLE `fin_centros` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(80) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `fin_contas`
--

CREATE TABLE `fin_contas` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(80) NOT NULL,
  `tipo` varchar(20) NOT NULL DEFAULT 'banco',
  `banco` varchar(60) DEFAULT NULL,
  `agencia` varchar(20) DEFAULT NULL,
  `numero` varchar(30) DEFAULT NULL,
  `saldo_inicial` decimal(14,2) NOT NULL DEFAULT 0.00,
  `saldo_inicial_em` date NOT NULL,
  `integracao` varchar(20) DEFAULT NULL,
  `ativa` tinyint(1) NOT NULL DEFAULT 1,
  `ordem` int(11) NOT NULL DEFAULT 0,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL,
  `limite` decimal(12,2) DEFAULT NULL,
  `dia_melhor_compra` tinyint(3) UNSIGNED DEFAULT NULL,
  `dia_vencimento` tinyint(3) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `fin_eventos`
--

CREATE TABLE `fin_eventos` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `titulo_id` int(10) UNSIGNED NOT NULL,
  `tipo` varchar(20) NOT NULL,
  `texto` varchar(500) NOT NULL,
  `usuario_id` int(10) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `fin_extrato`
--

CREATE TABLE `fin_extrato` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `conta_id` int(10) UNSIGNED NOT NULL,
  `importacao_id` int(10) UNSIGNED DEFAULT NULL,
  `origem` varchar(10) NOT NULL DEFAULT 'ofx',
  `data` date NOT NULL,
  `valor` decimal(14,2) NOT NULL,
  `descricao` varchar(255) DEFAULT NULL,
  `documento` varchar(80) DEFAULT NULL,
  `id_externo` varchar(120) DEFAULT NULL,
  `hash` char(40) NOT NULL,
  `status` varchar(12) NOT NULL DEFAULT 'pendente',
  `movimento_id` int(10) UNSIGNED DEFAULT NULL,
  `conciliado_por` int(10) UNSIGNED DEFAULT NULL,
  `conciliado_em` datetime DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `fin_importacoes`
--

CREATE TABLE `fin_importacoes` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `conta_id` int(10) UNSIGNED NOT NULL,
  `origem` varchar(10) NOT NULL,
  `arquivo` varchar(200) DEFAULT NULL,
  `linhas` int(11) NOT NULL DEFAULT 0,
  `novas` int(11) NOT NULL DEFAULT 0,
  `duplicadas` int(11) NOT NULL DEFAULT 0,
  `saldo_extrato` decimal(14,2) DEFAULT NULL,
  `saldo_em` date DEFAULT NULL,
  `criado_por` int(10) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `fin_movimentos`
--

CREATE TABLE `fin_movimentos` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `conta_id` int(10) UNSIGNED NOT NULL,
  `data` date NOT NULL,
  `valor` decimal(14,2) NOT NULL,
  `tipo` varchar(15) NOT NULL DEFAULT 'baixa',
  `titulo_id` int(10) UNSIGNED DEFAULT NULL,
  `categoria_id` int(10) UNSIGNED DEFAULT NULL,
  `centro_id` int(10) UNSIGNED DEFAULT NULL,
  `descricao` varchar(255) DEFAULT NULL,
  `transferencia` varchar(32) DEFAULT NULL,
  `conciliado` tinyint(1) NOT NULL DEFAULT 0,
  `extrato_id` int(10) UNSIGNED DEFAULT NULL,
  `criado_por` int(10) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `excluido_em` datetime DEFAULT NULL,
  `excluido_por` int(10) UNSIGNED DEFAULT NULL,
  `vinculo_tipo` varchar(10) DEFAULT NULL COMMENT 'chamado | contrato (opcional)',
  `vinculo_id` int(10) UNSIGNED DEFAULT NULL,
  `fatura` char(7) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `fin_recorrencias`
--

CREATE TABLE `fin_recorrencias` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `tipo` varchar(10) NOT NULL,
  `descricao` varchar(255) NOT NULL,
  `cliente_id` int(10) UNSIGNED DEFAULT NULL,
  `fornecedor_id` int(10) UNSIGNED DEFAULT NULL,
  `categoria_id` int(10) UNSIGNED DEFAULT NULL,
  `centro_id` int(10) UNSIGNED DEFAULT NULL,
  `conta_id` int(10) UNSIGNED DEFAULT NULL,
  `forma` varchar(30) DEFAULT NULL,
  `com_nota` tinyint(1) NOT NULL DEFAULT 0,
  `valor` decimal(14,2) NOT NULL,
  `intervalo_meses` tinyint(3) UNSIGNED NOT NULL DEFAULT 1,
  `inicio` date NOT NULL,
  `fim` date DEFAULT NULL,
  `ativa` tinyint(1) NOT NULL DEFAULT 1,
  `gerado_ate` date DEFAULT NULL,
  `obs` text DEFAULT NULL,
  `criado_por` int(10) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `fin_titulos`
--

CREATE TABLE `fin_titulos` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `tipo` varchar(10) NOT NULL,
  `descricao` varchar(255) NOT NULL,
  `cliente_id` int(10) UNSIGNED DEFAULT NULL,
  `fornecedor_id` int(10) UNSIGNED DEFAULT NULL,
  `categoria_id` int(10) UNSIGNED DEFAULT NULL,
  `centro_id` int(10) UNSIGNED DEFAULT NULL,
  `conta_id` int(10) UNSIGNED DEFAULT NULL,
  `forma` varchar(30) DEFAULT NULL,
  `valor` decimal(14,2) NOT NULL,
  `pago` decimal(14,2) NOT NULL DEFAULT 0.00,
  `competencia` date NOT NULL,
  `vencimento` date DEFAULT NULL,
  `status` varchar(12) NOT NULL DEFAULT 'aberto',
  `quitado_em` date DEFAULT NULL,
  `parcela` smallint(5) UNSIGNED NOT NULL DEFAULT 1,
  `parcelas` smallint(5) UNSIGNED NOT NULL DEFAULT 1,
  `grupo` varchar(32) DEFAULT NULL,
  `origem_tipo` varchar(20) NOT NULL DEFAULT 'manual',
  `origem_id` int(10) UNSIGNED DEFAULT NULL,
  `chave_origem` varchar(80) DEFAULT NULL,
  `documento` varchar(60) DEFAULT NULL,
  `com_nota` tinyint(1) DEFAULT NULL,
  `obs` text DEFAULT NULL,
  `criado_por` int(10) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL,
  `vinculo_tipo` varchar(10) DEFAULT NULL COMMENT 'chamado | contrato (opcional)',
  `vinculo_id` int(10) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `fornecedores`
--

CREATE TABLE `fornecedores` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(150) NOT NULL,
  `documento` varchar(20) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `telefone` varchar(30) DEFAULT NULL,
  `chave_pix` varchar(120) DEFAULT NULL,
  `categoria_id` int(10) UNSIGNED DEFAULT NULL,
  `obs` text DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `ia_conhecimento`
--

CREATE TABLE `ia_conhecimento` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `chave` varchar(120) NOT NULL,
  `marca` varchar(60) NOT NULL,
  `codigo` varchar(40) NOT NULL,
  `modelo` varchar(120) DEFAULT NULL,
  `texto` text NOT NULL,
  `fontes` text DEFAULT NULL,
  `usos` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `ia_uso`
--

CREATE TABLE `ia_uso` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `dia` date NOT NULL,
  `pedidos` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `pesquisas` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `tokens_entrada` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `tokens_saida` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `erros` int(10) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `indicadores`
--

CREATE TABLE `indicadores` (
  `id` int(11) NOT NULL,
  `nome` varchar(150) NOT NULL,
  `telefone` varchar(30) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `pix` varchar(150) DEFAULT NULL,
  `pix_tipo` varchar(12) DEFAULT NULL,
  `documento` varchar(20) DEFAULT NULL,
  `cidade` varchar(120) DEFAULT NULL,
  `atuacao` varchar(60) DEFAULT NULL,
  `codigo` varchar(30) NOT NULL,
  `tipo` varchar(12) NOT NULL DEFAULT 'percentual',
  `percentual` decimal(5,2) NOT NULL DEFAULT 10.00,
  `meses` int(11) NOT NULL DEFAULT 3,
  `valor_fixo` decimal(10,2) NOT NULL DEFAULT 0.00,
  `ativo` tinyint(4) NOT NULL DEFAULT 1,
  `observacao` varchar(255) DEFAULT NULL,
  `origem` varchar(12) NOT NULL DEFAULT 'console',
  `aceite_em` datetime DEFAULT NULL,
  `aceite_ip` varchar(45) DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `locais`
--

CREATE TABLE `locais` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `cliente_id` bigint(20) UNSIGNED NOT NULL,
  `nome` varchar(150) NOT NULL,
  `endereco` varchar(255) DEFAULT NULL,
  `numero_end` varchar(20) DEFAULT NULL,
  `complemento` varchar(100) DEFAULT NULL,
  `bairro` varchar(100) DEFAULT NULL,
  `cidade` varchar(100) DEFAULT NULL,
  `uf` char(2) DEFAULT NULL,
  `cep` varchar(10) DEFAULT NULL,
  `referencia` varchar(255) DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `modulos`
--

CREATE TABLE `modulos` (
  `chave` varchar(30) NOT NULL,
  `nome` varchar(80) NOT NULL,
  `descricao` varchar(255) DEFAULT NULL,
  `estagio` enum('desligado','teste','geral') NOT NULL DEFAULT 'teste',
  `ordem` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `notificacoes`
--

CREATE TABLE `notificacoes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `titulo` varchar(150) DEFAULT NULL,
  `tipo` varchar(40) DEFAULT NULL,
  `texto` varchar(500) NOT NULL,
  `link` varchar(255) DEFAULT NULL,
  `lida_em` datetime DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `orcamentos`
--

CREATE TABLE `orcamentos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `chamado_id` bigint(20) UNSIGNED NOT NULL,
  `versao` smallint(5) UNSIGNED NOT NULL DEFAULT 1,
  `status` enum('rascunho','enviado','aprovado','recusado') NOT NULL DEFAULT 'rascunho',
  `aliquota` decimal(5,2) NOT NULL DEFAULT 0.00,
  `rt_pct` decimal(5,2) NOT NULL DEFAULT 0.00,
  `com_nota` tinyint(1) NOT NULL DEFAULT 0,
  `subtotal_servicos` decimal(12,2) NOT NULL DEFAULT 0.00,
  `subtotal_materiais` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `itens` longtext DEFAULT NULL,
  `validade_dias` smallint(5) UNSIGNED NOT NULL DEFAULT 15,
  `enviado_em` datetime DEFAULT NULL,
  `aprovado_em` datetime DEFAULT NULL,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `ordens_servico`
--

CREATE TABLE `ordens_servico` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `numero` varchar(20) NOT NULL,
  `tipo` enum('avulsa','contrato') NOT NULL DEFAULT 'avulsa',
  `chamado_id` bigint(20) UNSIGNED DEFAULT NULL,
  `orcamento_id` bigint(20) UNSIGNED DEFAULT NULL,
  `contrato_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cliente_id` bigint(20) UNSIGNED NOT NULL,
  `local_id` bigint(20) UNSIGNED DEFAULT NULL,
  `equipamento_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` varchar(40) NOT NULL DEFAULT 'Aberta',
  `prioridade` enum('baixa','normal','alta','urgente') NOT NULL DEFAULT 'normal',
  `equipe_id` bigint(20) UNSIGNED DEFAULT NULL,
  `responsavel_id` bigint(20) UNSIGNED DEFAULT NULL,
  `data_prev` date DEFAULT NULL,
  `hora_prev` time DEFAULT NULL,
  `duracao_min` int(10) UNSIGNED DEFAULT NULL,
  `orientacoes` text DEFAULT NULL,
  `checklist` longtext DEFAULT NULL,
  `cliente_nome_assinatura` varchar(150) DEFAULT NULL,
  `cliente_cargo` varchar(100) DEFAULT NULL,
  `assinatura_anexo_id` bigint(20) UNSIGNED DEFAULT NULL,
  `fechada_em` datetime DEFAULT NULL,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `os_etapas`
--

CREATE TABLE `os_etapas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `os_id` bigint(20) UNSIGNED NOT NULL,
  `grupo` varchar(60) DEFAULT NULL,
  `nome` varchar(200) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'pendente',
  `ordem` int(11) NOT NULL DEFAULT 0,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `os_eventos`
--

CREATE TABLE `os_eventos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `os_id` bigint(20) UNSIGNED NOT NULL,
  `visita_id` bigint(20) UNSIGNED DEFAULT NULL,
  `tipo` enum('historico','diario','status') NOT NULL DEFAULT 'historico',
  `texto` text NOT NULL,
  `usuario_id` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `os_links`
--

CREATE TABLE `os_links` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `os_id` bigint(20) UNSIGNED NOT NULL,
  `token` char(32) NOT NULL,
  `html` longtext NOT NULL,
  `anexos` text DEFAULT NULL,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `revogado_em` datetime DEFAULT NULL,
  `visualizacoes` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `primeira_vis` datetime DEFAULT NULL,
  `ultima_vis` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `os_materiais`
--

CREATE TABLE `os_materiais` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `os_id` bigint(20) UNSIGNED NOT NULL,
  `visita_id` bigint(20) UNSIGNED DEFAULT NULL,
  `material` varchar(200) NOT NULL,
  `quantidade` decimal(12,3) NOT NULL DEFAULT 0.000,
  `unidade` varchar(20) DEFAULT NULL,
  `custo` decimal(12,2) DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `os_pendencias`
--

CREATE TABLE `os_pendencias` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `os_id` bigint(20) UNSIGNED NOT NULL,
  `visita_id` bigint(20) UNSIGNED DEFAULT NULL,
  `descricao` text NOT NULL,
  `status` enum('aberta','resolvida') NOT NULL DEFAULT 'aberta',
  `resolvida_em` datetime DEFAULT NULL,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `os_visitas`
--

CREATE TABLE `os_visitas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `os_id` bigint(20) UNSIGNED NOT NULL,
  `numero` smallint(5) UNSIGNED NOT NULL,
  `data` date DEFAULT NULL,
  `hora_prev` time DEFAULT NULL,
  `inicio` datetime DEFAULT NULL,
  `termino` datetime DEFAULT NULL,
  `obs` text DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `os_visita_tecnicos`
--

CREATE TABLE `os_visita_tecnicos` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `visita_id` bigint(20) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `planos`
--

CREATE TABLE `planos` (
  `id` int(11) NOT NULL,
  `chave` varchar(30) NOT NULL,
  `nome` varchar(60) NOT NULL,
  `descricao` varchar(255) DEFAULT NULL,
  `preco_mensal` decimal(10,2) NOT NULL,
  `meses_anual` tinyint(4) NOT NULL DEFAULT 10,
  `usuarios_inclusos` int(11) NOT NULL DEFAULT 3,
  `preco_usuario_extra` decimal(10,2) NOT NULL DEFAULT 0.00,
  `modulos` varchar(255) NOT NULL DEFAULT '',
  `ativo` tinyint(4) NOT NULL DEFAULT 1,
  `ordem` int(11) NOT NULL DEFAULT 0,
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `planos_promo`
--

CREATE TABLE `planos_promo` (
  `plano_id` int(11) NOT NULL,
  `preco_mensal` decimal(10,2) NOT NULL,
  `meses` int(11) NOT NULL DEFAULT 12,
  `ate` date DEFAULT NULL,
  `ativo` tinyint(4) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `plataforma_admins`
--

CREATE TABLE `plataforma_admins` (
  `id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(150) NOT NULL,
  `email` varchar(190) NOT NULL,
  `senha_hash` varchar(255) NOT NULL,
  `trocar_senha` tinyint(1) NOT NULL DEFAULT 1,
  `status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
  `ultimo_acesso` datetime DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `plat_cadastros`
--

CREATE TABLE `plat_cadastros` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `empresa` varchar(150) NOT NULL,
  `cnpj` varchar(20) DEFAULT NULL,
  `responsavel` varchar(150) NOT NULL,
  `email` varchar(190) NOT NULL,
  `telefone` varchar(30) DEFAULT NULL,
  `cidade` varchar(120) DEFAULT NULL,
  `porte` varchar(40) DEFAULT NULL,
  `mensagem` text DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pendente',
  `motivo` varchar(255) DEFAULT NULL,
  `tenant_id` int(10) UNSIGNED DEFAULT NULL,
  `email_ok` tinyint(1) DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `decidido_em` datetime DEFAULT NULL,
  `decidido_por` varchar(150) DEFAULT NULL,
  `tipo` varchar(10) NOT NULL DEFAULT 'acesso'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `plat_config`
--

CREATE TABLE `plat_config` (
  `chave` varchar(60) NOT NULL,
  `valor` text DEFAULT NULL,
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `pmoc_modelos`
--

CREATE TABLE `pmoc_modelos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(150) NOT NULL,
  `periodicidade` varchar(30) DEFAULT NULL,
  `itens` longtext DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `pmoc_planos`
--

CREATE TABLE `pmoc_planos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `cliente_id` bigint(20) UNSIGNED NOT NULL,
  `contrato_id` bigint(20) UNSIGNED DEFAULT NULL,
  `ano` smallint(5) UNSIGNED NOT NULL,
  `responsavel_tecnico` varchar(150) DEFAULT NULL,
  `dados` longtext DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL,
  `ref_antiga` varchar(40) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `pmoc_visitas`
--

CREATE TABLE `pmoc_visitas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `plano_id` bigint(20) UNSIGNED NOT NULL,
  `equipamento_id` bigint(20) UNSIGNED DEFAULT NULL,
  `os_id` bigint(20) UNSIGNED DEFAULT NULL,
  `ano` smallint(5) UNSIGNED NOT NULL,
  `mes` tinyint(3) UNSIGNED NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'prevista',
  `dados` longtext DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL,
  `ref_antiga` varchar(60) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `proposta_links`
--

CREATE TABLE `proposta_links` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `chamado_id` bigint(20) UNSIGNED NOT NULL,
  `token` char(32) NOT NULL,
  `html` longtext NOT NULL,
  `total` decimal(12,2) DEFAULT NULL,
  `validade_dias` smallint(5) UNSIGNED NOT NULL DEFAULT 15,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `revogado_em` datetime DEFAULT NULL,
  `visualizacoes` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `primeira_vis` datetime DEFAULT NULL,
  `ultima_vis` datetime DEFAULT NULL,
  `resposta` enum('aprovada','recusada') DEFAULT NULL,
  `respondido_em` datetime DEFAULT NULL,
  `resposta_nome` varchar(150) DEFAULT NULL,
  `resposta_obs` varchar(1000) DEFAULT NULL,
  `resposta_ip` varchar(45) DEFAULT NULL,
  `versao` int(11) NOT NULL DEFAULT 1,
  `atualizado_em` datetime DEFAULT NULL,
  `versao_vista` int(11) DEFAULT NULL,
  `versao_vista_em` datetime DEFAULT NULL,
  `versao_resposta` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `push_inscricoes`
--

CREATE TABLE `push_inscricoes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `endpoint` text NOT NULL,
  `endpoint_hash` char(64) NOT NULL,
  `p256dh` varchar(200) NOT NULL,
  `auth` varchar(100) NOT NULL,
  `aparelho` varchar(120) DEFAULT NULL,
  `falhas` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `ultimo_envio` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `seg_tentativas`
--

CREATE TABLE `seg_tentativas` (
  `chave` varchar(190) NOT NULL,
  `falhas` int(11) NOT NULL DEFAULT 0,
  `janela_inicio` datetime NOT NULL,
  `bloqueado_ate` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `sequencias`
--

CREATE TABLE `sequencias` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `tipo` varchar(30) NOT NULL,
  `proximo` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `suporte`
--

CREATE TABLE `suporte` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `tipo` varchar(20) NOT NULL DEFAULT 'problema',
  `assunto` varchar(200) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'aberto',
  `tela` varchar(120) DEFAULT NULL,
  `navegador` varchar(255) DEFAULT NULL,
  `versao_app` varchar(20) DEFAULT NULL,
  `lido_usuario` tinyint(1) NOT NULL DEFAULT 1,
  `lido_plat` tinyint(1) NOT NULL DEFAULT 0,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `suporte_mensagens`
--

CREATE TABLE `suporte_mensagens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `suporte_id` bigint(20) UNSIGNED NOT NULL,
  `autor` varchar(12) NOT NULL DEFAULT 'usuario',
  `autor_nome` varchar(150) DEFAULT NULL,
  `texto` text NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `sync_recebidos`
--

CREATE TABLE `sync_recebidos` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `chave` varchar(40) NOT NULL,
  `acao` varchar(60) DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `tarefas`
--

CREATE TABLE `tarefas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `titulo` varchar(200) NOT NULL,
  `descricao` text DEFAULT NULL,
  `tipo` varchar(40) DEFAULT NULL,
  `cliente_id` bigint(20) UNSIGNED DEFAULT NULL,
  `endereco` varchar(255) DEFAULT NULL,
  `responsavel_id` bigint(20) UNSIGNED DEFAULT NULL,
  `para_todos` tinyint(1) NOT NULL DEFAULT 0,
  `data` date DEFAULT NULL,
  `hora` time DEFAULT NULL,
  `prioridade` enum('baixa','normal','alta','urgente') NOT NULL DEFAULT 'normal',
  `status` enum('aberta','andamento','aguardando','feita','cancelada') NOT NULL DEFAULT 'aberta',
  `os_id` bigint(20) UNSIGNED DEFAULT NULL,
  `chamado_id` bigint(20) UNSIGNED DEFAULT NULL,
  `subtarefas` longtext DEFAULT NULL,
  `blocos` longtext DEFAULT NULL,
  `recorrencia` varchar(20) DEFAULT NULL,
  `recorrencia_ate` date DEFAULT NULL,
  `origem_id` bigint(20) UNSIGNED DEFAULT NULL,
  `gerou_proxima` tinyint(1) NOT NULL DEFAULT 0,
  `ref_antiga` varchar(40) DEFAULT NULL,
  `feita_em` datetime DEFAULT NULL,
  `criado_por` bigint(20) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `tarefa_comentarios`
--

CREATE TABLE `tarefa_comentarios` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `tarefa_id` bigint(20) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED DEFAULT NULL,
  `autor_nome` varchar(150) DEFAULT NULL,
  `texto` text NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `tarefa_responsaveis`
--

CREATE TABLE `tarefa_responsaveis` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `tarefa_id` bigint(20) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `tenants`
--

CREATE TABLE `tenants` (
  `id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(150) NOT NULL,
  `slug` varchar(60) NOT NULL,
  `razao_social` varchar(200) DEFAULT NULL,
  `cnpj` varchar(20) DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `plano` varchar(30) NOT NULL DEFAULT 'padrao',
  `logo_anexo_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cor_primaria` varchar(9) NOT NULL DEFAULT '#111111',
  `cor_secundaria` varchar(9) NOT NULL DEFAULT '#3a3a3a',
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `tenant_modulos`
--

CREATE TABLE `tenant_modulos` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `modulo` varchar(30) NOT NULL,
  `ativo` tinyint(1) NOT NULL,
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `termos_aceites`
--

CREATE TABLE `termos_aceites` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `documento` varchar(20) NOT NULL,
  `versao` varchar(20) NOT NULL,
  `aceito_em` datetime NOT NULL DEFAULT current_timestamp(),
  `ip` varchar(45) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `uso_diario`
--

CREATE TABLE `uso_diario` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `dia` date NOT NULL,
  `modulo` varchar(20) NOT NULL,
  `acoes` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `primeiro` datetime NOT NULL,
  `ultimo` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `usuarios`
--

CREATE TABLE `usuarios` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(150) NOT NULL,
  `email` varchar(190) NOT NULL,
  `telefone` varchar(30) DEFAULT NULL,
  `cargo` varchar(80) DEFAULT NULL,
  `perfil` varchar(20) NOT NULL DEFAULT 'tecnico',
  `status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
  `senha_hash` varchar(255) NOT NULL,
  `trocar_senha` tinyint(1) NOT NULL DEFAULT 1,
  `foto_anexo_id` bigint(20) UNSIGNED DEFAULT NULL,
  `equipe_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cliente_id` bigint(20) UNSIGNED DEFAULT NULL,
  `especialidade` varchar(120) DEFAULT NULL,
  `registro` varchar(60) DEFAULT NULL,
  `assinatura_anexo_id` bigint(20) UNSIGNED DEFAULT NULL,
  `disponibilidade` varchar(30) NOT NULL DEFAULT 'Disponível',
  `ultimo_acesso` datetime DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `excluido_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `usuario_clientes`
--

CREATE TABLE `usuario_clientes` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `cliente_id` bigint(20) UNSIGNED NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `usuario_perfis`
--

CREATE TABLE `usuario_perfis` (
  `id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `perfil` varchar(20) NOT NULL,
  `valido_ate` date DEFAULT NULL,
  `criado_por` int(10) UNSIGNED DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `anexos`
--
ALTER TABLE `anexos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_anexos_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_anexos_dono` (`tenant_id`,`dono_tipo`,`dono_id`);

--
-- Índices de tabela `asaas_eventos`
--
ALTER TABLE `asaas_eventos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_asaas_evento` (`evento_id`);

--
-- Índices de tabela `assinaturas`
--
ALTER TABLE `assinaturas`
  ADD PRIMARY KEY (`tenant_id`),
  ADD KEY `idx_assin_asaas` (`asaas_assinatura`),
  ADD KEY `idx_assin_cliente` (`asaas_cliente`);

--
-- Índices de tabela `assinatura_cobrancas`
--
ALTER TABLE `assinatura_cobrancas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cob_tenant` (`tenant_id`,`vencimento`);

--
-- Índices de tabela `assinatura_promos`
--
ALTER TABLE `assinatura_promos`
  ADD PRIMARY KEY (`tenant_id`);

--
-- Índices de tabela `assinatura_vinculos`
--
ALTER TABLE `assinatura_vinculos`
  ADD PRIMARY KEY (`tenant_id`),
  ADD KEY `idx_vinc_indicador` (`indicador_id`);

--
-- Índices de tabela `auditoria`
--
ALTER TABLE `auditoria`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_aud_tenant` (`tenant_id`,`criado_em`);

--
-- Índices de tabela `cadastro_codigos`
--
ALTER TABLE `cadastro_codigos`
  ADD PRIMARY KEY (`cadastro_id`);

--
-- Índices de tabela `catalogo_maquinas`
--
ALTER TABLE `catalogo_maquinas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cmaq_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_cmaq` (`tenant_id`,`ativo`,`ordem`);

--
-- Índices de tabela `catalogo_materiais`
--
ALTER TABLE `catalogo_materiais`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cmat_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_cmat` (`tenant_id`,`tipo`,`ativo`);

--
-- Índices de tabela `catalogo_servicos`
--
ALTER TABLE `catalogo_servicos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cserv_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_cserv` (`tenant_id`,`ativo`,`ordem`);

--
-- Índices de tabela `chamados`
--
ALTER TABLE `chamados`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_chamados_numero` (`tenant_id`,`numero`),
  ADD UNIQUE KEY `uq_chamados_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_chamados_status` (`tenant_id`,`status`),
  ADD KEY `idx_chamados_cliente` (`tenant_id`,`cliente_id`),
  ADD KEY `fk_chamados_local` (`tenant_id`,`local_id`),
  ADD KEY `fk_chamados_resp` (`tenant_id`,`responsavel_id`),
  ADD KEY `idx_ch_retorno` (`tenant_id`,`proximo_retorno`);

--
-- Índices de tabela `chamado_acompanhamentos`
--
ALTER TABLE `chamado_acompanhamentos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_acomp_chamado` (`tenant_id`,`chamado_id`,`criado_em`);

--
-- Índices de tabela `clientes`
--
ALTER TABLE `clientes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_clientes_numero` (`tenant_id`,`numero`),
  ADD UNIQUE KEY `uq_clientes_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_clientes_nome` (`tenant_id`,`nome`);

--
-- Índices de tabela `comissoes`
--
ALTER TABLE `comissoes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_comissao_cobranca` (`cobranca_id`),
  ADD KEY `idx_comissao_indicador` (`indicador_id`,`status`);

--
-- Índices de tabela `config`
--
ALTER TABLE `config`
  ADD PRIMARY KEY (`tenant_id`,`chave`);

--
-- Índices de tabela `contratos`
--
ALTER TABLE `contratos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_contratos_numero` (`tenant_id`,`numero`),
  ADD UNIQUE KEY `uq_contratos_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_contratos_cliente` (`tenant_id`,`cliente_id`),
  ADD KEY `idx_contratos_status` (`tenant_id`,`status`),
  ADD KEY `idx_contratos_fim` (`tenant_id`,`fim`);

--
-- Índices de tabela `contrato_eventos`
--
ALTER TABLE `contrato_eventos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cev_contrato` (`tenant_id`,`contrato_id`);

--
-- Índices de tabela `contrato_faturamento`
--
ALTER TABLE `contrato_faturamento`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_cfat_contrato` (`tenant_id`,`contrato_id`);

--
-- Índices de tabela `contrato_versoes`
--
ALTER TABLE `contrato_versoes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cver` (`tenant_id`,`contrato_id`,`versao`);

--
-- Índices de tabela `cupons`
--
ALTER TABLE `cupons`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_cupons_codigo` (`codigo`);

--
-- Índices de tabela `equipamentos`
--
ALTER TABLE `equipamentos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_equip_tenant_id` (`tenant_id`,`id`),
  ADD UNIQUE KEY `uq_equip_qr` (`qr_token`),
  ADD KEY `idx_equip_cliente` (`tenant_id`,`cliente_id`),
  ADD KEY `fk_equip_local` (`tenant_id`,`local_id`),
  ADD KEY `idx_equip_ref` (`tenant_id`,`ref_antiga`),
  ADD KEY `idx_equip_tag` (`tenant_id`,`tag`);

--
-- Índices de tabela `equipes`
--
ALTER TABLE `equipes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_equipes_tenant_id` (`tenant_id`,`id`),
  ADD KEY `fk_equipes_lider` (`tenant_id`,`lider_id`);

--
-- Índices de tabela `equipe_membros`
--
ALTER TABLE `equipe_membros`
  ADD PRIMARY KEY (`equipe_id`,`usuario_id`),
  ADD KEY `fk_eqm_equipe` (`tenant_id`,`equipe_id`),
  ADD KEY `fk_eqm_usuario` (`tenant_id`,`usuario_id`);

--
-- Índices de tabela `fin_categorias`
--
ALTER TABLE `fin_categorias`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ix_fcat_tenant` (`tenant_id`,`tipo`),
  ADD KEY `ix_fcat_pai` (`tenant_id`,`pai_id`);

--
-- Índices de tabela `fin_centros`
--
ALTER TABLE `fin_centros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ix_fcen_tenant` (`tenant_id`);

--
-- Índices de tabela `fin_contas`
--
ALTER TABLE `fin_contas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ix_fc_tenant` (`tenant_id`,`ativa`);

--
-- Índices de tabela `fin_eventos`
--
ALTER TABLE `fin_eventos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ix_fe_titulo` (`tenant_id`,`titulo_id`);

--
-- Índices de tabela `fin_extrato`
--
ALTER TABLE `fin_extrato`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_fext_hash` (`tenant_id`,`conta_id`,`hash`),
  ADD KEY `ix_fext_status` (`tenant_id`,`conta_id`,`status`,`data`);

--
-- Índices de tabela `fin_importacoes`
--
ALTER TABLE `fin_importacoes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ix_fimp_conta` (`tenant_id`,`conta_id`);

--
-- Índices de tabela `fin_movimentos`
--
ALTER TABLE `fin_movimentos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ix_fm_conta` (`tenant_id`,`conta_id`,`data`),
  ADD KEY `ix_fm_data` (`tenant_id`,`data`),
  ADD KEY `ix_fm_titulo` (`tenant_id`,`titulo_id`),
  ADD KEY `ix_fmov_vinculo` (`tenant_id`,`vinculo_tipo`,`vinculo_id`);

--
-- Índices de tabela `fin_recorrencias`
--
ALTER TABLE `fin_recorrencias`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ix_frec_tenant` (`tenant_id`,`ativa`);

--
-- Índices de tabela `fin_titulos`
--
ALTER TABLE `fin_titulos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_ft_origem` (`tenant_id`,`chave_origem`),
  ADD KEY `ix_ft_venc` (`tenant_id`,`tipo`,`status`,`vencimento`),
  ADD KEY `ix_ft_comp` (`tenant_id`,`competencia`),
  ADD KEY `ix_ft_cliente` (`tenant_id`,`cliente_id`),
  ADD KEY `ix_ft_forn` (`tenant_id`,`fornecedor_id`),
  ADD KEY `ix_ft_origem` (`tenant_id`,`origem_tipo`,`origem_id`),
  ADD KEY `ix_ftit_vinculo` (`tenant_id`,`vinculo_tipo`,`vinculo_id`);

--
-- Índices de tabela `fornecedores`
--
ALTER TABLE `fornecedores`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ix_forn_tenant` (`tenant_id`,`nome`);

--
-- Índices de tabela `ia_conhecimento`
--
ALTER TABLE `ia_conhecimento`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_ia_conhecimento_chave` (`chave`);

--
-- Índices de tabela `ia_uso`
--
ALTER TABLE `ia_uso`
  ADD PRIMARY KEY (`tenant_id`,`dia`);

--
-- Índices de tabela `indicadores`
--
ALTER TABLE `indicadores`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_indicadores_codigo` (`codigo`);

--
-- Índices de tabela `locais`
--
ALTER TABLE `locais`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_locais_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_locais_cliente` (`tenant_id`,`cliente_id`);

--
-- Índices de tabela `modulos`
--
ALTER TABLE `modulos`
  ADD PRIMARY KEY (`chave`);

--
-- Índices de tabela `notificacoes`
--
ALTER TABLE `notificacoes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notif_usuario` (`tenant_id`,`usuario_id`,`lida_em`),
  ADD KEY `idx_notif_recentes` (`tenant_id`,`usuario_id`,`criado_em`);

--
-- Índices de tabela `orcamentos`
--
ALTER TABLE `orcamentos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_orc_versao` (`tenant_id`,`chamado_id`,`versao`),
  ADD UNIQUE KEY `uq_orc_tenant_id` (`tenant_id`,`id`);

--
-- Índices de tabela `ordens_servico`
--
ALTER TABLE `ordens_servico`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_os_numero` (`tenant_id`,`numero`),
  ADD UNIQUE KEY `uq_os_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_os_status` (`tenant_id`,`status`,`data_prev`),
  ADD KEY `idx_os_chamado` (`tenant_id`,`chamado_id`),
  ADD KEY `idx_os_contrato` (`tenant_id`,`contrato_id`),
  ADD KEY `fk_os_cliente` (`tenant_id`,`cliente_id`),
  ADD KEY `fk_os_local` (`tenant_id`,`local_id`),
  ADD KEY `fk_os_orcamento` (`tenant_id`,`orcamento_id`),
  ADD KEY `fk_os_equipe` (`tenant_id`,`equipe_id`),
  ADD KEY `fk_os_resp` (`tenant_id`,`responsavel_id`),
  ADD KEY `idx_os_equip` (`tenant_id`,`equipamento_id`);

--
-- Índices de tabela `os_etapas`
--
ALTER TABLE `os_etapas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_etapas_os` (`tenant_id`,`os_id`,`ordem`);

--
-- Índices de tabela `os_eventos`
--
ALTER TABLE `os_eventos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ev_os` (`tenant_id`,`os_id`,`criado_em`),
  ADD KEY `fk_ev_visita` (`tenant_id`,`visita_id`);

--
-- Índices de tabela `os_links`
--
ALTER TABLE `os_links`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_os_links_token` (`token`),
  ADD KEY `idx_os_links_os` (`tenant_id`,`os_id`);

--
-- Índices de tabela `os_materiais`
--
ALTER TABLE `os_materiais`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_osmat_os` (`tenant_id`,`os_id`),
  ADD KEY `fk_osmat_visita` (`tenant_id`,`visita_id`);

--
-- Índices de tabela `os_pendencias`
--
ALTER TABLE `os_pendencias`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pend_os` (`tenant_id`,`os_id`,`status`),
  ADD KEY `fk_pend_visita` (`tenant_id`,`visita_id`);

--
-- Índices de tabela `os_visitas`
--
ALTER TABLE `os_visitas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_visitas_numero` (`tenant_id`,`os_id`,`numero`),
  ADD UNIQUE KEY `uq_visitas_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_visitas_data` (`tenant_id`,`data`);

--
-- Índices de tabela `os_visita_tecnicos`
--
ALTER TABLE `os_visita_tecnicos`
  ADD PRIMARY KEY (`visita_id`,`usuario_id`),
  ADD KEY `idx_vt_usuario` (`tenant_id`,`usuario_id`),
  ADD KEY `fk_vt_visita` (`tenant_id`,`visita_id`);

--
-- Índices de tabela `planos`
--
ALTER TABLE `planos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_planos_chave` (`chave`);

--
-- Índices de tabela `planos_promo`
--
ALTER TABLE `planos_promo`
  ADD PRIMARY KEY (`plano_id`);

--
-- Índices de tabela `plataforma_admins`
--
ALTER TABLE `plataforma_admins`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_padm_email` (`email`);

--
-- Índices de tabela `plat_cadastros`
--
ALTER TABLE `plat_cadastros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cad_status` (`status`,`id`),
  ADD KEY `idx_cad_email` (`email`);

--
-- Índices de tabela `plat_config`
--
ALTER TABLE `plat_config`
  ADD PRIMARY KEY (`chave`);

--
-- Índices de tabela `pmoc_modelos`
--
ALTER TABLE `pmoc_modelos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_pmod_tenant_id` (`tenant_id`,`id`);

--
-- Índices de tabela `pmoc_planos`
--
ALTER TABLE `pmoc_planos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_pplano_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_pplano_cliente` (`tenant_id`,`cliente_id`,`ano`),
  ADD KEY `fk_pplano_contrato` (`tenant_id`,`contrato_id`),
  ADD KEY `idx_pplano_ref` (`tenant_id`,`ref_antiga`);

--
-- Índices de tabela `pmoc_visitas`
--
ALTER TABLE `pmoc_visitas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pvis_plano` (`tenant_id`,`plano_id`,`ano`,`mes`),
  ADD KEY `fk_pvis_os` (`tenant_id`,`os_id`),
  ADD KEY `idx_pvis_ref` (`tenant_id`,`ref_antiga`),
  ADD KEY `idx_pvis_equip_ano` (`tenant_id`,`equipamento_id`,`ano`,`mes`);

--
-- Índices de tabela `proposta_links`
--
ALTER TABLE `proposta_links`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_proposta_token` (`token`),
  ADD KEY `idx_proposta_chamado` (`tenant_id`,`chamado_id`);

--
-- Índices de tabela `push_inscricoes`
--
ALTER TABLE `push_inscricoes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_push_endpoint` (`endpoint_hash`),
  ADD KEY `idx_push_usuario` (`tenant_id`,`usuario_id`);

--
-- Índices de tabela `seg_tentativas`
--
ALTER TABLE `seg_tentativas`
  ADD PRIMARY KEY (`chave`);

--
-- Índices de tabela `sequencias`
--
ALTER TABLE `sequencias`
  ADD PRIMARY KEY (`tenant_id`,`tipo`);

--
-- Índices de tabela `suporte`
--
ALTER TABLE `suporte`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sup_tenant` (`tenant_id`,`usuario_id`,`status`),
  ADD KEY `idx_sup_status` (`status`,`atualizado_em`);

--
-- Índices de tabela `suporte_mensagens`
--
ALTER TABLE `suporte_mensagens`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_supmsg` (`suporte_id`,`id`);

--
-- Índices de tabela `sync_recebidos`
--
ALTER TABLE `sync_recebidos`
  ADD PRIMARY KEY (`tenant_id`,`chave`),
  ADD KEY `idx_sync_data` (`criado_em`);

--
-- Índices de tabela `tarefas`
--
ALTER TABLE `tarefas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_tarefas_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_tarefas_resp` (`tenant_id`,`responsavel_id`,`status`,`data`),
  ADD KEY `fk_tarefas_os` (`tenant_id`,`os_id`),
  ADD KEY `fk_tarefas_chamado` (`tenant_id`,`chamado_id`),
  ADD KEY `idx_tarefas_data` (`tenant_id`,`status`,`data`),
  ADD KEY `idx_tarefas_ref` (`tenant_id`,`ref_antiga`),
  ADD KEY `fk_tarefas_cliente` (`tenant_id`,`cliente_id`);

--
-- Índices de tabela `tarefa_comentarios`
--
ALTER TABLE `tarefa_comentarios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tc_tarefa` (`tenant_id`,`tarefa_id`,`criado_em`);

--
-- Índices de tabela `tarefa_responsaveis`
--
ALTER TABLE `tarefa_responsaveis`
  ADD PRIMARY KEY (`tarefa_id`,`usuario_id`),
  ADD KEY `idx_tr_usuario` (`tenant_id`,`usuario_id`),
  ADD KEY `fk_tr_tarefa` (`tenant_id`,`tarefa_id`);

--
-- Índices de tabela `tenants`
--
ALTER TABLE `tenants`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_tenants_slug` (`slug`);

--
-- Índices de tabela `tenant_modulos`
--
ALTER TABLE `tenant_modulos`
  ADD PRIMARY KEY (`tenant_id`,`modulo`),
  ADD KEY `idx_tm_modulo` (`modulo`);

--
-- Índices de tabela `termos_aceites`
--
ALTER TABLE `termos_aceites`
  ADD PRIMARY KEY (`usuario_id`,`documento`,`versao`),
  ADD KEY `idx_termos_tenant` (`tenant_id`);

--
-- Índices de tabela `uso_diario`
--
ALTER TABLE `uso_diario`
  ADD PRIMARY KEY (`tenant_id`,`usuario_id`,`dia`,`modulo`),
  ADD KEY `idx_uso_dia` (`dia`,`tenant_id`);

--
-- Índices de tabela `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_usuarios_email` (`email`),
  ADD UNIQUE KEY `uq_usuarios_tenant_id` (`tenant_id`,`id`),
  ADD KEY `idx_usuarios_tenant` (`tenant_id`,`perfil`,`status`),
  ADD KEY `fk_usuarios_equipe` (`tenant_id`,`equipe_id`),
  ADD KEY `fk_usuarios_cliente` (`tenant_id`,`cliente_id`);

--
-- Índices de tabela `usuario_clientes`
--
ALTER TABLE `usuario_clientes`
  ADD PRIMARY KEY (`tenant_id`,`usuario_id`,`cliente_id`),
  ADD KEY `idx_uc_cliente` (`tenant_id`,`cliente_id`);

--
-- Índices de tabela `usuario_perfis`
--
ALTER TABLE `usuario_perfis`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_usuario_perfil` (`tenant_id`,`usuario_id`,`perfil`),
  ADD KEY `ix_up_usuario` (`tenant_id`,`usuario_id`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `anexos`
--
ALTER TABLE `anexos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `asaas_eventos`
--
ALTER TABLE `asaas_eventos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `auditoria`
--
ALTER TABLE `auditoria`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `catalogo_maquinas`
--
ALTER TABLE `catalogo_maquinas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `catalogo_materiais`
--
ALTER TABLE `catalogo_materiais`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `catalogo_servicos`
--
ALTER TABLE `catalogo_servicos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `chamados`
--
ALTER TABLE `chamados`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `chamado_acompanhamentos`
--
ALTER TABLE `chamado_acompanhamentos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `clientes`
--
ALTER TABLE `clientes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `comissoes`
--
ALTER TABLE `comissoes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `contratos`
--
ALTER TABLE `contratos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `contrato_eventos`
--
ALTER TABLE `contrato_eventos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `contrato_faturamento`
--
ALTER TABLE `contrato_faturamento`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `contrato_versoes`
--
ALTER TABLE `contrato_versoes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `cupons`
--
ALTER TABLE `cupons`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `equipamentos`
--
ALTER TABLE `equipamentos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `equipes`
--
ALTER TABLE `equipes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `fin_categorias`
--
ALTER TABLE `fin_categorias`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `fin_centros`
--
ALTER TABLE `fin_centros`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `fin_contas`
--
ALTER TABLE `fin_contas`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `fin_eventos`
--
ALTER TABLE `fin_eventos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `fin_extrato`
--
ALTER TABLE `fin_extrato`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `fin_importacoes`
--
ALTER TABLE `fin_importacoes`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `fin_movimentos`
--
ALTER TABLE `fin_movimentos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `fin_recorrencias`
--
ALTER TABLE `fin_recorrencias`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `fin_titulos`
--
ALTER TABLE `fin_titulos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `fornecedores`
--
ALTER TABLE `fornecedores`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `ia_conhecimento`
--
ALTER TABLE `ia_conhecimento`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `indicadores`
--
ALTER TABLE `indicadores`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `locais`
--
ALTER TABLE `locais`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `notificacoes`
--
ALTER TABLE `notificacoes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `orcamentos`
--
ALTER TABLE `orcamentos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `ordens_servico`
--
ALTER TABLE `ordens_servico`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `os_etapas`
--
ALTER TABLE `os_etapas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `os_eventos`
--
ALTER TABLE `os_eventos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `os_links`
--
ALTER TABLE `os_links`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `os_materiais`
--
ALTER TABLE `os_materiais`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `os_pendencias`
--
ALTER TABLE `os_pendencias`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `os_visitas`
--
ALTER TABLE `os_visitas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `planos`
--
ALTER TABLE `planos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `plataforma_admins`
--
ALTER TABLE `plataforma_admins`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `plat_cadastros`
--
ALTER TABLE `plat_cadastros`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `pmoc_modelos`
--
ALTER TABLE `pmoc_modelos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `pmoc_planos`
--
ALTER TABLE `pmoc_planos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `pmoc_visitas`
--
ALTER TABLE `pmoc_visitas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `proposta_links`
--
ALTER TABLE `proposta_links`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `push_inscricoes`
--
ALTER TABLE `push_inscricoes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `suporte`
--
ALTER TABLE `suporte`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `suporte_mensagens`
--
ALTER TABLE `suporte_mensagens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `tarefas`
--
ALTER TABLE `tarefas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `tarefa_comentarios`
--
ALTER TABLE `tarefa_comentarios`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `tenants`
--
ALTER TABLE `tenants`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `usuario_perfis`
--
ALTER TABLE `usuario_perfis`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Restrições para tabelas despejadas
--

--
-- Restrições para tabelas `anexos`
--
ALTER TABLE `anexos`
  ADD CONSTRAINT `fk_anexos_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

--
-- Restrições para tabelas `catalogo_maquinas`
--
ALTER TABLE `catalogo_maquinas`
  ADD CONSTRAINT `fk_cmaq_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

--
-- Restrições para tabelas `catalogo_materiais`
--
ALTER TABLE `catalogo_materiais`
  ADD CONSTRAINT `fk_cmat_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

--
-- Restrições para tabelas `catalogo_servicos`
--
ALTER TABLE `catalogo_servicos`
  ADD CONSTRAINT `fk_cserv_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

--
-- Restrições para tabelas `chamados`
--
ALTER TABLE `chamados`
  ADD CONSTRAINT `fk_chamados_cliente` FOREIGN KEY (`tenant_id`,`cliente_id`) REFERENCES `clientes` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_chamados_local` FOREIGN KEY (`tenant_id`,`local_id`) REFERENCES `locais` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_chamados_resp` FOREIGN KEY (`tenant_id`,`responsavel_id`) REFERENCES `usuarios` (`tenant_id`, `id`);

--
-- Restrições para tabelas `chamado_acompanhamentos`
--
ALTER TABLE `chamado_acompanhamentos`
  ADD CONSTRAINT `fk_acomp_chamado` FOREIGN KEY (`tenant_id`,`chamado_id`) REFERENCES `chamados` (`tenant_id`, `id`);

--
-- Restrições para tabelas `clientes`
--
ALTER TABLE `clientes`
  ADD CONSTRAINT `fk_clientes_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

--
-- Restrições para tabelas `config`
--
ALTER TABLE `config`
  ADD CONSTRAINT `fk_config_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

--
-- Restrições para tabelas `contratos`
--
ALTER TABLE `contratos`
  ADD CONSTRAINT `fk_contratos_cliente` FOREIGN KEY (`tenant_id`,`cliente_id`) REFERENCES `clientes` (`tenant_id`, `id`);

--
-- Restrições para tabelas `contrato_eventos`
--
ALTER TABLE `contrato_eventos`
  ADD CONSTRAINT `fk_cev_contrato` FOREIGN KEY (`tenant_id`,`contrato_id`) REFERENCES `contratos` (`tenant_id`, `id`);

--
-- Restrições para tabelas `contrato_versoes`
--
ALTER TABLE `contrato_versoes`
  ADD CONSTRAINT `fk_cver_contrato` FOREIGN KEY (`tenant_id`,`contrato_id`) REFERENCES `contratos` (`tenant_id`, `id`);

--
-- Restrições para tabelas `equipamentos`
--
ALTER TABLE `equipamentos`
  ADD CONSTRAINT `fk_equip_cliente` FOREIGN KEY (`tenant_id`,`cliente_id`) REFERENCES `clientes` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_equip_local` FOREIGN KEY (`tenant_id`,`local_id`) REFERENCES `locais` (`tenant_id`, `id`);

--
-- Restrições para tabelas `equipes`
--
ALTER TABLE `equipes`
  ADD CONSTRAINT `fk_equipes_lider` FOREIGN KEY (`tenant_id`,`lider_id`) REFERENCES `usuarios` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_equipes_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

--
-- Restrições para tabelas `equipe_membros`
--
ALTER TABLE `equipe_membros`
  ADD CONSTRAINT `fk_eqm_equipe` FOREIGN KEY (`tenant_id`,`equipe_id`) REFERENCES `equipes` (`tenant_id`, `id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_eqm_usuario` FOREIGN KEY (`tenant_id`,`usuario_id`) REFERENCES `usuarios` (`tenant_id`, `id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `locais`
--
ALTER TABLE `locais`
  ADD CONSTRAINT `fk_locais_cliente` FOREIGN KEY (`tenant_id`,`cliente_id`) REFERENCES `clientes` (`tenant_id`, `id`);

--
-- Restrições para tabelas `notificacoes`
--
ALTER TABLE `notificacoes`
  ADD CONSTRAINT `fk_notif_usuario` FOREIGN KEY (`tenant_id`,`usuario_id`) REFERENCES `usuarios` (`tenant_id`, `id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `orcamentos`
--
ALTER TABLE `orcamentos`
  ADD CONSTRAINT `fk_orc_chamado` FOREIGN KEY (`tenant_id`,`chamado_id`) REFERENCES `chamados` (`tenant_id`, `id`);

--
-- Restrições para tabelas `ordens_servico`
--
ALTER TABLE `ordens_servico`
  ADD CONSTRAINT `fk_os_chamado` FOREIGN KEY (`tenant_id`,`chamado_id`) REFERENCES `chamados` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_os_cliente` FOREIGN KEY (`tenant_id`,`cliente_id`) REFERENCES `clientes` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_os_contrato` FOREIGN KEY (`tenant_id`,`contrato_id`) REFERENCES `contratos` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_os_equipe` FOREIGN KEY (`tenant_id`,`equipe_id`) REFERENCES `equipes` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_os_local` FOREIGN KEY (`tenant_id`,`local_id`) REFERENCES `locais` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_os_orcamento` FOREIGN KEY (`tenant_id`,`orcamento_id`) REFERENCES `orcamentos` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_os_resp` FOREIGN KEY (`tenant_id`,`responsavel_id`) REFERENCES `usuarios` (`tenant_id`, `id`);

--
-- Restrições para tabelas `os_etapas`
--
ALTER TABLE `os_etapas`
  ADD CONSTRAINT `fk_etapas_os` FOREIGN KEY (`tenant_id`,`os_id`) REFERENCES `ordens_servico` (`tenant_id`, `id`);

--
-- Restrições para tabelas `os_eventos`
--
ALTER TABLE `os_eventos`
  ADD CONSTRAINT `fk_ev_os` FOREIGN KEY (`tenant_id`,`os_id`) REFERENCES `ordens_servico` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_ev_visita` FOREIGN KEY (`tenant_id`,`visita_id`) REFERENCES `os_visitas` (`tenant_id`, `id`);

--
-- Restrições para tabelas `os_links`
--
ALTER TABLE `os_links`
  ADD CONSTRAINT `fk_os_links_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `os_materiais`
--
ALTER TABLE `os_materiais`
  ADD CONSTRAINT `fk_osmat_os` FOREIGN KEY (`tenant_id`,`os_id`) REFERENCES `ordens_servico` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_osmat_visita` FOREIGN KEY (`tenant_id`,`visita_id`) REFERENCES `os_visitas` (`tenant_id`, `id`);

--
-- Restrições para tabelas `os_pendencias`
--
ALTER TABLE `os_pendencias`
  ADD CONSTRAINT `fk_pend_os` FOREIGN KEY (`tenant_id`,`os_id`) REFERENCES `ordens_servico` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_pend_visita` FOREIGN KEY (`tenant_id`,`visita_id`) REFERENCES `os_visitas` (`tenant_id`, `id`);

--
-- Restrições para tabelas `os_visitas`
--
ALTER TABLE `os_visitas`
  ADD CONSTRAINT `fk_visitas_os` FOREIGN KEY (`tenant_id`,`os_id`) REFERENCES `ordens_servico` (`tenant_id`, `id`);

--
-- Restrições para tabelas `os_visita_tecnicos`
--
ALTER TABLE `os_visita_tecnicos`
  ADD CONSTRAINT `fk_vt_usuario` FOREIGN KEY (`tenant_id`,`usuario_id`) REFERENCES `usuarios` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_vt_visita` FOREIGN KEY (`tenant_id`,`visita_id`) REFERENCES `os_visitas` (`tenant_id`, `id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `pmoc_modelos`
--
ALTER TABLE `pmoc_modelos`
  ADD CONSTRAINT `fk_pmod_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

--
-- Restrições para tabelas `pmoc_planos`
--
ALTER TABLE `pmoc_planos`
  ADD CONSTRAINT `fk_pplano_cliente` FOREIGN KEY (`tenant_id`,`cliente_id`) REFERENCES `clientes` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_pplano_contrato` FOREIGN KEY (`tenant_id`,`contrato_id`) REFERENCES `contratos` (`tenant_id`, `id`);

--
-- Restrições para tabelas `pmoc_visitas`
--
ALTER TABLE `pmoc_visitas`
  ADD CONSTRAINT `fk_pvis_equip` FOREIGN KEY (`tenant_id`,`equipamento_id`) REFERENCES `equipamentos` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_pvis_os` FOREIGN KEY (`tenant_id`,`os_id`) REFERENCES `ordens_servico` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_pvis_plano` FOREIGN KEY (`tenant_id`,`plano_id`) REFERENCES `pmoc_planos` (`tenant_id`, `id`);

--
-- Restrições para tabelas `push_inscricoes`
--
ALTER TABLE `push_inscricoes`
  ADD CONSTRAINT `fk_push_usuario` FOREIGN KEY (`tenant_id`,`usuario_id`) REFERENCES `usuarios` (`tenant_id`, `id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `sequencias`
--
ALTER TABLE `sequencias`
  ADD CONSTRAINT `fk_seq_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

--
-- Restrições para tabelas `tarefas`
--
ALTER TABLE `tarefas`
  ADD CONSTRAINT `fk_tarefas_chamado` FOREIGN KEY (`tenant_id`,`chamado_id`) REFERENCES `chamados` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_tarefas_cliente` FOREIGN KEY (`tenant_id`,`cliente_id`) REFERENCES `clientes` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_tarefas_os` FOREIGN KEY (`tenant_id`,`os_id`) REFERENCES `ordens_servico` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_tarefas_resp` FOREIGN KEY (`tenant_id`,`responsavel_id`) REFERENCES `usuarios` (`tenant_id`, `id`);

--
-- Restrições para tabelas `tarefa_comentarios`
--
ALTER TABLE `tarefa_comentarios`
  ADD CONSTRAINT `fk_tc_tarefa` FOREIGN KEY (`tenant_id`,`tarefa_id`) REFERENCES `tarefas` (`tenant_id`, `id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `tarefa_responsaveis`
--
ALTER TABLE `tarefa_responsaveis`
  ADD CONSTRAINT `fk_tr_tarefa` FOREIGN KEY (`tenant_id`,`tarefa_id`) REFERENCES `tarefas` (`tenant_id`, `id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_tr_usuario` FOREIGN KEY (`tenant_id`,`usuario_id`) REFERENCES `usuarios` (`tenant_id`, `id`);

--
-- Restrições para tabelas `tenant_modulos`
--
ALTER TABLE `tenant_modulos`
  ADD CONSTRAINT `fk_tm_modulo` FOREIGN KEY (`modulo`) REFERENCES `modulos` (`chave`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_tm_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `usuarios`
--
ALTER TABLE `usuarios`
  ADD CONSTRAINT `fk_usuarios_cliente` FOREIGN KEY (`tenant_id`,`cliente_id`) REFERENCES `clientes` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_usuarios_equipe` FOREIGN KEY (`tenant_id`,`equipe_id`) REFERENCES `equipes` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_usuarios_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

--
-- Restrições para tabelas `usuario_clientes`
--
ALTER TABLE `usuario_clientes`
  ADD CONSTRAINT `fk_uc_cliente` FOREIGN KEY (`tenant_id`,`cliente_id`) REFERENCES `clientes` (`tenant_id`, `id`),
  ADD CONSTRAINT `fk_uc_usuario` FOREIGN KEY (`tenant_id`,`usuario_id`) REFERENCES `usuarios` (`tenant_id`, `id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
