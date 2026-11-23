-- Sistema CCB — v1.6.0: Chamado → Ordem de Serviço → Etapas
-- Tudo nasce de um chamado. Na triagem ele vira SERVIÇO ou OBRA; aprovado, gera a Ordem de Serviço,
-- que tem etapas (OK / Não OK / Não se aplica), gráfico de evolução e pendências.
-- Teto e gastos ficam só na OS do tipo Obra. O módulo de Obras separado deixa de existir.
--
-- ATENÇÃO: apaga os chamados e as obras de teste que estavam no sistema (combinado com a coordenação).

-- 1) Remove o módulo de Obras antigo
DROP TABLE IF EXISTS obras_eventos;
DROP TABLE IF EXISTS obras_gastos;
DROP TABLE IF EXISTS obras_tetos;
DROP TABLE IF EXISTS obras;

-- 2) Limpa os chamados de teste (os arquivos deixam de aparecer)
UPDATE anexos SET excluido_em = NOW() WHERE dono_tipo IN ('chamado', 'obra', 'obra_gasto') AND excluido_em IS NULL;
DELETE FROM chamados_eventos;
DELETE FROM chamados;
ALTER TABLE chamados AUTO_INCREMENT = 1;
ALTER TABLE chamados_eventos AUTO_INCREMENT = 1;

-- 3) Chamado ganha o tipo (serviço ou obra); sai o "encaminhado para Obras"
ALTER TABLE chamados
  ADD COLUMN tipo ENUM('servico','obra') NOT NULL DEFAULT 'servico' AFTER categoria_id,
  MODIFY status ENUM('aberto','em_orcamento','aguardando_parecer','aguardando_aprovacao','aprovado','em_execucao','concluido','encerrado','cancelado') NOT NULL DEFAULT 'aberto';

