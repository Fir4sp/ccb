<?php
declare(strict_types=1);

namespace Ccb;

final class Roteador
{
    /** @var array<int, array{string, string, callable, bool}> */
    private array $rotas = [];

    /** $publica = true dispensa login (somente login, sessão e saúde). */
    public function add(string $metodo, string $padrao, callable $acao, bool $publica = false): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>\d+)', $padrao) . '$#';
        $this->rotas[] = [$metodo, $regex, $acao, $publica];
    }

    public function despachar(Requisicao $r): never
    {
        $metodoPermitido = false;
        foreach ($this->rotas as [$metodo, $regex, $acao, $publica]) {
            if (!preg_match($regex, $r->caminho, $m)) continue;
            $metodoPermitido = true;
            if ($metodo !== $r->metodo) continue;
            Sessao::verificarCsrf($r);
            if (!$publica) Sessao::usuario();
            $params = array_map('intval', array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY));
            $resultado = $acao($r, ...$params);
            Resposta::json($resultado ?? ['ok' => true]);
        }
        throw new HttpErro($metodoPermitido ? 405 : 404, $metodoPermitido ? 'Método não permitido.' : 'Endereço não encontrado.');
    }
}
