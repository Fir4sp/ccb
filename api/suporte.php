<?php
/* KONSTANTE SaaS — api/suporte.php  ·  central de ajuda (v1.14.0)
   Usuários das empresas enviam problemas, reclamações, sugestões e dúvidas para a
   PLATAFORMA (não para a própria empresa). A resposta vem pelo Console da plataforma.
   Técnico e coordenação veem os próprios relatos; o administrador vê os da empresa toda.
   Tabelas: suporte, suporte_mensagens (SQL 09); prints em anexos (dono_tipo 'suporte'). */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once dirname(__DIR__) . '/nucleo/anexos.php';
date_default_timezone_set('America/Sao_Paulo');

const SUP_TIPOS  = ['problema' => 'Problema', 'reclamacao' => 'Reclamação', 'sugestao' => 'Sugestão', 'duvida' => 'Dúvida'];
const SUP_STATUS = ['aberto' => 'Aberto', 'em_analise' => 'Em análise', 'respondido' => 'Respondido', 'resolvido' => 'Resolvido'];

function sup_meu($id, $u) {
    $s = linha("SELECT * FROM suporte WHERE id = ? AND tenant_id = ?", [(int) $id, (int) $u['tenant_id']]);
    if (!$s || (!tem_perfil($u, 'admin') && (int) $s['usuario_id'] !== (int) $u['id'])) erro('Relato não encontrado.', 404, 'NAO_ENCONTRADO');
    return $s;
}
function sup_publico($s) {
    return ['id' => (int) $s['id'], 'tipo' => $s['tipo'], 'assunto' => $s['assunto'], 'status' => $s['status'], 'tela' => $s['tela'],
            'naoLido' => (int) $s['lido_usuario'] === 0, 'criadoEm' => $s['criado_em'], 'atualizadoEm' => $s['atualizado_em'],
            'autor' => $s['usuario_nome'] ?? null];
}

return [

    'listar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $w = "s.tenant_id = ?"; $p = [$tid];
        if (!tem_perfil($u, 'admin')) { $w .= " AND s.usuario_id = ?"; $p[] = (int) $u['id']; }
        try {
            $l = linhas("SELECT s.*, us.nome AS usuario_nome FROM suporte s LEFT JOIN usuarios us ON us.tenant_id = s.tenant_id AND us.id = s.usuario_id
                          WHERE $w ORDER BY s.lido_usuario, FIELD(s.status, 'respondido', 'aberto', 'em_analise', 'resolvido'), s.atualizado_em DESC LIMIT 200", $p);
        } catch (Throwable $e) { erro('A central de ajuda precisa do SQL 09 da versão 1.14.0.', 503, 'SEM_TABELA'); }
        return ['itens' => array_map('sup_publico', $l), 'tipos' => SUP_TIPOS, 'status' => SUP_STATUS];
    },

    'obter' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $s = sup_meu($d['id'] ?? 0, $u);
        if ((int) $s['usuario_id'] === (int) $u['id'] && (int) $s['lido_usuario'] === 0) q("UPDATE suporte SET lido_usuario = 1, atualizado_em = atualizado_em WHERE id = ?", [$s['id']]);
        $out = sup_publico($s);
        $out['mensagens'] = array_map(function ($m) { return ['id' => (int) $m['id'], 'autor' => $m['autor'], 'autorNome' => $m['autor_nome'], 'texto' => $m['texto'], 'criadoEm' => $m['criado_em']]; },
            linhas("SELECT * FROM suporte_mensagens WHERE suporte_id = ? ORDER BY id", [$s['id']]));
        $out['prints'] = array_map('intval', array_column(linhas("SELECT id FROM anexos WHERE tenant_id = ? AND dono_tipo = 'suporte' AND dono_id = ? AND excluido_em IS NULL ORDER BY id", [$tid, $s['id']]), 'id'));
        return $out;
    },

    /* {tipo, assunto, mensagem, tela?, navegador?, versaoApp?} */
    'criar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $tipo = isset(SUP_TIPOS[$d['tipo'] ?? '']) ? $d['tipo'] : 'problema';
        $assunto = txt($d['assunto'] ?? '', 200);
        $msg = txt($d['mensagem'] ?? '', 5000);
        if ($assunto === '') erro('Escreva um título curto.');
        if (mb_strlen($msg) < 5) erro('Conte com mais detalhes o que aconteceu ou o que você sugere.');
        $janela = valor("SELECT COUNT(*) FROM suporte WHERE usuario_id = ? AND criado_em > NOW() - INTERVAL 10 MINUTE", [(int) $u['id']]);
        if ((int) $janela >= 5) erro('Você enviou vários relatos seguidos. Aguarde alguns minutos.', 429, 'LIMITE');
        db()->beginTransaction();
        q("INSERT INTO suporte (tenant_id, usuario_id, tipo, assunto, tela, navegador, versao_app, lido_usuario, lido_plat) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)",
          [$tid, (int) $u['id'], $tipo, $assunto, txt_ou_null($d['tela'] ?? '', 120), txt_ou_null($d['navegador'] ?? '', 255), txt_ou_null($d['versaoApp'] ?? '', 20)]);
        $id = (int) db()->lastInsertId();
        q("INSERT INTO suporte_mensagens (suporte_id, autor, autor_nome, texto) VALUES (?, 'usuario', ?, ?)", [$id, $u['nome'], $msg]);
        db()->commit();
        auditar('suporte_criar', 'suporte', $id, SUP_TIPOS[$tipo] . ': ' . $assunto);
        return ['id' => $id];
    },

    /* {id, texto} — complemento do usuário; reabre se já estava respondido/resolvido */
    'responder' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $s = sup_meu($d['id'] ?? 0, $u);
        $t = txt($d['texto'] ?? '', 5000);
        if ($t === '') erro('Escreva a mensagem.');
        q("INSERT INTO suporte_mensagens (suporte_id, autor, autor_nome, texto) VALUES (?, 'usuario', ?, ?)", [$s['id'], $u['nome'], $t]);
        q("UPDATE suporte SET status = IF(status = 'em_analise', status, 'aberto'), lido_plat = 0 WHERE id = ?", [$s['id']]);
        return ['id' => (int) $s['id']];
    },

    /* multipart: acao=suporte.foto.enviar, suporteId, arquivo=<imagem> (até 3 por relato) */
    'foto.enviar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'comercial', 'financeiro');
        $tid = tenant();
        $s = sup_meu($d['suporteId'] ?? 0, $u);
        if ((int) valor("SELECT COUNT(*) FROM anexos WHERE tenant_id = ? AND dono_tipo = 'suporte' AND dono_id = ? AND excluido_em IS NULL", [$tid, $s['id']]) >= 3) erro('Até 3 imagens por relato.');
        return ['id' => salvar_anexo($_FILES['arquivo'] ?? null, 'suporte', (int) $s['id'], 'print', true)];
    },
];
