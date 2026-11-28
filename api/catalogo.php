<?php
/* KONSTANTE SaaS — api/catalogo.php  ·  tabela de preços e regras de material
   Ações: tudo, servicos.salvar, servicos.excluir, materiais.salvar,
          materiais.excluir, maquinas.salvar, maquinas.excluir
   Só administrador (catálogo tem valores). */
if (!defined('KSAAS')) { http_response_code(403); exit; }

/* categorias de material e como a quantidade é calculada no orçamento */
const CAT_TIPOS = ['material', 'acessorio', 'insumo', 'opcional'];
const CAT_CALCULOS = [
    'kg_por_metro'      => ['fator'],     // tubulação: fator (kg/m) × metros
    'metros'            => ['fator'],     // isolamento: fator × metros
    'metros_mais_folga' => ['folga'],     // cabo: metros + folga × nº de máquinas
    'metros_div'        => ['divisor'],   // fita: metros ÷ divisor
    'por_maquina'       => ['fator'],     // acessório: fator × nº de máquinas
    'fixo'              => ['qtd'],       // insumo: quantidade fixa por orçamento
    'manual'            => ['qtd'],       // opcional: escolhido à mão
];

function cat_num($v, $rotulo, $min = 0, $max = 1000000, $dinheiro = false) {
    if (is_string($v)) {
        $v = str_replace(['R$', ' '], '', trim($v));
        if (strpos($v, ',') !== false) $v = str_replace(',', '.', str_replace('.', '', $v));   // 1.234,56
        elseif ($dinheiro && preg_match('/^\d{1,3}(\.\d{3})+$/', $v)) $v = str_replace('.', '', $v);   // 1.500
    }
    if ($v === '' || $v === null || !is_numeric($v)) erro("Informe um número em $rotulo.");
    $n = 0 + $v;
    if ($n < $min || $n > $max) erro("Valor fora do limite em $rotulo.");
    return $n;
}

function regra_valida($r, $tipo) {
    if (!is_array($r)) $r = [];
    $calc = $r['calculo'] ?? '';
    $padrao = ['material' => 'metros', 'acessorio' => 'por_maquina', 'insumo' => 'fixo', 'opcional' => 'manual'];
    if (!isset(CAT_CALCULOS[$calc])) $calc = $padrao[$tipo];
    $out = ['calculo' => $calc];
    foreach (CAT_CALCULOS[$calc] as $campo) {
        $min = $campo === 'divisor' ? 0.001 : 0;
        $out[$campo] = cat_num($r[$campo] ?? ($campo === 'divisor' ? 3 : ($campo === 'folga' ? 2 : 1)), $campo, $min, 100000);
    }
    return $out;
}

function servico_publico($s) {
    return ['id' => (int) $s['id'], 'nome' => $s['nome'], 'unidade' => $s['unidade'],
            'valor' => (float) $s['valor'], 'ativo' => (int) $s['ativo'] === 1, 'ordem' => (int) $s['ordem']];
}
function material_publico($m) {
    return ['id' => (int) $m['id'], 'tipo' => $m['tipo'], 'nome' => $m['nome'], 'unidade' => $m['unidade'],
            'custo' => (float) $m['custo'], 'markupPct' => (float) $m['markup_pct'],
            'regra' => json_decode((string) $m['regra'], true) ?: ['calculo' => 'manual', 'qtd' => 1],
            'ativo' => (int) $m['ativo'] === 1, 'ordem' => (int) $m['ordem']];
}
function maquina_publica($k) {
    $ids = json_decode((string) $k['materiais'], true);
    return ['id' => (int) $k['id'], 'nome' => $k['nome'], 'materiais' => array_map('intval', is_array($ids) ? $ids : []),
            'ativo' => (int) $k['ativo'] === 1, 'ordem' => (int) $k['ordem']];
}

function catalogo_completo($tid) {
    return [
        'servicos'  => array_map('servico_publico', linhas("SELECT * FROM catalogo_servicos WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY ordem, nome", [$tid])),
        'materiais' => array_map('material_publico', linhas("SELECT * FROM catalogo_materiais WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY ordem, nome", [$tid])),
        'maquinas'  => array_map('maquina_publica', linhas("SELECT * FROM catalogo_maquinas WHERE tenant_id = ? AND excluido_em IS NULL ORDER BY ordem, nome", [$tid])),
    ];
}

