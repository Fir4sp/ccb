<?php
declare(strict_types=1);

namespace Ccb;

/**
 * Arquivos enviados (fotos, orçamentos, notas).
 * - Chegam como data URL (o app já reduz as fotos para no máximo 1600 px).
 * - Fotos são regravadas em JPEG pelo servidor: isso apaga localização (GPS) e qualquer conteúdo escondido.
 * - Ficam em nucleo/arquivos, pasta que a internet não acessa; só saem pela API, com checagem de acesso.
 */
final class Anexos
{
    public const LADO_MAX = 1600;
    public const LADO_MINI = 480;
    public const MAX_IMAGEM = 8 * 1024 * 1024;
    public const MAX_PDF = 8 * 1024 * 1024;

    public static function pasta(): string
    {
        $p = Config::get('pasta_arquivos') ?: (getenv('CCB_PASTA_ARQUIVOS') ?: __DIR__ . '/../arquivos');
        if (!is_dir($p) && !@mkdir($p, 0755, true) && !is_dir($p)) {
            throw new \RuntimeException('Não foi possível criar a pasta de arquivos.');
        }
        if (!is_file("$p/.htaccess")) @file_put_contents("$p/.htaccess", "Require all denied\n");
        return rtrim($p, '/');
    }

    /**
     * Grava um arquivo vindo em data URL e registra em `anexos`.
     * @param bool $aceitaPdf true para orçamentos e notas
     */
    public static function salvar(int $t, string $donoTipo, int $donoId, string $categoria, mixed $dataUrl, ?string $nome, bool $aceitaPdf = false, ?string $expiraEm = null): array
    {
        if (!is_string($dataUrl) || !preg_match('#^data:([\w/+.-]+);base64,(.+)$#s', $dataUrl, $m)) {
            throw HttpErro::invalido(['arquivo' => 'Arquivo inválido.']);
        }
        $bytes = base64_decode($m[2], true);
        if ($bytes === false || $bytes === '') throw HttpErro::invalido(['arquivo' => 'Arquivo inválido.']);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: '';

        $rel = sprintf('%d/%s/%s', $t, date('Y/m'), bin2hex(random_bytes(16)));
        $dir = self::pasta() . '/' . dirname($rel);
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Não foi possível criar a pasta de arquivos.');
        }

        $largura = $altura = null;
        if ($mime === 'application/pdf') {
            if (!$aceitaPdf) throw HttpErro::invalido(['arquivo' => 'Envie uma foto (JPG ou PNG).']);
            if (strlen($bytes) > self::MAX_PDF) throw HttpErro::invalido(['arquivo' => 'O PDF passa de 8 MB.']);
            if (!str_starts_with($bytes, '%PDF-')) throw HttpErro::invalido(['arquivo' => 'PDF inválido.']);
            $rel .= '.pdf';
            file_put_contents(self::pasta() . '/' . $rel, $bytes);
            $tamanho = strlen($bytes);
        } elseif (in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'], true)) {
            if (strlen($bytes) > self::MAX_IMAGEM) throw HttpErro::invalido(['arquivo' => 'A foto passa de 8 MB.']);
            $img = @imagecreatefromstring($bytes);
            if (!$img) throw HttpErro::invalido(['arquivo' => 'Não foi possível ler esta foto. Tente tirar outra.']);
            $mime = 'image/jpeg';
            $rel .= '.jpg';
            [$largura, $altura] = self::gravarJpeg($img, self::pasta() . '/' . $rel, self::LADO_MAX, 82);
            self::gravarJpeg($img, self::pasta() . '/' . self::mini($rel), self::LADO_MINI, 75);
            imagedestroy($img);
            $tamanho = (int) filesize(self::pasta() . '/' . $rel);
        } else {
            throw HttpErro::invalido(['arquivo' => $aceitaPdf ? 'Envie uma foto ou um PDF.' : 'Envie uma foto (JPG ou PNG).']);
        }

