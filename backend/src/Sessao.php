<?php
declare(strict_types=1);

namespace Ccb;

/**
 * Sessão no servidor (cookie HttpOnly) + proteção CSRF.
 * O tenant do usuário logado vem SEMPRE daqui — nunca da requisição.
 */
final class Sessao
{
    public const MAX_FALHAS_EMAIL = 5;   // por e-mail em 15 min
    public const MAX_FALHAS_IP    = 20;  // por IP em 15 min
    public const JANELA_MIN       = 15;
    public const INATIVIDADE_SEG  = 8 * 3600;

    private static ?array $usuario = null;

    public static function iniciar(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) return;
        session_name('ccb_sessao');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => (bool) Config::get('cookie_seguro'),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_start();

        $agora = time();
        if (isset($_SESSION['ultimo_acesso']) && $agora - $_SESSION['ultimo_acesso'] > self::INATIVIDADE_SEG) {
            self::encerrar();
            session_start();
        }
        $_SESSION['ultimo_acesso'] = $agora;
        $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    }

    public static function csrf(): string
    {
        return $_SESSION['csrf'];
    }

    /** Toda requisição que altera dados precisa do cabeçalho X-CSRF-Token. */
    public static function verificarCsrf(Requisicao $r): void
    {
        if (in_array($r->metodo, ['GET', 'HEAD', 'OPTIONS'], true)) return;
        $token = $r->cabecalho('x-csrf-token') ?? '';
        if (!hash_equals($_SESSION['csrf'] ?? '', $token)) {
            throw new HttpErro(419, 'Sessão expirada. Atualize a página e tente novamente.');
        }
    }

    public static function login(string $email, string $senha, string $ip): array
    {
        $email = mb_strtolower(trim($email));
        $falhasEmail = (int) Db::one(
            'SELECT COUNT(*) n FROM login_tentativas WHERE email = ? AND sucesso = 0 AND criado_em > NOW() - INTERVAL ? MINUTE',
            [$email, self::JANELA_MIN]
        )['n'];
        $falhasIp = (int) Db::one(
            'SELECT COUNT(*) n FROM login_tentativas WHERE ip = ? AND sucesso = 0 AND criado_em > NOW() - INTERVAL ? MINUTE',
            [$ip, self::JANELA_MIN]
        )['n'];
        if ($falhasEmail >= self::MAX_FALHAS_EMAIL || $falhasIp >= self::MAX_FALHAS_IP) {
            throw new HttpErro(429, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
        }

        $u = Db::one(
            'SELECT u.*, t.ativo AS tenant_ativo FROM usuarios u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.email = ?',
            [$email]
        );
        // Mesmo custo de tempo com ou sem usuário, para não revelar quais e-mails existem.
        $hash = $u['senha_hash'] ?? self::hash(bin2hex(random_bytes(8)));
        $confere = password_verify($senha, $hash);
        $ativo = $u && (int) $u['ativo'] === 1 && ((int) $u['plataforma_admin'] === 1 || (int) $u['tenant_ativo'] === 1);

        Db::run('INSERT INTO login_tentativas (email, ip, sucesso) VALUES (?, ?, ?)', [$email, $ip, ($confere && $ativo) ? 1 : 0]);

        if (!$confere || !$ativo) {
            throw new HttpErro(401, 'E-mail ou senha incorretos.');
        }
        if (password_needs_rehash($u['senha_hash'], PASSWORD_ARGON2ID)) {
            Db::run('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [self::hash($senha), $u['id']]);
        }

        session_regenerate_id(true);
        $_SESSION['usuario_id'] = (int) $u['id'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        Db::run('UPDATE usuarios SET ultimo_login_em = NOW() WHERE id = ?', [$u['id']]);
        self::$usuario = null;
        Auditoria::registrar('login', 'usuarios', (int) $u['id'], null, null, $ip, $u['tenant_id'] ? (int) $u['tenant_id'] : null, (int) $u['id']);
        return self::usuario();
    }

    public static function encerrar(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Lax']);
        }
        session_destroy();
        self::$usuario = null;
    }

    public static function hash(string $senha): string
    {
        return password_hash($senha, PASSWORD_ARGON2ID);
    }

    /** Usuário logado; recarregado do banco a cada requisição (desativação vale na hora). */
    public static function usuario(): array
    {
        if (self::$usuario !== null) return self::$usuario;
        $id = $_SESSION['usuario_id'] ?? null;
        if (!$id) throw new HttpErro(401, 'Faça login para continuar.');
        $u = Db::one(
            'SELECT u.id, u.tenant_id, u.nome, u.email, u.telefone, u.plataforma_admin, u.trocar_senha, u.ativo, t.nome AS tenant_nome, t.ativo AS tenant_ativo
               FROM usuarios u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?',
            [$id]
        );
        if (!$u || !(int) $u['ativo'] || ($u['tenant_id'] && !(int) $u['tenant_ativo'])) {
            self::encerrar();
            throw new HttpErro(401, 'Faça login para continuar.');
        }
        $u['id'] = (int) $u['id'];
        $u['tenant_id'] = $u['tenant_id'] === null ? null : (int) $u['tenant_id'];
        return self::$usuario = $u;
    }

    /** Tenant do usuário logado. Usuários de plataforma não operam dados de tenant. */
    public static function tenantId(): int
    {
        $t = self::usuario()['tenant_id'];
        if ($t === null) throw HttpErro::proibido();
        return $t;
    }
}
