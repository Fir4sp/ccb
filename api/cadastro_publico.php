<?php
/* KONSTANTE SaaS — api/cadastro_publico.php  ·  formulário público de cadastro
   Usado só pela porta /saas/cadastro/api.php (sem login).
   A empresa é descoberta pelo código do link, nunca por um id vindo do navegador.
   Ações: empresa (dados para montar a página) e enviar (grava o cliente). */
if (!defined('KSAAS') || !defined('KPUB')) { http_response_code(403); exit; }

/* reaproveita so_digitos() e documento_formatado() do cadastro interno */
require_once __DIR__ . '/clientes.php';
require_once dirname(__DIR__) . '/nucleo/termos.php';   /* v1.14.0 */
require_once dirname(__DIR__) . '/nucleo/notificacoes.php';   /* v1.19.0 */

const CAD_MAX_ENVIOS_IP  = 5;    // cadastros por IP a cada 15 min
const CAD_MAX_CODIGOS_IP = 20;   // códigos errados por IP a cada 15 min

/* "Como conheceu?" — mesmos textos da origem do sistema, para o dashboard agrupar igual */
const CAD_ORIGENS = ['Pesquisa google', 'Indicação', 'Evento', 'Instagram', 'Linkedin', 'Facebook', 'Dep. Comercial'];

