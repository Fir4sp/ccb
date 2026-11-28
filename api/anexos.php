<?php
/* KONSTANTE SaaS — api/anexos.php  ·  abrir (download protegido)
   v1.13.0: perfil cliente só abre o que é das próprias unidades.
   v1.15.0: arquivos de contrato só para admin e coordenação. */
if (!defined('KSAAS')) { http_response_code(403); exit; }

return [

    /* GET api.php?acao=anexos.abrir&id=123  — entrega o arquivo original */
    'abrir' => function ($d) {
        $tid = tenant();
        $a = linha("SELECT * FROM anexos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid]);
        if (!$a) erro('Arquivo não encontrado.', 404);
        /* v1.13.0: usuário cliente só abre arquivos das próprias unidades (fotos do PMOC e das OS, assinaturas) e o logo da empresa */
        $u = eu();
        /* v1.15.0: arquivos de contrato (assinado, ART…) só para administração e coordenação */
        if ($a['dono_tipo'] === 'contrato' && !tem_perfil($u, 'admin', 'coord', 'comercial', 'financeiro')) erro('Arquivo não encontrado.', 404);
        /* v1.22.0: comprovantes e documentos do financeiro só para administrador e financeiro */
        if ($a['dono_tipo'] === 'fin' && !tem_perfil($u, 'admin', 'financeiro')) erro('Arquivo não encontrado.', 404);
        if ($u['perfil'] === 'cliente') {
            $uni = unidades_cliente($u) ?: [0];
            $in = implode(',', array_map('intval', $uni));
            $pode = (int) valor("SELECT logo_anexo_id FROM tenants WHERE id = ?", [$tid]) === (int) $a['id'];
            if (!$pode && $a['dono_tipo'] === 'usuario') $pode = (int) $a['dono_id'] === (int) $u['id'];   /* v1.35.0: a própria foto */
            if (!$pode && $a['dono_tipo'] === 'pmoc')
                $pode = (bool) valor("SELECT 1 FROM pmoc_visitas v JOIN pmoc_planos p ON p.tenant_id = v.tenant_id AND p.id = v.plano_id
                                       WHERE v.tenant_id = ? AND v.id = ? AND p.cliente_id IN ($in)", [$tid, (int) $a['dono_id']]);
            if (!$pode && $a['dono_tipo'] === 'os')
                $pode = (bool) valor("SELECT 1 FROM ordens_servico WHERE tenant_id = ? AND id = ? AND cliente_id IN ($in)", [$tid, (int) $a['dono_id']]);
            /* v1.28.1: fotos da solicitação feita pelo cliente */
            if (!$pode && $a['dono_tipo'] === 'tarefa')
                $pode = (bool) valor("SELECT 1 FROM tarefas WHERE tenant_id = ? AND id = ? AND tipo = 'Solicitação do cliente' AND cliente_id IN ($in)", [$tid, (int) $a['dono_id']]);
            if (!$pode) erro('Arquivo não encontrado.', 404);
        }
        $caminho = ARQUIVOS_DIR . '/' . $a['caminho'];
        if (!is_file($caminho)) erro('Arquivo não encontrado.', 404);
        header_remove('Content-Type');
        header('Content-Type: ' . $a['mime']);
        header('Content-Length: ' . filesize($caminho));
        header('Cache-Control: private, max-age=86400');
        header('Content-Disposition: inline; filename="' . preg_replace('/[^\w.\-]/u', '_', $a['nome_original'] ?: 'arquivo') . '"');
        readfile($caminho);
        exit;
    },
];
