<?php
/* =====================================================================
   KONSTANTE SaaS — nucleo/base.php
   Tudo o que os módulos da API usam: banco, sessão, resposta,
   permissões, numeração e auditoria.
   Regra de ouro: tenant_id vem SEMPRE da sessão, nunca do navegador.
   ===================================================================== */

if (!defined('KSAAS')) { http_response_code(403); exit; }

require __DIR__ . '/config.php';

/* ---------- resposta ---------- */

class ErroApi extends Exception {
    public $http; public $codigo;
    public function __construct($msg, $http = 400, $codigo = 'ERRO') {
        parent::__construct($msg); $this->http = $http; $this->codigo = $codigo;
    }
}

function ok($dados = null) {
    echo json_encode(['ok' => true, 'dados' => $dados], JSON_UNESCAPED_UNICODE);
    exit;
}

function erro($msg, $http = 400, $codigo = 'ERRO') {
    throw new ErroApi($msg, $http, $codigo);
}

/* ---------- banco ---------- */

function db() {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NOME . ';charset=utf8mb4',
        DB_USUARIO, DB_SENHA,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
    $pdo->exec("SET time_zone = '-03:00'");
    return $pdo;
}

function q($sql, $params = []) {
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}
function linha($sql, $params = [])  { $r = q($sql, $params)->fetch(); return $r ?: null; }
function linhas($sql, $params = []) { return q($sql, $params)->fetchAll(); }
function valor($sql, $params = [])  { return q($sql, $params)->fetchColumn(); }

/* ---------- sessão ---------- */

function iniciar_sessao() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $dir = dirname(__DIR__) . '/_ses';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    session_save_path($dir);
    /* console da plataforma usa outra sessão, com outro cookie:
       estar logado numa empresa não dá acesso ao console, e vice-versa */
    $console = defined('KPLAT');
    session_name($console ? 'KPLAT' : 'KSAAS');
    ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 30));
    ini_set('session.use_strict_mode', '1');
    /* v1.36.0: a pasta _ses é nossa — o PHP da hospedagem não limpa sozinho; limpa sessões vencidas de vez em quando */
    ini_set('session.gc_probability', '1');
    ini_set('session.gc_divisor', '500');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => cookie_path(),
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function cookie_path() { return BASE_PATH . (defined('KPLAT') ? 'plataforma/' : ''); }

/* administrador da plataforma logado (só no console) */
function admin_plataforma($obrigatorio = true) {
    static $cache = false;
    if ($cache !== false) return $cache;
    if (!defined('KPLAT')) erro('Acesso negado.', 403, 'SEM_PERMISSAO');
    iniciar_sessao();
    $a = null;
    if (!empty($_SESSION['pid'])) {
        $a = linha("SELECT * FROM plataforma_admins WHERE id = ? AND status = 'ativo'", [$_SESSION['pid']]);
        if (!$a) { $_SESSION = []; session_destroy(); }
    }
    sessao_liberar();
    if (!$a && $obrigatorio) erro('Sessão expirada. Entre novamente.', 401, 'SEM_SESSAO');
    $cache = $a;
    return $a;
}

/* Usuário logado, relido do banco a cada chamada (se foi desativado,
   ou a empresa foi desativada, perde o acesso na hora). */
function eu($obrigatorio = true) {
    static $cache = false;
    if ($cache !== false) return $cache;
    if (defined('KPLAT')) { if ($obrigatorio) erro('Acesso negado.', 403, 'SEM_PERMISSAO'); return null; }
    iniciar_sessao();
    $uid = $_SESSION['uid'] ?? null;
    $tid = $_SESSION['tid'] ?? null;
    if (!$uid && !defined('KPUB')) { $p = ponte_usuario(); if ($p) [$uid, $tid] = $p; }   /* v1.37.0: acesso do Claude por chave */
    $u = null;
    if ($uid && $tid) {
        $u = linha(
            "SELECT u.*, t.ativo AS tenant_ativo
               FROM usuarios u JOIN tenants t ON t.id = u.tenant_id
              WHERE u.id = ? AND u.tenant_id = ? AND u.excluido_em IS NULL",
            [$uid, $tid]
        );
        if (!$u || $u['status'] !== 'ativo' || (int) $u['tenant_ativo'] !== 1) {
            $_SESSION = []; session_destroy(); $u = null;
        }
        if ($u) $u['perfis'] = perfis_carregar($u);   /* v1.22.0: perfil principal + perfis extras em vigor */
    }
    sessao_liberar();
    if (!$u && $obrigatorio) erro('Sessão expirada. Entre novamente.', 401, 'SEM_SESSAO');
    $cache = $u;
    return $u;
}

