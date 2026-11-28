# Sistema CCB — v2 (base SGClim)

Gestão das Casas de Oração: **chamados de manutenção com aprovação por alçada, ordens de serviço com checklist**,
e (fases seguintes) **CNS Limpeza** e **visitas**. Produto da **Xclim**. Endereço: https://ccb.xclim.com.br

Desde 24/11/2026 o CCB é **uma cópia do SGClim** (decisão do Eneas), com as diferenças abaixo.
A versão 1 (React) continua no ramo `main` — de lá vem o CNS Limpeza na fase 2.

## Diferenças em relação ao SGClim
| SGClim | CCB v2 |
|---|---|
| Clientes | **Casas de Oração**, com código e **grupo/setor** (botão Grupos) |
| Chamado com proposta, pagamento, nota fiscal, imposto, máquinas | Chamado com **descrição**, **tipo de serviço**, **mão de obra + materiais** do catálogo. Sem pagamento, nota, imposto, margem |
| Cliente aprova a proposta | **Aprovação por alçada**: Coordenação (até R$ 500) → Gestão (até R$ 1.000) → Procurador; **parecer da Segurança do Trabalho** nos tipos marcados. Valores e tipos em Configurações › Chamados e aprovação |
| Perfis admin, comercial, financeiro, coord, técnico, cliente | admin, **coord**, **gestao**, **procurador**, **seguranca**, técnico, cliente (= Casa de Oração) |
| Financeiro, Contratos, PMOC, Assinatura, Assistente IA, WhatsApp, páginas públicas | **retirados** |
| Checklists de climatização | Checklists de **Elétrica, Hidráulica, Civil, Telhado, Ar-condicionado** (Configurações › Checklists de OS) |

## Pastas
`nucleo/` base (banco, sessão, permissões) · `api/` uma ação por módulo (`modulo.verbo`) · `app/` telas (JS) ·
`banco/estrutura.sql` estrutura do SGClim (sem dados) · `banco/ccb/` mudanças do CCB, em ordem.

## Instalar (banco novo)
1. phpMyAdmin › banco vazio › Importar `banco/estrutura.sql`.
2. Importar, em ordem, `banco/ccb/001_*.sql`, `002_*.sql`…
3. Criar a organização e o administrador: `banco/ccb/criar_organizacao.sql` (trocar nome e e-mail; a senha provisória é trocada no 1º acesso).
4. Copiar `nucleo/config.exemplo.php` para `nucleo/config.php` no servidor e preencher (nunca no GitHub).

## Nunca no GitHub
`nucleo/config.php`, `arquivos/`, `_ses/`, backups.
