<?php
/* =====================================================================
   SGClim — api/indique_publico.php  ·  programa de indicação (v1.33.0)
   Porta pública cadastro/api.php (sem login), usada pela página
   sgclim.xclim.com.br/indique/:
     indique.regra      → comissão padrão e quanto rende por plano
     indique.cadastrar  → a própria pessoa se cadastra como indicador
                          (dados, chave Pix e aceite do regulamento) e
                          já recebe o código e o link de indicação
     indique.consultar  → CPF/CNPJ + WhatsApp: link, empresas e comissões
   A comissão segue a regra padrão do Console (hoje 10% das 3 primeiras
   faturas pagas). Eneas pode desativar ou editar no Console › Indicações.
   ===================================================================== */
if (!defined('KSAAS') || !defined('KPUB')) { http_response_code(403); exit; }
require_once dirname(__DIR__) . '/nucleo/email.php';
require_once dirname(__DIR__) . '/nucleo/notificacoes.php';

const IND_MAX_CADASTROS_IP = 5;    // cadastros por IP a cada 15 min
const IND_MAX_CONSULTAS_IP = 12;   // consultas erradas por IP a cada 15 min
const IND_ATUACOES = ['Vendedor de loja de materiais', 'Técnico ou instalador', 'Engenheiro ou projetista', 'Representante comercial',
                      'Cliente do SGClim', 'Contador ou consultor', 'Outro'];
const IND_PIX_TIPOS = ['cpf', 'cnpj', 'celular', 'email', 'aleatoria'];

function ind_exigir() {
    if (!indicacao_tabelas_ok() || !indicacao_sql34_ok())
        erro('O programa de indicação está sendo preparado. Tente de novo mais tarde.', 503, 'SEM_SQL');
}

function ind_digitos($s) { return preg_replace('/\D+/', '', (string) $s); }

function ind_cpf_ok($c) {
    if (strlen($c) !== 11 || preg_match('/^(\d)\1{10}$/', $c)) return false;
    for ($t = 9; $t < 11; $t++) {
        $s = 0;
        for ($i = 0; $i < $t; $i++) $s += (int) $c[$i] * (($t + 1) - $i);
        if ((int) $c[$t] !== ((10 * $s) % 11) % 10) return false;
    }
    return true;
}

function ind_cnpj_ok($c) {
    if (strlen($c) !== 14 || preg_match('/^(\d)\1{13}$/', $c)) return false;
    foreach ([12, 13] as $t) {
        $s = 0; $p = $t - 7;
        for ($i = 0; $i < $t; $i++) { $s += (int) $c[$i] * $p--; if ($p < 2) $p = 9; }
        $dv = $s % 11 < 2 ? 0 : 11 - $s % 11;
        if ((int) $c[$t] !== $dv) return false;
    }
    return true;
}

function ind_doc_fmt($d) {
    return strlen($d) === 11 ? substr($d, 0, 3) . '.' . substr($d, 3, 3) . '.' . substr($d, 6, 3) . '-' . substr($d, 9, 2)
         : substr($d, 0, 2) . '.' . substr($d, 2, 3) . '.' . substr($d, 5, 3) . '/' . substr($d, 8, 4) . '-' . substr($d, 12, 2);
}

/* celular sem o 55 do país: 11 ou 10 dígitos com DDD */
function ind_tel($s) {
    $d = ind_digitos($s);
    if (strlen($d) > 11 && substr($d, 0, 2) === '55') $d = substr($d, 2);
    return $d;
}

function ind_tel_fmt($d) {
    return strlen($d) === 11 ? '(' . substr($d, 0, 2) . ') ' . substr($d, 2, 5) . '-' . substr($d, 7)
                             : '(' . substr($d, 0, 2) . ') ' . substr($d, 2, 4) . '-' . substr($d, 6);
}