/* v1.36.0 — o PHP tranca o arquivo da sessão até a resposta terminar: com ele trancado, as chamadas
   do mesmo usuário (fotos, listas da tela) esperam uma pela outra em fila. Depois de ler quem é o
   usuário, a sessão é liberada. Quem precisa gravar na sessão (login, logout, ritmo do Assistente)
   chama iniciar_sessao() de novo, que reabre. */
function sessao_liberar() {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
}

/* v1.37.0 — acesso do assistente (Claude) por chave, sem tela de login.
   Liga só se o config.php tiver PONTE_CHAVE (texto aleatório, 32+ caracteres) e PONTE_USUARIO (e-mail ou id do usuário
   criado para o Claude). A chave chega no cabeçalho X-Sgclim-Token. O acesso é o do perfil desse usuário:
   tudo o que ele faz entra na auditoria com o nome dele. Chave errada 5 vezes = IP bloqueado por 15 min.
   Para desligar: apague as duas linhas do config.php. */
function ponte_usuario() {
    $tok = (string) ($_SERVER['HTTP_X_SGCLIM_TOKEN'] ?? '');
    if ($tok === '' || !defined('PONTE_CHAVE') || !defined('PONTE_USUARIO') || strlen((string) PONTE_CHAVE) < 32) return null;
    $k = 'ponte:' . ip();
    if (login_bloqueado_seg($k) > 0) erro('Muitas tentativas. Tente de novo em alguns minutos.', 429, 'BLOQUEADO');
    if (!hash_equals((string) PONTE_CHAVE, $tok)) { login_falhou($k, 5); erro('Chave de acesso inválida.', 401, 'SEM_SESSAO'); }
    /* PONTE_USUARIO pode ser o e-mail do usuário (mais fácil) ou o número (id) */
    $r = is_int(PONTE_USUARIO) || ctype_digit((string) PONTE_USUARIO)
        ? linha("SELECT id, tenant_id FROM usuarios WHERE id = ? AND excluido_em IS NULL", [(int) PONTE_USUARIO])
        : linha("SELECT id, tenant_id FROM usuarios WHERE email = ? AND excluido_em IS NULL", [mb_strtolower(trim((string) PONTE_USUARIO))]);
    return $r ? [(int) $r['id'], (int) $r['tenant_id']] : null;
}

function tenant() { return (int) eu()['tenant_id']; }

/* ---------- permissões ---------- */

/* v1.22.0 — perfis acumulados.
   Cada usuário tem o perfil principal (usuarios.perfil: define a tela inicial e o menu) e pode ter perfis
   extras (usuario_perfis), com validade opcional. O acesso é a SOMA dos perfis.
   Perfis: admin · financeiro · comercial · coord · tecnico · cliente (cliente nunca acumula com os internos). */
/* CCB v2: + gestao (Gestão de Manutenção), procurador e seguranca (Segurança do Trabalho) — aprovam/dão parecer nos chamados */
const PERFIS_TODOS = ['admin', 'financeiro', 'comercial', 'coord', 'gestao', 'procurador', 'seguranca', 'tecnico', 'cliente'];
const PERFIS_INTERNOS = ['admin', 'financeiro', 'comercial', 'coord', 'gestao', 'procurador', 'seguranca', 'tecnico'];
const PERFIS_APROVACAO = ['gestao', 'procurador', 'seguranca'];

function perfis_carregar($u) {
    $l = [$u['perfil']];
    if ($u['perfil'] === 'cliente') return $l;
    try {
        foreach (linhas("SELECT perfil FROM usuario_perfis WHERE tenant_id = ? AND usuario_id = ? AND (valido_ate IS NULL OR valido_ate >= CURDATE())",
                        [(int) $u['tenant_id'], (int) $u['id']]) as $r)
            if (in_array($r['perfil'], PERFIS_INTERNOS, true) && !in_array($r['perfil'], $l, true)) $l[] = $r['perfil'];
    } catch (Throwable $e) { /* SQL 16 ainda não rodado: só o perfil principal */ }
    return $l;
}
function perfis_de($u) { return is_array($u['perfis'] ?? null) ? $u['perfis'] : [$u['perfil'] ?? '']; }
function tem_perfil($u, ...$p) { return (bool) array_intersect(perfis_de($u), $p); }
/* técnico "puro": restrições de campo valem só para quem não tem também perfil de escritório na operação */
function so_tecnico($u) { return tem_perfil($u, 'tecnico') && !tem_perfil($u, 'admin', 'coord'); }
/* quem vê valores em R$ no CRM */
function ve_valores($u) { return tem_perfil($u, 'admin', 'comercial', 'financeiro', 'coord', 'gestao', 'procurador', 'seguranca'); }   /* CCB v2: coordenação orça; quem aprova vê o valor */

