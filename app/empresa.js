/* =====================================================================
   KONSTANTE SaaS — app/empresa.js
   Sistema de cada empresa: estrutura do app, início, usuários e
   configurações. (O console da plataforma fica em console.js.)
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Senha, Aviso, Painel, Icone } = K;
  const { useState, useEffect } = React;

  /* ---------------- estrutura do app ---------------- */

  const TELAS_BASE = {
    inicio:   { titulo: "Início",        icone: "inicio",   perfis: ["admin", "financeiro", "comercial", "coord", "tecnico"] },   /* cliente abre na Área do cliente (v1.13.0) */
    usuarios: { titulo: "Usuários",      icone: "usuarios", perfis: ["admin", "coord"] },
    config:   { titulo: "Configurações", icone: "config",   perfis: ["admin"] },
  };
  /* telas dos módulos (crm.js, e depois os.js, pmoc.js…) se registram em K.modulos */
  function telas() { return Object.assign({}, TELAS_BASE, K.modulos || {}); }
  const GRUPOS = [
    ["Manutenção",  ["chamados", "clientes", "catalogo"], []],   /* CCB v2 */
    ["Operacional", ["os", "tarefas"], []],
    ["CNS Limpeza", ["limpeza"], []],   /* CCB v2 — fase 2 */
  ];

  /* v1.19.0: tela de um módulo desligado para a empresa não aparece (Console › Módulos) */
  const MODULO_DA_TELA = { contratos: "contratos", os: "os", tarefas: "tarefas", pmoc: "pmoc", portal: "pmoc", visaoCliente: "pmoc", financeiro: "erp" };
  function podeVer(tela, sessao) {
    const t = telas()[tela];
    if (!t) return false;
    const mod = t.modulo || MODULO_DA_TELA[tela];
    if (mod && !K.temModulo(mod)) return false;
    return !t.perfis || K.temPerfil(sessao, ...t.perfis);   /* v1.22.0: soma dos perfis */
  }

  function telaDoEndereco(sessao) {
    const t = (location.hash || "").replace(/^#\/?/, "");
    if (podeVer(t, sessao)) return t;
    if (sessao.usuario.perfil === "cliente") return "portal";   // v1.13.0: cliente abre na área dele
    if (sessao.usuario.perfil === "financeiro" && podeVer("financeiro", sessao)) return "financeiro";   // v1.22.0
    return K.soTecnico(sessao) && podeVer("os", sessao) ? "os" : "inicio";   // técnico abre direto nas OS dele
  }

  function App({ sessao, setSessao, aoSair }) {
    const [tela, setTela] = useState(() => telaDoEndereco(sessao));
    const [menuAberto, setMenuAberto] = useState(false);
    const [euAberto, setEuAberto] = useState(false);
    const [trocandoSenha, setTrocandoSenha] = useState(false);
    const [trocandoFoto, setTrocandoFoto] = useState(false);   /* v1.35.0 */
    const emp = sessao.empresa, u = sessao.usuario;
    K.sessaoAtual = sessao;   /* v1.21.0: o Assistente guarda a conversa por usuário */

    useEffect(() => {
      const f = () => setTela(telaDoEndereco(sessao));
      window.addEventListener("hashchange", f);
      return () => window.removeEventListener("hashchange", f);
    }, [sessao]);

    function ir(t) { if (!podeVer(t, sessao)) t = "inicio"; location.hash = "/" + t; setTela(t); setMenuAberto(false); }

    /* v1.19.0: aviso tocado (sino ou notificação do celular) abre o item por cima da tela */
    const [alvo, setAlvo] = useState(null);
    useEffect(() => {
      function doEndereco() {
        /* v1.21.0: tocar na notificação do celular também marca o aviso como lido (…/n123) */
        const lida = /\/n(\d+)$/.exec(location.hash || "");
        if (lida && K.Notificacoes) K.Notificacoes.marcarLida(+lida[1]);
        const m = /^#\/abrir\/(tarefa|os|chamado)\/(\d+)/.exec(location.hash || "");
        if (!m) {
          if (lida) history.replaceState(null, "", location.pathname + location.search + "#/" + tela);
          /* v1.27.0: a página recarregou com uma OS / tarefa / chamado aberto — abre de novo no mesmo lugar */
          const vol = K.itemParaReabrir ? K.itemParaReabrir() : null;
          if (vol) setAlvo({ tipo: vol.tipo, id: vol.id });
          return;
        }
        setAlvo({ tipo: m[1], id: +m[2] });
        history.replaceState(null, "", location.pathname + location.search + "#/" + tela);
      }
      doEndereco();
      if (K.rascAvisarPendentes) K.rascAvisarPendentes();   /* v1.27.0 */
      window.addEventListener("hashchange", doEndereco);
      return () => window.removeEventListener("hashchange", doEndereco);
    }, []);
    const notif = K.Notificacoes;
    const abrirAlvo = alvo && notif ? h(notif.AbrirItem, { key: alvo.tipo + alvo.id, alvo, sessao, aoFechar: () => setAlvo(null) }) : null;

    const item = t => podeVer(t, sessao) ? h("button", { key: t, className: "menu-item" + (tela === t ? " ativo" : ""), onClick: () => ir(t), "aria-current": tela === t ? "page" : undefined },
      h(Icone, { n: telas()[t].icone }), telas()[t].titulo) : null;
    const breve = ([n, t]) => h("button", { key: n, className: "menu-item", disabled: true, title: "Chega nas próximas etapas" }, h(Icone, { n }), h("span", { className: "rot" }, t), h("span", { className: "breve" }, "em breve"));

    /* v1.16.1: cliente vê o portal sozinho, sem o menu do sistema (igual ao portal antigo) */
    if (u.perfil === "cliente" && K.modulos && K.modulos.portal) {
      return h("div", { className: "pt-app" },
        h("header", { className: "pt-barra" },
          h("div", { className: "pt-marca" },
            emp.logoId ? h("img", { src: K.urlAnexo(emp.logoId), alt: "" }) : h("span", { className: "menu-logo" }, K.iniciais(emp.nome)),
            h("div", null, h("b", null, emp.nome), h("small", null, "Portal do cliente"))),
          h("div", { style: { display: "flex", alignItems: "center", gap: 10, position: "relative" } },
            K.IndicadorSync ? h("span", { className: "pt-sync" }, h(K.IndicadorSync, null)) : null,
            h("button", { className: "pt-eu", onClick: () => setEuAberto(!euAberto), "aria-expanded": euAberto },
              h("span", { className: "avatar" }, K.iniciais(u.nome)),
              h("span", null, h("b", null, u.nome.split(" ")[0]), h("small", null, "Cliente")), " ▾"),
            euAberto ? h("div", { className: "suspenso pt-suspenso", onMouseLeave: () => setEuAberto(false) },
              h("button", { onClick: () => { setEuAberto(false); setTrocandoSenha(true); } }, "Trocar minha senha"),
              h("button", { onClick: aoSair }, "Sair")) : null)),
        h("main", { className: "pt-corpo" }, h(K.modulos.portal.Tela, { sessao, ir })),
        trocandoSenha ? h(Painel, { titulo: "Trocar minha senha", aoFechar: () => setTrocandoSenha(false) },
          h(K.FormTrocaSenha, { aoConcluir: () => setTrocandoSenha(false), aoCancelar: () => setTrocandoSenha(false) })) : null);
    }

    /* v1.21.0: Assistente aberto numa janela separada do navegador — só ele, sem o menu */
    if (K.Assistente && K.Assistente.ehJanelaSolo() && podeVer("assistente", sessao)) {
      return h("div", { className: "ia-solo-app" }, h(K.modulos.assistente.Tela, { sessao, ir }));
    }

    let corpo;
    const mod = podeVer(tela, sessao) ? (K.modulos || {})[tela] : null;
    if (mod) corpo = h(mod.Tela, { sessao, ir });
    else if (tela === "usuarios") corpo = h(Usuarios, { sessao, setSessao });
    else if (tela === "config") corpo = h(Configuracoes, { sessao, setSessao });
    else corpo = h(Inicio, { sessao, ir });

    return h("div", { className: "app tela-" + tela },
      menuAberto ? h("div", { className: "menu-veu", onClick: () => setMenuAberto(false) }) : null,
      h("aside", { className: "menu" + (menuAberto ? " aberto" : "") },
        h("div", { className: "menu-topo" },
          h("div", { className: "menu-logo" }, emp.logoId ? h("img", { src: K.urlAnexo(emp.logoId), alt: "" }) : K.iniciais(emp.nome)),
          h("div", { className: "menu-empresa", title: emp.nome }, emp.nome)),
        h("nav", { "aria-label": "Módulos" },
          item("inicio"), item("portal"), item("assistente"),
          GRUPOS.map(([g, prontas, futuras]) => prontas.some(t => podeVer(t, sessao)) || futuras.length ? h(React.Fragment, { key: g },
            h("div", { className: "menu-grupo" }, g),
            prontas.map(item), futuras.map(breve)) : null),
          (podeVer("usuarios", sessao) || podeVer("config", sessao) || podeVer("suporte", sessao)) ? h("div", { className: "menu-grupo" }, "Empresa") : null,
          item("usuarios"), item("config"), item("assinatura"), item("suporte"),   /* v1.30.0: Assinatura */
          null),
        h("div", { className: "menu-pe", style: { position: "relative" } },
          euAberto === "menu" ? h(MenuEu, { u, aoFechar: () => setEuAberto(false), aoFoto: () => setTrocandoFoto(true), aoSenha: () => setTrocandoSenha(true), aoSair }) : null,
          h("button", { className: "eu-botao", onClick: () => setEuAberto(euAberto === "menu" ? false : "menu"), "aria-expanded": euAberto === "menu" },
            h(K.Avatar, { usuario: u }),
            h("span", null, h("div", { className: "eu-nome" }, u.nome), h("div", { className: "eu-papel" }, K.PERFIS[u.perfil] + ((u.perfis || []).length > 1 ? " +" + (u.perfis.length - 1) : "")))))),
      h("main", { className: "principal" },
        h("header", { className: "topo" },
          h("div", { className: "topo-esq" },
            h("button", { className: "bt bt-leve bt-p menu-abrir", onClick: () => setMenuAberto(true), "aria-label": "Abrir menu" }, h("span", { style: { width: 22, height: 22, display: "inline-flex" } }, h(Icone, { n: "menu" }))),
            h("h1", null, (podeVer(tela, sessao) ? telas()[tela] : telas().inicio).titulo)),
          h("div", { className: "topo-dir" },
            K.IndicadorSync ? h(K.IndicadorSync, null) : null,
            h("span", { className: "topo-tema" }, h(K.BotaoTema, { claro: true })),   /* v1.35.0: claro / escuro */
            notif ? h(notif.Sino, { sessao, aoAbrir: setAlvo }) : null,   /* v1.19.0: sino */
            h("span", { className: "topo-eu-caixa" },
              h("button", { type: "button", className: "topo-eu", onClick: () => setEuAberto(euAberto === "topo" ? false : "topo"), "aria-label": "Minha conta", "aria-expanded": euAberto === "topo" },
                h(K.Avatar, { usuario: u, tam: 40 })),
              euAberto === "topo" ? h(MenuEu, { u, topo: true, aoFechar: () => setEuAberto(false), aoFoto: () => setTrocandoFoto(true), aoSenha: () => setTrocandoSenha(true), aoSair }) : null))),
        h("div", { className: "conteudo" }, K.AvisoAssinatura ? h(K.AvisoAssinatura, { sessao, ir }) : null, corpo)),   /* v1.30.0: faixa da assinatura */
      h(BarraBaixo, { tela, ir, podeVer: t => podeVer(t, sessao), aoMais: () => setMenuAberto(true) }),   /* v1.35.0 */
      trocandoSenha ? h(Painel, { titulo: "Trocar minha senha", aoFechar: () => setTrocandoSenha(false) },
        h(K.FormTrocaSenha, { aoConcluir: () => setTrocandoSenha(false), aoCancelar: () => setTrocandoSenha(false) })) : null,
      trocandoFoto ? h(FormFoto, { u, aoFechar: () => setTrocandoFoto(false),
        aoMudar: fotoId => setSessao(Object.assign({}, sessao, { usuario: Object.assign({}, sessao.usuario, { fotoId }) })) }) : null,
      abrirAlvo,
      K.Assistente && K.Assistente.disponivel(sessao) && tela !== "assistente" ? h(K.Assistente.Botao, { sessao, ir }) : null);   /* v1.20.0 · v1.21.0: abre a tela do Assistente */
  }

  /* ---------------- v1.35.0: menu da pessoa, foto e barra de baixo ---------------- */

  function MenuEu({ u, topo, aoFechar, aoFoto, aoSenha, aoSair }) {
    const caixa = React.useRef(null);
    useEffect(() => {
      const f = e => { if (caixa.current && !caixa.current.contains(e.target) && !(e.target.closest && e.target.closest(".topo-eu, .eu-botao"))) aoFechar(); };
      document.addEventListener("mousedown", f); document.addEventListener("touchstart", f);
      return () => { document.removeEventListener("mousedown", f); document.removeEventListener("touchstart", f); };
    }, []);
    const it = (ic, txt, fn, cls) => h("button", { type: "button", className: cls || "", onClick: () => { aoFechar(); fn(); } }, h("span", { className: "eu-ic" }, h(Icone, { n: ic })), txt);
    return h("div", { ref: caixa, className: "suspenso eu-menu" + (topo ? " eu-menu-topo" : "") },
      h("div", { className: "eu-menu-cab" }, h(K.Avatar, { usuario: u, tam: 44 }),
        h("div", null, h("b", null, u.nome), h("small", null, u.email || K.PERFIS[u.perfil]))),
      h("div", { className: "eu-menu-sec" }, "Tema"),
      h(K.EscolhaTema),
      h("div", { className: "eu-menu-sep" }),
      it("camera", u.fotoId ? "Trocar minha foto" : "Colocar minha foto", aoFoto),
      it("chave", "Trocar minha senha", aoSenha),
      it("sair", "Sair", aoSair, "perigo"));
  }

  /* a foto é cortada em quadrado e reduzida no aparelho (512 px) antes de subir */
  function reduzirFoto(arq) {
    return new Promise((ok, falha) => {
      const img = new Image();
      const url = URL.createObjectURL(arq);
      img.onload = () => {
        const lado = Math.min(img.naturalWidth, img.naturalHeight);
        const t = Math.min(512, lado);
        const c = document.createElement("canvas"); c.width = t; c.height = t;
        c.getContext("2d").drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, t, t);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? ok(new File([b], "foto.jpg", { type: "image/jpeg" })) : falha(new Error("Não foi possível ler a imagem.")), "image/jpeg", 0.86);
      };
      img.onerror = () => { URL.revokeObjectURL(url); falha(new Error("Não foi possível ler a imagem. Use JPG ou PNG.")); };
      img.src = url;
    });
  }

  function FormFoto({ u, aoFechar, aoMudar }) {
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState("");
    const cam = React.useRef(null), gal = React.useRef(null);
    async function escolher(e) {
      const arq = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!arq) return;
      setErro(""); setEnviando(true);
      try {
        const f = await reduzirFoto(arq);
        const r = await K.enviarArquivo("auth.foto", f);
        aoMudar(r.fotoId); K.avisar("Foto atualizada.");
      } catch (x) { setErro(x.message); }
      setEnviando(false);
    }
    async function remover() {
      setErro(""); setEnviando(true);
      try { await api("auth.foto_remover"); aoMudar(null); K.avisar("Foto removida."); } catch (x) { setErro(x.message); }
      setEnviando(false);
    }
    return h(Painel, { titulo: "Minha foto", sub: "Aparece no topo do sistema e no seu menu.", aoFechar,
        rodape: [h("button", { key: "f", className: "bt", onClick: aoFechar }, "Fechar")] },
      h(Aviso, null, erro),
      h("div", { className: "foto-ed" },
        h(K.Avatar, { usuario: u, tam: 132, classe: "foto-ed-av" }),
        h("div", { className: "foto-ed-bts" },
          h("button", { type: "button", className: "bt bt-marca", disabled: enviando, onClick: () => cam.current && cam.current.click() }, enviando ? "Enviando…" : "Tirar foto"),
          h("button", { type: "button", className: "bt", disabled: enviando, onClick: () => gal.current && gal.current.click() }, "Escolher da galeria"),
          u.fotoId ? h("button", { type: "button", className: "bt bt-leve bt-perigo", disabled: enviando, onClick: remover }, "Remover foto") : null),
        h("input", { ref: cam, type: "file", accept: "image/*", capture: "user", style: { display: "none" }, onChange: escolher }),
        h("input", { ref: gal, type: "file", accept: "image/jpeg,image/png,image/webp", style: { display: "none" }, onChange: escolher }),
        h("p", { className: "cel-sub" }, "A foto é cortada em quadrado. Use uma foto do rosto, com boa luz.")));
  }

  /* celular: barra fixa embaixo — Início · Calendário · OS/Chamados · Mais (abre o menu) */
  function BarraBaixo({ tela, ir, podeVer, aoMais }) {
    const bts = [];
    const bt = (k, ic, txt, on, fn) => bts.push(h("button", { key: k, type: "button", className: on ? "on" : "", onClick: fn, "aria-current": on ? "page" : undefined },
      h("span", { className: "bb-ic" }, h(Icone, { n: ic })), h("span", null, txt)));
    if (podeVer("inicio")) bt("ini", "inicio", "Início", tela === "inicio", () => ir("inicio"));
    if (podeVer("tarefas")) bt("cal", "calendario", "Calendário", false, () => { K.tarefasAbrirCalendario = true; if (tela === "tarefas") { ir("inicio"); setTimeout(() => ir("tarefas"), 0); } else ir("tarefas"); });
    if (podeVer("os")) bt("os", "os", "OS", tela === "os", () => ir("os"));
    else if (podeVer("chamados")) bt("ch", "crm", "Chamados", tela === "chamados", () => ir("chamados"));
    if (podeVer("tarefas")) bt("tf", "tarefas", "Tarefas", tela === "tarefas", () => ir("tarefas"));
    bt("mais", "pontos", "Mais", false, aoMais);
    return h("nav", { className: "barra-baixo", "aria-label": "Atalhos" }, bts);
  }

  /* ---------------- início: "o meu dia" (v1.9.0) ---------------- */

  const BRL = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataCurta = s => { if (!s) return "—"; const [a, m, d] = String(s).slice(0, 10).split("-"); return d + "/" + m; };
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  function useCel() {
    const q = "(max-width: 900px)";
    const [v, setV] = useState(() => { try { return window.matchMedia(q).matches; } catch (e) { return false; } });
    useEffect(() => {
      let m; try { m = window.matchMedia(q); } catch (e) { return; }
      const f = () => setV(m.matches);
      if (m.addEventListener) m.addEventListener("change", f); else m.addListener(f);
      return () => { if (m.removeEventListener) m.removeEventListener("change", f); else m.removeListener(f); };
    }, []);
    return v;
  }

  /* v1.35.1: frases para a saudação — uma por dia (a mesma o dia todo), girando pela lista */
  const FRASES = [
    "Bom trabalho começa com um bom planejamento.",
    "Cada máquina bem cuidada é um cliente tranquilo.",
    "Faça bem feito da primeira vez.",
    "Organização hoje, tranquilidade amanhã.",
    "Pequenos cuidados evitam grandes problemas.",
    "Qualidade é fazer certo mesmo quando ninguém está olhando.",
    "Um passo de cada vez, sem pular nenhum.",
    "O cliente lembra do serviço bem feito.",
    "Segurança em primeiro lugar: EPI e atenção sempre.",
    "Constância vence talento que não trabalha.",
    "Capricho no detalhe faz a diferença no resultado.",
    "Hoje é dia de deixar tudo funcionando.",
    "Disciplina é escolher o que importa, todos os dias.",
    "Quem registra bem, trabalha melhor amanhã.",
    "Ar limpo, ambiente saudável, cliente satisfeito.",
    "Comece pelo mais importante.",
    "Trabalho em equipe deixa o dia mais leve.",
    "Faça o seu melhor com o que você tem agora.",
    "Cada OS concluída é uma promessa cumprida.",
    "Atenção ao básico: é ele que sustenta o resto.",
    "Um bom dia de trabalho começa com calma e foco.",
    "Excelência é um hábito, não um ato isolado.",
    "Resolva com cuidado, explique com clareza.",
    "Prevenir é sempre melhor do que corrigir.",
    "Foto, checklist e assinatura: serviço bem documentado.",
    "Seu trabalho deixa a vida de alguém mais confortável.",
    "Não espere a máquina parar para cuidar dela.",
    "Pontualidade também é qualidade.",
    "O caminho se faz caminhando: vamos ao primeiro item.",
    "Melhor feito do que perfeito, mas bem feito sempre.",
    "Respeite o tempo do cliente e o seu.",
    "Hoje, um pouco melhor do que ontem.",
  ];
  function fraseDoDia(uid) {
    const d = new Date(); const ini = new Date(d.getFullYear(), 0, 0);
    const dia = Math.floor((d - ini) / 864e5);
    return FRASES[(dia + (uid || 0)) % FRASES.length];
  }

  /* v1.35.1: celular — saudação com foto e frase do dia, atalhos e só o que é DA PESSOA:
     minhas tarefas, minhas OS e o PMOC do mês destinado a ela (sem números e sem "novo chamado / nova tarefa / clientes") */
  function InicioCel({ sessao, r, erro, carregar, ir, abrir, oi, nome, hojeTxt }) {
    const pode = t => podeVer(t, sessao);
    const u = sessao.usuario;
    const ic = (chave, rot, icone, aoClicar) => h("button", { key: chave, type: "button", className: "ic-at", onClick: aoClicar },
      h("span", { className: "ic-at-ic" }, h(Icone, { n: icone })), h("span", { className: "ic-at-t" }, rot));
    const atalhos = [
      pode("chamados") ? ic("ch", "Chamados", "crm", () => ir("chamados")) : null,
      pode("tarefas") ? ic("tf", "Tarefas", "tarefas", () => ir("tarefas")) : null,
      pode("os") ? ic("os", "OS", "os", () => ir("os")) : null,
      pode("pmoc") ? ic("pm", "PMOC", "pmoc", () => ir("pmoc")) : null,
      pode("contratos") ? ic("ct", "Contratos", "contrato", () => ir("contratos")) : null,
      pode("financeiro") ? ic("fi", "Financeiro", "dinheiro", () => ir("financeiro")) : null,
      pode("assistente") ? ic("ia", "Assistente", "ia", () => ir("assistente")) : null,
      pode("suporte") ? ic("aj", "Ajuda", "ajuda", () => ir("suporte")) : null,
    ].filter(Boolean);

    const hj = hojeISO();
    const quando = (d, hr, atr) => !d ? "Sem data" : d === hj ? (hr || "Hoje") : (atr ? dataCurta(d) : dataCurta(d) + (hr ? " " + hr : ""));
    const linha = (k, txtQuando, atrasada, titulo, sub, aoClicar, icone, selo) => h("button", { key: k, type: "button", className: "in-item", onClick: aoClicar },
      h("span", { className: "in-bola" + (atrasada ? " atrasada" : "") }, h(Icone, { n: atrasada ? "alerta" : icone })),
      h("span", { className: "in-quando" + (atrasada ? " atrasada" : "") }, txtQuando),
      h("span", { className: "in-txt" }, h("b", null, titulo), sub ? h("span", null, sub) : null),
      selo || null,
      h("span", { className: "in-seta" }, "›"));
    const bloco = (k, titulo, sub, verTodos, itens, vazio) => h("div", { key: k, className: "bloco ic-hoje" },
      h("div", { className: "bloco-cab bloco-cab-link" }, h("div", null, h("h2", null, titulo), sub ? h("p", null, sub) : null),
        verTodos ? h("button", { type: "button", className: "link-bt", onClick: verTodos }, "Ver todos ›") : null),
      h("div", { className: "in-lista" }, itens.length ? itens : h("div", { className: "in-vazio" }, vazio)));

    const mt = r ? (r.minhasTarefas || r.tarefas || []) : [];
    const mo = r ? (r.minhasOS || r.os || []) : [];
    const mp = r ? (r.meuPmoc || []) : [];
    const prio = t => t.prioridade === "urgente" || t.prioridade === "alta" ? h("span", { className: "selo " + (t.prioridade === "urgente" ? "os-rosa" : "os-amarelo") }, t.prioridade === "urgente" ? "Urgente" : "Alta") : null;

    return h("div", { className: "ic" },
      h("div", { className: "in-hero ic-hero" },
        h("div", { className: "in-hero-eu" },
          h(K.Avatar, { usuario: u, tam: 58, classe: "in-hero-av" }),
          h("div", null, h("small", null, oi + ","), h("b", null, nome + "."))),
        h("div", { className: "in-hero-dir" },
          h("button", { type: "button", className: "in-hero-bt", onClick: carregar, "aria-label": "Atualizar" }, "↻")),
        h("p", { className: "in-frase" }, "“" + fraseDoDia(u.id) + "”"),
        h("span", { className: "in-hero-data" }, hojeTxt ? hojeTxt.charAt(0).toUpperCase() + hojeTxt.slice(1) : "")),
      erro ? h("div", { className: "bloco vazio" }, h(Aviso, null, erro), h("button", { className: "bt", onClick: carregar }, "Tentar de novo")) : null,
      h("div", { className: "ic-grade ic-grade-hero" }, atalhos),
      !r ? (erro ? null : h("div", { className: "bloco vazio" }, "Carregando…")) : h(React.Fragment, null,
        pode("tarefas") ? bloco("tf", "Minhas tarefas", "As que estão com você, das atrasadas para as próximas.", () => ir("tarefas"),
          mt.map(t => linha("t" + t.id, quando(t.data, t.hora, t.atrasada), t.atrasada, t.titulo, t.atrasada ? "Atrasada" + (t.clienteNome ? " · " + t.clienteNome : "") : t.clienteNome,
            () => abrir("tarefa", { id: t.id }), "tarefas", prio(t))),
          "Nenhuma tarefa com você. 👍") : null,
        pode("os") ? bloco("os", "Minhas OS", "Em que você é o responsável ou está escalado.", () => ir("os"),
          mo.map(o => linha("o" + o.id, quando(o.dataPrev, o.horaPrev, o.atrasada), o.atrasada, "OS " + o.numero + " · " + o.clienteNome, o.status,
            () => abrir("os", { id: o.id }), "os")),
          "Nenhuma OS aberta com você.") : null,
        pode("pmoc") && (mp.length || K.soTecnico(sessao)) ? bloco("pm", "Meu PMOC do mês", "Planos destinados a você neste mês.", () => ir("pmoc"),
          mp.map(p => {
            const fim = p.equipamentos > 0 && p.feitas >= p.equipamentos;
            /* v1.39.0: endereço e "Abrir mapa" logo abaixo do plano (o técnico não precisa mais de uma tarefa só para ter o endereço) */
            return h(React.Fragment, { key: "p" + p.id },
              linha("pl" + p.id, p.feitas + "/" + p.equipamentos, false, p.clienteNome,
                (fim ? "Mês concluído" : (p.equipamentos - p.feitas) + " equipamento(s) a apontar") + (p.endereco ? " · " + p.endereco : ""),
                () => { K.pmocAbrirPlano = p.id; ir("pmoc"); }, "pmoc",
                h("span", { className: "selo " + (fim ? "os-verde" : "os-azul") }, fim ? "Feito" : "Pendente")),
              p.endereco ? h("div", { className: "in-mapa" }, h(K.BotoesMapa, { endereco: p.endereco, pequeno: true })) : null);
          }),
          "Nenhum plano PMOC com você neste mês.") : null));
  }

  function Inicio({ sessao, ir }) {
    const u = sessao.usuario;
    const esc = K.temPerfil(sessao, "admin", "coord", "comercial");   /* v1.22.0 */
    const admin = K.veValores(sessao);
    const nome = u.nome.split(" ")[0];
    const hora = new Date().getHours();
    const oi = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    const [r, setR] = useState(null);
    const [erro, setErro] = useState("");
    const [aberto, setAberto] = useState(null);     // {tipo, id?, dados?}
    const [ops, setOps] = useState({});
    const cel = useCel();
    const valoresVis = K.useValores();

    function carregar() { api("inicio.resumo").then(d => { setR(d); setErro(""); }, e => setErro(e.message)); }
    useEffect(carregar, []);

    /* opções de cada módulo, buscadas só quando precisa */
    const FONTE = { os: "os.opcoes", tarefa: "tarefas.opcoes", chamado: "chamados.opcoes" };
    async function abrir(tipo, extra) {
      const base = tipo.replace(/^nov[oa]-/, "");
      try {
        let op = ops[base];
        if (!op) { op = await api(FONTE[base]); setOps(o => Object.assign({}, o, { [base]: op })); }
        let dados = extra || null;
        if (tipo === "chamado") dados = await api("chamados.obter", { id: extra.id });
        setAberto({ tipo, dados, id: extra && extra.id });
      } catch (x) { K.avisar(x.message, true); }
    }
    const fechar = () => { setAberto(null); carregar(); };

    let modal = null;
    if (aberto) {
      const t = aberto.tipo;
      if (t === "os" && K.OS) modal = h(K.OS.DetalheOS, { id: aberto.id, op: ops.os, sessao, aoFechar: fechar });
      else if (t === "novo-os" && K.OS) modal = h(K.OS.NovaOS, { op: ops.os, aoFechar: fechar, aoCriar: o => setAberto({ tipo: "os", id: o.id }) });
      else if (t === "tarefa" && K.Tarefas) modal = h(K.Tarefas.DetalheTarefa, { id: aberto.id, op: ops.tarefa, sessao, aoFechar: fechar, aoEditar: x => setAberto({ tipo: "nova-tarefa", dados: x }) });
      else if (t === "nova-tarefa" && K.Tarefas) modal = h(K.Tarefas.FormTarefa, { inicial: aberto.dados || {}, op: ops.tarefa, sessao, aoFechar: fechar, aoSalvar: x => setAberto({ tipo: "tarefa", id: x.id }) });
      else if ((t === "chamado" || t === "novo-chamado") && K.CRM) modal = h(K.CRM.FormChamado, { chamado: aberto.dados || {}, op: ops.chamado, ehAdmin: admin, sessao, aoFechar: fechar, aoSalvar: fechar });
    }

    const item = (chave, quando, atrasada, titulo, sub, direita, aoClicar) => h("button", { key: chave, type: "button", className: "in-item", onClick: aoClicar },
      h("span", { className: "in-quando" + (atrasada ? " atrasada" : "") }, quando),
      h("span", { className: "in-txt" }, h("b", null, titulo), sub ? h("span", null, sub) : null),
      direita);
    const hj = hojeISO();
    const quandoDe = (d, hr, atr) => (atr ? "⚠ " + dataCurta(d) : d === hj ? (hr || "Hoje") : dataCurta(d));
    const kpi = (t, v, p, cls, aoClicar) => h("button", { type: "button", className: "kpi kpi-botao" + (cls ? " " + cls : ""), onClick: aoClicar },
      h("div", { className: "kpi-t" }, t), h("div", { className: "kpi-v" }, v), p ? h("div", { className: "kpi-p" }, p) : null);
    const hojeCap = hoje.charAt(0).toUpperCase() + hoje.slice(1);

    const verV = admin && valoresVis;   /* v1.21.0: R$ só com o olho aberto */
    if (cel) return h("div", null, h(InicioCel, { sessao, r, erro, carregar, ir, abrir, esc, admin, oi, nome, hojeTxt: hoje }), modal);
    return h("div", null,
      h("div", { className: "in-hero" },
        h("div", { className: "in-hero-eu" }, h(K.Avatar, { usuario: u, tam: 64, classe: "in-hero-av" }),
          h("div", null, h("small", null, oi + ","), h("b", null, nome + "."), h("p", { className: "in-frase" }, "“" + fraseDoDia(u.id) + "”"))),
        h("div", { className: "in-hero-dir" }, h("span", { className: "in-hero-data" }, hojeCap))),
      h("div", { className: "in-atalhos" },
        admin ? h(K.BotaoValores, null) : null,
        esc && K.CRM ? h("button", { className: "bt bt-marca", onClick: () => abrir("novo-chamado") }, "+ Novo chamado") : null,
        esc && K.OS && K.temModulo("os") ? h("button", { className: "bt", onClick: () => abrir("novo-os") }, "+ Nova OS") : null,
        K.Tarefas && K.temModulo("tarefas") ? h("button", { className: esc ? "bt" : "bt bt-marca", onClick: () => abrir("nova-tarefa", {}) }, "+ Nova tarefa") : null),
      erro ? h("div", { className: "bloco vazio" }, h(Aviso, null, erro), h("button", { className: "bt", onClick: carregar }, "Tentar de novo"))
      : !r ? h("div", { className: "bloco vazio" }, "Carregando…")
      : h(React.Fragment, null,
          r.numeros ? h("div", { className: "kpis" },
            kpi("Orçamentos a fazer", String(r.numeros.aEnviar), "chamados em \"Falta orçamento\"", null, () => ir("chamados")),
            kpi("Aguardando aprovação", String(r.numeros.aguardando), verV ? BRL(r.numeros.aguardandoValor) + " em propostas" : "propostas com o cliente", null, () => ir("chamados")),
            verV ? kpi("A receber", BRL(r.numeros.aReceber), "chamados ganhos − recebido", "kpi-forte", () => ir("chamados")) : null,
            K.temModulo("os") ? kpi("OS a faturar", String(r.numeros.osFaturar), "serviço finalizado", null, () => ir("os")) : null,
            !K.temModulo("tarefas") ? null : kpi("Tarefas atrasadas", String(r.numeros.tarefasAtrasadas), "da equipe toda", r.numeros.tarefasAtrasadas ? "tf-kpi-alerta" : null, () => ir("tarefas"))) : null,
          h("div", { className: "in-grade" },
            !K.temModulo("os") ? null : h("div", { className: "bloco" },
              h("div", { className: "bloco-cab" }, h("h2", null, "Minhas OS"), h("p", null, "Só as OS em que você é o responsável ou está escalado — de hoje e atrasadas.")),
              h("div", { className: "in-lista" },
                r.os.length ? r.os.map(o => item("o" + o.id, quandoDe(o.dataPrev, o.horaPrev, o.atrasada), o.atrasada, "OS " + o.numero + " · " + o.clienteNome, null,
                  K.OS ? h(K.OS.SeloOS, { status: o.status }) : null, () => abrir("os", { id: o.id })))
                : h("div", { className: "in-vazio" }, "Nenhuma OS sua para hoje. 👍"),
                h("button", { type: "button", className: "bt bt-leve bt-p in-mais", onClick: () => ir("os") }, "Ver todas as OS" + (r.cel && r.cel.osAbertas ? " (" + r.cel.osAbertas + " em aberto)" : "")))),
            !K.temModulo("tarefas") ? null : h("div", { className: "bloco" },
              h("div", { className: "bloco-cab" }, h("h2", null, "Minhas tarefas"), h("p", null, "De hoje e atrasadas.")),
              h("div", { className: "in-lista" },
                r.tarefas.length ? r.tarefas.map(t => item("t" + t.id, quandoDe(t.data, t.hora, t.atrasada), t.atrasada, t.titulo, t.clienteNome,
                  t.prioridade === "urgente" || t.prioridade === "alta" ? h("span", { className: "selo " + (t.prioridade === "urgente" ? "os-rosa" : "os-amarelo") }, t.prioridade === "urgente" ? "Urgente" : "Alta") : null,
                  () => abrir("tarefa", { id: t.id })))
                : h("div", { className: "in-vazio" }, "Nada pendente para hoje."),
                h("button", { type: "button", className: "bt bt-leve bt-p in-mais", onClick: () => ir("tarefas") }, "Ver todas as tarefas"))),
            esc ? h("div", { className: "bloco" },
              h("div", { className: "bloco-cab" }, h("h2", null, "Chamados parados"), h("p", null, "Sem movimento há mais de " + r.diasParado + " dias: enviar orçamento ou cobrar resposta.")),
              h("div", { className: "in-lista" },
                r.parados.length ? r.parados.map(c => item("c" + c.id, c.dias + " dias", c.dias >= 7, c.numero + " · " + c.clienteNome,
                  c.status + (c.comQuemFalar ? " · " + c.comQuemFalar : ""), verV && c.valor != null ? h("span", { className: "cel-sub", style: { whiteSpace: "nowrap" } }, BRL(c.valor)) : null,
                  () => abrir("chamado", { id: c.id })))
                : h("div", { className: "in-vazio" }, "Nenhum chamado parado. Tudo em dia."),
                h("button", { type: "button", className: "bt bt-leve bt-p in-mais", onClick: () => ir("chamados") }, "Ver chamados"))) : null,
            /* v1.14.0: propostas vencendo/vencidas e retornos marcados */
            esc ? h("div", { className: "bloco" },
              h("div", { className: "bloco-cab" }, h("h2", null, "Propostas e retornos"), h("p", null, "Validade vencendo (3 dias ou menos), vencidas e retornos combinados com o cliente.")),
              h("div", { className: "in-lista" },
                (r.propostas || []).length ? r.propostas.map(c => item("p" + c.id,
                  c.tipo === "vencida" ? "Vencida" : c.tipo === "vencendo" ? (c.dias === 0 ? "Vence hoje" : c.dias + (c.dias === 1 ? " dia" : " dias")) : "Retorno",
                  c.tipo === "vencida" || (c.retorno && c.retorno < hj), c.numero + " · " + c.clienteNome,
                  [c.comQuemFalar, c.retorno ? "retorno " + (c.retorno === hj ? "hoje" : dataCurta(c.retorno)) : ""].filter(Boolean).join(" · "),
                  verV && c.valor != null ? h("span", { className: "cel-sub", style: { whiteSpace: "nowrap" } }, BRL(c.valor)) : null,
                  () => abrir("chamado", { id: c.id })))
                : h("div", { className: "in-vazio" }, "Nenhuma proposta vencendo e nenhum retorno para hoje."),
                h("button", { type: "button", className: "bt bt-leve bt-p in-mais", onClick: () => ir("chamados") }, "Ver chamados"))) : null)),
      modal);
  }

  /* ---------------- usuários ---------------- */

  /* CCB v2: perfis do Sistema CCB (Financeiro e Comercial do SGClim não são usados) */
  const PERFIS_EDITAVEIS = ["admin", "coord", "gestao", "procurador", "seguranca", "tecnico", "cliente"];
  const PERFIS_EXTRAS = ["admin", "coord", "gestao", "procurador", "seguranca", "tecnico"];
  const DESCR_PERFIL = {
    admin: "Acesso total, inclusive valores, usuários e configurações.",
    financeiro: "Financeiro completo (contas, pagar e receber, fluxo, DRE, conciliação, notas). Consulta o CRM com valores, sem alterar.",
    comercial: "CRM completo com valores: clientes, chamados, orçamentos, propostas, contratos e catálogo. Emite notas fiscais.",
    coord: "Coordenação de Manutenção: abre chamados, faz o orçamento, aprova até a alçada dela e opera as OS.",
    gestao: "Gestão de Manutenção: consulta os chamados e aprova os de valor acima da Coordenação.",
    procurador: "Aprova os chamados acima da alçada da Gestão.",
    seguranca: "Segurança do Trabalho: dá o parecer nos tipos de serviço marcados (elétrica, telhado, incêndio…).",
    tecnico: "Vê só as próprias OS e tarefas, pelo celular.",
    cliente: "Casa de Oração: acompanha os chamados e os serviços da própria casa.",
  };

  /* CCB v2: tipos de serviço do chamado (com parecer da Segurança do Trabalho) e alçadas de aprovação */
  const TIPOS_PADRAO = [["Elétrica", 1], ["Hidráulica e esgoto", 0], ["Civil (paredes, piso, pintura)", 0], ["Telhado, forro e calhas", 1], ["Ar-condicionado e ventiladores", 0],
    ["Portas, janelas e fechaduras", 0], ["Som e instrumentos", 0], ["Incêndio e segurança", 1], ["Móveis e bancos", 0], ["Jardim e área externa", 0], ["Obra", 1], ["Outros", 0]];
  function CfgChamados({ d, recarregar }) {
    const c = d.config || {};
    const [tipos, setTipos] = useState(() => (c.tipos_servico && c.tipos_servico.length ? c.tipos_servico : TIPOS_PADRAO.map(([nome, s]) => ({ nome, seguranca: !!s })))
      .map(t => ({ nome: t.nome, seguranca: !!t.seguranca })));
    const [alc, setAlc] = useState({ coord: String((c.alcadas || {}).coord != null ? c.alcadas.coord : 500), gestao: String((c.alcadas || {}).gestao != null ? c.alcadas.gestao : 1000) });
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const muda = (i, k, v) => setTipos(l => l.map((t, j) => j === i ? Object.assign({}, t, { [k]: v }) : t));
    const num = v => Number(String(v).replace(/\./g, "").replace(",", "."));
    async function salvar() {
      setErro("");
      const out = tipos.filter(t => t.nome.trim()).map(t => ({ nome: t.nome.trim(), seguranca: !!t.seguranca }));
      if (!out.length) return setErro("Deixe ao menos um tipo de serviço.");
      const a = { coord: num(alc.coord), gestao: num(alc.gestao) };
      if (!(a.coord >= 0) || !(a.gestao >= 0)) return setErro("Informe as alçadas em reais.");
      if (a.gestao < a.coord) return setErro("A alçada da Gestão não pode ser menor que a da Coordenação.");
      setEnviando(true);
      try { await api("config.salvar", { valores: { tipos_servico: out, alcadas: a } }); K.avisar("Configurações dos chamados salvas."); recarregar(); }
      catch (x) { setErro(x.message); }
      setEnviando(false);
    }
    return h("div", { className: "bloco" },
      h("div", { className: "bloco-cab" }, h("h2", null, "Chamados e aprovação"),
        h("p", null, "Os tipos de serviço aparecem no chamado e puxam o checklist da OS pelas palavras-chave (Configurações › Checklists de OS).")),
      h("div", { className: "bloco-corpo" },
        h(Aviso, null, erro),
        h("div", { className: "secao-titulo" }, "Alçadas de aprovação"),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Coordenação aprova até (R$)" }, h(Texto, { valor: alc.coord, aoMudar: v => setAlc(Object.assign({}, alc, { coord: v })), inputMode: "decimal" })),
          h(Campo, { rotulo: "Gestão aprova até (R$)", dica: "Acima disso, o Procurador." }, h(Texto, { valor: alc.gestao, aoMudar: v => setAlc(Object.assign({}, alc, { gestao: v })), inputMode: "decimal" }))),
        h("div", { className: "secao-titulo" }, "Tipos de serviço"),
        h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "Tipo"), h("th", null, "Parecer da Segurança do Trabalho"), h("th", { className: "acoes" }))),
          h("tbody", null, tipos.map((t, i) => h("tr", { key: i },
            h("td", null, h(Texto, { valor: t.nome, aoMudar: v => muda(i, "nome", v), "aria-label": "Tipo de serviço" })),
            h("td", null, h("label", { className: "check" }, h("input", { type: "checkbox", checked: t.seguranca, onChange: e => muda(i, "seguranca", e.target.checked) }), "Exige parecer")),
            h("td", { className: "acoes" }, h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo", onClick: () => setTipos(l => l.filter((_, j) => j !== i)), "aria-label": "Remover tipo" }, "×"))))))),
        h("button", { type: "button", className: "bt bt-p", onClick: () => setTipos(l => l.concat([{ nome: "", seguranca: false }])) }, "+ Tipo de serviço")),
      h("div", { className: "bloco-pe" }, h("button", { className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar")));
  }

  function Usuarios({ sessao, setSessao }) {
    const [lista, recarregar] = K.useDados("usuarios.listar");
    const [busca, setBusca] = useState("");
    const [aba, setAba] = useState("equipe");   /* v1.35.2: equipe da empresa · usuários dos clientes */
    const [editando, setEditando] = useState(null);
    const [senhaDe, setSenhaDe] = useState(null);
    const ehAdmin = K.temPerfil(sessao, "admin");

    async function excluir(u) {
      const ok = await K.confirmar({ titulo: "Excluir " + u.nome + "?", texto: "A pessoa perde o acesso na hora. O histórico dela continua registrado.", botao: "Excluir", perigo: true });
      if (!ok) return;
      try { await api("usuarios.excluir", { id: u.id }); K.avisar("Usuário excluído."); recarregar(); }
      catch (x) { K.avisar(x.message, true); }
    }

    const t = busca.trim().toLowerCase();
    const todos = lista.dados || [];
    const doCli = u => u.perfil === "cliente";
    const nEquipe = todos.filter(u => !doCli(u)).length, nCli = todos.filter(doCli).length;
    const itens = todos.filter(u => (aba === "clientes") === doCli(u))
      .filter(u => !t || (u.nome + " " + u.email + " " + (u.cargo || "") + " " + (u.clienteNome || "")).toLowerCase().includes(t));
    const cli = aba === "clientes";
    /* a própria foto trocada aqui também aparece no topo na hora */
    const aoMudarFoto = (id, fotoId) => { if (id === sessao.usuario.id && setSessao) setSessao(Object.assign({}, sessao, { usuario: Object.assign({}, sessao.usuario, { fotoId }) })); recarregar(); };

    return h("div", null,
      h("div", { className: "tf-seg us-abas", role: "tablist" },
        h("button", { type: "button", role: "tab", className: "seg" + (!cli ? " on" : ""), "aria-selected": !cli, onClick: () => setAba("equipe") }, "Equipe da empresa", h("span", { className: "us-n" }, nEquipe)),
        h("button", { type: "button", role: "tab", className: "seg" + (cli ? " on" : ""), "aria-selected": cli, onClick: () => setAba("clientes") }, "Usuários dos clientes", h("span", { className: "us-n" }, nCli))),
      h("div", { className: "barra" },
        h("input", { className: "entrada-texto busca", placeholder: cli ? "Buscar por nome, e-mail ou unidade" : "Buscar por nome, e-mail ou cargo", value: busca, onChange: e => setBusca(e.target.value), "aria-label": "Buscar usuários" }),
        h("div", { style: { flex: 1 } }),
        ehAdmin ? h("button", { className: "bt bt-marca", onClick: () => setEditando(cli ? { perfil: "cliente" } : {}) }, cli ? "Novo usuário do cliente" : "Novo usuário da equipe") : null),
      cli ? h("p", { className: "cel-sub", style: { margin: "-6px 0 12px" } }, "Pessoas dos clientes que entram na Área do cliente: veem só as unidades delas — máquinas, serviços, pendências e relatórios. Nunca veem valores.") : null,
      h("div", { className: "bloco" },
        lista.carregando ? h("div", { className: "vazio" }, "Carregando…")
        : lista.erro ? h("div", { className: "vazio" }, h(Aviso, null, lista.erro), h("button", { className: "bt", onClick: recarregar }, "Tentar de novo"))
        : !itens.length ? h("div", { className: "vazio" }, h("strong", null, t ? "Ninguém encontrado." : cli ? "Nenhum usuário de cliente ainda." : "Nenhum usuário ainda."), t ? "Confira a busca." : cli ? "Cadastre quem do cliente vai acompanhar pela Área do cliente." : "Cadastre a equipe para começar.")
        : h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
            h("thead", null, h("tr", null, h("th", null, "Nome"), h("th", null, cli ? "Unidades" : "Perfil"), h("th", null, "Situação"), h("th", null, "Último acesso"), ehAdmin ? h("th", { className: "acoes" }) : null)),
            h("tbody", null, itens.map(u => h("tr", { key: u.id },
              h("td", null, h("div", { className: "us-pessoa" }, h(K.Avatar, { usuario: u, tam: 38 }),
                h("div", null, h("div", { className: "cel-titulo" }, u.nome, u.id === sessao.usuario.id ? h("span", { className: "cel-sub" }, "  (você)") : null), h("div", { className: "cel-sub" }, u.email + (u.cargo ? " · " + u.cargo : ""))))),
              cli ? h("td", null, h("div", null, u.clienteNome || "Sem unidade"), u.unidades && u.unidades.length ? h("div", { className: "cel-sub" }, "+ " + u.unidades.length + " unidade(s): " + u.unidades.map(x => x.nome).join(", ")) : null)
              : h("td", null, K.PERFIS[u.perfil],
                (u.extras || []).length ? h("div", { className: "cel-sub" }, "+ " + u.extras.map(x => K.PERFIS[x.perfil] + (x.validoAte ? (x.vencido ? " (vencido)" : " até " + x.validoAte.split("-").reverse().join("/")) : "")).join(", ")) : null,
                null),
              h("td", null, h("span", { className: "selo " + (u.status === "ativo" ? "selo-ok" : "selo-off") }, u.status === "ativo" ? "Ativo" : "Inativo")),
              h("td", null, K.dataHora(u.ultimoAcesso)),
              ehAdmin ? h("td", { className: "acoes" },
                h("button", { className: "bt bt-leve bt-p", onClick: () => setEditando(u) }, "Editar"),
                h("button", { className: "bt bt-leve bt-p", onClick: () => setSenhaDe(u) }, "Definir senha"),
                u.id !== sessao.usuario.id ? h("button", { className: "bt bt-leve bt-p bt-perigo", onClick: () => excluir(u) }, "Excluir") : null) : null)))))),
      editando ? h(FormUsuario, { usuario: editando, sessao, aoFechar: () => setEditando(null), aoSalvar: () => { setEditando(null); recarregar(); }, aoMudarFoto }) : null,
      senhaDe ? h(FormDefinirSenha, { usuario: senhaDe, aoFechar: () => setSenhaDe(null) }) : null);
  }

  function FormUsuario({ usuario, sessao, aoFechar, aoSalvar, aoMudarFoto }) {
    const novo = !usuario.id;
    const [f, setF] = useState(Object.assign({ nome: "", email: "", perfil: "tecnico", status: "ativo", cargo: "", telefone: "", especialidade: "", registro: "", senha: "",
      clienteId: null, clienteNome: "", unidades: [], extras: [] }, usuario));
    /* v1.22.0: perfis extras — {perfil: "AAAA-MM-DD" | ""} (vencidos não voltam marcados) */
    const [extras, setExtras] = useState(() => { const o = {}; (usuario.extras || []).forEach(x => { if (!x.vencido) o[x.perfil] = x.validoAte || ""; }); return o; });
    const [addUni, setAddUni] = useState(false);
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(Object.assign({}, f, { [k]: v }));
    const euMesmo = usuario.id === sessao.usuario.id;
    /* v1.35.2: foto — usuário já cadastrado: sobe na hora; novo: guarda e sobe depois de criar */
    const [fotoId, setFotoId] = useState(usuario.fotoId || null);
    const [fotoNova, setFotoNova] = useState(null);   /* {arquivo, url} enquanto o usuário novo não foi salvo */
    const [fotoEnv, setFotoEnv] = useState(false);
    const galFoto = React.useRef(null);
    async function escolherFoto(e) {
      const arq = e.target.files && e.target.files[0]; e.target.value = "";
      if (!arq) return;
      setErro("");
      try {
        const fx = await reduzirFoto(arq);
        if (novo) { setFotoNova({ arquivo: fx, url: URL.createObjectURL(fx) }); return; }
        setFotoEnv(true);
        const r = await K.enviarArquivo("usuarios.foto", fx, { usuarioId: usuario.id });
        setFotoId(r.fotoId); if (aoMudarFoto) aoMudarFoto(usuario.id, r.fotoId); K.avisar("Foto atualizada.");
      } catch (x) { setErro(x.message); }
      setFotoEnv(false);
    }
    async function removerFoto() {
      if (novo) { setFotoNova(null); return; }
      setFotoEnv(true);
      try { await api("usuarios.foto_remover", { usuarioId: usuario.id }); setFotoId(null); if (aoMudarFoto) aoMudarFoto(usuario.id, null); K.avisar("Foto removida."); }
      catch (x) { setErro(x.message); }
      setFotoEnv(false);
    }

    async function salvar() {
      setErro("");
      if (!f.nome.trim()) return setErro("Informe o nome.");
      if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErro("Informe um e-mail válido. Ele é o login da pessoa.");
      if (novo && !K.senhaBoa(f.senha)) return setErro("A senha inicial precisa ter pelo menos 8 caracteres, com letras e números.");
      if (f.perfil === "cliente" && !f.clienteId) return setErro("Escolha a unidade (cliente) principal deste usuário.");
      setEnviando(true);
      const ext = f.perfil === "cliente" ? [] : Object.keys(extras).filter(p => p !== f.perfil).map(p => ({ perfil: p, validoAte: extras[p] || "" }));
      try {
        const r = await api("usuarios.salvar", Object.assign({}, f, { unidades: (f.unidades || []).map(x => x.id), extras: ext }));
        if (novo && fotoNova && r && r.id) {
          try { await K.enviarArquivo("usuarios.foto", fotoNova.arquivo, { usuarioId: r.id }); }
          catch (x) { K.avisar("Usuário criado, mas a foto não subiu: " + x.message, true); }
        }
        K.avisar(novo ? "Usuário criado." : "Alterações salvas."); aoSalvar();
      }
      catch (x) { setErro(x.message); setEnviando(false); }
    }

    return h(Painel, {
      titulo: novo ? "Novo usuário" : "Editar usuário",
      sub: novo ? "A pessoa entra com o e-mail e a senha inicial, e cria a própria senha no primeiro acesso." : usuario.email,
      aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : novo ? "Criar usuário" : "Salvar alterações")],
    },
      h(Aviso, null, erro),
      h("div", { className: "us-foto" },
        fotoNova ? h("span", { className: "avatar com-foto", style: { width: 76, height: 76 } }, h("img", { src: fotoNova.url, alt: "" }))
          : h(K.Avatar, { usuario: { nome: f.nome || "?", fotoId }, tam: 76 }),
        h("div", { className: "us-foto-bts" },
          h("b", null, "Foto"),
          h("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
            h("button", { type: "button", className: "bt bt-p", disabled: fotoEnv, onClick: () => galFoto.current && galFoto.current.click() }, fotoEnv ? "Enviando…" : (fotoId || fotoNova) ? "Trocar foto" : "Colocar foto"),
            (fotoId || fotoNova) ? h("button", { type: "button", className: "bt bt-p bt-leve bt-perigo", disabled: fotoEnv, onClick: removerFoto }, "Remover") : null),
          h("small", { className: "cel-sub" }, novo ? "A foto sobe junto quando você criar o usuário." : "Cortada em quadrado. Aparece no topo do sistema e nas listas.")),
        h("input", { ref: galFoto, type: "file", accept: "image/*", style: { display: "none" }, onChange: escolherFoto })),
      h(Campo, { rotulo: "Nome completo" }, h(Texto, { valor: f.nome, aoMudar: mudar("nome"), autoFocus: true })),
      h(Campo, { rotulo: "E-mail", dica: "É o login. Precisa ser único na plataforma." }, h(Texto, { valor: f.email, aoMudar: mudar("email"), type: "email", inputMode: "email" })),
      novo ? h(Campo, { rotulo: "Senha inicial", dica: "Passe para a pessoa; ela troca no primeiro acesso." }, h(Senha, { valor: f.senha, aoMudar: mudar("senha"), autoComplete: "new-password" })) : null,
      h("div", { className: "secao-titulo" }, "Acesso"),
      h(Campo, { rotulo: "Perfil", dica: DESCR_PERFIL[f.perfil] },
        h("select", { value: f.perfil, onChange: e => mudar("perfil")(e.target.value), disabled: euMesmo }, PERFIS_EDITAVEIS.map(p => h("option", { key: p, value: p }, K.PERFIS[p])))),
      f.perfil !== "cliente" ? h("div", { className: "campo" },
        h("span", null, "Perfis extras (opcional)"),
        h("small", null, "Somam acesso ao perfil principal. Use \"válido até\" para liberar por um tempo — no dia seguinte o acesso extra se encerra sozinho."),
        h("div", { className: "us-extras" }, PERFIS_EXTRAS.filter(p => p !== f.perfil).map(p => {
          const on = Object.prototype.hasOwnProperty.call(extras, p);
          return h("div", { key: p, className: "us-extra" + (on ? " on" : "") },
            h("label", { className: "check", style: { margin: 0 } },
              h("input", { type: "checkbox", checked: on, disabled: euMesmo && p === "admin", onChange: e => setExtras(x => { const o = Object.assign({}, x); if (e.target.checked) o[p] = ""; else delete o[p]; return o; }) }),
              h("span", null, h("b", null, K.PERFIS[p]), h("small", { style: { display: "block" } }, DESCR_PERFIL[p]))),
            on ? h("label", { className: "us-ate" }, "válido até", h("input", { type: "date", className: "entrada-texto", value: extras[p] || "", min: new Date().toISOString().slice(0, 10),
              onChange: e => setExtras(x => Object.assign({}, x, { [p]: e.target.value })) })) : null);
        }))) : null,
      !novo ? h(Campo, { rotulo: "Situação" },
        h("select", { value: f.status, onChange: e => mudar("status")(e.target.value), disabled: euMesmo },
          h("option", { value: "ativo" }, "Ativo — pode entrar"), h("option", { value: "inativo" }, "Inativo — acesso bloqueado"))) : null,
      h("div", { className: "secao-titulo" }, "Contato e função"),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Cargo" }, h(Texto, { valor: f.cargo, aoMudar: mudar("cargo") })),
        h(Campo, { rotulo: "Telefone" }, h(Texto, { valor: f.telefone, aoMudar: mudar("telefone"), inputMode: "tel" }))),
      f.perfil === "cliente" ? h(React.Fragment, null,
        h("div", { className: "secao-titulo" }, "Unidades que este cliente vê"),
        h("div", { className: "campo" }, h("span", null, "Unidade principal"),
          K.CRM && K.CRM.EscolheCliente ? h(K.CRM.EscolheCliente, { valor: f.clienteId, rotulo: f.clienteNome,
            aoEscolher: c => setF(x => Object.assign({}, x, { clienteId: c ? c.id : null, clienteNome: c ? c.nome : "", unidades: (x.unidades || []).filter(u => !c || u.id !== c.id) })) }) : null),
        h("div", { className: "campo" }, h("span", null, "Outras unidades (cliente regional)"),
          (f.unidades || []).length ? h("div", { className: "pm-chips" }, f.unidades.map(un => h("span", { key: un.id, className: "pm-chip" }, un.nome,
            h("button", { type: "button", "aria-label": "Tirar " + un.nome, onClick: () => setF(x => Object.assign({}, x, { unidades: x.unidades.filter(z => z.id !== un.id) })) }, "×")))) : null,
          addUni && K.CRM && K.CRM.EscolheCliente ? h(K.CRM.EscolheCliente, { valor: null, rotulo: "", aoEscolher: c => {
              setAddUni(false);
              if (c && c.id !== f.clienteId && !(f.unidades || []).some(z => z.id === c.id)) setF(x => Object.assign({}, x, { unidades: (x.unidades || []).concat([{ id: c.id, nome: c.nome }]) }));
            } })
          : h("button", { type: "button", className: "bt bt-p", style: { alignSelf: "flex-start" }, onClick: () => setAddUni(true) }, "+ Adicionar unidade"),
          h("small", null, "Use quando o mesmo cliente tem várias unidades (filiais, prédios). O usuário escolhe a unidade ou vê todas juntas."))) : null,
      f.perfil === "tecnico" ? h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Especialidade" }, h(Texto, { valor: f.especialidade, aoMudar: mudar("especialidade") })),
        h(Campo, { rotulo: "Registro (CFT/CREA)" }, h(Texto, { valor: f.registro, aoMudar: mudar("registro") }))) : null);
  }

  function FormDefinirSenha({ usuario, aoFechar }) {
    const [senha, setSenha] = useState("");
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    async function salvar() {
      setErro("");
      if (!K.senhaBoa(senha)) return setErro("A senha precisa ter pelo menos 8 caracteres, com letras e números.");
      setEnviando(true);
      try { await api("usuarios.definir_senha", { id: usuario.id, senha }); K.avisar("Senha definida. " + usuario.nome.split(" ")[0] + " vai criar uma nova no próximo acesso."); aoFechar(); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, {
      titulo: "Definir senha", sub: usuario.nome + " · " + usuario.email, aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Definir senha")],
    },
      h(Aviso, null, erro),
      h("p", { style: { marginTop: 0, color: "var(--tinta-2)" } }, "Use quando alguém esquecer a senha. A pessoa entra com esta senha e é obrigada a criar outra."),
      h(Campo, { rotulo: "Nova senha temporária" }, h(Senha, { valor: senha, aoMudar: setSenha, autoComplete: "new-password", autoFocus: true })));
  }

  /* ---------------- configurações ---------------- */

  const NOMES_SEQ = { chamado: "Próximo chamado", cliente: "Próximo cliente", contrato: "Próximo contrato", os_contrato: "Próxima OS de contrato" };
  function rotuloNumero(tipo, n) { return tipo === "os_contrato" ? "C-" + String(n).padStart(4, "0") : String(n); }

  function Configuracoes({ sessao, setSessao }) {
    const [aba, setAba] = useState("empresa");
    const [cfg, recarregar] = K.useDados("config.ler");
    if (cfg.carregando) return h("div", { className: "vazio" }, "Carregando…");
    if (cfg.erro) return h("div", null, h(Aviso, null, cfg.erro), h("button", { className: "bt", onClick: recarregar }, "Tentar de novo"));
    const d = cfg.dados;
    const abas = [["empresa", "Dados da organização"], ["chamados", "Chamados e aprovação"], ["checklists", "Checklists de OS"], ["aparencia", "Aparência"], ["numeracao", "Numeração"]];   /* CCB v2 */
    return h("div", null,
      h("div", { className: "abas", role: "tablist" }, abas.map(([k, t]) => h("button", { key: k, role: "tab", "aria-selected": aba === k, className: "aba" + (aba === k ? " ativa" : ""), onClick: () => setAba(k) }, t))),
      aba === "empresa" ? h(CfgEmpresa, { d, recarregar })
      : aba === "orcamento" ? h(CfgOrcamento, { d, recarregar })
      : aba === "chamados" ? h(CfgChamados, { d, recarregar })
      : aba === "checklists" ? (K.CfgChecklists ? h(K.CfgChecklists, { d, recarregar }) : null)
      : aba === "aparencia" ? h(CfgAparencia, { d, sessao, setSessao, recarregar })
      : aba === "cadastro" ? h(CfgCadastro, { d })
      : h(CfgNumeracao, { d, sessao }));
  }

  function CfgEmpresa({ d, recarregar }) {
    const base = Object.assign({ nome: d.empresa.nome || "", razao_social: d.empresa.razaoSocial || "", cnpj: d.empresa.cnpj || "", endereco: "", telefone: "", email: "", site: "" }, d.config.empresa || {});
    const [f, setF] = useState(base);
    const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(Object.assign({}, f, { [k]: v }));
    async function salvar() {
      setEnviando(true);
      try { await api("config.salvar", { valores: { empresa: f } }); K.avisar("Dados da empresa salvos."); recarregar(); }
      catch (x) { K.avisar(x.message, true); setEnviando(false); }
    }
    return h("div", { className: "bloco" },
      h("div", { className: "bloco-cab" }, h("h2", null, "Dados que aparecem nos documentos"), h("p", null, "Usados no cabeçalho e no rodapé das propostas, OS e relatórios.")),
      h("div", { className: "bloco-corpo" },
        h(Campo, { rotulo: "Nome fantasia" }, h(Texto, { valor: f.nome, aoMudar: mudar("nome") })),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Razão social" }, h(Texto, { valor: f.razao_social, aoMudar: mudar("razao_social") })),
          h(Campo, { rotulo: "CNPJ" }, h(Texto, { valor: f.cnpj, aoMudar: mudar("cnpj"), inputMode: "numeric" })),
          h(Campo, { rotulo: "CREA da empresa", dica: "Sai no Livro do PMOC." }, h(Texto, { valor: f.crea || "", aoMudar: mudar("crea") }))),   /* v1.16.0 */
        h(Campo, { rotulo: "Endereço" }, h(Texto, { valor: f.endereco, aoMudar: mudar("endereco") })),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Telefone" }, h(Texto, { valor: f.telefone, aoMudar: mudar("telefone"), inputMode: "tel" })),
          h(Campo, { rotulo: "E-mail" }, h(Texto, { valor: f.email, aoMudar: mudar("email"), type: "email" })),
          h(Campo, { rotulo: "Site" }, h(Texto, { valor: f.site, aoMudar: mudar("site") })))),
      h("div", { className: "bloco-pe" }, h("button", { className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar dados")));
  }

  function CfgOrcamento({ d, recarregar }) {
    const c = d.config;
    const [f, setF] = useState({ aliquota: c.aliquota ?? 0, rt_padrao: c.rt_padrao ?? 0, markup_materiais: c.markup_materiais ?? 15, validade_orcamento: c.validade_orcamento ?? 15 });
    const tp = c.textos_pdf || {};
    const [pdf, setPdf] = useState({ dados_bancarios: tp.dados_bancarios || "", observacao: tp.observacao || "" });
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(Object.assign({}, f, { [k]: v }));
    async function salvar() {
      setErro("");
      const vals = {};
      for (const k of Object.keys(f)) {
        const n = Number(String(f[k]).replace(",", "."));
        if (!isFinite(n) || n < 0) return setErro("Use apenas números positivos.");
        vals[k] = n;
      }
      if (vals.aliquota > 100 || vals.rt_padrao > 100) return setErro("Imposto e RT vão de 0 a 100%.");
      vals.textos_pdf = Object.assign({}, tp, { dados_bancarios: pdf.dados_bancarios.trim(), observacao: pdf.observacao.trim() });
      setEnviando(true);
      try { await api("config.salvar", { valores: vals }); K.avisar("Padrões do orçamento salvos."); recarregar(); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h("div", { className: "bloco" },
      h("div", { className: "bloco-cab" }, h("h2", null, "Padrões do orçamento"), h("p", null, "Valores sugeridos ao abrir um orçamento. Dá para ajustar em cada proposta.")),
      h("div", { className: "bloco-corpo" },
        h(Aviso, null, erro),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Imposto (%)", dica: "Diluído nos itens quando a proposta é com nota." }, h(Texto, { valor: f.aliquota, aoMudar: mudar("aliquota"), inputMode: "decimal" })),
          h(Campo, { rotulo: "RT (%)", dica: "Reserva técnica, também diluída nos itens." }, h(Texto, { valor: f.rt_padrao, aoMudar: mudar("rt_padrao"), inputMode: "decimal" })),
          h(Campo, { rotulo: "Margem dos materiais (%)", dica: "Somada ao pacote de materiais." }, h(Texto, { valor: f.markup_materiais, aoMudar: mudar("markup_materiais"), inputMode: "decimal" })),
          h(Campo, { rotulo: "Validade da proposta (dias)" }, h(Texto, { valor: f.validade_orcamento, aoMudar: mudar("validade_orcamento"), inputMode: "numeric" }))),
        h("div", { className: "secao-titulo" }, "Textos do PDF da proposta"),
        h("label", { className: "campo" }, h("span", null, "Dados para transferência"),
          h("textarea", { value: pdf.dados_bancarios, onChange: e => setPdf(Object.assign({}, pdf, { dados_bancarios: e.target.value })), placeholder: "Agência, conta, banco, chave PIX…" }),
          h("small", null, "Aparece no fim da proposta. Deixe em branco para não mostrar.")),
        h("label", { className: "campo" }, h("span", null, "Observação final"),
          h("textarea", { value: pdf.observacao, onChange: e => setPdf(Object.assign({}, pdf, { observacao: e.target.value })), placeholder: "Condições, garantia…" }),
          h("small", null, "Sai depois da validade da proposta."))),
      h("div", { className: "bloco-pe" }, h("button", { className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar padrões")));
  }

  function CfgAparencia({ d, sessao, setSessao }) {
    const emp = sessao.empresa;
    const [p, setP] = useState(emp.corPrimaria || "#111111");
    const [s, setS] = useState(emp.corSecundaria || "#3a3a3a");
    const [enviando, setEnviando] = useState(false);
    const [subindo, setSubindo] = useState(false);

    const atual = React.useRef(sessao.empresa);
    atual.current = sessao.empresa;
    useEffect(() => { K.aplicarTema(Object.assign({}, atual.current, { corPrimaria: p, corSecundaria: s })); }, [p, s]);
    useEffect(() => () => K.aplicarTema(atual.current), []); // saiu sem salvar: volta às cores salvas

    function atualizarEmpresa(nova) { setSessao(Object.assign({}, sessao, { empresa: Object.assign({}, sessao.empresa, nova) })); }

    async function salvarCores() {
      setEnviando(true);
      try { const e = await api("config.tema", { corPrimaria: p, corSecundaria: s }); atualizarEmpresa(e); K.avisar("Cores salvas."); }
      catch (x) { K.avisar(x.message, true); }
      setEnviando(false);
    }
    async function enviarLogo(ev) {
      const arq = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!arq) return;
      if (arq.size > 12 * 1024 * 1024) return K.avisar("Imagem grande demais (máx. 12 MB).", true);
      setSubindo(true);
      try { const e = await K.enviarArquivo("config.logo", arq); atualizarEmpresa(e); K.avisar("Logo atualizado."); }
      catch (x) { K.avisar(x.message, true); }
      setSubindo(false);
    }
    async function removerLogo() {
      if (!(await K.confirmar({ titulo: "Remover o logo?", texto: "No lugar dele aparecem as iniciais da empresa.", botao: "Remover", perigo: true }))) return;
      try { const e = await api("config.remover_logo"); atualizarEmpresa(e); K.avisar("Logo removido."); }
      catch (x) { K.avisar(x.message, true); }
    }

    return h("div", null,
      h("div", { className: "bloco" },
        h("div", { className: "bloco-cab" }, h("h2", null, "Logo"), h("p", null, "Aparece no menu e nos documentos. PNG com fundo transparente fica melhor.")),
        h("div", { className: "bloco-corpo" },
          h("div", { className: "logo-area" },
            h("div", { className: "logo-previa" }, emp.logoId ? h("img", { src: K.urlAnexo(emp.logoId), alt: "Logo atual" }) : "sem logo"),
            h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
              h("label", { className: "bt" + (subindo ? " disabled" : "") }, subindo ? "Enviando…" : emp.logoId ? "Trocar logo" : "Enviar logo",
                h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", onChange: enviarLogo, style: { display: "none" }, disabled: subindo })),
              emp.logoId ? h("button", { className: "bt bt-leve bt-perigo", onClick: removerLogo }, "Remover") : null)))),
      h("div", { className: "bloco" },
        h("div", { className: "bloco-cab" }, h("h2", null, "Cores"), h("p", null, "A cor principal pinta botões, o item ativo do menu e destaques. A prévia muda na hora.")),
        h("div", { className: "bloco-corpo" },
          h("div", { className: "cores" },
            h("label", { className: "cor" }, h("input", { type: "color", value: p, onChange: e => setP(e.target.value) }), h("span", null, h("b", null, "Principal"), h("div", { className: "cel-sub" }, p))),
            h("label", { className: "cor" }, h("input", { type: "color", value: s, onChange: e => setS(e.target.value) }), h("span", null, h("b", null, "Secundária"), h("div", { className: "cel-sub" }, s)))),
          h("div", { className: "previa-barra", "aria-hidden": true },
            h("div", { className: "pm" }, h("span", { className: "a" }), h("span"), h("span"), h("span")),
            h("div", { className: "pc" }, h("span", { className: "bt bt-marca" }, "Botão principal")))),
        h("div", { className: "bloco-pe" },
          h("button", { className: "bt bt-leve", onClick: () => { setP("#111111"); setS("#3a3a3a"); } }, "Voltar ao preto e branco"),
          h("button", { className: "bt bt-marca", onClick: salvarCores, disabled: enviando }, enviando ? "Salvando…" : "Salvar cores"))));
  }

  /* link público do formulário de cadastro de clientes */
  function CfgCadastroLink({ d }) {
    const [res, recarregar] = K.useDados("config.link_cadastro");
    const [ocupado, setOcupado] = useState(false);
    const nomeEmp = (d.config.empresa && d.config.empresa.nome) || d.empresa.nome;
    if (res.carregando) return h("div", { className: "vazio" }, "Carregando…");
    if (res.erro) return h("div", null, h(Aviso, null, res.erro), h("button", { className: "bt", onClick: recarregar }, "Tentar de novo"));
    const L = res.dados;
    const mensagem = "Olá! Para agilizarmos o seu atendimento, preencha o seu cadastro com a " + nomeEmp + " pelo link: " + L.url;

    async function copiar(texto, aviso) {
      try { await navigator.clipboard.writeText(texto); K.avisar(aviso); }
      catch (x) { window.prompt("Copie o texto abaixo:", texto); }
    }
    async function executar(acao, dados, aviso) {
      setOcupado(true);
      try { await api(acao, dados); K.avisar(aviso); recarregar(); }
      catch (x) { K.avisar(x.message, true); }
      setOcupado(false);
    }
    async function trocar() {
      const okk = await K.confirmar({ titulo: "Gerar um link novo?", texto: "O link atual para de funcionar na hora. Quem recebeu o link antigo vai precisar do novo.", botao: "Gerar link novo", perigo: true });
      if (okk) executar("config.link_cadastro_novo", {}, "Link novo gerado.");
    }

    return h("div", { className: "bloco" },
      h("div", { className: "bloco-cab" },
        h("h2", null, "Link de cadastro de clientes"),
        h("p", null, "Mande este link ao cliente pelo WhatsApp (ou use na sua automação). Ele abre um formulário com o seu logo e as suas cores, sem precisar de login. O cadastro enviado entra direto em CRM › Clientes, com origem \u201cFormulário\u201d.")),
      h("div", { className: "bloco-corpo" },
        h("div", { style: { marginBottom: 12 } }, h("span", { className: "selo " + (L.ativo ? "selo-ok" : "selo-off") }, L.ativo ? "Formulário ligado" : "Formulário desligado")),
        h(Campo, { rotulo: "Link do formulário" }, h(Texto, { valor: L.url, aoMudar: () => {}, readOnly: true, onFocus: e => e.target.select() })),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 } },
          h("button", { className: "bt bt-marca", onClick: () => copiar(L.url, "Link copiado.") }, "Copiar link"),
          h("a", { className: "bt", href: "https://wa.me/?text=" + encodeURIComponent(mensagem), target: "_blank", rel: "noopener" }, "Mandar pelo WhatsApp"),
          h("button", { className: "bt", onClick: () => copiar(mensagem, "Mensagem copiada.") }, "Copiar mensagem pronta"),
          h("a", { className: "bt bt-leve", href: L.url, target: "_blank", rel: "noopener" }, "Abrir formulário")),
        h("p", { className: "cel-sub", style: { marginTop: 16, marginBottom: 0 } }, "Mensagem pronta: ", h("i", null, mensagem))),
      h("div", { className: "bloco-pe", style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        h("button", { className: "bt", disabled: ocupado, onClick: () => executar("config.link_cadastro_ativo", { ativo: !L.ativo }, L.ativo ? "Formulário desligado." : "Formulário ligado.") },
          L.ativo ? "Desligar formulário" : "Ligar formulário"),
        h("button", { className: "bt bt-leve bt-perigo", disabled: ocupado, onClick: trocar }, "Gerar link novo")),
      /* v1.39.0: solicitação de serviço pelo link — vira tarefa "Solicitação pelo link" para a equipe */
      L.solicitacaoUrl ? h("div", { className: "bloco-corpo", style: { borderTop: "1px solid var(--linha-2)" } },
        h("h3", { style: { margin: "0 0 6px" } }, "Link de solicitação de serviço"),
        h("p", { className: "cel-sub", style: { marginTop: 0 } }, "Para quem já foi atendido e não tem contrato: a pessoa informa o nome, um contato e o que precisa, e isso abre uma tarefa para a equipe. Não liga a nenhum cliente sozinho — a tarefa indica, só para a equipe, se há cliente com nome ou telefone parecido. O código é o mesmo do link de cadastro (gerar link novo troca os dois)."),
        h("div", { style: { marginBottom: 12 } }, h("span", { className: "selo " + (L.solicitacaoAtivo ? "selo-ok" : "selo-off") }, L.solicitacaoAtivo ? "Formulário ligado" : "Formulário desligado")),
        h(Campo, { rotulo: "Link do formulário de solicitação" }, h(Texto, { valor: L.solicitacaoUrl, aoMudar: () => {}, readOnly: true, onFocus: e => e.target.select() })),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 } },
          h("button", { className: "bt bt-marca", onClick: () => copiar(L.solicitacaoUrl, "Link copiado.") }, "Copiar link"),
          h("a", { className: "bt", href: "https://wa.me/?text=" + encodeURIComponent("Olá! Para pedir um serviço à " + nomeEmp + ", use este link: " + L.solicitacaoUrl), target: "_blank", rel: "noopener" }, "Mandar pelo WhatsApp"),
          L.solicitacaoAtivo ? h("a", { className: "bt bt-leve", href: L.solicitacaoUrl, target: "_blank", rel: "noopener" }, "Abrir formulário") : null,
          h("button", { className: "bt", disabled: ocupado, onClick: () => executar("config.link_solicitacao_ativo", { ativo: !L.solicitacaoAtivo }, L.solicitacaoAtivo ? "Formulário de solicitação desligado." : "Formulário de solicitação ligado.") },
            L.solicitacaoAtivo ? "Desligar formulário" : "Ligar formulário"))) : null);
  }

  /* v1.19.0: cliente novo pelo link gera a tarefa "fazer orçamento" e avisa no sino/celular */
  function CfgCadastro({ d }) {
    return h(React.Fragment, null, h(CfgCadastroLink, { d }), h(CfgTarefaCadastro, { d }));
  }
  function CfgTarefaCadastro({ d }) {
    const atual = (d.config && d.config.cadastro_tarefa) || {};
    const [f, setF] = useState({ ativo: atual.ativo !== false, responsaveis: atual.responsaveis || [], prazoDias: atual.prazoDias != null ? atual.prazoDias : 1 });
    const [equipe, setEquipe] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const temTarefas = K.temModulo("tarefas");
    useEffect(() => { if (temTarefas) api("tarefas.opcoes").then(o => setEquipe(o.equipe), () => setEquipe([])); }, []);
    const marca = id => setF(x => Object.assign({}, x, { responsaveis: x.responsaveis.indexOf(id) >= 0 ? x.responsaveis.filter(y => y !== id) : x.responsaveis.concat([id]) }));
    async function salvar() {
      setSalvando(true);
      try { await api("config.salvar", { valores: { cadastro_tarefa: { ativo: f.ativo, responsaveis: f.responsaveis, prazoDias: Math.max(0, Math.min(30, +f.prazoDias || 0)) } } }); K.avisar("Tarefa do cadastro salva."); }
      catch (x) { K.avisar(x.message, true); }
      setSalvando(false);
    }
    return h("div", { className: "bloco" },
      h("div", { className: "bloco-cab" }, h("h2", null, "Tarefa automática para cliente novo"),
        h("p", null, "Quando um cliente preenche o link, o sistema cria a tarefa \u201cNovo cliente — fazer orçamento\u201d e avisa as pessoas escolhidas no sino e no celular. A tarefa é concluída sozinha quando você abre um chamado para esse cliente.")),
      h("div", { className: "bloco-corpo" },
        !temTarefas ? h(Aviso, null, "O módulo Tarefas não está liberado para a sua empresa: o cadastro só gera o aviso, sem tarefa.") : null,
        h("label", { className: "check", style: { marginBottom: 12 } }, h("input", { type: "checkbox", checked: f.ativo, onChange: e => setF(x => Object.assign({}, x, { ativo: e.target.checked })) }), "Criar a tarefa quando chegar cadastro novo"),
        h(Campo, { rotulo: "Prazo da tarefa", dica: "Dias a partir do cadastro (0 = no mesmo dia)." },
          h("input", { className: "entrada-texto", type: "number", min: 0, max: 30, value: f.prazoDias, onChange: e => setF(x => Object.assign({}, x, { prazoDias: e.target.value })), style: { maxWidth: 120 } })),
        h("div", { className: "campo" }, h("span", null, "Quem recebe"),
          !equipe ? h("div", { className: "cel-sub" }, temTarefas ? "Carregando a equipe…" : "—")
          : h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px 16px" } }, equipe.map(p => h("label", { key: p.id, className: "check" },
              h("input", { type: "checkbox", checked: f.responsaveis.indexOf(p.id) >= 0, onChange: () => marca(p.id) }), p.nome))),
          h("small", null, "Ninguém marcado = todos os administradores."))),
      h("div", { className: "bloco-pe" }, h("button", { className: "bt bt-marca", disabled: salvando, onClick: salvar }, salvando ? "Salvando…" : "Salvar")));
  }

  function CfgNumeracao({ d, sessao }) {
    const ordem = ["chamado", "os_contrato", "contrato", "cliente"];
    return h("div", { className: "bloco" },
      h("div", { className: "bloco-cab" }, h("h2", null, "Numeração"), h("p", null, "Números que serão usados nos próximos registros. A OS avulsa usa o número do chamado; a OS de contrato tem numeração própria.")),
      h("div", { className: "bloco-corpo" },
        h("div", { className: "numeros" }, ordem.filter(t => d.sequencias[t] != null).map(t => h("div", { key: t, className: "numero" }, h("b", null, rotuloNumero(t, d.sequencias[t])), h("span", null, NOMES_SEQ[t])))),
        h("p", { className: "cel-sub", style: { marginTop: 16, marginBottom: 0 } }, "Para ajustar a numeração, fale com o suporte da plataforma.")));
  }

  K.App = App;
})();
