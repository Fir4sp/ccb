-- Sistema CCB — v1.7.0: Áreas de atendimento e campos dos chamados do SharePoint
-- Área = grupo de pessoas que atende um tipo de chamado (Civil, Elétrica, Compras…).
-- O usuário é colocado nas áreas no cadastro; quem é da área vê e trabalha nos chamados encaminhados a ela.

CREATE TABLE areas (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   INT UNSIGNED NOT NULL,
  nome        VARCHAR(80)  NOT NULL,
  descricao   VARCHAR(255) NULL,
  ativo       TINYINT(1)   NOT NULL DEFAULT 1,
  ordem       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_areas_tenant_id (tenant_id, id),
  UNIQUE KEY uq_areas_nome (tenant_id, nome),
  CONSTRAINT fk_areas_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE areas_membros (
  tenant_id   INT UNSIGNED NOT NULL,
  area_id     INT UNSIGNED NOT NULL,
  usuario_id  INT UNSIGNED NOT NULL,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (area_id, usuario_id),
  KEY ix_am_usuario (tenant_id, usuario_id),
  CONSTRAINT fk_am_area    FOREIGN KEY (tenant_id, area_id)    REFERENCES areas (tenant_id, id),
  CONSTRAINT fk_am_usuario FOREIGN KEY (tenant_id, usuario_id) REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chamado: área responsável, assunto livre, origem (importado do SharePoint) e quem abriu lá
ALTER TABLE chamados
  ADD COLUMN area_id INT UNSIGNED NULL AFTER responsavel_id,
  MODIFY titulo VARCHAR(200) NOT NULL,
  MODIFY descricao TEXT NULL,
  MODIFY categoria_id INT UNSIGNED NULL,
  ADD COLUMN origem ENUM('sistema','sharepoint') NOT NULL DEFAULT 'sistema' AFTER aberto_por,
  ADD COLUMN aberto_por_nome VARCHAR(150) NULL AFTER origem,
  ADD COLUMN link_externo VARCHAR(500) NULL AFTER aberto_por_nome,
  ADD COLUMN status_externo VARCHAR(120) NULL AFTER link_externo,
  ADD KEY ix_chamados_area (tenant_id, area_id),
  ADD CONSTRAINT fk_chamados_area FOREIGN KEY (tenant_id, area_id) REFERENCES areas (tenant_id, id);

-- Áreas iniciais (as mesmas do SharePoint), editáveis em Administração → Áreas
INSERT INTO areas (tenant_id, nome, descricao, ordem) SELECT id, 'Civil', 'Alvenaria, telhado, pisos, pintura, esquadrias e obras', 1 FROM tenants;
INSERT INTO areas (tenant_id, nome, descricao, ordem) SELECT id, 'Elétrica', 'Instalações elétricas, quadros, iluminação e ventiladores', 2 FROM tenants;
INSERT INTO areas (tenant_id, nome, descricao, ordem) SELECT id, 'Elétrica - Alarme/Luz/Som Emergência', 'Alarme, luz de emergência e sistema de som', 3 FROM tenants;
INSERT INTO areas (tenant_id, nome, descricao, ordem) SELECT id, 'Informática', 'Computadores, internet e equipamentos', 4 FROM tenants;
INSERT INTO areas (tenant_id, nome, descricao, ordem) SELECT id, 'Manutenção de Órgão', 'Órgãos e instrumentos', 5 FROM tenants;
INSERT INTO areas (tenant_id, nome, descricao, ordem) SELECT id, 'Compras', 'Aquisição de materiais, equipamentos e serviços', 6 FROM tenants;
INSERT INTO areas (tenant_id, nome, descricao, ordem) SELECT id, 'Segurança', 'Segurança do Trabalho: trabalho em altura, EPIs, avaliações', 7 FROM tenants;
