<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Auditoria, Catalogo, Db, HttpErro, Requisicao, Resposta, Sessao, Validar};
use Ccb\Controladores\CasaPaginaControlador as Pagina;

/** Grupos, Casas de Oração e configurações do tenant. */
final class OrganizacaoControlador
{
    // ---------------------------------------------------------------- Grupos

    public static function listarGrupos(Requisicao $r): array
    {
        $t = Sessao::tenantId();
        if (Acesso::tem('admin.grupos') || Acesso::contexto()['escopo_tenant']) {
            $sql = 'SELECT g.id, g.nome, g.ativo, COUNT(c.id) AS casas
                      FROM grupos g LEFT JOIN casas_oracao c ON c.grupo_id = g.id AND c.ativo = 1
                     WHERE g.tenant_id = ? GROUP BY g.id ORDER BY g.nome';
            return self::tipar(Db::all($sql, [$t]));
        }
        // Demais perfis: só os grupos das casas que podem ver.
        $ids = Acesso::casasVisiveis();
        if (!$ids) return [];
        return self::tipar(Db::all(
            'SELECT g.id, g.nome, g.ativo, COUNT(c.id) AS casas FROM grupos g JOIN casas_oracao c ON c.grupo_id = g.id
              WHERE g.tenant_id = ? AND c.id IN ' . Db::in($ids) . ' GROUP BY g.id ORDER BY g.nome',
            array_merge([$t], $ids)
        ));
    }

    public static function criarGrupo(Requisicao $r): never
    {
        Acesso::exigir('admin.grupos');
        $t = Sessao::tenantId();
        $d = (new Validar($r->corpo))->texto('nome', true, 80)->ok();
        self::nomeGrupoLivre($t, $d['nome']);
        $id = Db::insert('INSERT INTO grupos (tenant_id, nome) VALUES (?, ?)', [$t, $d['nome']]);
        Auditoria::registrar('criar', 'grupos', $id, null, $d);
        Resposta::json(self::grupo($t, $id), 201);
    }

    public static function editarGrupo(Requisicao $r, int $id): array
    {
        Acesso::exigir('admin.grupos');
        $t = Sessao::tenantId();
        $antes = self::grupo($t, $id);
        $d = (new Validar($r->corpo))->texto('nome', true, 80)->booleano('ativo', (bool) $antes['ativo'])->ok();
        self::nomeGrupoLivre($t, $d['nome'], $id);
        if (!$d['ativo'] && (int) Db::one('SELECT COUNT(*) n FROM casas_oracao WHERE tenant_id = ? AND grupo_id = ? AND ativo = 1', [$t, $id])['n'] > 0) {
            throw HttpErro::invalido(['ativo' => 'Mova ou desative as casas deste grupo antes de desativá-lo.']);
        }
        Db::run('UPDATE grupos SET nome = ?, ativo = ? WHERE tenant_id = ? AND id = ?', [$d['nome'], $d['ativo'], $t, $id]);
        $depois = self::grupo($t, $id);
        Auditoria::registrar('editar', 'grupos', $id, $antes, $depois);
        return $depois;
    }

    private static function grupo(int $t, int $id): array
    {
        $g = Db::one('SELECT id, nome, ativo FROM grupos WHERE tenant_id = ? AND id = ?', [$t, $id]);
        if (!$g) throw HttpErro::naoEncontrado('Grupo');
        return self::tipar([$g])[0];
    }

    private static function nomeGrupoLivre(int $t, string $nome, ?int $ignorar = null): void
    {
        $existe = Db::one('SELECT id FROM grupos WHERE tenant_id = ? AND nome = ? AND id <> ?', [$t, $nome, $ignorar ?? 0]);
        if ($existe) throw HttpErro::invalido(['nome' => 'Já existe um grupo com este nome.']);
    }

    // ---------------------------------------------------------------- Casas

    private const CAMPOS_CASA = 'c.id, c.codigo, c.nome, c.grupo_id, g.nome AS grupo, c.endereco, c.bairro, c.cidade, c.cep, c.horarios_culto, c.capacidade, c.observacoes, c.responsaveis, c.ativo';

    public static function listarCasas(Requisicao $r): array
    {
        Acesso::exigir('casas.ver');
        $t = Sessao::tenantId();
        $ids = Acesso::casasVisiveis();
        if (!$ids) return [];
        $sql = 'SELECT ' . self::CAMPOS_CASA . ', (SELECT a.id FROM anexos a WHERE a.tenant_id = c.tenant_id AND a.dono_tipo = \'casa\' AND a.dono_id = c.id
                       AND a.categoria = \'foto_casa\' AND a.capa = 1 AND a.excluido_em IS NULL LIMIT 1) AS capa_id
                  FROM casas_oracao c JOIN grupos g ON g.id = c.grupo_id
                 WHERE c.tenant_id = ? AND c.id IN ' . Db::in($ids);
        $p = array_merge([$t], $ids);
        if (!empty($r->query['grupo_id']) && ctype_digit((string) $r->query['grupo_id'])) {
            $sql .= ' AND c.grupo_id = ?';
            $p[] = (int) $r->query['grupo_id'];
        }
        if (!empty($r->query['busca']) && is_string($r->query['busca'])) {
            $sql .= ' AND (c.nome LIKE ? OR c.codigo LIKE ? OR c.bairro LIKE ?)';
            $b = '%' . addcslashes(mb_substr($r->query['busca'], 0, 60), '%_\\') . '%';
            array_push($p, $b, $b, $b);
        }
        if (($r->query['ativas'] ?? '1') === '1') {
            $sql .= ' AND c.ativo = 1';
        }
        return self::tiparCasas(Db::all($sql . ' ORDER BY g.nome, c.nome', $p));
    }