function proxima_ordem($tabela, $tid) {
    return (int) valor("SELECT COALESCE(MAX(ordem), 0) + 1 FROM $tabela WHERE tenant_id = ?", [$tid]);
}

/* remove um material de todos os tipos de máquina da empresa */
function tirar_dos_kits($materialId, $tid) {
    foreach (linhas("SELECT id, materiais FROM catalogo_maquinas WHERE tenant_id = ? AND excluido_em IS NULL", [$tid]) as $k) {
        $ids = json_decode((string) $k['materiais'], true);
        if (!is_array($ids) || !in_array($materialId, array_map('intval', $ids), true)) continue;
        $novo = array_values(array_filter(array_map('intval', $ids), function ($x) use ($materialId) { return $x !== $materialId; }));
        q("UPDATE catalogo_maquinas SET materiais = ? WHERE id = ? AND tenant_id = ?", [json_encode($novo), $k['id'], $tid]);
    }
}

return [

    'tudo' => function ($d) {
        exigir_perfil('admin', 'coord');
        return catalogo_completo(tenant());
    },

    /* ---------- serviços ---------- */

    'servicos.salvar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $nome = txt($d['nome'] ?? '', 200);
        if ($nome === '') erro('Informe o nome do serviço.');
        $campos = [
            'nome'    => $nome,
            'unidade' => txt($d['unidade'] ?? 'un', 20) ?: 'un',
            'valor'   => cat_num($d['valor'] ?? '', 'valor', 0, 1000000, true),
            'ativo'   => !empty($d['ativo']) || !array_key_exists('ativo', $d) ? 1 : 0,
        ];
        if ($id) {
            if (!valor("SELECT id FROM catalogo_servicos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid])) erro('Serviço não encontrado.', 404);
            q("UPDATE catalogo_servicos SET nome = ?, unidade = ?, valor = ?, ativo = ? WHERE id = ? AND tenant_id = ?",
              [$campos['nome'], $campos['unidade'], $campos['valor'], $campos['ativo'], $id, $tid]);
        } else {
            q("INSERT INTO catalogo_servicos (tenant_id, nome, unidade, valor, ativo, ordem) VALUES (?, ?, ?, ?, ?, ?)",
              [$tid, $campos['nome'], $campos['unidade'], $campos['valor'], $campos['ativo'], proxima_ordem('catalogo_servicos', $tid)]);
            $id = (int) db()->lastInsertId();
        }
        auditar('catalogo_servico_salvar', 'catalogo_servicos', $id, $nome . ' = ' . $campos['valor']);
        return servico_publico(linha("SELECT * FROM catalogo_servicos WHERE id = ? AND tenant_id = ?", [$id, $tid]));
    },

    'servicos.excluir' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $s = linha("SELECT * FROM catalogo_servicos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
        if (!$s) erro('Serviço não encontrado.', 404);
        q("UPDATE catalogo_servicos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$id, $tid]);
        auditar('catalogo_servico_excluir', 'catalogo_servicos', $id, $s['nome']);
        return ['id' => $id];
    },

    /* ---------- materiais ---------- */

    'materiais.salvar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $nome = txt($d['nome'] ?? '', 200);
        if ($nome === '') erro('Informe o nome do material.');
        $tipo = in_array($d['tipo'] ?? '', CAT_TIPOS, true) ? $d['tipo'] : 'material';
        $campos = [
            'tipo'       => $tipo,
            'nome'       => $nome,
            'unidade'    => txt($d['unidade'] ?? 'un', 20) ?: 'un',
            'custo'      => cat_num($d['custo'] ?? '', 'custo', 0, 1000000, true),
            'markup_pct' => cat_num($d['markupPct'] ?? 15, 'margem (%)', 0, 999),
            'regra'      => json_encode(regra_valida($d['regra'] ?? [], $tipo), JSON_UNESCAPED_UNICODE),
            'ativo'      => !empty($d['ativo']) || !array_key_exists('ativo', $d) ? 1 : 0,
        ];
        if (valor("SELECT id FROM catalogo_materiais WHERE tenant_id = ? AND nome = ? AND excluido_em IS NULL AND id <> ?", [$tid, $nome, $id]))
            erro('Já existe um material com esse nome.', 409, 'DUPLICADO');
        if ($id) {
            $atual = linha("SELECT tipo FROM catalogo_materiais WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
            if (!$atual) erro('Material não encontrado.', 404);
            $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
            q("UPDATE catalogo_materiais SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [$id, $tid]));
            /* deixou de ser "material de kit": sai dos tipos de máquina */
            if ($atual['tipo'] === 'material' && $tipo !== 'material') tirar_dos_kits($id, $tid);
        } else {
            $campos['tenant_id'] = $tid;
            $campos['ordem'] = proxima_ordem('catalogo_materiais', $tid);
            $cols = implode(', ', array_keys($campos));
            q("INSERT INTO catalogo_materiais ($cols) VALUES (" . implode(', ', array_fill(0, count($campos), '?')) . ")", array_values($campos));
            $id = (int) db()->lastInsertId();
        }
        auditar('catalogo_material_salvar', 'catalogo_materiais', $id, $nome . ' = ' . $campos['custo']);
        return material_publico(linha("SELECT * FROM catalogo_materiais WHERE id = ? AND tenant_id = ?", [$id, $tid]));
    },

    'materiais.excluir' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $m = linha("SELECT * FROM catalogo_materiais WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
        if (!$m) erro('Material não encontrado.', 404);
        db()->beginTransaction();
        q("UPDATE catalogo_materiais SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$id, $tid]);
        tirar_dos_kits($id, $tid);
        db()->commit();
        auditar('catalogo_material_excluir', 'catalogo_materiais', $id, $m['nome']);
        return ['id' => $id];
    },

    /* ---------- tipos de máquina (kits) ---------- */

    'maquinas.salvar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $nome = txt($d['nome'] ?? '', 150);
        if ($nome === '') erro('Informe o nome do tipo de máquina.');
        $ids = array_values(array_unique(array_map('intval', is_array($d['materiais'] ?? null) ? $d['materiais'] : [])));
        if (!$ids) erro('Escolha pelo menos um material para este tipo de máquina.');
        /* só materiais desta empresa, ativos na lista, do tipo "material" */
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $validos = array_map('intval', array_column(linhas(
            "SELECT id FROM catalogo_materiais WHERE tenant_id = ? AND tipo = 'material' AND excluido_em IS NULL AND id IN ($ph)",
            array_merge([$tid], $ids)), 'id'));
        if (count($validos) !== count($ids)) erro('Há materiais inválidos na lista.');
        $json = json_encode($ids);
        $ativo = !empty($d['ativo']) || !array_key_exists('ativo', $d) ? 1 : 0;
        if ($id) {
            if (!valor("SELECT id FROM catalogo_maquinas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid])) erro('Tipo de máquina não encontrado.', 404);
            q("UPDATE catalogo_maquinas SET nome = ?, materiais = ?, ativo = ? WHERE id = ? AND tenant_id = ?", [$nome, $json, $ativo, $id, $tid]);
        } else {
            q("INSERT INTO catalogo_maquinas (tenant_id, nome, materiais, ativo, ordem) VALUES (?, ?, ?, ?, ?)",
              [$tid, $nome, $json, $ativo, proxima_ordem('catalogo_maquinas', $tid)]);
            $id = (int) db()->lastInsertId();
        }
        auditar('catalogo_maquina_salvar', 'catalogo_maquinas', $id, $nome);
        return maquina_publica(linha("SELECT * FROM catalogo_maquinas WHERE id = ? AND tenant_id = ?", [$id, $tid]));
    },

    'maquinas.excluir' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $k = linha("SELECT * FROM catalogo_maquinas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
        if (!$k) erro('Tipo de máquina não encontrado.', 404);
        q("UPDATE catalogo_maquinas SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$id, $tid]);
        auditar('catalogo_maquina_excluir', 'catalogo_maquinas', $id, $k['nome']);
        return ['id' => $id];
    },
];
