/* =====================================================================
   KONSTANTE SaaS — app/console.js
   CONSOLE DA PLATAFORMA (sgclim.xclim.com.br/plataforma/)
   Login e sessão próprios, separados das empresas. Aqui ficam:
   empresas, numeração e suporte (usuários de cada empresa).
   v1.14.0: Central de ajuda — relatos (problemas, reclamações, sugestões, dúvidas) de todas as empresas.
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Senha, Aviso, Painel, Icone } = K;
  const { useState, useEffect } = React;

  const TEMA_CONSOLE = { corPrimaria: "#1f3a5f", corSecundaria: "#2c5282", nome: "Console da plataforma" };
  const NOMES_SEQ = { chamado: "Próximo chamado", cliente: "Próximo cliente", contrato: "Próximo contrato", os_contrato: "Próxima OS de contrato" };
  function rotuloNumero(tipo, n) { return tipo === "os_contrato" ? "C-" + String(n).padStart(4, "0") : String(n); }

  function Console({ sessao, aoSair }) {
    const [menuAberto, setMenuAberto] = useState(false);
    const [euAberto, setEuAberto] = useState(false);
    const [trocandoSenha, setTrocandoSenha] = useState(false);
    const [tela, setTela] = useState("empresas");
    const [naoLidos, setNaoLidos] = useState(0);
    const [pedidos, setPedidos] = useState(0);   /* v1.17.0 */
    useEffect(() => {
      const f = () => { api("suporte.listar", { status: "pendentes" }).then(r => setNaoLidos(r.naoLidos), () => {});
        api("empresas.cadastros", { status: "pendente" }).then(r => setPedidos((r.contagem || {}).pendente || 0), () => {}); };
      f(); const t = setInterval(f, 60000); return () => clearInterval(t);
    }, []);
    const u = sessao.usuario;
    const ir = t => { setTela(t); setMenuAberto(false); };
    return h("div", { className: "app" },
      menuAberto ? h("div", { className: "menu-veu", onClick: () => setMenuAberto(false) }) : null,
      h("aside", { className: "menu" + (menuAberto ? " aberto" : "") },
        h("div", { className: "menu-topo" },
          h("div", { className: "menu-logo" }, h("span", { style: { width: 20, height: 20, display: "inline-flex" } }, h(K.Simbolo))),
          h("div", null, h("div", { className: "menu-empresa" }, "SGClim"), h("div", { className: "cel-sub" }, "Console da plataforma"))),
        h("nav", { "aria-label": "Console" },
          h("button", { className: "menu-item" + (tela === "empresas" ? " ativo" : ""), onClick: () => ir("empresas") }, h(Icone, { n: "empresas" }), "Empresas"),
          h("button", { className: "menu-item" + (tela === "pedidos" ? " ativo" : ""), onClick: () => ir("pedidos") }, h(Icone, { n: "usuarios" }), "Pedidos de acesso",
            pedidos ? h("span", { className: "breve", style: { color: "var(--perigo)", fontWeight: 700 } }, pedidos + " novo" + (pedidos > 1 ? "s" : "")) : null),
          h("button", { className: "menu-item" + (tela === "modulos" ? " ativo" : ""), onClick: () => ir("modulos") }, h(Icone, { n: "modulos" }), "Módulos"),   /* v1.19.0 */
          h("button", { className: "menu-item" + (tela === "uso" ? " ativo" : ""), onClick: () => ir("uso") }, h(Icone, { n: "inicio" }), "Uso"),   /* v1.20.0 */
          K.ConsoleAssinaturas ? h("button", { className: "menu-item" + (tela === "assinaturas" ? " ativo" : ""), onClick: () => ir("assinaturas") }, h(Icone, { n: "cartao" }), "Assinaturas") : null,   /* v1.30.0 */
          K.ConsolePlanos ? h("button", { className: "menu-item" + (tela === "planos" ? " ativo" : ""), onClick: () => ir("planos") }, h(Icone, { n: "dinheiro" }), "Planos") : null,
          K.ConsoleIndicacoes ? h("button", { className: "menu-item" + (tela === "indicacoes" ? " ativo" : ""), onClick: () => ir("indicacoes") }, h(Icone, { n: "etiqueta" }), "Indicações e cupons") : null,   /* v1.31.0 */
          h("button", { className: "menu-item" + (tela === "suporte" ? " ativo" : ""), onClick: () => ir("suporte") }, h(Icone, { n: "ajuda" }), "Central de ajuda",
            naoLidos ? h("span", { className: "breve", style: { color: "var(--perigo)", fontWeight: 700 } }, naoLidos + " nov" + (naoLidos > 1 ? "os" : "o")) : null)),
        h("div", { className: "menu-pe", style: { position: "relative" } },
          euAberto ? h("div", { className: "suspenso", onMouseLeave: () => setEuAberto(false) },
            h("button", { onClick: () => { setEuAberto(false); setTrocandoSenha(true); } }, "Trocar minha senha"),
            h("button", { onClick: aoSair }, "Sair do console")) : null,
          h("button", { className: "eu-botao", onClick: () => setEuAberto(!euAberto), "aria-expanded": euAberto },
            h("span", { className: "avatar" }, K.iniciais(u.nome)),
            h("span", null, h("div", { className: "eu-nome" }, u.nome), h("div", { className: "eu-papel" }, "Administrador da plataforma"))))),
      h("main", { className: "principal" },
        h("header", { className: "topo" },
          h("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
            h("button", { className: "bt bt-leve bt-p menu-abrir", onClick: () => setMenuAberto(true), "aria-label": "Abrir menu" }, h("span", { style: { width: 20, height: 20, display: "inline-flex" } }, h(Icone, { n: "menu" }))),
            h("h1", null, tela === "suporte" ? "Central de ajuda" : tela === "pedidos" ? "Pedidos de acesso" : tela === "modulos" ? "Módulos" : tela === "uso" ? "Uso do sistema" : tela === "assinaturas" ? "Assinaturas" : tela === "planos" ? "Planos" : tela === "indicacoes" ? "Indicações e cupons" : "Empresas")),
          h("span", { className: "selo selo-plain" }, "Console da plataforma")),
        h("div", { className: "conteudo" }, tela === "suporte" ? h(CentralAjuda, { aoLer: () => setNaoLidos(n => Math.max(0, n - 1)) })
          : tela === "pedidos" ? h(Pedidos, { aoMudar: n => setPedidos(n) }) : tela === "modulos" ? h(Modulos) : tela === "uso" ? h(Uso)
          : tela === "assinaturas" && K.ConsoleAssinaturas ? h(K.ConsoleAssinaturas) : tela === "planos" && K.ConsolePlanos ? h(K.ConsolePlanos) : tela === "indicacoes" && K.ConsoleIndicacoes ? h(K.ConsoleIndicacoes) : h(Empresas))),   /* v1.30.0 */
      trocandoSenha ? h(Painel, { titulo: "Trocar minha senha", sub: "Senha do console, separada da sua conta na empresa.", aoFechar: () => setTrocandoSenha(false) },
        h(K.FormTrocaSenha, { minimo: 10, aoConcluir: () => setTrocandoSenha(false), aoCancelar: () => setTrocandoSenha(false) })) : null);
  }


  /* ---------------- v1.19.0: liberação de módulos por empresa ---------------- */

  const ESTAGIOS = [["geral", "Geral", "Todas as empresas (dá para tirar de alguma)"], ["teste", "Em teste", "Só as empresas marcadas"], ["desligado", "Desligado", "Ninguém vê"]];

  function Modulos() {
    const [d, recarregar] = K.useDados("empresas.modulos");
    const [ocupado, setOcupado] = useState("");
    async function estagio(m, v) {
      if (v === m.estagio) return;
      const txt = v === "geral" ? "Todas as empresas passam a ver " + m.nome + " (menos as que você desmarcar)." : v === "teste" ? m.nome + " fica só com as empresas marcadas." : m.nome + " some para todas as empresas. Os dados continuam guardados.";
      if (!(await K.confirmar({ titulo: "Mudar " + m.nome + " para \u201c" + ESTAGIOS.find(e => e[0] === v)[1] + "\u201d?", texto: txt, botao: "Mudar", perigo: v === "desligado" }))) return;
      setOcupado(m.chave);
      try { await api("empresas.modulo_estagio", { chave: m.chave, estagio: v }); K.avisar(m.nome + ": estágio atualizado."); recarregar(); } catch (x) { K.avisar(x.message, true); }
      setOcupado("");
    }
    async function alternar(m, e, liberado) {
      setOcupado(m.chave + ":" + e.id);
      try { await api("empresas.modulo_empresa", { chave: m.chave, empresaId: e.id, liberado }); recarregar(); } catch (x) { K.avisar(x.message, true); }
      setOcupado("");
    }
    if (d.carregando && !d.dados) return h("div", { className: "bloco vazio" }, "Carregando…");
    if (d.erro) return h("div", { className: "bloco vazio" }, h(Aviso, null, d.erro), h("button", { className: "bt", onClick: recarregar }, "Tentar de novo"));
    const { empresas, modulos } = d.dados;
    return h("div", null,
      h("p", { style: { margin: "0 0 14px", color: "var(--tinta-2)", maxWidth: 760 } },
        "O CRM (clientes, chamados, catálogo), o Início, Usuários e Configurações valem para todos. Os módulos abaixo podem ser liberados aos poucos. A mudança vale no próximo acesso de cada pessoa (ou ao recarregar a página)."),
      modulos.map(m => h("div", { key: m.chave, className: "bloco mod-bloco" },
        h("div", { className: "bloco-cab mod-cab" },
          h("div", null, h("h2", null, m.nome), h("p", null, m.descricao || "")),
          h("div", { className: "mod-estagios", role: "radiogroup", "aria-label": "Estágio de " + m.nome },
            ESTAGIOS.map(([v, rot, dica]) => h("button", { key: v, type: "button", role: "radio", "aria-checked": m.estagio === v, title: dica, disabled: ocupado === m.chave,
              className: "mod-est" + (m.estagio === v ? " ativo mod-" + v : ""), onClick: () => estagio(m, v) }, rot)))),
        h("div", { className: "bloco-corpo mod-empresas" },
          m.estagio === "desligado" ? h("div", { className: "cel-sub" }, "Desligado para todas as empresas.")
          : empresas.map(e => {
              const st = m.empresas[e.id] || { liberado: false, excecao: false };
              return h("label", { key: e.id, className: "mod-emp" + (st.liberado ? " lib" : "") + (e.ativa ? "" : " inativa") },
                h("input", { type: "checkbox", checked: st.liberado, disabled: ocupado === m.chave + ":" + e.id, onChange: ev => alternar(m, e, ev.target.checked) }),
                h("span", null, e.nome, st.excecao ? h("small", null, m.estagio === "geral" ? " · tirado" : " · em teste") : null));
            })))));
  }

  /* ---------------- v1.20.0: uso do sistema por empresa ---------------- */

  const USO_PERIODOS = [["7", "7 dias"], ["30", "30 dias"], ["mes", "Este mês"], ["90", "90 dias"]];
  const USO_GRUPOS = { acesso: "Acesso", inicio: "Início", crm: "CRM", contratos: "Contratos", os: "OS", tarefas: "Tarefas", pmoc: "PMOC", assistente: "Assistente", empresa: "Usuários/Config.", outros: "Outros" };
  const USO_CRIADOS = [["clientes", "cliente", "clientes"], ["chamados", "chamado", "chamados"], ["orcamentos", "orçamento", "orçamentos"], ["os", "OS", "OS"], ["tarefas", "tarefa", "tarefas"], ["pmoc", "visita PMOC", "visitas PMOC"], ["assistente", "pedido à IA", "pedidos à IA"]];
  const SINAL_TXT = { verde: "Em uso", amarelo: "Pouco uso", vermelho: "Parada" };

  const diaBR = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—";   /* data sem hora: sem fuso */
  function quandoUso(ultimo, dias) {
    if (!ultimo) return "nunca";
    if (dias === 0) return "hoje, " + K.dataHora(ultimo).split(" ")[1];
    if (dias === 1) return "ontem";
    return "há " + dias + " dias";
  }
  function Sinal({ s }) { return h("span", { className: "uso-sinal uso-" + s, title: SINAL_TXT[s] }); }
  function topGrupos(g) {
    return Object.keys(g || {}).filter(k => k !== "acesso" && g[k] > 0).sort((a, b) => g[b] - g[a]).slice(0, 3);
  }
  function textoCriados(c) {
    const l = USO_CRIADOS.filter(([k]) => c && c[k]).map(([k, um, varios]) => c[k] + " " + (c[k] === 1 ? um : varios));
    return l.length ? l.join(" · ") : "nada criado";
  }

  function Uso() {
    const [periodo, setPeriodo] = useState("30");
    const [d, recarregar] = K.useDados("uso.resumo", { periodo }, [periodo]);
    const [aberta, setAberta] = useState(null);
    const seletor = h("div", { className: "uso-per", role: "radiogroup", "aria-label": "Período" },
      USO_PERIODOS.map(([v, r]) => h("button", { key: v, type: "button", role: "radio", "aria-checked": periodo === v, className: "seg" + (periodo === v ? " on" : ""), onClick: () => setPeriodo(v) }, r)));
    if (d.carregando && !d.dados) return h("div", null, h("div", { className: "barra" }, seletor), h("div", { className: "bloco vazio" }, "Carregando…"));
    if (d.erro) return h("div", { className: "bloco vazio" }, h(Aviso, null, d.erro), h("button", { className: "bt", onClick: recarregar }, "Tentar de novo"));
    const r = d.dados;
    const emps = r.empresas.slice().sort((a, b) => (b.ativa - a.ativa) || (b.acoes - a.acoes) || a.nome.localeCompare(b.nome));
    const contagem = s => emps.filter(e => e.ativa && e.sinal === s).length;
    return h("div", null,
      h("div", { className: "barra" }, seletor, h("div", { style: { flex: 1 } }),
        h("span", { className: "cel-sub" }, diaBR(r.de) + " a " + diaBR(r.ate))),
      h("div", { className: "kpis" },
        h("div", { className: "kpi" }, h("div", { className: "kpi-t" }, "Em uso"), h("div", { className: "kpi-v" }, contagem("verde")), h("div", { className: "kpi-p" }, "usaram nos últimos 2 dias")),
        h("div", { className: "kpi" }, h("div", { className: "kpi-t" }, "Pouco uso"), h("div", { className: "kpi-v" }, contagem("amarelo")), h("div", { className: "kpi-p" }, "último uso há 3 a 7 dias")),
        h("div", { className: "kpi" }, h("div", { className: "kpi-t" }, "Paradas"), h("div", { className: "kpi-v" }, contagem("vermelho")), h("div", { className: "kpi-p" }, "mais de 7 dias ou nunca usaram"))),
      h("div", { className: "bloco" },
        h("div", { className: "tabela-caixa" }, h("table", { className: "tabela uso-tab" },
          h("thead", null, h("tr", null, h("th", null, "Empresa"), h("th", { className: "num" }, "Pessoas ativas"), h("th", { className: "num" }, "Dias com uso"),
            h("th", { className: "num" }, "Ações"), h("th", null, "Mais usado"), h("th", null, "Criado no período"), h("th", null, "Último uso"))),
          h("tbody", null, emps.map(e => h("tr", { key: e.id, className: "uso-linha" + (e.ativa ? "" : " inativa"), onClick: () => setAberta(e), tabIndex: 0,
              onKeyDown: ev => { if (ev.key === "Enter") setAberta(e); } },
            h("td", null, h("div", { className: "cel-titulo" }, h(Sinal, { s: e.sinal }), e.nome),
              h("div", { className: "cel-sub" }, e.ativa ? SINAL_TXT[e.sinal] : "Empresa desativada")),
            h("td", { className: "num" }, e.ativosEquipe + " de " + e.equipe, e.clientesPortal ? h("div", { className: "cel-sub" }, e.ativosClientes + " de " + e.clientesPortal + " no portal") : null),
            h("td", { className: "num" }, e.diasUso + " de " + r.dias),
            h("td", { className: "num" }, e.acoes.toLocaleString("pt-BR")),
            h("td", null, topGrupos(e.grupos).map(g => h("span", { key: g, className: "chip uso-chip" }, USO_GRUPOS[g] + " " + e.grupos[g]))),
            h("td", { className: "cel-sub" }, textoCriados(e.criados)),
            h("td", null, quandoUso(e.ultimoUso, e.diasSemUso)))))))),
      h("p", { className: "cel-sub", style: { marginTop: 10 } },
        "Ações = tudo o que as pessoas fazem no sistema (abrir telas, salvar, consultar). A contagem de ações começou " +
        (r.desde ? "em " + diaBR(r.desde) : "agora (SQL 14)") + "; os registros criados vêm do histórico do banco. Toque numa empresa para ver por pessoa."),
      aberta ? h(UsoEmpresa, { empresa: aberta, periodoInicial: periodo, aoFechar: () => setAberta(null) }) : null);
  }

  function UsoEmpresa({ empresa, periodoInicial, aoFechar }) {
    const [periodo, setPeriodo] = useState(periodoInicial);
    const [d] = K.useDados("uso.detalhe", { empresaId: empresa.id, periodo }, [empresa.id, periodo]);
    const r = d.dados;
    let corpo;
    if (d.carregando && !r) corpo = h("div", { className: "vazio" }, "Carregando…");
    else if (d.erro) corpo = h(Aviso, null, d.erro);
    else {
      const max = Math.max(1, ...r.serie.map(x => x.acoes));
      const equipe = r.usuarios.filter(u => u.perfil !== "cliente"), portal = r.usuarios.filter(u => u.perfil === "cliente");
      const tabela = (lista, tit) => lista.length ? h("div", { style: { marginTop: 16 } },
        h("div", { className: "secao-titulo" }, tit),
        h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "Pessoa"), h("th", { className: "num" }, "Dias"), h("th", { className: "num" }, "Ações"), h("th", null, "Mais usado"), h("th", null, "Último uso"))),
          h("tbody", null, lista.map(u => h("tr", { key: u.id, className: u.status !== "ativo" ? "inativa" : "" },
            h("td", null, h("div", { className: "cel-titulo" }, h(Sinal, { s: u.sinal }), u.nome), h("div", { className: "cel-sub" }, K.PERFIS[u.perfil] || u.perfil)),
            h("td", { className: "num" }, u.dias), h("td", { className: "num" }, u.acoes),
            h("td", null, topGrupos(u.grupos).map(g => h("span", { key: g, className: "chip uso-chip" }, USO_GRUPOS[g] + " " + u.grupos[g]))),
            h("td", null, quandoUso(u.ultimoUso, u.diasSemUso)))))))) : null;
      const ativos = equipe.filter(u => u.dias > 0).length;
      corpo = h("div", null,
        h("div", { className: "kpis" },
          h("div", { className: "kpi" }, h("div", { className: "kpi-t" }, "Pessoas ativas"), h("div", { className: "kpi-v" }, ativos + " de " + equipe.length)),
          h("div", { className: "kpi" }, h("div", { className: "kpi-t" }, "Dias com uso"), h("div", { className: "kpi-v" }, r.serie.filter(x => x.acoes > 0).length + " de " + r.dias)),
          r.assistente ? h("div", { className: "kpi" }, h("div", { className: "kpi-t" }, "Assistente"), h("div", { className: "kpi-v" }, r.assistente.pedidos),
            h("div", { className: "kpi-p" }, r.assistente.pesquisas + " pesquisas · " + Math.round((r.assistente.entrada + r.assistente.saida) / 1000) + " mil tokens")) : null),
        h("div", { className: "secao-titulo" }, "Ações por dia"),
        h("div", { className: "uso-barras", role: "img", "aria-label": "Ações por dia no período" },
          r.serie.map(x => h("div", { key: x.dia, className: "uso-barra", title: diaBR(x.dia) + ": " + x.acoes + " ações, " + x.pessoas + " pessoa(s)" },
            h("span", { style: { height: (x.acoes ? Math.max(4, Math.round(x.acoes / max * 100)) : 0) + "%" } })))),
        h("div", { className: "cel-sub", style: { marginTop: 10 } }, "Criado no período: " + textoCriados(r.criados)),
        tabela(equipe, "Equipe"), tabela(portal, "Portal do cliente"));
    }
    return h(Painel, { titulo: empresa.nome, sub: "Uso do sistema", aoFechar, largo: true },
      h("div", { className: "uso-per", style: { marginBottom: 14 } },
        USO_PERIODOS.map(([v, rot]) => h("button", { key: v, type: "button", className: "seg" + (periodo === v ? " on" : ""), onClick: () => setPeriodo(v) }, rot))),
      corpo);
  }

  /* ---------------- pedidos de acesso da landing (v1.17.0) ---------------- */

  function Pedidos({ aoMudar }) {
    const [filtro, setFiltro] = useState("pendente");
    const [tipo, setTipo] = useState("acesso");   /* v1.39.0: acesso (teste grátis) | info ("Eu quero") */
    const [d, setD] = useState(null);
    const [aprovando, setAprovando] = useState(null);
    const [recusando, setRecusando] = useState(null);
    const [resultado, setResultado] = useState(null);
    function carregar() { api("empresas.cadastros", { status: filtro, tipo }).then(r => { setD(r); const pt = r.pendentesPorTipo; aoMudar(pt ? (pt.acesso || 0) + (pt.info || 0) : (r.contagem || {}).pendente || 0); }, e => K.avisar(e.message, true)); }
    useEffect(carregar, [filtro, tipo]); // eslint-disable-line
    async function respondido(c) {
      if (!(await K.confirmar({ titulo: "Marcar como respondido?", texto: c.responsavel + " · " + c.email, botao: "Marcar" }))) return;
      try { await api("empresas.cadastro_respondido", { id: c.id }); K.avisar("Pedido marcado como respondido."); carregar(); } catch (x) { K.avisar(x.message, true); }
    }
    const zap = t => { let n = String(t || "").replace(/\D/g, ""); if (n.length <= 11) n = "55" + n; return "https://wa.me/" + n; };
    const ehInfo = tipo === "info";
    const pt = (d && d.pendentesPorTipo) || {};
    const ct = (d && d.contagem) || {};
    const ST = ehInfo ? { pendente: ["Aguardando contato", "os-amarelo"], aprovado: ["Respondido", "os-verde"], recusado: ["Descartado", "os-cinza"] }
                      : { pendente: ["Aguardando", "os-amarelo"], aprovado: ["Aprovado", "os-verde"], recusado: ["Recusado", "os-cinza"] };
    const dt = s => s ? String(s).slice(8, 10) + "/" + String(s).slice(5, 7) + "/" + String(s).slice(0, 4) + " " + String(s).slice(11, 16) : "";
    return h("div", null,
      h("div", { className: "tf-seg", role: "group", "aria-label": "Tipo de pedido", style: { marginBottom: 10 } },
        h("button", { type: "button", className: "seg" + (!ehInfo ? " on" : ""), "aria-pressed": !ehInfo, onClick: () => setTipo("acesso") }, "Teste grátis" + (pt.acesso ? " (" + pt.acesso + ")" : "")),
        h("button", { type: "button", className: "seg" + (ehInfo ? " on" : ""), "aria-pressed": ehInfo, onClick: () => setTipo("info") }, "Informações (Eu quero)" + (pt.info ? " (" + pt.info + ")" : ""))),
      h("div", { className: "chips", style: { marginBottom: 12 } },
        (ehInfo ? [["pendente", "Aguardando contato"], ["aprovado", "Respondidos"], ["todos", "Todos"]] : [["pendente", "Aguardando"], ["aprovado", "Aprovados"], ["recusado", "Recusados"], ["todos", "Todos"]]).map(([k, t]) =>
          h("button", { key: k, className: "chip" + (filtro === k ? " ativo" : ""), onClick: () => setFiltro(k) }, t,
            h("span", { className: "chip-n" }, k === "todos" ? (ct.pendente || 0) + (ct.aprovado || 0) + (ct.recusado || 0) : ct[k] || 0)))),
      h("div", { className: "bloco" },
        !d ? h("div", { className: "vazio" }, "Carregando…")
        : !d.itens.length ? h("div", { className: "vazio" }, filtro !== "pendente" ? "Nada aqui." : ehInfo ? "Nenhum pedido de informações aguardando. Eles chegam pelo formulário “Eu quero” da página de apresentação (conheca/)." : "Nenhum pedido aguardando. Os pedidos chegam pelo botão “Quero usar” da página de apresentação (conheca/).")
        : ehInfo ? h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
            h("thead", null, h("tr", null, h("th", null, "Nome"), h("th", null, "Contato"), h("th", null, "Recebido"), h("th", null, "Situação"), h("th", { className: "acoes" }))),
            h("tbody", null, d.itens.map(c => h("tr", { key: c.id },
              h("td", null, h("div", { className: "cel-titulo" }, c.responsavel), h("div", { className: "cel-sub" }, "Tipo de empresa: " + (c.empresa || "—") + " · Funcionários: " + (c.porte || "—"))),
              h("td", null, h("div", null, c.email), h("div", { className: "cel-sub" }, "WhatsApp " + (c.telefone || "—"))),
              h("td", { className: "cel-sub" }, dt(c.criadoEm)),
              h("td", null, h("span", { className: "selo " + ST[c.status][1] }, ST[c.status][0]),
                c.status !== "pendente" ? h("div", { className: "cel-sub" }, dt(c.decididoEm) + (c.decididoPor ? " · " + c.decididoPor : "")) : null),
              h("td", { className: "acoes" }, h("div", { style: { display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" } },
                c.telefone ? h("a", { className: "bt bt-p bt-leve", href: zap(c.telefone), target: "_blank", rel: "noopener" }, "WhatsApp") : null,
                c.status === "pendente" ? h("button", { className: "bt bt-p bt-marca", onClick: () => respondido(c) }, "Marcar como respondido") : null))))))) 
        : h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
            h("thead", null, h("tr", null, h("th", null, "Empresa"), h("th", null, "Responsável"), h("th", null, "Recebido"), h("th", null, "Situação"), h("th", { className: "acoes" }))),
            h("tbody", null, d.itens.map(c => h("tr", { key: c.id },
              h("td", null, h("div", { className: "cel-titulo" }, c.empresa), h("div", { className: "cel-sub" }, [c.cnpj, c.cidade, c.porte].filter(Boolean).join(" · ") || "—"),
                c.mensagem ? h("div", { className: "cel-sub", style: { maxWidth: 360, whiteSpace: "pre-wrap" } }, "“" + c.mensagem + "”") : null,
                c.codigo ? h("div", { className: "cel-sub" }, h("b", null, "Indicação: "), c.codigo + (c.indicador ? " · " + c.indicador : "")) : null),   /* v1.31.0 */
              h("td", null, h("div", null, c.responsavel), h("div", { className: "cel-sub" }, c.email + (c.telefone ? " · " + c.telefone : ""))),
              h("td", { className: "cel-sub" }, dt(c.criadoEm)),
              h("td", null, h("span", { className: "selo " + ST[c.status][1] }, ST[c.status][0]),
                c.status !== "pendente" ? h("div", { className: "cel-sub" }, dt(c.decididoEm) + (c.emailOk === false ? " · e-mail não saiu" : c.emailOk ? " · e-mail enviado" : "") + (c.motivo ? " · " + c.motivo : "")) : null),
              h("td", { className: "acoes" }, c.status === "pendente" ? h("div", { style: { display: "flex", gap: 6, justifyContent: "flex-end" } },
                h("button", { className: "bt bt-p bt-leve", onClick: () => setRecusando(c) }, "Recusar"),
                h("button", { className: "bt bt-p bt-marca", onClick: () => setAprovando(c) }, "Aprovar")) : null))))))),
      aprovando ? h(AprovarPedido, { pedido: aprovando, aoFechar: () => setAprovando(null), aoAprovar: r => { setAprovando(null); setResultado(r); carregar(); } }) : null,
      recusando ? h(RecusarPedido, { pedido: recusando, aoFechar: () => setRecusando(null), aoRecusar: () => { setRecusando(null); carregar(); } }) : null,
      resultado ? h(Painel, { titulo: "Acesso liberado", aoFechar: () => setResultado(null), rodape: [h("button", { key: "f", className: "bt bt-marca", onClick: () => setResultado(null) }, "Fechar")] },
        resultado.emailOk ? h(Aviso, { tipo: "ok" }, "Empresa criada e e-mail enviado para " + resultado.email + " com o link e a senha provisória.")
        : h(React.Fragment, null, h(Aviso, null, "A empresa foi criada, mas o e-mail não saiu. Envie estes dados para o cliente:"),
            h("div", { className: "bloco", style: { padding: 14, fontSize: 15 } }, h("div", null, "Endereço: ", h("b", null, location.origin + location.pathname.replace(/plataforma\/.*$/, ""))),
              h("div", null, "E-mail: ", h("b", null, resultado.email)), h("div", null, "Senha provisória: ", h("b", { style: { letterSpacing: 1 } }, resultado.senha))))) : null);
  }
  function AprovarPedido({ pedido, aoFechar, aoAprovar }) {
    const [nome, setNome] = useState(pedido.empresa);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState("");
    async function aprovar() {
      setErro(""); setEnviando(true);
      try { aoAprovar(await api("empresas.cadastro_aprovar", { id: pedido.id, nome })); } catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: "Aprovar " + pedido.empresa, sub: pedido.responsavel + " · " + pedido.email, aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "a", className: "bt bt-marca", onClick: aprovar, disabled: enviando }, enviando ? "Liberando…" : "Aprovar e enviar acesso")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Nome da empresa no sistema", dica: "Pode ajustar antes de criar (ex.: nome fantasia)." }, h(Texto, { valor: nome, aoMudar: setNome })),
      h("p", { className: "cel-sub" }, "Ao aprovar: a empresa é criada com o catálogo padrão, " + pedido.responsavel + " vira administrador e recebe por e-mail o link e uma senha provisória. No primeiro acesso ele cria a própria senha e aceita os Termos."));
  }
  function RecusarPedido({ pedido, aoFechar, aoRecusar }) {
    const [motivo, setMotivo] = useState("");
    const [avisar, setAvisar] = useState(true);
    const [enviando, setEnviando] = useState(false);
    async function recusar() {
      setEnviando(true);
      try { await api("empresas.cadastro_recusar", { id: pedido.id, motivo, avisar }); K.avisar("Pedido recusado."); aoRecusar(); } catch (x) { K.avisar(x.message, true); setEnviando(false); }
    }
    return h(Painel, { titulo: "Recusar " + pedido.empresa, aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "r", className: "bt bt-perigo", onClick: recusar, disabled: enviando }, "Recusar")] },
      h(Campo, { rotulo: "Motivo (opcional)", dica: "Vai no e-mail, se marcar abaixo." }, h("textarea", { rows: 3, value: motivo, onChange: e => setMotivo(e.target.value) })),
      h("label", { className: "check" }, h("input", { type: "checkbox", checked: avisar, onChange: e => setAvisar(e.target.checked) }), "Avisar o solicitante por e-mail"));
  }

  /* ---------------- central de ajuda (v1.14.0) ---------------- */

  const SUP_ST = { aberto: ["Aberto", "os-azul"], em_analise: ["Em análise", "os-amarelo"], respondido: ["Respondido", "os-verde"], resolvido: ["Resolvido", "os-cinza"] };
  const SUP_TIPO = { problema: "Problema", reclamacao: "Reclamação", sugestao: "Sugestão", duvida: "Dúvida" };
  const PERF = { admin: "Administrador", coord: "Coordenação", tecnico: "Técnico" };
  const qd = s => s ? String(s).slice(8, 10) + "/" + String(s).slice(5, 7) + " " + String(s).slice(11, 16) : "";

  function CentralAjuda({ aoLer }) {
    const [filtro, setFiltro] = useState("pendentes");
    const [tipo, setTipo] = useState("");
    const [busca, setBusca] = useState("");
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [aberto, setAberto] = useState(null);
    function carregar() { api("suporte.listar", { status: filtro, tipo, busca }).then(r => { setD(r); setErro(""); }, e => setErro(e.message)); }
    useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [filtro, tipo, busca]); // eslint-disable-line
    const c = (d && d.porStatus) || {};
    const chip = (v, l, n) => h("button", { key: v, className: "chip" + (filtro === v ? " ativo" : ""), onClick: () => setFiltro(v) }, l, n != null ? h("span", { className: "chip-n" }, n) : null);
    return h("div", null,
      h("div", { className: "chips", style: { marginBottom: 12 } },
        chip("pendentes", "Pendentes", (c.aberto || 0) + (c.em_analise || 0)), chip("aberto", "Abertos", c.aberto || 0), chip("em_analise", "Em análise", c.em_analise || 0),
        chip("respondido", "Respondidos", c.respondido || 0), chip("resolvido", "Resolvidos", c.resolvido || 0), chip("", "Todos")),
      h("div", { className: "barra" },
        h("input", { className: "entrada-texto busca", placeholder: "Buscar por título, empresa ou pessoa", value: busca, onChange: e => setBusca(e.target.value) }),
        h("select", { className: "entrada-texto", value: tipo, onChange: e => setTipo(e.target.value), style: { width: "auto" } },
          h("option", { value: "" }, "Todos os tipos"), Object.keys(SUP_TIPO).map(k => h("option", { key: k, value: k }, SUP_TIPO[k])))),
      erro ? h("div", { className: "bloco vazio" }, h(Aviso, null, erro))
      : !d ? h("div", { className: "bloco vazio" }, "Carregando…")
      : !d.itens.length ? h("div", { className: "bloco vazio" }, "Nenhum relato aqui.")
      : h("div", { className: "bloco" }, h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "Relato"), h("th", null, "Empresa / pessoa"), h("th", null, "Situação"), h("th", null, "Atualizado"))),
          h("tbody", null, d.itens.map(s => h("tr", { key: s.id, onClick: () => { setAberto(s.id); if (s.naoLido) aoLer(); }, style: { cursor: "pointer", fontWeight: s.naoLido ? 600 : 400 } },
            h("td", null, h("div", { className: "cel-titulo" }, (s.naoLido ? "● " : "") + s.assunto), h("div", { className: "cel-sub" }, SUP_TIPO[s.tipo] + (s.tela ? " · tela " + s.tela : ""))),
            h("td", null, h("div", null, s.empresa), h("div", { className: "cel-sub" }, (s.usuario || "—") + (s.perfil ? " · " + (PERF[s.perfil] || s.perfil) : ""))),
            h("td", null, h("span", { className: "selo " + (SUP_ST[s.status] || SUP_ST.aberto)[1] }, (SUP_ST[s.status] || SUP_ST.aberto)[0])),
            h("td", null, qd(s.atualizadoEm)))))))),
      aberto ? h(RelatoConsole, { id: aberto, aoFechar: () => { setAberto(null); carregar(); } }) : null);
  }

  function RelatoConsole({ id, aoFechar }) {
    const [s, setS] = useState(null);
    const [txt, setTxt] = useState("");
    const [st, setSt] = useState("respondido");
    const [enviando, setEnviando] = useState(false);
    const [img, setImg] = useState(null);
    function carregar() { api("suporte.obter", { id }).then(setS, e => K.avisar(e.message, true)); }
    useEffect(carregar, [id]); // eslint-disable-line
    async function responder() {
      setEnviando(true);
      try { await api("suporte.responder", { id, texto: txt, status: st }); setTxt(""); K.avisar("Resposta enviada."); carregar(); } catch (x) { K.avisar(x.message, true); } finally { setEnviando(false); }
    }
    async function mudar(v) { try { await api("suporte.status", { id, status: v }); carregar(); } catch (x) { K.avisar(x.message, true); } }
    if (!s) return h(Painel, { titulo: "Relato", aoFechar }, h("div", { className: "vazio" }, "Carregando…"));
    return h(Painel, { titulo: s.assunto, largo: true, aoFechar, sub: SUP_TIPO[s.tipo] + " · " + s.empresa + " · " + (s.usuario || "—") + (s.email ? " (" + s.email + ")" : ""),
      rodape: [h("select", { key: "s", className: "entrada-texto", value: s.status, onChange: e => mudar(e.target.value), style: { width: "auto" } },
                 Object.keys(SUP_ST).map(k => h("option", { key: k, value: k }, SUP_ST[k][0]))), h("div", { key: "e", style: { flex: 1 } }),
               h("button", { key: "f", className: "bt", onClick: aoFechar }, "Fechar")] },
      h("p", { className: "cel-sub", style: { marginTop: 0 } }, "Tela: " + (s.tela || "—") + " · versão " + (s.versaoApp || "—") + " · " + (s.navegador || "")),
      h("div", { className: "sup-conversa" }, s.mensagens.map(m => h("div", { key: m.id, className: "sup-msg" + (m.autor === "plataforma" ? " plat" : "") },
        h("small", null, (m.autorNome || m.autor) + " · " + qd(m.criadoEm)), h("p", null, m.texto)))),
      s.prints.length ? h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 } }, s.prints.map((src, i) => h("img", { key: i, src, alt: "Print", onClick: () => setImg(src),
        style: { width: 160, height: 110, objectFit: "cover", borderRadius: 8, border: "1px solid var(--linha)", cursor: "zoom-in" } }))) : null,
      img ? h("div", { onClick: () => setImg(null), style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 90, display: "grid", placeItems: "center", cursor: "zoom-out" } },
        h("img", { src: img, alt: "", style: { maxWidth: "95vw", maxHeight: "92vh" } })) : null,
      h("div", { className: "secao-titulo" }, "Responder"),
      h("textarea", { value: txt, onChange: e => setTxt(e.target.value), rows: 4, style: { width: "100%" } }),
      h("div", { style: { display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" } },
        h("span", { className: "cel-sub" }, "Depois de responder, fica como"),
        h("select", { className: "entrada-texto", value: st, onChange: e => setSt(e.target.value), style: { width: "auto" } }, Object.keys(SUP_ST).map(k => h("option", { key: k, value: k }, SUP_ST[k][0]))),
        h("button", { className: "bt bt-marca", disabled: enviando || !txt.trim(), onClick: responder }, enviando ? "Enviando…" : "Enviar resposta")));
  }

  /* ---------------- empresas ---------------- */

  function Empresas() {
    const [lista, recarregar] = K.useDados("empresas.listar");
    const [editando, setEditando] = useState(null);
    const [numeracao, setNumeracao] = useState(null);
    const [equipeDe, setEquipeDe] = useState(null);

    async function alternar(e) {
      const desligar = e.ativo;
      if (desligar && !(await K.confirmar({ titulo: "Desativar " + e.nome + "?", texto: "Todos os usuários dessa empresa perdem o acesso na hora. Os dados continuam guardados e voltam ao reativar.", botao: "Desativar", perigo: true }))) return;
      try { await api("empresas.ativar", { id: e.id, ativo: !desligar }); K.avisar(desligar ? "Empresa desativada." : "Empresa reativada."); recarregar(); }
      catch (x) { K.avisar(x.message, true); }
    }

    async function copiarCatalogo(e) {
      if (!(await K.confirmar({ titulo: "Copiar catálogo para " + e.nome + "?", texto: "Serviços, materiais (com as regras de cálculo) e tipos de máquina da empresa modelo serão copiados. Depois a empresa ajusta os próprios preços sem afetar as outras.", botao: "Copiar catálogo" }))) return;
      try { const r = await api("empresas.copiar_catalogo", { id: e.id }); K.avisar("Catálogo copiado: " + r.catalogo.servicos + " serviços, " + r.catalogo.materiais + " materiais, " + r.catalogo.maquinas + " tipos de máquina."); recarregar(); }
      catch (x) { K.avisar(x.message, true); }
    }
    const catVazio = e => e.catalogo && !e.modelo && (e.catalogo.servicos + e.catalogo.materiais + e.catalogo.maquinas) === 0;
    const catTexto = e => !e.catalogo ? "—" : e.modelo ? "Modelo" : (e.catalogo.servicos + e.catalogo.materiais + e.catalogo.maquinas) === 0 ? "Vazio" : e.catalogo.servicos + " serv. · " + e.catalogo.materiais + " mat.";

    return h("div", null,
      h("div", { className: "barra" },
        h("p", { style: { margin: 0, color: "var(--tinta-2)" } }, "Empresas que usam a plataforma. Cada uma só enxerga os próprios dados."),
        h("div", { style: { flex: 1 } }),
        h("button", { className: "bt bt-marca", onClick: () => setEditando({}) }, "Nova empresa")),
      h("div", { className: "bloco" },
        lista.carregando ? h("div", { className: "vazio" }, "Carregando…")
        : lista.erro ? h("div", { className: "vazio" }, h(Aviso, null, lista.erro))
        : h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
            h("thead", null, h("tr", null, h("th", null, "Empresa"), h("th", { className: "num" }, "Usuários"), h("th", { className: "num" }, "Próx. chamado"), h("th", null, "Catálogo"), h("th", null, "Situação"), h("th", null, "Desde"), h("th", { className: "acoes" }))),
            h("tbody", null, lista.dados.map(e => h("tr", { key: e.id },
              h("td", null, h("div", { className: "cel-titulo" }, e.nome), h("div", { className: "cel-sub" }, e.slug + (e.cnpj ? " · " + e.cnpj : ""))),
              h("td", { className: "num" }, e.usuarios),
              h("td", { className: "num" }, e.sequencias.chamado ?? "—"),
              h("td", null, catVazio(e) ? h("span", { className: "selo selo-off" }, "Vazio") : catTexto(e)),
              h("td", null, h("span", { className: "selo " + (e.ativo ? "selo-ok" : "selo-off") }, e.ativo ? "Ativa" : "Desativada")),
              h("td", null, K.dataHora(e.criadoEm).split(" ")[0]),
              h("td", { className: "acoes" },
                h("button", { className: "bt bt-leve bt-p", onClick: () => setEditando(e) }, "Editar"),
                h("button", { className: "bt bt-leve bt-p", onClick: () => setEquipeDe(e) }, "Usuários"),
                h("button", { className: "bt bt-leve bt-p", onClick: () => setNumeracao(e) }, "Numeração"),
                catVazio(e) ? h("button", { className: "bt bt-leve bt-p", onClick: () => copiarCatalogo(e) }, "Copiar catálogo") : null,
                h("button", { className: "bt bt-leve bt-p" + (e.ativo ? " bt-perigo" : ""), onClick: () => alternar(e) }, e.ativo ? "Desativar" : "Reativar")))))))),
      editando ? h(FormEmpresa, { empresa: editando, aoFechar: () => setEditando(null), aoSalvar: () => { setEditando(null); recarregar(); } }) : null,
      equipeDe ? h(UsuariosDaEmpresa, { empresa: equipeDe, aoFechar: () => setEquipeDe(null) }) : null,
      numeracao ? h(FormNumeracao, { empresa: numeracao, aoFechar: () => setNumeracao(null), aoSalvar: () => { setNumeracao(null); recarregar(); } }) : null);
  }

  function slugDe(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  function FormEmpresa({ empresa, aoFechar, aoSalvar }) {
    const nova = !empresa.id;
    const [f, setF] = useState({ nome: empresa.nome || "", slug: empresa.slug || "", razaoSocial: empresa.razaoSocial || "", cnpj: empresa.cnpj || "" });
    const [slugManual, setSlugManual] = useState(!nova);
    const [adm, setAdm] = useState({ nome: "", email: "", senha: "" });
    const [inicio, setInicio] = useState({ chamado: 1, os_contrato: 1, contrato: 1, cliente: 1 });
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);

    const mudar = k => v => setF(Object.assign({}, f, { [k]: v }, k === "nome" && !slugManual ? { slug: slugDe(v) } : {}));
    const mudarAdm = k => v => setAdm(Object.assign({}, adm, { [k]: v }));
    const mudarIni = k => v => setInicio(Object.assign({}, inicio, { [k]: v.replace(/\D/g, "") }));

    async function salvar() {
      setErro("");
      if (!f.nome.trim()) return setErro("Informe o nome da empresa.");
      const dados = Object.assign({}, f, { id: empresa.id || 0 });
      if (nova) {
        if (!adm.nome.trim() || !/^\S+@\S+\.\S+$/.test(adm.email.trim())) return setErro("Informe nome e e-mail válidos do administrador.");
        if (!K.senhaBoa(adm.senha)) return setErro("A senha inicial precisa ter pelo menos 8 caracteres, com letras e números.");
        dados.admin = adm;
        dados.inicio = {};
        Object.keys(inicio).forEach(k => { dados.inicio[k] = Math.max(1, parseInt(inicio[k] || "1", 10)); });
      }
      setEnviando(true);
      try { await api("empresas.salvar", dados); K.avisar(nova ? "Empresa criada." : "Empresa atualizada."); aoSalvar(); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }

    return h(Painel, {
      titulo: nova ? "Nova empresa" : "Editar empresa",
      sub: nova ? "Cria a empresa e o primeiro administrador dela." : empresa.nome,
      aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : nova ? "Criar empresa" : "Salvar alterações")],
    },
      h(Aviso, null, erro),
      h("div", { className: "secao-titulo" }, "Empresa"),
      h(Campo, { rotulo: "Nome" }, h(Texto, { valor: f.nome, aoMudar: mudar("nome"), autoFocus: true })),
      h(Campo, { rotulo: "Identificador", dica: "Só letras minúsculas, números e hífen. Não aparece para os clientes." },
        h(Texto, { valor: f.slug, aoMudar: v => { setSlugManual(true); setF(Object.assign({}, f, { slug: slugDe(v) })); } })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Razão social" }, h(Texto, { valor: f.razaoSocial, aoMudar: mudar("razaoSocial") })),
        h(Campo, { rotulo: "CNPJ" }, h(Texto, { valor: f.cnpj, aoMudar: mudar("cnpj"), inputMode: "numeric" }))),
      nova ? h(React.Fragment, null,
        h("div", { className: "secao-titulo" }, "Administrador da empresa"),
        h(Campo, { rotulo: "Nome" }, h(Texto, { valor: adm.nome, aoMudar: mudarAdm("nome") })),
        h(Campo, { rotulo: "E-mail (login)" }, h(Texto, { valor: adm.email, aoMudar: mudarAdm("email"), type: "email" })),
        h(Campo, { rotulo: "Senha inicial", dica: "Ele troca no primeiro acesso." }, h(Senha, { valor: adm.senha, aoMudar: mudarAdm("senha"), autoComplete: "new-password" })),
        h("div", { className: "secao-titulo" }, "Números iniciais"),
        h("div", { className: "linha-campos" },
          h(Campo, { rotulo: "Primeiro chamado" }, h(Texto, { valor: inicio.chamado, aoMudar: mudarIni("chamado"), inputMode: "numeric" })),
          h(Campo, { rotulo: "Primeira OS de contrato", dica: "Sai como C-" + String(inicio.os_contrato || 1).padStart(4, "0") }, h(Texto, { valor: inicio.os_contrato, aoMudar: mudarIni("os_contrato"), inputMode: "numeric" })))) : null);
  }

  function FormNumeracao({ empresa, aoFechar, aoSalvar }) {
    const tipos = ["chamado", "os_contrato", "contrato", "cliente"];
    const [f, setF] = useState(Object.assign({}, empresa.sequencias));
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    async function salvar() {
      setErro("");
      const mudou = tipos.filter(t => String(f[t]) !== String(empresa.sequencias[t]));
      if (!mudou.length) return aoFechar();
      setEnviando(true);
      try {
        for (const t of mudou) await api("empresas.sequencia", { id: empresa.id, tipo: t, proximo: parseInt(f[t], 10) || 0 });
        K.avisar("Numeração ajustada."); aoSalvar();
      } catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, {
      titulo: "Numeração", sub: empresa.nome, aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar")],
    },
      h(Aviso, { tipo: "info" }, "O próximo número só pode aumentar. Assim nenhum número já usado se repete."),
      h(Aviso, null, erro),
      tipos.map(t => h(Campo, { key: t, rotulo: NOMES_SEQ[t], dica: "Atual: " + rotuloNumero(t, empresa.sequencias[t]) },
        h(Texto, { valor: f[t], aoMudar: v => setF(Object.assign({}, f, { [t]: v.replace(/\D/g, "") })), inputMode: "numeric" }))));
  }


  /* ---------------- suporte: usuários de uma empresa ---------------- */

  function UsuariosDaEmpresa({ empresa, aoFechar }) {
    const [lista] = K.useDados("empresas.usuarios", { id: empresa.id }, [empresa.id]);
    const [alvo, setAlvo] = useState(null);
    const [senha, setSenha] = useState("");
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);

    async function definir() {
      setErro("");
      if (!K.senhaBoa(senha)) return setErro("A senha precisa ter pelo menos 8 caracteres, com letras e números.");
      setEnviando(true);
      try {
        await api("empresas.definir_senha", { empresaId: empresa.id, usuarioId: alvo.id, senha });
        K.avisar("Senha temporária definida para " + alvo.nome.split(" ")[0] + ".");
        setAlvo(null); setSenha("");
      } catch (x) { setErro(x.message); }
      setEnviando(false);
    }

    return h(Painel, { titulo: "Usuários", sub: empresa.nome, aoFechar },
      lista.carregando ? h("p", null, "Carregando…")
      : lista.erro ? h(Aviso, null, lista.erro)
      : !lista.dados.length ? h("p", null, "Nenhum usuário.")
      : h("div", { className: "bloco" }, h("table", { className: "tabela" },
          h("tbody", null, lista.dados.map(u => h("tr", { key: u.id },
            h("td", null, h("div", { className: "cel-titulo" }, u.nome), h("div", { className: "cel-sub" }, u.email + " · " + (K.PERFIS[u.perfil] || u.perfil) + (u.status !== "ativo" ? " · inativo" : ""))),
            h("td", { className: "acoes" }, h("button", { className: "bt bt-leve bt-p", onClick: () => { setAlvo(u); setSenha(""); setErro(""); } }, "Definir senha"))))))),
      alvo ? h("div", { className: "bloco", style: { marginTop: 20 } },
        h("div", { className: "bloco-cab" }, h("h2", null, "Senha temporária para " + alvo.nome), h("p", null, "A pessoa entra com ela e é obrigada a criar outra. Use quando o admin da empresa não conseguir resolver.")),
        h("div", { className: "bloco-corpo" },
          h(Aviso, null, erro),
          h(Campo, { rotulo: "Senha temporária" }, h(Senha, { valor: senha, aoMudar: setSenha, autoComplete: "new-password", autoFocus: true }))),
        h("div", { className: "bloco-pe" },
          h("button", { className: "bt", onClick: () => setAlvo(null) }, "Cancelar"),
          h("button", { className: "bt bt-marca", onClick: definir, disabled: enviando }, enviando ? "Salvando…" : "Definir senha"))) : null);
  }

  /* ---------------- raiz do console ---------------- */

  function RaizConsole() {
    const [sessao, setSessao] = useState(undefined);
    const [erro, setErro] = useState("");
    function verificar() {
      setErro("");
      api("auth.eu").then(setSessao, e => { if (e.codigo === "SEM_SESSAO") setSessao(null); else setErro(e.message); });
    }
    useEffect(() => { K.aoPerderSessao = () => setSessao(null); K.aplicarTema(TEMA_CONSOLE); verificar(); }, []);
    async function sair() { try { await api("auth.logout"); } catch (e) {} setSessao(null); }

    let tela;
    if (erro) tela = h("div", { className: "carregando" }, h("div", { style: { textAlign: "center" } }, h("p", null, erro), h("button", { className: "bt", onClick: verificar }, "Tentar de novo")));
    else if (sessao === undefined) tela = h("div", { className: "carregando" }, "Carregando…");
    else if (sessao === null) tela = h(K.Entrada, { aoEntrar: setSessao, titulo: "Console da plataforma.", texto: "Empresas, numeração e suporte. Acesso restrito.", sub: "Acesso exclusivo do administrador da plataforma.", semLembrar: true });
    else if (sessao.trocarSenha) tela = h(K.TrocaObrigatoria, { sessao, minimo: 10, aoSair: sair, aoConcluir: () => setSessao(Object.assign({}, sessao, { trocarSenha: false })) });
    else tela = h(Console, { sessao, aoSair: sair });
    return h(React.Fragment, null, tela, h(K.Avisos), h(K.Confirmacoes));
  }

  ReactDOM.createRoot(document.getElementById("raiz")).render(h(RaizConsole));
})();