/* empresa dona do link, ou erro amigável */
function cad_empresa($codigo) {
    $chaveIp = 'cadcod:' . ip();
    if (login_bloqueado_seg($chaveIp) > 0) erro('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429, 'BLOQUEADO');
    $codigo = (string) $codigo;
    if (!preg_match('/^[a-f0-9]{24}$/', $codigo)) { login_falhou($chaveIp, CAD_MAX_CODIGOS_IP); erro('Link de cadastro inválido.', 404, 'LINK'); }
    $t = linha("SELECT t.* FROM config c JOIN tenants t ON t.id = c.tenant_id
                 WHERE c.chave = 'cadastro_codigo' AND c.valor = ? LIMIT 1", [json_encode($codigo)]);
    if (!$t) { login_falhou($chaveIp, CAD_MAX_CODIGOS_IP); erro('Este link de cadastro não existe mais. Peça um link novo à empresa.', 404, 'LINK'); }
    $ativo = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'cadastro_ativo'", [$t['id']]);
    if ((int) $t['ativo'] !== 1 || ($ativo !== false && (string) $ativo === '0')) {
        erro('O cadastro por este link está desativado no momento. Fale com a empresa.', 403, 'DESATIVADO');
    }
    return $t;
}

/* logo da empresa embutido na resposta (a pasta arquivos/ é protegida) */
function cad_logo($t) {
    if (empty($t['logo_anexo_id'])) return null;
    $a = linha("SELECT caminho, mime FROM anexos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL",
               [$t['logo_anexo_id'], $t['id']]);
    if (!$a || strpos((string) $a['mime'], 'image/') !== 0) return null;
    $arq = ARQUIVOS_DIR . '/' . $a['caminho'];
    if (!is_file($arq) || filesize($arq) > 1500000) return null;
    return 'data:' . $a['mime'] . ';base64,' . base64_encode(file_get_contents($arq));
}

function cad_cor($c, $padrao) { return is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c) ? $c : $padrao; }

/* v1.19.0: cliente novo pelo link → tarefa "fazer orçamento" + aviso no sino/celular.
   Configuração em Configurações › Link de cadastro (config cadastro_tarefa):
   {ativo, responsaveis:[ids] (vazio = administradores), prazoDias}. Sem o módulo Tarefas, só avisa. */
function cad_tarefa_orcamento($tid, $clienteId, $numero, $nome, $telefone, $origem, $msgCliente) {
    $cfg = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'cadastro_tarefa'", [$tid]);
    $cfg = $cfg ? (json_decode((string) $cfg, true) ?: []) : [];
    $ativo = !array_key_exists('ativo', $cfg) || !empty($cfg['ativo']);
    $resp = [];
    foreach ((array) ($cfg['responsaveis'] ?? []) as $x) if ((int) $x) $resp[] = (int) $x;
    if ($resp) {
        $in = implode(',', array_fill(0, count($resp), '?'));
        $resp = array_map('intval', array_column(linhas("SELECT id FROM usuarios WHERE tenant_id = ? AND status = 'ativo' AND excluido_em IS NULL AND perfil IN ('admin','coord','tecnico','comercial') AND id IN ($in)", array_merge([$tid], $resp)), 'id'));
    }
    if (!$resp) $resp = usuarios_escritorio($tid, true);
    $prazo = max(0, min(30, (int) ($cfg['prazoDias'] ?? 1)));
    $link = null;
    if ($ativo && modulo_liberado('tarefas', $tid)) {
        $desc = "Cliente novo cadastrado pelo link de cadastro. Entrar em contato e fazer o orçamento.\n"
              . "Telefone: " . $telefone . "\nComo conheceu: " . $origem
              . ($msgCliente !== '' ? "\nMensagem do cliente: " . $msgCliente : '')
              . "\n\nAo abrir um chamado para este cliente, esta tarefa é concluída sozinha.";
        q("INSERT INTO tarefas (tenant_id, titulo, descricao, tipo, cliente_id, data, prioridade, status, subtarefas, blocos)
           VALUES (?, ?, ?, 'orcamento_cadastro', ?, DATE_ADD(CURDATE(), INTERVAL ? DAY), 'alta', 'aberta', '[]', '[]')",
          [$tid, mb_substr('Novo cliente — fazer orçamento: ' . $nome, 0, 200), $desc, $clienteId, $prazo]);
        $tarefa = (int) db()->lastInsertId();
        foreach ($resp as $uid) q("INSERT INTO tarefa_responsaveis (tenant_id, tarefa_id, usuario_id) VALUES (?, ?, ?)", [$tid, $tarefa, $uid]);
        if ($resp) q("UPDATE tarefas SET responsavel_id = ? WHERE id = ? AND tenant_id = ?", [$resp[0], $tarefa, $tid]);
        $link = 'tarefa:' . $tarefa;
    }
    notificar($tid, $resp, 'Novo cliente pelo link de cadastro',
        $numero . ' · ' . $nome . ' · ' . $telefone . ($link ? ' — tarefa de orçamento criada' : ''), $link, 'cadastro');
}

return [

    /* {c} → nome, cores, logo e contato da empresa */
    'empresa' => function ($d) {
        $t = cad_empresa($d['c'] ?? '');
        $emp = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'empresa'", [$t['id']]);
        $emp = $emp ? (json_decode((string) $emp, true) ?: []) : [];
        return [
            'nome'          => ($emp['nome'] ?? '') !== '' ? $emp['nome'] : $t['nome'],
            'corPrimaria'   => cad_cor($t['cor_primaria'], '#0b1730'),
            'corSecundaria' => cad_cor($t['cor_secundaria'], '#1f6feb'),
            'logo'          => cad_logo($t),
            'telefone'      => $emp['telefone'] ?? null,
            'email'         => $emp['email'] ?? null,
            'site'          => $emp['site'] ?? null,
            'origens'       => CAD_ORIGENS,
        ];
    },

    /* {c, cliente:{...}, site (armadilha para robôs)} */
    'enviar' => function ($d) {
        $t = cad_empresa($d['c'] ?? '');
        $tid = (int) $t['id'];

        $chaveIp = 'cadastro:' . ip();
        if (login_bloqueado_seg($chaveIp) > 0) erro('Recebemos vários cadastros deste aparelho. Aguarde 15 minutos e tente de novo.', 429, 'BLOQUEADO');

        /* campo escondido preenchido = robô: finge que deu certo e não grava nada */
        if (txt($d['site'] ?? '', 200) !== '') return ['recebido' => true];

        $c = is_array($d['cliente'] ?? null) ? $d['cliente'] : [];
        $tipo = ($c['tipoPessoa'] ?? 'PJ') === 'PF' ? 'PF' : 'PJ';
        $nome = txt($c['nome'] ?? '', 200);
        if (mb_strlen($nome) < 3) erro($tipo === 'PJ' ? 'Informe a razão social ou o nome da empresa.' : 'Informe seu nome completo.');
        if (so_digitos($c['documento'] ?? '') === '') erro('Informe o ' . ($tipo === 'PJ' ? 'CNPJ.' : 'CPF.'));
        $documento = documento_formatado($c['documento'] ?? '', $tipo);
        $telefone = txt($c['telefone'] ?? '', 30);
        if (strlen(so_digitos($telefone)) < 10) erro('Informe um telefone com DDD.');
        $email = mb_strtolower(txt($c['email'] ?? '', 190));
        if ($email !== '' && !email_valido($email)) erro('E-mail inválido.');

        if (valor("SELECT id FROM clientes WHERE tenant_id = ? AND documento = ? AND excluido_em IS NULL", [$tid, $documento])) {
            erro('Já temos um cadastro com este ' . ($tipo === 'PJ' ? 'CNPJ' : 'CPF') . '. Se precisar atualizar algum dado, fale com a empresa.', 409, 'DUPLICADO');
        }

        /* endereço montado em uma linha, como no cadastro interno */
        $e = is_array($c['endereco'] ?? null) ? $c['endereco'] : [];
        $p = function ($k, $max = 120) use ($e) { return txt($e[$k] ?? '', $max); };
        $rua = trim($p('logradouro') . ($p('numero', 20) !== '' ? ', ' . $p('numero', 20) : '') . ($p('complemento') !== '' ? ' - ' . $p('complemento') : ''));
        $cidade = trim($p('cidade') . ($p('uf', 2) !== '' ? '/' . mb_strtoupper($p('uf', 2)) : ''));
        $partes = array_values(array_filter([$rua, $p('bairro'), $cidade, $p('cep', 9) !== '' ? 'CEP ' . $p('cep', 9) : ''], 'strlen'));
        $endereco = $partes ? mb_substr(implode(' - ', $partes), 0, 255) : null;

        /* v1.14.0: aceite da Política de Privacidade (LGPD) */
        if (empty($d['aceitePrivacidade'])) erro('Para enviar, marque que leu e concorda com a Política de Privacidade.');

        $origem = txt($c['origem'] ?? '', 60);
        if (!in_array($origem, CAD_ORIGENS, true)) erro('Conte para nós como conheceu a empresa.');

        $contato = txt($c['contato'] ?? '', 150);
        $cargo = txt($c['cargo'] ?? '', 80);
        $obs = 'Cadastro recebido pelo formulário público em ' . valor("SELECT DATE_FORMAT(NOW(), '%d/%m/%Y %H:%i')") . '.';   // hora do banco (Brasília)
        if ($cargo !== '') $obs .= "\nCargo do contato: " . $cargo;
        $msg = txt($c['obs'] ?? '', 2000);
        if ($msg !== '') $obs .= "\nObservação do cliente: " . $msg;

        $campos = [
            'tenant_id'   => $tid,
            'nome'        => $nome,
            'tipo_pessoa' => $tipo,
            'documento'   => $documento,
            'contato'     => $contato === '' ? null : $contato,
            'email'       => $email === '' ? null : $email,
            'telefone'    => $telefone,
            'endereco'    => $endereco,
            'origem'      => $origem,
            'situacao'    => 'novo',
            'obs'         => $obs,
        ];

        db()->beginTransaction();
        $campos['numero'] = numero_livre('cliente', 'clientes', $tid);
        $cols = implode(', ', array_keys($campos));
        $ph   = implode(', ', array_fill(0, count($campos), '?'));
        q("INSERT INTO clientes ($cols) VALUES ($ph)", array_values($campos));
        $id = (int) db()->lastInsertId();
        db()->commit();

        login_falhou($chaveIp, CAD_MAX_ENVIOS_IP);   // conta o envio para o limite por IP
        try { cad_tarefa_orcamento($tid, $id, $campos['numero'], $nome, $telefone, $origem, $msg); }
        catch (Throwable $x) { error_log('[KSAAS cadastro→tarefa] ' . $x->getMessage()); }   /* o cadastro já foi gravado */
        try {
            q("INSERT INTO auditoria (tenant_id, usuario_id, acao, tabela, registro_id, resumo, ip) VALUES (?, NULL, ?, 'clientes', ?, ?, ?)",
              [$tid, 'cliente_criar_formulario', $id, mb_substr($campos['numero'] . ' ' . $nome . ' · aceitou a Política de Privacidade (versão ' . (defined('TERMOS_VERSAO') ? TERMOS_VERSAO : '2026-10-04') . ')', 0, 500), ip()]);
        } catch (Throwable $x) { /* auditoria nunca derruba a ação */ }

        return ['recebido' => true];
    },
];
