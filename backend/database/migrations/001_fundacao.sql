-- Sistema CCB — Fase 2: Fundação
-- Compatível com MySQL 8.0.16+ e MariaDB 10.5+ (InnoDB, utf8mb4)
-- Regra de ouro: toda tabela de negócio tem tenant_id, e as chaves estrangeiras
-- compostas (tenant_id, id) impedem, no próprio banco, ligar registros de tenants diferentes.

SET NAMES utf8mb4;

-- ------------------------------------------------------------------
-- Plataforma
-- ------------------------------------------------------------------
CREATE TABLE tenants (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome          VARCHAR(150) NOT NULL,
  slug          VARCHAR(60)  NOT NULL,
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE configuracoes_tenant (
  tenant_id     INT UNSIGNED NOT NULL,
  chave         VARCHAR(80)  NOT NULL,
  valor         VARCHAR(500) NOT NULL,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, chave),
  CONSTRAINT fk_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- Organização
-- ------------------------------------------------------------------
CREATE TABLE grupos (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  nome          VARCHAR(80)  NOT NULL,
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grupos_tenant_id (tenant_id, id),
  UNIQUE KEY uq_grupos_nome (tenant_id, nome),
  CONSTRAINT fk_grupos_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE casas_oracao (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  grupo_id      INT UNSIGNED NOT NULL,
  codigo        VARCHAR(20)  NOT NULL,
  nome          VARCHAR(150) NOT NULL,
  endereco      VARCHAR(255) NULL,
  bairro        VARCHAR(100) NULL,
  cidade        VARCHAR(100) NULL,
  cep           VARCHAR(9)   NULL,
  responsaveis  VARCHAR(500) NULL,
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_casas_tenant_id (tenant_id, id),
  UNIQUE KEY uq_casas_codigo (tenant_id, codigo),
  KEY ix_casas_grupo (tenant_id, grupo_id),
  CONSTRAINT fk_casas_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  CONSTRAINT fk_casas_grupo  FOREIGN KEY (tenant_id, grupo_id) REFERENCES grupos (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1 DML Central por tenant + 1 DML Local por casa
CREATE TABLE locais_estoque (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  tipo          ENUM('central','local') NOT NULL,
  casa_id       INT UNSIGNED NULL,
  nome          VARCHAR(150) NOT NULL,
  central_unico INT UNSIGNED AS (IF(tipo = 'central', tenant_id, NULL)) STORED,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_locais_tenant_id (tenant_id, id),
  UNIQUE KEY uq_locais_casa (casa_id),
  UNIQUE KEY uq_locais_um_central (central_unico),
  CONSTRAINT fk_locais_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  CONSTRAINT fk_locais_casa   FOREIGN KEY (tenant_id, casa_id) REFERENCES casas_oracao (tenant_id, id),
  CONSTRAINT ck_locais_tipo   CHECK ((tipo = 'central' AND casa_id IS NULL) OR (tipo = 'local' AND casa_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- Acesso
-- ------------------------------------------------------------------
CREATE TABLE usuarios (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NULL,          -- NULL somente para administrador da plataforma
  nome            VARCHAR(150) NOT NULL,
  email           VARCHAR(190) NOT NULL,
  telefone        VARCHAR(20)  NULL,
  senha_hash      VARCHAR(255) NOT NULL,
  plataforma_admin TINYINT(1)  NOT NULL DEFAULT 0,
  trocar_senha    TINYINT(1)   NOT NULL DEFAULT 1,
  ativo           TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_login_em DATETIME     NULL,
  criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email),
  UNIQUE KEY uq_usuarios_tenant_id (tenant_id, id),
  CONSTRAINT fk_usuarios_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  CONSTRAINT ck_usuarios_tenant CHECK (plataforma_admin = 1 OR tenant_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo de perfis e permissões: definido pelo sistema (igual para todos os tenants)
CREATE TABLE perfis (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo        VARCHAR(40)  NOT NULL,
  nome          VARCHAR(80)  NOT NULL,
  escopo        ENUM('casa','grupo','casas_atribuidas','tenant') NOT NULL,
  descricao     VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_perfis_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissoes (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo        VARCHAR(60)  NOT NULL,
  modulo        VARCHAR(30)  NOT NULL,
  descricao     VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissoes_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE perfis_permissoes (
  perfil_id     INT UNSIGNED NOT NULL,
  permissao_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (perfil_id, permissao_id),
  CONSTRAINT fk_pp_perfil    FOREIGN KEY (perfil_id)    REFERENCES perfis (id),
  CONSTRAINT fk_pp_permissao FOREIGN KEY (permissao_id) REFERENCES permissoes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Perfil do usuário. grupo_id é obrigatório só para perfis de escopo "grupo" (validado na aplicação).
CREATE TABLE usuarios_perfis (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  usuario_id    INT UNSIGNED NOT NULL,
  perfil_id     INT UNSIGNED NOT NULL,
  grupo_id      INT UNSIGNED NULL,
  grupo_chave   INT UNSIGNED AS (IFNULL(grupo_id, 0)) STORED,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_up (usuario_id, perfil_id, grupo_chave),
  CONSTRAINT fk_up_usuario FOREIGN KEY (tenant_id, usuario_id) REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_up_perfil  FOREIGN KEY (perfil_id) REFERENCES perfis (id),
  CONSTRAINT fk_up_grupo   FOREIGN KEY (tenant_id, grupo_id) REFERENCES grupos (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuários da Casa de Oração e sua função na casa
CREATE TABLE usuarios_casas (
  tenant_id     INT UNSIGNED NOT NULL,
  usuario_id    INT UNSIGNED NOT NULL,
  casa_id       INT UNSIGNED NOT NULL,
  funcao        ENUM('manutencao','escrita','limpeza','outra') NOT NULL,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, casa_id),
  KEY ix_uc_casa (tenant_id, casa_id),
  CONSTRAINT fk_uc_usuario FOREIGN KEY (tenant_id, usuario_id) REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_uc_casa    FOREIGN KEY (tenant_id, casa_id)    REFERENCES casas_oracao (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Casas atribuídas a cada orientadora CNS
CREATE TABLE orientadoras_casas (
  tenant_id     INT UNSIGNED NOT NULL,
  usuario_id    INT UNSIGNED NOT NULL,
  casa_id       INT UNSIGNED NOT NULL,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, casa_id),
  KEY ix_oc_casa (tenant_id, casa_id),
  CONSTRAINT fk_oc_usuario FOREIGN KEY (tenant_id, usuario_id) REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_oc_casa    FOREIGN KEY (tenant_id, casa_id)    REFERENCES casas_oracao (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- Segurança e rastreabilidade
-- ------------------------------------------------------------------
CREATE TABLE login_tentativas (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(190) NOT NULL,
  ip            VARCHAR(45)  NOT NULL,
  sucesso       TINYINT(1)   NOT NULL,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_lt_email (email, criado_em),
  KEY ix_lt_ip (ip, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auditoria (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NULL,
  usuario_id    INT UNSIGNED NULL,
  acao          VARCHAR(40)  NOT NULL,
  entidade      VARCHAR(60)  NOT NULL,
  entidade_id   BIGINT UNSIGNED NULL,
  antes         TEXT NULL,
  depois        TEXT NULL,
  ip            VARCHAR(45)  NULL,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_aud_tenant (tenant_id, criado_em),
  KEY ix_aud_entidade (tenant_id, entidade, entidade_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE migracoes (
  arquivo       VARCHAR(120) NOT NULL,
  aplicado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (arquivo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