/* ação em andamento (o roteador grava), para a regra dos perfis novos no CRM */
function acao_atual() { return $GLOBALS['K_ACAO'] ?? ['', '']; }
const CRM_MODULOS = ['clientes', 'chamados', 'catalogo', 'contratos'];
const CRM_LEITURAS = '/^(grupos|listar|obter|opcoes|resumo|acomp\.listar|proposta\.status|tudo|eventos|versoes|arquivos|do_chamado|ler|link_cadastro)$/';

/* Comercial = administrador dentro do CRM (clientes, chamados/orçamentos, catálogo, contratos).
   Financeiro = consulta o CRM (com valores), sem alterar. Configurações da empresa: os dois só leem. */
function perfil_permite($u, $perfis) {
    if (array_intersect(perfis_de($u), $perfis)) return true;
    if (!array_intersect($perfis, ['admin', 'coord'])) return false;
    [$mod, $acao] = acao_atual();
    $leitura = (bool) preg_match(CRM_LEITURAS, $acao);
    if (in_array($mod, CRM_MODULOS, true)) {
        if (tem_perfil($u, 'comercial')) return true;
        if (tem_perfil($u, 'financeiro') && $leitura) return true;
        if (tem_perfil($u, ...PERFIS_APROVACAO) && $leitura && $mod !== 'catalogo') return true;   /* CCB v2: quem aprova consulta casas e chamados */
    }
    if ($mod === 'config' && $leitura && tem_perfil($u, 'comercial', 'financeiro')) return true;
    return false;
}

function exigir_perfil(...$perfis) {
    $u = eu();
    if (!perfil_permite($u, $perfis)) {
        [$mod] = acao_atual();
        if (in_array($mod, CRM_MODULOS, true) && tem_perfil($u, 'financeiro'))
            erro('Seu perfil (Financeiro) só consulta o CRM, sem alterar.', 403, 'SEM_PERMISSAO');
        erro('Você não tem permissão para esta ação.', 403, 'SEM_PERMISSAO');
    }
    return $u;
}

/* ---------- entrada ---------- */

function txt($v, $max = 255) {
    $v = trim((string) ($v ?? ''));
    return mb_substr($v, 0, $max);
}
function txt_ou_null($v, $max = 255) { $v = txt($v, $max); return $v === '' ? null : $v; }

function email_valido($e) { return (bool) filter_var($e, FILTER_VALIDATE_EMAIL); }

function senha_valida($s) {
    return is_string($s) && mb_strlen($s) >= 8
        && preg_match('/[A-Za-z]/', $s) && preg_match('/\d/', $s);
}

/* ---------- numeração por empresa ---------- */

/* Reserva o próximo número de uma sequência. Deve ser chamada DENTRO
   de uma transação: o FOR UPDATE garante que dois usuários salvando no
   mesmo segundo recebam números diferentes. */
function proximo_numero($tipo, $tid = null) {
    $tid = $tid ?? tenant();
    $n = valor("SELECT proximo FROM sequencias WHERE tenant_id = ? AND tipo = ? FOR UPDATE", [$tid, $tipo]);
    if ($n === false) {
        q("INSERT INTO sequencias (tenant_id, tipo, proximo) VALUES (?, ?, 2)", [$tid, $tipo]);
        return 1;
    }
    q("UPDATE sequencias SET proximo = proximo + 1 WHERE tenant_id = ? AND tipo = ?", [$tid, $tipo]);
    return (int) $n;
}

/* Próximo número ainda não usado na tabela. Protege contra sequência
   atrasada (ex.: registros importados com números já altos). */
function numero_livre($tipo, $tabela, $tid = null) {
    $tid = $tid ?? tenant();
    for ($i = 0; $i < 1000; $i++) {
        $n = proximo_numero($tipo, $tid);
        if (!valor("SELECT 1 FROM $tabela WHERE tenant_id = ? AND numero = ?", [$tid, $n])) return $n;
    }
    erro('Não foi possível gerar o número. Avise o suporte.', 500, 'NUMERACAO');
}

/* ---- bloqueio por tentativas: 5 erros em 15 min = 15 min bloqueado ---- */
const LOGIN_MAX_FALHAS    = 5;   // por e-mail
const LOGIN_MAX_FALHAS_IP = 20;  // por IP (escritório inteiro sai pelo mesmo IP)
const LOGIN_JANELA_MIN    = 15;

