/* =====================================================================
   KONSTANTE SaaS — app/landing.js  ·  página de apresentação (v1.17.0)
   v1.29.0: mora em sgclim.xclim.com.br/conheca/ (página própria),
   para mandar a qualquer pessoa. A página usa <base href="/">. "Quero usar" grava o pedido de acesso,
   que é liberado no Console da plataforma; a senha vai por e-mail.
   ===================================================================== */
(function () {
  "use strict";
  const { h } = K;
  const { useState, useEffect, useRef } = React;

  const PASSOS = [
    ["Chamado", "O cliente liga, manda mensagem ou preenche o link de cadastro. Tudo vira chamado com status e histórico."],
    ["Orçamento", "Serviços da sua tabela, materiais, impostos e RT. A proposta sai em PDF com a sua marca."],
    ["Contrato", "Um quadro mostra cada proposta de contrato até a assinatura, com os arquivos guardados no card."],
    ["OS em campo", "O técnico recebe a OS no celular, faz o checklist, tira foto e colhe a assinatura, mesmo sem internet."],
    ["PMOC", "Plano por cliente, apontamento máquina por máquina e o Livro do PMOC gerado sozinho."],
    ["Cliente acompanha", "O seu cliente entra na área dele, vê o que foi feito, baixa os documentos e faz pedidos."],
  ];

  async function enviarPedido(dados, acao) {
    let r;
    try { r = await fetch("cadastro/api.php", { method: "POST", headers: { "Content-Type": "application/json", "X-KSAAS": "1" }, body: JSON.stringify({ acao: acao || "mvp.enviar", dados }) }); }
    catch (e) { throw new Error("Sem conexão. Verifique a internet e tente de novo."); }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!j) throw new Error("O servidor respondeu de forma inesperada. Tente de novo em instantes.");
    if (!j.ok) throw new Error(j.erro || "Não foi possível enviar.");
    return j.dados;
  }

  const fmtCnpj = v => { const d = v.replace(/\D/g, "").slice(0, 14); return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2"); };
  const fmtTel = v => { const d = v.replace(/\D/g, "").slice(0, 11); return d.length > 10 ? d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3") : d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, ""); };

  /* v1.31.0: código de indicação vindo do link do indicador (?i=CODIGO), guardado para quando a pessoa voltar depois */
  function codigoDoLink() {
    let c = "";
    try { const u = new URLSearchParams(location.search); c = (u.get("i") || u.get("cupom") || "").replace(/[^A-Za-z0-9_-]/g, "").toUpperCase().slice(0, 30); } catch (e) {}
    try { if (c) localStorage.setItem("sgclim_indicacao", c); else c = localStorage.getItem("sgclim_indicacao") || ""; } catch (e) {}
    return c;
  }

  function Pedido() {
    const [f, setF] = useState(() => ({ empresa: "", cnpj: "", responsavel: "", email: "", telefone: "", cidade: "", porte: "", mensagem: "", aceite: false, site: "", codigo: codigoDoLink() }));
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [ok, setOk] = useState(false);
    const m = k => e => setF(x => Object.assign({}, x, { [k]: e.target.type === "checkbox" ? e.target.checked : k === "cnpj" ? fmtCnpj(e.target.value) : k === "telefone" ? fmtTel(e.target.value) : e.target.value }));
    async function enviar(e) {
      e.preventDefault(); setErro("");
      if (!f.empresa.trim() || !f.responsavel.trim() || !f.email.trim() || !f.telefone.trim()) return setErro("Preencha empresa, responsável, e-mail e telefone.");
      if (!f.aceite) return setErro("Para continuar, aceite os Termos de Uso e a Política de Privacidade.");
      setEnviando(true);
      try { await enviarPedido(f); setOk(true); } catch (x) { setErro(x.message); }
      setEnviando(false);
    }
    if (ok) return h("div", { className: "lp-ok", role: "status" },
      h("div", { className: "lp-ok-i", "aria-hidden": true }, "✓"),
      h("h3", null, "Pedido recebido."),
      h("p", null, "Enviamos uma confirmação para ", h("b", null, f.email), ". Assim que o acesso for liberado, chega outro e-mail com o link e a senha provisória."),
      h("p", { className: "lp-mudo" }, "Não chegou? Confira a caixa de spam ou fale com eneas@xclim.com.br."));
    const campo = (k, rot, props) => h("label", { className: "lp-campo" + (props && props.largo ? " lp-largo" : "") }, h("span", null, rot),
      h("input", Object.assign({ value: f[k], onChange: m(k) }, props && props.input)));
    return h("form", { className: "lp-form", onSubmit: enviar, noValidate: true },
      campo("empresa", "Nome da empresa", { input: { autoComplete: "organization", required: true } }),
      campo("cnpj", "CNPJ", { input: { inputMode: "numeric", placeholder: "00.000.000/0000-00" } }),
      campo("responsavel", "Seu nome", { input: { autoComplete: "name", required: true } }),
      campo("email", "E-mail", { input: { type: "email", autoComplete: "email", required: true, inputMode: "email" } }),
      campo("telefone", "WhatsApp", { input: { inputMode: "tel", autoComplete: "tel", placeholder: "(11) 90000-0000", required: true } }),
      campo("cidade", "Cidade", { input: { autoComplete: "address-level2" } }),
      h("label", { className: "lp-campo" }, h("span", null, "Técnicos em campo"),
        h("select", { value: f.porte, onChange: m("porte") }, h("option", { value: "" }, "Escolha…"), ["1 a 3", "4 a 10", "11 a 30", "Mais de 30"].map(x => h("option", { key: x, value: x }, x)))),
      h("label", { className: "lp-campo lp-largo" }, h("span", null, "O que você quer organizar primeiro? (opcional)"),
        h("textarea", { rows: 3, value: f.mensagem, onChange: m("mensagem"), placeholder: "Ex.: contratos de PMOC de 15 condomínios, OS dos técnicos, orçamentos…" })),
      campo("codigo", "Código de indicação ou cupom (opcional)", { input: { autoComplete: "off", placeholder: "Se alguém indicou o SGClim, coloque o código aqui" } }),
      h("input", { className: "lp-mel", tabIndex: -1, autoComplete: "off", value: f.site, onChange: m("site"), "aria-hidden": true, name: "site" }),
      h("label", { className: "lp-aceite lp-largo" }, h("input", { type: "checkbox", checked: f.aceite, onChange: m("aceite") }),
        h("span", null, "Li e aceito os ", h("a", { href: "legal/termos.html", target: "_blank", rel: "noopener" }, "Termos de Uso"), " e a ", h("a", { href: "legal/privacidade.html", target: "_blank", rel: "noopener" }, "Política de Privacidade"), ".")),
      erro ? h("div", { className: "lp-erro lp-largo", role: "alert" }, erro) : null,
      h("button", { className: "lp-bt lp-bt-cheio lp-largo", disabled: enviando }, enviando ? "Enviando…" : "Pedir acesso"));
  }

  /* v1.39.0: "Eu quero" — para quem ainda não quer testar, mas quer mais informações. Não cria acesso. */
  function EuQuero() {
    const [f, setF] = useState({ nome: "", email: "", whatsapp: "", tipoEmpresa: "", funcionarios: "", site: "" });
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [ok, setOk] = useState(false);
    const m = k => e => setF(x => Object.assign({}, x, { [k]: k === "whatsapp" ? fmtTel(e.target.value) : e.target.value }));
    async function enviar(e) {
      e.preventDefault(); setErro("");
      if (!f.nome.trim() || !f.email.trim() || !f.whatsapp.trim()) return setErro("Preencha nome, e-mail e WhatsApp.");
      setEnviando(true);
      try { await enviarPedido(f, "mvp.info"); setOk(true); } catch (x) { setErro(x.message); }
      setEnviando(false);
    }
    if (ok) return h("div", { className: "lp-ok", role: "status" },
      h("div", { className: "lp-ok-i", "aria-hidden": true }, "✓"),
      h("h3", null, "Recebido!"),
      h("p", null, "Em breve falamos com você pelo WhatsApp ou e-mail com as informações do SGClim."));
    const campo = (k, rot, props) => h("label", { className: "lp-campo" + (props && props.largo ? " lp-largo" : "") }, h("span", null, rot),
      h("input", Object.assign({ value: f[k], onChange: m(k), maxLength: (props && props.max) || 150 }, props && props.input)));
    return h("form", { className: "lp-form", onSubmit: enviar, noValidate: true },
      campo("nome", "Seu nome", { input: { autoComplete: "name", required: true } }),
      campo("email", "E-mail", { max: 190, input: { type: "email", autoComplete: "email", required: true, inputMode: "email" } }),
      campo("whatsapp", "WhatsApp", { max: 30, input: { inputMode: "tel", autoComplete: "tel", placeholder: "(11) 90000-0000", required: true } }),
      h("label", { className: "lp-campo" }, h("span", null, "Tipo de empresa (opcional)"),
        h("select", { value: f.tipoEmpresa, onChange: m("tipoEmpresa") }, h("option", { value: "" }, "Escolha…"),
          ["Instalação e manutenção de ar-condicionado", "Refrigeração comercial", "Engenharia / projetos", "Administradora / condomínio", "Outro"].map(x => h("option", { key: x, value: x }, x)))),
      h("label", { className: "lp-campo lp-largo" }, h("span", null, "Quantidade de funcionários (opcional)"),
        h("select", { value: f.funcionarios, onChange: m("funcionarios") }, h("option", { value: "" }, "Escolha…"), ["Só eu", "2 a 5", "6 a 15", "16 a 50", "Mais de 50"].map(x => h("option", { key: x, value: x }, x)))),
      h("input", { className: "lp-mel", tabIndex: -1, autoComplete: "off", value: f.site, onChange: m("site"), "aria-hidden": true, name: "site" }),
      h("p", { className: "lp-mudo lp-largo", style: { margin: 0 } }, "Usamos estes dados só para falar com você sobre o SGClim. ", h("a", { href: "legal/privacidade.html", target: "_blank", rel: "noopener" }, "Política de Privacidade"), "."),
      erro ? h("div", { className: "lp-erro lp-largo", role: "alert" }, erro) : null,
      h("button", { className: "lp-bt lp-bt-cheio lp-largo", disabled: enviando }, enviando ? "Enviando…" : "Eu quero mais informações"));
  }

  function Landing({ aoEntrar }) {
    const formRef = useRef(null);
    useEffect(() => { document.title = "SGClim · Sistema de gestão para climatização"; }, []);
    const irForm = () => formRef.current && formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    const infoRef = useRef(null);
    const irInfo = () => infoRef.current && infoRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    return h("div", { className: "lp" },
      h("header", { className: "lp-nav" },
        h("a", { className: "lp-logo", href: "#", onClick: e => { e.preventDefault(); const r = document.querySelector(".lp"); if (r) r.scrollTo({ top: 0, behavior: "smooth" }); }, "aria-label": "SGClim" }, h("span", { className: "lp-simb" }, h(K.Simbolo)), h("span", null, "SGClim", h("small", null, "sistema de gestão"))),
        h("nav", { className: "lp-nav-d" },
          h("a", { href: "#recursos", onClick: e => { e.preventDefault(); document.getElementById("recursos").scrollIntoView({ behavior: "smooth" }); } }, "O que faz"),
          h("button", { type: "button", className: "lp-bt lp-bt-linha", onClick: aoEntrar }, "Entrar"),
          h("button", { type: "button", className: "lp-bt lp-bt-cheio", onClick: irForm }, "Quero usar"))),

      h("section", { className: "lp-hero" },
        h("div", { className: "lp-hero-t" },
          h("h1", null, "Do chamado ao Livro do PMOC, num sistema só."),
          h("p", null, "Feito por uma empresa de climatização, para empresas de climatização. Orçamentos, contratos, ordens de serviço no celular do técnico, PMOC pronto para a fiscalização e uma área para o seu cliente acompanhar tudo."),
          h("div", { className: "lp-hero-bts" },
            h("button", { type: "button", className: "lp-bt lp-bt-cheio lp-bt-g", onClick: irForm }, "Quero usar"),
            h("button", { type: "button", className: "lp-bt lp-bt-linha lp-bt-g", onClick: aoEntrar }, "Já tenho acesso")),
          h("p", { className: "lp-mudo" }, "Funciona no computador e no celular. Sem instalar nada. ",
            h("a", { href: "#eu-quero", onClick: e => { e.preventDefault(); irInfo(); } }, "Ainda não quer testar? Peça mais informações."))),
        h("div", { className: "lp-hero-img", "aria-hidden": true },
          h("div", { className: "lp-tela" }, h("div", { className: "lp-tela-barra" }, h("i"), h("i"), h("i")), h("img", { src: "app/img/portal.webp", alt: "", width: 1200, height: 768 })),
          h("div", { className: "lp-cel" }, h("img", { src: "app/img/celular.webp", alt: "", width: 420, height: 883 })))),

      h("section", { className: "lp-fluxo", id: "recursos" },
        h("h2", null, "O caminho do serviço, do primeiro contato à fiscalização"),
        h("ol", { className: "lp-passos" }, PASSOS.map(([t, d]) => h("li", { key: t }, h("b", null, t), h("p", null, d))))),

      h("section", { className: "lp-bloco" },
        h("div", { className: "lp-bloco-t" },
          h("h2", null, "Contratos que não se perdem no WhatsApp"),
          h("p", null, "Cada pedido de contrato é um card no quadro: solicitado, em elaboração, proposta enviada, em negociação, ativo. Você arrasta o card de etapa e guarda nele a proposta, a minuta, a negociação e o contrato assinado."),
          h("ul", null, h("li", null, "Valor mensal de cada etapa do funil"), h("li", null, "Aviso de vigência perto do fim e de proposta vencendo"), h("li", null, "Contrato ativo vira plano de PMOC com um clique"))),
        h("img", { className: "lp-print", src: "app/img/contratos.webp", alt: "Quadro de contratos com as etapas do funil", loading: "lazy", width: 1200, height: 750 })),

      h("section", { className: "lp-bloco lp-inv" },
        h("div", { className: "lp-bloco-t" },
          h("h2", null, "PMOC pronto para a fiscalização"),
          h("p", null, "O técnico aponta cada máquina no celular: checklist, medições, fotos e pendências. O sistema monta os documentos sozinho, com responsável técnico, ART e normas."),
          h("ul", null, h("li", null, "Livro do PMOC com a ficha de cada equipamento"), h("li", null, "Relatório mensal de acompanhamento e documento técnico do mês"),
            h("li", null, "Etiqueta QR na máquina abre o histórico dela"), h("li", null, "Equipamentos entram por planilha, sem digitar um por um"))),
        h("img", { className: "lp-print lp-doc", src: "app/img/relatorio.webp", alt: "Relatório mensal de acompanhamento do PMOC", loading: "lazy", width: 820, height: 834 })),

      h("section", { className: "lp-bloco" },
        h("div", { className: "lp-bloco-t" },
          h("h2", null, "Seu cliente acompanha sem precisar ligar"),
          h("p", null, "Síndico, gerente predial ou administrador recebe um acesso próprio. Quem cuida de vários prédios vê todos juntos; quem cuida de um vê só o dele."),
          h("ul", null, h("li", null, "Documentos do PMOC para baixar a qualquer hora"), h("li", null, "Pendências abertas com a máquina e o material necessário"), h("li", null, "Solicitações que caem direto na lista de tarefas da sua equipe"))),
        h("img", { className: "lp-print lp-celimg", src: "app/img/celular.webp", alt: "Área do cliente no celular", loading: "lazy", width: 420, height: 883 })),

      h("section", { className: "lp-pedir", ref: formRef, id: "pedir" },
        h("div", { className: "lp-pedir-t" },
          h("h2", null, "Peça seu acesso"),
          h("p", null, "Estamos liberando o sistema aos poucos, para acompanhar de perto cada empresa que entra."),
          h("ol", { className: "lp-como" },
            h("li", null, h("b", null, "Você envia os dados"), " da empresa neste formulário."),
            h("li", null, h("b", null, "Nós conferimos e liberamos."), " Chega um e-mail com o link e a senha provisória."),
            h("li", null, h("b", null, "No primeiro acesso"), " você cria a sua senha, cadastra clientes e convida a equipe."))),
        h(Pedido)),

      h("section", { className: "lp-pedir lp-info", ref: infoRef, id: "eu-quero" },
        h("div", { className: "lp-pedir-t" },
          h("h2", null, "Eu quero saber mais"),
          h("p", null, "Ainda não é hora de testar? Deixe seu contato e enviamos as informações do SGClim: o que ele faz, como funciona e quanto custa."),
          h("p", { className: "lp-mudo" }, "Sem compromisso e sem criar acesso.")),
        h(EuQuero)),

      h("footer", { className: "lp-pe" },
        h("div", null, h("b", null, "SGClim · uma solução Xclim"), h("span", null, "Konstante Manutenção e Serviços LTDA-ME · CNPJ 59.655.135/0001-38 · São Paulo/SP")),
        h("div", null, h("a", { href: "indique/" }, "Indique e ganhe"), h("a", { href: "legal/termos.html", target: "_blank", rel: "noopener" }, "Termos de Uso"), h("a", { href: "legal/privacidade.html", target: "_blank", rel: "noopener" }, "Privacidade"),
          h("button", { type: "button", onClick: aoEntrar }, "Entrar no sistema"))));
  }

  (function css() {
    if (document.getElementById("k-css-lp")) return;
    const f = document.createElement("link"); f.rel = "stylesheet"; f.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"; document.head.appendChild(f);
    const s = document.createElement("style"); s.id = "k-css-lp";
    s.textContent = [
      ".lp{--azul:#043dac;--vivo:#1f71ff;--tinta:#0f1b33;--papel:#f5f7fb;--ok:#0b7d5c;--cinza:#5b6578;background:#fff;color:var(--tinta);font-family:'Space Grotesk','Segoe UI',Arial,sans-serif;position:fixed;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}",
      ".lp *{box-sizing:border-box}.lp a{color:var(--azul)}.lp :focus-visible{outline:3px solid var(--vivo);outline-offset:2px}",
      ".lp-nav{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:12px clamp(16px,4vw,48px);background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid #e6eaf2}",
      ".lp-logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--tinta)!important;font-weight:700;font-size:18px}.lp-logo small{display:block;font-size:11px;font-weight:500;color:var(--cinza)}.lp-simb{width:30px;height:30px;color:var(--azul);display:inline-flex}",
      ".lp-nav-d{display:flex;align-items:center;gap:10px}.lp-nav-d a{text-decoration:none;color:var(--tinta);font-weight:500;margin-right:8px}",
      ".lp-bt{font:inherit;font-weight:600;border-radius:10px;padding:9px 16px;cursor:pointer;border:2px solid var(--azul);font-size:14px;transition:background .15s}",
      ".lp-bt-cheio{background:var(--azul);color:#fff}.lp-bt-cheio:hover{background:#032f86}.lp-bt-cheio:disabled{opacity:.6}.lp-bt-linha{background:#fff;color:var(--azul)}.lp-bt-linha:hover{background:#eef3ff}.lp-bt-g{padding:13px 24px;font-size:16px}",
      ".lp-hero{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:clamp(24px,4vw,64px);align-items:center;padding:clamp(40px,7vw,96px) clamp(16px,4vw,48px) clamp(48px,7vw,104px);max-width:1320px;margin:0 auto}",
      ".lp-hero h1{font-size:clamp(34px,4.6vw,60px);line-height:1.04;letter-spacing:-1.5px;margin:0 0 20px;font-weight:700;color:var(--tinta)}",
      ".lp-hero p{font-size:clamp(16px,1.35vw,19px);line-height:1.55;color:#33405a;margin:0 0 26px;max-width:34em}.lp-hero-bts{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}.lp-mudo{font-size:14px!important;color:var(--cinza)!important}",
      ".lp-hero-img{position:relative;padding-bottom:40px}.lp-tela{border-radius:14px;overflow:hidden;box-shadow:0 30px 60px -20px rgba(4,61,172,.35),0 0 0 1px #dfe5f0;background:#fff;transform:perspective(1600px) rotateY(-6deg)}",
      ".lp-tela-barra{height:26px;background:#eef1f6;display:flex;gap:6px;align-items:center;padding:0 12px}.lp-tela-barra i{width:9px;height:9px;border-radius:50%;background:#cfd6e2}.lp-tela img{display:block;width:100%;height:auto}",
      ".lp-cel{position:absolute;right:-8px;bottom:0;width:27%;border-radius:22px;overflow:hidden;border:6px solid var(--tinta);box-shadow:0 20px 40px -12px rgba(15,27,51,.5);background:#fff;aspect-ratio:9/17}.lp-cel img{display:block;width:100%;height:auto}",
      ".lp-fluxo{background:var(--tinta);color:#fff;padding:clamp(48px,6vw,80px) clamp(16px,4vw,48px)}.lp-fluxo h2{max-width:1320px;margin:0 auto 32px;font-size:clamp(24px,2.6vw,34px);letter-spacing:-.5px}",
      ".lp-passos{list-style:none;counter-reset:p;display:grid;grid-template-columns:repeat(6,1fr);gap:0;max-width:1320px;margin:0 auto;padding:0}",
      ".lp-passos li{counter-increment:p;padding:18px 18px 0 0;border-top:2px solid #2b3b5e;position:relative}.lp-passos li::before{content:counter(p);position:absolute;top:-15px;left:0;width:28px;height:28px;border-radius:50%;background:var(--vivo);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}",
      ".lp-passos b{display:block;font-size:17px;margin:14px 0 6px}.lp-passos p{margin:0;color:#b8c3d9;font-size:14px;line-height:1.5}",
      ".lp-bloco{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(24px,5vw,72px);align-items:center;max-width:1320px;margin:0 auto;padding:clamp(48px,7vw,96px) clamp(16px,4vw,48px)}",
      ".lp-inv .lp-bloco-t{order:2}.lp-bloco h2{font-size:clamp(26px,2.8vw,38px);line-height:1.1;letter-spacing:-.6px;margin:0 0 14px}.lp-bloco p{font-size:17px;line-height:1.6;color:#33405a;margin:0 0 16px;max-width:32em}",
      ".lp-bloco ul{margin:0;padding:0;list-style:none}.lp-bloco li{padding:7px 0 7px 26px;position:relative;font-size:15.5px;color:var(--tinta)}.lp-bloco li::before{content:'✓';position:absolute;left:0;color:var(--ok);font-weight:700}",
      ".lp-print{width:100%;height:auto;border-radius:12px;box-shadow:0 24px 50px -24px rgba(15,27,51,.35),0 0 0 1px #e1e6ef}.lp-doc{max-width:560px;justify-self:center}.lp-celimg{max-width:300px;justify-self:center;border-radius:26px;border:7px solid var(--tinta)}",
      ".lp-inv{background:var(--papel);max-width:none;padding-left:max(clamp(16px,4vw,48px),calc((100vw - 1320px)/2 + 48px));padding-right:max(clamp(16px,4vw,48px),calc((100vw - 1320px)/2 + 48px))}",
      ".lp-pedir{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,6fr);gap:clamp(24px,5vw,72px);max-width:1320px;margin:0 auto;padding:clamp(48px,7vw,96px) clamp(16px,4vw,48px);scroll-margin-top:70px}",
      ".lp-pedir h2{font-size:clamp(28px,3vw,42px);letter-spacing:-.8px;margin:0 0 12px}.lp-pedir-t p{font-size:17px;color:#33405a;line-height:1.55}",
      ".lp-como{margin:22px 0 0;padding-left:20px}.lp-como li{margin-bottom:12px;font-size:15.5px;line-height:1.5;color:#33405a}.lp-como b{color:var(--tinta)}",
      ".lp-form{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;background:var(--papel);border-radius:16px;padding:clamp(18px,3vw,32px);border:1px solid #e1e6ef;align-self:start}",
      ".lp-campo{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600}.lp-campo input,.lp-campo select,.lp-campo textarea{font:inherit;font-weight:400;font-size:15px;border:1.5px solid #cfd6e2;border-radius:9px;padding:11px 12px;background:#fff;color:var(--tinta);width:100%}",
      ".lp-campo input:focus,.lp-campo select:focus,.lp-campo textarea:focus{border-color:var(--vivo);outline:none;box-shadow:0 0 0 3px rgba(31,113,255,.18)}.lp-largo{grid-column:1 / -1}",
      ".lp-aceite{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:#33405a}.lp-aceite input{width:18px;height:18px;margin-top:2px;accent-color:var(--azul)}",
      ".lp-mel{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}.lp-erro{background:#fdecec;color:#a01c1c;border-radius:8px;padding:10px 12px;font-size:14px}.lp-form .lp-bt{padding:14px;font-size:16px}",
      ".lp-ok{background:#ecf8f2;border:1px solid #bfe5d2;border-radius:16px;padding:32px;align-self:start}.lp-ok h3{font-size:26px;margin:10px 0 8px}.lp-ok p{font-size:16px;line-height:1.55;color:#33405a}",
      ".lp-ok-i{width:46px;height:46px;border-radius:50%;background:var(--ok);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center}",
      ".lp-pe{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:28px clamp(16px,4vw,48px);border-top:1px solid #e6eaf2;font-size:13px;color:var(--cinza)}",
      ".lp-pe div{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.lp-pe b{color:var(--tinta)}.lp-pe button{font:inherit;background:none;border:0;color:var(--azul);cursor:pointer;padding:0}",
      ".lp-info{background:var(--papel);max-width:none;padding-left:max(clamp(16px,4vw,48px),calc((100vw - 1320px)/2 + 48px));padding-right:max(clamp(16px,4vw,48px),calc((100vw - 1320px)/2 + 48px))}.lp-info .lp-form{background:#fff}",
      "@media (max-width:980px){.lp-hero,.lp-bloco,.lp-pedir{grid-template-columns:1fr}.lp-inv .lp-bloco-t{order:0}.lp-passos{grid-template-columns:repeat(3,1fr);row-gap:34px}.lp-tela{transform:none}}",
      "@media (max-width:600px){.lp-nav-d a{display:none}.lp-nav-d .lp-bt-linha{padding:8px 12px}.lp-passos{grid-template-columns:1fr 1fr}.lp-form{grid-template-columns:1fr}.lp-cel{width:34%}.lp-logo small{display:none}}",
      "@media (prefers-reduced-motion:reduce){.lp *{scroll-behavior:auto!important;transition:none!important}}",
    ].join("\n");
    document.head.appendChild(s);
  })();

  K.Landing = Landing;
})();
