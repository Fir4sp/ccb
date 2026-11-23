-- Sistema CCB — v1.9.0: Loja de produtos de limpeza
-- Fluxo: abertura (automática pela agenda da Coordenação CNS) → a casa pede, vendo preço e total
-- → a orientadora do grupo faz a 1ª análise → a Coordenação CNS faz a análise final
-- → a Coordenação consolida com o DML Central e libera a lista de compra (por fornecedor) → Compras compra.

-- Produto: fornecedor e tamanhos (ex.: sapato 34…42 aparece como um produto só na loja, com a escolha do número).
ALTER TABLE cns_produtos
  ADD COLUMN fornecedor VARCHAR(80)  NULL AFTER codigo,
  ADD COLUMN familia    VARCHAR(120) NULL AFTER nome,
  ADD COLUMN variacao   VARCHAR(30)  NULL AFTER familia,
  MODIFY categoria ENUM('limpeza','banheiro','cozinha','descartaveis','utensilios','epi','equipamentos','outros') NOT NULL DEFAULT 'limpeza';

-- Pedido: 'conferido' = aprovado pela orientadora, esperando a análise final da Coordenação CNS.
ALTER TABLE cns_pedidos
  MODIFY status ENUM('rascunho','enviado','devolvido','conferido','aprovado','entregue','cancelado') NOT NULL DEFAULT 'rascunho',
  ADD COLUMN analisado_por INT UNSIGNED NULL AFTER conferido_em,
  ADD COLUMN analisado_em  DATETIME     NULL AFTER analisado_por,
  ADD CONSTRAINT fk_cnsped_analisou FOREIGN KEY (tenant_id, analisado_por) REFERENCES usuarios (tenant_id, id);

-- Preço de cada item no momento do pedido (o histórico não muda quando o preço do catálogo muda).
ALTER TABLE cns_pedidos_itens ADD COLUMN preco_unit DECIMAL(10,2) NULL AFTER quantidade_aprovada;

-- Ciclo: mês de referência (evita abrir dois do mesmo mês), abertura automática (criado_por vazio = sistema)
-- e o momento em que a Coordenação liberou a lista de compra.
ALTER TABLE cns_ciclos
  MODIFY criado_por INT UNSIGNED NULL,
  ADD COLUMN referencia CHAR(7) NULL AFTER nome,
  ADD COLUMN automatico TINYINT(1) NOT NULL DEFAULT 0 AFTER referencia,
  ADD COLUMN liberado_compras_em DATETIME NULL AFTER fechado_em,
  ADD UNIQUE KEY uq_cnsciclo_referencia (tenant_id, referencia);

-- Lista de compra do ciclo: o que a Coordenação decidiu comprar depois de descontar o DML Central.
CREATE TABLE cns_ciclos_compra (
  tenant_id     INT UNSIGNED NOT NULL,
  ciclo_id      INT UNSIGNED NOT NULL,
  produto_id    INT UNSIGNED NOT NULL,
  quantidade    INT UNSIGNED NOT NULL,
  preco_unit    DECIMAL(10,2) NULL,
  PRIMARY KEY (ciclo_id, produto_id),
  KEY ix_cnscompra_produto (tenant_id, produto_id),
  CONSTRAINT fk_cnscompra_ciclo   FOREIGN KEY (tenant_id, ciclo_id)   REFERENCES cns_ciclos (tenant_id, id),
  CONSTRAINT fk_cnscompra_produto FOREIGN KEY (tenant_id, produto_id) REFERENCES cns_produtos (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orientadora CNS passa a ser a orientadora do GRUPO (vê todas as casas do grupo, inclusive as cadastradas depois).
-- As casas atribuídas uma a uma viram os grupos dessas casas.
UPDATE perfis SET escopo = 'grupo', descricao = 'Primeira análise dos pedidos de limpeza e contagem do DML das casas do seu grupo.' WHERE codigo = 'orientadora_cns';
INSERT IGNORE INTO usuarios_perfis (tenant_id, usuario_id, perfil_id, grupo_id)
  SELECT DISTINCT oc.tenant_id, oc.usuario_id, up.perfil_id, c.grupo_id
    FROM orientadoras_casas oc
    JOIN casas_oracao c ON c.id = oc.casa_id
    JOIN usuarios_perfis up ON up.usuario_id = oc.usuario_id
    JOIN perfis p ON p.id = up.perfil_id AND p.codigo = 'orientadora_cns';
DELETE up FROM usuarios_perfis up
  JOIN perfis p ON p.id = up.perfil_id AND p.codigo = 'orientadora_cns'
  JOIN usuarios_perfis g ON g.usuario_id = up.usuario_id AND g.perfil_id = up.perfil_id AND g.grupo_id IS NOT NULL
 WHERE up.grupo_id IS NULL;
