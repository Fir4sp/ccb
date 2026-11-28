/* KONSTANTE SaaS — sw.js (service worker do app instalado)
   - POST e tudo que não for GET: direto para a rede (a fila sem internet fica no app, em IndexedDB).
   - Outros domínios (Google Fonts): o navegador cuida, o SW não mexe.
   - Página (index): rede primeiro; sem internet, abre a última cópia.
   - Arquivos de app/ (js, css, ícones): cache primeiro. Como carregam com ?v=,
     trocar a versão no index.html já força buscar o arquivo novo.
   - v1.12.0: na instalação já guarda TODOS os arquivos do app, para abrir sem internet
     mesmo que a pessoa ainda não tenha passado por todas as telas.
   - v1.13.0: a página pública da etiqueta QR (q/) fica fora do service worker.
   - v1.14.0: Termos e Privacidade (legal/) ficam fora do service worker; módulo suporte.js.
   - v1.15.0: módulo contratos.js (CRM › Contratos).
   - v1.16.0: área do cliente completa (1.16.1: sem o menu do sistema, igual ao portal antigo), documentos do PMOC no formato Konstante, importação de planilha.
   - v1.17.0: landing.js (página de apresentação) e contratos em quadro.
   - v1.17.1: pendência do PMOC com prioridade e material/peça.
   - v1.18.0: página pública da proposta (p/) fica fora do service worker; tipos de equipamento; PMOC por técnico escalado.
   - v1.18.1: WhatsApp disponível em qualquer status; técnico do mês e "ano todo" direto no plano do PMOC.
   - v1.18.2: botão Editar OS no topo da OS; tipo de serviço editável.
   - v1.18.3: um único Editar na OS (dados, tipo, endereço, técnicos e tarefas).
   - v1.18.4: diário de obra não sai no relatório da OS (só a conclusão).
   - v1.19.0: notificações no celular (push) e sinal no ícone; módulos por empresa; relatório da OS por link (r/ fora do SW);
     landing saiu do app (mora em /sgk/conheca/).
   - v1.20.0: Assistente de IA (assistente.js) e indicador de uso no Console.
   - v1.21.0: Assistente em tela própria; notificação tocada no celular marca como lida; links de proposta fixos.
   - v1.22.0: Financeiro (financeiro.js) e perfis Financeiro/Comercial com acúmulo.
   - v1.23.0: chamado ganho gera as parcelas a receber no Financeiro; vencimentos no chamado.
   - v1.24.0: fluxo de caixa, recorrentes, importação de extrato e conciliação.
   - v1.25.0: DRE, impostos (provisão × apurado), rentabilidade e cobrança mensal dos contratos.
   - v1.25.1: provisão só com nota fiscal; botões receber/pagar com cores; DRE com o ano inteiro.
   - v1.25.2: cartão de crédito (limite, melhor dia, faturas); fluxo diário realizado × projetado; mensal por categoria.
   - v1.25.3: conciliação retoma de onde parou; "+ Nova" categoria nos formulários; vínculo opcional com chamado/contrato.
   - v1.26.0: DRE no formato xFin (margem de contribuição, ponto de equilíbrio, Excel, impressão); subcategorias.
   - v1.26.1: cliente da OS editável (filial); trocar o cliente do chamado leva as OS junto.
   - v1.26.2: categorias por linha da DRE, com "+ Categoria" em cada título.
   - v1.26.3: Categorias (macro) e Plano de contas com código, como no xFin.
   - v1.27.1: PMOC com visão do ano (12 meses); ocorrência em um passo; Assistente com o manual do sistema;
     Início só com as minhas OS; OS de vários dias no calendário; lançamento já pago e com arquivo;
     rascunho automático e puxar a tela não recarrega; margem no relatório e na proposta.
   - v1.27.2: checklist da OS com "Não OK" e legenda; relatório com a descrição do chamado (sem as orientações da equipe);
     histórico automático fora da tela da OS; OS abertas da pessoa ficam no aparelho para abrir sem internet.
   - v1.27.3: o app confere versão nova ao abrir e ao voltar para a tela, e recarrega sozinho quando ela chega.
   - v1.27.4: descrição do serviço do chamado à vista na OS (técnico vê o que foi enviado ao cliente), acima das orientações.
   - v1.28.0: tarefas no estilo Google Tarefas; equipamento na OS; visão anual com histórico; Visão do cliente; OS finalizada sai da escala.
   - v1.28.1: solicitação do cliente abre no portal (respostas, fotos, OS ligada) e o cliente responde.
   - v1.28.2: extrato com ordem crescente/decrescente e saldo do dia.
   - v1.29.0: SGClim em sgclim.xclim.com.br (raiz do domínio); apresentação em conheca/ fora do SW.
   - v1.30.0: assinatura (planos, teste grátis, cobrança pelo Asaas, modo de consulta) — assinatura.js.
   - v1.31.0: cortesia com data (MVP), indicações com comissão e cupons de campanha.
   - v1.32.0: planos Básico/Profissional/Premium com preço de lançamento; Financeiro avançado só no Premium.
   - v1.34.0: checklist OK / Não OK / NF / N/A no PMOC e na OS; status do PMOC pelo resultado; histórico da máquina no apontamento.
   - v1.35.0: visual novo (topo azul, tema claro/escuro, foto da pessoa, barra de baixo no celular);
     calendário de Tarefas por mês, semana e dia; letra da periodicidade no apontamento do PMOC.
   - v1.35.1: Início do celular com foto, frase do dia e só o que é da pessoa (tarefas, OS e PMOC do mês).
   - v1.35.2: Usuários com abas (equipe da empresa · usuários dos clientes) e foto no cadastro do usuário.
   - v1.35.3: OS em lista ou cartões; fotos da equipe nas OS e tarefas; Concluir/Fechar trocados no apontamento do PMOC.
   - v1.36.0: revisão de velocidade e segurança; fonte Inter guardada no aparelho; CRM, Contratos e Financeiro
     abrem sem internet só para consulta (a última cópia vista); sobras de versões antigas removidas do servidor.
   - v1.37.0: Rentabilidade por cliente soma os custos lançados nos serviços dele; filtro por nome; detalhe
     serviço por serviço com cada lançamento (abrir conta / ajustar avulso do extrato).
   - v1.38.0: A pagar/A receber › Todos (e Pagos/Recebidos) mostram também os lançamentos feitos direto do extrato,
     com "Ajustar"; PMOC com periodicidade das visitas (mensal, trimestral, semestral, anual) e calendário só com os meses de serviço.
     Assinatura sem preço de lançamento (desconto só por cupom), conta aberta linha a linha e itens do cartão do plano editáveis no Console.
   - v1.39.0: cartão de crédito avisa quando falta o SQL (antes descartava limite e dias em silêncio); PMOC do mês do técnico
     com endereço e "Abrir mapa" (Início do celular, tela de OS e o plano); formulário "Eu quero" (pedido de informações) na
     página de apresentação; solicitação de serviço pelo link (solicitar/, fora do service worker) vira tarefa para a equipe.
   - Ao subir versão nova, trocar VERSAO aqui também: o cache antigo é apagado. */