    public static function verCasa(Requisicao $r, int $id): array
    {
        Acesso::exigir('casas.ver');
        $t = Sessao::tenantId();
        // Fora do escopo responde 404, sem revelar que a casa existe.
        if (!Acesso::podeVerCasa($id)) throw HttpErro::naoEncontrado('Casa de Oração');
        $casa = self::casa($t, $id);
        $casa['dml_local'] = Db::one('SELECT id, nome FROM locais_estoque WHERE tenant_id = ? AND casa_id = ?', [$t, $id]);
        $casa['ministerio'] = Pagina::ministerio($t, $id);
        $casa['fotos'] = Pagina::fotos($t, $id);
        $casa['pode_editar'] = Pagina::podeEditarCasa();
        $casa['pode_abrir_chamado'] = Acesso::tem('chamados.abrir');
        if (Acesso::tem('admin.casas') || Acesso::tem('admin.usuarios')) {
            $casa['usuarios'] = Db::all(
                'SELECT u.id, u.nome, u.email, uc.funcao, u.ativo FROM usuarios_casas uc JOIN usuarios u ON u.id = uc.usuario_id
                  WHERE uc.tenant_id = ? AND uc.casa_id = ? ORDER BY u.nome',
                [$t, $id]
            );
        }
        return $casa;
    }

    public static function criarCasa(Requisicao $r): never
    {
        Acesso::exigir('admin.casas');
        $t = Sessao::tenantId();
        $d = self::validarCasa($r->corpo, $t);
        $id = Db::transacao(function () use ($t, $d) {
            $id = Db::insert(
                'INSERT INTO casas_oracao (tenant_id, grupo_id, codigo, nome, endereco, bairro, cidade, cep, horarios_culto, capacidade, observacoes, responsaveis)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                [$t, $d['grupo_id'], $d['codigo'], $d['nome'], $d['endereco'], $d['bairro'], $d['cidade'], $d['cep'], $d['horarios_culto'], $d['capacidade'], $d['observacoes'], $d['responsaveis']]
            );
            // Toda casa nasce com seu DML Local.
            Db::insert("INSERT INTO locais_estoque (tenant_id, tipo, casa_id, nome) VALUES (?, 'local', ?, ?)", [$t, $id, 'DML Local — ' . $d['nome']]);
            Auditoria::registrar('criar', 'casas_oracao', $id, null, $d);
            return $id;
        });
        Resposta::json(self::casa($t, $id), 201);
    }

    public static function editarCasa(Requisicao $r, int $id): array
    {
        Acesso::exigir('admin.casas');
        $t = Sessao::tenantId();
        $antes = self::casa($t, $id);
        // Campos que o formulário não manda continuam como estão (ex.: responsáveis, da v1.0).
        $d = self::validarCasa($r->corpo + ['responsaveis' => $antes['responsaveis']], $t, $id, (bool) $antes['ativo']);
        Db::run(
            'UPDATE casas_oracao SET grupo_id=?, codigo=?, nome=?, endereco=?, bairro=?, cidade=?, cep=?, horarios_culto=?, capacidade=?, observacoes=?, responsaveis=?, ativo=?
              WHERE tenant_id = ? AND id = ?',
            [$d['grupo_id'], $d['codigo'], $d['nome'], $d['endereco'], $d['bairro'], $d['cidade'], $d['cep'], $d['horarios_culto'], $d['capacidade'], $d['observacoes'], $d['responsaveis'], $d['ativo'], $t, $id]
        );
        $depois = self::casa($t, $id);
        Auditoria::registrar('editar', 'casas_oracao', $id, $antes, $depois);
        return $depois;
    }

    private static function validarCasa(array $corpo, int $t, ?int $id = null, bool $ativoAtual = true): array
    {
        $v = (new Validar($corpo))
            ->inteiro('grupo_id')->texto('codigo', true, 20)->texto('nome', true, 150)
            ->texto('endereco', false, 255)->texto('bairro', false, 100)->texto('cidade', false, 100)
            ->texto('cep', false, 9)->texto('horarios_culto', false, 500)->inteiro('capacidade', false)
            ->texto('observacoes', false, 2000)->texto('responsaveis', false, 500)->booleano('ativo', $ativoAtual);
        $previa = $corpo;
        if (isset($previa['grupo_id']) && ctype_digit((string) $previa['grupo_id'])
            && !Db::one('SELECT id FROM grupos WHERE tenant_id = ? AND id = ? AND ativo = 1', [$t, (int) $previa['grupo_id']])) {
            $v->erro('grupo_id', 'Grupo inválido.');
        }
        if (isset($previa['codigo']) && is_string($previa['codigo'])
            && Db::one('SELECT id FROM casas_oracao WHERE tenant_id = ? AND codigo = ? AND id <> ?', [$t, trim($previa['codigo']), $id ?? 0])) {
            $v->erro('codigo', 'Já existe uma casa com este código.');
        }
        if (isset($previa['cep']) && is_string($previa['cep']) && trim($previa['cep']) !== '' && !preg_match('/^\d{5}-?\d{3}$/', trim($previa['cep']))) {
            $v->erro('cep', 'CEP inválido.');
        }
        return $v->ok();
    }

