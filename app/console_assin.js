/* =====================================================================
   SGClim — app/console_assin.js  (v1.30.0)
   Console da plataforma › Assinaturas (situação das empresas, receita,
   Asaas, regras do teste e do atraso) e › Planos (preços e módulos).
   v1.33.0: forma de cobrança (só Pix / Pix, boleto e cartão) e anual nas
   regras; indicadores que se cadastram sozinhos em /indique/ e regra padrão.
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Aviso, Painel } = K;
  const { useState } = React;

  const BRL = n => n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dia = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—";
  const FASE = {
    teste: ["Teste", "selo-info"], teste_fim: ["Teste encerrado", "selo-off"], ativa: ["Ativa", "selo-ok"], atrasada: ["Em atraso", "selo-aviso"],
    bloqueada: ["Só consulta", "selo-off"], cancelada: ["Cancelada", "selo-aviso"], encerrada: ["Encerrada", "selo-off"], isenta: ["Isenta", ""], cortesia: ["Cortesia", "selo-info"], cortesia_fim: ["Cortesia encerrada", "selo-off"], livre: ["Sem assinatura", ""],
  };
  const MODS = [["os", "Ordens de serviço"], ["tarefas", "Tarefas"], ["pmoc", "PMOC e portal do cliente"], ["contratos", "Contratos"], ["erp", "Financeiro (contas a pagar e receber)"], ["erp_avancado", "DRE, fluxo, rentabilidade e conciliação"], ["assistente", "Assistente de IA"]];

  function Assinaturas() {
    const [d, recarregar] = K.useDados("assinaturas.resumo");
    const [aberto, setAberto] = useState(null);   /* {tipo, empresa} */
    const [testando, setTestando] = useState(false);
    if (d.carregando && !d.dados) return h("div", { className: "bloco vazio" }, "Carregando…");
    if (d.erro) return h("div", { className: "bloco vazio" }, h(Aviso, null, d.erro), h("button", { className: "bt", onClick: recarregar }, "Tentar de novo"));
    const r = d.dados, c = r.contagem || {};
    async function testar() {
      setTestando(true);
      try { const x = await api("assinaturas.asaas_testar"); K.avisar("Asaas respondeu (" + (x.ambiente === "producao" ? "produção" : "sandbox") + "). Clientes cadastrados: " + x.clientes + "."); }
      catch (x) { K.avisar(x.message, true); }
      setTestando(false);
    }
    async function sincronizar(e) {
      try { await api("assinaturas.empresa_sincronizar", { empresaId: e.id }); K.avisar(e.nome + ": situação atualizada."); recarregar(); } catch (x) { K.avisar(x.message, true); }
    }
    async function isentar(e, sim) {
      const ok = await K.confirmar(sim ? { titulo: "Isentar " + e.nome + "?", texto: "A empresa deixa de ser cobrada e todos os módulos liberados na plataforma ficam disponíveis.", botao: "Isentar" }
                                       : { titulo: "Tirar a isenção de " + e.nome + "?", texto: "A empresa volta para o teste grátis (prazo das regras) e depois precisa assinar.", botao: "Tirar isenção", perigo: true });
      if (!ok) return;
      try { await api("assinaturas.empresa_isentar", { empresaId: e.id, isenta: sim }); K.avisar("Feito."); recarregar(); } catch (x) { K.avisar(x.message, true); }
    }
    const kpi = (rot, val) => h("div", { className: "ca-kpi" }, h("small", null, rot), h("b", null, val));
    return h("div", null,
      h("div", { className: "ca-kpis" },
        kpi("Receita mensal (assinantes)", BRL(r.receitaMensal)),
        kpi("Ativas", (c.ativa || 0) + (c.atrasada || 0)),
        kpi("Em teste", c.teste || 0),
        kpi("Cortesia (MVP)", c.cortesia || 0),
        kpi("Em atraso / só consulta", (c.atrasada || 0) + (c.bloqueada || 0) + (c.teste_fim || 0) + (c.cortesia_fim || 0) + (c.encerrada || 0)),
        kpi("Isentas", c.isenta || 0),
        r.indicacoes ? kpi("Comissões a pagar", BRL(r.comissoesPendentes)) : null),

      h("div", { className: "bloco" },
        h("div", { className: "bloco-cab" }, h("h2", null, "Empresas")),
        h("div", { className: "bloco-corpo", style: { paddingTop: 12 } }, h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "Empresa"), h("th", null, "Situação"), h("th", null, "Plano"), h("th", { className: "num" }, "Por mês"),
            h("th", null, "Usuários"), h("th", null, "Fatura / prazo"), h("th", { className: "acoes" }))),
          h("tbody", null, r.empresas.map(e => {
            const f = FASE[e.fase] || [e.fase, ""];
            const prazo = e.fase === "teste" || e.fase === "teste_fim" ? "teste até " + dia(e.testeAte)
              : e.fase === "cortesia" || e.fase === "cortesia_fim" ? "sem cobrança até " + dia(e.testeAte)
              : e.fase === "cancelada" || e.fase === "encerrada" ? "usa até " + dia(e.pagoAte)
              : e.aberta ? (e.atrasoDias > 0 ? "vencida há " + e.atrasoDias + " dia(s)" : "vence " + dia(e.aberta.vencimento)) : e.fase === "ativa" ? "em dia" : "—";
            return h("tr", { key: e.id },
              h("td", null, h("b", null, e.nome), e.ativa ? null : h("div", { className: "cel-sub" }, "empresa desativada"), e.observacao ? h("div", { className: "cel-sub" }, e.observacao) : null,
                e.indicador ? h("div", { className: "cel-sub" }, e.indicador) : null),
              h("td", null, h("span", { className: "selo " + f[1] }, f[0])),
              h("td", null, e.plano ? e.plano + (e.ciclo === "anual" && e.fase !== "teste" ? " · anual" : "") : "—"),
              h("td", { className: "num" }, ["ativa", "atrasada", "bloqueada"].indexOf(e.fase) >= 0 ? BRL(e.mensal) : "—"),
              h("td", null, e.usuarios + (e.limite != null ? " / " + e.limite : "")),
              h("td", null, prazo),
              h("td", { className: "acoes" }, h("button", { className: "bt bt-p", onClick: () => setAberto({ tipo: "gerir", e }) }, "Gerir")));
          })))))),

      h("div", { className: "bloco" },
        h("div", { className: "bloco-cab" }, h("h2", null, "Cobrança e regras")),
        h("div", { className: "bloco-corpo ca-cfg" },
          h("div", null,
            h("div", { className: "secao-titulo" }, "Asaas"),
            h("div", { className: "ca-linha" }, "Chave de API:", h("span", { className: "selo " + (r.asaas.configurado ? "selo-ok" : "selo-off") }, r.asaas.configurado ? "configurada" : "falta configurar"),
              h("span", { className: "selo " + (r.asaas.ambiente === "producao" ? "selo-ok" : "selo-aviso") }, r.asaas.ambiente === "producao" ? "produção" : "sandbox (teste)")),
            h("div", { className: "ca-linha" }, "Token do webhook:", h("span", { className: "selo " + (r.asaas.webhookToken ? "selo-ok" : "selo-off") }, r.asaas.webhookToken ? "configurado" : "falta configurar")),
            h("div", { className: "ca-linha" }, "URL do webhook:", h("span", { className: "ca-url" }, r.asaas.webhookUrl),
              h("button", { className: "bt bt-p", onClick: () => { try { navigator.clipboard.writeText(r.asaas.webhookUrl); K.avisar("URL copiada."); } catch (x) {} } }, "Copiar")),
            h("button", { className: "bt", disabled: !r.asaas.configurado || testando, onClick: testar }, testando ? "Testando…" : "Testar conexão com o Asaas")),
          h(Regras, { regras: r.regras, planos: r.planos, aoSalvar: recarregar }))),

      aberto && aberto.tipo === "cobrancas" ? h(Faturas, { e: aberto.e, aoFechar: () => setAberto(null) }) : null,
      aberto && aberto.tipo === "gerir" ? h(Gerir, { e: aberto.e, planos: r.planos, indicacoes: r.indicacoes, aoFechar: () => setAberto(null),
        abrir: t => setAberto({ tipo: t, e: aberto.e }), sincronizar: () => { sincronizar(aberto.e); setAberto(null); },
        isentar: sim => { setAberto(null); isentar(aberto.e, sim); }, aoSalvar: () => { setAberto(null); recarregar(); } }) : null,
      aberto && aberto.tipo === "cortesia" ? h(Cortesia, { e: aberto.e, planos: r.planos, aoFechar: () => setAberto(null), aoSalvar: () => { setAberto(null); recarregar(); } }) : null,
      aberto && aberto.tipo === "teste" ? h(PrazoTeste, { e: aberto.e, aoFechar: () => setAberto(null), aoSalvar: () => { setAberto(null); recarregar(); } }) : null);
  }

  function Regras({ regras, planos, aoSalvar }) {
    const [f, setF] = useState({ diasTeste: String(regras.diasTeste), diasBloqueio: String(regras.diasBloqueio), planoTeste: regras.planoTeste,
      formaPagamento: regras.formaPagamento || "PIX", permiteAnual: !!regras.permiteAnual });
    const [salvando, setSalvando] = useState(false);
    async function salvar() {
      setSalvando(true);
      try { await api("assinaturas.regras_salvar", f); K.avisar("Regras salvas. Valem para as próximas empresas e para os próximos atrasos."); aoSalvar(); } catch (x) { K.avisar(x.message, true); }
      setSalvando(false);
    }
    const m = k => v => setF(Object.assign({}, f, { [k]: v }));
    return h("div", null,
      h("div", { className: "secao-titulo" }, "Regras"),
      h("div", { className: "ca-regras" },
        h(Campo, { rotulo: "Dias de teste grátis" }, h(Texto, { valor: f.diasTeste, aoMudar: m("diasTeste"), inputMode: "numeric" })),
        h(Campo, { rotulo: "Dias de atraso até só consulta" }, h(Texto, { valor: f.diasBloqueio, aoMudar: m("diasBloqueio"), inputMode: "numeric" })),
        h(Campo, { rotulo: "Plano no teste" }, h("select", { className: "entrada-texto", value: f.planoTeste, onChange: ev => m("planoTeste")(ev.target.value) },
          planos.map(p => h("option", { key: p.id, value: p.chave }, p.nome)))),
        /* v1.33.0 */
        h(Campo, { rotulo: "Forma de pagamento", dica: "Vale para assinaturas novas e, ao sincronizar, para as faturas em aberto." }, h("select", { className: "entrada-texto", value: f.formaPagamento, onChange: ev => m("formaPagamento")(ev.target.value) },
          h("option", { value: "PIX" }, "Só Pix"), h("option", { value: "UNDEFINED" }, "Pix, boleto ou cartão (escolhe na fatura)"))),
        h(Campo, { rotulo: "Plano anual" }, h("label", { className: "ca-linha" }, h("input", { type: "checkbox", checked: f.permiteAnual, onChange: ev => m("permiteAnual")(ev.target.checked) }), "Oferecer anual (paga 10, usa 12)"))),
      h("button", { className: "bt bt-marca", disabled: salvando, onClick: salvar }, salvando ? "Salvando…" : "Salvar regras"));
  }

  function Faturas({ e, aoFechar }) {
    const [d] = K.useDados("assinaturas.empresa_cobrancas", { empresaId: e.id });
    return h(Painel, { titulo: "Faturas · " + e.nome, sub: e.cobrancaEmail ? "Enviadas para " + e.cobrancaEmail : null, aoFechar, rodape: [h("button", { key: "f", className: "bt", onClick: aoFechar }, "Fechar")] },
      d.carregando ? h("div", { className: "vazio" }, "Carregando…") : d.erro ? h(Aviso, null, d.erro)
      : !d.dados.length ? h("div", { className: "vazio" }, "Nenhuma fatura ainda.")
      : h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "Vencimento"), h("th", { className: "num" }, "Valor"), h("th", null, "Situação"), h("th", null, "Pago em"), h("th", { className: "acoes" }))),
          h("tbody", null, d.dados.map(c => h("tr", { key: c.id },
            h("td", null, dia(c.vencimento)), h("td", { className: "num" }, BRL(c.valor)), h("td", null, c.statusTxt),
            h("td", null, c.pagoEm ? dia(c.pagoEm) + (c.forma ? " · " + c.forma : "") : "—"),
            h("td", { className: "acoes" }, c.link ? h("a", { className: "bt bt-p bt-leve", href: c.link, target: "_blank", rel: "noopener" }, "Abrir") : null)))))));
  }

  /* v1.31.0: tudo o que dá para fazer com uma empresa, num lugar só */
  function Gerir({ e, planos, indicacoes, aoFechar, abrir, sincronizar, isentar, aoSalvar }) {
    const [inds, setInds] = useState(null);
    const [ind, setInd] = useState(e.indicadorId ? String(e.indicadorId) : "");
    React.useEffect(() => { if (indicacoes) api("assinaturas.indicadores").then(l => setInds(l), () => setInds([])); }, []);
    async function ligar() {
      try { await api("assinaturas.empresa_indicador", { empresaId: e.id, indicadorId: ind ? +ind : null }); K.avisar("Indicação atualizada."); aoSalvar(); } catch (x) { K.avisar(x.message, true); }
    }
    const f = FASE[e.fase] || [e.fase, ""];
    const op = (rot, dica, onClick, perigo) => h("button", { type: "button", className: "ca-op" + (perigo ? " perigo" : ""), onClick }, h("b", null, rot), h("small", null, dica));
    return h(Painel, { titulo: e.nome, sub: f[0] + (e.plano ? " · " + e.plano : ""), aoFechar, rodape: [h("button", { key: "f", className: "bt", onClick: aoFechar }, "Fechar")] },
      h("div", { className: "ca-ops" },
        e.asaasAssinatura ? op("Faturas", "Ver as faturas no Asaas e se foram pagas", () => abrir("cobrancas")) : null,
        e.asaasAssinatura ? op("Atualizar situação", "Conferir agora no Asaas", sincronizar) : null,
        !e.asaasAssinatura && e.fase !== "isenta" ? op("Cortesia (sem cobrança até…)", "Para empresas do MVP: usa tudo sem pagar até a data combinada; depois precisa assinar", () => abrir("cortesia")) : null,
        !e.asaasAssinatura && e.fase !== "isenta" ? op("Prazo de teste", "Dar mais dias de teste grátis", () => abrir("teste")) : null,
        e.fase === "isenta" ? op("Tirar isenção", "Volta para o teste grátis e depois precisa assinar", () => isentar(false), true)
        : !e.asaasAssinatura ? op("Isentar", "Nunca é cobrada (empresa da casa ou parceira)", () => isentar(true)) : null),
      indicacoes ? h("div", { style: { marginTop: 18 } },
        h("div", { className: "secao-titulo" }, "Quem indicou esta empresa"),
        e.indicador ? h("p", { className: "cel-sub", style: { margin: "0 0 8px" } }, e.indicador) : null,
        inds === null ? h("div", { className: "cel-sub" }, "Carregando…") : h("div", { className: "as-codigo-linha" },
          h("select", { className: "entrada-texto", value: ind, onChange: ev => setInd(ev.target.value) },
            h("option", { value: "" }, "Ninguém / tirar indicação"), inds.map(i => h("option", { key: i.id, value: i.id }, i.nome + " (" + i.codigo + ")"))),
          h("button", { type: "button", className: "bt", onClick: ligar }, "Salvar"))) : null);
  }

  function Cortesia({ e, planos, aoFechar, aoSalvar }) {
    const seis = new Date(); seis.setMonth(seis.getMonth() + 6);
    const [ate, setAte] = useState((e.fase === "cortesia" && e.testeAte) || seis.toISOString().slice(0, 10));
    const [planoId, setPlanoId] = useState(e.planoId || (planos[planos.length - 1] || {}).id || "");
    const [obs, setObs] = useState(e.fase === "cortesia" ? e.observacao || "" : "");
    const [erro, setErro] = useState("");
    async function salvar() {
      setErro("");
      try { await api("assinaturas.empresa_cortesia", { empresaId: e.id, ate, planoId: +planoId, observacao: obs }); K.avisar("Cortesia registrada."); aoSalvar(); } catch (x) { setErro(x.message); }
    }
    return h(Painel, { titulo: "Cortesia · " + e.nome, aoFechar,
        rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar }, "Salvar")] },
      h(Aviso, null, erro),
      h("p", null, "A empresa usa o plano escolhido sem pagar até a data (inclusive), sem limite de usuários. 15 dias antes, o administrador dela vê um aviso para assinar; se assinar antes, a 1ª fatura só vence depois dessa data. Sem assinatura, depois da data o sistema fica em modo de consulta."),
      h(Campo, { rotulo: "Sem cobrança até" }, h("input", { className: "entrada-texto", type: "date", value: ate, onChange: ev => setAte(ev.target.value) })),
      h(Campo, { rotulo: "Plano liberado" }, h("select", { className: "entrada-texto", value: planoId, onChange: ev => setPlanoId(ev.target.value) }, planos.map(p => h("option", { key: p.id, value: p.id }, p.nome)))),
      h(Campo, { rotulo: "Observação (só você vê)", dica: "Ex.: MVP — combinado com o João em out/2026" }, h(Texto, { valor: obs, aoMudar: setObs })));
  }

  function PrazoTeste({ e, aoFechar, aoSalvar }) {
    const [ate, setAte] = useState(e.testeAte && e.testeAte >= new Date().toISOString().slice(0, 10) ? e.testeAte : new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
    const [erro, setErro] = useState("");
    async function salvar() {
      setErro("");
      try { await api("assinaturas.empresa_teste", { empresaId: e.id, ate }); K.avisar("Prazo de teste ajustado."); aoSalvar(); } catch (x) { setErro(x.message); }
    }
    return h(Painel, { titulo: "Prazo de teste · " + e.nome, aoFechar,
        rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar }, "Salvar")] },
      h(Aviso, null, erro),
      h("p", null, "A empresa usa tudo do plano de teste até essa data (inclusive). Depois, sem assinatura, fica em modo de consulta."),
      h(Campo, { rotulo: "Teste até" }, h("input", { className: "entrada-texto", type: "date", value: ate, onChange: ev => setAte(ev.target.value) })));
  }

  /* ---------------- planos ---------------- */

  function Planos() {
    const [d, recarregar] = K.useDados("assinaturas.resumo");
    const [editando, setEditando] = useState(null);
    if (d.carregando && !d.dados) return h("div", { className: "bloco vazio" }, "Carregando…");
    if (d.erro) return h("div", { className: "bloco vazio" }, h(Aviso, null, d.erro), h("button", { className: "bt", onClick: recarregar }, "Tentar de novo"));
    const planos = d.dados.planos;
    const assinantes = id => d.dados.empresas.filter(e => e.planoId === id && e.asaasAssinatura).length;
    return h("div", null,
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" } },
        h("p", { style: { margin: 0, color: "var(--tinta-2)", maxWidth: 720 } }, "Preço novo vale na hora para quem assinar daqui em diante. Para quem já assina, use “Aplicar aos assinantes” (vale a partir da próxima fatura — avise os clientes antes)."),
        h("button", { className: "bt bt-marca", onClick: () => setEditando({}) }, "+ Novo plano")),
      h("div", { className: "as-planos" }, planos.map(p => h("div", { key: p.id, className: "as-plano" + (p.ativo ? "" : " inativo"), style: p.ativo ? null : { opacity: .6 } },
        h("div", { className: "as-plano-cab" }, h("b", null, p.nome), p.ativo ? null : h("span", { className: "selo selo-plain" }, "fora de venda")),
        h("div", { className: "as-preco" }, BRL(p.precoMensal), h("small", null, "/mês")),
        p.promoCadastro && p.promoCadastro.ativo ? h("div", { className: "cel-sub", style: { color: "var(--ok)", fontWeight: 600 } }, "Lançamento: " + BRL(p.promoCadastro.precoMensal) + " por " + p.promoCadastro.meses + " meses" + (p.promoCadastro.ate ? " · até " + dia(p.promoCadastro.ate) : "")) : null,
        d.dados.regras && d.dados.regras.permiteAnual ? h("div", { className: "cel-sub" }, "Anual: " + BRL(p.precoAnual) + " (" + p.mesesAnual + " meses)") : null,   /* v1.35.0: anual só se liberado nas regras */
        h("ul", { className: "as-itens" }, h("li", null, p.usuariosInclusos + " usuários · extra " + BRL(p.precoUsuarioExtra)),
          MODS.filter(([k]) => p.modulos.indexOf(k) >= 0).map(([k, n]) => h("li", { key: k }, n))),
        p.itens && p.itens.length ? h("div", { className: "cel-sub" }, "✎ cartão com " + p.itens.length + " item(ns) escrito(s) por você") : null,
        h("div", { className: "cel-sub" }, assinantes(p.id) + " assinante(s)"),
        h("div", { style: { display: "flex", gap: 8, marginTop: 8 } }, h("button", { className: "bt bt-p", onClick: () => setEditando(p) }, "Editar"))))),
      editando ? h(FormPlano, { p: editando, assinantes: editando.id ? assinantes(editando.id) : 0, aoFechar: () => setEditando(null), aoSalvar: () => { setEditando(null); recarregar(); } }) : null);
  }

  /* v1.38.0: a mesma lista automática da tela de Assinatura (textos fixos por módulo) */
  const MODS_VENDA = { os: "Ordens de serviço e app do técnico", tarefas: "Agenda e tarefas", pmoc: "PMOC completo, equipamentos e portal do cliente", contratos: "Contratos recorrentes",
    erp: "Financeiro: contas a pagar e a receber", erp_avancado: "DRE, fluxo de caixa, rentabilidade e conciliação bancária", assistente: "Assistente de IA" };
  const autoItens = f => ["Até " + (+f.usuariosInclusos || 0) + " usuários da equipe", "CRM: clientes, chamados e orçamentos"].concat(MODS.map(([k]) => k).filter(k => f.modulos.indexOf(k) >= 0).map(k => MODS_VENDA[k]));

  function FormPlano({ p, assinantes, aoFechar, aoSalvar }) {
    const num = v => v == null ? "" : Number(v).toFixed(2).replace(".", ",");
    const [f, setF] = useState({ id: p.id || 0, nome: p.nome || "", chave: p.chave || "", descricao: p.descricao || "", precoMensal: num(p.precoMensal), mesesAnual: String(p.mesesAnual || 10),
      usuariosInclusos: String(p.usuariosInclusos || 3), precoUsuarioExtra: num(p.precoUsuarioExtra != null ? p.precoUsuarioExtra : 19.9), modulos: p.modulos || ["os", "tarefas"], ativo: p.ativo !== false,
      promoAtivo: !!(p.promoCadastro && p.promoCadastro.ativo), promoPreco: p.promoCadastro ? num(p.promoCadastro.precoMensal) : "", promoMeses: String(p.promoCadastro ? p.promoCadastro.meses : 12), promoAte: (p.promoCadastro && p.promoCadastro.ate) || "", ordem: p.ordem || 0,
      itens: (p.itens || []).join("\n") });   /* v1.38.0 */
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    const m = k => v => setF(Object.assign({}, f, { [k]: v }));
    const togMod = k => setF(Object.assign({}, f, { modulos: f.modulos.indexOf(k) >= 0 ? f.modulos.filter(x => x !== k) : f.modulos.concat([k]) }));
    async function salvar() {
      setErro(""); setSalvando(true);
      try {
        const r = await api("assinaturas.plano_salvar", f);
        K.avisar("Plano salvo.");
        if (r.assinantes > 0 && await K.confirmar({ titulo: "Aplicar o preço aos " + r.assinantes + " assinante(s)?",
            texto: "O valor da assinatura de quem já está neste plano passa a ser o novo, a partir da próxima fatura. As faturas já geradas não mudam. Avise os clientes antes (os Termos pedem 30 dias de aviso).", botao: "Aplicar" })) {
          const x = await api("assinaturas.plano_aplicar_preco", { planoId: r.plano.id });
          K.avisar(x.atualizadas + " assinatura(s) atualizada(s)." + (x.falhas.length ? " Falhas: " + x.falhas.join("; ") : ""), !!x.falhas.length);
        }
        aoSalvar();
      } catch (x) { setErro(x.message); setSalvando(false); }
    }
    return h(Painel, { titulo: p.id ? "Editar plano" : "Novo plano", sub: p.id && assinantes ? assinantes + " empresa(s) assinam este plano" : null, aoFechar,
        rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", disabled: salvando, onClick: salvar }, salvando ? "Salvando…" : "Salvar")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Nome" }, h(Texto, { valor: f.nome, aoMudar: m("nome") })),
      h(Campo, { rotulo: "Descrição curta" }, h(Texto, { valor: f.descricao, aoMudar: m("descricao") })),
      h("div", { className: "ca-regras" },
        h(Campo, { rotulo: "Preço mensal (R$)" }, h(Texto, { valor: f.precoMensal, aoMudar: m("precoMensal"), inputMode: "decimal" })),
        h(Campo, { rotulo: "Anual = meses", dica: "10 = paga 10, usa 12" }, h(Texto, { valor: f.mesesAnual, aoMudar: m("mesesAnual"), inputMode: "numeric" })),
        h(Campo, { rotulo: "Ordem na vitrine" }, h(Texto, { valor: String(f.ordem), aoMudar: m("ordem"), inputMode: "numeric" }))),
      h("div", { className: "ca-regras" },
        h(Campo, { rotulo: "Usuários incluídos" }, h(Texto, { valor: f.usuariosInclusos, aoMudar: m("usuariosInclusos"), inputMode: "numeric" })),
        h(Campo, { rotulo: "Usuário extra (R$/mês)" }, h(Texto, { valor: f.precoUsuarioExtra, aoMudar: m("precoUsuarioExtra"), inputMode: "decimal" })),
        h("div")),
      h("div", { className: "secao-titulo" }, "Módulos do plano (o CRM vem em todos)"),
      h("div", { className: "ca-mods" }, MODS.map(([k, n]) => h("label", { key: k }, h("input", { type: "checkbox", checked: f.modulos.indexOf(k) >= 0, onChange: () => togMod(k) }), n))),
      /* v1.38.0: lista do cartão escrita à mão (em branco = automática pelos módulos) */
      h("div", { className: "secao-titulo" }, "Itens do cartão do plano"),
      h(Campo, { rotulo: "Um item por linha (é o que as empresas veem embaixo do preço)", dica: "Em branco, o sistema monta a lista sozinho pelos módulos marcados. Os módulos continuam decidindo o que a empresa pode usar." },
        h("textarea", { className: "entrada-texto", rows: 7, value: f.itens, onChange: ev => m("itens")(ev.target.value),
          placeholder: autoItens(f).join("\n") })),
      !f.itens.trim() ? h("button", { type: "button", className: "bt bt-p bt-leve", style: { marginTop: -6, marginBottom: 10 },
        onClick: () => m("itens")(autoItens(f).join("\n")) }, "Começar da lista automática") : null,
      h("div", { className: "secao-titulo" }, "Descontos"),
      h("p", { className: "cel-sub" }, "Nesta fase não há preço de lançamento nem desconto automático: todas as empresas pagam o preço do plano. Para dar desconto a uma empresa, crie um cupom em Indicações e cupons (dá para limitar a 1 uso) e passe o código só para ela."),
      h("label", { className: "ca-linha" }, h("input", { type: "checkbox", checked: f.ativo, onChange: ev => m("ativo")(ev.target.checked) }), "À venda (aparece para as empresas)"),
      h("p", { className: "cel-sub" }, "O módulo também precisa estar liberado em Console › Módulos (estágio Geral) para as empresas verem."));
  }

  /* ---------------- v1.31.0: indicações (comissão), comissões e cupons ---------------- */

  const urlIndicacao = c => location.origin + location.pathname.replace(/plataforma\/.*$/, "") + "conheca/?i=" + c;
  function copiar(t, msg) { try { navigator.clipboard.writeText(t); K.avisar(msg || "Copiado."); } catch (x) { K.avisar(t); } }
  const urlCadastroInd = () => location.origin + location.pathname.replace(/plataforma\/.*$/, "") + "indique/";   /* v1.33.0 */
  const PIX_TIPO = { cpf: "CPF", cnpj: "CNPJ", celular: "celular", email: "e-mail", aleatoria: "aleatória" };
  const regraTxt = i => i.tipo === "fixo" ? BRL(i.valorFixo) + " por empresa que assinar" : String(i.percentual).replace(".", ",") + "% das faturas pagas" + (i.meses ? " por " + i.meses + " meses" : " (sempre)");

  function Indicacoes() {
    const [aba, setAba] = useState("indicadores");
    const abas = [["indicadores", "Quem indica"], ["comissoes", "Comissões"], ["cupons", "Cupons de campanha"]];
    return h("div", null,
      h("div", { className: "as-ciclo", role: "tablist", style: { marginBottom: 16 } },
        abas.map(([v, r]) => h("button", { key: v, type: "button", role: "tab", "aria-selected": aba === v, className: aba === v ? "ativo" : "", onClick: () => setAba(v) }, r))),
      aba === "indicadores" ? h(Indicadores) : aba === "comissoes" ? h(Comissoes) : h(Cupons));
  }

  function Indicadores() {
    const [d, recarregar] = K.useDados("assinaturas.indicadores");
    const [pd, recPd] = K.useDados("assinaturas.indicacao_padrao");   /* v1.33.0 */
    const [ed, setEd] = useState(null);
    const [edPadrao, setEdPadrao] = useState(false);
    if (d.carregando && !d.dados) return h("div", { className: "bloco vazio" }, "Carregando…");
    if (d.erro) return h("div", { className: "bloco vazio" }, h(Aviso, null, d.erro), h("button", { className: "bt", onClick: recarregar }, "Tentar de novo"));
    const padrao = pd.dados || { percentual: 10, meses: 3 };
    return h("div", null,
      h("div", { className: "ca-topo" },
        h("p", null, "Quem indica recebe um link próprio. A empresa que pede acesso por esse link (ou digita o código) fica ligada a ele, e cada fatura paga gera a comissão, paga por você via Pix."),
        h("button", { className: "bt bt-marca", onClick: () => setEd({ percentual: padrao.percentual, meses: padrao.meses }) }, "+ Novo indicador")),
      pd.dados && !pd.dados.sql34 ? h(Aviso, null, "Rode o SQL 34 no banco para liberar a página de cadastro de indicadores.") : null,
      h("div", { className: "ca-padrao" },
        h("div", null,
          h("b", null, "Página de cadastro: "), h("span", { className: "ca-url" }, urlCadastroInd()),
          h("p", { className: "cel-sub" }, "Quem se cadastra por lá entra ativo com a regra padrão: ", h("b", null, String(padrao.percentual).replace(".", ",") + "% das " + padrao.meses + " primeiras faturas pagas"), ". Mudar a regra não altera quem já está cadastrado.")),
        h("div", { className: "ca-linha", style: { margin: 0 } },
          h("button", { className: "bt bt-p", onClick: () => copiar(urlCadastroInd(), "Link da página de cadastro copiado.") }, "Copiar link"),
          h("a", { className: "bt bt-p bt-leve", href: urlCadastroInd(), target: "_blank", rel: "noopener" }, "Abrir"),
          h("button", { className: "bt bt-p", onClick: () => setEdPadrao(true) }, "Regra padrão"))),
      !d.dados.length ? h("div", { className: "bloco vazio" }, h("strong", null, "Ninguém cadastrado ainda"), "Cadastre vendedores de lojas, parceiros e clientes que divulgam o SGClim.")
      : h("div", { className: "bloco" }, h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "Indicador"), h("th", null, "Código"), h("th", null, "Comissão"), h("th", null, "Empresas"), h("th", { className: "num" }, "A pagar"), h("th", { className: "num" }, "Já pago"), h("th", { className: "acoes" }))),
          h("tbody", null, d.dados.map(i => h("tr", { key: i.id, style: i.ativo ? null : { opacity: .55 } },
            h("td", null, h("b", null, i.nome), i.origem === "formulario" ? h("span", { className: "selo selo-form", style: { marginLeft: 6 } }, "pela página") : null,
              h("div", { className: "cel-sub" }, [i.telefone, i.pix ? "Pix" + (i.pixTipo ? " (" + (PIX_TIPO[i.pixTipo] || i.pixTipo) + ")" : "") + ": " + i.pix : null].filter(Boolean).join(" · ") || "—"),
              i.atuacao || i.cidade || i.documento ? h("div", { className: "cel-sub" }, [i.atuacao, i.cidade, i.documento !== i.pix ? i.documento : null].filter(Boolean).join(" · ")) : null),
            h("td", null, h("span", { className: "ca-url" }, i.codigo)),
            h("td", null, regraTxt(i)),
            h("td", null, i.empresas.length ? i.empresas.map(e => e.nome).join(", ") : "—"),
            h("td", { className: "num" }, BRL(i.pendente)), h("td", { className: "num" }, BRL(i.pago)),
            h("td", { className: "acoes" },
              h("button", { className: "bt bt-p bt-leve", onClick: () => copiar(urlIndicacao(i.codigo), "Link de indicação copiado.") }, "Copiar link"),
              h("button", { className: "bt bt-p bt-leve", onClick: () => window.open("https://wa.me/" + String(i.telefone || "").replace(/\D/g, "").replace(/^(?!55)/, "55") + "?text=" + encodeURIComponent("Olá, " + i.nome.split(" ")[0] + "! Seu link de indicação do SGClim: " + urlIndicacao(i.codigo) + " — quem pedir acesso por ele fica ligado a você."), "_blank") , disabled: !i.telefone }, "WhatsApp"),
              h("button", { className: "bt bt-p", onClick: () => setEd(i) }, "Editar")))))))),
      ed ? h(FormIndicador, { i: ed, aoFechar: () => setEd(null), aoSalvar: () => { setEd(null); recarregar(); } }) : null,
      edPadrao ? h(FormPadrao, { p: padrao, aoFechar: () => setEdPadrao(false), aoSalvar: () => { setEdPadrao(false); recPd(); } }) : null);
  }

  /* v1.33.0: regra de comissão de quem se cadastra pela página /indique/ */
  function FormPadrao({ p, aoFechar, aoSalvar }) {
    const [f, setF] = useState({ percentual: String(p.percentual).replace(".", ","), meses: String(p.meses) });
    const [erro, setErro] = useState("");
    async function salvar() { setErro(""); try { await api("assinaturas.indicacao_padrao_salvar", f); K.avisar("Regra padrão salva."); aoSalvar(); } catch (x) { setErro(x.message); } }
    return h(Painel, { titulo: "Regra padrão de comissão", aoFechar,
        rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar }, "Salvar")] },
      h(Aviso, null, erro),
      h("p", { className: "cel-sub" }, "Vale para quem se cadastrar pela página a partir de agora e aparece nos exemplos da página. Quem já está cadastrado mantém a regra dele (edite um a um, se precisar). Se mudar, atualize também o regulamento (legal/indicacao.html)."),
      h("div", { className: "as-form" },
        h(Campo, { rotulo: "Percentual (%)" }, h(Texto, { valor: f.percentual, aoMudar: v => setF(Object.assign({}, f, { percentual: v })), inputMode: "decimal" })),
        h(Campo, { rotulo: "Por quantas faturas pagas", dica: "0 = enquanto a empresa assinar" }, h(Texto, { valor: f.meses, aoMudar: v => setF(Object.assign({}, f, { meses: v })), inputMode: "numeric" }))));
  }

  function FormIndicador({ i, aoFechar, aoSalvar }) {
    const [f, setF] = useState({ id: i.id || 0, nome: i.nome || "", telefone: i.telefone || "", email: i.email || "", pix: i.pix || "", documento: i.documento || "",
      codigo: i.codigo || "", tipo: i.tipo || "percentual", percentual: String(i.percentual != null ? i.percentual : 10).replace(".", ","), meses: String(i.meses != null ? i.meses : 3),
      pixTipo: i.pixTipo || "", cidade: i.cidade || "", atuacao: i.atuacao || "",
      valorFixo: String(i.valorFixo || "").replace(".", ","), ativo: i.ativo !== false, observacao: i.observacao || "" });
    const [erro, setErro] = useState("");
    const m = k => v => setF(Object.assign({}, f, { [k]: v }));
    async function salvar() { setErro(""); try { await api("assinaturas.indicador_salvar", f); K.avisar("Indicador salvo."); aoSalvar(); } catch (x) { setErro(x.message); } }
    return h(Painel, { titulo: i.id ? "Editar indicador" : "Novo indicador", aoFechar,
        rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar }, "Salvar")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Nome" }, h(Texto, { valor: f.nome, aoMudar: m("nome") })),
      h("div", { className: "as-form" },
        h(Campo, { rotulo: "WhatsApp" }, h(Texto, { valor: f.telefone, aoMudar: m("telefone"), inputMode: "tel" })),
        h(Campo, { rotulo: "E-mail" }, h(Texto, { valor: f.email, aoMudar: m("email"), type: "email" })),
        h(Campo, { rotulo: "Tipo da chave Pix" }, h("select", { className: "entrada-texto", value: f.pixTipo, onChange: ev => m("pixTipo")(ev.target.value) },
          h("option", { value: "" }, "—"), Object.keys(PIX_TIPO).map(k => h("option", { key: k, value: k }, PIX_TIPO[k])))),
        h(Campo, { rotulo: "Chave Pix (para pagar a comissão)" }, h(Texto, { valor: f.pix, aoMudar: m("pix") })),
        h(Campo, { rotulo: "CPF/CNPJ", dica: "Com ele a pessoa consulta as comissões em /indique/." }, h(Texto, { valor: f.documento, aoMudar: m("documento") })),
        h(Campo, { rotulo: "Cidade" }, h(Texto, { valor: f.cidade, aoMudar: m("cidade") })),
        h(Campo, { rotulo: "Como atua" }, h(Texto, { valor: f.atuacao, aoMudar: m("atuacao"), placeholder: "Ex.: vendedor de loja" }))),
      i.origem === "formulario" && i.aceiteEm ? h("p", { className: "cel-sub" }, "Cadastrou-se pela página e aceitou o regulamento em " + dia(i.aceiteEm) + ".") : null,
      h(Campo, { rotulo: "Código", dica: "Vai no link e é o que a pessoa digita. Deixe vazio para gerar a partir do nome." }, h(Texto, { valor: f.codigo, aoMudar: v => m("codigo")(v.toUpperCase()), placeholder: "Ex.: JOAOFRIGELAR" })),
      h("div", { className: "secao-titulo" }, "Comissão"),
      h("div", { className: "as-ciclo", role: "radiogroup", style: { marginBottom: 12 } },
        [["percentual", "% das faturas pagas"], ["fixo", "Valor fixo por empresa"]].map(([v, r]) => h("button", { key: v, type: "button", role: "radio", "aria-checked": f.tipo === v, className: f.tipo === v ? "ativo" : "", onClick: () => m("tipo")(v) }, r))),
      f.tipo === "percentual" ? h("div", { className: "as-form" },
        h(Campo, { rotulo: "Percentual (%)" }, h(Texto, { valor: f.percentual, aoMudar: m("percentual"), inputMode: "decimal" })),
        h(Campo, { rotulo: "Por quantas faturas pagas", dica: "0 = enquanto a empresa assinar" }, h(Texto, { valor: f.meses, aoMudar: m("meses"), inputMode: "numeric" })))
      : h(Campo, { rotulo: "Valor (R$), pago quando a empresa paga a 1ª fatura" }, h(Texto, { valor: f.valorFixo, aoMudar: m("valorFixo"), inputMode: "decimal" })),
      h(Campo, { rotulo: "Observação" }, h(Texto, { valor: f.observacao, aoMudar: m("observacao") })),
      h("label", { className: "ca-linha" }, h("input", { type: "checkbox", checked: f.ativo, onChange: ev => m("ativo")(ev.target.checked) }), "Ativo (novas faturas geram comissão)"));
  }

  function Comissoes() {
    const [st, setSt] = useState("pendente");
    const [d, recarregar] = K.useDados("assinaturas.comissoes", { status: st }, [st]);
    const [pagando, setPagando] = useState(false);
    if (d.carregando && !d.dados) return h("div", { className: "bloco vazio" }, "Carregando…");
    if (d.erro) return h("div", { className: "bloco vazio" }, h(Aviso, null, d.erro));
    const grupos = {};
    d.dados.forEach(c => { (grupos[c.indicadorId] = grupos[c.indicadorId] || { nome: c.indicador, pix: c.pix, itens: [], total: 0 }).itens.push(c); grupos[c.indicadorId].total += c.valor; });
    async function pagar(g) {
      if (!(await K.confirmar({ titulo: "Marcar " + BRL(g.total) + " como pago a " + g.nome + "?", texto: "Faça o Pix" + (g.pix ? " para " + g.pix : "") + " e confirme aqui. As " + g.itens.length + " comissões ficam como pagas hoje.", botao: "Marcar como pago" }))) return;
      setPagando(true);
      try { const r = await api("assinaturas.comissoes_pagar", { ids: g.itens.map(c => c.id) }); K.avisar(r.pagas + " comissão(ões) marcada(s) como paga(s)."); recarregar(); } catch (x) { K.avisar(x.message, true); }
      setPagando(false);
    }
    return h("div", null,
      h("div", { className: "as-ciclo", role: "radiogroup", style: { marginBottom: 14 } },
        [["pendente", "A pagar"], ["paga", "Pagas"], ["cancelada", "Canceladas"]].map(([v, r]) => h("button", { key: v, type: "button", role: "radio", "aria-checked": st === v, className: st === v ? "ativo" : "", onClick: () => setSt(v) }, r))),
      !d.dados.length ? h("div", { className: "bloco vazio" }, st === "pendente" ? "Nenhuma comissão a pagar." : "Nada aqui.")
      : Object.keys(grupos).map(k => { const g = grupos[k]; return h("div", { key: k, className: "bloco" },
          h("div", { className: "bloco-cab as-cab" },
            h("div", null, h("h2", null, g.nome), h("p", null, (g.pix ? "Pix: " + g.pix + " · " : "") + g.itens.length + " fatura(s) · total " + BRL(g.total))),
            st === "pendente" ? h("button", { className: "bt bt-marca", disabled: pagando, onClick: () => pagar(g) }, "Marcar como pago") : null),
          h("div", { className: "bloco-corpo", style: { paddingTop: 10 } }, h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
            h("thead", null, h("tr", null, h("th", null, "Empresa"), h("th", null, "Fatura de"), h("th", { className: "num" }, "Fatura paga"), h("th", { className: "num" }, "Comissão"), st === "paga" ? h("th", null, "Pago em") : null)),
            h("tbody", null, g.itens.map(c => h("tr", { key: c.id }, h("td", null, c.empresa), h("td", null, dia(c.fatura)), h("td", { className: "num" }, BRL(c.base)), h("td", { className: "num" }, BRL(c.valor)),
              st === "paga" ? h("td", null, dia(c.pagoEm)) : null))))))); }));
  }

  function Cupons() {
    const [d, recarregar] = K.useDados("assinaturas.cupons");
    const [planos] = K.useDados("assinaturas.resumo");
    const [ed, setEd] = useState(null);
    if (d.carregando && !d.dados) return h("div", { className: "bloco vazio" }, "Carregando…");
    if (d.erro) return h("div", { className: "bloco vazio" }, h(Aviso, null, d.erro));
    return h("div", null,
      h("div", { className: "ca-topo" },
        h("p", null, "Cupom dá desconto para a empresa que assina (ex.: campanha de feira). A empresa digita o código na hora de assinar; depois das faturas com desconto, o valor volta sozinho ao preço cheio."),
        h("button", { className: "bt bt-marca", onClick: () => setEd({}) }, "+ Novo cupom")),
      !d.dados.length ? h("div", { className: "bloco vazio" }, "Nenhum cupom criado.")
      : h("div", { className: "bloco" }, h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "Código"), h("th", null, "Desconto"), h("th", null, "Validade"), h("th", null, "Usos"), h("th", null, "Situação"), h("th", { className: "acoes" }))),
          h("tbody", null, d.dados.map(k => h("tr", { key: k.id },
            h("td", null, h("span", { className: "ca-url" }, k.codigo), k.descricao ? h("div", { className: "cel-sub" }, k.descricao) : null),
            h("td", null, k.texto, k.planos.length ? h("div", { className: "cel-sub" }, "só " + k.planos.join(", ")) : null),
            h("td", null, k.validade ? "até " + dia(k.validade) : "sem prazo"),
            h("td", null, k.usos + (k.limite != null ? " de " + k.limite : "")),
            h("td", null, h("span", { className: "selo " + (k.ativo && !(k.validade && k.validade < new Date().toISOString().slice(0, 10)) ? "selo-ok" : "") }, k.ativo ? (k.validade && k.validade < new Date().toISOString().slice(0, 10) ? "Vencido" : "Ativo") : "Desligado")),
            h("td", { className: "acoes" }, h("button", { className: "bt bt-p", onClick: () => setEd(k) }, "Editar")))))))),
      ed ? h(FormCupom, { k: ed, planos: (planos.dados && planos.dados.planos) || [], aoFechar: () => setEd(null), aoSalvar: () => { setEd(null); recarregar(); } }) : null);
  }

  function FormCupom({ k, planos, aoFechar, aoSalvar }) {
    const [f, setF] = useState({ id: k.id || 0, codigo: k.codigo || "", descricao: k.descricao || "", tipo: k.tipo || "percentual", valor: String(k.valor || "").replace(".", ","),
      faturas: String(k.faturas != null ? k.faturas : 3), validade: k.validade || "", limite: k.limite != null ? String(k.limite) : "", planos: k.planos || [], ativo: k.ativo !== false });
    const [erro, setErro] = useState("");
    const m = c => v => setF(Object.assign({}, f, { [c]: v }));
    const tog = c => setF(Object.assign({}, f, { planos: f.planos.indexOf(c) >= 0 ? f.planos.filter(x => x !== c) : f.planos.concat([c]) }));
    async function salvar() { setErro(""); try { await api("assinaturas.cupom_salvar", f); K.avisar("Cupom salvo."); aoSalvar(); } catch (x) { setErro(x.message); } }
    return h(Painel, { titulo: k.id ? "Editar cupom" : "Novo cupom", aoFechar,
        rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar }, "Salvar")] },
      h(Aviso, null, erro),
      h("div", { className: "as-form" },
        h(Campo, { rotulo: "Código" }, h(Texto, { valor: f.codigo, aoMudar: v => m("codigo")(v.toUpperCase()), placeholder: "FEIRA2026" })),
        h(Campo, { rotulo: "Descrição (só você vê)" }, h(Texto, { valor: f.descricao, aoMudar: m("descricao") }))),
      h("div", { className: "as-ciclo", role: "radiogroup", style: { marginBottom: 12 } },
        [["percentual", "% de desconto"], ["valor", "R$ de desconto"]].map(([v, r]) => h("button", { key: v, type: "button", role: "radio", "aria-checked": f.tipo === v, className: f.tipo === v ? "ativo" : "", onClick: () => m("tipo")(v) }, r))),
      h("div", { className: "ca-regras" },
        h(Campo, { rotulo: f.tipo === "valor" ? "Desconto por fatura (R$)" : "Desconto (%)" }, h(Texto, { valor: f.valor, aoMudar: m("valor"), inputMode: "decimal" })),
        h(Campo, { rotulo: "Nas primeiras faturas", dica: "0 = em todas" }, h(Texto, { valor: f.faturas, aoMudar: m("faturas"), inputMode: "numeric" })),
        h(Campo, { rotulo: "Limite de empresas", dica: "vazio = sem limite" }, h(Texto, { valor: f.limite, aoMudar: m("limite"), inputMode: "numeric" }))),
      h(Campo, { rotulo: "Vale até (último dia para usar)", dica: "vazio = sem prazo" }, h("input", { className: "entrada-texto", type: "date", value: f.validade, onChange: ev => m("validade")(ev.target.value) })),
      planos.length ? h(React.Fragment, null, h("div", { className: "secao-titulo" }, "Vale para os planos (nenhum marcado = todos)"),
        h("div", { className: "ca-mods" }, planos.map(p => h("label", { key: p.id }, h("input", { type: "checkbox", checked: f.planos.indexOf(p.chave) >= 0, onChange: () => tog(p.chave) }), p.nome)))) : null,
      h("label", { className: "ca-linha" }, h("input", { type: "checkbox", checked: f.ativo, onChange: ev => m("ativo")(ev.target.checked) }), "Ativo"),
      h("p", { className: "cel-sub" }, "No plano anual, cada fatura é um ano: um cupom de 3 faturas vale para 3 anos. Para campanhas mensais, use também “Vale para os planos” ou poucas faturas."));
  }

  K.ConsoleIndicacoes = Indicacoes;
  K.ConsoleAssinaturas = Assinaturas;
  K.ConsolePlanos = Planos;
})();
