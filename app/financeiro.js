/* =====================================================================
   KONSTANTE SaaS — app/financeiro.js  (v1.22.0 · v1.24.0: fluxo de caixa, recorrentes, conciliação · v1.25.0: DRE, impostos, rentabilidade, contratos)
   ERP › Financeiro: painel, contas a receber e a pagar, contas bancárias
   (com extrato interno), cadastros (categorias, centros, fornecedores)
   e ajustes (provisão de impostos).
   Regra: título = previsto · baixa/movimento = realizado. O saldo das
   contas só muda com movimento; o projetado soma os títulos em aberto.
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Aviso, Painel, Icone } = K;
  const { useState, useEffect, useRef } = React;

  const BRL = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dBR = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "sem data";
  const dCurta = s => s ? String(s).slice(8, 10) + "/" + String(s).slice(5, 7) : "—";
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const hojeISO = () => iso(new Date());
  const numTxt = v => String(v == null ? "" : v).replace(/[^\d,.-]/g, "");
  const valTxt = n => n == null || n === "" ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const STATUS = { aberto: "Em aberto", parcial: "Parcial", quitado: "Quitado", cancelado: "Cancelado" };
  const SELO = { aberto: "os-azul", parcial: "os-amarelo", quitado: "os-verde", cancelado: "os-cinza" };
  /* v1.26.3: categoria (macro) › plano de contas, com código como no xFin (6 · 6.19) */
  const porCodigo = (a, b) => (a.codigo == null ? 9999 : a.codigo) - (b.codigo == null ? 9999 : b.codigo) || a.nome.localeCompare(b.nome, "pt-BR");
  function codCat(op, c) {
    if (!c) return "";
    if (c.paiId) { const p = op.categorias.find(x => x.id === c.paiId); return (p && p.codigo != null ? p.codigo : "?") + "." + (c.codigo != null ? c.codigo : "?"); }
    return c.codigo != null ? String(c.codigo) : "";
  }
  const comCod = (op, c) => { const k = codCat(op, c); return (k ? k + (c.paiId ? " " : " - ") : "") + c.nome; };
  /* para FILTROS: categoria e, embaixo, os planos dela (escolher a categoria filtra todos os planos) */
  function catArvore(op, tipo, manter, todas) {
    const ok = c => (!tipo || c.tipo === tipo) && (todas || c.ativa || (manter != null && String(c.id) === String(manter)));
    const l = op.categorias.filter(ok);
    const existe = id => op.categorias.some(p => p.id === id);
    const pais = l.filter(c => !c.paiId || !existe(c.paiId)).sort(porCodigo);
    const out = [];
    pais.forEach(p => {
      out.push({ id: p.id, rotulo: comCod(op, p) + (p.ativa ? "" : " (inativa)") });
      l.filter(c => c.paiId === p.id).sort(porCodigo).forEach(c => out.push({ id: c.id, rotulo: "   ↳ " + comCod(op, c) + (c.ativa ? "" : " (inativa)") }));
    });
    l.filter(c => c.paiId && existe(c.paiId) && !pais.some(p => p.id === c.paiId)).forEach(c => out.push({ id: c.id, rotulo: comCod(op, c) + " (categoria inativa)" }));
    return out;
  }
  const optsCat = (op, tipo, manter, todas) => catArvore(op, tipo, manter, todas).map(x => h("option", { key: x.id, value: x.id }, x.rotulo));
  /* para LANÇAMENTOS: escolhe o plano de contas, agrupado pela categoria. Categoria sem planos ainda pode ser escolhida. */
  function optsLanc(op, tipo, manter) {
    const vale = c => c.tipo === tipo && (c.ativa || String(c.id) === String(manter));
    const macros = op.categorias.filter(c => !c.paiId && vale(c)).sort(porCodigo);
    const out = [];
    macros.forEach(m => {
      const planos = op.categorias.filter(c => c.paiId === m.id && vale(c)).sort(porCodigo);
      if (!planos.length) out.push(h("option", { key: m.id, value: m.id }, comCod(op, m)));
      else out.push(h("optgroup", { key: m.id, label: comCod(op, m) },
        String(m.id) === String(manter) ? h("option", { value: m.id }, m.nome + " (direto na categoria)") : null,
        planos.map(c => h("option", { key: c.id, value: c.id }, comCod(op, c)))));
    });
    return out;
  }
  /* linhas da DRE que fazem sentido para cada tipo, na ordem da DRE */
  const LINHAS_DRE = { receita: ["receita_bruta", "receita_financeira", "fora_dre"], despesa: ["deducoes", "custo_direto", "despesa_operacional", "despesa_financeira", "tributo_lucro", "fora_dre"] };

  /* v1.25.3: recarrega as opções (categorias novas criadas dentro de um formulário) sem sair da tela */
  let recarregarOp = () => Promise.resolve();
  /* v1.25.3: conciliação em andamento guardada neste aparelho até não sobrar nada pendente */
  const chaveConc = sessao => "ksaas-fin-conc-" + ((sessao && sessao.usuario && sessao.usuario.id) || "x");
  function lerConc(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function gravarConc(k, v) { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch (e) { /* sem armazenamento */ } }

  /* v1.27.1: ícones do financeiro (traço simples, mesmo estilo do K.Icone) */
  const FI_ICONES = {
    entrada: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
    saida: "M12 20V8M7 12.5l5-5 5 5M5 4h14",
    ajuste: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 4.6 1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.25.4-1.51 1z",
    transferir: "M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4",
    cartao: "M3 6h18v12H3zM3 10h18M7 15h4",
    painel: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    fluxo: "M3 17l6-6 4 4 8-8M15 7h6v6",
    dre: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
    rentab: "M12 3v9l7.8 4.5A9 9 0 1 1 12 3zM15 3.5A9 9 0 0 1 20.5 11H15z",
    contas: "M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01",
    conciliacao: "M2 12l4 4 8-8M10 16l1 1 10-10",
    cadastros: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    carteira: "M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01",
    predio: "M4 21V4h11v17M15 9h5v12M2 21h20M8 8h.01M11 8h.01M8 12h.01M11 12h.01M8 16h.01M11 16h.01",
    cifrao: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM14.5 9.2c-.4-.9-1.4-1.4-2.5-1.4-1.5 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4.1 0 1.1-1.1 1.9-2.5 1.9-1.2 0-2.2-.6-2.6-1.5M12 6.5v1.3M12 16.2v1.3",
    setas: "M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4",
    calendario: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
    dir: "M9 6l6 6-6 6", esq: "M15 6l-6 6 6 6", baixo: "M6 9l6 6 6-6",
  };
  function FIc({ n, t }) {
    return h("span", { className: "fic" + (t ? " fic-" + t : ""), "aria-hidden": true },
      h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }, h("path", { d: FI_ICONES[n] || "" })));
  }
  const ICONE_ABA = { painel: "painel", fluxo: "fluxo", receber: "entrada", pagar: "saida", dre: "dre", rentab: "rentab", contas: "contas", conciliacao: "conciliacao", cadastros: "cadastros", ajustes: "ajuste" };

  /* ---------------- período ---------------- */
  function periodoDe(p) {
    const d = new Date(), y = d.getFullYear(), m = d.getMonth();
    if (p.tipo === "hoje") return { de: hojeISO(), ate: hojeISO() };
    if (p.tipo === "semana") { const ini = new Date(d); ini.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const fim = new Date(ini); fim.setDate(ini.getDate() + 6); return { de: iso(ini), ate: iso(fim) }; }
    if (p.tipo === "anterior") return { de: iso(new Date(y, m - 1, 1)), ate: iso(new Date(y, m, 0)) };
    if (p.tipo === "proximo") return { de: iso(new Date(y, m + 1, 1)), ate: iso(new Date(y, m + 2, 0)) };
    if (p.tipo === "ano") return { de: y + "-01-01", ate: y + "-12-31" };
    if (p.tipo === "livre") return { de: p.de || iso(new Date(y, m, 1)), ate: p.ate || iso(new Date(y, m + 1, 0)) };
    return { de: iso(new Date(y, m, 1)), ate: iso(new Date(y, m + 1, 0)) };
  }
  function Periodo({ p, setP }) {
    const ops = [["hoje", "Hoje"], ["semana", "Semana"], ["mes", "Mês"], ["anterior", "Mês anterior"], ["proximo", "Próximo mês"], ["ano", "Ano"], ["livre", "Escolher"]];
    return h("div", { className: "fi-periodo" },
      h("div", { className: "chips" }, ops.map(([k, t]) => h("button", { key: k, type: "button", className: "chip" + (p.tipo === k ? " ativo" : ""), onClick: () => setP(Object.assign({}, p, { tipo: k })) }, t))),
      p.tipo === "livre" ? h("div", { className: "fi-livre" },
        h("input", { type: "date", className: "entrada-texto", value: p.de || "", onChange: e => setP(Object.assign({}, p, { de: e.target.value })), "aria-label": "De" }),
        h("span", null, "até"),
        h("input", { type: "date", className: "entrada-texto", value: p.ate || "", onChange: e => setP(Object.assign({}, p, { ate: e.target.value })), "aria-label": "Até" })) : null);
  }

  /* v1.27.1: cartão de ação com ícone (modelo enviado por Eneas) */
  /* v1.32.0: aba do Financeiro avançado num plano que não inclui */
  function SoPremium({ aba }) {
    const nome = { fluxo: "Fluxo de caixa", dre: "DRE gerencial", rentab: "Rentabilidade por contrato e OS", conciliacao: "Conciliação bancária" }[aba] || "Este recurso";
    const admin = K.sessaoAtual && K.temPerfil(K.sessaoAtual, "admin");
    return h("div", { className: "bloco vazio" },
      h("strong", null, nome + " faz parte do plano Premium"),
      h("p", { style: { maxWidth: 520, margin: "6px auto 14px" } }, "No Premium você tem DRE mês a mês, fluxo de caixa realizado e projetado, rentabilidade por contrato e OS, e conciliação com o extrato do banco."),
      admin ? h("a", { className: "bt bt-marca", href: "#/assinatura" }, "Ver planos") : h("p", { className: "cel-sub" }, "Fale com o administrador da sua empresa."));
  }

  function acaoFi(cor, icone, titulo, sub, onClick, desligado) {
    return h("button", { key: titulo, type: "button", className: "fi-acao" + (cor ? " fi-acao-" + cor : ""), onClick, disabled: !!desligado },
      h(FIc, { n: icone }), h("span", { className: "fi-acao-t" }, h("b", null, titulo), h("small", null, sub)));
  }

  /* ---------------- tela principal ---------------- */
  function Financeiro({ sessao }) {
    const [aba, setAba] = useState(() => { try { return sessionStorage.getItem("ksaas-fin-aba") || "painel"; } catch (e) { return "painel"; } });
    const [op, setOp] = useState(null);
    const [erro, setErro] = useState("");
    const [versao, setVersao] = useState(0);
    const [form, setForm] = useState(null);        // {tipo, titulo?}
    const [detalhe, setDetalhe] = useState(null);  // id do título
    const [mov, setMov] = useState(false);
    const [transf, setTransf] = useState(false);
    const [compra, setCompra] = useState(false);   /* v1.25.2 */
    const [extrato, setExtrato] = useState(null);  // conta

    function carregarOp() { return api("fin.opcoes").then(o => { setOp(o); setErro(""); }, e => setErro(e.message)); }
    recarregarOp = carregarOp;
    useEffect(() => { carregarOp(); }, []);
    useEffect(() => { try { sessionStorage.setItem("ksaas-fin-aba", aba); } catch (e) {} }, [aba]);
    const mudou = () => { setVersao(v => v + 1); carregarOp(); };

    if (erro) return h("div", { className: "bloco vazio" }, h(Aviso, null, erro), h("button", { className: "bt", onClick: carregarOp }, "Tentar de novo"));
    if (!op) return h("div", { className: "bloco vazio" }, "Carregando…");

    const abas = [["painel", "Painel"], ["fluxo", "Fluxo de caixa"], ["receber", "A receber"], ["pagar", "A pagar"], ["dre", "DRE"], ["rentab", "Rentabilidade"], ["contas", "Contas"], ["conciliacao", lerConc(chaveConc(sessao)) ? "Conciliação •" : "Conciliação"], ["cadastros", "Cadastros"], ["ajustes", "Ajustes"]];
    const ctx = { op, sessao, versao, mudou, abrir: id => setDetalhe(id), novo: (tipo, base) => setForm({ tipo, titulo: base || null }), extrato: c => setExtrato(c) };
    /* v1.32.0: DRE, fluxo de caixa, rentabilidade e conciliação são do plano Premium */
    const AVANCADAS = { fluxo: 1, dre: 1, rentab: 1, conciliacao: 1 };
    const temAvancado = !K.temModulo || K.temModulo("erp_avancado");
    const travada = k => !temAvancado && AVANCADAS[k];
    return h("div", { className: "fi" },
      h("div", { className: "fi-acoes2" },
        acaoFi("receber", "entrada", "A receber", "Registrar entrada", () => setForm({ tipo: "receber" })),
        acaoFi("pagar", "saida", "A pagar", "Registrar saída", () => setForm({ tipo: "pagar" })),
        acaoFi("", "ajuste", "Tarifa / ajuste", "Gerenciar ajustes", () => setMov(true), !op.contas.length),
        acaoFi("", "transferir", "Transferir", "Entre contas", () => setTransf(true), op.contas.length < 2),
        op.contas.some(c => c.ativa && c.tipo === "cartao") ? acaoFi("", "cartao", "Compra no cartão", "Lançar na fatura", () => setCompra(true)) : null),
      h("div", { className: "abas fi-abas", role: "tablist" }, abas.map(([k, t]) => h("button", { key: k, role: "tab", "aria-selected": aba === k, className: "aba fi-aba" + (aba === k ? " ativa" : "") + (travada(k) ? " fi-travada" : ""), title: travada(k) ? "Plano Premium" : undefined, onClick: () => setAba(k) },
        h(FIc, { n: ICONE_ABA[k] || "painel" }), t))),
      travada(aba) ? h(SoPremium, { aba }) :
      aba === "painel" ? h(PainelFin, ctx)
      : aba === "receber" || aba === "pagar" ? h(ListaTitulos, Object.assign({ key: aba, tipo: aba }, ctx))
      : aba === "contas" ? h(Contas, ctx)
      : aba === "fluxo" ? h(Fluxo, ctx)
      : aba === "dre" ? h(Dre, ctx)
      : aba === "rentab" ? h(Rentabilidade, ctx)
      : aba === "conciliacao" ? h(Conciliacao, ctx)
      : aba === "cadastros" ? h(Cadastros, ctx)
      : h(Ajustes, ctx),
      form ? h(FormTitulo, { op, tipo: form.tipo, titulo: form.titulo, aoFechar: () => setForm(null), aoSalvar: id => { setForm(null); mudou(); if (id) setDetalhe(id); } }) : null,
      detalhe ? h(DetalheTitulo, { id: detalhe, op, aoFechar: () => { setDetalhe(null); mudou(); }, aoEditar: t => { setDetalhe(null); setForm({ tipo: t.tipo, titulo: t }); } }) : null,
      mov ? h(FormMovimento, { op, aoFechar: () => setMov(false), aoSalvar: () => { setMov(false); mudou(); } }) : null,
      transf ? h(FormTransferencia, { op, aoFechar: () => setTransf(false), aoSalvar: () => { setTransf(false); mudou(); } }) : null,
      compra ? h(CompraCartao, { op, aoFechar: () => setCompra(false), aoSalvar: id => { setCompra(false); mudou(); } }) : null,
      extrato ? h(Extrato, { conta: extrato, op, aoFechar: () => { setExtrato(null); mudou(); }, abrir: id => setDetalhe(id) }) : null);
  }

  /* ---------------- painel ---------------- */
  /* v1.27.1: painel enxuto — saldo das contas, projetado do mês e a semana dia a dia */
  const MESES_FI = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const DIAS_FI = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const somaDias = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
  const somaMes = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };

  function PainelFin({ op, versao, abrir, extrato }) {
    const [conta, setConta] = useState("");
    const [centro, setCentro] = useState("");
    const [mes, setMes] = useState(() => hojeISO().slice(0, 7));
    const [semana, setSemana] = useState(() => hojeISO());
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [verContas, setVerContas] = useState(false);
    useEffect(() => {
      setErro("");
      api("fin.painel.resumo", { mes, semana, contaId: conta, centroId: centro }).then(setD, e => setErro(e.message));
    }, [mes, semana, conta, centro, versao]);

    const seletor = (icone, valor, aoMudar, rotulo, opcoes) => h("label", { className: "fi-seletor" },
      h(FIc, { n: icone }),
      h("select", { value: valor, onChange: e => aoMudar(e.target.value), "aria-label": rotulo }, opcoes),
      h(FIc, { n: "baixo", t: "seta" }));

    return h("div", { className: "fi-painel2" },
      h("div", { className: "fi-seletores" },
        seletor("carteira", conta, setConta, "Conta", [h("option", { key: "", value: "" }, "Todas as contas")].concat(op.contas.filter(c => c.ativa).map(c => h("option", { key: c.id, value: c.id }, c.nome)))),
        op.centros.length ? seletor("predio", centro, setCentro, "Centro de custo", [h("option", { key: "", value: "" }, "Todos os centros")].concat(op.centros.filter(c => c.ativo).map(c => h("option", { key: c.id, value: c.id }, c.nome)))) : null),
      erro ? h(Aviso, null, erro) : null,
      !d ? h("div", { className: "bloco vazio" }, "Carregando…")
      : h(React.Fragment, null,
          d.semConta ? h("div", { className: "aviso aviso-info fi-dica" }, "Cadastre sua primeira conta (banco ou caixa) na aba ", h("b", null, "Contas"), " com o saldo inicial. Sem conta, nada aparece como realizado.") : null,
          /* saldo */
          h("div", { className: "fi-card fi-card-saldo" },
            h("button", { type: "button", className: "fi-linha-card", onClick: () => setVerContas(v => !v), "aria-expanded": verContas },
              h(FIc, { n: "cifrao", t: "verde" }),
              h("span", { className: "fi-lc-t" }, h("b", null, "Saldo nas contas"), h("small", null, "Hoje" + (conta ? " · conta escolhida" : "") + (d.saldoCartoes ? " · cartões " + BRL(d.saldoCartoes) : ""))),
              h("b", { className: "fi-lc-v " + (d.saldoConsolidado < 0 ? "sai" : "ent") }, BRL(d.saldoConsolidado)),
              h(FIc, { n: verContas ? "baixo" : "dir", t: "seta" })),
            verContas ? h("div", { className: "fi-contas" }, d.contas.length ? d.contas.map(c => h("button", { key: c.id, type: "button", className: "fi-conta", onClick: () => extrato(c) },
              h("span", null, h("b", null, c.nome), h("small", null, c.tipoNome)), h("b", { className: c.saldo < 0 ? "sai" : "" }, BRL(c.saldo))))
              : h("div", { className: "in-vazio" }, "Nenhuma conta cadastrada.")) : null),
          h(ProjetadoMes, { m: d.mes, mes, setMes, centro: !!centro || !!conta }),
          h(SemanaFin, { s: d.semana, hoje: d.hoje, setSemana, abrir })));
  }

  /* barras horizontais: realizado (cheio) + previsto (claro) */
  function ProjetadoMes({ m, mes, setMes }) {
    const totE = m.recebido + m.aReceber, totS = m.pago + m.aPagar;
    const max = Math.max(1, totE, totS);
    const res = totE - totS;
    const barra = (cls, rot, feito, falta, rotFeito, rotFalta) => {
      const tot = feito + falta;
      return h("div", { className: "fi-hb" },
        h("div", { className: "fi-hb-cab" }, h("span", { className: "fi-hb-rot" }, h("i", { className: "fi-hb-cor " + cls }), rot), h("b", null, BRL(tot))),
        h("div", { className: "fi-hb-trilho", role: "img", "aria-label": rot + ": " + rotFeito + " " + BRL(feito) + ", " + rotFalta + " " + BRL(falta) },
          feito > 0 ? h("div", { className: "fi-hb-seg " + cls, style: { width: (feito / max * 100) + "%" }, title: rotFeito + ": " + BRL(feito) }) : null,
          falta > 0 ? h("div", { className: "fi-hb-seg " + cls + " prev", style: { width: (falta / max * 100) + "%" }, title: rotFalta + ": " + BRL(falta) }) : null),
        h("div", { className: "fi-hb-sub" }, h("span", null, rotFeito + " ", h("b", null, BRL(feito))), h("span", null, rotFalta + " ", h("b", null, BRL(falta)))));
    };
    const nome = MESES_FI[+mes.slice(5, 7) - 1] + " " + mes.slice(0, 4);
    return h("div", { className: "fi-card" },
      h("div", { className: "fi-card-cab" },
        h(FIc, { n: "setas", t: "azul" }),
        h("span", { className: "fi-lc-t" }, h("b", null, "Projetado do mês"), h("small", null, "realizado + o que vence no mês")),
        h("div", { className: "fi-nav" },
          h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setMes(somaMes(mes, -1)), "aria-label": "Mês anterior" }, h(FIc, { n: "esq" })),
          h("span", null, nome),
          h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setMes(somaMes(mes, 1)), "aria-label": "Próximo mês" }, h(FIc, { n: "dir" })))),
      h("div", { className: "fi-hbs" },
        barra("ent", "Recebimentos", m.recebido, m.aReceber, "Recebido", "A receber"),
        barra("sai", "Saídas", m.pago, m.aPagar, "Pago", "A pagar")),
      h("div", { className: "fi-hb-pe" },
        h("span", null, h("i", { className: "fi-hb-cor neutro" }), "cheio = realizado · ", h("i", { className: "fi-hb-cor neutro prev" }), "claro = previsto"),
        h("span", null, "Resultado projetado ", h("b", { className: res >= 0 ? "ent" : "sai" }, (res >= 0 ? "+" : "−") + BRL(Math.abs(res))))),
      (m.receberVencido || m.pagarVencido) ? h("div", { className: "fi-hb-venc" }, "Vencido de antes e ainda em aberto (fora das barras): ",
        m.receberVencido ? h("span", null, "a receber ", h("b", { className: "ent" }, BRL(m.receberVencido))) : null, m.receberVencido && m.pagarVencido ? " · " : null,
        m.pagarVencido ? h("span", null, "a pagar ", h("b", { className: "sai" }, BRL(m.pagarVencido))) : null) : null);
  }

  /* a semana dia a dia; toque no dia para ver o que compõe */
  function SemanaFin({ s, hoje, setSemana, abrir }) {
    const [aberto, setAberto] = useState(null);
    useEffect(() => { setAberto(s.de <= hoje && hoje <= s.ate ? hoje : null); }, [s.de]);
    const dias = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const dt = somaDias(s.de, i);
      const it = s.itens.filter(x => x.data === dt);
      const ent = it.filter(x => x.valor > 0).reduce((a, x) => a + x.valor, 0), sai = it.filter(x => x.valor < 0).reduce((a, x) => a - x.valor, 0);
      const prev = it.some(x => x.situacao !== "realizado");
      return { dt, i, it, ent, sai, prev };
    });
    const v = (n, cls) => n ? h("span", { className: cls }, BRL(n)) : h("span", { className: "fi-zero" }, "—");
    const estreito = (() => { try { return window.matchMedia("(max-width: 640px)").matches; } catch (e) { return false; } })();
    const res = (cel, k) => estreito ? null : h("td", { key: k || "r", className: "n" }, cel);
    return h("div", { className: "fi-card" },
      h("div", { className: "fi-card-cab" },
        h(FIc, { n: "calendario", t: "roxo" }),
        h("span", { className: "fi-lc-t" }, h("b", null, "Entradas e saídas da semana"), h("small", null, "toque no dia para ver os lançamentos")),
        h("div", { className: "fi-nav" },
          h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setSemana(somaDias(s.de, -7)), "aria-label": "Semana anterior" }, h(FIc, { n: "esq" })),
          h("span", null, dCurta(s.de) + " a " + dCurta(s.ate)),
          h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setSemana(somaDias(s.de, 7)), "aria-label": "Próxima semana" }, h(FIc, { n: "dir" })))),
      h("table", { className: "fi-sem" },
        h("thead", null, h("tr", null, h("th", null, "Dia"), h("th", { className: "n" }, "Entradas"), h("th", { className: "n" }, "Saídas"), estreito ? null : h("th", { className: "n" }, "Resultado"))),
        h("tbody", null, dias.map(x => [
          h("tr", { key: x.dt, className: "fi-sem-dia" + (x.dt === hoje ? " hoje" : "") + (aberto === x.dt ? " aberto" : "") + (x.it.length ? "" : " sem-mov"),
                    onClick: () => x.it.length && setAberto(aberto === x.dt ? null : x.dt), tabIndex: x.it.length ? 0 : -1,
                    onKeyDown: e => { if ((e.key === "Enter" || e.key === " ") && x.it.length) { e.preventDefault(); setAberto(aberto === x.dt ? null : x.dt); } } },
            h("td", null, h("b", null, DIAS_FI[x.i]), " ", dCurta(x.dt), x.prev ? h("small", { className: "fi-sem-prev" }, " previsto") : null),
            h("td", { className: "n" }, v(x.ent, "ent")), h("td", { className: "n" }, v(x.sai, "sai")),
            res(x.ent || x.sai ? h("span", { className: x.ent - x.sai >= 0 ? "ent" : "sai" }, BRL(x.ent - x.sai)) : h("span", { className: "fi-zero" }, "—"))),
          aberto === x.dt ? h("tr", { key: x.dt + "-i", className: "fi-sem-itens" }, h("td", { colSpan: estreito ? 3 : 4 },
            x.it.map((t, k) => h("button", { key: k, type: "button", className: "fi-sem-item " + t.situacao, disabled: !t.tituloId, onClick: () => t.tituloId && abrir(t.tituloId) },
              h("span", { className: "fi-sem-desc" }, h("b", null, t.descricao), h("small", null, [t.situacao === "realizado" ? "Realizado" : t.situacao === "vencido" ? "Vencido" : "Previsto", t.pessoa, t.categoria].filter(Boolean).join(" · "))),
              h("b", { className: t.valor >= 0 ? "ent" : "sai" }, (t.valor >= 0 ? "+" : "−") + BRL(Math.abs(t.valor))))))) : null])),
        h("tfoot", null, h("tr", null, h("td", null, "Semana"), h("td", { className: "n" }, v(s.entradas, "ent")), h("td", { className: "n" }, v(s.saidas, "sai")),
          res(h("span", { className: s.entradas - s.saidas >= 0 ? "ent" : "sai" }, BRL(s.entradas - s.saidas)))))));
  }

  /* gráfico simples de barras (entradas × saídas realizadas) */
  function Grafico({ serie, porMes }) {
    const temDado = serie.some(p => p.ent || p.sai);
    const max = Math.max(1, ...serie.map(p => Math.max(p.ent, p.sai)));
    const W = Math.max(320, serie.length * (porMes ? 46 : 18)), H = 150, base = H - 22;
    const bw = (W / serie.length) * 0.36;
    const rot = k => porMes ? ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+k.slice(5, 7) - 1] : String(+k.slice(8, 10));
    const passo = porMes ? 1 : Math.ceil(serie.length / 16);
    return h("div", { className: "bloco fi-graf" },
      h("div", { className: "bloco-cab" }, h("h2", null, "Entradas e saídas realizadas"),
        h("p", null, h("span", { className: "fi-leg ent" }, "Entradas"), " ", h("span", { className: "fi-leg sai" }, "Saídas"), porMes ? " · por mês" : " · por dia")),
      !temDado ? h("div", { className: "in-vazio", style: { padding: "18px 20px" } }, "Nenhum movimento no período.")
      : h("div", { className: "fi-graf-cx" }, h("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": "Gráfico de entradas e saídas" },
          h("line", { x1: 0, x2: W, y1: base, y2: base, className: "fi-eixo" }),
          serie.map((p, i) => {
            const x = (i + 0.5) * (W / serie.length);
            const he = (p.ent / max) * (base - 8), hs = (p.sai / max) * (base - 8);
            return h("g", { key: p.k },
              h("title", null, (porMes ? p.k : dBR(p.k)) + ": entradas " + BRL(p.ent) + " · saídas " + BRL(p.sai)),
              p.ent ? h("rect", { x: x - bw - 1, y: base - he, width: bw, height: Math.max(1, he), rx: 2, className: "fi-b-ent" }) : null,
              p.sai ? h("rect", { x: x + 1, y: base - hs, width: bw, height: Math.max(1, hs), rx: 2, className: "fi-b-sai" }) : null,
              i % passo === 0 ? h("text", { x, y: H - 6, textAnchor: "middle", className: "fi-rot" }, rot(p.k)) : null);
          }))));
  }

  /* ---------------- listas de títulos ---------------- */
  function ListaTitulos({ tipo, op, versao, abrir, novo }) {
    const [filtro, setFiltro] = useState("abertos");
    const [busca, setBusca] = useState("");
    const [cat, setCat] = useState("");
    const [de, setDe] = useState("");
    const [ate, setAte] = useState("");
    const [pagina, setPagina] = useState(1);
    const [est, setEst] = useState({ carregando: true, dados: null, erro: "" });
    const [baixando, setBaixando] = useState(null);
    const [ajuste, setAjuste] = useState(null);   /* v1.38.0: movimento avulso aberto para ajustar */
    const n = useRef(0);
    function carregar() {
      const k = ++n.current;
      setEst(e => Object.assign({}, e, { carregando: true, erro: "" }));
      api("fin.titulos.listar", { tipo, filtro, busca: busca.trim(), categoriaId: cat, de, ate, pagina, comAvulsos: 1 }).then(
        dd => { if (k === n.current) setEst({ carregando: false, dados: dd, erro: "" }); },
        e => { if (k === n.current) setEst({ carregando: false, dados: null, erro: e.message }); });
    }
    useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [filtro, busca, cat, de, ate, pagina, versao]); // eslint-disable-line
    useEffect(() => setPagina(1), [filtro, busca, cat, de, ate]);
    const d = est.dados;
    const fs = [["abertos", "Em aberto"], ["vencidos", "Vencidos"], ["semvenc", "Sem vencimento"], ["quitados", tipo === "receber" ? "Recebidos" : "Pagos"], ["cancelados", "Cancelados"], ["todos", "Todos"]];
    const cats = op.categorias.filter(c => c.tipo === (tipo === "receber" ? "receita" : "despesa"));
    const paginas = d ? Math.max(1, Math.ceil(d.total / d.porPagina)) : 1;
    return h("div", null,
      h("div", { className: "chips fi-chips" }, fs.map(([k, t]) => h("button", { key: k, type: "button", className: "chip" + (filtro === k ? " ativo" : ""), onClick: () => setFiltro(k) }, t))),
      h("div", { className: "barra fi-barra" },
        h("input", { className: "entrada-texto busca", placeholder: "Buscar descrição, " + (tipo === "receber" ? "cliente" : "fornecedor") + ", documento ou nº do chamado", value: busca, onChange: e => setBusca(e.target.value) }),
        h("select", { className: "entrada-texto", value: cat, onChange: e => setCat(e.target.value), "aria-label": "Categoria" },
          h("option", { value: "" }, "Todas as categorias"), optsCat(op, tipo === "receber" ? "receita" : "despesa", null, true)),
        h("label", { className: "fi-data" }, h("span", null, filtro === "quitados" ? (tipo === "receber" ? "Recebido de" : "Pago de") : filtro === "todos" ? "Data de" : "Vence de"), h("input", { type: "date", className: "entrada-texto", value: de, onChange: e => setDe(e.target.value) })),
        h("label", { className: "fi-data" }, h("span", null, "até"), h("input", { type: "date", className: "entrada-texto", value: ate, onChange: e => setAte(e.target.value) }))),
      est.erro ? h(Aviso, null, est.erro) : null,
      !d ? h("div", { className: "bloco vazio" }, "Carregando…")
      : h("div", { className: "bloco", style: { opacity: est.carregando ? .6 : 1 } },
          h("div", { className: "fi-tot" }, h("span", null, d.total + (d.total === 1 ? " lançamento" : " lançamentos") + (d.totalAvulsos ? " · " + d.totalAvulsos + " lançado(s) direto do extrato" : "")),
            h("span", null, "Total " + BRL(d.somaValor) + (d.somaSaldo ? " · falta " + BRL(d.somaSaldo) : ""))),
          !d.itens.length ? h("div", { className: "vazio" }, h("strong", null, "Nada aqui."), filtro === "abertos" ? "Lance uma conta " + (tipo === "receber" ? "a receber" : "a pagar") + " pelo botão acima." : "Mude o filtro.")
          : h("div", { className: "fi-lista" }, d.itens.map(t => t.origem === "movimento" ? itemAvulso(t) : h("div", { key: "t" + t.id, className: "fi-item" + (t.vencido ? " vencido" : "") + (t.status === "cancelado" ? " cancelado" : "") },
              h("button", { type: "button", className: "fi-item-l", onClick: () => abrir(t.id) },
                h("span", { className: "fi-venc" + (t.vencido ? " atrasada" : "") }, t.semVencimento ? "sem data" : (t.vencido ? "⚠ " : "") + dBR(t.status === "quitado" ? t.quitadoEm : t.vencimento)),
                h("span", { className: "fi-desc" }, h("b", null, t.descricao),
                  h("span", null, [t.semVencimento ? "⚠ definir vencimento" : null, t.pessoa, t.categoria, t.chamadoNumero ? "chamado " + t.chamadoNumero : null, t.contratoNumero ? "contrato " + t.contratoNumero : null, t.vinculo ? "🔗 " + t.vinculo : null, t.anexosQtd ? "📎 " + t.anexosQtd : null].filter(Boolean).join(" · "))),
                h("span", { className: "fi-valor" },
                  h("b", { className: tipo === "receber" ? "ent" : "sai" }, BRL(t.status === "parcial" ? t.saldo : t.valor)),
                  t.status === "parcial" ? h("small", null, "de " + BRL(t.valor)) : h("span", { className: "selo " + SELO[t.status] }, STATUS[t.status]))),
              (t.status === "aberto" || t.status === "parcial") ? h("button", { type: "button", className: "bt bt-p fi-baixar", onClick: () => setBaixando(t) }, tipo === "receber" ? "Receber" : "Pagar") : null))),
          paginas > 1 ? h("div", { className: "paginacao" }, h("span", null, "Página " + pagina + " de " + paginas),
            h("span", { style: { display: "flex", gap: 6 } },
              h("button", { className: "bt bt-p", disabled: pagina <= 1, onClick: () => setPagina(pagina - 1) }, "Anterior"),
              h("button", { className: "bt bt-p", disabled: pagina >= paginas, onClick: () => setPagina(pagina + 1) }, "Próxima"))) : null),
      baixando ? h(FormBaixa, { t: baixando, op, aoFechar: () => setBaixando(null), aoSalvar: () => { setBaixando(null); carregar(); } }) : null,
      ajuste ? h(FormAjusteMov, { op, mov: ajuste, aoFechar: () => setAjuste(null), aoSalvar: () => { setAjuste(null); carregar(); } }) : null);

    /* v1.38.0: lançamento avulso (feito direto do extrato, tarifa, ajuste) — abre "Ajustar lançamento" */
    function itemAvulso(m) {
      const abrirAj = () => setAjuste({ id: m.id, tipo: m.tipo, valor: m.valor, data: m.data, categoriaId: m.categoriaId, centroId: m.centroId, descricao: m.descricao,
        xt: m.vinculoTipo, xid: m.vinculoId, servico: m.vinculo, pessoa: m.conta });
      return h("div", { key: "m" + m.id, className: "fi-item fi-avulso" },
        h("button", { type: "button", className: "fi-item-l", onClick: abrirAj, title: "Ajustar categoria, centro, descrição ou serviço ligado" },
          h("span", { className: "fi-venc" }, dBR(m.data)),
          h("span", { className: "fi-desc" }, h("b", null, m.descricao || "—"),
            h("span", null, ["extrato · " + (m.conta || "conta"), m.categoria || "⚠ sem categoria", m.centro, m.vinculo ? "🔗 " + m.vinculo : null].filter(Boolean).join(" · "))),
          h("span", { className: "fi-valor" },
            h("b", { className: tipo === "receber" ? "ent" : "sai" }, BRL(m.valor)),
            h("span", { className: "selo os-cinza", title: "Lançado direto do extrato (não é conta a pagar/receber)" }, tipo === "receber" ? "Recebido · avulso" : "Pago · avulso"))),
        h("button", { type: "button", className: "bt bt-leve bt-p fi-baixar", onClick: abrirAj }, "Ajustar"));
    }
  }

  /* ---------------- formulário do título ---------------- */
  function EscolhePessoa({ tipo, valor, aoEscolher }) {
    const [txt, setTxt] = useState("");
    const [l, setL] = useState([]);
    const [aberto, setAberto] = useState(false);
    useEffect(() => {
      if (!aberto) return;
      const t = setTimeout(() => api("fin.pessoas", { tipo, busca: txt.trim() }).then(setL, () => setL([])), 220);
      return () => clearTimeout(t);
    }, [txt, aberto, tipo]);
    if (valor && valor.id && !aberto) return h("div", { className: "fi-pessoa" }, h("b", null, valor.nome),
      h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => { setAberto(true); setTxt(""); } }, "Trocar"),
      h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => aoEscolher(null) }, "Tirar"));
    return h("div", { className: "fi-pessoa-busca" },
      h("input", { className: "entrada-texto", placeholder: tipo === "receber" ? "Buscar cliente (nome, nº ou CNPJ)" : "Buscar fornecedor (nome ou CNPJ)", value: txt,
        onFocus: () => setAberto(true), onChange: e => { setTxt(e.target.value); setAberto(true); } }),
      aberto && l.length ? h("div", { className: "fi-sug" }, l.map(p => h("button", { key: p.id, type: "button", onClick: () => { aoEscolher(p); setAberto(false); } },
        h("b", null, p.nome), p.sub ? h("small", null, p.sub) : null))) : null,
      aberto && txt.trim().length > 1 && !l.length ? h("small", { className: "cel-sub" }, tipo === "pagar" ? "Nenhum fornecedor encontrado. Cadastre em Cadastros › Fornecedores." : "Nenhum cliente encontrado.") : null);
  }

  /* v1.27.0: foto do celular vira JPEG leve antes de subir (foto grande ou HEIC do iPhone falhavam) */
  async function prepArq(a) {
    if (!a || !/^image\//.test(a.type || "") || !(K.OS && K.OS.comprimir)) return a;
    try { const b = await K.OS.comprimir(a); return b && b !== a && b.size ? new File([b], (a.name || "foto").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : a; } catch (e) { return a; }
  }
  function FormTitulo({ op, tipo, titulo, aoFechar, aoSalvar }) {
    const t = titulo || {};
    const novo = !t.id;
    const doChamado = t.origemTipo === "chamado" && !t.importado;   /* v1.23.0: valor vem do orçamento do chamado */
    const [f, setF] = useState({
      descricao: t.descricao || "", valor: valTxt(t.valor), competencia: t.competencia || hojeISO(), vencimento: t.vencimento || "",
      categoriaId: t.categoriaId || "", centroId: t.centroId || "", contaId: t.contaId || "", forma: t.forma || "", documento: t.documento || "", obs: t.obs || "",
      parcelas: "1", pessoa: t.clienteId || t.fornecedorId ? { id: t.clienteId || t.fornecedorId, nome: t.pessoa } : null,
      comNota: t.comNota === true ? "1" : t.comNota === false ? "0" : (t.origemTipo && t.origemTipo !== "manual" ? "" : "0"),   /* v1.25.1 */
      vinc: vincDe(t),   /* v1.25.3 */
    });
    const ligadoPelaOrigem = t.origemTipo === "chamado" || t.origemTipo === "contrato";
    const daOrigem = t.origemTipo && t.origemTipo !== "manual";
    const rotOrigem = { chamado: "o chamado", contrato: "o contrato", recorrencia: "a receita fixa" }[t.origemTipo] || "a origem";
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    /* v1.27.0: lançar já pago/recebido e com o arquivo (nota, boleto, comprovante) no mesmo passo */
    const contasAtivas = op.contas.filter(c => c.ativa);
    const [pg, setPg] = useState({ ja: false, data: hojeISO(), contaId: t.contaId || (contasAtivas[0] && contasAtivas[0].id) || "" });
    const [arqs, setArqs] = useState([]);
    /* v1.27.0: a mesma chave em todas as tentativas — toque duplo ou internet lenta não lançam duas vezes */
    const chave = React.useRef("ft" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    const ocupado = React.useRef(false);
    const mudar = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    const cats = op.categorias.filter(c => c.ativa && c.tipo === (tipo === "receber" ? "receita" : "despesa"));
    const parc = Math.max(1, Math.min(60, parseInt(f.parcelas, 10) || 1));
    const vNum = Number(String(f.valor).replace(/\./g, "").replace(",", ".")) || 0;
    const podePagoJa = novo && parc === 1;
    async function salvar(forcar) {
      if (ocupado.current) return;
      setErro("");
      if (!f.descricao.trim()) return setErro("Informe a descrição.");
      if (!(vNum > 0)) return setErro("Informe o valor.");
      if (!f.categoriaId) return setErro("Escolha a categoria (ela decide a linha da DRE).");
      const jaPago = podePagoJa && pg.ja;
      if (jaPago && !pg.contaId) return setErro("Escolha a conta em que o dinheiro " + (tipo === "receber" ? "entrou." : "saiu."));
      ocupado.current = true; setEnviando(true);
      const dados = { _sync: chave.current, id: t.id, tipo, descricao: f.descricao, valor: f.valor, competencia: f.competencia, vencimento: f.vencimento || (jaPago ? pg.data : ""), categoriaId: f.categoriaId,
        centroId: f.centroId, contaId: f.contaId || (jaPago ? pg.contaId : ""), forma: f.forma, documento: f.documento, obs: f.obs, parcelas: novo ? parc : 1, forcar: forcar ? 1 : 0,
        comNota: tipo === "receber" ? (f.comNota === "" ? null : f.comNota === "1" ? 1 : 0) : null };
      if (jaPago) Object.assign(dados, { jaPago: 1, pagoEm: pg.data, pagoConta: pg.contaId });
      if (op.temVinculo && !ligadoPelaOrigem) dados.vinculo = f.vinc ? f.vinc.valor : "";
      if (tipo === "receber") dados.clienteId = f.pessoa ? f.pessoa.id : 0; else dados.fornecedorId = f.pessoa ? f.pessoa.id : 0;
      try {
        const r = await api("fin.titulo.salvar", dados);
        if (r && r._duplicado) { K.avisar("Este lançamento já tinha sido salvo."); return aoSalvar(null); }
        const id = novo ? r.ids[0] : r.id;
        let falhou = 0;
        for (let i = 0; i < arqs.length; i++) {
          setEnviando("Enviando arquivo " + (i + 1) + " de " + arqs.length + "…");
          try { await K.enviarArquivo("fin.titulo.anexo.enviar", await prepArq(arqs[i]), { id }); } catch (x) { falhou++; }
        }
        K.avisar((novo ? (parc > 1 ? parc + " parcelas lançadas" : jaPago ? (tipo === "receber" ? "Lançado e recebido" : "Lançado e pago") : "Lançado") : "Alterações salvas") +
          (arqs.length ? (falhou ? " · " + falhou + " arquivo(s) não subiram — anexe pelo lançamento." : " · arquivo anexado") : "") + ".", !!falhou);
        aoSalvar(novo ? (falhou ? id : null) : id);
      } catch (x) {
        ocupado.current = false; setEnviando(false);
        if (x.codigo === "DUPLICADO" && await K.confirmar({ titulo: "Parece repetido", texto: x.message, botao: "Lançar mesmo assim" })) return salvar(true);
        setErro(x.message);
      }
    }
    const addArqs = fl => setArqs(l => l.concat(Array.from(fl || [])).slice(0, 10));
    return h(Painel, {
      titulo: (novo ? "Nova conta " : "Editar conta ") + (tipo === "receber" ? "a receber" : "a pagar"), largo: true, aoFechar,
      sub: novo ? "Vira previsão no fluxo. Só entra no saldo quando você registrar o " + (tipo === "receber" ? "recebimento." : "pagamento.") : t.descricao,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", onClick: () => salvar(false), disabled: !!enviando }, enviando ? (typeof enviando === "string" ? enviando : "Salvando…")
                 : novo && parc > 1 ? "Lançar " + parc + " parcelas" : podePagoJa && pg.ja ? (tipo === "receber" ? "Salvar como recebido" : "Salvar como pago") : "Salvar")],
    },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Descrição" }, h(Texto, { valor: f.descricao, aoMudar: mudar("descricao"), autoFocus: novo, placeholder: tipo === "receber" ? "Ex.: Instalação 3 máquinas — chamado 612" : "Ex.: Tubos de cobre Frigelar" })),
      h("div", { className: "campo" }, h("span", null, tipo === "receber" ? "Cliente" : "Fornecedor"),
        h(EscolhePessoa, { tipo, valor: f.pessoa, aoEscolher: p => setF(x => Object.assign({}, x, { pessoa: p, categoriaId: x.categoriaId || (p && p.categoriaId) || "" })) })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: novo && parc > 1 ? "Valor total" : "Valor", dica: doChamado ? "Vem do chamado " + t.chamadoNumero + ": mude pelo orçamento." : novo && parc > 1 && vNum ? parc + " × " + BRL(vNum / parc) : null },
          h(Texto, { valor: f.valor, aoMudar: v => mudar("valor")(numTxt(v)), inputMode: "decimal", placeholder: "0,00", disabled: doChamado })),
        h(Campo, { rotulo: novo && parc > 1 ? "Vencimento da 1ª parcela" : "Vencimento", dica: "Pode deixar em branco e definir depois." }, h(Texto, { valor: f.vencimento, aoMudar: mudar("vencimento"), type: "date" })),
        novo ? h(Campo, { rotulo: "Parcelas", dica: "Mensais, a partir do vencimento." }, h(Texto, { valor: f.parcelas, aoMudar: v => mudar("parcelas")(v.replace(/\D/g, "").slice(0, 2)), inputMode: "numeric" })) : null),
      h("div", { className: "linha-campos" },
        h(SelectCategoria, { op, tipo: tipo === "receber" ? "receita" : "despesa", valor: f.categoriaId, aoMudar: mudar("categoriaId"), dica: "Decide em qual linha da DRE entra." }),
        h(Campo, { rotulo: "Competência", dica: "Mês a que pertence (DRE)." }, h(Texto, { valor: f.competencia, aoMudar: mudar("competencia"), type: "date" }))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Conta prevista" }, h("select", { value: f.contaId, onChange: e => mudar("contaId")(e.target.value) }, h("option", { value: "" }, "—"),
          op.contas.filter(c => c.ativa).map(c => h("option", { key: c.id, value: c.id }, c.nome)))),
        h(Campo, { rotulo: "Forma" }, h("select", { value: f.forma, onChange: e => mudar("forma")(e.target.value) }, h("option", { value: "" }, "—"), op.formas.map(x => h("option", { key: x, value: x }, x)))),
        op.centros.length ? h(Campo, { rotulo: "Centro de custo" }, h("select", { value: f.centroId, onChange: e => mudar("centroId")(e.target.value) }, h("option", { value: "" }, "—"),
          op.centros.filter(c => c.ativo).map(c => h("option", { key: c.id, value: c.id }, c.nome)))) : null),
      tipo === "receber" ? h(Campo, { rotulo: "Nota fiscal", dica: "Só receita com nota entra na provisão de impostos." },
        h("select", { value: f.comNota, onChange: e => mudar("comNota")(e.target.value) },
          daOrigem ? h("option", { value: "" }, "Conforme " + rotOrigem + (t.notaEfetiva != null ? (t.comNota == null ? (t.notaEfetiva ? " (com nota)" : " (sem nota)") : "") : "")) : null,
          h("option", { value: "1" }, "Com nota fiscal"), h("option", { value: "0" }, "Sem nota fiscal"))) : null,
      ligadoPelaOrigem ? (op.temVinculo ? h("div", { className: "campo" }, h("span", null, "Chamado ou contrato"), h("b", null, "🔗 " + (t.chamadoNumero ? "Chamado " + t.chamadoNumero : "Contrato " + (t.contratoNumero || ""))),
          h("small", null, "Já ligado: este lançamento foi gerado por ele.")) : null)
        : h(CampoVinculo, { op, valor: f.vinc, aoEscolher: mudar("vinc") }),
      podePagoJa ? h("div", { className: "fi-pagoja" + (pg.ja ? " on" : "") },
        h("label", { className: "check", style: { margin: 0 } }, h("input", { type: "checkbox", checked: pg.ja, onChange: e => setPg(x => Object.assign({}, x, { ja: e.target.checked })) }),
          h("b", null, tipo === "receber" ? "Já foi recebido" : "Já foi pago"), h("span", { className: "cel-sub" }, " — registra a baixa junto, sem entrar de novo")),
        pg.ja ? h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Data" }, h(Texto, { valor: pg.data, aoMudar: v => setPg(x => Object.assign({}, x, { data: v })), type: "date" })),
          h(Campo, { rotulo: tipo === "receber" ? "Entrou na conta" : "Saiu da conta" }, h("select", { value: pg.contaId, onChange: e => setPg(x => Object.assign({}, x, { contaId: e.target.value })) },
            !contasAtivas.length ? h("option", { value: "" }, "Cadastre uma conta antes") : null,
            contasAtivas.map(c => h("option", { key: c.id, value: c.id }, c.nome))))) : null) : null,
      h("div", { className: "campo" }, h("span", null, "Nota, boleto ou comprovante (opcional)"),
        h("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } },
          h("label", { className: "bt bt-p" }, "📷 Câmera", h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onChange: e => { addArqs(e.target.files); e.target.value = ""; } })),
          h("label", { className: "bt bt-p" }, "📎 Arquivo (foto ou PDF)", h("input", { type: "file", multiple: true, accept: "image/*,application/pdf,.docx,.xlsx", hidden: true, onChange: e => { addArqs(e.target.files); e.target.value = ""; } }))),
        arqs.length ? h("div", { className: "fi-arqs" }, arqs.map((a, i) => h("span", { key: i, className: "chip" }, a.name || "foto",
          h("button", { type: "button", className: "bt bt-leve bt-p", "aria-label": "Tirar", onClick: () => setArqs(l => l.filter((x, j) => j !== i)) }, "×")))) : null,
        h("small", null, novo ? "Sobe junto quando você salvar." : "Sobe junto ao salvar (os arquivos já anexados continuam no lançamento).")),
      h(Campo, { rotulo: "Documento (opcional)", dica: "Nº da nota, boleto, contrato…" }, h(Texto, { valor: f.documento, aoMudar: mudar("documento") })),
      h(Campo, { rotulo: "Observação (opcional)" }, h("textarea", { value: f.obs, onChange: e => mudar("obs")(e.target.value), rows: 2 })));
  }

  /* ---------------- baixa ---------------- */
  function FormBaixa({ t, op, aoFechar, aoSalvar }) {
    const contas = op.contas.filter(c => c.ativa);
    const [f, setF] = useState({ valor: valTxt(t.saldo), data: hojeISO(), contaId: t.contaId || (contas[0] && contas[0].id) || "", obs: "" });
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const rec = t.tipo === "receber";
    async function salvar() {
      setErro(""); setEnviando(true);
      try { await api("fin.titulo.baixar", Object.assign({ id: t.id }, f)); K.avisar(rec ? "Recebimento registrado." : "Pagamento registrado."); aoSalvar(); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: rec ? "Registrar recebimento" : "Registrar pagamento", sub: t.descricao + " · falta " + BRL(t.saldo), aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando || !contas.length }, enviando ? "Salvando…" : "Confirmar")] },
      !contas.length ? h(Aviso, null, "Cadastre uma conta (aba Contas) antes de registrar.") : null,
      h(Aviso, null, erro),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Valor", dica: "Menor que o total = baixa parcial." }, h(Texto, { valor: f.valor, aoMudar: v => setF(x => Object.assign({}, x, { valor: numTxt(v) })), inputMode: "decimal", autoFocus: true })),
        h(Campo, { rotulo: "Data" }, h(Texto, { valor: f.data, aoMudar: v => setF(x => Object.assign({}, x, { data: v })), type: "date" }))),
      h(Campo, { rotulo: rec ? "Entrou na conta" : "Saiu da conta" }, h("select", { value: f.contaId, onChange: e => setF(x => Object.assign({}, x, { contaId: e.target.value })) },
        contas.map(c => h("option", { key: c.id, value: c.id }, c.nome)))),
      h(Campo, { rotulo: "Observação (opcional)" }, h(Texto, { valor: f.obs, aoMudar: v => setF(x => Object.assign({}, x, { obs: v })) })));
  }

  /* ---------------- detalhe do título ---------------- */
  /* v1.25.3: chamado em aberto ou contrato ativo, opcional */
  function EscolheVinculo({ valor, aoEscolher, encerrados }) {
    const [txt, setTxt] = useState("");
    const [l, setL] = useState(null);
    const [aberto, setAberto] = useState(false);
    useEffect(() => {
      if (!aberto) return;
      const t = setTimeout(() => api("fin.vinculos.buscar", { busca: txt.trim(), encerrados: encerrados ? 1 : 0 }).then(setL, () => setL([])), 220);   /* v1.37.0 */
      return () => clearTimeout(t);
    }, [txt, aberto]);
    if (valor && valor.valor && !aberto) return h("div", { className: "fi-pessoa" }, h("b", null, "🔗 " + (valor.nome || valor.valor)),
      h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => { setAberto(true); setTxt(""); } }, "Trocar"),
      h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => aoEscolher(null) }, "Tirar"));
    return h("div", { className: "fi-pessoa-busca" },
      h("div", { style: { display: "flex", gap: 6 } },
        h("input", { className: "entrada-texto", placeholder: "Nº do chamado ou nome do cliente", value: txt, style: { flex: 1 },
          onFocus: () => setAberto(true), onChange: e => { setTxt(e.target.value); setAberto(true); } }),
        aberto && valor && valor.valor ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setAberto(false) }, "Manter") : null),
      aberto && l && l.length ? h("div", { className: "fi-sug" }, l.map(p => h("button", { key: p.valor, type: "button", onClick: () => { aoEscolher(p); setAberto(false); setTxt(""); } },
        h("b", null, p.nome), p.sub ? h("small", null, p.sub) : null))) : null,
      aberto && l && !l.length ? h("small", { className: "cel-sub" }, encerrados ? "Nenhum chamado ou contrato encontrado." : "Nenhum chamado em aberto ou contrato ativo encontrado.") : null);
  }
  function CampoVinculo({ op, valor, aoEscolher, dica, encerrados }) {
    if (!op.temVinculo) return null;
    return h("div", { className: "campo" }, h("span", null, "Chamado ou contrato (opcional)"), h(EscolheVinculo, { valor, aoEscolher, encerrados }),
      h("small", null, dica || "Liga este lançamento a um chamado em aberto ou contrato ativo (entra na Rentabilidade)."));
  }
  const vincDe = x => x && x.vinculoTipo ? { valor: x.vinculoTipo + ":" + x.vinculoId, nome: x.vinculo } : null;

  /* v1.25.3: categoria com "+ Nova" — cria sem sair do formulário (antes era preciso ir a Cadastros e perder o que estava fazendo) */
  function SelectCategoria({ op, tipo, valor, aoMudar, rotulo, dica }) {
    const temMacro = op.temSubcategoria && op.categorias.some(c => !c.paiId && c.ativa && c.tipo === tipo);
    const [nova, setNova] = useState(false);
    return h("div", { className: "campo" }, h("span", null, rotulo || (op.temSubcategoria ? "Plano de contas" : "Categoria")),
      h("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
        h("select", { value: valor, onChange: e => aoMudar(e.target.value), style: { flex: 1, minWidth: 0 } }, h("option", { value: "" }, "Escolha…"),
          optsLanc(op, tipo, valor)),
        h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setNova(true), title: "Criar categoria sem sair daqui" }, "+ Nova")),
      dica ? h("small", null, dica) : null,
      nova ? h(FormCategoria, { c: temMacro ? { tipo, _plano: true } : { tipo }, op, travarTipo: true, aoFechar: () => setNova(false),
        aoSalvar: async id => { setNova(false); await recarregarOp(); if (id) aoMudar(String(id)); } }) : null);
  }

  function DetalheTitulo({ id, op, aoFechar, aoEditar }) {
    const [t, setT] = useState(null);
    const [erro, setErro] = useState("");
    const [baixando, setBaixando] = useState(false);
    const [cancelando, setCancelando] = useState(false);
    const [enviando, setEnviando] = useState(0);
    function carregar() { api("fin.titulo.obter", { id }).then(setT, e => setErro(e.message)); }
    useEffect(carregar, [id]);
    async function acao(nome, dados, ok) {
      try { await api(nome, dados); if (ok) K.avisar(ok); carregar(); } catch (x) { K.avisar(x.message, true); }
    }
    async function estornar(b) {
      if (!(await K.confirmar({ titulo: "Estornar esta baixa?", texto: BRL(b.valor) + " em " + dBR(b.data) + ". O valor volta a ficar em aberto e sai do saldo da conta. Fica registrado no histórico.", botao: "Estornar", perigo: true }))) return;
      acao("fin.baixa.estornar", { movimentoId: b.id }, "Baixa estornada.");
    }
    async function excluir() {
      if (!(await K.confirmar({ titulo: "Excluir este lançamento?", texto: "Use só para lançamento feito por engano. Fica registrado na auditoria.", botao: "Excluir", perigo: true }))) return;
      try { await api("fin.titulo.excluir", { id }); K.avisar("Lançamento excluído."); aoFechar(); } catch (x) { K.avisar(x.message, true); }
    }
    async function anexar(e) {
      const arqs = Array.from(e.target.files || []); e.target.value = "";
      for (const a of arqs) {
        setEnviando(n => n + 1);
        try { await K.enviarArquivo("fin.titulo.anexo.enviar", await prepArq(a), { id }); } catch (x) { K.avisar(x.message, true); }
        setEnviando(n => n - 1);
      }
      carregar();
    }
    if (erro) return h(Painel, { titulo: "Lançamento", aoFechar }, h(Aviso, null, erro));
    if (!t) return h(Painel, { titulo: "Lançamento", aoFechar, largo: true }, h("div", { className: "vazio" }, "Carregando…"));
    const rec = t.tipo === "receber";
    const aberto = t.status === "aberto" || t.status === "parcial";
    const rodape = [];
    if (t.origemTipo === "manual" && !t.baixas.length) rodape.push(h("button", { key: "x", className: "bt bt-leve bt-perigo", style: { marginRight: "auto" }, onClick: excluir }, "Excluir"));
    if (aberto && !t.pago) rodape.push(h("button", { key: "can", className: "bt bt-leve", onClick: () => setCancelando(true) }, "Cancelar lançamento"));
    if (t.status === "cancelado") rodape.push(h("button", { key: "re", className: "bt", onClick: () => acao("fin.titulo.reabrir", { id }, "Lançamento reaberto.") }, "Reabrir"));
    if (t.status !== "cancelado") rodape.push(h("button", { key: "e", className: "bt", onClick: () => aoEditar(t) }, "Editar"));
    if (aberto) rodape.push(h("button", { key: "b", className: "bt bt-marca", onClick: () => setBaixando(true) }, rec ? "Registrar recebimento" : "Registrar pagamento"));
    else rodape.push(h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar"));
    return h(Painel, { titulo: t.descricao, sub: (rec ? "A receber" : "A pagar") + (t.pessoa ? " · " + t.pessoa : ""), largo: true, aoFechar, rodape },
      h("div", { className: "fi-det-topo" },
        h("div", null, h("span", null, rec ? "Valor a receber" : "Valor a pagar"), h("b", { className: rec ? "ent" : "sai" }, BRL(t.valor))),
        h("div", null, h("span", null, rec ? "Recebido" : "Pago"), h("b", null, BRL(t.pago))),
        h("div", null, h("span", null, "Falta"), h("b", null, BRL(t.saldo))),
        h("div", null, h("span", null, "Situação"), h("span", { className: "selo " + SELO[t.status] }, STATUS[t.status] + (t.vencido ? " · vencido" : "")))),
      h("div", { className: "tf-info" },
        h("div", null, h("span", null, "Vencimento"), h("b", { className: t.vencido ? "atrasada" : "" }, t.vencimento ? dBR(t.vencimento) : "a definir")),
        h("div", null, h("span", null, "Competência"), h("b", null, dBR(t.competencia))),
        h("div", null, h("span", null, "Categoria"), h("b", null, t.categoria || "—")),
        t.centro ? h("div", null, h("span", null, "Centro de custo"), h("b", null, t.centro)) : null,
        h("div", null, h("span", null, "Conta prevista"), h("b", null, t.conta || "—")),
        t.forma ? h("div", null, h("span", null, "Forma"), h("b", null, t.forma)) : null,
        t.documento ? h("div", null, h("span", null, "Documento"), h("b", null, t.documento)) : null,
        t.parcelas > 1 ? h("div", null, h("span", null, "Parcela"), h("b", null, t.parcela + " de " + t.parcelas)) : null,
        t.vinculo ? h("div", null, h("span", null, "Chamado / contrato"), h("b", null, t.vinculo)) : null,
        h("div", null, h("span", null, "Origem"), h("b", null, t.origemTipo === "manual" ? "Lançado à mão" : t.chamadoNumero ? "Chamado " + t.chamadoNumero + (t.importado ? " (saldo importado)" : "") : t.contratoNumero ? "Mensalidade do contrato " + t.contratoNumero : t.origemTipo === "recorrencia" ? "Recorrente" : t.origemTipo))),
      t.obs ? h("div", { className: "tf-desc" }, t.obs) : null,
      t.irmaos && t.irmaos.length > 1 ? h(React.Fragment, null, h("div", { className: "secao-titulo" }, "Parcelas"),
        h("div", { className: "fi-irmaos" }, t.irmaos.map(x => h("span", { key: x.id, className: "chip" + (x.id === t.id ? " ativo" : "") }, x.parcela + "ª · " + dCurta(x.vencimento) + " · " + BRL(x.valor) + " · " + STATUS[x.status])))) : null,
      h("div", { className: "secao-titulo" }, rec ? "Recebimentos" : "Pagamentos"),
      t.baixas.length ? h("div", { className: "fi-baixas" }, t.baixas.map(b => h("div", { key: b.id, className: "fi-baixa" + (b.estornado ? " estornada" : "") },
        h("span", null, dBR(b.data)), h("b", null, BRL(b.valor)), h("span", { className: "cel-sub" }, b.conta + (b.estornado ? " · estornada" : b.conciliado ? " · conciliada" : "")),
        !b.estornado && !b.conciliado ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => estornar(b) }, "Estornar") : null)))
      : h("div", { className: "cel-sub" }, "Nada " + (rec ? "recebido" : "pago") + " ainda."),
      h("div", { className: "secao-titulo" }, "Arquivos" + (t.anexos.length ? " · " + t.anexos.length : "")),
      t.anexos.map(a => h("div", { key: a.id, className: "fi-anexo" },
        h("a", { href: K.urlAnexo(a.id), target: "_blank", rel: "noopener" }, "📎 " + (a.nome || "arquivo")),
        h("button", { type: "button", className: "bt bt-leve bt-p", onClick: async () => { if (await K.confirmar({ titulo: "Remover o arquivo?", botao: "Remover", perigo: true })) acao("fin.titulo.anexo.excluir", { anexoId: a.id }, "Arquivo removido."); } }, "Remover"))),
      enviando ? h("span", { className: "bt bt-p disabled" }, "Enviando…")
      : h("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
          h("label", { className: "bt bt-p" }, "📷 Câmera", h("input", { type: "file", accept: "image/*", capture: "environment", onChange: anexar, hidden: true })),
          h("label", { className: "bt bt-p" }, "📎 Anexar nota, boleto ou comprovante", h("input", { type: "file", multiple: true, accept: "image/*,application/pdf,.docx,.xlsx", onChange: anexar, hidden: true }))),
      h("div", { className: "secao-titulo" }, "Histórico"),
      t.eventos.map((e, i) => h("div", { key: i, className: "os-evento" }, h("div", { className: "cel-sub" }, K.dataHora(e.em) + (e.quem ? " · " + e.quem : "")), h("div", null, e.texto))),
      baixando ? h(FormBaixa, { t, op, aoFechar: () => setBaixando(false), aoSalvar: () => { setBaixando(false); carregar(); } }) : null,
      cancelando ? h(FormMotivo, { titulo: "Cancelar lançamento", aoFechar: () => setCancelando(false),
        aoConfirmar: async m => { try { await api("fin.titulo.cancelar", { id, motivo: m }); K.avisar("Lançamento cancelado."); setCancelando(false); carregar(); } catch (x) { K.avisar(x.message, true); } } }) : null);
  }

  function FormMotivo({ titulo, aoFechar, aoConfirmar }) {
    const [m, setM] = useState("");
    return h(Painel, { titulo, aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Voltar"), h("button", { key: "s", className: "bt bt-marca", disabled: m.trim().length < 3, onClick: () => aoConfirmar(m.trim()) }, "Confirmar")] },
      h(Campo, { rotulo: "Motivo", dica: "Fica no histórico do lançamento." }, h("textarea", { value: m, onChange: e => setM(e.target.value), rows: 3, autoFocus: true })));
  }

  /* ---------------- movimento avulso e transferência ---------------- */
  function FormMovimento({ op, aoFechar, aoSalvar }) {
    const contas = op.contas.filter(c => c.ativa);
    const [f, setF] = useState({ contaId: (contas[0] && contas[0].id) || "", data: hojeISO(), sentido: "saida", valor: "", categoriaId: "", centroId: "", descricao: "" });
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    const cats = op.categorias.filter(c => c.ativa && c.tipo === (f.sentido === "entrada" ? "receita" : "despesa"));
    async function salvar() {
      setErro(""); setEnviando(true);
      try { await api("fin.movimento.salvar", Object.assign({}, f, { vinc: undefined, vinculo: f.vinc ? f.vinc.valor : "" })); K.avisar("Movimento lançado."); aoSalvar(); } catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: "Tarifa, rendimento ou ajuste", sub: "Movimento que já aconteceu na conta e não tem conta a pagar/receber (ex.: tarifa do banco).", aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Lançar")] },
      h(Aviso, null, erro),
      h("div", { className: "chips", style: { marginBottom: 12 } },
        h("button", { type: "button", className: "chip" + (f.sentido === "saida" ? " ativo" : ""), onClick: () => setF(x => Object.assign({}, x, { sentido: "saida", categoriaId: "" })) }, "Saída"),
        h("button", { type: "button", className: "chip" + (f.sentido === "entrada" ? " ativo" : ""), onClick: () => setF(x => Object.assign({}, x, { sentido: "entrada", categoriaId: "" })) }, "Entrada")),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Conta" }, h("select", { value: f.contaId, onChange: e => mudar("contaId")(e.target.value) }, contas.map(c => h("option", { key: c.id, value: c.id }, c.nome)))),
        h(Campo, { rotulo: "Data" }, h(Texto, { valor: f.data, aoMudar: mudar("data"), type: "date" })),
        h(Campo, { rotulo: "Valor" }, h(Texto, { valor: f.valor, aoMudar: v => mudar("valor")(numTxt(v)), inputMode: "decimal" }))),
      h(SelectCategoria, { op, tipo: f.sentido === "entrada" ? "receita" : "despesa", valor: f.categoriaId, aoMudar: mudar("categoriaId") }),
      op.centros.length ? h(Campo, { rotulo: "Centro de custo" }, h("select", { value: f.centroId, onChange: e => mudar("centroId")(e.target.value) }, h("option", { value: "" }, "—"), op.centros.filter(c => c.ativo).map(c => h("option", { key: c.id, value: c.id }, c.nome)))) : null,
      h(Campo, { rotulo: "Descrição" }, h(Texto, { valor: f.descricao, aoMudar: mudar("descricao"), placeholder: "Ex.: Tarifa Pix" })),
      h(CampoVinculo, { op, valor: f.vinc, aoEscolher: mudar("vinc") }));
  }

  function FormTransferencia({ op, aoFechar, aoSalvar, inicial, bancos, titulo }) {
    const pagaFatura = !!(inicial && inicial.fatura);
    const contas = pagaFatura ? (bancos || []) : op.contas.filter(c => c.ativa);
    const [f, setF] = useState(Object.assign({ deId: (contas[0] && contas[0].id) || "", paraId: (contas[1] && contas[1].id) || "", valor: "", data: hojeISO(), descricao: "" }, inicial || {}));
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    async function salvar() {
      setErro(""); setEnviando(true);
      try { await api("fin.transferir", f); K.avisar("Transferência registrada."); aoSalvar(); } catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: titulo || "Transferência entre contas", sub: pagaFatura ? "Sai do banco e quita a fatura do cartão. Não entra como despesa de novo (as compras já entraram)." : "Não é receita nem despesa: só muda o dinheiro de lugar (ex.: banco → caixa, pagar a fatura do cartão).", aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Transferir")] },
      h(Aviso, null, erro),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "De" }, h("select", { value: f.deId, onChange: e => mudar("deId")(e.target.value) }, contas.map(c => h("option", { key: c.id, value: c.id }, c.nome)))),
        pagaFatura ? null : h(Campo, { rotulo: "Para" }, h("select", { value: f.paraId, onChange: e => mudar("paraId")(e.target.value) }, contas.map(c => h("option", { key: c.id, value: c.id }, c.nome))))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Valor" }, h(Texto, { valor: f.valor, aoMudar: v => mudar("valor")(numTxt(v)), inputMode: "decimal" })),
        h(Campo, { rotulo: "Data" }, h(Texto, { valor: f.data, aoMudar: mudar("data"), type: "date" }))),
      h(Campo, { rotulo: "Descrição (opcional)" }, h(Texto, { valor: f.descricao, aoMudar: mudar("descricao") })));
  }

  /* ---------------- contas ---------------- */
  function Contas({ op, mudou, extrato }) {
    const [ed, setEd] = useState(null);
    const [fat, setFat] = useState(null);
    return h("div", null,
      h("div", { className: "barra" }, h("p", { className: "cel-sub", style: { margin: 0, flex: 1 } }, "O saldo de cada conta = saldo inicial + o que foi recebido, pago e lançado a partir daquela data."),
        h("button", { className: "bt bt-marca", onClick: () => setEd({}) }, "Nova conta")),
      /* v1.39.0: sem a estrutura do cartão no banco, limite e dias não são guardados — avisa */
      op.temCartao === false ? h("div", { className: "aviso aviso-info" }, "Cartão de crédito: o banco de dados ainda não tem a estrutura para guardar limite, melhor dia de compra e vencimento. Peça ao administrador para rodar o SQL da versão 1.39.0.") : null,
      h("div", { className: "bloco" },
        !op.contas.length ? h("div", { className: "vazio" }, h("strong", null, "Nenhuma conta ainda."), "Cadastre a conta do banco e o caixa com o saldo de hoje.")
        : h("div", { className: "fi-lista" }, op.contas.map(c => h("div", { key: c.id, className: "fi-item" + (c.ativa ? "" : " cancelado") },
            h("button", { type: "button", className: "fi-item-l", onClick: () => extrato(c) },
              h("span", { className: "fi-venc" }, c.tipoNome),
              h("span", { className: "fi-desc" }, h("b", null, c.nome + (c.ativa ? "" : " (inativa)")), h("span", null, [c.banco, c.agencia && "ag. " + c.agencia, c.numero && "cc " + c.numero].filter(Boolean).join(" · ") || "saldo inicial " + BRL(c.saldoInicial) + " em " + dBR(c.saldoInicialEm))),
              h("span", { className: "fi-valor" }, h("b", { className: c.saldo < 0 ? "sai" : "" }, BRL(c.saldo)), h("small", null, "saldo hoje"))),
            c.tipo === "cartao" ? h("div", { className: "fi-cartao-info" },
              c.limite != null ? h("span", null, "Limite " + BRL(c.limite) + " · disponível ", h("b", { className: c.disponivel < 0 ? "sai" : "ent" }, BRL(c.disponivel))) : null,
              c.faturaAtual ? h("span", null, "Fatura atual (vence " + dBR(c.faturaAtual.vencimento) + "): ", h("b", null, BRL(c.faturaAtual.saldo))) : h("span", { className: "sai" }, "Defina o melhor dia de compra e o vencimento (Editar)."),
              c.faturaFechada ? h("span", { className: "sai" }, "Fechada a pagar: " + BRL(c.faturaFechada.saldo) + " · vence " + dBR(c.faturaFechada.vencimento)) : null,
              c.faturaAtual ? h("button", { type: "button", className: "bt bt-p", onClick: () => setFat(c) }, "Faturas") : null) : null,
            h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => setEd(c) }, "Editar"))))),
      ed ? h(FormConta, { c: ed, op, aoFechar: () => setEd(null), aoSalvar: () => { setEd(null); mudou(); } }) : null,
      fat ? h(Faturas, { conta: fat, mudou, aoFechar: () => { setFat(null); mudou(); } }) : null);
  }
  function FormConta({ c, op, aoFechar, aoSalvar }) {
    const [f, setF] = useState({ nome: c.nome || "", tipo: c.tipo || "banco", banco: c.banco || "", agencia: c.agencia || "", numero: c.numero || "",
      saldoInicial: c.id ? valTxt(c.saldoInicial) : "", saldoInicialEm: c.saldoInicialEm || hojeISO(), ativa: c.id ? c.ativa : true,
      limite: valTxt(c.limite), diaMelhorCompra: c.diaMelhorCompra ? String(c.diaMelhorCompra) : "", diaVencimento: c.diaVencimento ? String(c.diaVencimento) : "" });
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    async function salvar() {
      setErro(""); setEnviando(true);
      try { await api("fin.conta.salvar", Object.assign({ id: c.id }, f)); K.avisar("Conta salva."); aoSalvar(); } catch (x) { setErro(x.message); setEnviando(false); }
    }
    async function excluir() {
      if (!(await K.confirmar({ titulo: "Excluir a conta " + c.nome + "?", texto: "Se já tiver movimento, ela só fica inativa (o histórico continua).", botao: "Excluir", perigo: true }))) return;
      try { const r = await api("fin.conta.excluir", { id: c.id }); K.avisar(r.inativada ? "Conta inativada." : "Conta excluída."); aoSalvar(); } catch (x) { K.avisar(x.message, true); }
    }
    return h(Painel, { titulo: c.id ? "Editar conta" : "Nova conta", aoFechar,
      rodape: [c.id ? h("button", { key: "x", className: "bt bt-leve bt-perigo", style: { marginRight: "auto" }, onClick: excluir }, "Excluir") : null,
               h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Nome", dica: "Ex.: Cora PJ, Caixa da empresa, Cartão Clara" }, h(Texto, { valor: f.nome, aoMudar: mudar("nome"), autoFocus: !c.id })),
      h(Campo, { rotulo: "Tipo" }, h("select", { value: f.tipo, onChange: e => mudar("tipo")(e.target.value) }, Object.keys(op.tiposConta).map(k => h("option", { key: k, value: k }, op.tiposConta[k])))),
      f.tipo === "banco" || f.tipo === "aplicacao" ? h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Banco" }, h(Texto, { valor: f.banco, aoMudar: mudar("banco") })),
        h(Campo, { rotulo: "Agência" }, h(Texto, { valor: f.agencia, aoMudar: mudar("agencia") })),
        h(Campo, { rotulo: "Conta" }, h(Texto, { valor: f.numero, aoMudar: mudar("numero") }))) : null,
      f.tipo === "cartao" ? h(React.Fragment, null,
        op.temCartao === false ? h("div", { className: "aviso aviso-info" }, "Falta rodar o SQL da versão 1.39.0 no banco de dados: sem ele o cartão não pode ser salvo com limite e dias.") : null,
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Limite (R$)" }, h(Texto, { valor: f.limite, aoMudar: v => mudar("limite")(numTxt(v)), inputMode: "decimal", placeholder: "0,00" })),
          h(Campo, { rotulo: "Melhor dia de compra", dica: "Comprou a partir deste dia, vai para a fatura seguinte." }, h(Texto, { valor: f.diaMelhorCompra, aoMudar: v => mudar("diaMelhorCompra")(v.replace(/\D/g, "").slice(0, 2)), inputMode: "numeric", placeholder: "Ex.: 28" })),
          h(Campo, { rotulo: "Vencimento da fatura (dia)" }, h(Texto, { valor: f.diaVencimento, aoMudar: v => mudar("diaVencimento")(v.replace(/\D/g, "").slice(0, 2)), inputMode: "numeric", placeholder: "Ex.: 5" }))),
        h(Campo, { rotulo: "Banco / bandeira (opcional)" }, h(Texto, { valor: f.banco, aoMudar: mudar("banco"), placeholder: "Ex.: Clara, Cora" }))) : null,
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Saldo inicial", dica: f.tipo === "cartao" ? "Fatura em aberto: use valor negativo (ex.: -1.250,00)." : "O saldo no começo do dia escolhido ao lado." },
          h(Texto, { valor: f.saldoInicial, aoMudar: v => mudar("saldoInicial")(numTxt(v)), inputMode: "decimal" })),
        h(Campo, { rotulo: "Na data de" }, h(Texto, { valor: f.saldoInicialEm, aoMudar: mudar("saldoInicialEm"), type: "date" }))),
      c.id ? h("label", { className: "check" }, h("input", { type: "checkbox", checked: f.ativa, onChange: e => mudar("ativa")(e.target.checked) }), "Conta ativa") : null);
  }

  function Extrato({ conta, op, aoFechar, abrir }) {
    const [p, setP] = useState({ tipo: "mes" });
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    /* v1.28.2: ordem (crescente/decrescente) e saldo do dia, como no extrato do banco — para conferir dia a dia */
    const [ordem, setOrdem] = useState(() => { try { return localStorage.getItem("k-extrato-ordem") || "desc"; } catch (e) { return "desc"; } });
    const mudarOrdem = o => { setOrdem(o); try { localStorage.setItem("k-extrato-ordem", o); } catch (e) {} };
    const per = periodoDe(p);
    function carregar() { setErro(""); api("fin.movimentos.listar", { contaId: conta.id, de: per.de, ate: per.ate }).then(setD, e => setErro(e.message)); }
    useEffect(carregar, [per.de, per.ate]); // eslint-disable-line
    async function estornar(m) {
      if (!(await K.confirmar({ titulo: "Estornar este movimento?", texto: BRL(m.valor) + " · " + m.descricao + (m.transferencia ? " (os dois lados da transferência)" : ""), botao: "Estornar", perigo: true }))) return;
      try { await api("fin.movimento.estornar", { id: m.id }); K.avisar("Movimento estornado."); carregar(); } catch (x) { K.avisar(x.message, true); }
    }
    /* agrupa por dia (os itens vêm em ordem crescente, com o saldo corrido em m.saldo) */
    const dias = [];
    let entTot = 0, saiTot = 0;
    (d && d.itens || []).forEach(m => {
      const k = String(m.data).slice(0, 10);
      let g = dias[dias.length - 1];
      if (!g || g.data !== k) { g = { data: k, itens: [], ent: 0, sai: 0, saldo: 0 }; dias.push(g); }
      g.itens.push(m);
      if (m.valor >= 0) { g.ent += m.valor; entTot += m.valor; } else { g.sai += m.valor; saiTot += m.valor; }
      g.saldo = m.saldo;
    });
    const desc = ordem === "desc";
    const lista = desc ? dias.slice().reverse().map(g => Object.assign({}, g, { itens: g.itens.slice().reverse() })) : dias;
    const dataLonga = s => { const [a, m, dd] = s.split("-"); return dd + "/" + m + "/" + a; };
    const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    return h(Painel, { titulo: "Extrato · " + conta.nome, sub: "Movimentos registrados no sistema, com o saldo de cada dia para conferir com o extrato do banco.", largo: true, aoFechar,
      rodape: [h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      h(Periodo, { p, setP }),
      erro ? h(Aviso, null, erro) : null,
      !d ? h("div", { className: "vazio" }, "Carregando…")
      : h(React.Fragment, null,
          h("div", { className: "fi-ext-resumo" },
            h("div", null, h("span", null, "Saldo inicial"), h("b", null, BRL(d.saldoAnterior))),
            h("div", null, h("span", null, "Entradas"), h("b", { className: "ent" }, "+" + BRL(entTot))),
            h("div", null, h("span", null, "Saídas"), h("b", { className: "sai" }, BRL(saiTot))),
            h("div", null, h("span", null, "Saldo final"), h("b", null, BRL(d.saldoFinal)))),
          h("div", { className: "fi-ext-ordem" }, h("span", null, "Ordem"),
            h("button", { type: "button", className: "chip" + (desc ? " ativo" : ""), onClick: () => mudarOrdem("desc") }, "↓ Mais recentes primeiro"),
            h("button", { type: "button", className: "chip" + (!desc ? " ativo" : ""), onClick: () => mudarOrdem("asc") }, "↑ Mais antigos primeiro")),
          !d.itens.length ? h("div", { className: "vazio" }, "Nenhum movimento no período.")
          : h("div", { className: "fi-extrato" }, lista.map(g => h(React.Fragment, { key: g.data },
              h("div", { className: "fi-ext-dia" },
                h("b", null, dataLonga(g.data), h("small", null, " · " + SEM[new Date(g.data + "T12:00:00").getDay()])),
                h("span", { className: "fi-ext-dia-res" },
                  g.ent ? h("span", { className: "ent" }, "+" + BRL(g.ent)) : null,
                  g.sai ? h("span", { className: "sai" }, BRL(g.sai)) : null,
                  h("span", { title: "Resultado do dia (entradas − saídas)" }, "Resultado " + (g.ent + g.sai >= 0 ? "+" : "") + BRL(g.ent + g.sai))),
                h("span", { className: "fi-ext-dia-saldo" }, "Saldo do dia ", h("b", null, BRL(g.saldo)))),
              g.itens.map(m => h("div", { key: m.id, className: "fi-mov" },
                h("span", { className: "fi-venc" }, dCurta(m.data)),
                h("span", { className: "fi-desc" }, h("b", null, m.descricao || "—"), h("span", null, [m.tipo === "transferencia" ? "transferência" : m.tipo === "avulso" ? "avulso" : null, m.categoria].filter(Boolean).join(" · "))),
                h("span", { className: "fi-valor" }, h("b", { className: m.valor >= 0 ? "ent" : "sai" }, (m.valor >= 0 ? "+" : "") + BRL(m.valor)), h("small", null, BRL(m.saldo))),
                m.tituloId ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => abrir(m.tituloId) }, "Abrir")
                : h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => estornar(m) }, "Estornar"))))))));
  }

  /* ---------------- cadastros ---------------- */
  function Cadastros({ op, mudou }) {
    const [sub, setSub] = useState("categorias");
    return h("div", null,
      h("div", { className: "chips", style: { marginBottom: 12 } }, [["categorias", "Categorias"]].concat(op.temSubcategoria ? [["planos", "Plano de contas"]] : []).concat([["recorrentes", "Recorrentes"], ["contratos", "Contratos"], ["fornecedores", "Fornecedores"], ["centros", "Centros de custo"]]).map(([k, t]) =>
        h("button", { key: k, type: "button", className: "chip" + (sub === k ? " ativo" : ""), onClick: () => setSub(k) }, t))),
      sub === "categorias" ? h(Categorias, { op, mudou }) : sub === "planos" ? h(PlanoContas, { op, mudou }) : sub === "recorrentes" ? h(Recorrentes, { op, mudou }) : sub === "contratos" ? h(ContratosCobranca, { mudou }) : sub === "centros" ? h(Centros, { op, mudou }) : h(Fornecedores, { op }));
  }
  /* v1.26.3: como no xFin — CATEGORIAS (o macro: código, indicador, faixa no DRE) e PLANO DE CONTAS (o item do lançamento, dentro de uma categoria) */
  const LINHA_CURTA = { receita_bruta: "Receitas", deducoes: "Deduções sobre vendas", custo_direto: "Custos variáveis", despesa_operacional: "Custos fixos",
                        receita_financeira: "Financeiro / não operacional", despesa_financeira: "Financeiro / não operacional", tributo_lucro: "IR e CSLL", fora_dre: "Não listar no DRE" };
  const indicador = t => t === "receita" ? "Crédito" : "Débito";
  function Categorias({ op, mudou }) {
    const [ed, setEd] = useState(null);
    const macros = op.categorias.filter(c => !c.paiId).sort(porCodigo);
    const nPlanos = id => op.categorias.filter(c => c.paiId === id && c.ativa).length;
    return h("div", null,
      h("div", { className: "fi-cad-topo" },
        h("p", { className: "cel-sub" }, "Categoria é o grupo (ex.: Despesa fixa, Receita com serviços, Gastos com pessoal). Ela diz em que faixa da DRE o valor entra. Os itens do dia a dia ficam em Plano de contas, dentro de cada categoria."),
        h("button", { className: "bt bt-marca", onClick: () => setEd({ tipo: "despesa" }) }, "Nova categoria")),
      h("div", { className: "bloco" }, !macros.length ? h("div", { className: "vazio" }, "Nenhuma categoria ainda.") : h("div", { className: "tabela-caixa" }, h("table", { className: "tabela fi-cad-t" },
        h("thead", null, h("tr", null, h("th", null, "Código"), h("th", null, "Descrição"), h("th", null, "Indicador"), h("th", null, "Faixa no DRE"), op.temSubcategoria ? h("th", { className: "num" }, "Planos") : null)),
        h("tbody", null, macros.map(c => h("tr", { key: c.id, className: "fi-cad-l" + (c.ativa ? "" : " cancelado"), onClick: () => setEd(c) },
          h("td", null, c.codigo != null ? c.codigo : "—"), h("td", null, h("b", null, c.nome), c.ativa ? null : " (inativa)"),
          h("td", null, indicador(c.tipo)), h("td", null, LINHA_CURTA[c.grupoDre] || op.gruposDre[c.grupoDre] || c.grupoDre),
          op.temSubcategoria ? h("td", { className: "num" }, nPlanos(c.id) || "—") : null)))))),
      ed ? h(FormCategoria, { c: ed, op, aoFechar: () => setEd(null), aoSalvar: () => { setEd(null); mudou(); } }) : null);
  }
  function PlanoContas({ op, mudou }) {
    const [ed, setEd] = useState(null);
    const [busca, setBusca] = useState("");
    const [cat, setCat] = useState("");
    const macros = op.categorias.filter(c => !c.paiId).sort(porCodigo);
    const b = semAc(busca.trim());
    const planos = op.categorias.filter(c => c.paiId && (!cat || String(c.paiId) === cat) && (!b || semAc(c.nome).indexOf(b) >= 0 || codCat(op, c).indexOf(busca.trim()) === 0))
      .sort((x, y) => { const px = op.categorias.find(m => m.id === x.paiId) || {}, py = op.categorias.find(m => m.id === y.paiId) || {}; return porCodigo(px, py) || porCodigo(x, y); });
    const nomeMacro = id => { const m = op.categorias.find(x => x.id === id); return m ? comCod(op, m) : "—"; };
    return h("div", null,
      h("div", { className: "fi-cad-topo" },
        h("p", { className: "cel-sub" }, "Plano de contas é o item que você escolhe no lançamento (ex.: Aluguel, Manutenção dos carros, 13º salário). Cada um fica dentro de uma categoria e segue a faixa da DRE dela."),
        h("button", { className: "bt bt-marca", disabled: !macros.length, onClick: () => setEd({ tipo: "despesa", _plano: true, paiId: cat ? Number(cat) : null }) }, "Novo plano de contas")),
      !macros.length ? h("div", { className: "bloco vazio" }, "Crie primeiro uma categoria (aba Categorias).") : h(React.Fragment, null,
        h("div", { className: "barra fi-barra" },
          h("input", { className: "entrada-texto busca", placeholder: "Pesquisar descrição ou código", value: busca, onChange: e => setBusca(e.target.value) }),
          h("select", { className: "entrada-texto", value: cat, onChange: e => setCat(e.target.value), "aria-label": "Categoria" }, h("option", { value: "" }, "Todas as categorias"),
            macros.map(m => h("option", { key: m.id, value: m.id }, comCod(op, m))))),
        h("div", { className: "bloco" }, !planos.length ? h("div", { className: "vazio" }, busca || cat ? "Nada encontrado." : "Nenhum plano de contas ainda.") : h("div", { className: "tabela-caixa" }, h("table", { className: "tabela fi-cad-t" },
          h("thead", null, h("tr", null, h("th", null, "Código"), h("th", null, "Descrição"), h("th", null, "Categoria"), h("th", null, "Indicador"))),
          h("tbody", null, planos.map(c => h("tr", { key: c.id, className: "fi-cad-l" + (c.ativa ? "" : " cancelado"), onClick: () => setEd(c) },
            h("td", null, codCat(op, c)), h("td", null, h("b", null, c.nome), c.ativa ? null : " (inativo)"), h("td", null, nomeMacro(c.paiId)), h("td", null, indicador(c.tipo)))))))),
        h("p", { className: "cel-sub" }, planos.length + " plano(s) de contas.")),
      ed ? h(FormCategoria, { c: ed, op, aoFechar: () => setEd(null), aoSalvar: () => { setEd(null); mudou(); } }) : null);
  }
  function FormCategoria({ c, op, aoFechar, aoSalvar, travarTipo }) {
    const plano = !!(c.paiId || c._plano);
    const [f, setF] = useState({ nome: c.nome || "", tipo: c.tipo || "despesa", grupoDre: c.grupoDre || (c.tipo === "receita" ? "receita_bruta" : "despesa_operacional"), ativa: c.id ? c.ativa : true,
                                 paiId: c.paiId ? String(c.paiId) : "", codigo: c.codigo != null ? String(c.codigo) : "" });
    const [erro, setErro] = useState("");
    const mudar = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    const temPlanos = !!c.id && op.categorias.some(x => x.paiId === c.id);
    const macros = op.categorias.filter(x => !x.paiId && x.id !== c.id && (x.ativa || String(x.id) === f.paiId) && (!travarTipo || x.tipo === c.tipo) && (plano || x.tipo === f.tipo)).sort(porCodigo);
    const macro = f.paiId ? op.categorias.find(x => String(x.id) === String(f.paiId)) : null;
    const linhas = LINHAS_DRE[f.tipo].concat(LINHAS_DRE[f.tipo].indexOf(f.grupoDre) < 0 ? [f.grupoDre] : []);
    const prox = pai => 1 + Math.max(0, ...op.categorias.filter(x => (pai ? String(x.paiId) === String(pai) : !x.paiId) && x.id !== c.id).map(x => x.codigo || 0));
    async function salvar() {
      setErro("");
      if (plano && !macro) return setErro("Escolha a categoria do plano de contas.");
      const dados = Object.assign({ id: c.id }, f, { paiId: f.paiId || 0, codigo: f.codigo || 0 });
      if (macro) Object.assign(dados, { tipo: macro.tipo, grupoDre: macro.grupoDre });
      try { const r = await api("fin.categoria.salvar", dados); K.avisar(plano ? "Plano de contas salvo." : "Categoria salva."); aoSalvar(r && r.id); } catch (x) { setErro(x.message); }
    }
    async function excluir() {
      if (!(await K.confirmar({ titulo: plano ? "Excluir o plano de contas?" : "Excluir a categoria?", texto: "Se já tiver lançamento, só fica inativo.", botao: "Excluir", perigo: true }))) return;
      try { const r = await api("fin.categoria.excluir", { id: c.id }); K.avisar(r.inativada ? "Ficou inativo (já tem lançamentos)." : "Excluído."); aoSalvar(); } catch (x) { K.avisar(x.message, true); }
    }
    const campoCodigo = op.temCodigo ? h(Campo, { rotulo: "Código", dica: (plano ? (macro ? "Fica " + (macro.codigo != null ? macro.codigo : "?") + "." + (f.codigo || prox(f.paiId)) + ". " : "") : "") + "Em branco = o próximo número." },
      h(Texto, { valor: f.codigo, aoMudar: v => mudar("codigo")(v.replace(/\D/g, "").slice(0, 4)), inputMode: "numeric", placeholder: String(prox(plano ? f.paiId : null)) })) : null;
    return h(Painel, { titulo: (c.id ? "Editar " : "Novo ") + (plano ? "plano de contas" : "categoria").replace(/^Novo categoria/, "Nova categoria"), aoFechar,
      rodape: [c.id ? h("button", { key: "x", className: "bt bt-leve bt-perigo", style: { marginRight: "auto" }, onClick: excluir }, "Excluir") : null,
               h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar }, "Salvar")] },
      h(Aviso, null, erro),
      plano ? h(React.Fragment, null,
        h(Campo, { rotulo: "Categoria" }, h("select", { value: f.paiId, onChange: e => mudar("paiId")(e.target.value), autoFocus: !f.paiId }, h("option", { value: "" }, "Escolha…"),
          macros.map(m => h("option", { key: m.id, value: m.id }, comCod(op, m) + " · " + indicador(m.tipo))))),
        macro ? h("small", { className: "cel-sub", style: { display: "block", marginTop: -6, marginBottom: 10 } }, indicador(macro.tipo) + " · " + (LINHA_CURTA[macro.grupoDre] || op.gruposDre[macro.grupoDre])) : null,
        h("div", { className: "linha-campos" }, campoCodigo,
          h(Campo, { rotulo: "Descrição" }, h(Texto, { valor: f.nome, aoMudar: mudar("nome"), autoFocus: !!f.paiId && !c.id, placeholder: "Ex.: Manutenção dos carros" }))))
      : h(React.Fragment, null,
        h("div", { className: "linha-campos" }, campoCodigo,
          h(Campo, { rotulo: "Descrição" }, h(Texto, { valor: f.nome, aoMudar: mudar("nome"), autoFocus: !c.id, placeholder: f.tipo === "receita" ? "Ex.: Receita com serviços" : "Ex.: Despesa fixa" }))),
        travarTipo || temPlanos ? null : h(Campo, { rotulo: "Indicador" }, h("select", { value: f.tipo, onChange: e => setF(x => Object.assign({}, x, { tipo: e.target.value, paiId: "", grupoDre: LINHAS_DRE[e.target.value].indexOf(x.grupoDre) >= 0 ? x.grupoDre : (e.target.value === "receita" ? "receita_bruta" : "despesa_operacional") })) },
          h("option", { value: "receita" }, "Crédito (entrada / receita)"), h("option", { value: "despesa" }, "Débito (saída / despesa)"))),
        h(Campo, { rotulo: "Faixa no DRE", dica: (op.gruposDica || {})[f.grupoDre] || "" },
          h("select", { value: f.grupoDre, onChange: e => mudar("grupoDre")(e.target.value) }, linhas.map(k => h("option", { key: k, value: k }, op.gruposDre[k] || k)))),
        temPlanos ? h("small", { className: "cel-sub" }, "Os planos de contas desta categoria acompanham a faixa da DRE escolhida aqui.") : null,
        /* categoria antiga que na verdade é um item: vira plano de contas de outra categoria (os lançamentos vão junto) */
        c.id && op.temSubcategoria && !temPlanos && macros.length ? h(Campo, { rotulo: "Transformar em plano de contas de… (opcional)", dica: "Use para arrumar uma categoria antiga que na verdade é um item (ex.: “Aluguel” dentro de “Despesa fixa”). Os lançamentos dela vão junto." },
          h("select", { value: f.paiId, onChange: e => mudar("paiId")(e.target.value) }, h("option", { value: "" }, "— continua sendo categoria —"), macros.map(m => h("option", { key: m.id, value: m.id }, comCod(op, m))))) : null),
      c.id ? h("label", { className: "check" }, h("input", { type: "checkbox", checked: f.ativa, onChange: e => mudar("ativa")(e.target.checked) }), plano ? "Ativo" : "Ativa") : null);
  }
  function Centros({ op, mudou }) {
    const [nome, setNome] = useState("");
    async function add() { try { await api("fin.centro.salvar", { nome }); setNome(""); mudou(); } catch (x) { K.avisar(x.message, true); } }
    async function tirar(c) { try { const r = await api("fin.centro.excluir", { id: c.id }); K.avisar(r.inativado ? "Centro inativado." : "Centro excluído."); mudou(); } catch (x) { K.avisar(x.message, true); } }
    return h("div", { className: "bloco", style: { padding: 16 } },
      h("p", { className: "cel-sub", style: { marginTop: 0 } }, "Opcional. Use para separar resultados (ex.: Contratos PMOC, Obras/Instalações, Administrativo)."),
      h("div", { style: { display: "flex", gap: 8, marginBottom: 12 } }, h("input", { className: "entrada-texto", value: nome, placeholder: "Novo centro de custo", onChange: e => setNome(e.target.value) }),
        h("button", { className: "bt bt-marca", disabled: !nome.trim(), onClick: add }, "Adicionar")),
      op.centros.length ? op.centros.map(c => h("div", { key: c.id, className: "fi-cen" }, h("span", null, c.nome + (c.ativo ? "" : " (inativo)")), h("button", { className: "bt bt-leve bt-p", onClick: () => tirar(c) }, "Excluir")))
      : h("div", { className: "cel-sub" }, "Nenhum centro de custo."));
  }
  function Fornecedores({ op }) {
    const [busca, setBusca] = useState("");
    const [l, setL] = useState(null);
    const [ed, setEd] = useState(null);
    function carregar() { api("fin.fornecedores.listar", { busca: busca.trim() }).then(setL, e => K.avisar(e.message, true)); }
    useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [busca]); // eslint-disable-line
    return h("div", null,
      h("div", { className: "barra" }, h("input", { className: "entrada-texto busca", placeholder: "Buscar fornecedor", value: busca, onChange: e => setBusca(e.target.value) }),
        h("button", { className: "bt bt-marca", onClick: () => setEd({}) }, "Novo fornecedor")),
      h("div", { className: "bloco" }, !l ? h("div", { className: "vazio" }, "Carregando…")
        : !l.length ? h("div", { className: "vazio" }, "Nenhum fornecedor.")
        : h("div", { className: "fi-lista" }, l.map(f => h("button", { key: f.id, type: "button", className: "fi-cat" + (f.ativo ? "" : " cancelado"), onClick: () => setEd(f) },
            h("b", null, f.nome), h("span", null, [f.documento, f.telefone, f.aPagar ? "a pagar " + BRL(f.aPagar) : null].filter(Boolean).join(" · ") || "—"))))),
      ed ? h(FormFornecedor, { f0: ed, op, aoFechar: () => setEd(null), aoSalvar: () => { setEd(null); carregar(); } }) : null);
  }
  function FormFornecedor({ f0, op, aoFechar, aoSalvar }) {
    const [f, setF] = useState(Object.assign({ nome: "", documento: "", email: "", telefone: "", chavePix: "", categoriaId: "", obs: "", ativo: true }, f0));
    const [erro, setErro] = useState("");
    const mudar = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    async function salvar() { setErro(""); try { await api("fin.fornecedor.salvar", f); K.avisar("Fornecedor salvo."); aoSalvar(); } catch (x) { setErro(x.message); } }
    async function excluir() {
      if (!(await K.confirmar({ titulo: "Excluir " + f0.nome + "?", texto: "Se já tiver lançamento, ele só fica inativo.", botao: "Excluir", perigo: true }))) return;
      try { await api("fin.fornecedor.excluir", { id: f0.id }); aoSalvar(); } catch (x) { K.avisar(x.message, true); }
    }
    return h(Painel, { titulo: f0.id ? "Editar fornecedor" : "Novo fornecedor", aoFechar,
      rodape: [f0.id ? h("button", { key: "x", className: "bt bt-leve bt-perigo", style: { marginRight: "auto" }, onClick: excluir }, "Excluir") : null,
               h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar }, "Salvar")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Nome" }, h(Texto, { valor: f.nome, aoMudar: mudar("nome"), autoFocus: !f0.id })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "CPF/CNPJ" }, h(Texto, { valor: f.documento, aoMudar: mudar("documento"), inputMode: "numeric" })),
        h(Campo, { rotulo: "Telefone" }, h(Texto, { valor: f.telefone, aoMudar: mudar("telefone"), inputMode: "tel" }))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "E-mail" }, h(Texto, { valor: f.email, aoMudar: mudar("email"), type: "email" })),
        h(Campo, { rotulo: "Chave Pix" }, h(Texto, { valor: f.chavePix, aoMudar: mudar("chavePix") }))),
      h(Campo, { rotulo: "Categoria padrão", dica: "Já vem escolhida ao lançar conta deste fornecedor." },
        h("select", { value: f.categoriaId || "", onChange: e => mudar("categoriaId")(e.target.value) }, h("option", { value: "" }, "—"),
          optsLanc(op, "despesa", f.categoriaId))),
      h(Campo, { rotulo: "Observação" }, h("textarea", { value: f.obs || "", onChange: e => mudar("obs")(e.target.value), rows: 2 })),
      f0.id ? h("label", { className: "check" }, h("input", { type: "checkbox", checked: f.ativo, onChange: e => mudar("ativo")(e.target.checked) }), "Ativo") : null);
  }

  /* ---------------- ajustes ---------------- */
  function Ajustes({ op, mudou }) {
    const c = op.config;
    const [f, setF] = useState({ provisaoPct: String(c.provisaoPct).replace(".", ","), provisaoBase: c.provisaoBase, avisoDias: String(c.avisoDias) });
    const [erro, setErro] = useState("");
    async function salvar() { setErro(""); try { await api("fin.config.salvar", f); K.avisar("Ajustes salvos."); mudou(); } catch (x) { setErro(x.message); } }
    return h("div", { className: "bloco", style: { padding: 18, maxWidth: 720 } },
      h("h2", { style: { marginTop: 0, fontSize: 16 } }, "Impostos"),
      h("div", { className: "fi-impostos" },
        h("p", null, h("b", null, "1. Imposto cobrado do cliente"), " — o % do orçamento. É parte do preço e entra na receita."),
        h("p", null, h("b", null, "2. Impostos da nota"), " — ISS e retenções de cada nota (chegam com o módulo de notas). Retenção reduz o valor a receber."),
        h("p", null, h("b", null, "3. Imposto que a empresa paga"), " — todo mês entra uma ", h("b", null, "provisão"), " (o % abaixo sobre o faturamento) para a DRE já mostrar o resultado. Quando o contador apurar, você lança a guia real (DAS) em A pagar, e ela substitui a provisão daquele mês.")),
      h(Aviso, null, erro),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Provisão de impostos (%)", dica: "Use a alíquota efetiva que o contador passar (ex.: Simples ≈ 6%)." },
          h(Texto, { valor: f.provisaoPct, aoMudar: v => setF(x => Object.assign({}, x, { provisaoPct: numTxt(v) })), inputMode: "decimal" })),
        h(Campo, { rotulo: "Sobre" }, h("select", { value: f.provisaoBase, onChange: e => setF(x => Object.assign({}, x, { provisaoBase: e.target.value })) },
          h("option", { value: "faturamento" }, "Faturamento do mês (competência)"), h("option", { value: "recebimento" }, "Recebimentos do mês (caixa)")))),
      h(Campo, { rotulo: "Avisar vencimentos com quantos dias de antecedência" }, h(Texto, { valor: f.avisoDias, aoMudar: v => setF(x => Object.assign({}, x, { avisoDias: v.replace(/\D/g, "").slice(0, 2) })), inputMode: "numeric" })),
      h("button", { className: "bt bt-marca", onClick: salvar }, "Salvar ajustes"),
      h("p", { className: "cel-sub", style: { marginBottom: 0 } }, "A provisão e a comparação com as guias reais ficam em DRE › Impostos do mês. Os avisos de vencimento chegam com as rotinas agendadas."),
      h(ImportarChamados, { mudou }));
  }

  /* v1.23.0: importação única dos saldos a receber dos chamados ganhos antes do Financeiro */
  function ImportarChamados({ mudou }) {
    const [p, setP] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    async function conferir() { setOcupado(true); try { setP(await api("fin.importar_chamados", { simular: 1 })); } catch (x) { K.avisar(x.message, true); } setOcupado(false); }
    async function importar() {
      if (!(await K.confirmar({ titulo: "Importar " + p.itens.length + " saldo(s)?", texto: "Cada chamado vira um lançamento a receber de " + "saldo, sem vencimento. Chamados já ligados ao Financeiro ficam de fora. Pode rodar de novo depois sem duplicar.", botao: "Importar" }))) return;
      setOcupado(true);
      try { const r = await api("fin.importar_chamados", {}); K.avisar(r.importados + " chamado(s) importado(s)."); setP(null); mudou(); } catch (x) { K.avisar(x.message, true); }
      setOcupado(false);
    }
    return h("div", { style: { borderTop: "1px solid var(--linha-2)", marginTop: 18, paddingTop: 14 } },
      h("h2", { style: { marginTop: 0, fontSize: 16 } }, "Chamados ganhos antes do Financeiro"),
      h("p", { className: "cel-sub", style: { marginTop: 0 } }, "Traz para A receber o saldo (valor − recebido) dos chamados ganhos que ainda não têm parcelas aqui. Chamados aprovados daqui em diante entram sozinhos."),
      !p ? h("button", { className: "bt", disabled: ocupado, onClick: conferir }, ocupado ? "Conferindo…" : "Conferir chamados")
      : !p.itens.length ? h("div", { className: "cel-sub" }, "Nenhum chamado ganho com saldo fora do Financeiro.")
      : h(React.Fragment, null,
          h("div", { className: "fi-tot", style: { padding: "8px 0" } }, h("span", null, p.itens.length + " chamado(s)"), h("b", null, "Saldo " + BRL(p.total))),
          h("div", { className: "fi-imp-l" }, p.itens.map(c => h("div", { key: c.id, className: "fi-cen" }, h("span", null, "Chamado " + c.numero + " · " + (c.cliente || "") + " · " + c.status),
            h("b", null, BRL(c.saldo))))),
          h("div", { style: { display: "flex", gap: 8, marginTop: 10 } }, h("button", { className: "bt", onClick: () => setP(null) }, "Cancelar"),
            h("button", { className: "bt bt-marca", disabled: ocupado, onClick: importar }, ocupado ? "Importando…" : "Importar saldos"))));
  }


  /* =====================================================================
     v1.24.0 — FLUXO DE CAIXA
     ===================================================================== */
  const MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const rotMes = k => MES3[+k.slice(5, 7) - 1] + "/" + k.slice(2, 4);
  function Fluxo({ op, versao, abrir }) {
    const [modo, setModo] = useState("diario");
    const [p, setP] = useState({ tipo: "mes" });
    const [conta, setConta] = useState("");
    const [cat, setCat] = useState("");
    const [todos, setTodos] = useState(true);
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [det, setDet] = useState(null);
    const per = periodoDe(p);
    useEffect(() => {
      if (modo !== "diario") return;
      setErro("");
      api("fin.fluxo", { modo: "diario", de: per.de, ate: per.ate, contaId: conta, categoriaId: cat }).then(setD, e => setErro(e.message));
    }, [modo, per.de, per.ate, conta, cat, versao]); // eslint-disable-line
    const chipsModo = h("div", { className: "chips", style: { marginBottom: 8 } },
      h("button", { type: "button", className: "chip" + (modo === "diario" ? " ativo" : ""), onClick: () => setModo("diario") }, "Diário"),
      h("button", { type: "button", className: "chip" + (modo === "mensal" ? " ativo" : ""), onClick: () => setModo("mensal") }, "Mensal"));
    if (modo === "mensal") return h(FluxoMensal, { op, versao, abrir, chipsModo });

    const linhas = !d ? [] : !todos ? d.linhas.filter(l => l.entReal || l.saiReal || l.entPrev || l.saiPrev || l.hoje) : d.linhas;
    const n = (x, cls) => h("td", { className: "num " + (cls || "") }, Number(x || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const temSaldo = d && d.saldoInicial != null;
    /* realizado: só o que passou pelas contas · projetado: realizado + em aberto pelo vencimento (vencidos no dia de hoje) */
    const tabela = (titulo, sub, saldoIni, get) => h("div", { className: "bloco fi-fx-lado" },
      h("div", { className: "fi-fx-cab" }, h("div", null, h("h2", null, titulo), h("p", null, sub)),
        temSaldo ? h("div", { className: "fi-fx-ini" }, h("small", null, "Saldo final do período anterior"), h("b", { className: saldoIni < 0 ? "sai" : "" }, BRL(saldoIni))) : null),
      h("div", { className: "tabela-caixa" }, h("table", { className: "tabela fi-fluxo" },
        h("thead", null, h("tr", null, h("th", null, "Dia"), h("th", { className: "num" }, "Entradas"), h("th", { className: "num" }, "Saídas"), h("th", { className: "num" }, "Saldo do dia"),
          temSaldo ? h("th", { className: "num" }, "Saldo acumulado") : null)),
        h("tbody", null, linhas.map(l => { const x = get(l); return h("tr", { key: l.k, className: (l.hoje ? "fi-hoje " : "") + (l.passado ? "fi-passado" : ""), onClick: () => setDet(l.k), style: { cursor: "pointer" } },
          h("td", null, dCurta(l.k) + (l.hoje ? " · hoje" : "")), n(x.e, "ent"), n(x.s, "sai"), n(x.e - x.s, x.e - x.s < 0 ? "sai" : x.e - x.s > 0 ? "ent" : ""),
          temSaldo ? h("td", { className: "num" + (x.saldo != null && x.saldo < 0 ? " sai" : "") }, x.saldo == null ? h("span", { className: "fi-zero" }, "—") : h("b", null, valTxt(x.saldo))) : null); })))));
    return h("div", null,
      h("div", { className: "fi-filtros" },
        h("div", null, chipsModo, h(Periodo, { p, setP })),
        h("div", { className: "fi-sel" },
          h("select", { className: "entrada-texto", value: conta, onChange: e => setConta(e.target.value), "aria-label": "Conta" }, h("option", { value: "" }, "Caixa da empresa (todas as contas)"),
            op.contas.filter(c => c.ativa).map(c => h("option", { key: c.id, value: c.id }, c.nome))),
          h("select", { className: "entrada-texto", value: cat, onChange: e => setCat(e.target.value), "aria-label": "Categoria" }, h("option", { value: "" }, "Todas as categorias"),
            h("optgroup", { label: "Receitas" }, optsCat(op, "receita", null, true)), h("optgroup", { label: "Despesas" }, optsCat(op, "despesa", null, true))))),
      erro ? h(Aviso, null, erro) : null,
      !d ? h("div", { className: "bloco vazio" }, "Carregando…") : h(React.Fragment, null,
        d.filtrado ? h("div", { className: "cel-sub", style: { marginBottom: 8 } }, "Com filtro de categoria o saldo não é mostrado (ele considera tudo).") : null,
        (d.semVencimento.ent || d.semVencimento.sai) ? h("div", { className: "aviso aviso-info" }, "Fora do fluxo por falta de vencimento: a receber " + BRL(d.semVencimento.ent) + " · a pagar " + BRL(d.semVencimento.sai) + ". Defina as datas em A receber / A pagar › Sem vencimento.") : null,
        h("div", { className: "fi-fx-barra" }, h("span", null, dBR(d.de) + " a " + dBR(d.ate)),
          h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setTodos(!todos) }, todos ? "Só dias com movimento" : "Mostrar todos os dias")),
        h("div", { className: "fi-fx-duas" },
          tabela("Realizado", "O que entrou e saiu das contas.", d.saldoInicial, l => ({ e: l.entReal, s: l.saiReal, saldo: l.saldoReal })),
          tabela("Projetado", "Realizado + em aberto e faturas, pelo vencimento.", d.saldoInicial,
            l => ({ e: l.entReal + l.entPrev, s: l.saiReal + l.saiPrev, saldo: l.saldoProj }))),
        !linhas.length ? h("div", { className: "vazio" }, "Nada no período.") : null,
        h("p", { className: "cel-sub" }, "Vencidos em aberto aparecem no dia de hoje. Compra no cartão sai do caixa no vencimento da fatura. Toque num dia para ver os lançamentos.")),
      det ? h(DetalheFluxo, { chave: det, mensal: false, conta, aoFechar: () => setDet(null), abrir }) : null);
  }

  /* fluxo mensal por categoria — realizado ou projetado (como planilha) */
  function FluxoMensal({ versao, abrir, chipsModo }) {
    const [tipo, setTipo] = useState("projetado");
    const [pm, setPm] = useState({ tipo: "ano" });
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [det, setDet] = useState(null);
    const per = mesesDe(pm);
    useEffect(() => { setErro(""); setD(null); api("fin.fluxo.categorias", { de: per.de, ate: per.ate, tipo }).then(setD, e => setErro(e.message)); }, [tipo, per.de, per.ate, versao]); // eslint-disable-line
    const v = x => x ? valTxt(x) : h("span", { className: "fi-zero" }, "—");
    function exportar() {
      const sep = ";", fmt = x => Number(x || 0).toFixed(2).replace(".", ",");
      const L = [["Fluxo de caixa " + (d.tipo === "projetado" ? "projetado" : "realizado")].concat(d.meses.map(rotMesLongo)).concat(["Total"])];
      L.push(["SALDO INICIAL"].concat(d.saldoInicial.map(fmt)).concat([""]));
      L.push(["ENTRADAS"].concat(d.totalEntradas.map(fmt)).concat([fmt(d.totalEntradas.reduce((a, b) => a + b, 0))]));
      d.entradas.forEach(x => L.push([x.rotulo].concat(x.valores.map(fmt)).concat([fmt(x.total)])));
      L.push(["SAÍDAS"].concat(d.totalSaidas.map(fmt)).concat([fmt(d.totalSaidas.reduce((a, b) => a + b, 0))]));
      d.saidas.forEach(x => L.push([x.rotulo].concat(x.valores.map(fmt)).concat([fmt(x.total)])));
      L.push(["RESULTADO DO MÊS"].concat(d.meses.map((m, i) => fmt(d.totalEntradas[i] - d.totalSaidas[i]))).concat([""]));
      L.push(["SALDO FINAL"].concat(d.saldoFinal.map(fmt)).concat([""]));
      const csv = "﻿" + L.map(r => r.map(c => /[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(sep)).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = "fluxo_" + d.tipo + "_" + d.meses[0] + "_a_" + d.meses[d.meses.length - 1] + ".csv";
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    const linhaGrupo = (rot, vals, cls) => h("tr", { className: cls }, h("td", null, rot), vals.map((x, i) => h("td", { key: i, className: "num" }, valTxt(x))), h("td", { className: "num" }, valTxt(vals.reduce((a, b) => a + b, 0))));
    const linhaCat = x => h("tr", { key: x.k, className: "fi-fm-cat" }, h("td", null, x.rotulo), x.valores.map((y, i) => h("td", { key: i, className: "num" }, v(y))), h("td", { className: "num" }, v(x.total)));
    return h("div", null,
      h("div", { className: "fi-filtros" },
        h("div", null, chipsModo,
          h("div", { className: "chips", style: { marginBottom: 8 } },
            h("button", { type: "button", className: "chip" + (tipo === "realizado" ? " ativo" : ""), onClick: () => setTipo("realizado") }, "Realizado"),
            h("button", { type: "button", className: "chip" + (tipo === "projetado" ? " ativo" : ""), onClick: () => setTipo("projetado") }, "Projetado")),
          h(PeriodoMeses, { pm, setPm })),
        d ? h("div", { className: "fi-sel" }, h("button", { className: "bt", onClick: exportar }, "Exportar para Excel")) : null),
      erro ? h(Aviso, null, erro) : null,
      !d ? h("div", { className: "bloco vazio" }, erro ? "" : "Carregando…") : h(React.Fragment, null,
        h("p", { className: "cel-sub", style: { marginTop: 0 } }, d.tipo === "projetado"
          ? "Projetado: o que já entrou e saiu + contas a receber e a pagar em aberto pelo vencimento (vencidos no mês atual) + faturas de cartão."
          : "Realizado: só o que passou pelas contas (caixa da empresa). Compra no cartão entra quando a fatura é paga."),
        h(GraficoFluxo, { linhas: d.meses.map((m, i) => ({ k: m, entReal: d.totalEntradas[i], entPrev: 0, saiReal: d.totalSaidas[i], saiPrev: 0, saldoProj: d.saldoFinal[i] })) }),
        h("div", { className: "bloco" }, h("div", { className: "tabela-caixa" }, h("table", { className: "tabela fi-fm" },
          h("thead", null, h("tr", null, h("th", null, "Fluxo de caixa"), d.meses.map(m => h("th", { key: m, className: "num" + (m === d.mesAtual ? " fi-fm-hoje" : m > d.mesAtual ? " fi-futuro" : ""), onClick: () => setDet(m), style: { cursor: "pointer" } }, rotMes(m))),
            h("th", { className: "num" }, "Total"))),
          h("tbody", null,
            h("tr", { className: "fi-fm-saldo" }, h("td", null, "SALDO INICIAL"), d.saldoInicial.map((x, i) => h("td", { key: i, className: "num" }, valTxt(x))), h("td", null, "")),
            linhaGrupo("ENTRADAS", d.totalEntradas, "fi-fm-ent"), d.entradas.map(linhaCat),
            linhaGrupo("SAÍDAS", d.totalSaidas, "fi-fm-sai"), d.saidas.map(linhaCat),
            h("tr", { className: "fi-fm-res" }, h("td", null, "RESULTADO DO MÊS"), d.meses.map((m, i) => { const r = d.totalEntradas[i] - d.totalSaidas[i]; return h("td", { key: i, className: "num" + (r < 0 ? " sai" : "") }, valTxt(r)); }), h("td", null, "")),
            h("tr", { className: "fi-fm-saldo" }, h("td", null, "SALDO FINAL"), d.saldoFinal.map((x, i) => h("td", { key: i, className: "num" + (x < 0 ? " sai" : "") }, valTxt(x))), h("td", null, "")))))),
        h("p", { className: "cel-sub" }, "Toque no mês (cabeçalho) para ver os lançamentos. A linha de cada valor vem da categoria; pagamento de fatura aparece em \"Faturas de cartão\".")),
      det ? h(DetalheFluxo, { chave: det, mensal: true, conta: "", aoFechar: () => setDet(null), abrir }) : null);
  }
  function GraficoFluxo({ linhas }) {
    const W = Math.max(320, linhas.length * 64), H = 170, base = H - 24;
    const vals = linhas.map(l => [l.entReal + l.entPrev, l.saiReal + l.saiPrev]);
    const max = Math.max(1, ...vals.flat());
    const sp = linhas.map(l => l.saldoProj).filter(x => x != null);
    const smax = Math.max(1, ...sp.map(Math.abs));
    const bw = W / linhas.length * 0.3;
    const y = vv => base - (vv / max) * (base - 14);
    const ys = vv => base / 2 + 4 - (vv / smax) * (base / 2 - 10);
    return h("div", { className: "bloco fi-graf", style: { marginBottom: 14 } },
      h("div", { className: "bloco-cab" }, h("h2", null, "Mês a mês"), h("p", null, h("span", { className: "fi-leg ent" }, "Entradas"), " ", h("span", { className: "fi-leg sai" }, "Saídas"), " · cheio = realizado, claro = previsto")),
      h("div", { className: "fi-graf-cx" }, h("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": "Entradas e saídas por mês" },
        h("line", { x1: 0, x2: W, y1: base, y2: base, className: "fi-eixo" }),
        linhas.map((l, i) => {
          const x = (i + 0.5) * (W / linhas.length);
          return h("g", { key: l.k },
            h("title", null, rotMes(l.k) + ": entradas " + BRL(l.entReal) + " (+ previstas " + BRL(l.entPrev) + ") · saídas " + BRL(l.saiReal) + " (+ previstas " + BRL(l.saiPrev) + ")"),
            h("rect", { x: x - bw - 2, y: y(l.entReal), width: bw, height: base - y(l.entReal), className: "fi-b-ent" }),
            h("rect", { x: x - bw - 2, y: y(l.entReal + l.entPrev), width: bw, height: y(l.entReal) - y(l.entReal + l.entPrev), className: "fi-b-ent fi-b-prev" }),
            h("rect", { x: x + 2, y: y(l.saiReal), width: bw, height: base - y(l.saiReal), className: "fi-b-sai" }),
            h("rect", { x: x + 2, y: y(l.saiReal + l.saiPrev), width: bw, height: y(l.saiReal) - y(l.saiReal + l.saiPrev), className: "fi-b-sai fi-b-prev" }),
            h("text", { x, y: H - 6, textAnchor: "middle", className: "fi-rot" }, rotMes(l.k)));
        }))));
  }
  function DetalheFluxo({ chave, mensal, conta, aoFechar, abrir }) {
    const [d, setD] = useState(null);
    useEffect(() => { api("fin.fluxo.detalhe", mensal ? { mes: chave, contaId: conta } : { data: chave, contaId: conta }).then(setD, e => K.avisar(e.message, true)); }, [chave]); // eslint-disable-line
    return h(Painel, { titulo: mensal ? rotMes(chave) : dBR(chave), sub: "O que compõe o fluxo neste " + (mensal ? "mês" : "dia"), aoFechar, largo: true,
      rodape: [h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      !d ? h("div", { className: "vazio" }, "Carregando…") : h(React.Fragment, null,
        h("div", { className: "secao-titulo" }, "Realizado (" + d.movimentos.length + ")"),
        d.movimentos.length ? d.movimentos.map(m => h("div", { key: m.id, className: "fi-mov" }, h("span", { className: "fi-venc" }, dCurta(m.data)),
          h("span", { className: "fi-desc" }, h("b", null, m.descricao || "—"), h("span", null, m.conta)), h("span", { className: "fi-valor" }, h("b", { className: m.valor >= 0 ? "ent" : "sai" }, BRL(m.valor))),
          m.tituloId ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => abrir(m.tituloId) }, "Abrir") : h("span")))
        : h("div", { className: "cel-sub" }, "Nada realizado."),
        h("div", { className: "secao-titulo" }, "Previsto (" + d.previstos.length + ")"),
        d.previstos.length ? d.previstos.map(t => h("div", { key: t.id, className: "fi-mov" }, h("span", { className: "fi-venc" + (t.vencido ? " atrasada" : "") }, dCurta(t.vencimento)),
          h("span", { className: "fi-desc" }, h("b", null, t.descricao), h("span", null, (t.tipo === "receber" ? "A receber" : "A pagar") + (t.pessoa ? " · " + t.pessoa : ""))),
          h("span", { className: "fi-valor" }, h("b", { className: t.tipo === "receber" ? "ent" : "sai" }, BRL(t.saldo))),
          h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => abrir(t.id) }, "Abrir")))
        : h("div", { className: "cel-sub" }, "Nada previsto."),
        d.cartoes && d.cartoes.length ? h(React.Fragment, null, h("div", { className: "secao-titulo" }, "Cartão de crédito (" + d.cartoes.length + ")"),
          d.cartoes.map((c, i) => h("div", { key: "c" + i, className: "fi-mov" }, h("span", { className: "fi-venc" }, dCurta(c.data)),
            h("span", { className: "fi-desc" }, h("b", null, c.descricao), h("span", null, c.tipo === "fatura" ? "fatura em aberto" : "conta a pagar no cartão")),
            h("span", { className: "fi-valor" }, h("b", { className: "sai" }, BRL(-c.valor))),
            c.tipo === "titulo" ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => abrir(c.id) }, "Abrir") : h("span")))) : null));
  }

  /* =====================================================================
     v1.24.0 — RECORRENTES
     ===================================================================== */
  const FREQ = { 1: "Todo mês", 2: "A cada 2 meses", 3: "A cada 3 meses", 6: "A cada 6 meses", 12: "Todo ano" };
  function Recorrentes({ op, mudou }) {
    const [l, setL] = useState(null);
    const [ed, setEd] = useState(null);
    const [erro, setErro] = useState("");
    function carregar() { api("fin.recorrencias.listar").then(setL, e => setErro(e.message)); }
    useEffect(carregar, []);
    return h("div", null,
      h("div", { className: "barra" }, h("p", { className: "cel-sub", style: { margin: 0, flex: 1 } }, "Contas que se repetem (aluguel, salários, internet, contratos fixos). O sistema lança sozinho os próximos 3 meses — é só dar baixa quando pagar ou receber."),
        h("button", { className: "bt bt-receber", onClick: () => setEd({ tipo: "receber" }) }, "+ Receita fixa"), h("button", { className: "bt bt-pagar", onClick: () => setEd({ tipo: "pagar" }) }, "+ Despesa fixa")),
      erro ? h(Aviso, null, erro) : null,
      h("div", { className: "bloco" }, !l ? h("div", { className: "vazio" }, erro ? "" : "Carregando…")
        : !l.length ? h("div", { className: "vazio" }, h("strong", null, "Nenhuma recorrência."), "Cadastre o aluguel, a folha, os sistemas…")
        : h("div", { className: "fi-lista" }, l.map(r => h("button", { key: r.id, type: "button", className: "fi-cat" + (r.ativa ? "" : " cancelado"), onClick: () => setEd(r) },
            h("span", null, h("b", null, r.descricao), h("small", { style: { display: "block", color: "var(--tinta-2)" } }, [FREQ[r.intervaloMeses], r.pessoa, r.categoria, r.ativa ? (r.proxima ? "próxima " + dBR(r.proxima) : null) : "encerrada"].filter(Boolean).join(" · "))),
            h("b", { className: r.tipo === "receber" ? "ent" : "sai" }, BRL(r.valor)))))),
      ed ? h(FormRecorrencia, { r: ed, op, aoFechar: () => setEd(null), aoSalvar: () => { setEd(null); carregar(); mudou(); } }) : null);
  }
  function FormRecorrencia({ r, op, aoFechar, aoSalvar }) {
    const tipo = r.tipo;
    const [f, setF] = useState({ descricao: r.descricao || "", valor: valTxt(r.valor), intervaloMeses: String(r.intervaloMeses || 1), inicio: r.inicio || "", fim: r.fim || "",
      categoriaId: r.categoriaId || "", centroId: r.centroId || "", contaId: r.contaId || "", forma: r.forma || "", obs: r.obs || "", ativa: r.id ? r.ativa : true, comNota: !!r.comNota,
      pessoa: r.clienteId || r.fornecedorId ? { id: r.clienteId || r.fornecedorId, nome: r.pessoa } : null });
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    const cats = op.categorias.filter(c => c.ativa && c.tipo === (tipo === "receber" ? "receita" : "despesa"));
    async function salvar() {
      setErro(""); setEnviando(true);
      const dd = Object.assign({ id: r.id, tipo }, f, { clienteId: tipo === "receber" && f.pessoa ? f.pessoa.id : 0, fornecedorId: tipo === "pagar" && f.pessoa ? f.pessoa.id : 0 });
      try { await api("fin.recorrencia.salvar", dd); K.avisar("Recorrência salva. Lançamentos dos próximos meses atualizados."); aoSalvar(); } catch (x) { setErro(x.message); setEnviando(false); }
    }
    async function excluir() {
      if (!(await K.confirmar({ titulo: "Encerrar esta recorrência?", texto: "Os lançamentos futuros ainda não pagos saem. Os já pagos ficam.", botao: "Encerrar", perigo: true }))) return;
      try { await api("fin.recorrencia.excluir", { id: r.id }); K.avisar("Recorrência encerrada."); aoSalvar(); } catch (x) { K.avisar(x.message, true); }
    }
    return h(Painel, { titulo: (r.id ? "Editar " : "Nova ") + (tipo === "receber" ? "receita fixa" : "despesa fixa"), aoFechar, largo: true,
      sub: r.id ? "Ao salvar, os lançamentos futuros ainda não pagos são refeitos com os dados novos." : "Lança sozinho os próximos 3 meses, sempre no mesmo dia.",
      rodape: [r.id ? h("button", { key: "x", className: "bt bt-leve bt-perigo", style: { marginRight: "auto" }, onClick: excluir }, "Encerrar") : null,
               h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Descrição" }, h(Texto, { valor: f.descricao, aoMudar: mudar("descricao"), placeholder: tipo === "pagar" ? "Ex.: Aluguel do galpão" : "Ex.: Contrato Hotel X (mensal)" })),
      h("div", { className: "campo" }, h("span", null, tipo === "receber" ? "Cliente" : "Fornecedor"),
        h(EscolhePessoa, { tipo, valor: f.pessoa, aoEscolher: p => setF(x => Object.assign({}, x, { pessoa: p, categoriaId: x.categoriaId || (p && p.categoriaId) || "" })) })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Valor" }, h(Texto, { valor: f.valor, aoMudar: v => mudar("valor")(numTxt(v)), inputMode: "decimal" })),
        h(Campo, { rotulo: "Frequência" }, h("select", { value: f.intervaloMeses, onChange: e => mudar("intervaloMeses")(e.target.value) }, Object.keys(FREQ).map(k => h("option", { key: k, value: k }, FREQ[k]))))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Primeiro vencimento", dica: "O dia se repete nos meses seguintes." }, h(Texto, { valor: f.inicio, aoMudar: mudar("inicio"), type: "date" })),
        h(Campo, { rotulo: "Até (opcional)", dica: "Em branco = sem fim." }, h(Texto, { valor: f.fim, aoMudar: mudar("fim"), type: "date" }))),
      h("div", { className: "linha-campos" },
        h(SelectCategoria, { op, tipo: tipo === "receber" ? "receita" : "despesa", valor: f.categoriaId, aoMudar: mudar("categoriaId") }),
        h(Campo, { rotulo: "Conta prevista" }, h("select", { value: f.contaId, onChange: e => mudar("contaId")(e.target.value) }, h("option", { value: "" }, "—"), op.contas.filter(c => c.ativa).map(c => h("option", { key: c.id, value: c.id }, c.nome)))),
        h(Campo, { rotulo: "Forma" }, h("select", { value: f.forma, onChange: e => mudar("forma")(e.target.value) }, h("option", { value: "" }, "—"), op.formas.map(x => h("option", { key: x, value: x }, x))))),
      op.centros.length ? h(Campo, { rotulo: "Centro de custo" }, h("select", { value: f.centroId, onChange: e => mudar("centroId")(e.target.value) }, h("option", { value: "" }, "—"), op.centros.filter(c => c.ativo).map(c => h("option", { key: c.id, value: c.id }, c.nome)))) : null,
      tipo === "receber" ? h("label", { className: "check" }, h("input", { type: "checkbox", checked: f.comNota, onChange: e => mudar("comNota")(e.target.checked) }), "Emite nota fiscal (entra na provisão de impostos)") : null,
      r.id ? h("label", { className: "check" }, h("input", { type: "checkbox", checked: f.ativa, onChange: e => mudar("ativa")(e.target.checked) }), "Ativa (gerando lançamentos)") : null);
  }

  /* =====================================================================
     v1.24.0 — CONCILIAÇÃO (extrato OFX / CSV)
     ===================================================================== */
  const semAc = x => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  async function lerTexto(arq) {
    const buf = await arq.arrayBuffer();
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { return new TextDecoder("windows-1252").decode(buf); }
  }
  function numBR(v) {
    let s = String(v == null ? "" : v).trim().replace(/[R$\s]/g, "");
    if (!s) return NaN;
    let neg = /^\(.*\)$/.test(s) || /-$/.test(s) || /^-/.test(s) || /[dD]$/.test(s);
    s = s.replace(/[()\-+dDcC]/g, "");
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? NaN : (neg ? -n : n);
  }
  function dataBR(v) {
    const s = String(v || "").trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s);
    if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); }
    return null;
  }
  function lerCsvExtrato(txt) {
    const linhas = txt.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
    if (!linhas.length) throw new Error("Arquivo vazio.");
    const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ";" : (linhas[0].indexOf("\t") >= 0 ? "\t" : ",");
    const quebra = l => { const o = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { o.push(cur); cur = ""; } else cur += ch; } o.push(cur); return o.map(x => x.trim()); };
    const rows = linhas.map(quebra);
    const hi = rows.findIndex(r => r.some(c => /^data|^date|^dt/.test(semAc(c))));
    if (hi < 0) throw new Error("Não achei o cabeçalho (coluna Data). Confira se o arquivo é o extrato em CSV.");
    const cab = rows[hi].map(semAc);
    const col = re => cab.findIndex(c => re.test(c));
    const ci = { data: col(/^data|^date|^dt/), desc: col(/descri|histor|memo|lancamento|estabelecimento|detalhe|titulo/), valor: col(/^valor|amount|^quantia|valor \(r\$\)/),
                 cred: col(/^credito|^entrada/), deb: col(/^debito|^saida/), doc: col(/document|^doc|^id|identific/) };
    if (ci.valor < 0 && ci.cred < 0 && ci.deb < 0) throw new Error("Não achei a coluna de valor (Valor, ou Crédito/Débito).");
    const out = [];
    rows.slice(hi + 1).forEach(r => {
      const dt = dataBR(r[ci.data]); if (!dt) return;
      let v = ci.valor >= 0 ? numBR(r[ci.valor]) : (numBR(r[ci.cred]) || 0) - Math.abs(numBR(r[ci.deb]) || 0);
      if (isNaN(v) || Math.abs(v) < 0.005) return;
      out.push({ data: dt, valor: Math.round(v * 100) / 100, descricao: ci.desc >= 0 ? r[ci.desc] : "", documento: ci.doc >= 0 ? r[ci.doc] : "" });
    });
    if (!out.length) throw new Error("Nenhum lançamento reconhecido no CSV.");
    return out;
  }

  function Conciliacao({ op, mudou, abrir, sessao }) {
    const contas = op.contas.filter(c => c.ativa);
    /* v1.25.3: retoma de onde parou — conta, filtro e o "Lançar…" aberto com o que já foi preenchido */
    const chave = chaveConc(sessao);
    const [salvo] = useState(() => lerConc(chave));
    const [conta, setConta] = useState(() => {
      if (salvo && contas.some(c => String(c.id) === String(salvo.conta))) return String(salvo.conta);
      const c = contas.find(x => x.tipo === "banco") || contas[0]; return c ? String(c.id) : "";
    });
    const [status, setStatus] = useState(() => (salvo && salvo.status) || "pendente");
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [lancar, setLancar] = useState(() => salvo && salvo.lancar && String(salvo.conta) === String(conta) ? salvo.lancar.e : null);   // linha para lançar como novo/transferência
    const [rascunho, setRascunho] = useState(() => salvo && salvo.lancar ? salvo.lancar.r || null : null);
    const [retomou] = useState(() => !!(salvo && salvo.conta));
    const [hist, setHist] = useState(false);
    function carregar() { if (!conta) return; setErro(""); api("fin.conciliacao.listar", { contaId: conta, status }).then(setD, e => setErro(e.message)); }
    useEffect(carregar, [conta, status]); // eslint-disable-line
    const totalPend = d ? (d.pendentesContas || []).reduce((s, x) => s + x.pendentes, 0) : null;
    /* guarda enquanto houver pendência; terminou (nada pendente em nenhuma conta) → apaga */
    useEffect(() => {
      if (!d || String(d.conta && d.conta.id) !== String(conta)) return;
      if (totalPend === 0 && !lancar) gravarConc(chave, null);
      else gravarConc(chave, { conta, status, lancar: lancar ? { e: lancar, r: rascunho } : null, em: Date.now() });
    }, [d, conta, status, lancar, rascunho]); // eslint-disable-line
    /* a linha do "Lançar…" já foi conciliada/ignorada em outro lugar → fecha */
    useEffect(() => {
      if (lancar && d && status === "pendente" && String(d.conta && d.conta.id) === String(conta) && !d.itens.some(i => i.id === lancar.id)) { setLancar(null); setRascunho(null); }
    }, [d]); // eslint-disable-line
    function trocarConta(c) { setConta(String(c)); setD(null); setLancar(null); setRascunho(null); }
    function fecharLancar() { setLancar(null); setRascunho(null); }
    async function importar(ev) {
      const a = ev.target.files && ev.target.files[0]; ev.target.value = "";
      if (!a) return;
      setOcupado(true);
      try {
        const txt = await lerTexto(a);
        const ofx = /\.ofx$|\.qfx$/i.test(a.name) || /<OFX>/i.test(txt);
        const dados = ofx ? { contaId: conta, formato: "ofx", arquivo: a.name, conteudo: txt } : { contaId: conta, formato: "csv", arquivo: a.name, linhas: lerCsvExtrato(txt) };
        const r = await api("fin.extrato.importar", dados);
        K.avisar(r.novas + " lançamento(s) novo(s)" + (r.duplicadas ? ", " + r.duplicadas + " já estava(m) importado(s)" : "") + ".");
        setStatus("pendente"); carregar();
      } catch (x) { K.avisar(x.message, true); }
      setOcupado(false);
    }
    async function conciliar(e, s) {
      try { await api("fin.conciliar", { extratoId: e.id, tipo: s.tipo, movimentoId: s.tipo === "mov" ? s.id : undefined, tituloId: s.tipo === "titulo" ? s.id : undefined }); K.avisar("Conciliado."); carregar(); mudou(); }
      catch (x) { K.avisar(x.message, true); }
    }
    async function auto() {
      setOcupado(true);
      try { const r = await api("fin.conciliar_auto", { contaId: conta }); K.avisar(r.conciliadas ? r.conciliadas + " linha(s) conciliada(s) automaticamente." : "Nada com correspondência certa. Confira uma a uma."); carregar(); mudou(); }
      catch (x) { K.avisar(x.message, true); }
      setOcupado(false);
    }
    async function acao(nome, dados, ok) { try { await api(nome, dados); if (ok) K.avisar(ok); carregar(); mudou(); } catch (x) { K.avisar(x.message, true); } }
    if (!contas.length) return h("div", { className: "bloco vazio" }, "Cadastre uma conta primeiro (aba Contas).");
    const se = d && d.saldoExtrato;
    const nomeConta = id => (contas.find(c => String(c.id) === String(id)) || {}).nome || "conta";
    const outras = d ? (d.pendentesContas || []).filter(x => String(x.contaId) !== String(conta) && contas.some(c => String(c.id) === String(x.contaId))) : [];
    return h("div", null,
      h("div", { className: "barra fi-barra" },
        h("select", { className: "entrada-texto", value: conta, onChange: e => trocarConta(e.target.value), "aria-label": "Conta", style: { maxWidth: 260 } }, contas.map(c => h("option", { key: c.id, value: c.id }, c.nome))),
        h("label", { className: "bt bt-marca" + (ocupado ? " disabled" : "") }, ocupado ? "Aguarde…" : "Importar extrato (OFX ou CSV)",
          h("input", { type: "file", accept: ".ofx,.qfx,.csv,.txt,text/csv", onChange: importar, style: { display: "none" }, disabled: ocupado })),
        h("button", { className: "bt", disabled: ocupado || !(d && d.contagem.pendente), onClick: auto }, "Conciliar automático"),
        h("button", { className: "bt bt-leve", onClick: () => setHist(true) }, "Importações")),
      erro ? h(Aviso, null, erro) : null,
      d && retomou && d.contagem.pendente ? h("div", { className: "fi-saldos ok" }, h("span", null, "Continuando a conciliação de ", h("b", null, nomeConta(conta)), ": ", h("b", null, d.contagem.pendente), " linha(s) pendente(s). O extrato já está salvo, não precisa importar de novo.")) : null,
      outras.length ? h("div", { className: "fi-saldos dif" }, h("span", null, d.contagem.pendente ? "Também há pendências em: " : "Nada pendente aqui, mas há conciliação em andamento em: "),
        outras.map(x => h("button", { key: x.contaId, type: "button", className: "bt bt-p", style: { marginLeft: 6 }, onClick: () => trocarConta(x.contaId) }, nomeConta(x.contaId) + " · " + x.pendentes))) : null,
      !d ? h("div", { className: "bloco vazio" }, "Carregando…") : h(React.Fragment, null,
        se ? h("div", { className: "fi-saldos " + (se.sistema != null && Math.abs(se.valor - se.sistema) < 0.01 ? "ok" : "dif") },
          h("span", null, "Saldo no extrato em " + dBR(se.em) + ": ", h("b", null, BRL(se.valor))),
          se.sistema != null ? h("span", null, "No sistema: ", h("b", null, BRL(se.sistema)), Math.abs(se.valor - se.sistema) < 0.01 ? " ✓ batendo" : " · diferença " + BRL(se.valor - se.sistema)) : null) : null,
        h("div", { className: "chips fi-chips" }, [["pendente", "Pendentes"], ["conciliado", "Conciliados"], ["ignorado", "Ignorados"], ["todos", "Todos"]].map(([k, t]) =>
          h("button", { key: k, type: "button", className: "chip" + (status === k ? " ativo" : ""), onClick: () => setStatus(k) }, t, k !== "todos" ? h("span", { className: "chip-n" }, d.contagem[k]) : null))),
        h("div", { className: "bloco" },
          !d.itens.length ? h("div", { className: "vazio" }, status === "pendente" ? h(React.Fragment, null, h("strong", null, "Nada pendente."), "Importe o extrato do banco (OFX) ou o CSV do cartão.") : "Nada aqui.")
          : h("div", { className: "fi-lista" }, d.itens.map(e => h("div", { key: e.id, className: "fi-conc" + (e.status !== "pendente" ? " " + e.status : "") },
              h("div", { className: "fi-conc-l" },
                h("span", { className: "fi-venc" }, dCurta(e.data)),
                h("span", { className: "fi-desc" }, h("b", null, e.descricao || "—"), e.status === "conciliado" ? h("span", null, "✓ " + (e.ligadoA || "conciliado")) : e.status === "ignorado" ? h("span", null, "ignorado") : null),
                h("b", { className: "fi-conc-v " + (e.valor >= 0 ? "ent" : "sai") }, (e.valor >= 0 ? "+" : "") + BRL(e.valor))),
              e.status === "pendente" ? h("div", { className: "fi-conc-a" },
                (e.sugestoes || []).map((s, i) => h("button", { key: i, type: "button", className: "bt bt-p fi-sug-bt" + (i === 0 ? " bt-marca" : ""), onClick: () => conciliar(e, s) }, (s.tipo === "mov" ? "✓ " : "↳ ") + s.texto)),
                h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => { setRascunho(null); setLancar(e); } }, "Lançar…"),
                h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => acao("fin.extrato.ignorar", { extratoId: e.id, ignorar: 1 }) }, "Ignorar"))
              : h("div", { className: "fi-conc-a" },
                  e.status === "conciliado" && e.tituloId ? h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => abrir(e.tituloId) }, "Abrir lançamento") : null,
                  e.status === "conciliado" ? h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => acao("fin.conciliacao.desfazer", { extratoId: e.id }, "Conciliação desfeita.") }, "Desfazer")
                  : h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => acao("fin.extrato.ignorar", { extratoId: e.id, ignorar: 0 }) }, "Voltar para pendente")))))),
        h("p", { className: "cel-sub" }, "O automático só liga o que é certo (mesmo valor, data próxima e uma única opção). O resto você confirma: ✓ = já está lançado; ↳ = dá baixa na conta a pagar/receber; Lançar = tarifa, rendimento ou transferência. Pode sair da tela: a conciliação continua de onde parou.")),
      lancar ? h(FormLancarExtrato, { key: lancar.id, e: lancar, op, contaId: conta, rascunho, aoRascunho: setRascunho, aoFechar: fecharLancar, aoSalvar: () => { fecharLancar(); carregar(); mudou(); } }) : null,
      hist ? h(Importacoes, { contaId: conta, aoFechar: () => { setHist(false); carregar(); } }) : null);
  }
  function FormLancarExtrato({ e, op, contaId, rascunho, aoRascunho, aoFechar, aoSalvar }) {
    const [modo, setModo] = useState((rascunho && rascunho.modo) || "novo");
    const [f, setF] = useState(() => Object.assign({ categoriaId: "", centroId: "", descricao: e.descricao || "", contaId: "", vinc: null }, (rascunho && rascunho.f) || {}));
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    useEffect(() => { if (aoRascunho) aoRascunho({ modo, f }); }, [modo, f]); // eslint-disable-line
    const ent = e.valor > 0;
    const mudarF = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    async function salvar() {
      setErro(""); setEnviando(true);
      try {
        await api("fin.conciliar", Object.assign({ extratoId: e.id, tipo: modo }, f, { vinc: undefined, vinculo: modo === "novo" && f.vinc ? f.vinc.valor : "" }));
        K.avisar("Lançado e conciliado."); aoSalvar();
      } catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: "Lançar do extrato", sub: dBR(e.data) + " · " + (e.descricao || "") + " · " + BRL(e.valor), aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Lançar e conciliar")] },
      h(Aviso, null, erro),
      h("div", { className: "chips", style: { marginBottom: 12 } },
        h("button", { type: "button", className: "chip" + (modo === "novo" ? " ativo" : ""), onClick: () => setModo("novo") }, ent ? "Receita (rendimento, outros)" : "Despesa (tarifa, outros)"),
        h("button", { type: "button", className: "chip" + (modo === "transferencia" ? " ativo" : ""), onClick: () => setModo("transferencia") }, "Transferência entre contas")),
      modo === "novo" ? h(React.Fragment, null,
        h(SelectCategoria, { op, tipo: ent ? "receita" : "despesa", valor: f.categoriaId, aoMudar: mudarF("categoriaId") }),
        op.centros.length ? h(Campo, { rotulo: "Centro de custo" }, h("select", { value: f.centroId, onChange: x => mudarF("centroId")(x.target.value) }, h("option", { value: "" }, "—"), op.centros.filter(c => c.ativo).map(c => h("option", { key: c.id, value: c.id }, c.nome)))) : null,
        h(Campo, { rotulo: "Descrição" }, h(Texto, { valor: f.descricao, aoMudar: mudarF("descricao") })),
        h(CampoVinculo, { op, valor: f.vinc, aoEscolher: mudarF("vinc") }))
      : h(Campo, { rotulo: ent ? "Veio da conta" : "Foi para a conta", dica: "Ex.: pagamento da fatura do cartão = transferência do banco para o cartão." },
          h("select", { value: f.contaId, onChange: x => mudarF("contaId")(x.target.value) }, h("option", { value: "" }, "Escolha…"),
            op.contas.filter(c => c.ativa && String(c.id) !== String(contaId)).map(c => h("option", { key: c.id, value: c.id }, c.nome)))));
  }
  function Importacoes({ contaId, aoFechar }) {
    const [l, setL] = useState(null);
    function carregar() { api("fin.importacoes.listar", { contaId }).then(setL, e => K.avisar(e.message, true)); }
    useEffect(carregar, []);
    async function desfazer(i) {
      if (!(await K.confirmar({ titulo: "Desfazer esta importação?", texto: "Saem as linhas dela que ainda estão pendentes. As já conciliadas ficam.", botao: "Desfazer", perigo: true }))) return;
      try { const r = await api("fin.importacao.desfazer", { id: i.id }); K.avisar(r.removidas + " linha(s) removida(s)."); carregar(); } catch (x) { K.avisar(x.message, true); }
    }
    return h(Painel, { titulo: "Importações de extrato", aoFechar, rodape: [h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      !l ? h("div", { className: "vazio" }, "Carregando…") : !l.length ? h("div", { className: "vazio" }, "Nenhuma importação nesta conta.")
      : l.map(i => h("div", { key: i.id, className: "fi-cen" }, h("span", null, h("b", null, i.arquivo || i.origem.toUpperCase()), h("small", { style: { display: "block", color: "var(--tinta-2)" } },
          K.dataHora(i.em) + (i.quem ? " · " + i.quem : "") + " · " + i.novas + " nova(s), " + i.duplicadas + " repetida(s) · " + i.pendentes + " pendente(s)")),
          i.pendentes ? h("button", { className: "bt bt-leve bt-p", onClick: () => desfazer(i) }, "Desfazer") : null)));
  }

  K.Financeiro = { Financeiro };
  /* =====================================================================
     v1.25.0 — DRE, IMPOSTOS, RENTABILIDADE, CONTRATOS
     ===================================================================== */
  const mesISO = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  const rotMesLongo = k => ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+k.slice(5, 7) - 1] + "/" + k.slice(0, 4);
  function mesesDe(pm) {
    const d = new Date(), y = d.getFullYear();
    if (pm.tipo === "12m") return { de: mesISO(new Date(y, d.getMonth() - 11, 1)), ate: mesISO(d) };
    if (pm.tipo === "anoPassado") return { de: (y - 1) + "-01", ate: (y - 1) + "-12" };
    if (pm.tipo === "trim") return { de: mesISO(new Date(y, d.getMonth() - 2, 1)), ate: mesISO(d) };
    if (pm.tipo === "livre") return { de: pm.de || mesISO(d), ate: pm.ate || pm.de || mesISO(d) };
    if (pm.tipo === "prox") return { de: mesISO(d), ate: mesISO(new Date(y, d.getMonth() + 5, 1)) };
    return { de: y + "-01", ate: y + "-12" };   /* v1.25.1: o ano inteiro (meses futuros = previsto) */
  }
  function PeriodoMeses({ pm, setPm }) {
    return h("div", { className: "fi-periodo" },
      h("div", { className: "chips" }, [["ano", "Este ano"], ["prox", "Próximos 6 meses"], ["trim", "Últimos 3 meses"], ["12m", "Últimos 12 meses"], ["anoPassado", "Ano passado"], ["livre", "Escolher"]].map(([k, t]) =>
        h("button", { key: k, type: "button", className: "chip" + (pm.tipo === k ? " ativo" : ""), onClick: () => setPm(Object.assign({}, pm, { tipo: k })) }, t))),
      pm.tipo === "livre" ? h("div", { className: "fi-livre" },
        h("input", { type: "month", className: "entrada-texto", value: pm.de || "", onChange: e => setPm(Object.assign({}, pm, { de: e.target.value })), "aria-label": "De" }), h("span", null, "até"),
        h("input", { type: "month", className: "entrada-texto", value: pm.ate || "", onChange: e => setPm(Object.assign({}, pm, { ate: e.target.value })), "aria-label": "Até" })) : null);
  }
  const pctTxt = (v, base) => base ? (v / base * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—";
  const BRL0 = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  function Dre({ op, versao, abrir, novo, mudou, sessao }) {
    const [pm, setPm] = useState({ tipo: "ano" });
    const [regime, setRegime] = useState("competencia");
    const [centro, setCentro] = useState("");
    const [abertos, setAbertos] = useState({});
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [det, setDet] = useState(null);
    const [recarga, setRecarga] = useState(0);
    const per = mesesDe(pm);
    useEffect(() => {
      setErro("");
      api("fin.dre", { de: per.de, ate: per.ate, regime, centroId: centro }).then(setD, e => setErro(e.message));
    }, [per.de, per.ate, regime, centro, versao, recarga]); // eslint-disable-line
    const catDed = op.categorias.find(c => c.grupoDre === "deducoes" && c.ativa);
    function lancarGuia(m) {
      const [y, mm] = m.split("-").map(Number);
      const venc = iso(new Date(y, mm, 20));
      novo("pagar", { descricao: "DAS / impostos " + m.slice(5) + "/" + m.slice(0, 4), competencia: m + "-01", vencimento: venc, categoriaId: catDed ? catDed.id : "" });
    }
    async function zerar(m, z) {
      try { await api("fin.impostos.zerar", { mes: m, zerado: z ? 1 : 0 }); K.avisar(z ? "Mês marcado sem imposto a pagar." : "O mês volta a usar a provisão."); setRecarga(x => x + 1); } catch (x) { K.avisar(x.message, true); }
    }
    const rb = d ? d.receitaBruta : [];
    const rbTot = rb.reduce((a, b) => a + b, 0);
    const pctF = v => v == null ? "—" : (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
    const cel = (v, cls) => h("td", { className: "num" + (cls ? " " + cls : "") + (v < 0 ? " sai" : "") }, v ? BRL0(v) : h("span", { className: "fi-zero" }, "—"));
    const av = t => h("td", { className: "num fi-dre-av" }, t ? pctTxt(t, rbTot) : "");
    const alternar = k => setAbertos(a => Object.assign({}, a, { [k]: !a[k] }));
    function abrirTudo(sim) {
      if (!sim) return setAbertos({});
      const o = {};
      d.linhas.forEach(l => { if (l.nivel === "grupo") { o[l.k] = true; l.filhos.forEach(f => { if (f.filhos && f.filhos.length) o[f.k] = true; }); } });
      setAbertos(o);
    }
    /* linhas na ordem da tela (para exportar e imprimir: tudo aberto) */
    function planas() {
      const L = [];
      d.linhas.forEach(l => {
        L.push({ n: l.nivel === "grupo" ? 0 : l.nivel === "pct" ? 9 : -1, rotulo: l.rotulo, valores: l.valores, total: l.total, pct: l.nivel === "pct" });
        (l.filhos || []).forEach(f => { L.push({ n: 1, rotulo: f.rotulo, valores: f.valores, total: f.total }); (f.filhos || []).forEach(s => L.push({ n: 2, rotulo: s.rotulo, valores: s.valores, total: s.total })); });
      });
      const e = d.equilibrio;
      L.push({ n: -1, rotulo: "Ponto de equilíbrio (faturamento necessário)", valores: e.valores, total: e.total });
      L.push({ n: 9, rotulo: "Margem de segurança", valores: e.seguranca, total: e.segurancaTotal, pct: true });
      return L;
    }
    function exportar() {
      const sep = ";", fmt = x => x == null ? "" : Number(x).toFixed(2).replace(".", ","), fp = x => x == null ? "" : (x * 100).toFixed(1).replace(".", ",") + "%";
      const L = [["DRE " + (regime === "caixa" ? "(caixa)" : "(competência)")].concat(d.meses.map(rotMesLongo)).concat(["Total", "AV%"])];
      planas().forEach(x => L.push([(x.n === 1 ? "   " : x.n === 2 ? "      " : "") + x.rotulo].concat(x.valores.map(x.pct ? fp : fmt)).concat([x.pct ? fp(x.total) : fmt(x.total), x.pct ? "" : (rbTot ? fp(x.total / rbTot) : "")])));
      const csv = "﻿" + L.map(r => r.map(c => /[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(sep)).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = "dre_" + d.meses[0] + "_a_" + d.meses[d.meses.length - 1] + ".csv";
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function imprimir() {
      const esc = x => String(x == null ? "" : x).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      const n = x => x ? Number(x).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "–";
      const rows = planas().map(x => "<tr class='n" + x.n + "'><td>" + esc(x.rotulo) + "</td>" + x.valores.map(v => "<td>" + (x.pct ? pctF(v) : n(v)) + "</td>").join("") +
        "<td>" + (x.pct ? pctF(x.total) : n(x.total)) + "</td><td>" + (x.pct || !rbTot ? "" : pctTxt(x.total, rbTot)) + "</td></tr>").join("");
      const emp = (sessao && sessao.empresa && sessao.empresa.nome) || "";
      const html = "<!doctype html><html><head><meta charset='utf-8'><title>DRE</title><style>@page{size:A4 landscape;margin:10mm}body{font:10px Arial,sans-serif;color:#111}h1{font-size:14px;margin:0 0 2px}p{margin:0 0 8px;color:#555}" +
        "table{border-collapse:collapse;width:100%}td,th{padding:3px 4px;text-align:right;border-bottom:1px solid #e5e5e5;white-space:nowrap}td:first-child,th:first-child{text-align:left;white-space:normal}" +
        "th{background:#f2f2f2}tr.n-1 td{font-weight:700;background:#eef3fb}tr.n0 td{font-weight:700}tr.n1 td:first-child{padding-left:14px}tr.n2 td{color:#555}tr.n2 td:first-child{padding-left:28px}tr.n9 td{font-style:italic;color:#333}</style></head><body>" +
        "<h1>DRE " + esc(emp) + "</h1><p>" + rotMesLongo(d.de) + " a " + rotMesLongo(d.ate) + " · " + (regime === "caixa" ? "regime de caixa" : "competência") + "</p><table><thead><tr><th>Descrição</th>" +
        d.meses.map(m => "<th>" + rotMes(m) + "</th>").join("") + "<th>Total</th><th>AV%</th></tr></thead><tbody>" + rows + "</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>";
      const w = window.open("", "_blank");
      if (!w) return K.avisar("O navegador bloqueou a janela de impressão. Libere pop-ups para este site.", true);
      w.document.write(html); w.document.close();
    }
    const linhaValores = (f, cls, so) => f.valores.map((v, i) => h("td", { key: i, className: "num" + (v < 0 ? " sai" : "") + (v && f.catId != null ? " fi-dre-clic" : ""),
      onClick: v && f.catId != null ? e => { e.stopPropagation(); setDet({ mes: d.meses[i], categoriaId: f.catId, so: so ? 1 : 0, rotulo: f.rotulo }); } : null },
      v ? BRL0(v) : h("span", { className: "fi-zero" }, "—")));
    const mc = d && d.linhas.find(x => x.k === "margem_contribuicao");
    const mcp = d && d.linhas.find(x => x.k === "mc_pct");
    const ll = d && d.linhas.find(x => x.k === "lucro_liquido");
    const mlp = d && d.linhas.find(x => x.k === "margem_liquida");
    const eq = d && d.equilibrio;
    return h("div", null,
      h("div", { className: "fi-filtros" },
        h("div", null,
          h("div", { className: "chips", style: { marginBottom: 8 } },
            h("button", { type: "button", className: "chip" + (regime === "competencia" ? " ativo" : ""), onClick: () => setRegime("competencia") }, "Competência"),
            h("button", { type: "button", className: "chip" + (regime === "caixa" ? " ativo" : ""), onClick: () => setRegime("caixa") }, "Caixa")),
          h(PeriodoMeses, { pm, setPm })),
        h("div", { className: "fi-sel" },
          op.centros.length ? h("select", { className: "entrada-texto", value: centro, onChange: e => setCentro(e.target.value), "aria-label": "Centro de custo" },
            h("option", { value: "" }, "Empresa toda"), op.centros.filter(c => c.ativo).map(c => h("option", { key: c.id, value: c.id }, c.nome))) : null,
          d ? h("button", { className: "bt", onClick: imprimir }, "Imprimir") : null,
          d ? h("button", { className: "bt", onClick: exportar }, "Exportar para Excel") : null)),
      erro ? h(Aviso, null, erro) : null,
      !d ? h("div", { className: "bloco vazio" }, erro ? "" : "Carregando…") : h(React.Fragment, null,
        h("div", { className: "kpis" },
          h("div", { className: "kpi fi-kpi" }, h("div", { className: "kpi-t" }, "Receita bruta"), h("div", { className: "kpi-v" }, BRL(rbTot)), h("div", { className: "kpi-p" }, rotMesLongo(d.de) + " a " + rotMesLongo(d.ate))),
          h("div", { className: "kpi fi-kpi" }, h("div", { className: "kpi-t" }, "Margem de contribuição"), h("div", { className: "kpi-v" + (mc.total < 0 ? " sai" : "") }, BRL(mc.total)), h("div", { className: "kpi-p" }, pctF(mcp.total) + " da receita")),
          h("div", { className: "kpi fi-kpi kpi-forte" }, h("div", { className: "kpi-t" }, "Lucro líquido"), h("div", { className: "kpi-v" + (ll.total < 0 ? " sai" : "") }, BRL(ll.total)), h("div", { className: "kpi-p" }, "margem " + pctF(mlp.total))),
          h("div", { className: "kpi fi-kpi" }, h("div", { className: "kpi-t" }, "Ponto de equilíbrio"), h("div", { className: "kpi-v" }, eq.mediaMes != null ? BRL(eq.mediaMes) : "—"),
            h("div", { className: "kpi-p" + (eq.faltaTotal > 0 ? " sai" : "") }, eq.total == null ? (rbTot ? "margem de contribuição negativa" : "sem receita no período") : "por mês · " + (eq.faltaTotal > 0 ? "faltaram " + BRL(eq.faltaTotal) + " no período" : "folga de " + BRL(-eq.faltaTotal) + " no período")))),
        h("div", { className: "bloco" },
          h("div", { style: { display: "flex", gap: 6, padding: "8px 12px 0" } },
            h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => abrirTudo(true) }, "Abrir tudo"),
            h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => abrirTudo(false) }, "Fechar tudo")),
          h("div", { className: "tabela-caixa" }, h("table", { className: "tabela fi-dre" },
          h("thead", null, h("tr", null, h("th", null, "Descrição"), d.meses.map(m => h("th", { key: m, className: "num" + (m > d.mesAtual ? " fi-futuro" : "") }, rotMes(m) + (m > d.mesAtual ? " ·prev." : ""))), h("th", { className: "num" }, "Total"), h("th", { className: "num" }, "AV%"))),
          h("tbody", null, d.linhas.map(l => {
            if (l.nivel === "total") return h("tr", { key: l.k, className: "fi-dre-tot" + (l.final ? " fi-dre-final" : "") },
              h("td", null, l.rotulo), l.valores.map((v, i) => cel(v)), cel(l.total, "fi-dre-c"), av(l.total));
            if (l.nivel === "pct") return h("tr", { key: l.k, className: "fi-dre-pct" },
              h("td", null, l.rotulo), l.valores.map((v, i) => h("td", { key: i, className: "num" + (v < 0 ? " sai" : "") }, pctF(v))), h("td", { className: "num fi-dre-c" + (l.total < 0 ? " sai" : "") }, pctF(l.total)), h("td", null));
            const aberto = abertos[l.k];
            const out = [h("tr", { key: l.k, className: "fi-dre-g", onClick: () => alternar(l.k) },
              h("td", null, h("span", { className: "fi-dre-seta" }, l.filhos.length ? (aberto ? "▾" : "▸") : "·"), l.rotulo),
              l.valores.map((v, i) => cel(v)), cel(l.total, "fi-dre-c"), av(l.total))];
            if (aberto) l.filhos.forEach(f => {
              const temSub = f.filhos && f.filhos.length, ab = abertos[f.k];
              out.push(h("tr", { key: f.k, className: "fi-dre-cat" + (f.provisao ? " fi-dre-prov" : "") + (temSub ? " fi-dre-temsub" : ""), onClick: temSub ? () => alternar(f.k) : null },
                h("td", null, temSub ? h("span", { className: "fi-dre-seta" }, ab ? "▾" : "▸") : null, f.rotulo),
                linhaValores(f), cel(f.total, "fi-dre-c"), av(f.total)));
              if (temSub && ab) f.filhos.forEach(x => out.push(h("tr", { key: f.k + x.k, className: "fi-dre-sub" },
                h("td", null, x.rotulo), linhaValores(x, null, x.so), cel(x.total, "fi-dre-c"), av(x.total))));
            });
            return out;
          }),
          h("tr", { className: "fi-dre-eq-cab" }, h("td", { colSpan: d.meses.length + 3 }, "Ponto de equilíbrio")),
          h("tr", { className: "fi-dre-eq" }, h("td", null, "Faturamento necessário"), eq.valores.map((v, i) => h("td", { key: i, className: "num" }, v != null ? BRL0(v) : "—")), h("td", { className: "num fi-dre-c" }, eq.total != null ? BRL0(eq.total) : "—"), h("td", null)),
          h("tr", { className: "fi-dre-eq" }, h("td", null, "Acima (+) ou abaixo (−) do equilíbrio"), eq.falta.map((v, i) => h("td", { key: i, className: "num" + (v > 0 ? " sai" : "") }, v != null ? BRL0(-v) : "—")),
            h("td", { className: "num fi-dre-c" + (eq.faltaTotal > 0 ? " sai" : "") }, eq.faltaTotal != null ? BRL0(-eq.faltaTotal) : "—"), h("td", null)),
          h("tr", { className: "fi-dre-eq" }, h("td", null, "Margem de segurança"), eq.seguranca.map((v, i) => h("td", { key: i, className: "num" + (v < 0 ? " sai" : "") }, pctF(v))),
            h("td", { className: "num fi-dre-c" + (eq.segurancaTotal < 0 ? " sai" : "") }, pctF(eq.segurancaTotal)), h("td", null)))))),
        h("p", { className: "cel-sub" }, "Ponto de equilíbrio = custos e despesas fixas ÷ % da margem de contribuição: é quanto precisa faturar no mês para não ter prejuízo. Margem de segurança = quanto a receita pode cair antes de dar prejuízo."),
        d.foraDreTotal ? h("p", { className: "cel-sub" }, "Fora do resultado no período (transferências, retirada de lucros, empréstimos, compra de bens): " + BRL(d.foraDreTotal) + ".") : null,
        h("p", { className: "cel-sub" }, "Toque numa linha para abrir as categorias e subcategorias; toque num valor para ver os lançamentos. A linha de cada valor vem da categoria (Cadastros › Categorias)."),
        regime === "competencia" ? h(Impostos, { d, lancarGuia, zerar, abrirDet: m => setDet({ mes: m, grupo: "deducoes", rotulo: "Deduções sobre vendas" }), centro }) : null),
      det ? h(DetalheDre, { det, regime, centro, aoFechar: () => setDet(null), abrir }) : null);
  }

  function Impostos({ d, lancarGuia, zerar, abrirDet, centro }) {
    const SIT = { provisao: ["Provisão", "os-amarelo"], apurado: ["Guia lançada", "os-verde"], zerado: ["Sem imposto", "os-cinza"] };
    const hoje = d.mesAtual;
    return h("div", { className: "bloco fi-imp-bloco" },
      h("div", { className: "bloco-cab" }, h("h2", null, "Impostos do mês: provisão × apurado"),
        h("p", null, "Enquanto o contador não apura, a DRE usa a provisão de " + String(d.provisaoPct).replace(".", ",") + "% sobre " + (d.provisaoBase === "recebimento" ? "os recebimentos" : "o faturamento") + " com nota fiscal" +
          " (Ajustes). Ao lançar a guia real (DAS) com a competência do mês, ela substitui a provisão." + (centro ? " Com centro de custo, os valores acima são rateados pela receita do centro; esta tabela é da empresa toda." : ""))),
      h("div", { className: "tabela-caixa" }, h("table", { className: "tabela fi-imp-t" },
        h("thead", null, h("tr", null, h("th", null, "Mês"), h("th", { className: "num" }, "Faturado"), h("th", { className: "num" }, d.provisaoBase === "recebimento" ? "Recebido c/ nota" : "Com nota"), h("th", { className: "num" }, "Provisão"),
          h("th", { className: "num" }, "Apurado (guia)"), h("th", { className: "num" }, "Diferença"), h("th", { className: "num" }, "Alíquota real"), h("th", null, "Situação"), h("th", null, ""))),
        h("tbody", null, d.impostos.slice().reverse().map(i => h("tr", { key: i.mes, className: i.mes > hoje ? "fi-passado" : "" },
          h("td", null, rotMes(i.mes)), h("td", { className: "num" }, BRL(i.faturado)), h("td", { className: "num" }, BRL(i.base)), h("td", { className: "num" }, BRL(i.provisao)),
          h("td", { className: "num" }, i.situacao === "apurado" ? h("button", { type: "button", className: "fi-link", onClick: () => abrirDet(i.mes) }, BRL(i.apurado)) : i.apurado != null ? BRL(i.apurado) : h("span", { className: "fi-zero" }, "—")),
          h("td", { className: "num" + (i.diferenca > 0 ? " sai" : i.diferenca < 0 ? " ent" : "") }, i.diferenca != null ? (i.diferenca > 0 ? "+" : "") + BRL(i.diferenca) : ""),
          h("td", { className: "num" }, i.aliquotaReal != null ? String(i.aliquotaReal).replace(".", ",") + "%" : ""),
          h("td", null, h("span", { className: "selo " + SIT[i.situacao][1] }, SIT[i.situacao][0])),
          h("td", { className: "fi-imp-acoes" }, i.mes > hoje ? null : i.situacao === "zerado"
            ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => zerar(i.mes, false) }, "Voltar à provisão")
            : h(React.Fragment, null, h("button", { type: "button", className: "bt bt-p", onClick: () => lancarGuia(i.mes) }, i.situacao === "apurado" ? "+ Outra guia" : "Lançar guia"),
                i.situacao === "provisao" ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => zerar(i.mes, true) }, "Sem imposto") : null))))))),
      h("p", { className: "cel-sub", style: { padding: "0 16px 12px" } }, "Diferença positiva = pagou mais que a provisão (a DRE do mês piorou ao trocar); negativa = sobrou. Use a alíquota real dos últimos meses para acertar o % em Ajustes."));
  }

  function DetalheDre({ det, regime, centro, aoFechar, abrir }) {
    const [d, setD] = useState(null);
    useEffect(() => { api("fin.dre.detalhe", { mes: det.mes, categoriaId: det.categoriaId, so: det.so || 0, grupo: det.grupo || "", regime, centroId: centro }).then(setD, e => K.avisar(e.message, true)); }, []); // eslint-disable-line
    const tot = d ? d.titulos.reduce((a, t) => a + (t.tipo === "receber" ? t.valor : -t.valor), 0) + d.movimentos.reduce((a, m) => a + m.valor, 0) : 0;
    return h(Painel, { titulo: det.rotulo, sub: rotMesLongo(det.mes) + " · " + (regime === "caixa" ? "regime de caixa" : "competência"), aoFechar, largo: true,
      rodape: [h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      !d ? h("div", { className: "vazio" }, "Carregando…") : h(React.Fragment, null,
        h("div", { className: "fi-tot" }, h("span", null, (d.titulos.length + d.movimentos.length) + " lançamento(s)"), h("b", { className: tot >= 0 ? "ent" : "sai" }, BRL(tot))),
        d.titulos.map(t => h("div", { key: "t" + t.id, className: "fi-mov" }, h("span", { className: "fi-venc" }, dCurta(t.competencia)),
          h("span", { className: "fi-desc" }, h("b", null, t.descricao), h("span", null, [t.pessoa, STATUS[t.status], t.pago && t.status !== "quitado" ? "pago " + BRL(t.pago) : null].filter(Boolean).join(" · "))),
          h("span", { className: "fi-valor" }, h("b", { className: t.tipo === "receber" ? "ent" : "sai" }, BRL(t.tipo === "receber" ? t.valor : -t.valor))),
          h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => abrir(t.id) }, "Abrir"))),
        d.movimentos.map(m => h("div", { key: "m" + m.id, className: "fi-mov" }, h("span", { className: "fi-venc" }, dCurta(m.data)),
          h("span", { className: "fi-desc" }, h("b", null, m.descricao || "—"), h("span", null, m.conta)),
          h("span", { className: "fi-valor" }, h("b", { className: m.valor >= 0 ? "ent" : "sai" }, BRL(m.valor))),
          m.tituloId ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => abrir(m.tituloId) }, "Abrir") : h("span"))),
        !d.titulos.length && !d.movimentos.length ? h("div", { className: "vazio" }, "Nada aqui.") : null));
  }

  /* ---------------- rentabilidade ---------------- */
  /* v1.37.0: Cliente soma os custos LANÇADOS nos serviços; filtro por nome; clique na linha abre serviço por serviço e cada lançamento */
  function Rentabilidade({ versao, op, abrir, mudou }) {
    const [pm, setPm] = useState({ tipo: "ano" });
    const [dim, setDim] = useState("cliente");
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [filtro, setFiltro] = useState("");
    const [det, setDet] = useState(null);
    const per = mesesDe(pm);
    useEffect(() => { setErro(""); setD(null); api("fin.rentabilidade", { de: per.de, ate: per.ate, dim }).then(setD, e => setErro(e.message)); }, [per.de, per.ate, dim, versao]); // eslint-disable-line
    const DIMS = [["cliente", "Cliente"], ["servico", "Tipo de serviço"], ["chamado", "Chamado"], ["contrato", "Contrato"], ["centro", "Centro de custo"]];
    const comDesp = d && d.dim !== "servico";
    const comRec = d && d.dim !== "centro";
    const clicavel = d && (d.dim === "cliente" || d.dim === "chamado" || d.dim === "contrato");
    const margem = m => m == null ? "—" : String(m).replace(".", ",") + "%";
    const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const linhas = d ? d.linhas.filter(l => !filtro.trim() || norm(l.nome + " " + (l.sub || "")).includes(norm(filtro.trim()))) : [];
    const tot = d ? (filtro.trim() ? linhas.reduce((a, l) => { ["receita", "custo", "estimado", "imposto", "despesa", "resultado", "aberto", "qtd"].forEach(c => a[c] += l[c] || 0); return a; },
      { receita: 0, custo: 0, estimado: 0, imposto: 0, despesa: 0, resultado: 0, aberto: 0, qtd: 0 }) : d.totais) : null;
    if (tot) tot.margem = tot.receita > 0 ? Math.round(tot.resultado / tot.receita * 1000) / 10 : null;
    const maxR = Math.max(1, ...linhas.map(l => Math.abs(l.receita)));
    const custoCel = l => h("td", { className: "num sai" }, l.custo ? BRL(-l.custo) : "—",
      l.estimado ? h("small", { style: { display: "block", color: "var(--tinta-2)" }, title: "Custo + RT digitado no chamado: ainda não há custo lançado ligado a ele" }, "estimado " + BRL(l.estimado)) : null);
    return h("div", null,
      h("div", { className: "fi-filtros" },
        h("div", null, h("div", { className: "chips", style: { marginBottom: 8 } }, DIMS.map(([k, t]) => h("button", { key: k, type: "button", className: "chip" + (dim === k ? " ativo" : ""), onClick: () => { setDim(k); setFiltro(""); } }, t))),
          h(PeriodoMeses, { pm, setPm }),
          h("input", { className: "entrada-texto", style: { marginTop: 8, maxWidth: 420 }, value: filtro, onChange: e => setFiltro(e.target.value),
            placeholder: { cliente: "Escolher cliente (digite o nome)", chamado: "Nº do chamado ou cliente", contrato: "Nº do contrato ou cliente", servico: "Tipo de serviço", centro: "Centro de custo" }[dim] }))),
      erro ? h(Aviso, null, erro) : null,
      !d ? h("div", { className: "bloco vazio" }, erro ? "" : "Carregando…") : h(React.Fragment, null,
        h("div", { className: "kpis" },
          h("div", { className: "kpi fi-kpi" }, h("div", { className: "kpi-t" }, "Receita"), h("div", { className: "kpi-v" }, BRL(tot.receita)), h("div", { className: "kpi-p" }, rotMesLongo(d.de) + " a " + rotMesLongo(d.ate))),
          h("div", { className: "kpi fi-kpi" }, h("div", { className: "kpi-t" }, "Custos, despesas e impostos"), h("div", { className: "kpi-v sai" }, BRL(tot.custo + tot.imposto + tot.despesa)),
            h("div", { className: "kpi-p" }, "custos " + BRL(tot.custo) + (comDesp ? " · despesas " + BRL(tot.despesa) : "") + " · impostos " + BRL(tot.imposto))),
          h("div", { className: "kpi fi-kpi kpi-forte" }, h("div", { className: "kpi-t" }, "Resultado"), h("div", { className: "kpi-v" + (tot.resultado < 0 ? " sai" : "") }, BRL(tot.resultado)), h("div", { className: "kpi-p" }, "margem " + margem(tot.margem)))),
        h("div", { className: "bloco" }, !linhas.length ? h("div", { className: "vazio" }, filtro.trim() ? "Nada com esse nome no período." : "Nada no período.") : h("div", { className: "tabela-caixa" }, h("table", { className: "tabela fi-rent" },
          h("thead", null, h("tr", null, h("th", null, DIMS.find(x => x[0] === d.dim)[1]), h("th", { className: "num" }, d.dim === "servico" ? "Chamados" : "Lanç."), h("th", { className: "num" }, "Receita"),
            h("th", { className: "num" }, "Custos"), h("th", { className: "num" }, "Impostos"), comDesp ? h("th", { className: "num" }, "Despesas") : null, h("th", { className: "num" }, "Resultado"), h("th", null, "Margem"),
            comRec ? h("th", { className: "num" }, "Em aberto") : null)),
          h("tbody", null, linhas.map(l => h("tr", { key: l.k, className: clicavel ? "fi-clicavel" : "", style: clicavel ? { cursor: "pointer" } : null, title: clicavel ? "Ver serviço por serviço e cada lançamento" : undefined,
              onClick: clicavel ? () => setDet({ dim: d.dim, id: l.id || 0, nome: l.nome }) : undefined },
            h("td", null, h("b", null, l.nome), l.sub ? h("small", { style: { display: "block", color: "var(--tinta-2)" } }, l.sub) : null),
            h("td", { className: "num" }, l.qtd), h("td", { className: "num" }, BRL(l.receita)), custoCel(l),
            h("td", { className: "num sai" }, l.imposto ? BRL(-l.imposto) : "—"), comDesp ? h("td", { className: "num sai" }, l.despesa ? BRL(-l.despesa) : "—") : null,
            h("td", { className: "num" + (l.resultado < 0 ? " sai" : "") }, h("b", null, BRL(l.resultado))),
            h("td", { className: "fi-rent-m" }, h("div", { className: "fi-rent-barra" }, h("i", { style: { width: Math.max(2, Math.abs(l.receita) / maxR * 100) + "%" } }),
              h("i", { className: "res" + (l.resultado < 0 ? " neg" : ""), style: { width: Math.max(0, Math.min(100, Math.abs(l.resultado) / maxR * 100)) + "%" } })), h("span", null, margem(l.margem))),
            comRec ? h("td", { className: "num" }, l.aberto ? BRL(l.aberto) : "—") : null))),
          h("tfoot", null, h("tr", null, h("td", null, filtro.trim() ? "Total filtrado" : "Total"), h("td", { className: "num" }, tot.qtd), h("td", { className: "num" }, BRL(tot.receita)), h("td", { className: "num" }, BRL(-tot.custo)),
            h("td", { className: "num" }, BRL(-tot.imposto)), comDesp ? h("td", { className: "num" }, BRL(-tot.despesa)) : null, h("td", { className: "num" }, BRL(tot.resultado)), h("td", null, margem(tot.margem)),
            comRec ? h("td", { className: "num" }, BRL(tot.aberto)) : null))))),
        h("p", { className: "cel-sub" }, d.nota),
        clicavel ? h("p", { className: "cel-sub" }, "Toque numa linha para ver serviço por serviço e cada lançamento — e corrigir o que estiver no lugar errado.") : null),
      det ? h(DetalheRent, { inicial: det, per, op, versao, abrir, mudou, aoFechar: () => setDet(null) }) : null);
  }

  /* v1.37.0: detalhe de uma linha (cliente → serviços → lançamentos) */
  function DetalheRent({ inicial, per, op, versao, abrir, mudou, aoFechar }) {
    const [pilha, setPilha] = useState([inicial]);
    const atual = pilha[pilha.length - 1];
    const [d, setD] = useState(null);
    const [ajuste, setAjuste] = useState(null);
    const [v2, setV2] = useState(0);
    useEffect(() => { setD(null); api("fin.rentabilidade.detalhe", { de: per.de, ate: per.ate, dim: atual.dim, id: atual.id }).then(setD, e => K.avisar(e.message, true)); }, [atual.dim, atual.id, versao, v2]); // eslint-disable-line
    const margem = m => m == null ? "—" : String(m).replace(".", ",") + "%";
    const CL = { receita: ["Receita", "ent"], custo: ["Custo", "sai"], despesa: ["Despesa", "sai"] };
    const t = d && d.totais;
    const resumo = t ? h("div", { className: "fi-tot", style: { flexWrap: "wrap", gap: "4px 14px" } },
      h("span", null, "Receita ", h("b", { className: "ent" }, BRL(t.receita))),
      h("span", null, "Custos ", h("b", { className: "sai" }, BRL(-t.custo))),
      h("span", null, "Despesas ", h("b", { className: "sai" }, BRL(-t.despesa))),
      h("span", null, "Impostos ", h("b", { className: "sai" }, BRL(-t.imposto))),
      h("span", null, "Resultado ", h("b", { className: t.resultado < 0 ? "sai" : "ent" }, BRL(t.resultado)), " · margem " + margem(t.margem))) : null;
    return h(React.Fragment, null,
      h(Painel, { titulo: d ? d.nome : atual.nome, sub: rotMesLongo(per.de) + " a " + rotMesLongo(per.ate) + (atual.dim === "cliente" ? " · serviço por serviço" : ""), aoFechar, largo: true,
        rodape: [pilha.length > 1 ? h("button", { key: "v", className: "bt", onClick: () => setPilha(p => p.slice(0, -1)) }, "← Voltar") : null,
                 h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
        !d ? h("div", { className: "vazio" }, "Carregando…") : h(React.Fragment, null,
          resumo,
          d.servicos.length ? h("div", { className: "tabela-caixa", style: { marginBottom: 14 } }, h("table", { className: "tabela fi-rent" },
            h("thead", null, h("tr", null, h("th", null, "Serviço"), h("th", { className: "num" }, "Receita"), h("th", { className: "num" }, "Custos"), h("th", { className: "num" }, "Despesas"),
              h("th", { className: "num" }, "Impostos"), h("th", { className: "num" }, "Resultado"), h("th", { className: "num" }, "Margem"))),
            h("tbody", null, d.servicos.map(s => h("tr", { key: s.k, style: s.xt ? { cursor: "pointer" } : null, title: s.xt ? "Ver os lançamentos deste serviço" : undefined,
                onClick: s.xt ? () => setPilha(p => p.concat([{ dim: s.xt, id: s.xid, nome: s.nome }])) : undefined },
              h("td", null, h("b", null, s.nome), s.sub ? h("small", { style: { display: "block", color: "var(--tinta-2)" } }, s.sub) : null),
              h("td", { className: "num" }, BRL(s.receita)),
              h("td", { className: "num sai" }, s.custo ? BRL(-s.custo) : "—", s.estimado ? h("small", { style: { display: "block", color: "var(--tinta-2)" } }, "estimado") : null),
              h("td", { className: "num sai" }, s.despesa ? BRL(-s.despesa) : "—"), h("td", { className: "num sai" }, s.imposto ? BRL(-s.imposto) : "—"),
              h("td", { className: "num" + (s.resultado < 0 ? " sai" : "") }, h("b", null, BRL(s.resultado))), h("td", { className: "num" }, margem(s.margem))))))) : null,
          d.estimados.length ? h(Aviso, { tipo: "info" }, "Custo estimado (digitado no chamado, sem nenhum custo lançado ligado a ele): " +
            d.estimados.map(e => e.servico + " " + BRL(e.valor)).join(" · ") + ". Ligue os custos reais ao chamado para trocar a estimativa pelo valor de verdade.") : null,
          h("div", { className: "fi-tot" }, h("span", null, d.itens.length + " lançamento(s)"), h("small", { className: "cel-sub" }, "Abrir = conta a pagar/receber · Ajustar = lançamento avulso do extrato")),
          d.itens.map(x => h("div", { key: x.origem + x.id, className: "fi-mov" }, h("span", { className: "fi-venc" }, dCurta(x.data)),
            h("span", { className: "fi-desc" }, h("b", null, x.descricao || "—"),
              h("span", null, [CL[x.classe][0], x.categoria, x.pessoa !== d.nome ? x.pessoa : null, atual.dim === "cliente" ? (x.servicoCurto || "sem serviço ligado") : null, x.status ? STATUS[x.status] : null].filter(Boolean).join(" · "))),
            h("span", { className: "fi-valor" }, h("b", { className: CL[x.classe][1] }, BRL(x.classe === "receita" ? x.valor : -x.valor))),
            x.origem === "titulo" ? h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => abrir(x.id) }, "Abrir")
              : h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => setAjuste(x) }, "Ajustar"))),
          !d.itens.length && !d.estimados.length ? h("div", { className: "vazio" }, "Nenhum lançamento no período.") : null)),
      ajuste ? h(FormAjusteMov, { op, mov: ajuste, aoFechar: () => setAjuste(null), aoSalvar: () => { setAjuste(null); setV2(v => v + 1); mudou(); } }) : null);
  }

  /* v1.37.0: ajusta categoria, centro, descrição e serviço ligado de um movimento avulso (valor, data e conta não mudam) */
  function FormAjusteMov({ op, mov, aoFechar, aoSalvar }) {
    const tipo = mov.tipo === "entrada" ? "receita" : "despesa";
    const [f, setF] = useState({ categoriaId: mov.categoriaId ? String(mov.categoriaId) : "", centroId: mov.centroId ? String(mov.centroId) : "", descricao: mov.descricao || "",
      vinc: mov.xt ? { valor: mov.xt + ":" + mov.xid, nome: mov.servico } : null });
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    async function salvar() {
      setErro(""); setEnviando(true);
      try { await api("fin.movimento.ajustar", { id: mov.id, categoriaId: f.categoriaId, centroId: f.centroId, descricao: f.descricao, vinculo: f.vinc ? f.vinc.valor : "" });
        K.avisar("Lançamento ajustado."); aoSalvar(); } catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: "Ajustar lançamento", sub: dBR(mov.data) + " · " + BRL(mov.tipo === "entrada" ? mov.valor : -mov.valor) + " · " + (mov.pessoa || "") + " — valor, data e conta não mudam (a conciliação continua valendo).", aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar")] },
      h(Aviso, null, erro),
      h(SelectCategoria, { op, tipo, valor: f.categoriaId, aoMudar: mudar("categoriaId"), dica: "Custo do serviço (ex.: Materiais e peças) entra em Custos; o resto, em Despesas." }),
      op.centros.length ? h(Campo, { rotulo: "Centro de custo" }, h("select", { value: f.centroId, onChange: e => mudar("centroId")(e.target.value) }, h("option", { value: "" }, "—"),
        op.centros.filter(c => c.ativo || String(c.id) === f.centroId).map(c => h("option", { key: c.id, value: c.id }, c.nome)))) : null,
      h(Campo, { rotulo: "Descrição" }, h(Texto, { valor: f.descricao, aoMudar: mudar("descricao") })),
      h(CampoVinculo, { op, valor: f.vinc, aoEscolher: mudar("vinc"), encerrados: true, dica: "Serviço a que este gasto pertence (também chamado concluído). É o que faz o custo aparecer na Rentabilidade do cliente." }));
  }

  /* ---------------- contratos com cobrança (Cadastros) ---------------- */
  function ContratosCobranca({ mudou }) {
    const [l, setL] = useState(null);
    const [erro, setErro] = useState("");
    const [ab, setAb] = useState(null);
    function carregar() { api("fin.contratos.cobranca.listar").then(setL, e => setErro(e.message)); }
    useEffect(carregar, []);
    const COB = { ligada: ["Cobrança ligada", "os-verde"], desligada: ["Desligada", "os-cinza"], nao: ["Sem cobrança", "os-amarelo"] };
    return h("div", null,
      h("p", { className: "cel-sub", style: { marginTop: 0 } }, "Contratos ativos e suspensos do CRM. Com a cobrança ligada, a mensalidade entra sozinha em A receber (mês atual + 2). A configuração também fica no contrato, aba Cobrança."),
      erro ? h(Aviso, null, erro) : null,
      h("div", { className: "bloco" }, !l ? h("div", { className: "vazio" }, erro ? "" : "Carregando…")
        : !l.length ? h("div", { className: "vazio" }, h("strong", null, "Nenhum contrato ativo."), "Os contratos ficam em CRM › Contratos.")
        : h("div", { className: "fi-lista" }, l.map(c => h("button", { key: c.id, type: "button", className: "fi-cat", onClick: () => setAb(c) },
            h("span", { style: { textAlign: "left" } }, h("b", null, "Contrato " + c.numero + " · " + (c.cliente || "")),
              h("small", { style: { display: "block", color: "var(--tinta-2)" } }, [c.status, c.valor != null ? BRL(c.valor) + "/mês" : "sem valor", c.dia ? "dia " + c.dia : null,
                c.proxima ? "próxima " + dBR(c.proxima) : null, c.vencido ? "⚠ vencido " + BRL(c.vencido) : null].filter(Boolean).join(" · "))),
            h("span", { className: "selo " + COB[c.cobranca][1] }, COB[c.cobranca][0]))))),
      ab ? h(Painel, { titulo: "Cobrança · contrato " + ab.numero, sub: ab.cliente, largo: true, aoFechar: () => { setAb(null); carregar(); mudou(); },
          rodape: [h("button", { key: "f", className: "bt", onClick: () => { setAb(null); carregar(); mudou(); } }, "Fechar")] },
          K.CobrancaContrato ? h(K.CobrancaContrato, { contratoId: ab.id }) : h(Aviso, null, "Atualize o app (contratos.js da versão 1.25).")) : null);
  }

  /* =====================================================================
     v1.25.2 — CARTÃO DE CRÉDITO: compra, faturas, pagamento
     ===================================================================== */
  const SIT_FAT = { aberta: ["Aberta", "os-azul"], fechada: ["Fechada", "os-amarelo"], vencida: ["Vencida", "selo-off"], paga: ["Paga", "os-verde"], futura: ["Futura", "os-cinza"] };
  function mesFat(k) { return rotMesLongo(k); }

  function CompraCartao({ op, aoFechar, aoSalvar }) {
    const cartoes = op.contas.filter(c => c.ativa && c.tipo === "cartao");
    const [f, setF] = useState({ contaId: (cartoes[0] && cartoes[0].id) || "", data: hojeISO(), valor: "", descricao: "", categoriaId: "", centroId: "", parcelas: "1", documento: "", pessoa: null });
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(x => Object.assign({}, x, { [k]: v }));
    const c = cartoes.find(x => String(x.id) === String(f.contaId));
    const cats = op.categorias.filter(x => x.ativa && x.tipo === "despesa");
    const parc = Math.max(1, Math.min(48, parseInt(f.parcelas, 10) || 1));
    const vNum = Number(String(f.valor).replace(/\./g, "").replace(",", ".")) || 0;
    /* em que fatura cai (mesma regra do servidor) */
    let cai = null;
    if (c && c.diaMelhorCompra && c.diaVencimento && f.data) {
      const [y, m, dd] = f.data.split("-").map(Number);
      const fech = m + (dd >= c.diaMelhorCompra ? 1 : 0), venc = fech + (c.diaVencimento >= c.diaMelhorCompra ? 0 : 1);
      const dt = new Date(y, venc - 1, 1);
      cai = { mes: dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0"), dia: Math.min(c.diaVencimento, new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()) };
    }
    async function salvar() {
      setErro("");
      if (!f.descricao.trim()) return setErro("Informe a descrição.");
      if (!(vNum > 0)) return setErro("Informe o valor.");
      if (!f.categoriaId) return setErro("Escolha a categoria (ela decide a linha da DRE).");
      setEnviando(true);
      try {
        const r = await api("fin.cartao.compra", Object.assign({}, f, { parcelas: parc, fornecedorId: f.pessoa ? f.pessoa.id : 0, vinc: undefined, vinculo: f.vinc ? f.vinc.valor : "" }));
        K.avisar("Compra lançada · fatura que vence em " + dBR(r.vencimento) + ".");
        aoSalvar(r.id);
      } catch (x) { setErro(x.message); setEnviando(false); }
    }
    if (!cartoes.length) return h(Painel, { titulo: "Compra no cartão", aoFechar, rodape: [h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      h("div", { className: "vazio" }, h("strong", null, "Nenhum cartão cadastrado."), "Cadastre em Contas › Nova conta › tipo Cartão de crédito."));
    return h(Painel, { titulo: "Compra no cartão", largo: true, aoFechar,
      sub: "Entra como despesa na data da compra (DRE) e sai do caixa no vencimento da fatura.",
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-pagar", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : parc > 1 ? "Lançar em " + parc + "x" : "Lançar compra")] },
      h(Aviso, null, erro),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Cartão" }, h("select", { value: f.contaId, onChange: e => mudar("contaId")(e.target.value) }, cartoes.map(x => h("option", { key: x.id, value: x.id }, x.nome)))),
        h(Campo, { rotulo: "Data da compra" }, h(Texto, { valor: f.data, aoMudar: mudar("data"), type: "date" }))),
      c && !c.diaMelhorCompra ? h("div", { className: "aviso aviso-alerta" }, "Este cartão está sem o melhor dia de compra e o vencimento. Edite em Contas.") : null,
      h(Campo, { rotulo: "Descrição" }, h(Texto, { valor: f.descricao, aoMudar: mudar("descricao"), placeholder: "Ex.: Peças Frigelar" })),
      h("div", { className: "campo" }, h("span", null, "Fornecedor (opcional)"),
        h(EscolhePessoa, { tipo: "pagar", valor: f.pessoa, aoEscolher: p => setF(x => Object.assign({}, x, { pessoa: p, categoriaId: x.categoriaId || (p && p.categoriaId) || "" })) })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Valor total" }, h(Texto, { valor: f.valor, aoMudar: v => mudar("valor")(numTxt(v)), inputMode: "decimal", placeholder: "0,00" })),
        h(Campo, { rotulo: "Parcelas", dica: parc > 1 && vNum ? parc + " × " + BRL(vNum / parc) : "1 = à vista" }, h(Texto, { valor: f.parcelas, aoMudar: v => mudar("parcelas")(v.replace(/\D/g, "").slice(0, 2)), inputMode: "numeric" }))),
      h("div", { className: "linha-campos" },
        h(SelectCategoria, { op, tipo: "despesa", valor: f.categoriaId, aoMudar: mudar("categoriaId") }),
        op.centros.length ? h(Campo, { rotulo: "Centro de custo" }, h("select", { value: f.centroId, onChange: e => mudar("centroId")(e.target.value) }, h("option", { value: "" }, "—"), op.centros.filter(x => x.ativo).map(x => h("option", { key: x.id, value: x.id }, x.nome)))) : null),
      h(CampoVinculo, { op, valor: f.vinc, aoEscolher: mudar("vinc"), dica: "Ex.: peças compradas para um chamado." }),
      cai ? h("div", { className: "ct-cob-res" }, (parc > 1 ? "1ª parcela" : "Cai") + " na fatura que vence em ", h("b", null, String(cai.dia).padStart(2, "0") + "/" + cai.mes.slice(5) + "/" + cai.mes.slice(0, 4)),
        c.disponivel != null ? " · limite disponível " + BRL(c.disponivel) : "") : null);
  }

  function Faturas({ conta, aoFechar, mudou }) {
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [aberta, setAberta] = useState(null);
    const [itens, setItens] = useState(null);
    const [pagar, setPagar] = useState(null);
    function carregar() { api("fin.cartao.faturas", { contaId: conta.id }).then(setD, e => setErro(e.message)); }
    useEffect(carregar, []); // eslint-disable-line
    function abrirFat(k) {
      if (aberta === k) { setAberta(null); return; }
      setAberta(k); setItens(null);
      api("fin.cartao.fatura.itens", { contaId: conta.id, chave: k }).then(r => setItens(r.itens), e => K.avisar(e.message, true));
    }
    const c = d && d.conta;
    return h(Painel, { titulo: "Faturas · " + conta.nome, largo: true, aoFechar,
      sub: c ? "Melhor dia de compra " + c.diaMelhorCompra + " · vence todo dia " + c.diaVencimento : "",
      rodape: [h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      erro ? h(Aviso, null, erro) : null,
      !d ? h("div", { className: "vazio" }, erro ? "" : "Carregando…") : h(React.Fragment, null,
        c.limite != null ? h("div", { className: "fi-lim" },
          h("div", null, h("small", null, "Limite"), h("b", null, BRL(c.limite))), h("div", null, h("small", null, "Usado (inclui parcelas futuras)"), h("b", { className: "sai" }, BRL(c.usado))),
          h("div", null, h("small", null, "Disponível"), h("b", { className: c.disponivel < 0 ? "sai" : "ent" }, BRL(c.disponivel))),
          h("div", { className: "fi-lim-barra" }, h("i", { style: { width: Math.min(100, c.limite ? c.usado / c.limite * 100 : 0) + "%" } }))) : null,
        d.faturas.map(f => h("div", { key: f.chave, className: "fi-fat" + (aberta === f.chave ? " aberta" : "") },
          h("button", { type: "button", className: "fi-fat-l", onClick: () => abrirFat(f.chave) },
            h("span", { className: "fi-fat-m" }, h("b", null, mesFat(f.chave)), h("small", null, "fecha " + dBR(f.fechamento) + " · vence " + dBR(f.vencimento))),
            h("span", { className: "selo " + SIT_FAT[f.situacao][1] }, SIT_FAT[f.situacao][0]),
            h("span", { className: "fi-fat-v" }, h("b", null, BRL(f.compras)), f.creditos ? h("small", null, "pago " + BRL(f.creditos)) : null,
              f.saldo > 0 && f.creditos ? h("small", { className: "sai" }, "falta " + BRL(f.saldo)) : null)),
          f.saldo > 0.004 && f.situacao !== "futura" ? h("button", { type: "button", className: "bt bt-p bt-pagar", onClick: () => setPagar(f) }, "Pagar") : null,
          aberta === f.chave ? h("div", { className: "fi-fat-itens" }, !itens ? h("div", { className: "cel-sub" }, "Carregando…")
            : !itens.length ? h("div", { className: "cel-sub" }, "Sem lançamentos nesta fatura" + (f.compras ? " (saldo inicial do cartão)." : "."))
            : itens.map(i => h("div", { key: i.id, className: "fi-mov" }, h("span", { className: "fi-venc" }, dCurta(i.data)),
                h("span", { className: "fi-desc" }, h("b", null, i.descricao || "—"), h("span", null, i.pagamento ? "pagamento" : i.categoria || "")),
                h("span", { className: "fi-valor" }, h("b", { className: i.valor >= 0 ? "ent" : "sai" }, BRL(i.valor))), h("span")))) : null)),
        h("p", { className: "cel-sub" }, "Compra a partir do melhor dia vai para a fatura seguinte. Parcelado: cada parcela cai numa fatura. Pagar = transferência do banco para o cartão (não é despesa nova).")),
      pagar ? h(FormTransferencia, { op: { contas: [] }, bancos: d.bancos, inicial: { paraId: conta.id, valor: valTxt(pagar.saldo), data: pagar.vencimento < hojeISO() ? hojeISO() : pagar.vencimento, fatura: pagar.chave,
          descricao: "Pagamento fatura " + conta.nome + " " + pagar.chave.slice(5) + "/" + pagar.chave.slice(0, 4) },
        titulo: "Pagar fatura de " + mesFat(pagar.chave), aoFechar: () => setPagar(null), aoSalvar: () => { setPagar(null); carregar(); mudou(); } }) : null);
  }

  K.modulos = K.modulos || {};
  K.modulos.financeiro = { titulo: "Financeiro", icone: "dinheiro", perfis: ["admin", "financeiro"], grupo: "Financeiro", modulo: "erp", Tela: Financeiro };
})();
