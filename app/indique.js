/* =====================================================================
   SGClim — app/indique.js  ·  página "Indique o SGClim" (v1.33.0)
   Mora em sgclim.xclim.com.br/indique/ (página própria, <base href="/">).
   Reaproveita o visual da apresentação (landing.js, classes lp-*).
   - Quero indicar: a pessoa preenche os dados e a chave Pix, aceita o
     regulamento e já sai com o código e o link (indique.cadastrar).
   - Já sou indicador: CPF/CNPJ + WhatsApp → link, empresas e comissões
     (indique.consultar).
   ===================================================================== */
(function () {
  "use strict";
  const { h } = K;
  const { useState, useEffect, useRef } = React;

  const BRL = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dia = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—";
  const mes = s => { if (!s) return "—"; const [a, m] = String(s).split("-"); return ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+m - 1] + "/" + a; };
  const pct = n => String(n).replace(".", ",") + "%";

  async function chamar(acao, dados) {
    let r;
    try { r = await fetch("cadastro/api.php", { method: "POST", headers: { "Content-Type": "application/json", "X-KSAAS": "1" }, body: JSON.stringify({ acao, dados: dados || {} }) }); }
    catch (e) { throw new Error("Sem conexão. Verifique a internet e tente de novo."); }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!j) throw new Error("O servidor respondeu de forma inesperada. Tente de novo em instantes.");
    if (!j.ok) { const x = new Error(j.erro || "Não foi possível concluir."); x.codigo = j.codigo; throw x; }
    return j.dados;
  }

  const soNum = v => String(v || "").replace(/\D/g, "");
  const fmtDoc = v => {
    const d = soNum(v).slice(0, 14);
    if (d.length <= 11) return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  };
  const fmtTel = v => { const d = soNum(v).replace(/^55(?=\d{10,11}$)/, "").slice(0, 11); return d.length > 10 ? d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3") : d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, ""); };

  const PIX = [["cpf", "CPF"], ["cnpj", "CNPJ"], ["celular", "Celular"], ["email", "E-mail"], ["aleatoria", "Chave aleatória"]];

  function copiar(t, setMsg) {
    const ok = () => { setMsg("Copiado!"); setTimeout(() => setMsg(""), 1800); };
    try { navigator.clipboard.writeText(t).then(ok, () => setMsg("Selecione e copie o link.")); } catch (e) { setMsg("Selecione e copie o link."); }
  }

  /* -------- quadro com o efeito "escada" (exemplo do regulamento) -------- */
  function Escada({ porMes }) {
    const v = porMes || 5;
    const linhas = [[1, [v, null, null]], [2, [v, v, null]], [3, [v, v, v]], [4, ["fim", v, v]], [5, ["", "fim", v]], [6, ["", "", "fim"]]];
    const soma = c => c.reduce((s, x) => s + (typeof x === "number" ? x : 0), 0);
    const cel = x => x === null ? "–" : x === "fim" ? h("span", { className: "idq-fim" }, "✓ fim") : x === "" ? "" : BRL(x);
    return h("div", { className: "idq-tab-caixa" }, h("table", { className: "idq-tab" },
      h("thead", null, h("tr", null, h("th", null, "Mês"), h("th", null, "Empresa A"), h("th", null, "Empresa B"), h("th", null, "Empresa C"), h("th", null, "Você recebe"))),
      h("tbody", null, linhas.map(([m, c]) => h("tr", { key: m }, h("td", null, m + "º"), c.map((x, i) => h("td", { key: i }, cel(x))), h("td", null, h("b", null, BRL(soma(c)))))))));
  }

  /* -------- formulário de cadastro -------- */
  function Cadastro({ regra, aoConcluir, aoJaSou }) {
    const [f, setF] = useState({ nome: "", documento: "", telefone: "", email: "", cidade: "", atuacao: "", pixTipo: "", pix: "", aceite: false, site: "" });
    const [erro, setErro] = useState("");
    const [jaTem, setJaTem] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const m = k => e => {
      let v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      if (k === "documento") v = fmtDoc(v);
      if (k === "telefone") v = fmtTel(v);
      setF(x => {
        const n = Object.assign({}, x, { [k]: v });
        /* chave CPF/CNPJ: já preenche com o documento */
        if (k === "pixTipo" && (v === "cpf" || v === "cnpj")) n.pix = n.documento;
        if (k === "pixTipo" && v === "celular" && !x.pix) n.pix = n.telefone;
        if (k === "pixTipo" && v === "email" && !x.pix) n.pix = n.email;
        if (k === "documento" && (x.pixTipo === "cpf" || x.pixTipo === "cnpj")) n.pix = v;
        return n;
      });
    };
    async function enviar(e) {
      e.preventDefault(); setErro(""); setJaTem(false);
      if (!f.nome.trim() || !f.documento || !f.telefone || !f.email.trim() || !f.atuacao || !f.pixTipo || !f.pix.trim()) return setErro("Preencha todos os campos marcados.");
      if (!f.aceite) return setErro("Para continuar, leia e aceite o regulamento do programa.");
      setEnviando(true);
      try { aoConcluir(await chamar("indique.cadastrar", f)); }
      catch (x) { setErro(x.message); setJaTem(x.codigo === "JA_CADASTRADO"); setEnviando(false); }
    }
    const campo = (k, rot, props) => h("label", { className: "lp-campo" + (props && props.largo ? " lp-largo" : "") }, h("span", null, rot),
      h("input", Object.assign({ value: f[k], onChange: m(k), name: k }, props && props.input)));
    const travarPix = f.pixTipo === "cpf" || f.pixTipo === "cnpj";
    const dicaPix = { cpf: "O mesmo CPF do cadastro.", cnpj: "O mesmo CNPJ do cadastro.", celular: "Com DDD, do jeito que está no seu banco.", email: "O e-mail cadastrado como chave no seu banco.", aleatoria: "Copie do app do banco (32 letras e números com traços)." }[f.pixTipo];
    return h("form", { className: "lp-form", onSubmit: enviar, noValidate: true },
      campo("nome", "Nome completo *", { largo: true, input: { autoComplete: "name", required: true } }),
      campo("documento", "CPF ou CNPJ *", { input: { inputMode: "numeric", placeholder: "000.000.000-00", required: true } }),
      campo("telefone", "WhatsApp *", { input: { inputMode: "tel", autoComplete: "tel", placeholder: "(11) 90000-0000", required: true } }),
      campo("email", "E-mail *", { input: { type: "email", autoComplete: "email", inputMode: "email", required: true } }),
      campo("cidade", "Cidade", { input: { autoComplete: "address-level2", placeholder: "Ex.: São Paulo/SP" } }),
      h("label", { className: "lp-campo lp-largo" }, h("span", null, "Como você atua? *"),
        h("select", { value: f.atuacao, onChange: m("atuacao"), required: true }, h("option", { value: "" }, "Escolha…"),
          ((regra && regra.atuacoes) || []).map(x => h("option", { key: x, value: x }, x)))),
      h("fieldset", { className: "idq-pix lp-largo" },
        h("legend", null, "Chave Pix para receber as comissões *"),
        h("div", { className: "idq-chips", role: "radiogroup", "aria-label": "Tipo da chave Pix" },
          PIX.map(([v, r]) => h("button", { key: v, type: "button", role: "radio", "aria-checked": f.pixTipo === v, className: f.pixTipo === v ? "ativo" : "", onClick: () => m("pixTipo")({ target: { value: v } }) }, r))),
        f.pixTipo ? h("label", { className: "lp-campo" }, h("span", { className: "idq-sr" }, "Chave Pix"),
          h("input", { value: f.pix, onChange: m("pix"), readOnly: travarPix, name: "pix", autoComplete: "off",
            inputMode: f.pixTipo === "celular" || travarPix ? "numeric" : f.pixTipo === "email" ? "email" : "text",
            placeholder: { celular: "(11) 90000-0000", email: "voce@email.com", aleatoria: "0000aaaa-00aa-00aa-00aa-000000aaaaaa" }[f.pixTipo] || "" })) : null,
        h("p", { className: "idq-dica" }, dicaPix || "A chave precisa estar no seu nome (mesmo CPF ou CNPJ do cadastro).")),
      h("input", { className: "lp-mel", tabIndex: -1, autoComplete: "off", value: f.site, onChange: m("site"), "aria-hidden": true, name: "site" }),
      h("label", { className: "lp-aceite lp-largo" }, h("input", { type: "checkbox", checked: f.aceite, onChange: m("aceite") }),
        h("span", null, "Li e aceito o ", h("a", { href: "legal/indicacao.html", target: "_blank", rel: "noopener" }, "regulamento do programa de indicação"), " e a ",
          h("a", { href: "legal/privacidade.html", target: "_blank", rel: "noopener" }, "Política de Privacidade"), ".")),
      erro ? h("div", { className: "lp-erro lp-largo", role: "alert" }, erro,
        jaTem ? h("button", { type: "button", className: "idq-link", onClick: aoJaSou }, " Ver meu link →") : null) : null,
      h("button", { className: "lp-bt lp-bt-cheio lp-largo", disabled: enviando || (regra && !regra.aberto) }, enviando ? "Enviando…" : "Quero meu link de indicação"),
      regra && !regra.aberto ? h("p", { className: "idq-dica lp-largo" }, "O programa está sendo preparado. Volte em breve.") : null);
  }

  /* -------- painel do indicador (depois do cadastro ou da consulta) -------- */
  function Painel({ p, novo }) {
    const [msg, setMsg] = useState("");
    const primeiro = p.nome.split(" ")[0];
    const texto = "Conhece o SGClim? É um sistema feito para empresas de climatização: chamados, orçamentos, ordens de serviço no celular do técnico, PMOC e área do cliente. Dá para testar grátis por este link: " + p.link;
    return h("div", { className: "idq-painel", role: "status" },
      novo ? h("div", { className: "idq-ok" }, h("span", { className: "lp-ok-i", "aria-hidden": true }, "✓"), h("div", null, h("h3", null, "Pronto, " + primeiro + "!"), h("p", null, "Seu cadastro está ativo. Mandamos tudo também para o seu e-mail.")))
      : h("h3", { className: "idq-ola" }, "Olá, " + primeiro + "!"),
      !p.ativo ? h("div", { className: "lp-erro" }, "Seu código está desativado no momento. Fale com eneas@xclim.com.br.") : null,
      h("div", { className: "idq-codigo" }, h("small", null, "Seu código"), h("b", null, p.codigo)),
      h("div", { className: "idq-linkbox" },
        h("input", { readOnly: true, value: p.link, "aria-label": "Seu link de indicação", onFocus: e => e.target.select() }),
        h("button", { type: "button", className: "lp-bt lp-bt-linha", onClick: () => copiar(p.link, setMsg) }, msg || "Copiar link")),
      h("div", { className: "idq-bts" },
        h("a", { className: "lp-bt lp-bt-cheio", href: "https://wa.me/?text=" + encodeURIComponent(texto), target: "_blank", rel: "noopener" }, "Enviar pelo WhatsApp"),
        h("a", { className: "lp-bt lp-bt-linha", href: "conheca/?i=" + encodeURIComponent(p.codigo), target: "_blank", rel: "noopener" }, "Ver a página que o cliente recebe")),
      h("p", { className: "idq-dica" }, "Sua comissão: ", h("b", null, p.regra), ". Pagamento por Pix na chave ", p.pix, "."),
      h("div", { className: "idq-kpis" },
        h("div", null, h("small", null, "A receber"), h("b", null, BRL(p.aReceber))),
        h("div", null, h("small", null, "Já recebido"), h("b", null, BRL(p.recebido))),
        h("div", null, h("small", null, "Empresas indicadas"), h("b", null, p.empresas.length)),
        p.pedidosEmAnalise ? h("div", null, h("small", null, "Pedidos em análise"), h("b", null, p.pedidosEmAnalise)) : null),
      p.empresas.length ? h("div", { className: "idq-lista" }, h("h4", null, "Empresas ligadas a você"),
        h("ul", null, p.empresas.map((e, i) => h("li", { key: i }, h("span", null, e.nome), h("small", null, "desde " + dia(e.desde)))))) : null,
      p.comissoes.length ? h("div", { className: "idq-lista" }, h("h4", null, "Comissões"),
        h("div", { className: "idq-tab-caixa" }, h("table", { className: "idq-tab idq-tab-esq" },
          h("thead", null, h("tr", null, h("th", null, "Mensalidade de"), h("th", null, "Empresa"), h("th", null, "Comissão"), h("th", null, "Situação"))),
          h("tbody", null, p.comissoes.map((c, i) => h("tr", { key: i }, h("td", null, mes(c.fatura)), h("td", null, c.empresa), h("td", null, BRL(c.valor)),
            h("td", null, c.status === "paga" ? h("span", { className: "idq-pago" }, "Paga em " + dia(c.pagoEm)) : h("span", { className: "idq-pend" }, "A receber")))))))) :
        h("p", { className: "idq-dica" }, "Assim que uma empresa indicada pagar a mensalidade, a comissão aparece aqui."));
  }

  function Consulta({ aoAchar }) {
    const [f, setF] = useState({ documento: "", telefone: "" });
    const [erro, setErro] = useState("");
    const [buscando, setBuscando] = useState(false);
    async function buscar(e) {
      e.preventDefault(); setErro("");
      if (soNum(f.documento).length < 11 || soNum(f.telefone).length < 10) return setErro("Informe o CPF/CNPJ e o WhatsApp do cadastro.");
      setBuscando(true);
      try { aoAchar(await chamar("indique.consultar", f)); } catch (x) { setErro(x.message); }
      setBuscando(false);
    }
    return h("form", { className: "lp-form idq-consulta", onSubmit: buscar, noValidate: true },
      h("label", { className: "lp-campo" }, h("span", null, "CPF ou CNPJ"), h("input", { value: f.documento, inputMode: "numeric", onChange: e => setF(Object.assign({}, f, { documento: fmtDoc(e.target.value) })) })),
      h("label", { className: "lp-campo" }, h("span", null, "WhatsApp do cadastro"), h("input", { value: f.telefone, inputMode: "tel", onChange: e => setF(Object.assign({}, f, { telefone: fmtTel(e.target.value) })) })),
      erro ? h("div", { className: "lp-erro lp-largo", role: "alert" }, erro) : null,
      h("button", { className: "lp-bt lp-bt-cheio lp-largo", disabled: buscando }, buscando ? "Buscando…" : "Ver meu link e minhas comissões"));
  }

  function Indique() {
    const [regra, setRegra] = useState(null);
    const [painel, setPainel] = useState(null);   /* {p, novo} */
    const [modo, setModo] = useState("cadastro");   /* cadastro · consulta */
    const formRef = useRef(null);
    useEffect(() => {
      document.title = "Indique o SGClim e receba por Pix";
      chamar("indique.regra").then(setRegra, () => setRegra({ percentual: 10, meses: 3, texto: "10% das 3 primeiras faturas pagas de cada empresa indicada", exemplos: [], aberto: true, atuacoes: [] }));
      try { if (/consultar|ja-sou/.test(location.hash)) setModo("consulta"); } catch (e) {}
    }, []);
    const ir = m => { if (m) setModo(m); setTimeout(() => formRef.current && formRef.current.scrollIntoView({ behavior: "smooth", block: "start" }), 30); };
    const r = regra || { percentual: 10, meses: 3, exemplos: [] };
    const ex = r.exemplos && r.exemplos[0];
    const dasMens = r.meses === 0 ? "de todas as mensalidades pagas" : r.meses === 1 ? "da 1ª mensalidade paga" : "das " + r.meses + " primeiras mensalidades pagas";

    return h("div", { className: "lp" },
      h("header", { className: "lp-nav" },
        h("a", { className: "lp-logo", href: "conheca/", "aria-label": "SGClim" }, h("span", { className: "lp-simb" }, h(K.Simbolo)), h("span", null, "SGClim", h("small", null, "programa de indicação"))),
        h("nav", { className: "lp-nav-d" },
          h("a", { href: "conheca/" }, "O que é o SGClim"),
          h("button", { type: "button", className: "lp-bt lp-bt-linha", onClick: () => ir("consulta") }, "Já sou indicador"),
          h("button", { type: "button", className: "lp-bt lp-bt-cheio idq-nav-cta", onClick: () => ir("cadastro") }, "Quero indicar"))),

      h("section", { className: "idq-hero" },
        h("div", { className: "idq-hero-t" },
          h("span", { className: "idq-selo" }, "Programa de indicação"),
          h("h1", null, "Indique o SGClim e receba por Pix."),
          h("p", null, "Você conhece empresas de climatização. Cada empresa que assinar pelo seu link rende ", h("b", null, pct(r.percentual) + " " + dasMens), ", direto na sua chave Pix."),
          h("div", { className: "lp-hero-bts" },
            h("button", { type: "button", className: "lp-bt lp-bt-cheio lp-bt-g", onClick: () => ir("cadastro") }, "Quero meu link"),
            h("button", { type: "button", className: "lp-bt lp-bt-linha lp-bt-g", onClick: () => ir("consulta") }, "Já sou indicador")),
          h("p", { className: "lp-mudo" }, "Cadastro em 2 minutos. Sem custo e sem meta.")),
        h("div", { className: "idq-hero-c", "aria-hidden": true },
          h("div", { className: "idq-cartao" },
            h("small", null, "Exemplo: 3 empresas indicadas"),
            h("div", { className: "idq-barras" }, [1, 2, 3, 2, 1, 0].map((n, i) => h("div", { key: i, className: "idq-barra" }, h("i", { style: { height: (n / 3 * 100) + "%" } }), h("span", null, i + 1 + "º")))),
            h("p", null, "O valor sobe enquanto entram indicações novas e cai quando elas param.")))),

      h("section", { className: "lp-fluxo" },
        h("h2", null, "Como funciona"),
        h("ol", { className: "lp-passos idq-passos" },
          h("li", null, h("b", null, "Cadastre-se"), h("p", null, "Preencha seus dados e a chave Pix. Você recebe na hora um código e um link só seus.")),
          h("li", null, h("b", null, "Mande o link"), h("p", null, "Envie para empresas de climatização que você conhece: pelo WhatsApp, no balcão da loja, na obra.")),
          h("li", null, h("b", null, "A empresa assina"), h("p", null, "Ela pede acesso pelo seu link (ou digita o seu código) e testa grátis. Quando assinar, fica ligada a você.")),
          h("li", null, h("b", null, "Você recebe por Pix"), h("p", null, "A cada mensalidade paga, " + pct(r.percentual) + " vira comissão, por " + (r.meses ? r.meses + " mensalidades" : "todas as mensalidades") + " de cada empresa.")))),

      h("section", { className: "idq-conta" },
        h("div", { className: "idq-conta-t" },
          h("h2", null, "Quanto você recebe"),
          h("p", null, "Cada empresa rende comissão por " + (r.meses ? r.meses + " meses" : "enquanto pagar") + ". Por isso o total do mês sobe enquanto você indica e cai quando para. Exemplo com o plano " + (ex ? ex.plano + " (mensalidade " + BRL(ex.mensalidade) + ", " + BRL(ex.porMes) : "Básico (mensalidade R$ 79,90, " + BRL(Math.round(79.9 * r.percentual) / 100)) + " por empresa por mês):"),
          h(Escada, { porMes: ex ? ex.porMes : Math.round(79.9 * r.percentual) / 100 })),
        r.exemplos && r.exemplos.length ? h("div", { className: "idq-planos" },
          h("h3", null, "Por empresa, em cada plano"),
          r.exemplos.map(x => h("div", { key: x.plano, className: "idq-plano" },
            h("div", null, h("b", null, x.plano), h("small", null, "mensalidade " + BRL(x.mensalidade))),
            h("div", null, h("b", null, BRL(x.porMes) + "/mês"), x.total != null ? h("small", null, BRL(x.total) + " no total") : null))),
          h("p", { className: "idq-dica" }, "Valores pelos preços de hoje. A comissão é calculada sobre o que a empresa paga de verdade.")) : null),

      h("section", { className: "idq-regras" },
        h("h2", null, "Regras em poucas linhas"),
        h("ul", null,
          h("li", null, h("b", null, "Só conta mensalidade paga."), " Se a empresa atrasar, a comissão daquele mês sai quando ela pagar."),
          h("li", null, h("b", null, "Cancelou antes, parou ali."), " Se a empresa cancelar antes da " + (r.meses || 3) + "ª mensalidade paga, a comissão para. O que já foi gerado é seu."),
          h("li", null, h("b", null, "Vale com link ou código."), " A empresa precisa pedir acesso pelo seu link ou digitar o seu código. Indicação só de palavra não é registrada."),
          h("li", null, h("b", null, "Pagamento por Pix."), " Até o dia 10 do mês seguinte ao pagamento da mensalidade, na chave cadastrada (no seu nome)."),
          h("li", null, h("b", null, "Própria empresa não vale."), " Não conta indicar a sua empresa, a de um sócio ou uma do mesmo grupo.")),
        h("p", null, h("a", { href: "legal/indicacao.html", target: "_blank", rel: "noopener" }, "Ler o regulamento completo →"))),

      h("section", { className: "lp-pedir idq-form", ref: formRef, id: "cadastro" },
        h("div", { className: "lp-pedir-t" },
          painel ? h("h2", null, painel.novo ? "Seu link está pronto" : "Seu painel")
          : h(React.Fragment, null,
            h("div", { className: "idq-abas", role: "tablist" },
              h("button", { type: "button", role: "tab", "aria-selected": modo === "cadastro", className: modo === "cadastro" ? "ativo" : "", onClick: () => setModo("cadastro") }, "Quero indicar"),
              h("button", { type: "button", role: "tab", "aria-selected": modo === "consulta", className: modo === "consulta" ? "ativo" : "", onClick: () => setModo("consulta") }, "Já sou indicador")),
            h("h2", null, modo === "cadastro" ? "Cadastre-se e receba seu link" : "Veja seu link e suas comissões"),
            h("p", null, modo === "cadastro"
              ? "O cadastro entra na hora. Você recebe o código, o link e um e-mail com tudo."
              : "Digite o CPF/CNPJ e o WhatsApp que você usou no cadastro.")),
          painel ? h("p", null, "Guarde este link. Para voltar aqui depois, use “Já sou indicador” com o seu CPF/CNPJ e WhatsApp.") : null),
        painel ? h(Painel, { p: painel.p, novo: painel.novo })
        : modo === "cadastro" ? h(Cadastro, { regra, aoConcluir: p => { setPainel({ p, novo: true }); ir(); }, aoJaSou: () => setModo("consulta") })
        : h(Consulta, { aoAchar: p => { setPainel({ p, novo: false }); ir(); } })),

      h("footer", { className: "lp-pe" },
        h("div", null, h("b", null, "SGClim · uma solução Xclim"), h("span", null, "Konstante Manutenção e Serviços LTDA-ME · CNPJ 59.655.135/0001-38 · São Paulo/SP")),
        h("div", null, h("a", { href: "legal/indicacao.html", target: "_blank", rel: "noopener" }, "Regulamento"), h("a", { href: "legal/privacidade.html", target: "_blank", rel: "noopener" }, "Privacidade"),
          h("a", { href: "mailto:eneas@xclim.com.br" }, "eneas@xclim.com.br"))));
  }

  (function css() {
    if (document.getElementById("k-css-idq")) return;
    const s = document.createElement("style"); s.id = "k-css-idq";
    s.textContent = [
      ".idq-hero{display:grid;grid-template-columns:minmax(0,6fr) minmax(0,5fr);gap:clamp(24px,5vw,72px);align-items:center;max-width:1320px;margin:0 auto;padding:clamp(40px,7vw,96px) clamp(16px,4vw,48px)}",
      ".idq-hero h1{font-size:clamp(34px,4.8vw,62px);line-height:1.03;letter-spacing:-1.5px;margin:14px 0 20px;color:var(--tinta)}",
      ".idq-hero p{font-size:clamp(16px,1.35vw,19px);line-height:1.55;color:#33405a;margin:0 0 26px;max-width:34em}.idq-hero b{color:var(--tinta)}",
      ".idq-selo{display:inline-block;background:#eaf1ff;color:var(--azul);font-weight:700;font-size:13px;padding:6px 12px;border-radius:99px;letter-spacing:.2px}",
      ".idq-cartao{background:var(--tinta);color:#fff;border-radius:20px;padding:26px 26px 22px;box-shadow:0 30px 60px -24px rgba(4,61,172,.5)}.idq-cartao small{color:#b8c3d9;font-size:13px}",
      ".idq-cartao p{color:#b8c3d9!important;font-size:14px!important;margin:16px 0 0!important}",
      ".idq-barras{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;height:170px;margin-top:18px;align-items:end}",
      ".idq-barra{display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end}.idq-barra i{display:block;width:100%;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#5c9bff,var(--vivo));min-height:3px}",
      ".idq-barra span{font-size:12px;color:#b8c3d9}",
      ".idq-passos{grid-template-columns:repeat(4,1fr)!important}",
      ".idq-conta{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:clamp(24px,5vw,64px);max-width:1320px;margin:0 auto;padding:clamp(48px,7vw,96px) clamp(16px,4vw,48px);align-items:start}",
      ".idq-conta h2,.idq-regras h2{font-size:clamp(26px,2.8vw,38px);line-height:1.1;letter-spacing:-.6px;margin:0 0 14px}.idq-conta p{font-size:16.5px;line-height:1.6;color:#33405a;margin:0 0 18px}",
      ".idq-tab-caixa{overflow-x:auto;border:1px solid #e1e6ef;border-radius:12px}.idq-tab{border-collapse:collapse;width:100%;font-size:15px;font-variant-numeric:tabular-nums}",
      ".idq-tab th,.idq-tab td{padding:10px 12px;text-align:center;border-bottom:1px solid #eef1f6;white-space:nowrap}.idq-tab th{background:var(--papel);font-size:13px;color:var(--cinza);font-weight:600}",
      ".idq-tab th:first-child,.idq-tab td:first-child{text-align:left}.idq-tab td:last-child{background:#f3f8ff}.idq-tab tr:last-child td{border-bottom:0}.idq-tab-esq td,.idq-tab-esq th{text-align:left}.idq-tab-esq td:last-child{background:none}",
      ".idq-fim{color:var(--ok);font-weight:600;font-size:13px}",
      ".idq-planos{background:var(--papel);border:1px solid #e1e6ef;border-radius:16px;padding:22px}.idq-planos h3{margin:0 0 12px;font-size:18px}",
      ".idq-plano{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #e1e6ef}.idq-plano:last-of-type{border-bottom:0}.idq-plano div{display:flex;flex-direction:column}.idq-plano div:last-child{text-align:right}",
      ".idq-plano small{color:var(--cinza);font-size:13px}.idq-plano b{font-size:16px}",
      ".idq-dica{font-size:13.5px!important;color:var(--cinza)!important;margin:8px 0 0!important;line-height:1.5}",
      ".idq-regras{background:var(--papel);padding:clamp(48px,6vw,80px) max(clamp(16px,4vw,48px),calc((100vw - 1320px)/2 + 48px))}",
      ".idq-regras ul{list-style:none;padding:0;margin:0 0 18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}",
      ".idq-regras li{background:#fff;border:1px solid #e1e6ef;border-radius:12px;padding:16px 18px;font-size:15px;line-height:1.5;color:#33405a}.idq-regras li b{display:block;color:var(--tinta);margin-bottom:4px;font-size:16px}",
      ".idq-regras a{font-weight:600}",
      ".idq-abas{display:inline-flex;background:var(--papel);border:1px solid #e1e6ef;border-radius:11px;padding:4px;margin-bottom:18px}",
      ".idq-abas button{font:inherit;font-weight:600;font-size:14px;border:0;background:none;padding:8px 14px;border-radius:8px;cursor:pointer;color:var(--cinza)}.idq-abas button.ativo{background:#fff;color:var(--azul);box-shadow:0 1px 3px rgba(15,27,51,.12)}",
      ".idq-pix{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.idq-pix legend{font-size:14px;font-weight:600;padding:0;margin-bottom:8px}",
      ".idq-chips{display:flex;flex-wrap:wrap;gap:8px}.idq-chips button{font:inherit;font-size:14px;font-weight:500;border:1.5px solid #cfd6e2;background:#fff;border-radius:99px;padding:7px 14px;cursor:pointer;color:var(--tinta)}",
      ".idq-chips button.ativo{border-color:var(--azul);background:#eaf1ff;color:var(--azul);font-weight:600}",
      ".idq-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.idq-pix input[readonly]{background:#f3f5f9;color:#33405a}",
      ".idq-link{font:inherit;font-weight:600;background:none;border:0;color:var(--azul);cursor:pointer;padding:0;text-decoration:underline}",
      ".idq-consulta{grid-template-columns:1fr 1fr}",
      ".idq-painel{background:#fff;border:1px solid #e1e6ef;border-radius:16px;padding:clamp(18px,3vw,30px);align-self:start;display:flex;flex-direction:column;gap:16px}",
      ".idq-ok{display:flex;gap:14px;align-items:center;background:#ecf8f2;border:1px solid #bfe5d2;border-radius:12px;padding:14px 16px}.idq-ok h3{margin:0;font-size:20px}.idq-ok p{margin:2px 0 0;color:#33405a;font-size:14.5px}",
      ".idq-ola{margin:0;font-size:22px}",
      ".idq-codigo{display:flex;flex-direction:column}.idq-codigo small{color:var(--cinza);font-size:13px}.idq-codigo b{font-size:34px;letter-spacing:2px;color:var(--azul);font-variant-numeric:tabular-nums}",
      ".idq-linkbox{display:flex;gap:8px}.idq-linkbox input{flex:1;min-width:0;font:inherit;font-size:14px;border:1.5px solid #cfd6e2;border-radius:9px;padding:10px 12px;background:var(--papel);color:var(--tinta)}",
      ".lp a.lp-bt-cheio{color:#fff}.lp a.lp-bt-cheio:hover{color:#fff}.idq-linkbox .lp-bt{white-space:nowrap}.idq-bts{display:flex;gap:10px;flex-wrap:wrap}.idq-bts .lp-bt{text-decoration:none;text-align:center;padding:12px 18px}",
      ".idq-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.idq-kpis div{background:var(--papel);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column}",
      ".idq-kpis small{font-size:12.5px;color:var(--cinza)}.idq-kpis b{font-size:20px;font-variant-numeric:tabular-nums}",
      ".idq-lista h4{margin:0 0 8px;font-size:15px}.idq-lista ul{list-style:none;margin:0;padding:0}.idq-lista li{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #eef1f6;font-size:15px}.idq-lista li small{color:var(--cinza)}",
      ".idq-pago{color:var(--ok);font-weight:600;font-size:13.5px}.idq-pend{color:#8a5a00;font-weight:600;font-size:13.5px}",
      "@media (max-width:980px){.idq-hero,.idq-conta{grid-template-columns:1fr}.idq-passos{grid-template-columns:1fr 1fr!important;row-gap:34px}}",
      "@media (max-width:600px){.idq-nav-cta{display:none}.lp-nav-d .lp-bt-linha{white-space:nowrap}.idq-consulta{grid-template-columns:1fr}.idq-linkbox{flex-direction:column}.idq-bts .lp-bt{flex:1 1 100%}.idq-passos{grid-template-columns:1fr!important}.idq-codigo b{font-size:28px}}",
    ].join("\n");
    document.head.appendChild(s);
  })();

  K.Indique = Indique;
})();
