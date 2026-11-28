-- CCB v2 — 001: Casas de Oração (a tabela "clientes" do SGClim) ganham código e grupo/setor.
-- Rodar UMA vez no phpMyAdmin, depois de banco/estrutura.sql.
CREATE TABLE `grupos` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(80) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_grupo_nome` (`tenant_id`, `nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `clientes`
  ADD COLUMN `codigo` varchar(20) DEFAULT NULL AFTER `numero`,
  ADD COLUMN `grupo_id` bigint(20) UNSIGNED DEFAULT NULL AFTER `codigo`,
  ADD KEY `idx_clientes_grupo` (`tenant_id`, `grupo_id`);