/* busca pelo CPF/CNPJ só com números, qualquer que seja a máscara gravada */
function ind_por_doc($doc) {
    return linha("SELECT * FROM indicadores WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(documento,''), '.', ''), '-', ''), '/', ''), ' ', '') = ? ORDER BY id LIMIT 1", [$doc]);
}

function ind_link($codigo) { return url_sistema() . 'conheca/?i=' . rawurlencode($codigo); }

/* quanto a comissão padrão rende por empresa em cada plano à venda (preço de lançamento, se houver) */
function ind_exemplos($regra) {
    $out = [];
    try {
        foreach (linhas("SELECT * FROM planos WHERE ativo = 1 ORDER BY ordem, preco_mensal") as $p) {
            $pub = plano_publico($p);
            $mensal = $pub['precoMensal'];   /* v1.35.0: preço cheio (sem preço de lançamento) */
            $porMes = round($mensal * $regra['percentual'] / 100, 2);
            $out[] = ['plano' => $p['nome'], 'mensalidade' => $mensal, 'porMes' => $porMes,
                      'total' => $regra['meses'] > 0 ? round($porMes * $regra['meses'], 2) : null];
        }
    } catch (Throwable $e) {}
    return $out;
}

/* dados que o indicador vê sobre ele mesmo */
function ind_painel($i) {
    $id = (int) $i['id'];
    $emp = linhas("SELECT t.nome, v.criado_em FROM assinatura_vinculos v JOIN tenants t ON t.id = v.tenant_id WHERE v.indicador_id = ? ORDER BY v.criado_em DESC", [$id]);
    $pedidos = 0;
    try {
        $pedidos = (int) valor("SELECT COUNT(*) FROM cadastro_codigos cc JOIN plat_cadastros pc ON pc.id = cc.cadastro_id
                                 WHERE cc.codigo = ? AND pc.status = 'pendente'", [$i['codigo']]);
    } catch (Throwable $e) {}
    $com = linhas("SELECT c.valor, c.status, c.pago_em, c.criado_em, t.nome AS empresa, ac.vencimento
                     FROM comissoes c JOIN tenants t ON t.id = c.tenant_id LEFT JOIN assinatura_cobrancas ac ON ac.id = c.cobranca_id
                    WHERE c.indicador_id = ? AND c.status <> 'cancelada' ORDER BY COALESCE(ac.vencimento, c.criado_em) DESC LIMIT 120", [$id]);
    $tot = ['pendente' => 0, 'paga' => 0];
    foreach ($com as $c) $tot[$c['status']] = round(($tot[$c['status']] ?? 0) + (float) $c['valor'], 2);
    $pix = (string) $i['pix'];
    $pixMask = mb_strlen($pix) > 6 ? mb_substr($pix, 0, 3) . str_repeat('•', max(3, mb_strlen($pix) - 6)) . mb_substr($pix, -3) : $pix;
    return [
        'nome' => $i['nome'], 'codigo' => $i['codigo'], 'link' => ind_link($i['codigo']), 'ativo' => (int) $i['ativo'] === 1,
        'regra' => indicacao_regra_txt($i), 'pix' => $pixMask,
        'empresas' => array_map(function ($e) { return ['nome' => $e['nome'], 'desde' => substr((string) $e['criado_em'], 0, 10)]; }, $emp),
        'pedidosEmAnalise' => $pedidos,
        'comissoes' => array_map(function ($c) {
            return ['empresa' => $c['empresa'], 'fatura' => $c['vencimento'] ?: substr((string) $c['criado_em'], 0, 10), 'valor' => (float) $c['valor'],
                    'status' => $c['status'], 'pagoEm' => $c['pago_em']];
        }, $com),
        'aReceber' => $tot['pendente'], 'recebido' => $tot['paga'],
    ];
}

return [

    'regra' => function ($d) {
        $r = indicacao_padrao();
        $falsa = ['tipo' => 'percentual', 'percentual' => $r['percentual'], 'meses' => $r['meses'], 'valor_fixo' => 0];
        return ['percentual' => $r['percentual'], 'meses' => $r['meses'], 'texto' => indicacao_regra_txt($falsa),
                'exemplos' => ind_exemplos($r), 'aberto' => indicacao_tabelas_ok() && indicacao_sql34_ok(), 'atuacoes' => IND_ATUACOES];
    },

    /* {nome, documento, telefone, email, cidade, atuacao, pixTipo, pix, aceite, site (honeypot)} */
    'cadastrar' => function ($d) {
        ind_exigir();
        $chave = 'ind:' . ip();
        if (login_bloqueado_seg($chave) > 0) erro('Muitos cadastros seguidos deste aparelho. Aguarde alguns minutos e tente de novo.', 429, 'BLOQUEADO');
        if (trim((string) ($d['site'] ?? '')) !== '') return ['ok' => true];   /* robô */

        $nome = txt($d['nome'] ?? '', 150);
        $doc = ind_digitos($d['documento'] ?? '');
        $tel = ind_tel($d['telefone'] ?? '');
        $email = mb_strtolower(txt($d['email'] ?? '', 190));
        $cidade = txt_ou_null($d['cidade'] ?? '', 120);
        $atuacao = txt($d['atuacao'] ?? '', 60);
        $pixTipo = (string) ($d['pixTipo'] ?? '');
        $pix = trim((string) ($d['pix'] ?? ''));

        if (mb_strlen($nome) < 5 || strpos($nome, ' ') === false) erro('Informe o nome completo.');
        if (!(strlen($doc) === 11 ? ind_cpf_ok($doc) : (strlen($doc) === 14 && ind_cnpj_ok($doc)))) erro('Informe um CPF ou CNPJ válido.');
        if (strlen($tel) < 10 || strlen($tel) > 11) erro('Informe o WhatsApp com DDD.');
        if (!email_valido($email)) erro('Informe um e-mail válido.');
        if (!in_array($atuacao, IND_ATUACOES, true)) erro('Escolha como você atua.');
        if (!in_array($pixTipo, IND_PIX_TIPOS, true)) erro('Escolha o tipo da chave Pix.');

        /* chave Pix conferida pelo tipo; CPF/CNPJ precisa ser o mesmo do cadastro (titular) */
        if ($pixTipo === 'cpf' || $pixTipo === 'cnpj') {
            $p = ind_digitos($pix);
            if ($p !== $doc || strlen($p) !== ($pixTipo === 'cpf' ? 11 : 14)) erro('A chave Pix ' . strtoupper($pixTipo) . ' precisa ser o mesmo ' . strtoupper($pixTipo) . ' informado no cadastro.');
            $pix = ind_doc_fmt($p);
        } elseif ($pixTipo === 'celular') {
            $p = ind_tel($pix);
            if (strlen($p) !== 11) erro('Informe a chave Pix de celular com DDD (11 números).');
            $pix = '+55' . $p;
        } elseif ($pixTipo === 'email') {
            $pix = mb_strtolower($pix);
            if (!email_valido($pix)) erro('A chave Pix de e-mail não parece válida.');
        } else {
            $pix = mb_strtolower($pix);
            if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $pix)) erro('A chave aleatória tem 32 letras e números separados por traços (copie do app do banco).');
        }
        if (empty($d['aceite'])) erro('Para continuar, leia e aceite o regulamento do programa.');

        if (ind_por_doc($doc)) erro('Este CPF/CNPJ já está cadastrado no programa. Use "Já sou indicador" para ver o seu link.', 409, 'JA_CADASTRADO');
        if (valor("SELECT id FROM indicadores WHERE email = ?", [$email])) erro('Este e-mail já está cadastrado no programa. Use "Já sou indicador" para ver o seu link.', 409, 'JA_CADASTRADO');

        $r = indicacao_padrao();
        $codigo = codigo_gerar($nome);
        q("INSERT INTO indicadores (nome, telefone, email, pix, pix_tipo, documento, cidade, atuacao, codigo, tipo, percentual, meses, valor_fixo, ativo,
                                    observacao, origem, aceite_em, aceite_ip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'percentual', ?, ?, 0, 1, NULL, 'formulario', NOW(), ?)",
          [$nome, ind_tel_fmt($tel), $email, $pix, $pixTipo, ind_doc_fmt($doc), $cidade, $atuacao, $codigo, $r['percentual'], $r['meses'], ip()]);
        $id = (int) db()->lastInsertId();
        login_falhou($chave, IND_MAX_CADASTROS_IP);   /* conta o cadastro no limite por IP */
        auditar('indicador_cadastro_publico', 'indicadores', $id, $nome . ' · ' . $codigo);

        $i = linha("SELECT * FROM indicadores WHERE id = ?", [$id]);
        $link = ind_link($codigo);
        $e = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
        enviar_email($email, 'Seu link de indicação do SGClim', email_modelo('Bem-vindo ao programa, ' . explode(' ', $nome)[0] . '!',
            '<p>Seu código é <b style="font-size:18px">' . $e($codigo) . '</b>.</p>' .
            '<p>Seu link: <a href="' . $e($link) . '">' . $e($link) . '</a></p>' .
            '<p>Mande o link para empresas de climatização. Quem pedir acesso por ele (ou digitar o seu código) fica ligado a você.</p>' .
            '<p><b>Sua comissão:</b> ' . $e(indicacao_regra_txt($i)) . ', paga por Pix na chave ' . $e($pix) . '.</p>' .
            '<p>Para acompanhar empresas e comissões: <a href="' . $e(url_sistema() . 'indique/') . '">' . $e(url_sistema() . 'indique/') . '</a> › "Já sou indicador".</p>'));
        enviar_email(mail_aviso(), 'Novo indicador: ' . $nome, email_modelo('Novo indicador cadastrado',
            '<p><b>' . $e($nome) . '</b> · ' . $e($atuacao) . ($cidade ? ' · ' . $e($cidade) : '') . '<br>' . $e(ind_tel_fmt($tel)) . ' · ' . $e($email) . '<br>' .
            'Código <b>' . $e($codigo) . '</b> · Pix (' . $e($pixTipo) . ') ' . $e($pix) . '</p>' .
            '<p>Já está ativo com a regra padrão. Para desativar ou mudar a comissão: Console › Indicações e cupons.</p>'));
        try {
            foreach (linhas("SELECT u.id, u.tenant_id FROM usuarios u JOIN plataforma_admins a ON a.email = u.email AND a.status = 'ativo'
                              WHERE u.status = 'ativo' AND u.excluido_em IS NULL") as $u)
                notificar((int) $u['tenant_id'], [(int) $u['id']], 'Novo indicador do SGClim', $nome . ' · ' . $atuacao, 'url:' . BASE_PATH . 'plataforma/', 'indicador');
        } catch (Throwable $x) {}
        return ind_painel($i) + ['novo' => true];
    },

    /* {documento, telefone} — o indicador vê o próprio link, empresas e comissões */
    'consultar' => function ($d) {
        ind_exigir();
        $chave = 'indc:' . ip();
        if (login_bloqueado_seg($chave) > 0) erro('Muitas tentativas. Aguarde 15 minutos e tente de novo.', 429, 'BLOQUEADO');
        $doc = ind_digitos($d['documento'] ?? '');
        $tel = ind_tel($d['telefone'] ?? '');
        $i = (strlen($doc) === 11 || strlen($doc) === 14) ? ind_por_doc($doc) : null;
        if (!$i || ind_tel($i['telefone']) !== $tel) {
            login_falhou($chave, IND_MAX_CONSULTAS_IP);
            erro('Não encontramos um indicador com esse CPF/CNPJ e WhatsApp. Confira os dados ou fale com eneas@xclim.com.br.', 404, 'NAO_ENCONTRADO');
        }
        return ind_painel($i);
    },
];
