<?php
/* KONSTANTE SaaS — api/clientes.php  ·  cadastro de clientes da empresa
   Ações: listar, obter, salvar, excluir.
   tenant_id vem sempre da sessão; o número do cliente é gerado aqui. */
if (!defined('KSAAS')) { http_response_code(403); exit; }

const CLI_POR_PAGINA = 50;
const CLI_IMPORTAR_MAX = 500;   // linhas por envio (a tela divide planilhas maiores)
const CLI_ORIGENS = ['Pesquisa google', 'Indicação', 'Evento', 'Instagram', 'Linkedin', 'Facebook', 'Dep. Comercial'];

/* aceita a origem escrita de vários jeitos e devolve o texto padrão do sistema */
function origem_padrao($v) {
    $v = trim((string) $v);
    if ($v === '') return '';
    $k = strtolower(strtr($v, ['á'=>'a','à'=>'a','ã'=>'a','â'=>'a','é'=>'e','ê'=>'e','í'=>'i','ó'=>'o','ô'=>'o','õ'=>'o','ú'=>'u','ç'=>'c',
                                'Á'=>'a','À'=>'a','Ã'=>'a','Â'=>'a','É'=>'e','Ê'=>'e','Í'=>'i','Ó'=>'o','Ô'=>'o','Õ'=>'o','Ú'=>'u','Ç'=>'c']));
    $k = preg_replace('/[^a-z]+/', ' ', $k);
    $k = trim($k);
    $mapa = [
        'Pesquisa google' => ['pesquisa google', 'google', 'pesquisa no google', 'busca google', 'site', 'internet'],
        'Indicação'       => ['indicacao', 'indicado', 'indicacao de cliente'],
        'Evento'          => ['evento', 'feira'],
        'Instagram'       => ['instagram', 'insta'],
        'Linkedin'        => ['linkedin', 'linked in'],
        'Facebook'        => ['facebook', 'face'],
        'Dep. Comercial'  => ['dep comercial', 'comercial', 'departamento comercial', 'contato comercial', 'prospeccao', 'contato do nosso comercial'],
    ];
    foreach ($mapa as $padrao => $nomes) if (in_array($k, $nomes, true)) return $padrao;
    return null;   // não reconhecida
}

function so_digitos($v) { return preg_replace('/\D+/', '', (string) $v); }

/* aceita CNPJ (14) ou CPF (11), com ou sem pontuação; devolve formatado */
function documento_formatado($v, $tipo) {
    $d = so_digitos($v);
    if ($d === '') return null;
    if ($tipo === 'PJ') {
        if (strlen($d) !== 14) erro('CNPJ precisa ter 14 números.');
        return substr($d, 0, 2) . '.' . substr($d, 2, 3) . '.' . substr($d, 5, 3) . '/' . substr($d, 8, 4) . '-' . substr($d, 12, 2);
    }
    if (strlen($d) !== 11) erro('CPF precisa ter 11 números.');
    return substr($d, 0, 3) . '.' . substr($d, 3, 3) . '.' . substr($d, 6, 3) . '-' . substr($d, 9, 2);
}

function cliente_publico($c) {
    return [
        'id'         => (int) $c['id'],
        'numero'     => (int) $c['numero'],
        'nome'       => $c['nome'],
        'tipoPessoa' => $c['tipo_pessoa'],
        'documento'  => $c['documento'],
        'contato'    => $c['contato'],
        'email'      => $c['email'],
        'telefone'   => $c['telefone'],
        'endereco'   => $c['endereco'],
        'origem'     => $c['origem'],
        'situacao'   => $c['situacao'],
        'obs'        => $c['obs'],
        'criadoEm'   => $c['criado_em'],
        'chamados'   => isset($c['n_chamados']) ? (int) $c['n_chamados'] : null,
    ];
}

