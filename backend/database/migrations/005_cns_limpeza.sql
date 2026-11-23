-- Sistema CCB — Fase 5: CNS Limpeza (pedidos de material de limpeza das casas)
-- Fluxo: a Coordenação CNS abre um CICLO com prazo → cada casa faz o seu pedido (como numa loja, sem cobrança)
-- → a orientadora confere e aprova → a Coordenação fecha o ciclo e tira o consolidado → Compras compra no atacado
-- → a Coordenação distribui → a casa confirma que recebeu.

CREATE TABLE cns_produtos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  codigo          VARCHAR(30)  NULL,
  nome            VARCHAR(120) NOT NULL,
  embalagem       VARCHAR(80)  NULL,
  unidade         VARCHAR(20)  NOT NULL DEFAULT 'unidade',
  categoria       ENUM('limpeza','banheiro','cozinha','descartaveis','utensilios','outros') NOT NULL DEFAULT 'limpeza',
  foto_id         BIGINT UNSIGNED NULL,
  preco_ref       DECIMAL(10,2) NULL,
  max_por_pedido  SMALLINT UNSIGNED NULL,
  ativo           TINYINT(1)   NOT NULL DEFAULT 1,
  ordem           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cnsprod_tenant_id (tenant_id, id),
  UNIQUE KEY uq_cnsprod_nome (tenant_id, nome, embalagem),
  CONSTRAINT fk_cnsprod_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cns_ciclos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  nome            VARCHAR(80)  NOT NULL,
  prazo           DATE         NOT NULL,
  status          ENUM('aberto','fechado','comprado','distribuido') NOT NULL DEFAULT 'aberto',
  observacao      TEXT         NULL,
  criado_por      INT UNSIGNED NOT NULL,
  fechado_em      DATETIME     NULL,
  comprado_em     DATETIME     NULL,
  valor_compra    DECIMAL(12,2) NULL,
  distribuido_em  DATETIME     NULL,
  aberto_unico    INT UNSIGNED AS (IF(status = 'aberto', tenant_id, NULL)) STORED,
  criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cnsciclo_tenant_id (tenant_id, id),
  UNIQUE KEY uq_cnsciclo_um_aberto (aberto_unico),
  KEY ix_cnsciclo (tenant_id, criado_em),
  CONSTRAINT fk_cnsciclo_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  CONSTRAINT fk_cnsciclo_criou  FOREIGN KEY (tenant_id, criado_por) REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cns_pedidos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  ciclo_id        INT UNSIGNED NOT NULL,
  casa_id         INT UNSIGNED NOT NULL,
  status          ENUM('rascunho','enviado','devolvido','aprovado','entregue','cancelado') NOT NULL DEFAULT 'rascunho',
  observacao      VARCHAR(1000) NULL,
  criado_por      INT UNSIGNED NOT NULL,
  enviado_por     INT UNSIGNED NULL,
  enviado_em      DATETIME     NULL,
  conferido_por   INT UNSIGNED NULL,
  conferido_em    DATETIME     NULL,
  motivo          VARCHAR(1000) NULL,
  recebido_por    INT UNSIGNED NULL,
  recebido_em     DATETIME     NULL,
  recebimento_obs VARCHAR(1000) NULL,
  criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cnsped_tenant_id (tenant_id, id),
  UNIQUE KEY uq_cnsped_ciclo_casa (ciclo_id, casa_id),
  KEY ix_cnsped_status (tenant_id, ciclo_id, status),
  CONSTRAINT fk_cnsped_ciclo    FOREIGN KEY (tenant_id, ciclo_id)      REFERENCES cns_ciclos (tenant_id, id),
  CONSTRAINT fk_cnsped_casa     FOREIGN KEY (tenant_id, casa_id)       REFERENCES casas_oracao (tenant_id, id),
  CONSTRAINT fk_cnsped_criou    FOREIGN KEY (tenant_id, criado_por)    REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_cnsped_enviou   FOREIGN KEY (tenant_id, enviado_por)   REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_cnsped_conferiu FOREIGN KEY (tenant_id, conferido_por) REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_cnsped_recebeu  FOREIGN KEY (tenant_id, recebido_por)  REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cns_pedidos_itens (
  tenant_id           INT UNSIGNED NOT NULL,
  pedido_id           INT UNSIGNED NOT NULL,
  produto_id          INT UNSIGNED NOT NULL,
  quantidade          SMALLINT UNSIGNED NOT NULL,
  quantidade_aprovada SMALLINT UNSIGNED NULL,
  PRIMARY KEY (pedido_id, produto_id),
  KEY ix_cnsitem_produto (tenant_id, produto_id),
  CONSTRAINT fk_cnsitem_pedido  FOREIGN KEY (tenant_id, pedido_id)  REFERENCES cns_pedidos (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_cnsitem_produto FOREIGN KEY (tenant_id, produto_id) REFERENCES cns_produtos (tenant_id, id),
  CONSTRAINT ck_cnsitem_qtd     CHECK (quantidade > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cns_eventos (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   INT UNSIGNED NOT NULL,
  ciclo_id    INT UNSIGNED NOT NULL,
  pedido_id   INT UNSIGNED NULL,
  usuario_id  INT UNSIGNED NULL,
  tipo        VARCHAR(30)  NOT NULL,
  texto       TEXT         NULL,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cnsev_pedido (tenant_id, pedido_id, id),
  KEY ix_cnsev_ciclo (tenant_id, ciclo_id, id),
  CONSTRAINT fk_cnsev_ciclo   FOREIGN KEY (tenant_id, ciclo_id)   REFERENCES cns_ciclos (tenant_id, id),
  CONSTRAINT fk_cnsev_pedido  FOREIGN KEY (tenant_id, pedido_id)  REFERENCES cns_pedidos (tenant_id, id),
  CONSTRAINT fk_cnsev_usuario FOREIGN KEY (tenant_id, usuario_id) REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo inicial (a Coordenação CNS ajusta nomes, embalagens, fotos e preços em Limpeza → Catálogo)
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Água sanitária', 'galão 5 L', 'galão', 'limpeza', 1 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Desinfetante', 'galão 5 L', 'galão', 'limpeza', 2 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Detergente', 'frasco 500 ml', 'frasco', 'cozinha', 3 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Sabão em pó', 'caixa 1 kg', 'caixa', 'limpeza', 4 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Limpa-vidros', 'frasco 500 ml', 'frasco', 'limpeza', 5 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Álcool 70%', 'frasco 1 L', 'frasco', 'limpeza', 6 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Sabonete líquido', 'galão 5 L', 'galão', 'banheiro', 7 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Papel higiênico', 'fardo 64 rolos', 'fardo', 'banheiro', 8 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Papel toalha interfolhado', 'fardo 1.000 folhas', 'fardo', 'banheiro', 9 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Saco de lixo 100 L', 'pacote 100 un.', 'pacote', 'descartaveis', 10 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Saco de lixo 50 L', 'pacote 100 un.', 'pacote', 'descartaveis', 11 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Copo descartável 200 ml', 'pacote 100 un.', 'pacote', 'descartaveis', 12 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Esponja dupla face', 'unidade', 'unidade', 'utensilios', 13 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Pano de chão', 'unidade', 'unidade', 'utensilios', 14 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Luva de borracha', 'par', 'par', 'utensilios', 15 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Vassoura', 'unidade', 'unidade', 'utensilios', 16 FROM tenants;
INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) SELECT id, 'Rodo', 'unidade', 'unidade', 'utensilios', 17 FROM tenants;