        $nome = $nome !== null ? mb_substr(preg_replace('/[^\pL\pN ._()-]/u', '_', $nome) ?? '', 0, 200) : null;
        $ordem = (int) Db::one('SELECT COALESCE(MAX(ordem), 0) + 1 n FROM anexos WHERE tenant_id = ? AND dono_tipo = ? AND dono_id = ?', [$t, $donoTipo, $donoId])['n'];
        $id = Db::insert(
            'INSERT INTO anexos (tenant_id, dono_tipo, dono_id, categoria, caminho, nome_original, mime, tamanho, largura, altura, ordem, criado_por, expira_em)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$t, $donoTipo, $donoId, $categoria, $rel, $nome ?: null, $mime, $tamanho, $largura, $altura, $ordem, Sessao::usuario()['id'], $expiraEm]
        );
        return self::buscar($t, $id);
    }

    /** Reduz (se preciso) e grava em JPEG. Devolve [largura, altura]. */
    private static function gravarJpeg(\GdImage $img, string $destino, int $ladoMax, int $qualidade): array
    {
        $w = imagesx($img);
        $h = imagesy($img);
        $f = min(1, $ladoMax / max($w, $h));
        $nw = max(1, (int) round($w * $f));
        $nh = max(1, (int) round($h * $f));
        $saida = imagecreatetruecolor($nw, $nh);
        imagefill($saida, 0, 0, imagecolorallocate($saida, 255, 255, 255)); // fundo branco para PNG transparente
        imagecopyresampled($saida, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagejpeg($saida, $destino, $qualidade);
        imagedestroy($saida);
        return [$nw, $nh];
    }

    private static function mini(string $rel): string
    {
        return preg_replace('/\.jpg$/', '_m.jpg', $rel);
    }

    public static function buscar(int $t, int $id): array
    {
        $a = Db::one('SELECT * FROM anexos WHERE tenant_id = ? AND id = ? AND excluido_em IS NULL', [$t, $id]);
        if (!$a) throw HttpErro::naoEncontrado('Arquivo');
        return $a;
    }

    public static function listar(int $t, string $donoTipo, int $donoId, ?array $categorias = null): array
    {
        $sql = 'SELECT a.*, u.nome AS autor FROM anexos a LEFT JOIN usuarios u ON u.id = a.criado_por
                 WHERE a.tenant_id = ? AND a.dono_tipo = ? AND a.dono_id = ? AND a.excluido_em IS NULL';
        $p = [$t, $donoTipo, $donoId];
        if ($categorias) {
            $sql .= ' AND a.categoria IN ' . Db::in($categorias);
            $p = array_merge($p, $categorias);
        }
        return array_map([self::class, 'publico'], Db::all($sql . ' ORDER BY a.ordem, a.id', $p));
    }

    /** O que o app recebe sobre um anexo. */
    public static function publico(array $a): array
    {
        $ehImagem = str_starts_with($a['mime'], 'image/');
        return [
            'id'        => (int) $a['id'],
            'categoria' => $a['categoria'],
            'url'       => '/api/anexos/' . $a['id'],
            'mini_url'  => $ehImagem ? '/api/anexos/' . $a['id'] . '?mini=1' : null,
            'imagem'    => $ehImagem,
            'nome'      => $a['nome_original'],
            'legenda'   => $a['legenda'],
            'capa'      => (bool) $a['capa'],
            'largura'   => $a['largura'] === null ? null : (int) $a['largura'],
            'altura'    => $a['altura'] === null ? null : (int) $a['altura'],
            'tamanho'   => (int) $a['tamanho'],
            'criado_por'=> $a['criado_por'] === null ? null : (int) $a['criado_por'],
            'autor'     => $a['autor'] ?? null,
            'criado_em' => $a['criado_em'],
        ];
    }

    /** Marca como excluído e apaga o arquivo do disco. */
    public static function excluir(int $t, int $id): void
    {
        $a = self::buscar($t, $id);
        Db::run('UPDATE anexos SET excluido_em = NOW() WHERE tenant_id = ? AND id = ?', [$t, $id]);
        self::apagarDisco($a['caminho']);
    }

    private static function apagarDisco(string $rel): void
    {
        $base = self::pasta();
        @unlink("$base/$rel");
        if (str_ends_with($rel, '.jpg')) @unlink("$base/" . self::mini($rel));
    }

    /** Entrega o arquivo ao navegador (a checagem de acesso é feita antes, por quem chama). */
    public static function enviar(array $a, bool $mini): never
    {
        $rel = $mini && str_ends_with($a['caminho'], '.jpg') ? self::mini($a['caminho']) : $a['caminho'];
        $arq = self::pasta() . '/' . $rel;
        if (!is_file($arq)) throw HttpErro::naoEncontrado('Arquivo');
        http_response_code(200);
        header('Content-Type: ' . $a['mime']);
        header('Content-Length: ' . filesize($arq));
        header('Cache-Control: private, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        // Fotos: nada pode rodar. PDFs ficam sem "sandbox" para o leitor de PDF do navegador abrir.
        if (str_starts_with($a['mime'], 'image/')) header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox");
        $nome = $a['nome_original'] ?: ('arquivo-' . $a['id'] . ($a['mime'] === 'application/pdf' ? '.pdf' : '.jpg'));
        header('Content-Disposition: inline; filename="' . str_replace('"', '', $nome) . '"');
        readfile($arq);
        exit;
    }

    /** Apaga arquivos com prazo de guarda vencido. Roda de vez em quando, no login. */
    public static function limparVencidos(int $limite = 50): int
    {
        $vencidos = Db::all('SELECT id, tenant_id, caminho FROM anexos WHERE excluido_em IS NULL AND expira_em IS NOT NULL AND expira_em < NOW() LIMIT ' . $limite);
        foreach ($vencidos as $a) {
            Db::run('UPDATE anexos SET excluido_em = NOW() WHERE id = ?', [$a['id']]);
            self::apagarDisco($a['caminho']);
        }
        return count($vencidos);
    }
}
