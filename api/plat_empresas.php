<?php
/* KONSTANTE SaaS — api/plat_empresas.php  ·  empresas (só no console da plataforma) */
if (!defined('KSAAS')) { http_response_code(403); exit; }

const SEQ_TIPOS = ['cliente', 'chamado', 'os_contrato', 'contrato'];

/* empresa modelo: o catálogo dela é copiado para as outras */
const CATALOGO_MODELO = 1;
/* configurações que acompanham o catálogo (só gravadas se a empresa ainda não tiver) */
const CONFIG_DO_CATALOGO = ['markup_materiais', 'validade_orcamento', 'checklists_os'];

function catalogo_contagem($tid) {
    $c = [];
    foreach (['servicos', 'materiais', 'maquinas'] as $t)
        $c[$t] = (int) valor("SELECT COUNT(*) FROM catalogo_$t WHERE tenant_id = ? AND excluido_em IS NULL", [$tid]);
    return $c;
}

/* Copia serviços, materiais e tipos de máquina da empresa modelo para $destino.
   Os kits guardam IDs de materiais: cada ID é trocado pelo da cópia.
   Deve rodar DENTRO de uma transação (quem chama abre e confirma). */
function copiar_catalogo_modelo($destino) {
    foreach (linhas("SELECT * FROM catalogo_servicos WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY ordem, id", [CATALOGO_MODELO]) as $s) {
        q("INSERT INTO catalogo_servicos (tenant_id, nome, unidade, valor, ativo, ordem) VALUES (?, ?, ?, ?, ?, ?)",
          [$destino, $s['nome'], $s['unidade'], $s['valor'], $s['ativo'], $s['ordem']]);
    }
    $mapa = [];
    foreach (linhas("SELECT * FROM catalogo_materiais WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY ordem, id", [CATALOGO_MODELO]) as $m) {
        q("INSERT INTO catalogo_materiais (tenant_id, tipo, nome, unidade, custo, markup_pct, regra, ativo, ordem)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [$destino, $m['tipo'], $m['nome'], $m['unidade'], $m['custo'], $m['markup_pct'], $m['regra'], $m['ativo'], $m['ordem']]);
        $mapa[(int) $m['id']] = (int) db()->lastInsertId();
    }
    foreach (linhas("SELECT * FROM catalogo_maquinas WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY ordem, id", [CATALOGO_MODELO]) as $k) {
        $ids = json_decode((string) $k['materiais'], true);
        $novos = [];
        foreach (is_array($ids) ? $ids : [] as $x) {
            if (isset($mapa[(int) $x])) $novos[] = $mapa[(int) $x];   // material excluído no modelo fica de fora
        }
        q("INSERT INTO catalogo_maquinas (tenant_id, nome, materiais, ativo, ordem) VALUES (?, ?, ?, ?, ?)",
          [$destino, $k['nome'], json_encode($novos), $k['ativo'], $k['ordem']]);
    }
    foreach (CONFIG_DO_CATALOGO as $chave) {
        $v = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = ?", [CATALOGO_MODELO, $chave]);
        if ($v === false) continue;
        if (valor("SELECT 1 FROM config WHERE tenant_id = ? AND chave = ?", [$destino, $chave])) continue;
        q("INSERT INTO config (tenant_id, chave, valor) VALUES (?, ?, ?)", [$destino, $chave, $v]);
    }
    return catalogo_contagem($destino);
}

function slug_de($s) {
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','ä'=>'a','é'=>'e','ê'=>'e','è'=>'e','í'=>'i','ì'=>'i',
                    'ó'=>'o','ô'=>'o','õ'=>'o','ò'=>'o','ú'=>'u','ù'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n']);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim(substr($s, 0, 60), '-');
}

function empresa_com_resumo($id) {
    $t = linha("SELECT * FROM tenants WHERE id = ?", [$id]);
    if (!$t) erro('Empresa não encontrada.', 404);
    $r = tenant_publico($t);
    $r['usuarios']   = (int) valor("SELECT COUNT(*) FROM usuarios WHERE tenant_id = ? AND excluido_em IS NULL", [$id]);
    $r['sequencias'] = [];
    foreach (linhas("SELECT tipo, proximo FROM sequencias WHERE tenant_id = ?", [$id]) as $s) {
        $r['sequencias'][$s['tipo']] = (int) $s['proximo'];
    }
    $r['catalogo'] = catalogo_contagem($id);
    $r['modelo']   = (int) $id === CATALOGO_MODELO;
    return $r;
}

/* ---------- v1.17.0: pedidos de acesso da landing ---------- */
require_once dirname(__DIR__) . '/nucleo/email.php';

function senha_provisoria() {
    $l = 'abcdefghjkmnpqrstuvwxyz'; $n = '23456789'; $s = '';
    for ($i = 0; $i < 6; $i++) $s .= $l[random_int(0, strlen($l) - 1)];
    for ($i = 0; $i < 4; $i++) $s .= $n[random_int(0, strlen($n) - 1)];
    return ucfirst(str_shuffle($s));
}
/* v1.39.0: plat_cadastros.tipo = 'acesso' (teste grátis) ou 'info' (formulário "Eu quero").
   Sem a coluna (SQL da v1.39.0 não rodado), o pedido "Eu quero" vem marcado no início da mensagem. */
const PLAT_INFO_MARCA = '[Pedido de informações]';
if (!function_exists('plat_tem_tipo')) {
    function plat_tem_tipo() {
        static $ok = null;
        if ($ok === null) { try { valor("SELECT tipo FROM plat_cadastros LIMIT 0"); $ok = true; } catch (Throwable $e) { $ok = false; } }
        return $ok;
    }
}
function cadastro_tipo($c) {
    if (strpos((string) ($c['mensagem'] ?? ''), PLAT_INFO_MARCA) === 0) return 'info';   /* enviado antes do SQL da v1.39.0 */
    return ($c['tipo'] ?? '') === 'info' ? 'info' : 'acesso';
}
/* condição SQL do tipo: [sql, params] */
function cadastro_tipo_sql($tipo) {
    if ($tipo !== 'info' && $tipo !== 'acesso') return ['1=1', []];
    if (plat_tem_tipo()) return $tipo === 'info' ? ["(tipo = 'info' OR mensagem LIKE ?)", [PLAT_INFO_MARCA . '%']]
                                                 : ["(tipo <> 'info' AND (mensagem IS NULL OR mensagem NOT LIKE ?))", [PLAT_INFO_MARCA . '%']];
    return $tipo === 'info' ? ['mensagem LIKE ?', [PLAT_INFO_MARCA . '%']] : ['(mensagem IS NULL OR mensagem NOT LIKE ?)', [PLAT_INFO_MARCA . '%']];
}

function cadastro_publico_fmt($c) {
    $tipo = cadastro_tipo($c);
    if ($tipo === 'info' && strpos((string) ($c['mensagem'] ?? ''), PLAT_INFO_MARCA) === 0) $c['mensagem'] = trim(substr($c['mensagem'], strlen(PLAT_INFO_MARCA))) ?: null;
    return ['id' => (int) $c['id'], 'tipo' => $tipo, 'empresa' => $c['empresa'], 'cnpj' => $c['cnpj'], 'responsavel' => $c['responsavel'], 'email' => $c['email'],
            'telefone' => $c['telefone'], 'cidade' => $c['cidade'], 'porte' => $c['porte'], 'mensagem' => $c['mensagem'], 'status' => $c['status'],
            'motivo' => $c['motivo'], 'tenantId' => $c['tenant_id'] !== null ? (int) $c['tenant_id'] : null, 'emailOk' => $c['email_ok'] === null ? null : (int) $c['email_ok'] === 1,
            'criadoEm' => $c['criado_em'], 'decididoEm' => $c['decidido_em'], 'decididoPor' => $c['decidido_por']];
}

return [

    'listar' => function ($d) {
        admin_plataforma();
        $ids = array_column(linhas("SELECT id FROM tenants ORDER BY nome"), 'id');
        return array_map('empresa_com_resumo', $ids);
    },

    /* cria (sem id) ou edita (com id) uma empresa.
       Na criação, exige o admin inicial e cria as sequências. */
    'salvar' => function ($d) {
        admin_plataforma();
        $id    = (int) ($d['id'] ?? 0);
        $nome  = txt($d['nome'] ?? '', 150);
        $slug  = slug_de(($d['slug'] ?? '') ?: $nome);
        $razao = txt_ou_null($d['razaoSocial'] ?? '', 200);
        $cnpj  = txt_ou_null($d['cnpj'] ?? '', 20);
        if ($nome === '') erro('Informe o nome da empresa.');
        if ($slug === '') erro('Informe um identificador (slug) válido.');
        $dup = valor("SELECT id FROM tenants WHERE slug = ? AND id <> ?", [$slug, $id]);
        if ($dup) erro('Já existe uma empresa com esse identificador.');

        $pdo = db();
        $pdo->beginTransaction();

        if ($id) {
            if (!valor("SELECT id FROM tenants WHERE id = ?", [$id])) erro('Empresa não encontrada.', 404);
            q("UPDATE tenants SET nome = ?, slug = ?, razao_social = ?, cnpj = ? WHERE id = ?",
              [$nome, $slug, $razao, $cnpj, $id]);
            $pdo->commit();
            auditar('empresa_editar', 'tenants', $id, $nome);
            return empresa_com_resumo($id);
        }

        $adm = is_array($d['admin'] ?? null) ? $d['admin'] : [];
        $admNome  = txt($adm['nome'] ?? '', 150);
        $admEmail = mb_strtolower(txt($adm['email'] ?? '', 190));
        $admSenha = (string) ($adm['senha'] ?? '');
        if ($admNome === '' || !email_valido($admEmail)) erro('Informe nome e e-mail válidos do administrador da empresa.');
        if (!senha_valida($admSenha)) erro('A senha inicial precisa ter pelo menos 8 caracteres, com letras e números.');
        if (valor("SELECT id FROM usuarios WHERE email = ?", [$admEmail])) erro('Esse e-mail já está em uso em outra conta.');

        q("INSERT INTO tenants (nome, slug, razao_social, cnpj, ativo) VALUES (?, ?, ?, ?, 1)",
          [$nome, $slug, $razao, $cnpj]);
        $novo = (int) $pdo->lastInsertId();

        $inicio = is_array($d['inicio'] ?? null) ? $d['inicio'] : [];
        foreach (SEQ_TIPOS as $tipo) {
            $n = max(1, (int) ($inicio[$tipo] ?? 1));
            q("INSERT INTO sequencias (tenant_id, tipo, proximo) VALUES (?, ?, ?)", [$novo, $tipo, $n]);
        }
        q("INSERT INTO config (tenant_id, chave, valor) VALUES (?, 'aliquota', '0'), (?, 'rt_padrao', '0')", [$novo, $novo]);

        q("INSERT INTO usuarios (tenant_id, nome, email, perfil, status, senha_hash, trocar_senha)
           VALUES (?, ?, ?, 'admin', 'ativo', ?, 1)",
          [$novo, $admNome, $admEmail, password_hash($admSenha, PASSWORD_DEFAULT)]);

        /* empresa nova já nasce com o catálogo padrão */
        copiar_catalogo_modelo($novo);
        assinatura_criar_teste($novo);   /* v1.30.0: começa o teste grátis */

        $pdo->commit();
        auditar('empresa_criar', 'tenants', $novo, $nome);
        return empresa_com_resumo($novo);
    },

    /* {status: pendente|aprovado|recusado|todos, tipo?: acesso|info} — v1.39.0: tipo do pedido */
    'cadastros' => function ($d) {
        admin_plataforma();
        $st = (string) ($d['status'] ?? 'pendente');
        [$wt, $pt] = cadastro_tipo_sql((string) ($d['tipo'] ?? ''));
        $comSt = in_array($st, ['pendente', 'aprovado', 'recusado'], true);
        $rows = linhas("SELECT * FROM plat_cadastros WHERE $wt" . ($comSt ? " AND status = ?" : "") . " ORDER BY id DESC LIMIT 200", $comSt ? array_merge($pt, [$st]) : $pt);
        $cont = [];
        foreach (linhas("SELECT status, COUNT(*) n FROM plat_cadastros WHERE $wt GROUP BY status", $pt) as $r) $cont[$r['status']] = (int) $r['n'];
        /* pendentes de cada tipo (para os selos do Console) */
        $pend = [];
        foreach (['acesso', 'info'] as $tp) { [$w2, $p2] = cadastro_tipo_sql($tp); $pend[$tp] = (int) valor("SELECT COUNT(*) FROM plat_cadastros WHERE status = 'pendente' AND $w2", $p2); }
        $itens = array_map('cadastro_publico_fmt', $rows);
        /* v1.31.0: código de indicação/cupom informado no pedido */
        foreach ($itens as &$it) {
            $it['codigo'] = null; $it['indicador'] = null;
            try {
                $c = valor("SELECT codigo FROM cadastro_codigos WHERE cadastro_id = ?", [$it['id']]);
                if ($c) { $it['codigo'] = $c; $r = codigo_resolver($c); $it['indicador'] = $r ? ($r['tipo'] === 'indicador' ? $r['linha']['nome'] : 'cupom ' . $r['linha']['codigo']) : 'código não encontrado'; }
            } catch (Throwable $x) {}
        }
        unset($it);
        return ['itens' => $itens, 'contagem' => $cont, 'pendentesPorTipo' => $pend];
    },

    /* v1.39.0: pedido de informações ("Eu quero") respondido — só registra quem e quando; não cria empresa nem acesso */
    'cadastro_respondido' => function ($d) {
        $adm = admin_plataforma();
        $c = linha("SELECT * FROM plat_cadastros WHERE id = ?", [(int) ($d['id'] ?? 0)]);
        if (!$c) erro('Pedido não encontrado.', 404);
        if (cadastro_tipo($c) !== 'info') erro('Este é um pedido de acesso: use Aprovar ou Recusar.');
        if ($c['status'] !== 'pendente') erro('Este pedido já foi marcado como respondido.');
        q("UPDATE plat_cadastros SET status = 'aprovado', motivo = ?, decidido_em = NOW(), decidido_por = ? WHERE id = ?",
          [txt_ou_null($d['obs'] ?? '', 255), $adm['nome'] ?? 'console', (int) $c['id']]);
        auditar('cadastro_respondido', 'plat_cadastros', (int) $c['id'], $c['responsavel']);
        return ['ok' => true];
    },

    /* aprova: cria a empresa + administrador com senha provisória e manda o e-mail */
    'cadastro_aprovar' => function ($d) {
        $adm = admin_plataforma();
        $c = linha("SELECT * FROM plat_cadastros WHERE id = ?", [(int) ($d['id'] ?? 0)]);
        if (!$c) erro('Pedido não encontrado.', 404);
        if (cadastro_tipo($c) === 'info') erro('Este é um pedido de informações ("Eu quero"): não cria empresa nem acesso. Marque como respondido.');   /* v1.39.0 */
        if ($c['status'] !== 'pendente') erro('Este pedido já foi ' . $c['status'] . '.');
        if (valor("SELECT id FROM usuarios WHERE email = ?", [$c['email']])) erro('Esse e-mail já está em uso em outra conta.');
        $nome = txt($d['nome'] ?? $c['empresa'], 150);
        $slug = slug_de(($d['slug'] ?? '') ?: $nome);
        if ($slug === '') erro('Identificador (slug) inválido.');
        $base = $slug; $k = 2;
        while (valor("SELECT id FROM tenants WHERE slug = ?", [$slug])) $slug = substr($base, 0, 50) . '-' . $k++;
        $senha = senha_provisoria();
        $pdo = db();
        $pdo->beginTransaction();
        q("INSERT INTO tenants (nome, slug, razao_social, cnpj, ativo) VALUES (?, ?, ?, ?, 1)", [$nome, $slug, $c['empresa'], $c['cnpj']]);
        $tid = (int) $pdo->lastInsertId();
        foreach (SEQ_TIPOS as $tipo) q("INSERT INTO sequencias (tenant_id, tipo, proximo) VALUES (?, ?, 1)", [$tid, $tipo]);
        q("INSERT INTO config (tenant_id, chave, valor) VALUES (?, 'aliquota', '0'), (?, 'rt_padrao', '0')", [$tid, $tid]);
        q("INSERT INTO usuarios (tenant_id, nome, email, telefone, perfil, status, senha_hash, trocar_senha) VALUES (?, ?, ?, ?, 'admin', 'ativo', ?, 1)",
          [$tid, $c['responsavel'], $c['email'], $c['telefone'], password_hash($senha, PASSWORD_DEFAULT)]);
        copiar_catalogo_modelo($tid);
        assinatura_criar_teste($tid);   /* v1.30.0: começa o teste grátis */
        /* v1.31.0: indicação feita no pedido de acesso fica ligada à empresa */
        try {
            $cod = valor("SELECT codigo FROM cadastro_codigos WHERE cadastro_id = ?", [(int) $c['id']]);
            if ($cod) { $r = codigo_resolver($cod); vinculo_gravar($tid, ['codigo_informado' => $cod, 'indicador_id' => $r && $r['tipo'] === 'indicador' ? (int) $r['linha']['id'] : null]); }
        } catch (Throwable $x) {}
        q("UPDATE plat_cadastros SET status = 'aprovado', tenant_id = ?, decidido_em = NOW(), decidido_por = ? WHERE id = ?", [$tid, $adm['nome'] ?? 'console', (int) $c['id']]);
        $pdo->commit();
        auditar('cadastro_aprovar', 'tenants', $tid, $nome);
        $e = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
        $url = url_sistema();
        $ok = enviar_email($c['email'], 'Seu acesso ao SGClim está liberado', email_modelo('Acesso liberado!',
            '<p>Olá, ' . $e(explode(' ', $c['responsavel'])[0]) . '. O acesso da <b>' . $e($nome) . '</b> ao SGClim foi liberado.</p>' .
            '<table role="presentation" cellpadding="0" cellspacing="0" style="background:#f4f7fd;border-radius:8px;padding:14px 16px;margin:14px 0;font-size:14px;width:100%">' .
            '<tr><td style="padding:4px 0;color:#6b7280;width:130px">Endereço</td><td><a href="' . $e($url) . '">' . $e($url) . '</a></td></tr>' .
            '<tr><td style="padding:4px 0;color:#6b7280">E-mail</td><td><b>' . $e($c['email']) . '</b></td></tr>' .
            '<tr><td style="padding:4px 0;color:#6b7280">Senha provisória</td><td><b style="font-size:16px;letter-spacing:1px">' . $e($senha) . '</b></td></tr></table>' .
            '<p>No primeiro acesso o sistema pede para você criar a sua própria senha e aceitar os Termos de Uso.</p>' .
            '<p style="text-align:center;margin:22px 0"><a href="' . $e($url) . '#/entrar" style="background:#043dac;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700">Entrar no sistema</a></p>'));
        q("UPDATE plat_cadastros SET email_ok = ? WHERE id = ?", [$ok ? 1 : 0, (int) $c['id']]);
        /* se o e-mail não saiu, o console mostra a senha para envio manual */
        return ['tenantId' => $tid, 'slug' => $slug, 'emailOk' => $ok, 'senha' => $ok ? null : $senha, 'email' => $c['email']];
    },

    'cadastro_recusar' => function ($d) {
        $adm = admin_plataforma();
        $c = linha("SELECT * FROM plat_cadastros WHERE id = ?", [(int) ($d['id'] ?? 0)]);
        if (!$c) erro('Pedido não encontrado.', 404);
        if ($c['status'] !== 'pendente') erro('Este pedido já foi ' . $c['status'] . '.');
        $motivo = txt($d['motivo'] ?? '', 255);
        q("UPDATE plat_cadastros SET status = 'recusado', motivo = ?, decidido_em = NOW(), decidido_por = ? WHERE id = ?", [$motivo ?: null, $adm['nome'] ?? 'console', (int) $c['id']]);
        $ok = false;
        if (!empty($d['avisar'])) {
            $e = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
            $ok = enviar_email($c['email'], 'Sobre o seu pedido de acesso', email_modelo('Pedido de acesso',
                '<p>Olá, ' . $e(explode(' ', $c['responsavel'])[0]) . '. No momento não conseguimos liberar o acesso da <b>' . $e($c['empresa']) . '</b>.</p>' .
                ($motivo ? '<p>' . $e($motivo) . '</p>' : '') . '<p>Se quiser conversar, responda para ' . $e(mail_aviso()) . '.</p>'));
        }
        q("UPDATE plat_cadastros SET email_ok = ? WHERE id = ?", [$ok ? 1 : 0, (int) $c['id']]);
        auditar('cadastro_recusar', 'plat_cadastros', (int) $c['id'], $c['empresa']);
        return ['ok' => true, 'emailOk' => $ok];
    },

    'ativar' => function ($d) {
        admin_plataforma();
        $id = (int) ($d['id'] ?? 0);
        $ativo = !empty($d['ativo']) ? 1 : 0;
        if (!valor("SELECT id FROM tenants WHERE id = ?", [$id])) erro('Empresa não encontrada.', 404);
        q("UPDATE tenants SET ativo = ? WHERE id = ?", [$ativo, $id]);
        auditar($ativo ? 'empresa_ativar' : 'empresa_desativar', 'tenants', $id);
        return empresa_com_resumo($id);
    },

    /* ajusta o próximo número de uma sequência — só para frente */
    'sequencia' => function ($d) {
        admin_plataforma();
        $id   = (int) ($d['id'] ?? 0);
        $tipo = (string) ($d['tipo'] ?? '');
        $novo = (int) ($d['proximo'] ?? 0);
        if (!in_array($tipo, SEQ_TIPOS, true)) erro('Tipo de numeração inválido.');
        $atual = valor("SELECT proximo FROM sequencias WHERE tenant_id = ? AND tipo = ?", [$id, $tipo]);
        if ($atual === false) erro('Empresa não encontrada.', 404);
        if ($novo < (int) $atual) erro('O próximo número só pode aumentar (atual: ' . $atual . '), para não repetir números já usados.');
        q("UPDATE sequencias SET proximo = ? WHERE tenant_id = ? AND tipo = ?", [$novo, $id, $tipo]);
        auditar('sequencia_ajustar', 'sequencias', $id, "$tipo: $atual -> $novo");
        return empresa_com_resumo($id);
    },

    /* suporte: usuários de uma empresa (sem dados sensíveis) */
    'usuarios' => function ($d) {
        admin_plataforma();
        $id = (int) ($d['id'] ?? 0);
        if (!valor("SELECT id FROM tenants WHERE id = ?", [$id])) erro('Empresa não encontrada.', 404);
        return array_map(function ($u) {
            return ['id' => (int) $u['id'], 'nome' => $u['nome'], 'email' => $u['email'], 'perfil' => $u['perfil'],
                    'status' => $u['status'], 'ultimoAcesso' => $u['ultimo_acesso']];
        }, linhas("SELECT * FROM usuarios WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY perfil = 'admin' DESC, nome", [$id]));
    },

    /* suporte: senha temporária para alguém de uma empresa (troca obrigatória no próximo acesso) */
    'definir_senha' => function ($d) {
        admin_plataforma();
        $tid = (int) ($d['empresaId'] ?? 0);
        $uid = (int) ($d['usuarioId'] ?? 0);
        $senha = (string) ($d['senha'] ?? '');
        $u = linha("SELECT id, nome FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$uid, $tid]);
        if (!$u) erro('Usuário não encontrado.', 404);
        if (!senha_valida($senha)) erro('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
        q("UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ? AND tenant_id = ?",
          [password_hash($senha, PASSWORD_DEFAULT), $uid, $tid]);
        login_limpar('login:' . valor("SELECT email FROM usuarios WHERE id = ?", [$uid]));
        auditar('suporte_definir_senha', 'usuarios', $uid, $u['nome'], $tid);
        return true;
    },

    /* empresas que já existiam: copia o catálogo padrão se o dela estiver vazio */
    'copiar_catalogo' => function ($d) {
        admin_plataforma();
        $id = (int) ($d['id'] ?? 0);
        if (!valor("SELECT id FROM tenants WHERE id = ?", [$id])) erro('Empresa não encontrada.', 404);
        if ($id === CATALOGO_MODELO) erro('Esta é a empresa modelo: o catálogo dela é a origem da cópia.');
        if (array_sum(catalogo_contagem($id)) > 0) erro('Esta empresa já tem catálogo. A cópia só é feita em catálogo vazio, para não apagar preços ajustados.', 409);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $c = copiar_catalogo_modelo($id);
            $pdo->commit();
        } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
        auditar('catalogo_copiar', 'tenants', $id, "{$c['servicos']} serviços, {$c['materiais']} materiais, {$c['maquinas']} máquinas");
        return empresa_com_resumo($id);
    },

    /* ---------- v1.19.0: liberação de módulos ---------- */

    /* módulos com estágio e o que vale para cada empresa */
    'modulos' => function ($d) {
        admin_plataforma();
        try { $mods = linhas("SELECT * FROM modulos ORDER BY ordem, chave"); }
        catch (Throwable $e) { erro('Rode o SQL 13 (13_modulos_notificacoes.sql) para usar esta tela.', 409, 'SQL13'); }
        $emps = linhas("SELECT id, nome, ativo FROM tenants ORDER BY nome");
        $ov = [];
        foreach (linhas("SELECT tenant_id, modulo, ativo FROM tenant_modulos") as $r) $ov[$r['modulo']][(int) $r['tenant_id']] = (int) $r['ativo'];
        return [
            'empresas' => array_map(function ($e) { return ['id' => (int) $e['id'], 'nome' => $e['nome'], 'ativa' => (int) $e['ativo'] === 1]; }, $emps),
            'modulos'  => array_map(function ($m) use ($emps, $ov) {
                $porEmp = [];
                foreach ($emps as $e) {
                    $o = $ov[$m['chave']][(int) $e['id']] ?? null;
                    $porEmp[(int) $e['id']] = ['liberado' => modulo_efetivo($m['estagio'], $o), 'excecao' => $o !== null];
                }
                return ['chave' => $m['chave'], 'nome' => $m['nome'], 'descricao' => $m['descricao'], 'estagio' => $m['estagio'], 'empresas' => $porEmp];
            }, $mods),
        ];
    },

    /* {chave, estagio: desligado|teste|geral} */
    'modulo_estagio' => function ($d) {
        admin_plataforma();
        $ch = (string) ($d['chave'] ?? '');
        $est = (string) ($d['estagio'] ?? '');
        if (!in_array($est, ['desligado', 'teste', 'geral'], true)) erro('Estágio inválido.');
        $m = linha("SELECT * FROM modulos WHERE chave = ?", [$ch]);
        if (!$m) erro('Módulo não encontrado.', 404);
        q("UPDATE modulos SET estagio = ? WHERE chave = ?", [$est, $ch]);
        auditar('modulo_estagio', 'modulos', null, $ch . ': ' . $m['estagio'] . ' → ' . $est);
        return true;
    },

    /* {chave, empresaId, liberado: true|false} — guarda exceção só quando difere do estágio */
    'modulo_empresa' => function ($d) {
        admin_plataforma();
        $ch = (string) ($d['chave'] ?? '');
        $tid = (int) ($d['empresaId'] ?? 0);
        $m = linha("SELECT * FROM modulos WHERE chave = ?", [$ch]);
        if (!$m) erro('Módulo não encontrado.', 404);
        if (!valor("SELECT id FROM tenants WHERE id = ?", [$tid])) erro('Empresa não encontrada.', 404);
        if ($m['estagio'] === 'desligado') erro('Este módulo está desligado para todas as empresas. Mude o estágio primeiro.');
        $quer = !empty($d['liberado']);
        if ($quer === ($m['estagio'] === 'geral')) q("DELETE FROM tenant_modulos WHERE tenant_id = ? AND modulo = ?", [$tid, $ch]);
        else q("INSERT INTO tenant_modulos (tenant_id, modulo, ativo) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ativo = VALUES(ativo)", [$tid, $ch, $quer ? 1 : 0]);
        auditar('modulo_empresa', 'tenant_modulos', $tid, $ch . ($quer ? ' liberado' : ' bloqueado'), $tid);
        return true;
    },
];
