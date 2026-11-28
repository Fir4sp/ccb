/* =====================================================================
   KONSTANTE SaaS — app/crm.js
   Módulo 2 (CRM): Clientes, Chamados e Catálogo de preços.
   v1.15.0: exporta peças de documento para o contratos.js; chamado "Proposta de contrato" abre o contrato.
   Cada tela se registra em K.modulos; o empresa.js monta o menu com elas.
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Aviso, Painel } = K;
  const { useState, useEffect, useRef } = React;

  /* listas padrão (futuramente configuráveis por empresa) */
  const ORIGENS = ["Pesquisa google", "Indicação", "Evento", "Instagram", "Linkedin", "Facebook", "Dep. Comercial"];

  function mascaraDoc(v, tipo) {
    const d = String(v || "").replace(/\D/g, "").slice(0, tipo === "PF" ? 11 : 14);
    if (tipo === "PF") return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
    return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  }

  /* ---------------- lista ---------------- */

  function Clientes({ sessao }) {
    const [busca, setBusca] = useState("");
    const [ordem, setOrdem] = useState("recentes");
    const [pagina, setPagina] = useState(1);
    const [estado, setEstado] = useState({ carregando: true, erro: "", dados: null });
    const [editando, setEditando] = useState(null);
    const [importando, setImportando] = useState(false);
    const [grupos, setGrupos] = useState([]);          /* CCB v2 */
    const [grupoId, setGrupoId] = useState("");
    const [verGrupos, setVerGrupos] = useState(false);
    const carregarGrupos = () => api("clientes.grupos").then(setGrupos, () => {});
    useEffect(() => { carregarGrupos(); }, []);
    const pedido = useRef(0);
    const ehAdmin = K.temPerfil(sessao, "admin", "comercial");   /* v1.22.0: comercial administra o CRM */
    const consulta = K.soConsultaCRM(sessao);                     /* v1.22.0: financeiro só consulta */

    function carregar(pg) {
      const n = ++pedido.current;   // ignora respostas atrasadas de buscas antigas
      setEstado(e => Object.assign({}, e, { carregando: true, erro: "" }));
      api("clientes.listar", { busca: busca.trim(), ordem, pagina: pg || pagina, grupoId: grupoId || null }).then(
        d => { if (n === pedido.current) setEstado({ carregando: false, erro: "", dados: d }); },
        e => { if (n === pedido.current) setEstado({ carregando: false, erro: e.message, dados: null }); });
    }

    /* busca espera o usuário parar de digitar */
    useEffect(() => { const t = setTimeout(() => { setPagina(1); carregar(1); }, 300); return () => clearTimeout(t); }, [busca, ordem, grupoId]); // eslint-disable-line
    useEffect(() => { carregar(pagina); }, [pagina]); // eslint-disable-line

    async function excluir(c) {
      const ok = await K.confirmar({ titulo: "Excluir " + c.nome + "?", texto: "A Casa de Oração some das listas. O histórico continua registrado.", botao: "Excluir", perigo: true });
      if (!ok) return;
      try { await api("clientes.excluir", { id: c.id }); K.avisar("Casa de Oração excluída."); carregar(); }
      catch (x) { K.avisar(x.message, true); }
    }

    const d = estado.dados;
    const itens = d ? d.itens : [];
    const paginas = d ? Math.max(1, Math.ceil(d.total / d.porPagina)) : 1;
    const t = busca.trim();

    return h("div", null,
      h("div", { className: "barra" },
        h("input", { className: "entrada-texto busca", placeholder: "Buscar por nome, código, contato ou telefone", value: busca, onChange: e => setBusca(e.target.value), "aria-label": "Buscar Casas de Oração" }),
        h("select", { className: "entrada-texto", style: { width: "auto" }, value: grupoId, onChange: e => setGrupoId(e.target.value), "aria-label": "Grupo" },
          h("option", { value: "" }, "Todos os grupos"), grupos.map(g => h("option", { key: g.id, value: g.id }, g.nome))),
        h("select", { className: "entrada-texto", style: { width: "auto" }, value: ordem, onChange: e => setOrdem(e.target.value), "aria-label": "Ordenar" },
          h("option", { value: "recentes" }, "Mais recentes"), h("option", { value: "antigos" }, "Mais antigos"),
          h("option", { value: "az" }, "Nome (A → Z)"), h("option", { value: "za" }, "Nome (Z → A)")),
        h("div", { style: { flex: 1 } }),
        ehAdmin ? h("button", { className: "bt", onClick: () => setVerGrupos(true) }, "Grupos") : null,
        consulta ? null : h("button", { className: "bt bt-marca", onClick: () => setEditando({}) }, "Nova Casa de Oração")),
      h("div", { className: "bloco" },
        estado.erro ? h("div", { className: "vazio" }, h(Aviso, null, estado.erro), h("button", { className: "bt", onClick: () => carregar() }, "Tentar de novo"))
        : !d ? h("div", { className: "vazio" }, "Carregando…")
        : !itens.length ? h("div", { className: "vazio" }, h("strong", null, t ? "Nenhuma Casa de Oração encontrada." : "Nenhuma Casa de Oração ainda."), t ? "Confira a busca." : "Cadastre a primeira Casa de Oração para abrir chamados.")
        : h(React.Fragment, null,
            h("div", { className: "tabela-caixa", style: { opacity: estado.carregando ? .55 : 1 } }, h("table", { className: "tabela" },
              h("thead", null, h("tr", null, h("th", null, "Código"), h("th", null, "Casa de Oração"), h("th", null, "Grupo"), h("th", null, "Contato"), h("th", null, "Chamados"), h("th", { className: "acoes" }))),
              h("tbody", null, itens.map(c => h("tr", { key: c.id },
                h("td", { className: "cel-sub" }, c.codigo || c.numero),
                h("td", null, h("div", { className: "cel-titulo" }, c.nome), h("div", { className: "cel-sub" }, c.endereco || "—")),
                h("td", null, c.grupoNome || h("span", { className: "cel-sub" }, "—")),
                h("td", null, h("div", null, c.contato || "—"), h("div", { className: "cel-sub" }, c.telefone || "")),
                h("td", null, c.chamados),
                h("td", { className: "acoes" },
                  h("button", { className: "bt bt-leve bt-p", onClick: () => setEditando(c) }, consulta ? "Ver" : "Editar"),
                  ehAdmin ? h("button", { className: "bt bt-leve bt-p bt-perigo", onClick: () => excluir(c) }, "Excluir") : null)))))),
            h("div", { className: "paginacao" },
              h("span", null, d.total + (d.total === 1 ? " Casa de Oração" : " Casas de Oração")),
              paginas > 1 ? h("span", { style: { display: "flex", gap: 6, alignItems: "center" } },
                h("button", { className: "bt bt-p", disabled: pagina <= 1, onClick: () => setPagina(pagina - 1) }, "Anterior"),
                h("span", null, pagina + " de " + paginas),
                h("button", { className: "bt bt-p", disabled: pagina >= paginas, onClick: () => setPagina(pagina + 1) }, "Próxima")) : null))),
      editando ? h(FormCliente, { cliente: editando, consulta, grupos, aoNovoGrupo: carregarGrupos, aoFechar: () => setEditando(null), aoSalvar: () => { setEditando(null); carregar(); } }) : null,
      verGrupos ? h(Grupos, { grupos, aoMudar: carregarGrupos, aoFechar: () => { setVerGrupos(false); carregar(); } }) : null,
      importando ? h(ImportarClientes, { aoFechar: () => setImportando(false), aoConcluir: () => { setPagina(1); carregar(1); } }) : null);
  }

  /* ---------------- importação por planilha ---------------- */

  const COLS_IMPORT = [
    ["numero", "Nº", ["n", "no", "num", "numero", "numero do cliente", "codigo", "cod"]],
    ["nome", "Nome / empresa", ["nome", "nome empresa", "cliente", "empresa", "razao social", "nome fantasia"]],
    ["tipoPessoa", "Tipo (PJ ou PF)", ["tipo", "tipo pj ou pf", "tipo pessoa", "pessoa", "pj pf"]],
    ["documento", "CNPJ / CPF", ["cnpj cpf", "cnpj", "cpf", "documento", "cpf cnpj"]],
    ["contato", "Contato", ["contato", "responsavel", "nome do contato", "com quem falar"]],
    ["telefone", "Telefone", ["telefone", "whatsapp", "celular", "fone", "telefone whatsapp"]],
    ["email", "E-mail", ["email", "e mail"]],
    ["endereco", "Endereço", ["endereco", "endereco completo", "local"]],
    ["situacao", "Situação (Novo ou Antigo)", ["situacao", "situacao novo ou antigo", "status"]],
    ["origem", "Origem", ["origem", "como chegou", "como chegou ate nos", "como conheceu"]],
    ["obs", "Observações", ["observacoes", "observacao", "obs"]],
  ];
  const semAcento = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  let carregandoXlsx = null;
  function xlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!carregandoXlsx) carregandoXlsx = new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => window.XLSX ? ok(window.XLSX) : falha(new Error("Leitor de planilha indisponível."));
      s.onerror = () => { carregandoXlsx = null; falha(new Error("Não foi possível carregar o leitor de planilhas. Confira a internet e tente de novo.")); };
      document.head.appendChild(s);
    });
    return carregandoXlsx;
  }

  async function baixarModelo() {
    try {
      const X = await xlsx();
      const linhas = [COLS_IMPORT.map(c => c[1]),
        ["", "Condomínio Exemplo", "PJ", "12.345.678/0001-90", "João (síndico)", "(11) 99999-0000", "sindico@exemplo.com", "Rua Exemplo, 100 - Centro - São Paulo/SP", "Novo", "Indicação", "Apagar estas linhas de exemplo"],
        ["", "Maria Exemplo", "PF", "123.456.789-09", "", "(11) 98888-0000", "", "", "Antigo", "", ""]];
      const ws = X.utils.aoa_to_sheet(linhas);
      ws["!cols"] = COLS_IMPORT.map((c, i) => ({ wch: [6, 30, 8, 20, 20, 16, 26, 40, 12, 16, 30][i] }));
      const ajuda = X.utils.aoa_to_sheet([["Origens aceitas (cliente Novo)"]].concat(ORIGENS.map(o => [o])).concat([[""], ["Situação: Novo ou Antigo (antigo = já era cliente; não precisa de origem)"], ["Tipo: PJ ou PF (em branco = descobre pelo CNPJ/CPF)"], ["Nº: opcional. Em branco = o sistema numera."]]));
      ajuda["!cols"] = [{ wch: 70 }];
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, "Clientes");
      X.utils.book_append_sheet(wb, ajuda, "Como preencher");
      X.writeFile(wb, "modelo-importacao-clientes.xlsx");
    } catch (x) { K.avisar(x.message, true); }
  }

  /* lê a 1ª aba e devolve [{linha, ...campos}] reconhecendo os títulos das colunas */
  async function lerPlanilha(arq) {
    const X = await xlsx();
    const buf = await arq.arrayBuffer();
    let wb;
    if (/\.csv$/i.test(arq.name || "")) {
      /* CSV do Excel brasileiro: separado por ";" e às vezes em Windows-1252 */
      let txt = new TextDecoder("utf-8").decode(buf);
      if (txt.indexOf("\ufffd") >= 0) txt = new TextDecoder("windows-1252").decode(buf);
      const l1 = txt.split(/\r?\n/)[0] || "";
      const sep = (l1.match(/;/g) || []).length > (l1.match(/,/g) || []).length ? ";" : ",";
      wb = X.read(txt.replace(/^\ufeff/, ""), { type: "string", FS: sep, raw: true });
    } else wb = X.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const grade = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    let iCab = -1, mapa = {};
    for (let i = 0; i < Math.min(grade.length, 10) && iCab < 0; i++) {
      const m = {};
      grade[i].forEach((t, j) => { const n = semAcento(t); const c = COLS_IMPORT.find(c => c[2].indexOf(n) >= 0); if (c && m[c[0]] == null) m[c[0]] = j; });
      if (m.nome != null) { iCab = i; mapa = m; }
    }
    if (iCab < 0) throw new Error("Não achei a coluna \u201cNome\u201d. Use o modelo ou dê o título Nome à coluna dos clientes.");
    const texto = (v, campo) => {
      if (typeof v === "number") return (campo === "documento" || campo === "telefone" || campo === "numero") ? String(Math.round(v)) : String(v);
      return String(v == null ? "" : v).trim();
    };
    const out = [];
    for (let i = iCab + 1; i < grade.length; i++) {
      const g = grade[i], l = { linha: i + 1 };
      Object.keys(mapa).forEach(k => { l[k] = texto(g[mapa[k]], k); });
      if (Object.keys(mapa).every(k => !l[k])) continue;   // linha vazia
      if (/^apagar estas linhas/i.test(l.obs || "") || l.nome === "Maria Exemplo" && l.documento === "123.456.789-09") continue;   // exemplos do modelo
      out.push(l);
    }
    return { linhas: out, colunas: Object.keys(mapa) };
  }

  function ImportarClientes({ aoFechar, aoConcluir }) {
    const [etapa, setEtapa] = useState("escolher");   // escolher → conferir → pronto
    const [arquivo, setArquivo] = useState("");
    const [linhas, setLinhas] = useState([]);
    const [res, setRes] = useState(null);
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [soErros, setSoErros] = useState(false);
    const LOTE = 500;

    async function enviarLotes(simular) {
      const tot = { prontos: 0, criados: 0, erros: 0, linhas: [] };
      for (let i = 0; i < linhas.length; i += LOTE) {
        const r = await api("clientes.importar", { linhas: linhas.slice(i, i + LOTE), simular });
        tot.prontos += r.prontos; tot.criados += r.criados; tot.erros += r.erros; tot.linhas = tot.linhas.concat(r.linhas);
      }
      return tot;
    }

    async function escolher(e) {
      const arq = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!arq) return;
      setErro(""); setOcupado(true); setArquivo(arq.name);
      try {
        const p = await lerPlanilha(arq);
        if (!p.linhas.length) throw new Error("A planilha não tem clientes abaixo dos títulos.");
        setLinhas(p.linhas);
        const tot = { prontos: 0, criados: 0, erros: 0, linhas: [] };
        for (let i = 0; i < p.linhas.length; i += LOTE) {
          const r = await api("clientes.importar", { linhas: p.linhas.slice(i, i + LOTE), simular: true });
          tot.prontos += r.prontos; tot.erros += r.erros; tot.linhas = tot.linhas.concat(r.linhas);
        }
        setRes(tot); setSoErros(tot.erros > 0); setEtapa("conferir");
      } catch (x) { setErro(x.message); }
      setOcupado(false);
    }

    async function importar() {
      setErro(""); setOcupado(true);
      try { const r = await enviarLotes(false); setRes(r); setEtapa("pronto"); aoConcluir(); }
      catch (x) { setErro(x.message); }
      setOcupado(false);
    }

    const rodape = etapa === "conferir"
      ? [h("button", { key: "v", className: "bt", onClick: () => { setEtapa("escolher"); setRes(null); }, disabled: ocupado }, "Trocar planilha"),
         h("button", { key: "i", className: "bt bt-marca", onClick: importar, disabled: ocupado || !res.prontos }, ocupado ? "Importando…" : "Importar " + res.prontos + (res.prontos === 1 ? " cliente" : " clientes"))]
      : [h("button", { key: "f", className: "bt" + (etapa === "pronto" ? " bt-marca" : ""), onClick: aoFechar }, etapa === "pronto" ? "Concluir" : "Cancelar")];

    const tabela = lista => h("div", { className: "tabela-caixa", style: { maxHeight: 380, overflowY: "auto", border: "1px solid var(--linha)", borderRadius: 8 } },
      h("table", { className: "tabela" },
        h("thead", null, h("tr", null, h("th", null, "Linha"), h("th", null, "Cliente"), h("th", null, "Resultado"))),
        h("tbody", null, lista.map(l => h("tr", { key: l.linha },
          h("td", { className: "cel-sub" }, l.linha),
          h("td", null, l.nome || h("span", { className: "cel-sub" }, "(sem nome)")),
          h("td", null, l.ok ? h("span", { className: "selo selo-ok" }, l.numero ? (etapa === "pronto" ? "Cliente nº " + l.numero : "Ok · nº " + l.numero) : "Ok")
                             : h("span", { style: { color: "var(--perigo)", fontSize: 13 } }, l.erro)))))));

    return h(Painel, { titulo: "Importar clientes", sub: "Cadastre vários clientes de uma vez por planilha (Excel ou CSV).", aoFechar, rodape },
      h(Aviso, null, erro),
      etapa === "escolher" ? h("div", null,
        h("p", null, "1. Baixe o modelo, preencha uma linha por cliente e salve."),
        h("button", { className: "bt", onClick: baixarModelo, style: { marginBottom: 16 } }, "Baixar modelo (.xlsx)"),
        h("p", null, "2. Envie a planilha. Antes de gravar, o sistema mostra o que entra e o que tem problema."),
        h("label", { className: "bt bt-marca" + (ocupado ? " disabled" : "") }, ocupado ? "Lendo " + arquivo + "…" : "Escolher planilha",
          h("input", { type: "file", accept: ".xlsx,.xls,.csv", hidden: true, disabled: ocupado, onChange: escolher })),
        h("div", { className: "cel-sub", style: { marginTop: 16, lineHeight: 1.6 } },
          "Obrigatórios: Nome; e Origem quando a situação for Novo (", ORIGENS.join(", "), "). ",
          "Situação em branco = Novo. Tipo em branco = descoberto pelo CNPJ/CPF. Nº em branco = o sistema numera; se vier preenchido, a numeração continua depois do maior. ",
          "CNPJ/CPF já cadastrado ou repetido na planilha é pulado."))
      : etapa === "conferir" ? h("div", null,
        h("div", { className: "kpis" },
          h("div", { className: "kpi kpi-forte" }, h("div", { className: "kpi-t" }, "Prontos para entrar"), h("div", { className: "kpi-v" }, res.prontos)),
          h("div", { className: "kpi" }, h("div", { className: "kpi-t" }, "Com problema (serão pulados)"), h("div", { className: "kpi-v", style: { color: res.erros ? "var(--perigo)" : undefined } }, res.erros))),
        h("p", { className: "cel-sub" }, arquivo + " · " + linhas.length + " linha(s). Corrija as linhas com problema na planilha e envie de novo, ou importe só as que estão certas."),
        res.erros ? h("label", { style: { display: "flex", gap: 8, alignItems: "center", margin: "6px 0 10px", fontSize: 13 } },
          h("input", { type: "checkbox", checked: soErros, onChange: e => setSoErros(e.target.checked) }), "Mostrar só as linhas com problema") : null,
        tabela(soErros ? res.linhas.filter(l => !l.ok) : res.linhas))
      : h("div", null,
        h("div", { className: "kpis" },
          h("div", { className: "kpi kpi-forte" }, h("div", { className: "kpi-t" }, "Clientes cadastrados"), h("div", { className: "kpi-v" }, res.criados)),
          h("div", { className: "kpi" }, h("div", { className: "kpi-t" }, "Linhas puladas"), h("div", { className: "kpi-v" }, res.erros))),
        tabela(res.linhas)));
  }

  /* ---------------- formulário ---------------- */

  /* CCB v2: grupos/setores das Casas de Oração (Grupo 8.1, 8.2…) */
  function Grupos({ grupos, aoMudar, aoFechar }) {
    const [nome, setNome] = useState("");
    const [enviando, setEnviando] = useState(false);
    async function salvar(g) {
      setEnviando(true);
      try { await api("clientes.grupo.salvar", g); K.avisar("Grupo salvo."); setNome(""); aoMudar(); }
      catch (x) { K.avisar(x.message, true); }
      setEnviando(false);
    }
    async function renomear(g) {
      const novo = window.prompt("Novo nome do grupo:", g.nome);
      if (novo && novo.trim() && novo.trim() !== g.nome) salvar({ id: g.id, nome: novo.trim(), ativo: g.ativo });
    }
    return h(Painel, { titulo: "Grupos", sub: "Setores que reúnem as Casas de Oração (ex.: Grupo 8.1).", aoFechar,
      rodape: [h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] },
      grupos.length ? h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
        h("thead", null, h("tr", null, h("th", null, "Grupo"), h("th", null, "Casas"), h("th", null, "Situação"), h("th", { className: "acoes" }))),
        h("tbody", null, grupos.map(g => h("tr", { key: g.id },
          h("td", null, h("b", null, g.nome)), h("td", null, g.casas),
          h("td", null, h("span", { className: "selo " + (g.ativo ? "selo-ok" : "selo-plain") }, g.ativo ? "Ativo" : "Inativo")),
          h("td", { className: "acoes" },
            h("button", { className: "bt bt-leve bt-p", disabled: enviando, onClick: () => renomear(g) }, "Renomear"),
            h("button", { className: "bt bt-leve bt-p", disabled: enviando, onClick: () => salvar({ id: g.id, nome: g.nome, ativo: !g.ativo }) }, g.ativo ? "Desativar" : "Ativar"))))))) 
        : h("p", { className: "cel-sub" }, "Nenhum grupo ainda."),
      h("div", { className: "secao-titulo" }, "Novo grupo"),
      h("div", { className: "os-add" },
        h("input", { className: "entrada-texto", placeholder: "Ex.: Grupo 8.1", value: nome, onChange: e => setNome(e.target.value) }),
        h("button", { type: "button", className: "bt bt-p", disabled: enviando || !nome.trim(), onClick: () => salvar({ nome: nome.trim() }) }, "Adicionar")));
  }

  function FormCliente({ cliente, aoFechar, aoSalvar, consulta, grupos, aoNovoGrupo }) {
    const novo = !cliente.id;
    const [f, setF] = useState(Object.assign({ nome: "", codigo: "", grupoId: null, contato: "", email: "", telefone: "", endereco: "", situacao: "antigo", obs: "" }, cliente));
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(Object.assign({}, f, { [k]: v }));
    const lista = (grupos || []).filter(g => g.ativo || g.id === f.grupoId);

    async function salvar() {
      setErro("");
      if (!String(f.nome || "").trim()) return setErro("Informe o nome da Casa de Oração.");
      setEnviando(true);
      try {
        const c = await api("clientes.salvar", f);
        K.avisar(novo ? "Casa de Oração cadastrada." : "Alterações salvas.");
        aoSalvar(c);
      } catch (x) { setErro(x.message); setEnviando(false); }
    }

    return h(Painel, {
      titulo: novo ? "Nova Casa de Oração" : cliente.nome,
      sub: novo ? "Cadastre a casa para abrir chamados e pedidos." : [cliente.codigo, cliente.grupoNome].filter(Boolean).join(" · "),
      aoFechar,
      rodape: consulta ? [h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")] : [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"),
               h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : novo ? "Cadastrar" : "Salvar alterações")],
    },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Nome da Casa de Oração" }, h(Texto, { valor: f.nome, aoMudar: mudar("nome"), autoFocus: true, placeholder: "Ex.: Jardim Ingás" })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Código", dica: "Opcional (ex.: CO-01)." }, h(Texto, { valor: f.codigo || "", aoMudar: mudar("codigo") })),
        h(Campo, { rotulo: "Grupo" },
          h("select", { value: f.grupoId || "", onChange: e => mudar("grupoId")(e.target.value ? Number(e.target.value) : null) },
            h("option", { value: "" }, lista.length ? "—" : "Cadastre os grupos no botão Grupos"), lista.map(g => h("option", { key: g.id, value: g.id }, g.nome))))),
      h("div", { className: "secao-titulo" }, "Contato"),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Com quem falar", dica: "Ex.: encarregado de manutenção." }, h(Texto, { valor: f.contato || "", aoMudar: mudar("contato") })),
        h(Campo, { rotulo: "Telefone" }, h(Texto, { valor: f.telefone || "", aoMudar: mudar("telefone"), inputMode: "tel" }))),
      h(Campo, { rotulo: "E-mail" }, h(Texto, { valor: f.email || "", aoMudar: mudar("email"), type: "email", inputMode: "email" })),
      h(Campo, { rotulo: "Endereço" }, h(Texto, { valor: f.endereco || "", aoMudar: mudar("endereco") })),
      h(Campo, { rotulo: "Observações" }, h("textarea", { value: f.obs || "", onChange: e => mudar("obs")(e.target.value) })));
  }

  /* =================================================================
     utilidades
     ================================================================= */
  const BRL = n => (n == null || n === "" ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  /* v1.14.0: validade da proposta e retorno marcado */
  function textoProposta(p) {
    if (!p) return "";
    if (p.diasRestantes < 0) return "Vencida há " + (-p.diasRestantes) + (p.diasRestantes === -1 ? " dia" : " dias");
    if (p.diasRestantes === 0) return "Vence hoje";
    return "Vence em " + p.diasRestantes + (p.diasRestantes === 1 ? " dia" : " dias");
  }
  function seloProposta(c) {
    const hj = new Date(); const hoje = hj.getFullYear() + "-" + String(hj.getMonth() + 1).padStart(2, "0") + "-" + String(hj.getDate()).padStart(2, "0");
    const ret = c.proximoRetorno && c.status !== "Concluído" && c.status !== "Não Aprovado" ? c.proximoRetorno : null;
    if (!c.proposta && !ret) return null;
    return h("div", { className: "ch-prop" },
      c.proposta ? h("span", { className: "ch-prop-s " + c.proposta.situacao, title: "Proposta enviada em " + String(c.proposta.enviadaEm).slice(0, 10).split("-").reverse().join("/") + " · validade " + c.proposta.validadeDias + " dias" }, textoProposta(c.proposta)) : null,
      ret ? h("span", { className: "ch-prop-s " + (ret <= hoje ? "retorno-hoje" : "retorno") }, "Retorno " + (ret === hoje ? "hoje" : ret.split("-").reverse().slice(0, 2).join("/"))) : null);
  }
  const NUM = (n, casas) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas == null ? 3 : casas });
  const dataBR = s => { if (!s) return "—"; const [a, m, d] = String(s).slice(0, 10).split("-"); return d + "/" + m + "/" + a; };
  const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  function diasEntre(a, b) { if (!a) return null; const d1 = new Date(a + "T12:00:00"), d2 = b ? new Date(b + "T12:00:00") : new Date(); return Math.max(0, Math.round((d2 - d1) / 86400000)); }
  const valTexto = v => (v == null || v === "" ? "" : String(v).replace(".", ","));

  const CLASSE_STATUS = { aberto: "st-aberto", ganho: "st-ganho", perdido: "st-perdido" };

  /* v1.8.1 — lista de chamados responsiva: tabela enxuta no computador, cartões no celular */
  (function estiloChamados() {
    if (document.getElementById("k-css-chamados")) return;
    const st = document.createElement("style");
    st.id = "k-css-chamados";
    st.textContent = [
      ".ch-tab td{padding:10px 12px}.ch-tab th{padding:10px 12px}",
      ".ch-tab .ch-n{white-space:nowrap;width:1%}",
      ".ch-tab .ch-cli{max-width:220px}.ch-tab .ch-cli .cel-titulo{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
      ".ch-tab .ch-serv{max-width:230px}.ch-tab .ch-serv .corta{max-width:230px}",
      ".ch-tab .ch-st{width:1%}.ch-tab .status-rapido{min-width:0;width:214px;max-width:214px}",
      ".ch-tab .ch-dt{white-space:nowrap;width:1%}.ch-tab .num{white-space:nowrap;width:1%}",
      ".ch-pill{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:var(--linha-2,#eceef1);font-size:11px;font-weight:600;white-space:nowrap;vertical-align:middle}",
      ".ch-cards{display:grid;gap:10px}",
      ".ch-card{background:var(--papel,#fff);border:1px solid var(--linha,#e1e3e7);border-radius:12px;padding:12px 14px;display:grid;gap:8px}",
      ".ch-card-topo{display:flex;align-items:center;justify-content:space-between;gap:8px}",
      ".ch-card-cli{font-weight:600;line-height:1.25}",
      ".ch-card .status-rapido{width:100%;max-width:none;min-width:0;height:34px}",
      ".ch-card-pe{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}",
      ".ch-card-pe .bt{min-height:36px}",
      "@media (max-width:760px){.ch-chips{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}.ch-chips .chip{flex:0 0 auto}.ch-chips .chips-sep{flex:0 0 1px}",
      ".ch-barra .busca{max-width:none;flex:1 1 100%}.ch-barra select.entrada-texto{flex:1 1 40%;min-width:0}.ch-barra .ch-novo{flex:1 1 100%}.ch-barra .ch-espaco{display:none}",
      ".ch-kpis{gap:8px}.ch-kpis .kpi{padding:10px 12px}.ch-kpis .kpi-v{font-size:18px}.ch-kpis .kpi-p{font-size:11px}}",
    ].join("\n");
    document.head.appendChild(st);
  })();

  /* true quando a tela é de celular (acompanha rotação e redimensionamento) */
  function useEstreito(px) {
    const q = "(max-width: " + (px || 760) + "px)";
    const [v, setV] = useState(() => window.matchMedia(q).matches);
    useEffect(() => {
      const m = window.matchMedia(q), f = () => setV(m.matches);
      if (m.addEventListener) m.addEventListener("change", f); else m.addListener(f);
      return () => { if (m.removeEventListener) m.removeEventListener("change", f); else m.removeListener(f); };
    }, [q]);
    return v;
  }
  function SeloStatus({ status, categoria }) {
    const cls = status === "Concluído" ? "st-concluido" : CLASSE_STATUS[categoria] || "";
    return h("span", { className: "selo " + cls }, status);
  }

  /* busca de cliente com lista suspensa */
  function EscolheCliente({ valor, rotulo, aoEscolher }) {
    const [texto, setTexto] = useState("");
    const [aberto, setAberto] = useState(false);
    const [itens, setItens] = useState([]);
    const pedido = useRef(0);
    useEffect(() => {
      if (!aberto) return;
      const n = ++pedido.current;
      const t = setTimeout(() => api("clientes.listar", { busca: texto.trim(), ordem: texto.trim() ? "az" : "recentes" })
        .then(d => { if (n === pedido.current) setItens(d.itens.slice(0, 8)); }, () => {}), 250);
      return () => clearTimeout(t);
    }, [texto, aberto]);
    if (valor && !aberto) {
      return h("div", { className: "escolhido" },
        h("span", null, h("b", null, rotulo || ("Casa #" + valor))),
        h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => { setTexto(""); setAberto(true); } }, "Trocar"));
    }
    return h("div", { className: "escolhe" },
      h("input", { className: "entrada-texto", autoFocus: true, placeholder: "Digite o nome ou o código da Casa de Oração", value: texto,
        onChange: e => setTexto(e.target.value), onFocus: () => setAberto(true) }),
      aberto ? h("div", { className: "escolhe-lista" },
        itens.length ? itens.map(c => h("button", { type: "button", key: c.id, onClick: () => { aoEscolher(c); setAberto(false); } },
          h("b", null, c.nome), h("span", null, "nº " + c.numero + (c.contato ? " · " + c.contato : ""))))
        : h("div", { className: "cel-sub", style: { padding: 10 } }, texto.trim() ? "Nenhuma Casa de Oração encontrada. Cadastre em Casas de Oração." : "Carregando…"),
        valor ? h("button", { type: "button", className: "escolhe-cancelar", onClick: () => setAberto(false) }, "Manter a casa atual") : null) : null);
  }

  /* =================================================================
     CHAMADOS
     ================================================================= */

  /* ---------- período dos indicadores (v1.12.0) ----------
     Padrão: mês atual. Virar o mês só muda o filtro; nada é apagado. */
  const MESES_P = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const isoP = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const brP = v => v ? v.slice(8, 10) + "/" + v.slice(5, 7) + "/" + v.slice(0, 4) : "";
  function periodoPadrao() { const d = new Date(); return { tipo: "mes", ano: d.getFullYear(), mes: d.getMonth(), de: "", ate: "" }; }
  function intervaloDe(p) {
    if (p.tipo === "ano") return { de: p.ano + "-01-01", ate: p.ano + "-12-31" };
    if (p.tipo === "intervalo" && p.de && p.ate) return { de: p.de, ate: p.ate };
    if (p.tipo === "tudo") return { de: "2000-01-01", ate: isoP(new Date(new Date().getFullYear() + 5, 11, 31)) };
    return { de: isoP(new Date(p.ano, p.mes, 1)), ate: isoP(new Date(p.ano, p.mes + 1, 0)) };
  }
  function SeletorPeriodo({ periodo, setPeriodo }) {
    const hoje = new Date();
    const muda = o => setPeriodo(Object.assign({}, periodo, o));
    const passo = n => { const d = new Date(periodo.ano, periodo.mes + n, 1); muda({ tipo: "mes", ano: d.getFullYear(), mes: d.getMonth() }); };
    const atual = periodo.tipo === "mes" && periodo.ano === hoje.getFullYear() && periodo.mes === hoje.getMonth();
    const anterior = (() => { const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); return periodo.tipo === "mes" && periodo.ano === d.getFullYear() && periodo.mes === d.getMonth(); })();
    const anos = []; for (let a = hoje.getFullYear() + 1; a >= 2020; a--) anos.push(a);
    let rotulo;
    if (periodo.tipo === "mes") rotulo = MESES_P[periodo.mes].charAt(0).toUpperCase() + MESES_P[periodo.mes].slice(1) + " de " + periodo.ano;
    else if (periodo.tipo === "ano") rotulo = "ano de " + periodo.ano;
    else if (periodo.tipo === "tudo") rotulo = "todo o histórico";
    else rotulo = periodo.de && periodo.ate ? brP(periodo.de) + " a " + brP(periodo.ate) : "escolha as datas";
    return h("div", { className: "periodo" },
      h("div", { className: "periodo-t" }, "Indicadores de ", h("b", null, rotulo)),
      h("div", { className: "periodo-ctl" },
        h("button", { type: "button", className: "chip" + (atual ? " ativo" : ""), onClick: () => setPeriodo(periodoPadrao()) }, "Mês atual"),
        h("button", { type: "button", className: "chip" + (anterior ? " ativo" : ""), onClick: () => { const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); muda({ tipo: "mes", ano: d.getFullYear(), mes: d.getMonth() }); } }, "Mês anterior"),
        periodo.tipo === "mes" ? h("span", { className: "periodo-mes" },
          h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => passo(-1), "aria-label": "Mês anterior" }, "‹"),
          h("select", { className: "entrada-texto", value: periodo.mes, onChange: e => muda({ mes: +e.target.value }), "aria-label": "Mês" }, MESES_P.map((m, i) => h("option", { key: i, value: i }, m))),
          h("select", { className: "entrada-texto", value: periodo.ano, onChange: e => muda({ ano: +e.target.value }), "aria-label": "Ano" }, anos.map(a => h("option", { key: a, value: a }, a))),
          h("button", { type: "button", className: "bt bt-p bt-leve", onClick: () => passo(1), "aria-label": "Próximo mês" }, "›")) : null,
        h("select", { className: "entrada-texto periodo-tipo", value: periodo.tipo, onChange: e => muda({ tipo: e.target.value }), "aria-label": "Tipo de período" },
          h("option", { value: "mes" }, "Por mês"), h("option", { value: "ano" }, "Ano inteiro"), h("option", { value: "intervalo" }, "Intervalo de datas"), h("option", { value: "tudo" }, "Todo o histórico")),
        periodo.tipo === "ano" ? h("select", { className: "entrada-texto", value: periodo.ano, onChange: e => muda({ ano: +e.target.value }), "aria-label": "Ano" }, anos.map(a => h("option", { key: a, value: a }, a))) : null,
        periodo.tipo === "intervalo" ? h(React.Fragment, null,
          h("input", { type: "date", className: "entrada-texto", value: periodo.de, onChange: e => muda({ de: e.target.value }), "aria-label": "De" }),
          h("input", { type: "date", className: "entrada-texto", value: periodo.ate, onChange: e => muda({ ate: e.target.value }), "aria-label": "Até" })) : null));
  }

  function Chamados({ sessao }) {
    const valoresVis = K.useValores ? K.useValores() : true;   /* v1.21.0 */
    const ehAdmin = K.veValores(sessao);          /* v1.22.0: admin, comercial e financeiro veem valores */
    const consulta = K.soConsultaCRM(sessao);     /* v1.22.0: financeiro só consulta */
    const [op, setOp] = useState(null);
    const [busca, setBusca] = useState("");
    const [status, setStatus] = useState("ativos");   // padrão: esconde Concluído e Não Aprovado
    const [tipo, setTipo] = useState("");
    const [ordem, setOrdem] = useState("recentes");
    const [pagina, setPagina] = useState(1);
    const [estado, setEstado] = useState({ carregando: true, erro: "", dados: null });
    const [editando, setEditando] = useState(null);
    const pedido = useRef(0);
    const estreito = useEstreito(760);

    const [resumo, setResumo] = useState(null);
    const [periodo, setPeriodo] = useState(() => periodoPadrao());
    useEffect(() => { api("chamados.opcoes").then(setOp, e => K.avisar(e.message, true)); }, []);
    function carregarResumo() { const p = intervaloDe(periodo); api("chamados.resumo", p).then(setResumo, e => K.avisar(e.message, true)); }
    useEffect(carregarResumo, [periodo.tipo, periodo.mes, periodo.ano, periodo.de, periodo.ate]); // eslint-disable-line

    function carregar(pg) {
      const n = ++pedido.current;
      setEstado(e => Object.assign({}, e, { carregando: true, erro: "" }));
      const f = { busca: busca.trim(), tipo, ordem, pagina: pg || pagina };
      if (status === "ativos") f.ativos = 1;
      else if (status.indexOf("cat:") === 0) f.categoria = status.slice(4);
      else if (status.indexOf("val:") === 0) f.validade = status.slice(4);   /* v1.14.0: vencendo / vencidas / retorno */
      else if (status) f.status = status;
      api("chamados.listar", f).then(
        d => { if (n === pedido.current) setEstado({ carregando: false, erro: "", dados: d }); },
        e => { if (n === pedido.current) setEstado({ carregando: false, erro: e.message, dados: null }); });
    }
    useEffect(() => { const t = setTimeout(() => { setPagina(1); carregar(1); }, 300); return () => clearTimeout(t); }, [busca, status, tipo, ordem]); // eslint-disable-line
    useEffect(() => { carregar(pagina); }, [pagina]); // eslint-disable-line

    async function trocarStatus(c, novo) {
      try { await api("chamados.mudar_status", { id: c.id, status: novo }); K.avisar("Chamado " + c.numero + ": " + novo); carregar(); carregarResumo(); }
      catch (x) { K.avisar(x.message, true); }
    }
    async function excluir(c) {
      const ok = await K.confirmar({ titulo: "Excluir o chamado " + c.numero + "?", texto: "O número não volta a ser usado. O histórico continua registrado.", botao: "Excluir", perigo: true });
      if (!ok) return;
      try { await api("chamados.excluir", { id: c.id }); K.avisar("Chamado excluído."); carregar(); carregarResumo(); }
      catch (x) { K.avisar(x.message, true); }
    }

    const d = estado.dados;
    const itens = d ? d.itens : [];
    const porStatus = (d && d.porStatus) || {};
    const totalGeral = Object.keys(porStatus).reduce((a, k) => a + porStatus[k], 0);
    const cont = cat => (op ? op.status.filter(s => s.categoria === cat).reduce((a, s) => a + (porStatus[s.nome] || 0), 0) : 0);
    const paginas = d ? Math.max(1, Math.ceil(d.total / d.porPagina)) : 1;
    const filtrando = busca.trim() || status || tipo;
    const ativos = totalGeral - (porStatus["Concluído"] || 0) - (porStatus["Não Aprovado"] || 0);

    const seletorStatus = c => consulta ? h("span", { className: "selo " + (CLASSE_STATUS[c.categoria] || "") }, c.status) : h("select", { className: "status-rapido " + (c.status === "Concluído" ? "st-concluido" : CLASSE_STATUS[c.categoria]), value: c.status,
      onChange: e => trocarStatus(c, e.target.value), "aria-label": "Status do chamado " + c.numero },
      op.status.map(st => h("option", { key: st.nome, value: st.nome }, st.nome)));
    const chip = (valor, rotulo, n, cls) => h("button", { key: valor || "todos", className: "chip " + (cls || "") + (status === valor ? " ativo" : ""), onClick: () => setStatus(valor) },
      rotulo, h("span", { className: "chip-n" }, n));

    /* v1.21.0: valores em dinheiro escondidos por padrão (olho mostra/esconde, vale para este aparelho) */
    const verV = ehAdmin && valoresVis;
    const kpi = (titulo, valor, pe, cls) => h("div", { className: "kpi" + (cls ? " " + cls : "") }, h("div", { className: "kpi-t" }, titulo), h("div", { className: "kpi-v" }, valor), pe ? h("div", { className: "kpi-p" }, pe) : null);
    return h("div", null,
      h("div", { className: "ch-per-barra" }, h(SeletorPeriodo, { periodo, setPeriodo }), ehAdmin && K.BotaoValores ? h(K.BotaoValores, null) : null),
      resumo ? h("div", { className: "kpis ch-kpis", style: { opacity: resumo.de === intervaloDe(periodo).de && resumo.ate === intervaloDe(periodo).ate ? 1 : .55 } },
        kpi("Abertos", String(resumo.novos), verV ? BRL(resumo.novosValor) + " orçado · chamados abertos no período" : "chamados abertos no período"),
        kpi("Aprovados", verV ? BRL(resumo.ganhoValor) : String(resumo.ganho), (verV ? resumo.ganho + " chamado(s) aprovado(s)" : "chamado(s) aprovado(s) no período"), "kpi-forte"),
        kpi("Não aprovados", verV ? BRL(resumo.perdidoValor) : String(resumo.perdido), verV ? resumo.perdido + " chamado(s) não aprovado(s) ou cancelado(s)" : "não aprovados no período"),
        verV ? kpi("A receber", BRL(resumo.aReceber), "dos ganhos do período · recebido " + BRL(resumo.recebido)) : null,
        kpi("Taxa de aprovação", NUM(resumo.conversao, 1) + "%", resumo.ganho + " aprovados · " + resumo.perdido + " não aprovados" + (resumo.cicloMedio != null ? " · ciclo " + resumo.cicloMedio + " d" : "")),
        kpi("Em aberto agora", String(resumo.aberto), verV ? BRL(resumo.abertoValor) + " aguardando orçamento ou aprovação" : "todos os períodos")) : null,
      op ? h("div", { className: "chips ch-chips" },
        chip("ativos", "Ativos", ativos),
        chip("", "Todos", totalGeral),
        chip("cat:aberto", "Em aberto", cont("aberto"), "st-aberto"),
        chip("cat:ganho", "Aprovados", cont("ganho"), "st-ganho"),
        chip("cat:perdido", "Não aprovados", cont("perdido"), "st-perdido"),
        h("span", { className: "chips-sep" }),
        op.status.map(s => porStatus[s.nome] ? chip(s.nome, s.nome, porStatus[s.nome]) : null),
        d && d.propostas && (d.propostas.vencendo || d.propostas.vencidas || d.propostas.retorno || status.indexOf("val:") === 0) ? h(React.Fragment, null,
          h("span", { className: "chips-sep" }),
          chip("val:vencendo", "Vencendo", d.propostas.vencendo, "st-vencendo"),
          chip("val:vencidas", "Vencidas", d.propostas.vencidas, "st-vencida"),
          chip("val:retorno", "Retorno hoje", d.propostas.retorno, "st-retorno")) : null) : null,
      h("div", { className: "barra ch-barra" },
        h("input", { className: "entrada-texto busca", placeholder: "Buscar por nº, Casa de Oração, contato ou descrição", value: busca, onChange: e => setBusca(e.target.value), "aria-label": "Buscar chamados" }),
        h("select", { className: "entrada-texto", value: tipo, onChange: e => setTipo(e.target.value), "aria-label": "Tipo de serviço" },
          h("option", { value: "" }, "Todos os tipos"), (op ? op.tipos : []).map(t => h("option", { key: t, value: t }, t))),
        h("select", { className: "entrada-texto", value: ordem, onChange: e => setOrdem(e.target.value), "aria-label": "Ordenar" },
          h("option", { value: "recentes" }, "Mais recentes"), h("option", { value: "antigos" }, "Mais antigos"),
          h("option", { value: "atualizados" }, "Atualizados por último"), h("option", { value: "cliente" }, "Casa de Oração (A → Z)")),
        h("div", { className: "ch-espaco", style: { flex: 1 } }),
        consulta ? null : h("button", { className: "bt bt-marca ch-novo", onClick: () => setEditando({}), disabled: !op }, "Novo chamado")),
      h("div", { className: "bloco" },
        estado.erro ? h("div", { className: "vazio" }, h(Aviso, null, estado.erro), h("button", { className: "bt", onClick: () => carregar() }, "Tentar de novo"))
        : !d || !op ? h("div", { className: "vazio" }, "Carregando…")
        : !itens.length ? h("div", { className: "vazio" }, h("strong", null, filtrando ? "Nenhum chamado encontrado." : "Nenhum chamado ainda."), filtrando ? "Confira a busca e os filtros." : "Abra o primeiro chamado pelo botão Novo chamado.")
        : h(React.Fragment, null,
            estreito ? h("div", { className: "ch-cards", style: { opacity: estado.carregando ? .55 : 1 } }, itens.map(c => {
                const dias = diasEntre(c.abertoEm, c.fechadoEm);
                return h("div", { key: c.id, className: "ch-card" },
                  h("div", { className: "ch-card-topo" },
                    h("span", null, h("b", null, "Nº " + c.numero), c.osQtd ? h("span", { className: "ch-pill" }, c.osQtd + " OS") : null),
                    ehAdmin ? h("b", null, BRL(c.valor)) : null),
                  h("div", null, h("div", { className: "ch-card-cli" }, c.clienteNome), h("div", { className: "cel-sub" }, (c.tipoServico || "—") + (c.comQuemFalar ? " · " + c.comQuemFalar : ""))),
                  c.obs ? h("div", { className: "cel-sub corta ch-obs", style: { maxWidth: "100%" }, title: c.obs }, h("b", null, "Obs.: "), c.obs) : null,   /* v1.19.0: observação interna no lugar da descrição */
                  seletorStatus(c), seloProposta(c),
                  h("div", { className: "ch-card-pe" },
                    h("span", { className: "cel-sub" }, dataBR(c.abertoEm) + " · " + (c.fechadoEm ? "fechado em " + dias + " d" : dias + " d em aberto")),
                    h("span", { style: { display: "flex", gap: 6 } },
                      ehAdmin && c.valor != null ? h("button", { className: "bt bt-p", onClick: () => pdfProposta(c, sessao) }, "PDF") : null,

                      h("button", { className: "bt bt-p bt-marca", onClick: () => setEditando(c) }, "Abrir"))));
              }))
            : h("div", { className: "tabela-caixa", style: { opacity: estado.carregando ? .55 : 1 } }, h("table", { className: "tabela ch-tab" },
              h("thead", null, h("tr", null, h("th", null, "Nº"), h("th", null, "Casa de Oração"), h("th", null, "Serviço"), h("th", null, "Status"),
                h("th", null, "Abertura"), ehAdmin ? h("th", { className: "num" }, "Valor") : null, h("th", { className: "acoes" }))),
              h("tbody", null, itens.map(c => {
                const dias = diasEntre(c.abertoEm, c.fechadoEm);
                return h("tr", { key: c.id },
                  h("td", { className: "ch-n" }, h("b", null, c.numero), c.osQtd ? h("span", { className: "ch-pill", title: c.osQtd + " ordem(ns) de serviço" }, c.osQtd + " OS") : null),
                  h("td", { className: "ch-cli" }, h("div", { className: "cel-titulo" }, c.clienteNome), h("div", { className: "cel-sub" }, c.comQuemFalar || "—")),
                  h("td", { className: "ch-serv" }, h("div", null, c.tipoServico || "—"), c.obs ? h("div", { className: "cel-sub corta ch-obs", title: c.obs }, h("b", null, "Obs.: "), c.obs) : null),
                  h("td", { className: "ch-st" }, seletorStatus(c), seloProposta(c)),
                  h("td", { className: "ch-dt" }, h("div", null, dataBR(c.abertoEm)), h("div", { className: "cel-sub" }, c.fechadoEm ? "fechado em " + dias + " d" : dias + " d em aberto")),
                  ehAdmin ? h("td", { className: "num" }, BRL(c.valor)) : null,
                  h("td", { className: "acoes" },
                    h("button", { className: "bt bt-leve bt-p", onClick: () => setEditando(c) }, "Abrir"),
                    ehAdmin && c.valor != null ? h("button", { className: "bt bt-leve bt-p", onClick: () => pdfProposta(c, sessao), title: "Proposta em PDF" }, "PDF") : null,
                    null));
              })))),
            h("div", { className: "paginacao" },
              h("span", null, d.total + (d.total === 1 ? " chamado" : " chamados")),
              paginas > 1 ? h("span", { style: { display: "flex", gap: 6, alignItems: "center" } },
                h("button", { className: "bt bt-p", disabled: pagina <= 1, onClick: () => setPagina(pagina - 1) }, "Anterior"),
                h("span", null, pagina + " de " + paginas),
                h("button", { className: "bt bt-p", disabled: pagina >= paginas, onClick: () => setPagina(pagina + 1) }, "Próxima")) : null))),
      editando ? h(FormChamado, { key: (editando.id || "novo") + ":" + (editando.atualizadoEm || "") + ":" + (editando.status || ""), chamado: editando, op, ehAdmin, consulta, sessao, aoFechar: () => setEditando(null),
        aoSalvar: (c, manter) => { if (manter && c) setEditando(c); else setEditando(null); carregar(); carregarResumo(); },
        aoExcluir: ehAdmin && !consulta ? c => { setEditando(null); excluir(c); } : null }) : null);
  }

  /* =================================================================
     ORÇAMENTO — mesma conta e mesmas regras do painel
     base = mão de obra + materiais × (1 + margem) · imposto e RT sobre a base
     ================================================================= */
  function nTxt(v) {                 // "1.234,56" | "3,9" | 12 -> número
    if (typeof v === "number") return isFinite(v) ? v : 0;
    let s = String(v == null ? "" : v).replace(/R\$|\s/g, "");
    if (!s) return 0;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }
  const qTxt = (v, casas) => { const n = Math.round(nTxt(v) * Math.pow(10, casas || 2)) / Math.pow(10, casas || 2); return String(n).replace(".", ","); };

  function orcTotais(o) {
    const soma = l => l.reduce((s, r) => s + nTxt(r.qtd) * nTxt(r.unit), 0);
    const mdo = soma(o.servicos);
    const matBruto = soma(o.materiais);
    const mat = matBruto * (1 + nTxt(o.markup) / 100);
    const base = mdo + mat;
    const imposto = o.imposto.on ? base * nTxt(o.imposto.pct) / 100 : 0;
    const rt = o.rt.on ? base * nTxt(o.rt.pct) / 100 : 0;
    const subtotal = base + imposto + rt;
    const desconto = Math.min(subtotal, o.desconto.tipo === "pct" ? subtotal * nTxt(o.desconto.valor) / 100 : nTxt(o.desconto.valor));
    return { mdo, matBruto, mat, base, imposto, rt, subtotal, desconto, total: Math.max(0, subtotal - desconto),
      temItens: o.servicos.length > 0 || o.materiais.length > 0 };
  }

  function orcInicial(salvo, cfg) {
    const c = (cfg && cfg.config) || {};
    const t = l => (l || []).map(r => { const x = Object.assign({}, r); ["qtd", "unit", "metros"].forEach(k => { if (k in x) x[k] = valTexto(x[k]); }); return x; });
    if (salvo) {
      return {
        servicos: t(salvo.servicos), materiais: t(salvo.materiais), maquinas: t(salvo.maquinas),
        imposto: { on: !!(salvo.imposto && salvo.imposto.on), pct: valTexto(salvo.imposto ? salvo.imposto.pct : c.aliquota) },
        rt: { on: !!(salvo.rt && salvo.rt.on), pct: valTexto(salvo.rt ? salvo.rt.pct : c.rt_padrao) },
        desconto: { tipo: salvo.desconto && salvo.desconto.tipo === "pct" ? "pct" : "valor", valor: salvo.desconto && salvo.desconto.valor ? valTexto(salvo.desconto.valor) : "" },
        pagamentos: [], markup: "0",   /* CCB v2: sem forma de pagamento e sem margem nos materiais */
      };
    }
    return {
      servicos: [], materiais: [], maquinas: [],
      imposto: { on: false, pct: "0" }, rt: { on: false, pct: "0" }, desconto: { tipo: "valor", valor: "" },
      pagamentos: [], markup: "0",   /* CCB v2 */
    };
  }

  /* gera a lista de materiais a partir das máquinas (regras do catálogo).
     Devolve { gerados, avisos }. Itens à mão e opcionais são preservados por quem chama. */
  function gerarMateriais(maquinas, cat) {
    const avisos = [];
    const porNome = {}; (cat.maquinas || []).forEach(k => { porNome[k.nome] = k; });
    const porId = {}; (cat.materiais || []).forEach(m => { porId[m.id] = m; });
    const acc = {};
    const somar = (m, q) => {
      if (!(q > 0)) return;
      if (!acc[m.nome]) acc[m.nome] = { nome: m.nome, un: m.unidade, qtd: 0, unit: m.custo };
      acc[m.nome].qtd += q;
    };
    let totMaq = 0;
    maquinas.forEach((mq, i) => {
      const k = porNome[mq.tipo];
      const Q = nTxt(mq.qtd) || 1;
      if (!k) { avisos.push("Linha " + (i + 1) + ": tipo de máquina não encontrado no catálogo."); return; }
      totMaq += Q;
      const L = nTxt(mq.metros);
      if (L <= 0) { avisos.push(k.nome + " ficou de fora por estar sem metros."); return; }
      k.materiais.forEach(id => {
        const m = porId[id];
        if (!m || !m.ativo) return;
        const r = m.regra || {};
        let q = 0;
        switch (r.calculo) {
          case "kg_por_metro":      q = nTxt(r.fator) * L; break;
          case "metros":            q = (nTxt(r.fator) || 1) * L; break;
          case "metros_mais_folga": q = L + nTxt(r.folga) * Q; break;
          case "metros_div":        q = L / (nTxt(r.divisor) || 3); break;
          case "por_maquina":       q = nTxt(r.fator) * Q; break;
          default:                  q = nTxt(r.qtd);
        }
        somar(m, q);
      });
    });
    const gerados = Object.values(acc).map(x => ({ nome: x.nome, un: x.un, qtd: qTxt(x.qtd, x.un === "kg" ? 3 : 2), unit: valTexto(x.unit) }));
    if (gerados.length) {
      (cat.materiais || []).filter(m => m.ativo && m.tipo === "insumo").forEach(m => {
        const q = nTxt((m.regra || {}).qtd); if (q > 0) gerados.push({ nome: m.nome, un: m.unidade, qtd: qTxt(q), unit: valTexto(m.custo) });
      });
      (cat.materiais || []).filter(m => m.ativo && m.tipo === "acessorio").forEach(m => {
        const q = nTxt((m.regra || {}).fator) * totMaq; if (q > 0) gerados.push({ nome: m.nome, un: m.unidade, qtd: qTxt(q), unit: valTexto(m.custo) });
      });
    }
    return { gerados, avisos };
  }

  /* ---------- HTML da proposta e da lista de compra ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nl2br = s => esc(s).replace(/\n/g, "<br>");
  const BRLp = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function docCabecalho(ctx, direita) {
    const e = ctx.emp;
    const logo = ctx.logoUrl ? '<img src="' + esc(ctx.logoUrl) + '" alt="">' : "";
    const contato = [e.razao_social, e.cnpj ? "CNPJ " + e.cnpj : "", e.endereco, [e.telefone, e.email].filter(Boolean).join(" · "), e.site].filter(Boolean).map(esc).join("<br>");
    return '<div class="top"><div class="brand">' + logo + '<div><div class="bn">' + esc(e.nome || "") + '</div></div></div><div class="co">' + (direita || contato) + "</div></div>";
  }
  function docEstilo(cor) {
    return "@page{size:A4;margin:18mm 16mm}*{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}body{margin:0;color:#1a1d21;font-size:13px}" +
      "@media screen{body{max-width:960px;margin:0 auto;padding:36px 44px;background:#fff}}@media screen and (max-width:640px){body{padding:16px}}" +   /* v1.27.0 */
      ".top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid " + cor + ";padding-bottom:14px;gap:16px}" +
      ".brand{display:flex;gap:12px;align-items:center}.brand img{height:46px;max-width:180px;object-fit:contain}.bn{font-size:19px;font-weight:700;color:" + cor + "}" +
      ".co{text-align:right;font-size:11px;color:#4a5160;line-height:1.5}h1{font-size:16px;color:" + cor + ";margin:22px 0 4px}.meta{font-size:12px;color:#6b7280;margin-bottom:18px}" +
      "h2.sec{font-size:13px;color:" + cor + ";margin:20px 0 6px}.box,.desc,.bank{background:#f4f6fb;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin-bottom:6px;line-height:1.55}" +
      ".box b{color:" + cor + "}table{width:100%;border-collapse:collapse;margin-top:6px}th{background:" + cor + ";color:#fff;text-align:left;padding:9px 10px;font-size:12px}" +
      "th.c,td.c{text-align:center}th.r,td.r{text-align:right;white-space:nowrap}td{padding:9px 10px;border-bottom:1px solid #eef1f6}tr.ex td{border:none;padding:3px 10px;color:#4a5160}" +
      ".total{display:flex;justify-content:flex-end;margin-top:10px}.total .b{background:" + cor + ";color:#fff;border-radius:8px;padding:12px 20px;font-size:16px;font-weight:700}" +
      ".paytitle{font-size:14px;font-weight:700;margin:26px 0 8px;border-bottom:2px solid " + cor + ";padding-bottom:6px}.paybig{font-size:17px;font-weight:700;color:" + cor + ";margin-bottom:8px}" +
      "table.pay2 th{background:#eef1f6;color:#1a1d21}.bank{margin-top:14px;font-size:12px;color:#4a5160}.pay{margin-top:16px;font-size:11.5px;color:#6b7280;line-height:1.6}" +
      "td.chk{width:34px}td.chk:before{content:'';display:inline-block;width:15px;height:15px;border:1.5px solid #9aa3b2;border-radius:4px;vertical-align:middle}" +
      ".noprint{text-align:center;margin:18px 0}.noprint button{background:" + cor + ";color:#fff;border:0;border-radius:8px;padding:9px 18px;font-size:13px;cursor:pointer}@media print{.noprint{display:none}}";
  }

  /* Imposto e RT diluídos nos itens (o cliente não vê linhas de imposto/RT) */
  function propostaHTML(ch, o, cli, ctx) {
    const t = orcTotais(o);
    const fator = t.base > 0 ? t.subtotal / t.base : 1;
    const linhas = [];
    o.servicos.forEach(r => { const q = nTxt(r.qtd), u = Math.round(nTxt(r.unit) * fator * 100) / 100; linhas.push({ nome: r.nome, q, u, tot: Math.round(q * u * 100) / 100 }); });
    if (t.mat > 0) { const v = Math.round(t.mat * fator * 100) / 100; linhas.push({ nome: "Materiais e insumos", q: 1, u: v, tot: v, mat: true }); }
    /* acerto de centavos para a soma das linhas bater com o total */
    const dif = Math.round((t.subtotal - linhas.reduce((s, l) => s + l.tot, 0)) * 100) / 100;
    if (dif && linhas.length) { const alvo = linhas.find(l => l.mat) || linhas.find(l => l.q === 1) || linhas[linhas.length - 1]; alvo.tot = Math.round((alvo.tot + dif) * 100) / 100; if (alvo.q === 1) alvo.u = alvo.tot; }
    const descTxt = t.desconto > 0 ? '<tr class="ex"><td colspan="3" class="r">Desconto' + (o.desconto.tipo === "pct" ? " (" + esc(o.desconto.valor) + "%)" : "") + '</td><td class="r">− ' + BRLp(t.desconto) + "</td></tr>" : "";
    const pags = o.pagamentos.filter(p => nTxt(p.pct) > 0);
    const payRows = pags.length ? pags.map(p => "<tr><td>" + esc(p.descricao) + '</td><td class="c">' + esc(qTxt(p.pct)) + '%</td><td class="r">' + BRLp(t.total * nTxt(p.pct) / 100) + "</td></tr>").join("")
      : '<tr><td>A combinar</td><td class="c">100%</td><td class="r">' + BRLp(t.total) + "</td></tr>";
    const titulo = [ch.numero, cli.nome, ch.tipoServico].filter(Boolean).join(" - ");
    const tp = ctx.textos || {};
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + esc(titulo) + "</title><style>" + docEstilo(ctx.cor) + "</style></head><body>" +
      docCabecalho(ctx) +
      "<h1>Orçamento - " + esc(titulo) + '</h1><div class="meta">Data: ' + new Date().toLocaleDateString("pt-BR") + (ch.tipoServico ? " · " + esc(ch.tipoServico) : "") + "</div>" +
      '<div class="box"><b>Casa de Oração:</b> ' + esc(cli.nome) + (ch.comQuemFalar ? " &nbsp;·&nbsp; <b>A/C:</b> " + esc(ch.comQuemFalar) : "") +
        (cli.documento ? "<br><b>CNPJ/CPF:</b> " + esc(cli.documento) : "") + (cli.endereco ? "<br><b>Endereço:</b> " + esc(cli.endereco) : "") + "</div>" +
      (ch.necessidade ? '<h2 class="sec">Descrição do serviço</h2><div class="desc">' + nl2br(ch.necessidade) + "</div>" : "") +
      '<table><thead><tr><th>Descrição</th><th class="c">Qtd</th><th class="r">Valor unit.</th><th class="r">Total</th></tr></thead><tbody>' +
      linhas.map(l => "<tr><td>" + esc(l.nome) + '</td><td class="c">' + esc(qTxt(l.q)) + '</td><td class="r">' + BRLp(l.u) + '</td><td class="r">' + BRLp(l.tot) + "</td></tr>").join("") +
      descTxt + "</tbody></table>" +
      '<div class="total"><div class="b">Total: ' + BRLp(t.total) + "</div></div>" +
      '<div class="paytitle">VALOR E FORMA DE PAGAMENTO</div><div class="paybig">' + BRLp(t.total) + "</div>" +
      '<table class="pay2"><thead><tr><th>Descrição</th><th class="c">Porcentagem</th><th class="r">Valor</th></tr></thead><tbody>' + payRows + "</tbody></table>" +
      (tp.dados_bancarios ? '<div class="bank"><b>Dados para transferência:</b><br>' + nl2br(tp.dados_bancarios) + "</div>" : "") +
      '<div class="pay">Validade da proposta: ' + esc(ctx.validade) + " dias." + (tp.observacao ? " " + nl2br(tp.observacao) : "") + "</div>" +
      '<div class="noprint"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>';
  }

  function listaCompraHTML(ch, o, cli, ctx) {
    const acc = {};
    o.materiais.forEach(r => { const n = (r.nome || "").trim(); if (!n) return; if (!acc[n]) acc[n] = { nome: n, un: r.un || "un", q: 0 }; acc[n].q += nTxt(r.qtd); });
    const fmt = (v, un) => un === "kg" ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg"
      : un === "m" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " m" : Math.ceil(v) + " " + un;
    const itens = Object.values(acc).filter(x => x.q > 0).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const hoje = new Date().toLocaleDateString("pt-BR");
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Lista de compra ' + esc(ch.numero || "") + "</title><style>" + docEstilo(ctx.cor) + "</style></head><body>" +
      docCabecalho(ctx, "Lista de compra — uso interno<br>" + hoje) +
      "<h1>Lista de materiais para compra" + (ch.numero ? " — Chamado Nº " + esc(ch.numero) : "") + '</h1><div class="meta">' + (cli.nome ? "Casa de Oração: " + esc(cli.nome) : "Sem Casa de Oração") + (ch.tipoServico ? " · " + esc(ch.tipoServico) : "") + "</div>" +
      (o.maquinas.length ? '<h2 class="sec">Máquinas do projeto</h2><table><thead><tr><th>Tipo</th><th class="c">Qtd</th><th class="c">Infra</th></tr></thead><tbody>' +
        o.maquinas.map(m => "<tr><td>" + esc(m.tipo) + '</td><td class="c">' + esc(qTxt(nTxt(m.qtd) || 1)) + '×</td><td class="c">' + esc(qTxt(m.metros)) + " m</td></tr>").join("") + "</tbody></table>" : "") +
      '<h2 class="sec">Materiais (somados)</h2><table><thead><tr><th>Item</th><th class="c">Quantidade</th><th class="c">✓</th></tr></thead><tbody>' +
      (itens.length ? itens.map(x => "<tr><td>" + esc(x.nome) + '</td><td class="c">' + fmt(x.q, x.un) + '</td><td class="chk"></td></tr>').join("") : '<tr><td colspan="3" class="c">Nenhum material — gere os materiais antes.</td></tr>') +
      '</tbody></table><div class="noprint"><button onclick="window.print()">Imprimir / Salvar PDF</button></div></body></html>';
  }

  function escreverJanela(w, html) {
    if (!w) { K.avisar("O navegador bloqueou a janela. Permita pop-ups para este site.", true); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
  }

  /* ---------- formulário do chamado (com orçamento para o administrador) ---------- */
  function ctxDocDe(sessao, cfg) {
    const e = sessao.empresa || {};
    const c = (cfg && cfg.config) || {};
    return {
      emp: Object.assign({ nome: e.nome, razao_social: e.razaoSocial, cnpj: e.cnpj }, c.empresa || {}),
      logoUrl: e.logoId ? new URL(K.urlAnexo(e.logoId), location.href).href : "",
      cor: /^#[0-9a-f]{6}$/i.test(e.corPrimaria || "") ? e.corPrimaria : "#111111",
      textos: c.textos_pdf || {}, validade: c.validade_orcamento || 15,
    };
  }
  /* proposta em PDF direto da lista (sem abrir o chamado) */
  async function pdfProposta(c, sessao) {
    const w = window.open("", "_blank");   // abre já no clique para o navegador não bloquear
    if (!w) return K.avisar("Permita pop-ups para gerar o PDF.", true);
    w.document.write("<p style='font-family:sans-serif;padding:20px'>Gerando a proposta…</p>");
    try {
      const [ch, cfg] = await Promise.all([api("chamados.obter", { id: c.id }), api("config.ler")]);
      if (!ch.orcamento) { w.close(); return K.avisar("O chamado " + c.numero + " ainda não tem orçamento.", true); }
      let cli = { nome: ch.clienteNome };
      try { cli = await api("clientes.obter", { id: ch.clienteId }); } catch (x) { /* segue com o nome */ }
      escreverJanela(w, propostaHTML(ch, orcInicial(ch.orcamento, cfg), cli, ctxDocDe(sessao, cfg)));
    } catch (x) { w.close(); K.avisar(x.message, true); }
  }

  /* v1.18.0: proposta pelo WhatsApp — grava a proposta como está e abre a conversa do cliente com o link.
     O link abre a página pública da proposta (pasta p/): ver, baixar PDF e aprovar. */
  function linkZap(tel, texto) {
    let n = String(tel || "").replace(/\D/g, "");
    if (n.length === 10 || n.length === 11) n = "55" + n;
    return "https://wa.me/" + (n.length >= 12 ? n : "") + "?text=" + encodeURIComponent(texto);
  }
  async function enviarWhats(chId, sessao, w) {
    if (w) w.document.write("<p style='font-family:sans-serif;padding:20px'>Preparando a proposta…</p>");
    try {
      const [ch, cfg] = await Promise.all([api("chamados.obter", { id: chId }), api("config.ler")]);
      if (!ch.orcamento) throw new Error("O chamado " + ch.numero + " ainda não tem orçamento salvo.");
      let cli = { nome: ch.clienteNome };
      try { cli = await api("clientes.obter", { id: ch.clienteId }); } catch (x) { /* segue com o nome */ }
      const ctx = Object.assign(ctxDocDe(sessao, cfg), { logoUrl: "__LOGO__" });   // o logo entra na página pública
      const r = await api("chamados.proposta.enviar", { id: chId, html: propostaHTML(ch, orcInicial(ch.orcamento, cfg), cli, ctx), canal: "WhatsApp" });
      const emp = (sessao.empresa && sessao.empresa.nome) || "";
      const quem = String(r.contato || "").trim().split(/\s+/)[0];
      const msg = "Olá" + (quem ? ", " + quem : "") + "! Segue a proposta nº " + ch.numero + (emp ? " da " + emp : "") + (ch.tipoServico ? " (" + ch.tipoServico + ")" : "") + ".\n" +
        "Por este link você vê os detalhes, baixa em PDF e já pode aprovar:\n" + r.link.url;
      const url = linkZap(r.telefone || cli.telefone, msg);
      if (w) w.location.href = url; else location.href = url;
      if (!r.telefone && !cli.telefone) K.avisar("O cliente não tem telefone no cadastro: escolha o contato no WhatsApp.");
      else K.avisar("Proposta pronta. Confira e toque em enviar no WhatsApp.");
      return r;
    } catch (x) { if (w) w.close(); K.avisar(x.message, true); return null; }
  }


  /* v1.21.0: o link da proposta é fixo. Depois de salvar o chamado (orçamento mudou), a mesma página
     do link passa a mostrar a proposta nova — o cliente nunca fica com a versão velha. */
  async function atualizarLinkProposta(chId, sessao) {
    try {
      const [ch, cfg] = await Promise.all([api("chamados.obter", { id: chId }), api("config.ler")]);
      if (!ch.orcamento) return;
      let cli = { nome: ch.clienteNome };
      try { cli = await api("clientes.obter", { id: ch.clienteId }); } catch (x) { /* segue com o nome */ }
      const ctx = Object.assign(ctxDocDe(sessao, cfg), { logoUrl: "__LOGO__" });
      const r = await api("chamados.proposta.atualizar", { id: chId, html: propostaHTML(ch, orcInicial(ch.orcamento, cfg), cli, ctx) });
      if (r && r.atualizado) K.avisar("Link da proposta atualizado (versão " + r.versao + "). O cliente vê a nova no mesmo link.");
    } catch (x) { K.avisar("Chamado salvo, mas não consegui atualizar o link da proposta: " + x.message, true); }
  }

  /* v1.19.0: WhatsApp com duas opções — conversar com o cliente ou mandar a proposta (link) */
  function msgConversa(c, sessao) {
    const quem = String(c.comQuemFalar || c.clienteContato || "").trim().split(/\s+/)[0];
    const emp = (sessao.empresa && sessao.empresa.nome) || "";
    return "Olá" + (quem ? ", " + quem : "") + "! Aqui é da " + emp + ", sobre o chamado nº " + c.numero + (c.tipoServico ? " (" + c.tipoServico + ")" : "") + ".";
  }
  function conversarZap(c, sessao) {
    window.open(linkZap(c.clienteTelefone, msgConversa(c, sessao)), "_blank", "noopener");
    if (!c.clienteTelefone) K.avisar("O cliente não tem telefone no cadastro: escolha o contato no WhatsApp.");
  }
  function BotaoZap({ c, sessao, ehAdmin, leve, aoEnviado }) {
    const [pos, setPos] = useState(null);
    const ref = useRef(null);
    const temProposta = ehAdmin && c.valor != null && !K.soConsultaCRM(sessao);   /* v1.22.0 */
    useEffect(() => {
      if (!pos) return;
      const fora = e => { if (ref.current && !ref.current.contains(e.target)) setPos(null); };
      const fechar = () => setPos(null);
      document.addEventListener("pointerdown", fora); window.addEventListener("scroll", fechar, true); window.addEventListener("resize", fechar);
      return () => { document.removeEventListener("pointerdown", fora); window.removeEventListener("scroll", fechar, true); window.removeEventListener("resize", fechar); };
    }, [pos]);
    const cls = "bt bt-p" + (leve ? " bt-leve" : "");
    if (!temProposta) return h("button", { className: cls, title: "Conversar com o cliente no WhatsApp", onClick: () => conversarZap(c, sessao) }, "WhatsApp");
    function abrir(e) {
      if (pos) return setPos(null);
      const r = e.currentTarget.getBoundingClientRect();
      const emBaixo = window.innerHeight - r.bottom > 130;
      setPos({ right: Math.max(8, window.innerWidth - r.right), top: emBaixo ? r.bottom + 4 : null, bottom: emBaixo ? null : window.innerHeight - r.top + 4 });
    }
    return h("span", { ref, className: "zap-wrap" },
      h("button", { className: cls, onClick: abrir, "aria-haspopup": "menu", "aria-expanded": !!pos }, "WhatsApp ▾"),
      pos ? h("div", { className: "zap-menu", role: "menu", style: { right: pos.right, top: pos.top == null ? "auto" : pos.top, bottom: pos.bottom == null ? "auto" : pos.bottom } },
        h("button", { role: "menuitem", onClick: () => { setPos(null); conversarZap(c, sessao); } }, h("b", null, "Conversar"), h("small", null, "Abre a conversa com o cliente")),
        h("button", { role: "menuitem", onClick: () => { setPos(null); const w = window.open("", "_blank"); enviarWhats(c.id, sessao, w).then(r => { if (r && aoEnviado) aoEnviado(); }); } },
          h("b", null, "Enviar proposta"), h("small", null, "Manda o link para ver e aprovar"))) : null);
  }

  /* v1.23.0: parcelas a receber do chamado (geradas na aprovação) — vencimentos digitados à mão */
  function FinanceiroDoChamado({ chamado, aoInfo, sessao }) {
    const [d, setD] = useState(null);
    const [venc, setVenc] = useState({});
    const [salvando, setSalvando] = useState(false);
    function carregar() {
      api("fin.chamado.obter", { chamadoId: chamado.id }).then(r => {
        setD(r);
        const v = {}; (r.parcelas || []).forEach(t => { v[t.id] = t.vencimento || ""; }); setVenc(v);
        if (aoInfo) aoInfo(!!(r.ativo && (r.parcelas || []).some(t => t.status !== "cancelado")));
      }, () => setD(null));
    }
    useEffect(carregar, [chamado.id, chamado.status, chamado.valor]); // eslint-disable-line
    if (!d || !d.ativo) return null;
    const ativas = d.parcelas.filter(t => t.status !== "cancelado");
    if (!ativas.length && !d.ganho) return null;
    const mudou = ativas.some(t => (venc[t.id] || "") !== (t.vencimento || ""));
    async function salvar() {
      setSalvando(true);
      try { const r = await api("fin.chamado.vencimentos", { chamadoId: chamado.id, itens: ativas.map(t => ({ id: t.id, vencimento: venc[t.id] || "" })) }); K.avisar(r.alterados ? "Vencimentos salvos." : "Nada mudou."); carregar(); }
      catch (x) { K.avisar(x.message, true); }
      setSalvando(false);
    }
    const BR = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return h("div", { className: "ch-acomp ch-fin" },
      h("div", { className: "ch-acomp-cab" }, h("b", null, "Financeiro"),
        d.semVencimento ? h("span", { className: "ch-prop-s vencendo" }, "Definir vencimento" + (d.semVencimento > 1 ? "s" : "")) : ativas.length ? h("span", { className: "ch-prop-s valida" }, "Recebido " + BR(d.recebido) + " de " + BR(d.total)) : null,
        h("span", { style: { flex: 1 } }),
        d.podeFinanceiro ? h("a", { className: "bt bt-p bt-leve", href: "#/financeiro" }, "Abrir Financeiro") : null),
      !ativas.length ? h("div", { className: "cel-sub" }, "As parcelas a receber aparecem aqui ao salvar o chamado como ganho.")
      : h(React.Fragment, null,
          ativas.map(t => h("div", { key: t.id, className: "ch-fin-p" },
            h("span", { className: "ch-fin-n" }, t.parcelas > 1 ? t.parcela + "/" + t.parcelas : "Única"),
            h("span", { className: "ch-fin-d" }, h("b", null, BR(t.valor)), h("small", null, t.descricao.split(" · ").slice(t.parcelas > 1 ? 3 : 2).join(" · ") || (t.status === "quitado" ? "recebida" : t.pago ? "recebido " + BR(t.pago) : "a receber"))),
            t.status === "quitado" ? h("span", { className: "selo os-verde" }, "Recebida")
            : h("input", { type: "date", className: "entrada-texto", value: venc[t.id] || "", "aria-label": "Vencimento da parcela " + t.parcela, onChange: e => setVenc(v => Object.assign({}, v, { [t.id]: e.target.value })) }))),
          mudou ? h("div", { style: { display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 } },
            h("button", { type: "button", className: "bt bt-p", onClick: () => carregar() }, "Desfazer"),
            h("button", { type: "button", className: "bt bt-p bt-marca", disabled: salvando, onClick: salvar }, salvando ? "Salvando…" : "Salvar vencimentos")) : null));
  }

  /* v1.18.0: situação do link da proposta (visto pelo cliente, aprovado) */
  function PropostaOnline({ chamado, versao }) {
    const [s, setS] = useState(null);
    useEffect(() => { api("chamados.proposta.status", { id: chamado.id }).then(setS, () => setS(null)); }, [chamado.id, versao]);
    if (!s || !s.link) return null;
    const l = s.link;
    const dh = x => x ? String(x).slice(8, 10) + "/" + String(x).slice(5, 7) + " às " + String(x).slice(11, 16) : "";
    const resp = l.resposta === "aprovada" ? h("span", { className: "ch-prop-s valida" }, "Aprovada pelo cliente")
      : l.resposta === "recusada" ? h("span", { className: "ch-prop-s vencida" }, "Recusada pelo cliente")
      : l.versaoVista != null && l.versaoVista < l.versao ? h("span", { className: "ch-prop-s retorno" }, "Versão nova ainda não aberta")
      : l.visualizacoes ? h("span", { className: "ch-prop-s vencendo" }, "Visto pelo cliente") : h("span", { className: "ch-prop-s retorno" }, "Ainda não aberto");
    async function copiar() {
      try { await navigator.clipboard.writeText(l.url); K.avisar("Link copiado."); }
      catch (x) { window.prompt("Copie o link:", l.url); }
    }
    return h("div", { className: "ch-acomp ch-link" },
      h("div", { className: "ch-acomp-cab" },
        h("b", null, "Proposta online"), resp, h("span", { style: { flex: 1 } }),
        h("button", { type: "button", className: "bt bt-p bt-leve", onClick: copiar }, "Copiar link"),
        h("a", { className: "bt bt-p", href: l.url, target: "_blank", rel: "noopener" }, "Abrir")),
      h("div", { className: "cel-sub" },
        "Enviada em " + dh(l.criadoEm) + (l.versao > 1 ? " · versão " + l.versao + " (atualizada em " + dh(l.atualizadoEm) + ")" : "") +
        (l.versaoVista != null ? " · cliente viu a versão " + l.versaoVista + (l.vistaEm ? " em " + dh(l.vistaEm) : "") : "") +
        (l.visualizacoes ? " · aberta " + l.visualizacoes + (l.visualizacoes === 1 ? " vez" : " vezes") + ", a última em " + dh(l.ultimaVis) : "") +
        (l.resposta ? " · " + (l.resposta === "aprovada" ? "aprovada" : "recusada") + (l.versaoResposta ? " (versão " + l.versaoResposta + ")" : "") + " por " + (l.respostaNome || "—") + " em " + dh(l.respondidoEm) : "") +
        (l.respostaObs ? " · \u201c" + l.respostaObs + "\u201d" : "")));
  }

  /* OS do chamado: lista, criar, abrir e relatório PDF (peças vêm do os.js via K.OS) */
  function OSDoChamado({ chamado, sessao, aoAbrirNova, aoAbrirOS, versao }) {
    const [lista, setLista] = useState(null);
    const [erro, setErro] = useState("");
    const liberado = !!K.OS && K.temModulo("os") && K.temPerfil(sessao, "admin", "coord", "tecnico");   /* v1.19.0 · CCB v2: quem só aprova não vê o quadro de OS */
    useEffect(() => {
      if (!liberado) return;
      setErro("");
      api("os.listar", { chamadoId: chamado.id }).then(d => setLista(d.itens), e => setErro(e.message));
    }, [chamado.id, versao]);
    if (!liberado) return null;
    const perdido = chamado.status === "Não Aprovado";
    return h("div", { style: { border: "1px solid var(--linha, #ddd)", borderRadius: 10, padding: "10px 12px", marginBottom: 14 } },
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 } },
        h("b", null, "Ordens de serviço"),
        h("button", { type: "button", className: "bt bt-p bt-marca", onClick: aoAbrirNova, disabled: perdido, title: perdido ? "Chamado não aprovado" : "" }, "+ Criar OS")),
      erro ? h(Aviso, null, erro)
      : !lista ? h("div", { className: "cel-sub" }, "Carregando…")
      : !lista.length ? h("div", { className: "cel-sub" }, perdido ? "Chamado não aprovado." : "Nenhuma OS para este chamado ainda.")
      : lista.map(o => h("div", { key: o.id, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 0", borderTop: "1px solid var(--linha, #eee)", flexWrap: "wrap" } },
          h("div", { style: { minWidth: 0, flex: 1 } },
            h("b", null, "OS " + o.numero), " ", h(K.OS.SeloOS, { status: o.status }),
            h("div", { className: "cel-sub" }, (o.dataPrev ? dataBR(o.dataPrev) + (o.horaPrev ? " " + o.horaPrev : "") : "sem data") + " · " + o.etapasFeitas + "/" + o.etapasTotal + " etapas" + (o.tecnicos.length ? " · " + o.tecnicos.map(t => t.nome).join(", ") : ""))),
          h("div", { style: { display: "flex", gap: 6 } },
            h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => aoAbrirOS(o.id) }, "Abrir"),
            h("button", { type: "button", className: "bt bt-leve bt-p", onClick: () => K.OS.relatorioDaOS(o.id, sessao) }, "PDF"),
            null))));
  }

  /* v1.14.0: validade da proposta, contatos feitos e próximo retorno */
  function AcompProposta({ chamado, status }) {
    const [c, setC] = useState(chamado);
    const [lista, setLista] = useState(null);
    const [texto, setTexto] = useState("");
    const [retorno, setRetorno] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [aberto, setAberto] = useState(false);
    function carregar() { api("chamados.acomp.listar", { id: chamado.id }).then(d => setLista(d.itens), () => setLista([])); }
    useEffect(carregar, [chamado.id]); // eslint-disable-line
    const encerrado = status === "Concluído" || status === "Não Aprovado";
    if (encerrado && !(lista && lista.length)) return null;
    async function registrar() {
      setSalvando(true);
      try { const r = await api("chamados.acomp.criar", { id: chamado.id, texto, proximoRetorno: retorno }); setC(r); setTexto(""); setRetorno(""); carregar(); K.avisar("Acompanhamento registrado."); }
      catch (x) { K.avisar(x.message, true); } finally { setSalvando(false); }
    }
    async function renovar() {
      if (!(await K.confirmar({ titulo: "Renovar a validade da proposta?", texto: "A proposta volta a valer por " + (c.proposta ? c.proposta.validadeDias : 15) + " dias, contando de hoje. Fica registrado no acompanhamento.", botao: "Renovar" }))) return;
      try { const r = await api("chamados.renovar", { id: chamado.id }); setC(r); carregar(); K.avisar("Validade renovada."); } catch (x) { K.avisar(x.message, true); }
    }
    const p = status === "Aguardando aprovação" ? c.proposta : null;
    const dia = s => String(s || "").slice(0, 10).split("-").reverse().join("/");
    return h("div", { className: "ch-acomp" },
      h("div", { className: "ch-acomp-cab" },
        h("b", null, "Histórico do chamado"),
        p ? h("span", { className: "ch-prop-s " + p.situacao }, textoProposta(p)) : null,
        c.proximoRetorno && !encerrado ? h("span", { className: "ch-prop-s retorno" }, "Retorno " + dia(c.proximoRetorno)) : null,
        h("span", { style: { flex: 1 } }),
        p ? h("button", { type: "button", className: "bt bt-p bt-leve", onClick: renovar }, "Renovar validade") : null,
        h("button", { type: "button", className: "bt bt-p", onClick: () => setAberto(!aberto) }, aberto ? "Fechar" : "Registrar contato")),
      p ? h("div", { className: "cel-sub" }, "Enviada em " + dia(p.enviadaEm) + " · válida por " + p.validadeDias + " dias, até " + dia(p.venceEm) + ". A proposta vencida só fica sinalizada: o status não muda sozinho.")
        : status === "Aguardando aprovação" ? h("div", { className: "cel-sub" }, "A validade começa a contar quando o chamado tem orçamento salvo e entra em \"Aguardando aprovação\".") : null,
      aberto ? h("div", { className: "ch-acomp-form" },
        h("textarea", { value: texto, onChange: e => setTexto(e.target.value), rows: 2, placeholder: "O que foi conversado com a casa (ex.: o encarregado pediu para voltar depois do culto)" }),
        h("div", { className: "ch-acomp-linha" },
          h("label", null, h("span", null, "Próximo retorno"), h("input", { className: "entrada-texto", type: "date", value: retorno, onChange: e => setRetorno(e.target.value) })),
          h("button", { type: "button", className: "bt bt-marca", disabled: salvando || (!texto.trim() && !retorno), onClick: registrar }, salvando ? "Salvando…" : "Registrar"))) : null,
      lista && lista.length ? h("div", { className: "ch-acomp-lista" }, lista.slice(0, aberto ? 50 : 3).map(a => h("div", { key: a.id },
        h("span", null, dia(a.criadoEm) + " · " + (a.usuarioNome || "—") + ({ renovacao: " · renovação", envio: " · envio", aprovacao: " · aprovação", parecer: " · Segurança do Trabalho", recusa: " · recusa" }[a.tipo] || "")),
        a.texto ? h("p", null, a.texto) : null,
        a.proximoRetorno ? h("small", null, "Retorno marcado para " + dia(a.proximoRetorno)) : null))) : null);
  }

  /* CCB v2: aprovação por alçada (Coordenação → Gestão → Procurador) e parecer da Segurança do Trabalho */
  function Aprovacao({ chamado, aoMudar }) {
    const ap = chamado.aprovacao;
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    if (!ap) return null;
    const aguardando = chamado.status === "Aguardando aprovação";
    if (!aguardando && !ap.aprovado && !ap.parecer) return null;
    async function fazer(acao, extra) {
      setEnviando(true);
      try { const c = await api("chamados.aprovacao", Object.assign({ id: chamado.id, acao, texto }, extra || {})); setTexto(""); K.avisar("Registrado."); aoMudar(c); }
      catch (x) { K.avisar(x.message, true); }
      setEnviando(false);
    }
    const par = ap.parecer;
    return h("div", { className: "bloco aprovacao" + (aguardando ? " aprov-aguardando" : "") },
      h("div", { className: "secao-titulo", style: { marginTop: 0 } }, "Aprovação"),
      h("div", { className: "aprov-linhas" },
        h("div", null, h("span", { className: "cel-sub" }, "Valor do orçamento"), h("b", null, ap.valor != null ? BRL(ap.valor) : "sem orçamento")),
        h("div", null, h("span", { className: "cel-sub" }, "Quem aprova"), h("b", null, ap.nivelNome)),
        ap.exigeSeguranca ? h("div", null, h("span", { className: "cel-sub" }, "Segurança do Trabalho"),
          h("b", { className: par ? (par.situacao === "favoravel" ? "txt-ok" : "txt-perigo") : "" }, par ? (par.situacao === "favoravel" ? "Parecer favorável" : "Parecer desfavorável") : "Aguardando parecer")) : null),
      par && par.texto ? h("p", { className: "cel-sub" }, "Parecer de " + par.por + ": " + par.texto) : null,
      ap.aprovado ? h(Aviso, { tipo: "ok" }, "Aprovado por " + ap.aprovado.por + " (" + ap.aprovado.nivelNome + ") em " + K.dataHora(ap.aprovado.em) + (ap.aprovado.valor != null ? " · " + BRL(ap.aprovado.valor) : "") + ".") : null,
      aguardando && (ap.podeAprovar || ap.podeReprovar || ap.podeParecer) ? h(React.Fragment, null,
        h(Campo, { rotulo: "Observação", dica: "Obrigatória para não aprovar ou para parecer desfavorável." }, h("textarea", { rows: 2, value: texto, onChange: e => setTexto(e.target.value) })),
        h("div", { className: "aprov-botoes" },
          ap.podeParecer ? h("button", { type: "button", className: "bt", disabled: enviando, onClick: () => fazer("parecer", { situacao: "favoravel" }) }, "Parecer favorável") : null,
          ap.podeParecer ? h("button", { type: "button", className: "bt bt-perigo", disabled: enviando, onClick: () => fazer("parecer", { situacao: "desfavoravel" }) }, "Parecer desfavorável") : null,
          ap.podeReprovar ? h("button", { type: "button", className: "bt bt-perigo", disabled: enviando, onClick: () => fazer("reprovar") }, "Não aprovar") : null,
          ap.podeAprovar ? h("button", { type: "button", className: "bt bt-marca", disabled: enviando, onClick: () => fazer("aprovar") }, "Aprovar") : null))
      : aguardando ? h("p", { className: "cel-sub" }, ap.exigeSeguranca && !(par && par.situacao === "favoravel") ? "Aguardando o parecer da Segurança do Trabalho e a aprovação de: " + ap.nivelNome + "." : "Aguardando a aprovação de: " + ap.nivelNome + ".") : null);
  }

  function FormChamado({ chamado, op, ehAdmin, sessao, aoFechar, aoSalvar, aoExcluir, consulta }) {
    K.useReabrir("chamado", chamado && chamado.id);   /* v1.27.0 */
    if (consulta === undefined) consulta = K.soConsultaCRM(sessao);   /* v1.22.0 */
    const finTemParcelas = false;   /* CCB v2: sem financeiro */
    const novo = !chamado.id;
    const [f, setF] = useState(Object.assign({
      clienteId: null, clienteNome: "", comQuemFalar: "", status: "Falta orçamento", tipoServico: "", origem: "", necessidade: "",
      abertoEm: hojeISO(), fechadoEm: "", andamento: 0, obs: "", responsavelId: null, recebido: "", custo: "",
    }, chamado, { recebido: valTexto(chamado.recebido), custo: valTexto(chamado.custo), fechadoEm: chamado.fechadoEm || "" }));
    const [orc, setOrc] = useState(null);          // estado do orçamento (só admin)
    const [cat, setCat] = useState(null);
    const [cfg, setCfg] = useState(null);
    const [carga, setCarga] = useState(ehAdmin ? "carregando" : "ok");
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(p => Object.assign({}, p, { [k]: v }));
    const final = f.status === "Concluído" || f.status === "Não Aprovado";

    useEffect(() => {
      if (!ehAdmin) return;
      Promise.all([api("catalogo.tudo"), api("config.ler"), novo ? Promise.resolve(null) : api("chamados.obter", { id: chamado.id })])
        .then(([c, g, ch]) => { setCat(c); setCfg(g); setOrc(orcInicial(ch && ch.orcamento, g)); setCarga("ok"); },
              e => setCarga("Não foi possível carregar o orçamento: " + e.message));
    }, []); // eslint-disable-line

    function dadosEnvio() {
      const d = Object.assign({}, f);
      delete d.orcamento;
      if (ehAdmin && orc) {
        const num = l => l.map(r => { const x = Object.assign({}, r); ["qtd", "unit", "metros"].forEach(k => { if (k in x) x[k] = nTxt(x[k]); }); return x; });
        d.orcamento = {
          servicos: num(orc.servicos.filter(r => (r.nome || "").trim() || nTxt(r.unit))),
          materiais: num(orc.materiais.filter(r => (r.nome || "").trim() || nTxt(r.unit))),
          maquinas: num(orc.maquinas.filter(r => r.tipo)),
          imposto: { on: orc.imposto.on, pct: nTxt(orc.imposto.pct) }, rt: { on: orc.rt.on, pct: nTxt(orc.rt.pct) },
          desconto: { tipo: orc.desconto.tipo, valor: nTxt(orc.desconto.valor) },
          pagamentos: orc.pagamentos.map(p => ({ descricao: String(p.descricao || "").trim(), pct: nTxt(p.pct) })),
          markup: nTxt(orc.markup),
        };
        if (!orcTotais(orc).temItens) d.valor = chamado.valor != null ? chamado.valor : null;
      }
      return d;
    }

    function ctxDoc() { return ctxDocDe(sessao, cfg); }

    /* OS a partir do chamado: o painel da OS ocupa o lugar do chamado e volta ao fechar (o formulário não perde nada) */
    const [osOp, setOsOp] = useState(null);
    const [osTela, setOsTela] = useState(null);      // {nova:true} | {id}
    const [osVersao, setOsVersao] = useState(0);
    function abrirOS(t) {
      if (osOp) return setOsTela(t);
      api("os.opcoes").then(o => { setOsOp(o); setOsTela(t); }, e => K.avisar(e.message, true));
    }
    const voltarDaOS = () => { setOsTela(null); setOsVersao(v => v + 1); };

    async function salvar(comPdf) {
      setErro("");
      if (!f.clienteId) return setErro("Escolha a Casa de Oração do chamado.");
      const w = comPdf ? window.open("", "_blank") : null;   // abre já no clique para o navegador não bloquear
      if (w) w.document.write("<p style='font-family:sans-serif;padding:20px'>Gerando o orçamento…</p>");
      setEnviando(true);
      try {
        const c = await api("chamados.salvar", dadosEnvio());
        if (w) {
          let cli = { nome: c.clienteNome };
          try { cli = await api("clientes.obter", { id: c.clienteId }); } catch (x) { /* segue com o nome */ }
          escreverJanela(w, propostaHTML(c, orcInicial(c.orcamento, cfg), cli, ctxDoc()));
        }
        K.avisar(novo ? "Chamado " + c.numero + " aberto." : "Chamado " + c.numero + " salvo.");
        aoSalvar(c);
      } catch (x) { if (w) w.close(); setErro(x.message); setEnviando(false); }
    }

    /* v1.18.0: salva o chamado e manda a proposta pelo WhatsApp */
    async function salvarEWhats() {
      setErro("");
      if (!f.clienteId) return setErro("Escolha a Casa de Oração do chamado.");
      const soma = orc.pagamentos.reduce((s, p) => s + nTxt(p.pct), 0);
      if (orc.pagamentos.length && Math.abs(soma - 100) > 0.01) return setErro("As parcelas somam " + qTxt(soma) + "%. Ajuste para fechar 100%.");
      const w = window.open("", "_blank");   // abre já no clique para o navegador não bloquear
      setEnviando(true);
      try {
        const c = await api("chamados.salvar", dadosEnvio());
        const r = await enviarWhats(c.id, sessao, w);
        aoSalvar(r ? r.chamado : c);
      } catch (x) { if (w) w.close(); setErro(x.message); setEnviando(false); }
    }

    function listaCompra() {
      const w = window.open("", "_blank");
      escreverJanela(w, listaCompraHTML({ numero: chamado.numero, tipoServico: f.tipoServico }, orc, { nome: f.clienteNome }, ctxDoc()));
    }

    const rodape = [];
    if (!novo && aoExcluir) rodape.push(h("button", { key: "x", className: "bt bt-leve bt-perigo", style: { marginRight: "auto" }, onClick: () => aoExcluir(chamado) }, "Excluir"));
    rodape.push(h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"));
    if (ehAdmin && orc && orc.materiais.length) rodape.push(h("button", { key: "l", className: "bt", onClick: listaCompra }, "Lista de compra"));
    if (ehAdmin && orc) rodape.push(h("button", { key: "p", className: "bt", onClick: () => salvar(true), disabled: enviando }, "Salvar e gerar PDF"));
    rodape.push(h("button", { key: "s", className: "bt bt-marca", onClick: () => salvar(false), disabled: enviando || carga === "carregando" }, enviando ? "Salvando…" : novo ? "Abrir chamado" : "Salvar chamado"));
    if (consulta) { rodape.length = 0; rodape.push(h("button", { key: "f", className: "bt bt-marca", onClick: aoFechar }, "Fechar")); }   /* v1.22.0: só consulta */

    if (osTela && osOp && K.OS) {
      if (osTela.nova) return h(K.OS.NovaOS, { op: osOp, chamado: Object.assign({}, chamado, { tipoServico: f.tipoServico || chamado.tipoServico, comQuemFalar: f.comQuemFalar || chamado.comQuemFalar }),
        aoFechar: voltarDaOS, aoCriar: o => { setOsVersao(v => v + 1); setOsTela({ id: o.id }); } });
      return h(K.OS.DetalheOS, { id: osTela.id, op: osOp, sessao, aoFechar: voltarDaOS });
    }

    return h(Painel, {
      titulo: novo ? "Novo chamado" : "Chamado " + chamado.numero, largo: ehAdmin,
      sub: novo ? "O número é gerado ao salvar." : chamado.clienteNome + " · aberto em " + dataBR(chamado.abertoEm),
      aoFechar, rodape,
    },
      h(Aviso, null, erro),
      !novo ? h(Aprovacao, { chamado, aoMudar: c => aoSalvar(c, true) }) : null,
      !novo ? h(AcompProposta, { chamado, status: f.status }) : null,
      !novo ? h(OSDoChamado, { chamado: Object.assign({}, chamado, { status: f.status }), sessao, versao: osVersao,
        aoAbrirNova: () => abrirOS({ nova: true }), aoAbrirOS: id => abrirOS({ id }) }) : null,
      h("div", { className: "campo" }, h("span", null, "Casa de Oração"), h(EscolheCliente, { valor: f.clienteId, rotulo: f.clienteNome,
        aoEscolher: c => setF(p => Object.assign({}, p, { clienteId: c.id, clienteNome: c.nome, comQuemFalar: p.comQuemFalar || c.contato || "" })) })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Status" },
          h("select", { value: f.status, onChange: e => mudar("status")(e.target.value) }, op.status.map(s => h("option", { key: s.nome, value: s.nome }, s.nome)))),
        h(Campo, { rotulo: "Tipo de serviço" },
          h("select", { value: f.tipoServico || "", onChange: e => mudar("tipoServico")(e.target.value) },
            h("option", { value: "" }, "—"), op.tipos.map(t => h("option", { key: t, value: t }, t)),
            f.tipoServico && op.tipos.indexOf(f.tipoServico) < 0 ? h("option", { value: f.tipoServico }, f.tipoServico) : null)),
        h(Campo, { rotulo: "Com quem falar" }, h(Texto, { valor: f.comQuemFalar, aoMudar: mudar("comQuemFalar") })),
        h(Campo, { rotulo: "Andamento (%)" }, h(Texto, { valor: f.andamento, aoMudar: v => mudar("andamento")(v.replace(/\D/g, "").slice(0, 3)), inputMode: "numeric" }))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Responsável" },
          h("select", { value: f.responsavelId || "", onChange: e => mudar("responsavelId")(e.target.value ? Number(e.target.value) : null) },
            h("option", { value: "" }, "—"), op.responsaveis.map(r => h("option", { key: r.id, value: r.id }, r.nome)))),
        h(Campo, { rotulo: "Aberto em" }, h(Texto, { valor: f.abertoEm, aoMudar: mudar("abertoEm"), type: "date" })),
        final ? h(Campo, { rotulo: "Fechado em" }, h(Texto, { valor: f.fechadoEm, aoMudar: mudar("fechadoEm"), type: "date" })) : null),
      h(Campo, { rotulo: "Descrição do problema e do serviço a executar", dica: "O que a casa relatou e o que vai ser feito. Sai no orçamento e na OS." }, h("textarea", { value: f.necessidade || "", onChange: e => mudar("necessidade")(e.target.value) })),
      h(Campo, { rotulo: "Observação interna", dica: "Não sai no orçamento." }, h("textarea", { value: f.obs || "", onChange: e => mudar("obs")(e.target.value) })),
      ehAdmin ? (carga !== "ok" ? h("div", { className: "vazio" }, carga === "carregando" ? "Carregando orçamento…" : h(Aviso, null, carga))
        : h(Orcamento, { orc, setOrc, cat, f, mudar, recebidoTravado: finTemParcelas })) : null);
  }

  /* v1.14.0: seletor de serviço com busca (sem acento, por partes do nome), mostra o preço do catálogo
     e aceita texto livre para serviço fora do catálogo */
  const semAc = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function EscolheServico({ valor, servicos, aoMudar, foco, rotulo, vazio }) {
    const [aberto, setAberto] = useState(false);
    const [marca, setMarca] = useState(0);
    const caixa = useRef(null);
    const termo = semAc(valor).split(/\s+/).filter(Boolean);
    const exato = servicos.some(s => s.nome === valor);
    const lista = (exato ? servicos : servicos.filter(s => termo.every(t => semAc(s.nome).indexOf(t) >= 0))).slice(0, 40);
    useEffect(() => {
      if (!aberto) return undefined;
      const fora = e => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false); };
      document.addEventListener("mousedown", fora); document.addEventListener("touchstart", fora);
      return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("touchstart", fora); };
    }, [aberto]);
    const escolher = sv => { aoMudar(sv.nome); setAberto(false); };
    function tecla(e) {
      if (!aberto && (e.key === "ArrowDown" || e.key === "Enter")) { setAberto(true); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setMarca(m => Math.min(m + 1, lista.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setMarca(m => Math.max(m - 1, 0)); }
      else if (e.key === "Enter" && lista[marca]) { e.preventDefault(); escolher(lista[marca]); }
      else if (e.key === "Escape" && aberto) { e.stopPropagation(); setAberto(false); }
    }
    return h("div", { className: "esc-serv", ref: caixa },
      h("input", { className: "entrada-texto", value: valor || "", placeholder: "Escolha ou digite o " + (rotulo ? rotulo.toLowerCase() : "serviço"), autoFocus: !!foco,
        onChange: e => { aoMudar(e.target.value); setAberto(true); setMarca(0); }, onFocus: () => setAberto(true), onKeyDown: tecla, "aria-label": rotulo || "Serviço" }),
      valor ? h("button", { type: "button", className: "esc-serv-limpa", "aria-label": "Limpar", onClick: () => { aoMudar(""); setAberto(true); } }, "×") : null,
      aberto ? h("div", { className: "esc-serv-lista" },
        lista.length ? lista.map((sv, i) => h("button", { type: "button", key: sv.id, className: i === marca ? "on" : "", onMouseDown: e => e.preventDefault(), onClick: () => escolher(sv) },
          h("span", null, sv.nome), h("b", null, BRL(sv.valor))))
        : h("div", { className: "cel-sub", style: { padding: 10 } }, valor ? "Fora do catálogo: será usado como você escreveu." : (vazio || "Catálogo vazio. Cadastre em Catálogo e preços."))) : null);
  }

  function Orcamento({ orc, setOrc, cat, f, mudar, recebidoTravado }) {
    const t = orcTotais(orc);
    const set = (k, v) => setOrc(o => Object.assign({}, o, { [k]: v }));
    const linha = (k, i, campo, v) => setOrc(o => Object.assign({}, o, { [k]: o[k].map((r, j) => j === i ? Object.assign({}, r, { [campo]: v }) : r) }));
    const tirar = (k, i) => setOrc(o => Object.assign({}, o, { [k]: o[k].filter((_, j) => j !== i) }));
    const servicos = cat.servicos.filter(s => s.ativo);
    const maquinas = cat.maquinas.filter(k => k.ativo);
    const opcionais = cat.materiais.filter(m => m.ativo && m.tipo === "opcional");
    const automaticos = new Set(cat.materiais.filter(m => m.tipo !== "opcional").map(m => m.nome));
    const [avisos, setAvisos] = useState([]);

    function nomeServico(i, v) {
      setOrc(o => Object.assign({}, o, { servicos: o.servicos.map((r, j) => {
        if (j !== i) return r;
        const nr = Object.assign({}, r, { nome: v });
        const hit = servicos.find(s => s.nome === v);
        const ant = servicos.find(s => s.nome === r.nome);   /* v1.14.0: trocar de serviço troca o preço que veio do catálogo */
        if (hit && (!nTxt(r.unit) || (ant && nTxt(r.unit) === nTxt(ant.valor)))) nr.unit = valTexto(hit.valor);
        return nr;
      }) }));
    }
    const matCat = cat.materiais.filter(m => m.ativo).map(m => ({ id: m.id, nome: m.nome, valor: m.custo, unidade: m.unidade }));
    function nomeMaterial(i, v) {   /* v1.14.0: material do catálogo traz preço e unidade */
      setOrc(o => Object.assign({}, o, { materiais: o.materiais.map((r, j) => {
        if (j !== i) return r;
        const nr = Object.assign({}, r, { nome: v });
        const hit = matCat.find(m => m.nome === v), ant = matCat.find(m => m.nome === r.nome);
        if (hit && (!nTxt(r.unit) || (ant && nTxt(r.unit) === nTxt(ant.valor)))) { nr.unit = valTexto(hit.valor); nr.un = hit.unidade || nr.un; }
        return nr;
      }) }));
    }
    function gerar() {
      if (!orc.maquinas.length) { setAvisos(["Adicione ao menos uma máquina."]); return; }
      const r = gerarMateriais(orc.maquinas, cat);
      setAvisos(r.avisos);
      if (!r.gerados.length) return;
      setOrc(o => Object.assign({}, o, { materiais: r.gerados.concat(o.materiais.filter(m => !automaticos.has(m.nome))) }));
    }
    const opcAtivo = m => orc.materiais.some(r => r.nome === m.nome);
    function alternarOpcional(m) {
      setOrc(o => Object.assign({}, o, { materiais: o.materiais.some(r => r.nome === m.nome) ? o.materiais.filter(r => r.nome !== m.nome)
        : o.materiais.concat([{ nome: m.nome, un: m.unidade, qtd: valTexto(nTxt((m.regra || {}).qtd) || 1), unit: valTexto(m.custo) }]) }));
    }
    const ent = (valor, aoMudar, extra) => h("input", Object.assign({ className: "entrada-texto", value: valor == null ? "" : valor, onChange: e => aoMudar(e.target.value) }, extra || {}));
    const somaPct = orc.pagamentos.reduce((s, p) => s + nTxt(p.pct), 0);

    return h("div", { className: "orc" },
      /* mão de obra */
      h("div", { className: "secao-titulo" }, "Mão de obra (serviços)"),
      /* v1.14.0: cada serviço numa linha larga — o nome ocupa a linha inteira no celular, com busca no catálogo */
      orc.servicos.length ? h("div", { className: "orc-servs" }, orc.servicos.map((r, i) => h("div", { key: i, className: "orc-serv" },
        h("div", { className: "orc-serv-nome" }, h(EscolheServico, { valor: r.nome, servicos, aoMudar: v => nomeServico(i, v), foco: !r.nome && i === orc.servicos.length - 1 })),
        h("label", { className: "orc-serv-q" }, h("span", null, "Qtd"), ent(r.qtd, v => linha("servicos", i, "qtd", v), { inputMode: "decimal" })),
        h("label", { className: "orc-serv-v" }, h("span", null, "Valor unit. (R$)"), ent(r.unit, v => linha("servicos", i, "unit", v), { inputMode: "decimal" })),
        h("div", { className: "orc-serv-t" }, h("span", null, "Total"), h("b", null, BRL(nTxt(r.qtd) * nTxt(r.unit)))),
        h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo orc-serv-x", onClick: () => tirar("servicos", i), "aria-label": "Remover serviço" }, "×"))))
      : h("p", { className: "cel-sub" }, "Nenhum serviço lançado."),
      h("button", { type: "button", className: "bt bt-p", onClick: () => set("servicos", orc.servicos.concat([{ nome: "", qtd: "1", unit: "" }])) }, "+ Serviço"),

      /* materiais */
      h("div", { className: "secao-titulo" }, "Materiais"),
      orc.materiais.length ? h("div", { className: "orc-servs" }, orc.materiais.map((r, i) => h("div", { key: i, className: "orc-serv" },
        h("div", { className: "orc-serv-nome" }, h(EscolheServico, { valor: r.nome, servicos: matCat, aoMudar: v => nomeMaterial(i, v), foco: !r.nome && i === orc.materiais.length - 1, rotulo: "Material", vazio: "Catálogo de materiais vazio." })),
        h("label", { className: "orc-serv-q" }, h("span", null, "Qtd" + (r.un ? " (" + r.un + ")" : "")), ent(r.qtd, v => linha("materiais", i, "qtd", v), { inputMode: "decimal" })),
        h("label", { className: "orc-serv-v" }, h("span", null, "Valor unit. (R$)"), ent(r.unit, v => linha("materiais", i, "unit", v), { inputMode: "decimal" })),
        h("div", { className: "orc-serv-t" }, h("span", null, "Total"), h("b", null, BRL(nTxt(r.qtd) * nTxt(r.unit)))),
        h("button", { type: "button", className: "bt bt-leve bt-p bt-perigo orc-serv-x", onClick: () => tirar("materiais", i), "aria-label": "Remover material" }, "×"))))
      : h("p", { className: "cel-sub" }, "Nenhum material lançado."),
      h("button", { type: "button", className: "bt bt-p", onClick: () => set("materiais", orc.materiais.concat([{ nome: "", qtd: "1", unit: "", un: "un" }])) }, "+ Material"),
      /* totais */
      h("div", { className: "secao-titulo" }, "Valores"),
      h("div", { className: "orc-totais" },
        h("div", { className: "orc-resumo" },
          h("div", null, h("span", null, "Mão de obra"), h("b", null, BRL(t.mdo))),
          h("div", null, h("span", null, "Materiais"), h("b", null, BRL(t.mat))),
          h("div", { className: "orc-final" }, h("span", null, "Valor do orçamento"), h("b", null, BRL(t.total))))));

  }

  /* =================================================================
     CATÁLOGO  (só admin)
     ================================================================= */

  const TIPOS_MAT = {
    material:  { rotulo: "Materiais de instalação", sub: "Entram nos tipos de máquina e são calculados pelos metros." },
    acessorio: { rotulo: "Acessórios por máquina",  sub: "Somados para cada máquina do orçamento." },
    insumo:    { rotulo: "Insumos por orçamento",   sub: "Quantidade fixa, uma vez por orçamento." },
    opcional:  { rotulo: "Opcionais",               sub: "Escolhidos à mão no orçamento." },
  };
  const CALCULOS = {
    kg_por_metro:      { rotulo: "kg por metro (tubulação)",       campo: "fator",   nomeCampo: "kg por metro" },
    metros:            { rotulo: "metros × fator (isolamento)",   campo: "fator",   nomeCampo: "Fator" },
    metros_mais_folga: { rotulo: "metros + folga por máquina (cabo)", campo: "folga", nomeCampo: "Folga por máquina (m)" },
    metros_div:        { rotulo: "metros ÷ divisor (fita)",        campo: "divisor", nomeCampo: "Divisor" },
    por_maquina:       { rotulo: "quantidade por máquina",         campo: "fator",   nomeCampo: "Quantidade por máquina" },
    fixo:              { rotulo: "quantidade fixa por orçamento",  campo: "qtd",     nomeCampo: "Quantidade" },
    manual:            { rotulo: "escolhido à mão",                campo: "qtd",     nomeCampo: "Quantidade sugerida" },
  };
  function descreveRegra(r, un) {
    r = r || {};
    switch (r.calculo) {
      case "kg_por_metro":      return NUM(r.fator) + " kg por metro";
      case "metros":            return (Number(r.fator) === 1 ? "1 " + un + " por metro" : NUM(r.fator) + " × metros");
      case "metros_mais_folga": return "metros + " + NUM(r.folga) + " m por máquina";
      case "metros_div":        return "metros ÷ " + NUM(r.divisor);
      case "por_maquina":       return NUM(r.fator) + " " + un + " por máquina";
      case "fixo":              return NUM(r.qtd) + " " + un + " por orçamento";
      default:                  return "escolhido à mão";
    }
  }

  function Catalogo() {
    const [aba, setAba] = useState("servicos");
    const [cat, recarregar] = K.useDados("catalogo.tudo");
    if (cat.carregando && !cat.dados) return h("div", { className: "vazio" }, "Carregando…");
    if (cat.erro) return h("div", null, h(Aviso, null, cat.erro), h("button", { className: "bt", onClick: recarregar }, "Tentar de novo"));
    const d = cat.dados;
    const abas = [["servicos", "Serviços (" + d.servicos.length + ")"], ["materiais", "Materiais (" + d.materiais.length + ")"], ["maquinas", "Tipos de máquina (" + d.maquinas.length + ")"]];
    return h("div", null,
      h("div", { className: "abas", role: "tablist" }, abas.map(([k, t]) => h("button", { key: k, role: "tab", "aria-selected": aba === k, className: "aba" + (aba === k ? " ativa" : ""), onClick: () => setAba(k) }, t))),
      aba === "servicos" ? h(CatServicos, { d, recarregar }) : aba === "materiais" ? h(CatMateriais, { d, recarregar }) : h(CatMaquinas, { d, recarregar }));
  }

  function CatServicos({ d, recarregar }) {
    const [busca, setBusca] = useState("");
    const [editando, setEditando] = useState(null);
    const t = busca.trim().toLowerCase();
    const itens = d.servicos.filter(s => !t || s.nome.toLowerCase().includes(t));
    async function excluir(s) {
      if (!(await K.confirmar({ titulo: "Excluir " + s.nome + "?", texto: "Orçamentos já feitos não mudam.", botao: "Excluir", perigo: true }))) return;
      try { await api("catalogo.servicos.excluir", { id: s.id }); K.avisar("Serviço excluído."); recarregar(); } catch (x) { K.avisar(x.message, true); }
    }
    return h("div", null,
      h("div", { className: "barra" },
        h("input", { className: "entrada-texto busca", placeholder: "Buscar serviço", value: busca, onChange: e => setBusca(e.target.value) }),
        h("div", { style: { flex: 1 } }),
        h("button", { className: "bt bt-marca", onClick: () => setEditando({}) }, "Novo serviço")),
      h("div", { className: "bloco" }, !itens.length ? h("div", { className: "vazio" }, "Nenhum serviço.")
        : h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "Serviço"), h("th", null, "Unidade"), h("th", { className: "num" }, "Valor"), h("th", { className: "acoes" }))),
          h("tbody", null, itens.map(s => h("tr", { key: s.id, style: { opacity: s.ativo ? 1 : .5 } },
            h("td", null, h("span", { className: "cel-titulo" }, s.nome), s.ativo ? null : h("span", { className: "cel-sub" }, "  (inativo)")),
            h("td", null, s.unidade), h("td", { className: "num" }, BRL(s.valor)),
            h("td", { className: "acoes" },
              h("button", { className: "bt bt-leve bt-p", onClick: () => setEditando(s) }, "Editar"),
              h("button", { className: "bt bt-leve bt-p bt-perigo", onClick: () => excluir(s) }, "Excluir")))))))),
      editando ? h(FormServico, { s: editando, aoFechar: () => setEditando(null), aoSalvar: () => { setEditando(null); recarregar(); } }) : null);
  }

  function FormServico({ s, aoFechar, aoSalvar }) {
    const novo = !s.id;
    const [f, setF] = useState({ id: s.id, nome: s.nome || "", unidade: s.unidade || "un", valor: valTexto(s.valor), ativo: s.ativo !== false });
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(p => Object.assign({}, p, { [k]: v }));
    async function salvar() {
      setErro(""); setEnviando(true);
      try { await api("catalogo.servicos.salvar", f); K.avisar("Serviço salvo."); aoSalvar(); } catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: novo ? "Novo serviço" : "Editar serviço", aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Nome do serviço" }, h(Texto, { valor: f.nome, aoMudar: mudar("nome"), autoFocus: true })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Valor (R$)" }, h(Texto, { valor: f.valor, aoMudar: mudar("valor"), inputMode: "decimal", placeholder: "0,00" })),
        h(Campo, { rotulo: "Unidade", dica: "un, m, m², ponto…" }, h(Texto, { valor: f.unidade, aoMudar: mudar("unidade") }))),
      h("label", { className: "check" }, h("input", { type: "checkbox", checked: f.ativo, onChange: e => mudar("ativo")(e.target.checked) }), "Ativo (aparece no orçamento)"));
  }

  function CatMateriais({ d, recarregar }) {
    const [editando, setEditando] = useState(null);
    async function excluir(m) {
      if (!(await K.confirmar({ titulo: "Excluir " + m.nome + "?", texto: "Ele também sai dos tipos de máquina em que aparece.", botao: "Excluir", perigo: true }))) return;
      try { await api("catalogo.materiais.excluir", { id: m.id }); K.avisar("Material excluído."); recarregar(); } catch (x) { K.avisar(x.message, true); }
    }
    return h("div", null,
      h("div", { className: "barra" },
        h("p", { className: "cel-sub", style: { margin: 0, flex: 1 } }, "No orçamento, o pacote de materiais recebe a margem de Configurações › Orçamento (padrão 15%). Regras do painel: tubulação em kg pelo fator, isolamento em metros, cabo = metros + 2 m por máquina, fita = metros ÷ 3."),
        h("button", { className: "bt bt-marca", onClick: () => setEditando({ tipo: "material" }) }, "Novo material")),
      Object.keys(TIPOS_MAT).map(tp => {
        const itens = d.materiais.filter(m => m.tipo === tp);
        return h("div", { key: tp, className: "bloco" },
          h("div", { className: "bloco-cab" }, h("h2", null, TIPOS_MAT[tp].rotulo), h("p", null, TIPOS_MAT[tp].sub)),
          !itens.length ? h("div", { className: "vazio", style: { padding: 20 } }, "Nenhum item.")
          : h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
            h("thead", null, h("tr", null, h("th", null, "Material"), h("th", null, "Cálculo"), h("th", { className: "num" }, "Preço"), h("th", { className: "acoes" }))),
            h("tbody", null, itens.map(m => h("tr", { key: m.id, style: { opacity: m.ativo ? 1 : .5 } },
              h("td", null, h("div", { className: "cel-titulo" }, m.nome), h("div", { className: "cel-sub" }, "por " + m.unidade + (m.ativo ? "" : " · inativo"))),
              h("td", null, descreveRegra(m.regra, m.unidade)),
              h("td", { className: "num" }, h("b", null, BRL(m.custo))),
              h("td", { className: "acoes" },
                h("button", { className: "bt bt-leve bt-p", onClick: () => setEditando(m) }, "Editar"),
                h("button", { className: "bt bt-leve bt-p bt-perigo", onClick: () => excluir(m) }, "Excluir"))))))));
      }),
      editando ? h(FormMaterial, { m: editando, aoFechar: () => setEditando(null), aoSalvar: () => { setEditando(null); recarregar(); } }) : null);
  }

  function FormMaterial({ m, aoFechar, aoSalvar }) {
    const novo = !m.id;
    const padraoCalc = { material: "metros", acessorio: "por_maquina", insumo: "fixo", opcional: "manual" };
    const r0 = m.regra || { calculo: padraoCalc[m.tipo || "material"] };
    const [f, setF] = useState({ id: m.id, tipo: m.tipo || "material", nome: m.nome || "", unidade: m.unidade || "un", custo: valTexto(m.custo),
      markupPct: valTexto(m.markupPct != null ? m.markupPct : 15), calculo: r0.calculo, param: valTexto(r0[(CALCULOS[r0.calculo] || {}).campo] != null ? r0[(CALCULOS[r0.calculo] || {}).campo] : ""), ativo: m.ativo !== false });
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const mudar = k => v => setF(p => Object.assign({}, p, { [k]: v }));
    const calc = CALCULOS[f.calculo] || CALCULOS.manual;
    const opcoesCalc = f.tipo === "material" ? ["kg_por_metro", "metros", "metros_mais_folga", "metros_div", "por_maquina"] : f.tipo === "acessorio" ? ["por_maquina"] : f.tipo === "insumo" ? ["fixo"] : ["manual"];
    async function salvar() {
      setErro(""); setEnviando(true);
      const regra = { calculo: f.calculo }; regra[calc.campo] = f.param;
      try { await api("catalogo.materiais.salvar", { id: f.id, tipo: f.tipo, nome: f.nome, unidade: f.unidade, custo: f.custo, markupPct: f.markupPct, regra, ativo: f.ativo }); K.avisar("Material salvo."); aoSalvar(); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: novo ? "Novo material" : "Editar material", aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Nome" }, h(Texto, { valor: f.nome, aoMudar: mudar("nome"), autoFocus: true })),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Categoria" }, h("select", { value: f.tipo, onChange: e => { const tp = e.target.value; setF(p => Object.assign({}, p, { tipo: tp, calculo: padraoCalc[tp], param: tp === "material" ? p.param : "1" })); } },
          Object.keys(TIPOS_MAT).map(k => h("option", { key: k, value: k }, TIPOS_MAT[k].rotulo)))),
        h(Campo, { rotulo: "Unidade", dica: "kg, m, un, pct…" }, h(Texto, { valor: f.unidade, aoMudar: mudar("unidade") }))),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Preço (R$ por " + (f.unidade || "un") + ")", dica: "A margem dos materiais é somada no orçamento." }, h(Texto, { valor: f.custo, aoMudar: mudar("custo"), inputMode: "decimal" }))),
      h("div", { className: "secao-titulo" }, "Como a quantidade é calculada"),
      h("div", { className: "linha-campos" },
        h(Campo, { rotulo: "Cálculo" }, h("select", { value: f.calculo, disabled: opcoesCalc.length === 1, onChange: e => mudar("calculo")(e.target.value) },
          opcoesCalc.map(k => h("option", { key: k, value: k }, CALCULOS[k].rotulo)))),
        h(Campo, { rotulo: calc.nomeCampo }, h(Texto, { valor: f.param, aoMudar: mudar("param"), inputMode: "decimal" }))),
      h("label", { className: "check" }, h("input", { type: "checkbox", checked: f.ativo, onChange: e => mudar("ativo")(e.target.checked) }), "Ativo (usado no orçamento)"));
  }

  function CatMaquinas({ d, recarregar }) {
    const [editando, setEditando] = useState(null);
    const porId = {}; d.materiais.forEach(m => { porId[m.id] = m; });
    async function excluir(k) {
      if (!(await K.confirmar({ titulo: "Excluir " + k.nome + "?", botao: "Excluir", perigo: true }))) return;
      try { await api("catalogo.maquinas.excluir", { id: k.id }); K.avisar("Tipo de máquina excluído."); recarregar(); } catch (x) { K.avisar(x.message, true); }
    }
    return h("div", null,
      h("div", { className: "barra" },
        h("p", { className: "cel-sub", style: { margin: 0, flex: 1 } }, "Cada tipo de máquina diz quais materiais entram quando ela é lançada no orçamento. Os acessórios por máquina e os insumos entram sempre."),
        h("button", { className: "bt bt-marca", onClick: () => setEditando({}) }, "Novo tipo de máquina")),
      h("div", { className: "bloco" }, !d.maquinas.length ? h("div", { className: "vazio" }, "Nenhum tipo de máquina.")
        : h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "Tipo de máquina"), h("th", null, "Materiais do kit"), h("th", { className: "acoes" }))),
          h("tbody", null, d.maquinas.map(k => h("tr", { key: k.id },
            h("td", null, h("span", { className: "cel-titulo" }, k.nome)),
            h("td", null, h("div", { className: "etiquetas" }, k.materiais.map(id => porId[id] ? h("span", { key: id, className: "etiqueta" }, porId[id].nome) : null))),
            h("td", { className: "acoes" },
              h("button", { className: "bt bt-leve bt-p", onClick: () => setEditando(k) }, "Editar"),
              h("button", { className: "bt bt-leve bt-p bt-perigo", onClick: () => excluir(k) }, "Excluir")))))))),
      editando ? h(FormMaquina, { k: editando, materiais: d.materiais.filter(m => m.tipo === "material"), aoFechar: () => setEditando(null), aoSalvar: () => { setEditando(null); recarregar(); } }) : null);
  }

  function FormMaquina({ k, materiais, aoFechar, aoSalvar }) {
    const [nome, setNome] = useState(k.nome || "");
    const [sel, setSel] = useState(k.materiais || []);
    const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
    const alterna = id => setSel(s => s.indexOf(id) >= 0 ? s.filter(x => x !== id) : s.concat(id));
    async function salvar() {
      setErro(""); setEnviando(true);
      try { await api("catalogo.maquinas.salvar", { id: k.id, nome, materiais: sel }); K.avisar("Tipo de máquina salvo."); aoSalvar(); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h(Painel, { titulo: k.id ? "Editar tipo de máquina" : "Novo tipo de máquina", aoFechar,
      rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Cancelar"), h("button", { key: "s", className: "bt bt-marca", onClick: salvar, disabled: enviando }, enviando ? "Salvando…" : "Salvar")] },
      h(Aviso, null, erro),
      h(Campo, { rotulo: "Nome", dica: "Ex.: Máquina 24.000 Btus" }, h(Texto, { valor: nome, aoMudar: setNome, autoFocus: true })),
      h("div", { className: "secao-titulo" }, "Materiais que entram (" + sel.length + ")"),
      h("div", { className: "lista-check" }, materiais.map(m => h("label", { key: m.id, className: "check" },
        h("input", { type: "checkbox", checked: sel.indexOf(m.id) >= 0, onChange: () => alterna(m.id) }),
        h("span", null, m.nome, h("span", { className: "cel-sub" }, " · " + descreveRegra(m.regra, m.unidade)))))));
  }

  K.modulos = K.modulos || {};
  K.modulos.clientes = { titulo: "Casas de Oração", icone: "empresas", perfis: ["admin", "coord", "gestao", "procurador", "seguranca"], grupo: "Manutenção", Tela: Clientes };
  K.CRM = { FormChamado, EscolheCliente,   /* usado pela tela Início */
    /* v1.15.0: peças reaproveitadas pelo módulo de Contratos (contratos.js) */
    useEstreito, ctxDocDe, docEstilo, docCabecalho, escreverJanela, esc, nl2br, dataBR, hojeISO, BRL };
  K.modulos.chamados = { titulo: "Chamados", icone: "crm", perfis: ["admin", "coord", "gestao", "procurador", "seguranca"], grupo: "Manutenção", Tela: Chamados };
  K.modulos.catalogo = { titulo: "Catálogo e preços", icone: "etiqueta", perfis: ["admin", "coord"], grupo: "Manutenção", Tela: Catalogo };
})();
