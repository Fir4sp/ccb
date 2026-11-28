# SGClim

Sistema de gestão para empresas de climatização — produto da **Xclim**.
Em produção em **https://sgclim.xclim.com.br** (Hostinger, PHP + MySQL, app instalável/PWA).

Documentação de negócio, decisões e plano: repositório [`Fir4sp/cerebro`](https://github.com/Fir4sp/cerebro)
(pasta `xclim-sgclim/`).

## Estrutura

| Pasta | O que é |
|---|---|
| `nucleo/` | Base do sistema: banco, sessão, permissões, IA, Asaas, e-mail, notificações |
| `api/` | Ações chamadas pelo app (uma por módulo) |
| `app/` | Telas do app (JavaScript) e ícones |
| `plataforma/` | Console da Xclim para gerenciar as empresas clientes |
| `p/` · `q/` · `r/` | Links públicos: propostas, etiquetas QR, relatórios |
| `cadastro/` · `indique/` · `conheca/` · `legal/` | Páginas públicas |
| `webhook/` | Retorno de pagamentos do Asaas |

## O que NÃO fica aqui (ver `.gitignore`)

- `nucleo/config.php` — senhas e chaves; modelo em `nucleo/config.exemplo.php`
- `arquivos/` — fotos e documentos dos clientes
- `_ses/` — sessões

## Regra de produto

Sistema considerado pronto em 08/11/2026. Funcionalidade nova só entra se **vários clientes** pedirem a mesma coisa.
