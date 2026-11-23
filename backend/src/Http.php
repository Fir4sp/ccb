<?php
declare(strict_types=1);

namespace Ccb;

/** Erro com status HTTP e mensagem pronta para o usuário. */
final class HttpErro extends \RuntimeException
{
    public function __construct(public readonly int $status, string $mensagem, public readonly array $campos = [])
    {
        parent::__construct($mensagem);
    }

    public static function naoEncontrado(string $o = 'Registro'): self { return new self(404, "$o não encontrado."); }
    public static function proibido(): self { return new self(403, 'Você não tem permissão para esta ação.'); }
    public static function invalido(array $campos): self { return new self(422, 'Verifique os campos destacados.', $campos); }
}

final class Requisicao
{
    public function __construct(
        public readonly string $metodo,
        public readonly string $caminho,
        public readonly array $query,
        public readonly array $corpo,
        public readonly string $ip,
        public readonly array $cabecalhos,
    ) {}

    public static function capturar(): self
    {
        $caminho = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        // Aceita a API montada em subpasta (ex.: /api/...).
        $pos = strpos($caminho, '/api/');
        $caminho = $pos === false ? $caminho : substr($caminho, $pos + 4);
        $bruto = file_get_contents('php://input') ?: '';
        $corpo = $bruto !== '' ? json_decode($bruto, true) : [];
        if (!is_array($corpo)) {
            throw new HttpErro(400, 'Corpo da requisição inválido.');
        }
        $cab = [];
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) {
                $cab[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
            }
        }
        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            rtrim($caminho, '/') ?: '/',
            $_GET,
            $corpo,
            $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0',
            $cab,
        );
    }

    public function cabecalho(string $nome): ?string
    {
        return $this->cabecalhos[strtolower($nome)] ?? null;
    }
}

final class Resposta
{
    public static function json(mixed $dados, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: same-origin');
        echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

/** Validação simples e explícita dos dados de entrada. */
final class Validar
{
    private array $erros = [];
    private array $limpo = [];

    public function __construct(private readonly array $dados) {}

    public function texto(string $campo, bool $obrigatorio = true, int $max = 255, int $min = 1): self
    {
        $v = $this->dados[$campo] ?? null;
        $v = is_string($v) ? trim($v) : $v;
        if ($v === null || $v === '') {
            if ($obrigatorio) $this->erros[$campo] = 'Campo obrigatório.';
            else $this->limpo[$campo] = null;
            return $this;
        }
        if (!is_string($v)) { $this->erros[$campo] = 'Valor inválido.'; return $this; }
        if (mb_strlen($v) > $max) { $this->erros[$campo] = "Máximo de $max caracteres."; return $this; }
        if (mb_strlen($v) < $min) { $this->erros[$campo] = "Mínimo de $min caracteres."; return $this; }
        $this->limpo[$campo] = $v;
        return $this;
    }

    public function email(string $campo): self
    {
        $this->texto($campo, true, 190);
        if (isset($this->limpo[$campo]) && !filter_var($this->limpo[$campo], FILTER_VALIDATE_EMAIL)) {
            $this->erros[$campo] = 'E-mail inválido.';
        } elseif (isset($this->limpo[$campo])) {
            $this->limpo[$campo] = mb_strtolower($this->limpo[$campo]);
        }
        return $this;
    }

    public function inteiro(string $campo, bool $obrigatorio = true): self
    {
        $v = $this->dados[$campo] ?? null;
        if ($v === null || $v === '') {
            if ($obrigatorio) $this->erros[$campo] = 'Campo obrigatório.';
            else $this->limpo[$campo] = null;
            return $this;
        }
        if (filter_var($v, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
            $this->erros[$campo] = 'Valor inválido.';
            return $this;
        }
        $this->limpo[$campo] = (int) $v;
        return $this;
    }

    public function booleano(string $campo, bool $padrao): self
    {
        $v = $this->dados[$campo] ?? $padrao;
        $this->limpo[$campo] = filter_var($v, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
        return $this;
    }

    public function senha(string $campo): self
    {
        $v = $this->dados[$campo] ?? '';
        if (!is_string($v) || mb_strlen($v) < 8) {
            $this->erros[$campo] = 'A senha precisa ter pelo menos 8 caracteres.';
        } elseif (!preg_match('/[A-Za-z]/', $v) || !preg_match('/\d/', $v)) {
            $this->erros[$campo] = 'Use letras e números na senha.';
        } else {
            $this->limpo[$campo] = $v;
        }
        return $this;
    }

    public function lista(string $campo): array
    {
        $v = $this->dados[$campo] ?? [];
        return is_array($v) ? array_values($v) : [];
    }

    public function erro(string $campo, string $msg): self { $this->erros[$campo] = $msg; return $this; }

    /**
     * Valor em reais do jeito que se digita no Brasil: "1.234,56", "1234,56", "105.000" (= cento e cinco mil),
     * "R$ 2.000" ou número JSON. Devolve null se não der para entender.
     */
    public static function reais(mixed $x): ?float
    {
        if (is_int($x) || is_float($x)) return round((float) $x, 2);
        if (!is_string($x)) return null;
        $x = trim(str_replace(['R$', ' ', "\u{00A0}"], '', $x));
        if ($x === '') return null;
        if (str_contains($x, ',')) {
            if (!preg_match('/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/', $x)) return null;
            $x = str_replace(['.', ','], ['', '.'], $x);
        } elseif (preg_match('/^\d{1,3}(\.\d{3})+$/', $x)) {
            $x = str_replace('.', '', $x); // pontos de milhar
        } elseif (!preg_match('/^\d+(\.\d{1,2})?$/', $x)) {
            return null;
        }
        return round((float) $x, 2);
    }

    public function ok(): array
    {
        if ($this->erros) throw HttpErro::invalido($this->erros);
        return $this->limpo;
    }
}
