<?php
declare(strict_types=1);

namespace Ccb;

/**
 * Rotinas de instalação usadas pelos comandos (bin/) e pelo instalador web (publicar/instalar.php).
 */
final class Instalacao
{
    /** arquivo de migração => nome com que já pode ter sido registrado */
    private const APELIDOS = ['002_pagina_da_casa.sql' => 'v1.1.0_pagina_da_casa'];

    /** Aplica as migrações pendentes e sincroniza perfis/permissões. Pode rodar várias vezes. */
    public static function migrar(): array
    {
        $pdo = Db::pdo();
        $pdo->exec('CREATE TABLE IF NOT EXISTS migracoes (arquivo VARCHAR(120) NOT NULL PRIMARY KEY, aplicado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
        $feitas = array_column(Db::all('SELECT arquivo FROM migracoes'), 'arquivo');
        // A v1.1.0 foi aplicada no servidor pelo phpMyAdmin com outro nome.
        foreach (self::APELIDOS as $arquivo => $apelido) {
            if (in_array($apelido, $feitas, true)) $feitas[] = $arquivo;
        }
        $aplicadas = [];
        $arquivos = glob(__DIR__ . '/../database/migrations/*.sql');
        sort($arquivos);
        foreach ($arquivos as $arq) {
            $nome = basename($arq);
            if (in_array($nome, $feitas, true)) continue;
            $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($arq));
            foreach (array_filter(array_map('trim', explode(';', $sql))) as $cmd) {
                if (stripos($cmd, 'CREATE TABLE migracoes') !== false) continue;
                $pdo->exec($cmd);
            }
            Db::run('INSERT INTO migracoes (arquivo) VALUES (?)', [$nome]);
            $aplicadas[] = $nome;
        }

        foreach (Catalogo::PERFIS as $codigo => [$nome, $escopo, $desc]) {
            Db::run('INSERT INTO perfis (codigo, nome, escopo, descricao) VALUES (?,?,?,?)
                     ON DUPLICATE KEY UPDATE nome = VALUES(nome), escopo = VALUES(escopo), descricao = VALUES(descricao)',
                [$codigo, $nome, $escopo, $desc]);
        }
        foreach (Catalogo::PERMISSOES as $codigo => [$modulo, $desc]) {
            Db::run('INSERT INTO permissoes (codigo, modulo, descricao) VALUES (?,?,?)
                     ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descricao = VALUES(descricao)', [$codigo, $modulo, $desc]);
        }
        Db::run('DELETE FROM perfis_permissoes');
        foreach (array_keys(Catalogo::PERFIS) as $perfil) {
            foreach (Catalogo::permissoesDoPerfil($perfil) as $perm) {
                Db::run('INSERT INTO perfis_permissoes (perfil_id, permissao_id)
                         SELECT p.id, m.id FROM perfis p, permissoes m WHERE p.codigo = ? AND m.codigo = ?', [$perfil, $perm]);
            }
        }
        return $aplicadas;
    }

    /** Cria a organização (tenant) com configurações, DML Central, grupos e o primeiro administrador. */
    public static function criarTenant(string $nome, string $slug, string $adminNome, string $adminEmail, string $adminSenha, array $grupos): int
    {
        $adminEmail = mb_strtolower(trim($adminEmail));
        if (!preg_match('/^[a-z0-9-]{2,60}$/', $slug)) throw new \InvalidArgumentException('Identificador inválido (use letras minúsculas, números e hífen).');
        if (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) throw new \InvalidArgumentException('E-mail do administrador inválido.');
        if (mb_strlen($adminSenha) < 8 || !preg_match('/[A-Za-z]/', $adminSenha) || !preg_match('/\d/', $adminSenha)) {
            throw new \InvalidArgumentException('A senha do administrador precisa ter 8 caracteres ou mais, com letras e números.');
        }
        if (Db::one('SELECT id FROM tenants WHERE slug = ?', [$slug])) throw new \InvalidArgumentException('Já existe uma organização com esse identificador.');
        if (Db::one('SELECT id FROM usuarios WHERE email = ?', [$adminEmail])) throw new \InvalidArgumentException('Esse e-mail já está cadastrado.');

        return Db::transacao(function () use ($nome, $slug, $adminNome, $adminEmail, $adminSenha, $grupos) {
            $t = Db::insert('INSERT INTO tenants (nome, slug) VALUES (?, ?)', [$nome, $slug]);
            foreach (Catalogo::CONFIG_PADRAO as $k => $v) {
                Db::run('INSERT INTO configuracoes_tenant (tenant_id, chave, valor) VALUES (?,?,?)', [$t, $k, $v]);
            }
            Db::run("INSERT INTO locais_estoque (tenant_id, tipo, nome) VALUES (?, 'central', 'DML Central')", [$t]);
            foreach (Catalogo::PRODUTOS_CNS_PADRAO as $i => [$nome, $emb, $un, $cat]) {
                Db::run('INSERT INTO cns_produtos (tenant_id, nome, embalagem, unidade, categoria, ordem) VALUES (?,?,?,?,?,?)', [$t, $nome, $emb, $un, $cat, $i + 1]);
            }
            foreach (Catalogo::CATEGORIAS_PADRAO as $i => [$cat, $icone, $seg]) {
                Db::run('INSERT INTO chamados_categorias (tenant_id, nome, icone, exige_parecer_seguranca, ordem) VALUES (?,?,?,?,?)', [$t, $cat, $icone, $seg, $i + 1]);
            }
            foreach (Catalogo::AREAS_PADRAO as $i => [$area, $desc]) {
                Db::run('INSERT INTO areas (tenant_id, nome, descricao, ordem) VALUES (?,?,?,?)', [$t, $area, $desc, $i + 1]);
            }
            foreach (Catalogo::MODELOS_ETAPAS_PADRAO as $modelo => $itens) {
                $m = Db::insert('INSERT INTO etapas_modelos (tenant_id, nome) VALUES (?,?)', [$t, $modelo]);
                foreach ($itens as $i => $item) {
                    Db::run('INSERT INTO etapas_modelos_itens (tenant_id, modelo_id, ordem, nome) VALUES (?,?,?,?)', [$t, $m, $i + 1, $item]);
                }
            }
            foreach (array_filter(array_map('trim', $grupos)) as $g) {
                Db::run('INSERT INTO grupos (tenant_id, nome) VALUES (?, ?)', [$t, "Grupo $g"]);
            }
            $u = Db::insert('INSERT INTO usuarios (tenant_id, nome, email, senha_hash, trocar_senha) VALUES (?,?,?,?,1)',
                [$t, $adminNome, $adminEmail, Sessao::hash($adminSenha)]);
            Db::run("INSERT INTO usuarios_perfis (tenant_id, usuario_id, perfil_id) SELECT ?, ?, id FROM perfis WHERE codigo = 'administrador'", [$t, $u]);
            Db::run("INSERT INTO auditoria (tenant_id, usuario_id, acao, entidade, entidade_id) VALUES (?, NULL, 'criar', 'tenants', ?)", [$t, $t]);
            return $t;
        });
    }

    /** Dados de DEMONSTRAÇÃO: 32 casas (8 por grupo) e um usuário de cada perfil, e-mails @demo.ccb. */
    public static function dadosExemplo(int $t, string $senha): void
    {
        if ((int) Db::one('SELECT COUNT(*) n FROM casas_oracao WHERE tenant_id = ?', [$t])['n'] > 0) {
            throw new \RuntimeException('Esta organização já tem casas; os dados de exemplo não foram gerados.');
        }
        $grupos = Db::all('SELECT id, nome FROM grupos WHERE tenant_id = ? ORDER BY nome', [$t]);
        if (count($grupos) < 4) throw new \RuntimeException('Os dados de exemplo precisam de 4 grupos.');

        $bairros = ['Vila Franca', 'Jardim Europa', 'Parque São Lucas', 'Vila Nova', 'Jardim das Flores', 'Centro', 'Vila Mariana', 'Ipiranga',
            'Santana', 'Tucuruvi', 'Penha', 'Tatuapé', 'Mooca', 'Belém', 'Brás', 'Lapa', 'Pinheiros', 'Butantã', 'Campo Limpo', 'Capão Redondo',
            'Interlagos', 'Grajaú', 'Jabaquara', 'Saúde', 'Cursino', 'Sacomã', 'Itaquera', 'Guaianases', 'São Mateus', 'Sapopemba', 'Vila Prudente', 'Água Rasa'];

        Db::transacao(function () use ($t, $grupos, $bairros, $senha) {
            $casas = [];
            foreach ($bairros as $i => $bairro) {
                $g = $grupos[intdiv($i, 8)];
                $id = Db::insert('INSERT INTO casas_oracao (tenant_id, grupo_id, codigo, nome, bairro, cidade) VALUES (?,?,?,?,?,?)',
                    [$t, $g['id'], sprintf('CO-%02d', $i + 1), "Casa de Oração $bairro", $bairro, 'São Paulo']);
                Db::run("INSERT INTO locais_estoque (tenant_id, tipo, casa_id, nome) VALUES (?, 'local', ?, ?)", [$t, $id, "DML Local — $bairro"]);
                $casas[] = $id;
            }
            $hash = Sessao::hash($senha);
            $novo = function (string $nome, string $email, string $perfil, ?int $grupo = null, array $casasFuncao = []) use ($t, $hash) {
                $u = Db::insert('INSERT INTO usuarios (tenant_id, nome, email, senha_hash, trocar_senha) VALUES (?,?,?,?,0)', [$t, $nome, $email, $hash]);
                Db::run('INSERT INTO usuarios_perfis (tenant_id, usuario_id, perfil_id, grupo_id) SELECT ?, ?, id, ? FROM perfis WHERE codigo = ?', [$t, $u, $grupo, $perfil]);
                foreach ($casasFuncao as [$casa, $funcao]) {
                    Db::run('INSERT INTO usuarios_casas (tenant_id, usuario_id, casa_id, funcao) VALUES (?,?,?,?)', [$t, $u, $casa, $funcao]);
                }
            };
            $novo('Encarregada Vila Franca', 'casa@demo.ccb', 'casa_oracao', null, [[$casas[0], 'limpeza']]);
            $novo('Irmão da Escrita', 'escrita@demo.ccb', 'casa_oracao', null, [[$casas[0], 'escrita']]);
            $novo('Coordenação Grupo 8.1', 'coord81@demo.ccb', 'coordenacao_manutencao', (int) $grupos[0]['id']);
            $novo('Gestão de Manutenção', 'gestao@demo.ccb', 'gestao_manutencao');
            $novo('Engenharia', 'engenharia@demo.ccb', 'engenharia');
            $novo('Procurador', 'procurador@demo.ccb', 'procurador');
            $novo('Segurança do Trabalho', 'seguranca@demo.ccb', 'seguranca_trabalho');
            $novo('Equipe de Manutenção', 'equipe@demo.ccb', 'equipe_manutencao');
            $novo('Orientadora Grupo 8.1', 'orientadora@demo.ccb', 'orientadora_cns', (int) $grupos[0]['id']);
            $novo('Coordenação CNS', 'cns@demo.ccb', 'coordenacao_cns');
            $novo('Compras', 'compras@demo.ccb', 'compras');
        });
    }
}
