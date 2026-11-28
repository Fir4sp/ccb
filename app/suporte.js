/* =====================================================================
   KONSTANTE SaaS — app/suporte.js  (v1.14.0)
   Central de ajuda: o usuário relata problema, reclamação, sugestão ou dúvida
   para a PLATAFORMA (com print opcional) e acompanha a resposta aqui.
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Aviso, Painel } = K;
  const { useState, useEffect } = React;

  const TIPOS = [["problema", "Problema", "Algo não funciona ou deu erro"], ["reclamacao", "Reclamação", "Algo está ruim ou difícil de usar"],
                 ["sugestao", "Sugestão", "Uma ideia para melhorar"], ["duvida", "Dúvida", "Não sei como fazer algo"]];
  const NOME_TIPO = { problema: "Problema", reclamacao: "Reclamação", sugestao: "Sugestão", duvida: "Dúvida" };
  const STATUS = { aberto: ["Aberto", "os-azul"], em_analise: ["Em análise", "os-amarelo"], respondido: ["Respondido", "os-verde"], resolvido: ["Resolvido", "os-cinza"] };
  const quando = s => s ? String(s).slice(8, 10) + "/" + String(s).slice(5, 7) + " " + String(s).slice(11, 16) : "";
  const versaoApp = () => { const m = /[?&]v=([\d.]+)/.exec((document.querySelector('script[src*="base.js"]') || {}).src || ""); return m ? m[1] : ""; };

  function Suporte({ sessao }) {
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [novo, setNovo] = useState(false);
    const [aberto, setAberto] = useState(null);
    function carregar() { api("suporte.listar").then(r => { setD(r); setErro(""); }, e => setErro(e.message)); }
    useEffect(carregar, []);
    const admin = K.temPerfil(sessao, "admin");
    return h("div", null,
      h("div", { className: "bloco sup-intro" },
        h("div", null, h("h2", null, "Ajuda e sugestões"),
          h("p", null, "Encontrou um problema, algo difícil de usar ou tem uma ideia? Conte aqui. Vai direto para a equipe que desenvolve o sistema, e a resposta aparece nesta tela.")),
        h("button", { className: "bt bt-marca", onClick: () => setNovo(true) }, "+ Novo relato")),
      erro ? h("div", { className: "bloco vazio" }, h(Aviso, null, erro), h("button", { className: "bt", onClick: carregar }, "Tentar de novo"))
      : !d ? h("div", { className: "bloco vazio" }, "Carregando…")
      : !d.itens.length ? h("div", { className: "bloco vazio" }, h("strong", null, "Nenhum relato ainda."), "Use o botão + Novo relato.")
      : h("div", { className: "pm-lista" }, d.itens.map(s => h("button", { key: s.id, type: "button", className: "pm-eq" + (s.naoLido ? " sup-novo" : ""), onClick: () => setAberto(s.id) },
          h("div", null, h("b", null, s.assunto), h("div", { className: "cel-sub" }, NOME_TIPO[s.tipo] + " · " + quando(s.atualizadoEm) + (admin && s.autor ? " · " + s.autor : ""))),
          h("div", { className: "pm-eq-d" }, s.naoLido ? h("span", { className: "selo os-rosa" }, "Resposta nova") : null,
            h("span", { className: "selo " + (STATUS[s.status] || STATUS.aberto)[1] }, (STATUS[s.status] || STATUS.aberto)[0]))))),
      novo ? h(NovoRelato, { aoFechar: () => setNovo(false), aoCriar: id => { setNovo(false); carregar(); setAberto(id); } }) : null,
      aberto ? h(Relato, { id: aberto, aoFechar: () => { setAberto(null); carregar(); } }) : null);
  }

  function NovoRelato({ aoFechar, aoCriar }) {
    const [tipo, setTipo] = useState("problema");
    const [assunto, setAssunto] = useState("");
    const [msg, setMsg] = useState("");
    const [prints, setPrints] = useState([]);
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const tela = (location.hash || "").replace(/^#\/?/, "") || "inicio";
    function escolher(ev) { const l = Array.from(ev.target.files || []).slice(0, 3 - prints.length); ev.target.value = ""; setPrints(p => p.concat(l)); }
    async function enviar() {
      setErro(""); setEnviando(true);
      try {
        const r = await api("suporte.criar", { tipo, assunto, mensagem: msg, tela, navegador: navigator.userAgent.slice(0, 250), versaoApp: versaoApp() });
        for (const f of prints) {
          try { const b = K.OS && K.OS.comprimir ? await K.OS.comprimir(f) : f; await K.enviarArquivo("suporte.foto.enviar", b, { suporteId: r.id }); }
          catch (x) { K.avisar("Uma imagem não subiu: " + x.message, true); }
        }
        K.avisar("Recebido! A resposta aparece em Ajuda e sugestões."); aoCriar(r.id);
      } catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: "Novo relato", sub: "Vai para a equipe que desenvolve o sistema.", aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", disabled: enviando || !assunto.trim() || msg.trim().length < 5, onClick: enviar }, enviando ? "Enviando…" : "Enviar")] },
      h(Aviso, null, erro),
      h("div", { className: "sup-tipos" }, TIPOS.map(([v, l, dsc]) => h("button", { key: v, type: "button", className: "sup-tipo" + (tipo === v ? " on" : ""), onClick: () => setTipo(v) }, h("b", null, l), h("span", null, dsc)))),
      h(Campo, { rotulo: "Título" }, h(Texto, { valor: assunto, aoMudar: setAssunto, placeholder: tipo === "sugestao" ? "Ex.: filtrar OS por técnico" : "Ex.: PDF da proposta sai sem o logo", maxLength: 200 })),
      h(Campo, { rotulo: tipo === "sugestao" ? "Conte a sua ideia" : "O que aconteceu", dica: tipo === "problema" ? "Se puder: o que você fez, o que esperava e o que apareceu." : null },
        h("textarea", { value: msg, onChange: e => setMsg(e.target.value), rows: 5 })),
      h("div", { className: "campo" }, h("span", null, "Imagens (opcional, até 3)"),
        prints.length ? h("div", { className: "pm-chips" }, prints.map((f, i) => h("span", { key: i, className: "pm-chip" }, f.name.slice(0, 28),
          h("button", { type: "button", onClick: () => setPrints(p => p.filter((x, j) => j !== i)) }, "×")))) : null,
        prints.length < 3 ? h("label", { className: "bt bt-p", style: { alignSelf: "flex-start" } }, "Anexar print ou foto", h("input", { type: "file", accept: "image/*", multiple: true, onChange: escolher, style: { display: "none" } })) : null),
      h("p", { className: "cel-sub" }, "Vão junto, para ajudar a entender: a tela em que você está (" + tela + "), o aparelho/navegador e a versão do sistema."));
  }

  function Relato({ id, aoFechar }) {
    const [s, setS] = useState(null);
    const [erro, setErro] = useState("");
    const [txt, setTxt] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [foto, setFoto] = useState(null);
    function carregar() { api("suporte.obter", { id }).then(setS, e => setErro(e.message)); }
    useEffect(carregar, [id]); // eslint-disable-line
    async function responder() {
      setEnviando(true);
      try { await api("suporte.responder", { id, texto: txt }); setTxt(""); carregar(); } catch (x) { K.avisar(x.message, true); } finally { setEnviando(false); }
    }
    if (erro) return h(Painel, { titulo: "Relato", aoFechar }, h(Aviso, null, erro));
    if (!s) return h(Painel, { titulo: "Relato", aoFechar }, h("div", { className: "vazio" }, "Carregando…"));
    const st = STATUS[s.status] || STATUS.aberto;
    return h(Painel, { titulo: s.assunto, sub: NOME_TIPO[s.tipo] + " · aberto em " + quando(s.criadoEm), aoFechar,
      rodape: [h("button", { key: "f", className: "bt", onClick: aoFechar }, "Fechar")] },
      h("div", { style: { marginBottom: 10 } }, h("span", { className: "selo " + st[1] }, st[0])),
      h("div", { className: "sup-conversa" }, s.mensagens.map(m => h("div", { key: m.id, className: "sup-msg" + (m.autor === "plataforma" ? " plat" : "") },
        h("small", null, (m.autor === "plataforma" ? (m.autorNome || "Suporte") : (m.autorNome || "Você")) + " · " + quando(m.criadoEm)), h("p", null, m.texto)))),
      s.prints.length ? h("div", { className: "os-fotos", style: { marginTop: 8 } }, s.prints.map(pid => h("button", { key: pid, type: "button", className: "os-foto", onClick: () => setFoto({ id: pid }) },
        h("img", { src: K.urlAnexo(pid), alt: "Imagem anexada", loading: "lazy" })))) : null,
      h("div", { className: "secao-titulo" }, s.status === "resolvido" ? "Ainda precisa de ajuda? Escreva aqui que reabrimos" : "Complementar"),
      h("textarea", { value: txt, onChange: e => setTxt(e.target.value), rows: 3, style: { width: "100%" }, placeholder: "Escreva sua mensagem" }),
      h("button", { type: "button", className: "bt bt-marca", style: { marginTop: 8 }, disabled: enviando || !txt.trim(), onClick: responder }, enviando ? "Enviando…" : "Enviar mensagem"),
      foto && K.OS && K.OS.VerFoto ? h(K.OS.VerFoto, { foto, fotos: s.prints.map(x => ({ id: x })), podeApagar: () => false, aoApagar: () => {}, aoFechar: () => setFoto(null) }) : null);
  }

  K.modulos = K.modulos || {};
  K.modulos.suporte = { titulo: "Ajuda e sugestões", icone: "ajuda", perfis: ["admin", "comercial", "financeiro", "coord", "tecnico"], Tela: Suporte };
})();
