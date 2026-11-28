<?php
/* =====================================================================
   SGClim — api/solicitacao_publica.php  ·  solicitação de serviço pelo link (v1.39.0)
   Porta pública cadastro/api.php (sem login), página solicitar/?c=CÓDIGO.
   Para quem já foi atendido mas não tem contrato: informa o nome (empresa ou pessoa),
   um contato e o que precisa → abre uma TAREFA "Solicitação pelo link" para a equipe.
     • A empresa é descoberta pelo código do link de cadastro (o mesmo de cadastro/?c=),
       mas o formulário tem liga/desliga próprio (config solicitacao_ativo, começa DESLIGADO).
     • Não vincula a nenhum cliente: a conferência é manual. A tarefa indica, só para a equipe,
       clientes com nome ou telefone parecido. Nada disso volta para quem preencheu (LGPD).
     • Tipo próprio ("Solicitação pelo link"), que nunca aparece na área do cliente — diferente
       de "Solicitação do cliente", cujo texto e comentários o cliente vê no portal.
     • Segurança: limite por IP, campo-armadilha (site), tamanho máximo dos textos,
       resposta só {recebido:true}.
   ===================================================================== */
if (!defined('KSAAS') || !defined('KPUB')) { http_response_code(403); exit; }

require_once dirname(__DIR__) . '/nucleo/notificacoes.php';

const SOL_TIPO_TAREFA  = 'Solicitação pelo link';
const SOL_MAX_ENVIOS_IP  = 5;    // solicitações por IP a cada 15 min
const SOL_MAX_CODIGOS_IP = 20;   // códigos errados por IP a cada 15 min