function cliente_da_empresa($id, $tid) {
    $c = linha("SELECT c.*,
                       (SELECT COUNT(*) FROM chamados ch
                         WHERE ch.tenant_id = c.tenant_id AND ch.cliente_id = c.id AND ch.excluido_em IS NULL) AS n_chamados
                  FROM clientes c
                 WHERE c.id = ? AND c.tenant_id = ? AND c.excluido_em IS NULL", [$id, $tid]);
    if (!$c) erro('Cliente não encontrado.', 404, 'NAO_ENCONTRADO');
    return $c;
}

return [

    /* {busca?, ordem?: recentes|antigos|az|za, pagina?} */
    'listar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $where = "c.tenant_id = ? AND c.excluido_em IS NULL";
        $par = [$tid];

        $busca = txt($d['busca'] ?? '', 100);
        if ($busca !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $busca) . '%';
            $where .= " AND (c.nome LIKE ? OR c.contato LIKE ? OR c.email LIKE ? OR c.telefone LIKE ? OR c.documento LIKE ? OR c.numero = ?";
            array_push($par, $like, $like, $like, $like, $like, ctype_digit($busca) ? (int) $busca : -1);
            $dig = so_digitos($busca);
            if (strlen($dig) >= 4) { $where .= " OR REPLACE(REPLACE(REPLACE(c.documento,'.',''),'/',''),'-','') LIKE ?"; $par[] = '%' . $dig . '%'; }
            $where .= ")";
        }

        $ordens = ['recentes' => 'c.numero DESC', 'antigos' => 'c.numero ASC', 'az' => 'c.nome ASC', 'za' => 'c.nome DESC'];
        $ordem = $ordens[$d['ordem'] ?? ''] ?? $ordens['recentes'];

        $total  = (int) valor("SELECT COUNT(*) FROM clientes c WHERE $where", $par);
        $pagina = max(1, (int) ($d['pagina'] ?? 1));
        $inicio = ($pagina - 1) * CLI_POR_PAGINA;

        $rows = linhas("SELECT c.*,
                               (SELECT COUNT(*) FROM chamados ch
                                 WHERE ch.tenant_id = c.tenant_id AND ch.cliente_id = c.id AND ch.excluido_em IS NULL) AS n_chamados
                          FROM clientes c
                         WHERE $where
                         ORDER BY $ordem
                         LIMIT " . CLI_POR_PAGINA . " OFFSET " . (int) $inicio, $par);

        return ['itens' => array_map('cliente_publico', $rows), 'total' => $total,
                'pagina' => $pagina, 'porPagina' => CLI_POR_PAGINA];
    },

    'obter' => function ($d) {
        exigir_perfil('admin', 'coord');
        return cliente_publico(cliente_da_empresa((int) ($d['id'] ?? 0), tenant()));
    },

    /* cria (sem id) ou edita (com id) */
    'salvar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id  = (int) ($d['id'] ?? 0);

        $nome = txt($d['nome'] ?? '', 200);
        if ($nome === '') erro('Informe o nome do cliente.');
        $tipo = ($d['tipoPessoa'] ?? 'PJ') === 'PF' ? 'PF' : 'PJ';
        $email = mb_strtolower(txt($d['email'] ?? '', 190));
        if ($email !== '' && !email_valido($email)) erro('E-mail inválido.');
        $situacao = ($d['situacao'] ?? 'novo') === 'antigo' ? 'antigo' : 'novo';
        $documento = documento_formatado($d['documento'] ?? '', $tipo);
        /* cliente novo precisa dizer de onde veio (alimenta o indicador de origem) */
        if (!$id && $situacao === 'novo' && txt($d['origem'] ?? '', 60) === '') erro('Informe como o cliente chegou até nós.');

        if ($documento && valor("SELECT id FROM clientes WHERE tenant_id = ? AND documento = ? AND excluido_em IS NULL AND id <> ?",
                                [$tid, $documento, $id])) {
            erro('Já existe um cliente com este ' . ($tipo === 'PJ' ? 'CNPJ' : 'CPF') . '.', 409, 'DUPLICADO');
        }

        $campos = [
            'nome'        => $nome,
            'tipo_pessoa' => $tipo,
            'documento'   => $documento,
            'contato'     => txt_ou_null($d['contato'] ?? '', 150),
            'email'       => $email === '' ? null : $email,
            'telefone'    => txt_ou_null($d['telefone'] ?? '', 30),
            'endereco'    => txt_ou_null($d['endereco'] ?? '', 255),
            'origem'      => $situacao === 'novo' ? txt_ou_null($d['origem'] ?? '', 60) : null,
            'situacao'    => $situacao,
            'obs'         => txt_ou_null($d['obs'] ?? '', 5000),
        ];

        if ($id) {
            cliente_da_empresa($id, $tid);   // confere que é desta empresa
            $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
            q("UPDATE clientes SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [$id, $tid]));
            auditar('cliente_editar', 'clientes', $id, $nome);
        } else {
            db()->beginTransaction();
            $campos['tenant_id']  = $tid;
            $campos['numero']     = numero_livre('cliente', 'clientes', $tid);
            $campos['criado_por'] = (int) eu()['id'];
            $cols = implode(', ', array_keys($campos));
            $ph   = implode(', ', array_fill(0, count($campos), '?'));
            q("INSERT INTO clientes ($cols) VALUES ($ph)", array_values($campos));
            $id = (int) db()->lastInsertId();
            db()->commit();
            auditar('cliente_criar', 'clientes', $id, $campos['numero'] . ' ' . $nome);
        }
        return cliente_publico(cliente_da_empresa($id, $tid));
    },

    /* importação em lote a partir da planilha.
       {linhas:[{linha, numero?, nome, tipoPessoa?, documento?, contato?, email?, telefone?, endereco?, situacao?, origem?, obs?}], simular}
       simular=true só confere e devolve o resultado de cada linha, sem gravar.
       Linhas com erro são puladas; as boas entram. */
    'importar' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $uid = (int) eu()['id'];
        $linhas = is_array($d['linhas'] ?? null) ? array_values($d['linhas']) : [];
        if (!$linhas) erro('A planilha não tem linhas para importar.');
        if (count($linhas) > CLI_IMPORTAR_MAX) erro('Envie no máximo ' . CLI_IMPORTAR_MAX . ' linhas por vez.');
        $simular = !empty($d['simular']);

        $docsVistos = []; $numsVistos = []; $res = []; $boas = [];
        foreach ($linhas as $i => $l) {
            $nLinha = (int) ($l['linha'] ?? ($i + 2));
            try {
                if (!is_array($l)) erro('Linha inválida.');
                $nome = txt($l['nome'] ?? '', 200);
                if ($nome === '') erro('Sem nome.');
                $digitos = so_digitos($l['documento'] ?? '');
                $tipoIn = strtoupper(txt($l['tipoPessoa'] ?? '', 2));
                $tipo = $tipoIn === 'PF' || $tipoIn === 'PJ' ? $tipoIn : (strlen($digitos) > 0 && strlen($digitos) <= 11 ? 'PF' : 'PJ');
                $tam = $tipo === 'PF' ? 11 : 14;   // o Excel come os zeros da frente: devolve até 3
                if ($digitos !== '' && strlen($digitos) < $tam && strlen($digitos) >= $tam - 3) $digitos = str_pad($digitos, $tam, '0', STR_PAD_LEFT);
                $documento = documento_formatado($digitos, $tipo);
                $email = mb_strtolower(txt($l['email'] ?? '', 190));
                if ($email !== '' && !email_valido($email)) erro('E-mail inválido.');
                $sit = mb_strtolower(txt($l['situacao'] ?? '', 20));
                $situacao = in_array($sit, ['antigo', 'antiga', 'ja era cliente', 'já era cliente'], true) ? 'antigo' : 'novo';
                $origem = null;
                if ($situacao === 'novo') {
                    $origem = origem_padrao($l['origem'] ?? '');
                    if ($origem === '') erro('Cliente novo sem origem (como chegou até nós).');
                    if ($origem === null) erro('Origem "' . txt($l['origem'], 40) . '" não reconhecida. Use: ' . implode(', ', CLI_ORIGENS) . '.');
                }
                if ($documento) {
                    if (isset($docsVistos[$documento])) erro(($tipo === 'PJ' ? 'CNPJ' : 'CPF') . ' repetido na planilha (linha ' . $docsVistos[$documento] . ').');
                    if (valor("SELECT 1 FROM clientes WHERE tenant_id = ? AND documento = ? AND excluido_em IS NULL", [$tid, $documento]))
                        erro('Já existe um cliente com este ' . ($tipo === 'PJ' ? 'CNPJ' : 'CPF') . '.');
                    $docsVistos[$documento] = $nLinha;
                }
                $numero = (int) so_digitos($l['numero'] ?? '');
                if ($numero > 0) {
                    if (isset($numsVistos[$numero])) erro('Nº ' . $numero . ' repetido na planilha (linha ' . $numsVistos[$numero] . ').');
                    if (valor("SELECT 1 FROM clientes WHERE tenant_id = ? AND numero = ?", [$tid, $numero])) erro('O nº ' . $numero . ' já é de outro cliente.');
                    $numsVistos[$numero] = $nLinha;
                }
                $boas[] = ['linha' => $nLinha, 'numero' => $numero ?: null, 'campos' => [
                    'nome'        => $nome,
                    'tipo_pessoa' => $tipo,
                    'documento'   => $documento,
                    'contato'     => txt_ou_null($l['contato'] ?? '', 150),
                    'email'       => $email === '' ? null : $email,
                    'telefone'    => txt_ou_null($l['telefone'] ?? '', 30),
                    'endereco'    => txt_ou_null($l['endereco'] ?? '', 255),
                    'origem'      => $origem,
                    'situacao'    => $situacao,
                    'obs'         => txt_ou_null($l['obs'] ?? '', 5000),
                ]];
                $res[$nLinha] = ['linha' => $nLinha, 'ok' => true, 'nome' => $nome, 'numero' => $numero ?: null];
            } catch (ErroApi $e) {
                $res[$nLinha] = ['linha' => $nLinha, 'ok' => false, 'nome' => txt($l['nome'] ?? '', 200), 'erro' => $e->getMessage()];
            }
        }

        $criados = 0;
        if (!$simular && $boas) {
            db()->beginTransaction();
            foreach ($boas as $b) {
                $c = $b['campos'];
                $c['tenant_id']  = $tid;
                $c['numero']     = $b['numero'] ?: numero_livre('cliente', 'clientes', $tid);
                $c['criado_por'] = $uid;
                $cols = implode(', ', array_keys($c));
                $ph   = implode(', ', array_fill(0, count($c), '?'));
                q("INSERT INTO clientes ($cols) VALUES ($ph)", array_values($c));
                $res[$b['linha']]['numero'] = $c['numero'];
                $criados++;
            }
            /* números vindos da planilha: a numeração continua depois do maior */
            $maior = (int) valor("SELECT COALESCE(MAX(numero), 0) FROM clientes WHERE tenant_id = ?", [$tid]);
            if (valor("SELECT 1 FROM sequencias WHERE tenant_id = ? AND tipo = 'cliente'", [$tid]))
                q("UPDATE sequencias SET proximo = GREATEST(proximo, ?) WHERE tenant_id = ? AND tipo = 'cliente'", [$maior + 1, $tid]);
            else
                q("INSERT INTO sequencias (tenant_id, tipo, proximo) VALUES (?, 'cliente', ?)", [$tid, $maior + 1]);
            db()->commit();
            auditar('cliente_importar', 'clientes', null, $criados . ' cliente(s) importado(s) da planilha');
        }

        $erros = count(array_filter($res, function ($r) { return !$r['ok']; }));
        return ['simulado' => $simular, 'prontos' => count($boas), 'criados' => $criados, 'erros' => $erros, 'linhas' => array_values($res)];
    },

    /* exclusão lógica; só admin; bloqueia se houver chamados */
    'excluir' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $c = cliente_da_empresa((int) ($d['id'] ?? 0), $tid);
        if ((int) $c['n_chamados'] > 0) {
            erro('Este cliente tem ' . $c['n_chamados'] . ' chamado(s). Exclua ou mova os chamados antes.', 409, 'EM_USO');
        }
        if (valor("SELECT id FROM usuarios WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL LIMIT 1", [$tid, $c['id']])) {
            erro('Há um usuário do portal ligado a este cliente. Exclua o usuário antes.', 409, 'EM_USO');
        }
        q("UPDATE clientes SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$c['id'], $tid]);
        auditar('cliente_excluir', 'clientes', (int) $c['id'], $c['numero'] . ' ' . $c['nome']);
        return ['id' => (int) $c['id']];
    },
];
