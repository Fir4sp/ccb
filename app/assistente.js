/* =====================================================================
   KONSTANTE SaaS — app/assistente.js  (v1.20.0 · v1.21.0)
   Assistente de IA em TELA PRÓPRIA (menu › Assistente, ou o botão flutuante),
   que também abre numa janela separada do navegador (?so=assistente).
   v1.21.0: saiu o "Redigir com IA" de dentro do chamado — o descritivo é pedido
   ao Assistente ("faça o descritivo do chamado 612") e aplicado pelo cartão.
   A IA só lê e propõe. Gravar acontece no cartão, quando a pessoa toca em
   "Confirmar" — e aí quem grava é a ação normal do sistema (mesmas permissões).
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Aviso } = K;
  const { useState, useEffect, useRef } = React;

  /* ações que um cartão pode disparar (o resto é ignorado) */
  const ACOES_OK = { "tarefas.salvar": 1, "tarefas.status": 1, "assistente.descritivo_aplicar": 1 };
  const FEITO = { "tarefa.criar": "Tarefa criada.", "tarefa.concluir": "Tarefa concluída.", "descritivo": "Descritivo aplicado no chamado." };

  /* a conversa fica guardada enquanto o app estiver aberto (fechar o painel não apaga) */
  let memoria = null;
  let estadoCache = null;
  const CHAVE_MEM = () => "ksaas-ia-" + ((K.sessaoAtual && K.sessaoAtual.usuario && K.sessaoAtual.usuario.id) || "x");
  let memoriaDe = "";
  function lerMemoria() {
    if (memoria && memoriaDe === CHAVE_MEM()) return memoria;
    memoriaDe = CHAVE_MEM();
    try { const v = JSON.parse(sessionStorage.getItem(CHAVE_MEM()) || "[]"); memoria = Array.isArray(v) ? v : []; } catch (e) { memoria = []; }
    return memoria;
  }
  function gravarMemoria(l) {
    memoria = l; memoriaDe = CHAVE_MEM();
    try { sessionStorage.setItem(CHAVE_MEM(), JSON.stringify(l.slice(-40))); } catch (e) { /* sem armazenamento: fica só na memória */ }
  }
  const novoId = () => Math.random().toString(36).slice(2, 10);

  function Brilho() {
    return h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
      h("path", { d: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" }),
      h("path", { d: "M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" }));
  }

  /* texto da IA: linhas, listas com "- " e **negrito** — montado sem HTML cru */
  function negrito(t, k) {
    const partes = String(t).split(/\*\*(.+?)\*\*/g);
    return partes.map((p, i) => i % 2 ? h("b", { key: k + "b" + i }, p) : p);
  }
  function TextoIA({ texto }) {
    const blocos = []; let lista = null;
    String(texto || "").split("\n").forEach((l, i) => {
      const m = /^\s*([-•*]|\d+[.)])\s+(.*)$/.exec(l);
      if (m) { const num = /\d/.test(m[1]); if (!lista || lista.num !== num) { lista = []; lista.num = num; blocos.push({ lista }); } lista.push(m[2]); return; }
      lista = null;
      if (l.trim() === "") { blocos.push({ espaco: true }); return; }
      blocos.push({ linha: l.replace(/^#+\s*/, "") });
    });
    return h("div", { className: "ia-texto" }, blocos.map((b, i) =>
      b.lista ? h(b.lista.num ? "ol" : "ul", { key: i }, b.lista.map((x, j) => h("li", { key: j }, negrito(x, i + "-" + j))))
      : b.espaco ? h("div", { key: i, className: "ia-esp" })
      : h("p", { key: i }, negrito(b.linha, i))));
  }

  async function copiar(txt) {
    try { await navigator.clipboard.writeText(txt); K.avisar("Copiado."); }
    catch (e) {
      const t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); K.avisar("Copiado."); } catch (x) { K.avisar("Não consegui copiar.", true); }
      t.remove();
    }
  }

  /* ---------- cartões ---------- */

  function Cartao({ c, aoMudar }) {
    const st = c._st || "pendente";
    async function confirmar() {
      if (!ACOES_OK[c.acao]) return;
      aoMudar({ _st: "enviando" });
      try { await api(c.acao, c.dados); aoMudar({ _st: "feito" }); K.avisar(FEITO[c.tipo] || "Feito."); }
      catch (e) { aoMudar({ _st: "pendente", _erro: e.message }); }
    }
    const rodapeAcao = st === "feito" ? h("div", { className: "ia-cartao-ok" }, "✓ " + (FEITO[c.tipo] || "Feito."))
      : st === "descartado" ? h("div", { className: "ia-cartao-off" }, "Descartado.")
      : h("div", { className: "ia-cartao-bts" },
          c.tipo === "descritivo" ? h("button", { className: "bt bt-leve bt-p", onClick: () => copiar(c.texto) }, "Copiar") : null,
          h("button", { className: "bt bt-leve bt-p", disabled: st === "enviando", onClick: () => aoMudar({ _st: "descartado" }) }, "Descartar"),
          h("button", { className: "bt bt-marca bt-p", disabled: st === "enviando", onClick: confirmar }, st === "enviando" ? "Gravando…" : (c.botao || "Confirmar")));

    if (c.tipo === "lista") {
      const temCusto = c.itens.some(i => i.custoTotal);
      const texto = c.itens.map(i => i.material + "\t" + i.quantidade + " " + i.unidade + (i.custoTotal ? "\t" + i.custoTotal : "")).join("\n");
      return h("div", { className: "ia-cartao" },
        h("div", { className: "ia-cartao-t" }, c.titulo),
        c.maquinas && c.maquinas.length ? h("div", { className: "cel-sub", style: { marginBottom: 6 } },
          c.maquinas.map(m => m.qtd + "× " + m.tipo + " · " + String(m.metros).replace(".", ",") + " m").join(" · ")) : null,
        h("div", { className: "tabela-caixa" }, h("table", { className: "tabela ia-tab" },
          h("thead", null, h("tr", null, h("th", null, "Material"), h("th", { className: "num" }, "Qtd"), h("th", null, "Un."), temCusto ? h("th", { className: "num" }, "Custo") : null)),
          h("tbody", null, c.itens.map((i, k) => h("tr", { key: k }, h("td", null, i.material), h("td", { className: "num" }, i.quantidade), h("td", null, i.unidade),
            temCusto ? h("td", { className: "num" }, i.custoTotal) : null))))),
        c.rodape ? h("div", { className: "cel-sub", style: { marginTop: 6 } }, c.rodape) : null,
        h("div", { className: "ia-cartao-bts" }, h("button", { className: "bt bt-leve bt-p", onClick: () => copiar(texto) }, "Copiar lista")));
    }
    return h("div", { className: "ia-cartao" + (st === "feito" ? " feito" : "") },
      h("div", { className: "ia-cartao-t" }, c.titulo),
      c.linhas ? h("dl", { className: "ia-dl" }, c.linhas.map(([r, v], i) => h(React.Fragment, { key: i }, h("dt", null, r), h("dd", null, v)))) : null,
      c.texto ? h("div", { className: "ia-desc" }, c.texto) : null,
      c.aviso && st === "pendente" ? h("div", { className: "cel-sub", style: { color: "var(--aviso)", marginTop: 6 } }, c.aviso) : null,
      c._erro && st === "pendente" ? h(Aviso, null, c._erro) : null,
      rodapeAcao);
  }

  function Fontes({ fontes }) {
    if (!fontes || !fontes.length) return null;
    return h("div", { className: "ia-fontes" }, h("span", null, "Fontes: "),
      fontes.map((f, i) => h("a", { key: i, href: f.url, target: "_blank", rel: "noopener noreferrer" }, f.titulo || "link")));
  }

  /* ---------- conversa ---------- */

  function sugestoes(est) {
    const l = ["Como lanço uma conta paga com a nota?", "Como monto um chamado com orçamento?", "Como registro uma ocorrência no PMOC?"];   /* v1.27.0: guia do sistema */
    if (est && est.podeTarefas) l.push("O que tenho para hoje?", "Quais tarefas estão atrasadas?");
    l.push("Calcular infra de 3 hi-wall 12.000 BTUs com 40 m no total");
    if (est && est.podeChamados) l.push("Fazer o descritivo do chamado ");
    l.push("O que significa o erro U4 na Daikin?");
    return l;
  }

  function Tela({ sessao }) {
    const solo = ehJanelaSolo();
    const [msgs, setMsgs] = useState(lerMemoria);
    const [txt, setTxt] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [est, setEst] = useState(estadoCache);
    const fimRef = useRef(null);
    const campoRef = useRef(null);

    useEffect(() => { gravarMemoria(msgs); }, [msgs]);
    useEffect(() => { if (fimRef.current && msgs.length) fimRef.current.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs, ocupado]);
    useEffect(() => { api("assistente.estado").then(e => { estadoCache = e; setEst(e); }, () => {}); }, []);
    useEffect(() => { document.body.classList.add("na-ia"); return () => document.body.classList.remove("na-ia"); }, []);

    function mudarCartao(mid, ci, o) {
      setMsgs(l => l.map(m => m.id !== mid ? m : Object.assign({}, m, { acoes: m.acoes.map((c, j) => j === ci ? Object.assign({}, c, o) : c) })));
    }

    async function enviar(texto, base) {
      texto = String(texto || "").trim();
      if (!texto || ocupado) return;
      const nova = (base || msgs).filter(m => !m.erro).concat([{ id: novoId(), papel: "usuario", texto }]);
      setMsgs(nova); setTxt(""); setOcupado(true);
      try {
        const r = await api("assistente.conversar", { mensagens: nova.filter(m => m.texto).map(m => ({ papel: m.papel, texto: m.texto })) });
        setMsgs(l => l.concat([{ id: novoId(), papel: "ia", texto: r.texto, acoes: r.acoes || [], fontes: r.fontes || [] }]));
        if (est) setEst(Object.assign({}, est, { usadosHoje: (est.usadosHoje || 0) + 1 }));
      } catch (e) {
        setMsgs(l => l.concat([{ id: novoId(), papel: "ia", erro: true, texto: e.message || "Não foi possível responder agora.", repetir: texto }]));
      }
      setOcupado(false);
      setTimeout(() => campoRef.current && campoRef.current.focus(), 50);
    }

    /* v1.27.0: administrador vê o erro real da IA (chave, modelo, limite, rede) */
    const [testando, setTestando] = useState(false);
    async function testar() {
      setTestando(true);
      try { const r = await api("assistente.testar"); K.avisar((r.ok ? "✓ " : "✗ ") + r.msg + (r.modelo ? " · modelo " + r.modelo : "") + (r.segundos != null ? " · " + String(r.segundos).replace(".", ",") + " s" : ""), !r.ok); }
      catch (e) { K.avisar("Falhou: " + e.message, true); }
      setTestando(false);
    }
    function limpar() { setMsgs([]); }
    /* tira o erro e a pergunta que falhou, e manda de novo */
    function repetir(m) {
      const i = msgs.indexOf(m);
      const base = msgs.slice(0, i).filter((x, j, l) => !(j === l.length - 1 && x.papel === "usuario"));
      enviar(m.repetir, base);
    }
    function abrirJanela() {
      const w = window.open(location.pathname + "?so=assistente#/assistente", "ksaas-assistente", "width=480,height=780");
      if (!w) K.avisar("Permita pop-ups para abrir o Assistente em outra janela.", true);
    }

    return h("div", { className: "ia-pagina" + (solo ? " solo" : "") },
      h("div", { className: "ia-topo" },
        h("div", { className: "ia-topo-t" }, h("span", { className: "ia-topo-ic" }, h(Brilho)),
          h("div", null, h("b", null, "Assistente"), h("small", null, "IA · confira antes de confirmar"))),
        h("div", { className: "ia-topo-bts" },
          msgs.length ? h("button", { className: "bt bt-leve bt-p", onClick: limpar, disabled: ocupado }, "Nova conversa") : null,
          !solo ? h("button", { className: "bt bt-leve bt-p ia-so-pc", onClick: abrirJanela, title: "Abre o Assistente numa janela só dele, para usar ao lado do sistema" }, "Abrir em janela separada") : null,
          solo ? h("button", { className: "bt bt-leve bt-p", onClick: () => window.close() }, "Fechar") : null,
          K.temPerfil(sessao, "admin") ? h("button", { className: "bt bt-leve bt-p", disabled: testando, onClick: testar, title: "Confere se o servidor fala com a IA" }, testando ? "Testando…" : "Testar conexão") : null)),
      est && !est.configurado ? h(Aviso, null, "O Assistente ainda não foi configurado na plataforma (falta a chave da IA).") : null,
      h("div", { className: "ia-lista" },
        !msgs.length ? h("div", { className: "ia-vazio" },
          h("div", { className: "ia-vazio-ic" }, h(Brilho)),
          h("p", null, "Sei usar o sistema inteiro: pergunte \"como faço…\" qualquer coisa (chamado, orçamento, OS, PMOC, financeiro, usuários). Também redijo descritivos, crio e dou baixa em tarefas, faço as contas de infra e explico códigos de erro."),
          h("div", { className: "ia-sugs" }, sugestoes(est).map(s => h("button", { key: s, className: "chip", onClick: () => {
            if (/ $/.test(s)) { setTxt(s); setTimeout(() => campoRef.current && campoRef.current.focus(), 30); } else enviar(s);
          } }, s.trim())))) : null,
        msgs.map(m => m.papel === "usuario"
          ? h("div", { key: m.id, className: "ia-msg ia-eu" }, m.texto)
          : h("div", { key: m.id, className: "ia-msg ia-ela" + (m.erro ? " erro" : "") },
              h(TextoIA, { texto: m.texto }),
              m.repetir ? h("button", { className: "bt bt-leve bt-p", style: { marginTop: 6 }, onClick: () => repetir(m), disabled: ocupado }, "Tentar de novo") : null,
              (m.acoes || []).map((c, i) => h(Cartao, { key: i, c, aoMudar: o => mudarCartao(m.id, i, o) })),
              h(Fontes, { fontes: m.fontes }))),
        ocupado ? h("div", { className: "ia-msg ia-ela ia-pensando", "aria-label": "Pensando" }, h("span"), h("span"), h("span"), h("em", null, "pensando… pode levar até 1 minuto")) : null,
        h("div", { ref: fimRef })),
      h("div", { className: "ia-barra" },
        h("div", { className: "ia-entrada" },
          h("textarea", { ref: campoRef, rows: 1, value: txt, placeholder: "Pergunte ou peça algo…", disabled: est && !est.configurado,
            onChange: e => setTxt(e.target.value),
            onKeyDown: e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.innerWidth > 900) { e.preventDefault(); enviar(txt); } } }),
          h("button", { className: "bt bt-marca", disabled: ocupado || !txt.trim(), onClick: () => enviar(txt), "aria-label": "Enviar" }, ocupado ? "…" : "Enviar")),
        est ? h("div", { className: "ia-uso" }, "Hoje: " + (est.usadosHoje || 0) + " de " + est.limiteDia + " pedidos da empresa") : null));
  }

  function ehJanelaSolo() { try { return new URLSearchParams(location.search).get("so") === "assistente"; } catch (e) { return false; } }

  /* botão flutuante (empresa.js decide se aparece): leva para a tela do Assistente */
  function Botao({ sessao, ir }) {
    useEffect(() => { document.body.classList.add("com-ia"); return () => document.body.classList.remove("com-ia"); }, []);
    return h("button", { className: "ia-fab", onClick: () => (ir ? ir("assistente") : (location.hash = "/assistente")), "aria-label": "Abrir o Assistente", title: "Assistente" },
      h("span", { className: "ia-fab-ic" }, h(Brilho)), h("span", { className: "ia-fab-t" }, "Assistente"));
  }
  function disponivel(sessao) {
    return K.temModulo("assistente") && K.temPerfil(sessao, "admin", "coord", "tecnico", "comercial", "financeiro");   /* v1.22.0 */
  }

  /* v1.21.0: o botão "Redigir com IA" saiu do chamado (fica tudo na tela do Assistente) */
  function BotaoRedigir() { return null; }

  K.modulos = K.modulos || {};
  K.modulos.assistente = { titulo: "Assistente", icone: "ia", perfis: ["admin", "comercial", "financeiro", "coord", "tecnico"], modulo: "assistente", Tela };
  K.Assistente = { Botao, BotaoRedigir, disponivel, Tela, ehJanelaSolo };
})();
