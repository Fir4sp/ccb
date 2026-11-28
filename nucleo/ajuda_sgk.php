<?php
/* =====================================================================
   KONSTANTE SaaS — nucleo/ajuda_sgk.php  (v1.27.0)
   MANUAL DO SISTEMA para o Assistente: "como faço X no sistema?".
   Cada seção: id, titulo, chaves (palavras que a pessoa costuma usar) e texto.
   O Assistente consulta com a ferramenta ajuda_sistema e responde passo a passo
   com os nomes exatos dos menus e botões. Ao mudar uma tela, atualize aqui.
   ===================================================================== */
if (!defined('KSAAS')) { http_response_code(403); exit; }

function ajuda_secoes() {
    return [

['id' => 'visao', 'titulo' => 'Visão geral do sistema, menu e perfis',
 'chaves' => 'menu sistema inicio começar perfis acesso permissão admin coordenação técnico comercial financeiro cliente o que faz modulos',
 'texto' => <<<'T'
O SGClim é o sistema de gestão da empresa de climatização. O menu (à esquerda no computador; no celular, no botão ☰ ou na grade de atalhos do Início) tem:
- Início: o seu dia — atalhos, suas OS e tarefas de hoje e atrasadas, chamados parados, propostas vencendo.
- CRM: Chamados (orçamentos), Contratos, Clientes, Catálogo e preços.
- Operacional: Ordens de serviço (OS), Tarefas (lista e calendário), PMOC.
- Financeiro: contas a receber e a pagar, fluxo de caixa, DRE, conciliação bancária.
- Empresa: Usuários, Configurações, Ajuda e sugestões. E o Assistente (este chat).
Perfis (um usuário pode acumular mais de um):
- Administrador: tudo, inclusive valores em R$, usuários e configurações.
- Coordenação: chamados, OS, tarefas, PMOC e usuários técnicos; não vê valores.
- Comercial: chamados, orçamentos, contratos, clientes.
- Financeiro: módulo Financeiro.
- Técnico: só as OS, tarefas e planos PMOC em que está escalado; registra fotos, checklist, assinatura.
- Cliente: só a Área do cliente (máquinas, serviços, relatórios e solicitações das unidades dele).
Módulos que a sua empresa não contratou não aparecem no menu.
T],

['id' => 'chamado_criar', 'titulo' => 'Abrir um chamado (pedido de orçamento)',
 'chaves' => 'chamado novo abrir criar pedido orçamento cliente necessidade tipo de serviço montar chamado registrar pedido',
 'texto' => <<<'T'
1. Menu CRM › Chamados › botão "Novo chamado" (ou no Início, "+ Novo chamado").
2. Cliente: digite o nome e escolha na lista. Se não existir, use "Cadastrar cliente" ali mesmo.
3. Preencha "Com quem falar", o Tipo de serviço (Instalação, Higienização, Manutenção preventiva, corretiva…) e a Descrição do serviço (o que o cliente pediu — é o texto que sai na proposta).
4. Observação interna: anotações que o cliente NÃO vê (aparece no card do chamado).
5. Responsável: quem cuida do chamado.
6. Toque em "Salvar chamado". O chamado nasce com status "Falta enviar orçamento" e recebe o número sequencial da empresa.
Dica: o Assistente pode redigir a Descrição do serviço (peça "escreva o descritivo do chamado 612").
T],

['id' => 'chamado_orcamento', 'titulo' => 'Montar o orçamento do chamado (serviços, máquinas, materiais, imposto, RT)',
 'chaves' => 'orçamento orcamento montar preço serviço material materiais máquina infra metros gerar materiais imposto rt desconto parcelas lista de compra valor proposta catálogo',
 'texto' => <<<'T'
Só administrador (e comercial) veem a parte de valores.
1. Abra o chamado (CRM › Chamados › toque no chamado).
2. Na parte do orçamento:
   - "+ Serviço": escolha do catálogo (busque pelo nome) e a quantidade. O preço vem do Catálogo e preços.
   - "+ Máquina": tipo de máquina, metros de infra (total) e quantidade de máquinas.
   - "Gerar materiais": calcula a lista pelas regras do catálogo (tubulação em kg pelo fator, isolamento em metros, cabo = metros + 2 por máquina, fita = metros ÷ 3, acessórios e insumos). A margem dos materiais (ex.: 15%) é somada ao pacote.
   - "+ Material" para incluir algo à mão. Opcionais podem ser marcados.
3. Marque Imposto (com nota) e RT se for o caso; informe desconto e parcelas. Imposto e RT ficam diluídos nos itens — o cliente não vê linhas de imposto/RT.
4. "Lista de compra" gera a lista de materiais para comprar.
5. "Salvar alterações" ou "Salvar e gerar PDF".
Os preços do catálogo mudam em CRM › Catálogo e preços; a margem e os textos do PDF em Configurações › Orçamento.
T],

['id' => 'chamado_proposta', 'titulo' => 'Enviar a proposta ao cliente (PDF, link e WhatsApp) e aprovação',
 'chaves' => 'proposta enviar pdf whatsapp link cliente aprovar aprovação aceite validade renovar mandar orçamento',
 'texto' => <<<'T'
1. No chamado, toque em "WhatsApp ▾" › "Enviar proposta": abre o WhatsApp com a mensagem e o link da proposta. "Conversar" só abre a conversa com o cliente.
2. O link é fixo: mostra sempre a versão atual do orçamento. O cliente abre sem senha, vê a proposta, pode "Aprovar" ou "Recusar"; a visualização e a aprovação ficam registradas no chamado.
3. "Copiar link" copia o endereço para mandar a qualquer pessoa (e-mail, outro contato).
4. "Proposta em PDF" / "PDF" gera o arquivo para imprimir ou salvar.
5. Validade: o padrão é 15 dias (Configurações › Orçamento). Proposta vencendo aparece no Início em "Propostas e retornos". Use "Renovar validade" para reabrir o prazo e "Registrar contato" para anotar o retorno e marcar o "Próximo retorno".
Depois de enviar, deixe o status em "Aguardando aprovação".
T],

['id' => 'chamado_status', 'titulo' => 'Status do chamado, filtros e indicadores do CRM',
 'chaves' => 'status chamado aprovado não aprovado concluído em andamento falta pagamento aguardando 2ª etapa filtro ativos esconder indicadores período ganho perdido mudar status alterar',
 'texto' => <<<'T'
Status: Falta enviar orçamento → Aguardando aprovação → Aprovado → Em Andamento → Aguardando 2ª etapa → Falta pagamento → Concluído. Ou "Não Aprovado" (perdido).
- Para mudar: abra o chamado, troque o Status e salve. "Concluído" e "Não Aprovado" gravam a data de fechamento.
- A lista abre em "Ativos" (esconde Concluído e Não Aprovado). Use os filtros do topo para ver todos ou por status.
- Os indicadores do topo são do período escolhido (padrão: mês atual); ganho conta no mês do fechamento.
- Chamado ganho (Aprovado) gera as parcelas a receber no Financeiro, conforme os vencimentos informados no chamado ("Salvar vencimentos").
- Excluir: dentro do chamado, botão "Excluir" (só administrador).
T],

['id' => 'chamado_alterar', 'titulo' => 'Alterar um chamado, trocar o cliente ou corrigir dados',
 'chaves' => 'alterar editar mudar corrigir chamado trocar cliente filial descrição observação responsável',
 'texto' => <<<'T'
1. CRM › Chamados › toque no chamado.
2. Altere o que precisar (cliente, com quem falar, tipo, descrição, observação interna, responsável, status, orçamento).
3. "Salvar alterações".
Trocar o cliente do chamado leva junto as OS dele. Para OS feita numa filial e cobrada na sede, troque o cliente só na OS (Editar OS).
T],

['id' => 'os_criar', 'titulo' => 'Criar uma Ordem de Serviço (OS)',
 'chaves' => 'os ordem de serviço criar nova abrir gerar os do chamado técnico agendar data prazo vários dias tarefas checklist endereço',
 'texto' => <<<'T'
Pelo chamado (recomendado): abra o chamado ganho › no quadro "Ordens de serviço" toque "+ Criar OS".
Pelo menu: Operacional › Ordens de serviço › "Nova OS" (ou no Início "+ Nova OS") e escolha o chamado.
1. A OS recebe o número do chamado (a 2ª OS do mesmo chamado vira 590-2).
2. Escolha o Tipo de serviço: o checklist de etapas vem de Configurações › Checklists de OS. É criada uma tarefa por máquina do orçamento.
3. Data prevista, hora e "Prazo de término" (OS de vários dias aparece em todos os dias no calendário).
4. Endereço: "Endereço do cliente" ou "Outro endereço" (obra em outro local).
5. Marque os técnicos. Eles recebem aviso no celular e só eles veem a OS.
6. "Criar OS".
Para mudar qualquer coisa depois (dados, tipo, endereço, técnicos, tarefas): dentro da OS, botão "✎ Editar".
T],

['id' => 'os_campo', 'titulo' => 'Executar a OS em campo (técnico): etapas, fotos, assinatura e finalizar',
 'chaves' => 'técnico campo executar os etapa checklist ok não ok nf não feito problema n/a foto câmera galeria assinatura cliente ausente finalizar conclusão pendência material diário maps ligar',
 'texto' => <<<'T'
1. O técnico abre o app: cai direto nas OS dele (ou Início › Minhas OS).
2. "📍 Abrir no Maps" traça a rota; "📞 Ligar" liga para o contato.
3. Em cada tarefa/máquina, marque as etapas: "✓ OK" (conforme), "Não OK" (não conforme), "NF" (não feito) ou "N/A" (não se aplica) — o mesmo padrão do PMOC.
4. Fotos: "📷 Câmera" (tira na hora) ou "🖼 Galeria" (várias). Cada bloco/máquina tem as suas fotos; há também Fotos gerais. Toque na foto para ampliar (zoom com pinça ou duplo toque).
5. Pendências e materiais usados podem ser registrados na OS; o diário é interno (não sai no relatório).
6. Conferência final: escreva a Conclusão, assine como técnico e colha a assinatura do responsável no local (ou marque "Cliente ausente").
7. Finalizar → status "Serviço finalizado". O escritório confere, fatura e passa para "Concluída".
Sem internet: tudo fica guardado no aparelho e sobe sozinho quando a conexão voltar (veja o indicador Online/Offline).
T],

['id' => 'os_relatorio', 'titulo' => 'Relatório da OS (PDF e link para o cliente)',
 'chaves' => 'relatório os pdf link whatsapp enviar cliente imprimir',
 'texto' => <<<'T'
1. Abra a OS › "Relatório PDF" para ver/imprimir/salvar em PDF.
2. "WhatsApp" manda ao cliente o link do relatório (página com o relatório e o botão "Salvar PDF / Imprimir"). O link pode ser repassado a qualquer pessoa.
3. O relatório traz cliente, local, equipe, serviços executados, fotos, pendências, conclusão e assinaturas. O diário interno não sai.
T],

['id' => 'os_lista', 'titulo' => 'Lista de OS, status e onde ver todas',
 'chaves' => 'lista os todas filtrar agendadas em execução com pendência a faturar concluídas status cancelar reabrir excluir início minhas',
 'texto' => <<<'T'
- Operacional › Ordens de serviço: cartões no topo (Agendadas, Em execução, Com pendência, A faturar, Concluídas no mês) filtram a lista; há busca por cliente/número.
- No Início aparecem só as OS em que VOCÊ é o responsável ou está escalado (de hoje e atrasadas). Para ver as demais: "Ver todas as OS".
- Status: Aberta, Agendada, Em deslocamento, Em execução, Pausada, Aguardando material, Aguardando retorno, Com pendência, Serviço finalizado, Concluída, Cancelada. Mude dentro da OS.
- OS de vários dias só fica "atrasada" depois do prazo de término.
- "Excluir OS" fica dentro da OS (só escritório).
T],

['id' => 'tarefas', 'titulo' => 'Tarefas: criar, responsáveis, checklist, concluir e calendário',
 'chaves' => 'tarefa tarefas criar nova responsável todos checklist concluir baixa reabrir calendário agenda ata reunião prioridade atrasada hoje',
 'texto' => <<<'T'
1. Operacional › Tarefas: escreva no campo "Adicionar uma tarefa" no topo da lista e tecle Enter — ela já aparece na lista, para você (igual ao Google Tarefas). No calendário, toque no número do dia.
2. Para completar, toque na tarefa: título, detalhes (descrição), data, hora, prioridade e "Para quem" se editam ali mesmo; depois "Salvar".
3. "Mais opções" (dentro da tarefa): checklist ("+ Item do checklist"), blocos de texto ("📋 Modelo de ata de reunião"), cliente, endereço e repetição.
4. A descrição aparece embaixo do título na lista.
- Concluir: na lista, toque no círculo da tarefa (um toque); dentro da tarefa aberta, status "✓ Feita" (fica fora do rodapé para não concluir sem querer).
- Fotos com "📷 Câmera"/"🖼 Galeria"; comentários ficam no histórico; "Relatório PDF" imprime.
- "Calendário" mostra tarefas e OS juntas ("Mostrar OS"); OS de vários dias ocupa todos os dias até o prazo.
- O Assistente cria tarefas e dá baixa por você (ele mostra um cartão para confirmar).
T],

['id' => 'clientes', 'titulo' => 'Clientes: cadastrar, importar planilha e link de cadastro',
 'chaves' => 'cliente clientes cadastrar novo editar importar planilha excel link formulário cadastro whatsapp origem como conheceu cnpj cpf unidade',
 'texto' => <<<'T'
- CRM › Clientes › "Novo cliente": nome, documento (CNPJ/CPF), contato, telefone, e-mail, endereço e Origem (como conheceu a empresa — obrigatória para cliente novo).
- Importar vários: "Importar planilha" (só administrador) › "Baixar modelo (.xlsx)" › preencha › "Escolher planilha" › confira a simulação › "Importar".
- Link de cadastro: Configurações › Link de cadastro › "Copiar link" ou "Mandar pelo WhatsApp". O cliente preenche a ficha sem senha e entra direto em Clientes (pode criar uma tarefa automática de orçamento).
- Editar: toque no cliente › "Editar" › "Salvar".
T],

['id' => 'catalogo', 'titulo' => 'Catálogo e preços (serviços, materiais e tipos de máquina)',
 'chaves' => 'catálogo catalogo preço preços serviço material tipo de máquina kit regra fator tubulação atualizar valor tabela',
 'texto' => <<<'T'
CRM › Catálogo e preços (administrador/comercial):
- Serviços: "Novo serviço", nome e preço. Desmarque "Ativo" para tirar do orçamento sem apagar.
- Materiais: "Novo material", unidade e preço (custo). A margem do pacote fica em Configurações › Orçamento.
- Tipos de máquina: "Novo tipo de máquina" com as regras de infra (fator da tubulação em kg/m, acessórios por máquina). É o que o botão "Gerar materiais" usa.
Mudar preço não altera orçamentos já salvos.
T],

['id' => 'contratos', 'titulo' => 'Contratos (CRM): quadro, proposta, renovação e cobrança mensal',
 'chaves' => 'contrato contratos manutenção mensal proposta minuta assinado quadro kanban renovar vigência reajuste cobrança mensalidade pmoc',
 'texto' => <<<'T'
1. CRM › Contratos › "Novo contrato": cliente, título, com quem falar, responsável, modalidade e periodicidade.
2. O quadro ("▦ Quadro" ou "☰ Lista") tem as etapas Solicitado → Em elaboração → Proposta enviada → Em negociação → Ativo. Mova pelo botão "Mover para …".
3. Aba Arquivos: "Anexar arquivo" para a proposta (feita no Word), minuta, negociação e contrato assinado.
4. Aba Acompanhamento: "Registrar contato" e "Próximo retorno".
5. Ativo: valor mensal, vigência e "Renovação automática"; "Renovar" quando vencer. "Abrir PMOC" liga ao plano do cliente.
6. Aba Cobrança: "Cobrar mensalmente pelo Financeiro" gera as mensalidades a receber ("Emite nota fiscal" entra na provisão de impostos).
T],

['id' => 'pmoc_plano', 'titulo' => 'PMOC: criar o plano anual, máquinas, técnicos, datas e normas',
 'chaves' => 'pmoc plano anual criar novo plano máquinas equipamentos tag formulário técnico do mês ano todo data prevista normas art responsável técnico engenheiro regime residente volante',
 'texto' => <<<'T'
1. Operacional › PMOC › "+ Novo plano": cliente, ano, mês de início, responsável técnico (engenheiro), registro CREA/CFT e ART, regime (equipe volante/residente) e equipe.
2. O plano abre na VISÃO DO ANO:
   - Botões de documento: "Relatório anual", "Documento técnico" (do mês) e "Livro do PMOC". "Máquinas do plano" escolhe os equipamentos e o formulário de cada um.
   - Responsabilidade técnica (engenheiro, registro, ART) — sai em todos os documentos.
   - Normas: as obrigatórias já vêm marcadas; marque as adicionais do cliente (RDC 50, NBR 7256, NBR 16101, NBR 15848, NR-10).
   - "Enviar o ano todo para o técnico" passa os 12 meses de uma vez.
   - Grade dos 12 meses: cada mês mostra status (Pendente, Em andamento, Concluído, Atrasado), quantas máquinas foram apontadas, o Técnico e a Data prevista (escolha ali mesmo) e os botões "Apontar/Abrir" e "Documento".
3. Técnico só vê planos em que está escalado. Plano sem ninguém escalado fica só com o escritório.
Tipos de equipamento (Hi-wall, Piso-teto…) e formulários: PMOC › "Tipos de equipamento" e "Formulários".
T],

['id' => 'pmoc_apontar', 'titulo' => 'PMOC: apontar a preventiva do mês (técnico)',
 'chaves' => 'apontar apontamento preventiva mês técnico checklist ok não ok nf não feito n/a na medições histórico da máquina executado parcialmente pendência foto qr code etiqueta concluir equipamento faltam',
 'texto' => <<<'T'
1. PMOC › toque no cliente › "Apontar PMOC do mês" (ou, no plano, toque no mês › "Apontar"). Também dá para ler a etiqueta QR da máquina ("Ler QR").
2. A lista mostra as máquinas do mês; use "Faltam" para ver só o que falta e a busca por TAG/andar.
3. Em cada máquina: marque os itens OK (conforme) / Não OK (não conforme) / NF (não feito) / N/A (não aplicável), preencha as Medições, observação, pendências (com prioridade e material) e fotos. "Tudo OK" marca tudo de uma vez. A aba "Histórico da máquina" mostra o que foi feito em cada item nos meses anteriores (ex.: quando foi a última lavagem de serpentina e quando vence a próxima).
   Status da máquina no mês: Executado (tudo OK ou N/A), Executado parcialmente (algum NF) ou Pendência (algum Não OK).
4. "Concluir equipamento". Sem internet funciona igual e sincroniza depois.
5. Pendências abertas aparecem no cliente; resolva com "Resolver" ou atenda com uma Ocorrência.
T],

['id' => 'pmoc_ocorrencia', 'titulo' => 'PMOC: registrar ocorrência (chamado no local / corretiva) em um passo',
 'chaves' => 'ocorrência ocorrencia corretiva chamado no local registrar atender defeito vazamento pingando os de contrato já atendi agendar',
 'texto' => <<<'T'
1. PMOC › toque no cliente › "Registrar ocorrência" (ou, numa pendência, "Ocorrência").
2. "Já atendi" (padrão): escolha a máquina, escreva o Motivo do chamado (por que foram chamados), O que foi feito, Materiais usados (um por linha) e fotos (Câmera/Galeria). Toque "Salvar ocorrência".
   A OS de contrato (C-0001…) já nasce concluída no histórico da máquina — não precisa preencher lista de tarefas. Se veio de uma pendência, ela fica resolvida.
3. "Agendar para depois": abre a OS de contrato com prioridade, data e técnicos, para executar no fluxo normal de OS.
4. "Criar equipamento" é para máquina instalada depois da implantação (não gera ocorrência).
T],

['id' => 'pmoc_maquinas', 'titulo' => 'PMOC: cadastrar, importar e etiquetar máquinas',
 'chaves' => 'máquinas equipamentos cadastrar importar planilha levantamento etiqueta qr imprimir excluir todas restaurar histórico tag',
 'texto' => <<<'T'
- PMOC › cliente › "Máquinas": lista, histórico de cada máquina, "Editar", "Etiqueta QR" e "Imprimir etiquetas".
- Planilha de levantamento: "Importar / atualizar planilha" › "Baixar planilha modelo" (Ambiente, Andar, Tipo, Marca, Modelo, Capacidade, Condensadora, Fluido, Tensão, Ocupantes, Área, Carga térmica) › "Escolher planilha".
- "Excluir todas" apaga as máquinas sem perder as OS feitas; "Desfazer exclusão" traz de volta a última exclusão.
- A etiqueta QR: sem app mostra a ficha pública e o histórico; com o app, o técnico cai direto no apontamento.
T],

['id' => 'portal', 'titulo' => 'Área do cliente (portal) e usuário cliente',
 'chaves' => 'área do cliente portal cliente acesso usuário cliente unidade regional ver máquinas relatórios solicitação livro',
 'texto' => <<<'T'
1. Usuários › "Novo usuário" com perfil Cliente, escolhendo o cliente. Para gerente de várias unidades: "+ Adicionar unidade".
2. O cliente entra com e-mail e senha e vê só a Área do cliente: máquinas, serviços executados, pendências, relatórios do mês, Livro do PMOC e "Enviar solicitação". Nunca vê valores.
3. Na visão anual aparecem todas as máquinas: ✓ preventiva, • parcial, ● OS/corretiva. Tocar na máquina abre o histórico dela.
4. Para ver o que o cliente vê: Operacional › "Visão do cliente" e escolha o cliente (admin e coordenação).
- Solicitação do cliente vira tarefa (tipo "Solicitação do cliente"). Comentários e fotos dessa tarefa aparecem para o cliente; ele toca na solicitação, vê o que foi feito e pode responder. Na tarefa, "Abrir OS / registrar atendimento" cria a OS ligada à solicitação.
- OS de equipamento: dentro da OS, "✎ Editar" › Equipamento liga a OS à máquina; ela passa a aparecer no histórico da máquina e na área do cliente.
- Quando a OS é finalizada (ou concluída/cancelada), os técnicos saem da escala e a OS some da lista deles; o relatório mostra quem executou.
T],

['id' => 'financeiro_lancar', 'titulo' => 'Financeiro: lançar conta a pagar ou a receber (com nota e já pago)',
 'chaves' => 'financeiro lançar lançamento conta a pagar a receber despesa receita nota fiscal boleto comprovante anexar arquivo foto já pago já recebido parcelas categoria competência vencimento duplicado',
 'texto' => <<<'T'
1. Financeiro › "+ A pagar" (vermelho) ou "+ A receber" (azul).
2. Descrição, fornecedor/cliente, valor, vencimento (pode ficar em branco), parcelas, categoria (plano de contas — decide a linha da DRE; "+ Nova" cria sem sair), competência, conta e forma.
3. A receber: "Nota fiscal" (com nota entra na provisão de impostos).
4. Opcional: ligar a um chamado ou contrato (entra na Rentabilidade).
5. Se já foi pago/recebido: marque "Já foi pago" / "Já foi recebido", data e conta — a baixa é registrada junto, sem entrar de novo.
6. Nota, boleto ou comprovante: "📷 Câmera" ou "📎 Arquivo (foto ou PDF)" no próprio formulário — sobe junto ao salvar.
7. "Salvar" (ou "Salvar como pago"). O sistema avisa se parecer repetido (mesmo valor, vencimento e pessoa) e não grava duas vezes se o botão for tocado duas vezes.
Depois: toque no lançamento para "Registrar pagamento/recebimento", anexar mais arquivos, "Editar", "Cancelar lançamento" ou "Estornar" uma baixa.
T],

['id' => 'financeiro_outros', 'titulo' => 'Financeiro: contas, cartão, transferências, recorrentes, fluxo, DRE e impostos',
 'chaves' => 'conta banco saldo cartão de crédito fatura compra no cartão transferir transferência tarifa ajuste recorrente despesa fixa receita fixa fluxo de caixa dre impostos guia provisão rentabilidade centro de custo categorias plano de contas fornecedor',
 'texto' => <<<'T'
- Contas: aba Contas › "Nova conta" (banco, caixa ou cartão de crédito com limite e melhor dia de compra). "Faturas" mostra as faturas do cartão.
- "Compra no cartão": lança a compra na fatura certa (compra depois do melhor dia cai na fatura seguinte).
- "Transferir" entre contas; "Tarifa / ajuste" para tarifas e acertos.
- Recorrentes: Cadastros › "+ Despesa fixa" / "+ Receita fixa" gera os lançamentos dos próximos meses.
- Fluxo de caixa: diário (realizado × projetado) e mensal. DRE: no formato gerencial, com "Exportar para Excel" e "Imprimir".
- Impostos: provisão mensal sobre receita com nota; "Lançar guia" registra o valor apurado pelo contador.
- Cadastros: categorias (macro), plano de contas com código, centros de custo e fornecedores.
T],

['id' => 'financeiro_conciliacao', 'titulo' => 'Financeiro: importar extrato (OFX/CSV) e conciliar',
 'chaves' => 'conciliação conciliar extrato ofx csv banco importar automático lançar e conciliar ignorar desfazer',
 'texto' => <<<'T'
1. Financeiro › aba Conciliação › escolha a conta › "Importar extrato (OFX ou CSV)".
2. "Conciliar automático" casa o que tem correspondência certa.
3. Linha a linha: escolha o lançamento sugerido, ou "Lançar…" para criar (despesa/receita ou transferência entre contas) já conciliado, ou "Ignorar".
4. A conciliação em andamento fica salva: pode sair para criar uma categoria e voltar.
5. "Importações" lista os extratos importados e permite desfazer.
T],

['id' => 'usuarios', 'titulo' => 'Usuários: criar, perfis, senha e excluir',
 'chaves' => 'usuário usuarios criar novo técnico senha esqueci trocar senha definir senha perfil acesso excluir login e-mail',
 'texto' => <<<'T'
1. Empresa › Usuários › "Novo usuário": nome, e-mail (é o login), cargo e perfil(s). Técnicos aparecem para escalar em OS, tarefas e PMOC.
2. "Definir senha": o administrador cria uma senha provisória; a pessoa troca no primeiro acesso.
3. Cada um troca a própria senha no menu do usuário (canto superior) › "Trocar minha senha".
4. "Excluir" tira o acesso na hora; o histórico continua.
T],

['id' => 'config', 'titulo' => 'Configurações da empresa (dados, logo, cores, orçamento, checklists, numeração)',
 'chaves' => 'configurações configuracoes dados da empresa logo cores aparência orçamento margem validade pdf dados bancários checklists de os numeração link de cadastro',
 'texto' => <<<'T'
Empresa › Configurações (só administrador), abas:
- Dados da empresa: razão social, CNPJ, endereço, telefone, e-mail (saem nos PDFs).
- Orçamento: margem dos materiais, validade da proposta, imposto/RT padrão, dados bancários e textos do PDF.
- Checklists de OS: etapas de cada tipo de serviço ("+ Checklist", "Salvar checklists").
- Aparência: "Enviar logo", cores Principal e Secundária ("Salvar cores").
- Link de cadastro: link público para o cliente se cadastrar.
- Numeração: próximos números de chamado e OS.
T],

['id' => 'app', 'titulo' => 'Instalar o app no celular, notificações, sem internet e rascunho',
 'chaves' => 'app celular instalar tela inicial notificação aviso sino push offline sem internet sincronizar pendentes rascunho recarregar perdi texto atualizar versão',
 'texto' => <<<'T'
- Instalar: abra o sistema no Chrome do celular › menu ⋮ › "Instalar app" / "Adicionar à tela inicial" (no iPhone: Compartilhar › "Adicionar à Tela de Início").
- Notificações: aceite os avisos quando o app pedir; o sino mostra o contador. Aviso lido sai da lista.
- Sem internet: OS, PMOC e fotos ficam guardados no aparelho; o indicador mostra Offline/pendentes e envia sozinho quando a conexão voltar.
- Rascunho: o que você digita fica salvo no aparelho. Se a tela recarregar sem querer, a OS/tarefa/chamado aberto volta aberto e o texto volta com o aviso "Rascunho recuperado" (Manter ou Descartar). Puxar a tela para baixo não recarrega mais.
- Versão nova: feche e abra o app (ou recarregue) para atualizar.
T],

['id' => 'suporte', 'titulo' => 'Ajuda, sugestões e reclamações para a plataforma',
 'chaves' => 'suporte ajuda problema erro bug sugestão reclamação falar com suporte print',
 'texto' => <<<'T'
Empresa › Ajuda e sugestões: descreva o problema ou a sugestão e anexe um print. A resposta da plataforma aparece ali mesmo.
Para dúvidas de uso, pergunte ao Assistente (este chat).
T],

    ];
}

