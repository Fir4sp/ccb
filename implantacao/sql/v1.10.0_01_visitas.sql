-- Sistema CCB — atualização para o phpMyAdmin (aba Importar)
-- Gerado de database/migrations/011_visitas_cns.sql. Rode uma vez só.

SET NAMES utf8mb4;
START TRANSACTION;

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

-- Catálogo de perfis e permissões
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('casas.ver', 'organizacao', 'Ver Casas de Oração dentro do próprio escopo') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('admin.grupos', 'administracao', 'Cadastrar e editar grupos') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('admin.casas', 'administracao', 'Cadastrar e editar Casas de Oração') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('admin.usuarios', 'administracao', 'Cadastrar usuários e definir perfis') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('admin.configuracoes', 'administracao', 'Alterar alçadas e configurações do tenant') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('admin.auditoria', 'administracao', 'Consultar a auditoria') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('admin.categorias', 'administracao', 'Cadastrar categorias de chamado') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('admin.areas', 'administracao', 'Cadastrar as áreas de atendimento') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('chamados.ver', 'chamados', 'Ver chamados das casas do próprio escopo') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('chamados.abrir', 'chamados', 'Abrir chamado para uma casa do próprio escopo') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('chamados.triar', 'chamados', 'Fazer a triagem: prioridade, responsável, serviço ou obra, e cancelar') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('chamados.orcar', 'chamados', 'Registrar o orçamento do serviço e enviar para aprovação') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('chamados.aprovar', 'chamados', 'Aprovar ou devolver orçamentos dentro da própria alçada') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('chamados.parecer', 'chamados', 'Dar o parecer de Segurança do Trabalho') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('chamados.executar', 'chamados', 'Iniciar, ajustar valor e concluir o serviço') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('chamados.confirmar', 'chamados', 'Confirmar que o problema foi resolvido ou reabrir') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('obras.valores', 'ordens', 'Ver teto, gastos e saldo das obras') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('obras.gastos', 'ordens', 'Lançar e estornar gastos das obras') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('obras.aprovar', 'ordens', 'Aprovar o teto das obras e os aumentos') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('etapas.modelos', 'ordens', 'Criar e editar os modelos de etapas') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('cns.ver', 'cns', 'Ver os pedidos de limpeza das casas do próprio escopo') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('cns.pedir', 'cns', 'Fazer o pedido de limpeza das casas do próprio escopo') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('cns.conferir', 'cns', 'Conferir e aprovar pedidos de limpeza') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('cns.gerir', 'cns', 'Catálogo, ciclos de pedido, análise final, consolidação e distribuição') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('cns.compras', 'cns', 'Ver o consolidado com preços e registrar a compra') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
INSERT INTO permissoes (codigo, modulo, descricao) VALUES ('cns.visitas', 'cns', 'Fazer o relatório de visita (checklist e fotos) nas casas do próprio escopo') ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao);
DELETE FROM perfis_permissoes;
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'chamados.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'obras.valores';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'etapas.modelos';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'cns.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'admin.grupos';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'admin.casas';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'admin.usuarios';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'admin.configuracoes';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'admin.auditoria';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'admin.categorias';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'administrador' AND m.codigo = 'admin.areas';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'casa_oracao' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'casa_oracao' AND m.codigo = 'chamados.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'casa_oracao' AND m.codigo = 'chamados.abrir';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'casa_oracao' AND m.codigo = 'chamados.confirmar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'casa_oracao' AND m.codigo = 'cns.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'casa_oracao' AND m.codigo = 'cns.pedir';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_manutencao' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_manutencao' AND m.codigo = 'chamados.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_manutencao' AND m.codigo = 'chamados.abrir';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_manutencao' AND m.codigo = 'chamados.triar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_manutencao' AND m.codigo = 'chamados.orcar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_manutencao' AND m.codigo = 'chamados.aprovar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_manutencao' AND m.codigo = 'chamados.executar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_manutencao' AND m.codigo = 'chamados.confirmar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_manutencao' AND m.codigo = 'obras.valores';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_manutencao' AND m.codigo = 'etapas.modelos';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'chamados.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'chamados.abrir';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'chamados.triar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'chamados.orcar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'chamados.aprovar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'chamados.executar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'chamados.confirmar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'obras.valores';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'obras.gastos';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'gestao_manutencao' AND m.codigo = 'etapas.modelos';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'equipe_manutencao' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'equipe_manutencao' AND m.codigo = 'chamados.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'equipe_manutencao' AND m.codigo = 'chamados.orcar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'equipe_manutencao' AND m.codigo = 'chamados.executar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'equipe_manutencao' AND m.codigo = 'obras.valores';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'equipe_manutencao' AND m.codigo = 'etapas.modelos';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'orientadora_cns' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'orientadora_cns' AND m.codigo = 'cns.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'orientadora_cns' AND m.codigo = 'cns.pedir';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'orientadora_cns' AND m.codigo = 'cns.conferir';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'orientadora_cns' AND m.codigo = 'cns.visitas';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_cns' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_cns' AND m.codigo = 'cns.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_cns' AND m.codigo = 'cns.pedir';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_cns' AND m.codigo = 'cns.conferir';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_cns' AND m.codigo = 'cns.gerir';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_cns' AND m.codigo = 'cns.compras';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'coordenacao_cns' AND m.codigo = 'cns.visitas';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'compras' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'compras' AND m.codigo = 'chamados.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'compras' AND m.codigo = 'chamados.orcar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'compras' AND m.codigo = 'obras.valores';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'compras' AND m.codigo = 'obras.gastos';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'compras' AND m.codigo = 'cns.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'compras' AND m.codigo = 'cns.compras';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'seguranca_trabalho' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'seguranca_trabalho' AND m.codigo = 'chamados.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'seguranca_trabalho' AND m.codigo = 'chamados.parecer';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'seguranca_trabalho' AND m.codigo = 'obras.valores';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'procurador' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'procurador' AND m.codigo = 'chamados.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'procurador' AND m.codigo = 'chamados.aprovar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'procurador' AND m.codigo = 'obras.valores';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'procurador' AND m.codigo = 'obras.aprovar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'engenharia' AND m.codigo = 'casas.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'engenharia' AND m.codigo = 'chamados.ver';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'engenharia' AND m.codigo = 'chamados.abrir';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'engenharia' AND m.codigo = 'chamados.triar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'engenharia' AND m.codigo = 'chamados.orcar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'engenharia' AND m.codigo = 'chamados.executar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'engenharia' AND m.codigo = 'chamados.confirmar';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'engenharia' AND m.codigo = 'obras.valores';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'engenharia' AND m.codigo = 'obras.gastos';
INSERT INTO perfis_permissoes (perfil_id, permissao_id) SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = 'engenharia' AND m.codigo = 'etapas.modelos';

INSERT INTO migracoes (arquivo) VALUES ('011_visitas_cns.sql');
COMMIT;
