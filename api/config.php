<?php
/* KONSTANTE SaaS — api/config.php  ·  configurações, tema e logo da empresa */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once dirname(__DIR__) . '/nucleo/anexos.php';

/* chaves aceitas e o tipo de cada uma */
const CONFIG_CHAVES = [
    'aliquota'          => 'numero',   // % de imposto
    'rt_padrao'         => 'numero',   // % de RT
    'validade_orcamento'=> 'numero',   // dias
    'markup_materiais'  => 'numero',   // % somado ao pacote de materiais do orçamento
    'empresa'           => 'json',     // dados que saem no PDF
    'textos_pdf'        => 'json',     // condições, garantia, rodapé
    'checklists_os'     => 'json',
    'tipos_servico'     => 'json',     // CCB v2: [{nome, seguranca}] — tipos do chamado; seguranca = exige parecer da Segurança do Trabalho
    'alcadas'           => 'json',     // CCB v2: {coord: 500, gestao: 1000} — acima de gestao, Procurador
    'normas_pmoc'       => 'json',
    'modelos_contrato'  => 'json',     // v1.15.0: modelos (minutas) de contrato
    'cadastro_tarefa'   => 'json',     // v1.19.0: tarefa automática do link de cadastro {ativo, responsaveis, prazoDias}
];

function ler_config($tid) {
    $out = [];
    foreach (linhas("SELECT chave, valor FROM config WHERE tenant_id = ?", [$tid]) as $r) {
        $tipo = CONFIG_CHAVES[$r['chave']] ?? 'texto';
        if ($tipo === 'numero')      $out[$r['chave']] = (float) $r['valor'];
        elseif ($tipo === 'json')    $out[$r['chave']] = json_decode((string) $r['valor'], true);
        else                         $out[$r['chave']] = $r['valor'];
    }
    return $out;
}

/* ---- link público de cadastro de clientes (pasta cadastro/) ----
   Guardado em config: cadastro_codigo (código aleatório, em JSON) e
   cadastro_ativo (1/0). Não entram em CONFIG_CHAVES: só mudam pelas
   ações próprias abaixo, nunca pelo config.salvar. */