    private static function casa(int $t, int $id): array
    {
        $c = Db::one('SELECT ' . self::CAMPOS_CASA . ' FROM casas_oracao c JOIN grupos g ON g.id = c.grupo_id WHERE c.tenant_id = ? AND c.id = ?', [$t, $id]);
        if (!$c) throw HttpErro::naoEncontrado('Casa de Oração');
        return self::tiparCasas([$c])[0];
    }

    // ---------------------------------------------------------------- Configurações

    public static function verConfiguracoes(Requisicao $r): array
    {
        Acesso::exigir('admin.configuracoes');
        $t = Sessao::tenantId();
        $linhas = Db::all('SELECT chave, valor FROM configuracoes_tenant WHERE tenant_id = ?', [$t]);
        // Outras chaves (ex.: agenda da limpeza) têm tela própria.
        return array_merge(Catalogo::CONFIG_PADRAO, array_intersect_key(array_column($linhas, 'valor', 'chave'), Catalogo::CONFIG_PADRAO));
    }

    public static function editarConfiguracoes(Requisicao $r): array
    {
        Acesso::exigir('admin.configuracoes');
        $t = Sessao::tenantId();
        $antes = self::verConfiguracoes($r);
        $erros = [];
        $novos = [];
        foreach ($r->corpo as $chave => $valor) {
            if (!array_key_exists($chave, Catalogo::CONFIG_PADRAO)) { $erros[$chave] = 'Configuração desconhecida.'; continue; }
            if (!is_numeric($valor) || (float) $valor < 0) { $erros[$chave] = 'Informe um número válido.'; continue; }
            $novos[$chave] = str_contains($chave, 'meses') ? (string) (int) $valor : number_format((float) $valor, 2, '.', '');
        }
        $final = array_merge($antes, $novos);
        if ((float) $final['alcada_coordenacao_max'] >= (float) $final['alcada_gestao_max']) {
            $erros['alcada_coordenacao_max'] = 'A alçada da Coordenação precisa ser menor que a da Gestão.';
        }
        if ($erros) throw HttpErro::invalido($erros);
        Db::transacao(function () use ($t, $novos) {
            foreach ($novos as $k => $v) {
                Db::run('INSERT INTO configuracoes_tenant (tenant_id, chave, valor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [$t, $k, $v]);
            }
        });
        Auditoria::registrar('editar', 'configuracoes_tenant', null, $antes, $final);
        return $final;
    }

    // ---------------------------------------------------------------- Auditoria

    public static function listarAuditoria(Requisicao $r): array
    {
        Acesso::exigir('admin.auditoria');
        $t = Sessao::tenantId();
        $pagina = max(1, (int) ($r->query['pagina'] ?? 1));
        $porPagina = 50;
        $linhas = Db::all(
            'SELECT a.id, a.acao, a.entidade, a.entidade_id, a.antes, a.depois, a.ip, a.criado_em, u.nome AS usuario
               FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
              WHERE a.tenant_id = ? ORDER BY a.id DESC LIMIT ' . $porPagina . ' OFFSET ' . (($pagina - 1) * $porPagina),
            [$t]
        );
        foreach ($linhas as &$l) {
            $l['antes'] = $l['antes'] ? json_decode($l['antes'], true) : null;
            $l['depois'] = $l['depois'] ? json_decode($l['depois'], true) : null;
        }
        return ['pagina' => $pagina, 'itens' => $linhas];
    }

    // ---------------------------------------------------------------- util

    private static function tipar(array $linhas): array
    {
        return array_map(fn($g) => ['id' => (int) $g['id'], 'nome' => $g['nome'], 'ativo' => (bool) $g['ativo']]
            + (isset($g['casas']) ? ['casas' => (int) $g['casas']] : []), $linhas);
    }

    private static function tiparCasas(array $linhas): array
    {
        return array_map(function ($c) {
            $c['id'] = (int) $c['id'];
            $c['grupo_id'] = (int) $c['grupo_id'];
            $c['ativo'] = (bool) $c['ativo'];
            $c['capacidade'] = $c['capacidade'] === null ? null : (int) $c['capacidade'];
            if (array_key_exists('capa_id', $c)) {
                $c['capa_url'] = $c['capa_id'] ? '/api/anexos/' . $c['capa_id'] . '?mini=1' : null;
                unset($c['capa_id']);
            }
            return $c;
        }, $linhas);
    }
}
