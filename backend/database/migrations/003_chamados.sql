-- Sistema CCB — Fase 3: Chamados de manutenção
-- Mesma regra de ouro: tenant_id em tudo e chaves estrangeiras compostas (tenant_id, id).

CREATE TABLE chamados_categorias (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id               INT UNSIGNED NOT NULL,
  nome                    VARCHAR(80)  NOT NULL,
  icone                   VARCHAR(30)  NOT NULL DEFAULT 'outros',
  exige_parecer_seguranca TINYINT(1)   NOT NULL DEFAULT 0,
  ativo                   TINYINT(1)   NOT NULL DEFAULT 1,
  ordem                   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  criado_em               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_catch_tenant_id (tenant_id, id),
  UNIQUE KEY uq_catch_nome (tenant_id, nome),
  CONSTRAINT fk_catch_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chamados (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          INT UNSIGNED NOT NULL,
  numero             INT UNSIGNED NOT NULL,
  casa_id            INT UNSIGNED NOT NULL,
  categoria_id       INT UNSIGNED NOT NULL,
  titulo             VARCHAR(150) NOT NULL,
  local              VARCHAR(150) NULL,
  descricao          TEXT         NOT NULL,
  urgente            TINYINT(1)   NOT NULL DEFAULT 0,
  prioridade         ENUM('baixa','normal','alta','emergencia') NULL,
  status             ENUM('aberto','em_orcamento','aguardando_parecer','aguardando_aprovacao','aprovado','em_execucao','concluido','encerrado','cancelado','encaminhado_obra') NOT NULL DEFAULT 'aberto',
  exige_parecer      TINYINT(1)   NOT NULL DEFAULT 0,
  aberto_por         INT UNSIGNED NOT NULL,
  responsavel_id     INT UNSIGNED NULL,
  servico_descricao  TEXT         NULL,
  valor_estimado     DECIMAL(12,2) NULL,
  valor_aprovado     DECIMAL(12,2) NULL,
  valor_final        DECIMAL(12,2) NULL,
  nivel_aprovacao    ENUM('coordenacao','gestao','procurador') NULL,
  em_reaprovacao     TINYINT(1)   NOT NULL DEFAULT 0,
  aprovado_por       INT UNSIGNED NULL,
  aprovado_em        DATETIME     NULL,
  parecer_seguranca  ENUM('favoravel','com_ressalvas','desfavoravel') NULL,
  parecer_texto      TEXT         NULL,
  parecer_por        INT UNSIGNED NULL,
  parecer_em         DATETIME     NULL,
  concluido_em       DATETIME     NULL,
  encerrado_em       DATETIME     NULL,
  motivo_cancelamento VARCHAR(500) NULL,
  criado_em          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chamados_tenant_id (tenant_id, id),
  UNIQUE KEY uq_chamados_numero (tenant_id, numero),
  KEY ix_chamados_status (tenant_id, status),
  KEY ix_chamados_casa (tenant_id, casa_id, criado_em),
  CONSTRAINT fk_chamados_tenant      FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  CONSTRAINT fk_chamados_casa        FOREIGN KEY (tenant_id, casa_id)        REFERENCES casas_oracao (tenant_id, id),
  CONSTRAINT fk_chamados_categoria   FOREIGN KEY (tenant_id, categoria_id)   REFERENCES chamados_categorias (tenant_id, id),
  CONSTRAINT fk_chamados_aberto_por  FOREIGN KEY (tenant_id, aberto_por)     REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_chamados_responsavel FOREIGN KEY (tenant_id, responsavel_id) REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_chamados_aprovado    FOREIGN KEY (tenant_id, aprovado_por)   REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_chamados_parecer     FOREIGN KEY (tenant_id, parecer_por)    REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Linha do tempo do chamado: cada passo, comentário e mudança de valor
CREATE TABLE chamados_eventos (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     INT UNSIGNED NOT NULL,
  chamado_id    INT UNSIGNED NOT NULL,
  usuario_id    INT UNSIGNED NULL,
  tipo          VARCHAR(30)  NOT NULL,
  status_de     VARCHAR(30)  NULL,
  status_para   VARCHAR(30)  NULL,
  texto         TEXT         NULL,
  valor         DECIMAL(12,2) NULL,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_ce_chamado (tenant_id, chamado_id, id),
  CONSTRAINT fk_ce_chamado FOREIGN KEY (tenant_id, chamado_id) REFERENCES chamados (tenant_id, id),
  CONSTRAINT fk_ce_usuario FOREIGN KEY (tenant_id, usuario_id) REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Categorias iniciais para as organizações que já existem (editáveis em Administração)
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Elétrica', 'raio', 1, 1 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Hidráulica e esgoto', 'gota', 0, 2 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Telhado, forro e calhas', 'telhado', 1, 3 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Ar-condicionado e ventiladores', 'vento', 0, 4 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Portas, janelas e fechaduras', 'chave', 0, 5 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Pintura e paredes', 'pincel', 0, 6 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Piso e calçada', 'piso', 0, 7 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Som e instrumentos', 'som', 0, 8 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Incêndio e segurança', 'escudo', 1, 9 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Móveis e bancos', 'banco', 0, 10 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Jardim e área externa', 'folha', 0, 11 FROM tenants;
INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) SELECT id, 'Outros', 'outros', 0, 12 FROM tenants;
