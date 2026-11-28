-- CCB v2 — 002: aprovação do chamado por alçada (Coordenação → Gestão → Procurador)
-- e parecer da Segurança do Trabalho nos tipos de serviço marcados. Rodar UMA vez.
ALTER TABLE `chamados`
  ADD COLUMN `parecer_seg`    varchar(15) DEFAULT NULL COMMENT 'favoravel | desfavoravel',
  ADD COLUMN `parecer_texto`  text DEFAULT NULL,
  ADD COLUMN `parecer_por`    bigint(20) UNSIGNED DEFAULT NULL,
  ADD COLUMN `parecer_em`     datetime DEFAULT NULL,
  ADD COLUMN `aprovado_por`   bigint(20) UNSIGNED DEFAULT NULL,
  ADD COLUMN `aprovado_em`    datetime DEFAULT NULL,
  ADD COLUMN `aprovado_nivel` varchar(15) DEFAULT NULL COMMENT 'coord | gestao | procurador',
  ADD COLUMN `aprovado_valor` decimal(12,2) DEFAULT NULL;
ALTER TABLE `chamados` ALTER `status` SET DEFAULT 'Falta orçamento';
