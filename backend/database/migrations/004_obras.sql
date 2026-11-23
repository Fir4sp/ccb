-- Sistema CCB — Fase 4: Obras
-- A obra tem um TETO aprovado pelos Procuradores. Os gastos são lançados contra o teto;
-- quando precisa de mais, pede-se aumento do teto, que os Procuradores aprovam de novo.

CREATE TABLE obras (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          INT UNSIGNED NOT NULL,
  numero             INT UNSIGNED NOT NULL,
  casa_id            INT UNSIGNED NOT NULL,
  chamado_id         INT UNSIGNED NULL,
  titulo             VARCHAR(150) NOT NULL,
  descricao          TEXT         NOT NULL,
  status             ENUM('proposta','aprovada','em_andamento','pausada','concluida','cancelada') NOT NULL DEFAULT 'proposta',
  teto               DECIMAL(14,2) NULL,
  responsavel_id     INT UNSIGNED NULL,
  aberta_por         INT UNSIGNED NOT NULL,
  previsao_inicio    DATE         NULL,
  previsao_fim       DATE         NULL,
  iniciada_em        DATETIME     NULL,
  concluida_em       DATETIME     NULL,
  relatorio_final    TEXT         NULL,
  motivo_cancelamento VARCHAR(500) NULL,
  criado_em          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_obras_tenant_id (tenant_id, id),
  UNIQUE KEY uq_obras_numero (tenant_id, numero),
  UNIQUE KEY uq_obras_chamado (chamado_id),
  KEY ix_obras_status (tenant_id, status),
  KEY ix_obras_casa (tenant_id, casa_id),
  CONSTRAINT fk_obras_tenant      FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  CONSTRAINT fk_obras_casa        FOREIGN KEY (tenant_id, casa_id)        REFERENCES casas_oracao (tenant_id, id),
  CONSTRAINT fk_obras_chamado     FOREIGN KEY (tenant_id, chamado_id)     REFERENCES chamados (tenant_id, id),
  CONSTRAINT fk_obras_responsavel FOREIGN KEY (tenant_id, responsavel_id) REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_obras_aberta_por  FOREIGN KEY (tenant_id, aberta_por)     REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pedidos de teto: o inicial (valor_anterior NULL) e cada aumento. Só os aprovados valem.
CREATE TABLE obras_tetos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  obra_id         INT UNSIGNED NOT NULL,
  valor_anterior  DECIMAL(14,2) NULL,
  valor_novo      DECIMAL(14,2) NOT NULL,
  motivo          TEXT          NOT NULL,
  status          ENUM('pendente','aprovado','recusado') NOT NULL DEFAULT 'pendente',
  pedido_por      INT UNSIGNED NOT NULL,
  decidido_por    INT UNSIGNED NULL,
  decidido_em     DATETIME     NULL,
  resposta        TEXT         NULL,
  pendente_unico  INT UNSIGNED AS (IF(status = 'pendente', obra_id, NULL)) STORED,
  criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tetos_um_pendente (pendente_unico),
  KEY ix_tetos_obra (tenant_id, obra_id, id),
  CONSTRAINT fk_tetos_obra    FOREIGN KEY (tenant_id, obra_id)      REFERENCES obras (tenant_id, id),
  CONSTRAINT fk_tetos_pedido  FOREIGN KEY (tenant_id, pedido_por)   REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_tetos_decidiu FOREIGN KEY (tenant_id, decidido_por) REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gastos. Nada é apagado: lançamento errado é estornado (com motivo) e deixa de contar.
CREATE TABLE obras_gastos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  obra_id         INT UNSIGNED NOT NULL,
  data            DATE          NOT NULL,
  categoria       ENUM('material','mao_de_obra','servico','equipamento','outros') NOT NULL,
  descricao       VARCHAR(300)  NOT NULL,
  fornecedor      VARCHAR(150)  NULL,
  valor           DECIMAL(14,2) NOT NULL,
  lancado_por     INT UNSIGNED  NOT NULL,
  estornado_em    DATETIME      NULL,
  estornado_por   INT UNSIGNED  NULL,
  motivo_estorno  VARCHAR(300)  NULL,
  criado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gastos_tenant_id (tenant_id, id),
  KEY ix_gastos_obra (tenant_id, obra_id, data),
  CONSTRAINT fk_gastos_obra     FOREIGN KEY (tenant_id, obra_id)       REFERENCES obras (tenant_id, id),
  CONSTRAINT fk_gastos_lancou   FOREIGN KEY (tenant_id, lancado_por)   REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_gastos_estornou FOREIGN KEY (tenant_id, estornado_por) REFERENCES usuarios (tenant_id, id),
  CONSTRAINT ck_gastos_valor    CHECK (valor > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Diário da obra: cada passo, comentário e lançamento
CREATE TABLE obras_eventos (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  obra_id       INT UNSIGNED NOT NULL,
  usuario_id    INT UNSIGNED NULL,
  tipo          VARCHAR(30)  NOT NULL,
  status_de     VARCHAR(30)  NULL,
  status_para   VARCHAR(30)  NULL,
  texto         TEXT         NULL,
  valor         DECIMAL(14,2) NULL,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_oe_obra (tenant_id, obra_id, id),
  CONSTRAINT fk_oe_obra    FOREIGN KEY (tenant_id, obra_id)    REFERENCES obras (tenant_id, id),
  CONSTRAINT fk_oe_usuario FOREIGN KEY (tenant_id, usuario_id) REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
