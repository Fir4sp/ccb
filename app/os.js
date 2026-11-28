/* =====================================================================
   KONSTANTE SaaS — app/os.js  (v1.11.0 · v1.6.2)
   ORDENS DE SERVIÇO — visão geral, lista em cards, nova OS a partir do
   chamado, detalhe com tarefas/etapas, diário, pendências, materiais e
   (v1.6.0) campo: fotos com zoom, assinaturas, conferência e relatório.
   (v1.6.2) endereço do cliente ou outro, botão do Maps, fotos por bloco,
            câmera direta ou galeria.
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Aviso, Painel } = K;
  const { useState, useEffect, useRef } = React;

  const STATUS_COR = {
    "Aberta": "os-cinza", "Agendada": "os-azul", "Em deslocamento": "os-roxo", "Em execução": "os-azul-forte", "Pausada": "os-amarelo",
    "Aguardando material": "os-laranja", "Aguardando retorno": "os-laranja", "Com pendência": "os-rosa",
    "Serviço finalizado": "os-ciano", "Concluída": "os-verde", "Cancelada": "os-cinza",
  };
  const ETAPA = { pendente: "Pendente", execucao: "Em execução", concluida: "Concluída", na: "Não se aplica", problema: "Não OK", naofeito: "Não feito" };   /* v1.34.0: NF */
  const PRIO = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };

  const dataBR = s => { if (!s) return "—"; const [a, m, d] = String(s).slice(0, 10).split("-"); return d + "/" + m + "/" + a; };
  const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const pct = o => (o.etapasTotal ? Math.round(o.etapasFeitas / o.etapasTotal * 100) : 0);

  function SeloOS({ status }) { return h("span", { className: "selo " + (STATUS_COR[status] || "os-cinza") }, status); }
  function Barra({ o }) {
    return h("div", { className: "os-barra", title: o.etapasFeitas + " de " + o.etapasTotal + " etapas" },
      h("div", { style: { width: pct(o) + "%" } }));
  }

  /* modelo de checklist pelo tipo de serviço (mesma regra do painel: palavras-chave) */
  function modeloDoTipo(tipo, checklists) {
    const t = String(tipo || "").toLowerCase();
    for (const m of checklists) for (const termo of (m.termos || [])) { const x = String(termo || "").toLowerCase().trim(); if (x && t.indexOf(x) >= 0) return m.nome; }
    const p = checklists.find(m => m.nome === "Personalizada");
    return p ? p.nome : (checklists[0] ? checklists[0].nome : "");
  }
  const itensDoModelo = (nome, checklists) => ((checklists.find(m => m.nome === nome) || {}).itens || []).slice();

  /* agrupa etapas por tarefa (grupo), mantendo a ordem */
  function tarefasDe(etapas) {
    const out = [], idx = {};
    (etapas || []).forEach(e => {
      const g = e.grupo || "Serviço";
      if (!(g in idx)) { idx[g] = out.length; out.push({ nome: g, etapas: [] }); }
      out[idx[g]].etapas.push(e);
    });
    return out;
  }
  /* link de rota no Google Maps (abre o app no celular) */
  /* v1.28.0: equipe da OS — depois de finalizada os técnicos saem da escala; fica quem executou */
  const equipeDe = o => ((o.tecnicos || []).length ? o.tecnicos : (o.executores || [])).map(t => t.nome).join(", ");
  const rotuloEq = o => o.equipTag ? o.equipTag + (o.equipLocal ? " · " + o.equipLocal : "") : "";
  const urlMaps = end => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(end);
  /* foto presa a uma etapa que não existe mais (tarefa editada) cai em "fotos gerais" */
  function separarFotos(o) {
    const ids = new Set(o.etapas.map(e => e.id));
    return { daEtapa: f => f.etapaId && ids.has(f.etapaId), gerais: o.fotos.filter(f => !f.etapaId || !ids.has(f.etapaId)) };
  }
  const achatar = tarefas => tarefas.reduce((l, t) => l.concat(t.etapas.map(e => Object.assign({}, e, { grupo: t.nome }))), []);

  /* relatório a partir do id (tela do chamado): abre a janela já no clique */
  async function relatorioDaOS(id, sessao) {
    const w = window.open("", "_blank");
    if (!w) return K.avisar("Permita pop-ups para gerar o relatório.", true);
    w.document.write("<p style='font-family:sans-serif;padding:20px'>Montando o relatório…</p>");
    try { abrirRelatorio(await api("os.obter", { id }), sessao, w); }
    catch (x) { w.close(); K.avisar(x.message, true); }
  }

  /* =================================================================
     TELA PRINCIPAL
     ================================================================= */
  function OrdensServico({ sessao, ir }) {
    const ehEscritorio = !K.soTecnico(sessao);   /* v1.22.0 */
    const [op, setOp] = useState(null);
    const [resumo, setResumo] = useState(null);
    const [grupo, setGrupo] = useState("abertas");
    const [busca, setBusca] = useState("");
    const [lista, setLista] = useState({ carregando: true, erro: "", dados: null });
    const [nova, setNova] = useState(false);
    const [aberta, setAberta] = useState(null);
    const pedido = useRef(0);
    /* v1.35.3: visão em lista (como Chamados) ou em cartões — guardada no aparelho; "Hoje e atrasadas" recolhido */
    const [vis, setVisRaw] = useState(() => { try { const v = localStorage.getItem("k_os_vis"); if (v === "lista" || v === "cartoes") return v; } catch (e) {} return window.innerWidth > 900 ? "lista" : "cartoes"; });
    const setVis = v => { setVisRaw(v); try { localStorage.setItem("k_os_vis", v); } catch (e) {} };
    const [verHoje, setVerHoje] = useState(false);

    useEffect(() => { api("os.opcoes").then(setOp, e => K.avisar(e.message, true)); }, []);
    function carregarResumo() { api("os.resumo").then(setResumo, () => {}); }
    function carregar() {
      const n = ++pedido.current;
      setLista(l => Object.assign({}, l, { carregando: true, erro: "" }));
      api("os.listar", { grupo, busca: busca.trim() }).then(
        d => { if (n === pedido.current) setLista({ carregando: false, erro: "", dados: d }); },
        e => { if (n === pedido.current) setLista({ carregando: false, erro: e.message, dados: null }); });
    }
    useEffect(carregarResumo, []);
    useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [grupo, busca]); // eslint-disable-line
    const atualizar = () => { carregar(); carregarResumo(); };

    const card = (chave, titulo, n) => h("button", { key: chave, type: "button", className: "kpi kpi-botao" + (grupo === chave ? " ativo" : ""), onClick: () => setGrupo(grupo === chave ? "abertas" : chave) },
      h("div", { className: "kpi-t" }, titulo), h("div", { className: "kpi-v" }, resumo ? String(n) : "…"));
    const itens = lista.dados ? lista.dados.itens : [];

    return h("div", null,
      h("div", { className: "kpis os-kpis" },
        card("agendadas", "Agendadas", resumo && resumo.agendadas),
        card("execucao", "Em execução", resumo && resumo.execucao),
        card("pendencia", "Com pendência", resumo && resumo.pendencia),
        card("faturar", "A faturar", resumo && resumo.faturar),
        card("concluidasMes", "Concluídas no mês", resumo && resumo.concluidasMes)),

      resumo && resumo.hoje.length ? h("div", { className: "bloco os-hoje-bloco", style: { marginBottom: 16 } },
        h("button", { type: "button", className: "os-hoje-cab", onClick: () => setVerHoje(!verHoje), "aria-expanded": verHoje },
          h("span", { className: "os-hoje-ic" + (resumo.hoje.some(o => o.atrasada && o.dataPrev < hojeISO()) ? " atrasada" : "") }, "!"),
          h("span", { className: "os-hoje-res" }, h("b", null, "Hoje e atrasadas"),
            h("span", null, resumo.hoje.length + " OS prevista(s) até hoje" + (() => { const n = resumo.hoje.filter(o => o.atrasada && o.dataPrev < hojeISO()).length; return n ? " · " + n + " atrasada(s)" : ""; })())),
          h("span", { className: "link-bt" }, verHoje ? "Recolher ▴" : "Ver ▾")),
        verHoje ? h("div", { className: "os-hoje" }, resumo.hoje.map(o => h("button", { key: o.id, type: "button", className: "os-hoje-item", onClick: () => setAberta(o.id) },
          h("span", { className: "os-hoje-data" + (o.atrasada && o.dataPrev < hojeISO() ? " atrasada" : "") }, o.dataPrev === hojeISO() ? (o.horaPrev || "hoje") : dataBR(o.dataPrev)),
          h("span", { className: "os-hoje-txt" }, h("b", null, "OS " + o.numero), " · " + o.clienteNome, o.equipTag ? h("span", { className: "os-hoje-eq" }, " · " + rotuloEq(o)) : null, o.tecnicos.length ? h("span", { className: "cel-sub" }, " · " + o.tecnicos.map(t => t.nome).join(", ")) : null),
          o.atrasada && o.dataPrev < hojeISO() ? h("span", { className: "selo os-rosa" }, "⚠ Atrasada") : null,
          h(SeloOS, { status: o.status })))) : null) : null,

      /* v1.39.0: visitas de PMOC do mês destinadas à pessoa, com endereço e "Abrir mapa" */
      resumo && (resumo.meuPmoc || []).length ? h("div", { className: "bloco os-pmoc-bloco", style: { marginBottom: 16 } },
        h("div", { className: "bloco-cab" }, h("div", null, h("h2", null, "Meu PMOC do mês"), h("p", null, "Visitas de PMOC destinadas a você neste mês."))),
        h("div", { className: "os-pmoc" }, resumo.meuPmoc.map(p => {
          const fim = p.equipamentos > 0 && p.feitas >= p.equipamentos;
          return h("div", { key: p.id, className: "os-pmoc-item" },
            h("button", { type: "button", className: "os-pmoc-txt", onClick: () => { K.pmocAbrirPlano = p.id; if (ir) ir("pmoc"); } },
              h("b", null, p.clienteNome),
              h("span", null, p.endereco || "Sem endereço no plano nem no cadastro do cliente"),
              h("small", null, p.feitas + "/" + p.equipamentos + " equipamento(s) apontado(s)")),
            h("span", { className: "selo " + (fim ? "os-verde" : "os-azul") }, fim ? "Feito" : "Pendente"),
            h(K.BotoesMapa, { endereco: p.endereco, pequeno: true }));
        }))) : null,

      h("div", { className: "barra" },
        h("input", { className: "entrada-texto busca", placeholder: "Buscar por nº da OS ou Casa de Oração", value: busca, onChange: e => setBusca(e.target.value), "aria-label": "Buscar OS" }),
        h("select", { className: "entrada-texto", value: grupo, onChange: e => setGrupo(e.target.value), "aria-label": "Filtrar" },
          h("option", { value: "abertas" }, "Em aberto"), h("option", { value: "" }, "Todas"),
          h("option", { value: "agendadas" }, "Agendadas"), h("option", { value: "execucao" }, "Em execução"), h("option", { value: "pendencia" }, "Com pendência"),
          h("option", { value: "faturar" }, "A faturar"), h("option", { value: "concluidasMes" }, "Concluídas no mês")),
        h("div", { className: "tf-seg os-vis", role: "group", "aria-label": "Visualização" },
          h("button", { type: "button", className: "seg" + (vis === "lista" ? " on" : ""), "aria-pressed": vis === "lista", onClick: () => setVis("lista") }, "Lista"),
          h("button", { type: "button", className: "seg" + (vis === "cartoes" ? " on" : ""), "aria-pressed": vis === "cartoes", onClick: () => setVis("cartoes") }, "Cartões")),
        h("div", { style: { flex: 1 } }),
        ehEscritorio ? h("button", { className: "bt bt-marca", onClick: () => setNova(true), disabled: !op }, "Nova OS") : null),

      lista.erro ? h("div", { className: "bloco vazio" }, h(Aviso, null, lista.erro), h("button", { className: "bt", onClick: carregar }, "Tentar de novo"))
      : !lista.dados ? h("div", { className: "bloco vazio" }, "Carregando…")
      : !itens.length ? h("div", { className: "bloco vazio" }, h("strong", null, "Nenhuma OS aqui."), ehEscritorio ? "Crie a primeira pelo botão Nova OS, a partir de um chamado aprovado." : "")
      : vis === "lista" ? h("div", { className: "bloco" }, h("div", { className: "tabela-caixa", style: { opacity: lista.carregando ? .6 : 1 } }, h("table", { className: "tabela os-tab" },
          h("thead", null, h("tr", null, h("th", null, "Nº"), h("th", null, "Casa de Oração"), h("th", null, "Serviço"), h("th", null, "Previsão"), h("th", null, "Equipe"), h("th", null, "Progresso"), h("th", null, "Status"))),
          h("tbody", null, itens.map(o => {
            const eq = (o.tecnicos || []).length ? o.tecnicos : (o.executores || []);
            return h("tr", { key: o.id, className: "os-lin", onClick: () => setAberta(o.id), tabIndex: 0, onKeyDown: e => { if (e.key === "Enter") setAberta(o.id); } },
              h("td", { className: "os-n" }, h("b", null, o.numero)),
              h("td", null, h("div", { className: "cel-titulo" }, o.clienteNome), o.equipTag ? h("div", { className: "cel-sub os-eq-tag" }, "❄ " + rotuloEq(o)) : null),
              h("td", null, h("div", null, o.tipoServico || "—"), o.pendenciasAbertas ? h("span", { className: "selo os-rosa" }, o.pendenciasAbertas + " pendência(s)") : null),
              h("td", { className: o.atrasada ? "os-atr" : "" }, (o.atrasada ? "⚠ " : "") + (o.dataPrev ? dataBR(o.dataPrev) : "sem data"), o.horaPrev ? h("div", { className: "cel-sub" }, o.horaPrev) : null),
              h("td", null, eq.length ? h("span", { className: "os-equipe", title: eq.map(t => t.nome).join(", ") },
                  h("span", { className: "tf-resp-avs" }, eq.slice(0, 3).map(t => h(K.Avatar, { key: t.id || t.nome, usuario: t, tam: 30, classe: "tf-resp-av" }))),
                  h("span", { className: "cel-sub" }, eq.length === 1 ? String(eq[0].nome || "").split(" ")[0] : String(eq[0].nome || "").split(" ")[0] + " +" + (eq.length - 1)))
                : h("span", { className: "cel-sub" }, "sem técnico")),
              h("td", null, h("div", { className: "os-prog" }, h(Barra, { o }), h("span", { className: "cel-sub" }, o.etapasFeitas + "/" + o.etapasTotal))),
              h("td", null, h(SeloOS, { status: o.status })));
          })))))
      : h("div", { className: "os-cards", style: { opacity: lista.carregando ? .6 : 1 } }, itens.map(o => h("button", { key: o.id, type: "button", className: "os-card", onClick: () => setAberta(o.id) },
          h("div", { className: "os-card-topo" }, h("b", null, "OS " + o.numero), h(SeloOS, { status: o.status })),
          h("div", { className: "os-card-cli" }, o.clienteNome),
          o.equipTag ? h("div", { className: "os-card-eq" }, "❄ " + rotuloEq(o)) : null,
          h("div", { className: "cel-sub" }, o.tipoServico || "—"),
          h("div", { className: "os-card-linha" },
            h("span", { className: o.atrasada ? "atrasada" : "" }, (o.atrasada ? "⚠ " : "") + (o.dataPrev ? dataBR(o.dataPrev) + (o.horaPrev ? " " + o.horaPrev : "") : "sem data")),
            o.pendenciasAbertas ? h("span", { className: "selo os-rosa" }, o.pendenciasAbertas + " pendência(s)") : null),
          h("div", { className: "os-card-linha" }, h(Barra, { o }), h("span", { className: "cel-sub" }, o.etapasFeitas + "/" + o.etapasTotal)),
          (() => { const eq = (o.tecnicos || []).length ? o.tecnicos : (o.executores || []);
            return eq.length ? h("div", { className: "os-equipe" }, h("span", { className: "tf-resp-avs" }, eq.slice(0, 3).map(t => h(K.Avatar, { key: t.id || t.nome, usuario: t, tam: 26, classe: "tf-resp-av" }))),
              h("span", { className: "cel-sub" }, equipeDe(o))) : h("div", { className: "cel-sub" }, "sem técnico"); })()))),

      nova && op ? h(NovaOS, { op, aoFechar: () => setNova(false), aoCriar: o => { setNova(false); atualizar(); setAberta(o.id); } }) : null,
      aberta && op ? h(DetalheOS, { id: aberta, op, sessao, aoFechar: () => { setAberta(null); atualizar(); } }) : null);
  }

  /* =================================================================
     NOVA OS (a partir de um chamado)
     ================================================================= */
  function EscolheChamado({ valor, aoEscolher }) {
    const [texto, setTexto] = useState("");
    const [itens, setItens] = useState([]);
    const [aberto, setAberto] = useState(!valor);
    const pedido = useRef(0);
    useEffect(() => {
      if (!aberto) return;
      const n = ++pedido.current;
      const t = setTimeout(() => api("chamados.listar", { busca: texto.trim(), categoria: "ganho" })
        .then(d => { if (n === pedido.current) setItens(d.itens.slice(0, 10)); }, () => {}), 250);
      return () => clearTimeout(t);
    }, [texto, aberto]);
    if (valor && !aberto) return h("div", { className: "escolhido" },
      h("span", null, h("b", null, "Chamado " + valor.numero), " · " + valor.clienteNome + (valor.tipoServico ? " · " + valor.tipoServico : "")),
      h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => { setTexto(""); setAberto(true); } }, "Trocar"));
    return h("div", { className: "escolhe" },
      h("input", { className: "entrada-texto", autoFocus: true, placeholder: "Nº do chamado ou nome da Casa de Oração", value: texto, onChange: e => setTexto(e.target.value), onFocus: () => setAberto(true) }),
      aberto ? h("div", { className: "escolhe-lista" },
        itens.length ? itens.map(c => h("button", { type: "button", key: c.id, onClick: () => { aoEscolher(c); setAberto(false); } },
          h("b", null, c.numero + " · " + c.clienteNome), h("span", null, (c.tipoServico || "—") + " · " + c.status)))
        : h("div", { className: "cel-sub", style: { padding: 10 } }, texto.trim() ? "Nenhum chamado ganho encontrado." : "Carregando chamados aprovados…")) : null);
  }

  /* endereço do serviço: o do cadastro do cliente ou outro (ex.: arquiteto com várias obras).
     "do cliente" grava vazio: a OS acompanha o cadastro do cliente. */
  function CampoEndereco({ f, mudar, endCliente }) {
    if (endCliente == null) return h(Campo, { rotulo: "Endereço do serviço" }, h(Texto, { valor: f.endereco, aoMudar: mudar("endereco") }));
    const outro = !f.usarCliente;
    return h("div", { className: "campo" }, h("span", null, "Endereço do serviço"),
      h("div", { className: "chips", style: { marginBottom: 8 } },
        h("button", { type: "button", className: "chip" + (!outro ? " ativo" : ""), "aria-pressed": !outro, onClick: () => mudar("usarCliente")(true) }, (!outro ? "✓ " : "") + "Endereço da Casa de Oração"),
        h("button", { type: "button", className: "chip" + (outro ? " ativo" : ""), "aria-pressed": outro, onClick: () => mudar("usarCliente")(false) }, (outro ? "✓ " : "") + "Outro endereço")),
      outro ? h(Texto, { valor: f.endereco, aoMudar: mudar("endereco"), placeholder: "Rua, número, bairro, cidade" })
            : h("div", { className: "os-end-cli" }, endCliente || "O cliente não tem endereço no cadastro. Escolha \"Outro endereço\"."));
  }
  /* o que vai para o servidor: vazio quando é o endereço do cliente */
  function dadosCabecalho(f, endCliente) {
    const r = Object.assign({}, f); delete r.usarCliente;
    if (endCliente != null && f.usarCliente) r.endereco = "";
    return r;
  }
  function validaEndereco(f, endCliente) {
    if (endCliente != null && !f.usarCliente && !String(f.endereco || "").trim()) return "Informe o outro endereço ou marque o endereço da Casa de Oração.";
    return "";
  }

  function CamposCabecalho({ f, mudar, op, endCliente, descricao, semChamado }) {
    return h(React.Fragment, null,
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Início previsto" }, h(Texto, { valor: f.dataPrev, aoMudar: mudar("dataPrev"), type: "date" })),
        h(Campo, { rotulo: "Hora" }, h(Texto, { valor: f.horaPrev, aoMudar: mudar("horaPrev"), type: "time" })),
        h(Campo, { rotulo: "Prazo de término" }, h(Texto, { valor: f.prazo, aoMudar: mudar("prazo"), type: "date" })),
        h(Campo, { rotulo: "Prioridade" }, h("select", { value: f.prioridade, onChange: e => mudar("prioridade")(e.target.value) },
          op.prioridades.map(p => h("option", { key: p, value: p }, PRIO[p] || p))))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Contato no local" }, h(Texto, { valor: f.contato, aoMudar: mudar("contato") })),
        h(Campo, { rotulo: "Telefone" }, h(Texto, { valor: f.telefone, aoMudar: mudar("telefone"), inputMode: "tel" })),
        h(Campo, { rotulo: "Responsável" }, h("select", { value: f.responsavelId || "", onChange: e => mudar("responsavelId")(e.target.value ? Number(e.target.value) : null) },
          h("option", { value: "" }, "—"), op.equipe.map(u => h("option", { key: u.id, value: u.id }, u.nome))))),
      h(CampoEndereco, { f, mudar, endCliente }),
      h("div", { className: "campo" }, h("span", null, "Técnicos escalados"),
        h("div", { className: "chips" }, op.equipe.map(u => {
          const on = f.tecnicos.indexOf(u.id) >= 0;
          return h("button", { type: "button", key: u.id, className: "chip" + (on ? " ativo" : ""), "aria-pressed": on,
            onClick: () => mudar("tecnicos")(on ? f.tecnicos.filter(x => x !== u.id) : f.tecnicos.concat([u.id])) }, (on ? "✓ " : "") + u.nome);
        }))),
      /* v1.27.4: o que foi acordado com o cliente (descrição do serviço do chamado) fica à vista, antes das orientações */
      descricao != null ? h("div", { className: "campo" }, h("span", null, "Descrição do serviço (vem do chamado)"),
        h("div", { className: "os-desc" }, descricao.trim() ? descricao : "O chamado não tem descrição do serviço."),
        h("small", null, "Vem do chamado e sai no relatório. Para mudar, altere o chamado.")) : null,
      semChamado ? h(Campo, { rotulo: "Descrição do serviço", dica: "OS sem chamado: este texto sai no relatório." }, h("textarea", { value: f.orientacoes || "", onChange: e => mudar("orientacoes")(e.target.value) }))
        : h(Campo, { rotulo: "Orientações para a equipe", dica: "Uso interno da equipe: não sai no relatório." }, h("textarea", { value: f.orientacoes || "", onChange: e => mudar("orientacoes")(e.target.value) })));
  }

  function NovaOS({ op, chamado, aoFechar, aoCriar }) {
    const [ch, setCh] = useState(null);
    const [chDesc, setChDesc] = useState(null);   /* v1.27.4 */
    const [f, setF] = useState({ dataPrev: "", horaPrev: "", prazo: "", prioridade: "normal", contato: "", telefone: "", endereco: "", usarCliente: true, responsavelId: null, tecnicos: [], orientacoes: "" });
    const [endCliente, setEndCliente] = useState(null);
    const [tarefas, setTarefas] = useState([]);
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(p => Object.assign({}, p, { [k]: v }));

    async function escolher(c) {
      setCh(c);
      let cli = null, maquinas = 0;
      try { cli = await api("clientes.obter", { id: c.clienteId }); } catch (e) {}
      try { const full = await api("chamados.obter", { id: c.id }); setChDesc(full.necessidade || ""); (full.orcamento && full.orcamento.maquinas || []).forEach(m => { maquinas += Number(m.qtd) || 1; }); } catch (e) {}
      const ec = cli ? (cli.endereco || "") : null;
      setEndCliente(ec);
      setF(p => Object.assign({}, p, { contato: c.comQuemFalar || (cli && cli.contato) || "", telefone: (cli && cli.telefone) || "", endereco: "", usarCliente: ec == null || !!ec }));
      const modelo = modeloDoTipo(c.tipoServico, op.checklists);
      const n = Math.max(1, Math.min(maquinas, 30));
      setTarefas(Array.from({ length: n }, (_, i) => ({ nome: n > 1 || maquinas ? "Máquina " + (i + 1) : (c.tipoServico || "Serviço"), modelo, itens: itensDoModelo(modelo, op.checklists) })));
    }
    useEffect(() => { if (chamado) escolher(chamado); }, []); // eslint-disable-line
    const mudaTarefa = (i, k, v) => setTarefas(l => l.map((t, j) => j !== i ? t : Object.assign({}, t, { [k]: v }, k === "modelo" ? { itens: itensDoModelo(v, op.checklists) } : {})));

    async function criar() {
      setErro("");
      if (!ch) return setErro("Escolha o chamado.");
      const errEnd = validaEndereco(f, endCliente); if (errEnd) return setErro(errEnd);
      const etapas = [];
      tarefas.forEach(t => {
        const g = (t.nome || "").trim() || "Serviço";
        const itens = t.itens.filter(x => x.trim());
        if (!itens.length) etapas.push({ grupo: g, nome: "Executar serviço" });
        itens.forEach(x => etapas.push({ grupo: g, nome: x.trim() }));
      });
      setEnviando(true);
      try { const o = await api("os.criar", Object.assign({ chamadoId: ch.id, tipoServico: ch.tipoServico, etapas }, dadosCabecalho(f, endCliente))); K.avisar("OS " + o.numero + " criada."); aoCriar(o); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }

    return h(Painel, { titulo: "Nova OS", sub: "A OS recebe o número do chamado.", largo: true, aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: criar, disabled: enviando || !ch }, enviando ? "Criando…" : "Criar OS")] },
      h(Aviso, null, erro),
      chamado ? h("div", { className: "escolhido" }, h("span", null, h("b", null, "Chamado " + chamado.numero), " · " + chamado.clienteNome + (chamado.tipoServico ? " · " + chamado.tipoServico : "")))
        : h("div", { className: "campo" }, h("span", null, "Chamado aprovado"), h(EscolheChamado, { valor: ch, aoEscolher: escolher })),
      ch ? h(React.Fragment, null,
        h(CamposCabecalho, { f, mudar, op, endCliente, descricao: chDesc }),
        h("div", { className: "secao-titulo" }, "Tarefas e etapas"),
        h("p", { className: "cel-sub", style: { marginTop: -6 } }, "Cada tarefa recebe as etapas do checklist escolhido. Dá para ajustar o texto de cada etapa (uma por linha)."),
        tarefas.map((t, i) => h("div", { key: i, className: "os-tarefa-edit" },
          h("div", { className: "linha-campos" },
            h(Campo, { rotulo: "Tarefa" }, h(Texto, { valor: t.nome, aoMudar: v => mudaTarefa(i, "nome", v) })),
            h(Campo, { rotulo: "Checklist" }, h("select", { value: t.modelo, onChange: e => mudaTarefa(i, "modelo", e.target.value) }, op.checklists.map(m => h("option", { key: m.nome, value: m.nome }, m.nome))))),
          h(Campo, { rotulo: "Etapas (" + t.itens.filter(x => x.trim()).length + ")" }, h("textarea", { rows: Math.max(3, t.itens.length + 1), value: t.itens.join("\n"), onChange: e => mudaTarefa(i, "itens", e.target.value.split("\n")) })),
          h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo", onClick: () => setTarefas(l => l.filter((_, j) => j !== i)) }, "Remover tarefa"))),
        h("button", { type: "button", className: "bt bt-p", onClick: () => { const m = tarefas.length ? tarefas[tarefas.length - 1].modelo : modeloDoTipo(ch.tipoServico, op.checklists); setTarefas(l => l.concat([{ nome: "Máquina " + (l.length + 1), modelo: m, itens: itensDoModelo(m, op.checklists) }])); } }, "+ Tarefa")) : null);
  }

  /* =================================================================
     CAMPO (v1.6.0): fotos, zoom, assinatura e relatório
     ================================================================= */
  /* reduz a foto no aparelho antes de enviar (máx. 1600 px, JPEG) */
  function comprimir(arquivo) {
    return new Promise(resolve => {
      if (!/^image\//.test(arquivo.type) || arquivo.type === "image/gif") return resolve(arquivo);
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const max = 1600, esc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => resolve(b && b.size < arquivo.size ? b : arquivo), "image/jpeg", 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(arquivo); };
      img.src = url;
    });
  }

  /* dois botões: Câmera (abre a câmera traseira direto, uma foto) e Galeria (várias de uma vez).
     No Android, escolher várias faz o Chrome abrir só a galeria; por isso a câmera tem botão próprio. */
  function BotaoFoto({ osId, etapaId, aoEnviar }) {
    const [enviando, setEnviando] = useState(0);
    async function escolher(e) {
      const arqs = Array.from(e.target.files || []); e.target.value = "";
      if (!arqs.length) return;
      setEnviando(arqs.length);
      let ultimo = null;
      for (const a of arqs) {
        try { const b = await comprimir(a); ultimo = await K.enviarArquivo("os.foto.enviar", b, Object.assign({ osId }, etapaId ? { etapaId } : {})); }
        catch (x) { K.avisar(x.message, true); }
        setEnviando(n => n - 1);
      }
      if (ultimo) { aoEnviar(ultimo); K.avisar(arqs.length > 1 ? arqs.length + " fotos enviadas." : "Foto enviada."); }
    }
    if (enviando) return h("span", { className: "os-foto-bts" }, h("span", { className: "bt bt-p disabled" }, "Enviando " + enviando + "…"));
    return h("span", { className: "os-foto-bts" },
      h("label", { className: "bt bt-p", title: "Tirar foto com a câmera" }, "📷 Câmera",
        h("input", { type: "file", accept: "image/*", capture: "environment", onChange: escolher, style: { display: "none" } })),
      h("label", { className: "bt bt-p", title: "Escolher fotos da galeria" }, "🖼 Galeria",
        h("input", { type: "file", accept: "image/*", multiple: true, onChange: escolher, style: { display: "none" } })));
  }

  function Miniaturas({ fotos, aoAbrir }) {
    if (!fotos.length) return null;
    return h("div", { className: "os-fotos" }, fotos.map(f => h("button", { key: f.id, type: "button", className: "os-foto", onClick: () => aoAbrir(f), title: f.legenda || "Abrir foto" },
      h("img", { src: K.urlAnexo(f.id), alt: f.legenda || "Foto", loading: "lazy" }))));
  }

  /* foto em tela cheia com zoom: botões, roda do mouse, duplo toque e pinça */
  function VerFoto({ foto, fotos, podeApagar, aoApagar, aoFechar }) {
    const [i, setI] = useState(Math.max(0, fotos.findIndex(f => f.id === foto.id)));
    const [zoom, setZoom] = useState(1);
    const caixa = useRef(null);
    const pinca = useRef(null);
    const f = fotos[i] || foto;
    useEffect(() => { setZoom(1); }, [i]);
    useEffect(() => {
      const t = e => { if (e.key === "Escape") aoFechar(); if (e.key === "ArrowRight") setI(x => Math.min(fotos.length - 1, x + 1)); if (e.key === "ArrowLeft") setI(x => Math.max(0, x - 1)); };
      document.addEventListener("keydown", t); return () => document.removeEventListener("keydown", t);
    }, [fotos.length]); // eslint-disable-line
    const z = v => setZoom(Math.max(1, Math.min(5, Math.round(v * 100) / 100)));
    const dist = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
    return h("div", { className: "visor", role: "dialog", "aria-modal": true, "aria-label": "Foto" },
      h("div", { className: "visor-topo" },
        h("span", null, (i + 1) + " de " + fotos.length + (f.legenda ? " · " + f.legenda : "") + (f.autor ? " · " + f.autor : "")),
        h("div", { style: { display: "flex", gap: 6 } },
          h("button", { type: "button", className: "bt bt-p", onClick: () => z(zoom - 0.5), "aria-label": "Diminuir" }, "−"),
          h("button", { type: "button", className: "bt bt-p", onClick: () => z(1) }, Math.round(zoom * 100) + "%"),
          h("button", { type: "button", className: "bt bt-p", onClick: () => z(zoom + 0.5), "aria-label": "Aumentar" }, "+"),
          h("a", { className: "bt bt-p", href: K.urlAnexo(f.id), target: "_blank", rel: "noopener" }, "Original"),
          podeApagar(f) ? h("button", { type: "button", className: "bt bt-p bt-perigo", onClick: () => aoApagar(f) }, "Apagar") : null,
          h("button", { type: "button", className: "bt bt-p", onClick: aoFechar, "aria-label": "Fechar" }, "✕"))),
      h("div", { className: "visor-corpo", ref: caixa,
        onWheel: e => { e.preventDefault(); z(zoom * (e.deltaY < 0 ? 1.15 : 0.87)); },
        onDoubleClick: () => z(zoom > 1 ? 1 : 2.5),
        onTouchStart: e => { if (e.touches.length === 2) pinca.current = { d: dist(e.touches), z: zoom }; },
        onTouchMove: e => { if (e.touches.length === 2 && pinca.current) { e.preventDefault(); z(pinca.current.z * dist(e.touches) / pinca.current.d); } },
        onTouchEnd: () => { pinca.current = null; } },
        h("img", { src: K.urlAnexo(f.id), alt: f.legenda || "Foto", style: zoom > 1 ? { width: (zoom * 100) + "%", maxWidth: "none", maxHeight: "none" } : null })),
      fotos.length > 1 ? h("div", { className: "visor-nav" },
        h("button", { type: "button", className: "bt", disabled: i === 0, onClick: () => setI(i - 1) }, "‹ Anterior"),
        h("button", { type: "button", className: "bt", disabled: i >= fotos.length - 1, onClick: () => setI(i + 1) }, "Próxima ›")) : null);
  }

  /* quadro de assinatura com o dedo ou mouse */
  function QuadroAssinatura({ aoMudar }) {
    const cv = useRef(null);
    const desenhando = useRef(false);
    const vazio = useRef(true);
    useEffect(() => {
      const c = cv.current, r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr; c.height = r.height * dpr;
      const x = c.getContext("2d"); x.scale(dpr, dpr); x.lineWidth = 2.2; x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#111";
    }, []);
    const pt = e => { const r = cv.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function inicio(e) { e.preventDefault(); cv.current.setPointerCapture(e.pointerId); desenhando.current = true; const [x, y] = pt(e); const g = cv.current.getContext("2d"); g.beginPath(); g.moveTo(x, y); }
    function move(e) { if (!desenhando.current) return; const [x, y] = pt(e); const g = cv.current.getContext("2d"); g.lineTo(x, y); g.stroke(); if (vazio.current) { vazio.current = false; aoMudar(cv.current); } }
    function fim() { desenhando.current = false; }
    function limpar() { const c = cv.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); vazio.current = true; aoMudar(null); }
    return h("div", { className: "assinar" },
      h("canvas", { ref: cv, className: "assinar-quadro", onPointerDown: inicio, onPointerMove: move, onPointerUp: fim, onPointerLeave: fim, "aria-label": "Assine aqui" }),
      h("div", { className: "assinar-pe" }, h("span", { className: "cel-sub" }, "Assine com o dedo ou o mouse"), h("button", { type: "button", className: "bt bt-leve bt-p", onClick: limpar }, "Limpar")));
  }

  function BlocoAssinatura({ o, quem, sessao, aoSalvar }) {
    const atual = o.assinaturas[quem];
    const [nome, setNome] = useState(quem === "tecnico" ? sessao.usuario.nome : (o.contato || ""));
    const [cargo, setCargo] = useState("");
    const [canvas, setCanvas] = useState(null);
    const [refazer, setRefazer] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const titulo = quem === "tecnico" ? "Assinatura do técnico" : "Assinatura do responsável no local";
    if (atual && !refazer) return h("div", { className: "assinatura-feita" },
      h("div", { className: "cel-sub" }, titulo),
      h("img", { src: K.urlAnexo(atual.anexoId), alt: "Assinatura" }),
      h("div", null, h("b", null, atual.nome), atual.cargo ? " · " + atual.cargo : "", h("span", { className: "cel-sub" }, " · " + K.dataHora(atual.em))),
      o.status !== "Concluída" ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setRefazer(true) }, "Refazer") : null);
    async function salvar() {
      if (!canvas) return K.avisar("Falta assinar no quadro.", true);
      if (!nome.trim()) return K.avisar("Informe o nome.", true);
      setEnviando(true);
      try {
        const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
        const r = await K.enviarArquivo("os.assinatura.enviar", blob, { osId: o.id, quem, nome: nome.trim(), cargo: cargo.trim() });
        K.avisar("Assinatura registrada."); setRefazer(false); aoSalvar(r);
      } catch (x) { K.avisar(x.message, true); }
      setEnviando(false);
    }
    return h("div", { className: "assinatura-nova" },
      h("div", { className: "cel-sub" }, titulo),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Nome" }, h(Texto, { valor: nome, aoMudar: setNome })),
        quem === "cliente" ? h(Campo, { rotulo: "Cargo / função" }, h(Texto, { valor: cargo, aoMudar: setCargo })) : null),
      h(QuadroAssinatura, { aoMudar: setCanvas }),
      h("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
        refazer ? h("button", { type: "button", className: "bt bt-p", onClick: () => setRefazer(false) }, "Cancelar") : null,
        h("button", { type: "button", className: "bt bt-p bt-marca", disabled: enviando || !canvas, onClick: salvar }, enviando ? "Salvando…" : "Salvar assinatura")));
  }

  function Conferencia({ o, sessao, aoSalvar }) {
    const [conc, setConc] = useState(o.conclusao || "");
    const [ausente, setAusente] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const naoFeitas = o.etapasTotal - o.etapasFeitas;
    async function finalizar() {
      if (naoFeitas > 0 && !(await K.confirmar({ titulo: "Ainda há " + naoFeitas + " etapa(s) sem concluir", texto: "Finalizar mesmo assim? O escritório verá o que ficou para trás.", botao: "Finalizar" }))) return;
      setEnviando(true);
      try { const r = await api("os.finalizar", { osId: o.id, conclusao: conc, semCliente: ausente }); K.avisar("Serviço finalizado."); aoSalvar(r); }
      catch (x) { K.avisar(x.message, true); }
      setEnviando(false);
    }
    return h("div", { className: "os-conferencia" },
      h("div", { className: "os-conf-resumo" },
        h("div", null, h("b", null, o.etapasFeitas + "/" + o.etapasTotal), h("span", null, "etapas")),
        h("div", null, h("b", null, o.fotos.length), h("span", null, "fotos")),
        h("div", null, h("b", { className: o.pendenciasAbertas ? "atrasada" : "" }, o.pendenciasAbertas), h("span", null, "pendências")),
        h("div", null, h("b", null, o.materiais.length), h("span", null, "materiais"))),
      h(Campo, { rotulo: "Conclusão do serviço (obrigatória)", dica: "O que foi feito, como ficou, recomendações à Casa de Oração." },
        h("textarea", { rows: 4, value: conc, onChange: e => setConc(e.target.value) })),
      h("div", { className: "os-assinaturas" },
        h(BlocoAssinatura, { o, quem: "tecnico", sessao, aoSalvar }),
        h(BlocoAssinatura, { o, quem: "cliente", sessao, aoSalvar })),
      !o.assinaturas.cliente ? h("label", { className: "check" }, h("input", { type: "checkbox", checked: ausente, onChange: e => setAusente(e.target.checked) }), "Responsável da casa ausente (finalizar sem a assinatura)") : null,
      o.finalizadoEm ? h(Aviso, { tipo: "ok" }, "Serviço finalizado em " + K.dataHora(o.finalizadoEm) + ". " + (o.status === "Serviço finalizado" ? "Aguardando o escritório faturar e concluir." : "")) : null,
      h("div", { style: { display: "flex", justifyContent: "flex-end" } },
        h("button", { type: "button", className: "bt bt-marca", disabled: enviando || !conc.trim() || o.status === "Concluída" || o.status === "Cancelada", onClick: finalizar },
          enviando ? "Finalizando…" : o.finalizadoEm ? "Atualizar conclusão" : "Finalizar serviço")));
  }

  /* relatório da OS (modelo da OS #540) — abre para imprimir/salvar em PDF */
  /* v1.19.0: o HTML do relatório sai de uma função só — abs(id) diz como cada foto entra
     (endereço do sistema para imprimir; __ANEXO_id__ para o link público do WhatsApp) */
  async function montarRelatorio(o, sessao, abs) {
    let c = {};
    try { c = (await api("config.ler")).config || {}; } catch (e) { /* técnico não lê config: usa os dados da sessão */ }
    const e = sessao.empresa || {};
    const emp = Object.assign({ nome: e.nome, razao_social: e.razaoSocial, cnpj: e.cnpj }, c.empresa || {});
    const cor = /^#[0-9a-f]{6}$/i.test(e.corPrimaria || "") ? e.corPrimaria : "#111111";
    const es = s => String(s == null ? "" : s).replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
    const br = s => es(s).replace(/\n/g, "<br>");
    const hora = s => s ? String(s).slice(11, 16) : "";
    const tarefas = tarefasDe(o.etapas);
    const fotosDe = ids => o.fotos.filter(f => ids.indexOf(f.etapaId) >= 0);
    const gradeFotos = l => l.length ? '<div class="fotos">' + l.map(f => '<figure><img src="' + abs(f.id) + '">' + (f.legenda ? "<figcaption>" + es(f.legenda) + "</figcaption>" : "") + "</figure>").join("") + "</div>" : "";
    const stTxt = { pendente: "Pendente", execucao: "Em execução", concluida: "OK", na: "N/A", problema: "Não OK", naofeito: "NF" };
    /* v1.27.2: a descrição do relatório é a do chamado (a que foi ao cliente); "Orientações para a equipe" é interna e não sai.
       OS sem chamado (contrato/PMOC) usa a descrição da própria OS. */
    const descricao = o.chamadoId ? (o.chamadoDescricao || "") : (o.orientacoes || "");
    const dataServ = o.inicioReal ? K.dataHora(o.inicioReal).slice(0, 10) : dataBR(o.dataPrev);
    const horario = o.inicioReal ? hora(o.inicioReal) + (o.terminoReal ? " – " + hora(o.terminoReal) : "") : (o.horaPrev || "—");
    const ass = (a, rot) => '<div class="ass">' + (a ? '<img src="' + abs(a.anexoId) + '">' : '<div class="ass-vazia"></div>') + '<div class="ass-linha"></div><b>' + es(a ? a.nome : "") + "</b>" + (a && a.cargo ? "<br>" + es(a.cargo) : "") + "<br><span>" + rot + "</span></div>";
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>OS ' + es(o.numero) + " - " + es(o.clienteNome) + "</title><style>" +
      "@page{size:A4;margin:14mm 14mm}*{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}body{margin:0;color:#1a1d21;font-size:12.5px}" +
      "@media screen{body{max-width:960px;margin:0 auto;padding:36px 44px;background:#fff}}@media screen and (max-width:640px){body{padding:16px}}" +   /* v1.27.0: margem na tela do computador */
      ".top{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid " + cor + ";padding-bottom:12px}.top img{height:44px;max-width:170px;object-fit:contain}.bn{font-size:18px;font-weight:700;color:" + cor + "}" +
      ".co{text-align:right;font-size:10.5px;color:#4a5160;line-height:1.5}h1{font-size:16px;color:" + cor + ";margin:18px 0 10px}h2{font-size:13px;color:" + cor + ";margin:18px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}" +
      ".grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;background:#f4f6fb;border:1px solid #e5e5e5;border-radius:8px;padding:10px 14px}.grid div span{color:#6b7280}" +
      ".res{display:flex;gap:10px;margin:10px 0}.res div{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:8px;text-align:center}.res b{display:block;font-size:17px;color:" + cor + "}" +
      "table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eef1f6;text-align:left}th{background:#eef1f6;font-size:11.5px}td.r{text-align:right;white-space:nowrap}" +
      ".leg{font-size:11px;color:#4a5160;margin:0 0 6px}.tarefa{break-inside:avoid;margin-bottom:10px}.tarefa h3{font-size:12.5px;margin:10px 0 4px}" +
      ".fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:8px 0 12px}.fotos figure{margin:0;break-inside:avoid}.fotos img{width:100%;height:150px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb}figcaption{font-size:10.5px;color:#4a5160;margin-top:2px}" +
      ".txt{background:#f4f6fb;border:1px solid #e5e5e5;border-radius:8px;padding:10px 12px;line-height:1.5}.ev{margin-bottom:6px}.ev span{color:#6b7280;font-size:11px}" +
      ".assinaturas{display:flex;gap:40px;margin-top:26px;break-inside:avoid}.ass{flex:1;text-align:center;font-size:12px}.ass img{height:70px;max-width:100%;object-fit:contain}.ass-vazia{height:70px}.ass-linha{border-top:1px solid #1a1d21;margin:4px 0 6px}.ass span{color:#6b7280;font-size:11px}" +
      ".noprint{text-align:center;margin:18px 0}.noprint button{background:" + cor + ";color:#fff;border:0;border-radius:8px;padding:9px 18px;cursor:pointer}@media print{.noprint{display:none}}" +
      "</style></head><body>" +
      '<div class="top"><div style="display:flex;gap:12px;align-items:center">' + (e.logoId ? '<img src="' + abs(e.logoId) + '">' : "") + '<div class="bn">' + es(emp.nome || "") + '</div></div><div class="co">' +
        [emp.razao_social, emp.cnpj ? "CNPJ " + emp.cnpj : "", emp.endereco, [emp.telefone, emp.email].filter(Boolean).join(" · ")].filter(Boolean).map(es).join("<br>") + "</div></div>" +
      "<h1>Relatório de Ordem de Serviço Nº " + es(o.numero) + "</h1>" +
      '<div class="grid">' +
        "<div><span>Casa de Oração:</span> <b>" + es(o.clienteNome) + "</b></div><div><span>Data:</span> " + es(dataServ) + "</div>" +
        "<div><span>Local:</span> " + es(o.endereco || "—") + "</div><div><span>Horário:</span> " + es(horario) + "</div>" +
        "<div><span>Contato:</span> " + es(o.contato || "—") + "</div><div><span>Equipe:</span> " + es(equipeDe(o) || "—") + "</div>" +
        (o.equipamento ? '<div style="grid-column:1/-1"><span>Equipamento:</span> <b>' + es(o.equipamento.tag + (o.equipLocal ? " · " + o.equipLocal : "")) + "</b>" +
          es([o.equipamento.tipo, o.equipamento.marca, o.equipamento.modelo, o.equipamento.capacidadeBtu ? o.equipamento.capacidadeBtu + " BTU/h" : ""].filter(Boolean).map(x => " · " + x).join("")) + "</div>" : "") +
        "<div><span>Serviço:</span> " + es(o.tipoServico || "—") + "</div><div><span>Status:</span> " + es(o.status) + "</div></div>" +
      '<div class="res"><div><b>' + tarefas.length + "</b>tarefas</div><div><b>" + o.etapasFeitas + "/" + o.etapasTotal + "</b>etapas</div><div><b>" + o.fotos.length + "</b>fotos</div><div><b>" + o.pendenciasAbertas + "</b>pendências</div></div>" +
      (descricao.trim() ? "<h2>Descrição do serviço</h2><div class=\"txt\">" + br(descricao) + "</div>" : "") +
      "<h2>Serviços executados</h2>" +
      '<p class="leg"><b>OK</b> = conforme · <b>Não OK</b> = não conforme · <b>NF</b> = não feito · <b>N/A</b> = não se aplica</p>' +
      tarefas.map(t => '<div class="tarefa"><h3>' + es(t.nome) + "</h3><table><tbody>" + t.etapas.map(et => "<tr><td>" + es(et.nome) + '</td><td class="r">' + (stTxt[et.status] || et.status) + "</td></tr>").join("") + "</tbody></table>" +
        gradeFotos(fotosDe(t.etapas.map(et => et.id))) + "</div>").join("") +
      (separarFotos(o).gerais.length ? "<h2>Fotos gerais</h2>" + gradeFotos(separarFotos(o).gerais) : "") +
      (o.pendencias.length ? "<h2>Pendências</h2><table><tbody>" + o.pendencias.map(p => "<tr><td>" + es(p.descricao) + '</td><td class="r">' + (p.status === "resolvida" ? "Resolvida" : "Em aberto") + "</td></tr>").join("") + "</tbody></table>" : "") +
      (o.materiais.length ? "<h2>Materiais utilizados</h2><table><tbody>" + o.materiais.map(m => "<tr><td>" + es(m.material) + '</td><td class="r">' + es(String(m.quantidade).replace(".", ",") + " " + (m.unidade || "")) + "</td></tr>").join("") + "</tbody></table>" : "") +
      /* v1.18.4: diário de obra é interno — não sai no relatório (só a conclusão) */
      (o.conclusao ? "<h2>Conclusão</h2><div class=\"txt\">" + br(o.conclusao) + "</div>" : "") +
      '<div class="assinaturas">' + ass(o.assinaturas.tecnico, "Técnico responsável") + ass(o.assinaturas.cliente, "Responsável no local") + "</div>" +
      '<div class="noprint"><button onclick="window.print()">Imprimir / Salvar PDF</button></div></body></html>';
  }

  async function abrirRelatorio(o, sessao, janela) {
    const w = janela || window.open("", "_blank");
    if (!w) return K.avisar("Permita pop-ups para gerar o relatório.", true);
    w.document.write("<p style='font-family:sans-serif;padding:20px'>Montando o relatório…</p>");
    const html = await montarRelatorio(o, sessao, id => new URL(K.urlAnexo(id), location.href).href);
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
  }

  /* v1.19.0: relatório pelo WhatsApp — grava o relatório como está e abre a conversa com o link (pasta r/) */
  function linkZap(tel, texto) {
    let n = String(tel || "").replace(/\D/g, "");
    if (n.length === 10 || n.length === 11) n = "55" + n;
    return "https://wa.me/" + (n.length >= 12 ? n : "") + "?text=" + encodeURIComponent(texto);
  }
  async function enviarRelatorioWhats(osOuId, sessao, w) {
    if (w) w.document.write("<p style='font-family:sans-serif;padding:20px'>Preparando o relatório…</p>");
    try {
      const o = typeof osOuId === "object" ? osOuId : await api("os.obter", { id: osOuId });
      const html = await montarRelatorio(o, sessao, id => "__ANEXO_" + id + "__");
      const r = await api("os.link.enviar", { id: o.id, html, canal: "WhatsApp" });
      const emp = (sessao.empresa && sessao.empresa.nome) || "";
      const quem = String(r.contato || "").trim().split(/\s+/)[0];
      const msg = "Olá" + (quem ? ", " + quem : "") + "! Segue o relatório do serviço (OS " + o.numero + ")" + (emp ? " da " + emp : "") + ".\n" +
        "Por este link você vê as fotos, as etapas e pode salvar em PDF:\n" + r.link.url;
      const url = linkZap(r.telefone, msg);
      if (w) w.location.href = url; else location.href = url;
      K.avisar(r.telefone ? "Relatório pronto. Confira e toque em enviar no WhatsApp." : "Sem telefone na OS nem no cliente: escolha o contato no WhatsApp.");
      return r;
    } catch (x) { if (w) w.close(); K.avisar(x.message, true); return null; }
  }

  /* =================================================================
     DETALHE DA OS
     ================================================================= */
  function DetalheOS({ id, op, sessao, aoFechar }) {
    K.useReabrir("os", id);   /* v1.27.0: volta aberta se a página recarregar */
    const ehEscritorio = !K.soTecnico(sessao);   /* v1.22.0 */
    const [o, setO] = useState(null);
    const [erro, setErro] = useState("");
    const [editando, setEditando] = useState(false);
    const [diario, setDiario] = useState("");
    const [pend, setPend] = useState("");
    const [mat, setMat] = useState({ material: "", quantidade: "", unidade: "un" });
    const [ocupado, setOcupado] = useState(false);
    const [foto, setFoto] = useState(null);
    const [histEq, setHistEq] = useState(null);   /* v1.28.0 */

    useEffect(() => { api("os.obter", { id }).then(setO, e => setErro(e.message)); }, [id]);
    /* quando o que foi feito sem internet termina de subir, recarrega com a versão do servidor */
    useEffect(() => K.offline ? K.offline.aoSincronizar(() => api("os.obter", { id }).then(setO, () => {})) : undefined, [id]);
    const podeApagarFoto = f => ehEscritorio || f.autor === sessao.usuario.nome;
    async function apagarFoto(f) {
      if (!(await K.confirmar({ titulo: "Apagar esta foto?", botao: "Apagar", perigo: true }))) return;
      if (await acao("os.foto.excluir", { osId: o.id, id: f.id }, "Foto apagada.")) setFoto(null);
    }
    async function acao(nome, dados, ok) {
      setOcupado(true);
      try { const r = await api(nome, dados); setO(r); if (ok) K.avisar(ok); return true; }
      catch (x) { K.avisar(x.message, true); return false; }
      finally { setOcupado(false); }
    }
    async function excluir() {
      if (!(await K.confirmar({ titulo: "Excluir a OS " + o.numero + "?", texto: "As etapas, o diário e as pendências saem junto. O chamado continua.", botao: "Excluir", perigo: true }))) return;
      try { await api("os.excluir", { id: o.id }); K.avisar("OS excluída."); aoFechar(); } catch (x) { K.avisar(x.message, true); }
    }

    if (erro) return h(Painel, { titulo: "OS", aoFechar }, h(Aviso, null, erro));
    if (!o) return h(Painel, { titulo: "OS", aoFechar, largo: true }, h("div", { className: "vazio" }, "Carregando…"));

    const tarefas = tarefasDe(o.etapas);
    const statusPermitidos = ehEscritorio ? op.status : op.status.filter(s => s !== "Concluída" && s !== "Cancelada");

    return h(Painel, {
      titulo: "OS " + o.numero + " · " + o.clienteNome, largo: true, aoFechar,
      sub: (o.tipoServico || "—") + (o.chamadoNumero ? " · chamado " + o.chamadoNumero : ""),
      rodape: [ehEscritorio ? h("button", { key: "x", className: "bt bt-leve bt-perigo", onClick: excluir }, "Excluir OS") : null, h("div", { key: "esp", style: { flex: 1 } }),
               h("button", { key: "r", className: "bt", onClick: () => abrirRelatorio(o, sessao) }, "Relatório PDF"),
               ehEscritorio ? h("button", { key: "e", className: "bt", onClick: () => setEditando(true) }, "✎ Editar") : null,
               h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")],
    },
      /* cabeçalho */
      h("div", { className: "os-cab" },
        h("div", null,
          h("div", { className: "os-info" }, h("span", null, "Status"),
            h("select", { className: "status-rapido " + (STATUS_COR[o.status] || ""), value: o.status, disabled: ocupado, onChange: e => acao("os.mudar_status", { id: o.id, _antes: o.status, status: e.target.value }, "Status: " + e.target.value) },
              statusPermitidos.indexOf(o.status) < 0 ? h("option", { value: o.status }, o.status) : null,
              statusPermitidos.map(s => h("option", { key: s, value: s }, s)))),
          h("div", { className: "os-info" }, h("span", null, "Início previsto"), h("b", { className: o.atrasada ? "atrasada" : "" }, (o.atrasada ? "⚠ " : "") + dataBR(o.dataPrev) + (o.horaPrev ? " " + o.horaPrev : ""))),
          h("div", { className: "os-info" }, h("span", null, "Prazo de término"), h("b", null, dataBR(o.prazo))),
          h("div", { className: "os-info" }, h("span", null, "Prioridade"), h("b", null, PRIO[o.prioridade] || o.prioridade))),
        h("div", null,
          h("div", { className: "os-info" }, h("span", null, "Contato"), h("b", null, (o.contato || "—") + (o.telefone ? " · " + o.telefone : ""))),
          h("div", { className: "os-info" }, h("span", null, "Local"), h("b", null, o.endereco || "—")),
          o.cobrancaClienteNome ? h("div", { className: "os-info" }, h("span", null, "Cobrança"), h("b", null, o.cobrancaClienteNome + " (chamado " + o.chamadoNumero + ")")) : null,
          h("div", { className: "os-info" }, h("span", null, o.tecnicos.length || !(o.executores || []).length ? "Equipe" : "Executado por"), h("b", null, equipeDe(o) || "sem técnico")),
          h("div", { className: "os-info" }, h("span", null, "Responsável"), h("b", null, o.responsavelNome || "—")))),
      /* v1.28.0: equipamento ligado à OS, em destaque (é por ele que a OS aparece no histórico da máquina) */
      o.equipamento ? h("div", { className: "os-equip" },
        h("div", { className: "os-equip-ic" }, "❄"),
        h("div", { className: "os-equip-txt" },
          h("small", null, "Equipamento desta OS"),
          h("b", null, o.equipamento.tag + (o.equipLocal ? " · " + o.equipLocal : "")),
          h("span", null, [o.equipamento.tipo, o.equipamento.marca, o.equipamento.modelo, o.equipamento.capacidadeBtu ? o.equipamento.capacidadeBtu + " BTU/h" : ""].filter(Boolean).join(" · ") || "—")),
        K.PMOC && K.PMOC.HistoricoEquip ? h("button", { type: "button", className: "bt bt-p", onClick: () => setHistEq(o.equipamento.id) }, "Histórico da máquina") : null)
      : (o.tipo === "contrato" && ehEscritorio ? h("div", { className: "os-equip os-equip-vazio" },
          h("div", { className: "os-equip-txt" }, h("small", null, "Equipamento desta OS"), h("b", null, "Nenhum equipamento ligado"),
            h("span", null, "Sem equipamento a OS não aparece no histórico da máquina.")),
          h("button", { type: "button", className: "bt bt-p", onClick: () => setEditando(true) }, "Escolher")) : null),
      /* v1.18.2: editar à vista, no topo (antes só no rodapé) */
      ehEscritorio ? h("div", { className: "os-editar-barra" },
        h("button", { type: "button", className: "bt bt-marca", onClick: () => setEditando(true) }, "✎ Editar")) : null,
      (o.endereco || o.telefone) ? h("div", { className: "os-ir" },
        o.endereco ? h("a", { className: "bt bt-marca", href: urlMaps(o.endereco), target: "_blank", rel: "noopener" }, "📍 Abrir no Maps") : null,
        o.telefone ? h("a", { className: "bt", href: "tel:" + String(o.telefone).replace(/[^\d+]/g, "") }, "📞 Ligar") : null) : null,
      /* v1.27.4: primeiro o que foi acordado com o cliente (vai no relatório); abaixo as orientações internas (não vão) */
      o.chamadoId ? h("div", { className: "os-desc-bloco" },
        h("b", null, "Descrição do serviço"), h("small", null, " · do chamado " + o.chamadoNumero),
        h("div", { className: "os-desc" }, (o.chamadoDescricao || "").trim() ? o.chamadoDescricao : "O chamado não tem descrição do serviço.")) : null,
      o.chamadoId ? (o.orientacoes ? h("div", { className: "os-orient" }, h("b", null, "Orientações para a equipe: "), o.orientacoes, h("div", { className: "cel-sub" }, "Uso interno: não sai no relatório.")) : null)
        : (o.orientacoes ? h("div", { className: "os-desc-bloco" }, h("b", null, "Descrição do serviço"), h("div", { className: "os-desc" }, o.orientacoes)) : null),
      h("div", { className: "os-progresso" }, h(Barra, { o }), h("span", null, o.etapasFeitas + " de " + o.etapasTotal + " etapas (" + pct(o) + "%) · " + o.pendenciasAbertas + " pendência(s) aberta(s)")),

      /* tarefas */
      h("div", { className: "secao-titulo os-secao" }, h("span", null, "Tarefas"), ehEscritorio ? h("button", { type: "button", className: "bt bt-p", onClick: () => setEditando(true) }, "✎ Editar") : null),
      /* v1.27.2: legenda do checklist */
      tarefas.length ? h("div", { className: "os-legenda" },
        h("span", null, h("b", { className: "lg-ok" }, "OK"), " conforme"),
        h("span", null, h("b", { className: "lg-prob" }, "Não OK"), " não conforme"),
        h("span", null, h("b", { className: "lg-nf" }, "NF"), " não feito"),   /* v1.34.0: mesmo padrão do PMOC */
        h("span", null, h("b", { className: "lg-na" }, "N/A"), " não se aplica")) : null,
      !tarefas.length ? h("p", { className: "cel-sub" }, "Nenhuma tarefa. Use Editar tarefas.") :
      tarefas.map(t => {
        const feitas = t.etapas.filter(e => e.status === "concluida" || e.status === "na").length;
        return h("div", { key: t.nome, className: "os-tarefa" },
          h("div", { className: "os-tarefa-cab" }, h("b", null, t.nome), h("span", { className: "cel-sub" }, feitas + "/" + t.etapas.length)),
          t.etapas.map(e => {
            const marca = st => acao("os.etapa.status", { osId: o.id, id: e.id, _antes: e.status, status: e.status === st ? "pendente" : st });
            return h("div", { key: e.id, className: "os-etapa st-" + e.status },
              h("div", { className: "os-etapa-linha" },
                h("span", { className: "os-etapa-nome" }, e.nome),
                h("div", { className: "os-etapa-acoes" },
                  h("button", { type: "button", className: "seg" + (e.status === "concluida" ? " on ok" : ""), disabled: ocupado, onClick: () => marca("concluida"), title: "Concluída" }, "✓ OK"),
                  h("button", { type: "button", className: "seg" + (e.status === "problema" ? " on prob" : ""), disabled: ocupado, onClick: () => marca("problema"), title: "Não conforme" }, "Não OK"),
                  h("button", { type: "button", className: "seg" + (e.status === "naofeito" ? " on nf" : ""), disabled: ocupado, onClick: () => marca("naofeito"), title: "Não feito" }, "NF"),
                  h("button", { type: "button", className: "seg" + (e.status === "na" ? " on" : ""), disabled: ocupado, onClick: () => marca("na"), title: "Não se aplica" }, "N/A"))));
          }),
          /* fotos do bloco: ficam presas à 1ª etapa da tarefa; mostra também as fotos antigas de cada etapa */
          (() => {
            const ids = t.etapas.map(e => e.id);
            const fb = o.fotos.filter(f => ids.indexOf(f.etapaId) >= 0);
            return h("div", { className: "os-bloco-fotos" },
              h("div", { className: "os-bloco-fotos-cab" }, h("span", null, "Fotos de " + t.nome + (fb.length ? " (" + fb.length + ")" : "")),
                h(BotaoFoto, { osId: o.id, etapaId: ids[0], aoEnviar: setO })),
              h(Miniaturas, { fotos: fb, aoAbrir: setFoto }));
          })());
      }),

      /* fotos gerais */
      h("div", { className: "secao-titulo os-secao" }, h("span", null, "Fotos gerais (" + separarFotos(o).gerais.length + ")"), h(BotaoFoto, { osId: o.id, aoEnviar: setO })),
      h(Miniaturas, { fotos: separarFotos(o).gerais, aoAbrir: setFoto }),

      /* pendências */
      h("div", { className: "secao-titulo" }, "Pendências"),
      o.pendencias.length ? o.pendencias.map(p => h("div", { key: p.id, className: "os-linha" + (p.status === "resolvida" ? " feita" : "") },
        h("span", null, p.descricao, h("span", { className: "cel-sub" }, " · " + K.dataHora(p.criadoEm) + (p.resolvidaEm ? " · resolvida " + K.dataHora(p.resolvidaEm) : ""))),
        h("button", { type: "button", className: "bt bt-leve bt-p", disabled: ocupado, onClick: () => typeof p.id === "string" ? K.avisar("Esta pendência ainda está no aparelho. Resolva depois que sincronizar.", true) : acao("os.pendencia.resolver", { osId: o.id, id: p.id, reabrir: p.status === "resolvida" }) }, p.status === "resolvida" ? "Reabrir" : "Resolver")))
        : h("p", { className: "cel-sub" }, "Nenhuma pendência."),
      h("div", { className: "os-add" },
        h("input", { className: "entrada-texto", placeholder: "Nova pendência (ex.: falta suporte da condensadora)", value: pend, onChange: e => setPend(e.target.value) }),
        h("button", { type: "button", className: "bt bt-p", disabled: ocupado || !pend.trim(), onClick: async () => { if (await acao("os.pendencia.criar", { osId: o.id, descricao: pend }, "Pendência registrada.")) setPend(""); } }, "Adicionar")),

      /* materiais usados */
      h("div", { className: "secao-titulo" }, "Materiais usados"),
      o.materiais.length ? o.materiais.map(m => h("div", { key: m.id, className: "os-linha" },
        h("span", null, m.material + " · " + String(m.quantidade).replace(".", ",") + " " + (m.unidade || "")),
        h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo", disabled: ocupado, onClick: () => typeof m.id === "string" ? K.avisar("Este material ainda está no aparelho. Apague depois que sincronizar.", true) : acao("os.material.excluir", { osId: o.id, id: m.id }) }, "×")))
        : h("p", { className: "cel-sub" }, "Nenhum material lançado."),
      h("div", { className: "os-add" },
        h("input", { className: "entrada-texto", placeholder: "Material", value: mat.material, onChange: e => setMat(Object.assign({}, mat, { material: e.target.value })) }),
        h("input", { className: "entrada-texto curto", placeholder: "Qtd", inputMode: "decimal", value: mat.quantidade, onChange: e => setMat(Object.assign({}, mat, { quantidade: e.target.value })) }),
        h("input", { className: "entrada-texto curto", placeholder: "un", value: mat.unidade, onChange: e => setMat(Object.assign({}, mat, { unidade: e.target.value })) }),
        h("button", { type: "button", className: "bt bt-p", disabled: ocupado || !mat.material.trim(), onClick: async () => { if (await acao("os.material.criar", Object.assign({ osId: o.id }, mat))) setMat({ material: "", quantidade: "", unidade: "un" }); } }, "Adicionar")),

      /* diário */
      h("div", { className: "secao-titulo" }, "Diário"), h("p", { className: "cel-sub", style: { marginTop: -6 } }, "Uso interno: não sai no relatório. No relatório vai a conclusão do serviço."),
      h("div", { className: "os-add" },
        h("textarea", { className: "entrada-texto", rows: 2, placeholder: "Registro do dia (o que foi feito, o que encontrou…)", value: diario, onChange: e => setDiario(e.target.value) }),
        h("button", { type: "button", className: "bt bt-p", disabled: ocupado || !diario.trim(), onClick: async () => { if (await acao("os.evento.criar", { osId: o.id, texto: diario }, "Registrado no diário.")) setDiario(""); } }, "Registrar")),
      /* v1.27.2: só os registros do diário — o histórico automático (criou, mudou status, assinou…) fica gravado mas não aparece */
      h("div", { className: "os-eventos" }, o.eventos.filter(ev => ev.tipo === "diario").map(ev => h("div", { key: ev.id, className: "os-evento ev-" + ev.tipo },
        h("div", { className: "cel-sub" }, K.dataHora(ev.criadoEm) + (ev.usuarioNome ? " · " + ev.usuarioNome : "") + ""),
        h("div", null, ev.texto)))),

      /* conferência final */
      h("div", { className: "secao-titulo" }, "Conferência final"),
      h(Conferencia, { o, sessao, aoSalvar: setO }),

      foto ? h(VerFoto, { foto, fotos: o.fotos, podeApagar: podeApagarFoto, aoApagar: apagarFoto, aoFechar: () => setFoto(null) }) : null,
      editando ? h(EditarOS, { o, op, aoFechar: () => setEditando(false), aoSalvar: r => { setO(r); setEditando(false); } }) : null,
      histEq && K.PMOC ? h(K.PMOC.HistoricoEquip, { id: histEq, sessao, aoFechar: () => setHistEq(null) }) : null,
      null);
  }

  /* v1.18.2: UM editor para a OS inteira — tudo menos o número (dados, tipo, endereço, técnicos, orientações e tarefas) */
  function EditarOS({ o, op, aoFechar, aoSalvar }) {
    const [f, setF] = useState({ dataPrev: o.dataPrev || "", horaPrev: o.horaPrev || "", prazo: o.prazo || "", prioridade: o.prioridade, contato: o.contato || "", telefone: o.telefone || "",
      endereco: o.endereco || "", usarCliente: false, responsavelId: o.responsavelId, tecnicos: o.tecnicos.map(t => t.id), orientacoes: o.orientacoes || "", tipoServico: o.tipoServico || "" });
    const [ts, setTs] = useState(tarefasDe(o.etapas).map(t => ({ nome: t.nome, etapas: t.etapas.map(e => Object.assign({}, e)) })));
    const [endCliente, setEndCliente] = useState(null);
    const [cli, setCli] = useState({ id: o.clienteId, nome: o.clienteNome });   /* v1.26.1 */
    /* v1.28.0: equipamento da OS — lista das máquinas do cliente (null = PMOC indisponível: o campo some) */
    const [eqId, setEqId] = useState(o.equipamentoId || null);
    const [eqLista, setEqLista] = useState(null);
    const [eqBusca, setEqBusca] = useState("");
    useEffect(() => {
      let vivo = true; setEqLista(null);
      api("pmoc.equip.listar", { clienteId: cli.id }).then(r => { if (vivo) setEqLista(r.itens || []); }, () => { if (vivo) setEqLista(false); });
      return () => { vivo = false; };
    }, [cli.id]);
    const nomeEq = e => e.tag + (e.ambiente ? " · " + e.ambiente : "");
    const localEq = e => [e.andar && String(e.ambiente || "").indexOf(e.andar) < 0 ? e.andar : "", e.ambiente].filter(Boolean).join(" · ");
    function trocarEquip(novoId) {
      const lista = eqLista || [];
      const antes = lista.find(e => e.id === eqId), depois = lista.find(e => e.id === novoId);
      setEqId(novoId);
      /* a tarefa que tinha o nome da máquina antiga passa a ter o da nova */
      if (depois) setTs(l => l.map(t => antes && t.nome === nomeEq(antes) ? Object.assign({}, t, { nome: nomeEq(depois) })
        : !antes && l.length === 1 && /^(ocorr[eê]ncia|servi[cç]o|tarefa 1)$/i.test(t.nome.trim()) ? Object.assign({}, t, { nome: nomeEq(depois) }) : t));
    }
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(p => Object.assign({}, p, { [k]: v }));
    function trocarCliente(c) {
      if (!c || c.id === cli.id) return;
      setCli({ id: c.id, nome: c.nome });
      setEqId(null);   /* v1.28.0: a máquina é de outro cliente */
      /* o endereço, o contato e o telefone passam a ser os do cliente novo (dá para mudar abaixo) */
      api("clientes.obter", { id: c.id }).then(n => {
        setEndCliente(n.endereco || "");
        setF(p => Object.assign({}, p, { usarCliente: !!n.endereco, endereco: n.endereco ? "" : p.endereco, contato: n.contato || "", telefone: n.telefone || "" }));
      }, () => {});
    }
    useEffect(() => {
      api("clientes.obter", { id: o.clienteId }).then(cli => {
        const ec = cli.endereco || "";
        setEndCliente(ec);
        const igual = !o.endereco || o.endereco.trim() === ec.trim();
        setF(p => Object.assign({}, p, { usarCliente: igual && !!ec, endereco: igual ? "" : p.endereco }));
      }, () => {});   /* sem acesso ao cadastro: fica só o campo de texto */
    }, []); // eslint-disable-line
    const mudaT = (i, nr) => setTs(l => l.map((t, j) => j === i ? Object.assign({}, t, nr) : t));
    const mudaE = (i, k, v) => mudaT(i, { etapas: ts[i].etapas.map((e, j) => j === k ? Object.assign({}, e, { nome: v }) : e) });
    async function salvar() {
      const errEnd = validaEndereco(f, endCliente); if (errEnd) return setErro(errEnd);
      setErro(""); setEnviando(true);
      try {
        const extra = { tipoServico: (f.tipoServico || "").trim() || o.tipoServico, clienteId: cli.id };
        if (eqLista) extra.equipamentoId = eqId || 0;   /* v1.28.0 */
        await api("os.salvar", Object.assign({ id: o.id }, dadosCabecalho(f, endCliente), extra));
        const r = await api("os.tarefas.salvar", { id: o.id, etapas: achatar(ts.map(t => Object.assign({}, t, { nome: t.nome.trim() || "Serviço" }))) });
        K.avisar("OS " + o.numero + " salva."); aoSalvar(r);
      } catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: "Editar OS " + o.numero, largo: true, aoFechar,
      sub: "O número da OS não muda. O resto pode ser alterado.",
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar")] },
      h(Aviso, null, erro),
      K.CRM && K.CRM.EscolheCliente ? h("div", { className: "campo" }, h("span", null, "Casa de Oração / local do serviço"),
        h(K.CRM.EscolheCliente, { valor: cli.id, rotulo: cli.nome, aoEscolher: trocarCliente }),
        h("small", null, "Pode ser a filial onde o serviço é feito." + (o.chamadoNumero ? " A cobrança continua no cliente do chamado " + o.chamadoNumero + "." : ""))) : null,
      /* v1.28.0: equipamento (apartamento / máquina) — é ele que liga a OS ao histórico do equipamento */
      eqLista === false ? null : h("div", { className: "campo" }, h("span", null, "Equipamento"),
        eqLista === null ? h("div", { className: "cel-sub" }, "Carregando as máquinas do cliente…")
        : !eqLista.length ? h("div", { className: "cel-sub" }, "Este cliente não tem equipamentos cadastrados no PMOC.")
        : h(React.Fragment, null,
            eqLista.length > 12 ? h("input", { className: "entrada-texto", placeholder: "Filtrar por TAG, andar ou ambiente (ex.: 208)", value: eqBusca, onChange: e => setEqBusca(e.target.value), style: { marginBottom: 6 } }) : null,
            h("select", { className: "entrada-texto", value: eqId || "", onChange: e => trocarEquip(e.target.value ? Number(e.target.value) : null) },
              h("option", { value: "" }, "— Sem equipamento —"),
              eqLista.filter(e => e.id === eqId || !eqBusca.trim() || (e.tag + " " + (e.andar || "") + " " + (e.ambiente || "") + " " + (e.tipo || "")).toLowerCase().indexOf(eqBusca.trim().toLowerCase()) >= 0)
                .map(e => h("option", { key: e.id, value: e.id }, e.tag + (localEq(e) ? " · " + localEq(e) : "") + (e.tipo ? " · " + e.tipo : "") + (e.capacidadeBtu ? " " + e.capacidadeBtu + " BTU/h" : "")))),
            h("small", null, "A OS passa a aparecer no histórico desta máquina, para a equipe e para o cliente."))),
      h(Campo, { rotulo: "Tipo de serviço" }, h("input", { className: "entrada-texto", list: "os-tipos-serv", value: f.tipoServico, onChange: e => mudar("tipoServico")(e.target.value), maxLength: 60 }),
        h("datalist", { id: "os-tipos-serv" }, (op.checklists || []).map(m => h("option", { key: m.nome, value: m.nome })))),
      h(CamposCabecalho, { f, mudar, op, endCliente, descricao: o.chamadoId ? (o.chamadoDescricao || "") : null, semChamado: !o.chamadoId }),
      h("div", { className: "secao-titulo" }, "Tarefas e etapas"),
      h("p", { className: "cel-sub" }, "Renomeie, inclua ou tire tarefas e etapas. Etapas já marcadas mantêm o status."),
      ts.map((t, i) => h("div", { key: i, className: "os-tarefa-edit" },
        h("div", { className: "os-add" },
          h("input", { className: "entrada-texto", value: t.nome, onChange: e => mudaT(i, { nome: e.target.value }), "aria-label": "Nome da tarefa" }),
          h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo", onClick: () => setTs(l => l.filter((_, j) => j !== i)) }, "Remover tarefa")),
        t.etapas.map((e, k) => h("div", { key: e.id || "n" + k, className: "os-add os-etapa-edit" },
          h("span", { className: "cel-sub", style: { minWidth: 92 } }, ETAPA[e.status] || "Pendente"),
          h("input", { className: "entrada-texto", value: e.nome, onChange: ev => mudaE(i, k, ev.target.value) }),
          h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo", onClick: () => mudaT(i, { etapas: t.etapas.filter((_, j) => j !== k) }), "aria-label": "Remover etapa" }, "×"))),
        h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          h("button", { type: "button", className: "bt bt-p", onClick: () => mudaT(i, { etapas: t.etapas.concat([{ nome: "", status: "pendente" }]) }) }, "+ Etapa"),
          h("select", { className: "entrada-texto", value: "", onChange: e => { if (e.target.value) mudaT(i, { etapas: t.etapas.concat(itensDoModelo(e.target.value, op.checklists).map(n => ({ nome: n, status: "pendente" }))) }); }, "aria-label": "Adicionar checklist" },
            h("option", { value: "" }, "+ Etapas de um checklist…"), op.checklists.map(m => h("option", { key: m.nome, value: m.nome }, m.nome)))))),
      h("button", { type: "button", className: "bt bt-p", onClick: () => setTs(l => l.concat([{ nome: "Tarefa " + (l.length + 1), etapas: [] }])) }, "+ Tarefa"));
  }

  /* =================================================================
     CONFIGURAÇÕES › CHECKLISTS DE OS  (usado pelo empresa.js)
     ================================================================= */
  function CfgChecklists({ d, recarregar }) {
    const inicial = (d.config.checklists_os && d.config.checklists_os.length ? d.config.checklists_os : null);
    const [lista, setLista] = useState(null);
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    useEffect(() => {
      if (inicial) setLista(inicial.map(m => ({ nome: m.nome, termos: (m.termos || []).join(", "), itens: (m.itens || []).join("\n") })));
      else api("os.opcoes").then(o => setLista(o.checklists.map(m => ({ nome: m.nome, termos: (m.termos || []).join(", "), itens: (m.itens || []).join("\n") }))), e => setErro(e.message));
    }, []); // eslint-disable-line
    if (!lista) return h("div", { className: "bloco vazio" }, erro ? h(Aviso, null, erro) : "Carregando…");
    const muda = (i, k, v) => setLista(l => l.map((m, j) => j === i ? Object.assign({}, m, { [k]: v }) : m));
    async function salvar() {
      setErro("");
      const out = lista.filter(m => m.nome.trim()).map(m => ({ nome: m.nome.trim(), termos: m.termos.split(",").map(s => s.trim()).filter(Boolean), itens: m.itens.split("\n").map(s => s.trim()).filter(Boolean) }));
      if (!out.length) return setErro("Deixe ao menos um checklist.");
      setEnviando(true);
      try { await api("config.salvar", { valores: { checklists_os: out } }); K.avisar("Checklists salvos."); setEnviando(false); recarregar(); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h("div", { className: "bloco" },
      h("div", { className: "bloco-cab" }, h("h2", null, "Checklists de OS"), h("p", null, "Cada tipo de serviço puxa as etapas do checklist cujas palavras-chave aparecem no nome do tipo (ex.: \"instala\" pega Instalação de máquina).")),
      h("div", { className: "bloco-corpo" },
        h(Aviso, null, erro),
        lista.map((m, i) => h("div", { key: i, className: "os-tarefa-edit" },
          h("div", { className: "linha-campos" },
            h(Campo, { rotulo: "Nome" }, h(Texto, { valor: m.nome, aoMudar: v => muda(i, "nome", v) })),
            h(Campo, { rotulo: "Palavras-chave", dica: "Separadas por vírgula." }, h(Texto, { valor: m.termos, aoMudar: v => muda(i, "termos", v) }))),
          h(Campo, { rotulo: "Etapas (uma por linha)" }, h("textarea", { rows: Math.max(3, m.itens.split("\n").length + 1), value: m.itens, onChange: e => muda(i, "itens", e.target.value) })),
          h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo", onClick: () => setLista(l => l.filter((_, j) => j !== i)) }, "Remover checklist"))),
        h("button", { type: "button", className: "bt bt-p", onClick: () => setLista(l => l.concat([{ nome: "", termos: "", itens: "" }])) }, "+ Checklist")),
      h("div", { className: "bloco-pe" }, h("button", { className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar checklists")));
  }

  /* v1.27.2: deixa no aparelho as OS abertas da pessoa (escalada ou responsável), para abrirem sem internet
     mesmo que ela não tenha entrado em cada uma antes. Roda ao entrar e quando a internet volta (no máximo a cada 10 min). */
  let ultimoPreBaixar = 0, preBaixando = false;
  async function preBaixar(sessao, forcar) {
    if (!sessao || !sessao.usuario || preBaixando || navigator.onLine === false) return;
    if (!K.temPerfil(sessao, "admin", "coord", "tecnico")) return;
    if (K.offline && K.offline.pendentes() > 0) return;
    if (!forcar && Date.now() - ultimoPreBaixar < 600000) return;
    preBaixando = true; ultimoPreBaixar = Date.now();
    try {
      await api("os.opcoes").catch(() => null);
      const d = await api("os.listar", { grupo: "abertas", busca: "" });
      const uid = String(sessao.usuario.id);
      const minhas = (d && d.itens || []).filter(o => K.soTecnico(sessao) || String(o.responsavelId) === uid || (o.tecnicos || []).some(t => String(t.id) === uid));
      for (const o of minhas.slice(0, 40)) {
        if (navigator.onLine === false || (K.offline && K.offline.pendentes() > 0)) break;
        await api("os.obter", { id: o.id }).catch(() => null);   /* api() já guarda a cópia no aparelho */
      }
    } catch (e) { /* sem internet ou servidor fora: tenta na próxima */ }
    finally { preBaixando = false; }
  }

  K.CfgChecklists = CfgChecklists;
  /* usado pela tela do chamado (crm.js): criar OS, abrir OS e relatório PDF */
  K.OS = { NovaOS, DetalheOS, SeloOS, Barra, abrirRelatorio, relatorioDaOS, enviarRelatorioWhats, comprimir, VerFoto, preBaixar };
  /* ---------- trabalho sem internet (v1.12.0) ----------
     O que o técnico faz na OS sem sinal fica na fila do aparelho e a tela já
     mostra o resultado (cópia local da OS). Ao voltar a internet, sobe na ordem. */
  if (K.offline) {
    const reg = K.offline.registrar;
    const agora = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()); };
    const recontar = o => {
      o.etapasTotal = o.etapas.length;
      o.etapasFeitas = o.etapas.filter(e => e.status === "concluida" || e.status === "na").length;
      o.pendenciasAbertas = o.pendencias.filter(p => p.status === "aberta").length;
    };
    const naOS = mexe => async (d, ctx) => {
      const id = Number(d.osId || d.id);
      const o0 = await ctx.ler("os.obter", { id });
      if (!o0) return null;
      const o = JSON.parse(JSON.stringify(o0));
      mexe(o, d, ctx);
      recontar(o);
      await ctx.gravar("os.obter", { id }, o);
      return o;
    };
    const cachear = (d, r) => r && r.id && r.etapas ? ["os.obter", { id: r.id }] : null;
    const nomeOS = d => "OS (código " + (d.osId || d.id) + ")";
    reg("os.etapa.status", { cachear, rotulo: d => "Etapa da " + nomeOS(d),
      local: naOS((o, d) => { const e = o.etapas.find(x => x.id === Number(d.id)); if (e) e.status = d.status; }) });
    reg("os.mudar_status", { cachear, rotulo: d => "Status da " + nomeOS(d) + " → " + d.status,
      local: naOS((o, d) => { o.status = d.status; }) });
    reg("os.evento.criar", { cachear, rotulo: d => "Diário da " + nomeOS(d),
      local: naOS((o, d, ctx) => { o.eventos.unshift({ id: ctx.novoIdLocal(), tipo: "diario", texto: d.texto, usuarioNome: "Você (no aparelho)", criadoEm: agora() }); }) });
    reg("os.pendencia.criar", { cachear, rotulo: d => "Pendência da " + nomeOS(d),
      local: naOS((o, d, ctx) => { o.pendencias.unshift({ id: ctx.novoIdLocal(), descricao: d.descricao, status: "aberta", criadoEm: agora(), resolvidaEm: null }); }) });
    reg("os.pendencia.resolver", { cachear, rotulo: d => "Pendência da " + nomeOS(d),
      local: naOS((o, d) => { const p = o.pendencias.find(x => x.id === Number(d.id)); if (p) { p.status = d.reabrir ? "aberta" : "resolvida"; p.resolvidaEm = d.reabrir ? null : agora(); } }) });
    reg("os.material.criar", { cachear, rotulo: d => "Material da " + nomeOS(d),
      local: naOS((o, d, ctx) => { o.materiais.push({ id: ctx.novoIdLocal(), material: d.material, quantidade: Number(String(d.quantidade || 0).replace(",", ".")) || 0, unidade: d.unidade || "" }); }) });
    reg("os.foto.enviar", { cachear, rotulo: d => "Foto da " + nomeOS(d),
      local: naOS((o, d, ctx) => { o.fotos.push({ id: ctx.localId, etapaId: d.etapaId ? Number(d.etapaId) : null, legenda: d.legenda || null, autor: "Você (no aparelho)", criadoEm: agora() }); }) });
    reg("os.assinatura.enviar", { cachear, rotulo: d => "Assinatura da " + nomeOS(d),
      local: naOS((o, d, ctx) => { o.assinaturas[d.quem === "cliente" ? "cliente" : "tecnico"] = { anexoId: ctx.localId, nome: d.nome, cargo: d.cargo || null, em: agora() }; }) });
    reg("os.finalizar", { cachear, rotulo: d => "Finalização da " + nomeOS(d),
      local: naOS((o, d) => { o.conclusao = d.conclusao; o.finalizadoEm = agora(); if (o.status !== "Concluída" && o.status !== "Cancelada") o.status = "Serviço finalizado"; }) });
  }

  K.modulos = K.modulos || {};
  K.modulos.os = { titulo: "Ordens de serviço", icone: "os", perfis: ["admin", "coord", "tecnico"], grupo: "Operacional", Tela: OrdensServico };
})();
