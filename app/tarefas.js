/* =====================================================================
   KONSTANTE SaaS — app/tarefas.js  (v1.11.0 — calendário com Tarefas + OS)
   v1.28.0: criação rápida igual ao Google Tarefas / To Do — digita e dá Enter;
            detalhes (descrição, data, quem) editados direto na tarefa aberta;
            a descrição aparece embaixo do título na lista.
   Tarefas: lista e calendário, responsáveis (um, vários ou todos),
   checklist com subtarefas, blocos de texto (ata de reunião), repetição,
   comentários, fotos e relatório em PDF.
   Técnico vê as tarefas dele; admin e coordenação veem todas.
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Aviso, Painel } = K;
  const { useState, useEffect, useRef } = React;

  const ST = { aberta: "Pendente", andamento: "Em andamento", aguardando: "Aguardando", feita: "Feita", cancelada: "Cancelada" };
  const ST_COR = { aberta: "os-cinza", andamento: "os-azul", aguardando: "os-amarelo", feita: "os-verde", cancelada: "os-rosa" };
  const PRIO = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };
  const FREQ = { semanal: "Semanal", mensal: "Mensal", trimestral: "Trimestral", anual: "Anual" };
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const dataBR = s => { if (!s) return "—"; const [a, m, d] = String(s).slice(0, 10).split("-"); return d + "/" + m + "/" + a; };
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const hojeISO = () => iso(new Date());
  function quando(t) {
    if (!t.data) return "sem data";
    const hj = hojeISO();
    const amanha = iso(new Date(Date.now() + 86400000));
    const txt = t.data === hj ? "Hoje" : t.data === amanha ? "Amanhã" : dataBR(t.data);
    return txt + (t.hora ? " " + t.hora : "");
  }
  const destino = t => t.paraTodos ? "Todos" : t.responsaveis.length ? t.responsaveis.map(r => r.nome.split(" ")[0]).join(", ") : "sem responsável";
  const escritorio = s => K.temPerfil(s, "admin", "coord", "comercial", "financeiro");   /* v1.22.0 */

  function SeloTarefa({ status }) { return h("span", { className: "selo " + (ST_COR[status] || "os-cinza") }, ST[status] || status); }

  const ATA = () => [
    { rotulo: "Participantes", texto: "" }, { rotulo: "Pauta", texto: "" }, { rotulo: "Discussão / o que foi apurado", texto: "" },
    { rotulo: "Decisões", texto: "" }, { rotulo: "Encaminhamentos e prazos", texto: "" }];

  /* =================================================================
     TELA PRINCIPAL
     ================================================================= */
  function Tarefas({ sessao }) {
    const esc = escritorio(sessao);
    const [op, setOp] = useState(null);
    const [resumo, setResumo] = useState(null);
    const [filtro, setFiltro] = useState("pendentes");
    const [minhas, setMinhas] = useState(!esc);
    const [busca, setBusca] = useState("");
    /* v1.35.0: o botão Calendário da barra de baixo (celular) abre direto no calendário */
    const [aba, setAba] = useState(() => { if (K.tarefasAbrirCalendario) { K.tarefasAbrirCalendario = false; return "calendario"; } return "lista"; });
    /* v1.35.0: calendário mensal, semanal e diário — {vis: mes|semana|dia, d: dia de referência} */
    const [cal, setCalRaw] = useState(() => { let v = "mes"; try { v = localStorage.getItem("k_cal_vis") || "mes"; } catch (e) {} return { vis: ["mes", "semana", "dia"].indexOf(v) >= 0 ? v : "mes", d: hojeISO() }; });
    const setCal = f => setCalRaw(c => { const n = typeof f === "function" ? f(c) : f; try { localStorage.setItem("k_cal_vis", n.vis); } catch (e) {} return n; });
    const [lista, setLista] = useState({ carregando: true, erro: "", itens: null });
    const [osCal, setOsCal] = useState([]);
    const [verOS, setVerOS] = useState(true);
    const [osAberta, setOsAberta] = useState(null);
    const [osOp, setOsOp] = useState(null);
    const [aberta, setAberta] = useState(null);
    const [form, setForm] = useState(null);
    const [rapida, setRapida] = useState(null);      /* v1.28.0: nova rápida pelo calendário {data} */
    const [novas, setNovas] = useState([]);          /* v1.28.0: criadas agora ficam no topo da lista */
    const [txtNova, setTxtNova] = useState("");
    const [criando, setCriando] = useState(false);
    const campoNova = useRef(null);
    const pedido = useRef(0);

    useEffect(() => { api("tarefas.opcoes").then(setOp, e => K.avisar(e.message, true)); }, []);
    function carregarResumo() { api("tarefas.resumo", { minhas: minhas ? 1 : 0 }).then(setResumo, () => {}); }
    function carregar() {
      const n = ++pedido.current;
      setLista(l => Object.assign({}, l, { carregando: true, erro: "" }));
      const f = { filtro, busca: busca.trim(), minhas: minhas ? 1 : 0 };
      if (aba === "calendario") {
        f.filtro = "todas";
        /* todo o período visível (no mês, inclui os dias do mês anterior e do seguinte na grade) */
        const fx = faixaCal(cal);
        f.de = fx.de; f.ate = fx.ate;
        /* OS do mesmo intervalo (o servidor já limita o técnico às OS dele) */
        if (K.OS) api("os.listar", { de: f.de, ate: f.ate, busca: f.busca }).then(
          d => { if (n === pedido.current) setOsCal(d.itens || []); }, () => { if (n === pedido.current) setOsCal([]); });
      }
      api("tarefas.listar", f).then(
        d => { if (n === pedido.current) setLista({ carregando: false, erro: "", itens: d.itens }); },
        e => { if (n === pedido.current) setLista({ carregando: false, erro: e.message, itens: null }); });
    }
    useEffect(carregarResumo, [minhas]); // eslint-disable-line
    useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [filtro, busca, minhas, aba, cal.vis, faixaCal(cal).de]); // eslint-disable-line
    const atualizar = () => { carregar(); carregarResumo(); };

    /* v1.28.0: digitou e deu Enter → a tarefa já aparece na lista (para mim, sem data; o resto se completa ao abrir) */
    async function criarRapida() {
      const titulo = txtNova.trim();
      if (!titulo || criando) return;
      setCriando(true);
      try {
        const t = await api("tarefas.salvar", { titulo, descricao: "", responsaveis: [meuId], paraTodos: false, prioridade: "normal",
          data: filtro === "hoje" ? hojeISO() : "", hora: "", itens: [], blocos: [], recorrencia: "", id: null });
        setTxtNova("");
        setNovas(l => [t.id].concat(l));
        setLista(l => Object.assign({}, l, { itens: [t].concat((l.itens || []).filter(x => x.id !== t.id)) }));
        carregarResumo();
      } catch (x) { K.avisar(x.message, true); }
      setCriando(false);
      setTimeout(() => campoNova.current && campoNova.current.focus(), 0);
    }

    async function concluirRapido(t) {
      const novo = t.status === "feita" ? "aberta" : "feita";
      try {
        const r = await api("tarefas.status", { id: t.id, status: novo });
        K.avisar(novo === "feita" ? "Tarefa concluída." + (r.proxima ? " A próxima foi criada para " + dataBR(r.proxima.data) + "." : "") : "Tarefa reaberta.");
        atualizar();
      } catch (x) { K.avisar(x.message, true); }
    }

    const card = (chave, titulo, n, cls) => h("button", { key: chave, type: "button", className: "kpi kpi-botao" + (filtro === chave ? " ativo" : "") + (cls ? " " + cls : ""),
      onClick: () => { setAba("lista"); setFiltro(filtro === chave ? "pendentes" : chave); } },
      h("div", { className: "kpi-t" }, titulo), h("div", { className: "kpi-v" }, resumo ? String(n) : "…"));
    const chip = (v, r) => h("button", { key: v, type: "button", className: "chip" + (filtro === v ? " ativo" : ""), onClick: () => setFiltro(v) }, r);
    const meuId = sessao.usuario.id;
    /* as criadas agora vêm primeiro (enquanto continuarem na lista) */
    const itens = (() => {
      const l = lista.itens || [];
      if (!novas.length || aba !== "lista") return l;
      const topo = novas.map(id => l.find(t => t.id === id)).filter(Boolean);
      return topo.concat(l.filter(t => novas.indexOf(t.id) < 0));
    })();
    const osDoCal = !verOS ? [] : osCal.filter(o => !minhas || o.responsavelId === meuId || (o.tecnicos || []).some(t => t.id === meuId));
    function abrirOS(id) {
      if (osOp) return setOsAberta(id);
      api("os.opcoes").then(r => { setOsOp(r); setOsAberta(id); }, e => K.avisar(e.message, true));
    }

    return h("div", null,
      h("div", { className: "kpis tf-kpis" },
        card("atrasadas", "Atrasadas", resumo && resumo.atrasadas, resumo && resumo.atrasadas ? "tf-kpi-alerta" : ""),
        card("hoje", "Hoje", resumo && resumo.hoje),
        card("semana", "Próximos 7 dias", resumo && resumo.semana),
        card("semData", "Sem data", resumo && resumo.semData),
        card("feitas", "Feitas no mês", resumo && resumo.feitasMes)),

      h("div", { className: "barra tf-barra" },
        h("div", { className: "tf-seg" },
          h("button", { type: "button", className: "seg" + (aba === "lista" ? " on" : ""), "aria-pressed": aba === "lista", onClick: () => setAba("lista") }, "Lista"),
          h("button", { type: "button", className: "seg" + (aba === "calendario" ? " on" : ""), "aria-pressed": aba === "calendario", onClick: () => setAba("calendario") }, "Calendário")),
        esc ? h("label", { className: "tf-minhas" }, h("input", { type: "checkbox", checked: minhas, onChange: e => setMinhas(e.target.checked) }), " Só as minhas") : null,
        h("input", { className: "entrada-texto busca", placeholder: "Buscar tarefa ou cliente", value: busca, onChange: e => setBusca(e.target.value), "aria-label": "Buscar tarefas" }),
        h("div", { className: "tf-espaco", style: { flex: 1 } }),
        h("button", { className: "bt bt-marca tf-nova", disabled: !op, onClick: () => {
          if (aba === "lista" && filtro !== "feitas") { if (campoNova.current) campoNova.current.focus(); }
          else setRapida({ data: "" });
        } }, "+ Nova tarefa")),

      aba === "lista" ? h("div", { className: "chips" }, chip("pendentes", "Pendentes"), chip("feitas", "Concluídas"), chip("todas", "Todas"),
        ["atrasadas", "hoje", "semana", "semData"].indexOf(filtro) >= 0 ? h("button", { type: "button", className: "chip ativo", onClick: () => setFiltro("pendentes") },
          { atrasadas: "Atrasadas", hoje: "Hoje", semana: "Próximos 7 dias", semData: "Sem data" }[filtro] + " ✕") : null) : null,

      /* v1.28.0: linha de criação rápida, no topo da lista */
      aba === "lista" && filtro !== "feitas" && op ? h("form", { className: "tf-rapida", onSubmit: e => { e.preventDefault(); criarRapida(); } },
        h("span", { className: "tf-rapida-ic", "aria-hidden": true }, "+"),
        h("input", { ref: campoNova, className: "tf-rapida-txt", value: txtNova, maxLength: 200, disabled: criando,
          placeholder: "Adicionar uma tarefa" + (filtro === "hoje" ? " para hoje" : ""), "aria-label": "Adicionar uma tarefa", onChange: e => setTxtNova(e.target.value) }),
        txtNova.trim() ? h("button", { type: "submit", className: "bt bt-p bt-marca", disabled: criando }, criando ? "…" : "Adicionar") : null) : null,

      lista.erro ? h("div", { className: "bloco vazio" }, h(Aviso, null, lista.erro), h("button", { className: "bt", onClick: carregar }, "Tentar de novo"))
      : !lista.itens ? h("div", { className: "bloco vazio" }, "Carregando…")
      : aba === "calendario" ? h(Calendario, { cal, setCal, itens, os: osDoCal, verOS, setVerOS, carregando: lista.carregando, aoAbrir: setAberta, aoAbrirOS: abrirOS, aoNovo: data => setRapida({ data }) })
      : !itens.length ? h("div", { className: "bloco vazio" }, h("strong", null, "Nenhuma tarefa aqui."), filtro === "pendentes" ? "Escreva no campo acima e tecle Enter." : "Confira os filtros.")
      : h("div", { className: "tf-lista", style: { opacity: lista.carregando ? .6 : 1 } }, itens.map(t => h(LinhaTarefa, { key: t.id, t, nova: novas.indexOf(t.id) >= 0, aoAbrir: () => setAberta(t.id), aoConcluir: () => concluirRapido(t) }))),

      rapida && op ? h(NovaRapida, { inicial: rapida, sessao, aoFechar: () => setRapida(null), aoCriar: t => { setRapida(null); atualizar(); setAberta(t.id); } }) : null,
      form && op ? h(FormTarefa, { inicial: form, op, sessao, aoFechar: () => setForm(null), aoSalvar: t => { setForm(null); atualizar(); setAberta(t.id); } }) : null,
      osAberta && osOp && K.OS ? h(K.OS.DetalheOS, { id: osAberta, op: osOp, sessao, aoFechar: () => { setOsAberta(null); carregar(); } }) : null,
      aberta && op ? h(DetalheTarefa, { id: aberta, op, sessao, aoFechar: () => { setAberta(null); atualizar(); }, aoEditar: t => { setAberta(null); setForm(t); } }) : null);
  }

  function LinhaTarefa({ t, nova, aoAbrir, aoConcluir }) {
    const feita = t.status === "feita";
    const desc = String(t.descricao || "").trim();
    return h("div", { className: "tf-item" + (feita ? " feita" : "") + (t.atrasada ? " atrasada" : "") + (nova ? " nova" : "") },
      h("button", { type: "button", className: "tf-check" + (feita ? " ok" : ""), onClick: aoConcluir, title: feita ? "Reabrir" : "Concluir", "aria-label": feita ? "Reabrir tarefa" : "Concluir tarefa" }, feita ? "✓" : ""),
      h("button", { type: "button", className: "tf-item-corpo", onClick: aoAbrir },
        h("div", { className: "tf-item-titulo" }, t.titulo,
          t.prioridade === "alta" || t.prioridade === "urgente" ? h("span", { className: "selo " + (t.prioridade === "urgente" ? "os-rosa" : "os-amarelo") }, PRIO[t.prioridade]) : null,
          t.status !== "aberta" && t.status !== "feita" ? h(SeloTarefa, { status: t.status }) : null),
        desc ? h("div", { className: "tf-item-desc" }, desc) : null,   /* v1.28.0 */
        h("div", { className: "tf-item-meta" },
          t.data || t.atrasada ? h("span", { className: "tf-quando" + (t.atrasada ? " atrasada" : "") }, (t.atrasada ? "⚠ " : "") + quando(t)) : null,
          t.clienteNome ? h("span", null, t.clienteNome) : null,
          t.itensTotal ? h("span", null, "☑ " + t.itensFeitos + "/" + t.itensTotal) : null,
          t.recorrencia ? h("span", { title: "Repete: " + FREQ[t.recorrencia] }, "↻ " + FREQ[t.recorrencia]) : null)),
      h(Responsaveis, { t, aoAbrir }));   /* v1.35.0: coluna Responsável */
  }

  /* v1.35.0: responsáveis da tarefa — bolinhas com as iniciais e o primeiro nome */
  function Responsaveis({ t, aoAbrir }) {
    const r = t.responsaveis || [];
    return h("button", { type: "button", className: "tf-resp", onClick: aoAbrir, title: "Responsável: " + destino(t) },
      t.paraTodos ? h(React.Fragment, null, h("span", { className: "tf-resp-av todos" }, "★"), h("span", { className: "tf-resp-n" }, "Todos"))
      : !r.length ? h("span", { className: "tf-resp-n vazio" }, "Sem responsável")
      : h(React.Fragment, null,
          h("span", { className: "tf-resp-avs" }, r.slice(0, 3).map(x => h(K.Avatar, { key: x.id || x.nome, usuario: x, tam: 30, classe: "tf-resp-av" }))),
          h("span", { className: "tf-resp-n" }, r.length === 1 ? r[0].nome.split(" ")[0] : r[0].nome.split(" ")[0] + " +" + (r.length - 1))));
  }

  /* v1.35.0: período visível do calendário — mês (grade de 6 semanas), semana (seg–dom) ou dia */
  const dDe = x => new Date(x + "T12:00:00");
  const somar = (x, n) => { const d = dDe(x); d.setDate(d.getDate() + n); return iso(d); };
  const segDe = x => { const d = dDe(x); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  function faixaCal(cal) {
    if (cal.vis === "dia") return { de: cal.d, ate: cal.d };
    if (cal.vis === "semana") { const a = segDe(cal.d); return { de: a, ate: somar(a, 6) }; }
    const d = dDe(cal.d); const p1 = new Date(d.getFullYear(), d.getMonth(), 1, 12);
    const a = segDe(iso(p1)); return { de: a, ate: somar(a, 41) };
  }
  const SEM = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const SEM_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  function Calendario({ cal, setCal, itens, os, verOS, setVerOS, carregando, aoAbrir, aoAbrirOS, aoNovo }) {
    const porDia = {};
    itens.forEach(t => { if (t.data) (porDia[t.data] = porDia[t.data] || []).push(Object.assign({ _tipo: "tarefa" }, t)); });
    /* v1.27.0: OS de vários dias ocupa todos os dias, do início ao prazo de término */
    (os || []).forEach(o => {
      if (!o.dataPrev) return;
      const fim = o.prazo && o.prazo > o.dataPrev ? o.prazo : o.dataPrev;
      const d = new Date(o.dataPrev + "T12:00:00"); const dFim = new Date(fim + "T12:00:00");
      const total = Math.round((dFim - d) / 864e5) + 1;
      for (let i = 0; i < 400 && d <= dFim; i++, d.setDate(d.getDate() + 1)) {
        const k = iso(d);
        (porDia[k] = porDia[k] || []).push({ _tipo: "os", id: o.id, hora: i === 0 ? o.horaPrev : null, titulo: "OS " + o.numero + " · " + o.clienteNome + (total > 1 ? " (" + (i + 1) + "/" + total + ")" : ""),
          status: o.status, atrasada: o.atrasada, cont: i > 0, ini: i === 0 && total > 1, fimSeq: i === total - 1 && total > 1, tecnicos: o.tecnicos });
      }
    });
    Object.keys(porDia).forEach(k => porDia[k].sort((a, b) => (a.hora || "99") < (b.hora || "99") ? -1 : (a.hora || "99") > (b.hora || "99") ? 1 : 0));
    const hj = hojeISO();
    const ref = dDe(cal.d);
    function mudar(n) {
      setCal(c => {
        if (c.vis === "dia") return Object.assign({}, c, { d: somar(c.d, n) });
        if (c.vis === "semana") return Object.assign({}, c, { d: somar(c.d, 7 * n) });
        const d = dDe(c.d); const x = new Date(d.getFullYear(), d.getMonth() + n, 1, 12); return Object.assign({}, c, { d: iso(x) });
      });
    }
    const fx = faixaCal(cal);
    const titulo = cal.vis === "mes" ? MESES[ref.getMonth()] + " " + ref.getFullYear()
      : cal.vis === "dia" ? SEM_LONGO[ref.getDay()] + ", " + ref.getDate() + " de " + MESES[ref.getMonth()].toLowerCase() + " de " + ref.getFullYear()
      : (() => { const a = dDe(fx.de), b = dDe(fx.ate); return a.getDate() + (a.getMonth() !== b.getMonth() ? " de " + MESES[a.getMonth()].toLowerCase() : "") + " a " + b.getDate() + " de " + MESES[b.getMonth()].toLowerCase() + " " + b.getFullYear(); })();
    const rotPer = { mes: "mês", semana: "semana", dia: "dia" }[cal.vis];
    const fechadaOS = st => st === "Concluída" || st === "Cancelada";

    const cartao = (t, longo) => t._tipo === "os"
      ? h("button", { key: "os" + t.id, type: "button", className: "tf-cal-t tf-cal-os" + (t.cont ? " cont" : "") + (t.ini ? " ini" : "") + (t.fimSeq ? " fim" : "") + (fechadaOS(t.status) ? " fechada" : "") + (t.atrasada ? " atrasada" : "") + (longo ? " longo" : ""), onClick: () => aoAbrirOS(t.id), title: t.titulo + " — " + t.status },
          t.hora ? h("b", null, t.hora + " ") : null, t.titulo,
          longo ? h("small", null, t.status + ((t.tecnicos || []).length ? " · " + t.tecnicos.map(x => String(x.nome || "").split(" ")[0]).join(", ") : "")) : null)
      : h("button", { key: "t" + t.id, type: "button", className: "tf-cal-t " + (ST_COR[t.status] || "") + (t.atrasada ? " atrasada" : "") + (longo ? " longo" : ""), onClick: () => aoAbrir(t.id), title: t.titulo },
          t.hora ? h("b", null, t.hora + " ") : null, t.titulo,
          longo ? h("small", null, [t.clienteNome, destino(t)].filter(Boolean).join(" · ")) : null);

    let corpo;
    if (cal.vis === "mes") {
      const dias = Array.from({ length: 42 }, (_, i) => dDe(somar(fx.de, i)));
      const ultimaSemanaUsada = dias.slice(35).some(d => d.getMonth() === ref.getMonth());
      corpo = h("div", { className: "tf-cal-grade" },
        SEM.map(d => h("div", { key: d, className: "tf-cal-sem" }, d)),
        (ultimaSemanaUsada ? dias : dias.slice(0, 35)).map(d => {
          const k = iso(d), l = porDia[k] || [];
          return h("div", { key: k, className: "tf-cal-dia" + (d.getMonth() !== ref.getMonth() ? " fora" : "") + (k === hj ? " hoje" : "") },
            h("button", { type: "button", className: "tf-cal-n", onClick: () => setCal({ vis: "dia", d: k }), title: "Ver o dia" }, d.getDate()),
            l.slice(0, 3).map(t => cartao(t)),
            l.length > 3 ? h("button", { type: "button", className: "tf-cal-mais", onClick: () => setCal({ vis: "dia", d: k }) }, "+" + (l.length - 3) + " mais") : null);
        }));
    } else if (cal.vis === "semana") {
      corpo = h("div", { className: "tf-sem-grade" }, Array.from({ length: 7 }, (_, i) => {
        const k = somar(fx.de, i), d = dDe(k), l = porDia[k] || [];
        return h("div", { key: k, className: "tf-sem-col" + (k === hj ? " hoje" : "") },
          h("button", { type: "button", className: "tf-sem-cab", onClick: () => setCal({ vis: "dia", d: k }), title: "Ver o dia" },
            h("span", null, SEM[i]), h("b", null, d.getDate())),
          h("div", { className: "tf-sem-itens" }, l.map(t => cartao(t, true)),
            h("button", { type: "button", className: "tf-sem-nova", onClick: () => aoNovo(k), title: "Nova tarefa neste dia", "aria-label": "Nova tarefa neste dia" }, "+")));
      }));
    } else {
      const l = porDia[cal.d] || [];
      const semHora = l.filter(t => !t.hora);
      const hrDe = t => Math.min(21, Math.max(6, parseInt(String(t.hora).slice(0, 2), 10) || 6));
      const horas = Array.from({ length: 16 }, (_, i) => i + 6);
      corpo = h("div", { className: "tf-dia" },
        h("div", { className: "tf-dia-lin tf-dia-todo" }, h("span", { className: "tf-dia-h" }, "Sem hora"),
          h("div", { className: "tf-dia-itens" }, semHora.length ? semHora.map(t => cartao(t, true)) : h("span", { className: "tf-dia-vz" }, "—"))),
        horas.map(hr => {
          const doH = l.filter(t => t.hora && hrDe(t) === hr);
          const agora = cal.d === hj && new Date().getHours() === hr;
          return h("div", { key: hr, className: "tf-dia-lin" + (agora ? " agora" : "") },
            h("span", { className: "tf-dia-h" }, String(hr).padStart(2, "0") + ":00"),
            h("div", { className: "tf-dia-itens" }, doH.map(t => cartao(t, true))));
        }),
        h("button", { type: "button", className: "bt bt-p tf-dia-nova", onClick: () => aoNovo(cal.d) }, "+ Nova tarefa neste dia"));
    }

    return h("div", { className: "bloco tf-cal", style: { opacity: carregando ? .6 : 1 } },
      h("div", { className: "tf-cal-cab" },
        h("button", { type: "button", className: "bt bt-p", onClick: () => mudar(-1), "aria-label": "Anterior (" + rotPer + ")" }, "‹"),
        h("b", null, titulo),
        h("button", { type: "button", className: "bt bt-p", onClick: () => mudar(1), "aria-label": "Próximo (" + rotPer + ")" }, "›"),
        h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setCal(c => Object.assign({}, c, { d: hojeISO() })) }, "Hoje"),
        h("div", { className: "tf-seg tf-cal-vis", role: "group", "aria-label": "Visualização" },
          [["mes", "Mês"], ["semana", "Semana"], ["dia", "Dia"]].map(([v, r]) => h("button", { key: v, type: "button", className: "seg" + (cal.vis === v ? " on" : ""), "aria-pressed": cal.vis === v, onClick: () => setCal(c => Object.assign({}, c, { vis: v })) }, r))),
        K.OS ? h("label", { className: "tf-minhas tf-cal-leg" }, h("input", { type: "checkbox", checked: verOS, onChange: e => setVerOS(e.target.checked) }), " Mostrar OS ", h("span", { className: "tf-cal-chave" }, "OS")) : null),
      corpo);
  }

  /* =================================================================
     NOVA / EDITAR
     ================================================================= */
  function CampoCliente({ id, nome, aoMudar }) {
    const [aberto, setAberto] = useState(false);
    const [texto, setTexto] = useState("");
    const [itens, setItens] = useState([]);
    const pedido = useRef(0);
    useEffect(() => {
      if (!aberto) return;
      const n = ++pedido.current;
      const t = setTimeout(() => api("clientes.listar", { busca: texto.trim(), ordem: texto.trim() ? "az" : "recentes" })
        .then(d => { if (n === pedido.current) setItens(d.itens.slice(0, 8)); }, () => {}), 250);
      return () => clearTimeout(t);
    }, [texto, aberto]);
    if (!aberto) return h("div", { className: "escolhido" },
      h("span", null, id ? h("b", null, nome) : h("span", { className: "cel-sub" }, "Sem cliente")),
      h("span", { style: { display: "flex", gap: 4 } },
        id ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => aoMudar(null) }, "Tirar") : null,
        h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => { setTexto(""); setAberto(true); } }, id ? "Trocar" : "Escolher")));
    return h("div", { className: "escolhe" },
      h("input", { className: "entrada-texto", autoFocus: true, placeholder: "Nome, CNPJ ou nº do cliente", value: texto, onChange: e => setTexto(e.target.value) }),
      h("div", { className: "escolhe-lista" },
        itens.length ? itens.map(c => h("button", { type: "button", key: c.id, onClick: () => { aoMudar(c); setAberto(false); } },
          h("b", null, c.nome), h("span", null, "nº " + c.numero + (c.endereco ? " · " + c.endereco : ""))))
        : h("div", { className: "cel-sub", style: { padding: 10 } }, texto.trim() ? "Nenhum cliente encontrado." : "Carregando…"),
        h("button", { type: "button", className: "escolhe-cancelar", onClick: () => setAberto(false) }, "Cancelar")));
  }

  /* checklist: tarefas com subtarefas (uma por linha) */
  function EditorItens({ itens, setItens }) {
    const muda = (i, k, v) => setItens(itens.map((it, j) => j !== i ? it : Object.assign({}, it, { [k]: v })));
    return h("div", null,
      itens.map((it, i) => h("div", { key: i, className: "tf-item-edit" },
        h("div", { style: { display: "flex", gap: 6 } },
          h("input", { className: "entrada-texto", value: it.nome, placeholder: "Item (ex.: Sala de reunião)", onChange: e => muda(i, "nome", e.target.value) }),
          h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo", onClick: () => setItens(itens.filter((_, j) => j !== i)), "aria-label": "Remover item" }, "✕")),
        h("textarea", { rows: Math.max(2, (it.subsTxt || "").split("\n").length), placeholder: "Subtarefas (opcional) — uma por linha", value: it.subsTxt || "",
          onChange: e => muda(i, "subsTxt", e.target.value) }))),
      h("button", { type: "button", className: "bt bt-p", onClick: () => setItens(itens.concat([{ nome: "", subsTxt: "" }])) }, "+ Item do checklist"));
  }

  function EditorBlocos({ blocos, setBlocos }) {
    const muda = (i, k, v) => setBlocos(blocos.map((b, j) => j !== i ? b : Object.assign({}, b, { [k]: v })));
    const mover = (i, d) => { const j = i + d; if (j < 0 || j >= blocos.length) return; const c = blocos.slice(); const x = c[i]; c[i] = c[j]; c[j] = x; setBlocos(c); };
    return h("div", null,
      blocos.map((b, i) => h("div", { key: i, className: "tf-bloco-edit" },
        h("div", { style: { display: "flex", gap: 4, alignItems: "center" } },
          h("input", { className: "entrada-texto", value: b.rotulo, placeholder: "Título do bloco (ex.: Decisões)", onChange: e => muda(i, "rotulo", e.target.value), style: { fontWeight: 600 } }),
          h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => mover(i, -1), "aria-label": "Subir" }, "↑"),
          h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => mover(i, 1), "aria-label": "Descer" }, "↓"),
          h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo", onClick: () => setBlocos(blocos.filter((_, j) => j !== i)), "aria-label": "Remover bloco" }, "✕")),
        h("textarea", { rows: 3, value: b.texto, placeholder: "Pode deixar em branco e preencher depois.", onChange: e => muda(i, "texto", e.target.value) }))),
      h("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
        h("button", { type: "button", className: "bt bt-p", onClick: () => setBlocos(blocos.concat([{ rotulo: "", texto: "" }])) }, "+ Bloco de texto"),
        !blocos.length ? h("button", { type: "button", className: "bt bt-p", onClick: () => setBlocos(ATA()) }, "📋 Modelo de ata de reunião") : null));
  }

  /* v1.28.0: nova tarefa pelo calendário — só o título (e o dia); o resto se completa na própria tarefa */
  function NovaRapida({ inicial, sessao, aoFechar, aoCriar }) {
    const [titulo, setTitulo] = useState("");
    const [data, setData] = useState(inicial.data || "");
    const [enviando, setEnviando] = useState(false);
    async function criar() {
      if (!titulo.trim()) return K.avisar("Escreva a tarefa.", true);
      setEnviando(true);
      try {
        const t = await api("tarefas.salvar", { titulo: titulo.trim(), descricao: "", responsaveis: [sessao.usuario.id], paraTodos: false, prioridade: "normal",
          data, hora: "", itens: [], blocos: [], recorrencia: "", id: null });
        K.avisar("Tarefa criada."); aoCriar(t);
      } catch (x) { K.avisar(x.message, true); setEnviando(false); }
    }
    return h(Painel, { titulo: "Nova tarefa", aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", onClick: criar, disabled: enviando }, enviando ? "Criando…" : "Criar")] },
      h("form", { onSubmit: e => { e.preventDefault(); criar(); } },
        h(Campo, { rotulo: "Tarefa" }, h(Texto, { valor: titulo, aoMudar: setTitulo, autoFocus: true, placeholder: "Ex.: Ligar para o síndico" })),
        h(Campo, { rotulo: "Data" }, h(Texto, { valor: data, aoMudar: setData, type: "date" })),
        h("p", { className: "cel-sub" }, "Depois de criar, abra a tarefa para pôr descrição, hora, responsáveis e checklist.")));
  }

  function FormTarefa({ inicial, op, sessao, aoFechar, aoSalvar }) {
    const novo = !inicial.id;
    const esc = escritorio(sessao);
    const [f, setF] = useState(() => Object.assign({
      titulo: "", descricao: "", clienteId: null, clienteNome: "", endereco: "", data: "", hora: "", prioridade: "normal",
      paraTodos: false, recorrencia: "", recorrenciaAte: "", status: "aberta",
    }, inicial, {
      responsaveis: inicial.responsaveis ? inicial.responsaveis.map(r => r.id) : (novo ? [sessao.usuario.id] : []),
      data: inicial.data || "", hora: inicial.hora || "", recorrencia: inicial.recorrencia || "", recorrenciaAte: inicial.recorrenciaAte || "",
    }));
    const [itens, setItens] = useState(() => (inicial.itens || []).map(it => ({ nome: it.nome, feito: it.feito, subs: it.subs || [], subsTxt: (it.subs || []).map(s => s.nome).join("\n") })));
    const [blocos, setBlocos] = useState(() => (inicial.blocos || []).map(b => ({ rotulo: b.rotulo, texto: b.texto })));
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(p => Object.assign({}, p, { [k]: v }));

    async function salvar() {
      setErro("");
      if (!f.titulo.trim()) return setErro("Descreva a tarefa.");
      if (f.recorrencia && !f.data) return setErro("Para repetir a tarefa, informe a data.");
      if (!f.paraTodos && !f.responsaveis.length && !(await K.confirmar({ titulo: "Tarefa sem responsável?", texto: "Ninguém vai receber esta tarefa. Ela fica só para você e o escritório.", botao: "Salvar assim" }))) return;
      /* subtarefas: mantém o "feito" das que já existiam com o mesmo nome */
      const its = itens.map(it => {
        const antes = {}; (it.subs || []).forEach(s => { antes[s.nome] = s.feito; });
        const subs = (it.subsTxt || "").split("\n").map(s => s.trim()).filter(Boolean).map(n => ({ nome: n, feito: !!antes[n] }));
        return { nome: (it.nome || "").trim(), feito: subs.length ? subs.every(s => s.feito) : !!it.feito, subs };
      }).filter(it => it.nome || it.subs.length);
      setEnviando(true);
      try {
        const t = await api("tarefas.salvar", Object.assign({}, f, { itens: its, blocos, id: inicial.id || null }));
        K.avisar(novo ? "Tarefa criada." : "Tarefa salva.");
        aoSalvar(t);
      } catch (x) { setErro(x.message); setEnviando(false); }
    }

    const marcado = id => f.responsaveis.indexOf(id) >= 0;
    return h(Painel, { titulo: novo ? "Nova tarefa" : "Editar tarefa", largo: true, aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : novo ? "Criar tarefa" : "Salvar")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "O que precisa ser feito" }, h(Texto, { valor: f.titulo, aoMudar: mudar("titulo"), autoFocus: novo, placeholder: "Ex.: Levar orçamento para o síndico" })),
      h(Campo, { rotulo: "Detalhes" }, h("textarea", { value: f.descricao || "", onChange: e => mudar("descricao")(e.target.value), rows: 3 })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Data" }, h(Texto, { valor: f.data, aoMudar: mudar("data"), type: "date" })),
        h(Campo, { rotulo: "Hora" }, h(Texto, { valor: f.hora, aoMudar: mudar("hora"), type: "time" })),
        h(Campo, { rotulo: "Prioridade" }, h("select", { value: f.prioridade, onChange: e => mudar("prioridade")(e.target.value) },
          op.prioridades.map(p => h("option", { key: p, value: p }, PRIO[p])))),
        !novo ? h(Campo, { rotulo: "Status" }, h("select", { value: f.status, onChange: e => mudar("status")(e.target.value) },
          op.status.map(s => h("option", { key: s, value: s }, ST[s])))) : null),
      h("div", { className: "linha-campos" },
        esc ? h("div", { className: "campo" }, h("span", null, "Cliente (opcional)"),
          h(CampoCliente, { id: f.clienteId, nome: f.clienteNome, aoMudar: c => setF(p => Object.assign({}, p, { clienteId: c ? c.id : null, clienteNome: c ? c.nome : "", endereco: p.endereco || (c && c.endereco) || "" })) }))
          : f.clienteId ? h(Campo, { rotulo: "Cliente" }, h("div", { className: "escolhido" }, h("b", null, f.clienteNome))) : null,
        h(Campo, { rotulo: "Endereço (opcional)" }, h(Texto, { valor: f.endereco || "", aoMudar: mudar("endereco") }))),
      h("div", { className: "campo" }, h("span", null, "Para quem"),
        h("div", { className: "chips" },
          h("button", { type: "button", className: "chip" + (f.paraTodos ? " ativo" : ""), "aria-pressed": f.paraTodos, onClick: () => mudar("paraTodos")(!f.paraTodos) }, (f.paraTodos ? "✓ " : "") + "👥 Todos"),
          f.paraTodos ? null : op.equipe.map(u => h("button", { type: "button", key: u.id, className: "chip" + (marcado(u.id) ? " ativo" : ""), "aria-pressed": marcado(u.id),
            onClick: () => mudar("responsaveis")(marcado(u.id) ? f.responsaveis.filter(x => x !== u.id) : f.responsaveis.concat([u.id])) }, (marcado(u.id) ? "✓ " : "") + u.nome)))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Repetir" }, h("select", { value: f.recorrencia, onChange: e => mudar("recorrencia")(e.target.value) },
          h("option", { value: "" }, "Não se repete"), op.frequencias.map(q => h("option", { key: q, value: q }, FREQ[q])))),
        f.recorrencia ? h(Campo, { rotulo: "Repetir até (opcional)", dica: "Ao concluir, a próxima nasce sozinha." }, h(Texto, { valor: f.recorrenciaAte, aoMudar: mudar("recorrenciaAte"), type: "date" })) : null),
      h("div", { className: "secao-titulo" }, "Checklist"),
      h(EditorItens, { itens, setItens }),
      h("div", { className: "secao-titulo" }, "Blocos de texto"),
      h("p", { className: "cel-sub", style: { marginTop: -6 } }, "Campos livres com o título que quiser. Transformam a tarefa em ata de reunião, laudo ou relato."),
      h(EditorBlocos, { blocos, setBlocos }));
  }

  /* =================================================================
     DETALHE
     ================================================================= */
  function DetalheTarefa({ id, op, sessao, aoFechar, aoEditar }) {
    K.useReabrir("tarefa", id);   /* v1.27.0 */
    const [t, setT] = useState(null);
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [coment, setComent] = useState("");
    const [blocos, setBlocos] = useState(null);      // edição dos textos
    const [foto, setFoto] = useState(null);
    const [enviandoFoto, setEnviandoFoto] = useState(0);
    const [ed, setEd] = useState(null);
    const [sub, setSub] = useState(null);   /* v1.28.1: ocorrência (OS) aberta a partir da solicitação, ou OS ligada aberta */   /* v1.28.0: edição direto na tarefa (título, descrição, data, hora, prioridade, quem) */
    const baseEd = r => ({ titulo: r.titulo || "", descricao: r.descricao || "", data: r.data || "", hora: r.hora || "", prioridade: r.prioridade || "normal",
      paraTodos: !!r.paraTodos, responsaveis: (r.responsaveis || []).map(x => x.id) });

    useEffect(() => { api("tarefas.obter", { id }).then(r => { setT(r); setBlocos(r.blocos); setEd(baseEd(r)); }, e => setErro(e.message)); }, [id]);
    async function acao(nome, dados, ok) {
      setOcupado(true);
      try { const r = await api(nome, Object.assign({ id: t.id }, dados)); setT(r); if (nome !== "tarefas.checklist") setBlocos(r.blocos); if (ok) K.avisar(ok); return r; }
      catch (x) { K.avisar(x.message, true); return null; }
      finally { setOcupado(false); }
    }
    async function mudarStatus(st) {
      const r = await acao("tarefas.status", { status: st }, st === "feita" ? "Tarefa concluída." : "Status: " + ST[st] + ".");
      if (r && r.proxima) K.avisar("Tarefa concluída. A próxima foi criada para " + dataBR(r.proxima.data) + ".");
    }
    function marcar(i, j) {
      const its = t.itens.map((it, a) => {
        if (a !== i) return it;
        const c = Object.assign({}, it, { subs: (it.subs || []).map(s => Object.assign({}, s)) });
        if (j == null) { c.feito = !c.feito; if (c.subs.length) c.subs.forEach(s => { s.feito = c.feito; }); }
        else { c.subs[j].feito = !c.subs[j].feito; c.feito = c.subs.every(s => s.feito); }
        return c;
      });
      setT(Object.assign({}, t, { itens: its }));
      acao("tarefas.checklist", { itens: its });
    }
    async function enviarFotos(e) {
      const arqs = Array.from(e.target.files || []); e.target.value = "";
      if (!arqs.length) return;
      setEnviandoFoto(arqs.length);
      const comprimir = (K.OS && K.OS.comprimir) || (a => Promise.resolve(a));
      for (const a of arqs) {
        try { const b = await comprimir(a); const r = await K.enviarArquivo("tarefas.anexo.enviar", b, { id: t.id }); setT(r); }
        catch (x) { K.avisar(x.message, true); }
        setEnviandoFoto(n => n - 1);
      }
    }
    async function apagarFoto(f) {
      if (!(await K.confirmar({ titulo: "Apagar esta foto?", botao: "Apagar", perigo: true }))) return;
      if (await acao("tarefas.anexo.excluir", { anexoId: f.id }, "Foto apagada.")) setFoto(null);
    }
    /* v1.28.0: grava os dados básicos sem mexer no checklist, blocos e repetição */
    async function salvarEd() {
      if (!ed.titulo.trim()) return K.avisar("A tarefa precisa de um título.", true);
      setOcupado(true);
      try {
        const r = await api("tarefas.salvar", Object.assign({}, ed, {
          id: t.id, titulo: ed.titulo.trim(), status: t.status, clienteId: t.clienteId, endereco: t.endereco || "",
          itens: t.itens || [], blocos: t.blocos || [], recorrencia: t.recorrencia || "", recorrenciaAte: t.recorrenciaAte || "",
          responsaveis: ed.paraTodos ? [] : ed.responsaveis }));
        setT(Object.assign({}, t, r)); setEd(baseEd(r)); K.avisar("Tarefa salva.");
      } catch (x) { K.avisar(x.message, true); }
      setOcupado(false);
    }
    async function excluir() {
      if (!(await K.confirmar({ titulo: "Excluir a tarefa?", texto: t.titulo, botao: "Excluir", perigo: true }))) return;
      try { await api("tarefas.excluir", { id: t.id }); K.avisar("Tarefa excluída."); aoFechar(); } catch (x) { K.avisar(x.message, true); }
    }

    if (erro) return h(Painel, { titulo: "Tarefa", aoFechar }, h(Aviso, null, erro));
    if (!t) return h(Painel, { titulo: "Tarefa", aoFechar, largo: true }, h("div", { className: "vazio" }, "Carregando…"));
    if (foto && K.OS && K.OS.VerFoto) return h(K.OS.VerFoto, { foto, fotos: t.anexos, podeApagar: f => t.podeEditar || f.autorId === sessao.usuario.id, aoApagar: apagarFoto, aoFechar: () => setFoto(null) });

    const blocosMudaram = JSON.stringify(blocos) !== JSON.stringify(t.blocos);
    const edita = t.podeEditar && ed;
    const edMudou = edita && JSON.stringify(ed) !== JSON.stringify(baseEd(t));
    const mudaEd = k => v => setEd(p => Object.assign({}, p, { [k]: v }));
    async function fechar() {
      if (edMudou && await K.confirmar({ titulo: "Salvar as alterações?", texto: "Você mudou os dados da tarefa.", botao: "Salvar" })) await salvarEd();
      aoFechar();
    }
    const rodape = [];
    if (t.podeEditar) rodape.push(h("button", { key: "x", className: "bt bt-leve bt-perigo", style: { marginRight: "auto" }, onClick: excluir }, "Excluir"));
    rodape.push(h("button", { key: "r", className: "bt", onClick: () => relatorio(t, sessao) }, "Relatório PDF"));
    if (t.podeEditar) rodape.push(h("button", { key: "e", className: "bt", onClick: () => aoEditar(Object.assign({}, t, edMudou ? { titulo: ed.titulo, descricao: ed.descricao, data: ed.data, hora: ed.hora, prioridade: ed.prioridade } : {})), title: "Checklist, blocos de texto, cliente, endereço e repetição" }, "Mais opções"));
    /* v1.21.0: sem botão grande de concluir no rodapé (concluía sem querer). Concluir = status "Feita" no topo. */
    if (edMudou) rodape.push(h("button", { key: "d", className: "bt bt-leve", onClick: () => setEd(baseEd(t)) }, "Desfazer"),
      h("button", { key: "s", className: "bt bt-marca", disabled: ocupado, onClick: salvarEd }, ocupado ? "Salvando…" : "Salvar"));
    rodape.push(h("button", { key: "f", className: "bt" + (edMudou ? "" : " bt-marca"), onClick: fechar }, "Fechar"));

    const marcado = uid => ed && ed.responsaveis.indexOf(uid) >= 0;
    /* v1.28.1: solicitação do cliente — o que se faz aqui aparece para ele na área do cliente */
    const ehSol = t.tipo === "Solicitação do cliente";
    const podeOS = ehSol && t.clienteId && K.PMOC && K.PMOC.FormOcorrencia && K.temPerfil(sessao, "admin", "coord", "tecnico");
    function recarregar() { api("tarefas.obter", { id: t.id }).then(r => { setT(r); setBlocos(r.blocos); setEd(baseEd(r)); }, () => {}); }
    function novaOS() { K.PMOC.opcoes().then(op2 => setSub({ tipo: "oco", op: op2 }), x => K.avisar(x.message, true)); }
    function abrirOS(oid) { api("os.opcoes").then(op2 => setSub({ tipo: "os", id: oid, op: op2 }), x => K.avisar(x.message, true)); }
    if (sub && sub.tipo === "oco") return h(K.PMOC.FormOcorrencia, { clienteId: t.clienteId, clienteNome: t.clienteNome, op: sub.op, sessao,
      tarefa: { id: t.id, texto: t.titulo.replace(/^Solicitação: /, "") + (t.descricao ? "\n" + String(t.descricao).replace(/\n\nEnviada pela área do cliente por [\s\S]*$/, "") : "") },
      aoFechar: () => setSub(null), aoCriar: () => { setSub(null); recarregar(); } });
    if (sub && sub.tipo === "os" && K.OS) return h(K.OS.DetalheOS, { id: sub.id, op: sub.op, sessao, aoFechar: () => { setSub(null); recarregar(); } });
    return h(Painel, { titulo: edita ? "Tarefa" : t.titulo, sub: (t.clienteNome ? t.clienteNome + " · " : "") + "criada por " + (t.criadorNome || "—") + " em " + dataBR(t.criadoEm), largo: true, aoFechar: fechar, rodape },
      /* v1.28.0: título e descrição editáveis direto, como no Google Tarefas */
      edita ? h("div", { className: "tf-ed" },
        h("input", { className: "tf-ed-titulo", value: ed.titulo, maxLength: 200, onChange: e => mudaEd("titulo")(e.target.value), "aria-label": "Título da tarefa" }),
        h("textarea", { className: "tf-ed-desc", rows: Math.max(2, Math.min(10, String(ed.descricao).split("\n").length + 1)), value: ed.descricao, placeholder: "Adicionar detalhes",
          onChange: e => mudaEd("descricao")(e.target.value), "aria-label": "Detalhes da tarefa" }),
        h("div", { className: "tf-ed-linha" },
          h("label", null, h("span", null, "Data"), h("input", { type: "date", className: "entrada-texto", value: ed.data, onChange: e => mudaEd("data")(e.target.value) })),
          h("label", null, h("span", null, "Hora"), h("input", { type: "time", className: "entrada-texto", value: ed.hora, onChange: e => mudaEd("hora")(e.target.value) })),
          h("label", null, h("span", null, "Prioridade"), h("select", { className: "entrada-texto", value: ed.prioridade, onChange: e => mudaEd("prioridade")(e.target.value) },
            op.prioridades.map(p => h("option", { key: p, value: p }, PRIO[p]))))),
        h("div", { className: "tf-ed-quem" }, h("span", null, "Para quem"),
          h("div", { className: "chips" },
            h("button", { type: "button", className: "chip" + (ed.paraTodos ? " ativo" : ""), "aria-pressed": ed.paraTodos, onClick: () => mudaEd("paraTodos")(!ed.paraTodos) }, (ed.paraTodos ? "✓ " : "") + "👥 Todos"),
            ed.paraTodos ? null : op.equipe.map(u => h("button", { type: "button", key: u.id, className: "chip" + (marcado(u.id) ? " ativo" : ""), "aria-pressed": marcado(u.id),
              onClick: () => mudaEd("responsaveis")(marcado(u.id) ? ed.responsaveis.filter(x => x !== u.id) : ed.responsaveis.concat([u.id])) }, (marcado(u.id) ? "✓ " : "") + u.nome))))) : null,
      ehSol ? h("div", { className: "tf-sol" },
        h("b", null, "Solicitação do cliente"),
        h("span", null, "O cliente acompanha esta tarefa pela área dele: vê o status, os comentários, as fotos e as OS abertas para ela. Use os comentários para responder."),
        (t.osLigadas || []).length ? h("div", { className: "tf-sol-os" }, (t.osLigadas || []).map(o => h("button", { key: o.id, type: "button", className: "bt bt-p", onClick: () => abrirOS(o.id) }, "OS " + o.numero + " · " + o.status))) : null,
        podeOS ? h("div", null, h("button", { type: "button", className: "bt bt-p bt-marca", onClick: novaOS }, (t.osLigadas || []).length ? "+ Outra OS para esta solicitação" : "Abrir OS / registrar atendimento")) : null) : null,
      /* v1.39.0: veio do formulário público de solicitação — não está ligada a cliente; a conferência é manual */
      t.tipo === "Solicitação pelo link" ? h("div", { className: "tf-sol" },
        h("b", null, "Solicitação pelo link"),
        h("span", null, "Recebida pelo formulário público. Não está ligada a nenhum cliente: confira o cadastro (veja na descrição se há cliente parecido) antes de atender. Quem pediu não vê esta tarefa.")) : null,
      h("div", { className: "secao-titulo", style: { marginTop: 0 } }, "Status"),
      h("div", { className: "chips", style: { marginBottom: 12 } },
        op.status.filter(s => s !== "cancelada" || t.podeEditar).map(s => h("button", { key: s, type: "button", disabled: ocupado,
          className: "chip" + (t.status === s ? " ativo" : "") + (s === "feita" ? " tf-chip-feita" : ""), onClick: () => t.status !== s && mudarStatus(s) }, s === "feita" ? "✓ " + ST[s] : ST[s]))),
      h("div", { className: "tf-info" + (edita ? " tf-info-min" : "") },
        edita ? null : h("div", null, h("span", null, "Quando"), h("b", { className: t.atrasada ? "atrasada" : "" }, (t.atrasada ? "⚠ " : "") + quando(t))),
        edita ? null : h("div", null, h("span", null, "Para quem"), h("b", null, destino(t))),
        edita ? null : h("div", null, h("span", null, "Prioridade"), h("b", null, PRIO[t.prioridade])),
        t.clienteNome ? h("div", null, h("span", null, "Cliente"), h("b", null, t.clienteNome)) : null,
        t.recorrencia ? h("div", null, h("span", null, "Repete"), h("b", null, FREQ[t.recorrencia] + (t.recorrenciaAte ? " até " + dataBR(t.recorrenciaAte) : ""))) : null,
        t.endereco ? h("div", null, h("span", null, "Endereço"), h("b", null, t.endereco, " ",
          h("a", { href: "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(t.endereco), target: "_blank", rel: "noopener", className: "cel-sub" }, "Abrir no Maps"))) : null,
        t.feitaEm ? h("div", null, h("span", null, "Concluída em"), h("b", null, K.dataHora(t.feitaEm))) : null),
      !edita && t.descricao ? h("div", { className: "tf-desc" }, t.descricao) : null,

      t.itens.length ? h(React.Fragment, null,
        h("div", { className: "secao-titulo" }, "Checklist · " + t.itensFeitos + "/" + t.itensTotal),
        t.itens.map((it, i) => h("div", { key: i, className: "tf-chk" },
          h("label", { className: "tf-chk-item" + (it.feito ? " feito" : "") },
            h("input", { type: "checkbox", checked: !!it.feito, disabled: ocupado, onChange: () => marcar(i, null) }), h("b", null, it.nome)),
          (it.subs || []).map((s, j) => h("label", { key: j, className: "tf-chk-sub" + (s.feito ? " feito" : "") },
            h("input", { type: "checkbox", checked: !!s.feito, disabled: ocupado, onChange: () => marcar(i, j) }), s.nome))))) : null,

      blocos && blocos.length ? h(React.Fragment, null,
        h("div", { className: "secao-titulo" }, "Registro"),
        blocos.map((b, i) => h(Campo, { key: i, rotulo: b.rotulo || "Bloco " + (i + 1) },
          h("textarea", { rows: Math.max(3, String(b.texto || "").split("\n").length + 1), value: b.texto,
            onChange: e => setBlocos(blocos.map((x, j) => j !== i ? x : Object.assign({}, x, { texto: e.target.value }))) }))),
        blocosMudaram ? h("div", { style: { display: "flex", justifyContent: "flex-end", gap: 6 } },
          h("button", { type: "button", className: "bt bt-p", onClick: () => setBlocos(t.blocos) }, "Desfazer"),
          h("button", { type: "button", className: "bt bt-p bt-marca", disabled: ocupado, onClick: () => acao("tarefas.blocos", { blocos }, "Texto salvo.") }, "Salvar texto")) : null) : null,

      h("div", { className: "secao-titulo" }, "Fotos" + (t.anexos.length ? " · " + t.anexos.length : "")),
      t.anexos.length ? h("div", { className: "os-fotos" }, t.anexos.map(f => h("button", { key: f.id, type: "button", className: "os-foto", onClick: () => setFoto(f) },
        h("img", { src: K.urlAnexo(f.id), alt: f.legenda || "Foto", loading: "lazy" })))) : null,
      enviandoFoto ? h("span", { className: "bt bt-p disabled" }, "Enviando " + enviandoFoto + "…")
      : h("span", { className: "os-foto-bts" },
          h("label", { className: "bt bt-p" }, "📷 Câmera", h("input", { type: "file", accept: "image/*", capture: "environment", onChange: enviarFotos, style: { display: "none" } })),
          h("label", { className: "bt bt-p" }, "🖼 Galeria", h("input", { type: "file", accept: "image/*", multiple: true, onChange: enviarFotos, style: { display: "none" } }))),

      h("div", { className: "secao-titulo" }, "Comentários" + (t.comentarios.length ? " · " + t.comentarios.length : "")),
      t.comentarios.map(c => h("div", { key: c.id, className: "os-evento" },
        h("div", { className: "cel-sub" }, K.dataHora(c.criadoEm) + (c.autor ? " · " + c.autor : "")), h("div", { style: { whiteSpace: "pre-wrap" } }, c.texto))),
      h("div", { style: { display: "flex", gap: 6, marginTop: 8 } },
        h("textarea", { rows: 2, value: coment, placeholder: "Escreva um comentário", onChange: e => setComent(e.target.value), style: { flex: 1 } }),
        h("button", { type: "button", className: "bt", disabled: ocupado || !coment.trim(), onClick: async () => { if (await acao("tarefas.comentar", { texto: coment })) setComent(""); } }, "Enviar")));
  }

  /* relatório da tarefa (serve de ata) — abre para imprimir / salvar em PDF */
  async function relatorio(t, sessao) {
    const w = window.open("", "_blank");
    if (!w) return K.avisar("Permita pop-ups para gerar o relatório.", true);
    w.document.write("<p style='font-family:sans-serif;padding:20px'>Montando o relatório…</p>");
    let c = {};
    try { c = (await api("config.ler")).config || {}; } catch (e) { /* técnico não lê config */ }
    const e = sessao.empresa || {};
    const emp = Object.assign({ nome: e.nome, razao_social: e.razaoSocial, cnpj: e.cnpj }, c.empresa || {});
    const cor = /^#[0-9a-f]{6}$/i.test(e.corPrimaria || "") ? e.corPrimaria : "#111111";
    const abs = id => new URL(K.urlAnexo(id), location.href).href;
    const es = s => String(s == null ? "" : s).replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
    const br = s => es(s).replace(/\n/g, "<br>");
    const chk = t.itens.map(it => "<tr><td><b>" + (it.feito ? "☑" : "☐") + " " + es(it.nome) + "</b>" +
      (it.subs || []).map(s => '<div class="sub">' + (s.feito ? "☑" : "☐") + " " + es(s.nome) + "</div>").join("") + "</td></tr>").join("");
    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + es(t.titulo) + "</title><style>" +
      "@page{size:A4;margin:14mm}*{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}body{margin:0;color:#1a1d21;font-size:12.5px}" +
      ".top{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid " + cor + ";padding-bottom:12px}.top img{height:44px;max-width:170px;object-fit:contain}.bn{font-size:18px;font-weight:700;color:" + cor + "}" +
      ".co{text-align:right;font-size:10.5px;color:#4a5160;line-height:1.5}h1{font-size:17px;color:" + cor + ";margin:18px 0 10px}h2{font-size:13px;color:" + cor + ";margin:18px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}" +
      ".grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;background:#f4f6fb;border:1px solid #e5e5e5;border-radius:8px;padding:10px 14px}.grid span{color:#6b7280}" +
      "table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid #eef1f6;vertical-align:top}.sub{margin:3px 0 0 18px;font-weight:400}" +
      ".txt{line-height:1.55;white-space:normal}.ev{margin-bottom:6px}.ev span{color:#6b7280;font-size:11px}" +
      ".fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.fotos img{width:100%;height:150px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb}" +
      ".noprint{text-align:center;margin:18px 0}.noprint button{background:" + cor + ";color:#fff;border:0;border-radius:8px;padding:9px 18px;cursor:pointer}@media print{.noprint{display:none}}" +
      "</style></head><body>" +
      '<div class="top"><div style="display:flex;gap:12px;align-items:center">' + (e.logoId ? '<img src="' + abs(e.logoId) + '">' : "") + '<div class="bn">' + es(emp.nome || "") + '</div></div><div class="co">' +
        [emp.razao_social, emp.cnpj ? "CNPJ " + emp.cnpj : "", emp.endereco, [emp.telefone, emp.email].filter(Boolean).join(" · ")].filter(Boolean).map(es).join("<br>") + "</div></div>" +
      "<h1>" + es(t.titulo) + "</h1>" +
      '<div class="grid">' +
        "<div><span>Data:</span> " + es(t.data ? dataBR(t.data) + (t.hora ? " " + t.hora : "") : "—") + "</div><div><span>Status:</span> " + es(ST[t.status]) + "</div>" +
        "<div><span>Responsáveis:</span> " + es(destino(t)) + "</div><div><span>Cliente:</span> " + es(t.clienteNome || "—") + "</div>" +
        (t.endereco ? "<div><span>Endereço:</span> " + es(t.endereco) + "</div>" : "") + (t.feitaEm ? "<div><span>Concluída em:</span> " + es(K.dataHora(t.feitaEm)) + "</div>" : "") + "</div>" +
      (t.descricao ? "<h2>Detalhes</h2><div class=\"txt\">" + br(t.descricao) + "</div>" : "") +
      t.blocos.filter(b => b.texto || b.rotulo).map(b => "<h2>" + es(b.rotulo || "Registro") + '</h2><div class="txt">' + (b.texto ? br(b.texto) : "—") + "</div>").join("") +
      (t.itens.length ? "<h2>Checklist (" + t.itensFeitos + "/" + t.itensTotal + ")</h2><table><tbody>" + chk + "</tbody></table>" : "") +
      (t.anexos.length ? '<h2>Fotos</h2><div class="fotos">' + t.anexos.map(f => '<img src="' + abs(f.id) + '">').join("") + "</div>" : "") +
      (t.comentarios.length ? "<h2>Comentários</h2>" + t.comentarios.map(c => '<div class="ev"><span>' + es(K.dataHora(c.criadoEm)) + (c.autor ? " · " + es(c.autor) : "") + "</span><br>" + br(c.texto) + "</div>").join("") : "") +
      '<div class="noprint"><button onclick="window.print()">Imprimir / Salvar PDF</button></div></body></html>';
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
  }

  K.Tarefas = { FormTarefa, DetalheTarefa, SeloTarefa, ST, PRIO };
  K.modulos = K.modulos || {};
  K.modulos.tarefas = { titulo: "Tarefas", icone: "tarefas", perfis: ["admin", "comercial", "financeiro", "coord", "tecnico"], grupo: "Operacional", Tela: Tarefas };
})();