const VERSAO = "1.39.0";
const CACHE = "ksaas-" + VERSAO;
const APP = ["vendor", "base", "entrada", "crm", "contratos", "os", "tarefas", "pmoc", "suporte", "notificacoes", "assistente", "financeiro", "assinatura", "empresa", "boot", "pwa"]
  .map(n => "./app/" + n + ".js?v=" + VERSAO).concat(["./app/estilo.css?v=" + VERSAO]);

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(["./", "./manifest.json", "./app/icone-192.png", "./app/icone-512.png", "./app/icone.svg", "./app/favicon-32.png"].concat([400, 500, 600, 700, 800].map(w => "./app/fontes/inter-" + w + ".woff2")).concat(APP)
        .map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith("ksaas-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith(".php") || url.pathname.includes("/arquivos/") ||
      url.pathname.includes("/plataforma/") || url.pathname.includes("/cadastro/") ||
      url.pathname.includes("/q/") || url.pathname.includes("/legal/") || url.pathname.includes("/conheca/") || url.pathname.includes("/indique/") ||   /* v1.33.0 */
      url.pathname.includes("/solicitar/") ||   /* v1.39.0: formulário público de solicitação de serviço */
     
      url.pathname.includes("/p/") || url.pathname.includes("/r/")) return;   /* v1.19.0: relatório público da OS */   /* v1.18.0: página pública da proposta */   /* v1.13.0: ficha pública do QR não substitui o app guardado */

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req, { cache: "no-store" }).then(r => {   /* v1.27.3: nunca usa cópia velha da página guardada pelo navegador/servidor */
        if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put("./", cp)); }
        return r;
      }).catch(() => caches.match("./"))
    );
    return;
  }

  if (url.pathname.includes("/app/") || url.pathname.endsWith("/manifest.json")) {
    e.respondWith(
      caches.match(req).then(m => m || fetch(req).then(r => {
        if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return r;
      }))
    );
  }
});

/* ---------------- v1.19.0: notificações (push) ---------------- */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: "Novidade no sistema", texto: e.data ? e.data.text() : "" }; }
  const alvo = /^(tarefa|os|chamado):(\d+)$/.exec(d.link || "");
  /* v1.21.0: o endereço leva o número do aviso (/n123) para o app marcar como lido ao abrir */
  const marca = d.id ? "/n" + d.id : "";
  const url = alvo ? self.registration.scope + "#/abrir/" + alvo[1] + "/" + alvo[2] + marca
            : /^url:\//.test(d.link || "") ? new URL(d.link.slice(4), self.location.origin).href : self.registration.scope + (marca ? "#" + marca : "");
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.titulo || "Novidade no sistema", {
      body: d.texto || "", icon: "app/icone-192.png", badge: "app/icone-192.png",
      tag: "k-" + (d.id || Date.now()), data: { url }, renotify: false,
    }),
    (self.navigator && self.navigator.setAppBadge && d.naoLidas) ? self.navigator.setAppBadge(d.naoLidas).catch(() => {}) : null,
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ tipo: "k-push" }))),
  ]));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const doApp = cs.find(c => c.url.indexOf(self.registration.scope) === 0);
    if (doApp && url.indexOf(self.registration.scope) === 0) {
      return doApp.focus().then(c => (c || doApp).navigate ? (c || doApp).navigate(url) : null).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  }));
});