-- 4) Ordem de Serviço: uma por chamado aprovado
CREATE TABLE ordens_servico (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          INT UNSIGNED NOT NULL,
  numero             INT UNSIGNED NOT NULL,
  chamado_id         INT UNSIGNED NOT NULL,
  tipo               ENUM('servico','obra') NOT NULL,
  status             ENUM('aberta','em_andamento','pausada','concluida','cancelada') NOT NULL DEFAULT 'aberta',
  teto               DECIMAL(14,2) NULL,
  previsao_inicio    DATE         NULL,
  previsao_fim       DATE         NULL,
  iniciada_em        DATETIME     NULL,
  concluida_em       DATETIME     NULL,
  relatorio_final    TEXT         NULL,
  criado_em          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_os_tenant_id (tenant_id, id),
  UNIQUE KEY uq_os_numero (tenant_id, numero),
  UNIQUE KEY uq_os_chamado (tenant_id, chamado_id),
  KEY ix_os_status (tenant_id, status),
  CONSTRAINT fk_os_tenant  FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  CONSTRAINT fk_os_chamado FOREIGN KEY (tenant_id, chamado_id) REFERENCES chamados (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Etapas da OS
CREATE TABLE os_etapas (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  os_id           INT UNSIGNED NOT NULL,
  ordem           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  nome            VARCHAR(150) NOT NULL,
  situacao        ENUM('pendente','andamento','ok','nao_ok','nao_aplica') NOT NULL DEFAULT 'pendente',
  percentual      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  observacao      TEXT         NULL,
  atualizado_por  INT UNSIGNED NULL,
  atualizado_em   DATETIME     NULL,
  criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_etapas_tenant_id (tenant_id, id),
  KEY ix_etapas_os (tenant_id, os_id, ordem),
  CONSTRAINT fk_etapas_os      FOREIGN KEY (tenant_id, os_id)          REFERENCES ordens_servico (tenant_id, id),
  CONSTRAINT fk_etapas_usuario FOREIGN KEY (tenant_id, atualizado_por) REFERENCES usuarios (tenant_id, id),
  CONSTRAINT ck_etapas_pct     CHECK (percentual <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) Pendências: nascem de uma etapa "Não OK" e são resolvidas depois (não travam a OS)
CREATE TABLE os_pendencias (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  os_id           INT UNSIGNED NOT NULL,
  etapa_id        INT UNSIGNED NOT NULL,
  descricao       TEXT         NOT NULL,
  status          ENUM('aberta','resolvida') NOT NULL DEFAULT 'aberta',
  aberta_por      INT UNSIGNED NOT NULL,
  resolvida_por   INT UNSIGNED NULL,
  resolvida_em    DATETIME     NULL,
  resolucao       TEXT         NULL,
  aberta_unica    INT UNSIGNED AS (IF(status = 'aberta', etapa_id, NULL)) STORED,
  criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pend_uma_aberta (aberta_unica),
  KEY ix_pend_os (tenant_id, os_id),
  KEY ix_pend_status (tenant_id, status),
  CONSTRAINT fk_pend_os       FOREIGN KEY (tenant_id, os_id)         REFERENCES ordens_servico (tenant_id, id),
  CONSTRAINT fk_pend_etapa    FOREIGN KEY (tenant_id, etapa_id)      REFERENCES os_etapas (tenant_id, id),
  CONSTRAINT fk_pend_abriu    FOREIGN KEY (tenant_id, aberta_por)    REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_pend_resolveu FOREIGN KEY (tenant_id, resolvida_por) REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7) Evolução: um ponto a cada mudança nas etapas (alimenta o gráfico)
CREATE TABLE os_progresso (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   INT UNSIGNED NOT NULL,
  os_id       INT UNSIGNED NOT NULL,
  percentual  DECIMAL(5,2) NOT NULL,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_prog_os (tenant_id, os_id, criado_em),
  CONSTRAINT fk_prog_os FOREIGN KEY (tenant_id, os_id) REFERENCES ordens_servico (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8) Teto da obra: o inicial vem da aprovação do chamado; os aumentos são pedidos aqui
CREATE TABLE os_tetos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  os_id           INT UNSIGNED NOT NULL,
  valor_anterior  DECIMAL(14,2) NULL,
  valor_novo      DECIMAL(14,2) NOT NULL,
  motivo          TEXT          NOT NULL,
  status          ENUM('pendente','aprovado','recusado') NOT NULL DEFAULT 'pendente',
  pedido_por      INT UNSIGNED NOT NULL,
  decidido_por    INT UNSIGNED NULL,
  decidido_em     DATETIME     NULL,
  resposta        TEXT         NULL,
  pendente_unico  INT UNSIGNED AS (IF(status = 'pendente', os_id, NULL)) STORED,
  criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ostetos_um_pendente (pendente_unico),
  KEY ix_ostetos_os (tenant_id, os_id, id),
  CONSTRAINT fk_ostetos_os      FOREIGN KEY (tenant_id, os_id)        REFERENCES ordens_servico (tenant_id, id),
  CONSTRAINT fk_ostetos_pedido  FOREIGN KEY (tenant_id, pedido_por)   REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_ostetos_decidiu FOREIGN KEY (tenant_id, decidido_por) REFERENCES usuarios (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9) Gastos da obra. Nada é apagado: lançamento errado é estornado e deixa de contar.
CREATE TABLE os_gastos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  os_id           INT UNSIGNED NOT NULL,
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
  UNIQUE KEY uq_osgastos_tenant_id (tenant_id, id),
  KEY ix_osgastos_os (tenant_id, os_id, data),
  CONSTRAINT fk_osgastos_os       FOREIGN KEY (tenant_id, os_id)         REFERENCES ordens_servico (tenant_id, id),
  CONSTRAINT fk_osgastos_lancou   FOREIGN KEY (tenant_id, lancado_por)   REFERENCES usuarios (tenant_id, id),
  CONSTRAINT fk_osgastos_estornou FOREIGN KEY (tenant_id, estornado_por) REFERENCES usuarios (tenant_id, id),
  CONSTRAINT ck_osgastos_valor    CHECK (valor > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10) Modelos de etapas (Pintura, Troca de piso…), criados e editados pela manutenção
CREATE TABLE etapas_modelos (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   INT UNSIGNED NOT NULL,
  nome        VARCHAR(80)  NOT NULL,
  ativo       TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_modelos_tenant_id (tenant_id, id),
  UNIQUE KEY uq_modelos_nome (tenant_id, nome),
  CONSTRAINT fk_modelos_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE etapas_modelos_itens (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   INT UNSIGNED NOT NULL,
  modelo_id   INT UNSIGNED NOT NULL,
  ordem       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  nome        VARCHAR(150) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_mitens_modelo (tenant_id, modelo_id, ordem),
  CONSTRAINT fk_mitens_modelo FOREIGN KEY (tenant_id, modelo_id) REFERENCES etapas_modelos (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11) Permissões antigas do módulo de Obras
DELETE FROM perfis_permissoes WHERE permissao_id IN (SELECT id FROM permissoes WHERE codigo IN ('obras.ver', 'obras.criar', 'obras.gerir', 'obras.cancelar'));
DELETE FROM permissoes WHERE codigo IN ('obras.ver', 'obras.criar', 'obras.gerir', 'obras.cancelar');

-- 12) Modelos de etapas iniciais para as organizações que já existem
INSERT INTO etapas_modelos (tenant_id, nome) SELECT id, 'Pintura' FROM tenants;
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 1, 'Proteção do piso e dos móveis' FROM etapas_modelos m WHERE m.nome = 'Pintura';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 2, 'Raspagem e lixamento' FROM etapas_modelos m WHERE m.nome = 'Pintura';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 3, 'Correção de trincas' FROM etapas_modelos m WHERE m.nome = 'Pintura';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 4, 'Massa corrida' FROM etapas_modelos m WHERE m.nome = 'Pintura';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 5, 'Lixamento da massa' FROM etapas_modelos m WHERE m.nome = 'Pintura';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 6, 'Selador ou fundo' FROM etapas_modelos m WHERE m.nome = 'Pintura';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 7, 'Primeira demão' FROM etapas_modelos m WHERE m.nome = 'Pintura';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 8, 'Segunda demão' FROM etapas_modelos m WHERE m.nome = 'Pintura';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 9, 'Acabamento e retoques' FROM etapas_modelos m WHERE m.nome = 'Pintura';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 10, 'Limpeza final' FROM etapas_modelos m WHERE m.nome = 'Pintura';
INSERT INTO etapas_modelos (tenant_id, nome) SELECT id, 'Troca de piso' FROM tenants;
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 1, 'Retirada dos móveis' FROM etapas_modelos m WHERE m.nome = 'Troca de piso';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 2, 'Retirada do piso antigo' FROM etapas_modelos m WHERE m.nome = 'Troca de piso';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 3, 'Regularização do contrapiso' FROM etapas_modelos m WHERE m.nome = 'Troca de piso';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 4, 'Assentamento do piso' FROM etapas_modelos m WHERE m.nome = 'Troca de piso';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 5, 'Rejunte' FROM etapas_modelos m WHERE m.nome = 'Troca de piso';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 6, 'Rodapé' FROM etapas_modelos m WHERE m.nome = 'Troca de piso';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 7, 'Limpeza final' FROM etapas_modelos m WHERE m.nome = 'Troca de piso';
INSERT INTO etapas_modelos (tenant_id, nome) SELECT id, 'Elétrica' FROM tenants;
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 1, 'Desligar o circuito e sinalizar' FROM etapas_modelos m WHERE m.nome = 'Elétrica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 2, 'Identificar o problema' FROM etapas_modelos m WHERE m.nome = 'Elétrica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 3, 'Passagem de cabos e infraestrutura' FROM etapas_modelos m WHERE m.nome = 'Elétrica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 4, 'Troca de componentes' FROM etapas_modelos m WHERE m.nome = 'Elétrica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 5, 'Teste dos circuitos' FROM etapas_modelos m WHERE m.nome = 'Elétrica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 6, 'Organização do quadro' FROM etapas_modelos m WHERE m.nome = 'Elétrica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 7, 'Liberação para uso' FROM etapas_modelos m WHERE m.nome = 'Elétrica';
INSERT INTO etapas_modelos (tenant_id, nome) SELECT id, 'Hidráulica' FROM tenants;
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 1, 'Fechar o registro' FROM etapas_modelos m WHERE m.nome = 'Hidráulica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 2, 'Localizar o vazamento ou defeito' FROM etapas_modelos m WHERE m.nome = 'Hidráulica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 3, 'Abertura (parede ou piso)' FROM etapas_modelos m WHERE m.nome = 'Hidráulica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 4, 'Troca de tubos e peças' FROM etapas_modelos m WHERE m.nome = 'Hidráulica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 5, 'Teste de vazamento' FROM etapas_modelos m WHERE m.nome = 'Hidráulica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 6, 'Fechamento e acabamento' FROM etapas_modelos m WHERE m.nome = 'Hidráulica';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 7, 'Limpeza final' FROM etapas_modelos m WHERE m.nome = 'Hidráulica';
INSERT INTO etapas_modelos (tenant_id, nome) SELECT id, 'Telhado e calhas' FROM tenants;
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 1, 'Isolamento da área e EPIs' FROM etapas_modelos m WHERE m.nome = 'Telhado e calhas';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 2, 'Inspeção do telhado' FROM etapas_modelos m WHERE m.nome = 'Telhado e calhas';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 3, 'Troca de telhas' FROM etapas_modelos m WHERE m.nome = 'Telhado e calhas';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 4, 'Limpeza das calhas' FROM etapas_modelos m WHERE m.nome = 'Telhado e calhas';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 5, 'Vedação' FROM etapas_modelos m WHERE m.nome = 'Telhado e calhas';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 6, 'Teste com água' FROM etapas_modelos m WHERE m.nome = 'Telhado e calhas';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 7, 'Limpeza final' FROM etapas_modelos m WHERE m.nome = 'Telhado e calhas';
INSERT INTO etapas_modelos (tenant_id, nome) SELECT id, 'Obra (geral)' FROM tenants;
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 1, 'Mobilização e canteiro' FROM etapas_modelos m WHERE m.nome = 'Obra (geral)';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 2, 'Demolição e retirada de entulho' FROM etapas_modelos m WHERE m.nome = 'Obra (geral)';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 3, 'Fundação e estrutura' FROM etapas_modelos m WHERE m.nome = 'Obra (geral)';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 4, 'Alvenaria' FROM etapas_modelos m WHERE m.nome = 'Obra (geral)';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 5, 'Instalações elétricas' FROM etapas_modelos m WHERE m.nome = 'Obra (geral)';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 6, 'Instalações hidráulicas' FROM etapas_modelos m WHERE m.nome = 'Obra (geral)';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 7, 'Cobertura' FROM etapas_modelos m WHERE m.nome = 'Obra (geral)';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 8, 'Revestimentos e piso' FROM etapas_modelos m WHERE m.nome = 'Obra (geral)';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 9, 'Pintura' FROM etapas_modelos m WHERE m.nome = 'Obra (geral)';
INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) SELECT m.tenant_id, m.id, 10, 'Limpeza e entrega' FROM etapas_modelos m WHERE m.nome = 'Obra (geral)';
