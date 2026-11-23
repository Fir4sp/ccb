-- Sistema CCB — v1.8.0: Lista de materiais do chamado
-- Cada chamado tem a sua lista (o que precisa comprar/levar), com quantidade, unidade, valor e situação.
-- Fotos e documentos em PDF continuam na tabela anexos (nova categoria 'documento', sem mudança de estrutura).

CREATE TABLE chamados_materiais (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  chamado_id      INT UNSIGNED NOT NULL,
  descricao       VARCHAR(200)  NOT NULL,
  quantidade      DECIMAL(12,3) NOT NULL DEFAULT 1,
  unidade         VARCHAR(12)   NOT NULL DEFAULT 'un',
  valor_unitario  DECIMAL(14,2) NULL,
  situacao        ENUM('a_comprar','comprado','entregue','cancelado') NOT NULL DEFAULT 'a_comprar',
  observacao      VARCHAR(255)  NULL,
  ordem           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  criado_por      INT UNSIGNED  NOT NULL,
  criado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chmat_tenant_id (tenant_id, id),
  KEY ix_chmat_chamado (tenant_id, chamado_id, ordem),
  CONSTRAINT fk_chmat_chamado FOREIGN KEY (tenant_id, chamado_id) REFERENCES chamados (tenant_id, id),
  CONSTRAINT fk_chmat_criou   FOREIGN KEY (tenant_id, criado_por) REFERENCES usuarios (tenant_id, id),
  CONSTRAINT ck_chmat_qtd     CHECK (quantidade > 0),
  CONSTRAINT ck_chmat_valor   CHECK (valor_unitario IS NULL OR valor_unitario >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