function login_bloqueado_seg($chave) {
    $s = valor("SELECT GREATEST(TIMESTAMPDIFF(SECOND, NOW(), bloqueado_ate), 0)
                  FROM seg_tentativas WHERE chave = ?", [$chave]);
    return (int) $s;
}
function login_falhou($chave, $max = LOGIN_MAX_FALHAS) {
    q("INSERT INTO seg_tentativas (chave, falhas, janela_inicio, bloqueado_ate)
       VALUES (?, 1, NOW(), NULL)
       ON DUPLICATE KEY UPDATE
         bloqueado_ate = IF(janela_inicio < NOW() - INTERVAL " . LOGIN_JANELA_MIN . " MINUTE, NULL,
                           IF(falhas + 1 >= " . (int) $max . ", NOW() + INTERVAL " . LOGIN_JANELA_MIN . " MINUTE, bloqueado_ate)),
         falhas        = IF(janela_inicio < NOW() - INTERVAL " . LOGIN_JANELA_MIN . " MINUTE, 1, falhas + 1),
         janela_inicio = IF(janela_inicio < NOW() - INTERVAL " . LOGIN_JANELA_MIN . " MINUTE, NOW(), janela_inicio)",
      [$chave]);
}
function login_limpar($chave) { q("DELETE FROM seg_tentativas WHERE chave = ?", [$chave]); }

/* ---------- auditoria ---------- */

function auditar($acao, $tabela = null, $registro = null, $resumo = null, $tid = null, $uid = null) {
    try {
        if (defined('KPLAT')) {           // ações do console: marcadas como "plataforma:"
            $a = admin_plataforma(false);
            $acao = 'plataforma:' . $acao;
            $resumo = trim(($a ? '[' . $a['email'] . '] ' : '') . (string) $resumo);
            $u = null;
        } else {
            $u = eu(false);
        }
        q("INSERT INTO auditoria (tenant_id, usuario_id, acao, tabela, registro_id, resumo, ip)
           VALUES (?, ?, ?, ?, ?, ?, ?)",
          [$tid ?? ($u['tenant_id'] ?? null), $uid ?? ($u['id'] ?? null), $acao, $tabela, $registro,
           $resumo ? mb_substr($resumo, 0, 500) : null, ip()]);
    } catch (Throwable $e) { /* auditoria nunca derruba a ação */ }
}

function ip() { return substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45); }

/* ---------- formato público ---------- */

function usuario_publico($u) {
    return [
        'id'            => (int) $u['id'],
        'nome'          => $u['nome'],
        'email'         => $u['email'],
        'telefone'      => $u['telefone'],
        'cargo'         => $u['cargo'],
        'perfil'        => $u['perfil'],
        'perfis'        => perfis_de($u),   /* v1.22.0: principal + extras em vigor */
        'status'        => $u['status'],
        'equipeId'      => $u['equipe_id'] !== null ? (int) $u['equipe_id'] : null,
        'clienteId'     => $u['cliente_id'] !== null ? (int) $u['cliente_id'] : null,
        'especialidade' => $u['especialidade'],
        'registro'      => $u['registro'],
        'disponibilidade' => $u['disponibilidade'],
        'fotoId'        => ($u['foto_anexo_id'] ?? null) !== null ? (int) $u['foto_anexo_id'] : null,
        'ultimoAcesso'  => $u['ultimo_acesso'],
    ];
}

function tenant_publico($t) {
    return [
        'id'            => (int) $t['id'],
        'nome'          => $t['nome'],
        'slug'          => $t['slug'],
        'razaoSocial'   => $t['razao_social'],
        'cnpj'          => $t['cnpj'],
        'ativo'         => (int) $t['ativo'] === 1,
        'plano'         => $t['plano'],
        'logoId'        => $t['logo_anexo_id'] !== null ? (int) $t['logo_anexo_id'] : null,
        'corPrimaria'   => $t['cor_primaria'],
        'corSecundaria' => $t['cor_secundaria'],
        'criadoEm'      => $t['criado_em'],
    ];
}

/* ---------- cliente: unidades que o usuário enxerga (v1.13.0) ----------
   Usuário de perfil cliente vê o cliente principal (usuarios.cliente_id) e as
   unidades extras ligadas a ele (usuario_clientes — cliente regional).
   Para os outros perfis devolve null (não se aplica). */
function unidades_cliente($u) {
    if (($u['perfil'] ?? '') !== 'cliente') return null;
    $tid = (int) $u['tenant_id'];
    $ids = [];
    if (!empty($u['cliente_id'])) $ids[] = (int) $u['cliente_id'];
    try {
        foreach (linhas("SELECT cliente_id FROM usuario_clientes WHERE tenant_id = ? AND usuario_id = ?", [$tid, (int) $u['id']]) as $r) $ids[] = (int) $r['cliente_id'];
    } catch (Throwable $e) { /* SQL 08 ainda não rodado: só o cliente principal */ }
    $ids = array_values(array_unique(array_filter($ids)));
    if (!$ids) return [];
    return array_map('intval', array_column(linhas("SELECT id FROM clientes WHERE tenant_id = ? AND excluido_em IS NULL AND id IN (" . implode(',', $ids) . ")", [$tid]), 'id'));
}
