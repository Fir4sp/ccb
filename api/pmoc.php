<?php
/* =====================================================================
   KONSTANTE SaaS — api/pmoc.php  ·  PMOC (v1.13.0)
   Plano de Manutenção, Operação e Controle — Lei 13.589/2018 e Portaria 3.523/98.

   Tabelas (já existiam no banco, sem tela): equipamentos, pmoc_modelos,
   pmoc_planos, pmoc_visitas. Tudo filtrado pelo tenant da sessão.
     • pmoc_modelos.itens  = formulário: {descricao, secoes:[{titulo, tipo:checagem|medicao, itens:[{n, per|un}]}]}
     • pmoc_planos.dados   = {registro, art, endereco, mesInicio, tecnicos[], equip:[{id, modeloId}], modelos{id:{nome,secoes}}, obs}
                              (o plano guarda uma CÓPIA de cada formulário: mudar o modelo depois não altera o que já foi apontado)
     • pmoc_visitas        = uma linha por equipamento × mês; dados = {itens{"s-i":ok|an|na}, med{"s-i":valor}, obs, pend[], tecnico, feitaEm}

   Quem faz o quê: admin e coordenação montam planos, equipamentos e formulários;
   técnico vê os planos em que está escalado (ou planos sem escala) e aponta.
   Periodicidade dos itens: M mensal, T trimestral, S semestral, A anual — contada a partir do mês de início do plano.

   v1.13.0: tela do cliente no PMOC (apontar o mês, ocorrência = OS de contrato C-0001 ligada
   à máquina, instalação nova pelo técnico), histórico do equipamento, QR com código aleatório
   (equipamentos.qr_token), área do cliente (perfil cliente, várias unidades = cliente regional).
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

require_once dirname(__DIR__) . '/nucleo/anexos.php';
require_once __DIR__ . '/os.php';
require_once dirname(__DIR__) . '/nucleo/notificacoes.php';   /* v1.28.1: resposta do cliente na solicitação avisa a equipe */   /* v1.13.0: ocorrência vira OS de contrato (reaproveita gravação de técnicos, etapas e eventos) */
date_default_timezone_set('America/Sao_Paulo');

const PMOC_PER = ['M' => 1, 'T' => 3, 'S' => 6, 'A' => 12];
/* v1.34.0: OK conforme · Não OK (código 'an', mantido para não mexer no histórico) · NF não feito · N/A não aplicável */
const PMOC_APONT = ['ok', 'an', 'nf', 'na'];

/* v1.34.0: resultado do apontamento concluído — Não OK = pendência; NF = executado parcialmente; só OK/N/A = executado */
function pm_resultado($itens) {
    $l = array_values(is_array($itens) ? $itens : (array) $itens);
    if (in_array('an', $l, true)) return 'pendencia';
    if (in_array('nf', $l, true)) return 'parcial';
    return 'executado';
}

function pm_json($v) { $d = json_decode((string) ($v ?? ''), true); return is_array($d) ? $d : []; }
function pm_enc($v) { return json_encode($v, JSON_UNESCAPED_UNICODE); }
function pm_escritorio($u) { return tem_perfil($u, 'admin', 'coord'); }
/* v1.18.0: técnico só enxerga o plano em que está ESCALADO (como no painel antigo).
   Plano sem ninguém escalado fica só com o escritório (antes aparecia para todos os técnicos). */
function pm_tec_escalado($u, $plano) {
    if (pm_escritorio($u)) return true;
    if (!tem_perfil($u, 'tecnico')) return false;
    $d = pm_json(is_array($plano) ? ($plano['dados'] ?? '') : '');
    $tec = array_map('intval', $d['tecnicos'] ?? []);
    foreach (is_array($d['tecMes'] ?? null) ? $d['tecMes'] : [] as $t) if ($t) $tec[] = (int) $t;   /* técnico do mês também vê o plano */
    return in_array((int) $u['id'], $tec, true);
}

/* técnico enxerga o cliente se houver plano dele em que esteja escalado (ou plano sem escala);
   cliente enxerga só as próprias unidades; escritório enxerga tudo */