function sol_empresa($codigo) {
    $chaveIp = 'solcod:' . ip();
    if (login_bloqueado_seg($chaveIp) > 0) erro('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429, 'BLOQUEADO');
    $codigo = (string) $codigo;
    if (!preg_match('/^[a-f0-9]{24}$/', $codigo)) { login_falhou($chaveIp, SOL_MAX_CODIGOS_IP); erro('Link de solicitação inválido.', 404, 'LINK'); }
    $t = linha("SELECT t.* FROM config c JOIN tenants t ON t.id = c.tenant_id
                 WHERE c.chave = 'cadastro_codigo' AND c.valor = ? LIMIT 1", [json_encode($codigo)]);
    if (!$t) { login_falhou($chaveIp, SOL_MAX_CODIGOS_IP); erro('Este link não existe mais. Peça um link novo à empresa.', 404, 'LINK'); }
    $ativo = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'solicitacao_ativo'", [$t['id']]);
    if ((int) $t['ativo'] !== 1 || (string) $ativo !== '1' || !modulo_liberado('tarefas', (int) $t['id']))
        erro('O formulário de solicitação está desligado no momento. Fale com a empresa.', 403, 'DESATIVADO');
    return $t;
}

function sol_logo($t) {
    if (empty($t['logo_anexo_id'])) return null;
    $a = linha("SELECT caminho, mime FROM anexos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$t['logo_anexo_id'], $t['id']]);
    if (!$a || strpos((string) $a['mime'], 'image/') !== 0) return null;
    $arq = ARQUIVOS_DIR . '/' . $a['caminho'];
    if (!is_file($arq) || filesize($arq) > 1500000) return null;
    return 'data:' . $a['mime'] . ';base64,' . base64_encode(file_get_contents($arq));
}
function sol_cor($c, $padrao) { return is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c) ? $c : $padrao; }

/* nome sem acento, minúsculo e sem as palavras que não identificam (ltda, me, condomínio…) */
function sol_normalizar($s) {
    $s = mb_strtolower((string) $s, 'UTF-8');
    $s = strtr($s, ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','ä'=>'a','é'=>'e','è'=>'e','ê'=>'e','ë'=>'e','í'=>'i','ì'=>'i','î'=>'i','ï'=>'i',
                    'ó'=>'o','ò'=>'o','ô'=>'o','õ'=>'o','ö'=>'o','ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n']);
    $s = preg_replace('/[^a-z0-9 ]+/', ' ', $s);
    $fora = ['ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'cia', 'de', 'da', 'do', 'das', 'dos', 'e', 'condominio', 'cond', 'edificio', 'ed', 'residencial', 'empresa', 'comercio', 'servicos'];
    $p = array_values(array_filter(preg_split('/\s+/', trim($s)), function ($w) use ($fora) { return $w !== '' && !in_array($w, $fora, true); }));
    return $p;
}

/* clientes com nome ou telefone parecido — SÓ para a equipe (vai na tarefa, nunca na resposta) */
function sol_parecidos($tid, $nome, $telefone) {
    $achados = [];
    $tel = preg_replace('/\D/', '', (string) $telefone);
    if (strlen($tel) >= 8) {
        $fim = substr($tel, -8);
        foreach (linhas("SELECT id, numero, nome, telefone FROM clientes WHERE tenant_id = ? AND excluido_em IS NULL AND telefone IS NOT NULL AND telefone <> '' LIMIT 5000", [$tid]) as $c)
            if (substr(preg_replace('/\D/', '', (string) $c['telefone']), -8) === $fim) $achados[(int) $c['id']] = ['c' => $c, 'por' => 'mesmo telefone'];
    }
    $pal = sol_normalizar($nome);
    if ($pal) {
        $alvo = implode(' ', $pal);
        $longas = array_values(array_filter($pal, function ($w) { return strlen($w) >= 3; }));
        usort($longas, function ($a, $b) { return strlen($b) - strlen($a); });
        $cands = [];
        foreach (array_slice($longas, 0, 3) as $w)
            foreach (linhas("SELECT id, numero, nome, telefone FROM clientes WHERE tenant_id = ? AND excluido_em IS NULL AND nome LIKE ? LIMIT 200", [$tid, '%' . $w . '%']) as $c) $cands[(int) $c['id']] = $c;
        foreach ($cands as $id => $c) {
            if (isset($achados[$id])) continue;
            $outro = implode(' ', sol_normalizar($c['nome']));
            if ($outro === '') continue;
            similar_text($alvo, $outro, $pct);
            $contido = strlen($alvo) >= 4 && (strpos($outro, $alvo) !== false || strpos($alvo, $outro) !== false);
            if ($pct >= 70 || $contido) $achados[$id] = ['c' => $c, 'por' => 'nome parecido', 'pct' => $contido ? 100 : $pct];
        }
    }
    uasort($achados, function ($a, $b) { return ($a['por'] === 'mesmo telefone' ? 200 : ($a['pct'] ?? 0)) < ($b['por'] === 'mesmo telefone' ? 200 : ($b['pct'] ?? 0)) ? 1 : -1; });
    return array_slice(array_values($achados), 0, 5);
}

return [

    /* {c} → nome, cores, logo e contato da empresa (o mesmo que o link de cadastro mostra) */
    'empresa' => function ($d) {
        $t = sol_empresa($d['c'] ?? '');
        $emp = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'empresa'", [$t['id']]);
        $emp = $emp ? (json_decode((string) $emp, true) ?: []) : [];
        return [
            'nome' => ($emp['nome'] ?? '') !== '' ? $emp['nome'] : $t['nome'],
            'corPrimaria' => sol_cor($t['cor_primaria'], '#0b1730'), 'corSecundaria' => sol_cor($t['cor_secundaria'], '#1f6feb'),
            'logo' => sol_logo($t), 'telefone' => $emp['telefone'] ?? null, 'email' => $emp['email'] ?? null,
        ];
    },

    /* {c, nome, telefone, email?, endereco?, mensagem, aceitePrivacidade, site (armadilha)} */
    'enviar' => function ($d) {
        $t = sol_empresa($d['c'] ?? '');
        $tid = (int) $t['id'];
        $chaveIp = 'solicitacao:' . ip();
        if (login_bloqueado_seg($chaveIp) > 0) erro('Recebemos várias solicitações deste aparelho. Aguarde 15 minutos e tente de novo.', 429, 'BLOQUEADO');
        if (txt($d['site'] ?? '', 200) !== '') return ['recebido' => true];   /* robô: finge que deu certo e não grava */

        $nome = txt($d['nome'] ?? '', 150);
        $telefone = txt($d['telefone'] ?? '', 30);
        $email = mb_strtolower(txt($d['email'] ?? '', 190));
        $endereco = txt($d['endereco'] ?? '', 255);
        $msg = txt($d['mensagem'] ?? '', 2000);
        if (mb_strlen($nome) < 3) erro('Informe o nome da empresa ou o seu nome.');
        if (strlen(preg_replace('/\D/', '', $telefone)) < 10) erro('Informe um telefone ou WhatsApp com DDD.');
        if ($email !== '' && !email_valido($email)) erro('Confira o e-mail.');
        if (mb_strlen($msg) < 5) erro('Conte o que você precisa.');
        if (empty($d['aceitePrivacidade'])) erro('Para enviar, marque que leu e concorda com a Política de Privacidade.');
        login_falhou($chaveIp, SOL_MAX_ENVIOS_IP);   /* conta o envio no limite por IP */

        $quando = valor("SELECT DATE_FORMAT(NOW(), '%d/%m/%Y %H:%i')");
        $desc = "O que precisa:\n" . $msg . "\n\nQuem pediu: " . $nome . "\nTelefone/WhatsApp: " . $telefone
              . ($email !== '' ? "\nE-mail: " . $email : '') . ($endereco !== '' ? "\nEndereço informado: " . $endereco : '')
              . "\n\nRecebida pelo formulário público de solicitação em " . $quando . '. Não está ligada a nenhum cliente: confira o cadastro antes de atender.';
        $par = [];
        try { $par = sol_parecidos($tid, $nome, $telefone); } catch (Throwable $x) {}
        $desc .= "\n\n— Só para a equipe —\n" . ($par
            ? "Possível cliente já cadastrado:\n" . implode("\n", array_map(function ($x) { return '• Cliente ' . $x['c']['numero'] . ' · ' . $x['c']['nome'] . ' (' . $x['por'] . ')'; }, $par))
            : 'Nenhum cliente cadastrado com nome ou telefone parecido.');

        $resp = usuarios_escritorio($tid);
        db()->beginTransaction();
        q("INSERT INTO tarefas (tenant_id, titulo, descricao, tipo, cliente_id, endereco, data, prioridade, status, subtarefas, blocos)
           VALUES (?, ?, ?, ?, NULL, ?, CURDATE(), 'alta', 'aberta', '[]', '[]')",
          [$tid, mb_substr('Solicitação pelo link: ' . $nome, 0, 200), $desc, SOL_TIPO_TAREFA, $endereco !== '' ? $endereco : null]);
        $id = (int) db()->lastInsertId();
        foreach ($resp as $uid) q("INSERT INTO tarefa_responsaveis (tenant_id, tarefa_id, usuario_id) VALUES (?, ?, ?)", [$tid, $id, $uid]);
        if ($resp) q("UPDATE tarefas SET responsavel_id = ? WHERE id = ? AND tenant_id = ?", [$resp[0], $id, $tid]);
        db()->commit();
        try { notificar($tid, $resp, 'Nova solicitação pelo link', $nome . ' · ' . $telefone, 'tarefa:' . $id, 'cadastro'); } catch (Throwable $x) {}
        try {
            q("INSERT INTO auditoria (tenant_id, usuario_id, acao, tabela, registro_id, resumo, ip) VALUES (?, NULL, 'solicitacao_link', 'tarefas', ?, ?, ?)",
              [$tid, $id, mb_substr($nome . ' · aceitou a Política de Privacidade', 0, 500), ip()]);
        } catch (Throwable $x) {}
        return ['recebido' => true];
    },
];