/* busca simples por palavras (sem acento), devolve as seções mais parecidas */
function ajuda_buscar($pergunta, $max = 3) {
    $norm = function ($s) {
        $s = mb_strtolower((string) $s);
        $s = strtr($s, ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','é'=>'e','ê'=>'e','í'=>'i','ó'=>'o','ô'=>'o','õ'=>'o','ú'=>'u','ü'=>'u','ç'=>'c']);
        return preg_replace('/[^a-z0-9 ]+/', ' ', $s);
    };
    $vazias = array_flip(['a','o','as','os','de','da','do','das','dos','e','em','no','na','nos','nas','um','uma','para','pra','com','como','que','faco','fazer','eu','meu','minha','se','por','ao','sistema','sgk','onde','qual','quero','preciso','posso','consigo']);
    $pal = array_values(array_filter(explode(' ', $norm($pergunta)), function ($p) use ($vazias) { return strlen($p) > 1 && !isset($vazias[$p]); }));
    $out = [];
    foreach (ajuda_secoes() as $s) {
        $ch = ' ' . $norm($s['chaves'] . ' ' . $s['titulo']) . ' ';
        $tx = $norm($s['texto']);
        $pt = 0;
        foreach ($pal as $p) {
            $raiz = strlen($p) > 5 ? substr($p, 0, strlen($p) - 2) : $p;   /* "lançamento" acha "lançar" */
            if (strpos($ch, ' ' . $p . ' ') !== false) $pt += 5;
            elseif (strpos($ch, $raiz) !== false) $pt += 3;
            if (strpos($tx, $raiz) !== false) $pt += 1;
        }
        if ($pt > 0) $out[] = ['pt' => $pt, 's' => $s];
    }
    usort($out, function ($a, $b) { return $b['pt'] <=> $a['pt']; });
    return array_map(function ($x) { return ['titulo' => $x['s']['titulo'], 'texto' => $x['s']['texto']]; }, array_slice($out, 0, $max));
}

function ajuda_indice() {
    return implode('; ', array_map(function ($s) { return $s['titulo']; }, ajuda_secoes()));
}
