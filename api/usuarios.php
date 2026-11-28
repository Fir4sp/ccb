<?php
/* KONSTANTE SaaS — api/usuarios.php  ·  usuários da própria empresa
   v1.13.0: usuário cliente com várias unidades (cliente regional) — usuario_clientes */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once dirname(__DIR__) . '/nucleo/anexos.php';   /* v1.35.2: foto do usuário */

const PERFIS = PERFIS_TODOS;   /* v1.22.0: admin, financeiro, comercial, coord, tecnico, cliente */

/* v1.22.0: perfis extras de cada usuário: [usuario_id => [{perfil, validoAte, vencido}]] */
function usuarios_extras($tid) {
    $out = [];
    try {
        foreach (linhas("SELECT usuario_id, perfil, valido_ate FROM usuario_perfis WHERE tenant_id = ? ORDER BY perfil", [$tid]) as $r)
            $out[(int) $r['usuario_id']][] = ['perfil' => $r['perfil'], 'validoAte' => $r['valido_ate'],
                                              'vencido' => $r['valido_ate'] !== null && $r['valido_ate'] < date('Y-m-d')];
    } catch (Throwable $e) { /* SQL 16 ainda não rodado */ }
    return $out;
}

/* unidades extras de cada usuário cliente: [usuario_id => [{id, nome}]] */
function usuarios_unidades($tid) {
    $out = [];
    try {
        foreach (linhas("SELECT uc.usuario_id, c.id, c.nome FROM usuario_clientes uc JOIN clientes c ON c.tenant_id = uc.tenant_id AND c.id = uc.cliente_id
                          WHERE uc.tenant_id = ? AND c.excluido_em IS NULL ORDER BY c.nome", [$tid]) as $r)
            $out[(int) $r['usuario_id']][] = ['id' => (int) $r['id'], 'nome' => $r['nome']];
    } catch (Throwable $e) { /* SQL 08 ainda não rodado */ }
    return $out;
}

function admins_ativos_restantes($tid, $excetoId) {
    return (int) valor("SELECT COUNT(*) FROM usuarios
                         WHERE tenant_id = ? AND perfil = 'admin' AND status = 'ativo'
                           AND excluido_em IS NULL AND id <> ?", [$tid, $excetoId]);
}

return [

    'listar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $rows = linhas("SELECT u.*, c.nome AS cliente_nome FROM usuarios u LEFT JOIN clientes c ON c.tenant_id = u.tenant_id AND c.id = u.cliente_id
                         WHERE u.tenant_id = ? AND u.excluido_em IS NULL ORDER BY u.nome", [$tid]);
        $uni = usuarios_unidades($tid);
        $ext = usuarios_extras($tid);
        return array_map(function ($r) use ($uni, $ext) {
            return array_merge(usuario_publico($r), ['clienteNome' => $r['cliente_nome'], 'unidades' => $uni[(int) $r['id']] ?? [], 'extras' => $ext[(int) $r['id']] ?? []]);
        }, $rows);
    },

    /* cria (sem id) ou edita (com id). Só admin. */
    'salvar' => function ($d) {
        $eu  = exigir_perfil('admin');
        $tid = tenant();
        $id  = (int) ($d['id'] ?? 0);

        $nome   = txt($d['nome'] ?? '', 150);
        $email  = mb_strtolower(txt($d['email'] ?? '', 190));
        $perfil = (string) ($d['perfil'] ?? 'tecnico');
        $status = ($d['status'] ?? 'ativo') === 'inativo' ? 'inativo' : 'ativo';
        if ($nome === '') erro('Informe o nome.');
        if (!email_valido($email)) erro('Informe um e-mail válido. Ele é o login da pessoa.');
        if (!in_array($perfil, PERFIS, true)) erro('Perfil inválido.');
        if (valor("SELECT id FROM usuarios WHERE email = ? AND id <> ?", [$email, $id])) erro('Esse e-mail já está em uso.');

        $clienteId = null;
        if ($perfil === 'cliente') {
            $clienteId = (int) ($d['clienteId'] ?? 0);
            if (!$clienteId || !valor("SELECT id FROM clientes WHERE id = ? AND tenant_id = ?", [$clienteId, $tid]))
                erro('Usuário do tipo cliente precisa estar ligado a um cliente cadastrado.');
        }
        $equipeId = (int) ($d['equipeId'] ?? 0) ?: null;
        if ($equipeId && !valor("SELECT id FROM equipes WHERE id = ? AND tenant_id = ?", [$equipeId, $tid])) $equipeId = null;

        $campos = [
            'nome' => $nome, 'email' => $email, 'perfil' => $perfil, 'status' => $status,
            'telefone' => txt_ou_null($d['telefone'] ?? '', 30),
            'cargo' => txt_ou_null($d['cargo'] ?? '', 80),
            'especialidade' => txt_ou_null($d['especialidade'] ?? '', 120),
            'registro' => txt_ou_null($d['registro'] ?? '', 60),
            'disponibilidade' => txt($d['disponibilidade'] ?? 'Disponível', 30) ?: 'Disponível',
            'equipe_id' => $equipeId, 'cliente_id' => $clienteId,
        ];

        if ($id) {
            $atual = linha("SELECT * FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
            if (!$atual) erro('Usuário não encontrado.', 404);
            /* v1.30.0: passar a contar no limite do plano (reativar ou sair do perfil cliente) */
            $contava = $atual['status'] === 'ativo' && $atual['perfil'] !== 'cliente';
            if (!$contava && $status === 'ativo' && $perfil !== 'cliente' && function_exists('assinatura_conferir_limite')) assinatura_conferir_limite($tid, $id);
            if ($id === (int) $eu['id'] && ($perfil !== 'admin' || $status !== 'ativo'))
                erro('Você não pode tirar o seu próprio acesso de administrador.');
            if ($atual['perfil'] === 'admin' && ($perfil !== 'admin' || $status !== 'ativo') && admins_ativos_restantes($tid, $id) === 0)
                erro('A empresa precisa de pelo menos um administrador ativo.');
            $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
            q("UPDATE usuarios SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [$id, $tid]));
            auditar('usuario_editar', 'usuarios', $id, $nome);
        } else {
            $senha = (string) ($d['senha'] ?? '');
            if (!senha_valida($senha)) erro('A senha inicial precisa ter pelo menos 8 caracteres, com letras e números.');
            if ($status === 'ativo' && $perfil !== 'cliente' && function_exists('assinatura_conferir_limite')) assinatura_conferir_limite($tid);   /* v1.30.0 */
            $campos['tenant_id'] = $tid;
            $campos['senha_hash'] = password_hash($senha, PASSWORD_DEFAULT);
            $campos['trocar_senha'] = 1;
            $cols = implode(', ', array_keys($campos));
            $ph   = implode(', ', array_fill(0, count($campos), '?'));
            q("INSERT INTO usuarios ($cols) VALUES ($ph)", array_values($campos));
            $id = (int) db()->lastInsertId();
            auditar('usuario_criar', 'usuarios', $id, $nome);
        }
        /* cliente regional: unidades além da principal */
        if (array_key_exists('unidades', $d) || $perfil !== 'cliente') {
            $extras = [];
            if ($perfil === 'cliente')
                foreach (array_unique(array_map('intval', is_array($d['unidades'] ?? null) ? $d['unidades'] : [])) as $cid)
                    if ($cid && $cid !== $clienteId && valor("SELECT id FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$cid, $tid])) $extras[] = $cid;
            try {
                q("DELETE FROM usuario_clientes WHERE tenant_id = ? AND usuario_id = ?", [$tid, $id]);
                foreach ($extras as $cid) q("INSERT INTO usuario_clientes (tenant_id, usuario_id, cliente_id) VALUES (?, ?, ?)", [$tid, $id, $cid]);
            } catch (Throwable $e) {
                if ($extras) erro('Para ligar mais de uma unidade, rode antes o SQL 08 da versão 1.13.0.');
            }
        }
        /* v1.22.0: perfis extras (acúmulo), com validade opcional. Cliente não acumula. */
        if (array_key_exists('extras', $d) || $perfil === 'cliente') {
            $ext = [];
            if ($perfil !== 'cliente') foreach ((array) ($d['extras'] ?? []) as $x) {
                $p = (string) ($x['perfil'] ?? '');
                if (!in_array($p, PERFIS_INTERNOS, true) || $p === $perfil || isset($ext[$p])) continue;
                $ate = trim((string) ($x['validoAte'] ?? ''));
                if ($ate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $ate)) erro('Data de validade inválida no perfil extra.');
                if ($ate !== '' && $ate < date('Y-m-d')) erro('A validade do perfil extra precisa ser hoje ou depois.');
                $ext[$p] = $ate !== '' ? $ate : null;
            }
            try {
                $antes = [];
                foreach (linhas("SELECT perfil, valido_ate FROM usuario_perfis WHERE tenant_id = ? AND usuario_id = ?", [$tid, $id]) as $r) $antes[$r['perfil']] = $r['valido_ate'];
                if ($antes != $ext) {
                    q("DELETE FROM usuario_perfis WHERE tenant_id = ? AND usuario_id = ?", [$tid, $id]);
                    foreach ($ext as $p => $ate) q("INSERT INTO usuario_perfis (tenant_id, usuario_id, perfil, valido_ate, criado_por) VALUES (?, ?, ?, ?, ?)", [$tid, $id, $p, $ate, (int) $eu['id']]);
                    $txt = $ext ? implode(', ', array_map(function ($p, $a) { return $p . ($a ? ' até ' . date('d/m/Y', strtotime($a)) : ''); }, array_keys($ext), $ext)) : 'nenhum';
                    auditar('usuario_perfis', 'usuarios', $id, $nome . ' · perfis extras: ' . $txt);
                }
            } catch (Throwable $e) {
                if ($ext) erro('Para dar mais de um perfil ao usuário, rode antes o SQL 16 da versão 1.22.0.');
            }
        }
        $r = usuario_publico(linha("SELECT * FROM usuarios WHERE id = ? AND tenant_id = ?", [$id, $tid]));
        $r['extras'] = usuarios_extras($tid)[$id] ?? [];
        return $r;
    },

    /* v1.35.2: admin coloca / troca a foto de qualquer usuário da empresa — arquivo em "arquivo", {usuarioId} */
    'foto' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $alvo = linha("SELECT id, nome, foto_anexo_id FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['usuarioId'] ?? 0), $tid]);
        if (!$alvo) erro('Usuário não encontrado.', 404);
        $aid = salvar_anexo($_FILES['arquivo'] ?? null, 'usuario', (int) $alvo['id'], 'foto', true);
        q("UPDATE usuarios SET foto_anexo_id = ? WHERE id = ? AND tenant_id = ?", [$aid, $alvo['id'], $tid]);
        if ($alvo['foto_anexo_id']) q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ? AND dono_tipo = 'usuario'", [(int) $alvo['foto_anexo_id'], $tid]);
        auditar('usuario_foto', 'usuarios', (int) $alvo['id'], $alvo['nome']);
        return ['fotoId' => $aid];
    },

    'foto_remover' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $alvo = linha("SELECT id, foto_anexo_id FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['usuarioId'] ?? 0), $tid]);
        if (!$alvo) erro('Usuário não encontrado.', 404);
        q("UPDATE usuarios SET foto_anexo_id = NULL WHERE id = ? AND tenant_id = ?", [$alvo['id'], $tid]);
        if ($alvo['foto_anexo_id']) q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ? AND dono_tipo = 'usuario'", [(int) $alvo['foto_anexo_id'], $tid]);
        return ['fotoId' => null];
    },

    /* admin define uma senha nova; a pessoa troca no próximo acesso */
    'definir_senha' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $senha = (string) ($d['senha'] ?? '');
        if (!valor("SELECT id FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]))
            erro('Usuário não encontrado.', 404);
        if (!senha_valida($senha)) erro('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
        q("UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ? AND tenant_id = ?",
          [password_hash($senha, PASSWORD_DEFAULT), $id, $tid]);
        auditar('usuario_definir_senha', 'usuarios', $id);
        return true;
    },

    /* exclusão lógica: some das listas, mas o histórico continua ligado */
    'excluir' => function ($d) {
        $eu = exigir_perfil('admin');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        if ($id === (int) $eu['id']) erro('Você não pode excluir o seu próprio usuário.');
        $u = linha("SELECT * FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
        if (!$u) erro('Usuário não encontrado.', 404);
        if ($u['perfil'] === 'admin' && admins_ativos_restantes($tid, $id) === 0)
            erro('A empresa precisa de pelo menos um administrador ativo.');
        /* libera o e-mail para uso futuro, mantendo o registro */
        q("UPDATE usuarios SET excluido_em = NOW(), status = 'inativo',
                  email = LEFT(CONCAT('excluido-', id, '-', email), 190) WHERE id = ? AND tenant_id = ?", [$id, $tid]);
        auditar('usuario_excluir', 'usuarios', $id, $u['nome']);
        return true;
    },
];
