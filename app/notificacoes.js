/* =====================================================================
   KONSTANTE SaaS — app/notificacoes.js  (v1.19.0 · v1.21.0)
   v1.21.0: aviso lido SAI da lista (antes acumulava e cobria a tela do celular);
            lido no app também some da bandeja de notificações do celular;
            tocar na notificação do celular já marca como lida.
   • Sino no topo: contador de não lidas e prévia de cada aviso.
   • Notificação no celular (push): ativar/desativar por aparelho.
   • Sinal no ícone do app instalado (onde o aparelho aceita).
   • Abrir o item do aviso (tarefa, OS, chamado) por cima da tela atual.
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Icone, Painel } = K;
  const { useState, useEffect, useRef } = React;

  /* ---------------- sinal no ícone ---------------- */
  function sinal(n) {
    try { if (navigator.setAppBadge) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch (e) {}
  }

  /* v1.21.0: tira da bandeja do celular as notificações já lidas (ids) ou todas (sem ids) */
  async function limparBandeja(ids) {
    try {
      if (!("serviceWorker" in navigator)) return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || !reg.getNotifications) return;
      const l = await reg.getNotifications();
      l.forEach(n => { if (!ids || ids.indexOf(n.tag) >= 0) n.close(); });
    } catch (e) { /* aparelho sem suporte: nada a fazer */ }
  }
  let aoMudarContagem = null;
  async function marcarLida(id) {
    try {
      const r = await api("notificacoes.ler", { id });
      sinal(r.naoLidas); limparBandeja(["k-" + id]);
      if (!r.naoLidas) limparBandeja(null);
      if (aoMudarContagem) aoMudarContagem(r.naoLidas);
    } catch (e) {}
  }

  /* ---------------- push ---------------- */
  const pushOk = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const instalado = () => { try { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; } };
  function chaveBytes(b64) {
    const p = "=".repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
    const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a;
  }
  function nomeAparelho() {
    const u = navigator.userAgent;
    const so = /Android/.test(u) ? "Android" : ehIOS ? "iPhone/iPad" : /Windows/.test(u) ? "Windows" : /Mac/.test(u) ? "Mac" : "Outro";
    const nav = /Edg\//.test(u) ? "Edge" : /SamsungBrowser/.test(u) ? "Samsung" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "Navegador";
    return so + " · " + nav + (instalado() ? " (app)" : "");
  }
  async function inscricaoAtual() {
    if (!pushOk()) return null;
    try { const reg = await navigator.serviceWorker.getRegistration(); return reg ? await reg.pushManager.getSubscription() : null; } catch (e) { return null; }
  }
  /* devolve "ativo" | "negado" | "indisponivel" | "ios-instalar" | "desligado" */
  async function situacaoPush() {
    if (!pushOk()) return ehIOS && !instalado() ? "ios-instalar" : "indisponivel";
    if (Notification.permission === "denied") return "negado";
    return (await inscricaoAtual()) ? "ativo" : "desligado";
  }
  async function ativarPush() {
    if (!pushOk()) throw new Error(ehIOS ? "No iPhone, instale o app na Tela de Início (Compartilhar › Adicionar à Tela de Início) e ative por lá." : "Este navegador não recebe notificações.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("As notificações foram bloqueadas. Libere nas configurações do navegador para este site.");
    const { chave } = await api("notificacoes.push_chave");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(chave) });
    const j = sub.toJSON();
    await api("notificacoes.push_inscrever", { endpoint: j.endpoint, keys: j.keys, aparelho: nomeAparelho() });
    return true;
  }
  async function desativarPush() {
    const sub = await inscricaoAtual();
    if (!sub) return;
    try { await api("notificacoes.push_remover", { endpoint: sub.endpoint }); } catch (e) {}
    try { await sub.unsubscribe(); } catch (e) {}
  }
  /* quem já ativou: mantém a inscrição deste aparelho ligada a quem está logado (troca de usuário no mesmo celular) */
  async function renovarInscricao() {
    try {
      if (!pushOk() || Notification.permission !== "granted") return;
      const sub = await inscricaoAtual(); if (!sub) return;
      const j = sub.toJSON();
      await api("notificacoes.push_inscrever", { endpoint: j.endpoint, keys: j.keys, aparelho: nomeAparelho() });
    } catch (e) {}
  }

  /* ---------------- abrir o item do aviso ---------------- */
  /* link: "tarefa:12" | "os:5" | "chamado:9" | "url:/caminho" */
  function AbrirItem({ alvo, sessao, aoFechar }) {
    const [pronto, setPronto] = useState(null);
    const [editando, setEditando] = useState(null);
    useEffect(() => {
      let vivo = true;
      (async () => {
        try {
          if (alvo.tipo === "os" && K.OS) setPronto({ op: await api("os.opcoes") });
          else if (alvo.tipo === "tarefa" && K.Tarefas) setPronto({ op: await api("tarefas.opcoes") });
          else if (alvo.tipo === "chamado" && K.CRM) {
            const [op, dados] = await Promise.all([api("chamados.opcoes"), api("chamados.obter", { id: alvo.id })]);
            if (vivo) setPronto({ op, dados });
          } else aoFechar();
        } catch (x) { K.avisar(x.message, true); aoFechar(); }
      })();
      return () => { vivo = false; };
    }, [alvo.tipo, alvo.id]);
    if (!pronto) return null;
    if (alvo.tipo === "os") return h(K.OS.DetalheOS, { id: alvo.id, op: pronto.op, sessao, aoFechar });
    if (alvo.tipo === "tarefa") return editando
      ? h(K.Tarefas.FormTarefa, { inicial: editando, op: pronto.op, sessao, aoFechar, aoSalvar: aoFechar })
      : h(K.Tarefas.DetalheTarefa, { id: alvo.id, op: pronto.op, sessao, aoFechar, aoEditar: t => setEditando(t) });
    if (alvo.tipo === "chamado") return h(K.CRM.FormChamado, { chamado: pronto.dados, op: pronto.op, ehAdmin: K.veValores(sessao), sessao, aoFechar, aoSalvar: aoFechar });
    return null;
  }
  function alvoDoLink(link) {
    const m = /^(tarefa|os|chamado):(\d+)$/.exec(String(link || ""));
    if (m) return { tipo: m[1], id: +m[2] };
    const u = /^url:(\/.*)$/.exec(String(link || ""));
    return u ? { tipo: "url", url: u[1] } : null;
  }

  /* ---------------- sino ---------------- */
  const tempo = s => {
    const d = new Date(String(s).replace(" ", "T")), seg = (Date.now() - d.getTime()) / 1000;
    if (isNaN(seg)) return "";
    if (seg < 60) return "agora";
    if (seg < 3600) return Math.floor(seg / 60) + " min";
    if (seg < 86400) return Math.floor(seg / 3600) + " h";
    if (seg < 7 * 86400) return Math.floor(seg / 86400) + " d";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  function Sino({ sessao, aoAbrir }) {
    const [n, setN] = useState(0);
    const [aberto, setAberto] = useState(false);
    const [lista, setLista] = useState(null);
    const [push, setPush] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const caixa = useRef(null);

    const [verLidas, setVerLidas] = useState(false);
    function contar() { api("notificacoes.contar").then(r => { setN(r.naoLidas); sinal(r.naoLidas); if (!r.naoLidas) limparBandeja(null); }, () => {}); }
    useEffect(() => {
      aoMudarContagem = setN;
      contar(); renovarInscricao();
      const t = setInterval(contar, 60000);
      const vis = () => { if (document.visibilityState === "visible") contar(); };
      document.addEventListener("visibilitychange", vis);
      const msg = e => { if (e.data && e.data.tipo === "k-push") contar(); };
      if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", msg);
      return () => { aoMudarContagem = null; clearInterval(t); document.removeEventListener("visibilitychange", vis); if (navigator.serviceWorker) navigator.serviceWorker.removeEventListener("message", msg); };
    }, []);
    useEffect(() => {
      if (!aberto) return;
      setLista(null);
      api("notificacoes.listar", { lidas: verLidas ? 1 : 0 }).then(r => { setLista(r.itens); setN(r.naoLidas); sinal(r.naoLidas); }, e => { setLista([]); K.avisar(e.message, true); });
      situacaoPush().then(setPush);
      const fora = e => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false); };
      document.addEventListener("pointerdown", fora);
      return () => document.removeEventListener("pointerdown", fora);
    }, [aberto, verLidas]);

    async function abrir(item) {
      setAberto(false);
      if (!item.lida) { setLista(l => (l || []).filter(x => x.id !== item.id)); marcarLida(item.id); }
      const a = alvoDoLink(item.link);
      if (a && a.tipo === "url") window.open(a.url, "_blank", "noopener");
      else if (a) aoAbrir(a);
    }
    async function lerTodas() {
      try { await api("notificacoes.ler_todas"); setN(0); sinal(0); limparBandeja(null); setLista(l => verLidas ? (l || []).map(x => Object.assign({}, x, { lida: true })) : []); } catch (x) { K.avisar(x.message, true); }
    }
    async function alternarPush() {
      setOcupado(true);
      try {
        if (push === "ativo") { await desativarPush(); K.avisar("Notificações desligadas neste aparelho."); }
        else { await ativarPush(); K.avisar("Pronto! Este aparelho vai receber os avisos."); try { await api("notificacoes.push_testar"); } catch (e) {} }
      } catch (x) { K.avisar(x.message, true); }
      setPush(await situacaoPush());
      setOcupado(false);
    }

    const textoPush = { ativo: "Avisos chegando neste aparelho", negado: "Bloqueado no navegador: libere as notificações deste site", indisponivel: "Este navegador não recebe avisos fora do app",
      "ios-instalar": "No iPhone: instale o app na Tela de Início para receber avisos", desligado: "Receba os avisos mesmo com o app fechado" }[push] || "";

    return h("div", { className: "sino", ref: caixa },
      h("button", { type: "button", className: "sino-bt", onClick: () => setAberto(!aberto), "aria-label": n ? n + " notificações não lidas" : "Notificações", "aria-expanded": aberto },
        h("span", { className: "sino-ic" }, h(Icone, { n: "sino" })), n ? h("span", { className: "sino-n" }, n > 99 ? "99+" : n) : null),
      aberto ? h("div", { className: "sino-caixa", role: "dialog", "aria-label": "Notificações" },
        h("div", { className: "sino-cab" }, h("b", null, verLidas ? "Avisos já lidos" : "Notificações"),
          h("span", { style: { display: "flex", gap: 6 } },
            !verLidas && n ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: lerTodas }, "Limpar todas") : null,
            h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setVerLidas(!verLidas) }, verLidas ? "Voltar" : "Ver lidas"),
            h("button", { type: "button", className: "bt bt-leve bt-p sino-fechar", onClick: () => setAberto(false), "aria-label": "Fechar" }, "✕"))),
        h("div", { className: "sino-lista" },
          !lista ? h("div", { className: "sino-vazio" }, "Carregando…")
          : !lista.length ? h("div", { className: "sino-vazio" }, verLidas ? "Nenhum aviso lido nos últimos 30 dias." : "Nenhum aviso novo. 👍")
          : lista.map(it => h("button", { key: it.id, type: "button", className: "sino-item" + (it.lida ? "" : " nova"), onClick: () => abrir(it) },
              h("span", { className: "sino-ponto", "aria-hidden": true }),
              h("span", { className: "sino-txt" }, h("b", null, it.titulo || "Aviso"), h("span", null, it.texto)),
              h("span", { className: "sino-t" }, tempo(it.criadoEm))))),
        push ? h("div", { className: "sino-push" },
          h("span", null, textoPush),
          push === "ativo" || push === "desligado" ? h("button", { type: "button", className: "bt bt-p" + (push === "ativo" ? " bt-leve" : " bt-marca"), disabled: ocupado, onClick: alternarPush },
            ocupado ? "Aguarde…" : push === "ativo" ? "Desligar" : "Receber no celular") : null) : null) : null);
  }

  K.Notificacoes = { Sino, AbrirItem, alvoDoLink, ativarPush, desativarPush, situacaoPush, marcarLida, limparBandeja };
})();