function pm_pode_cliente($u, $clienteId) {
    $clienteId = (int) $clienteId;
    if (pm_escritorio($u)) return true;
    if ($u['perfil'] === 'cliente') return in_array($clienteId, unidades_cliente($u) ?: [], true);
    if (!tem_perfil($u, 'tecnico')) return false;
    foreach (linhas("SELECT dados FROM pmoc_planos WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL", [(int) $u['tenant_id'], $clienteId]) as $p) {
        if (pm_tec_escalado($u, $p)) return true;
    }
    return false;
}
function pm_exigir_cliente($u, $clienteId) {
    if (!pm_pode_cliente($u, $clienteId)) erro('Você não tem acesso a este cliente.', 403, 'SEM_PERMISSAO');
}
/* plano do ano em que o equipamento está (ou null) */
function pm_plano_do_equip($tid, $eid, $ano) {
    foreach (linhas("SELECT * FROM pmoc_planos WHERE tenant_id = ? AND ano = ? AND excluido_em IS NULL AND dados LIKE ?", [$tid, $ano, '%{"id":' . (int) $eid . ',%']) as $p)
        foreach (pm_json($p['dados'])['equip'] ?? [] as $x) if ((int) ($x['id'] ?? 0) === (int) $eid) return $p;
    return null;
}
function pm_mes_txt($m) { $n = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']; return $n[(int) $m] ?? ''; }
function pm_token() { return substr(bin2hex(random_bytes(16)), 0, 24); }

/* ---------- formulários ---------- */

function pm_modelos_padrao() {
    $cond = [
        ['n' => 'Verificar existência de ruídos/vibrações anormais', 'per' => 'M'],
        ['n' => 'Verificar a vedação dos painéis de fechamento do gabinete', 'per' => 'M'],
        ['n' => 'Verificar existência de sujeira, danos e corrosão do gabinete', 'per' => 'M'],
        ['n' => 'Verificar e desentupir os drenos', 'per' => 'M'],
        ['n' => 'Lavar serpentina do evaporador', 'per' => 'M'],
        ['n' => 'Limpar gabinete do condicionador', 'per' => 'S'],
        ['n' => 'Verificar o isolamento térmico e acústico', 'per' => 'M'],
        ['n' => 'Corrigir tampas soltas do gabinete e vedação', 'per' => 'M'],
        ['n' => 'Lavar ou trocar os filtros de ar (condições gerais)', 'per' => 'M'],
        ['n' => 'Efetuar limpeza geral do equipamento', 'per' => 'S'],
        ['n' => 'Lavar serpentina do condensador', 'per' => 'M'],
        ['n' => 'Verificar possível vazamento de gás refrigerante', 'per' => 'M'],
    ];
    $elet = [
        ['n' => 'Efetuar reaperto dos terminais, parafusos e molas', 'per' => 'M'],
        ['n' => 'Verificar apertos dos fusíveis', 'per' => 'M'],
        ['n' => 'Efetuar limpeza externa do quadro elétrico', 'per' => 'M'],
        ['n' => 'Verificar atuação do(s) relê(s) térmico(s)', 'per' => 'M'],
        ['n' => 'Verificar e limpar contatoras', 'per' => 'M'],
        ['n' => 'Verificar e substituir os contatos danificados', 'per' => 'M'],
    ];
    $medTri = [['n' => 'Tensão entre fase R-S', 'un' => 'V'], ['n' => 'Tensão entre fase S-T', 'un' => 'V'], ['n' => 'Tensão entre fase R-T', 'un' => 'V'],
               ['n' => 'Corrente fase R', 'un' => 'A'], ['n' => 'Corrente fase S', 'un' => 'A'], ['n' => 'Corrente fase T', 'un' => 'A'],
               ['n' => 'Temperatura do ambiente', 'un' => '°C'], ['n' => 'Temperatura do insuflamento', 'un' => '°C']];
    $medMono = [['n' => 'Tensão de alimentação', 'un' => 'V'], ['n' => 'Corrente do compressor', 'un' => 'A'],
                ['n' => 'Temperatura do ambiente', 'un' => '°C'], ['n' => 'Temperatura do insuflamento', 'un' => '°C']];
    $sec = function ($c, $e, $m) {
        return [['titulo' => 'Condicionador', 'tipo' => 'checagem', 'itens' => $c],
                ['titulo' => 'Quadro elétrico', 'tipo' => 'checagem', 'itens' => $e],
                ['titulo' => 'Medições', 'tipo' => 'medicao', 'itens' => $m]];
    };
    return [
        ['nome' => 'Split trifásico (padrão)', 'descricao' => 'Expansão direta com alimentação trifásica — mede tensão e corrente das três fases.', 'secoes' => $sec($cond, $elet, $medTri)],
        ['nome' => 'Split monofásico', 'descricao' => 'Hi-wall, piso-teto e cassete monofásicos — uma única fase.', 'secoes' => $sec($cond, $elet, $medMono)],
        ['nome' => 'Sistema de renovação de ar', 'descricao' => 'Exaustores, ventiladores e dutos de renovação — sem serpentina e sem gás.', 'secoes' => $sec(
            [['n' => 'Verificar operação do ventilador', 'per' => 'M'], ['n' => 'Verificar ruídos e vibrações anormais', 'per' => 'M'],
             ['n' => 'Verificar insuflamento de ar nos terminais', 'per' => 'M'], ['n' => 'Verificar operação dos exaustores', 'per' => 'M'],
             ['n' => 'Substituir conjunto de filtros de ar (G3+F8)', 'per' => 'S'], ['n' => 'Verificar entrada de ar externo (desobstruir se necessário)', 'per' => 'T'],
             ['n' => 'Efetuar limpeza dos dutos de distribuição de ar', 'per' => 'S']],
            [['n' => 'Efetuar inspeção geral da instalação elétrica', 'per' => 'M'], ['n' => 'Verificar aperto dos terminais elétricos', 'per' => 'M']],
            [['n' => 'Vazão de ar', 'un' => 'm³/h'], ['n' => 'Tensão de alimentação', 'un' => 'V'], ['n' => 'Corrente do motor', 'un' => 'A']])],
    ];
}

/* aceita o formato novo (secoes) e o antigo do painel (condicionador / eletrico / medicoes) */
function pm_normalizar_form($f) {
    $f = is_array($f) ? $f : [];
    $secoes = [];
    if (isset($f['secoes']) && is_array($f['secoes'])) $bruto = $f['secoes'];
    else {
        $bruto = [];
        if (!empty($f['condicionador'])) $bruto[] = ['titulo' => 'Condicionador', 'tipo' => 'checagem', 'itens' => $f['condicionador']];
        if (!empty($f['eletrico']))      $bruto[] = ['titulo' => 'Quadro elétrico', 'tipo' => 'checagem', 'itens' => $f['eletrico']];
        if (!empty($f['medicoes']))      $bruto[] = ['titulo' => 'Medições', 'tipo' => 'medicao', 'itens' => $f['medicoes']];
    }
    foreach (array_slice($bruto, 0, 20) as $s) {
        if (!is_array($s)) continue;
        $tipo = ($s['tipo'] ?? '') === 'medicao' ? 'medicao' : 'checagem';
        $itens = [];
        foreach (array_slice(is_array($s['itens'] ?? null) ? $s['itens'] : [], 0, 80) as $it) {
            $n = txt(is_array($it) ? ($it['n'] ?? '') : $it, 200);
            if ($n === '') continue;
            if ($tipo === 'medicao') $itens[] = ['n' => $n, 'un' => txt(is_array($it) ? ($it['un'] ?? '') : '', 12)];
            else { $p = strtoupper((string) (is_array($it) ? ($it['per'] ?? 'M') : 'M')); $itens[] = ['n' => $n, 'per' => isset(PMOC_PER[$p]) ? $p : 'M']; }
        }
        $tit = txt($s['titulo'] ?? '', 80);
        if (!$itens && $tit === '') continue;
        $secoes[] = ['titulo' => $tit !== '' ? $tit : 'Seção', 'tipo' => $tipo, 'itens' => $itens];
    }
    return ['descricao' => txt($f['descricao'] ?? '', 300), 'secoes' => $secoes];
}

function pm_modelos($tid) {
    $l = linhas("SELECT * FROM pmoc_modelos WHERE tenant_id = ? AND excluido_em IS NULL AND ativo = 1 ORDER BY id", [$tid]);
    if (!$l) {   /* empresa sem formulários: nasce com os três do painel */
        foreach (pm_modelos_padrao() as $m)
            q("INSERT INTO pmoc_modelos (tenant_id, nome, periodicidade, itens) VALUES (?, ?, 'mensal', ?)",
              [$tid, $m['nome'], pm_enc(['descricao' => $m['descricao'], 'secoes' => $m['secoes']])]);
        $l = linhas("SELECT * FROM pmoc_modelos WHERE tenant_id = ? AND excluido_em IS NULL AND ativo = 1 ORDER BY id", [$tid]);
    }
    return array_map(function ($r) {
        $f = pm_normalizar_form(pm_json($r['itens']));
        return ['id' => (int) $r['id'], 'nome' => $r['nome'], 'descricao' => $f['descricao'], 'secoes' => $f['secoes'],
                'nItens' => array_sum(array_map(function ($s) { return count($s['itens']); }, $f['secoes']))];
    }, $l);
}

/* v1.38.0: periodicidade das VISITAS do plano (pmoc_planos.dados.frequencia): M mensal (padrão — planos antigos),
   T trimestral, S semestral, A anual, contadas a partir do mês de início, dentro do ano do plano.
   Ex.: início em março, trimestral → março, junho, setembro, dezembro. Mês fora da periodicidade que já tenha
   apontamento continua aparecendo (o histórico nunca some). */
const PMOC_FREQ = ['M' => 'Mensal', 'T' => 'Trimestral', 'S' => 'Semestral', 'A' => 'Anual'];
function pm_freq($dados) { $f = (string) ($dados['frequencia'] ?? 'M'); return isset(PMOC_FREQ[$f]) ? $f : 'M'; }
function pm_meses_servico($dados, $comVisita = []) {
    $f = pm_freq($dados);
    if ($f === 'M') return range(1, 12);
    $mi = (int) ($dados['mesInicio'] ?? 1); if ($mi < 1 || $mi > 12) $mi = 1;
    $l = []; for ($m = $mi; $m <= 12; $m += PMOC_PER[$f]) $l[] = $m;
    foreach ($comVisita as $m) if ((int) $m >= 1 && (int) $m <= 12) $l[] = (int) $m;
    $l = array_values(array_unique($l)); sort($l);
    return $l;
}

/* item vence neste mês? (M todo mês; T/S/A contados a partir do mês de início do plano) */
function pm_vence($per, $mes, $mesInicio) {
    $passo = PMOC_PER[$per] ?? 1;
    $off = (($mes - $mesInicio) % 12 + 12) % 12;
    return $off % $passo === 0;
}

/* ---------- equipamentos ---------- */

/* campos extras do equipamento (ficam em equipamentos.dados) — os do painel antigo vieram na migração */
const PM_EQ_EXTRAS = ['tensao' => 40, 'gas' => 20, 'area' => 20, 'obs' => 500, 'andar' => 60, 'tipoCond' => 40, 'status' => 30, 'dataInstalacao' => 10,
                      'ocupFixo' => 10, 'ocupFlut' => 10, 'cargaTermica' => 20, 'modeloCond' => 100, 'serieCond' => 100];

/* v1.18.0: tipos de equipamento configuráveis por empresa (config tipos_equipamento).
   Cada tipo: {nome, codigo (2–3 letras da TAG), modeloId (formulário padrão do PMOC, opcional)}.
   Sem configuração, vale a lista padrão abaixo. */
function pm_tipos_padrao() {
    $l = [['Hi-wall', 'HW'], ['Piso-teto', 'PT'], ['Cassete', 'CT'], ['Dutado', 'SD'], ['Splitão', 'SP'], ['VRF', 'VR'], ['Janela', 'JN'],
          ['Self contained', 'SC'], ['Fan coil', 'FC'], ['Chiller', 'CH'], ['Exaustor', 'EX'], ['Cortina de ar', 'CA'], ['Portátil', 'PO']];
    return array_map(function ($x) { return ['nome' => $x[0], 'codigo' => $x[1], 'modeloId' => null]; }, $l);
}
function pm_tipos($tid) {
    static $cache = [];
    if (isset($cache[$tid])) return $cache[$tid];
    $v = valor("SELECT valor FROM config WHERE tenant_id = ? AND chave = 'tipos_equipamento'", [$tid]);
    $l = $v === false ? null : json_decode((string) $v, true);
    if (!is_array($l) || !$l) $l = pm_tipos_padrao();
    return $cache[$tid] = array_values(array_map(function ($x) {
        return ['nome' => (string) ($x['nome'] ?? ''), 'codigo' => (string) ($x['codigo'] ?? 'XX'), 'modeloId' => !empty($x['modeloId']) ? (int) $x['modeloId'] : null];
    }, $l));
}
function pm_chave_tipo($t) {
    $k = strtr(mb_strtolower(trim((string) $t)), ['á' => 'a', 'à' => 'a', 'ã' => 'a', 'â' => 'a', 'é' => 'e', 'ê' => 'e', 'í' => 'i', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ú' => 'u', 'ç' => 'c']);
    return preg_replace('/[^a-z0-9]/', '', $k);
}
function pm_tipo_da_empresa($tipo, $tid) {
    $k = pm_chave_tipo($tipo);
    foreach (pm_tipos($tid) as $x) if (pm_chave_tipo($x['nome']) === $k) return $x;
    return null;
}

/* v1.16.0: tipo da planilha → nome padrão e código da TAG */
function pm_tipo_normal($t, $tid = null) {
    if ($tid) { $x = pm_tipo_da_empresa($t, $tid); if ($x) return $x['nome']; }   /* v1.18.0: tipos cadastrados pela empresa primeiro */
    $k = strtr(mb_strtolower(trim($t)), ['á' => 'a', 'à' => 'a', 'ã' => 'a', 'â' => 'a', 'é' => 'e', 'ê' => 'e', 'í' => 'i', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ú' => 'u', 'ç' => 'c']);
    $k = preg_replace('/[^a-z0-9]/', '', $k);
    $mapa = ['hiwall' => 'Hi-wall', 'split' => 'Hi-wall', 'k7' => 'Cassete', 'cassete' => 'Cassete', 'cassette' => 'Cassete', 'pisoteto' => 'Piso-teto',
             'dutado' => 'Dutado', 'duto' => 'Dutado', 'splitao' => 'Splitão', 'vrf' => 'VRF', 'janela' => 'Janela', 'acj' => 'Janela', 'selfcontained' => 'Self contained',
             'fancoil' => 'Fan coil', 'chiller' => 'Chiller', 'exaustor' => 'Exaustor', 'cortinadear' => 'Cortina de ar', 'portatil' => 'Portátil'];
    if (isset($mapa[$k])) return $mapa[$k];
    foreach ($mapa as $chave => $nome) if ($chave !== 'split' && strpos($k, $chave) === 0) return $nome;   /* "Exaustor maxx" → Exaustor */
    return trim($t) !== '' ? mb_substr(trim($t), 0, 60) : 'Outro';
}
function pm_tipo_codigo($tipo, $tid = null) {
    if ($tid) { $x = pm_tipo_da_empresa($tipo, $tid); if ($x && $x['codigo'] !== '') return $x['codigo']; }   /* v1.18.0 */
    $c = ['Hi-wall' => 'HW', 'Cassete' => 'CT', 'Piso-teto' => 'PT', 'Dutado' => 'SD', 'Splitão' => 'SP', 'VRF' => 'VR', 'Janela' => 'JN', 'Self contained' => 'SC',
          'Fan coil' => 'FC', 'Chiller' => 'CH', 'Exaustor' => 'EX', 'Cortina de ar' => 'CA', 'Portátil' => 'PO'];
    return $c[$tipo] ?? 'XX';
}

function pm_equip_publico($e) {
    $x = pm_json($e['dados']);
    $o = ['id' => (int) $e['id'], 'clienteId' => (int) $e['cliente_id'], 'tag' => $e['tag'], 'tipo' => $e['tipo'], 'marca' => $e['marca'], 'modelo' => $e['modelo'],
          'capacidadeBtu' => $e['capacidade_btu'] !== null ? (int) $e['capacidade_btu'] : null, 'serie' => $e['serie'], 'ambiente' => $e['ambiente'],
          'qrToken' => $e['qr_token'] ?? null, 'historico' => is_array($x['historico'] ?? null) ? $x['historico'] : []];
    foreach (PM_EQ_EXTRAS as $k => $max) $o[$k] = isset($x[$k]) && $x[$k] !== '' ? $x[$k] : null;
    if ($o['area'] === null && isset($x['areaM2']) && $x['areaM2'] !== '') $o['area'] = (string) $x['areaM2'];
    return $o;
}

/* grava o equipamento mantendo o que já estava em dados (histórico, dados do painel antigo).
   Troca de marca/modelo/série/capacidade numa TAG já cadastrada fica registrada no histórico. */
function pm_equip_gravar($d, $u, $instalacao = false) {
    $tid = (int) $u['tenant_id'];
    $id = $instalacao ? 0 : (int) ($d['id'] ?? 0);
    $cli = (int) ($d['clienteId'] ?? 0);
    if (!$cli || !valor("SELECT id FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$cli, $tid])) erro('Cliente não encontrado.');
    $tag = txt($d['tag'] ?? '', 60);
    if ($tag === '') erro('Informe a TAG (identificação da posição do equipamento, ex.: EV-01).');
    $btu = preg_replace('/\D/', '', (string) ($d['capacidadeBtu'] ?? ''));
    $atual = $id ? linha("SELECT * FROM equipamentos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]) : null;
    if ($id && !$atual) erro('Equipamento não encontrado.', 404, 'NAO_ENCONTRADO');
    $extra = $atual ? pm_json($atual['dados']) : [];
    foreach (PM_EQ_EXTRAS as $k => $max) if (array_key_exists($k, $d)) {
        $v = txt_ou_null($d[$k], $max);
        if ($v === null) unset($extra[$k]); else $extra[$k] = $v;
    }
    if (array_key_exists('area', $d)) { $a = str_replace(',', '.', (string) ($extra['area'] ?? '')); if (is_numeric($a)) $extra['areaM2'] = $a + 0; else unset($extra['areaM2']); }
    $campos = ['cliente_id' => $cli, 'tag' => $tag, 'tipo' => txt_ou_null($d['tipo'] ?? '', 60), 'marca' => txt_ou_null($d['marca'] ?? '', 60),
               'modelo' => txt_ou_null($d['modelo'] ?? '', 100), 'capacidade_btu' => $btu === '' ? null : (int) $btu,
               'serie' => txt_ou_null($d['serie'] ?? '', 100), 'ambiente' => txt_ou_null($d['ambiente'] ?? '', 150)];
    $dup = valor("SELECT id FROM equipamentos WHERE tenant_id = ? AND cliente_id = ? AND tag = ? AND excluido_em IS NULL AND id <> ?", [$tid, $cli, $tag, $id]);
    if ($dup) erro('Já existe um equipamento com a TAG ' . $tag . ' neste cliente.');
    $hist = is_array($extra['historico'] ?? null) ? $extra['historico'] : [];
    $agora = date('Y-m-d H:i:s');
    if ($atual) {
        $de = []; $para = [];
        foreach (['marca' => 'marca', 'modelo' => 'modelo', 'serie' => 'serie', 'capacidade_btu' => 'btu', 'tipo' => 'tipo'] as $col => $k)
            if ((string) $atual[$col] !== (string) $campos[$col]) { $de[$k] = $atual[$col]; $para[$k] = $campos[$col]; }
        if ($de && array_filter($de, function ($v) { return $v !== null && $v !== ''; }))
            $hist[] = ['id' => 'hx_' . bin2hex(random_bytes(4)), 'tipoEvento' => 'alteracao', 'data' => date('Y-m-d'), 'em' => $agora, 'tecnico' => $u['nome'],
                       'motivo' => txt($d['motivoTroca'] ?? '', 300) ?: 'Dados do aparelho alterados', 'de' => $de, 'para' => $para];
    } elseif ($instalacao) {
        $extra['dataInstalacao'] = $extra['dataInstalacao'] ?? date('Y-m-d');
        $extra['origem'] = 'instalacao';
        $hist[] = ['id' => 'hx_' . bin2hex(random_bytes(4)), 'tipoEvento' => 'instalacao', 'data' => $extra['dataInstalacao'], 'em' => $agora, 'tecnico' => $u['nome'],
                   'motivo' => txt($d['motivoTroca'] ?? '', 300) ?: 'Equipamento instalado (fora da implantação do PMOC)'];
    }
    if ($hist) $extra['historico'] = array_slice($hist, -200);
    $campos['dados'] = pm_enc($extra);
    if ($id) {
        $set = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
        q("UPDATE equipamentos SET $set WHERE id = ? AND tenant_id = ?", array_merge(array_values($campos), [$id, $tid]));
        if (empty($atual['qr_token'])) q("UPDATE equipamentos SET qr_token = ? WHERE id = ? AND tenant_id = ?", [pm_token(), $id, $tid]);
    } else {
        $campos['tenant_id'] = $tid;
        $campos['qr_token'] = pm_token();
        q("INSERT INTO equipamentos (" . implode(', ', array_keys($campos)) . ") VALUES (" . implode(', ', array_fill(0, count($campos), '?')) . ")", array_values($campos));
        $id = (int) db()->lastInsertId();
    }
    auditar($instalacao ? 'equip_instalar' : 'equip_salvar', 'equipamentos', $id, $tag);
    return linha("SELECT * FROM equipamentos WHERE id = ? AND tenant_id = ?", [$id, $tid]);
}

/* pendências abertas de uma lista de visitas (todas as linhas de pmoc_visitas de um cliente) */
function pm_pendencias_abertas($tid, $clienteIds) {
    if (!$clienteIds) return [];
    $out = [];
    foreach (linhas("SELECT v.id, v.plano_id, v.equipamento_id, v.ano, v.mes, v.dados, e.tag, e.ambiente, e.cliente_id, c.nome AS cliente_nome
                       FROM pmoc_visitas v JOIN pmoc_planos p ON p.tenant_id = v.tenant_id AND p.id = v.plano_id AND p.excluido_em IS NULL
                       LEFT JOIN equipamentos e ON e.tenant_id = v.tenant_id AND e.id = v.equipamento_id
                       JOIN clientes c ON c.tenant_id = p.tenant_id AND c.id = p.cliente_id
                      WHERE v.tenant_id = ? AND v.excluido_em IS NULL AND p.cliente_id IN (" . implode(',', array_map('intval', $clienteIds)) . ")
                        AND v.dados LIKE '%\"pend\"%' ORDER BY v.ano DESC, v.mes DESC, v.id DESC", [$tid]) as $v)
        foreach (pm_json($v['dados'])['pend'] ?? [] as $x) if (empty($x['resolvida']))
            $out[] = ['visitaId' => (int) $v['id'], 'id' => $x['id'] ?? '', 'texto' => $x['texto'] ?? '', 'prioridade' => $x['prioridade'] ?? null, 'material' => $x['material'] ?? null,
                      'em' => $x['em'] ?? null, 'por' => $x['por'] ?? null, 'osId' => $x['osId'] ?? null, 'osNumero' => $x['osNumero'] ?? null,
                      'planoId' => (int) $v['plano_id'], 'equipamentoId' => (int) $v['equipamento_id'], 'tag' => $v['tag'], 'ambiente' => $v['ambiente'],
                      'clienteId' => (int) $v['cliente_id'], 'clienteNome' => $v['cliente_nome'], 'ano' => (int) $v['ano'], 'mes' => (int) $v['mes']];
    return $out;
}

/* OS ligadas ao PMOC: ocorrências (OS de contrato) e qualquer OS ligada a um equipamento */
function pm_ocorrencias($tid, $u, $clienteIds, $equipId = 0, $lim = 60) {
    if (!$clienteIds && !$equipId) return [];
    $w = "o.tenant_id = ? AND o.excluido_em IS NULL"; $par = [$tid];
    if ($equipId) { $w .= " AND o.equipamento_id = ?"; $par[] = (int) $equipId; }
    else $w .= " AND o.cliente_id IN (" . implode(',', array_map('intval', $clienteIds)) . ") AND (o.tipo = 'contrato' OR o.equipamento_id IS NOT NULL)";
    if (so_tecnico($u)) { [$wt, $pt] = os_filtro_tecnico($u); $w .= $wt; $par = array_merge($par, $pt); }
    try {
        $rows = linhas("SELECT o.id, o.numero, o.tipo, o.status, o.prioridade, o.data_prev, o.orientacoes, o.checklist, o.criado_em, o.fechada_em, o.cliente_id,
                               c.nome AS cliente_nome, e.tag AS equip_tag, e.ambiente AS equip_ambiente, o.equipamento_id
                          FROM ordens_servico o JOIN clientes c ON c.tenant_id = o.tenant_id AND c.id = o.cliente_id
                          LEFT JOIN equipamentos e ON e.tenant_id = o.tenant_id AND e.id = o.equipamento_id
                         WHERE $w ORDER BY o.criado_em DESC, o.id DESC LIMIT " . (int) $lim, $par);
    } catch (Throwable $e) { return []; }   /* SQL 08 ainda não rodado */
    return array_map(function ($o) {
        $m = json_decode((string) $o['checklist'], true) ?: [];
        return ['id' => (int) $o['id'], 'numero' => $o['numero'], 'tipo' => $o['tipo'], 'status' => $o['status'], 'prioridade' => $o['prioridade'],
                'dataPrev' => $o['data_prev'], 'descricao' => mb_substr((string) $o['orientacoes'], 0, 400), 'tipoServico' => $m['tipoServico'] ?? null,
                'conclusao' => isset($m['conclusao']) ? mb_substr((string) $m['conclusao'], 0, 600) : null, 'finalizadoEm' => $m['finalizadoEm'] ?? null,
                'criadoEm' => $o['criado_em'], 'fechadaEm' => $o['fechada_em'], 'clienteId' => (int) $o['cliente_id'], 'clienteNome' => $o['cliente_nome'],
                'equipamentoId' => $o['equipamento_id'] !== null ? (int) $o['equipamento_id'] : null, 'tag' => $o['equip_tag'], 'ambiente' => $o['equip_ambiente']];
    }, $rows);
}

/* linha do tempo de um equipamento: preventivas (todos os anos), ocorrências e eventos (instalação, troca) */
function pm_equip_historico($e, $u) {
    $tid = (int) $u['tenant_id'];
    $eq = pm_equip_publico($e);
    $prev = [];
    foreach (linhas("SELECT v.*, p.cliente_id FROM pmoc_visitas v JOIN pmoc_planos p ON p.tenant_id = v.tenant_id AND p.id = v.plano_id
                      WHERE v.tenant_id = ? AND v.equipamento_id = ? AND v.excluido_em IS NULL AND v.status IN ('feita','andamento')
                      ORDER BY v.ano DESC, v.mes DESC LIMIT 120", [$tid, (int) $e['id']]) as $v) {
        $d = pm_json($v['dados']);
        $an = 0; $nf = 0; foreach ($d['itens'] ?? [] as $r) { if ($r === 'an') $an++; if ($r === 'nf') $nf++; }
        $prev[] = ['visitaId' => (int) $v['id'], 'planoId' => (int) $v['plano_id'], 'ano' => (int) $v['ano'], 'mes' => (int) $v['mes'], 'status' => $v['status'],
                   'tecnico' => $d['tecnico'] ?? null, 'feitaEm' => $d['feitaEm'] ?? null, 'an' => $an, 'nf' => $nf, 'resultado' => pm_resultado($d['itens'] ?? []),
                   'obs' => $d['obs'] ?? '', 'pend' => $d['pend'] ?? []];
    }
    $ano = (int) date('Y');
    $pl = pm_plano_do_equip($tid, (int) $e['id'], $ano);
    return ['equipamento' => $eq, 'clienteNome' => valor("SELECT nome FROM clientes WHERE id = ? AND tenant_id = ?", [$e['cliente_id'], $tid]),
            'preventivas' => $prev, 'ocorrencias' => pm_ocorrencias($tid, $u, [], (int) $e['id'], 100),
            'planoAtual' => $pl ? ['id' => (int) $pl['id'], 'ano' => $ano, 'mes' => (int) date('n')] : null];
}

/* ---------- v1.28.1: solicitações da área do cliente ---------- */
/* OS abertas a partir da solicitação (gravam tarefaId no meta da OS) */
function pm_os_da_solicitacao($tid, $tarefaId) {
    $id = (int) $tarefaId;
    return array_map(function ($o) {
        $m = json_decode((string) $o['checklist'], true) ?: [];
        return ['id' => (int) $o['id'], 'numero' => $o['numero'], 'status' => $o['status'], 'tipoServico' => $m['tipoServico'] ?? null,
                'quando' => $o['fechada_em'] ?: ($m['finalizadoEm'] ?? null) ?: ($o['data_prev'] ?: $o['criado_em']),
                'conclusao' => isset($m['conclusao']) ? mb_substr((string) $m['conclusao'], 0, 1500) : null,
                'equipamentoId' => $o['equipamento_id'] !== null ? (int) $o['equipamento_id'] : null, 'equipTag' => $o['equip_tag'],
                'equipLocal' => os_local_equip(os_andar_equip($o['equip_dados']), $o['equip_ambiente'])];
    }, linhas("SELECT o.id, o.numero, o.status, o.checklist, o.data_prev, o.criado_em, o.fechada_em, o.equipamento_id, e.tag AS equip_tag, e.ambiente AS equip_ambiente, e.dados AS equip_dados
                 FROM ordens_servico o LEFT JOIN equipamentos e ON e.tenant_id = o.tenant_id AND e.id = o.equipamento_id
                WHERE o.tenant_id = ? AND o.excluido_em IS NULL AND o.status <> 'Cancelada'
                  AND (o.checklist LIKE ? OR o.checklist LIKE ?) ORDER BY o.id", [$tid, '%"tarefaId":' . $id . ',%', '%"tarefaId":' . $id . '}%']));
}

/* solicitação que o usuário pode ver: cliente = só das unidades dele; escritório = qualquer uma */
function pm_solicitacao($u, $id) {
    $tid = (int) $u['tenant_id'];
    $t = linha("SELECT t.*, c.nome AS cliente_nome, cr.nome AS criador_nome FROM tarefas t JOIN clientes c ON c.tenant_id = t.tenant_id AND c.id = t.cliente_id
                 LEFT JOIN usuarios cr ON cr.tenant_id = t.tenant_id AND cr.id = t.criado_por
                WHERE t.id = ? AND t.tenant_id = ? AND t.excluido_em IS NULL AND t.tipo = 'Solicitação do cliente'", [(int) $id, $tid]);
    if (!$t) erro('Solicitação não encontrada.', 404, 'NAO_ENCONTRADO');
    if (($u['perfil'] ?? '') === 'cliente' && !in_array((int) $t['cliente_id'], unidades_cliente($u) ?: [], true)) erro('Solicitação não encontrada.', 404, 'NAO_ENCONTRADO');
    return $t;
}

function pm_solicitacao_publica($t, $tid) {
    $id = (int) $t['id'];
    $clientes = array_map('intval', array_column(linhas("SELECT id FROM usuarios WHERE tenant_id = ? AND perfil = 'cliente'", [$tid]), 'id'));
    return [
        'id' => $id, 'titulo' => preg_replace('/^Solicitação: /u', '', $t['titulo']),
        'descricao' => preg_replace('/\n\nEnviada pela área do cliente por .*$/su', '', (string) $t['descricao']),
        'status' => $t['status'], 'clienteId' => (int) $t['cliente_id'], 'clienteNome' => $t['cliente_nome'], 'por' => $t['criador_nome'],
        'criadoEm' => $t['criado_em'], 'feitaEm' => $t['feita_em'],
        'mensagens' => array_map(function ($c) use ($clientes) {
            return ['id' => (int) $c['id'], 'texto' => $c['texto'], 'autor' => $c['nome'] ?: $c['autor_nome'], 'criadoEm' => $c['criado_em'],
                    'doCliente' => $c['usuario_id'] !== null && in_array((int) $c['usuario_id'], $clientes, true)];
        }, linhas("SELECT c.*, u.nome FROM tarefa_comentarios c LEFT JOIN usuarios u ON u.tenant_id = c.tenant_id AND u.id = c.usuario_id
                    WHERE c.tenant_id = ? AND c.tarefa_id = ? AND c.excluido_em IS NULL ORDER BY c.criado_em, c.id", [$tid, $id])),
        'fotos' => array_map(function ($a) { return ['id' => (int) $a['id'], 'legenda' => $a['nome_original']]; },
            linhas("SELECT id, nome_original FROM anexos WHERE tenant_id = ? AND dono_tipo = 'tarefa' AND dono_id = ? AND excluido_em IS NULL ORDER BY id", [$tid, $id])),
        'os' => pm_os_da_solicitacao($tid, $id),
    ];
}

/* ---------- planos ---------- */

function pm_plano_da_empresa($id, $u) {
    $tid = (int) $u['tenant_id'];
    $p = linha("SELECT p.*, c.nome AS cliente_nome, c.numero AS cliente_numero, c.endereco AS cliente_endereco, c.documento AS cliente_documento,
                       c.contato AS cliente_contato, c.telefone AS cliente_telefone
                  FROM pmoc_planos p JOIN clientes c ON c.tenant_id = p.tenant_id AND c.id = p.cliente_id
                 WHERE p.id = ? AND p.tenant_id = ? AND p.excluido_em IS NULL", [(int) $id, $tid]);
    if (!$p) erro('Plano PMOC não encontrado.', 404, 'NAO_ENCONTRADO');
    if ($u['perfil'] === 'cliente') {
        if (!in_array((int) $p['cliente_id'], unidades_cliente($u) ?: [], true)) erro('Plano PMOC não encontrado.', 404, 'NAO_ENCONTRADO');
    } elseif (!pm_escritorio($u)) {
        if (!pm_tec_escalado($u, $p)) erro('Você não está escalado neste plano.', 403, 'SEM_PERMISSAO');
    }
    return $p;
}

function pm_plano_resumo($p, $tid, $mesRef) {
    $d = pm_json($p['dados']);
    $ids = array_map(function ($e) { return (int) $e['id']; }, $d['equip'] ?? []);
    $ativos = $ids ? array_map('intval', array_column(linhas("SELECT id FROM equipamentos WHERE tenant_id = ? AND excluido_em IS NULL AND id IN (" . implode(',', $ids) . ")", [$tid]), 'id')) : [];
    $feitas = $ativos ? (int) valor("SELECT COUNT(*) FROM pmoc_visitas WHERE tenant_id = ? AND plano_id = ? AND ano = ? AND mes = ? AND status = 'feita' AND excluido_em IS NULL
                                     AND equipamento_id IN (" . implode(',', $ativos) . ")", [$tid, $p['id'], $p['ano'], $mesRef]) : 0;
    $pend = 0;
    foreach (linhas("SELECT dados FROM pmoc_visitas WHERE tenant_id = ? AND plano_id = ? AND excluido_em IS NULL AND dados LIKE '%\"pend\"%'", [$tid, $p['id']]) as $v)
        foreach (pm_json($v['dados'])['pend'] ?? [] as $x) if (empty($x['resolvida'])) $pend++;
    return ['id' => (int) $p['id'], 'ano' => (int) $p['ano'], 'clienteId' => (int) $p['cliente_id'], 'clienteNome' => $p['cliente_nome'],
            'responsavelTecnico' => $p['responsavel_tecnico'], 'mesInicio' => (int) ($d['mesInicio'] ?? 1),
            'frequencia' => pm_freq($d), 'mesesServico' => pm_meses_servico($d),   /* v1.38.0 */
            'equipamentos' => count($ativos), 'feitasMes' => $feitas, 'mesRef' => $mesRef, 'pendencias' => $pend, 'atualizadoEm' => $p['atualizado_em'],
            'escalados' => count(array_filter(array_map('intval', $d['tecnicos'] ?? [])))];   /* v1.18.0 */
}

function pm_visita_publica($v) {
    $d = pm_json($v['dados']);
    return ['id' => (int) $v['id'], 'equipamentoId' => (int) $v['equipamento_id'], 'ano' => (int) $v['ano'], 'mes' => (int) $v['mes'], 'status' => $v['status'],
            'itens' => (object) ($d['itens'] ?? []), 'med' => (object) ($d['med'] ?? []), 'obs' => $d['obs'] ?? '', 'pend' => $d['pend'] ?? [],
            'tecnico' => $d['tecnico'] ?? null, 'feitaEm' => $d['feitaEm'] ?? null, 'versao' => $v['atualizado_em'], 'fotos' => [],
            'resultado' => pm_resultado($d['itens'] ?? [])];   /* v1.34.0 */
}

function pm_plano_completo($p, $u, $mes, $anoTodo = false) {
    $tid = (int) $u['tenant_id'];
    $d = pm_json($p['dados']);
    $ano = (int) $p['ano'];
    $mesInicio = (int) ($d['mesInicio'] ?? 1);
    $ids = array_map(function ($e) { return (int) $e['id']; }, $d['equip'] ?? []);
    $porId = [];
    if ($ids) foreach (linhas("SELECT * FROM equipamentos WHERE tenant_id = ? AND excluido_em IS NULL AND id IN (" . implode(',', $ids) . ")", [$tid]) as $e) $porId[(int) $e['id']] = $e;
    $equip = [];
    foreach ($d['equip'] ?? [] as $x) {
        $id = (int) $x['id'];
        if (!isset($porId[$id])) continue;
        $equip[] = array_merge(pm_equip_publico($porId[$id]), ['modeloId' => (int) ($x['modeloId'] ?? 0)]);
    }
    $modelos = [];
    foreach ($d['modelos'] ?? [] as $mid => $m) $modelos[(string) $mid] = ['nome' => $m['nome'] ?? 'Formulário', 'secoes' => pm_normalizar_form($m)['secoes']];

    /* mapa do ano: status de cada equipamento em cada mês */
    $mapa = []; $mesesComVisita = []; $pendAbertas = []; $visitasMes = []; $visitasAno = []; $pendSanadas = []; $mesesInfo = []; $ultima = []; $resMapa = [];
    foreach (linhas("SELECT * FROM pmoc_visitas WHERE tenant_id = ? AND plano_id = ? AND ano = ? AND excluido_em IS NULL ORDER BY mes", [$tid, $p['id'], $ano]) as $v) {
        $eid = (int) $v['equipamento_id'];
        $mapa[$eid][(int) $v['mes']] = $v['status'];
        $pv = pm_visita_publica($v);
        if ($v['status'] !== 'prevista') $mesesComVisita[(int) $v['mes']] = 1;   /* v1.38.0 */
        if ($v['status'] === 'feita') $resMapa[$eid][(int) $v['mes']] = $pv['resultado'];   /* v1.34.0 */
        foreach ($pv['pend'] as $x) {
            if (empty($x['resolvida'])) $pendAbertas[] = array_merge($x, ['visitaId' => $pv['id'], 'equipamentoId' => $eid, 'mes' => $pv['mes']]);
            else $pendSanadas[] = array_merge($x, ['equipamentoId' => $eid, 'mes' => $pv['mes']]);
        }
        if ((int) $v['mes'] === $mes) $visitasMes[$eid] = $pv;
        /* v1.16.0: livro do PMOC e relatório anual precisam do ano inteiro */
        if ($anoTodo) $visitasAno[$eid][(int) $v['mes']] = ['status' => $pv['status'], 'itens' => $pv['itens'], 'med' => $pv['med'], 'tecnico' => $pv['tecnico'], 'feitaEm' => $pv['feitaEm'], 'resultado' => $pv['resultado']];
        $mi = (int) $v['mes'];
        if ($pv['tecnico'] && empty($mesesInfo[$mi]['tecnico'])) $mesesInfo[$mi]['tecnico'] = $pv['tecnico'];
        if ($pv['feitaEm'] && (empty($mesesInfo[$mi]['ultimaEm']) || $pv['feitaEm'] > $mesesInfo[$mi]['ultimaEm'])) $mesesInfo[$mi]['ultimaEm'] = $pv['feitaEm'];
        if ($v['status'] === 'feita' && $pv['feitaEm'] && (empty($ultima[$eid]) || $pv['feitaEm'] > $ultima[$eid])) $ultima[$eid] = $pv['feitaEm'];
    }
    if ($visitasMes) {
        $vids = array_map(function ($v) { return $v['id']; }, array_values($visitasMes));
        $porVisita = [];
        foreach ($visitasMes as $eid => $v) $porVisita[$v['id']] = $eid;
        foreach (linhas("SELECT a.id, a.dono_id, a.nome_original, a.criado_em, us.nome AS autor FROM anexos a LEFT JOIN usuarios us ON us.tenant_id = a.tenant_id AND us.id = a.criado_por
                          WHERE a.tenant_id = ? AND a.dono_tipo = 'pmoc' AND a.excluido_em IS NULL AND a.dono_id IN (" . implode(',', $vids) . ") ORDER BY a.id", [$tid]) as $a)
            $visitasMes[$porVisita[(int) $a['dono_id']]]['fotos'][] = ['id' => (int) $a['id'], 'legenda' => $a['nome_original'], 'autor' => $a['autor'], 'criadoEm' => $a['criado_em']];
    }
    $tec = array_map('intval', $d['tecnicos'] ?? []);
    $tecNomes = $tec ? array_column(linhas("SELECT nome FROM usuarios WHERE tenant_id = ? AND id IN (" . implode(',', $tec) . ") ORDER BY nome", [$tid]), 'nome') : [];
    /* v1.18.0: técnico de cada mês (como no painel antigo) */
    $tecMes = []; foreach (is_array($d['tecMes'] ?? null) ? $d['tecMes'] : [] as $m => $t) if ((int) $m >= 1 && (int) $m <= 12 && $t) $tecMes[(string) (int) $m] = (int) $t;
    $nomesMes = [];
    if ($tecMes) foreach (linhas("SELECT id, nome FROM usuarios WHERE tenant_id = ? AND id IN (" . implode(',', array_unique(array_values($tecMes))) . ")", [$tid]) as $r) $nomesMes[(int) $r['id']] = $r['nome'];
    $tecMesNomes = []; foreach ($tecMes as $m => $t) if (isset($nomesMes[$t])) $tecMesNomes[$m] = $nomesMes[$t];
    return [
        'id' => (int) $p['id'], 'ano' => $ano, 'mes' => $mes, 'mesInicio' => $mesInicio,
        'frequencia' => pm_freq($d), 'mesesServico' => pm_meses_servico($d, array_keys($mesesComVisita)),   /* v1.38.0 */
        'clienteId' => (int) $p['cliente_id'], 'clienteNome' => $p['cliente_nome'], 'clienteNumero' => (int) $p['cliente_numero'],
        'clienteDocumento' => $p['cliente_documento'], 'clienteContato' => $p['cliente_contato'], 'clienteTelefone' => $p['cliente_telefone'],
        'endereco' => ($d['endereco'] ?? '') !== '' ? $d['endereco'] : $p['cliente_endereco'],
        'responsavelTecnico' => $p['responsavel_tecnico'], 'registro' => $d['registro'] ?? '', 'art' => $d['art'] ?? '', 'obs' => $d['obs'] ?? '',
        'tecnicos' => $tec, 'tecnicosNomes' => $tecNomes, 'tecMes' => (object) $tecMes, 'tecMesNomes' => (object) $tecMesNomes,
        'equipamentos' => $equip, 'modelos' => (object) $modelos,
        'visitas' => (object) $visitasMes, 'mapa' => (object) array_map(function ($m) { return (object) $m; }, $mapa),
        'resMapa' => (object) array_map(function ($m) { return (object) $m; }, $resMapa),   /* v1.34.0: executado / parcial / pendencia */
        'pendencias' => $pendAbertas, 'atualizadoEm' => $p['atualizado_em'],
        'pendSanadas' => $pendSanadas, 'mesesInfo' => (object) $mesesInfo, 'ultimaManutencao' => (object) $ultima,
        'prevMes' => (object) (is_array($d['prevMes'] ?? null) ? $d['prevMes'] : []), 'normasExtra' => array_values(is_array($d['normasExtra'] ?? null) ? $d['normasExtra'] : []),   /* v1.27.0 */
        'regime' => $d['regime'] ?? '', 'visitasAno' => $anoTodo ? (object) array_map(function ($m) { return (object) $m; }, $visitasAno) : null,
    ];
}

/* garante a linha da visita (equipamento × mês) — usada por fotos e apontamentos */
function pm_visita_linha($p, $equipId, $mes, $tid, $criar) {
    $d = pm_json($p['dados']);
    $noPlano = array_map(function ($e) { return (int) $e['id']; }, $d['equip'] ?? []);
    if (!in_array((int) $equipId, $noPlano, true)) erro('Este equipamento não faz parte do plano.', 400);
    if ($mes < 1 || $mes > 12) erro('Mês inválido.');
    $v = linha("SELECT * FROM pmoc_visitas WHERE tenant_id = ? AND plano_id = ? AND equipamento_id = ? AND ano = ? AND mes = ? AND excluido_em IS NULL ORDER BY id LIMIT 1",
               [$tid, $p['id'], $equipId, $p['ano'], $mes]);
    if (!$v && $criar) {
        q("INSERT INTO pmoc_visitas (tenant_id, plano_id, equipamento_id, ano, mes, status, dados) VALUES (?, ?, ?, ?, ?, 'prevista', NULL)",
          [$tid, $p['id'], $equipId, $p['ano'], $mes]);
        $v = linha("SELECT * FROM pmoc_visitas WHERE id = ? AND tenant_id = ?", [(int) db()->lastInsertId(), $tid]);
    }
    return $v;
}

return [

    'opcoes' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        return [
            'modelos' => pm_modelos($tid),
            'equipe' => array_map(function ($r) { return ['id' => (int) $r['id'], 'nome' => $r['nome'], 'perfil' => $r['perfil'], 'registro' => $r['registro']]; },
                linhas("SELECT id, nome, perfil, registro FROM usuarios WHERE tenant_id = ? AND excluido_em IS NULL AND status = 'ativo' AND perfil IN ('admin','coord','tecnico') ORDER BY nome", [$tid])),
            'periodicidades' => ['M' => 'Mensal', 'T' => 'Trimestral', 'S' => 'Semestral', 'A' => 'Anual'],
            'frequencias' => PMOC_FREQ,   /* v1.38.0: periodicidade das visitas do plano */
            'tipos' => pm_tipos($tid),   /* v1.18.0 */
            'podeEditar' => pm_escritorio($u),
        ];
    },

    /* v1.18.0: tipos de equipamento da empresa {itens:[{nome, codigo, modeloId?}]} */
    'tipos.salvar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $mods = array_map('intval', array_column(pm_modelos($tid), 'id'));
        $out = []; $nomes = []; $cods = [];
        foreach (is_array($d['itens'] ?? null) ? $d['itens'] : [] as $i => $x) {
            if (!is_array($x)) continue;
            $nome = txt($x['nome'] ?? '', 60);
            if ($nome === '') continue;
            $cod = strtoupper(preg_replace('/[^A-Za-z]/', '', (string) ($x['codigo'] ?? '')));
            if (strlen($cod) < 2 || strlen($cod) > 3) erro('O código da TAG de "' . $nome . '" deve ter 2 ou 3 letras (ex.: HW, PT).');
            $k = pm_chave_tipo($nome);
            if (isset($nomes[$k])) erro('O tipo "' . $nome . '" está repetido.');
            if (isset($cods[$cod])) erro('O código ' . $cod . ' está em dois tipos. Cada tipo precisa de um código diferente.');
            $nomes[$k] = 1; $cods[$cod] = 1;
            $mid = (int) ($x['modeloId'] ?? 0);
            $out[] = ['nome' => $nome, 'codigo' => $cod, 'modeloId' => in_array($mid, $mods, true) ? $mid : null];
        }
        if (!$out) erro('Cadastre pelo menos um tipo de equipamento.');
        if (count($out) > 80) erro('Máximo de 80 tipos.');
        q("INSERT INTO config (tenant_id, chave, valor) VALUES (?, 'tipos_equipamento', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
          [$tid, json_encode($out, JSON_UNESCAPED_UNICODE)]);
        auditar('pmoc_tipos', 'config', null, count($out) . ' tipos');
        return ['tipos' => $out];
    },

    /* ---------------- formulários ---------------- */

    'modelo.salvar' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $nome = txt($d['nome'] ?? '', 150);
        if ($nome === '') erro('Dê um nome ao formulário.');
        $f = pm_normalizar_form($d);
        if (!$f['secoes']) erro('O formulário precisa de pelo menos uma seção com itens.');
        $id = (int) ($d['id'] ?? 0);
        if ($id) {
            if (!valor("SELECT id FROM pmoc_modelos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid])) erro('Formulário não encontrado.', 404, 'NAO_ENCONTRADO');
            q("UPDATE pmoc_modelos SET nome = ?, itens = ? WHERE id = ? AND tenant_id = ?", [$nome, pm_enc($f), $id, $tid]);
        } else {
            q("INSERT INTO pmoc_modelos (tenant_id, nome, periodicidade, itens) VALUES (?, ?, 'mensal', ?)", [$tid, $nome, pm_enc($f)]);
            $id = (int) db()->lastInsertId();
        }
        auditar('pmoc_modelo_salvar', 'pmoc_modelos', $id, $nome);
        return ['id' => $id, 'modelos' => pm_modelos($tid)];
    },

    'modelo.excluir' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        if ((int) valor("SELECT COUNT(*) FROM pmoc_modelos WHERE tenant_id = ? AND excluido_em IS NULL AND ativo = 1", [$tid]) <= 1) erro('Mantenha pelo menos um formulário.');
        q("UPDATE pmoc_modelos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$id, $tid]);
        auditar('pmoc_modelo_excluir', 'pmoc_modelos', $id);
        return ['modelos' => pm_modelos($tid)];   /* planos já criados guardam a própria cópia */
    },

    /* ---------------- equipamentos ---------------- */

    'equip.listar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $cli = (int) ($d['clienteId'] ?? 0);
        if (!$cli) erro('Informe o cliente.');
        pm_exigir_cliente($u, $cli);   /* v1.18.0: técnico só lista máquinas de cliente em que está escalado */
        return ['itens' => array_map('pm_equip_publico', linhas("SELECT * FROM equipamentos WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL ORDER BY tag, id", [$tid, $cli]))];
    },

    'equip.salvar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        return pm_equip_publico(pm_equip_gravar($d, $u));
    },

    'equip.excluir' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        q("UPDATE equipamentos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$id, $tid]);
        auditar('equip_excluir', 'equipamentos', $id);
        return ['id' => $id];   /* apontamentos antigos continuam guardados */
    },

    /* ---------------- planos ---------------- */

    'listar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $ano = (int) ($d['ano'] ?? date('Y'));
        $mes = (int) ($d['mes'] ?? 0);
        if ($mes < 1 || $mes > 12) $mes = $ano === (int) date('Y') ? (int) date('n') : 1;
        $busca = txt($d['busca'] ?? '', 100);
        $w = "p.tenant_id = ? AND p.ano = ? AND p.excluido_em IS NULL"; $par = [$tid, $ano];
        if ($busca !== '') { $w .= " AND c.nome LIKE ?"; $par[] = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $busca) . '%'; }
        $out = [];
        foreach (linhas("SELECT p.*, c.nome AS cliente_nome FROM pmoc_planos p JOIN clientes c ON c.tenant_id = p.tenant_id AND c.id = p.cliente_id WHERE $w ORDER BY c.nome", $par) as $p) {
            if (!pm_tec_escalado($u, $p)) continue;   /* v1.18.0: técnico vê só os planos em que está escalado */
            $out[] = pm_plano_resumo($p, $tid, $mes);
        }
        return ['itens' => $out, 'ano' => $ano, 'mes' => $mes];
    },

    'obter' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'cliente');   /* cliente: só leitura, só as próprias unidades */
        $p = pm_plano_da_empresa($d['id'] ?? 0, $u);
        $mes = (int) ($d['mes'] ?? 0);
        if ($mes < 1 || $mes > 12) $mes = (int) $p['ano'] === (int) date('Y') ? (int) date('n') : 1;
        return pm_plano_completo($p, $u, $mes, !empty($d['anoTodo']));
    },

    /* {id?, clienteId, ano, responsavelTecnico, registro, art, endereco, mesInicio, tecnicos[], equip:[{id, modeloId}], obs} */
    'salvar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $id = (int) ($d['id'] ?? 0);
        $atual = $id ? pm_plano_da_empresa($id, $u) : null;
        $cli = $atual ? (int) $atual['cliente_id'] : (int) ($d['clienteId'] ?? 0);
        $ano = $atual ? (int) $atual['ano'] : (int) ($d['ano'] ?? 0);
        if (!$cli || !valor("SELECT id FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$cli, $tid])) erro('Escolha o cliente do plano.');
        if ($ano < 2020 || $ano > 2100) erro('Ano inválido.');
        if (!$id && valor("SELECT id FROM pmoc_planos WHERE tenant_id = ? AND cliente_id = ? AND ano = ? AND excluido_em IS NULL", [$tid, $cli, $ano]))
            erro('Este cliente já tem plano PMOC em ' . $ano . '. Abra o plano existente.');
        $dados = $atual ? pm_json($atual['dados']) : [];
        $mi = (int) ($d['mesInicio'] ?? ($dados['mesInicio'] ?? 1));
        $dados['mesInicio'] = $mi >= 1 && $mi <= 12 ? $mi : 1;
        if (array_key_exists('frequencia', $d)) {   /* v1.38.0 */
            if (!isset(PMOC_FREQ[(string) $d['frequencia']])) erro('Periodicidade das visitas inválida.');
            $dados['frequencia'] = (string) $d['frequencia'];
        }
        foreach (['registro' => 60, 'art' => 60, 'endereco' => 255, 'obs' => 3000, 'regime' => 120] as $k => $max) if (array_key_exists($k, $d)) $dados[$k] = txt($d[$k], $max);
        if (array_key_exists('tecnicos', $d)) {
            $tec = array_values(array_unique(array_filter(array_map('intval', is_array($d['tecnicos']) ? $d['tecnicos'] : []))));
            $dados['tecnicos'] = $tec ? array_map('intval', array_column(linhas("SELECT id FROM usuarios WHERE tenant_id = ? AND excluido_em IS NULL AND id IN (" . implode(',', $tec) . ")", [$tid]), 'id')) : [];
        }
        /* v1.18.0: técnico por mês {tecMes:{"10": id|null}} e "ano todo" {anoTodo: id} */
        $valido = function ($id) use ($tid) { return $id && valor("SELECT id FROM usuarios WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL AND perfil IN ('admin','coord','tecnico')", [(int) $id, $tid]) ? (int) $id : null; };
        if (array_key_exists('anoTodo', $d)) {
            $t = $valido($d['anoTodo']);
            if (!$t) erro('Escolha o técnico.');
            $dados['tecnicos'] = [$t];
            $dados['tecMes'] = []; for ($m = 1; $m <= 12; $m++) $dados['tecMes'][(string) $m] = $t;
        }
        if (is_array($d['tecMes'] ?? null)) {
            $tm = is_array($dados['tecMes'] ?? null) ? $dados['tecMes'] : [];
            foreach ($d['tecMes'] as $m => $t) {
                $m = (int) $m; if ($m < 1 || $m > 12) continue;
                $t = $t ? $valido($t) : null;
                if ($t) $tm[(string) $m] = $t; else unset($tm[(string) $m]);
            }
            $dados['tecMes'] = $tm;
        }
        /* v1.27.0: data prevista de cada mês {prevMes:{"10":"2026-10-15"|null}} e normas adicionais do cliente */
        if (is_array($d['prevMes'] ?? null)) {
            $pm = is_array($dados['prevMes'] ?? null) ? $dados['prevMes'] : [];
            foreach ($d['prevMes'] as $m => $dt) {
                $m = (int) $m; if ($m < 1 || $m > 12) continue;
                $dt = (string) ($dt ?? '');
                if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dt) && checkdate((int) substr($dt, 5, 2), (int) substr($dt, 8, 2), (int) substr($dt, 0, 4))) $pm[(string) $m] = $dt;
                else unset($pm[(string) $m]);
            }
            $dados['prevMes'] = $pm;
        }
        if (array_key_exists('normasExtra', $d)) {
            $dados['normasExtra'] = array_values(array_unique(array_filter(array_map(function ($x) { return txt($x, 80); }, array_slice(is_array($d['normasExtra']) ? $d['normasExtra'] : [], 0, 30)))));
        }
        if (array_key_exists('equip', $d)) {
            $mods = []; foreach (pm_modelos($tid) as $m) $mods[$m['id']] = $m;
            $eq = []; $vistos = [];
            foreach (is_array($d['equip']) ? $d['equip'] : [] as $x) {
                $eid = (int) ($x['id'] ?? 0);
                if (!$eid || isset($vistos[$eid])) continue;
                if (!valor("SELECT id FROM equipamentos WHERE id = ? AND tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL", [$eid, $tid, $cli])) continue;
                $mid = (int) ($x['modeloId'] ?? 0);
                if (!isset($mods[$mid]) && !isset($dados['modelos'][(string) $mid])) { reset($mods); $mid = (int) key($mods); }
                /* congela a cópia do formulário no plano (só se ainda não houver) */
                if (!isset($dados['modelos'][(string) $mid]) && isset($mods[$mid])) $dados['modelos'][(string) $mid] = ['nome' => $mods[$mid]['nome'], 'secoes' => $mods[$mid]['secoes']];
                $eq[] = ['id' => $eid, 'modeloId' => $mid]; $vistos[$eid] = 1;
            }
            $dados['equip'] = $eq;
        }
        /* atualizar a cópia de um formulário dentro do plano (pedido explícito) */
        if (!empty($d['atualizarModelo'])) {
            foreach (pm_modelos($tid) as $m) if ($m['id'] === (int) $d['atualizarModelo']) $dados['modelos'][(string) $m['id']] = ['nome' => $m['nome'], 'secoes' => $m['secoes']];
        }
        $resp = txt_ou_null($d['responsavelTecnico'] ?? ($atual['responsavel_tecnico'] ?? ''), 150);
        if ($id) {
            q("UPDATE pmoc_planos SET responsavel_tecnico = ?, dados = ? WHERE id = ? AND tenant_id = ?", [$resp, pm_enc($dados), $id, $tid]);
            auditar('pmoc_plano_editar', 'pmoc_planos', $id, $ano . ' cliente ' . $cli);
        } else {
            q("INSERT INTO pmoc_planos (tenant_id, cliente_id, ano, responsavel_tecnico, dados) VALUES (?, ?, ?, ?, ?)", [$tid, $cli, $ano, $resp, pm_enc($dados)]);
            $id = (int) db()->lastInsertId();
            auditar('pmoc_plano_criar', 'pmoc_planos', $id, $ano . ' cliente ' . $cli);
        }
        $mes = (int) ($d['mes'] ?? 0);
        if ($mes < 1 || $mes > 12) $mes = $ano === (int) date('Y') ? (int) date('n') : 1;
        return pm_plano_completo(pm_plano_da_empresa($id, $u), $u, $mes);
    },

    'excluir' => function ($d) {
        $u = exigir_perfil('admin');
        $p = pm_plano_da_empresa($d['id'] ?? 0, $u);
        q("UPDATE pmoc_planos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$p['id'], $p['tenant_id']]);
        auditar('pmoc_plano_excluir', 'pmoc_planos', (int) $p['id'], $p['ano'] . ' ' . $p['cliente_nome']);
        return ['id' => (int) $p['id']];
    },

    /* ---------------- apontamento (técnico) ----------------
       {planoId, equipamentoId, mes, itens{}, med{}, obs, pendNovas[], concluir, _base}
       _base = versão que o aparelho tinha quando abriu. Se outra pessoa salvou depois,
       o servidor recusa (CONFLITO) em vez de sobrescrever. */
    'visita.salvar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $p = pm_plano_da_empresa($d['planoId'] ?? 0, $u);
        $mes = (int) ($d['mes'] ?? 0);
        $eid = (int) ($d['equipamentoId'] ?? 0);
        db()->beginTransaction();
        $v = pm_visita_linha($p, $eid, $mes, $tid, true);
        $v = linha("SELECT * FROM pmoc_visitas WHERE id = ? AND tenant_id = ? FOR UPDATE", [$v['id'], $tid]);
        $velho = pm_json($v['dados']);
        $base = array_key_exists('_base', $d) ? (string) ($d['_base'] ?? '') : null;
        if ($base !== null && $velho && $base !== (string) $v['atualizado_em']) {
            db()->rollBack();
            $eq = linha("SELECT tag FROM equipamentos WHERE id = ? AND tenant_id = ?", [$eid, $tid]);
            erro('O equipamento ' . ($eq['tag'] ?? '') . ' (' . $mes . '/' . $p['ano'] . ') foi apontado por ' . ($velho['tecnico'] ?? 'outra pessoa') . ' enquanto você editava. Abra de novo e confira.', 409, 'CONFLITO');
        }
        $itens = [];
        foreach (is_array($d['itens'] ?? null) ? $d['itens'] : [] as $k => $val) if (preg_match('/^\d{1,2}-\d{1,3}$/', (string) $k) && in_array($val, PMOC_APONT, true)) $itens[$k] = $val;
        $med = [];
        foreach (is_array($d['med'] ?? null) ? $d['med'] : [] as $k => $val) if (preg_match('/^\d{1,2}-\d{1,3}$/', (string) $k) && trim((string) $val) !== '') $med[$k] = txt($val, 20);
        $pend = $velho['pend'] ?? [];
        foreach (is_array($d['pendNovas'] ?? null) ? $d['pendNovas'] : [] as $t) {
            $obj = is_array($t) ? $t : [];
            $t = txt(is_array($t) ? ($t['texto'] ?? '') : $t, 1000);
            /* v1.17.1: prioridade e material/peça (saem no PMOC do mês e no relatório mensal) */
            $pri = in_array($obj['prioridade'] ?? '', ['Baixa', 'Normal', 'Alta', 'Urgente'], true) ? $obj['prioridade'] : 'Normal';
            $mat = txt($obj['material'] ?? '', 300);
            if ($t !== '') $pend[] = ['id' => bin2hex(random_bytes(5)), 'texto' => $t, 'prioridade' => $pri, 'material' => $mat !== '' ? $mat : null,
                                      'em' => date('Y-m-d H:i:s'), 'por' => $u['nome'], 'resolvida' => false];
        }
        $concluir = !empty($d['concluir']);
        $novo = ['itens' => (object) $itens, 'med' => (object) $med, 'obs' => txt($d['obs'] ?? '', 3000), 'pend' => $pend,
                 'tecnico' => $u['nome'], 'feitaEm' => $concluir ? date('Y-m-d H:i:s') : ($velho['feitaEm'] ?? null)];
        $status = $concluir ? 'feita' : ($v['status'] === 'feita' ? 'feita' : 'andamento');
        q("UPDATE pmoc_visitas SET status = ?, dados = ? WHERE id = ? AND tenant_id = ?", [$status, pm_enc($novo), $v['id'], $tid]);
        db()->commit();
        $v = linha("SELECT * FROM pmoc_visitas WHERE id = ? AND tenant_id = ?", [$v['id'], $tid]);
        $out = pm_visita_publica($v);
        foreach (linhas("SELECT a.id, a.nome_original, a.criado_em, us.nome AS autor FROM anexos a LEFT JOIN usuarios us ON us.tenant_id = a.tenant_id AND us.id = a.criado_por
                          WHERE a.tenant_id = ? AND a.dono_tipo = 'pmoc' AND a.dono_id = ? AND a.excluido_em IS NULL ORDER BY a.id", [$tid, $v['id']]) as $a)
            $out['fotos'][] = ['id' => (int) $a['id'], 'legenda' => $a['nome_original'], 'autor' => $a['autor'], 'criadoEm' => $a['criado_em']];
        return $out;
    },

    /* reabrir um equipamento concluído (só escritório) */
    'visita.reabrir' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $v = linha("SELECT v.* FROM pmoc_visitas v WHERE v.id = ? AND v.tenant_id = ? AND v.excluido_em IS NULL", [(int) ($d['visitaId'] ?? 0), $tid]);
        if (!$v) erro('Apontamento não encontrado.', 404, 'NAO_ENCONTRADO');
        pm_plano_da_empresa($v['plano_id'], $u);
        q("UPDATE pmoc_visitas SET status = 'andamento' WHERE id = ? AND tenant_id = ?", [$v['id'], $tid]);
        return pm_visita_publica(linha("SELECT * FROM pmoc_visitas WHERE id = ? AND tenant_id = ?", [$v['id'], $tid]));
    },

    'pendencia.resolver' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $v = linha("SELECT * FROM pmoc_visitas WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['visitaId'] ?? 0), $tid]);
        if (!$v) erro('Pendência não encontrada.', 404, 'NAO_ENCONTRADO');
        pm_plano_da_empresa($v['plano_id'], $u);
        $dados = pm_json($v['dados']); $achou = false;
        foreach ($dados['pend'] ?? [] as $i => $x) if (($x['id'] ?? '') === (string) ($d['pendenciaId'] ?? '')) {
            $achou = true; $reabrir = !empty($d['reabrir']);
            $dados['pend'][$i]['resolvida'] = !$reabrir;
            $dados['pend'][$i]['resolvidaEm'] = $reabrir ? null : date('Y-m-d H:i:s');
            $dados['pend'][$i]['resolvidaPor'] = $reabrir ? null : $u['nome'];
            $dados['pend'][$i]['resolvidaNota'] = $reabrir ? null : (txt($d['nota'] ?? '', 1000) ?: null);
        }
        if (!$achou) erro('Pendência não encontrada.', 404, 'NAO_ENCONTRADO');
        q("UPDATE pmoc_visitas SET dados = ? WHERE id = ? AND tenant_id = ?", [pm_enc($dados), $v['id'], $tid]);
        return pm_visita_publica(linha("SELECT * FROM pmoc_visitas WHERE id = ? AND tenant_id = ?", [$v['id'], $tid]));
    },

    /* upload multipart: acao=pmoc.foto.enviar, planoId, equipamentoId, mes, legenda?, arquivo=<imagem>
       Cria a linha da visita se ainda não existir, sem mexer na versão do apontamento. */
    'foto.enviar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $p = pm_plano_da_empresa($d['planoId'] ?? 0, $u);
        $v = pm_visita_linha($p, (int) ($d['equipamentoId'] ?? 0), (int) ($d['mes'] ?? 0), $tid, true);
        $id = salvar_anexo($_FILES['arquivo'] ?? null, 'pmoc', (int) $v['id'], 'foto', true);
        $leg = txt($d['legenda'] ?? '', 200);
        if ($leg !== '') q("UPDATE anexos SET nome_original = ? WHERE id = ? AND tenant_id = ?", [$leg, $id, $tid]);
        return ['id' => $id, 'visitaId' => (int) $v['id'], 'equipamentoId' => (int) $v['equipamento_id'], 'mes' => (int) $v['mes'],
                'legenda' => $leg !== '' ? $leg : null, 'autor' => $u['nome'], 'criadoEm' => date('Y-m-d H:i:s')];
    },

    'foto.excluir' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $a = linha("SELECT a.*, v.plano_id FROM anexos a JOIN pmoc_visitas v ON v.tenant_id = a.tenant_id AND v.id = a.dono_id
                     WHERE a.id = ? AND a.tenant_id = ? AND a.dono_tipo = 'pmoc' AND a.excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid]);
        if (!$a) erro('Foto não encontrada.', 404, 'NAO_ENCONTRADO');
        pm_plano_da_empresa($a['plano_id'], $u);
        if (!pm_escritorio($u) && (int) $a['criado_por'] !== (int) $u['id']) erro('Só quem tirou a foto pode apagar.', 403, 'SEM_PERMISSAO');
        q("UPDATE anexos SET excluido_em = NOW() WHERE id = ? AND tenant_id = ?", [$a['id'], $tid]);
        return ['id' => (int) $a['id']];
    },

    /* =====================================================================
       v1.13.0
       ===================================================================== */

    /* instalação nova (técnico em campo também pode): cadastra e já põe no plano do ano.
       {clienteId, tag, ambiente, tipo, ..., modeloId?} */
    'equip.instalar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $cli = (int) ($d['clienteId'] ?? 0);
        pm_exigir_cliente($u, $cli);
        db()->beginTransaction();
        $e = pm_equip_gravar($d, $u, true);
        $ano = (int) date('Y');
        $p = linha("SELECT * FROM pmoc_planos WHERE tenant_id = ? AND cliente_id = ? AND ano = ? AND excluido_em IS NULL ORDER BY id LIMIT 1", [$tid, $cli, $ano]);
        $planoId = null;
        if ($p) {
            $dados = pm_json($p['dados']);
            $mods = []; foreach (pm_modelos($tid) as $m) $mods[$m['id']] = $m;
            $mid = (int) ($d['modeloId'] ?? 0);
            if (!isset($mods[$mid]) && !isset($dados['modelos'][(string) $mid])) { reset($mods); $mid = (int) key($mods); }
            if (!isset($dados['modelos'][(string) $mid]) && isset($mods[$mid])) $dados['modelos'][(string) $mid] = ['nome' => $mods[$mid]['nome'], 'secoes' => $mods[$mid]['secoes']];
            $dados['equip'] = array_values(array_filter($dados['equip'] ?? [], function ($x) use ($e) { return (int) ($x['id'] ?? 0) !== (int) $e['id']; }));
            $dados['equip'][] = ['id' => (int) $e['id'], 'modeloId' => $mid];
            q("UPDATE pmoc_planos SET dados = ? WHERE id = ? AND tenant_id = ?", [pm_enc($dados), $p['id'], $tid]);
            $planoId = (int) $p['id'];
        }
        db()->commit();
        return ['equipamento' => pm_equip_publico($e), 'planoId' => $planoId];
    },

    /* {id} → ficha + linha do tempo (preventivas, ocorrências, instalação/trocas) */
    'equip.historico' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'cliente');
        $tid = tenant();
        $e = linha("SELECT * FROM equipamentos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid]);
        if (!$e) erro('Equipamento não encontrado.', 404, 'NAO_ENCONTRADO');
        if (!pm_pode_cliente($u, (int) $e['cliente_id'])) erro('Equipamento não encontrado.', 404, 'NAO_ENCONTRADO');
        return pm_equip_historico($e, $u);
    },

    /* v1.34.0: {id, meses?} → o que foi marcado em cada item do checklist, visita a visita (aba Histórico do apontamento).
       Os nomes dos itens vêm da cópia do formulário guardada em cada plano, então valem também para anos anteriores. */
    'equip.acoes' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'cliente');
        $tid = tenant();
        $e = linha("SELECT * FROM equipamentos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid]);
        if (!$e || !pm_pode_cliente($u, (int) $e['cliente_id'])) erro('Equipamento não encontrado.', 404, 'NAO_ENCONTRADO');
        $lim = max(1, min(36, (int) ($d['meses'] ?? 24)));
        $planos = []; $out = [];
        foreach (linhas("SELECT v.* FROM pmoc_visitas v JOIN pmoc_planos p ON p.tenant_id = v.tenant_id AND p.id = v.plano_id
                          WHERE v.tenant_id = ? AND v.equipamento_id = ? AND v.excluido_em IS NULL AND v.status IN ('feita','andamento')
                          ORDER BY v.ano DESC, v.mes DESC LIMIT $lim", [$tid, (int) $e['id']]) as $v) {
            $pid = (int) $v['plano_id'];
            if (!array_key_exists($pid, $planos)) {
                $pl = linha("SELECT dados FROM pmoc_planos WHERE id = ? AND tenant_id = ?", [$pid, $tid]);
                $pd = $pl ? pm_json($pl['dados']) : [];
                $mid = null;
                foreach ($pd['equip'] ?? [] as $x) if ((int) ($x['id'] ?? 0) === (int) $e['id']) { $mid = (string) ($x['modeloId'] ?? ''); break; }
                $planos[$pid] = ($mid !== null && isset($pd['modelos'][$mid])) ? pm_normalizar_form($pd['modelos'][$mid])['secoes'] : [];
            }
            $secoes = $planos[$pid];
            $dv = pm_json($v['dados']);
            $itens = []; $med = [];
            foreach ($dv['itens'] ?? [] as $k => $r) {
                $pp = explode('-', (string) $k); if (count($pp) !== 2) continue;
                $s = $secoes[(int) $pp[0]] ?? null; $it = $s['itens'][(int) $pp[1]] ?? null;
                if ($it) $itens[] = ['sec' => $s['titulo'], 'n' => $it['n'], 'per' => $it['per'] ?? 'M', 'r' => $r];
            }
            foreach ($dv['med'] ?? [] as $k => $val) {
                $pp = explode('-', (string) $k); if (count($pp) !== 2) continue;
                $s = $secoes[(int) $pp[0]] ?? null; $it = $s['itens'][(int) $pp[1]] ?? null;
                if ($it) $med[] = ['sec' => $s['titulo'], 'n' => $it['n'], 'un' => $it['un'] ?? '', 'v' => (string) $val];
            }
            $out[] = ['ano' => (int) $v['ano'], 'mes' => (int) $v['mes'], 'status' => $v['status'], 'resultado' => pm_resultado($dv['itens'] ?? []),
                      'tecnico' => $dv['tecnico'] ?? null, 'feitaEm' => $dv['feitaEm'] ?? null, 'obs' => $dv['obs'] ?? '', 'itens' => $itens, 'med' => $med];
        }
        return ['equipamentoId' => (int) $e['id'], 'visitas' => $out];
    },

    /* QR lido (código do link) ou equipamento escolhido: {token} ou {id} → onde abrir */
    'equip.qr' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico', 'cliente');
        $tid = tenant();
        $tok = strtolower((string) ($d['token'] ?? ''));
        if ($tok !== '') {
            if (!preg_match('/^[a-f0-9]{24}$/', $tok)) erro('Código de QR inválido.', 404, 'NAO_ENCONTRADO');
            $e = linha("SELECT * FROM equipamentos WHERE qr_token = ? AND tenant_id = ? AND excluido_em IS NULL", [$tok, $tid]);
        } else {
            $e = linha("SELECT * FROM equipamentos WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [(int) ($d['id'] ?? 0), $tid]);
        }
        if (!$e || !pm_pode_cliente($u, (int) $e['cliente_id'])) erro('Este QR não é de um equipamento seu.', 404, 'NAO_ENCONTRADO');
        $ano = (int) date('Y');
        $p = pm_plano_do_equip($tid, (int) $e['id'], $ano);
        if ($p && so_tecnico($u) && !pm_tec_escalado($u, $p)) $p = null;   /* fora da escala: só o histórico */
        return ['equipamento' => pm_equip_publico($e), 'clienteNome' => valor("SELECT nome FROM clientes WHERE id = ? AND tenant_id = ?", [$e['cliente_id'], $tid]),
                'planoId' => $p ? (int) $p['id'] : null, 'ano' => $ano, 'mes' => (int) date('n')];
    },

    /* leitor do app com etiqueta antiga (só a TAG escrita): {texto} → equipamentos com essa TAG */
    'equip.buscar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $t = txt($d['texto'] ?? '', 60);
        if (mb_strlen($t) < 2) return ['itens' => []];
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $t) . '%';
        $out = [];
        foreach (linhas("SELECT e.*, c.nome AS cliente_nome FROM equipamentos e JOIN clientes c ON c.tenant_id = e.tenant_id AND c.id = e.cliente_id
                          WHERE e.tenant_id = ? AND e.excluido_em IS NULL AND (e.tag = ? OR e.tag LIKE ?) ORDER BY (e.tag = ?) DESC, c.nome, e.tag LIMIT 40", [$tid, $t, $like, $t]) as $e) {
            if (!pm_pode_cliente($u, (int) $e['cliente_id'])) continue;
            $out[] = array_merge(pm_equip_publico($e), ['clienteNome' => $e['cliente_nome']]);
        }
        return ['itens' => $out];
    },

    /* tela do cliente no PMOC: plano do ano, máquinas, pendências abertas e ocorrências. {clienteId, ano?} */
    'cliente.painel' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $cli = (int) ($d['clienteId'] ?? 0);
        $c = linha("SELECT id, nome, numero, endereco, contato, telefone FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$cli, $tid]);
        if (!$c) erro('Cliente não encontrado.', 404, 'NAO_ENCONTRADO');
        pm_exigir_cliente($u, $cli);
        $ano = (int) ($d['ano'] ?? date('Y'));
        $mes = $ano === (int) date('Y') ? (int) date('n') : 12;
        $p = linha("SELECT p.*, c.nome AS cliente_nome FROM pmoc_planos p JOIN clientes c ON c.tenant_id = p.tenant_id AND c.id = p.cliente_id
                     WHERE p.tenant_id = ? AND p.cliente_id = ? AND p.ano = ? AND p.excluido_em IS NULL ORDER BY p.id LIMIT 1", [$tid, $cli, $ano]);
        $plano = null;
        if ($p) {
            $pode = true;
            if (so_tecnico($u)) $pode = pm_tec_escalado($u, $p);
            if ($pode) $plano = pm_plano_resumo($p, $tid, $mes) + ['tipo' => pm_json($p['dados'])['tipo'] ?? null];
        }
        return [
            'cliente' => ['id' => (int) $c['id'], 'nome' => $c['nome'], 'numero' => (int) $c['numero'], 'endereco' => $c['endereco'], 'contato' => $c['contato'], 'telefone' => $c['telefone']],
            'ano' => $ano, 'mes' => $mes, 'plano' => $plano,
            'equipamentos' => (int) valor("SELECT COUNT(*) FROM equipamentos WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL", [$tid, $cli]),
            'pendencias' => pm_pendencias_abertas($tid, [$cli]),
            'ocorrencias' => pm_ocorrencias($tid, $u, [$cli]),
            'podeEditar' => pm_escritorio($u),
        ];
    },

    /* ocorrência = manutenção corretiva: vira OS de contrato com numeração própria (C-0001),
       ligada à máquina e, se veio de uma pendência, ligada a ela.
       {clienteId, equipamentoId?, descricao, prioridade?, dataPrev?, horaPrev?, tecnicos?[], pendencia?:{visitaId, id}} */
    'ocorrencia.criar' => function ($d) {
        $u = exigir_perfil('admin', 'coord', 'tecnico');
        $tid = tenant();
        $cli = (int) ($d['clienteId'] ?? 0);
        if (!valor("SELECT id FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$cli, $tid])) erro('Cliente não encontrado.');
        pm_exigir_cliente($u, $cli);
        $desc = txt($d['descricao'] ?? '', 5000);
        if ($desc === '') erro('Descreva o problema ou o serviço da ocorrência.');
        $eq = null;
        if (!empty($d['equipamentoId'])) {
            $eq = linha("SELECT * FROM equipamentos WHERE id = ? AND tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL", [(int) $d['equipamentoId'], $tid, $cli]);
            if (!$eq) erro('Equipamento não encontrado neste cliente.');
        }
        $pend = null; $vis = null;
        if (!empty($d['pendencia']['visitaId'])) {
            $vis = linha("SELECT v.* FROM pmoc_visitas v JOIN pmoc_planos p ON p.tenant_id = v.tenant_id AND p.id = v.plano_id
                           WHERE v.id = ? AND v.tenant_id = ? AND p.cliente_id = ? AND v.excluido_em IS NULL", [(int) $d['pendencia']['visitaId'], $tid, $cli]);
            if ($vis) foreach (pm_json($vis['dados'])['pend'] ?? [] as $x) if (($x['id'] ?? '') === (string) ($d['pendencia']['id'] ?? '')) $pend = $x;
        }
        $prio = in_array($d['prioridade'] ?? '', OS_PRIORIDADES, true) ? $d['prioridade'] : 'normal';
        $dataPrev = os_data($d['dataPrev'] ?? '', 'data prevista');
        $hora = os_hora($d['horaPrev'] ?? '');
        $tecs = pm_escritorio($u) ? (is_array($d['tecnicos'] ?? null) ? $d['tecnicos'] : []) : [(int) $u['id']];
        $plano = linha("SELECT * FROM pmoc_planos WHERE tenant_id = ? AND cliente_id = ? AND ano = ? AND excluido_em IS NULL ORDER BY id LIMIT 1", [$tid, $cli, (int) date('Y')]);
        $nomeChk = 'Manutenção corretiva';
        $itens = [];
        foreach (os_checklists($tid) as $ck) if (($ck['nome'] ?? '') === $nomeChk) $itens = $ck['itens'] ?? [];
        if (!$itens) $itens = ['Diagnóstico do defeito', 'Execução do serviço', 'Teste de funcionamento'];
        $grupo = $eq ? $eq['tag'] . ($eq['ambiente'] ? ' · ' . $eq['ambiente'] : '') : 'Ocorrência';
        /* v1.27.0: ocorrência já atendida em um passo — motivo, o que foi feito e materiais; a OS nasce concluída */
        $feita = !empty($d['executada']);
        $servico = txt($d['servico'] ?? '', 5000);
        if ($feita && $servico === '') erro('Escreva o que foi feito no atendimento.');
        $mats = [];
        if ($feita) foreach (preg_split('/\r?\n/', (string) ($d['materiais'] ?? '')) as $ln) {
            $ln = trim($ln); if ($ln === '') continue;
            if (preg_match('/^(\d+(?:[.,]\d+)?)\s*(un|und|m|mt|kg|g|l|pç|pc|pç\.|cx|rolo|par)?\.?\s+(.+)$/iu', $ln, $mm))
                $mats[] = [txt($mm[3], 200), (float) str_replace(',', '.', $mm[1]), $mm[2] !== '' ? mb_strtolower($mm[2]) : 'un'];
            else $mats[] = [txt($ln, 200), 1, 'un'];
            if (count($mats) >= 40) break;
        }
        $dataAtend = $feita ? (os_data($d['dataAtendimento'] ?? '', 'data do atendimento') ?: date('Y-m-d')) : null;
        if ($feita) { $itens = ['Atendimento']; $dataPrev = $dataAtend; $tecs = array_values(array_unique(array_merge($tecs, [(int) $u['id']]))); }
        db()->beginTransaction();
        $numero = null;
        for ($i = 0; $i < 1000 && $numero === null; $i++) {
            $n = proximo_numero('os_contrato', $tid);
            $cand = 'C-' . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
            if (!valor("SELECT 1 FROM ordens_servico WHERE tenant_id = ? AND numero = ?", [$tid, $cand])) $numero = $cand;
        }
        if ($numero === null) erro('Não foi possível gerar o número da OS. Avise o suporte.', 500, 'NUMERACAO');
        $meta = ['tipoServico' => $nomeChk, 'prazo' => null, 'endereco' => null, 'contato' => null, 'telefone' => null, 'origem' => 'pmoc'];
        /* v1.28.1: OS aberta a partir de uma solicitação do cliente — fica ligada a ela (o cliente vê na solicitação) */
        $sol = null;
        if (!empty($d['tarefaId'])) {
            $sol = linha("SELECT id, status, titulo FROM tarefas WHERE id = ? AND tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL", [(int) $d['tarefaId'], $tid, $cli]);
            if ($sol) $meta['tarefaId'] = (int) $sol['id'];
        }
        if ($feita) { $meta['conclusao'] = $servico; $meta['finalizadoEm'] = date('Y-m-d H:i:s'); $meta['registroDireto'] = true; }
        q("INSERT INTO ordens_servico (tenant_id, numero, tipo, contrato_id, cliente_id, equipamento_id, status, prioridade, responsavel_id, data_prev, hora_prev, orientacoes, checklist, criado_por)
           VALUES (?, ?, 'contrato', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [$tid, $numero, $plano && $plano['contrato_id'] ? (int) $plano['contrato_id'] : null, $cli, $eq ? (int) $eq['id'] : null,
           $feita ? 'Concluída' : ($dataPrev ? 'Agendada' : 'Aberta'), $prio, pm_escritorio($u) ? null : (int) $u['id'], $dataPrev, $hora, $desc,
           json_encode($meta, JSON_UNESCAPED_UNICODE), (int) $u['id']]);
        $id = (int) db()->lastInsertId();
        os_gravar_etapas($id, array_map(function ($n) use ($grupo, $feita) { return ['grupo' => $grupo, 'nome' => $n, 'status' => $feita ? 'concluida' : 'pendente']; }, $itens), $tid);
        os_gravar_tecnicos($id, $tecs, $dataPrev, $hora, $tid);
        if ($feita) {
            q("UPDATE ordens_servico SET fechada_em = NOW() WHERE id = ? AND tenant_id = ?", [$id, $tid]);
            q("UPDATE os_visitas SET inicio = COALESCE(inicio, NOW()), termino = NOW() WHERE tenant_id = ? AND os_id = ? AND numero = 1", [$tid, $id]);
            foreach ($mats as $mt) q("INSERT INTO os_materiais (tenant_id, os_id, material, quantidade, unidade) VALUES (?, ?, ?, ?, ?)", [$tid, $id, $mt[0], round($mt[1], 3), $mt[2]]);
            os_liberar_tecnicos($id, $tid);   /* v1.28.0: já nasce concluída — não fica na lista dos técnicos */
        }
        os_evento($id, 'historico', 'OS ' . $numero . ($feita ? ' registrada pelo PMOC (ocorrência já atendida)' : ' aberta pelo PMOC (ocorrência / corretiva)') . ($eq ? ' — equipamento ' . $eq['tag'] : '') . '.'
            . ($pend ? ' Origem: pendência "' . mb_substr((string) $pend['texto'], 0, 200) . '" de ' . pm_mes_txt($vis['mes']) . '/' . $vis['ano'] . '.' : ''), $tid, (int) $u['id']);
        if ($pend) {   /* a pendência passa a mostrar a OS que vai resolvê-la */
            $dv = pm_json($vis['dados']);
            foreach ($dv['pend'] as $i => $x) if (($x['id'] ?? '') === $pend['id']) {
                $dv['pend'][$i]['osId'] = $id; $dv['pend'][$i]['osNumero'] = $numero;
                if ($feita) {   /* atendida na hora: a pendência fica resolvida, com o que foi feito */
                    $dv['pend'][$i]['resolvida'] = true; $dv['pend'][$i]['resolvidaEm'] = date('Y-m-d H:i:s');
                    $dv['pend'][$i]['resolvidaPor'] = $u['nome']; $dv['pend'][$i]['resolvidaNota'] = mb_substr($servico, 0, 1000) . ' (OS ' . $numero . ')';
                }
            }
            q("UPDATE pmoc_visitas SET dados = ? WHERE id = ? AND tenant_id = ?", [pm_enc($dv), $vis['id'], $tid]);
        }
        if ($sol) {   /* v1.28.1: registra na solicitação e atualiza o status dela */
            q("INSERT INTO tarefa_comentarios (tenant_id, tarefa_id, usuario_id, texto) VALUES (?, ?, ?, ?)",
              [$tid, $sol['id'], (int) $u['id'], $feita ? 'Atendido na OS ' . $numero . ': ' . mb_substr($servico, 0, 1500) : 'Aberta a OS ' . $numero . ' para atender esta solicitação' . ($dataPrev ? ', prevista para ' . date('d/m/Y', strtotime($dataPrev)) : '') . '.']);
            if ($feita) q("UPDATE tarefas SET status = 'feita', feita_em = NOW() WHERE id = ? AND tenant_id = ? AND status <> 'feita'", [$sol['id'], $tid]);
            elseif ($sol['status'] === 'aberta') q("UPDATE tarefas SET status = 'andamento' WHERE id = ? AND tenant_id = ?", [$sol['id'], $tid]);
        }
        db()->commit();
        auditar('pmoc_ocorrencia', 'ordens_servico', $id, $numero . ($eq ? ' ' . $eq['tag'] : '') . ($feita ? ' (registrada já atendida)' : ''));
        return ['id' => $id, 'numero' => $numero, 'concluida' => $feita];
    },

    /* ---------------- área do cliente ----------------
       {clienteId?} — 0/ausente = todas as unidades do usuário */
    'portal.resumo' => function ($d) {
        /* v1.28.0: o escritório também abre (tela "Visão do cliente"), escolhendo o cliente */
        $u = exigir_perfil('cliente', 'admin', 'coord');
        $tid = tenant();
        if (($u['perfil'] ?? '') === 'cliente') {
            $uni = unidades_cliente($u) ?: [];
            if (!$uni) erro('Seu usuário ainda não está ligado a nenhuma unidade. Fale com a empresa.', 403, 'SEM_UNIDADE');
        } else {
            $c = (int) ($d['clienteId'] ?? 0);
            if (!$c || !valor("SELECT id FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$c, $tid])) erro('Escolha o cliente.');
            $uni = [$c];
        }
        $sel = (int) ($d['clienteId'] ?? 0);
        $ids = $sel && in_array($sel, $uni, true) ? [$sel] : $uni;
        $in = implode(',', array_map('intval', $ids));
        $unidades = array_map(function ($r) { return ['id' => (int) $r['id'], 'nome' => $r['nome'], 'numero' => (int) $r['numero'], 'endereco' => $r['endereco']]; },
            linhas("SELECT id, nome, numero, endereco FROM clientes WHERE tenant_id = ? AND id IN (" . implode(',', $uni) . ") ORDER BY nome", [$tid]));
        /* máquinas, com a última preventiva feita */
        $ult = [];
        foreach (linhas("SELECT v.equipamento_id, MAX(v.ano * 100 + v.mes) AS am FROM pmoc_visitas v
                          JOIN equipamentos e ON e.tenant_id = v.tenant_id AND e.id = v.equipamento_id
                         WHERE v.tenant_id = ? AND v.excluido_em IS NULL AND v.status = 'feita' AND e.cliente_id IN ($in) GROUP BY v.equipamento_id", [$tid]) as $r)
            $ult[(int) $r['equipamento_id']] = (int) $r['am'];
        $ultData = [];
        foreach (linhas("SELECT v.equipamento_id, MAX(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(v.dados, '$.feitaEm')), v.atualizado_em)) AS q FROM pmoc_visitas v
                          JOIN equipamentos e ON e.tenant_id = v.tenant_id AND e.id = v.equipamento_id
                         WHERE v.tenant_id = ? AND v.excluido_em IS NULL AND v.status = 'feita' AND e.cliente_id IN ($in) GROUP BY v.equipamento_id", [$tid]) as $r)
            $ultData[(int) $r['equipamento_id']] = $r['q'];
        $pend = pm_pendencias_abertas($tid, $ids);
        $pendPorEq = []; foreach ($pend as $x) $pendPorEq[$x['equipamentoId']] = ($pendPorEq[$x['equipamentoId']] ?? 0) + 1;
        $equip = [];
        foreach (linhas("SELECT e.*, c.nome AS cliente_nome FROM equipamentos e JOIN clientes c ON c.tenant_id = e.tenant_id AND c.id = e.cliente_id
                          WHERE e.tenant_id = ? AND e.excluido_em IS NULL AND e.cliente_id IN ($in) ORDER BY c.nome, e.tag", [$tid]) as $e) {
            $am = $ult[(int) $e['id']] ?? 0;
            $equip[] = array_merge(pm_equip_publico($e), ['clienteNome' => $e['cliente_nome'], 'ultimaAno' => $am ? intdiv($am, 100) : null, 'ultimaMes' => $am ? $am % 100 : null, 'ultimaData' => $ultData[(int) $e['id']] ?? null,
                                                         'pendencias' => $pendPorEq[(int) $e['id']] ?? 0]);
        }
        /* preventivas por plano × mês */
        $prev = [];
        foreach (linhas("SELECT p.id AS plano_id, p.ano, v.mes, c.nome AS cliente_nome, p.cliente_id, COUNT(*) AS feitas, MAX(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(v.dados, '$.feitaEm')), v.atualizado_em)) AS quando
                           FROM pmoc_visitas v JOIN pmoc_planos p ON p.tenant_id = v.tenant_id AND p.id = v.plano_id AND p.excluido_em IS NULL
                           JOIN clientes c ON c.tenant_id = p.tenant_id AND c.id = p.cliente_id
                          WHERE v.tenant_id = ? AND v.excluido_em IS NULL AND v.status = 'feita' AND p.cliente_id IN ($in)
                          GROUP BY p.id, p.ano, v.mes, c.nome, p.cliente_id ORDER BY p.ano DESC, v.mes DESC LIMIT 200", [$tid]) as $r)
            $prev[] = ['tipo' => 'preventiva', 'planoId' => (int) $r['plano_id'], 'ano' => (int) $r['ano'], 'mes' => (int) $r['mes'], 'clienteId' => (int) $r['cliente_id'],
                       'clienteNome' => $r['cliente_nome'], 'feitas' => (int) $r['feitas'], 'quando' => $r['quando']];
        /* todas as OS das unidades (instalações, corretivas, avulsas) — sem valores */
        $os = [];
        $rowsOS = linhas("SELECT o.id, o.numero, o.tipo, o.status, o.data_prev, o.orientacoes, o.checklist, o.criado_em, o.fechada_em, o.cliente_id, c.nome AS cliente_nome,
                                 o.equipamento_id, e.tag AS equip_tag, e.ambiente AS equip_ambiente, e.dados AS equip_dados
                           FROM ordens_servico o JOIN clientes c ON c.tenant_id = o.tenant_id AND c.id = o.cliente_id
                           LEFT JOIN equipamentos e ON e.tenant_id = o.tenant_id AND e.id = o.equipamento_id
                          WHERE o.tenant_id = ? AND o.excluido_em IS NULL AND o.status <> 'Cancelada' AND o.cliente_id IN ($in)
                          ORDER BY COALESCE(o.fechada_em, o.data_prev, o.criado_em) DESC LIMIT 200", [$tid]);
        /* v1.28.0: OS sem equipamento ligado mostra os locais das tarefas (ex.: "Sala 12", "Apto 208") */
        $grupos = [];
        if ($rowsOS) {
            $idsOS = implode(',', array_map(function ($o) { return (int) $o['id']; }, $rowsOS));
            foreach (linhas("SELECT os_id, grupo FROM os_etapas WHERE tenant_id = ? AND os_id IN ($idsOS) AND excluido_em IS NULL AND grupo IS NOT NULL AND grupo <> '' ORDER BY ordem, id", [$tid]) as $g) {
                $l = $grupos[(int) $g['os_id']] ?? [];
                if (!in_array($g['grupo'], $l, true) && count($l) < 4) $l[] = $g['grupo'];
                $grupos[(int) $g['os_id']] = $l;
            }
        }
        foreach ($rowsOS as $o) {
            $m = json_decode((string) $o['checklist'], true) ?: [];
            $os[] = ['tipo' => 'os', 'id' => (int) $o['id'], 'numero' => $o['numero'], 'osTipo' => $o['tipo'], 'status' => $o['status'], 'tipoServico' => $m['tipoServico'] ?? null,
                     'descricao' => mb_substr((string) $o['orientacoes'], 0, 300), 'quando' => $o['fechada_em'] ?: ($m['finalizadoEm'] ?? null) ?: ($o['data_prev'] ?: $o['criado_em']),
                     'clienteId' => (int) $o['cliente_id'], 'clienteNome' => $o['cliente_nome'],
                     'equipamentoId' => $o['equipamento_id'] !== null ? (int) $o['equipamento_id'] : null, 'equipTag' => $o['equip_tag'],
                     'equipLocal' => os_local_equip(os_andar_equip($o['equip_dados']), $o['equip_ambiente']), 'locais' => $grupos[(int) $o['id']] ?? []];
        }
        $planos = array_map(function ($p) use ($tid) {
            $dd = pm_json($p['dados']);
            $mapa = []; $res = []; $comVis = [];
            foreach (linhas("SELECT equipamento_id, mes, status, dados FROM pmoc_visitas WHERE tenant_id = ? AND plano_id = ? AND excluido_em IS NULL", [$tid, (int) $p['id']]) as $v) {
                $mapa[(int) $v['equipamento_id']][(int) $v['mes']] = $v['status'];
                if ($v['status'] !== 'prevista') $comVis[] = (int) $v['mes'];
                if ($v['status'] === 'feita') $res[(int) $v['equipamento_id']][(int) $v['mes']] = pm_resultado(pm_json($v['dados'])['itens'] ?? []);   /* v1.34.0 */
            }
            return ['id' => (int) $p['id'], 'ano' => (int) $p['ano'], 'clienteId' => (int) $p['cliente_id'], 'clienteNome' => $p['cliente_nome'],
                    'mesInicio' => (int) ($dd['mesInicio'] ?? 1), 'equipamentos' => count($dd['equip'] ?? []),
                    'frequencia' => pm_freq($dd), 'mesesServico' => pm_meses_servico($dd, $comVis),   /* v1.38.0 */
                    'equipIds' => array_map(function ($e) { return (int) $e['id']; }, $dd['equip'] ?? []),
                    'mapa' => (object) array_map(function ($m) { return (object) $m; }, $mapa),
                    'resMapa' => (object) array_map(function ($m) { return (object) $m; }, $res)];
        }, linhas("SELECT p.*, c.nome AS cliente_nome FROM pmoc_planos p JOIN clientes c ON c.tenant_id = p.tenant_id AND c.id = p.cliente_id
                    WHERE p.tenant_id = ? AND p.excluido_em IS NULL AND p.cliente_id IN ($in) ORDER BY p.ano DESC, c.nome", [$tid]));
        /* v1.16.0: solicitações feitas pela área do cliente (viram tarefa da equipe) */
        $sol = array_map(function ($t) {
            return ['id' => (int) $t['id'], 'titulo' => preg_replace('/^Solicitação: /u', '', $t['titulo']), 'descricao' => $t['descricao'], 'status' => $t['status'],
                    'clienteId' => (int) $t['cliente_id'], 'clienteNome' => $t['cliente_nome'], 'criadoEm' => $t['criado_em'], 'feitaEm' => $t['feita_em'], 'por' => $t['criador_nome'],
                    'mensagens' => (int) $t['n_msg']];   /* v1.28.1 */
        }, linhas("SELECT t.*, c.nome AS cliente_nome, u.nome AS criador_nome,
                          (SELECT COUNT(*) FROM tarefa_comentarios m WHERE m.tenant_id = t.tenant_id AND m.tarefa_id = t.id AND m.excluido_em IS NULL) AS n_msg FROM tarefas t JOIN clientes c ON c.tenant_id = t.tenant_id AND c.id = t.cliente_id
                    LEFT JOIN usuarios u ON u.tenant_id = t.tenant_id AND u.id = t.criado_por
                    WHERE t.tenant_id = ? AND t.excluido_em IS NULL AND t.tipo = 'Solicitação do cliente' AND t.cliente_id IN ($in) ORDER BY t.id DESC LIMIT 30", [$tid]));
        return ['unidades' => $unidades, 'clienteId' => count($ids) === 1 ? $ids[0] : 0, 'equipamentos' => $equip, 'preventivas' => $prev, 'os' => $os,
                'pendencias' => $pend, 'planos' => $planos, 'solicitacoes' => $sol];
    },

    /* v1.16.0: o cliente pede algo; vira tarefa da equipe com data de hoje e prioridade alta (topo da lista) */
    'portal.solicitar' => function ($d) {
        $u = exigir_perfil('cliente');
        $tid = tenant();
        $uni = unidades_cliente($u) ?: [];
        $cli = (int) ($d['clienteId'] ?? 0);
        if (!$cli && count($uni) === 1) $cli = $uni[0];
        if (!$cli || !in_array($cli, $uni, true)) erro('Escolha a unidade da solicitação.');
        $assunto = txt($d['assunto'] ?? '', 150);
        if ($assunto === '') erro('Escreva o assunto da solicitação.');
        $det = txt($d['detalhes'] ?? '', 3000);
        $desc = ($det !== '' ? $det . "\n\n" : '') . 'Enviada pela área do cliente por ' . $u['nome'] . ($u['email'] ? ' (' . $u['email'] . ')' : '') . '.';
        q("INSERT INTO tarefas (tenant_id, titulo, descricao, tipo, cliente_id, data, prioridade, status, criado_por) VALUES (?, ?, ?, 'Solicitação do cliente', ?, CURDATE(), 'alta', 'aberta', ?)",
          [$tid, 'Solicitação: ' . $assunto, $desc, $cli, (int) $u['id']]);
        $id = (int) db()->lastInsertId();
        auditar('portal_solicitar', 'tarefas', $id, $assunto);
        return ['id' => $id];
    },

    /* v1.28.1: {id} → a solicitação com o que foi feito: respostas da equipe, fotos e OS abertas para ela */
    'portal.solicitacao' => function ($d) {
        $u = exigir_perfil('cliente', 'admin', 'coord');
        return pm_solicitacao_publica(pm_solicitacao($u, (int) ($d['id'] ?? 0)), (int) $u['tenant_id']);
    },

    /* v1.28.1: {id, texto} — o cliente responde na solicitação; a equipe recebe aviso */
    'portal.responder' => function ($d) {
        $u = exigir_perfil('cliente');
        $tid = tenant();
        $t = pm_solicitacao($u, (int) ($d['id'] ?? 0));
        $tx = mb_substr(trim((string) ($d['texto'] ?? '')), 0, 3000);
        if ($tx === '') erro('Escreva a mensagem.');
        q("INSERT INTO tarefa_comentarios (tenant_id, tarefa_id, usuario_id, texto) VALUES (?, ?, ?, ?)", [$tid, $t['id'], (int) $u['id'], $tx]);
        /* concluída e o cliente voltou a falar: reabre para a equipe ver */
        if (in_array($t['status'], ['feita', 'cancelada'], true)) q("UPDATE tarefas SET status = 'aberta', feita_em = NULL WHERE id = ? AND tenant_id = ?", [$t['id'], $tid]);
        $quem = array_map('intval', array_column(linhas("SELECT usuario_id FROM tarefa_responsaveis WHERE tenant_id = ? AND tarefa_id = ?", [$tid, $t['id']]), 'usuario_id'));
        if (!$quem) $quem = array_map('intval', array_column(linhas("SELECT id FROM usuarios WHERE tenant_id = ? AND excluido_em IS NULL AND status = 'ativo' AND perfil IN ('admin','coord')", [$tid]), 'id'));
        try { notificar($tid, $quem, 'Cliente respondeu: ' . $t['cliente_nome'], mb_substr($tx, 0, 160), 'tarefa:' . (int) $t['id'], 'comentario', (int) $u['id']); } catch (Throwable $e) {}
        auditar('portal_responder', 'tarefas', (int) $t['id'], mb_substr($tx, 0, 100));
        return pm_solicitacao_publica(pm_solicitacao($u, (int) $t['id']), $tid);
    },

    /* v1.16.0 · v1.21.0: cadastro de equipamentos em lote a partir da planilha.
       {clienteId, prefixo, planoId?, modo: 'novos'|'atualizar', simular?, desativarAusentes?,
        linhas:[{tag?, ambiente, andar, tipo, marca, modelo, serie?, capacidadeBtu, tipoCond, gas, tensao, ocupFixo, ocupFlut, area, cargaTermica}]}
       modo 'atualizar' (v1.21.0): a máquina é achada pela TAG (ou, sem TAG, por ambiente + andar + tipo quando só uma combina)
       e ATUALIZADA no mesmo cadastro — o histórico, as visitas do PMOC e as OS continuam ligados a ela.
       TAG nova vira máquina nova; máquina que não está na planilha só é desativada se pedido (nunca apagada). */
    'equip.importar' => function ($d) {
        $u = exigir_perfil('admin', 'coord');
        $tid = tenant();
        $cli = (int) ($d['clienteId'] ?? 0);
        if (!valor("SELECT id FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$cli, $tid])) erro('Cliente não encontrado.');
        $linhas = is_array($d['linhas'] ?? null) ? array_values(array_filter($d['linhas'], 'is_array')) : [];
        if (!$linhas) erro('A planilha não tem equipamentos.');
        if (count($linhas) > 500) erro('No máximo 500 equipamentos por vez.');
        $atualizar = ($d['modo'] ?? '') === 'atualizar';
        $simular = !empty($d['simular']);
        $desativar = $atualizar && !empty($d['desativarAusentes']);
        $pref = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($d['prefixo'] ?? '')));
        $pref = substr($pref, 0, 6);
        $plano = null;
        if (!empty($d['planoId'])) {
            $plano = linha("SELECT * FROM pmoc_planos WHERE id = ? AND tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL", [(int) $d['planoId'], $tid, $cli]);
            if (!$plano) erro('Plano PMOC não encontrado para este cliente.');
        }
        $up = function ($t) { return mb_strtoupper(trim((string) $t)); };
        $chaveLocal = function ($amb, $andar, $tipo) { return pm_chave_tipo($amb) . '|' . pm_chave_tipo($andar) . '|' . pm_chave_tipo($tipo); };

        /* o que já existe no cliente */
        $ativos = []; $porTag = []; $seq = [];
        foreach (linhas("SELECT * FROM equipamentos WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL", [$tid, $cli]) as $r) {
            $ativos[(int) $r['id']] = $r; $porTag[$up($r['tag'])] = (int) $r['id'];
            if (preg_match('/([A-Z]{2})-?(\d+)$/', (string) $r['tag'], $m)) $seq[$m[1]] = max($seq[$m[1]] ?? 0, (int) $m[2]);
        }
        $excluidas = [];
        if ($atualizar) foreach (linhas("SELECT * FROM equipamentos WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NOT NULL ORDER BY excluido_em", [$tid, $cli]) as $r)
            $excluidas[$up($r['tag'])] = $r;   /* fica a exclusão mais recente de cada TAG */

        /* 1º passo: decide o que fazer com cada linha (sem gravar) */
        $plano_ = []; $usados = []; $tagsPlanilha = []; $erros = [];
        foreach ($linhas as $i => $l) {
            $tipo = trim((string) ($l['tipo'] ?? '')) !== '' ? pm_tipo_normal((string) $l['tipo'], $tid) : '';
            $tag = txt($l['tag'] ?? '', 60);
            if ($tag !== '') {
                if (isset($tagsPlanilha[$up($tag)])) { $erros[] = 'Linha ' . ($i + 1) . ': a TAG ' . $tag . ' aparece mais de uma vez na planilha.'; continue; }
                $tagsPlanilha[$up($tag)] = 1;
            }
            $acao = 'criar'; $alvo = null;
            if ($atualizar) {
                if ($tag !== '' && isset($porTag[$up($tag)]) && !isset($usados[$porTag[$up($tag)]])) { $acao = 'atualizar'; $alvo = $ativos[$porTag[$up($tag)]]; }
                elseif ($tag !== '' && isset($excluidas[$up($tag)])) { $acao = 'restaurar'; $alvo = $excluidas[$up($tag)]; }
                elseif ($tag === '') {
                    $k = $chaveLocal($l['ambiente'] ?? '', $l['andar'] ?? '', $tipo);
                    $cands = array_values(array_filter($ativos, function ($e) use ($k, $chaveLocal, $usados) {
                        $x = pm_json($e['dados']);
                        return !isset($usados[(int) $e['id']]) && $chaveLocal($e['ambiente'], $x['andar'] ?? '', $e['tipo']) === $k;
                    }));
                    if (count($cands) === 1 && $k !== '||') { $acao = 'atualizar'; $alvo = $cands[0]; }
                }
            } elseif ($tag !== '' && isset($porTag[$up($tag)])) {
                $erros[] = 'Linha ' . ($i + 1) . ': já existe a TAG ' . $tag . ' neste cliente. Para mudar máquinas já cadastradas use "Atualizar as que já existem".';
                continue;
            }
            if ($alvo) $usados[(int) $alvo['id']] = 1;
            $plano_[] = ['i' => $i, 'l' => $l, 'tipo' => $tipo, 'tag' => $tag, 'acao' => $acao, 'alvo' => $alvo];
        }
        if ($erros) erro("Nada foi gravado. Corrija a planilha:\n" . implode("\n", array_slice($erros, 0, 15)));
        $ausentes = $desativar ? array_values(array_filter($ativos, function ($e) use ($usados) { return !isset($usados[(int) $e['id']]); })) : [];

        $conta = ['criar' => 0, 'atualizar' => 0, 'restaurar' => 0];
        foreach ($plano_ as $x) $conta[$x['acao']]++;
        $resumo = ['criar' => $conta['criar'], 'atualizar' => $conta['atualizar'], 'restaurar' => $conta['restaurar'], 'desativar' => count($ausentes),
                   'tagsAtualizar' => array_slice(array_map(function ($x) { return $x['alvo']['tag']; }, array_values(array_filter($plano_, function ($x) { return $x['acao'] !== 'criar'; }))), 0, 80),
                   'tagsDesativar' => array_slice(array_column($ausentes, 'tag'), 0, 80)];
        if ($simular) return $resumo;

        /* 2º passo: grava tudo numa transação */
        $criados = []; $tocados = []; $erros = [];
        db()->beginTransaction();
        foreach ($plano_ as $x) {
            $l = $x['l'];
            $reg = ['clienteId' => $cli];
            if ($x['alvo']) {
                $a = $x['alvo'];
                if ($x['acao'] === 'restaurar') q("UPDATE equipamentos SET excluido_em = NULL WHERE id = ? AND tenant_id = ?", [$a['id'], $tid]);
                $reg += ['id' => (int) $a['id'], 'tag' => $a['tag'], 'tipo' => $x['tipo'] !== '' ? $x['tipo'] : $a['tipo'], 'marca' => $a['marca'], 'modelo' => $a['modelo'],
                         'serie' => $a['serie'], 'capacidadeBtu' => $a['capacidade_btu'], 'ambiente' => $a['ambiente'], 'motivoTroca' => 'Atualizado pela planilha de levantamento'];
            } else {
                $tag = $x['tag'];
                $tipo = $x['tipo'] !== '' ? $x['tipo'] : pm_tipo_normal('', $tid);
                if ($tag === '') {
                    $cod = pm_tipo_codigo($tipo, $tid);
                    $seq[$cod] = ($seq[$cod] ?? 0) + 1;
                    $tag = ($pref !== '' ? $pref . '-' : '') . $cod . '-' . str_pad((string) $seq[$cod], 3, '0', STR_PAD_LEFT);
                }
                $reg += ['tag' => $tag, 'tipo' => $tipo];
            }
            foreach (['ambiente', 'marca', 'modelo', 'serie', 'capacidadeBtu', 'andar', 'tipoCond', 'gas', 'tensao', 'ocupFixo', 'ocupFlut', 'area', 'cargaTermica'] as $k)
                if (isset($l[$k]) && trim((string) $l[$k]) !== '') $reg[$k] = trim((string) $l[$k]);
            if (isset($reg['area'])) $reg['area'] = str_replace(',', '.', $reg['area']);
            foreach (['capacidadeBtu', 'cargaTermica'] as $k) if (isset($reg[$k])) $reg[$k] = preg_replace('/\D/', '', (string) $reg[$k]);
            try {
                $e = pm_equip_gravar($reg, $u);
                $t = ['id' => (int) $e['id'], 'tag' => $e['tag'], 'tipo' => $e['tipo']];
                if ($x['acao'] === 'criar') $criados[] = $t; else $tocados[] = $t;
                if ($x['acao'] === 'restaurar') $criados[] = $t;   /* volta para o plano, se tinha saído */
            } catch (Throwable $ex) { $erros[] = 'Linha ' . ($x['i'] + 1) . ': ' . $ex->getMessage(); }
        }
        if ($erros) { db()->rollBack(); erro("Nada foi gravado. Corrija a planilha:\n" . implode("\n", array_slice($erros, 0, 15))); }
        if ($ausentes) {
            q("UPDATE equipamentos SET excluido_em = NOW() WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL AND id IN (" . implode(',', array_map('intval', array_column($ausentes, 'id'))) . ")", [$tid, $cli]);
        }
        if ($plano && $criados) {
            $pd = pm_json($plano['dados']);
            $mid = 0; foreach (array_keys($pd['modelos'] ?? []) as $k) { $mid = (int) $k; break; }
            if (!$mid) foreach (pm_modelos($tid) as $m) { $mid = (int) $m['id']; $pd['modelos'][(string) $mid] = ['nome' => $m['nome'], 'secoes' => $m['secoes']]; break; }
            $ja = array_map(function ($e) { return (int) $e['id']; }, $pd['equip'] ?? []);
            $modsEmp = []; foreach (pm_modelos($tid) as $m) $modsEmp[(int) $m['id']] = $m;
            foreach ($criados as $c) {
                if (in_array($c['id'], $ja, true)) continue;
                /* v1.18.0: formulário padrão do tipo, quando configurado */
                $tp = pm_tipo_da_empresa($c['tipo'], $tid); $m2 = $mid;
                if ($tp && $tp['modeloId'] && isset($modsEmp[$tp['modeloId']])) {
                    $m2 = $tp['modeloId'];
                    if (!isset($pd['modelos'][(string) $m2])) $pd['modelos'][(string) $m2] = ['nome' => $modsEmp[$m2]['nome'], 'secoes' => $modsEmp[$m2]['secoes']];
                }
                $pd['equip'][] = ['id' => $c['id'], 'modeloId' => $m2];
            }
            q("UPDATE pmoc_planos SET dados = ? WHERE id = ? AND tenant_id = ?", [json_encode($pd, JSON_UNESCAPED_UNICODE), (int) $plano['id'], $tid]);
        }
        db()->commit();
        auditar('equip_importar', 'clientes', $cli, ($atualizar ? 'atualização: ' : '') . $conta['criar'] . ' nova(s), ' . ($conta['atualizar'] + $conta['restaurar']) . ' atualizada(s), ' . count($ausentes) . ' desativada(s)');
        return ['criados' => $conta['criar'], 'atualizados' => $conta['atualizar'] + $conta['restaurar'], 'desativados' => count($ausentes),
                'tags' => array_column(array_merge($criados, $tocados), 'tag')];
    },

    /* v1.21.0: tira TODAS as máquinas do cliente para recomeçar o cadastro. Nada é apagado de verdade:
       visitas do PMOC, OS e histórico ficam guardados, e "Desfazer" traz tudo de volta. */
    'equip.excluir_todas' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $cli = (int) ($d['clienteId'] ?? 0);
        if (!valor("SELECT id FROM clientes WHERE id = ? AND tenant_id = ? AND excluido_em IS NULL", [$cli, $tid])) erro('Cliente não encontrado.');
        if (($d['confirmar'] ?? '') !== 'EXCLUIR') erro('Confirme digitando EXCLUIR.');
        $agora = date('Y-m-d H:i:s');
        $n = q("UPDATE equipamentos SET excluido_em = ? WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL", [$agora, $tid, $cli])->rowCount();
        auditar('equip_excluir_todas', 'clientes', $cli, $n . ' equipamentos');
        return ['excluidos' => $n];
    },

    /* v1.21.0: desfaz a última exclusão de máquinas do cliente (as que saíram no mesmo momento) */
    'equip.restaurar_ultimas' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $cli = (int) ($d['clienteId'] ?? 0);
        $quando = valor("SELECT MAX(excluido_em) FROM equipamentos WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NOT NULL", [$tid, $cli]);
        if (!$quando) erro('Não há máquinas excluídas para trazer de volta.');
        $ativas = [];
        foreach (linhas("SELECT tag FROM equipamentos WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NULL", [$tid, $cli]) as $r) $ativas[mb_strtoupper($r['tag'])] = 1;
        $n = 0; $pul = [];
        foreach (linhas("SELECT id, tag FROM equipamentos WHERE tenant_id = ? AND cliente_id = ? AND excluido_em = ?", [$tid, $cli, $quando]) as $r) {
            if (isset($ativas[mb_strtoupper($r['tag'])])) { $pul[] = $r['tag']; continue; }   /* TAG já usada por outra máquina ativa */
            q("UPDATE equipamentos SET excluido_em = NULL WHERE id = ? AND tenant_id = ?", [$r['id'], $tid]); $n++;
        }
        auditar('equip_restaurar', 'clientes', $cli, $n . ' equipamentos');
        return ['restaurados' => $n, 'pulados' => $pul, 'excluidasEm' => $quando];
    },

    /* quantas máquinas excluídas o cliente tem (para mostrar o "Desfazer") */
    'equip.excluidas' => function ($d) {
        exigir_perfil('admin', 'coord');
        $tid = tenant();
        $cli = (int) ($d['clienteId'] ?? 0);
        $quando = valor("SELECT MAX(excluido_em) FROM equipamentos WHERE tenant_id = ? AND cliente_id = ? AND excluido_em IS NOT NULL", [$tid, $cli]);
        return ['ultimaExclusao' => $quando ?: null,
                'qtd' => $quando ? (int) valor("SELECT COUNT(*) FROM equipamentos WHERE tenant_id = ? AND cliente_id = ? AND excluido_em = ?", [$tid, $cli, $quando]) : 0];
    },
];
