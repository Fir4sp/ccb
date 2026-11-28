/* =====================================================================
   KONSTANTE SaaS — app/pmoc.js  (v1.13.0)
   PMOC: planos anuais por cliente, equipamentos (TAG + local), formulários
   (checklists com periodicidade), apontamento mensal do técnico por
   equipamento (OK / Não OK / NF / N/A, medições, observação, pendências e fotos),
   mapa anual, relatório do mês e documento do PMOC.
   O apontamento funciona sem internet: fica no aparelho e sobe sozinho.
   v1.13.0: tela do cliente (apontar o mês, ocorrência, instalação nova, máquinas),
   histórico do equipamento, etiquetas e leitor de QR, área do cliente.
   v1.18.0: técnico vê só os planos em que está escalado; tipos de equipamento configuráveis.
   v1.34.0: checklist OK / Não OK / NF / N/A (mesmo padrão da OS) com legenda; status pelo resultado
            (Não OK = Pendência, NF = Executado parcialmente, só OK/N/A = Executado); aba Histórico da
            máquina dentro do apontamento (o que foi feito em cada item nos meses anteriores).
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Aviso, Painel } = K;
  const { useState, useEffect } = React;

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const MES3 = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const PER = { M: 1, T: 3, S: 6, A: 12 };
  const PER_TXT = { M: "Mensal", T: "Trimestral", S: "Semestral", A: "Anual" };
  /* v1.34.0: "an" continua sendo o código gravado do Não OK (o histórico antigo não muda) */
  const AP = [{ v: "ok", l: "OK", t: "Conforme" }, { v: "an", l: "Não OK", t: "Não conforme" }, { v: "nf", l: "NF", t: "Não feito" }, { v: "na", l: "N/A", t: "Não aplicável" }];
  const AP_TXT = { ok: "OK", an: "Não OK", nf: "NF", na: "N/A" };
  /* resultado do apontamento: Não OK pesa mais que NF; N/A conta como executado */
  const resultadoDe = itens => { const l = Object.keys(itens || {}).map(k => itens[k]); return l.indexOf("an") >= 0 ? "pendencia" : l.indexOf("nf") >= 0 ? "parcial" : "executado"; };
  const RES = { executado: ["Executado", "os-verde"], parcial: ["Executado parcialmente", "os-laranja"], pendencia: ["Pendência", "os-rosa"] };
  const resDe = (p, eid, m) => (((p.resMapa || {})[eid] || {})[m]) || "executado";
  const LegendaAp = () => h("div", { className: "os-legenda" },
    h("span", null, h("b", { className: "lg-ok" }, "OK"), " conforme"),
    h("span", null, h("b", { className: "lg-prob" }, "Não OK"), " não conforme"),
    h("span", null, h("b", { className: "lg-nf" }, "NF"), " não feito"),
    h("span", null, h("b", { className: "lg-na" }, "N/A"), " não aplicável"));
  /* v1.35.0: letra da periodicidade no começo do item (sem prazo declarado = M) */
  const Letra = ({ per }) => { const x = PER_TXT[per] ? per : "M"; return h("span", { className: "pm-letra pm-l-" + x, title: PER_TXT[x] }, x); };
  const LegendaPer = () => h("div", { className: "os-legenda pm-leg-per" },
    ["M", "T", "S", "A"].map(x => h("span", { key: x }, h(Letra, { per: x }), " " + PER_TXT[x].toLowerCase())));
  const LEG_DOC = "Legenda dos apontamentos: OK — conforme; Não OK — não conforme, com registro de pendência; NF — não feito; N/A — não aplicável ao equipamento. Status: Executado (todos os itens OK ou N/A), Executado parcialmente (algum item NF) e Pendência (algum item Não OK).";
  const escritorio = s => K.temPerfil(s, "admin", "coord");   /* v1.22.0: soma dos perfis */
  /* v1.38.0: periodicidade das visitas do plano — meses em que há serviço (mensal = os 12) */
  const FREQ_TXT = { M: "Mensal", T: "Trimestral", S: "Semestral", A: "Anual" };
  const mesesFreq = (freq, ini) => { const passo = PER[freq] || 1; if (passo === 1) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; const l = []; for (let m = ini || 1; m <= 12; m += passo) l.push(m); return l; };
  const mesesDe = p => p && p.mesesServico && p.mesesServico.length ? p.mesesServico : mesesFreq(p && p.frequencia, p && p.mesInicio);
  const vence = (per, mes, ini) => { const off = (((mes - ini) % 12) + 12) % 12; return off % (PER[per] || 1) === 0; };
  const es = s => String(s == null ? "" : s).replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
  const br = s => es(s).replace(/\n/g, "<br>");
  const dataHoraBR = s => s ? String(s).slice(8, 10) + "/" + String(s).slice(5, 7) + "/" + String(s).slice(0, 4) + " " + String(s).slice(11, 16) : "";
  const btu = n => n ? Number(n).toLocaleString("pt-BR") + " BTU/h" : "";
  const descEquip = e => [e.tipo, btu(e.capacidadeBtu), e.marca, e.modelo].filter(Boolean).join(" · ");
  const STATUS = { feita: ["Feito", "os-verde"], andamento: ["Em andamento", "os-amarelo"], prevista: ["Pendente", "os-cinza"] };
  /* v1.34.0: apontamento concluído mostra o resultado no lugar de "Feito" */
  const stVisita = v => !v ? STATUS.prevista : v.status === "feita" ? RES[v.resultado || resultadoDe(v.itens)] : (STATUS[v.status] || STATUS.prevista);
  /* v1.18.0: tipos de equipamento da empresa (PMOC › Tipos de equipamento). Guardado ao carregar pmoc.opcoes. */
  let TIPOS = null;
  const guardarTipos = o => { if (o && Array.isArray(o.tipos)) TIPOS = o.tipos; return o; };
  const chaveTipo = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const tipoDe = nome => (TIPOS || []).find(x => chaveTipo(x.nome) === chaveTipo(nome)) || null;

  /* itens previstos no mês, com a chave "secao-item" usada nas respostas */
  function itensDoMes(secoes, mes, ini) {
    return (secoes || []).map((s, si) => ({
      titulo: s.titulo, tipo: s.tipo,
      itens: s.itens.map((it, ii) => Object.assign({ k: si + "-" + ii }, it)).filter(it => s.tipo === "medicao" || vence(it.per || "M", mes, ini)),
    })).filter(s => s.itens.length);
  }

  /* =================================================================
     TELA PRINCIPAL
     ================================================================= */
  function Pmoc({ sessao }) {
    const esc = escritorio(sessao);
    const hoje = new Date();
    const [aba, setAba] = useState("planos");
    const [op, setOp] = useState(null);
    const [ano, setAno] = useState(hoje.getFullYear());
    const [mes, setMes] = useState(hoje.getMonth() + 1);
    const [busca, setBusca] = useState("");
    const [lista, setLista] = useState({ carregando: true, erro: "", itens: null });
    /* v1.35.1: vindo do Início ("Meu PMOC do mês") já abre o plano */
    const [aberto, setAberto] = useState(() => { const x = K.pmocAbrirPlano; K.pmocAbrirPlano = null; return x || null; });
    const [novo, setNovo] = useState(false);
    const [cliente, setCliente] = useState(null);   /* v1.13.0: tela do cliente */
    const [leitor, setLeitor] = useState(false);
    const [qr, setQr] = useState(null);

    useEffect(() => { api("pmoc.opcoes").then(o => setOp(guardarTipos(o)), e => K.avisar(e.message, true)); }, []);
    /* chegou pela etiqueta QR (q/ redireciona para ?qr=código#/pmoc) */
    useEffect(() => {
      const t = new URLSearchParams(location.search).get("qr");
      if (t) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} setQr({ token: t.toLowerCase() }); }
    }, []);
    function carregar() {
      setLista(l => Object.assign({}, l, { carregando: true, erro: "" }));
      api("pmoc.listar", { ano, mes, busca: busca.trim() }).then(d => setLista({ carregando: false, erro: "", itens: d.itens }),
        e => setLista({ carregando: false, erro: e.message, itens: null }));
    }
    useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [ano, mes, busca]); // eslint-disable-line
    useEffect(() => K.offline ? K.offline.aoSincronizar(carregar) : undefined, [ano, mes, busca]); // eslint-disable-line

    const anos = []; for (let a = hoje.getFullYear() + 1; a >= hoje.getFullYear() - 3; a--) anos.push(a);
    const itens = lista.itens || [];
    /* v1.38.0: "Apontados no mês" só conta os planos que têm visita naquele mês */
    const tot = itens.reduce((a, p) => { const noMes = mesesDe(p).indexOf(mes) >= 0;
      return { eq: a.eq + p.equipamentos, eqMes: a.eqMes + (noMes ? p.equipamentos : 0), f: a.f + (noMes ? p.feitasMes : 0), pend: a.pend + p.pendencias }; }, { eq: 0, eqMes: 0, f: 0, pend: 0 });

    return h("div", null,
      esc ? h("div", { className: "tf-seg", style: { marginBottom: 14 } },
        h("button", { type: "button", className: "seg" + (aba === "planos" ? " on" : ""), onClick: () => setAba("planos") }, "Planos"),
        h("button", { type: "button", className: "seg" + (aba === "forms" ? " on" : ""), onClick: () => setAba("forms") }, "Formulários"),
        h("button", { type: "button", className: "seg" + (aba === "tipos" ? " on" : ""), onClick: () => setAba("tipos") }, "Tipos de equipamento")) : null,

      aba === "tipos" && esc ? h(TiposEquip, { op, setOp }) :
      aba === "forms" && esc ? h(Formularios, { op, setOp }) : h(React.Fragment, null,
        h("div", { className: "kpis" },
          kpi("Planos em " + ano, lista.itens ? String(itens.length) : "…"),
          kpi("Equipamentos", lista.itens ? String(tot.eq) : "…"),
          kpi("Apontados em " + MES3[mes - 1], lista.itens ? tot.f + " de " + tot.eqMes : "…", tot.eqMes && tot.f === tot.eqMes ? "kpi-forte" : ""),
          kpi("Pendências abertas", lista.itens ? String(tot.pend) : "…", tot.pend ? "tf-kpi-alerta" : "")),
        h("div", { className: "barra" },
          h("select", { className: "entrada-texto", value: ano, onChange: e => setAno(+e.target.value), "aria-label": "Ano", style: { width: "auto" } }, anos.map(a => h("option", { key: a, value: a }, a))),
          h("select", { className: "entrada-texto", value: mes, onChange: e => setMes(+e.target.value), "aria-label": "Mês", style: { width: "auto" } }, MESES.map((m, i) => h("option", { key: i, value: i + 1 }, m))),
          h("input", { className: "entrada-texto busca", placeholder: "Buscar cliente", value: busca, onChange: e => setBusca(e.target.value) }),
          h("div", { style: { flex: 1 } }),
          h("button", { className: "bt", onClick: () => setLeitor(true) }, "Ler QR"),
          esc ? h("button", { className: "bt bt-marca", disabled: !op, onClick: () => setNovo(true) }, "+ Novo plano") : null),
        lista.erro ? h("div", { className: "bloco vazio" }, h(Aviso, null, lista.erro), h("button", { className: "bt", onClick: carregar }, "Tentar de novo"))
        : !lista.itens ? h("div", { className: "bloco vazio" }, "Carregando…")
        : !itens.length ? h("div", { className: "bloco vazio" }, h("strong", null, "Nenhum plano PMOC em " + ano + "."), esc ? "Crie pelo botão + Novo plano." : "Quando o escritório escalar você num plano, ele aparece aqui.")
        : h("div", { className: "pm-cards", style: { opacity: lista.carregando ? .6 : 1 } }, itens.map(p => {
            const pct = p.equipamentos ? Math.round(p.feitasMes / p.equipamentos * 100) : 0;
            return h("button", { key: p.id, type: "button", className: "pm-card", onClick: () => setCliente({ clienteId: p.clienteId, ano }) },
              h("div", { className: "pm-card-t" }, p.clienteNome),
              h("div", { className: "cel-sub" }, p.equipamentos + " equipamento(s)" + (p.responsavelTecnico ? " · RT " + p.responsavelTecnico : "")),
              h("div", { className: "pm-barra" }, h("i", { style: { width: pct + "%" } })),
              h("div", { className: "pm-card-pe" }, h("span", null, mesesDe(p).indexOf(mes) >= 0 ? MES3[mes - 1] + ": " + p.feitasMes + "/" + p.equipamentos   /* v1.38.0 */
                : (FREQ_TXT[p.frequencia] || "") + " · sem visita em " + MES3[mes - 1] + (mesesDe(p).find(x => x > mes) ? " · próxima: " + MES3[mesesDe(p).find(x => x > mes) - 1] : "")),
                p.pendencias ? h("span", { className: "selo os-rosa" }, p.pendencias + " pendência(s)") : null,
                esc && p.escalados === 0 ? h("span", { className: "selo os-amarelo", title: "Técnicos não veem este plano até alguém ser escalado" }, "Sem técnico escalado") : null));   /* v1.18.0 */
          }))),

      novo && op ? h(FormPlano, { op, sessao, inicial: { ano }, aoFechar: () => setNovo(false), aoSalvar: p => { setNovo(false); carregar(); setAberto(p.id); } }) : null,
      aberto && op ? h(DetalhePlano, { id: aberto, mesInicial: mes, op, sessao, aoFechar: () => { setAberto(null); carregar(); } }) : null,
      cliente && op ? h(ClientePmoc, { clienteId: cliente.clienteId, ano: cliente.ano, op, sessao, aoFechar: () => { setCliente(null); carregar(); } }) : null,
      leitor ? h(LeitorQR, { aoFechar: () => setLeitor(false), aoLer: x => { setLeitor(false); setQr(x); } }) : null,
      qr ? h(QrAbrir, { token: qr.token, id: qr.id, sessao, aoFechar: () => { setQr(null); carregar(); } }) : null);
  }
  const kpi = (t, v, cls) => h("div", { className: "kpi" + (cls ? " " + cls : "") }, h("div", { className: "kpi-t" }, t), h("div", { className: "kpi-v" }, v));

  /* =================================================================
     NOVO PLANO / DADOS DO PLANO
     ================================================================= */
  function FormPlano({ op, sessao, inicial, plano, aoFechar, aoSalvar }) {
    const eu = op.equipe.find(x => x.id === sessao.usuario.id);
    const [f, setF] = useState(() => plano ? {
      responsavelTecnico: plano.responsavelTecnico || "", registro: plano.registro || "", art: plano.art || "", endereco: plano.endereco || "", regime: plano.regime || "",
      mesInicio: plano.mesInicio, frequencia: plano.frequencia || "M", tecnicos: plano.tecnicos.slice(), obs: plano.obs || "" } : {
      clienteId: null, clienteNome: "", ano: inicial.ano, mesInicio: 1, frequencia: "M", responsavelTecnico: sessao.usuario.nome, registro: (eu && eu.registro) || "",
      art: "", endereco: "", tecnicos: [], obs: "" });
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    const m = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    const tec = op.equipe.filter(x => x.perfil === "tecnico" || x.perfil === "coord" || x.perfil === "admin");
    async function salvar() {
      setErro(""); setSalvando(true);
      try {
        const d = Object.assign({}, f, plano ? { id: plano.id, mes: plano.mes } : {});
        const r = await api("pmoc.salvar", d);
        K.avisar(plano ? "Plano salvo." : "Plano criado. Agora inclua os equipamentos.");
        aoSalvar(r);
      } catch (x) { setErro(x.message); } finally { setSalvando(false); }
    }
    const anos = []; for (let a = new Date().getFullYear() + 1; a >= new Date().getFullYear() - 2; a--) anos.push(a);
    return h(Painel, { titulo: plano ? "Dados do plano" : "Novo plano PMOC", aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", disabled: salvando || (!plano && !f.clienteId), onClick: salvar }, salvando ? "Salvando…" : "Salvar")] },
      h(Aviso, null, erro),
      !plano ? h("div", { className: "campo" }, h("span", null, "Cliente"),
        K.CRM && K.CRM.EscolheCliente ? h(K.CRM.EscolheCliente, { valor: f.clienteId, rotulo: f.clienteNome, aoEscolher: c => setF(x => Object.assign({}, x, { clienteId: c ? c.id : null, clienteNome: c ? c.nome : "" })) }) : null) : null,
      !plano ? h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Ano do plano" }, h("select", { className: "entrada-texto", value: f.ano, onChange: e => m("ano")(+e.target.value) }, anos.map(a => h("option", { key: a, value: a }, a)))),
        h(Campo, { rotulo: "Mês de início", dica: "Base das tarefas trimestrais, semestrais e anuais" }, h("select", { className: "entrada-texto", value: f.mesInicio, onChange: e => m("mesInicio")(+e.target.value) }, MESES.map((x, i) => h("option", { key: i, value: i + 1 }, x)))))
        : h(Campo, { rotulo: "Mês de início", dica: "Base das tarefas trimestrais, semestrais e anuais" }, h("select", { className: "entrada-texto", value: f.mesInicio, onChange: e => m("mesInicio")(+e.target.value) }, MESES.map((x, i) => h("option", { key: i, value: i + 1 }, x)))),
      h(Campo, { rotulo: "Periodicidade das visitas", dica: "Meses de serviço em " + (plano ? plano.ano : f.ano) + ": " + mesesFreq(f.frequencia, f.mesInicio).map(x => MESES[x - 1]).join(", ") + ". O calendário mostra só esses meses." },
        h("select", { className: "entrada-texto", value: f.frequencia, onChange: e => m("frequencia")(e.target.value) }, ["M", "T", "S", "A"].map(x => h("option", { key: x, value: x }, FREQ_TXT[x])))),   /* v1.38.0 */
      h("div", { className: "secao-titulo" }, "Responsável técnico"),
      h(Campo, { rotulo: "Nome" }, h(Texto, { valor: f.responsavelTecnico, aoMudar: m("responsavelTecnico") })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Registro (CREA / CFT)" }, h(Texto, { valor: f.registro, aoMudar: m("registro") })),
        h(Campo, { rotulo: "ART / TRT" }, h(Texto, { valor: f.art, aoMudar: m("art") }))),
      h(Campo, { rotulo: "Endereço do imóvel", dica: "Em branco usa o endereço do cadastro do cliente" }, h(Texto, { valor: f.endereco, aoMudar: m("endereco") })),
      h(Campo, { rotulo: "Regime de atendimento", dica: "Sai no Livro e no PMOC do mês" }, h(Texto, { valor: f.regime || "", aoMudar: m("regime"), placeholder: regimeTxt({ frequencia: f.frequencia }), list: "pm-regimes" })),   /* v1.16.0 */
      h("datalist", { id: "pm-regimes" }, ["Equipe volante — visita mensal programada", "Equipe volante — visita trimestral programada", "Equipe volante — visita semestral programada", "Equipe residente — técnico fixo no local"].map(t => h("option", { key: t, value: t }))),
      h("div", { className: "secao-titulo" }, "Equipe que executa"),
      h("p", { className: "cel-sub", style: { marginTop: -6 } }, "Só os técnicos marcados veem o plano. Sem ninguém marcado, ele fica só com o escritório."),
      h("div", { className: "pm-tecs" }, tec.map(t => h("label", { key: t.id, className: "tf-minhas" },
        h("input", { type: "checkbox", checked: f.tecnicos.indexOf(t.id) >= 0, onChange: e => m("tecnicos")(e.target.checked ? f.tecnicos.concat([t.id]) : f.tecnicos.filter(x => x !== t.id)) }), " " + t.nome))),
      h(Campo, { rotulo: "Observações do plano" }, h("textarea", { value: f.obs, onChange: e => m("obs")(e.target.value), rows: 3 })));
  }

  /* =================================================================
     DETALHE DO PLANO
     v1.27.0: abre na VISÃO DO ANO (como no painel antigo): documentos,
     responsabilidade técnica, normas do cliente, técnico do ano e a grade
     dos 12 meses (status, progresso, técnico, data prevista, documento).
     Tocar num mês abre os equipamentos daquele mês para apontar.
     ================================================================= */
  const NORMAS_ADICIONAIS = [
    ["RDC ANVISA nº 50/2002", "Projeto físico de estabelecimentos assistenciais de saúde. Aplicável a clínicas, hospitais e centros cirúrgicos."],
    ["ABNT NBR 7256", "Tratamento de ar em estabelecimentos assistenciais de saúde — requisitos para projeto e execução."],
    ["ABNT NBR 16101", "Filtros para remoção de partículas suspensas no ar — determinação da eficiência."],
    ["ABNT NBR 15848", "Sistemas de ar-condicionado e ventilação — procedimentos e requisitos de construção, reformas, operação e manutenção."],
    ["NR-10", "Segurança em instalações e serviços em eletricidade, aplicável às intervenções em quadros e circuitos de alimentação."],
  ];
  function resumoMes(p, m) {
    const tot = p.equipamentos.length;
    let f = 0, a = 0, pen = 0, par = 0;
    p.equipamentos.forEach(e => { const s = (p.mapa[e.id] || {})[m];
      if (s === "feita") { f++; const r = resDe(p, e.id, m); if (r === "pendencia") pen++; else if (r === "parcial") par++; } else if (s === "andamento") a++; });
    const hoje = new Date(); const ano = hoje.getFullYear(), mh = hoje.getMonth() + 1;
    const passado = p.ano < ano || (p.ano === ano && m < mh);
    const atual = p.ano === ano && m === mh;
    const st = tot && f === tot ? (pen ? RES.pendencia : par ? RES.parcial : RES.executado) : f + a > 0 ? (passado ? ["Incompleto", "os-rosa"] : ["Em andamento", "os-amarelo"]) : passado && tot ? ["Atrasado", "os-rosa"] : ["Pendente", "os-cinza"];
    return { tot, f, a, st, passado, atual, pen, par };
  }

  function DetalhePlano({ id, mesInicial, vistaInicial, op, sessao, aoFechar }) {
    const esc = escritorio(sessao);
    const [vista, setVista] = useState(vistaInicial || "ano");
    const [mes, setMes] = useState(mesInicial);
    const [p, setP] = useState(null);
    const [erro, setErro] = useState("");
    const [aba, setAba] = useState("mes");
    const [apont, setApont] = useState(null);
    const [editando, setEditando] = useState(false);
    const [resolv, setResolv] = useState(null);
    const [oco, setOco] = useState(null);
    const [salvando, setSalvando] = useState(false);
    function carregar(mm) { api("pmoc.obter", { id, mes: mm || mes }).then(r => { setP(r); setErro(""); }, e => setErro(e.message)); }
    useEffect(() => carregar(mes), [id, mes]); // eslint-disable-line
    useEffect(() => K.offline ? K.offline.aoSincronizar(() => carregar()) : undefined, [id, mes]); // eslint-disable-line

    if (erro && !p) return h(Painel, { titulo: "PMOC", aoFechar }, h(Aviso, null, erro));
    if (!p) return h(Painel, { titulo: "PMOC", aoFechar, largo: true }, h("div", { className: "vazio" }, "Carregando…"));

    const feitas = p.equipamentos.filter(e => p.visitas[e.id] && p.visitas[e.id].status === "feita").length;
    async function excluir() {
      if (!(await K.confirmar({ titulo: "Excluir o plano PMOC " + p.ano + "?", texto: "Os apontamentos continuam guardados no histórico.", botao: "Excluir", perigo: true }))) return;
      try { await api("pmoc.excluir", { id: p.id }); K.avisar("Plano excluído."); aoFechar(); } catch (x) { K.avisar(x.message, true); }
    }
    async function gravar(dados, aviso) {
      setSalvando(true);
      try { const r = await api("pmoc.salvar", Object.assign({ id: p.id, mes: p.mes }, dados)); setP(r); if (aviso) K.avisar(aviso); return r; }
      catch (x) { K.avisar(x.message, true); } finally { setSalvando(false); }
    }
    /* documento técnico de um mês qualquer: abre a janela já (evita bloqueio de pop-up) e busca o mês */
    function docMes(m) {
      if (m === p.mes) return relatorioMes(p, sessao);
      const w = abrirJanela("o documento"); if (!w) return;
      api("pmoc.obter", { id: p.id, mes: m }).then(r => relatorioMes(r, sessao, w), x => { w.close(); K.avisar(x.message, true); });
    }
    const abrirMes = m => { setMes(m); setAba("mes"); setVista("mes"); };
    const resolver = pd => { const e = p.equipamentos.find(x => x.id === pd.equipamentoId); setResolv(Object.assign({ tag: e ? e.tag : "" }, pd)); };
    const tab = (k, t) => h("button", { key: k, type: "button", className: "seg" + (aba === k ? " on" : ""), onClick: () => setAba(k) }, t);
    const nomeEq = eid => { const e = p.equipamentos.find(x => x.id === eid); return e ? e.tag + (e.ambiente ? " · " + e.ambiente : "") : "Equipamento removido"; };
    const nForms = Object.keys(p.modelos || {}).length;

    const filhos = h(React.Fragment, null,
      editando ? h(FormPlano, { op, sessao, plano: p, aoFechar: () => setEditando(false), aoSalvar: r => { setEditando(false); setP(r); } }) : null,
      resolv ? h(ResolverPend, { pd: resolv, aoFechar: () => setResolv(null), aoResolvido: () => { setResolv(null); carregar(); } }) : null,
      oco ? h(FormOcorrencia, { clienteId: p.clienteId, clienteNome: p.clienteNome, op, sessao, pend: oco, aoFechar: () => setOco(null), aoCriar: () => { setOco(null); carregar(); } }) : null,
      apont ? h(Apontamento, { p, equip: apont, sessao, aoFechar: () => setApont(null),
        aoSalvar: v => setP(x => { const n = Object.assign({}, x, { visitas: Object.assign({}, x.visitas, { [apont.id]: v }) });
          const mp = Object.assign({}, n.mapa); mp[apont.id] = Object.assign({}, mp[apont.id] || {}, { [x.mes]: v.status }); n.mapa = mp;
          const rm = Object.assign({}, n.resMapa || {}); const re = Object.assign({}, rm[apont.id] || {});   /* v1.34.0 */
          if (v.status === "feita") re[x.mes] = v.resultado || resultadoDe(v.itens); else delete re[x.mes];
          rm[apont.id] = re; n.resMapa = rm; return n; }) }) : null);

    /* ---------------- VISÃO DO ANO ---------------- */
    if (vista === "ano") {
      const meses = mesesDe(p);   /* v1.38.0: só os meses de serviço */
      const mDoc = meses.filter(x => x <= p.mes).pop() || meses[0];
      return h(Painel, {
        titulo: "PMOC " + p.ano + " · " + p.clienteNome, largo: true, aoFechar,
        sub: regimeTxt(p) + (p.frequencia && p.frequencia !== "M" ? " · " + FREQ_TXT[p.frequencia] + ": " + meses.map(x => MES3[x - 1]).join(", ") : "") + " · " + p.equipamentos.length + " máquina(s)" + (nForms ? " · " + nForms + " formulário(s)" : ""),
        rodape: [K.temPerfil(sessao, "admin") ? h("button", { key: "x", className: "bt bt-leve bt-perigo", onClick: excluir }, "Excluir plano") : null,
                 h("div", { key: "esp", style: { flex: 1 } }),
                 h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
        h("div", { className: "pm-ano-docs" },
          h("button", { type: "button", className: "bt bt-marca", onClick: () => relatorioAcompanhamento(p, sessao) }, "Relatório anual"),
          h("button", { type: "button", className: "bt", onClick: () => docMes(mDoc) }, "Documento técnico (" + MES3[mDoc - 1] + ")"),
          h("button", { type: "button", className: "bt", onClick: () => documentoPmoc(p, sessao) }, "Livro do PMOC"),
          esc ? h("button", { type: "button", className: "bt", onClick: () => { setAba("equip"); setVista("mes"); } }, "Máquinas do plano") : null,
          esc ? h("button", { type: "button", className: "bt", onClick: () => setEditando(true) }, "Dados do plano") : null),
        /* v1.39.0: endereço do imóvel com botão de rota, logo na abertura do plano */
        p.endereco ? h("div", { className: "pm-mapa" }, h("div", { className: "cel-sub", style: { marginBottom: 6 } }, "📍 " + p.endereco), h(K.BotoesMapa, { endereco: p.endereco, pequeno: true })) : null,

        p.pendencias.length ? h("button", { type: "button", className: "pm-ano-pend", onClick: () => { setAba("pend"); setVista("mes"); } },
          h("b", null, p.pendencias.length + " pendência(s) aberta(s)"), h("span", null, "Ver e resolver ›")) : null,

        esc ? h(AnoTodo, { p, op, salvando, gravar }) : null,

        h("div", { className: "pm-grade" }, meses.map(m => {
          const r = resumoMes(p, m);
          const pct = r.tot ? Math.round(r.f / r.tot * 100) : 0;
          const tecId = (p.tecMes && p.tecMes[m]) || "";
          const prev = (p.prevMes && p.prevMes[m]) || "";
          return h("div", { key: m, className: "pm-mes" + (r.atual ? " atual" : "") + (r.st[0] === "Atrasado" || r.st[0] === "Incompleto" ? " atraso" : "") },
            h("button", { type: "button", className: "pm-mes-cab", onClick: () => abrirMes(m), title: "Abrir os equipamentos de " + MESES[m - 1] },
              h("b", null, MESES[m - 1]), h("span", { className: "selo " + r.st[1] }, r.st[0])),
            h("button", { type: "button", className: "pm-mes-prog", onClick: () => abrirMes(m) },
              h("span", null, r.f + "/" + r.tot + " apontadas" + (r.a ? " · " + r.a + " em andamento" : "")),
              h("div", { className: "pm-barra" }, h("i", { style: { width: pct + "%" } }))),
            esc ? h("label", { className: "pm-mes-campo" }, h("span", null, "Técnico"),
              h("select", { className: "entrada-texto" + (tecId ? "" : " pm-sem-tec"), value: tecId, disabled: salvando,
                onChange: e => gravar({ tecMes: { [m]: e.target.value ? +e.target.value : null } }, e.target.value ? "Técnico de " + MESES[m - 1] + " salvo." : MESES[m - 1] + " sem técnico.") },
                h("option", { value: "" }, "— sem técnico —"), equipeOrd(op).map(t => h("option", { key: t.id, value: t.id }, t.nome))))
              : h("div", { className: "pm-mes-campo" }, h("span", null, "Técnico"), h("b", null, (p.tecMesNomes && p.tecMesNomes[m]) || "—")),
            esc ? h("label", { className: "pm-mes-campo" }, h("span", null, "Data prevista"),
              h("input", { className: "entrada-texto", type: "date", value: prev, disabled: salvando,
                onChange: e => gravar({ prevMes: { [m]: e.target.value || null } }, "Data de " + MESES[m - 1] + " salva.") }))
              : prev ? h("div", { className: "pm-mes-campo" }, h("span", null, "Data prevista"), h("b", null, dataBRc(prev))) : null,
            h("div", { className: "pm-mes-pe" },
              h("button", { type: "button", className: "bt bt-p", onClick: () => abrirMes(m) }, r.atual && r.f < r.tot ? "Apontar" : "Abrir"),
              h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => docMes(m) }, "Documento")));
        })),
        h("div", { className: "pm-ano-blocos", style: { marginTop: 16 } },
          h(BlocoRT, { p, esc, salvando, gravar }),
          h(BlocoNormas, { p, esc, salvando, gravar })),
        filhos);
    }

    /* ---------------- VISÃO DO MÊS (apontar) ---------------- */
    const mServ = mesesDe(p);   /* v1.38.0: ‹ › pulam para o mês de serviço anterior/seguinte */
    const mesAnt = mServ.filter(x => x < mes).pop() || 0, mesProx = mServ.find(x => x > mes) || 0;
    return h(Painel, {
      titulo: "PMOC " + p.ano + " · " + p.clienteNome, largo: true, aoFechar,
      sub: p.equipamentos.length + " equipamento(s)" + (p.responsavelTecnico ? " · RT " + p.responsavelTecnico : "") + (p.registro ? " (" + p.registro + ")" : ""),
      rodape: [h("button", { key: "v", className: "bt", onClick: () => setVista("ano") }, "‹ Ano todo"),
               h("div", { key: "esp", style: { flex: 1 } }),
               h("button", { key: "r", className: "bt", onClick: () => relatorioMes(p, sessao) }, "Documento do mês"),
               h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      h("div", { className: "pm-mesnav" },
        h("button", { type: "button", className: "bt bt-p", onClick: () => setVista("ano"), "aria-label": "Voltar ao ano" }, "‹ Ano"),
        h("button", { type: "button", className: "bt bt-p", disabled: !mesAnt, onClick: () => setMes(mesAnt), "aria-label": "Mês anterior" }, "‹"),
        h("b", null, MESES[mes - 1] + " " + p.ano),
        h("button", { type: "button", className: "bt bt-p", disabled: !mesProx, onClick: () => setMes(mesProx), "aria-label": "Próximo mês" }, "›"),
        h("span", { className: "cel-sub" }, feitas + " de " + p.equipamentos.length + " apontado(s)"),
        p.tecMesNomes && p.tecMesNomes[mes] ? h("span", { className: "cel-sub" }, "· técnico: " + p.tecMesNomes[mes]) : null),
      /* v1.39.0: endereço do imóvel (plano ou cadastro do cliente) com botão de rota */
      p.endereco ? h("div", { className: "pm-mapa" }, h("div", { className: "cel-sub", style: { marginBottom: 6 } }, "📍 " + p.endereco), h(K.BotoesMapa, { endereco: p.endereco, pequeno: true })) : null,
      h("div", { className: "tf-seg pm-abas" }, tab("mes", "Equipamentos do mês"), tab("mapa", "Mapa anual"), tab("pend", "Pendências" + (p.pendencias.length ? " (" + p.pendencias.length + ")" : "")),
        esc ? tab("equip", "Montar plano") : null),

      aba === "mes" ? (!p.equipamentos.length
        ? h("div", { className: "vazio" }, h("strong", null, "Nenhum equipamento no plano."), esc ? "Use a aba Montar plano para incluir os equipamentos do cliente." : "O escritório ainda não incluiu os equipamentos.")
        : h(ListaMes, { p, aoApontar: setApont }))
      : aba === "mapa" ? h(MapaAnual, { p, aoMes: m => { setMes(m); setAba("mes"); } })
      : aba === "pend" ? (!p.pendencias.length ? h("div", { className: "vazio" }, "Nenhuma pendência aberta neste plano.")
        : h("div", { className: "pm-lista" }, p.pendencias.map(pd => h("div", { key: pd.visitaId + pd.id, className: "pm-pend" },
            h("div", null, h("b", null, pd.texto), h("div", { className: "cel-sub" }, nomeEq(pd.equipamentoId) + " · " + MES3[pd.mes - 1] + (pd.prioridade ? " · " + pd.prioridade : "") + (pd.material ? " · material: " + pd.material : "") + " · aberta por " + (pd.por || "—") + " em " + dataHoraBR(pd.em))),
            h("div", { className: "pm-eq-d" },
              pd.osNumero ? h("span", { className: "selo os-azul" }, "OS " + pd.osNumero)
                : h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => { const e = p.equipamentos.find(x => x.id === pd.equipamentoId); setOco(Object.assign({ ano: p.ano, tag: e ? e.tag : "" }, pd)); } }, "Ocorrência"),
              h("button", { type: "button", className: "bt bt-p", onClick: () => resolver(pd) }, "Resolver"))))))
      : aba === "equip" ? h(MontarPlano, { p, op, aoSalvar: r => { setP(r); setVista("ano"); } })
      : null,
      filhos);
  }
  const linha = (r, v) => h("div", { className: "os-info" }, h("span", null, r), h("b", null, v));
  const equipeOrd = op => ((op && op.equipe) || []).filter(x => x.perfil === "tecnico" || x.perfil === "coord" || x.perfil === "admin")
    .slice().sort((a, b) => (a.perfil === "tecnico" ? 0 : 1) - (b.perfil === "tecnico" ? 0 : 1) || a.nome.localeCompare(b.nome, "pt-BR"));

  /* lista dos equipamentos do mês: primeiro os que faltam, com busca quando o plano é grande */
  function ListaMes({ p, aoApontar }) {
    const [filtro, setFiltro] = useState("");
    const [so, setSo] = useState("todos");
    const lista = p.equipamentos.filter(e => {
      const v = p.visitas[e.id]; const st = v ? v.status : "prevista";
      if (so === "faltam" && st === "feita") return false;
      if (so === "feitos" && st !== "feita") return false;
      return casa(e, filtro);
    });
    const faltam = p.equipamentos.filter(e => !(p.visitas[e.id] && p.visitas[e.id].status === "feita")).length;
    return h("div", null,
      h("div", { className: "barra", style: { marginBottom: 8 } },
        p.equipamentos.length > 8 ? h("input", { className: "entrada-texto busca", placeholder: "Buscar TAG, andar, ambiente…", value: filtro, onChange: e => setFiltro(e.target.value) }) : null,
        h("div", { className: "tf-seg" },
          h("button", { type: "button", className: "seg" + (so === "todos" ? " on" : ""), onClick: () => setSo("todos") }, "Todos"),
          h("button", { type: "button", className: "seg" + (so === "faltam" ? " on" : ""), onClick: () => setSo("faltam") }, "Faltam (" + faltam + ")"),
          h("button", { type: "button", className: "seg" + (so === "feitos" ? " on" : ""), onClick: () => setSo("feitos") }, "Feitos"))),
      !lista.length ? h("div", { className: "vazio" }, so === "faltam" ? "Tudo apontado neste mês." : "Nenhum equipamento encontrado.")
      : h("div", { className: "pm-lista" }, lista.map(e => {
          const v = p.visitas[e.id]; const st = stVisita(v);
          const an = v ? Object.keys(v.itens || {}).filter(k => v.itens[k] === "an").length : 0;
          const nf = v ? Object.keys(v.itens || {}).filter(k => v.itens[k] === "nf").length : 0;
          return h("button", { key: e.id, type: "button", className: "pm-eq", onClick: () => aoApontar(e) },
            h("div", null, h("b", null, e.tag), e.ambiente ? h("span", null, " · " + e.ambiente) : null,
              h("div", { className: "cel-sub" }, descEquip(e) || "—", " · ", (p.modelos[e.modeloId] || {}).nome || "Formulário")),
            h("div", { className: "pm-eq-d" }, an ? h("span", { className: "selo os-rosa" }, an + " Não OK") : null,
              nf ? h("span", { className: "selo os-laranja" }, nf + " NF") : null,
              v && v.fotos && v.fotos.length ? h("span", { className: "cel-sub" }, "📷 " + v.fotos.length) : null,
              h("span", { className: "selo " + st[1] }, st[0])));
        })));
  }

  /* responsabilidade técnica: sai no cabeçalho e na assinatura de todos os documentos */
  function BlocoRT({ p, esc, salvando, gravar }) {
    const [f, setF] = useState({ responsavelTecnico: p.responsavelTecnico || "", registro: p.registro || "", art: p.art || "" });
    useEffect(() => setF({ responsavelTecnico: p.responsavelTecnico || "", registro: p.registro || "", art: p.art || "" }), [p.responsavelTecnico, p.registro, p.art]);
    const mudou = f.responsavelTecnico !== (p.responsavelTecnico || "") || f.registro !== (p.registro || "") || f.art !== (p.art || "");
    const m = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    return h("div", { className: "pm-ano-bloco" },
      h("div", { className: "pm-ano-t" }, "Responsabilidade técnica"),
      h("p", { className: "cel-sub" }, "Sai no cabeçalho e na assinatura de todos os documentos deste plano."),
      esc ? h(React.Fragment, null,
        h(Campo, { rotulo: "Responsável técnico (engenheiro)" }, h(Texto, { valor: f.responsavelTecnico, aoMudar: m("responsavelTecnico") })),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Registro (CREA / CFT)" }, h(Texto, { valor: f.registro, aoMudar: m("registro") })),
          h(Campo, { rotulo: "ART nº" }, h(Texto, { valor: f.art, aoMudar: m("art") }))),
        mudou ? h("button", { type: "button", className: "bt bt-marca", disabled: salvando, onClick: () => gravar(f, "Responsabilidade técnica salva.") }, "Salvar") : null)
      : h(React.Fragment, null, linha("Responsável", (p.responsavelTecnico || "—") + (p.registro ? " · " + p.registro : "")), linha("ART", p.art || "—")));
  }

  /* normas do cliente: as de sempre + adicionais marcadas (saem no Livro e no documento do mês) */
  function BlocoNormas({ p, esc, salvando, gravar }) {
    const extra = p.normasExtra || [];
    const marcar = (ref, on) => gravar({ normasExtra: on ? extra.concat([ref]) : extra.filter(x => x !== ref) }, "Normas atualizadas.");
    return h("div", { className: "pm-ano-bloco" },
      h("div", { className: "pm-ano-t" }, "Normas aplicáveis a este cliente"),
      h("p", { className: "cel-sub" }, "Valem para o plano inteiro e saem no Livro do PMOC e no documento técnico."),
      h("div", { className: "pm-normas" }, NORMAS_PADRAO.map(n => h("span", { key: n[0], className: "pm-norma" }, n[0]))),
      esc ? h("div", { className: "pm-normas-ad" }, NORMAS_ADICIONAIS.map(n => h("label", { key: n[0], className: "pm-norma-ad" + (extra.indexOf(n[0]) >= 0 ? " on" : "") },
          h("input", { type: "checkbox", disabled: salvando, checked: extra.indexOf(n[0]) >= 0, onChange: e => marcar(n[0], e.target.checked) }),
          h("span", null, h("b", null, n[0]), h("small", null, n[1])))))
      : extra.length ? h("div", { className: "pm-normas" }, extra.map(r => h("span", { key: r, className: "pm-norma" }, r))) : null);
  }

  /* passar o ano inteiro para um técnico (12 visitas de uma vez) */
  function AnoTodo({ p, op, salvando, gravar }) {
    const equipe = equipeOrd(op);
    async function anoTodo(v) {
      if (!v) return;
      const t = equipe.find(x => String(x.id) === v);
      if (!(await K.confirmar({ titulo: "Passar o ano todo para " + (t ? t.nome : "este técnico") + "?", texto: "Os 12 meses ficam com ele e só ele fica na equipe do plano. Para trocar um mês só, use o seletor dentro do cartão do mês.", botao: "Passar o ano" }))) return;
      gravar({ anoTodo: +v }, "Ano todo com " + (t ? t.nome : "o técnico") + ".");
    }
    return h("div", { className: "pm-tecbar" },
      h("label", null, h("span", null, "Enviar o ano todo para o técnico"),
        h("select", { className: "entrada-texto", value: "", disabled: salvando, onChange: e => anoTodo(e.target.value) },
          h("option", { value: "" }, "— escolher técnico —"), equipe.map(t => h("option", { key: t.id, value: t.id }, t.nome)))),
      h("div", { className: "cel-sub pm-tecbar-eq" }, p.tecnicosNomes.length ? "Equipe do plano: " + p.tecnicosNomes.join(", ") : (Object.keys(p.tecMes || {}).length ? "" : "Ninguém escalado: os técnicos ainda não veem este plano.")));
  }

  function MapaAnual({ p, aoMes }) {
    if (!p.equipamentos.length) return h("div", { className: "vazio" }, "Nenhum equipamento no plano.");
    const atual = new Date().getFullYear() === p.ano ? new Date().getMonth() + 1 : 13;
    return h("div", { className: "pm-mapa-wrap" }, h("table", { className: "pm-mapa" },
      h("thead", null, h("tr", null, h("th", null, "Equipamento"), mesesDe(p).map(mm => h("th", { key: mm }, h("button", { type: "button", onClick: () => aoMes(mm) }, MES3[mm - 1]))))),
      h("tbody", null, p.equipamentos.map(e => h("tr", { key: e.id }, h("td", null, h("b", null, e.tag), e.ambiente ? h("span", { className: "cel-sub" }, " " + e.ambiente) : null),
        mesesDe(p).map(mm => { const i = mm - 1; const s = (p.mapa[e.id] || {})[i + 1]; const r = s === "feita" ? resDe(p, e.id, i + 1) : "";
          const cl = r === "pendencia" ? "fn" : r === "parcial" ? "fp" : s === "feita" ? "f" : s === "andamento" ? "a" : i + 1 < atual ? "x" : "";
          return h("td", { key: i, className: "c " + cl, title: r ? RES[r][0] : undefined }, r === "pendencia" ? "!" : r === "parcial" ? "½" : s === "feita" ? "✓" : s === "andamento" ? "•" : i + 1 < atual ? "–" : ""); }))))),
      h("p", { className: "cel-sub" }, "✓ executado · ½ executado parcialmente (NF) · ! pendência (Não OK) · • em andamento · – não apontado (meses passados)"));
  }

  /* montar o plano: escolher os equipamentos do cliente e o formulário de cada um */
  function MontarPlano({ p, op, aoSalvar }) {
    const [equips, setEquips] = useState(null);
    const [sel, setSel] = useState(() => { const o = {}; p.equipamentos.forEach(e => { o[e.id] = e.modeloId; }); return o; });
    const [form, setForm] = useState(null);
    const [salvando, setSalvando] = useState(false);
    function carregar() { api("pmoc.equip.listar", { clienteId: p.clienteId }).then(d => setEquips(d.itens), e => K.avisar(e.message, true)); }
    useEffect(carregar, [p.clienteId]); // eslint-disable-line
    const modelos = op.modelos.slice();
    Object.keys(p.modelos).forEach(mid => { if (!modelos.find(m => String(m.id) === mid)) modelos.push({ id: +mid, nome: p.modelos[mid].nome + " (cópia do plano)" }); });
    const padrao = modelos[0] ? modelos[0].id : 0;
    async function salvar() {
      setSalvando(true);
      try {
        const equip = (equips || []).filter(e => sel[e.id] !== undefined).map(e => ({ id: e.id, modeloId: sel[e.id] || padrao }));
        const r = await api("pmoc.salvar", { id: p.id, mes: p.mes, equip });
        K.avisar("Plano atualizado: " + r.equipamentos.length + " equipamento(s)."); aoSalvar(r);
      } catch (x) { K.avisar(x.message, true); } finally { setSalvando(false); }
    }
    /* v1.18.0: formulário padrão do tipo do equipamento, se configurado */
    const padraoDe = e => { const t = tipoDe(e.tipo); return t && t.modeloId && modelos.some(md => md.id === t.modeloId) ? t.modeloId : padrao; };
    const marcar = (e, on) => setSel(s => { const n = Object.assign({}, s); if (on) n[e.id] = n[e.id] || padraoDe(e); else delete n[e.id]; return n; });
    return h("div", null,
      h("p", { className: "cel-sub" }, "Marque os equipamentos do cliente que entram no plano e o formulário de cada um. A TAG identifica a posição (o local), não o aparelho."),
      !equips ? h("div", { className: "vazio" }, "Carregando…")
      : h("div", { className: "pm-lista" }, equips.length ? equips.map(e => h("div", { key: e.id, className: "pm-eq pm-eq-sel" + (sel[e.id] !== undefined ? " on" : "") },
          h("label", { className: "tf-minhas", style: { flex: 1 } }, h("input", { type: "checkbox", checked: sel[e.id] !== undefined, onChange: ev => marcar(e, ev.target.checked) }),
            h("span", null, h("b", null, " " + e.tag), e.ambiente ? " · " + e.ambiente : "", h("div", { className: "cel-sub" }, descEquip(e) || "—"))),
          sel[e.id] !== undefined ? h("select", { className: "entrada-texto", value: sel[e.id] || padrao, onChange: ev => setSel(s => Object.assign({}, s, { [e.id]: +ev.target.value })), style: { width: "auto", maxWidth: 220 } },
            modelos.map(m => h("option", { key: m.id, value: m.id }, m.nome))) : null,
          h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => setForm(e) }, "Editar")))
        : h("div", { className: "vazio" }, "Este cliente ainda não tem equipamentos cadastrados.")),
      h("div", { style: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" } },
        h("button", { type: "button", className: "bt", onClick: () => setForm({ clienteId: p.clienteId }) }, "+ Cadastrar equipamento"),
        h("div", { style: { flex: 1 } }),
        h("button", { type: "button", className: "bt bt-marca", disabled: salvando || !equips, onClick: salvar }, salvando ? "Salvando…" : "Salvar plano")),
      form ? h(FormEquip, { inicial: form, clienteId: p.clienteId, aoFechar: () => setForm(null),
        aoSalvar: e => { setForm(null); carregar(); if (!form.id) setSel(s => Object.assign({}, s, { [e.id]: padraoDe(e) })); },
        aoExcluir: () => { setForm(null); carregar(); setSel(s => { const n = Object.assign({}, s); delete n[form.id]; return n; }); } }) : null);
  }

  /* instalar = {modelos, temPlano}: instalação nova feita em campo (v1.13.0 — o técnico também pode) */
  function FormEquip({ inicial, clienteId, aoFechar, aoSalvar, aoExcluir, instalar }) {
    const [f, setF] = useState(() => Object.assign({ tag: "", tipo: "", marca: "", modelo: "", capacidadeBtu: "", serie: "", ambiente: "", tensao: "", gas: "", area: "", obs: "",
      andar: "", status: "Operante", dataInstalacao: instalar ? new Date().toISOString().slice(0, 10) : "", ocupFixo: "", ocupFlut: "", cargaTermica: "", modeloCond: "", serieCond: "",
      modeloId: instalar && instalar.modelos[0] ? instalar.modelos[0].id : "", motivoTroca: "" }, inicial, { clienteId }));
    const [mais, setMais] = useState(false);
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    const m = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    /* v1.18.0: tipo escolhido da lista da empresa; formulário padrão do tipo na instalação nova */
    const [tipos, setTipos] = useState(TIPOS);
    const [escolheTipo, setEscolheTipo] = useState("lista");
    useEffect(() => { if (!TIPOS) api("pmoc.opcoes").then(o => { guardarTipos(o); setTipos(TIPOS || []); }, () => setTipos([])); }, []);
    function mudarTipo(v) {
      setF(x => {
        const n = Object.assign({}, x, { tipo: v });
        const t = tipoDe(v);
        if (instalar && t && t.modeloId && instalar.modelos.some(md => md.id === t.modeloId)) n.modeloId = t.modeloId;
        return n;
      });
    }
    async function salvar() {
      setErro(""); setSalvando(true);
      try {
        if (instalar) { const r = await api("pmoc.equip.instalar", f); K.avisar(f.tag + " cadastrado" + (r.planoId ? " e incluído no plano." : ".")); aoSalvar(r.equipamento); }
        else { const r = await api("pmoc.equip.salvar", f); K.avisar("Equipamento salvo."); aoSalvar(r); }
      }
      catch (x) { setErro(x.message); } finally { setSalvando(false); }
    }
    async function excluir() {
      if (!(await K.confirmar({ titulo: "Excluir o equipamento " + f.tag + "?", texto: "Ele sai dos planos. Os apontamentos antigos continuam no histórico.", botao: "Excluir", perigo: true }))) return;
      try { await api("pmoc.equip.excluir", { id: f.id }); K.avisar("Equipamento excluído."); aoExcluir(); } catch (x) { K.avisar(x.message, true); }
    }
    return h(Painel, { titulo: instalar ? "Novo equipamento (instalação)" : f.id ? "Equipamento " + (inicial.tag || "") : "Novo equipamento", aoFechar,
      sub: instalar ? (instalar.temPlano ? "Entra no plano PMOC deste ano a partir de agora." : "O cliente não tem plano neste ano: fica só no cadastro.") : undefined,
      rodape: [f.id ? h("button", { key: "x", className: "bt bt-leve bt-perigo", onClick: excluir }, "Excluir") : null, h("div", { key: "e", style: { flex: 1 } }),
               h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", disabled: salvando, onClick: salvar }, salvando ? "Salvando…" : "Salvar")] },
      h(Aviso, null, erro),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "TAG", dica: "Ex.: EV-01, CD-03" }, h(Texto, { valor: f.tag, aoMudar: m("tag") })),
        h(Campo, { rotulo: "Local / ambiente" }, h(Texto, { valor: f.ambiente, aoMudar: m("ambiente") }))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Tipo", dica: escolheTipo === "outro" ? "Para deixar fixo na lista: PMOC › Tipos de equipamento" : undefined },
          escolheTipo === "outro"
            ? h("input", { className: "entrada-texto", value: f.tipo || "", placeholder: "Escreva o tipo", onChange: e => m("tipo")(e.target.value) })
            : h("select", { className: "entrada-texto", value: f.tipo || "", onChange: e => { if (e.target.value === "__outro") { setEscolheTipo("outro"); m("tipo")(""); } else mudarTipo(e.target.value); } },
                h("option", { value: "" }, tipos ? "— escolha —" : "Carregando…"),
                (tipos || []).map(t => h("option", { key: t.nome, value: t.nome }, t.nome)),
                f.tipo && !(tipos || []).some(t => t.nome === f.tipo) ? h("option", { value: f.tipo }, f.tipo) : null,
                h("option", { value: "__outro" }, "Outro (escrever)…"))),
        h(Campo, { rotulo: "Capacidade (BTU/h)" }, h(Texto, { valor: f.capacidadeBtu, aoMudar: m("capacidadeBtu"), inputMode: "numeric" }))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Marca" }, h(Texto, { valor: f.marca, aoMudar: m("marca") })),
        h(Campo, { rotulo: "Modelo" }, h(Texto, { valor: f.modelo, aoMudar: m("modelo") }))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Nº de série" }, h(Texto, { valor: f.serie, aoMudar: m("serie") })),
        h(Campo, { rotulo: "Tensão" }, h("input", { className: "entrada-texto", list: "pm-tensoes", value: f.tensao || "", onChange: e => m("tensao")(e.target.value) }),
          h("datalist", { id: "pm-tensoes" }, ["220V monofásico", "220V trifásico", "380V trifásico", "110V"].map(t => h("option", { key: t, value: t }))))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Gás refrigerante" }, h("input", { className: "entrada-texto", list: "pm-gases", value: f.gas || "", onChange: e => m("gas")(e.target.value) }),
          h("datalist", { id: "pm-gases" }, ["R-410A", "R-32", "R-22", "R-134a", "R-407C"].map(t => h("option", { key: t, value: t })))),
        h(Campo, { rotulo: "Área atendida (m²)" }, h(Texto, { valor: f.area, aoMudar: m("area"), inputMode: "decimal" }))),
      instalar && instalar.temPlano ? h(Campo, { rotulo: "Formulário do PMOC" }, h("select", { className: "entrada-texto", value: f.modeloId, onChange: e => m("modeloId")(+e.target.value) },
        instalar.modelos.map(x => h("option", { key: x.id, value: x.id }, x.nome)))) : null,
      f.id ? h(Campo, { rotulo: "Se trocou o aparelho, o motivo", dica: "A TAG é a posição. Trocar marca, modelo ou série registra a troca no histórico." }, h(Texto, { valor: f.motivoTroca, aoMudar: m("motivoTroca") })) : null,
      h(Campo, { rotulo: "Observações" }, h("textarea", { value: f.obs || "", onChange: e => m("obs")(e.target.value), rows: 2 })),
      h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => setMais(!mais) }, mais ? "− Menos dados" : "+ Andar, situação, ocupação, carga térmica, condensadora"),
      mais ? h(React.Fragment, null,
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Andar" }, h(Texto, { valor: f.andar, aoMudar: m("andar") })),
          h(Campo, { rotulo: "Situação" }, h("select", { className: "entrada-texto", value: f.status || "", onChange: e => m("status")(e.target.value) },
            ["", "Operante", "Inoperante", "Em manutenção", "Desativado"].map(x => h("option", { key: x, value: x }, x || "—"))))),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Data de instalação" }, h("input", { className: "entrada-texto", type: "date", value: f.dataInstalacao || "", onChange: e => m("dataInstalacao")(e.target.value) })),
          h(Campo, { rotulo: "Carga térmica (BTU/h)" }, h(Texto, { valor: f.cargaTermica, aoMudar: m("cargaTermica"), inputMode: "numeric" }))),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Ocupantes fixos" }, h(Texto, { valor: f.ocupFixo, aoMudar: m("ocupFixo"), inputMode: "numeric" })),
          h(Campo, { rotulo: "Ocupantes flutuantes" }, h(Texto, { valor: f.ocupFlut, aoMudar: m("ocupFlut"), inputMode: "numeric" }))),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Modelo da condensadora" }, h(Texto, { valor: f.modeloCond, aoMudar: m("modeloCond") })),
          h(Campo, { rotulo: "Série da condensadora" }, h(Texto, { valor: f.serieCond, aoMudar: m("serieCond") })))) : null);
  }

  /* =================================================================
     APONTAMENTO DO TÉCNICO (um equipamento num mês)
     ================================================================= */
  function Apontamento({ p, equip, sessao, aoFechar, aoSalvar, aoHistorico }) {
    const v0 = p.visitas[equip.id] || null;
    const modelo = p.modelos[equip.modeloId] || { nome: "Formulário", secoes: [] };
    const secoes = itensDoMes(modelo.secoes, p.mes, p.mesInicio);
    const [itens, setItens] = useState(() => Object.assign({}, v0 ? v0.itens : {}));
    const [med, setMed] = useState(() => Object.assign({}, v0 ? v0.med : {}));
    const [obs, setObs] = useState(v0 ? v0.obs || "" : "");
    const [novas, setNovas] = useState([]);
    const [pendTxt, setPendTxt] = useState("");
    const [pendPri, setPendPri] = useState("Normal");   /* v1.17.1 */
    const [pendMat, setPendMat] = useState("");
    const [fotos, setFotos] = useState(v0 ? v0.fotos || [] : []);
    const [base, setBase] = useState(v0 ? v0.versao : "");
    const [salvando, setSalvando] = useState(false);
    const [foto, setFoto] = useState(null);
    const [abaAp, setAbaAp] = useState("apont");   /* v1.34.0: apontamento | histórico da máquina */
    const feito = v0 && v0.status === "feita";
    const checar = secoes.filter(s => s.tipo !== "medicao").reduce((a, s) => a.concat(s.itens), []);
    const faltam = checar.filter(it => !itens[it.k]).length;

    async function salvar(concluir) {
      if (concluir && faltam && !(await K.confirmar({ titulo: faltam + " item(ns) sem resposta", texto: "Concluir mesmo assim? Os itens em branco saem no relatório como não verificados.", botao: "Concluir" }))) return;
      setSalvando(true);
      try {
        const r = await api("pmoc.visita.salvar", { planoId: p.id, equipamentoId: equip.id, mes: p.mes, itens, med, obs, pendNovas: novas, concluir: !!concluir, _base: base || "" });
        setBase(r.versao || base); setNovas([]);
        aoSalvar(Object.assign({}, r, { fotos }));
        K.avisar(concluir ? equip.tag + " concluído." : "Apontamento salvo.");
        if (concluir) aoFechar();
      } catch (x) {
        if (x.codigo === "NA_FILA") { aoFechar(); return; }
        K.avisar(x.message, true);
      } finally { setSalvando(false); }
    }
    async function enviarFotos(ev) {
      const arqs = Array.from(ev.target.files || []); ev.target.value = "";
      for (const a of arqs) {
        try {
          const b = K.OS && K.OS.comprimir ? await K.OS.comprimir(a) : a;
          const r = await K.enviarArquivo("pmoc.foto.enviar", b, { planoId: p.id, equipamentoId: equip.id, mes: p.mes });
          if (r && r.id) setFotos(l => l.concat([r]));
        } catch (x) { if (x.codigo !== "NA_FILA") K.avisar(x.message, true); }
      }
    }
    async function apagarFoto(f) {
      if (typeof f.id === "string") return K.avisar("Esta foto ainda está no aparelho. Apague depois que sincronizar.", true);
      if (!(await K.confirmar({ titulo: "Apagar esta foto?", botao: "Apagar", perigo: true }))) return;
      try { await api("pmoc.foto.excluir", { id: f.id }); setFotos(l => l.filter(x => x.id !== f.id)); setFoto(null); } catch (x) { K.avisar(x.message, true); }
    }
    const tudoOk = s => setItens(x => { const n = Object.assign({}, x); s.itens.forEach(it => { if (!n[it.k]) n[it.k] = "ok"; }); return n; });

    return h(Painel, { titulo: equip.tag + (equip.ambiente ? " · " + equip.ambiente : ""), largo: true, aoFechar,
      sub: MESES[p.mes - 1] + " " + p.ano + " · " + modelo.nome + (descEquip(equip) ? " · " + descEquip(equip) : ""),
      /* v1.35.3: Concluir fica à esquerda e Fechar no canto direito (antes era fácil concluir sem querer ao fechar) */
      rodape: [h("button", { key: "f", className: "bt bt-marca", disabled: salvando, onClick: () => salvar(true) }, feito ? "Salvar e manter concluído" : "Concluir equipamento"),
               aoHistorico ? h("button", { key: "h", className: "bt bt-leve", onClick: aoHistorico }, "Histórico") : null, h("div", { key: "e", className: "pm-pe-esp", style: { flex: 1 } }),
               h("button", { key: "s", className: "bt", disabled: salvando, onClick: () => salvar(false) }, "Salvar"),
               h("button", { key: "c", className: "bt", onClick: aoFechar }, "Fechar")] },
      h("div", { className: "tf-seg pm-abas" },
        h("button", { type: "button", className: "seg" + (abaAp === "apont" ? " on" : ""), onClick: () => setAbaAp("apont") }, "Apontamento"),
        h("button", { type: "button", className: "seg" + (abaAp === "hist" ? " on" : ""), onClick: () => setAbaAp("hist") }, "Histórico da máquina")),
      abaAp === "hist" ? h(HistAcoes, { p, equip, modelo }) : h(React.Fragment, null,
      feito ? h(Aviso, { tipo: { pendencia: "erro", parcial: "info" }[v0.resultado || resultadoDe(v0.itens)] || "ok" }, stVisita(v0)[0] + (v0.tecnico ? " · concluído por " + v0.tecnico : "") + (v0.feitaEm ? " em " + dataHoraBR(v0.feitaEm) : "") + ".") : null,
      secoes.some(s => s.tipo !== "medicao") ? h(React.Fragment, null, h(LegendaAp), h(LegendaPer)) : null,
      !secoes.length ? h("div", { className: "vazio" }, "Nenhum item previsto neste mês para este formulário.") : null,
      secoes.map(s => h("div", { key: s.titulo, className: "pm-sec" },
        h("div", { className: "pm-sec-cab" }, h("b", null, s.titulo),
          s.tipo !== "medicao" ? h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => tudoOk(s) }, "Tudo OK") : null),
        s.tipo === "medicao"
          ? h("div", { className: "pm-meds" }, s.itens.map(it => h("label", { key: it.k, className: "pm-med" }, h("span", null, it.n),
              h("span", { className: "pm-med-v" }, h("input", { className: "entrada-texto", inputMode: "decimal", value: med[it.k] || "", onChange: e => setMed(x => Object.assign({}, x, { [it.k]: e.target.value })) }),
                it.un ? h("small", null, it.un) : null))))
          : s.itens.map(it => h("div", { key: it.k, className: "pm-item" },
              h("span", { className: "pm-item-n" }, h(Letra, { per: it.per }), h("span", null, it.n)),
              h("span", { className: "pm-bts" }, AP.map(a => h("button", { key: a.v, type: "button", title: a.t, className: "pm-bt pm-" + a.v + (itens[it.k] === a.v ? " on" : ""),
                onClick: () => setItens(x => Object.assign({}, x, { [it.k]: x[it.k] === a.v ? undefined : a.v })) }, a.l))))))),
      h(Campo, { rotulo: "Observações do técnico" }, h("textarea", { value: obs, onChange: e => setObs(e.target.value), rows: 3 })),
      h("div", { className: "secao-titulo" }, "Pendências"),
      (v0 && v0.pend ? v0.pend : []).map(x => h("div", { key: x.id, className: "cel-sub", style: { marginBottom: 4 } }, (x.resolvida ? "✓ " : "• ") + x.texto + (x.prioridade && x.prioridade !== "Normal" ? " · " + x.prioridade : "") + (x.material ? " · material: " + x.material : "") + (x.osNumero ? " · OS " + x.osNumero : "") + (x.resolvida ? " (resolvida)" : ""))),
      novas.map((t, i) => h("div", { key: "n" + i, className: "cel-sub", style: { marginBottom: 4 } }, "• " + t.texto + " · " + t.prioridade + (t.material ? " · material: " + t.material : "") + " (nova — salve para registrar)",
        h("button", { type: "button", className: "bt bt-leve bt-p", style: { marginLeft: 6 }, onClick: () => setNovas(n => n.filter((x, j) => j !== i)), "aria-label": "Tirar pendência" }, "×"))),
      h("div", { className: "pm-pend-nova" },
        h("input", { className: "entrada-texto", placeholder: "O que está errado? Ex.: compressor queimado", value: pendTxt, onChange: e => setPendTxt(e.target.value), "aria-label": "Pendência" }),
        h("select", { className: "entrada-texto", value: pendPri, onChange: e => setPendPri(e.target.value), "aria-label": "Prioridade" }, ["Baixa", "Normal", "Alta", "Urgente"].map(x => h("option", { key: x, value: x }, x))),
        h("input", { className: "entrada-texto", placeholder: "Material/peça (opcional)", value: pendMat, onChange: e => setPendMat(e.target.value), "aria-label": "Material ou peça" }),
        h("button", { type: "button", className: "bt bt-p", disabled: !pendTxt.trim(), onClick: () => { setNovas(n => n.concat([{ texto: pendTxt.trim(), prioridade: pendPri, material: pendMat.trim() }])); setPendTxt(""); setPendMat(""); setPendPri("Normal"); } }, "Adicionar")),
      h("div", { className: "secao-titulo" }, "Fotos"),
      fotos.length ? h("div", { className: "os-fotos" }, fotos.map(f => h("button", { key: f.id, type: "button", className: "os-foto", onClick: () => setFoto(f) },
        h("img", { src: K.urlAnexo(f.id), alt: f.legenda || "Foto", loading: "lazy" })))) : null,
      h("span", { className: "os-foto-bts" },
        h("label", { className: "bt bt-p" }, "📷 Câmera", h("input", { type: "file", accept: "image/*", capture: "environment", onChange: enviarFotos, style: { display: "none" } })),
        h("label", { className: "bt bt-p" }, "🖼 Galeria", h("input", { type: "file", accept: "image/*", multiple: true, onChange: enviarFotos, style: { display: "none" } })))),
      foto && K.OS && K.OS.VerFoto ? h(K.OS.VerFoto, { foto, fotos, podeApagar: () => true, aoApagar: apagarFoto, aoFechar: () => setFoto(null) }) : null);
  }

  /* =================================================================
     v1.34.0 — HISTÓRICO DA MÁQUINA (aba do apontamento)
     O técnico vê o que foi feito em cada item nos meses anteriores — ex.: lavagem de
     serpentina (trimestral): última vez feita e quando vence de novo.
     "Feito" = marcado OK ou Não OK (o serviço foi executado); NF e N/A não contam.
     ================================================================= */
  const chaveItem = (sec, n) => chaveTipo(sec) + "|" + chaveTipo(n);
  const mesAno = (a, m) => MES3[m - 1] + "/" + String(a).slice(2);
  function HistAcoes({ p, equip, modelo }) {
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    useEffect(() => { api("pmoc.equip.acoes", { id: equip.id, meses: 24 }).then(r => { setD(r); setErro(""); }, e => setErro(e.message)); }, [equip.id]);
    if (erro && !d) return h(Aviso, null, (navigator.onLine === false ? "Sem internet: o histórico aparece quando a conexão voltar. " : "") + erro);
    if (!d) return h("div", { className: "vazio" }, "Carregando o histórico…");
    const agoraAM = p.ano * 12 + p.mes;
    /* só meses anteriores ao que está sendo apontado */
    const vis = (d.visitas || []).filter(v => v.ano * 12 + v.mes < agoraAM).slice(0, 12);
    if (!vis.length) return h("div", { className: "vazio" }, h("strong", null, "Nenhum apontamento anterior desta máquina."), "Quando houver meses apontados, eles aparecem aqui item por item.");
    /* linhas: itens de checagem do formulário atual (todos, não só os do mês) + itens antigos que saíram do formulário */
    const linhas = []; const porChave = {};
    (modelo.secoes || []).filter(s => s.tipo !== "medicao").forEach(s => s.itens.forEach(it => {
      const k = chaveItem(s.titulo, it.n); if (porChave[k]) return;
      porChave[k] = { k, sec: s.titulo, n: it.n, per: it.per || "M", atual: true }; linhas.push(porChave[k]);
    }));
    const medLin = []; const porMed = {};
    vis.forEach(v => {
      (v.itens || []).forEach(x => { const k = chaveItem(x.sec, x.n); if (!porChave[k]) { porChave[k] = { k, sec: x.sec, n: x.n, per: x.per || "M", atual: false }; linhas.push(porChave[k]); } });
      (v.med || []).forEach(x => { const k = chaveItem(x.sec, x.n); if (!porMed[k]) { porMed[k] = { k, n: x.n, un: x.un }; medLin.push(porMed[k]); } });
    });
    const marca = (v, k) => { const x = (v.itens || []).find(i => chaveItem(i.sec, i.n) === k); return x ? x.r : ""; };
    const valMed = (v, k) => { const x = (v.med || []).find(i => chaveItem(i.sec, i.n) === k); return x ? x.v : ""; };
    /* última vez feita e próxima, pela periodicidade */
    linhas.forEach(l => {
      const ult = vis.find(v => { const r = marca(v, l.k); return r === "ok" || r === "an"; });
      l.ult = ult || null;
      if (!ult) { l.sit = ["Sem registro", "os-cinza"]; return; }
      const desde = agoraAM - (ult.ano * 12 + ult.mes); const per = PER[l.per] || 1;
      const prox = ult.ano * 12 + ult.mes - 1 + per; l.prox = mesAno(Math.floor(prox / 12), (prox % 12) + 1);
      l.sit = desde >= per ? ["Fazer este mês", "os-laranja"] : ["Em dia", "os-verde"];
    });
    const fazer = linhas.filter(l => l.atual && l.sit[0] === "Fazer este mês" && l.per !== "M");
    const secs = []; linhas.forEach(l => { const k = l.atual ? l.sec : "Itens que não estão mais no formulário"; let s = secs.find(x => x.t === k); if (!s) secs.push(s = { t: k, l: [] }); s.l.push(l); });
    const cab = h("tr", null, h("th", { className: "pm-h-it" }, "Ação"), h("th", { className: "pm-h-ult" }, "Última vez feita"),
      vis.map(v => h("th", { key: v.ano + "-" + v.mes, title: v.tecnico || "" }, mesAno(v.ano, v.mes))));
    return h("div", { className: "pm-hist" },
      h("p", { className: "cel-sub", style: { margin: "0 0 8px" } }, "O que foi marcado em cada item nos " + vis.length + " último(s) mês(es) apontado(s), do mais recente para o mais antigo. \"Feito\" conta OK ou Não OK."),
      fazer.length ? h(Aviso, { tipo: "info" }, h("b", null, "Vencem neste mês: "), fazer.map(l => l.n + " (" + PER_TXT[l.per].toLowerCase() + (l.ult ? ", última em " + mesAno(l.ult.ano, l.ult.mes) : "") + ")").join(" · ")) : null,
      h(LegendaAp), h(LegendaPer),
      h("div", { className: "tabela-caixa pm-hist-caixa" }, h("table", { className: "pm-hist-t" },
        h("thead", null, cab),
        h("tbody", null, secs.map(s => h(React.Fragment, { key: s.t },
          h("tr", { className: "pm-h-sec" }, h("td", { colSpan: 2 + vis.length }, s.t)),
          s.l.map(l => h("tr", { key: l.k },
            h("td", { className: "pm-h-it" }, h("span", { className: "pm-item-n" }, h(Letra, { per: l.per }), h("span", null, l.n))),
            h("td", { className: "pm-h-ult" }, l.ult ? h("b", null, mesAno(l.ult.ano, l.ult.mes)) : "—",
              /* selo só para itens com periodicidade maior que mensal e que ainda estão no formulário */
              l.atual && l.per !== "M" ? h("span", { className: "selo " + l.sit[1] }, l.sit[0] === "Em dia" && l.prox ? "Próxima " + l.prox : l.sit[0]) : null),
            vis.map(v => { const r = marca(v, l.k); return h("td", { key: v.ano + "-" + v.mes, className: "c" }, r ? h("span", { className: "pm-h-r pm-" + r }, AP_TXT[r] || r) : h("span", { className: "pm-h-vz" }, "·")); })))))))),
      medLin.length ? h(React.Fragment, null, h("div", { className: "secao-titulo" }, "Medições"),
        h("div", { className: "tabela-caixa pm-hist-caixa" }, h("table", { className: "pm-hist-t" },
          h("thead", null, h("tr", null, h("th", { className: "pm-h-it" }, "Medição"), vis.map(v => h("th", { key: v.ano + "-" + v.mes }, mesAno(v.ano, v.mes))))),
          h("tbody", null, medLin.map(m => h("tr", { key: m.k }, h("td", { className: "pm-h-it" }, m.n, m.un ? h("small", { className: "pm-per" }, m.un) : null),
            vis.map(v => h("td", { key: v.ano + "-" + v.mes, className: "c" }, valMed(v, m.k) || h("span", { className: "pm-h-vz" }, "·"))))))))) : null,
      vis.some(v => v.obs) ? h(React.Fragment, null, h("div", { className: "secao-titulo" }, "Observações dos técnicos"),
        vis.filter(v => v.obs).map(v => h("div", { key: v.ano + "-" + v.mes, className: "cel-sub", style: { marginBottom: 4 } }, h("b", null, mesAno(v.ano, v.mes) + (v.tecnico ? " · " + v.tecnico : "") + ": "), v.obs))) : null,
      h("div", { className: "secao-titulo" }, "Resultado de cada mês"),
      h("div", { className: "pm-h-meses" }, vis.map(v => { const st = v.status === "feita" ? RES[v.resultado] || RES.executado : STATUS.andamento;
        return h("span", { key: v.ano + "-" + v.mes, className: "selo " + st[1] }, mesAno(v.ano, v.mes) + " · " + st[0]); })));
  }

  /* =================================================================
     FORMULÁRIOS (checklists)
     ================================================================= */
  /* v1.18.0: tipos de equipamento da empresa — nome, código da TAG e formulário padrão do PMOC */
  function TiposEquip({ op, setOp }) {
    const [l, setL] = useState(() => op && op.tipos ? op.tipos.map(x => Object.assign({}, x)) : []);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    useEffect(() => { if (op && op.tipos && !l.length) setL(op.tipos.map(x => Object.assign({}, x))); }, [op]); // eslint-disable-line
    if (!op) return h("div", { className: "bloco vazio" }, "Carregando…");
    const mudar = (i, k, v) => setL(a => a.map((x, j) => j === i ? Object.assign({}, x, { [k]: v }) : x));
    async function salvar() {
      setErro(""); setSalvando(true);
      try {
        const r = await api("pmoc.tipos.salvar", { itens: l });
        TIPOS = r.tipos; setL(r.tipos.map(x => Object.assign({}, x))); setOp(Object.assign({}, op, { tipos: r.tipos }));
        K.avisar("Tipos de equipamento salvos.");
      } catch (x) { setErro(x.message); } finally { setSalvando(false); }
    }
    return h("div", null,
      h("p", { className: "cel-sub" }, "Os tipos aparecem no cadastro do equipamento e na planilha de importação. O código forma a TAG automática (ex.: HW-001). O formulário padrão já vem marcado quando o equipamento entra no plano."),
      h(Aviso, null, erro),
      h("div", { className: "pm-tipos-lista" }, l.map((x, i) => h("div", { key: i, className: "pm-tipo-lin" },
        h("input", { className: "entrada-texto", value: x.nome, placeholder: "Nome (ex.: Hi-wall)", "aria-label": "Nome do tipo", onChange: e => mudar(i, "nome", e.target.value) }),
        h("input", { className: "entrada-texto pm-tipo-cod", value: x.codigo, placeholder: "HW", maxLength: 3, "aria-label": "Código da TAG", onChange: e => mudar(i, "codigo", e.target.value.toUpperCase().replace(/[^A-Z]/g, "")) }),
        h("select", { className: "entrada-texto", value: x.modeloId || "", "aria-label": "Formulário padrão", onChange: e => mudar(i, "modeloId", e.target.value ? +e.target.value : null) },
          h("option", { value: "" }, "Formulário: o primeiro da lista"), op.modelos.map(m => h("option", { key: m.id, value: m.id }, m.nome))),
        h("button", { type: "button", className: "bt bt-leve bt-perigo bt-p", title: "Remover", onClick: () => setL(a => a.filter((_, j) => j !== i)) }, "Remover")))),
      h("div", { style: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" } },
        h("button", { type: "button", className: "bt", onClick: () => setL(a => a.concat([{ nome: "", codigo: "", modeloId: null }])) }, "+ Adicionar tipo"),
        h("div", { style: { flex: 1 } }),
        h("button", { type: "button", className: "bt bt-marca", disabled: salvando, onClick: salvar }, salvando ? "Salvando…" : "Salvar tipos")),
      h("p", { className: "cel-sub", style: { marginTop: 10 } }, "Remover um tipo não muda os equipamentos já cadastrados com ele."));
  }

  function Formularios({ op, setOp }) {
    const [ed, setEd] = useState(null);
    if (!op) return h("div", { className: "bloco vazio" }, "Carregando…");
    return h("div", null,
      h("p", { className: "cel-sub" }, "Cada equipamento do plano usa um formulário. O plano guarda uma cópia: mudar um formulário aqui vale para os planos novos e para os equipamentos incluídos depois."),
      h("div", { className: "pm-lista" }, op.modelos.map(m => h("button", { key: m.id, type: "button", className: "pm-eq", onClick: () => setEd(m) },
        h("div", null, h("b", null, m.nome), h("div", { className: "cel-sub" }, (m.descricao || "") + " · " + m.secoes.length + " seção(ões) · " + m.nItens + " itens")),
        h("span", { className: "bt bt-p bt-leve" }, "Editar")))),
      h("button", { type: "button", className: "bt", style: { marginTop: 12 }, onClick: () => setEd({ nome: "", descricao: "", secoes: [{ titulo: "Checklist", tipo: "checagem", itens: [] }, { titulo: "Medições", tipo: "medicao", itens: [] }] }) }, "+ Novo formulário"),
      ed ? h(FormModelo, { inicial: ed, aoFechar: () => setEd(null), aoSalvar: mods => { setEd(null); setOp(Object.assign({}, op, { modelos: mods })); } }) : null);
  }

  /* editor simples: um item por linha. Checagem: "Nome do item ; T" (M/T/S/A). Medição: "Nome ; unidade" */
  function FormModelo({ inicial, aoFechar, aoSalvar }) {
    const paraTxt = s => s.itens.map(it => it.n + (s.tipo === "medicao" ? (it.un ? " ; " + it.un : "") : (it.per && it.per !== "M" ? " ; " + it.per : ""))).join("\n");
    const [nome, setNome] = useState(inicial.nome);
    const [desc, setDesc] = useState(inicial.descricao || "");
    const [secs, setSecs] = useState(() => inicial.secoes.map(s => ({ titulo: s.titulo, tipo: s.tipo, txt: paraTxt(s) })));
    const [erro, setErro] = useState("");
    const mudaSec = (i, k, v) => setSecs(l => l.map((s, j) => j === i ? Object.assign({}, s, { [k]: v }) : s));
    async function salvar() {
      setErro("");
      const secoes = secs.map(s => ({ titulo: s.titulo, tipo: s.tipo, itens: s.txt.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
        const [n, x] = l.split(";").map(z => z.trim());
        return s.tipo === "medicao" ? { n, un: x || "" } : { n, per: (x || "M").toUpperCase().slice(0, 1) };
      }) }));
      try { const r = await api("pmoc.modelo.salvar", { id: inicial.id || null, nome, descricao: desc, secoes }); K.avisar("Formulário salvo."); aoSalvar(r.modelos); }
      catch (x) { setErro(x.message); }
    }
    async function excluir() {
      if (!(await K.confirmar({ titulo: "Excluir o formulário " + inicial.nome + "?", texto: "Planos que já usam continuam com a cópia deles.", botao: "Excluir", perigo: true }))) return;
      try { const r = await api("pmoc.modelo.excluir", { id: inicial.id }); aoSalvar(r.modelos); } catch (x) { K.avisar(x.message, true); }
    }
    return h(Painel, { titulo: inicial.id ? "Formulário" : "Novo formulário", largo: true, aoFechar,
      rodape: [inicial.id ? h("button", { key: "x", className: "bt bt-leve bt-perigo", onClick: excluir }, "Excluir") : null, h("div", { key: "e", style: { flex: 1 } }),
               h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar }, "Salvar")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Nome" }, h(Texto, { valor: nome, aoMudar: setNome })),
      h(Campo, { rotulo: "Descrição (quando usar)" }, h(Texto, { valor: desc, aoMudar: setDesc })),
      h("p", { className: "cel-sub" }, "Um item por linha. Em checagem, a periodicidade vem depois do ponto e vírgula: M mensal (padrão), T trimestral, S semestral, A anual — ex.: \"Limpar gabinete ; S\". Em medição, a unidade — ex.: \"Corrente fase R ; A\"."),
      secs.map((s, i) => h("div", { key: i, className: "pm-sec" },
        h("div", { className: "pm-sec-cab" },
          h("input", { className: "entrada-texto", value: s.titulo, onChange: e => mudaSec(i, "titulo", e.target.value), style: { maxWidth: 260 } }),
          h("select", { className: "entrada-texto", value: s.tipo, onChange: e => mudaSec(i, "tipo", e.target.value), style: { width: "auto" } }, h("option", { value: "checagem" }, "Checagem (OK/Não OK/NF/N/A)"), h("option", { value: "medicao" }, "Medição")),
          h("button", { type: "button", className: "bt bt-p bt-leve bt-perigo", onClick: () => setSecs(l => l.filter((x, j) => j !== i)) }, "Remover")),
        h("textarea", { className: "entrada-texto", rows: Math.min(14, Math.max(4, s.txt.split("\n").length + 1)), value: s.txt, onChange: e => mudaSec(i, "txt", e.target.value), style: { width: "100%", height: "auto", padding: 10 } }))),
      h("button", { type: "button", className: "bt", onClick: () => setSecs(l => l.concat([{ titulo: "Nova seção", tipo: "checagem", txt: "" }])) }, "+ Seção"));
  }

  /* =================================================================
     RELATÓRIOS (abrem numa janela para imprimir / salvar em PDF)
     ================================================================= */
  async function cabecalho(sessao) {
    let c = {};
    try { c = (await api("config.ler")).config || {}; } catch (e) { /* técnico não lê config */ }
    const e = sessao.empresa || {};
    const emp = Object.assign({ nome: e.nome, razao_social: e.razaoSocial, cnpj: e.cnpj }, c.empresa || {});
    const cor = /^#[0-9a-f]{6}$/i.test(e.corPrimaria || "") ? e.corPrimaria : "#111111";
    return { emp, cor, logo: e.logoId ? new URL(K.urlAnexo(e.logoId), location.href).href : "", normas: c.normas_pmoc || null };
  }
  function estilo(cor) {
    return "@page{size:A4;margin:14mm}*{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}body{margin:0;color:#1a1d21;font-size:12px}" +
      "@media screen{body{max-width:960px;margin:0 auto;padding:36px 44px;background:#fff}}@media screen and (max-width:640px){body{padding:16px}}" +   /* v1.27.0 */
      ".top{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid " + cor + ";padding-bottom:12px}.top img{height:44px;max-width:170px;object-fit:contain}.bn{font-size:18px;font-weight:700;color:" + cor + "}" +
      ".co{text-align:right;font-size:10.5px;color:#4a5160;line-height:1.5}h1{font-size:16px;color:" + cor + ";margin:18px 0 10px}h2{font-size:13px;color:" + cor + ";margin:18px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}" +
      "h3{font-size:12.5px;margin:12px 0 4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;background:#f4f6fb;border:1px solid #e5e5e5;border-radius:8px;padding:10px 14px}.grid span{color:#6b7280}" +
      ".res{display:flex;gap:10px;margin:10px 0}.res div{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:8px;text-align:center}.res b{display:block;font-size:17px;color:" + cor + "}" +
      "table{width:100%;border-collapse:collapse;margin-bottom:6px}td,th{padding:5px 7px;border-bottom:1px solid #eef1f6;text-align:left;vertical-align:top}th{background:#eef1f6;font-size:11px}td.c,th.c{text-align:center;width:34px}" +
      ".eq{break-inside:avoid;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;margin-bottom:10px}.an{color:#a3405f;font-weight:700}.ok{color:#0b7d5c;font-weight:700}" +
      ".fotos{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:6px 0}.fotos img{width:100%;height:110px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb}" +
      ".txt{background:#f4f6fb;border:1px solid #e5e5e5;border-radius:8px;padding:8px 12px;line-height:1.5}.ass{margin-top:36px;width:60%;margin-left:auto;margin-right:auto;text-align:center;break-inside:avoid}.ass div{border-top:1px solid #1a1d21;margin-bottom:4px}" +
      ".mapa td,.mapa th{font-size:10.5px;padding:4px}.mapa td.f{color:#0b7d5c;font-weight:700}.cron td.c{font-weight:700}" +
      ".noprint{text-align:center;margin:18px 0}.noprint button{background:" + cor + ";color:#fff;border:0;border-radius:8px;padding:9px 18px;cursor:pointer}@media print{.noprint{display:none}}";
  }
  function topo(c) {
    return '<div class="top"><div style="display:flex;gap:12px;align-items:center">' + (c.logo ? '<img src="' + c.logo + '">' : "") + '<div class="bn">' + es(c.emp.nome || "") + '</div></div><div class="co">' +
      [c.emp.razao_social, c.emp.cnpj ? "CNPJ " + c.emp.cnpj : "", c.emp.endereco, [c.emp.telefone, c.emp.email].filter(Boolean).join(" · ")].filter(Boolean).map(es).join("<br>") + "</div></div>";
  }
  function identificacao(p) {
    return '<div class="grid"><div><span>Cliente:</span> <b>' + es(p.clienteNome) + "</b></div><div><span>CNPJ/CPF:</span> " + es(p.clienteDocumento || "—") + "</div>" +
      "<div><span>Endereço:</span> " + es(p.endereco || "—") + "</div><div><span>Contato:</span> " + es([p.clienteContato, p.clienteTelefone].filter(Boolean).join(" · ") || "—") + "</div>" +
      "<div><span>Responsável técnico:</span> " + es(p.responsavelTecnico || "—") + (p.registro ? " · " + es(p.registro) : "") + "</div><div><span>ART/TRT:</span> " + es(p.art || "—") + "</div></div>";
  }
  function abrirJanela(titulo) {
    const w = window.open("", "_blank");
    if (!w) { K.avisar("Permita pop-ups para gerar o relatório.", true); return null; }
    w.document.write("<p style='font-family:sans-serif;padding:20px'>Montando " + titulo + "…</p>");
    return w;
  }
  function escrever(w, titulo, cor, corpo) {
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + es(titulo) + "</title><style>" + estilo(cor) + "</style></head><body>" + corpo +
      '<div class="noprint"><button onclick="window.print()">Imprimir / Salvar PDF</button></div></body></html>');
    w.document.close(); w.focus();
  }

  /* =================================================================
     v1.16.0 — DOCUMENTOS DO PMOC no formato da Konstante:
     Livro do PMOC (ano), PMOC do mês (documento técnico) e
     Relatório de acompanhamento (mensal, com o ano todo).
     ================================================================= */
  const NORMAS_PADRAO = [
    ["Lei nº 13.589/2018", "Manutenção de sistemas de climatização em edificações de uso público e coletivo; obrigatoriedade do PMOC."],
    ["Portaria GM/MS nº 3.523/1998", "Regulamento técnico de procedimentos de manutenção, operação e controle de sistemas de climatização, visando à qualidade do ar de interiores."],
    ["Resolução RE ANVISA nº 09/2003", "Padrões referenciais de qualidade do ar interior em ambientes climatizados artificialmente de uso público e coletivo."],
    ["ABNT NBR 13971", "Sistemas de refrigeração, condicionamento de ar e ventilação — manutenção programada."],
    ["ABNT NBR 16401", "Instalações de ar-condicionado — sistemas centrais e unitários."],
    ["ABNT NBR 14679", "Sistemas de condicionamento de ar e ventilação — execução de serviços de higienização."],
  ];
  const localTxt = e => [e.andar, e.ambiente].filter(Boolean).join(" — ") || "—";
  const capTxt = e => e.capacidadeBtu ? e.capacidadeBtu + " BTU/h" : "—";
  const regimeTxt = p => p.regime || "Equipe volante — visita " + ({ T: "trimestral", S: "semestral", A: "anual" }[p.frequencia] || "mensal") + " programada";   /* v1.38.0 */
  const dataBRc = s => s ? String(s).slice(8, 10) + "/" + String(s).slice(5, 7) + "/" + String(s).slice(0, 4) : "";
  const hojeBR = () => new Date().toLocaleDateString("pt-BR");
  function docEstilo2(cor) {
    return "@page{size:A4;margin:9mm 11mm}*{box-sizing:border-box}body{margin:0;color:#1a1d21;font:11px/1.45 'Space Grotesk','Segoe UI',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      "@media screen{body{max-width:900px;margin:16px auto;padding:0 16px}}@media print{.noprint{display:none}}" +
      "table.pg{width:100%;border-collapse:collapse}table.pg>thead>tr>td,table.pg>tfoot>tr>td,table.pg>tbody>tr>td{padding:0;border:0}" +
      ".hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid " + cor + ";padding-bottom:7px;margin-bottom:12px}.hd img{height:34px;max-width:150px;object-fit:contain}" +
      ".hd .bn{font-size:17px;font-weight:700;color:" + cor + ";line-height:1.1}.hd .bn small{display:block;font-size:10px;color:#6b7280;font-weight:500}.hd .dt{text-align:right;font-size:9.5px;color:#6b7280;max-width:60%}.hd .dt b{display:block;font-size:12px;color:" + cor + "}" +
      ".ft{border-top:1px solid " + cor + ";margin-top:10px;padding-top:4px;font-size:8.5px;color:#8a92a0;text-align:center}" +
      "h1{font-size:20px;color:" + cor + ";margin:6px 0 2px;letter-spacing:-.2px}h2{font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;color:" + cor + ";border-bottom:2px solid #e8ecf3;padding-bottom:4px;margin:16px 0 8px;break-after:avoid}" +
      ".sub{color:#4a5160;font-size:12px;margin-bottom:10px}" +
      "table.t{width:100%;border-collapse:collapse;font-size:10.5px;margin:4px 0 8px}table.t th{background:" + cor + ";color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.3px;padding:5px 6px;text-align:left}" +
      "table.t td{padding:4px 6px;border-bottom:1px solid #edf0f5;vertical-align:top}table.t tr:nth-child(even) td{background:#f7f9fd}table.t .c{text-align:center}table.t .r{text-align:right}" +
      "table.t tr.tot td{font-weight:700;background:#eef3ff}table.t tr.sec td{background:#eef3ff!important;font-weight:700;color:" + cor + ";font-size:9.5px;text-transform:uppercase}" +
      "table.kv{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:6px}table.kv td{padding:5px 8px;border-bottom:1px solid #edf0f5}table.kv td.l{color:#6b7280;font-weight:600;width:28%}" +
      ".res{display:flex;gap:8px;margin:10px 0}.res div{flex:1;background:#f4f7fd;border:1px solid #e3e9f5;border-radius:8px;padding:8px 10px;text-align:center}.res b{display:block;font-size:20px;color:" + cor + "}.res span{font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;font-weight:600}" +
      ".ok{color:#0b7d5c;font-weight:700}.an{color:#b3261e;font-weight:700}.nf{color:#b06a00;font-weight:700}.na{color:#8a92a0}" +
      ".eq{border:1px solid #e3e9f5;border-radius:8px;padding:8px 10px;margin:8px 0}.eq table.t,.eq .med,.eq .tt{break-inside:avoid}.eq .tt,.eq .ds{break-after:avoid}.mat{break-inside:avoid}.eq .tt{display:flex;justify-content:space-between;gap:8px;font-weight:700;font-size:12px}.eq .tt span.n{color:" + cor + "}" +
      ".eq .ds{font-size:10px;color:#6b7280;margin:2px 0 4px}.st{font-size:10px;padding:1px 8px;border-radius:10px;background:#e7f6ef;color:#0b7d5c;white-space:nowrap}.st.nao{background:#fde8e8;color:#b3261e}.st.par{background:#fff4e0;color:#b06a00}.st.pen{background:#fbeef2;color:#a3405f}" +
      ".med{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:4px}.med div{background:#f7f9fd;border-radius:6px;padding:4px 6px;font-size:9.5px;color:#6b7280}.med b{display:block;font-size:12px;color:#1a1d21}" +
      ".pend{background:#fbeef2;border-left:3px solid #a3405f;padding:6px 9px;border-radius:5px;margin:5px 0;font-size:10.5px;break-inside:avoid}.obs{background:#f7f9fd;padding:5px 8px;border-radius:5px;margin-top:4px;font-size:10.5px}" +
      ".ass{display:flex;gap:18px;margin-top:30px;break-inside:avoid}.ass div{flex:1;text-align:center;border-top:1px solid #1a1d21;padding-top:4px;font-size:10px;color:#4a5160}.ass b{display:block;color:#1a1d21}" +
      ".quebra{break-before:page}.nota{font-size:9.5px;color:#6b7280}.caixa{background:#f4f7fd;border-left:3px solid " + cor + ";padding:8px 10px;font-size:10.5px;margin:8px 0}" +
      ".mapa td,.mapa th{padding:3px 2px!important;text-align:center;font-size:9.5px}.mapa td.e,.mapa th.e{text-align:left;padding-left:6px!important;white-space:nowrap}.mapa .v{color:#0b7d5c;font-weight:700}.mapa .p{color:#b06a00;font-weight:700}.mapa .n{color:#a3405f;font-weight:700}" +
      ".barras{display:flex;align-items:flex-end;gap:6px;height:90px;margin:8px 0 2px;border-bottom:1px solid #d9dee8}.barras div{flex:1;text-align:center;font-size:9px;color:#6b7280}.barras i{display:block;background:" + cor + ";border-radius:3px 3px 0 0;margin:0 auto 2px;width:70%}.barras b{display:block;font-size:10px;color:#1a1d21}" +
      ".ficha{break-before:page}.ficha .tt{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid " + cor + ";padding-bottom:3px}.ficha .tt b{font-size:15px;color:" + cor + "}" +
      ".fic td,.fic th{font-size:9px!important;padding:3px 3px!important}.fic td.m,.fic th.m{text-align:center;width:5.2%}.fic td.pr{text-align:center;width:4%;font-weight:700;color:#6b7280}" +
      ".noprint{text-align:center;margin:16px 0}.noprint button{background:" + cor + ";color:#fff;border:0;border-radius:8px;padding:9px 18px;font-size:13px;cursor:pointer}";
  }
  /* página com cabeçalho e rodapé que se repetem na impressão */
  function docMontar(c, direita, corpo) {
    const e = c.emp || {};
    const rod = [e.nome, e.cnpj ? "CNPJ " + e.cnpj : "", e.endereco, e.telefone, e.email, e.site].filter(Boolean).map(es).join(" · ");
    return '<table class="pg"><thead><tr><td><div class="hd"><div>' + (c.logo ? '<img src="' + c.logo + '" alt="">' : '<div class="bn">' + es(e.nome || "") + (e.slogan ? "<small>" + es(e.slogan) + "</small>" : "") + "</div>") +
      '</div><div class="dt">' + direita + "</div></div></td></tr></thead><tfoot><tr><td><div class=\"ft\">" + rod + "</div></td></tr></tfoot><tbody><tr><td>" + corpo + "</td></tr></tbody></table>";
  }
  function escreverDoc(w, titulo, cor, html) {
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + es(titulo) + '</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"><style>' +
      docEstilo2(cor) + "</style></head><body>" + html + '<div class="noprint"><button onclick="window.print()">Imprimir / Salvar PDF</button></div></body></html>');
    w.document.close(); w.focus();
  }
  const resCel = r => r === "ok" ? '<span class="ok">OK</span>' : r === "an" ? '<span class="an">Não OK</span>' : r === "nf" ? '<span class="nf">NF</span>' : r === "na" ? '<span class="na">N/A</span>' : "";
  function normasDe(c, p) {
    const n = c.normas;
    const base = n && typeof n === "object" && Array.isArray(n.lista) && n.lista.length ? n.lista.map(x => [x.ref || x.nome || "", x.objeto || x.texto || ""]) : NORMAS_PADRAO;
    /* v1.27.0: normas adicionais marcadas no plano do cliente */
    const extra = (p && p.normasExtra) || [];
    return base.concat(NORMAS_ADICIONAIS.filter(x => extra.indexOf(x[0]) >= 0 && !base.some(b => b[0] === x[0])));
  }
  function equipOrdenados(p) { return p.equipamentos.slice().sort((a, b) => (String(a.andar || "") + String(a.ambiente || "") + a.tag).localeCompare(String(b.andar || "") + String(b.ambiente || "") + b.tag, "pt-BR")); }

  /* ---------- 1) PMOC do mês (documento técnico) ---------- */
  async function relatorioMes(p, sessao, w0) {
    const w = w0 || abrirJanela("o documento"); if (!w) return;
    const c = await cabecalho(sessao);
    const abs = id => new URL(K.urlAnexo(id), location.href).href;
    const comp = MESES[p.mes - 1] + " de " + p.ano;
    const lista = p.equipamentos.map(e => ({ e, v: p.visitas[e.id] || null }));
    lista.sort((a, b) => (b.v ? 1 : 0) - (a.v ? 1 : 0));
    const exec = lista.filter(x => x.v && x.v.status === "feita").length;
    const resV = v => v.resultado || resultadoDe(v.itens);   /* v1.34.0 */
    const nRes = r => lista.filter(x => x.v && x.v.status === "feita" && resV(x.v) === r).length;
    const tecMes = (p.mesesInfo && p.mesesInfo[p.mes] && p.mesesInfo[p.mes].tecnico) || (p.tecMesNomes && p.tecMesNomes[p.mes]) || (p.tecnicosNomes || []).join(", ") || "—";
    const pendMes = [];
    const blocos = lista.map(({ e, v }, i) => {
      const mod = p.modelos[e.modeloId] || { secoes: [] };
      const secs = itensDoMes(mod.secoes, p.mes, p.mesInicio);
      const rv = v && v.status === "feita" ? resV(v) : "";
      const st = !v ? '<span class="st nao">Não executada</span>' : v.status !== "feita" ? '<span class="st par">Em andamento</span>'
        : rv === "pendencia" ? '<span class="st pen">Pendência</span>' : rv === "parcial" ? '<span class="st par">Executado parcialmente</span>' : '<span class="st">Executado</span>';
      let h2 = '<div class="eq"><div class="tt"><span><span class="n">' + (i + 1) + "</span> " + es(e.tag) + " &nbsp;" + es(localTxt(e)) + "</span>" + st + "</div>" +
        '<div class="ds">' + es([e.tipo, e.marca, capTxt(e), e.tipoCond].filter(Boolean).join(" · ")) + (v && v.feitaEm ? " · executada em " + dataBRc(v.feitaEm) : "") + (v && v.tecnico ? " · " + es(v.tecnico) : "") + "</div>";
      if (v) {
        secs.filter(s => s.tipo !== "medicao").forEach(s => {
          h2 += '<table class="t"><tr><th style="width:6%">Per.</th><th>' + es(s.titulo) + '</th><th class="c" style="width:9%">Res.</th></tr>' +
            s.itens.map(it => '<tr><td class="c">' + es(it.per || "M") + "</td><td>" + es(it.n) + '</td><td class="c">' + (resCel(v.itens ? v.itens[it.k] : null) || "—") + "</td></tr>").join("") + "</table>";
        });
        const meds = [].concat.apply([], secs.filter(s => s.tipo === "medicao").map(s => s.itens));
        if (meds.length) h2 += '<div class="med">' + meds.map(it => "<div>" + es(it.n) + "<b>" + (v.med && v.med[it.k] ? es(v.med[it.k]) + " " + es(it.un || "") : "—") + "</b></div>").join("") + "</div>";
        if (v.obs) h2 += '<div class="obs"><b>Observação:</b> ' + br(v.obs) + "</div>";
        (v.pend || []).forEach(x => {
          h2 += '<div class="pend"><b>Pendência:</b> ' + es(x.texto) + (x.prioridade ? " — prioridade " + es(x.prioridade) : "") + (x.material ? " · material/peça: " + es(x.material) : "") + (x.resolvida ? " · resolvida" : "") + "</div>";
          if (!x.resolvida) pendMes.push({ e, x });
        });
        if (v.fotos && v.fotos.length) h2 += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' + v.fotos.map(f => '<img src="' + abs(f.id) + '" style="height:110px;border-radius:4px">').join("") + "</div>";
      }
      return h2 + "</div>";
    }).join("");
    const pendTodas = p.pendencias.map(x => ({ e: p.equipamentos.find(e => e.id === x.equipamentoId) || { tag: "", ambiente: "" }, x }));
    const corpo = '<h1 style="font-size:15px;text-transform:uppercase">Plano de Manutenção, Operação e Controle</h1><div class="sub"><b>PMOC · ' + MES3[p.mes - 1] + "/" + p.ano + "</b> — " + es(p.clienteNome) + "</div>" +
      '<table class="kv"><tr><td class="l">Contratante</td><td>' + es(p.clienteNome) + '</td><td class="l">Ano do plano</td><td>' + p.ano + "</td></tr>" +
      '<tr><td class="l">Regime</td><td>' + es(regimeTxt(p)) + '</td><td class="l">Competência</td><td>' + comp + "</td></tr>" +
      '<tr><td class="l">Executante</td><td>' + es(c.emp.nome || "") + '</td><td class="l">Técnico executante</td><td>' + es(tecMes) + "</td></tr>" +
      '<tr><td class="l">Responsável técnico</td><td>' + es(p.responsavelTecnico || "—") + (p.registro ? " · " + es(p.registro) : "") + '</td><td class="l">ART nº</td><td>' + es(p.art || "—") + "</td></tr></table>" +
      '<div class="res"><div><b>' + p.equipamentos.length + "</b><span>Máquinas</span></div><div><b>" + nRes("executado") + "</b><span>Executadas</span></div><div><b>" + nRes("parcial") + "</b><span>Exec. parcialmente</span></div><div><b>" + nRes("pendencia") + "</b><span>Com pendência</span></div><div><b>" + (p.equipamentos.length - exec) + "</b><span>Não executadas</span></div><div><b>" + p.pendencias.length + "</b><span>Pendências abertas</span></div></div>" +
      "<h2>Execução por equipamento</h2>" + blocos +
      (pendTodas.length ? "<h2>Pendências identificadas</h2>" + pendTodas.map(({ e, x }) => '<div class="pend"><b>' + es(e.tag) + " · " + es(localTxt(e)).toUpperCase() + "</b><br>" + es(x.texto) + (x.prioridade ? " — prioridade " + es(x.prioridade) : "") + (x.material ? " · material/peça: " + es(x.material) : "") + " · em aberto desde " + MES3[x.mes - 1] + "/" + p.ano + "</div>").join("") : "") +
      "<h2>Normas e responsabilidade técnica</h2><p class='nota'>Manutenção preventiva executada conforme " + normasDe(c, p).map(n => es(n[0])).join(", ") + ". " + LEG_DOC + " Periodicidade: M mensal, T trimestral, S semestral, A anual. Este documento integra o PMOC do contratante e deve ser mantido à disposição da fiscalização sanitária.</p>" +
      '<div class="ass"><div><b>' + es(tecMes) + "</b>Técnico executante</div><div><b>" + es(p.responsavelTecnico || "") + "</b>Responsável técnico" + (p.art ? " — ART " + es(p.art) : "") + "</div><div><b>" + es(p.clienteNome) + "</b>Contratante</div></div>";
    escreverDoc(w, "PMOC " + es(p.clienteNome) + " - " + MESES[p.mes - 1] + " " + p.ano, c.cor,
      docMontar(c, "<b>PMOC · " + MES3[p.mes - 1] + "/" + p.ano + "</b>" + es(p.clienteNome), corpo));
  }

  /* ---------- 2) Livro do PMOC (ano inteiro, com ficha de cada equipamento) ---------- */
  async function documentoPmoc(p0, sessao, w0) {
    const w = w0 || abrirJanela("o livro do PMOC"); if (!w) return;
    let p = p0;
    if (!p.visitasAno) { try { p = await api("pmoc.obter", { id: p0.id, mes: p0.mes, anoTodo: 1 }); } catch (x) { w.close(); return K.avisar(x.message, true); } }
    const c = await cabecalho(sessao);
    const eqs = equipOrdenados(p);
    const amb = {};
    eqs.forEach(e => {
      const k = (e.andar || "") + "|" + (e.ambiente || "");
      const a = amb[k] || (amb[k] = { andar: e.andar || "—", ambiente: e.ambiente || "—", area: e.area, fixo: e.ocupFixo, flut: e.ocupFlut, carga: e.cargaTermica, n: 0, cap: 0 });
      a.n++; a.cap += Number(e.capacidadeBtu) || 0;
    });
    const ambs = Object.keys(amb).map(k => amb[k]);
    const areaTot = ambs.reduce((s, a) => s + (Number(String(a.area || "").replace(",", ".")) || 0), 0);
    const ini = p.mesInicio || 1, fimM = ((ini + 10) % 12) + 1;
    const vig = MESES[ini - 1] + " de " + p.ano + " a " + MESES[fimM - 1] + " de " + (ini === 1 ? p.ano : p.ano + 1);
    const num = n => n == null || n === "" ? "—" : es(n);
    const fichas = eqs.map((e, i) => {
      const mod = p.modelos[e.modeloId] || { secoes: [] };
      const va = (p.visitasAno && p.visitasAno[e.id]) || {};
      let rows = "";
      (mod.secoes || []).forEach((s, si) => {
        rows += '<tr class="sec"><td colspan="' + (2 + mesesDe(p).length) + '">' + es(s.titulo) + "</td></tr>";
        s.itens.forEach((it, ii) => {
          const k = si + "-" + ii;
          rows += '<tr><td class="pr">' + (s.tipo === "medicao" ? es(it.un || "") : es(it.per || "M")) + "</td><td>" + es(it.n) + "</td>" +
            mesesDe(p).map(mm => { const v = va[mm]; if (!v) return '<td class="m"></td>';
              return '<td class="m">' + (s.tipo === "medicao" ? (v.med && v.med[k] ? es(v.med[k]) : "") : resCel(v.itens ? v.itens[k] : null)) + "</td>"; }).join("") + "</tr>";
        });
      });
      return '<div class="ficha"><div class="tt"><b>' + es(e.tag) + "</b><span>Ficha " + (i + 1) + " de " + eqs.length + "</span></div>" +
        '<div style="margin:3px 0 6px"><b>' + es(localTxt(e)) + '</b><div class="nota">' + es([e.tipo, e.marca, e.modelo, capTxt(e), e.tensao].filter(Boolean).join(" · ")) + "</div></div>" +
        '<table class="t fic"><tr><th style="width:4%">Per.</th><th>Item verificado</th>' + mesesDe(p).map(mm => '<th class="m">' + MES3[mm - 1].toUpperCase() + "</th>").join("") + "</tr>" + rows + "</table></div>";
    }).join("");
    const capa = '<div style="text-align:center;margin:40px 0 26px"><div class="nota" style="letter-spacing:2px;text-transform:uppercase">Plano de Manutenção, Operação e Controle</div>' +
      '<h1 style="font-size:34px;margin:6px 0">LIVRO DO PMOC</h1><div style="font-size:22px;font-weight:700">' + p.ano + "</div></div>" +
      "<h2>Contratante</h2><table class=\"kv\"><tr><td class=\"l\">Razão social</td><td>" + es(p.clienteNome) + "</td></tr>" + (p.clienteDocumento ? '<tr><td class="l">CNPJ</td><td>' + es(p.clienteDocumento) + "</td></tr>" : "") +
      '<tr><td class="l">Endereço</td><td>' + es(p.endereco || "—") + '</td></tr><tr><td class="l">Contato</td><td>' + es(p.clienteContato || "—") + "</td></tr>" +
      '<tr><td class="l">Período de vigência</td><td>' + vig + '</td></tr><tr><td class="l">Regime de atendimento</td><td>' + es(regimeTxt(p)) + "</td></tr>" +
      '<tr><td class="l">Ambientes climatizados</td><td>' + ambs.length + '</td></tr><tr><td class="l">Equipamentos</td><td>' + eqs.length + "</td></tr></table>" +
      "<h2>Executante e responsabilidade técnica</h2><table class=\"kv\"><tr><td class=\"l\">Empresa executante</td><td>" + es(c.emp.razao_social || c.emp.nome || "") + "</td></tr>" +
      (c.emp.cnpj ? '<tr><td class="l">CNPJ</td><td>' + es(c.emp.cnpj) + "</td></tr>" : "") + (c.emp.crea ? '<tr><td class="l">CREA da empresa</td><td>' + es(c.emp.crea) + "</td></tr>" : "") +
      '<tr><td class="l">Responsável técnico</td><td>' + es(p.responsavelTecnico || "—") + "</td></tr>" + (p.registro ? '<tr><td class="l">CREA do responsável</td><td>' + es(p.registro) + "</td></tr>" : "") +
      '<tr><td class="l">ART nº</td><td>' + es(p.art || "—") + '</td></tr><tr><td class="l">Emitido em</td><td>' + hojeBR() + "</td></tr></table>" +
      '<div class="caixa">Documento de porte obrigatório no local da instalação, à disposição da fiscalização sanitária.</div>';
    const legal = '<div class="quebra"></div><h2>Fundamentação legal e referências normativas</h2>' +
      "<p>Este Livro integra o Plano de Manutenção, Operação e Controle (PMOC) do contratante identificado na capa, elaborado e executado conforme a legislação sanitária brasileira aplicável a sistemas de climatização de uso coletivo.</p>" +
      "<p><b>Lei nº 13.589, de 4 de janeiro de 2018</b> — dispõe sobre a manutenção de instalações e equipamentos de sistemas de climatização de edificações de uso público e coletivo. Determina que tais edificações mantenham PMOC elaborado por profissional habilitado, que o plano permaneça no local da instalação à disposição da fiscalização, e que a responsabilidade pela execução seja de profissional legalmente habilitado com registro no conselho de classe.</p>" +
      '<p>A manutenção registrada neste Livro observa ainda os seguintes atos e normas técnicas:</p><table class="t"><tr><th style="width:30%">Referência</th><th>Objeto</th></tr>' + normasDe(c, p).map(n => "<tr><td><b>" + es(n[0]) + "</b></td><td>" + es(n[1]) + "</td></tr>").join("") + "</table>" +
      (p.obs ? '<div class="obs">' + br(p.obs) + "</div>" : "") +
      "<h2>Como este livro é preenchido</h2><p>Cada equipamento possui uma ficha própria, ao final deste documento, com os itens verificados nas linhas e os doze meses do ano nas colunas. O técnico executante registra o resultado de cada item no mês correspondente.</p>" +
      '<p class="nota">' + LEG_DOC + ' Periodicidade: M mensal · T trimestral · S semestral · A anual. Seções de medição registram o valor lido, na unidade indicada. Células já preenchidas correspondem a execuções registradas no sistema. As demais são preenchidas à mão no ato da manutenção.</p>';
    const ambT = '<div class="quebra"></div><h2>Identificação dos ambientes climatizados</h2><table class="t"><tr><th>Andar</th><th>Ambiente</th><th class="c">Área (m²)</th><th class="c">Ocup. fixo</th><th class="c">Ocup. flut.</th><th class="c">Carga térmica</th><th class="c">Equip.</th><th class="r">Capac. total (BTU/h)</th></tr>' +
      ambs.map(a => "<tr><td>" + es(a.andar) + "</td><td>" + es(a.ambiente) + '</td><td class="c">' + num(a.area) + '</td><td class="c">' + num(a.fixo) + '</td><td class="c">' + num(a.flut) + '</td><td class="c">' + num(a.carga) + '</td><td class="c">' + a.n + '</td><td class="r">' + (a.cap ? a.cap.toLocaleString("pt-BR") : "—") + "</td></tr>").join("") +
      '<tr class="tot"><td colspan="2">Total</td><td class="c">' + (areaTot ? areaTot.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—") + '</td><td></td><td></td><td></td><td class="c">' + eqs.length + "</td><td></td></tr></table>" +
      '<p class="nota">Os dados de área, ocupação e carga térmica são os informados no cadastro dos equipamentos de cada ambiente.</p>' +
      '<h2>Identificação dos equipamentos</h2><table class="t"><tr><th>Nº</th><th>TAG</th><th>Ambiente</th><th>Tipo</th><th>Marca</th><th>Modelo</th><th>Série</th><th>Capacidade</th><th>Fluido</th><th>Tensão</th></tr>' +
      eqs.map((e, i) => "<tr><td>" + (i + 1) + "</td><td><b>" + es(e.tag) + "</b></td><td>" + es(localTxt(e)) + "</td><td>" + num(e.tipo) + "</td><td>" + num(e.marca) + "</td><td>" + num(e.modelo) + "</td><td>" + num(e.serie) + "</td><td>" + capTxt(e) + "</td><td>" + num(e.gas) + "</td><td>" + num(e.tensao) + "</td></tr>").join("") + "</table>";
    escreverDoc(w, "Livro do PMOC " + p.clienteNome + " " + p.ano, c.cor, docMontar(c, "<b>LIVRO DO PMOC · " + p.ano + "</b>" + es(p.clienteNome), capa + legal + ambT + fichas));
  }

  /* ---------- 3) Relatório de acompanhamento (mês, com o ano todo) ---------- */
  async function relatorioAcompanhamento(p, sessao, w0) {
    const w = w0 || abrirJanela("o relatório"); if (!w) return;
    const c = await cabecalho(sessao);
    const eqs = equipOrdenados(p);
    const st = (e, m) => (p.mapa[e.id] || {})[m];
    const noMes = eqs.filter(e => st(e, p.mes)).length;
    const completas = eqs.filter(e => st(e, p.mes) === "feita").length;
    const mServ = mesesDe(p);   /* v1.38.0 */
    const porMes = mServ.map(mm => eqs.filter(e => st(e, mm)).length);
    const max = Math.max(1, ...porMes);
    const agora = new Date(); const atualAM = agora.getFullYear() * 12 + agora.getMonth() + 1;
    const pend = p.pendencias.map(x => ({ x, e: p.equipamentos.find(e => e.id === x.equipamentoId) || { tag: "", ambiente: "" } }));
    const vindas = pend.filter(o => o.x.mes < p.mes).length;
    const corpo = '<h1 style="font-size:15px;text-transform:uppercase">Relatório de manutenção — acompanhamento anual</h1><div class="sub"><b>' + MESES[p.mes - 1] + " / " + p.ano + "</b> — " + es(p.clienteNome) + "</div>" +
      '<div class="res"><div><b>' + noMes + "</b><span>Equipamentos atendidos no mês</span></div><div><b>" + completas + "</b><span>Preventivas completas</span></div><div><b>" + eqs.length + "</b><span>Parque total</span></div><div><b>" + pend.length + "</b><span>Pendências em aberto</span></div></div>" +
      "<h2>Atividade ao longo do ano</h2><div class=\"barras\">" + porMes.map((n, i) => "<div>" + (n ? "<b>" + n + "</b>" : "") + '<i style="height:' + Math.round(n / max * 70) + "px;" + (mServ[i] === p.mes ? "" : "opacity:.55") + '"></i>' + MES3[mServ[i] - 1] + "</div>").join("") + "</div>" +
      '<h2>Mapa de atividades por equipamento</h2><table class="t mapa"><tr><th class="e">Equipamento / local</th>' + mServ.map(mm => "<th>" + MES3[mm - 1].toUpperCase() + "</th>").join("") + "<th>TOT.</th></tr>" +
      eqs.map(e => { let t = 0; return '<tr><td class="e"><b>' + es(e.tag) + "</b> " + es(localTxt(e)) + "</td>" + mServ.map(mm => { const s = st(e, mm); if (s) t++; const r = s === "feita" ? resDe(p, e.id, mm) : "";
        return "<td>" + (r === "pendencia" ? '<span class="n">!</span>' : r === "parcial" ? '<span class="p">½</span>' : s === "feita" ? '<span class="v">✓</span>' : s ? '<span class="p">•</span>' : "") + "</td>"; }).join("") + "<td><b>" + t + "</b></td></tr>"; }).join("") + "</table>" +
      '<p class="nota">✓ executado · ½ executado parcialmente (item não feito) · ! pendência (item não conforme) · • em andamento · célula vazia: sem atendimento no mês</p>' +
      (pend.length ? "<h2>Pendências em aberto" + (vindas ? " · " + vindas + " vindas de meses anteriores" : "") + "</h2>" + pend.map(({ x, e }) => {
          const n = atualAM - (p.ano * 12 + x.mes);
          return '<div class="pend"><b>' + es(x.prioridade || "Normal") + "</b> · " + es(e.tag) + " · " + es(localTxt(e)) + (n > 0 ? " · arrastada há " + n + " mês(es) — desde " + MES3[x.mes - 1] + "/" + p.ano : " · aberta em " + MES3[x.mes - 1] + "/" + p.ano) + "<br>" + es(x.texto) + (x.material ? " · material: " + es(x.material) : "") + "</div>";
        }).join("") : "<h2>Pendências em aberto</h2><p>Nenhuma pendência em aberto.</p>") +
      (pend.some(o => o.x.material) ? '<div class="mat"><h2>Material necessário para concluir</h2><table class="t"><tr><th>Item</th><th>Onde</th><th>Prioridade</th></tr>' +
        pend.filter(o => o.x.material).map(({ x, e }) => "<tr><td>" + es(x.material) + "</td><td>" + es(e.tag) + " · " + es(localTxt(e)) + "</td><td>" + es(x.prioridade || "Normal") + "</td></tr>").join("") +
        '</table><p class="nota">Itens necessários para encerrar as pendências acima. Sujeito a orçamento e aprovação.</p></div>' : "") +
      '<p class="nota" style="margin-top:14px">Responsável técnico: ' + es(p.responsavelTecnico || "—") + (p.art ? " · ART " + es(p.art) : "") +
      ((p.mesesInfo && p.mesesInfo[p.mes] && p.mesesInfo[p.mes].tecnico) ? " · Técnico executante: " + es(p.mesesInfo[p.mes].tecnico) : "") + "</p>";
    escreverDoc(w, "Relatório mensal " + p.clienteNome + " - " + MESES[p.mes - 1] + " " + p.ano, c.cor,
      docMontar(c, "<b>ACOMPANHAMENTO · " + MES3[p.mes - 1] + "/" + p.ano + "</b>" + es(p.clienteNome), corpo));
  }

  /* =================================================================
     v1.13.0 — TELA DO CLIENTE NO PMOC, MÁQUINAS, HISTÓRICO, OCORRÊNCIA,
     ETIQUETAS QR, LEITOR DE QR E ÁREA DO CLIENTE
     ================================================================= */
  const PRIOR_OS = [["baixa", "Baixa"], ["normal", "Normal"], ["alta", "Alta"], ["urgente", "Urgente"]];
  const dataBR = s => s ? String(s).slice(8, 10) + "/" + String(s).slice(5, 7) + "/" + String(s).slice(0, 4) : "";
  const localEq = e => [e.andar && String(e.ambiente || "").indexOf(e.andar) < 0 ? e.andar : "", e.ambiente].filter(Boolean).join(" · ");
  const semAcento = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const casa = (e, q) => !q.trim() || semAcento(q).split(/\s+/).filter(Boolean).every(p => semAcento([e.tag, e.ambiente, e.andar, e.tipo, e.marca, e.modelo, e.serie, e.clienteNome].join(" ")).indexOf(p) >= 0);
  const urlQr = tok => location.origin + location.pathname.replace(/[^/]*$/, "") + "q/?t=" + tok;
  const SELO_OS = st => st === "Concluída" || st === "Serviço finalizado" ? "os-verde" : st === "Cancelada" ? "os-cinza" : st === "Aberta" ? "os-azul" : "os-amarelo";
  const NOME_EVENTO = { instalacao: "Instalação", troca: "Troca do aparelho", alteracao: "Alteração dos dados do aparelho" };

  function qrSvg(texto) {
    try { const q = window.qrcode(0, "M"); q.addData(String(texto)); q.make(); return q.createSvgTag(4, 2); }
    catch (e) { return '<div style="font:600 11px sans-serif;color:#a3405f">QR indisponível</div>'; }
  }

  /* =================================================================
     ETIQUETAS QR — configuráveis (substitui a função imprimirEtiquetas da v1.13.0 em app/pmoc.js)
     - 3 tamanhos: Grande (2 por linha), Média (3 por linha), Pequena (4 por linha, QR em cima)
     - liga/desliga: empresa, cliente, dica, borda de corte
     - "começar na posição": reaproveita folha adesiva já usada
     - cada etiqueta tem tamanho fixo em mm e corta o que não couber (nada invade a vizinha)
     - a escolha fica lembrada neste navegador
     ================================================================= */
  function imprimirEtiquetas(lista, sessao, clienteNome) {
    const itens = (lista || []).filter(e => e.qrToken);
    if (!itens.length) return K.avisar("Nenhum equipamento com código de QR. Rode o SQL 08 da versão 1.13.0.", true);
    const w = window.open("", "_blank");
    if (!w) return K.avisar("Permita pop-ups para imprimir as etiquetas.", true);
    const emp = (sessao.empresa && sessao.empresa.nome) || "";
    const cor = /^#[0-9a-f]{6}$/i.test((sessao.empresa || {}).corPrimaria || "") ? sessao.empresa.corPrimaria : "#111111";
    const dica = "Aponte a câmera do celular para ver o histórico de manutenção";
    const et = itens.map(e => '<div class="et"><div class="qr">' + qrSvg(urlQr(e.qrToken)) + '</div><div class="tx">' +
      '<div class="emp">' + es(emp) + '</div>' +
      '<div class="tag">' + es(e.tag) + '</div>' +
      '<div class="loc">' + es(localEq(e)) + '</div>' +
      (clienteNome || e.clienteNome ? '<div class="cli">' + es(clienteNome || e.clienteNome) + '</div>' : '') +
      '<div class="dica">' + dica + '</div></div></div>').join("");

    const css =
      "@page{size:A4;margin:8mm}" +
      "*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      "body{margin:0;background:#fff;color:#222}" +
      /* tamanhos: largura, altura, QR, fontes */
      "body.t-g{--c:2;--w:92mm;--h:45mm;--qr:37mm;--tag:16pt;--loc:9pt;--emp:7.5pt;--cli:7.5pt;--dica:6.5pt}" +
      "body.t-m{--c:3;--w:61mm;--h:33mm;--qr:27mm;--tag:11pt;--loc:7pt;--emp:6pt;--cli:6pt;--dica:5.5pt}" +
      "body.t-p{--c:4;--w:45mm;--h:50mm;--qr:30mm;--tag:10pt;--loc:6.5pt;--emp:5.5pt;--cli:5.5pt;--dica:5pt}" +
      ".grade{display:grid;grid-template-columns:repeat(var(--c),var(--w));grid-auto-rows:var(--h);gap:3mm;justify-content:center}" +
      ".et{width:var(--w);height:var(--h);overflow:hidden;border:1px dashed #9aa1ad;border-radius:2.5mm;padding:2.5mm;display:flex;gap:2.5mm;align-items:center;break-inside:avoid;page-break-inside:avoid;background:#fff}" +
      ".et.vazio{visibility:hidden}" +
      ".qr{width:var(--qr);height:var(--qr);flex:none}.qr svg{width:100%;height:100%;display:block}" +
      ".tx{flex:1;min-width:0;overflow:hidden;display:flex;flex-direction:column;gap:.6mm}" +
      ".emp,.cli{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".emp{font-size:var(--emp);color:#555}" +
      ".tag{font-size:var(--tag);font-weight:800;color:" + cor + ";line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em}" +
      ".loc{font-size:var(--loc);color:#222;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
      ".cli{font-size:var(--cli);color:#666}" +
      ".dica{font-size:var(--dica);color:#777;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
      /* pequena: QR em cima, texto embaixo, centralizado */
      "body.t-p .et{flex-direction:column;justify-content:flex-start;text-align:center;gap:1.2mm}" +
      "body.t-p .tx{width:100%;align-items:center}" +
      "body.t-p .dica{display:none}" +
      /* opções */
      "body.sem-emp .emp,body.sem-cli .cli,body.sem-dica .dica{display:none}" +
      "body.sem-borda .et{border-color:transparent}" +
      /* barra de configuração (não imprime) */
      ".barra{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:center;padding:12px 16px;margin-bottom:14px;background:#f3f4f6;border-bottom:1px solid #e3e6ea;font-size:14px}" +
      ".barra label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}" +
      ".barra select,.barra input[type=number]{font:inherit;padding:5px 8px;border:1px solid #cfd3d9;border-radius:6px;background:#fff}" +
      ".barra input[type=number]{width:64px}" +
      ".barra button{font:inherit;font-weight:600;background:" + cor + ";color:#fff;border:0;border-radius:8px;padding:9px 18px;cursor:pointer}" +
      "@media print{.barra{display:none}body{background:#fff}}";

    const script = [
      "(function(){",
      "var C='kEtiquetasQR', b=document.body, g=document.getElementById('grade');",
      "var cfg={t:'m',emp:true,cli:true,dica:true,borda:true,ini:1};",
      "try{var s=JSON.parse(localStorage.getItem(C)||'null');if(s)for(var k in cfg)if(k in s)cfg[k]=s[k];}catch(e){}",
      "var $=function(id){return document.getElementById(id);};",
      "function aplicar(){",
      "  b.className='t-'+cfg.t+(cfg.emp?'':' sem-emp')+(cfg.cli?'':' sem-cli')+(cfg.dica?'':' sem-dica')+(cfg.borda?'':' sem-borda');",
      "  var v=g.querySelectorAll('.et.vazio');for(var i=0;i<v.length;i++)v[i].remove();",
      "  var n=Math.max(0,Math.min(60,(parseInt(cfg.ini,10)||1)-1));",
      "  for(var j=0;j<n;j++){var d=document.createElement('div');d.className='et vazio';g.insertBefore(d,g.firstChild);}",
      "  try{localStorage.setItem(C,JSON.stringify(cfg));}catch(e){}",
      "}",
      "$('o-t').value=cfg.t;$('o-emp').checked=cfg.emp;$('o-cli').checked=cfg.cli;$('o-dica').checked=cfg.dica;$('o-borda').checked=cfg.borda;$('o-ini').value=cfg.ini;",
      "$('o-t').onchange=function(){cfg.t=this.value;aplicar();};",
      "['emp','cli','dica','borda'].forEach(function(k){$('o-'+k).onchange=function(){cfg[k]=this.checked;aplicar();};});",
      "$('o-ini').oninput=function(){cfg.ini=this.value;aplicar();};",
      "$('o-imp').onclick=function(){window.print();};",
      "aplicar();",
      "})();"
    ].join("\n");

    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Etiquetas QR' + (clienteNome ? " - " + es(clienteNome) : "") +
      '</title><style>' + css + '</style></head><body class="t-m">' +
      '<div class="barra">' +
        '<label>Tamanho <select id="o-t">' +
          '<option value="g">Grande · 2 por linha</option>' +
          '<option value="m">Média · 3 por linha</option>' +
          '<option value="p">Pequena · 4 por linha</option>' +
        '</select></label>' +
        '<label><input type="checkbox" id="o-emp"> Empresa</label>' +
        '<label><input type="checkbox" id="o-cli"> Cliente</label>' +
        '<label><input type="checkbox" id="o-dica"> Dica da câmera</label>' +
        '<label><input type="checkbox" id="o-borda"> Linha de corte</label>' +
        '<label>Começar na posição <input type="number" id="o-ini" min="1" max="60" value="1"></label>' +
        '<button id="o-imp" type="button">Imprimir ' + itens.length + ' etiqueta(s)</button>' +
      '</div>' +
      '<div class="grade" id="grade">' + et + '</div>' +
      '<script>' + script + '<\/script></body></html>');
    w.document.close(); w.focus();
  }

  /* resolver pendência com nota de quem resolveu */
  function ResolverPend({ pd, aoFechar, aoResolvido }) {
    const [nota, setNota] = useState("");
    const [salvando, setSalvando] = useState(false);
    async function ok() {
      setSalvando(true);
      try { await api("pmoc.pendencia.resolver", { visitaId: pd.visitaId, pendenciaId: pd.id, nota }); K.avisar("Pendência resolvida."); aoResolvido(); }
      catch (x) { K.avisar(x.message, true); setSalvando(false); }
    }
    return h(Painel, { titulo: "Resolver pendência", sub: (pd.tag ? pd.tag + " · " : "") + pd.texto, aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", disabled: salvando, onClick: ok }, salvando ? "Salvando…" : "Marcar como resolvida")] },
      h(Campo, { rotulo: "O que foi feito (opcional)", dica: "Fica registrado com o seu nome e a data." }, h("textarea", { value: nota, onChange: e => setNota(e.target.value), rows: 3, autoFocus: true })));
  }

  /* ocorrência = chamado no local / corretiva.
     v1.27.0: por padrão é REGISTRO EM UM PASSO — motivo, o que foi feito, materiais e fotos;
     ao salvar a OS de contrato (C-0001) já nasce concluída, ligada à máquina.
     "Agendar para depois" mantém o fluxo antigo (OS aberta com técnico e data). */
  function FormOcorrencia({ clienteId, clienteNome, op, sessao, pend, equipId, tarefa, aoFechar, aoCriar }) {
    const esc = escritorio(sessao);
    const hojeISO = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const [equips, setEquips] = useState(null);
    const [filtro, setFiltro] = useState("");
    const [modo, setModo] = useState("feita");
    const [f, setF] = useState({ equipamentoId: equipId || (pend && pend.equipamentoId) || "", descricao: pend ? pend.texto + (pend.material ? "\nMaterial: " + pend.material : "") : tarefa ? tarefa.texto : "",
      servico: "", materiais: pend && pend.material ? pend.material : "", dataAtendimento: hojeISO,
      prioridade: pend && (pend.prioridade === "Alta" || pend.prioridade === "Urgente") ? pend.prioridade.toLowerCase() : "normal", dataPrev: "", horaPrev: "", tecnicos: [] });
    const [fotos, setFotos] = useState([]);
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState("");
    const m = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    useEffect(() => { api("pmoc.equip.listar", { clienteId }).then(d => setEquips(d.itens), e => setErro(e.message)); }, [clienteId]);
    const feita = modo === "feita";
    async function salvar() {
      setErro(""); setSalvando("Salvando…");
      try {
        const r = await api("pmoc.ocorrencia.criar", Object.assign({}, f, { clienteId, equipamentoId: f.equipamentoId || null, executada: feita ? 1 : 0,
          pendencia: pend ? { visitaId: pend.visitaId, id: pend.id } : null, tarefaId: tarefa ? tarefa.id : null }));
        /* fotos depois que a OS existe */
        let falhou = 0;
        for (let i = 0; i < fotos.length; i++) {
          setSalvando("Enviando foto " + (i + 1) + " de " + fotos.length + "…");
          try { const b = K.OS && K.OS.comprimir ? await K.OS.comprimir(fotos[i]) : fotos[i]; await K.enviarArquivo("os.foto.enviar", b, { osId: r.id }); } catch (x) { falhou++; }
        }
        K.avisar(feita ? "Ocorrência registrada (OS " + r.numero + ")." + (falhou ? " " + falhou + " foto(s) não subiram." : "") : "OS " + r.numero + " aberta.", !!falhou);
        aoCriar(r);
      } catch (x) { setErro(x.codigo === "REDE" ? "Sem internet: a ocorrência precisa de conexão para gerar o número da OS. O texto continua aqui." : x.message); setSalvando(""); }
    }
    const lista = (equips || []).filter(e => casa(e, filtro) || String(e.id) === String(f.equipamentoId));
    const tec = (op && op.equipe || []).filter(x => x.perfil === "tecnico" || x.perfil === "coord" || x.perfil === "admin");
    const pode = !salvando && f.descricao.trim() && (!feita || f.servico.trim());
    const addFotos = fl => setFotos(l => l.concat(Array.from(fl || []).filter(x => /^image\//.test(x.type))).slice(0, 12));
    return h(Painel, { titulo: feita ? "Registrar ocorrência" : "Agendar ocorrência", sub: clienteNome + (feita ? " · atendimento já feito" : " · vira OS de contrato para executar depois"), aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", disabled: !pode, onClick: salvar }, salvando || (feita ? "Salvar ocorrência" : "Abrir OS"))] },
      h(Aviso, null, erro),
      h("div", { className: "tf-seg", style: { marginBottom: 12 } },
        h("button", { type: "button", className: "seg" + (feita ? " on" : ""), onClick: () => setModo("feita") }, "Já atendi"),
        h("button", { type: "button", className: "seg" + (!feita ? " on" : ""), onClick: () => setModo("agendar") }, "Agendar para depois")),
      tarefa ? h(Aviso, { tipo: "ok" }, "A partir da solicitação do cliente. A OS fica ligada a ela e o cliente acompanha pela área dele." + (feita ? " Ao salvar, a solicitação fica concluída." : "")) : null,
      pend ? h(Aviso, { tipo: "ok" }, "A partir da pendência de " + MESES[pend.mes - 1] + "/" + pend.ano + (pend.tag ? " · " + pend.tag : "") + (feita ? ". Ao salvar, a pendência fica resolvida." : ". A OS fica ligada a ela.")) : null,
      h("div", { className: "campo" }, h("span", null, "Equipamento"),
        (equips || []).length > 12 ? h("input", { className: "entrada-texto", placeholder: "Filtrar por TAG, andar, local…", value: filtro, onChange: e => setFiltro(e.target.value), style: { marginBottom: 6 } }) : null,
        h("select", { className: "entrada-texto", value: f.equipamentoId, onChange: e => m("equipamentoId")(e.target.value) },
          h("option", { value: "" }, equips ? "Sem equipamento específico" : "Carregando…"),
          lista.map(e => h("option", { key: e.id, value: e.id }, e.tag + (localEq(e) ? " · " + localEq(e) : ""))))),
      h(Campo, { rotulo: feita ? "Motivo do chamado" : "O que aconteceu / o que fazer", dica: feita ? "Por que foram chamados ao local." : "" },
        h("textarea", { value: f.descricao, onChange: e => m("descricao")(e.target.value), rows: 3, autoFocus: !pend, "data-rascunho": "oco-desc", placeholder: "Ex.: máquina pingando no forro da sala 12" })),
      feita ? h(React.Fragment, null,
        h(Campo, { rotulo: "O que foi feito" }, h("textarea", { value: f.servico, onChange: e => m("servico")(e.target.value), rows: 4, "data-rascunho": "oco-serv", placeholder: "Ex.: desobstruído o dreno, limpeza da bandeja e teste de funcionamento OK" })),
        h(Campo, { rotulo: "Materiais usados (opcional)", dica: "Um por linha. Ex.: 2 m mangueira de dreno" }, h("textarea", { value: f.materiais, onChange: e => m("materiais")(e.target.value), rows: 2 })),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Data do atendimento" }, h("input", { className: "entrada-texto", type: "date", value: f.dataAtendimento, max: hojeISO, onChange: e => m("dataAtendimento")(e.target.value) })),
          h("div", { className: "campo" }, h("span", null, "Fotos (opcional)"),
            h("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
              h("label", { className: "bt bt-p" }, "Câmera", h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onChange: e => { addFotos(e.target.files); e.target.value = ""; } })),
              h("label", { className: "bt bt-p" }, "Galeria", h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onChange: e => { addFotos(e.target.files); e.target.value = ""; } })),
              fotos.length ? h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => setFotos([]) }, fotos.length + " foto(s) · limpar") : null))),
        h("p", { className: "cel-sub" }, "Ao salvar, a OS de contrato já fica concluída no histórico da máquina — sem lista de tarefas para preencher."))
      : h(React.Fragment, null,
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Prioridade" }, h("select", { className: "entrada-texto", value: f.prioridade, onChange: e => m("prioridade")(e.target.value) }, PRIOR_OS.map(([v, l]) => h("option", { key: v, value: v }, l)))),
          h(Campo, { rotulo: "Data prevista" }, h("input", { className: "entrada-texto", type: "date", value: f.dataPrev, onChange: e => m("dataPrev")(e.target.value) }))),
        esc ? h(React.Fragment, null,
          h("div", { className: "secao-titulo" }, "Técnicos"),
          h("div", { className: "pm-tecs" }, tec.map(t => h("label", { key: t.id, className: "tf-minhas" },
            h("input", { type: "checkbox", checked: f.tecnicos.indexOf(t.id) >= 0, onChange: e => m("tecnicos")(e.target.checked ? f.tecnicos.concat([t.id]) : f.tecnicos.filter(x => x !== t.id)) }), " " + t.nome))))
        : h("p", { className: "cel-sub" }, "A OS fica no seu nome. O escritório vê na hora em Ordens de serviço.")));
  }

  /* abre o apontamento de um equipamento direto (QR ou histórico) */
  function ApontarDireto({ planoId, equipId, mes, sessao, aoFechar, aoHistorico }) {
    const [p, setP] = useState(null);
    const [erro, setErro] = useState("");
    useEffect(() => { api("pmoc.obter", { id: planoId, mes }).then(setP, e => setErro(e.message)); }, [planoId, mes]);
    if (erro) return h(Painel, { titulo: "PMOC", aoFechar }, h(Aviso, null, erro));
    if (!p) return h(Painel, { titulo: "PMOC", aoFechar }, h("div", { className: "vazio" }, "Carregando…"));
    const eq = p.equipamentos.find(e => e.id === Number(equipId));
    if (!eq) return h(Painel, { titulo: "PMOC", aoFechar }, h("div", { className: "vazio" }, "Este equipamento não está no plano deste mês."));
    return h(Apontamento, { p, equip: eq, sessao, aoFechar, aoHistorico, aoSalvar: v => setP(x => Object.assign({}, x, { visitas: Object.assign({}, x.visitas, { [eq.id]: v }) })) });
  }

  /* linha do tempo do equipamento — escritório, técnico e cliente (só leitura) */
  function HistoricoEquip({ id, sessao, aoFechar }) {
    const cliente = sessao.usuario.perfil === "cliente";
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [sub, setSub] = useState(null);
    function carregar() { api("pmoc.equip.historico", { id }).then(setD, e => setErro(e.message)); }
    useEffect(carregar, [id]); // eslint-disable-line
    if (erro && !d) return h(Painel, { titulo: "Equipamento", aoFechar }, h(Aviso, null, erro));
    if (!d) return h(Painel, { titulo: "Equipamento", aoFechar, largo: true }, h("div", { className: "vazio" }, "Carregando…"));
    const e = d.equipamento;
    const ficha = [["Cliente", d.clienteNome], ["Local", localEq(e)], ["Tipo", e.tipo], ["Capacidade", btu(e.capacidadeBtu)], ["Marca / modelo", [e.marca, e.modelo].filter(Boolean).join(" ")],
      ["Nº de série", e.serie], ["Condensadora", [e.modeloCond, e.serieCond ? "série " + e.serieCond : ""].filter(Boolean).join(" · ")], ["Tensão", e.tensao], ["Gás", e.gas],
      ["Situação", e.status], ["Instalado em", dataBR(e.dataInstalacao)], ["Área / carga térmica", [e.area ? e.area + " m²" : "", e.cargaTermica ? e.cargaTermica + " BTU/h" : ""].filter(Boolean).join(" · ")]].filter(x => x[1]);
    const abrirOS = o => {
      if (cliente || !K.OS) return K.OS && K.OS.relatorioDaOS ? K.OS.relatorioDaOS(o.id, sessao) : null;
      api("os.opcoes").then(op => setSub({ tipo: "os", id: o.id, op }), x => K.avisar(x.message, true));
    };
    return h(Painel, { titulo: e.tag + (localEq(e) ? " · " + localEq(e) : ""), sub: descEquip(e) || "Equipamento", largo: true, aoFechar,
      rodape: [!cliente ? h("button", { key: "q", className: "bt", onClick: () => imprimirEtiquetas([e], sessao, d.clienteNome) }, "Etiqueta QR") : null,
               !cliente ? h("button", { key: "o", className: "bt", onClick: () => api("pmoc.opcoes").then(op => setSub({ tipo: "oco", op: guardarTipos(op) }), x => K.avisar(x.message, true)) }, "Abrir ocorrência") : null,
               h("div", { key: "e", style: { flex: 1 } }),
               !cliente && d.planoAtual ? h("button", { key: "a", className: "bt bt-marca", onClick: () => setSub({ tipo: "apontar" }) }, "Apontar " + MESES[d.planoAtual.mes - 1]) : null,
               h("button", { key: "f", className: "bt" + (cliente || !d.planoAtual ? " bt-marca" : ""), onClick: aoFechar }, "Fechar")] },
      h("div", { className: "pm-ficha" }, ficha.map(([r, v]) => h("div", { key: r }, h("span", null, r), h("b", null, v)))),
      (e.historico || []).length ? h(React.Fragment, null, h("div", { className: "secao-titulo" }, "Instalação e trocas"),
        h("div", { className: "pm-lista" }, e.historico.slice().reverse().map((x, i) => h("div", { key: x.id || i, className: "pm-pend" },
          h("div", null, h("b", null, NOME_EVENTO[x.tipoEvento] || "Registro"), h("div", { className: "cel-sub" }, [dataBR(x.data), x.tecnico, x.motivo].filter(Boolean).join(" · "),
            x.de || x.para ? " — " + [x.de ? "antes: " + [x.de.marca, x.de.modelo, x.de.btu ? x.de.btu + " BTU/h" : ""].filter(Boolean).join(" ") : "", x.para ? "agora: " + [x.para.marca, x.para.modelo, x.para.btu ? x.para.btu + " BTU/h" : ""].filter(Boolean).join(" ") : ""].filter(Boolean).join(" · ") : ""))))) ) : null,
      h("div", { className: "secao-titulo" }, "Ocorrências e serviços (" + d.ocorrencias.length + ")"),
      d.ocorrencias.length ? h("div", { className: "pm-lista" }, d.ocorrencias.map(o => h("button", { key: o.id, type: "button", className: "pm-eq", onClick: () => abrirOS(o) },
        h("div", null, h("b", null, "OS " + o.numero), " · " + dataBR(o.fechadaEm || o.criadoEm), h("div", { className: "cel-sub" }, o.descricao || o.tipoServico || "—", o.conclusao ? " — " + o.conclusao : "")),
        h("span", { className: "selo " + SELO_OS(o.status) }, o.status))))
      : h("p", { className: "cel-sub" }, "Nenhuma ocorrência ligada a este equipamento."),
      h("div", { className: "secao-titulo" }, "Manutenção preventiva (" + d.preventivas.length + ")"),
      d.preventivas.length ? h("div", { className: "pm-lista" }, d.preventivas.map(v => h("div", { key: v.visitaId, className: "pm-pend" },
        h("div", null, h("b", null, MESES[v.mes - 1] + " de " + v.ano),
          h("div", { className: "cel-sub" }, [v.feitaEm ? dataHoraBR(v.feitaEm) : "", v.tecnico, v.an ? v.an + " item(ns) Não OK" : "", v.nf ? v.nf + " item(ns) NF" : "", v.obs].filter(Boolean).join(" · ")),
          (v.pend || []).map(x => h("div", { key: x.id, className: "cel-sub" }, (x.resolvida ? "✓ " : "• ") + x.texto + (x.resolvida ? " (resolvida" + (x.resolvidaPor ? " por " + x.resolvidaPor : "") + ")" : "")))),
        h("span", { className: "selo " + (v.status === "feita" ? RES[v.resultado || "executado"][1] : "os-amarelo") }, v.status === "feita" ? RES[v.resultado || "executado"][0] : "Em andamento"))))
      : h("p", { className: "cel-sub" }, "Nenhum apontamento ainda."),
      sub && sub.tipo === "apontar" ? h(ApontarDireto, { planoId: d.planoAtual.id, equipId: e.id, mes: d.planoAtual.mes, sessao, aoFechar: () => { setSub(null); carregar(); } }) : null,
      sub && sub.tipo === "oco" ? h(FormOcorrencia, { clienteId: e.clienteId, clienteNome: d.clienteNome, op: sub.op, sessao, equipId: e.id, aoFechar: () => setSub(null), aoCriar: () => { setSub(null); carregar(); } }) : null,
      sub && sub.tipo === "os" && K.OS ? h(K.OS.DetalheOS, { id: sub.id, op: sub.op, sessao, aoFechar: () => { setSub(null); carregar(); } }) : null);
  }

  /* =================================================================
     v1.16.0 — IMPORTAR EQUIPAMENTOS DE PLANILHA (CSV ou Excel)
     Colunas iguais à planilha de levantamento; a TAG é gerada se vier vazia.
     ================================================================= */
  const COLS_PLAN = [["ambiente", "Ambiente"], ["andar", "Andar"], ["tipo", "TIPO"], ["marca", "Marca"], ["modelo", "Modelo"], ["capacidadeBtu", "Capacidade (BTU/h)"],
    ["tipoCond", "Condensadora"], ["gas", "Fluido"], ["tensao", "Tensão"], ["ocupFixo", "Ocupantes fixos"], ["ocupFlut", "Ocupantes flutuantes"],
    ["area", "Área Climatizada (m²)"], ["cargaTermica", "Carga Térmica (BTU/h)"], ["serie", "Nº de série"], ["tag", "TAG (opcional)"]];
  function colDe(nome) {
    const n = semAcento(nome).replace(/[^a-z0-9]/g, "");
    if (/^tag/.test(n)) return "tag";
    if (/^ambiente|^local|^sala/.test(n)) return "ambiente";
    if (/^andar|^pavimento/.test(n)) return "andar";
    if (/^tipo/.test(n)) return "tipo";
    if (/^marca|^fabricante/.test(n)) return "marca";
    if (/^modelo/.test(n)) return "modelo";
    if (/^capacidade|^btu/.test(n)) return "capacidadeBtu";
    if (/^condensadora/.test(n)) return "tipoCond";
    if (/^fluido|^gas|^refrigerante/.test(n)) return "gas";
    if (/^tensao|^voltagem/.test(n)) return "tensao";
    if (/fixo/.test(n)) return "ocupFixo";
    if (/flutu/.test(n)) return "ocupFlut";
    if (/^area/.test(n)) return "area";
    if (/^carga/.test(n)) return "cargaTermica";
    if (/serie/.test(n)) return "serie";
    return null;
  }
  function lerCsv(txt) {
    const sep = (txt.split(/\r?\n/)[0].match(/;/g) || []).length >= (txt.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
    const rows = []; let row = [], cel = "", q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cel); cel = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; row.push(cel); rows.push(row); row = []; cel = ""; }
      else cel += ch;
    }
    if (cel !== "" || row.length) { row.push(cel); rows.push(row); }
    return rows;
  }
  function carregarSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => ok(window.XLSX); s.onerror = () => falha(new Error("Não foi possível abrir arquivos do Excel agora. Salve a planilha como CSV e tente de novo."));
      document.head.appendChild(s);
    });
  }
  async function lerPlanilha(arq) {
    let rows;
    if (/\.(xlsx|xls|ods)$/i.test(arq.name)) {
      const X = await carregarSheetJS();
      const wb = X.read(await arq.arrayBuffer(), { type: "array" });
      rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
    } else {
      const buf = await arq.arrayBuffer();
      let txt;
      try { txt = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder("windows-1252").decode(buf); }
      rows = lerCsv(txt.replace(/^\uFEFF/, ""));
    }
    /* cabeçalho = primeira linha com "ambiente" ou "tipo" */
    const hi = rows.findIndex(r => r.some(c => colDe(String(c)) === "ambiente") || r.filter(c => colDe(String(c))).length >= 3);
    if (hi < 0) throw new Error("Não achei o cabeçalho. A primeira linha precisa ter as colunas Ambiente, Andar, TIPO, Marca…");
    const mapa = rows[hi].map(c => colDe(String(c)));
    const out = [];
    rows.slice(hi + 1).forEach(r => {
      const o = {}; mapa.forEach((k, i) => { if (k && r[i] != null && String(r[i]).trim() !== "") o[k] = String(r[i]).trim(); });
      if (o.ambiente || o.tipo || o.marca || o.modelo) out.push(o);
    });
    return { linhas: out, colunas: mapa.filter(Boolean) };
  }
  function prefixoDe(nome) {
    const p = String(nome || "").split(/[\s\-–—]+/).filter(x => x.length > 2 && !/^(ltda|me|eireli|s\/?a|de|do|da|dos|das)$/i.test(x));
    if (!p.length) return "";
    if (p.length === 1 || /^[A-Z]{2,5}$/.test(p[0])) return semAcento(p[0]).replace(/[^a-z]/g, "").slice(0, 3).toUpperCase();
    return p.slice(0, 3).map(x => semAcento(x)[0]).join("").toUpperCase();
  }
  function baixarModelo() {
    const csv = "\uFEFF" + COLS_PLAN.map(c => c[1]).join(";") + "\r\nSALA DE ESPERA;Térreo;Hiwall;LG;S4NW36R43FB;32.000;Individual;R410A;220V;4;6;26,79;30.000;;\r\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "modelo_equipamentos.csv"; document.body.appendChild(a); a.click(); a.remove();
  }
  /* v1.21.0: baixa as máquinas atuais do cliente (com a TAG) — corrige no Excel e sobe de volta em "Atualizar" */
  function baixarAtual(itens, clienteNome) {
    const cols = [["tag", "TAG"]].concat(COLS_PLAN.filter(c => c[0] !== "tag"));
    const cel = v => { const t = v == null ? "" : String(v); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const linhas = itens.map(e => cols.map(c => cel(c[0] === "area" && e.area != null ? String(e.area).replace(".", ",") : e[c[0]])).join(";"));
    const csv = "\uFEFF" + cols.map(c => c[1]).join(";") + "\r\n" + linhas.join("\r\n") + "\r\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "maquinas_" + semAcento(clienteNome || "cliente").replace(/[^a-z0-9]+/g, "_").slice(0, 40) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  function ImportarPlanilha({ clienteId, clienteNome, aoFechar, aoImportar, temMaquinas }) {
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState("");
    const [pref, setPref] = useState(prefixoDe(clienteNome));
    const [plano, setPlano] = useState(null);
    const [noPlano, setNoPlano] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [modo, setModo] = useState("atualizar");   /* v1.21.0: padrão seguro — com TAG que já existe atualiza, que não existe cadastra */
    const [desativar, setDesativar] = useState(false);
    const [previa, setPrevia] = useState(null);
    useEffect(() => { setPrevia(null); }, [modo, desativar, dados]);
    useEffect(() => { api("pmoc.cliente.painel", { clienteId, ano: new Date().getFullYear() }).then(r => setPlano(r.plano || null), () => {}); }, [clienteId]);
    async function escolher(ev) {
      const a = ev.target.files && ev.target.files[0]; ev.target.value = "";
      if (!a) return;
      setErro(""); setDados(null);
      try { const r = await lerPlanilha(a); if (!r.linhas.length) throw new Error("A planilha não tem linhas com equipamentos."); setDados(Object.assign({ nome: a.name }, r)); }
      catch (x) { setErro(x.message); }
    }
    const corpo = simular => ({ clienteId, prefixo: pref, planoId: plano && noPlano ? plano.id : null, linhas: dados.linhas, modo, desativarAusentes: modo === "atualizar" && desativar, simular: simular ? 1 : 0 });
    async function importar() {
      setErro(""); setEnviando(true);
      try {
        if (modo === "atualizar" && !previa) {   /* 1º toque: mostra o que vai acontecer; 2º grava */
          setPrevia(await api("pmoc.equip.importar", corpo(true))); setEnviando(false); return;
        }
        const r = await api("pmoc.equip.importar", corpo(false));
        K.avisar(modo === "atualizar" ? r.atualizados + " atualizada(s), " + r.criados + " nova(s)" + (r.desativados ? ", " + r.desativados + " desativada(s)" : "") + "."
          : r.criados + " equipamento(s) cadastrado(s).");
        aoImportar(r);
      } catch (x) { setErro(x.message); setEnviando(false); }
    }
    const cols = COLS_PLAN.filter(c => dados && dados.colunas.indexOf(c[0]) >= 0);
    return h(Painel, { titulo: "Importar equipamentos da planilha", sub: clienteNome, largo: true, aoFechar,
      rodape: [h("button", { key: "m", className: "bt bt-leve", style: { marginRight: "auto" }, onClick: baixarModelo }, "Baixar planilha modelo"),
        h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
        h("button", { key: "i", className: "bt bt-marca", disabled: !dados || enviando, onClick: importar },
          enviando ? "Aguarde…" : !dados ? "Cadastrar" : modo === "atualizar" ? (previa ? "Confirmar e gravar" : "Conferir mudanças") : "Cadastrar " + dados.linhas.length + " equipamento(s)")] },
      erro ? h("div", { className: "aviso aviso-erro", style: { whiteSpace: "pre-line" } }, erro) : null,
      h("p", { className: "cel-sub", style: { marginTop: 0 } }, "Use a planilha de levantamento (CSV ou Excel) com as colunas: " + COLS_PLAN.map(c => c[1]).join(", ") + ". Linhas vazias são ignoradas. Nada é gravado se alguma linha tiver erro."),
      h("label", { className: "bt bt-marca", style: { display: "inline-flex", marginBottom: 12 } }, dados ? "Trocar arquivo" : "Escolher planilha",
        h("input", { type: "file", accept: ".csv,.xlsx,.xls,.ods,text/csv", onChange: escolher, style: { display: "none" } })),
      dados ? h(React.Fragment, null,
        h("div", { className: "pm-modo" },
          h("label", { className: "pm-modo-op" + (modo === "atualizar" ? " ativo" : "") },
            h("input", { type: "radio", name: "pm-modo", checked: modo === "atualizar", onChange: () => setModo("atualizar") }),
            h("span", null, h("b", null, "Atualizar as que já existem"), h("small", null, "Acha cada máquina pela TAG e atualiza o cadastro. Visitas do PMOC, OS e histórico continuam ligados a ela. TAG nova vira máquina nova."))),
          h("label", { className: "pm-modo-op" + (modo === "novos" ? " ativo" : "") },
            h("input", { type: "radio", name: "pm-modo", checked: modo === "novos", onChange: () => setModo("novos") }),
            h("span", null, h("b", null, "Só cadastrar máquinas novas"), h("small", null, "Para um cliente sem máquinas ou para acrescentar. TAG que já existe dá erro.")))),
        modo === "atualizar" ? h("label", { className: "check" }, h("input", { type: "checkbox", checked: desativar, onChange: e => setDesativar(e.target.checked) }),
          "Desativar as máquinas que não estão na planilha (o histórico fica guardado)") : null,
        previa ? h("div", { className: "pm-previa" },
          h("b", null, "Conferência: "), previa.atualizar + " atualizada(s) · " + previa.criar + " nova(s)" + (previa.restaurar ? " · " + previa.restaurar + " volta(m) do excluído" : "") + " · " + previa.desativar + " desativada(s).",
          previa.tagsDesativar.length ? h("div", { className: "cel-sub" }, "Saem: " + previa.tagsDesativar.join(", ")) : null,
          h("div", { className: "cel-sub" }, "Confira e toque em Confirmar e gravar.")) : null,
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Prefixo da TAG", dica: "TAG gerada quando a coluna TAG estiver vazia: " + (pref ? pref + "-" : "") + "HW-001, " + (pref ? pref + "-" : "") + "CT-001…" },
            h("input", { className: "entrada-texto", value: pref, onChange: e => setPref(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)) })),
          plano ? h("label", { className: "check", style: { alignSelf: "center" } }, h("input", { type: "checkbox", checked: noPlano, onChange: e => setNoPlano(e.target.checked) }), "Incluir no plano PMOC " + new Date().getFullYear()) : null),
        h("div", { className: "cel-sub", style: { margin: "4px 0 8px" } }, dados.nome + " · " + dados.linhas.length + " equipamento(s)" + (dados.linhas.length > 60 ? " · mostrando os 60 primeiros" : "")),
        h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "#"), cols.map(c => h("th", { key: c[0] }, c[1])))),
          h("tbody", null, dados.linhas.slice(0, 60).map((l, i) => h("tr", { key: i }, h("td", null, i + 1), cols.map(c => h("td", { key: c[0] }, l[c[0]] || "—"))))))))
      : null);
  }

  /* lista de máquinas do cliente: busca, histórico, edição, QR individual e em lote */
  function ListaMaquinas({ clienteId, clienteNome, sessao, aoFechar }) {
    const esc = escritorio(sessao);
    const [itens, setItens] = useState(null);
    const [busca, setBusca] = useState("");
    const [hist, setHist] = useState(null);
    const [form, setForm] = useState(null);
    const [importar, setImportar] = useState(false);   /* v1.16.0 */
    const [excl, setExcl] = useState(null);             /* v1.21.0: última exclusão (para desfazer) */
    function carregar() {
      api("pmoc.equip.listar", { clienteId }).then(d => setItens(d.itens), e => K.avisar(e.message, true));
      if (esc) api("pmoc.equip.excluidas", { clienteId }).then(setExcl, () => setExcl(null));
    }
    useEffect(carregar, [clienteId]); // eslint-disable-line
    async function excluirTodas() {
      if (!(await K.confirmar({ titulo: "Excluir TODAS as " + itens.length + " máquinas de " + clienteNome + "?",
        texto: "Elas saem da lista e do PMOC. As visitas, OS e o histórico ficam guardados, e dá para desfazer logo em seguida. Se a ideia é só corrigir o cadastro, prefira Importar planilha › Atualizar, que mantém tudo ligado.",
        botao: "Excluir todas", perigo: true }))) return;
      try { const r = await api("pmoc.equip.excluir_todas", { clienteId, confirmar: "EXCLUIR" }); K.avisar(r.excluidos + " máquina(s) excluída(s). Dá para desfazer."); carregar(); }
      catch (x) { K.avisar(x.message, true); }
    }
    async function desfazer() {
      try { const r = await api("pmoc.equip.restaurar_ultimas", { clienteId }); K.avisar(r.restaurados + " máquina(s) de volta." + (r.pulados.length ? " Já existiam: " + r.pulados.join(", ") : "")); carregar(); }
      catch (x) { K.avisar(x.message, true); }
    }
    const vis = (itens || []).filter(e => casa(e, busca));
    return h(Painel, { titulo: "Máquinas" + (itens ? " (" + itens.length + ")" : ""), sub: clienteNome, largo: true, aoFechar,
      rodape: [h("button", { key: "q", className: "bt", disabled: !vis.length, onClick: () => imprimirEtiquetas(vis, sessao, clienteNome) }, "Imprimir etiquetas" + (vis.length ? " (" + vis.length + ")" : "")),
               esc ? h("button", { key: "i", className: "bt", onClick: () => setImportar(true) }, itens && itens.length ? "Importar / atualizar planilha" : "Importar planilha") : null,
               esc && itens && itens.length ? h("button", { key: "b", className: "bt", onClick: () => baixarAtual(itens, clienteNome), title: "Planilha com as máquinas de hoje e a TAG de cada uma: corrija e suba em Atualizar" }, "Baixar planilha atual") : null,
               esc && itens && itens.length ? h("button", { key: "x", className: "bt bt-leve bt-perigo", onClick: excluirTodas }, "Excluir todas") : null,
               esc && excl && excl.qtd ? h("button", { key: "d", className: "bt bt-leve", onClick: desfazer, title: "Traz de volta as máquinas da última exclusão" }, "Desfazer exclusão (" + excl.qtd + ")") : null,
               h("div", { key: "e", style: { flex: 1 } }), h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      h("input", { className: "entrada-texto", placeholder: "Buscar por TAG, andar, local, marca, série…", value: busca, onChange: e => setBusca(e.target.value), style: { marginBottom: 10 } }),
      !itens ? h("div", { className: "vazio" }, "Carregando…")
      : !vis.length ? h("div", { className: "vazio" }, itens.length ? "Nada encontrado na busca." : "Este cliente ainda não tem equipamentos.")
      : h("div", { className: "pm-lista" }, vis.map(e => h("div", { key: e.id, className: "pm-eq" },
          h("button", { type: "button", className: "pm-eq-l", onClick: () => setHist(e.id) },
            h("b", null, e.tag), localEq(e) ? h("span", null, " · " + localEq(e)) : null, h("div", { className: "cel-sub" }, descEquip(e) || "—", e.status && e.status !== "Operante" ? " · " + e.status : "")),
          h("div", { className: "pm-eq-d" },
            h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => imprimirEtiquetas([e], sessao, clienteNome) }, "QR"),
            esc ? h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => setForm(e) }, "Editar") : null,
            h("button", { type: "button", className: "bt bt-p", onClick: () => setHist(e.id) }, "Histórico"))))),
      hist ? h(HistoricoEquip, { id: hist, sessao, aoFechar: () => { setHist(null); carregar(); } }) : null,
      form ? h(FormEquip, { inicial: form, clienteId, aoFechar: () => setForm(null), aoSalvar: () => { setForm(null); carregar(); }, aoExcluir: () => { setForm(null); carregar(); } }) : null,
      importar ? h(ImportarPlanilha, { clienteId, clienteNome, temMaquinas: !!(itens && itens.length), aoFechar: () => setImportar(false), aoImportar: () => { setImportar(false); carregar(); } }) : null);
  }

  /* tela do cliente no PMOC: os quatro atalhos, pendências abertas e ocorrências */
  function ClientePmoc({ clienteId, ano, op, sessao, aoFechar }) {
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [sub, setSub] = useState(null);
    function carregar() { api("pmoc.cliente.painel", { clienteId, ano }).then(r => { setD(r); setErro(""); }, e => setErro(e.message)); }
    useEffect(carregar, [clienteId, ano]); // eslint-disable-line
    useEffect(() => K.offline ? K.offline.aoSincronizar(carregar) : undefined, [clienteId, ano]); // eslint-disable-line
    if (erro && !d) return h(Painel, { titulo: "PMOC", aoFechar }, h(Aviso, null, erro));
    if (!d) return h(Painel, { titulo: "PMOC", aoFechar, largo: true }, h("div", { className: "vazio" }, "Carregando…"));
    const pl = d.plano;
    const fechar = () => { setSub(null); carregar(); };
    const abrirOS = id => api("os.opcoes").then(o => setSub({ tipo: "os", id, op: o }), x => K.avisar(x.message, true));
    const acao = (t, s, fn, off, cls) => h("button", { type: "button", className: "pm-acao" + (cls ? " " + cls : ""), disabled: !!off, onClick: fn }, h("b", null, t), h("span", null, s));
    return h(Painel, { titulo: d.cliente.nome, largo: true, aoFechar,
      sub: (pl ? "PMOC " + d.ano + (pl.tipo === "volante" ? " · equipe volante" : pl.tipo === "residente" ? " · residente" : "") + " · " : "Sem plano PMOC em " + d.ano + " · ") + d.equipamentos + " máquina(s)" + (d.pendencias.length ? " · " + d.pendencias.length + " pendência(s) aberta(s)" : ""),
      rodape: [h("div", { key: "e", style: { flex: 1 } }), h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      h("div", { className: "pm-acoes" },
        acao("Plano do ano", pl ? (pl.frequencia && pl.frequencia !== "M" ? "Visitas " + FREQ_TXT[pl.frequencia].toLowerCase() + "s (" + mesesDe(pl).map(x => MES3[x - 1]).join(", ") + ")" : "12 meses") + ", técnicos, datas, normas e documentos." : "Este cliente não tem plano em " + d.ano + ".", () => setSub({ tipo: "plano", vista: "ano" }), !pl, "pm-acao-1"),
        acao("Apontar PMOC do mês", pl ? MESES[d.mes - 1] + " · " + pl.feitasMes + " de " + pl.equipamentos + " apontado(s)" : "Sem plano em " + d.ano + ".", () => setSub({ tipo: "plano", vista: "mes" }), !pl),
        acao("Registrar ocorrência", "Chamado no local: motivo, o que foi feito e pronto.", () => setSub({ tipo: "oco" })),
        acao("Criar equipamento", "Máquina instalada depois da implantação do PMOC.", () => setSub({ tipo: "inst" })),
        acao("Máquinas (" + d.equipamentos + ")", "Lista, histórico, edição e etiquetas QR.", () => setSub({ tipo: "maqs" }))),
      h("div", { className: "secao-titulo" }, "Pendências abertas da preventiva (" + d.pendencias.length + ")"),
      d.pendencias.length ? h("div", { className: "pm-lista" }, d.pendencias.map(pd => h("div", { key: pd.visitaId + pd.id, className: "pm-pend pm-pend-al" },
        h("div", null, h("b", null, (pd.tag ? pd.tag + " — " : "") + pd.texto),
          h("div", { className: "cel-sub" }, [MESES[pd.mes - 1] + " de " + pd.ano, pd.prioridade, pd.material ? "material: " + pd.material : "", pd.por].filter(Boolean).join(" · "))),
        h("div", { className: "pm-eq-d" },
          pd.osId ? h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => abrirOS(pd.osId) }, "OS " + pd.osNumero)
            : h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => setSub({ tipo: "oco", pend: pd }) }, "Abrir OS"),
          h("button", { type: "button", className: "bt bt-p", onClick: () => setSub({ tipo: "resolver", pd }) }, "Resolver")))))
      : h("p", { className: "cel-sub" }, "Nenhuma pendência aberta."),
      h("div", { className: "secao-titulo" }, "Ocorrências (" + d.ocorrencias.length + ")"),
      d.ocorrencias.length ? h("div", { className: "pm-lista" }, d.ocorrencias.map(o => h("button", { key: o.id, type: "button", className: "pm-eq", onClick: () => abrirOS(o.id) },
        h("div", null, h("b", null, "OS " + o.numero), (o.tag ? " · " + o.tag : "") + " · " + dataBR(o.criadoEm), h("div", { className: "cel-sub" }, o.descricao || o.tipoServico || "—")),
        h("span", { className: "selo " + SELO_OS(o.status) }, o.status))))
      : h("p", { className: "cel-sub" }, "Nenhuma ocorrência registrada neste cliente."),

      sub && sub.tipo === "plano" ? h(DetalhePlano, { id: pl.id, mesInicial: d.mes, vistaInicial: sub.vista, op, sessao, aoFechar: fechar }) : null,
      sub && sub.tipo === "oco" ? h(FormOcorrencia, { clienteId, clienteNome: d.cliente.nome, op, sessao, pend: sub.pend, aoFechar: () => setSub(null), aoCriar: fechar }) : null,
      sub && sub.tipo === "inst" ? h(FormEquip, { inicial: {}, clienteId, instalar: { modelos: op.modelos, temPlano: !!pl }, aoFechar: () => setSub(null), aoSalvar: fechar }) : null,
      sub && sub.tipo === "maqs" ? h(ListaMaquinas, { clienteId, clienteNome: d.cliente.nome, sessao, aoFechar: fechar }) : null,
      sub && sub.tipo === "resolver" ? h(ResolverPend, { pd: sub.pd, aoFechar: () => setSub(null), aoResolvido: fechar }) : null,
      sub && sub.tipo === "os" && K.OS ? h(K.OS.DetalheOS, { id: sub.id, op: sub.op, sessao, aoFechar: fechar }) : null);
  }

  /* QR lido (código da etiqueta) ou equipamento escolhido: técnico cai no apontamento; senão, histórico */
  function QrAbrir({ token, id, sessao, aoFechar }) {
    const [r, setR] = useState(null);
    const [erro, setErro] = useState("");
    const [verHist, setVerHist] = useState(false);
    useEffect(() => { api("pmoc.equip.qr", token ? { token } : { id }).then(setR, e => setErro(e.message)); }, [token, id]);
    if (erro) return h(Painel, { titulo: "Etiqueta QR", aoFechar,
      rodape: token ? [h("a", { key: "p", className: "bt", href: "q/?t=" + token + "&publico=1" }, "Ver ficha pública")] : null }, h(Aviso, null, erro));
    if (!r) return h(Painel, { titulo: "Etiqueta QR", aoFechar }, h("div", { className: "vazio" }, "Abrindo o equipamento…"));
    const staff = sessao.usuario.perfil !== "cliente";
    if (staff && r.planoId && !verHist) return h(ApontarDireto, { planoId: r.planoId, equipId: r.equipamento.id, mes: r.mes, sessao, aoFechar, aoHistorico: () => setVerHist(true) });
    return h(HistoricoEquip, { id: r.equipamento.id, sessao, aoFechar });
  }

  /* leitor de QR dentro do app (câmera). Aceita a etiqueta nova (link) e a antiga (só a TAG). */
  function LeitorQR({ aoLer, aoFechar }) {
    const video = React.useRef(null);
    const [msg, setMsg] = useState("");
    const [tag, setTag] = useState("");
    const [res, setRes] = useState(null);
    const suporta = "BarcodeDetector" in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    function interpretar(txt) {
      const m = String(txt).match(/[?&]t=([a-f0-9]{24})/i);
      if (m) return aoLer({ token: m[1].toLowerCase() });
      buscar(String(txt).trim());
    }
    function buscar(t) {
      setTag(t); if (t.length < 2) return;
      api("pmoc.equip.buscar", { texto: t }).then(d => { setRes(d.itens); if (d.itens.length === 1 && d.itens[0].tag.toLowerCase() === t.toLowerCase()) aoLer({ id: d.itens[0].id }); }, e => setMsg(e.message));
    }
    useEffect(() => {
      if (!suporta) { setMsg("Este aparelho não lê QR dentro do app. Use a câmera do celular (ela abre o link da etiqueta) ou digite a TAG abaixo."); return undefined; }
      let fluxo = null, parar = false, det = null;
      try { det = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { setMsg("Leitor de QR indisponível. Digite a TAG abaixo."); return undefined; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(s => {
        fluxo = s; if (parar) { s.getTracks().forEach(t => t.stop()); return; }
        const v = video.current; v.srcObject = s; v.play().catch(() => {});
        const ciclo = () => {
          if (parar) return;
          det.detect(v).then(c => { if (c && c.length) { parar = true; interpretar(c[0].rawValue); } else setTimeout(ciclo, 250); }, () => setTimeout(ciclo, 400));
        };
        setTimeout(ciclo, 400);
      }, () => setMsg("Sem acesso à câmera. Libere a câmera para este site ou digite a TAG abaixo."));
      return () => { parar = true; if (fluxo) fluxo.getTracks().forEach(t => t.stop()); };
    }, []); // eslint-disable-line
    return h(Painel, { titulo: "Ler etiqueta QR", sub: "Aponte para a etiqueta do equipamento", aoFechar },
      suporta ? h("div", { className: "pm-leitor" }, h("video", { ref: video, playsInline: true, muted: true }), h("i", null)) : null,
      msg ? h(Aviso, { tipo: "ok" }, msg) : null,
      h(Campo, { rotulo: "Ou digite a TAG", dica: "Etiquetas antigas têm só a TAG escrita, sem link." },
        h("input", { className: "entrada-texto", value: tag, onChange: e => buscar(e.target.value), placeholder: "Ex.: HII-HW-153" })),
      res ? (res.length ? h("div", { className: "pm-lista" }, res.map(e => h("button", { key: e.id, type: "button", className: "pm-eq", onClick: () => aoLer({ id: e.id }) },
        h("div", null, h("b", null, e.tag), localEq(e) ? " · " + localEq(e) : "", h("div", { className: "cel-sub" }, e.clienteNome))))) : h("p", { className: "cel-sub" }, "Nenhum equipamento com essa TAG.")) : null);
  }

  /* =================================================================
     ÁREA DO CLIENTE (v1.16.0 — painel completo como o portal antigo)
     perfil cliente; várias unidades = cliente regional
     ================================================================= */
  /* v1.28.0: escritorio = tela "Visão do cliente" (mesmo painel, cliente escolhido pela equipe) */
  function Portal({ sessao, clienteFixo, escritorio }) {
    const hoje = new Date();
    const [uni, setUni] = useState(0);
    const [ano, setAno] = useState(hoje.getFullYear());
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [hist, setHist] = useState(null);
    const [qr, setQr] = useState(null);
    const [docPl, setDocPl] = useState(0);
    const [mesTec, setMesTec] = useState(0);
    const [mesRel, setMesRel] = useState(0);
    const [sol, setSol] = useState({ assunto: "", detalhes: "", clienteId: 0 });
    const [enviando, setEnviando] = useState(false);
    const [solAberta, setSolAberta] = useState(null);   /* v1.28.1 */
    function carregar() { api("pmoc.portal.resumo", { clienteId: clienteFixo || uni }).then(r => { setD(r); setErro(""); }, e => setErro(e.message)); }
    useEffect(carregar, [uni]); // eslint-disable-line
    useEffect(() => {
      if (escritorio) return;
      const t = new URLSearchParams(location.search).get("qr");
      if (t) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} setQr({ token: t.toLowerCase() }); }
    }, []);
    if (erro && !d) return h("div", { className: "bloco vazio" }, h(Aviso, null, erro), h("button", { className: "bt", onClick: carregar }, "Tentar de novo"));
    if (!d) return h("div", { className: "bloco vazio" }, "Carregando…");

    const varias = d.unidades.length > 1;
    const nomeSel = uni ? (d.unidades.find(u => u.id === uni) || {}).nome : varias ? "Todas as unidades" : (d.unidades[0] || {}).nome;
    const anos = Array.from(new Set(d.planos.map(p => p.ano).concat([hoje.getFullYear()]))).sort((a, b) => b - a);
    const planos = d.planos.filter(p => p.ano === ano);
    const pl = planos.find(p => p.id === docPl) || planos[0] || null;
    const mesLim = ano < hoje.getFullYear() ? 12 : ano > hoje.getFullYear() ? 0 : hoje.getMonth() + 1;
    /* cobertura: equipamento × mês feitos / previstos até agora; mês concluído = todos os equipamentos do plano feitos */
    let prev = 0, feitas = 0, mesesOk = 0, mesesDec = 0;
    const porMes = {};
    planos.forEach(p => {
      for (let m = p.mesInicio; m <= mesLim; m++) {
        if (mesesDe(p).indexOf(m) < 0) continue;   /* v1.38.0: só meses de serviço */
        mesesDec++;
        let ok = 0;
        p.equipIds.forEach(id => { prev++; const s = (p.mapa[id] || {})[m]; if (s === "feita") { feitas++; ok++; } });
        if (p.equipIds.length && ok === p.equipIds.length) mesesOk++;
      }
      for (let m = p.mesInicio; m <= 12; m++) {
        if (mesesDe(p).indexOf(m) < 0) continue;
        const x = porMes[m] || (porMes[m] = { feitas: 0, alguma: 0, total: 0, pen: 0, par: 0 });
        p.equipIds.forEach(id => { x.total++; const s = (p.mapa[id] || {})[m];
          if (s === "feita") { x.feitas++; const r = resDe(p, id, m); if (r === "pendencia") x.pen++; else if (r === "parcial") x.par++; } if (s) x.alguma++; });
      }
    });
    const cobertura = prev ? Math.round(feitas / prev * 100) : 0;
    const mesIni = planos.length ? Math.min.apply(null, planos.map(p => p.mesInicio)) : 1;
    const mesPadrao0 = Math.max(mesIni, Math.min(12, mesLim || 12));
    /* v1.38.0: plano trimestral/semestral/anual — o mês sugerido é o último mês de serviço até hoje */
    const mServPl = planos.length ? Array.from(new Set([].concat.apply([], planos.map(mesesDe)))).sort((x, y) => x - y) : [];
    const mesPadrao = mServPl.length ? (mServPl.filter(x => x <= mesPadrao0).pop() || mServPl[0]) : mesPadrao0;
    const mTec = mesTec || mesPadrao, mRel = mesRel || mesPadrao;
    const abrir = (tipo, planoId, mes) => {
      const w = abrirJanela(tipo === "livro" ? "o livro do PMOC" : "o documento"); if (!w) return;
      api("pmoc.obter", { id: planoId, mes, anoTodo: tipo === "livro" ? 1 : 0 }).then(p => tipo === "livro" ? documentoPmoc(p, sessao, w) : tipo === "rel" ? relatorioAcompanhamento(p, sessao, w) : relatorioMes(p, sessao, w),
        e => { w.close(); K.avisar(e.message, true); });
    };
    const pdfOS = id => K.OS && K.OS.relatorioDaOS ? K.OS.relatorioDaOS(id, sessao) : null;
    async function solicitar() {
      if (!sol.assunto.trim()) return K.avisar("Escreva o assunto da solicitação.", true);
      const cli = uni || sol.clienteId || (varias ? 0 : d.unidades[0].id);
      if (!cli) return K.avisar("Escolha a unidade da solicitação.", true);
      setEnviando(true);
      try { await api("pmoc.portal.solicitar", { clienteId: cli, assunto: sol.assunto, detalhes: sol.detalhes }); K.avisar("Solicitação enviada para a equipe."); setSol({ assunto: "", detalhes: "", clienteId: 0 }); carregar(); }
      catch (x) { K.avisar(x.message, true); }
      setEnviando(false);
    }
    const ST_SOL = { aberta: ["Recebida", "pt-s-az"], andamento: ["Em atendimento", "pt-s-am"], aguardando: ["Aguardando", "pt-s-am"], feita: ["Concluída", "pt-s-vd"], cancelada: ["Cancelada", "pt-s-cz"] };
    const mesesLista = []; for (let m = mesIni; m <= 12; m++) if (!planos.length || planos.some(p => mesesDe(p).indexOf(m) >= 0)) mesesLista.push(m);   /* v1.38.0 */
    const equipPlano = {}; planos.forEach(p => p.equipIds.forEach(id => { equipPlano[id] = p; }));
    /* v1.28.0: o mapa mostra todas as máquinas — preventivas do plano e as OS (corretivas/serviços) ligadas a cada uma */
    const osPorEq = {};
    d.os.forEach(o => {
      if (!o.equipamentoId || !o.quando) return;
      const a = +String(o.quando).slice(0, 4), m = +String(o.quando).slice(5, 7);
      if (a !== ano || !m) return;
      const x = osPorEq[o.equipamentoId] || (osPorEq[o.equipamentoId] = { total: 0, mes: {} });
      x.total++; (x.mes[m] = x.mes[m] || []).push(o);
    });
    const eqMapa = d.equipamentos;   /* todas as máquinas, mesmo fora do plano (antes ficavam só nos cartões do parque) */
    const atend = d.os.filter(o => o.osTipo !== "contrato" || o.tipoServico).slice(0, 8);
    const ondeOS = o => o.equipTag ? o.equipTag + (o.equipLocal ? " · " + o.equipLocal : "") : (o.locais || []).join(" · ");
    const card = (t, v, pe, cls) => h("div", { className: "pt-kpi " + (cls || "") }, h("small", null, t), h("b", null, v), pe ? h("span", null, pe) : null);
    const selMes = (val, set) => h("select", { className: "entrada-texto", value: val, onChange: e => set(+e.target.value) }, mesesLista.map(m => h("option", { key: m, value: m }, MESES[m - 1] + "/" + ano)));

    return h("div", { className: "pt" },
      h("div", { className: "pt-topo" },
        h("div", null, h("small", null, "PORTAL DO CLIENTE"),
          varias ? h("select", { className: "pt-uni", value: uni, onChange: e => { setUni(+e.target.value); setDocPl(0); }, "aria-label": "Unidade" },
            h("option", { value: 0 }, "Todas as unidades (" + d.unidades.length + ")"), d.unidades.map(u => h("option", { key: u.id, value: u.id }, u.nome)))
            : h("h1", null, nomeSel)),
        h("select", { className: "pt-ano", value: ano, onChange: e => { setAno(+e.target.value); setDocPl(0); setMesTec(0); setMesRel(0); }, "aria-label": "Ano" }, anos.map(a => h("option", { key: a, value: a }, a)))),
      h("div", { className: "pt-kpis" },
        card("Meu parque", d.equipamentos.length + " equip.", varias && !uni ? d.unidades.length + " unidades" : null),
        card("PMOC " + ano, mesesOk + "/" + mesesDec, "visitas concluídas", "pt-verde"),
        card("Cobertura", cobertura + "%", "do período decorrido", "pt-az2"),
        card("Pendências abertas", String(d.pendencias.length), null, d.pendencias.length ? "pt-rosa" : "")),

      h("div", { className: "pt-bloco" },
        h("div", { className: "pt-cab" }, h("b", null, "Documentos"), h("span", null, "abrem para impressão ou PDF")),
        !pl ? h("p", { className: "cel-sub" }, "Ainda não há plano PMOC em " + ano + (varias && !uni ? " para estas unidades." : "."))
        : h(React.Fragment, null,
          planos.length > 1 ? h("select", { className: "entrada-texto", style: { marginBottom: 10, width: "auto", maxWidth: "100%" }, value: pl.id, onChange: e => setDocPl(+e.target.value), "aria-label": "Unidade dos documentos" },
            planos.map(p => h("option", { key: p.id, value: p.id }, p.clienteNome))) : null,
          h("div", { className: "pt-docs" },
            h("div", { className: "pt-doc" }, h("b", null, "📕 Livro do PMOC " + ano), h("p", null, "Documento completo do plano, com a ficha de cada equipamento, no formato exigido pela fiscalização sanitária."),
              h("button", { type: "button", className: "bt bt-marca", onClick: () => abrir("livro", pl.id, mTec) }, "Abrir livro")),
            h("div", { className: "pt-doc" }, h("b", null, "📊 Relatório anual " + ano), h("p", null, "Consolidado dos 12 meses: cobertura, mapa por máquina, pendências e atendimentos."),
              h("button", { type: "button", className: "bt bt-verde", onClick: () => abrir("rel", pl.id, mRel) }, "Abrir relatório")),
            h("div", { className: "pt-doc" }, h("b", null, "📄 Documento técnico"), h("p", null, "Relatório da manutenção de um mês, com o apontamento de cada equipamento."),
              h("div", { className: "pt-doc-l" }, selMes(mTec, setMesTec), h("button", { type: "button", className: "bt bt-marca", onClick: () => abrir("tec", pl.id, mTec) }, "Abrir")))))),

      h("div", { className: "pt-bloco" },
        h("div", { className: "pt-cab" }, h("b", null, "Solicitações"), h("span", null, escritorio ? "abertas pelo cliente na área dele" : "vão direto para a equipe")),
        escritorio ? null : h("div", { className: "pt-sol" },
          h("b", null, "Precisa de alguma coisa?"), h("p", { className: "cel-sub" }, "Descreva o que você precisa e a equipe recebe na hora, no topo da lista de tarefas."),
          varias && !uni ? h(Campo, { rotulo: "Unidade" }, h("select", { className: "entrada-texto", value: sol.clienteId, onChange: e => setSol(x => Object.assign({}, x, { clienteId: +e.target.value })) },
            h("option", { value: 0 }, "Escolha…"), d.unidades.map(u => h("option", { key: u.id, value: u.id }, u.nome)))) : null,
          h(Campo, { rotulo: "Assunto" }, h("input", { className: "entrada-texto", value: sol.assunto, maxLength: 150, placeholder: "ex.: ar da recepção pingando água", onChange: e => setSol(x => Object.assign({}, x, { assunto: e.target.value })) })),
          h(Campo, { rotulo: "Detalhes (opcional)" }, h("textarea", { rows: 3, value: sol.detalhes, placeholder: "Andar, sala, desde quando acontece, horário em que podemos ir…", onChange: e => setSol(x => Object.assign({}, x, { detalhes: e.target.value })) })),
          h("div", { style: { textAlign: "right" } }, h("button", { type: "button", className: "bt bt-marca", disabled: enviando, onClick: solicitar }, enviando ? "Enviando…" : "Enviar solicitação"))),
        d.solicitacoes.length ? h("div", { className: "pt-lista" }, d.solicitacoes.map(s => h("button", { key: s.id, type: "button", className: "pt-item pt-item-bt", onClick: () => setSolAberta(s.id), title: "Ver o que foi feito" },
          h("div", null, h("b", null, s.titulo), h("div", { className: "cel-sub" }, [dataHoraBR(s.criadoEm), s.por, varias && !uni ? s.clienteNome : "", s.mensagens ? "💬 " + s.mensagens + " mensagem(ns)" : ""].filter(Boolean).join(" · "))),
          h("span", { className: "pt-s " + (ST_SOL[s.status] || ST_SOL.aberta)[1] }, (ST_SOL[s.status] || ST_SOL.aberta)[0]))))
          : h("p", { className: "cel-sub" }, escritorio ? "O cliente ainda não abriu nenhuma solicitação." : "Você ainda não abriu nenhuma solicitação.")),

      h("div", { className: "pt-bloco" },
        h("div", { className: "pt-cab" }, h("b", null, "Pendências em aberto"), h("span", { className: d.pendencias.length ? "pt-alerta" : "" }, d.pendencias.length + " item(ns)")),
        h("p", { className: "cel-sub" }, "Itens identificados nas manutenções que dependem de correção, peça ou aprovação."),
        d.pendencias.length ? d.pendencias.map(pd => {
          const meses = (hoje.getFullYear() - pd.ano) * 12 + hoje.getMonth() + 1 - pd.mes;
          return h("div", { key: pd.visitaId + "-" + pd.id, className: "pt-pend" },
            h("div", { className: "pt-pend-t" }, h("span", { className: "pt-tag" }, pd.prioridade || "Normal"), h("span", null, "PMOC " + MES3[pd.mes - 1] + "/" + pd.ano + (meses > 0 ? " · há " + meses + " mês(es)" : "")),
              pd.tag ? h("button", { type: "button", className: "pt-tag pt-tag-az", onClick: () => setHist(pd.equipamentoId) }, pd.tag + (pd.ambiente ? " · " + pd.ambiente : "")) : null,
              varias && !uni ? h("span", null, pd.clienteNome) : null),
            h("b", null, pd.texto), pd.material ? h("div", { className: "cel-sub" }, "Material/peça: " + pd.material) : null,
            pd.osNumero ? h("div", { className: "cel-sub" }, "Em atendimento na OS " + pd.osNumero) : null);
        }) : h("p", null, h("b", null, "Nenhuma pendência aberta. "), "Tudo em dia.")),

      h("div", { className: "pt-duas" },
        h("div", { className: "pt-bloco" },
          h("div", { className: "pt-cab" }, h("b", null, "Manutenções de " + ano), pl ? h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => abrir("rel", pl.id, mRel) }, "📊 Relatório anual") : null),
          planos.length ? h("div", { className: "pt-meses" }, mesesLista.map(m => {
            const x = porMes[m] || { feitas: 0, alguma: 0, total: 0 };
            const st = m > mesLim ? ["A realizar", "pt-m-cz"] : x.total && x.feitas === x.total ? (x.pen ? ["Pendência", "pt-m-pe"] : x.par ? ["Executado parcialmente", "pt-m-am"] : ["Executado", "pt-m-vd"]) : x.alguma ? ["Em andamento", "pt-m-am"] : ["Não iniciada", "pt-m-cz"];
            return h("div", { key: m, className: "pt-mes " + st[1] }, h("b", null, MES3[m - 1]), h("i"), h("span", null, st[0]),
              x.alguma && pl ? h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => abrir("tec", pl.id, m) }, "Relatório") : null);
          })) : h("p", { className: "cel-sub" }, "Sem plano PMOC neste ano.")),
        h("div", { className: "pt-bloco" },
          h("div", { className: "pt-cab" }, h("b", null, "Últimos atendimentos")),
          atend.length ? atend.map(o => h("div", { key: o.id, className: "pt-item" },
            h("div", null, h("b", null, "OS " + o.numero + (o.tipoServico ? " · " + o.tipoServico : "")),
              /* v1.28.0: de qual equipamento / local é a OS */
              ondeOS(o) ? (o.equipamentoId
                ? h("button", { type: "button", className: "pt-tag pt-tag-az pt-os-eq", title: "Ver o histórico desta máquina", onClick: () => setHist(o.equipamentoId) }, "❄ " + ondeOS(o))
                : h("div", { className: "pt-os-loc" }, "📍 " + ondeOS(o))) : null,
              h("div", { className: "cel-sub" }, [o.quando ? dataBR(o.quando) : "", varias && !uni ? o.clienteNome : "", o.descricao].filter(Boolean).join(" · "))),
            h("div", { style: { display: "flex", gap: 6, alignItems: "center" } }, h("span", { className: "selo " + SELO_OS(o.status) }, o.status), h("button", { type: "button", className: "bt bt-p", onClick: () => pdfOS(o.id) }, "PDF"))))
          : h("p", { className: "cel-sub" }, "Nenhum atendimento registrado."))),

      /* v1.28.0: visão anual com todas as máquinas — clicar na máquina abre o histórico dela (os cartões do parque saíram daqui) */
      h("div", { className: "pt-bloco" },
        h("div", { className: "pt-cab" }, h("b", null, "Visão anual " + ano + " · " + d.equipamentos.length + " máquina(s)"),
          h("span", { className: "pt-mapa-leg" }, h("i", { className: "v" }, "✓"), " executado · ", h("i", { className: "p" }, "½"), " parcial · ", h("i", { className: "n" }, "!"), " pendência · ", h("i", { className: "p" }, "•"), " em andamento · ", h("i", { className: "o" }, "●"), " OS / corretiva")),
        !eqMapa.length ? h("p", { className: "cel-sub" }, "Nenhuma máquina cadastrada.")
        : h(React.Fragment, null,
          h("p", { className: "cel-sub", style: { margin: "-4px 0 8px" } }, "Toque na máquina para ver tudo o que foi feito nela: preventivas, corretivas e serviços."),
          h("div", { className: "tabela-caixa" }, h("table", { className: "pt-mapa" },
            h("thead", null, h("tr", null, h("th", { className: "e" }, "Equipamento"), MES3.map((m, i) => h("th", { key: m, className: i + 1 === mesLim ? "atual" : "" }, m)), h("th", { title: "Preventivas no ano" }, "Prev"), h("th", { title: "OS / corretivas no ano" }, "OS"))),
            h("tbody", null, eqMapa.map(e => { const mp = equipPlano[e.id] ? equipPlano[e.id].mapa[e.id] || {} : {}; const oe = osPorEq[e.id] || { total: 0, mes: {} }; let t = 0;
              return h("tr", { key: e.id, className: e.pendencias ? "com-pend" : "" },
                h("td", { className: "e" }, h("button", { type: "button", className: "pt-mapa-eq", onClick: () => setHist(e.id), title: "Ver o histórico de " + e.tag },
                  h("b", null, e.tag), h("span", null, localEq(e)), varias && !uni ? h("span", null, e.clienteNome) : null, e.pendencias ? h("em", null, e.pendencias + " pend.") : null)),
                MES3.map((m, i) => { const s = mp[i + 1]; if (s) t++; const os = oe.mes[i + 1] || []; const r = s === "feita" && equipPlano[e.id] ? resDe(equipPlano[e.id], e.id, i + 1) : "";
                  return h("td", { key: m, className: i + 1 === mesLim ? "atual" : "", title: os.length ? os.map(o => "OS " + o.numero + (o.tipoServico ? " · " + o.tipoServico : "")).join("\n") : undefined },
                    r === "pendencia" ? h("span", { className: "n" }, "!") : r === "parcial" ? h("span", { className: "p" }, "½") : s === "feita" ? h("span", { className: "v" }, "✓") : s ? h("span", { className: "p" }, "•") : os.length ? null : "·",
                    os.length ? h("span", { className: "o" }, os.length > 1 ? "●" + os.length : "●") : null); }),
                h("td", null, h("b", null, t)), h("td", null, oe.total ? h("b", { className: "o" }, oe.total) : "·")); })))))),
      hist ? h(HistoricoEquip, { id: hist, sessao, aoFechar: () => setHist(null) }) : null,
      solAberta ? h(SolicitacaoDetalhe, { id: solAberta, sessao, escritorio, aoHist: setHist, aoFechar: () => { setSolAberta(null); carregar(); } }) : null,
      qr && !escritorio ? h(QrAbrir, { token: qr.token, sessao, aoFechar: () => setQr(null) }) : null);
  }
  /* =================================================================
     v1.28.1 — SOLICITAÇÃO ABERTA PELO CLIENTE: o que foi feito (respostas,
     fotos, OS abertas para ela) e espaço para o cliente responder
     ================================================================= */
  function SolicitacaoDetalhe({ id, sessao, escritorio, aoHist, aoFechar }) {
    const [s, setS] = useState(null);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [foto, setFoto] = useState(null);
    useEffect(() => { api("pmoc.portal.solicitacao", { id }).then(setS, e => setErro(e.message)); }, [id]);
    async function responder() {
      if (!msg.trim()) return;
      setEnviando(true);
      try { setS(await api("pmoc.portal.responder", { id, texto: msg })); setMsg(""); K.avisar("Mensagem enviada para a equipe."); }
      catch (x) { K.avisar(x.message, true); }
      setEnviando(false);
    }
    if (erro) return h(Painel, { titulo: "Solicitação", aoFechar }, h(Aviso, null, erro));
    if (!s) return h(Painel, { titulo: "Solicitação", aoFechar }, h("div", { className: "vazio" }, "Carregando…"));
    if (foto && K.OS && K.OS.VerFoto) return h(K.OS.VerFoto, { foto, fotos: s.fotos, podeApagar: () => false, aoFechar: () => setFoto(null) });
    const ST = { aberta: ["Recebida", "pt-s-az"], andamento: ["Em atendimento", "pt-s-am"], aguardando: ["Aguardando", "pt-s-am"], feita: ["Concluída", "pt-s-vd"], cancelada: ["Cancelada", "pt-s-cz"] };
    const st = ST[s.status] || ST.aberta;
    const pdfOS = oid => K.OS && K.OS.relatorioDaOS ? K.OS.relatorioDaOS(oid, sessao) : null;
    return h(Painel, { titulo: s.titulo, sub: s.clienteNome + " · aberta em " + dataHoraBR(s.criadoEm) + (s.por ? " por " + s.por : ""), aoFechar,
      rodape: [h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      h("div", { className: "pt-sol-topo" }, h("span", { className: "pt-s " + st[1] }, st[0]), s.feitaEm ? h("span", { className: "cel-sub" }, "concluída em " + dataHoraBR(s.feitaEm)) : null),
      s.descricao.trim() ? h("div", { className: "tf-desc", style: { background: "#f6f7f9", borderRadius: 8, padding: "10px 12px" } }, s.descricao) : null,
      s.os.length ? h(React.Fragment, null,
        h("div", { className: "secao-titulo" }, "Atendimento"),
        s.os.map(o => h("div", { key: o.id, className: "pt-item", style: { marginBottom: 6, alignItems: "flex-start" } },
          h("div", { style: { minWidth: 0 } }, h("b", null, "OS " + o.numero + (o.tipoServico ? " · " + o.tipoServico : "")),
            o.equipTag ? h("button", { type: "button", className: "pt-tag pt-tag-az pt-os-eq", onClick: () => aoHist(o.equipamentoId) }, "❄ " + o.equipTag + (o.equipLocal ? " · " + o.equipLocal : "")) : null,
            h("div", { className: "cel-sub" }, o.quando ? dataBR(o.quando) : ""),
            o.conclusao ? h("div", { style: { whiteSpace: "pre-wrap", fontSize: 13, marginTop: 4 } }, h("b", null, "O que foi feito: "), o.conclusao) : null),
          h("div", { style: { display: "flex", gap: 6, alignItems: "center", flex: "none" } }, h("span", { className: "selo " + SELO_OS(o.status) }, o.status),
            h("button", { type: "button", className: "bt bt-p", onClick: () => pdfOS(o.id) }, "PDF"))))) : null,
      h("div", { className: "secao-titulo" }, "Conversa com a equipe"),
      s.mensagens.length ? h("div", { className: "pt-chat" }, s.mensagens.map(m => h("div", { key: m.id, className: "pt-msg" + (m.doCliente ? " cli" : "") },
        h("div", { className: "cel-sub" }, (m.doCliente ? (m.autor || "Cliente") : (m.autor || "Equipe") + " · equipe") + " · " + dataHoraBR(m.criadoEm)),
        h("div", { style: { whiteSpace: "pre-wrap" } }, m.texto))))
        : h("p", { className: "cel-sub" }, s.status === "feita" ? "A equipe concluiu sem deixar mensagem." : "A equipe ainda não respondeu. Você recebe a resposta aqui."),
      s.fotos.length ? h(React.Fragment, null, h("div", { className: "secao-titulo" }, "Fotos (" + s.fotos.length + ")"),
        h("div", { className: "os-fotos" }, s.fotos.map(f => h("button", { key: f.id, type: "button", className: "os-foto", onClick: () => setFoto(f) },
          h("img", { src: K.urlAnexo(f.id), alt: f.legenda || "Foto", loading: "lazy" }))))) : null,
      escritorio ? h("p", { className: "cel-sub", style: { marginTop: 12 } }, "Para responder ao cliente, comente na tarefa da solicitação (Operacional › Tarefas). Comentários e fotos da tarefa aparecem aqui para ele.")
      : h("div", { style: { display: "flex", gap: 6, marginTop: 12 } },
          h("textarea", { rows: 2, value: msg, placeholder: s.status === "feita" ? "Ainda tem algo? Escreva aqui e a solicitação volta para a equipe." : "Escreva uma mensagem para a equipe", onChange: e => setMsg(e.target.value), style: { flex: 1 } }),
          h("button", { type: "button", className: "bt bt-marca", disabled: enviando || !msg.trim(), onClick: responder }, enviando ? "…" : "Enviar")));
  }

  /* =================================================================
     v1.28.0 — VISÃO DO CLIENTE (escritório): o mesmo painel da área do cliente,
     escolhendo o cliente, para ver o que ele vê (PMOC, solicitações, OS)
     ================================================================= */
  function VisaoCliente({ sessao }) {
    const lembrar = () => { try { return JSON.parse(localStorage.getItem("k-visao-cli") || "null"); } catch (e) { return null; } };
    const [cli, setCli] = useState(lembrar);
    const [planos, setPlanos] = useState(null);
    const [outro, setOutro] = useState(false);
    useEffect(() => { api("pmoc.listar", { ano: new Date().getFullYear() }).then(r => setPlanos(r.itens || []), () => setPlanos([])); }, []);
    function escolher(c) {
      const v = c ? { id: c.id, nome: c.nome } : null;
      setCli(v); setOutro(false);
      try { localStorage.setItem("k-visao-cli", JSON.stringify(v)); } catch (e) {}
    }
    const comPmoc = [];
    (planos || []).forEach(p => { if (!comPmoc.some(x => x.id === p.clienteId)) comPmoc.push({ id: p.clienteId, nome: p.clienteNome }); });
    const naLista = cli && comPmoc.some(x => x.id === cli.id);
    return h("div", null,
      h("div", { className: "bloco vc-barra" },
        h("div", { className: "vc-txt" }, h("b", null, "Visão do cliente"), h("span", { className: "cel-sub" }, "Exatamente o que o cliente vê na área dele: PMOC, solicitações, pendências e OS.")),
        h("div", { className: "vc-sel" },
          !outro ? h("select", { className: "entrada-texto", value: cli ? (naLista ? cli.id : "x") : "", "aria-label": "Cliente",
            onChange: e => { const v = e.target.value; if (v === "+") return setOutro(true); if (v === "x") return; const c = comPmoc.find(x => String(x.id) === v); escolher(c || null); } },
            h("option", { value: "" }, planos === null ? "Carregando…" : "Escolha o cliente…"),
            cli && !naLista ? h("option", { value: "x" }, cli.nome) : null,
            comPmoc.length ? h("optgroup", { label: "Com PMOC em " + new Date().getFullYear() }, comPmoc.map(c => h("option", { key: c.id, value: c.id }, c.nome))) : null,
            h("option", { value: "+" }, "Outro cliente…"))
          : K.CRM && K.CRM.EscolheCliente ? h("div", { style: { minWidth: 260 } }, h(K.CRM.EscolheCliente, { valor: cli ? cli.id : null, rotulo: cli ? cli.nome : "", aoEscolher: c => escolher(c) }),
              h("button", { type: "button", className: "bt bt-p bt-leve", style: { marginTop: 6 }, onClick: () => setOutro(false) }, "Voltar à lista")) : null)),
      cli ? h("div", { className: "vc-portal" }, h(Portal, { key: cli.id, sessao, clienteFixo: cli.id, escritorio: true }))
        : h("div", { className: "bloco vazio" }, h("strong", null, "Escolha um cliente."), "O painel abre igual ao que o cliente vê."));
  }

  (function cssPortal() {
    if (document.getElementById("k-css-portal")) return;
    const st = document.createElement("style"); st.id = "k-css-portal";
    st.textContent = [
      ".pt-app{min-height:100vh;background:#eef1f6}.pt-barra{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;border-bottom:1px solid var(--linha,#e1e3e7);padding:8px 16px}",
      ".pt-marca{display:flex;align-items:center;gap:9px}.pt-marca img{height:26px;max-width:120px;object-fit:contain}.pt-marca b{display:block;font-size:13px;line-height:1.1}.pt-marca small{display:block;font-size:10.5px;color:#1f71ff}",
      ".pt-eu{display:flex;align-items:center;gap:7px;background:#fff;border:1px solid var(--linha,#e1e3e7);border-radius:20px;padding:3px 10px 3px 3px;cursor:pointer;font:inherit;font-size:11px;color:#6b7280}.pt-eu b{display:block;font-size:11.5px;color:#1a1d21;line-height:1.1}.pt-eu small{display:block;font-size:10px;color:#8a92a0}",
      ".pt-eu .avatar{width:26px;height:26px;font-size:11px;background:#6d4fd8;color:#fff}.pt-suspenso{position:absolute;top:110%;right:0;bottom:auto;left:auto;min-width:180px;z-index:30}",
      ".pt-corpo{padding:16px 14px 40px}.pt{max-width:820px;margin:0 auto;font-size:12.5px}.pt .cel-sub{font-size:11px}.pt .bt{font-size:12px}",
      ".pt-topo h1{font-size:17px!important}.pt-kpi b{font-size:21px!important}.pt-bloco{padding:12px 14px!important}.pt-cab b{font-size:13px!important}",
      ".pt-mes .bt,.pt-cab .bt{background:#eef4ff;border:1px solid #dbe6ff;color:#1f4fbf;font-size:11px;padding:4px 10px;height:auto}",
      ".pt{max-width:820px;margin:0 auto}.pt-topo{display:flex;justify-content:space-between;align-items:center;gap:12px;background:linear-gradient(120deg,var(--marca),#1f71ff);color:#fff;border-radius:14px;padding:16px 18px;margin-bottom:12px}",
      ".pt-topo small{font-size:10.5px;font-weight:700;letter-spacing:.5px;opacity:.85}.pt-topo h1{margin:2px 0 0;font-size:19px;color:#fff}.pt-uni{display:block;margin-top:4px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:8px;font:700 16px inherit;padding:4px 8px;max-width:100%}.pt-uni option{color:#111}",
      ".pt-ano{background:#fff;color:#111;border:0;border-radius:8px;padding:6px 10px;font-weight:700}",
      ".pt-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.pt-kpi{background:#fff;border:1px solid var(--linha,#e1e3e7);border-left:4px solid var(--marca);border-radius:12px;padding:12px 14px}",
      ".pt-kpi small{display:block;font-size:11.5px;color:#4a5160}.pt-kpi b{display:block;font-size:24px;line-height:1.2;margin:4px 0 2px}.pt-kpi span{font-size:11px;color:#8a92a0}.pt-verde{border-left-color:#0b7d5c}.pt-az2{border-left-color:#1f71ff}.pt-rosa{border-left-color:#a3405f}.pt-rosa b{color:#a3405f}",
      ".pt-bloco{background:#fff;border:1px solid var(--linha,#e1e3e7);border-radius:12px;padding:14px 16px;margin-bottom:12px}.pt-cab{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.pt-cab b{font-size:14px}.pt-cab>span{font-size:11.5px;color:#8a92a0}.pt-alerta{color:#a3405f!important;font-weight:600}",
      ".pt-docs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pt-doc>.bt{margin-top:auto}.pt-doc{border:1px solid var(--linha,#e1e3e7);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px}.pt-doc p{margin:0;font-size:12px;color:#4a5160;flex:1}.pt-doc .bt{width:100%;justify-content:center}",
      ".pt-doc-l{display:flex;gap:6px}.pt-doc-l select{flex:1;height:36px}.pt-doc-l .bt{width:auto}.bt-verde{background:#0b7d5c;color:#fff;border-color:#0b7d5c}",
      ".pt-sol{border:1px solid var(--linha,#e1e3e7);border-radius:10px;padding:12px;margin-bottom:10px}.pt-sol p{margin:2px 0 10px}.pt-sol textarea{width:100%}",
      ".pt-lista{display:grid;gap:6px}.pt-item{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--linha,#e1e3e7);border-radius:10px;padding:9px 12px}",
      ".pt-s{font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:12px;white-space:nowrap}.pt-s-az{background:#e8efff;color:#1f4fbf}.pt-s-am{background:#fff4e0;color:#9a5b00}.pt-s-vd{background:#e7f6ef;color:#0b7d5c}.pt-s-cz{background:#eef0f3;color:#6b7280}",
      ".pt-pend{border:1px solid #f0c9d4;border-left:4px solid #a3405f;border-radius:10px;padding:9px 12px;margin-bottom:8px}.pt-pend-t{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:#8a92a0;margin-bottom:4px}",
      ".pt-tag{background:#eef0f3;color:#4a5160;border:0;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700}.pt-tag-az{background:#e8efff;color:#1f4fbf;cursor:pointer}",
      ".pt-duas{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pt-duas .pt-bloco{margin-bottom:12px}",
      ".pt-meses{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.pt-mes{border:1px solid var(--linha,#e1e3e7);border-radius:10px;padding:9px 10px;position:relative;display:flex;flex-direction:column;gap:4px}.pt-mes i{position:absolute;right:10px;top:12px;width:8px;height:8px;border-radius:50%;background:#9aa1ad}",
      ".pt-mes span{font-size:11px;color:#6b7280}.pt-m-vd i{background:#0b7d5c}.pt-m-vd span{color:#0b7d5c}.pt-m-am i{background:#c77700}.pt-m-am span{color:#c77700}.pt-m-pe i{background:#a3405f}.pt-m-pe span{color:#a3405f}.pt-mes .bt{margin-top:2px}",
      ".pt-mapa{width:100%;border-collapse:collapse;font-size:12px}.pt-mapa th{background:#f4f6fb;color:#4a5160;font-size:11px;padding:6px 4px;text-align:center}.pt-mapa td{text-align:center;padding:5px 4px;border-bottom:1px solid #f0f2f6;color:#c3c8d2}",
      ".pt-mapa .e{text-align:left;white-space:nowrap;color:#1a1d21}.pt-mapa .e span{color:#8a92a0;margin-left:6px;font-size:11px}.pt-mapa .atual{background:#eef4ff}.pt-mapa .v{color:#0b7d5c;font-weight:700}.pt-mapa .p{color:#c77700;font-weight:700}.pt-mapa .n{color:#a3405f;font-weight:700}.pt-mapa td b{color:#1f4fbf}",
      ".pt-parque{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.pt-parque .pt-eq{font-size:11px}.pt-eq{text-align:left;background:#f9fafc;border:1px solid var(--linha,#e1e3e7);border-radius:10px;padding:9px 11px;cursor:pointer;display:flex;flex-direction:column;gap:2px;font:inherit;color:inherit}",
      ".pt-eq:hover{border-color:var(--marca)}.pt-eq b{color:var(--marca);font-size:12.5px}.pt-eq div{font-size:12px;font-weight:600}.pt-eq span{font-size:11px;color:#8a92a0}.pt-eq em{font-style:normal;font-size:11px;color:#a3405f;font-weight:700}",
      ".pt-mapa-leg i{font-style:normal;font-weight:700}.pt-mapa-leg .v{color:#0b7d5c}.pt-mapa-leg .p{color:#c77700}.pt-mapa-leg .n{color:#a3405f}.pt-mapa-leg .o{color:#1f4fbf}",
      ".pt-mapa .o{color:#1f4fbf;font-weight:700;font-size:11px;margin-left:1px}.pt-mapa td b.o{color:#1f4fbf}",
      ".pt-mapa-eq{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;text-align:left}",
      ".pt-mapa-eq b{color:#1f4fbf;text-decoration:underline;text-decoration-color:#bcd0f7;text-underline-offset:2px}.pt-mapa-eq:hover b{text-decoration-color:#1f4fbf}",
      ".pt-mapa-eq span{color:#8a92a0;font-size:11px}.pt-mapa-eq em{font-style:normal;font-size:10.5px;font-weight:700;color:#a3405f;background:#fbeef2;border-radius:6px;padding:0 5px}",
      ".pt-os-eq{display:inline-block;margin:3px 0 2px;text-align:left;white-space:normal}.pt-os-loc{font-size:11.5px;color:#4a5160;font-weight:600;margin:3px 0 2px}",
      ".vc-barra{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:0 auto 12px;max-width:980px;padding:12px 16px}.vc-txt b{display:block;font-size:15px}.vc-sel select{min-width:260px}",
      ".vc-portal .pt{max-width:980px}",
      ".pt-item-bt{width:100%;text-align:left;background:#fff;font:inherit;color:inherit;cursor:pointer}.pt-item-bt:hover{border-color:#1f71ff;background:#f7faff}",
      ".pt-sol-topo{display:flex;align-items:center;gap:10px;margin-bottom:10px}.pt-chat{display:grid;gap:8px}",
      ".pt-msg{background:#f3f7ff;border:1px solid #dbe6ff;border-radius:10px;padding:8px 12px;max-width:88%}.pt-msg.cli{background:#f6f7f9;border-color:#e1e3e7;justify-self:end}",
      ".pm-pend-nova{display:grid;grid-template-columns:2fr 110px 1.4fr auto;gap:8px;margin-bottom:14px}@media (max-width:640px){.pm-pend-nova{grid-template-columns:1fr 1fr}.pm-pend-nova input:first-child{grid-column:1 / -1}}",
      "@media (max-width:600px){.pt-sync{display:none}.pt-corpo{padding:10px 8px 30px}}",
      "@media (max-width:900px){.pt-kpis{grid-template-columns:1fr 1fr}.pt-docs,.pt-duas{grid-template-columns:1fr}.pt-parque{grid-template-columns:1fr 1fr}}",
      "@media (max-width:520px){.pt-parque{grid-template-columns:1fr}.pt-meses{grid-template-columns:1fr 1fr}.pt-item{flex-wrap:wrap}}",
    ].join("\n");
    document.head.appendChild(st);
  })();

  /* =================================================================
     SEM INTERNET: o apontamento e as fotos ficam no aparelho
     ================================================================= */
  if (K.offline) {
    const chave = d => d.planoId + "|" + d.equipamentoId + "|" + d.mes;
    async function mexerPlano(ctx, d, fn) {
      const k = { id: Number(d.planoId), mes: Number(d.mes) };
      const p0 = await ctx.ler("pmoc.obter", k);
      if (!p0) return null;
      const p = JSON.parse(JSON.stringify(p0));
      const r = fn(p);
      await ctx.gravar("pmoc.obter", k, p);
      return r;
    }
    K.offline.registrar("pmoc.visita.salvar", { chave, rotulo: d => "Apontamento PMOC (mês " + d.mes + ")",
      local: (d, ctx) => mexerPlano(ctx, d, p => {
        const eid = Number(d.equipamentoId);
        const ant = p.visitas[eid] || { id: null, fotos: [], pend: [], versao: d._base || "" };
        const agora = new Date().toISOString().slice(0, 19).replace("T", " ");
        const pend = (ant.pend || []).concat((d.pendNovas || []).map((t, i) => ({ id: ctx.novoIdLocal() + i, texto: typeof t === "string" ? t : t.texto, prioridade: typeof t === "string" ? "Normal" : t.prioridade,
          material: typeof t === "string" ? null : t.material || null, em: agora, por: "Você (no aparelho)", resolvida: false })));
        const v = Object.assign({}, ant, { equipamentoId: eid, mes: Number(d.mes), itens: d.itens || {}, med: d.med || {}, obs: d.obs || "", pend,
          status: d.concluir ? "feita" : (ant.status === "feita" ? "feita" : "andamento"), tecnico: "Você (no aparelho)", feitaEm: d.concluir ? agora : ant.feitaEm || null, versao: ant.versao || d._base || "" });
        v.resultado = resultadoDe(v.itens);   /* v1.34.0 */
        p.visitas[eid] = v;
        p.mapa[eid] = Object.assign({}, p.mapa[eid] || {}, { [d.mes]: v.status });
        p.resMapa = p.resMapa || {}; p.resMapa[eid] = Object.assign({}, p.resMapa[eid] || {});
        if (v.status === "feita") p.resMapa[eid][d.mes] = v.resultado; else delete p.resMapa[eid][d.mes];
        return v;
      }) });
    K.offline.registrar("pmoc.foto.enviar", { rotulo: d => "Foto PMOC (mês " + d.mes + ")",
      local: async (d, ctx) => {
        const f = { id: ctx.localId, legenda: null, autor: "Você (no aparelho)", criadoEm: new Date().toISOString() };
        await mexerPlano(ctx, d, p => { const eid = Number(d.equipamentoId); const v = p.visitas[eid] || { equipamentoId: eid, mes: Number(d.mes), status: "prevista", itens: {}, med: {}, pend: [], fotos: [] };
          v.fotos = (v.fotos || []).concat([f]); p.visitas[eid] = v; });
        return f;
      } });
  }

  K.modulos = K.modulos || {};
  K.modulos.pmoc = { titulo: "PMOC", icone: "pmoc", perfis: ["admin", "coord", "tecnico"], grupo: "Operacional", Tela: Pmoc };
  K.modulos.portal = { titulo: "Área do cliente", icone: "pmoc", perfis: ["cliente"], Tela: Portal };   /* v1.13.0 */
  K.modulos.visaoCliente = { titulo: "Visão do cliente", icone: "olho", perfis: ["admin", "coord"], grupo: "Operacional", modulo: "pmoc", Tela: VisaoCliente };   /* v1.28.0 */
  K.PMOC = { FormOcorrencia, opcoes: () => api("pmoc.opcoes").then(guardarTipos), HistoricoEquip, QrAbrir, imprimirEtiquetas, relatorioMes, documentoPmoc, relatorioAcompanhamento, lerPlanilha };
})();
