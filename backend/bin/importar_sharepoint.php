<?php
declare(strict_types=1);
/**
 * Gera o SQL (para o phpMyAdmin) que importa o "Relatório de Chamados" exportado do SharePoint (.xls em HTML).
 * Uso: php bin/importar_sharepoint.php Relatorio.xls > importar_chamados.sql
 *
 * - Mantém o número do chamado do SharePoint; os novos continuam a partir do maior.
 * - Casa: procurada pelo nome (sem diferença de acento e maiúsculas); se não existir, é criada no grupo da planilha.
 * - Status do SharePoint → fluxo do sistema (ver STATUS abaixo). "Encaminhado para X" vira a área X.
 * - Pode rodar de novo: chamado com número que já existe é pulado.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$arq = $argv[1] ?? '';
if (!is_file($arq)) { fwrite(STDERR, "Arquivo não encontrado\n"); exit(1); }
$html = file_get_contents($arq);
if (!mb_check_encoding($html, 'UTF-8')) $html = mb_convert_encoding($html, 'UTF-8', 'ISO-8859-1');

// status do SharePoint => [status no sistema, área]
const STATUS = [
    'Aguardando Validação Coordenador'            => ['aberto', null],
    'Encaminhado para Gestão'                     => ['em_orcamento', null],
    'Encaminhado para Compras'                    => ['em_orcamento', 'Compras'],
    'Encaminhado para Civil'                      => ['em_orcamento', 'Civil'],
    'Encaminhado para Segurança'                  => ['em_orcamento', 'Segurança'],
    'Encaminhado para Elétrica'                   => ['em_orcamento', 'Elétrica'],
    'Encaminhado para Elétrica - Alarme/Luz/Som'  => ['em_orcamento', 'Elétrica - Alarme/Luz/Som Emergência'],
    'Encaminhado para Informática'                => ['em_orcamento', 'Informática'],
    'Encaminhado - Manutenção de Orgão'           => ['em_orcamento', 'Manutenção de Órgão'],
    'Aprovado para Execução - Casa de Oração'     => ['aprovado', null],
    'Em validação - Casa de Oração'               => ['concluido', null],
    ''                                            => ['aberto', null],
];

preg_match_all('#<tr[^>]*>(.*?)</tr>#s', $html, $tr);
$linhas = [];
foreach (array_slice($tr[1], 1) as $r) {
    preg_match('#href="([^"]+)"#', $r, $mLink);
    preg_match_all('#<t[dh][^>]*>(.*?)</t[dh]>#s', $r, $td);
    $c = array_map(fn($x) => trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($x), ENT_QUOTES | ENT_HTML5, 'UTF-8'))), $td[1]);
    if (count($c) < 9 || !ctype_digit($c[1])) continue;
    [, $numero, $por, $casa, $grupo, $assunto, $status, $resp, $quando] = $c;
    if (!isset(STATUS[$status])) { fwrite(STDERR, "Status desconhecido: '$status' (chamado $numero)\n"); exit(1); }
    $dt = DateTime::createFromFormat('d/m/Y H:i', $quando);
    $linhas[] = [
        'numero' => (int) $numero, 'por' => $por, 'casa' => $casa, 'grupo' => $grupo, 'assunto' => mb_substr($assunto, 0, 200),
        'status_ext' => $status, 'resp' => $resp, 'criado_em' => $dt ? $dt->format('Y-m-d H:i:s') : date('Y-m-d H:i:s'),
        'link' => $mLink[1] ?? null, 'status' => STATUS[$status][0], 'area' => STATUS[$status][1],
        'urgente' => preg_match('/urgente/iu', $assunto) ? 1 : 0,
    ];
}
if (!$linhas) { fwrite(STDERR, "Nenhum chamado encontrado na planilha\n"); exit(1); }

$q = fn(?string $s) => $s === null ? 'NULL' : "'" . str_replace(["\\", "'"], ["\\\\", "''"], $s) . "'";

echo "-- Sistema CCB — importação de chamados do SharePoint (" . count($linhas) . " chamados)\n";
echo "-- Gerado de " . basename($arq) . " em " . date('d/m/Y H:i') . ". Rode no phpMyAdmin, aba Importar. Precisa da v1.7.0 instalada.\n";
echo "-- Pode rodar de novo: chamados que já existem (mesmo número) são pulados.\n\n";
echo "SET NAMES utf8mb4;\n";
echo "DROP TABLE IF EXISTS _importacao_chamados;\n";
echo "CREATE TABLE _importacao_chamados (
  numero INT UNSIGNED NOT NULL PRIMARY KEY, criado_por VARCHAR(150), casa VARCHAR(150), grupo VARCHAR(20), assunto VARCHAR(200),
  status_ext VARCHAR(120), responsavel VARCHAR(120), criado_em DATETIME, link VARCHAR(500), status VARCHAR(30), area VARCHAR(80), urgente TINYINT,
  casa_id INT UNSIGNED NULL, grupo_id INT UNSIGNED NULL, area_id INT UNSIGNED NULL, casa_criada TINYINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n";
echo "START TRANSACTION;\n";
echo "SET @t := (SELECT MIN(id) FROM tenants);\n";
echo "SET @adm := (SELECT u.id FROM usuarios u JOIN usuarios_perfis up ON up.usuario_id = u.id JOIN perfis p ON p.id = up.perfil_id
              WHERE u.tenant_id = @t AND p.codigo = 'administrador' ORDER BY u.id LIMIT 1);\n\n";

foreach (array_chunk($linhas, 50) as $bloco) {
    echo "INSERT INTO _importacao_chamados (numero, criado_por, casa, grupo, assunto, status_ext, responsavel, criado_em, link, status, area, urgente) VALUES\n";
    echo implode(",\n", array_map(fn($l) => sprintf('(%d, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %d)',
        $l['numero'], $q($l['por']), $q($l['casa']), $q($l['grupo']), $q($l['assunto']), $q($l['status_ext']), $q($l['resp']),
        $q($l['criado_em']), $q($l['link']), $q($l['status']), $q($l['area']), $l['urgente']), $bloco)), ";\n\n";
}

echo <<<'SQL'
-- Chamados que já existem com o mesmo número são pulados
DELETE i FROM _importacao_chamados i JOIN chamados ch ON ch.tenant_id = @t AND ch.numero = i.numero;

-- Grupos (Grupo 8.1, 8.2…): usa o que existir, cria o que faltar
UPDATE _importacao_chamados i SET grupo_id = (SELECT g.id FROM grupos g WHERE g.tenant_id = @t AND (g.nome = CONCAT('Grupo ', i.grupo) OR g.nome = i.grupo) LIMIT 1);
INSERT INTO grupos (tenant_id, nome) SELECT DISTINCT @t, CONCAT('Grupo ', grupo) FROM _importacao_chamados WHERE grupo_id IS NULL;
UPDATE _importacao_chamados i SET grupo_id = (SELECT g.id FROM grupos g WHERE g.tenant_id = @t AND g.nome = CONCAT('Grupo ', i.grupo) LIMIT 1) WHERE grupo_id IS NULL;

-- Casas: pelo nome, sem diferença de acento e maiúsculas ("Jardim Umarizal" acha "Casa de Oração Jardim Umarizal")
UPDATE _importacao_chamados i SET casa_id = (
  SELECT c.id FROM casas_oracao c WHERE c.tenant_id = @t
     AND (c.nome = i.casa OR c.bairro = i.casa OR c.nome LIKE CONCAT('%', i.casa) OR c.nome = CONCAT('Casa de Oração ', i.casa))
   ORDER BY (c.nome = i.casa) DESC, (c.bairro = i.casa) DESC, LENGTH(c.nome) LIMIT 1);
-- Casas que não existem são criadas no grupo da planilha (confira a lista no fim)
INSERT INTO casas_oracao (tenant_id, grupo_id, codigo, nome, bairro, cidade)
  SELECT @t, MIN(grupo_id), CONCAT('IMP-', LPAD(MIN(numero) MOD 10000, 4, '0')), casa, casa, 'São Paulo'
    FROM _importacao_chamados WHERE casa_id IS NULL GROUP BY casa;
INSERT INTO locais_estoque (tenant_id, tipo, casa_id, nome)
  SELECT @t, 'local', c.id, CONCAT('DML Local — ', c.nome) FROM casas_oracao c
   WHERE c.tenant_id = @t AND c.codigo LIKE 'IMP-%' AND NOT EXISTS (SELECT 1 FROM locais_estoque l WHERE l.casa_id = c.id);
UPDATE _importacao_chamados i SET casa_criada = 1, casa_id = (SELECT c.id FROM casas_oracao c WHERE c.tenant_id = @t AND c.nome = i.casa LIMIT 1) WHERE casa_id IS NULL;

-- Áreas
UPDATE _importacao_chamados i SET area_id = (SELECT a.id FROM areas a WHERE a.tenant_id = @t AND a.nome = i.area LIMIT 1) WHERE i.area IS NOT NULL;

-- Chamados
INSERT INTO chamados (tenant_id, numero, casa_id, categoria_id, tipo, titulo, local, descricao, urgente, status, exige_parecer, aberto_por,
                      origem, aberto_por_nome, link_externo, status_externo, area_id, concluido_em, criado_em)
  SELECT @t, numero, casa_id, NULL, 'servico', assunto, NULL, NULL, urgente, status, 0, @adm,
         'sharepoint', criado_por, link, status_ext, area_id, IF(status = 'concluido', NOW(), NULL), criado_em
    FROM _importacao_chamados ORDER BY numero;

-- Linha do tempo: abertura (data do SharePoint) e importação
INSERT INTO chamados_eventos (tenant_id, chamado_id, usuario_id, tipo, status_de, status_para, texto, criado_em)
  SELECT @t, ch.id, NULL, 'abertura', NULL, 'aberto', CONCAT('Aberto no SharePoint por ', i.criado_por, '.'), i.criado_em
    FROM _importacao_chamados i JOIN chamados ch ON ch.tenant_id = @t AND ch.numero = i.numero;
INSERT INTO chamados_eventos (tenant_id, chamado_id, usuario_id, tipo, status_de, status_para, texto)
  SELECT @t, ch.id, @adm, 'importacao', NULL, i.status,
         CONCAT('Importado do SharePoint. Status lá: ', IF(i.status_ext = '', '(sem status)', i.status_ext),
                IF(i.responsavel <> '', CONCAT('. Responsável lá: ', i.responsavel), ''), '.')
    FROM _importacao_chamados i JOIN chamados ch ON ch.tenant_id = @t AND ch.numero = i.numero;

-- "Aprovado para Execução": já nasce com a Ordem de Serviço aberta
SET @os := (SELECT COALESCE(MAX(numero), 0) FROM ordens_servico WHERE tenant_id = @t);
INSERT INTO ordens_servico (tenant_id, numero, chamado_id, tipo)
  SELECT @t, (@os := @os + 1), ch.id, 'servico'
    FROM _importacao_chamados i JOIN chamados ch ON ch.tenant_id = @t AND ch.numero = i.numero
   WHERE i.status = 'aprovado' ORDER BY i.numero;
INSERT INTO os_progresso (tenant_id, os_id, percentual)
  SELECT @t, os.id, 0 FROM ordens_servico os JOIN _importacao_chamados i ON i.status = 'aprovado'
    JOIN chamados ch ON ch.id = os.chamado_id AND ch.numero = i.numero WHERE os.tenant_id = @t;

INSERT INTO auditoria (tenant_id, usuario_id, acao, entidade, entidade_id, depois)
  SELECT @t, @adm, 'importar_sharepoint', 'chamados', NULL, JSON_OBJECT('chamados', COUNT(*)) FROM _importacao_chamados;
COMMIT;

-- Resultado: confira as casas que foram criadas (se alguma já existia com outro nome, me avise)
SELECT COUNT(*) AS chamados_importados, SUM(casa_criada) AS chamados_em_casas_criadas FROM _importacao_chamados;
SELECT DISTINCT i.casa AS casa_criada_pela_importacao, CONCAT('Grupo ', i.grupo) AS grupo FROM _importacao_chamados i WHERE i.casa_criada = 1 ORDER BY 1;
DROP TABLE _importacao_chamados;

SQL;
