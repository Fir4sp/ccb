/* =====================================================================
   KONSTANTE SaaS — app/base.js  (v1.13.0 — trabalho sem internet; Esc fecha só o painel de cima)
   Peças usadas por todos os módulos: conversa com o servidor, tema da
   empresa, ícones e componentes (campo, botão, painel, confirmação…).
   Tudo fica em window.K para os outros arquivos usarem.
   ===================================================================== */
(function () {
  "use strict";
  const h = React.createElement;
  const { useState, useEffect, useRef, useCallback } = React;

  const API = "api.php";   // porta única do servidor

  /* ---------------- servidor + trabalho sem internet (v1.12.0) ----------------
     • Leituras (OS, tarefas, PMOC, início, sessão) ficam guardadas no aparelho:
       sem internet, a tela abre com a última cópia.
     • Escritas de campo registradas pelos módulos (K.offline.registrar) entram
       numa fila no aparelho quando não há internet e são enviadas sozinhas
       quando a conexão volta, na mesma ordem.
     • Cada escrita leva um código único (_sync): se a internet cair no meio do
       envio, o servidor reconhece a repetição e não grava duas vezes.
     • v1.36.0: CRM, Contratos, Catálogo, Usuários e Financeiro também abrem sem internet, só para
       CONSULTA (última cópia vista no aparelho). Salvar nesses módulos continua exigindo internet. */

  class ErroServidor extends Error {
    constructor(msg, codigo, http) { super(msg); this.codigo = codigo; this.http = http; }
  }

  /* ---- banco do aparelho (IndexedDB) ---- */
  let dbp = null;
  function idb() {
    if (!dbp) dbp = new Promise((ok, falha) => {
      if (!window.indexedDB) return falha(new Error("sem IndexedDB"));
      const r = indexedDB.open("ksaas-offline", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("cache")) d.createObjectStore("cache");
        if (!d.objectStoreNames.contains("fila")) d.createObjectStore("fila", { keyPath: "sid" });
        if (!d.objectStoreNames.contains("urls")) d.createObjectStore("urls");
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => falha(r.error);
    });
    return dbp;
  }
  function idbOp(loja, modo, fn) {
    return idb().then(d => new Promise((ok, falha) => {
      const tx = d.transaction(loja, modo);
      let res; const r = fn(tx.objectStore(loja));
      if (r) r.onsuccess = () => { res = r.result; };
      tx.oncomplete = () => ok(res);
      tx.onerror = () => falha(tx.error); tx.onabort = () => falha(tx.error);
    }));
  }

  const LEITURAS = /^(auth\.eu|inicio\.resumo|config\.ler|(os|tarefas|pmoc)\.[a-z_.]*(opcoes|listar|obter|resumo|painel|historico|qr))$/;   /* v1.13.0: tela do cliente e histórico também abrem sem internet */
  /* v1.36.0 — consulta sem internet (opção B): só lê do aparelho quando está sem internet; com internet vai sempre ao servidor */
  const CONSULTA = /^((clientes|chamados|contratos)\.(listar|obter|opcoes|resumo|acomp\.listar|arquivos|eventos|do_chamado)|catalogo\.tudo|usuarios\.listar|notificacoes\.(listar|contar)|suporte\.(listar|obter)|assinatura\.estado|fin\.(opcoes|painel\.resumo|titulos\.listar|titulo\.obter|movimentos\.listar|fluxo|fluxo\.categorias|dre|rentabilidade|pessoas|cartao\.faturas|fornecedores\.listar|recorrencias\.listar|contratos\.cobranca\.listar|chamado\.obter))$/;
  /* leituras de lista (não de um registro só): se a combinação de filtros nunca foi vista, mostra a última lista guardada */
  const POR_REGISTRO = /(obter|historico|qr|acomp\.listar|arquivos|eventos|do_chamado|cliente\.painel|equip\.listar|equip\.acoes)$/;
  const SEM_INTERNET = () => navigator.onLine === false;
  const ESCRITA = {};          // acao -> { local(dados, ctx), cachear(dados, r), chave(dados), rotulo(dados) }
  let uidAtual = null;
  function limpo(d) { const o = {}; Object.keys(d || {}).sort().forEach(k => { if (k[0] !== "_") o[k] = d[k]; }); return o; }
  function chaveCache(acao, dados) { return (acao === "auth.eu" ? "*" : (uidAtual || "?")) + "|" + acao + "|" + JSON.stringify(limpo(dados)); }
  /* v1.36.0: só nos módulos de consulta (CRM, Contratos, Financeiro…): a última lista de cada tela fica guardada à parte,
     separada por tipo/grupo/categoria (ex.: a pagar nunca aparece no lugar de a receber) */
  const ultimaVale = acao => CONSULTA.test(acao) && !POR_REGISTRO.test(acao);
  const chaveUltima = (acao, d) => (uidAtual || "?") + "|" + acao + "|#ultima|" + [d && d.tipo, d && d.grupo, d && d.categoria].map(x => x == null ? "" : String(x)).join("|");
  const comBusca = d => !!(d && typeof d.busca === "string" && d.busca.trim());
  const cacheLer = (acao, dados) => idbOp("cache", "readonly", st => st.get(chaveCache(acao, dados))).catch(() => undefined)
    .then(v => (v !== undefined || !ultimaVale(acao)) ? v
      : idbOp("cache", "readonly", st => st.get(chaveUltima(acao, dados))).catch(() => undefined));
  /* pesquisa digitada não é guardada (cada letra viraria uma cópia no aparelho) */
  const cacheGravar = (acao, dados, v) => {
    if (comBusca(dados)) return Promise.resolve();
    return idbOp("cache", "readwrite", st => { const r = st.put(v, chaveCache(acao, dados)); if (ultimaVale(acao)) st.put(v, chaveUltima(acao, dados)); return r; }).catch(() => {});
  };
  const novoId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  /* fotos/assinaturas tiradas sem internet: mostradas a partir do aparelho até subirem */
  const URLS = {};
  (function carregarUrls() {
    idb().then(d => { const tx = d.transaction("urls", "readonly"); const c = tx.objectStore("urls").openCursor();
      c.onsuccess = () => { const k = c.result; if (k) { URLS[k.key] = k.value; k.continue(); } }; }).catch(() => {});
  })();
  const urlAnexo = id => (typeof id === "string" && URLS[id]) ? URLS[id] : API + "?acao=anexos.abrir&id=" + encodeURIComponent(id);
  function blobParaUrl(b) { return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(b); }); }

  /* ---- estado da conexão e da fila (para o indicador) ---- */
  const est = { online: navigator.onLine !== false, pendentes: 0, sincronizando: false, recem: false, falhas: [] };
  try { est.falhas = JSON.parse(localStorage.getItem("ksaas_sync_falhas") || "[]"); } catch (e) { est.falhas = []; }
  const ouvintes = new Set(), aoSync = new Set();
  function avisarEstado() { const c = Object.assign({}, est); ouvintes.forEach(f => { try { f(c); } catch (e) {} }); }
  function marcarOnline(v) { if (est.online !== v) { est.online = v; avisarEstado(); if (v) setTimeout(sincronizar, 300); } }
  window.addEventListener("online", () => marcarOnline(true));
  window.addEventListener("offline", () => marcarOnline(false));

  async function contarFila() {
    const l = await filaTodos();
    est.pendentes = l.length; avisarEstado(); return l;
  }
  const filaTodos = () => idbOp("fila", "readonly", st => st.getAll())
    .then(l => (l || []).filter(i => !uidAtual || i.uid === uidAtual).sort((a, b) => a.seq - b.seq)).catch(() => []);

  /* ---- chamada ao servidor (com tempo limite: sinal fraco não trava a tela) ---- */
  async function chamar(acao, dados, ms, arquivo) {
    const ctl = window.AbortController ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), ms || 20000) : null;
    let r;
    try {
      if (arquivo) {
        const f = new FormData();
        f.append("acao", acao); f.append("arquivo", arquivo);
        Object.keys(dados || {}).forEach(k => f.append(k, dados[k]));
        r = await fetch(API, { method: "POST", credentials: "same-origin", headers: { "X-KSAAS": "1" }, body: f, signal: ctl ? ctl.signal : undefined });
      } else {
        r = await fetch(API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-KSAAS": "1" },
          body: JSON.stringify({ acao, dados: dados || {} }), signal: ctl ? ctl.signal : undefined });
      }
    } catch (e) {
      throw new ErroServidor("Sem conexão com o servidor. Confira a internet e tente de novo.", "REDE", 0);
    } finally { if (t) clearTimeout(t); }
    let j = null;
    try { j = await r.json(); } catch (e) { /* resposta não-JSON */ }
    if (!j) {
      if (r.status >= 502 && r.status <= 504) throw new ErroServidor("Servidor fora do ar no momento.", "REDE", r.status);
      throw new ErroServidor("O servidor respondeu de forma inesperada (" + r.status + ").", "RESPOSTA", r.status);
    }
    if (!j.ok) {
      if (j.codigo === "SEM_SESSAO" && K.aoPerderSessao) K.aoPerderSessao();
      throw new ErroServidor(j.erro || "Não foi possível concluir.", j.codigo, r.status);
    }
    return j.dados;
  }

  function ctxLocal() {
    return { ler: cacheLer, gravar: cacheGravar, uid: uidAtual, novoIdLocal: () => "l" + novoId() };
  }
  let avisouFila = 0;
  async function enfileirar(acao, dados, arquivo) {
    const reg = ESCRITA[acao];
    const item = { sid: dados._sync, seq: Date.now() + Math.random(), acao, dados, uid: uidAtual, em: new Date().toISOString() };
    if (arquivo) item.arquivo = arquivo;
    const ctx = ctxLocal();
    if (arquivo) { ctx.localId = ctx.novoIdLocal(); ctx.localUrl = await blobParaUrl(arquivo);
      if (ctx.localUrl) { URLS[ctx.localId] = ctx.localUrl; idbOp("urls", "readwrite", st => st.put(ctx.localUrl, ctx.localId)).catch(() => {}); }
      item.dados = Object.assign({}, dados, { _local: ctx.localId }); }
    /* salvamentos repetidos do mesmo registro viram um só (mantém a versão de origem) */
    if (reg.chave) {
      const k = reg.chave(dados);
      const ant = (await filaTodos()).find(i => i.acao === acao && reg.chave(i.dados) === k);
      if (ant) { item.seq = ant.seq; if (ant.dados && "_base" in ant.dados) item.dados._base = ant.dados._base;
        await idbOp("fila", "readwrite", st => st.delete(ant.sid)).catch(() => {}); }
    }
    await idbOp("fila", "readwrite", st => st.put(item));
    let r = null;
    try { r = await reg.local(item.dados, ctx); } catch (e) { r = null; }
    await contarFila();
    if (Date.now() - avisouFila > 20000) { avisouFila = Date.now(); avisar("Sem internet: guardado no aparelho. Envia sozinho quando a conexão voltar."); }
    if (navigator.onLine !== false) setTimeout(sincronizar, 1500);
    if (r === null || r === undefined) throw new ErroServidor("Guardado no aparelho; será enviado quando a internet voltar.", "NA_FILA", 0);
    return r;
  }

  /* v1.27.0: o mesmo envio repetido em poucos segundos (toque duplo, internet lenta) usa a mesma chave _sync —
     o servidor reconhece e não grava duas vezes. Vale para lançamentos e baixas, onde duplicar custa caro. */
  const ANTI_DUPLO = /^fin\.(titulo\.baixar|movimento\.salvar|transferir|conciliar)$/;
  const recentes = {};
  function chaveRepetida(acao, dados) {
    let k; try { k = acao + "|" + JSON.stringify(dados); } catch (e) { return null; }
    const ag = Date.now();
    Object.keys(recentes).forEach(x => { if (ag - recentes[x].t > 15000) delete recentes[x]; });
    if (!recentes[k]) recentes[k] = { s: novoId().replace(/[^a-z0-9]/g, ""), t: ag };
    return recentes[k].s;
  }

  async function api(acao, dados) {
    dados = dados || {};
    if (!dados._sync && ANTI_DUPLO.test(acao)) { const k = chaveRepetida(acao, dados); if (k) dados = Object.assign({ _sync: k }, dados); }
    const reg = ESCRITA[acao];
    const leitura = LEITURAS.test(acao);
    const consulta = !leitura && CONSULTA.test(acao);   /* v1.36.0 */
    if (reg && !dados._sync) dados = Object.assign({ _sync: novoId() }, dados);
    /* v1.36.0: sem internet, fora do campo (OS, tarefas, PMOC) só dá para consultar — avisa na hora, sem esperar a rede */
    if (!reg && !leitura && !consulta && SEM_INTERNET() && acao !== "auth.logout" && !/^(notificacoes|assistente)\./.test(acao))
      throw new ErroServidor("Sem internet: aqui dá para consultar, mas para salvar é preciso estar conectado.", "SO_CONSULTA", 0);
    if (consulta && SEM_INTERNET()) {
      const c = await cacheLer(acao, dados);
      if (c !== undefined) return c;
      throw new ErroServidor(POR_REGISTRO.test(acao) ? "Sem internet: este registro ainda não foi aberto neste aparelho." :
        "Sem internet: esta tela ainda não foi aberta neste aparelho.", "REDE", 0);
    }
    if (acao === "auth.logout") {
      const r = await chamar(acao, dados);
      idbOp("cache", "readwrite", st => st.clear()).catch(() => {});
      return r;
    }
    /* com fila pendente ou sem internet: escrita entra na fila (mantém a ordem) e leitura usa a cópia do aparelho */
    if (reg && (est.pendentes > 0 || navigator.onLine === false)) return enfileirar(acao, dados);
    if (leitura && (est.pendentes > 0 || navigator.onLine === false)) {
      const c = await cacheLer(acao, dados);
      if (c !== undefined) { if (acao === "auth.eu" && c && c.usuario) offline.definirUsuario(c.usuario.id); return c; }
    }
    /* v1.21.0: o Assistente pode levar bem mais de 20 s (a IA pensa e consulta o sistema). Antes o app cortava
       a espera em 20 s e mostrava "Sem conexão com o servidor" — e ainda marcava o aparelho como offline. */
    const longa = /^assistente\./.test(acao);
    try {
      const r = await chamar(acao, dados, longa ? 110000 : reg ? 30000 : 20000);
      if ((acao === "auth.eu" || acao === "auth.login") && r && r.usuario) offline.definirUsuario(r.usuario.id);
      if (!est.online) marcarOnline(true);
      if (leitura || consulta) cacheGravar(acao, dados, r);
      if (acao === "auth.login" && r && r.usuario && !r.trocarSenha) cacheGravar("auth.eu", {}, r);   /* abre sem internet depois */
      if (reg && reg.cachear) { const c = reg.cachear(dados, r); if (c) cacheGravar(c[0], c[1], r); }
      return r;
    } catch (e) {
      if (longa) {
        if (e.codigo === "REDE") throw new ErroServidor(navigator.onLine === false ? "Sem internet. O Assistente precisa de conexão." :
          "O Assistente demorou demais para responder. Tente de novo (de preferência com um pedido mais curto).", "IA_DEMORA", 0);
        throw e;
      }
      if (e.codigo === "REDE") {
        marcarOnline(false);
        if (reg) return enfileirar(acao, dados);
        if (leitura || consulta) {
          const c = await cacheLer(acao, dados);
          if (c !== undefined) { if (acao === "auth.eu" && c && c.usuario) offline.definirUsuario(c.usuario.id); return c; }
        }
      }
      throw e;
    }
  }

  async function enviarArquivo(acao, arquivo, extras) {
    const reg = ESCRITA[acao];
    let dados = Object.assign({}, extras || {});
    if (reg) dados._sync = novoId();
    if (reg && (est.pendentes > 0 || navigator.onLine === false)) return enfileirar(acao, dados, arquivo);
    try {
      const r = await chamar(acao, dados, 90000, arquivo);
      if (reg && reg.cachear) { const c = reg.cachear(dados, r); if (c) cacheGravar(c[0], c[1], r); }
      return r;
    } catch (e) {
      if (e.codigo === "REDE" && reg) { marcarOnline(false); return enfileirar(acao, dados, arquivo); }
      throw e;
    }
  }

  /* ---- envio da fila: um por vez, na ordem; para no primeiro erro de rede ---- */
  let sincronizandoAgora = false;
  async function sincronizar() {
    if (sincronizandoAgora || !uidAtual) return;
    let fila = await filaTodos();
    if (!fila.length) { if (est.pendentes) { est.pendentes = 0; avisarEstado(); } return; }
    sincronizandoAgora = true; est.sincronizando = true; avisarEstado();
    let enviados = 0;
    for (const it of fila) {
      const reg = ESCRITA[it.acao] || {};
      try {
        const r = await chamar(it.acao, it.dados, it.arquivo ? 90000 : 30000, it.arquivo || null);
        await idbOp("fila", "readwrite", st => st.delete(it.sid));
        enviados++;
        if (reg.cachear && r && !r._duplicado) { const c = reg.cachear(it.dados, r); if (c) cacheGravar(c[0], c[1], r); }
        if (it.dados && it.dados._local) { delete URLS[it.dados._local]; idbOp("urls", "readwrite", st => st.delete(it.dados._local)).catch(() => {}); }
        if (!est.online) marcarOnline(true);
      } catch (e) {
        if (e.codigo === "REDE") { marcarOnline(false); break; }
        if (e.codigo === "SEM_SESSAO") break;
        /* o servidor recusou (conflito, validação…): sai da fila e fica registrado para a pessoa ver */
        await idbOp("fila", "readwrite", st => st.delete(it.sid)).catch(() => {});
        est.falhas = est.falhas.concat([{ acao: it.acao, oque: reg.rotulo ? reg.rotulo(it.dados) : it.acao, erro: e.message, em: it.em }]).slice(-30);
        try { localStorage.setItem("ksaas_sync_falhas", JSON.stringify(est.falhas)); } catch (x) {}
        avisar("Uma alteração feita sem internet não pôde ser aplicada: " + e.message, true);
      }
    }
    fila = await contarFila();
    sincronizandoAgora = false; est.sincronizando = false;
    if (!fila.length && enviados) {
      est.recem = true; avisarEstado();
      aoSync.forEach(f => { try { f(); } catch (e) {} });
      setTimeout(() => { est.recem = false; avisarEstado(); }, 4000);
    } else avisarEstado();
  }
  setInterval(() => { if (est.pendentes > 0 || !est.online) sincronizar().catch(() => {}); if (!est.online && navigator.onLine !== false) chamar("auth.eu", {}, 8000).then(() => marcarOnline(true), () => {}); }, 30000);
  contarFila().then(l => { if (l.length && navigator.onLine !== false) setTimeout(sincronizar, 3000); }).catch(() => {});

  /* v1.36.0 — pré-carga para consultar sem internet: ao entrar (e quando a internet volta, no máximo a cada 30 min)
     guarda no aparelho as listas principais que a pessoa pode ver. Uma chamada por vez, com pausa, para não pesar no servidor. */
  let ultimaPreCarga = 0, preCarregando = false;
  async function preCarregar(sessao) {
    if (!sessao || !sessao.usuario || preCarregando || SEM_INTERNET()) return;
    if (Date.now() - ultimaPreCarga < 1800000) return;
    const perfis = sessao.usuario.perfis || [sessao.usuario.perfil];
    const tem = (...p) => p.some(x => perfis.indexOf(x) >= 0);
    const mod = k => !Array.isArray(sessao.modulos) || sessao.modulos.indexOf(k) >= 0;
    if (!tem("admin", "coord", "comercial", "financeiro")) return;   /* técnico e cliente: já têm a pré-carga do campo */
    const lista = [["config.ler", {}], ["chamados.opcoes", {}], ["chamados.listar", {}], ["clientes.listar", {}], ["catalogo.tudo", {}]];
    if (tem("admin")) lista.push(["usuarios.listar", {}]);
    if (mod("contratos")) lista.push(["contratos.listar", {}]);
    if (mod("erp") && tem("admin", "financeiro")) lista.push(["fin.opcoes", {}], ["fin.painel.resumo", {}], ["fin.titulos.listar", { tipo: "receber" }], ["fin.titulos.listar", { tipo: "pagar" }]);
    preCarregando = true; ultimaPreCarga = Date.now();
    try {
      for (const [a, d] of lista) {
        if (SEM_INTERNET()) break;
        await api(a, d).catch(() => null);
        await new Promise(ok => setTimeout(ok, 400));
      }
    } finally { preCarregando = false; }
  }

  const offline = {
    preCarregar,
    registrar(acao, def) { ESCRITA[acao] = def; },
    sincronizar,
    pendentes: () => est.pendentes,
    estado: () => Object.assign({}, est),
    ouvir(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
    aoSincronizar(f) { aoSync.add(f); return () => aoSync.delete(f); },
    limparFalhas() { est.falhas = []; try { localStorage.removeItem("ksaas_sync_falhas"); } catch (e) {} avisarEstado(); },
    definirUsuario(id) { if (uidAtual === id) return; uidAtual = id; contarFila().then(l => { if (l.length && navigator.onLine !== false) sincronizar(); }).catch(() => {}); },
  };
  function useSync() {
    const [s, setS] = useState(() => offline.estado());
    useEffect(() => offline.ouvir(setS), []);
    return s;
  }
  /* indicador: "Online · sincronizado", "Offline · trabalhando no aparelho", "3 alterações pendentes", "Sincronizando…" */
  function IndicadorSync({ compacto }) {
    const s = useSync();
    const [aberto, setAberto] = useState(false);
    let cls = "ok", txt = "Online · sincronizado";
    if (s.sincronizando) { cls = "sinc"; txt = "Sincronizando…" + (s.pendentes ? " (" + s.pendentes + ")" : ""); }
    else if (!s.online) { cls = "off"; txt = s.pendentes ? "Offline · " + s.pendentes + " alteraç" + (s.pendentes > 1 ? "ões pendentes" : "ão pendente") : "Offline · trabalhando no aparelho"; }
    else if (s.pendentes) { cls = "pend"; txt = s.pendentes + " alteraç" + (s.pendentes > 1 ? "ões pendentes" : "ão pendente"); }
    else if (s.recem) { cls = "ok"; txt = "Sincronizado"; }
    if (compacto && cls === "ok" && !s.recem && !s.falhas.length) return null;
    return h("span", { className: "sync-wrap" },
      h("button", { type: "button", className: "sync sync-" + cls, onClick: () => { if (s.falhas.length) setAberto(!aberto); else if (s.pendentes && s.online) sincronizar(); }, title: s.pendentes && s.online ? "Enviar agora" : txt },
        h("i", null), txt, s.falhas.length ? h("b", { className: "sync-falha" }, " · " + s.falhas.length + " não aplicada" + (s.falhas.length > 1 ? "s" : "")) : null),
      aberto && s.falhas.length ? h("div", { className: "sync-lista" },
        h("b", null, "Alterações feitas sem internet que o servidor recusou"),
        s.falhas.slice().reverse().map((f, i) => h("div", { key: i }, h("span", null, f.oque), h("small", null, f.erro))),
        h("button", { type: "button", className: "bt bt-p", onClick: () => { offline.limparFalhas(); setAberto(false); } }, "Entendi, limpar")) : null);
  }


  /* ---------------- tema da empresa ---------------- */

  function luminancia(hex) {
    const n = parseInt(String(hex || "#111111").slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  /* v1.35.0: cor padrão do SGClim (azul) quando a empresa não escolheu outra (o antigo padrão era preto #111111) */
  const COR_PADRAO = "#1d62f5", COR_PADRAO_2 = "#0a3fc8";
  function aplicarTema(emp) {
    const raiz = document.documentElement.style;
    let p = (emp && emp.corPrimaria) || COR_PADRAO;
    let s = (emp && emp.corSecundaria) || COR_PADRAO_2;
    if (String(p).toLowerCase() === "#111111") { p = COR_PADRAO; s = COR_PADRAO_2; }
    raiz.setProperty("--marca", p);
    raiz.setProperty("--marca-2", s);
    raiz.setProperty("--sobre-marca", luminancia(p) > 0.45 ? "#111111" : "#ffffff");
    corMarcaAtual = p;
    ajustarCorBarra();
    if (emp && emp.nome) document.title = emp.nome;
  }

  /* ---------------- v1.35.0: tema claro / escuro / automático (vale para este aparelho) ---------------- */
  let corMarcaAtual = COR_PADRAO;
  const ouvintesTema = new Set();
  function modoTema() { try { const v = localStorage.getItem("k_tema"); return v === "escuro" || v === "claro" ? v : "auto"; } catch (e) { return "auto"; } }
  /* páginas públicas (apresentação e indicação) ficam sempre no claro */
  const SO_CLARO = /\/(conheca|indique)\//.test(location.pathname);
  function temaEfetivo(m) {
    if (SO_CLARO) return "claro";
    m = m || modoTema();
    if (m !== "auto") return m;
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro"; } catch (e) { return "claro"; }
  }
  function ajustarCorBarra() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", document.documentElement.getAttribute("data-tema") === "escuro" ? "#0f1117" : corMarcaAtual);
  }
  function aplicarModo() {
    document.documentElement.setAttribute("data-tema", temaEfetivo());
    ajustarCorBarra();
    ouvintesTema.forEach(f => f(modoTema()));
  }
  function definirTema(m) { try { localStorage.setItem("k_tema", m); } catch (e) {} aplicarModo(); }
  function useTema() {
    const [m, setM] = useState(modoTema());
    useEffect(() => { ouvintesTema.add(setM); return () => ouvintesTema.delete(setM); }, []);
    return [m, temaEfetivo(m), definirTema];
  }
  aplicarModo();
  try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (modoTema() === "auto") aplicarModo(); }); } catch (e) {}

  /* botão sol / lua (troca entre claro e escuro) */
  function BotaoTema({ claro }) {
    const [, ef, def] = useTema();
    return h("div", { className: "tema-bt" + (claro ? " tema-bt-claro" : ""), role: "group", "aria-label": "Tema" },
      h("button", { type: "button", className: ef === "claro" ? "on" : "", "aria-pressed": ef === "claro", title: "Tema claro", onClick: () => def("claro") }, h(Icone, { n: "sol" })),
      h("button", { type: "button", className: ef === "escuro" ? "on" : "", "aria-pressed": ef === "escuro", title: "Tema escuro", onClick: () => def("escuro") }, h(Icone, { n: "lua" })));
  }
  /* escolha completa (Claro · Escuro · Automático) — usada no menu da pessoa */
  function EscolhaTema() {
    const [m, , def] = useTema();
    return h("div", { className: "tema-esc", role: "radiogroup", "aria-label": "Tema" },
      [["claro", "Claro", "sol"], ["escuro", "Escuro", "lua"], ["auto", "Auto", null]].map(([v, r, ic]) => h("button", { key: v, type: "button", role: "radio", "aria-checked": m === v, className: m === v ? "on" : "", onClick: () => def(v) },
        ic ? h("span", { className: "tema-esc-ic" }, h(Icone, { n: ic })) : null, r)));
  }

  /* foto da pessoa (ou as iniciais) */
  function Avatar({ usuario, tam, classe }) {
    const u = usuario || {};
    const [falhou, setFalhou] = useState(false);
    useEffect(() => setFalhou(false), [u.fotoId]);
    const st = tam ? { width: tam, height: tam, fontSize: Math.round(tam * 0.38) } : null;
    return h("span", { className: "avatar" + (classe ? " " + classe : "") + (u.fotoId && !falhou ? " com-foto" : ""), style: st, "aria-hidden": true },
      u.fotoId && !falhou ? h("img", { src: urlAnexo(u.fotoId), alt: "", onError: () => setFalhou(true) }) : iniciais(u.nome));
  }

  /* ---------------- formatos ---------------- */

  const PERFIS = { admin: "Administrador", financeiro: "Financeiro", comercial: "Comercial", coord: "Coordenação", tecnico: "Técnico", cliente: "Cliente" };
  /* v1.22.0: perfis acumulados — o acesso é a soma do perfil principal com os extras em vigor */
  const perfisDe = s => { const u = (s && s.usuario) || {}; return Array.isArray(u.perfis) && u.perfis.length ? u.perfis : [u.perfil]; };
  const temPerfil = (s, ...p) => perfisDe(s).some(x => p.indexOf(x) >= 0);
  const veValores = s => temPerfil(s, "admin", "comercial", "financeiro");
  const soConsultaCRM = s => temPerfil(s, "financeiro") && !temPerfil(s, "admin", "comercial", "coord");
  const soTecnico = s => temPerfil(s, "tecnico") && !temPerfil(s, "admin", "coord");

  function dataHora(s) {
    if (!s) return "—";
    const d = new Date(String(s).replace(" ", "T"));
    if (isNaN(d)) return s;
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  function iniciais(nome) {
    const p = String(nome || "?").trim().split(/\s+/);
    return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  }
  function senhaBoa(s) { return typeof s === "string" && s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s); }

  /* ---------------- ícones (traço simples) ---------------- */

  const CAMINHOS = {
    inicio:  "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
    usuarios:"M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5zM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.25 3.25 0 0 1 0 6.1",
    config:  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 4.6 1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.25.4-1.51 1z",
    empresas:"M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M9 14h.01M15 14h.01",
    crm:     "M4 5h16v11H8l-4 4zM8 9h8M8 12h5",
    os:      "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
    pmoc:    "M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9",
    tarefas: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
    menu:    "M4 6h16M4 12h16M4 18h16",
    fechar:  "M6 6l12 12M18 6 6 18",
    mais:    "M12 5v14M5 12h14",
    etiqueta:"M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
    contrato:"M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4",   /* v1.15.0 */
    ajuda:   "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 17.5h.01",
    sino:    "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",   /* v1.19.0 */
    modulos: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    ia:      "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",   /* v1.21.0 */
    dinheiro:"M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",   /* v1.22.0 */
    cartao:  "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4",   /* v1.30.0: assinatura */
    sol:     "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41",   /* v1.35.0 */
    lua:     "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
    camera:  "M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    calendario: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M9 2v4M15 2v4",
    pontos:  "M4 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0zM10.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0zM17 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0z",
    relogio: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
    alerta:  "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    busca:   "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
    sair:    "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10",
    chave:   "M15.5 7.5a3.5 3.5 0 1 1-3.4 4.3L4 20H2v-2l1-1h2v-2h2l2.2-2.2A3.5 3.5 0 0 1 15.5 7.5zM16 8h.01",
    olho:    "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    olhoOff: "M3 3l18 18M10.6 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  };
  function Icone({ n }) {
    return h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
      h("path", { d: CAMINHOS[n] || "" }));
  }

  /* ---------------- componentes ---------------- */

  function Campo({ rotulo, dica, children }) {
    return h("label", { className: "campo" }, h("span", null, rotulo), children, dica ? h("small", null, dica) : null);
  }

  function Texto(props) {
    const { valor, aoMudar, ...resto } = props;
    return h("input", Object.assign({ className: "entrada-texto", value: valor == null ? "" : valor, onChange: e => aoMudar(e.target.value) }, resto));
  }

  function Senha({ valor, aoMudar, autoComplete, autoFocus }) {
    const [ver, setVer] = useState(false);
    return h("div", { className: "senha-caixa" },
      h("input", { className: "entrada-texto", type: ver ? "text" : "password", value: valor || "", onChange: e => aoMudar(e.target.value), autoComplete: autoComplete || "current-password", autoFocus, style: { paddingRight: 64 } }),
      h("button", { type: "button", onClick: () => setVer(!ver), "aria-label": ver ? "Esconder senha" : "Mostrar senha" }, ver ? "esconder" : "mostrar"));
  }

  function Aviso({ tipo, children }) {
    if (!children) return null;
    return h("div", { className: "aviso aviso-" + (tipo || "erro"), role: tipo === "erro" ? "alert" : "status" }, children);
  }

  /* painel: gaveta lateral no computador, tela cheia no celular (v1.10.0).
     Cada painel aberto ganha uma entrada no histórico: o botão "voltar"
     do celular fecha o painel em vez de sair da tela. */
  const pilhaPaineis = [];
  let ignorarVolta = 0;
  /* v1.13.0: quando um painel fecha e outro abre logo em seguida (ex.: "carregando…" → conteúdo),
     o novo reaproveita a entrada de histórico do que fechou, em vez de empilhar e voltar ao mesmo
     tempo — antes o "voltar" atrasado podia tirar a pessoa da tela. */
  let sobra = 0;
  window.addEventListener("popstate", () => {
    if (ignorarVolta > 0) { ignorarVolta--; return; }
    const topo = pilhaPaineis[pilhaPaineis.length - 1];
    if (!topo) return;
    topo.porVoltar = true;
    topo.fechar();
    /* se a tela recusou fechar (ex.: confirmação), devolve a entrada */
    setTimeout(() => {
      if (pilhaPaineis.indexOf(topo) >= 0) {
        topo.porVoltar = false;
        try { history.pushState({ kPainel: 1 }, ""); } catch (e) { /* sem histórico */ }
      }
    }, 0);
  });

  /* =================================================================
     v1.27.0 — RASCUNHO AUTOMÁTICO
     Tudo o que é digitado num painel (OS, ocorrência, chamado, tarefa,
     lançamento…) fica guardado no aparelho a cada instante. Se a tela
     recarregar sem querer, ao abrir o mesmo painel o texto volta, com
     o aviso "Rascunho recuperado" (Manter / Descartar).
     Fechar o painel (salvar ou cancelar) apaga o rascunho. Expira em 7 dias.
     ================================================================= */
  const RASC_PREF = "ksaas-rasc|";
  const RASC_DIAS = 7;
  function rascChave(titulo) {
    if (!titulo || !uidAtual) return null;
    return RASC_PREF + uidAtual + "|" + (location.hash || "#") + "|" + String(titulo).slice(0, 120);
  }
  function rascLer(k) { try { const r = JSON.parse(localStorage.getItem(k) || "null"); return r && Date.now() - r.t < RASC_DIAS * 864e5 ? r : null; } catch (e) { return null; } }
  function rascGravar(k, v) { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch (e) { /* sem armazenamento */ } }
  function rascLimparVelhos() {
    try { Object.keys(localStorage).forEach(k => { if (k.indexOf(RASC_PREF) === 0) { const r = JSON.parse(localStorage.getItem(k) || "null"); if (!r || Date.now() - r.t > RASC_DIAS * 864e5) localStorage.removeItem(k); } }); } catch (e) {}
  }
  const RASC_TIPOS = { text: 1, "": 1, email: 1, tel: 1, number: 1, date: 1, time: 1, url: 1, "datetime-local": 1 };
  function rascCampos(raiz) {
    const vistos = {}, out = [];
    const dono = raiz.closest(".painel");
    raiz.querySelectorAll("textarea, input").forEach(el => {
      if (dono && el.closest(".painel") !== dono) return;   /* campos de um painel aberto por cima são dele, não deste */
      if (el.tagName === "INPUT" && !RASC_TIPOS[(el.getAttribute("type") || "").toLowerCase()]) return;
      if (el.disabled || el.readOnly || el.classList.contains("busca") || el.closest("[data-sem-rascunho]")) return;
      const cp = el.closest(".campo");
      const rot = el.getAttribute("data-rascunho") || (cp && cp.firstElementChild && cp.firstElementChild !== el ? cp.firstElementChild.textContent : "") || el.getAttribute("aria-label") || el.placeholder || el.name || el.tagName;
      const base = String(rot).trim().slice(0, 60);
      vistos[base] = (vistos[base] || 0) + 1;
      out.push({ k: base + "#" + vistos[base], el });
    });
    return out;
  }
  function rascPor(el, v) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, "value").set;
    set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function useRascunho(ref, titulo) {
    const [rec, setRec] = useState(null);   /* {chave, originais} */
    const usadas = useRef({});
    const aplicando = useRef(false);
    useEffect(() => {
      const el = ref.current; const chave = rascChave(titulo);
      if (!el || !chave) return;
      let vivo = true, timer = null, restaurou = false;
      const corpo = el.querySelector(".painel-corpo") || el;
      function salvar() {
        if (!vivo) return;
        const campos = {}; let algo = false;
        rascCampos(corpo).forEach(c => { campos[c.k] = c.el.value; if (c.el.value && String(c.el.value).trim()) algo = true; });
        rascGravar(chave, algo ? { t: Date.now(), titulo: String(titulo), campos } : null);
        usadas.current[chave] = 1;
      }
      const aoDigitar = e => {
        if (aplicando.current) return;
        const t = e.target; if (!t || !(t.tagName === "TEXTAREA" || t.tagName === "INPUT") || t.closest(".painel") !== el) return;
        clearTimeout(timer); timer = setTimeout(salvar, 600);
      };
      corpo.addEventListener("input", aoDigitar, true);
      corpo.addEventListener("change", aoDigitar, true);
      /* recuperar: espera os campos aparecerem (o painel pode estar "Carregando…") */
      const r = rascLer(chave);
      let tent = 0;
      function tentar() {
        if (!vivo || restaurou || !r) return;
        const lista = rascCampos(corpo);
        const achados = lista.filter(c => Object.prototype.hasOwnProperty.call(r.campos, c.k));
        if (!achados.length) { if (tent++ < 30) setTimeout(tentar, 200); return; }
        restaurou = true;
        const orig = {}; let mudou = 0;
        aplicando.current = true;
        achados.forEach(c => { const v = r.campos[c.k]; if (c.el.value !== v) { orig[c.k] = c.el.value; rascPor(c.el, v); mudou++; } });
        aplicando.current = false;
        usadas.current[chave] = 1;
        if (mudou) setRec({ chave, orig });
      }
      if (r) setTimeout(tentar, 120);
      return () => { vivo = false; clearTimeout(timer); corpo.removeEventListener("input", aoDigitar, true); corpo.removeEventListener("change", aoDigitar, true); };
    }, [titulo]); // eslint-disable-line
    /* painel fechado (salvou ou cancelou): o rascunho sai */
    useEffect(() => () => { Object.keys(usadas.current).forEach(k => rascGravar(k, null)); const k = rascChave(titulo); if (k) rascGravar(k, null); }, []); // eslint-disable-line
    function descartar() {
      const el = ref.current; if (!el || !rec) return;
      const corpo = el.querySelector(".painel-corpo") || el;
      aplicando.current = true;
      rascCampos(corpo).forEach(c => { if (Object.prototype.hasOwnProperty.call(rec.orig, c.k)) rascPor(c.el, rec.orig[c.k]); });
      aplicando.current = false;
      rascGravar(rec.chave, null); setRec(null);
    }
    return rec ? h("div", { className: "rasc-aviso", role: "status" },
      h("span", null, "📝 Rascunho recuperado — o texto que você estava digitando voltou."),
      h("span", { className: "rasc-bts" },
        h("button", { type: "button", className: "bt bt-p", onClick: () => setRec(null) }, "Manter"),
        h("button", { type: "button", className: "bt bt-p bt-leve", onClick: descartar }, "Descartar"))) : null;
  }
  /* rascunhos de painéis que não reabrem sozinhos (ex.: "Nova OS"): avisa uma vez ao abrir o app */
  function rascAvisarPendentes() {
    rascLimparVelhos();
    setTimeout(() => {
      try {
        const abertos = {};
        document.querySelectorAll(".painel[aria-label]").forEach(p => { abertos[p.getAttribute("aria-label")] = 1; });
        const l = Object.keys(localStorage).filter(k => k.indexOf(RASC_PREF + uidAtual + "|") === 0).map(k => rascLer(k)).filter(r => r && !abertos[r.titulo]);
        if (l.length) avisar("Você tem texto não salvo em “" + l[0].titulo + "”" + (l.length > 1 ? " e mais " + (l.length - 1) : "") + ". Abra de novo para recuperar.");
      } catch (e) {}
    }, 4000);
  }

  /* v1.27.0: item aberto (OS, tarefa, chamado) volta aberto se a página recarregar */
  const REABRIR = "ksaas-reabrir";
  function lerReabrir() { try { return JSON.parse(sessionStorage.getItem(REABRIR) || "[]"); } catch (e) { return []; } }
  function useReabrir(tipo, id) {
    useEffect(() => {
      if (!tipo || !id) return;
      const item = { tipo, id: +id, tela: location.hash || "" };
      try { sessionStorage.setItem(REABRIR, JSON.stringify(lerReabrir().filter(x => !(x.tipo === tipo && x.id === +id)).concat([item]).slice(-5))); } catch (e) {}
      return () => { try { sessionStorage.setItem(REABRIR, JSON.stringify(lerReabrir().filter(x => !(x.tipo === tipo && x.id === +id)))); } catch (e) {} };
    }, [tipo, id]);
  }
  let reabriuJa = false;
  function itemParaReabrir() {
    if (reabriuJa) return null;
    reabriuJa = true;
    const l = lerReabrir();
    const x = l[l.length - 1];
    return x && (!x.tela || x.tela === (location.hash || "")) ? x : null;
  }

  function Painel({ titulo, sub, aoFechar, rodape, largo, children }) {
    const fecharRef = useRef(aoFechar);
    fecharRef.current = aoFechar;
    const itemRef = useRef(null);
    const asideRef = useRef(null);
    const avisoRasc = useRascunho(asideRef, titulo);   /* v1.27.0 */
    useEffect(() => {
      /* v1.13.0: Esc fecha só o painel de cima (antes fechava todos os abertos de uma vez) */
      const esc = e => { if (e.key === "Escape" && (!itemRef.current || pilhaPaineis[pilhaPaineis.length - 1] === itemRef.current)) aoFechar(); };
      document.addEventListener("keydown", esc);
      return () => document.removeEventListener("keydown", esc);
    }, [aoFechar]);
    useEffect(() => {
      const item = { fechar: () => fecharRef.current(), porVoltar: false };
      itemRef.current = item;
      pilhaPaineis.push(item);
      document.body.classList.add("com-painel");
      let empurrou = false;
      if (sobra > 0) { sobra--; empurrou = true; }
      else { try { history.pushState({ kPainel: 1 }, ""); empurrou = true; } catch (e) { /* sem histórico */ } }
      return () => {
        const i = pilhaPaineis.indexOf(item);
        if (i >= 0) pilhaPaineis.splice(i, 1);
        if (!pilhaPaineis.length) document.body.classList.remove("com-painel");
        if (empurrou && !item.porVoltar) {
          sobra++;
          setTimeout(() => { if (sobra > 0) { sobra--; ignorarVolta++; history.back(); } }, 60);
        }
      };
    }, []);
    return h(React.Fragment, null,
      h("div", { className: "veu", onClick: aoFechar }),
      h("aside", { ref: asideRef, className: "painel" + (largo ? " painel-largo" : ""), role: "dialog", "aria-modal": true, "aria-label": titulo },
        h("div", { className: "painel-cab" },
          h("div", { className: "painel-tit" }, h("h2", null, titulo), sub ? h("p", null, sub) : null, h(IndicadorSync, { compacto: true })),
          h("button", { className: "bt bt-leve bt-p painel-x", onClick: aoFechar, "aria-label": "Fechar" }, h("span", { style: { width: 18, height: 18, display: "inline-flex" } }, h(Icone, { n: "fechar" })))),
        h("div", { className: "painel-corpo" }, avisoRasc, children),
        rodape ? h("div", { className: "painel-pe" }, rodape) : null));
  }

  /* confirmação simples: K.confirmar({titulo, texto, botao}) -> Promise<boolean> */
  let abrirConfirmacao = null;
  function Confirmacoes() {
    const [c, setC] = useState(null);
    useEffect(() => { abrirConfirmacao = setC; return () => { abrirConfirmacao = null; }; }, []);
    if (!c) return null;
    const fim = v => { setC(null); c.resolver(v); };
    return h(React.Fragment, null,
      h("div", { className: "veu", onClick: () => fim(false) }),
      h("div", { className: "dialogo", role: "alertdialog", "aria-modal": true },
        h("h3", null, c.titulo), c.texto ? h("p", null, c.texto) : null,
        h("div", { className: "acoes" },
          h("button", { className: "bt", onClick: () => fim(false) }, "Cancelar"),
          h("button", { className: "bt " + (c.perigo ? "bt-perigo" : "bt-marca"), onClick: () => fim(true), autoFocus: true }, c.botao || "Confirmar"))));
  }
  function confirmar(op) {
    return new Promise(res => { if (abrirConfirmacao) abrirConfirmacao(Object.assign({}, op, { resolver: res })); else res(window.confirm(op.titulo)); });
  }

  /* aviso flutuante: K.avisar("Salvo") / K.avisar("Falhou", true) */
  let mostrarAviso = null;
  function Avisos() {
    const [a, setA] = useState(null);
    const t = useRef(null);
    useEffect(() => {
      mostrarAviso = (texto, erro) => { clearTimeout(t.current); setA({ texto, erro }); t.current = setTimeout(() => setA(null), erro ? 5200 : 2800); };
      return () => { mostrarAviso = null; };
    }, []);
    if (!a) return null;
    return h("div", { className: "toast" + (a.erro ? " erro" : ""), role: "status" }, a.texto);
  }
  function avisar(texto, erro) { if (mostrarAviso) mostrarAviso(texto, erro); }

  /* carrega dados do servidor com estado de carregando/erro */
  function useDados(acao, dados, deps) {
    const [estado, setEstado] = useState({ carregando: true, erro: null, dados: null });
    const recarregar = useCallback(() => {
      setEstado(e => Object.assign({}, e, { carregando: true, erro: null }));
      api(acao, dados).then(
        d => setEstado({ carregando: false, erro: null, dados: d }),
        e => setEstado({ carregando: false, erro: e.message, dados: null }));
    }, deps || []); // eslint-disable-line
    useEffect(recarregar, [recarregar]);
    return [estado, recarregar];
  }

  /* v1.21.0: valores em dinheiro escondidos nos indicadores (quem pegar o celular não vê o faturamento).
     O olho mostra/esconde; a escolha fica só neste aparelho. */
  let verValores = false;
  try { verValores = localStorage.getItem("ksaas-ver-valores") === "1"; } catch (e) { /* sem armazenamento: começa escondido */ }
  const ouvintesValores = new Set();
  function alternarValores() {
    verValores = !verValores;
    try { localStorage.setItem("ksaas-ver-valores", verValores ? "1" : "0"); } catch (e) {}
    ouvintesValores.forEach(f => f(verValores));
  }
  function useValores() {
    const [v, setV] = useState(verValores);
    useEffect(() => { ouvintesValores.add(setV); return () => ouvintesValores.delete(setV); }, []);
    return v;
  }
  function BotaoValores() {
    const v = useValores();
    return h("button", { type: "button", className: "bt bt-leve bt-p bt-olho", onClick: alternarValores, "aria-pressed": v,
      title: v ? "Esconder os valores em R$" : "Mostrar os valores em R$" },
      h("span", { className: "bt-olho-ic" }, h(Icone, { n: v ? "olhoOff" : "olho" })), v ? "Esconder valores" : "Mostrar valores");
  }

  /* v1.39.0: botões de rota para um endereço (Google Maps e Waze) — mesmo link do "Abrir no Maps" da OS */
  const urlMapa = end => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(end);
  const urlWaze = end => "https://waze.com/ul?q=" + encodeURIComponent(end) + "&navigate=yes";
  function BotoesMapa({ endereco, pequeno }) {
    if (!endereco) return null;
    const cl = "bt" + (pequeno ? " bt-p" : "");
    return h("div", { className: "bt-mapa" },
      h("a", { className: cl + " bt-marca", href: urlMapa(endereco), target: "_blank", rel: "noopener" }, "📍 Abrir mapa"),
      h("a", { className: cl, href: urlWaze(endereco), target: "_blank", rel: "noopener" }, "Waze"));
  }

  window.K = {
    urlMapa, urlWaze, BotoesMapa,   /* v1.39.0 */
    useValores, BotaoValores, alternarValores,
    useTema, definirTema, BotaoTema, EscolhaTema, Avatar,   /* v1.35.0 */
    useReabrir, itemParaReabrir, rascAvisarPendentes,   /* v1.27.0 */
    h, api, enviarArquivo, urlAnexo, ErroServidor, aplicarTema, offline, useSync, IndicadorSync,
    PERFIS, dataHora, iniciais, senhaBoa, perfisDe, temPerfil, veValores, soConsultaCRM, soTecnico,
    Icone, Campo, Texto, Senha, Aviso, Painel, Confirmacoes, confirmar, Avisos, avisar, useDados,
    aoPerderSessao: null,
    /* v1.19.0: módulos liberados para a empresa (vem no auth.eu; null = todos) */
    liberados: null,
    temModulo: k => !K.liberados || K.liberados.indexOf(k) >= 0,
  };
})();
