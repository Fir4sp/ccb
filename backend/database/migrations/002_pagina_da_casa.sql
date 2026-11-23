-- Sistema CCB — v1.1.0: Página da Casa de Oração
-- (no servidor de produção esta migração já foi aplicada com o nome "v1.1.0_pagina_da_casa")

ALTER TABLE casas_oracao
  ADD COLUMN horarios_culto VARCHAR(500) NULL AFTER cep,
  ADD COLUMN capacidade     INT UNSIGNED NULL AFTER horarios_culto,
  ADD COLUMN observacoes    TEXT NULL AFTER capacidade;

-- Ministério da casa (Ancião, Diácono, Cooperadores, Encarregados…)
CREATE TABLE casas_ministerio (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  casa_id       INT UNSIGNED NOT NULL,
  cargo         VARCHAR(80)  NOT NULL,
  nome          VARCHAR(150) NOT NULL,
  telefone      VARCHAR(20)  NULL,
  ordem         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_min_casa (tenant_id, casa_id, ordem),
  CONSTRAINT fk_min_casa FOREIGN KEY (tenant_id, casa_id) REFERENCES casas_oracao (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Arquivos (fotos, orçamentos, notas) de qualquer módulo. Os arquivos ficam em nucleo/arquivos, fora da internet.
CREATE TABLE anexos (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  dono_tipo     VARCHAR(30)  NOT NULL,
  dono_id       BIGINT UNSIGNED NOT NULL,
  categoria     VARCHAR(30)  NOT NULL,
  caminho       VARCHAR(255) NOT NULL,
  nome_original VARCHAR(255) NULL,
  mime          VARCHAR(60)  NOT NULL,
  tamanho       INT UNSIGNED NOT NULL,
  largura       SMALLINT UNSIGNED NULL,
  altura        SMALLINT UNSIGNED NULL,
  legenda       VARCHAR(200) NULL,
  capa          TINYINT(1)   NOT NULL DEFAULT 0,
  ordem         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  criado_por    INT UNSIGNED NULL,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em     DATETIME     NULL,
  excluido_em   DATETIME     NULL,
  PRIMARY KEY (id),
  KEY ix_anexos_dono (tenant_id, dono_tipo, dono_id, excluido_em),
  CONSTRAINT fk_anexos_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