function cadastro_link($tid) {
    $cod = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'cadastro_codigo'", [$tid]);
    $cod = $cod === false ? null : json_decode((string) $cod, true);
    if (!is_string($cod) || $cod === '') $cod = cadastro_gravar_codigo($tid);
    $ativo = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'cadastro_ativo'", [$tid]);
    $ativo = $ativo === false ? true : ((string) $ativo !== '0');
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $host = preg_replace('/[^A-Za-z0-9.\-:]/', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
    /* v1.39.0: formulário de solicitação de serviço (solicitar/?c=) — mesmo código, liga/desliga próprio, começa desligado */
    $solAtivo = (string) valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'solicitacao_ativo'", [$tid]) === '1';
    $base = ($https ? 'https://' : 'http://') . $host . BASE_PATH;
    return ['codigo' => $cod, 'ativo' => $ativo, 'url' => $base . 'cadastro/?c=' . $cod,
            'solicitacaoAtivo' => $solAtivo, 'solicitacaoUrl' => $base . 'solicitar/?c=' . $cod];
}
function cadastro_gravar_codigo($tid) {
    $cod = bin2hex(random_bytes(12));
    q("INSERT INTO config (tenant_id, chave, valor) VALUES (?, 'cadastro_codigo', ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [$tid, json_encode($cod)]);
    return $cod;
}

function cor_valida($c) { return is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c); }

return [

    'ler' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $seq = [];
        foreach (linhas("SELECT tipo, proximo FROM sequencias WHERE tenant_id = ?", [$tid]) as $s) $seq[$s['tipo']] = (int) $s['proximo'];
        return [
            'config'     => ler_config($tid),
            'sequencias' => $seq,
            'empresa'    => tenant_publico(linha("SELECT * FROM tenants WHERE id = ?", [$tid])),
        ];
    },

    /* salva uma ou várias chaves: {"valores": {"aliquota": 16, "empresa": {...}}} */
    'salvar' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $valores = is_array($d['valores'] ?? null) ? $d['valores'] : [];
        if (!$valores) erro('Nada para salvar.');
        db()->beginTransaction();
        foreach ($valores as $chave => $v) {
            if (!isset(CONFIG_CHAVES[$chave])) erro('Configuração desconhecida: ' . $chave);
            if (CONFIG_CHAVES[$chave] === 'numero') {
                if (!is_numeric($v) || $v < 0 || $v > 100000) erro('Valor inválido para ' . $chave . '.');
                $grava = (string) (0 + $v);
            } else {
                $grava = json_encode($v, JSON_UNESCAPED_UNICODE);
                if (strlen($grava) > 2000000) erro('Conteúdo grande demais em ' . $chave . '.');
            }
            q("INSERT INTO config (tenant_id, chave, valor) VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [$tid, $chave, $grava]);
        }
        db()->commit();
        auditar('config_salvar', 'config', null, implode(', ', array_keys($valores)));
        return ler_config($tid);
    },

    'tema' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $p = $d['corPrimaria'] ?? '';
        $s = $d['corSecundaria'] ?? '';
        if (!cor_valida($p) || !cor_valida($s)) erro('Use cores no formato #RRGGBB.');
        q("UPDATE tenants SET cor_primaria = ?, cor_secundaria = ? WHERE id = ?", [strtolower($p), strtolower($s), $tid]);
        auditar('tema_salvar', 'tenants', $tid, "$p $s");
        return tenant_publico(linha("SELECT * FROM tenants WHERE id = ?", [$tid]));
    },

    /* upload multipart: campos acao=config.logo e arquivo=<imagem> */
    'logo' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $id = salvar_anexo($_FILES['arquivo'] ?? null, 'tenant', $tid, 'logo', true);
        $antigo = valor("SELECT logo_anexo_id FROM tenants WHERE id = ?", [$tid]);
        q("UPDATE tenants SET logo_anexo_id = ? WHERE id = ?", [$id, $tid]);
        if ($antigo) q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$antigo, $tid]);
        auditar('logo_salvar', 'tenants', $tid);
        return tenant_publico(linha("SELECT * FROM tenants WHERE id = ?", [$tid]));
    },

    /* link público de cadastro: lê (e cria na primeira vez) */
    'link_cadastro' => function ($d) {
        exigir_perfil('admin', 'coord');
        return cadastro_link(tenant());
    },

    /* gera um código novo; o link antigo para de funcionar na hora */
    'link_cadastro_novo' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        cadastro_gravar_codigo($tid);
        auditar('cadastro_link_novo', 'config', null, 'Link de cadastro trocado');
        return cadastro_link($tid);
    },

    /* {ativo: true|false} */
    'link_cadastro_ativo' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $ativo = !empty($d['ativo']);
        q("INSERT INTO config (tenant_id, chave, valor) VALUES (?, 'cadastro_ativo', ?)
           ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [$tid, $ativo ? '1' : '0']);
        auditar('cadastro_link_' . ($ativo ? 'ligar' : 'desligar'), 'config');
        return cadastro_link($tid);
    },

    /* v1.39.0: {ativo} — formulário público de solicitação de serviço (vira tarefa "Solicitação pelo link") */
    'link_solicitacao_ativo' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $ativo = !empty($d['ativo']);
        q("INSERT INTO config (tenant_id, chave, valor) VALUES (?, 'solicitacao_ativo', ?)
           ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [$tid, $ativo ? '1' : '0']);
        auditar('solicitacao_link_' . ($ativo ? 'ligar' : 'desligar'), 'config');
        return cadastro_link($tid);
    },

    'remover_logo' => function ($d) {
        exigir_perfil('admin');
        $tid = tenant();
        $antigo = valor("SELECT logo_anexo_id FROM tenants WHERE id = ?", [$tid]);
        q("UPDATE tenants SET logo_anexo_id = NULL WHERE id = ?", [$tid]);
        if ($antigo) q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$antigo, $tid]);
        return tenant_publico(linha("SELECT * FROM tenants WHERE id = ?", [$tid]));
    },
];
