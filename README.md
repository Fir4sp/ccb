# Sistema CCB

Gestão das Casas de Oração: manutenção (chamados, OS, áreas), CNS Limpeza (loja, ciclo de pedidos,
análises, consolidação, compras, entrega) e estoques dos DMLs. Produto da **Xclim**, no ar em
https://ccb.xclim.com.br (Hostinger). Ficha completa no cérebro: `skills/dev-xclim/produtos/ccb/`.

## Pastas

| Pasta | O que é | No servidor vira |
|---|---|---|
| `backend/` | PHP 8 sem dependências (`src/`, `src/Controladores/`, `public/index.php` = API REST, `database/migrations/`, `bin/`, `tests/`) | `nucleo/` (bloqueada para a internet) |
| `frontend/` | App React + Vite (PWA) | `npm run build` → conteúdo de `frontend/dist/` na raiz do subdomínio |
| `implantacao/publicar/` | `api/index.php` (porta da API), `localizar_app.php`, instalador | raiz do subdomínio |
| `docs/` | guias de instalação e atualização | — |

## Nunca no GitHub
`backend/config/config.local.php` (senha do banco — modelo em `config.local.exemplo.php`), `backend/arquivos/` (fotos e notas reais), backups.

## Testes
MySQL/MariaDB local com usuário `ccb`/`ccb`: `bash backend/tests/executar.sh` (cria `ccb_test`, sobe o PHP embutido e roda os testes de ponta a ponta).
