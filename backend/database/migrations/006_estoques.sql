-- Sistema CCB — Fase 6: Estoques (material de limpeza no DML Central e nos DMLs das casas)
-- O material entra no DML Central quando a compra do ciclo chega, sai do Central e entra no DML de cada
-- casa quando o ciclo é entregue, e a contagem (inventário) acerta o saldo e mostra o consumo.

ALTER TABLE cns_produtos ADD COLUMN minimo_central SMALLINT UNSIGNED NULL AFTER max_por_pedido;
ALTER TABLE cns_ciclos ADD COLUMN estoque_recebido_em DATETIME NULL AFTER valor_compra;

CREATE TABLE estoque_saldos (
  tenant_id     INT UNSIGNED NOT NULL,
  local_id      INT UNSIGNED NOT NULL,
  produto_id    INT UNSIGNED NOT NULL,
  quantidade    INT          NOT NULL DEFAULT 0,
  contado_em    DATETIME     NULL,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (local_id, produto_id),
  KEY ix_saldo_produto (tenant_id, produto_id),
  CONSTRAINT fk_saldo_local   FOREIGN KEY (tenant_id, local_id)   REFERENCES locais_estoque (tenant_id, id),
  CONSTRAINT fk_saldo_produto FOREIGN KEY (tenant_id, produto_id) REFERENCES cns_produtos (tenant_id, id),
  CONSTRAINT ck_saldo_positivo CHECK (quantidade >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE estoque_inventarios (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id    INT UNSIGNED NOT NULL,
  local_id     INT UNSIGNED NOT NULL,
  usuario_id   INT UNSIGNED NOT NULL,
  observacao   VARCHAR(1000) NULL,
  diferencas   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inv_tenant_id (tenant_id, id),
  KEY ix_inv_local (tenant_id, local_id, criado_em),
  CONSTRAINT fk_inv_local   FOREIGN KEY (tenant_id, local_id)   REFERENCES locais_estoque (tenant_id, id),
  CONSTRAINT fk_inv_usuario FOREIGN KEY (tenant_id, usuario_id) REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada mudança de saldo, com o motivo. Nada é apagado.
CREATE TABLE estoque_movimentos (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      INT UNSIGNED NOT NULL,
  local_id       INT UNSIGNED NOT NULL,
  produto_id     INT UNSIGNED NOT NULL,
  tipo           ENUM('entrada','saida','inventario') NOT NULL,
  origem         ENUM('compra','distribuicao','inventario','manual','envio') NOT NULL,
  quantidade     INT          NOT NULL,
  saldo_apos     INT          NOT NULL,
  ciclo_id       INT UNSIGNED NULL,
  inventario_id  INT UNSIGNED NULL,
  outro_local_id INT UNSIGNED NULL,
  motivo         VARCHAR(300) NULL,
  usuario_id     INT UNSIGNED NOT NULL,
  criado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_mov_local (tenant_id, local_id, id),
  KEY ix_mov_produto (tenant_id, produto_id, criado_em),
  CONSTRAINT fk_mov_local   FOREIGN KEY (tenant_id, local_id)      REFERENCES locais_estoque (tenant_id, id),
  CONSTRAINT fk_mov_produto FOREIGN KEY (tenant_id, produto_id)    REFERENCES cns_produtos (tenant_id, id),
  CONSTRAINT fk_mov_ciclo   FOREIGN KEY (tenant_id, ciclo_id)      REFERENCES cns_ciclos (tenant_id, id),
  CONSTRAINT fk_mov_inv     FOREIGN KEY (tenant_id, inventario_id) REFERENCES estoque_inventarios (tenant_id, id),
  CONSTRAINT fk_mov_usuario FOREIGN KEY (tenant_id, usuario_id)    REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
