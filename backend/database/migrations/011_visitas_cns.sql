-- Sistema CCB — v1.10.0: Relatório de visita do CNS Limpeza
-- A Coordenação CNS monta o checklist (itens editáveis). Na visita à Casa de Oração, a orientadora
-- (ou a Coordenação) marca cada item, escreve observações e tira as fotos necessárias. Dá para imprimir/gerar PDF.
-- As fotos ficam na tabela anexos (dono_tipo = 'cns_visita').

CREATE TABLE cns_checklist_itens (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  secao         VARCHAR(80)  NULL,
  texto         VARCHAR(200) NOT NULL,
  ordem         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cnschk_tenant_id (tenant_id, id),
  KEY ix_cnschk_ordem (tenant_id, ativo, ordem),
  CONSTRAINT fk_cnschk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cns_visitas (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  casa_id       INT UNSIGNED NOT NULL,
  data_visita   DATE         NOT NULL,
  status        ENUM('rascunho','concluida') NOT NULL DEFAULT 'rascunho',
  observacao    TEXT         NULL,
  criado_por    INT UNSIGNED NOT NULL,
  concluida_por INT UNSIGNED NULL,
  concluida_em  DATETIME     NULL,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cnsvis_tenant_id (tenant_id, id),
  KEY ix_cnsvis_casa (tenant_id, casa_id, data_visita),
  CONSTRAINT fk_cnsvis_casa     FOREIGN KEY (tenant_id, casa_id)       REFERENCES casas_oracao (tenant_id, id),
  CONSTRAINT fk_cnsvis_criou    FOREIGN KEY (tenant_id, criado_por)    REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_cnsvis_concluiu FOREIGN KEY (tenant_id, concluida_por) REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cópia dos itens do checklist no dia da visita: mudar o checklist depois não muda visita já feita.
CREATE TABLE cns_visitas_itens (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  visita_id     INT UNSIGNED NOT NULL,
  item_id       INT UNSIGNED NULL,
  secao         VARCHAR(80)  NULL,
  texto         VARCHAR(200) NOT NULL,
  ordem         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  resposta      ENUM('ok','ajustar','na') NULL,
  obs           VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY ix_cnsvisit_visita (tenant_id, visita_id, ordem),
  CONSTRAINT fk_cnsvisit_visita FOREIGN KEY (tenant_id, visita_id) REFERENCES cns_visitas (tenant_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
