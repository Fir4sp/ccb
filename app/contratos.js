/* =====================================================================
   KONSTANTE SaaS — app/contratos.js  ·  CRM › Contratos (v1.15.0 · v1.25.0: aba Cobrança)
   Funil da proposta de contrato (solicitado → proposta → negociação →
   ativo), vigência e renovação, proposta e minuta em PDF a partir de um
   modelo editável, versões enviadas, acompanhamento, arquivos (contrato
   assinado, ART) e ligação com o plano de PMOC.
   Carrega depois do crm.js (usa K.CRM) e antes do empresa.js.
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Aviso, Painel } = K;
  const { useState, useEffect, useRef } = React;
  const C = K.CRM;
  const { esc, nl2br, dataBR, hojeISO, BRL } = C;

  const CLASSE_CAT = { funil: "st-aberto", ativo: "st-ganho", perdido: "st-perdido", encerrado: "st-concluido" };
  const CATS_ARQ = { proposta: "Proposta", minuta: "Minuta", negociacao: "Negociação", assinado: "Contrato assinado", art: "ART", aditivo: "Aditivo", outro: "Outro" };

  const BRLs = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dia = s => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—");
  const nTxt = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; const s = String(v).trim().replace(/\s|R\$/g, ""); return Number(s.indexOf(",") >= 0 ? s.replace(/\./g, "").replace(",", ".") : s) || 0; };
  const valTxt = v => (v == null || v === "" ? "" : String(v).replace(".", ","));

  /* ---------- selos ---------- */
  function selos(c) {
    const hoje = hojeISO();
    const out = [];
    if (c.proposta) {
      const p = c.proposta;
      out.push(h("span", { key: "p", className: "ch-prop-s " + p.situacao },
        p.diasRestantes < 0 ? "Proposta vencida há " + (-p.diasRestantes) + " d" : p.diasRestantes === 0 ? "Proposta vence hoje" : "Proposta vence em " + p.diasRestantes + " d"));
    }
    if (c.vigencia) {
      const v = c.vigencia;
      out.push(h("span", { key: "v", className: "ch-prop-s " + (v.situacao === "vencido" ? "vencida" : v.situacao === "a_vencer" ? "vencendo" : "valida") },
        v.situacao === "vencido" ? "Vencido há " + (-v.diasRestantes) + " d" : "Vence em " + v.diasRestantes + " d"));
    }
    if (c.proximoRetorno && c.categoria !== "perdido" && c.categoria !== "encerrado")
      out.push(h("span", { key: "r", className: "ch-prop-s " + (c.proximoRetorno <= hoje ? "retorno-hoje" : "retorno") }, "Retorno " + (c.proximoRetorno === hoje ? "hoje" : dia(c.proximoRetorno).slice(0, 5))));
    return out.length ? h("div", { className: "ch-prop" }, out) : null;
  }
  function vigenciaTxt(c) {
    if (c.inicio || c.fim) return dia(c.inicio) + " a " + dia(c.fim);
    if (c.vigenciaMeses) return c.vigenciaMeses + " meses";
    return "—";
  }

  /* =================================================================
     LISTA
     ================================================================= */
  function Contratos({ sessao }) {
    const ehAdmin = K.veValores(sessao);   /* v1.22.0: admin, comercial e financeiro veem valores */
    const [op, setOp] = useState(null);
    const [resumo, setResumo] = useState(null);
    const [busca, setBusca] = useState("");
    const [filtro, setFiltro] = useState("funil");
    const [ordem, setOrdem] = useState("recentes");
    const [pagina, setPagina] = useState(1);
    const [estado, setEstado] = useState({ carregando: true, erro: "", dados: null });
    const [editando, setEditando] = useState(null);
    const [modo, setModoE] = useState(() => { try { return localStorage.getItem("k_ct_modo") || "quadro"; } catch (e) { return "quadro"; } });
    const setModo = m => { setModoE(m); try { localStorage.setItem("k_ct_modo", m); } catch (e) {} };
    const pedido = useRef(0);
    const estreito = C.useEstreito(760);

    useEffect(() => { api("contratos.opcoes").then(setOp, e => K.avisar(e.message, true)); }, []);
    function carregarResumo() { api("contratos.resumo").then(setResumo, () => {}); }
    useEffect(carregarResumo, []);
    /* vindo do chamado "Proposta de contrato": abre o contrato direto */
    useEffect(() => {
      const id = K.contratoAbrir; if (!id) return;
      K.contratoAbrir = null;
      api("contratos.obter", { id }).then(setEditando, e => K.avisar(e.message, true));
    }, []);

    function carregar(pg) {
      const n = ++pedido.current;
      setEstado(e => Object.assign({}, e, { carregando: true, erro: "" }));
      api("contratos.listar", { busca: busca.trim(), filtro: modo === "quadro" ? "quadro" : filtro, ordem, pagina: pg || pagina }).then(
        d => { if (n === pedido.current) setEstado({ carregando: false, erro: "", dados: d }); },
        e => { if (n === pedido.current) setEstado({ carregando: false, erro: e.message, dados: null }); });
    }
    useEffect(() => { const t = setTimeout(() => { setPagina(1); carregar(1); }, 300); return () => clearTimeout(t); }, [busca, filtro, ordem, modo]); // eslint-disable-line
    useEffect(() => { carregar(pagina); }, [pagina]); // eslint-disable-line
    const recarregar = () => { carregar(); carregarResumo(); };

    async function trocarStatus(c, novo) {
      /* quadro: o card já muda de coluna enquanto salva */
      setEstado(e => e.dados ? Object.assign({}, e, { dados: Object.assign({}, e.dados, { itens: e.dados.itens.map(x => x.id === c.id ? Object.assign({}, x, { status: novo }) : x) }) }) : e);
      try { await api("contratos.mudar_status", { id: c.id, status: novo }); K.avisar("Contrato " + c.numero + ": " + novo); recarregar(); }
      catch (x) { K.avisar(x.message, true); recarregar(); }
    }
    async function excluir(c) {
      const ok = await K.confirmar({ titulo: "Excluir o contrato " + c.numero + "?", texto: "O contrato some das listas. O número não volta a ser usado e o histórico continua registrado.", botao: "Excluir", perigo: true });
      if (!ok) return;
      try { await api("contratos.excluir", { id: c.id }); K.avisar("Contrato excluído."); setEditando(null); recarregar(); }
      catch (x) { K.avisar(x.message, true); }
    }
    async function abrir(c) {
      try { setEditando(await api("contratos.obter", { id: c.id })); } catch (x) { K.avisar(x.message, true); }
    }

    const d = estado.dados;
    const itens = d ? d.itens : [];
    const ct = (d && d.contagem) || {};
    const paginas = d ? Math.max(1, Math.ceil(d.total / d.porPagina)) : 1;
    const chip = (valor, rotulo, n, cls) => h("button", { key: valor, className: "chip " + (cls || "") + (filtro === valor ? " ativo" : ""), onClick: () => setFiltro(valor) },
      rotulo, h("span", { className: "chip-n" }, n || 0));
    const kpi = (titulo, valor, pe, cls, alvo) => h("div", { className: "kpi" + (cls ? " " + cls : ""), style: alvo ? { cursor: "pointer" } : null, onClick: alvo ? () => { setFiltro(alvo); setModo("lista"); } : null },
      h("div", { className: "kpi-t" }, titulo), h("div", { className: "kpi-v" }, valor), pe ? h("div", { className: "kpi-p" }, pe) : null);
    const seletor = c => h("select", { className: "status-rapido " + (CLASSE_CAT[c.categoria] || ""), value: c.status, onChange: e => trocarStatus(c, e.target.value), "aria-label": "Status do contrato " + c.numero },
      (op ? op.status : [{ nome: c.status }]).map(s => h("option", { key: s.nome, value: s.nome }, s.nome)));
    const filtrando = busca.trim() || filtro !== "funil";

    return h("div", null,
      resumo ? h("div", { className: "kpis ch-kpis" },
        kpi("Contratos ativos", String(resumo.ativos), ehAdmin ? BRL(resumo.receitaMensal) + " por mês" : "em vigência", "kpi-forte", "ativos"),
        kpi("No funil", String(resumo.funil), ehAdmin ? BRL(resumo.funilValor) + "/mês em negociação" : "propostas em andamento", null, "funil"),
        kpi("A vencer", String(resumo.a_vencer), "nos próximos " + (op ? op.aVencerDias : 60) + " dias", resumo.a_vencer ? "kpi-alerta" : null, "a_vencer"),
        kpi("Vencidos", String(resumo.vencidos), "ativos com a vigência já encerrada", null, "vencidos"),
        kpi("Fechados no mês", String(resumo.ganhos_mes), ehAdmin ? BRL(resumo.ganhosMesValor) + "/mês · " + resumo.perdidos_mes + " não aprovado(s)" : resumo.perdidos_mes + " não aprovado(s)")) : null,
      modo === "lista" ? h("div", { className: "chips ch-chips" },
        chip("funil", "Funil", ct.funil, "st-aberto"),
        chip("ativos", "Ativos", ct.ativos, "st-ganho"),
        chip("a_vencer", "A vencer", ct.a_vencer, "st-vencendo"),
        chip("vencidos", "Vencidos", ct.vencidos, "st-vencida"),
        h("span", { className: "chips-sep" }),
        ct.vencendo || filtro === "vencendo" ? chip("vencendo", "Proposta vencendo", ct.vencendo, "st-vencendo") : null,
        ct.propostas_vencidas || filtro === "propostas_vencidas" ? chip("propostas_vencidas", "Proposta vencida", ct.propostas_vencidas, "st-vencida") : null,
        ct.retorno || filtro === "retorno" ? chip("retorno", "Retorno hoje", ct.retorno, "st-retorno") : null,
        chip("perdidos", "Não aprovados", ct.perdidos, "st-perdido"),
        chip("encerrados", "Encerrados", ct.encerrados),
        chip("todos", "Todos", ct.todos)) : null,
      h("div", { className: "barra ch-barra" },
        h("div", { className: "kb-modo", role: "group", "aria-label": "Visualização" },
          h("button", { type: "button", className: modo === "quadro" ? "ativo" : "", onClick: () => setModo("quadro") }, "▦ Quadro"),
          h("button", { type: "button", className: modo === "lista" ? "ativo" : "", onClick: () => setModo("lista") }, "☰ Lista")),
        h("input", { className: "entrada-texto busca", placeholder: "Buscar por nº, cliente, título ou contato", value: busca, onChange: e => setBusca(e.target.value), "aria-label": "Buscar contratos" }),
        modo === "quadro" ? null : h("select", { className: "entrada-texto", value: ordem, onChange: e => setOrdem(e.target.value), "aria-label": "Ordenar" },
          h("option", { value: "recentes" }, "Mais recentes"), h("option", { value: "antigos" }, "Mais antigos"), h("option", { value: "atualizados" }, "Atualizados por último"),
          h("option", { value: "vencimento" }, "Vencimento mais próximo"), h("option", { value: "cliente" }, "Cliente (A → Z)")),
        h("div", { className: "ch-espaco", style: { flex: 1 } }),
        h("button", { className: "bt bt-marca ch-novo", onClick: () => setEditando({}), disabled: !op }, "Novo contrato")),
      modo === "quadro" ? (estado.erro ? h("div", { className: "bloco vazio" }, h(Aviso, null, estado.erro), h("button", { className: "bt", onClick: () => carregar() }, "Tentar de novo"))
        : !d || !op ? h("div", { className: "bloco vazio" }, "Carregando…")
        : h("div", { style: { opacity: estado.carregando ? .6 : 1 } }, h(Quadro, { itens, op, ehAdmin, abrir, mover: trocarStatus })))
      : h("div", { className: "bloco" },
        estado.erro ? h("div", { className: "vazio" }, h(Aviso, null, estado.erro), h("button", { className: "bt", onClick: () => carregar() }, "Tentar de novo"))
        : !d || !op ? h("div", { className: "vazio" }, "Carregando…")
        : !itens.length ? h("div", { className: "vazio" }, h("strong", null, filtrando ? "Nenhum contrato neste filtro." : "Nenhum contrato no funil."),
            filtrando ? "Confira a busca e os filtros." : "Quando um cliente pedir contrato, registre aqui pelo botão Novo contrato.")
        : h(React.Fragment, null,
          estreito ? h("div", { className: "ch-cards", style: { opacity: estado.carregando ? .55 : 1 } }, itens.map(c => h("div", { key: c.id, className: "ch-card" },
              h("div", { className: "ch-card-topo" }, h("b", null, "Contrato " + c.numero), ehAdmin && c.valorMensal != null ? h("b", null, BRL(c.valorMensal) + "/mês") : null),
              h("div", null, h("div", { className: "ch-card-cli" }, c.clienteNome), h("div", { className: "cel-sub" }, [c.modalidade, c.periodicidade].filter(Boolean).join(" · ") || "—")),
              c.titulo ? h("div", { className: "cel-sub corta", style: { maxWidth: "100%" } }, c.titulo) : null,
              seletor(c), selos(c),
              h("div", { className: "ch-card-pe" },
                h("span", { className: "cel-sub" }, c.categoria === "ativo" ? "Vigência " + vigenciaTxt(c) : "Pedido em " + dia(c.solicitadoEm)),
                h("button", { className: "bt bt-p bt-marca", onClick: () => abrir(c) }, "Abrir")))))
          : h("div", { className: "tabela-caixa", style: { opacity: estado.carregando ? .55 : 1 } }, h("table", { className: "tabela ch-tab" },
              h("thead", null, h("tr", null, h("th", null, "Nº"), h("th", null, "Cliente"), h("th", null, "Modalidade"), h("th", null, "Status"),
                h("th", null, "Vigência"), ehAdmin ? h("th", { className: "num" }, "Mensal") : null, h("th", { className: "acoes" }))),
              h("tbody", null, itens.map(c => h("tr", { key: c.id },
                h("td", { className: "ch-n" }, h("b", null, c.numero), c.anexosQtd ? h("span", { className: "ch-pill", title: c.anexosQtd + " arquivo(s)" }, "📎 " + c.anexosQtd) : null),
                h("td", { className: "ch-cli" }, h("div", { className: "cel-titulo" }, c.clienteNome), h("div", { className: "cel-sub" }, c.titulo || c.comQuemFalar || "—")),
                h("td", { className: "ch-serv" }, h("div", null, c.modalidade || "—"), c.periodicidade ? h("div", { className: "cel-sub" }, c.periodicidade) : null),
                h("td", { className: "ch-st" }, seletor(c), selos(c)),
                h("td", { className: "ch-dt" }, c.categoria === "ativo" || c.categoria === "encerrado" ? vigenciaTxt(c) : h("span", { className: "cel-sub" }, "pedido " + dia(c.solicitadoEm))),
                ehAdmin ? h("td", { className: "num" }, BRL(c.valorMensal)) : null,
                h("td", { className: "acoes" }, h("button", { className: "bt bt-leve bt-p", onClick: () => abrir(c) }, "Abrir"))))))),
          h("div", { className: "paginacao" },
            h("span", null, d.total + (d.total === 1 ? " contrato" : " contratos")),
            paginas > 1 ? h("span", { style: { display: "flex", gap: 6, alignItems: "center" } },
              h("button", { className: "bt bt-p", disabled: pagina <= 1, onClick: () => setPagina(pagina - 1) }, "Anterior"),
              h("span", null, pagina + " de " + paginas),
              h("button", { className: "bt bt-p", disabled: pagina >= paginas, onClick: () => setPagina(pagina + 1) }, "Próxima")) : null))),
      editando ? h(FormContrato, { contrato: editando, op, ehAdmin, sessao, aoFechar: () => setEditando(null),
        aoSalvar: c => { recarregar(); if (c) setEditando(c); else setEditando(null); }, aoExcluir: ehAdmin && !K.soConsultaCRM(sessao) ? excluir : null }) : null);
  }

  /* =================================================================
     FORMULÁRIO
     ================================================================= */
  /* ---------- quadro (kanban) ---------- */
  function Quadro({ itens, op, ehAdmin, abrir, mover }) {
    const [sobre, setSobre] = useState("");
    const ordem = op.status.map(s => s.nome);
    const cols = op.status.filter(s => s.nome !== "Suspenso" || itens.some(c => c.status === "Suspenso"));
    const prox = st => { const i = ["Solicitado", "Em elaboração", "Proposta enviada", "Em negociação", "Ativo"].indexOf(st); return i >= 0 && i < 4 ? ["Solicitado", "Em elaboração", "Proposta enviada", "Em negociação", "Ativo"][i + 1] : null; };
    return h("div", { className: "kb" }, cols.map(col => {
      const lista = itens.filter(c => c.status === col.nome);
      const soma = lista.reduce((s, c) => s + (Number(c.valorMensal) || 0), 0);
      return h("div", { key: col.nome, className: "kb-col kb-" + col.categoria + (sobre === col.nome ? " kb-sobre" : ""),
        onDragOver: e => { e.preventDefault(); if (sobre !== col.nome) setSobre(col.nome); },
        onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setSobre(""); },
        onDrop: e => { e.preventDefault(); setSobre(""); const id = +e.dataTransfer.getData("text/plain"); const c = itens.find(x => x.id === id); if (c && c.status !== col.nome) mover(c, col.nome); } },
        h("div", { className: "kb-cab" }, h("b", null, col.nome), h("span", { className: "kb-n" }, lista.length),
          ehAdmin && soma ? h("div", { className: "kb-soma" }, BRL(soma) + "/mês") : null),
        h("div", { className: "kb-cards" },
          lista.length ? lista.map(c => h("div", { key: c.id, className: "kb-card", draggable: true, onDragStart: e => { e.dataTransfer.setData("text/plain", String(c.id)); e.dataTransfer.effectAllowed = "move"; }, onClick: () => abrir(c),
              role: "button", tabIndex: 0, onKeyDown: e => { if (e.key === "Enter") abrir(c); } },
            h("div", { className: "kb-topo" }, h("span", { className: "kb-num" }, "Nº " + c.numero),
              c.anexosQtd ? h("span", { className: "kb-clip", title: c.anexosQtd + " arquivo(s)" }, "📎 " + c.anexosQtd) : null),
            h("div", { className: "kb-cli" }, c.clienteNome),
            c.titulo ? h("div", { className: "kb-tit" }, c.titulo) : null,
            h("div", { className: "kb-pe" },
              ehAdmin && c.valorMensal != null ? h("b", null, BRL(c.valorMensal) + "/mês") : h("span", { className: "cel-sub" }, c.modalidade || ""),
              c.responsavelNome ? h("span", { className: "kb-av", title: c.responsavelNome }, K.iniciais(c.responsavelNome)) : null),
            selos(c),
            prox(c.status) ? h("button", { type: "button", className: "kb-avancar", title: "Mover para " + prox(c.status), onClick: e => { e.stopPropagation(); mover(c, prox(c.status)); } }, "→ " + prox(c.status)) : null))
          : h("div", { className: "kb-vazio" }, "Arraste um card para cá")));
    }));
  }

  /* =================================================================
     FORMULÁRIO (v1.17.0: sem gerar proposta/minuta — os documentos
     são feitos fora e anexados na aba Arquivos)
     ================================================================= */
  function FormContrato({ contrato, op, ehAdmin, sessao, aoFechar, aoSalvar, aoExcluir }) {
    const novo = !contrato.id;
    const [f, setF] = useState(() => Object.assign({
      clienteId: null, clienteNome: "", titulo: "", comQuemFalar: "", responsavelId: sessao.usuario.id, modalidade: "", periodicidade: "", status: "Solicitado",
      solicitadoEm: hojeISO(), proximoRetorno: "", motivo: "", obs: "",
      valorMensal: "", vigenciaMeses: 12, inicio: "", fim: "", renovacaoAuto: false, reajuste: "IPCA", diaVencimento: 10,
    }, contrato, { valorMensal: valTxt(contrato.valorMensal) }));
    const [atual, setAtual] = useState(contrato);
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [aba, setAba] = useState(contrato.abrirArquivos ? "arquivos" : "dados");
    const [renovando, setRenovando] = useState(false);
    const mudar = k => v => setF(p => Object.assign({}, p, { [k]: v }));
    const fimFechado = f.status === "Não aprovado" || f.status === "Encerrado";

    async function salvar() {
      setErro("");
      if (!f.clienteId) { setAba("dados"); return setErro("Escolha o cliente do contrato."); }
      setEnviando(true);
      try {
        const d = { id: f.id, clienteId: f.clienteId, titulo: f.titulo, comQuemFalar: f.comQuemFalar, responsavelId: f.responsavelId, modalidade: f.modalidade,
          periodicidade: f.periodicidade, status: f.status, solicitadoEm: f.solicitadoEm, proximoRetorno: f.proximoRetorno, motivo: f.motivo, obs: f.obs, chamadoId: f.chamadoId };
        if (!novo) ["enviadoEm", "assinadoEm", "encerradoEm"].forEach(k => { if (k in f) d[k] = f[k] || ""; });
        if (ehAdmin) Object.assign(d, { valorMensal: f.valorMensal === "" ? null : nTxt(f.valorMensal), vigenciaMeses: f.vigenciaMeses, inicio: f.inicio || "", fim: f.fim || "",
          renovacaoAuto: !!f.renovacaoAuto, reajuste: f.reajuste, diaVencimento: f.diaVencimento });
        const c = await api("contratos.salvar", d);
        const completo = await api("contratos.obter", { id: c.id });
        K.avisar(novo ? "Contrato " + c.numero + " aberto. Agora anexe a proposta." : "Contrato " + c.numero + " salvo.");
        setAtual(completo);
        setF(p => Object.assign({}, p, completo, { valorMensal: valTxt(completo.valorMensal) }));
        setEnviando(false);
        if (novo) setAba("arquivos");
        aoSalvar(completo);
      } catch (x) { setErro(x.message); setEnviando(false); }
    }

    if (renovando) return h(Renovar, { contrato: atual, aoFechar: () => setRenovando(false), aoRenovar: c => { setRenovando(false); setAtual(Object.assign({}, atual, c)); setF(p => Object.assign({}, p, { fim: c.fim, valorMensal: valTxt(c.valorMensal), status: c.status })); aoSalvar(Object.assign({}, atual, c)); } });

    const rodape = [];
    if (!novo && aoExcluir) rodape.push(h("button", { key: "x", className: "bt bt-leve bt-perigo", style: { marginRight: "auto" }, onClick: () => aoExcluir(atual) }, "Excluir"));
    rodape.push(h("button", { key: "c", className: "bt", onClick: aoFechar }, "Fechar"));
    if (ehAdmin && !novo && (atual.categoria === "ativo" || atual.categoria === "encerrado")) rodape.push(h("button", { key: "r", className: "bt", onClick: () => setRenovando(true) }, "Renovar"));
    if (aba === "dados") rodape.push(h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : novo ? "Abrir contrato" : "Salvar"));
    if (K.soConsultaCRM(sessao)) { rodape.length = 0; rodape.push(h("button", { key: "c", className: "bt bt-marca", onClick: aoFechar }, "Fechar")); }   /* v1.22.0: financeiro só consulta */
    const abas = [["dados", "Dados"]];
    if (!novo) { abas.push(["arquivos", "Arquivos" + (atual.anexosQtd ? " (" + atual.anexosQtd + ")" : "")]); abas.push(["acomp", "Acompanhamento"]); }
    if (!novo && K.temModulo("erp") && K.temPerfil(sessao, "admin", "financeiro", "comercial")) abas.push(["cobranca", "Cobrança"]);   /* v1.25.0 */

    return h(Painel, {
      titulo: novo ? "Novo contrato" : "Contrato " + atual.numero, largo: true,
      sub: novo ? "Depois de abrir, anexe a proposta, a minuta e o que vier da negociação." : atual.clienteNome + (atual.chamadoNumero ? " · veio do chamado " + atual.chamadoNumero : "") + " · pedido em " + dia(atual.solicitadoEm),
      aoFechar, rodape,
    },
      h(Aviso, null, erro),
      !novo ? selos(atual) : null,
      !novo ? h(PmocDoContrato, { contrato: atual, status: f.status, aoFechar, aoMudar: () => api("contratos.obter", { id: atual.id }).then(setAtual, () => {}) }) : null,
      h("div", { className: "abas", role: "tablist", style: { marginTop: 8 } }, abas.map(([k, t]) => h("button", { key: k, type: "button", role: "tab", "aria-selected": aba === k, className: "aba" + (aba === k ? " ativa" : ""), onClick: () => setAba(k) }, t))),
      aba === "dados" ? h(React.Fragment, null,
        h("div", { className: "campo" }, h("span", null, "Cliente"), h(C.EscolheCliente, { valor: f.clienteId, rotulo: f.clienteNome,
          aoEscolher: c => setF(p => Object.assign({}, p, { clienteId: c.id, clienteNome: c.nome, comQuemFalar: p.comQuemFalar || c.contato || "" })) })),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Etapa" }, h("select", { value: f.status, onChange: e => mudar("status")(e.target.value) }, op.status.map(s => h("option", { key: s.nome, value: s.nome }, s.nome)))),
          h(Campo, { rotulo: "Modalidade" }, h("select", { value: f.modalidade || "", onChange: e => mudar("modalidade")(e.target.value) },
            h("option", { value: "" }, "—"), op.modalidades.map(t => h("option", { key: t, value: t }, t)),
            f.modalidade && op.modalidades.indexOf(f.modalidade) < 0 ? h("option", { value: f.modalidade }, f.modalidade) : null)),
          h(Campo, { rotulo: "Periodicidade das visitas" }, h("select", { value: f.periodicidade || "", onChange: e => mudar("periodicidade")(e.target.value) },
            h("option", { value: "" }, "—"), op.periodicidades.map(t => h("option", { key: t, value: t }, t)),
            f.periodicidade && op.periodicidades.indexOf(f.periodicidade) < 0 ? h("option", { value: f.periodicidade }, f.periodicidade) : null))),
        fimFechado ? h(Campo, { rotulo: f.status === "Não aprovado" ? "Motivo da perda" : "Motivo do encerramento" }, h(Texto, { valor: f.motivo, aoMudar: mudar("motivo"), placeholder: "Ex.: preço, fechou com concorrente, venda do imóvel…" })) : null,
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Título (opcional)", dica: "Ex.: Torres A e B, 24 máquinas" }, h(Texto, { valor: f.titulo, aoMudar: mudar("titulo") })),
          h(Campo, { rotulo: "Com quem falar" }, h(Texto, { valor: f.comQuemFalar, aoMudar: mudar("comQuemFalar") })),
          h(Campo, { rotulo: "Responsável" }, h("select", { value: f.responsavelId || "", onChange: e => mudar("responsavelId")(e.target.value ? Number(e.target.value) : null) },
            h("option", { value: "" }, "—"), op.responsaveis.map(r => h("option", { key: r.id, value: r.id }, r.nome)))),
          h(Campo, { rotulo: "Pedido em" }, h(Texto, { valor: f.solicitadoEm || "", aoMudar: mudar("solicitadoEm"), type: "date" }))),
        ehAdmin ? h(React.Fragment, null,
          h("div", { className: "secao-titulo" }, "Valor e vigência"),
          h("div", { className: "linha-campos" },
            h(Campo, { rotulo: "Valor mensal (R$)" }, h(Texto, { valor: f.valorMensal, aoMudar: mudar("valorMensal"), inputMode: "decimal", placeholder: "0,00" })),
            h(Campo, { rotulo: "Vigência (meses)" }, h(Texto, { valor: f.vigenciaMeses == null ? "" : f.vigenciaMeses, aoMudar: v => mudar("vigenciaMeses")(v.replace(/\D/g, "").slice(0, 3)), inputMode: "numeric" })),
            h(Campo, { rotulo: "Dia do vencimento" }, h(Texto, { valor: f.diaVencimento == null ? "" : f.diaVencimento, aoMudar: v => mudar("diaVencimento")(v.replace(/\D/g, "").slice(0, 2)), inputMode: "numeric" })),
            h(Campo, { rotulo: "Reajuste anual pelo" }, h(Texto, { valor: f.reajuste, aoMudar: mudar("reajuste"), list: "ct-indices" })),
            h("datalist", { id: "ct-indices" }, ["IPCA", "IGP-M", "INPC", "Sem reajuste"].map(t => h("option", { key: t, value: t })))),
          h("div", { className: "linha-campos" },
            h(Campo, { rotulo: "Início da vigência", dica: "Vazio: data em que virar Ativo." }, h(Texto, { valor: f.inicio || "", aoMudar: mudar("inicio"), type: "date" })),
            h(Campo, { rotulo: "Fim da vigência", dica: "Vazio: início + meses." }, h(Texto, { valor: f.fim || "", aoMudar: mudar("fim"), type: "date" })),
            h("label", { className: "check", style: { alignSelf: "center" } }, h("input", { type: "checkbox", checked: !!f.renovacaoAuto, onChange: e => mudar("renovacaoAuto")(e.target.checked) }), "Renovação automática"))) : null,
        h(Campo, { rotulo: "Observação interna" }, h("textarea", { rows: 3, value: f.obs || "", onChange: e => mudar("obs")(e.target.value) })))
      : aba === "arquivos" ? h(Arquivos, { contrato: atual, ehAdmin, aoMudar: n => setAtual(a => Object.assign({}, a, { anexosQtd: n })) })
      : aba === "cobranca" ? h(CobrancaContrato, { contratoId: atual.id })
      : aba === "acomp" ? h(Acompanhamento, { contrato: atual, versao: 0, aoRetorno: r => { setAtual(Object.assign({}, atual, { proximoRetorno: r })); setF(p => Object.assign({}, p, { proximoRetorno: r })); } })
      : null);
  }

  /* ---------- v1.25.0: cobrança mensal no Financeiro ---------- */
  const STF = { aberto: "Em aberto", parcial: "Parcial", quitado: "Recebido", cancelado: "Cancelado" };
  function CobrancaContrato({ contratoId, aoSalvar }) {
    const [d, setD] = useState(null);
    const [f, setF] = useState(null);
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    function carregar() {
      api("fin.contrato.cobranca.obter", { contratoId }).then(o => {
        setD(o);
        setF({ ativo: o.configurado ? o.ativo : true, diaVencimento: o.diaVencimento == null ? "" : String(o.diaVencimento), valor: o.valor == null ? "" : Number(o.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
          categoriaId: o.categoriaId || o.categoriaPadrao || "", centroId: o.centroId || "", contaId: o.contaId || "", forma: o.forma || "",
          inicioCobranca: o.inicioCobranca || o.mesAtual, descricao: o.descricao || "", obs: o.obs || "", comNota: o.comNota !== false });
      }, e => setErro(e.message));
    }
    useEffect(carregar, [contratoId]); // eslint-disable-line
    if (erro && !d) return h(Aviso, null, erro);
    if (!d || !f) return h("div", { className: "vazio" }, "Carregando…");
    const mudar = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    const valorEf = f.valor !== "" ? nTxt(f.valor) : d.valorMensal;
    const diaEf = f.diaVencimento || d.diaContrato || 10;
    const ativoContrato = d.statusContrato === "Ativo";
    async function salvar() {
      setErro(""); setSalvando(true);
      try {
        const r = await api("fin.contrato.cobranca.salvar", Object.assign({ contratoId }, f, { ativo: f.ativo ? 1 : 0, comNota: f.comNota ? 1 : 0 }));
        const x = r.resultado;
        K.avisar(x.criadas || x.atualizadas || x.canceladas
          ? [x.criadas ? x.criadas + " mensalidade(s) lançada(s)" : null, x.atualizadas ? x.atualizadas + " atualizada(s)" : null, x.canceladas ? x.canceladas + " cancelada(s)" : null].filter(Boolean).join(" · ")
          : "Cobrança salva.");
        setD(Object.assign({}, d, r));
        if (aoSalvar) aoSalvar(r);
      } catch (e) { setErro(e.message); }
      setSalvando(false);
    }
    return h("div", { className: "ct-cob" },
      h(Aviso, null, erro),
      h("p", { className: "cel-sub", style: { marginTop: 0 } }, "Ligada, o Financeiro lança sozinho a mensalidade a receber do mês atual e dos 2 próximos, enquanto o contrato estiver ",
        h("b", null, "Ativo"), " e dentro da vigência. Suspenso ou encerrado: as futuras sem recebimento são canceladas."),
      !ativoContrato ? h("div", { className: "aviso aviso-info" }, "O contrato está \"" + d.statusContrato + "\": nada é lançado até ele ficar Ativo.") : null,
      h("label", { className: "check", style: { margin: "6px 0 12px" } }, h("input", { type: "checkbox", checked: !!f.ativo, onChange: e => mudar("ativo")(e.target.checked) }), h("b", null, "Cobrar mensalmente pelo Financeiro")),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Valor da mensalidade (R$)", dica: "Vazio: valor mensal do contrato" + (d.valorMensal != null ? " (" + BRLs(d.valorMensal) + ")" : " (não informado)") },
          h(Texto, { valor: f.valor, aoMudar: mudar("valor"), inputMode: "decimal", placeholder: d.valorMensal != null ? Number(d.valorMensal).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "0,00" })),
        h(Campo, { rotulo: "Dia do vencimento", dica: "Vazio: o do contrato (" + (d.diaContrato || 10) + ")" },
          h(Texto, { valor: f.diaVencimento, aoMudar: v => mudar("diaVencimento")(v.replace(/\D/g, "").slice(0, 2)), inputMode: "numeric", placeholder: String(d.diaContrato || 10) })),
        h(Campo, { rotulo: "Cobrar a partir de", dica: "Mês da 1ª mensalidade" }, h(Texto, { valor: f.inicioCobranca, aoMudar: mudar("inicioCobranca"), type: "month" }))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Categoria" }, h("select", { value: f.categoriaId, onChange: e => mudar("categoriaId")(e.target.value) },
          d.categorias.map(c => h("option", { key: c.id, value: c.id }, c.nome)))),
        h(Campo, { rotulo: "Recebe na conta" }, h("select", { value: f.contaId, onChange: e => mudar("contaId")(e.target.value) },
          h("option", { value: "" }, "—"), d.contas.map(c => h("option", { key: c.id, value: c.id }, c.nome)))),
        h(Campo, { rotulo: "Forma" }, h("select", { value: f.forma, onChange: e => mudar("forma")(e.target.value) },
          h("option", { value: "" }, "—"), d.formas.map(x => h("option", { key: x, value: x }, x)))),
        d.centros.length ? h(Campo, { rotulo: "Centro de custo" }, h("select", { value: f.centroId, onChange: e => mudar("centroId")(e.target.value) },
          h("option", { value: "" }, "—"), d.centros.map(c => h("option", { key: c.id, value: c.id }, c.nome)))) : null),
      h("label", { className: "check", style: { margin: "0 0 10px" } }, h("input", { type: "checkbox", checked: !!f.comNota, onChange: e => mudar("comNota")(e.target.checked) }), "Emite nota fiscal (entra na provisão de impostos)"),
      h(Campo, { rotulo: "Descrição (opcional)", dica: "Vazio: \"Contrato " + d.numero + " · " + (d.cliente || "") + " · mês/ano\"" }, h(Texto, { valor: f.descricao, aoMudar: mudar("descricao") })),
      f.ativo && valorEf > 0 ? h("div", { className: "ct-cob-res" }, "Todo dia ", h("b", null, String(diaEf)), ": ", h("b", null, BRLs(valorEf)),
        d.fimContrato ? " até " + dia(d.fimContrato) : " sem data de fim") : null,
      h("div", { style: { display: "flex", justifyContent: "flex-end", margin: "10px 0 14px" } },
        h("button", { className: "bt bt-marca", onClick: salvar, disabled: salvando }, salvando ? "Salvando…" : "Salvar cobrança")),
      h("div", { className: "secao-titulo" }, "Mensalidades" + (d.emAberto ? " · em aberto " + BRLs(d.emAberto) : "") + (d.vencido ? " · vencido " + BRLs(d.vencido) : "")),
      d.mensalidades.length ? h("div", { className: "ct-cob-l" }, d.mensalidades.map(t => h("div", { key: t.id, className: "ct-cob-i" + (t.status === "cancelado" ? " cancelado" : "") },
          h("span", null, t.mes.slice(5) + "/" + t.mes.slice(0, 4)), h("span", null, "vence " + dia(t.vencimento)),
          h("b", null, BRLs(t.valor)), h("span", { className: "ct-cob-st " + t.status + (t.status !== "quitado" && t.status !== "cancelado" && t.vencimento < hojeISO() ? " atrasada" : "") },
            t.status !== "quitado" && t.status !== "cancelado" && t.vencimento < hojeISO() ? "Vencida" : STF[t.status] || t.status))))
      : h("div", { className: "cel-sub" }, "Nenhuma mensalidade lançada ainda."),
      h("p", { className: "cel-sub" }, "Recebimentos e ajustes de cada mensalidade: Financeiro › A receber. Mudou valor ou dia aqui → atualiza as do mês atual em diante ainda não recebidas."));
  }
  K.CobrancaContrato = CobrancaContrato;

  /* ---------- PMOC ligado ---------- */
  function PmocDoContrato({ contrato, status, aoMudar, aoFechar }) {
    const [ligando, setLigando] = useState(false);
    const ativo = (status === "Ativo" || status === "Suspenso") && (contrato.status === "Ativo" || contrato.status === "Suspenso");
    const planos = contrato.planos || [];
    const pmoc = /PMOC/i.test(contrato.modalidade || "");
    if (!ativo && !planos.length) return null;
    if (!planos.length && !pmoc && !contrato.planoSemContrato) return null;
    const ano = new Date().getFullYear();
    async function ligar() {
      const existe = contrato.planoSemContrato;
      const ok = await K.confirmar({ titulo: existe ? "Ligar ao plano PMOC " + ano + "?" : "Criar o plano PMOC " + ano + "?",
        texto: existe ? "O plano que o cliente já tem em " + ano + " passa a pertencer a este contrato. As ocorrências (OS de contrato) ficam ligadas a ele."
          : "Cria o plano do cliente em " + ano + ", ligado a este contrato e ainda sem equipamentos. Os equipamentos e o formulário você cadastra no módulo PMOC.",
        botao: existe ? "Ligar" : "Criar plano" });
      if (!ok) return;
      setLigando(true);
      try { const r = await api("contratos.pmoc.ligar", { id: contrato.id, ano }); K.avisar("Plano PMOC " + r.ano + " ligado ao contrato."); aoMudar(); }
      catch (x) { K.avisar(x.message, true); } finally { setLigando(false); }
    }
    return h("div", { className: "ct-pmoc" },
      h("b", null, "PMOC"),
      planos.length ? h("span", null, "Planos ligados: " + planos.map(p => p.ano).join(", ") + (contrato.osQtd ? " · " + contrato.osQtd + " OS de contrato" : ""))
        : h("span", { className: "cel-sub" }, contrato.planoSemContrato ? "O cliente já tem plano PMOC em " + ano + ", ainda sem contrato." : "Nenhum plano PMOC ligado."),
      h("span", { style: { flex: 1 } }),
      planos.length ? h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => { aoFechar(); setTimeout(() => { location.hash = "/pmoc"; }, 250); } }, "Abrir PMOC") : null,
      ativo && !planos.some(p => p.ano === ano) ? h("button", { type: "button", className: "bt bt-p bt-marca", onClick: ligar, disabled: ligando },
        contrato.planoSemContrato ? "Ligar plano " + ano : "Criar plano " + ano) : null);
  }

  /* ---------- acompanhamento ---------- */
  function Acompanhamento({ contrato, versao, aoRetorno }) {
    const [lista, setLista] = useState(null);
    const [texto, setTexto] = useState("");
    const [retorno, setRetorno] = useState("");
    const [salvando, setSalvando] = useState(false);
    function carregar() { api("contratos.eventos", { id: contrato.id }).then(d => setLista(d.itens), () => setLista([])); }
    useEffect(carregar, [contrato.id, versao]); // eslint-disable-line
    async function registrar() {
      setSalvando(true);
      try { const r = await api("contratos.contato", { id: contrato.id, texto, retorno }); aoRetorno(r.proximoRetorno); setTexto(""); setRetorno(""); carregar(); K.avisar("Contato registrado."); }
      catch (x) { K.avisar(x.message, true); } finally { setSalvando(false); }
    }
    const ROT = { status: "Status", contato: "Contato", versao: "Versão", renovacao: "Renovação", arquivo: "Arquivo", pmoc: "PMOC", nota: "Nota" };
    return h("div", null,
      h("div", { className: "ch-acomp-form", style: { marginBottom: 14 } },
        h("textarea", { value: texto, onChange: e => setTexto(e.target.value), rows: 2, placeholder: "O que foi conversado (ex.: síndico vai levar a proposta para a assembleia do dia 20)" }),
        h("div", { className: "ch-acomp-linha" },
          h("label", null, h("span", null, "Próximo retorno"), h("input", { className: "entrada-texto", type: "date", value: retorno, onChange: e => setRetorno(e.target.value) })),
          h("button", { type: "button", className: "bt bt-marca", disabled: salvando || (!texto.trim() && !retorno), onClick: registrar }, salvando ? "Salvando…" : "Registrar contato"))),
      !lista ? h("div", { className: "cel-sub" }, "Carregando…")
      : !lista.length ? h("div", { className: "cel-sub" }, "Nada registrado ainda.")
      : h("div", { className: "ch-acomp-lista" }, lista.map(a => h("div", { key: a.id },
          h("span", null, K.dataHora(a.criadoEm) + " · " + (a.usuario || "—") + " · " + (ROT[a.tipo] || a.tipo)),
          a.texto ? h("p", null, a.texto) : null,
          a.retorno ? h("small", null, "Retorno marcado para " + dia(a.retorno)) : null))));
  }

  /* ---------- arquivos ---------- */
  function Arquivos({ contrato, ehAdmin, aoMudar }) {
    const [lista, setLista] = useState(null);
    const [cat, setCat] = useState(() => contrato.status === "Ativo" ? "assinado" : contrato.status === "Em negociação" ? "negociacao" : "proposta");
    const [subindo, setSubindo] = useState(false);
    function carregar() { api("contratos.arquivos", { id: contrato.id }).then(d => { setLista(d.itens); aoMudar(d.itens.length); }, () => setLista([])); }
    useEffect(carregar, [contrato.id]); // eslint-disable-line
    async function enviar(ev) {
      const arqs = Array.prototype.slice.call(ev.target.files || []);
      ev.target.value = "";
      if (!arqs.length) return;
      setSubindo(true);
      try {
        for (const a of arqs) {
          if (a.size > 12 * 1024 * 1024) { K.avisar(a.name + ": grande demais (máx. 12 MB).", true); continue; }
          await K.enviarArquivo("contratos.arquivo.enviar", a, { id: contrato.id, categoria: cat });
        }
        K.avisar("Arquivo anexado."); carregar();
      } catch (x) { K.avisar(x.message, true); }
      setSubindo(false);
    }
    async function excluir(a) {
      if (!(await K.confirmar({ titulo: "Remover " + (a.nome || "o arquivo") + "?", texto: "Fica registrado no acompanhamento.", botao: "Remover", perigo: true }))) return;
      try { await api("contratos.arquivo.excluir", { arquivoId: a.id }); carregar(); } catch (x) { K.avisar(x.message, true); }
    }
    return h("div", null,
      h("div", { className: "barra", style: { marginBottom: 12 } },
        h("select", { className: "entrada-texto", style: { width: "auto" }, value: cat, onChange: e => setCat(e.target.value), "aria-label": "Tipo do arquivo" },
          Object.keys(CATS_ARQ).map(k => h("option", { key: k, value: k }, CATS_ARQ[k]))),
        h("label", { className: "bt bt-marca" + (subindo ? " disabled" : "") }, subindo ? "Enviando…" : "Anexar arquivo",
          h("input", { type: "file", multiple: true, accept: ".pdf,.doc,.docx,.xls,.xlsx,.odt,image/jpeg,image/png,image/webp", onChange: enviar, style: { display: "none" }, disabled: subindo }))),
      h("div", { className: "cel-sub", style: { marginBottom: 10 } }, "PDF, Word, Excel ou foto, até 12 MB cada. Escolha o tipo antes de anexar. Só administração e coordenação abrem estes arquivos."),
      !lista ? h("div", { className: "cel-sub" }, "Carregando…")
      : !lista.length ? h("div", { className: "vazio" }, "Nenhum arquivo ainda. Anexe a proposta, a minuta, o que vier da negociação e o contrato assinado.")
      : h("div", { className: "ct-arqs" }, lista.map(a => h("div", { key: a.id, className: "ct-arq" },
          h("div", { style: { minWidth: 0, flex: 1 } }, h("div", { className: "cel-titulo corta" }, a.nome || "arquivo"),
            h("div", { className: "cel-sub" }, (CATS_ARQ[a.categoria] || a.categoria) + " · " + K.dataHora(a.criadoEm) + (a.usuario ? " · " + a.usuario : "") + " · " + Math.max(1, Math.round(a.tamanho / 1024)) + " KB")),
          h("a", { className: "bt bt-leve bt-p", href: K.urlAnexo(a.id), target: "_blank", rel: "noopener" }, "Abrir"),
          ehAdmin ? h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo", onClick: () => excluir(a) }, "Remover") : null))));
  }

  /* ---------- renovação ---------- */
  function Renovar({ contrato, aoFechar, aoRenovar }) {
    const meses = contrato.vigenciaMeses || 12;
    const sugestao = (() => {
      const base = contrato.fim ? new Date(contrato.fim + "T12:00:00") : new Date();
      base.setMonth(base.getMonth() + meses);
      return base.getFullYear() + "-" + String(base.getMonth() + 1).padStart(2, "0") + "-" + String(base.getDate()).padStart(2, "0");
    })();
    const [fim, setFim] = useState(sugestao);
    const [pct, setPct] = useState("");
    const [valor, setValor] = useState(valTxt(contrato.valorMensal));
    const [nota, setNota] = useState("");
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    function aplicarPct(p) {
      setPct(p);
      const n = nTxt(p);
      if (contrato.valorMensal != null) setValor(n ? valTxt(Math.round(contrato.valorMensal * (1 + n / 100) * 100) / 100) : valTxt(contrato.valorMensal));
    }
    async function confirmar() {
      setErro(""); setEnviando(true);
      try {
        const c = await api("contratos.renovar", { id: contrato.id, fim, valorMensal: valor === "" ? null : nTxt(valor), nota: (pct ? "reajuste de " + pct + "%" + (contrato.reajuste ? " (" + contrato.reajuste + ")" : "") : "") + (nota ? (pct ? " · " : "") + nota : "") });
        K.avisar("Contrato renovado até " + dia(c.fim) + ".");
        aoRenovar(c);
      } catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: "Renovar contrato " + contrato.numero, sub: contrato.clienteNome + " · vigência atual até " + dia(contrato.fim), aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: confirmar, disabled: enviando }, enviando ? "Renovando…" : "Renovar")] },
      h(Aviso, null, erro),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Novo fim da vigência", dica: "Sugestão: mais " + meses + " meses." }, h(Texto, { valor: fim, aoMudar: setFim, type: "date" })),
        h(Campo, { rotulo: "Reajuste (%)", dica: contrato.reajuste ? "Índice do contrato: " + contrato.reajuste : "Opcional" }, h(Texto, { valor: pct, aoMudar: aplicarPct, inputMode: "decimal", placeholder: "Ex.: 4,5" })),
        h(Campo, { rotulo: "Novo valor mensal (R$)", dica: "Atual: " + BRL(contrato.valorMensal) }, h(Texto, { valor: valor, aoMudar: setValor, inputMode: "decimal" }))),
      h(Campo, { rotulo: "Observação" }, h(Texto, { valor: nota, aoMudar: setNota, placeholder: "Ex.: aditivo assinado em 10/01" })),
      h("div", { className: "cel-sub" }, "A renovação fica no acompanhamento e gera uma nova versão. Anexe o aditivo assinado na aba Arquivos."));
  }

  /* ---------- dentro do chamado "Proposta de contrato" ---------- */
  function DoChamado({ chamado, aoFechar }) {
    const [ab, setAb] = useState(false);
    async function abrir() {
      setAb(true);
      try {
        const r = await api("contratos.do_chamado", { chamadoId: chamado.id });
        K.avisar(r.novo ? "Contrato aberto a partir do chamado " + chamado.numero + "." : "Abrindo o contrato deste chamado.");
        aoFechar();
        setTimeout(() => { K.contratoAbrir = r.id; location.hash = "/contratos"; }, 250);
      } catch (x) { K.avisar(x.message, true); setAb(false); }
    }
    return h("div", { className: "ct-pmoc", style: { marginBottom: 14 } },
      h("b", null, "Contrato"), h("span", { className: "cel-sub" }, "A proposta de contrato é montada e acompanhada em CRM › Contratos."),
      h("span", { style: { flex: 1 } }), h("button", { type: "button", className: "bt bt-p bt-marca", onClick: abrir, disabled: ab }, ab ? "Abrindo…" : "Abrir em Contratos"));
  }

  /* ---------- estilos próprios ---------- */
  (function estilo() {
    if (document.getElementById("k-css-contratos")) return;
    const st = document.createElement("style");
    st.id = "k-css-contratos";
    st.textContent = [
      ".ct-pmoc{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--linha,#e1e3e7);border-radius:10px;padding:10px 12px;margin:8px 0 4px}",
      ".ct-arqs{display:grid;gap:6px}.ct-arq{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--linha,#e1e3e7);border-radius:10px;flex-wrap:wrap}",
      ".kpi-alerta .kpi-v{color:#8a6d00}",
      ".kb-modo{display:inline-flex;border:1px solid var(--linha,#e1e3e7);border-radius:9px;overflow:hidden;background:#fff}.kb-modo button{border:0;background:none;padding:0 12px;height:36px;font:inherit;font-size:13px;cursor:pointer;color:#4a5160}.kb-modo button.ativo{background:var(--marca);color:#fff;font-weight:600}",
      ".kb{display:flex;gap:10px;overflow-x:auto;padding-bottom:10px;align-items:flex-start;min-height:60vh}",
      ".kb-col{flex:0 0 250px;background:#f2f4f8;border-radius:12px;padding:8px;border-top:4px solid #c6ccd6;display:flex;flex-direction:column;max-height:calc(100vh - 290px);transition:background .15s}",
      ".kb-funil{border-top-color:#d9a400}.kb-ativo{border-top-color:#0b7d5c}.kb-perdido{border-top-color:#b3261e}.kb-encerrado{border-top-color:#8a92a0}.kb-sobre{background:#e3ebff;outline:2px dashed var(--marca)}",
      ".kb-cab{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 4px 8px}.kb-cab b{font-size:13px}.kb-n{background:#fff;border-radius:10px;font-size:11px;font-weight:700;padding:1px 8px;color:#4a5160}.kb-soma{flex-basis:100%;font-size:11px;color:#6b7280}",
      ".kb-cards{display:flex;flex-direction:column;gap:8px;overflow-y:auto;min-height:40px}.kb-vazio{border:1.5px dashed #c9cfd9;border-radius:10px;padding:14px 8px;text-align:center;font-size:11.5px;color:#9aa1ad}",
      ".kb-card{background:#fff;border:1px solid var(--linha,#e1e3e7);border-radius:10px;padding:9px 10px;cursor:grab;box-shadow:0 1px 2px rgba(16,24,40,.05);display:flex;flex-direction:column;gap:4px}.kb-card:hover{border-color:var(--marca)}.kb-card:active{cursor:grabbing}",
      ".kb-topo{display:flex;justify-content:space-between;font-size:11px;color:#8a92a0}.kb-num{font-weight:700}.kb-cli{font-weight:700;font-size:13px;line-height:1.3}.kb-tit{font-size:12px;color:#4a5160}",
      ".kb-pe{display:flex;justify-content:space-between;align-items:center;font-size:12px}.kb-av{width:24px;height:24px;border-radius:50%;background:#e8efff;color:#1f4fbf;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}",
      ".kb-card .ch-prop{margin:0}.kb-avancar{align-self:flex-start;border:0;background:#eef4ff;color:#1f4fbf;border-radius:6px;font-size:11px;font-weight:600;padding:3px 8px;cursor:pointer}.kb-avancar:hover{background:#dbe6ff}",
      "@media (max-width:760px){.kb-col{flex-basis:78vw;max-height:none}.kb{scroll-snap-type:x mandatory}.kb-col{scroll-snap-align:start}}",
    ].join("\n");
    document.head.appendChild(st);
  })();

  K.Contratos = { DoChamado };
  K.modulos = K.modulos || {};
  K.modulos.contratos = { titulo: "Contratos", icone: "contrato", perfis: ["admin", "comercial", "financeiro", "coord"], grupo: "CRM", Tela: Contratos };
})();
