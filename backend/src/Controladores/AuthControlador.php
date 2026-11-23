<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Auditoria, Db, HttpErro, Requisicao, Sessao, Validar};

final class AuthControlador
{
    /** Estado da sessão + token CSRF. Chamado ao abrir o app. */
    public static function sessao(Requisicao $r): array
    {
        $logado = isset($_SESSION['usuario_id']);
        try {
            $dados = $logado ? self::eu($r) : null;
        } catch (HttpErro) {
            $dados = null;
        }
        return ['csrf' => Sessao::csrf(), 'usuario' => $dados];
    }

    public static function login(Requisicao $r): array
    {
        $d = (new Validar($r->corpo))->email('email')->texto('senha', true, 200)->ok();
        Sessao::login($d['email'], $d['senha'], $r->ip);
        // De vez em quando, apaga fotos e documentos com prazo de guarda vencido (a hospedagem não tem agendador).
        if (random_int(1, 10) === 1) {
            try { \Ccb\Anexos::limparVencidos(); } catch (\Throwable $e) { error_log('[CCB] limpeza: ' . $e->getMessage()); }
        }
        return ['csrf' => Sessao::csrf(), 'usuario' => self::eu($r)];
    }

    public static function logout(Requisicao $r): array
    {
        if (isset($_SESSION['usuario_id'])) {
            Auditoria::registrar('logout', 'usuarios', (int) $_SESSION['usuario_id'], null, null, $r->ip);
        }
        Sessao::encerrar();
        return ['ok' => true];
    }

    public static function eu(Requisicao $r): array
    {
        $u = Sessao::usuario();
        $ctx = Acesso::contexto();
        $casas = [];
        if ($u['tenant_id'] !== null) {
            $ids = Acesso::casasVisiveis();
            $casas = $ids ? Db::all(
                'SELECT c.id, c.codigo, c.nome, g.nome AS grupo
                   FROM casas_oracao c JOIN grupos g ON g.id = c.grupo_id
                  WHERE c.tenant_id = ? AND c.ativo = 1 AND c.id IN ' . Db::in($ids) . ' ORDER BY g.nome, c.nome',
                array_merge([$u['tenant_id']], $ids)
            ) : [];
            $funcoes = Db::all('SELECT casa_id, funcao FROM usuarios_casas WHERE usuario_id = ?', [$u['id']]);
        }
        return [
            'id'           => $u['id'],
            'nome'         => $u['nome'],
            'email'        => $u['email'],
            'tenant'       => $u['tenant_id'] ? ['id' => $u['tenant_id'], 'nome' => $u['tenant_nome']] : null,
            'trocar_senha' => (bool) $u['trocar_senha'],
            'perfis'       => $ctx['perfis'],
            'permissoes'   => $ctx['permissoes'],
            'grupos'       => $ctx['grupos'],
            'casas'        => $casas,
            'funcoes_casa' => $funcoes ?? [],
        ];
    }

    public static function trocarSenha(Requisicao $r): array
    {
        $u = Sessao::usuario();
        $d = (new Validar($r->corpo))->texto('senha_atual', true, 200)->senha('nova_senha')->ok();
        $atual = Db::one('SELECT senha_hash FROM usuarios WHERE id = ?', [$u['id']]);
        if (!password_verify($d['senha_atual'], $atual['senha_hash'])) {
            throw HttpErro::invalido(['senha_atual' => 'Senha atual incorreta.']);
        }
        if ($d['senha_atual'] === $d['nova_senha']) {
            throw HttpErro::invalido(['nova_senha' => 'A nova senha precisa ser diferente da atual.']);
        }
        Db::run('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?', [Sessao::hash($d['nova_senha']), $u['id']]);
        session_regenerate_id(true);
        Auditoria::registrar('trocar_senha', 'usuarios', $u['id'], null, null, $r->ip);
        return ['ok' => true];
    }
}
