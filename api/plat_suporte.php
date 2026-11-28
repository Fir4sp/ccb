<?php
/* KONSTANTE SaaS — api/plat_suporte.php  ·  central de ajuda no CONSOLE DA PLATAFORMA (v1.14.0)
   O administrador da plataforma vê os relatos de todas as empresas, responde e muda a situação.
   Os prints vêm embutidos (data URL) porque a sessão do console não abre arquivos das empresas. */
if (!defined('KSAAS') || !defined('KPLAT')) { http_response_code(403); exit; }

const PSUP_STATUS = ['aberto' => 'Aberto', 'em_analise' => 'Em análise', 'respondido' => 'Respondido', 'resolvido' => 'Resolvido'];
const PSUP_TIPOS  = ['problema' => 'Problema', 'reclamacao' => 'Reclamação', 'sugestao' => 'Sugestão', 'duvida' => 'Dúvida'];

function psup_item($s) {
    return ['id' => (int) $s['id'], 'tipo' => $s['tipo'], 'assunto' => $s['assunto'], 'status' => $s['status'], 'tela' => $s['tela'],
            'navegador' => $s['navegador'], 'versaoApp' => $s['versao_app'], 'naoLido' => (int) $s['lido_plat'] === 0,
            'empresa' => $s['empresa_nome'], 'empresaId' => (int) $s['tenant_id'], 'usuario' => $s['usuario_nome'], 'email' => $s['usuario_email'],
            'perfil' => $s['usuario_perfil'], 'criadoEm' => $s['criado_em'], 'atualizadoEm' => $s['atualizado_em']];
}
const PSUP_SELECT = "SELECT s.*, t.nome AS empresa_nome, u.nome AS usuario_nome, u.email AS usuario_email, u.perfil AS usuario_perfil
                       FROM suporte s JOIN tenants t ON t.id = s.tenant_id LEFT JOIN usuarios u ON u.tenant_id = s.tenant_id AND u.id = s.usuario_id";

return [

    /* {status?, tipo?, busca?} */
    'listar' => function ($d) {
        admin_plataforma();
        $w = "1 = 1"; $p = [];
        $st = (string) ($d['status'] ?? '');
        if ($st === 'pendentes') $w .= " AND s.status IN ('aberto','em_analise')";
        elseif (isset(PSUP_STATUS[$st])) { $w .= " AND s.status = ?"; $p[] = $st; }
        if (isset(PSUP_TIPOS[$d['tipo'] ?? ''])) { $w .= " AND s.tipo = ?"; $p[] = $d['tipo']; }
        $b = txt($d['busca'] ?? '', 100);
        if ($b !== '') { $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $b) . '%'; $w .= " AND (s.assunto LIKE ? OR t.nome LIKE ? OR u.nome LIKE ?)"; array_push($p, $like, $like, $like); }
        try {
            $l = linhas(PSUP_SELECT . " WHERE $w ORDER BY s.lido_plat, FIELD(s.status, 'aberto', 'em_analise', 'respondido', 'resolvido'), s.atualizado_em DESC LIMIT 300", $p);
            $cont = [];
            foreach (linhas("SELECT status, COUNT(*) n FROM suporte GROUP BY status") as $r) $cont[$r['status']] = (int) $r['n'];
            $naoLidos = (int) valor("SELECT COUNT(*) FROM suporte WHERE lido_plat = 0");
        } catch (Throwable $e) { erro('A central de ajuda precisa do SQL 09 da versão 1.14.0.', 503, 'SEM_TABELA'); }
        return ['itens' => array_map('psup_item', $l), 'porStatus' => $cont, 'naoLidos' => $naoLidos, 'tipos' => PSUP_TIPOS, 'status' => PSUP_STATUS];
    },

    'obter' => function ($d) {
        admin_plataforma();
        $s = linha(PSUP_SELECT . " WHERE s.id = ?", [(int) ($d['id'] ?? 0)]);
        if (!$s) erro('Relato não encontrado.', 404, 'NAO_ENCONTRADO');
        if ((int) $s['lido_plat'] === 0) q("UPDATE suporte SET lido_plat = 1, atualizado_em = atualizado_em WHERE id = ?", [$s['id']]);
        $out = psup_item($s);
        $out['mensagens'] = array_map(function ($m) { return ['id' => (int) $m['id'], 'autor' => $m['autor'], 'autorNome' => $m['autor_nome'], 'texto' => $m['texto'], 'criadoEm' => $m['criado_em']]; },
            linhas("SELECT * FROM suporte_mensagens WHERE suporte_id = ? ORDER BY id", [$s['id']]));
        $out['prints'] = [];
        foreach (linhas("SELECT caminho, mime FROM anexos WHERE tenant_id = ? AND dono_tipo = 'suporte' AND dono_id = ? AND excluido_em IS NULL ORDER BY id LIMIT 3", [$s['tenant_id'], $s['id']]) as $a) {
            $arq = ARQUIVOS_DIR . '/' . $a['caminho'];
            if (is_file($arq) && filesize($arq) <= 4000000 && strpos((string) $a['mime'], 'image/') === 0) $out['prints'][] = 'data:' . $a['mime'] . ';base64,' . base64_encode(file_get_contents($arq));
        }
        return $out;
    },

    /* {id, texto, status?} — responde ao usuário (status padrão: respondido) */
    'responder' => function ($d) {
        $a = admin_plataforma();
        $id = (int) ($d['id'] ?? 0);
        if (!valor("SELECT id FROM suporte WHERE id = ?", [$id])) erro('Relato não encontrado.', 404);
        $t = txt($d['texto'] ?? '', 5000);
        if ($t === '') erro('Escreva a resposta.');
        $st = isset(PSUP_STATUS[$d['status'] ?? '']) ? $d['status'] : 'respondido';
        q("INSERT INTO suporte_mensagens (suporte_id, autor, autor_nome, texto) VALUES (?, 'plataforma', ?, ?)", [$id, 'Suporte · ' . $a['nome'], $t]);
        q("UPDATE suporte SET status = ?, lido_usuario = 0, lido_plat = 1 WHERE id = ?", [$st, $id]);
        auditar('suporte_responder', 'suporte', $id, $st);
        return ['id' => $id];
    },

    'status' => function ($d) {
        admin_plataforma();
        $id = (int) ($d['id'] ?? 0);
        $st = (string) ($d['status'] ?? '');
        if (!isset(PSUP_STATUS[$st])) erro('Situação inválida.');
        q("UPDATE suporte SET status = ? WHERE id = ?", [$st, $id]);
        auditar('suporte_status', 'suporte', $id, $st);
        return ['id' => $id];
    },
];
