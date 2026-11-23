<?php
declare(strict_types=1);

namespace Ccb\Controladores;

use Ccb\{Acesso, Anexos, Chamados, Db, HttpErro, Ordens, Requisicao, Sessao};

/** Entrega fotos e documentos. Quem não pode ver o dono (casa ou chamado) recebe 404. */
final class AnexosControlador
{
    public static function ver(Requisicao $r, int $id): never
    {
        $t = Sessao::tenantId();
        try {
            $a = Anexos::buscar($t, $id);
        } catch (HttpErro) {
            throw HttpErro::naoEncontrado('Arquivo');
        }
        $pode = match ($a['dono_tipo']) {
            'casa'    => Acesso::podeVerCasa((int) $a['dono_id']),
            'chamado' => (function () use ($a) {
                try { Chamados::carregar((int) $a['dono_id']); return true; } catch (HttpErro) { return false; }
            })(),
            // Foto de etapa da OS: quem vê o chamado.
            'os_etapa' => self::tenta(function () use ($a, $t) {
                $e = Db::one('SELECT os_id FROM os_etapas WHERE tenant_id = ? AND id = ?', [$t, $a['dono_id']]);
                if (!$e) throw HttpErro::naoEncontrado();
                Ordens::carregar((int) $e['os_id']);
            }),
            // Comprovante de gasto da obra: só quem vê os valores.
            'os_gasto' => Acesso::tem('obras.valores') && self::tenta(function () use ($a, $t) {
                $g = Db::one('SELECT os_id FROM os_gastos WHERE tenant_id = ? AND id = ?', [$t, $a['dono_id']]);
                if (!$g) throw HttpErro::naoEncontrado();
                Ordens::carregar((int) $g['os_id']);
            }),
            'cns_produto' => Acesso::tem('cns.ver'),
            'cns_visita'  => self::tenta(fn() => VisitasControlador::carregar($t, (int) $a['dono_id'])),
            default   => false,
        };
        if (!$pode) throw HttpErro::naoEncontrado('Arquivo');
        Anexos::enviar($a, ($r->query['mini'] ?? '') === '1');
    }

    private static function tenta(callable $f): bool
    {
        try { $f(); return true; } catch (HttpErro) { return false; }
    }
}
