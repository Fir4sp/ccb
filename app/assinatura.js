/* =====================================================================
   SGClim — app/assinatura.js  (v1.30.0)
   Empresa › Assinatura: situação, escolha do plano, assinar, alterar,
   cancelar e faturas (pagas no Asaas).
   v1.33.0: cobrança mensal só por Pix — QR Code e copia e cola na tela.
   K.AvisoAssinatura: faixa no topo (teste acabando, fatura vencida,
   modo de consulta).
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Aviso, Painel } = K;
  const { useState, useEffect } = React;

  const BRL = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dia = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—";
  const NOMES_MOD = [["os", "Ordens de serviço e app do técnico"], ["tarefas", "Agenda e tarefas"], ["pmoc", "PMOC completo, equipamentos e portal do cliente"],
                     ["contratos", "Contratos recorrentes"], ["erp", "Financeiro: contas a pagar e a receber"],
                     ["erp_avancado", "DRE, fluxo de caixa, rentabilidade e conciliação bancária"], ["assistente", "Assistente de IA"]];
  const FASE = {
    teste: ["Teste grátis", "selo-info"], teste_fim: ["Teste encerrado", "selo-off"], ativa: ["Ativa", "selo-ok"],
    cortesia: ["Sem cobrança (combinado)", "selo-info"], cortesia_fim: ["Período combinado encerrado", "selo-off"],
    atrasada: ["Pagamento em atraso", "selo-aviso"], bloqueada: ["Modo de consulta", "selo-off"], cancelada: ["Cancelada", "selo-aviso"],
    encerrada: ["Encerrada", "selo-off"], isenta: ["Isenta", "selo-ok"], livre: ["Liberada", "selo-ok"],
  };
  const faltam = n => n === 0 ? "termina hoje" : n === 1 ? "falta 1 dia" : "faltam " + n + " dias";
  const mascaraDoc = v => {
    const d = String(v || "").replace(/\D/g, "").slice(0, 14);
    if (d.length <= 11) return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  };

  /* ---------------- faixa no topo do sistema ---------------- */

  /* a tela Assinatura avisa quando a situação muda (assinou, pagou…) e a faixa se atualiza sem recarregar */
  function publicar(r) {
    const e = r && r.estado;
    if (!e) return;
    const resumo = { fase: e.fase, leitura: e.leitura, plano: e.plano ? e.plano.nome : null, diasTeste: e.diasTeste, testeAte: e.testeAte,
      atrasoDias: e.atrasoDias, diasParaBloqueio: e.diasParaBloqueio, vencidaDesde: e.vencidaDesde, pagoAte: e.pagoAte,
      temAssinatura: e.temAssinatura, link: e.aberta ? e.aberta.link : null };
    try { window.dispatchEvent(new CustomEvent("k-assinatura", { detail: resumo })); } catch (x) {}
  }

  function AvisoAssinatura({ sessao, ir }) {
    const [novo, setNovo] = useState(null);
    useEffect(() => { const f = ev => setNovo(ev.detail); window.addEventListener("k-assinatura", f); return () => window.removeEventListener("k-assinatura", f); }, []);
    const a = novo || sessao.assinatura;
    if (!a || !a.fase) return null;
    const admin = K.temPerfil(sessao, "admin");
    const ver = admin ? h("button", { type: "button", className: "bt bt-p", onClick: () => ir("assinatura") }, "Ver assinatura") : null;
    const pagar = admin && a.link ? h("a", { className: "bt bt-p bt-marca", href: a.link, target: "_blank", rel: "noopener" }, "Pagar fatura") : null;
    let tipo = "", txt = "", acoes = [];
    if (a.fase === "teste" && admin) {
      tipo = a.diasTeste <= 3 ? "aviso" : "info";
      txt = "Teste grátis do SGClim: " + faltam(a.diasTeste) + " (até " + dia(a.testeAte) + "). Assine para continuar usando sem interrupção.";
      acoes = [h("button", { key: "a", type: "button", className: "bt bt-p bt-marca", onClick: () => ir("assinatura") }, "Assinar")];
    } else if (a.fase === "cortesia" && admin && a.diasTeste <= 15) {   /* v1.31.0: aviso só nos últimos 15 dias */
      tipo = "info";
      txt = "O período sem cobrança combinado com a sua empresa termina em " + dia(a.testeAte) + " (" + faltam(a.diasTeste) + "). Assine para continuar sem interrupção — a 1ª fatura só vence depois dessa data.";
      acoes = [h("button", { key: "a", type: "button", className: "bt bt-p bt-marca", onClick: () => ir("assinatura") }, "Assinar")];
    } else if (a.fase === "cortesia_fim") {
      tipo = "erro";
      txt = "O período sem cobrança terminou. O sistema está em modo de consulta: dá para ver tudo, mas não alterar." + (admin ? "" : " Fale com o administrador da empresa.");
      acoes = admin ? [h("button", { key: "a", type: "button", className: "bt bt-p bt-marca", onClick: () => ir("assinatura") }, "Assinar agora")] : [];
    } else if (a.fase === "teste_fim") {
      tipo = "erro";
      txt = "O teste grátis terminou. O sistema está em modo de consulta: dá para ver tudo, mas não alterar." + (admin ? "" : " Fale com o administrador da empresa.");
      acoes = admin ? [h("button", { key: "a", type: "button", className: "bt bt-p bt-marca", onClick: () => ir("assinatura") }, "Assinar agora")] : [];
    } else if (a.fase === "atrasada" && admin) {
      tipo = "aviso";
      txt = "A fatura da assinatura venceu em " + dia(a.vencidaDesde) + ". " + (a.diasParaBloqueio > 0
        ? "Se não for paga em " + a.diasParaBloqueio + " dia" + (a.diasParaBloqueio > 1 ? "s" : "") + ", o sistema fica só em modo de consulta."
        : "O sistema entra em modo de consulta hoje.");
      acoes = [pagar, ver];
    } else if (a.fase === "bloqueada") {
      tipo = "erro";
      txt = "Sistema em modo de consulta: a assinatura está com pagamento em atraso desde " + dia(a.vencidaDesde) + "." +
        (admin ? " Assim que o pagamento for confirmado, tudo volta ao normal." : " Fale com o administrador da empresa.");
      acoes = admin ? [pagar, ver] : [];
    } else if (a.fase === "cancelada" && admin) {
      tipo = "info";
      txt = "A assinatura foi cancelada. O sistema funciona normalmente até " + dia(a.pagoAte) + "; depois fica em modo de consulta.";
      acoes = [h("button", { key: "a", type: "button", className: "bt bt-p", onClick: () => ir("assinatura") }, "Assinar de novo")];
    } else if (a.fase === "encerrada") {
      tipo = "erro";
      txt = "A assinatura foi encerrada. O sistema está em modo de consulta." + (admin ? "" : " Fale com o administrador da empresa.");
      acoes = admin ? [h("button", { key: "a", type: "button", className: "bt bt-p bt-marca", onClick: () => ir("assinatura") }, "Assinar")] : [];
    }
    if (!txt) return null;
    return h("div", { className: "as-faixa as-" + tipo, role: tipo === "erro" ? "alert" : "status" },
      h("span", null, txt), acoes.filter(Boolean).length ? h("div", { className: "as-faixa-bts" }, acoes.filter(Boolean).map((b, i) => React.cloneElement(b, { key: i }))) : null);
  }

  /* ---------------- tela Assinatura ---------------- */

  function Assinatura({ sessao }) {
    const [d, setD] = useState(null);
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [escolher, setEscolher] = useState(false);
    const [cancelando, setCancelando] = useState(false);
    const [modsAntes, setModsAntes] = useState(null);
    const [pix, setPix] = useState(null);   /* v1.33.0: id da fatura aberta no painel do Pix */   /* módulos ao abrir a tela: se mudarem, pede para recarregar */
    const chaveMods = r => ((r && r.estado && r.estado.modulos) || []).slice().sort().join(",");
    function atualizar(r) { setD(r); publicar(r); setModsAntes(m => m === null ? chaveMods(r) : m); }

    function carregar(sinc) {
      setOcupado(!!sinc);
      api("assinatura.estado", sinc ? { sincronizar: true } : {}).then(r => { atualizar(r); setErro(""); setOcupado(false); if (sinc) K.avisar("Situação atualizada."); },
        e => { setErro(e.message); setOcupado(false); });
    }
    useEffect(() => carregar(false), []);

    if (erro && !d) return h("div", { className: "bloco vazio" }, h(Aviso, null, erro), h("button", { className: "bt", onClick: () => carregar(false) }, "Tentar de novo"));
    if (!d) return h("div", { className: "bloco vazio" }, "Carregando…");
    const e = d.estado;
    if (e.fase === "isenta" || e.fase === "livre")
      return h("div", { className: "bloco vazio" }, h("strong", null, "Assinatura isenta"), "Esta empresa não tem cobrança. Todos os recursos liberados na plataforma estão disponíveis.");

    const temAssin = e.temAssinatura;
    const soPix = !d.regras || d.regras.formaPagamento !== "UNDEFINED";   /* v1.33.0 */
    const anualOk = !!(d.regras && d.regras.permiteAnual);
    const fase = FASE[e.fase] || [e.fase, ""];
    const modsAgora = chaveMods(d);
    const mudouFase = (modsAntes !== null && modsAntes !== modsAgora) || (sessao.assinatura && !!sessao.assinatura.leitura !== !!e.leitura);
    const aberta = e.aberta;
    const linhas = [];
    const semCob = e.fase === "cortesia" || e.fase === "cortesia_fim";
    if (e.plano) linhas.push(["Plano", e.plano.nome + (e.fase === "teste" || e.fase === "teste_fim" ? " (no teste grátis)" : semCob ? " (sem cobrança)" : "")]);
    if (semCob) linhas.push(["Sem cobrança", "até " + dia(e.testeAte) + (e.fase === "cortesia" ? " · " + faltam(e.diasTeste) : "")]);
    if (d.promo && temAssin && !d.promo.encerrado) linhas.push(["Preço de lançamento", "nas " + d.promo.faturas + " primeiras faturas (" + Math.min(d.promo.pagas, d.promo.faturas) + " paga(s)); depois volta ao preço normal"]);
    if (d.vinculo && d.vinculo.cupom && temAssin) linhas.push(["Cupom", d.vinculo.cupom.codigo + " · " + d.vinculo.cupom.texto + (d.vinculo.cupom.encerrado ? " (já aplicado)" : "")]);
    if (temAssin && e.valor != null) linhas.push(["Valor", BRL(e.valor) + (e.ciclo === "anual" ? " por ano" : " por mês")]);
    linhas.push(["Usuários da equipe", d.usuariosAtivos + (e.limiteUsuarios != null ? " de " + e.limiteUsuarios : "")]);
    if (e.fase === "teste" || e.fase === "teste_fim") linhas.push(["Teste grátis", "até " + dia(e.testeAte) + (e.fase === "teste" ? " · " + faltam(e.diasTeste) : "")]);
    if (temAssin && e.diasTeste != null && e.fase === "ativa") linhas.push(["Teste grátis", "até " + dia(e.testeAte) + " (a 1ª fatura vence depois disso)"]);
    if (e.fase === "cancelada" || e.fase === "encerrada") linhas.push(["Uso liberado até", dia(e.pagoAte)]);
    if (aberta) linhas.push([e.atrasoDias > 0 ? "Fatura vencida" : "Próxima fatura", BRL(aberta.valor) + " · vence " + dia(aberta.vencimento) + (e.atrasoDias > 0 ? " · " + e.atrasoDias + " dia(s) de atraso" : "")]);

    return h("div", { className: "as-tela" },
      !d.cobrancaConfigurada ? h(Aviso, { tipo: "info" }, "A cobrança online ainda não foi ativada na plataforma. Por enquanto não dá para assinar por aqui; fale com o suporte.") : null,
      d.ambiente === "sandbox" && d.cobrancaConfigurada ? h(Aviso, { tipo: "info" }, "Cobrança em ambiente de TESTE (sandbox do Asaas): nenhuma fatura é cobrada de verdade.") : null,
      mudouFase ? h(Aviso, { tipo: "ok" }, h("span", null, "Os módulos ou o acesso da empresa mudaram. ", h("button", { type: "button", className: "bt bt-p", onClick: () => location.reload() }, "Recarregar o sistema"))) : null,

      h("div", { className: "bloco" },
        h("div", { className: "bloco-cab as-cab" },
          h("div", null, h("h2", null, "Situação"), h("p", null, e.leitura ? "Modo de consulta: dá para ver tudo, mas não alterar." : "Assinatura do SGClim para a sua empresa.")),
          h("span", { className: "selo " + fase[1] }, fase[0])),
        h("div", { className: "bloco-corpo" },
          h("dl", { className: "as-dados" }, linhas.map(([k, v]) => h(React.Fragment, { key: k }, h("dt", null, k), h("dd", null, v)))),
          h("div", { className: "as-bts" },
            aberta && soPix ? h("button", { type: "button", className: "bt bt-marca", onClick: () => setPix(aberta.id) }, e.atrasoDias > 0 ? "Pagar fatura vencida com Pix" : "Pagar com Pix") : null,
            aberta && aberta.link ? h("a", { className: "bt" + (soPix ? "" : " bt-marca"), href: aberta.link, target: "_blank", rel: "noopener" }, soPix ? "Abrir fatura" : e.atrasoDias > 0 ? "Pagar fatura vencida" : "Abrir fatura") : null,
            !temAssin ? h("button", { type: "button", className: "bt bt-marca", disabled: !d.cobrancaConfigurada, onClick: () => setEscolher(true) }, e.fase === "cancelada" || e.fase === "encerrada" ? "Assinar de novo" : "Assinar") : null,
            temAssin ? h("button", { type: "button", className: "bt", onClick: () => setEscolher(true) }, "Mudar plano ou usuários") : null,
            temAssin ? h("button", { type: "button", className: "bt", disabled: ocupado, onClick: () => carregar(true) }, ocupado ? "Conferindo…" : "Atualizar situação") : null,
            temAssin ? h("button", { type: "button", className: "bt bt-leve bt-perigo", onClick: () => setCancelando(true) }, "Cancelar assinatura") : null),
          aberta ? h("p", { className: "cel-sub", style: { margin: "12px 0 0" } }, soPix
            ? "Pagamento por Pix, todo mês. A fatura com o QR Code também chega por e-mail em " + (d.dadosCobranca.email || "seu e-mail") + ". O Pix libera na hora."
            : "Na fatura você escolhe pagar por Pix, boleto ou cartão. Ela também chega por e-mail em " + (d.dadosCobranca.email || "seu e-mail") + ". Pagamentos por Pix e cartão liberam na hora; boleto leva até 3 dias úteis.") : null)),

      h(Planos, { planos: d.planos, atual: temAssin ? e.plano : null, ciclo: e.ciclo, semPromo: !!d.promo, anualOk, soPix }),

      d.cobrancas.length ? h("div", { className: "bloco" },
        h("div", { className: "bloco-cab" }, h("h2", null, "Faturas")),
        h("div", { className: "bloco-corpo", style: { paddingTop: 12 } }, h("div", { className: "tabela-caixa" }, h("table", { className: "tabela" },
          h("thead", null, h("tr", null, h("th", null, "Vencimento"), h("th", { className: "num" }, "Valor"), h("th", null, "Situação"), h("th", null, "Pago em"), h("th", { className: "acoes" }))),
          h("tbody", null, d.cobrancas.map(c => h("tr", { key: c.id },
            h("td", null, dia(c.vencimento)), h("td", { className: "num" }, BRL(c.valor)),
            h("td", null, h("span", { className: "selo " + (c.pago ? "selo-ok" : c.aberta ? (c.vencimento < new Date().toISOString().slice(0, 10) ? "selo-off" : "selo-aviso") : "") }, c.statusTxt)),
            h("td", null, c.pagoEm ? dia(c.pagoEm) + (c.forma ? " · " + c.forma : "") : "—"),
            h("td", { className: "acoes" }, c.aberta && soPix ? h("button", { type: "button", className: "bt bt-p", onClick: () => setPix(c.id) }, "Pix") : null,
              c.link ? h("a", { className: "bt bt-p bt-leve", href: c.link, target: "_blank", rel: "noopener" }, c.pago ? "Recibo" : "Abrir") : null)))))))) : null,

      pix ? h(PagarPix, { cobrancaId: pix, aoFechar: () => setPix(null), aoPago: () => { setPix(null); carregar(true); } }) : null,

      escolher ? h(FormAssinar, { d, anualOk, soPix, aoFechar: () => setEscolher(false), aoConcluir: r => { atualizar(r); setEscolher(false); } }) : null,
      cancelando ? h(FormCancelar, { d, aoFechar: () => setCancelando(false), aoConcluir: r => { atualizar(r); setCancelando(false); } }) : null);
  }

  /* vitrine dos planos (só leitura) */
  function Planos({ planos, atual, semPromo, anualOk, soPix }) {
    return h("div", { className: "bloco" },
      h("div", { className: "bloco-cab" }, h("h2", null, "Planos"), h("p", null, (anualOk ? "No anual você paga 10 meses e usa 12. " : soPix ? "Cobrança mensal por Pix, sem fidelidade. " : "") + "Todos os planos incluem o CRM (clientes, chamados, orçamentos e proposta por WhatsApp).")),
      h("div", { className: "bloco-corpo as-planos" }, planos.map(p => h(CartaoPlano, { key: p.id, p, anualOk, atual: atual && atual.id === p.id, semPromo }))));
  }

  /* v1.38.0: itens do cartão — os escritos no Console › Planos; sem eles, a lista automática pelos módulos */
  function itensPlano(p) {
    if (p.itens && p.itens.length) return p.itens;
    return ["Até " + p.usuariosInclusos + " usuários da equipe", "CRM: clientes, chamados e orçamentos"].concat(NOMES_MOD.filter(([k]) => p.modulos.indexOf(k) >= 0).map(([, n]) => n));
  }
  K.itensPlano = itensPlano;

  function CartaoPlano({ p, atual, ciclo, escolhido, aoEscolher, semPromo, anualOk }) {
    const anual = ciclo === "anual";
    const pr = !semPromo && p.promo;   /* v1.32.0: preço de lançamento */
    return h(aoEscolher ? "button" : "div", Object.assign({ className: "as-plano" + (escolhido ? " as-sel" : "") + (atual ? " atual" : "") },
        aoEscolher ? { type: "button", onClick: aoEscolher, "aria-pressed": !!escolhido } : {}),
      h("div", { className: "as-plano-cab" }, h("b", null, p.nome), atual ? h("span", { className: "selo selo-ok selo-plain" }, "Seu plano") : null),
      pr ? h("div", { className: "as-promo-tag" }, "Preço de lançamento") : null,
      pr ? h("div", { className: "as-de" }, h("s", null, "de " + BRL(anual ? p.precoAnual : p.precoMensal)), " por") : null,
      h("div", { className: "as-preco" }, BRL(pr ? (anual ? pr.precoAnual : pr.precoMensal) : (anual ? p.precoAnual : p.precoMensal)), h("small", null, anual ? "/ano" : "/mês")),
      pr ? h("div", { className: "cel-sub" }, (anual ? "no 1º ano" : "nos " + pr.meses + " primeiros meses") + "; depois " + BRL(anual ? p.precoAnual : p.precoMensal) + (anual ? "/ano" : "/mês") + (pr.ate ? " · assinando até " + dia(pr.ate) : ""))
      : anual ? h("div", { className: "cel-sub" }, "equivale a " + BRL(p.precoAnual / 12) + " por mês") : anualOk ? h("div", { className: "cel-sub" }, "ou " + BRL(p.precoAnual) + " no anual") : null,
      p.descricao ? h("p", { className: "as-desc" }, p.descricao) : null,
      h("ul", { className: "as-itens" }, itensPlano(p).map((t, i) => h("li", { key: i }, t))),
      h("div", { className: "cel-sub" }, "Usuário extra: " + BRL(p.precoUsuarioExtra) + "/mês"));
  }

  function FormAssinar({ d, anualOk, soPix, aoFechar, aoConcluir }) {
    const e = d.estado;
    const temAssin = e.temAssinatura;
    const [planoId, setPlanoId] = useState((e.plano && d.planos.some(p => p.id === e.plano.id) ? e.plano.id : (d.planos[d.planos.length - 1] || {}).id) || null);
    const [ciclo, setCiclo] = useState(anualOk ? e.ciclo || "mensal" : "mensal");   /* v1.33.0: só mensal */
    const plano = d.planos.find(p => p.id === planoId) || d.planos[0];
    const minimo = plano ? Math.max(0, d.usuariosAtivos - plano.usuariosInclusos) : 0;
    const [extras, setExtras] = useState(Math.max(e.extras || 0, minimo));
    const [cob, setCob] = useState({ nome: d.dadosCobranca.nome || "", doc: mascaraDoc(d.dadosCobranca.doc), email: d.dadosCobranca.email || "", celular: d.dadosCobranca.celular || "" });
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    /* v1.31.0: código de indicação ou cupom */
    const vinc = d.vinculo || {};
    const [codigo, setCodigo] = useState(!temAssin && !vinc.indicado && !vinc.cupom && vinc.codigoInformado ? vinc.codigoInformado : "");
    const [conf, setConf] = useState(null);
    const [confErro, setConfErro] = useState("");
    useEffect(() => { if (extras < minimo) setExtras(minimo); }, [planoId]);   // eslint-disable-line
    useEffect(() => { if (codigo && !temAssin) conferir(); }, [planoId]);   // eslint-disable-line
    async function conferir() {
      setConf(null); setConfErro("");
      if (!codigo.trim()) return;
      try { setConf(await api("assinatura.codigo_conferir", { codigo, planoId })); } catch (x) { setConfErro(x.message); }
    }
    if (!plano) return null;
    const mensal = plano.precoMensal + extras * plano.precoUsuarioExtra;
    /* v1.32.0: preço de lançamento — na 1ª assinatura (plano com promoção) ou enquanto a empresa ainda está nela */
    const promoEmp = d.promo && !d.promo.encerrado;
    const prPlano = !d.promo ? plano.promo : promoEmp ? (plano.promo || plano.promoCadastro) : null;
    const normal = ciclo === "anual" ? mensal * plano.mesesAnual : mensal;
    const mensalPromo = prPlano ? prPlano.precoMensal + extras * plano.precoUsuarioExtra : null;
    const cheio = prPlano ? (ciclo === "anual" ? mensalPromo * plano.mesesAnual : mensalPromo) : normal;
    const cup = temAssin ? (vinc.cupom && !vinc.cupom.encerrado ? vinc.cupom : null) : (conf && conf.tipo === "cupom" ? { tipo: conf.cupomTipo, valor: conf.valor, texto: conf.texto } : null);
    const total = cup ? Math.max(5, cup.tipo === "valor" ? cheio - cup.valor : Math.round(cheio * (100 - cup.valor)) / 100) : cheio;
    const noTeste = e.testeAte && e.testeAte >= new Date().toISOString().slice(0, 10);

    async function salvar() {
      setErro(""); setSalvando(true);
      try {
        const r = temAssin ? await api("assinatura.alterar", { planoId: plano.id, ciclo, extras })
                           : await api("assinatura.assinar", Object.assign({ planoId: plano.id, ciclo, extras, codigo: confErro ? "" : codigo }, cob));
        K.avisar(temAssin ? "Plano alterado." : "Assinatura criada.");
        aoConcluir(r);
      } catch (x) { setErro(x.message); setSalvando(false); }
    }
    const m = k => v => setCob(Object.assign({}, cob, { [k]: k === "doc" ? mascaraDoc(v) : v }));
    return h(Painel, { titulo: temAssin ? "Mudar plano ou usuários" : "Assinar o SGClim", largo: true, aoFechar,
        rodape: [h("button", { key: "c", className: "bt", onClick: aoFechar }, "Voltar"),
                 h("button", { key: "s", className: "bt bt-marca", disabled: salvando, onClick: salvar }, salvando ? "Enviando…" : temAssin ? "Salvar alteração" : "Assinar por " + BRL(total) + (ciclo === "anual" ? "/ano" : "/mês"))] },
      h(Aviso, null, erro),
      anualOk ? h("div", { className: "as-ciclo", role: "radiogroup", "aria-label": "Forma de cobrança" },
        [["mensal", "Mensal"], ["anual", "Anual · paga 10, usa 12"]].map(([v, r]) => h("button", { key: v, type: "button", role: "radio", "aria-checked": ciclo === v, className: ciclo === v ? "ativo" : "", onClick: () => setCiclo(v) }, r))) : null,
      h("div", { className: "as-planos" }, d.planos.map(p => h(CartaoPlano, { key: p.id, p, ciclo, anualOk, semPromo: !!d.promo && !promoEmp, escolhido: p.id === plano.id, atual: temAssin && e.plano && e.plano.id === p.id, aoEscolher: () => setPlanoId(p.id) }))),
      h("div", { className: "as-extras" },
        h("div", null, h("b", null, "Usuários extras"), h("div", { className: "cel-sub" },
          plano.usuariosInclusos + " incluídos no plano · a equipe tem " + d.usuariosAtivos + " ativo(s) · " + BRL(plano.precoUsuarioExtra) + " por extra/mês" + (minimo ? " · mínimo " + minimo : ""))),
        h("div", { className: "as-passo" },
          h("button", { type: "button", className: "bt bt-p", disabled: extras <= minimo, onClick: () => setExtras(extras - 1), "aria-label": "Menos um usuário" }, "−"),
          h("span", { "aria-live": "polite" }, extras),
          h("button", { type: "button", className: "bt bt-p", onClick: () => setExtras(extras + 1), "aria-label": "Mais um usuário" }, "+"))),
      !temAssin ? h("div", { className: "as-codigo" },
        h(Campo, { rotulo: "Código de indicação ou cupom (opcional)" },
          h("div", { className: "as-codigo-linha" },
            h(Texto, { valor: codigo, aoMudar: v => { setCodigo(v.toUpperCase()); setConf(null); setConfErro(""); }, placeholder: "Ex.: FEIRA2026", autoComplete: "off" }),
            h("button", { type: "button", className: "bt", disabled: !codigo.trim(), onClick: conferir }, "Aplicar"))),
        conf ? h("div", { className: "aviso aviso-ok" }, conf.tipo === "cupom" ? "Cupom " + conf.codigo + ": " + conf.texto + "." : conf.texto) : null,
        confErro ? h("div", { className: "aviso aviso-erro" }, confErro, " O código será ignorado se você assinar assim.") : null) : null,
      /* v1.38.0: a conta aberta, linha a linha — sem desconto escondido */
      h("div", { className: "as-conta" },
        h("div", null, h("span", null, "Plano " + plano.nome), h("span", null, BRL(ciclo === "anual" ? plano.precoMensal * plano.mesesAnual : plano.precoMensal))),
        extras ? h("div", null, h("span", null, extras + " usuário(s) extra(s) × " + BRL(plano.precoUsuarioExtra)), h("span", null, BRL((ciclo === "anual" ? plano.mesesAnual : 1) * extras * plano.precoUsuarioExtra))) : null,
        prPlano ? h("div", null, h("span", null, "Preço de lançamento"), h("span", null, "− " + BRL(normal - cheio))) : null,
        cup ? h("div", null, h("span", null, "Cupom (" + cup.texto + ")"), h("span", null, "− " + BRL(cheio - total))) : null),
      h("div", { className: "as-total" }, h("span", null, "Total" + (cup ? " com cupom" : "")),
        h("b", null, cup ? h("s", { className: "as-cheio" }, BRL(cheio)) : null, BRL(total) + (ciclo === "anual" ? " por ano" : " por mês"))),
      cup ? h("p", { className: "cel-sub", style: { marginTop: -6 } }, "Desconto: " + cup.texto + ". Depois, o valor volta para " + BRL(cheio) + (ciclo === "anual" ? " por ano." : " por mês.")) : null,
      prPlano ? h("p", { className: "cel-sub", style: { marginTop: -6 } }, "Preço de lançamento " + (ciclo === "anual" ? "no 1º ano" : "nos " + prPlano.meses + " primeiros meses") + "; depois " + BRL(normal) + (ciclo === "anual" ? " por ano." : " por mês.")) : null,
      temAssin ? h("p", { className: "cel-sub" }, "O novo valor já vale para a fatura em aberto. Os módulos mudam na hora.")
      : h(React.Fragment, null,
          h("div", { className: "secao-titulo" }, "Dados para a fatura"),
          h("div", { className: "as-form" },
            h(Campo, { rotulo: "Nome ou razão social" }, h(Texto, { valor: cob.nome, aoMudar: m("nome") })),
            h(Campo, { rotulo: "CNPJ ou CPF" }, h(Texto, { valor: cob.doc, aoMudar: m("doc"), inputMode: "numeric" })),
            h(Campo, { rotulo: "E-mail que recebe as faturas" }, h(Texto, { valor: cob.email, aoMudar: m("email"), type: "email" })),
            h(Campo, { rotulo: "Celular (opcional)" }, h(Texto, { valor: cob.celular, aoMudar: m("celular"), inputMode: "tel" }))),
          h("p", { className: "cel-sub" }, noTeste ? "Nada é cobrado agora: a 1ª fatura vence no dia seguinte ao fim do " + (e.fase === "cortesia" ? "período sem cobrança" : "teste grátis") + " (" + dia(e.testeAte) + ")." : "A 1ª fatura vence hoje; o sistema já fica liberado e você tem alguns dias para pagar.",
            soPix ? " Pagamento mensal por Pix: todo mês chega a fatura com o QR Code por e-mail, e você também paga por aqui. Dá para cancelar quando quiser, sem multa."
                  : " Você paga por Pix, boleto ou cartão na própria fatura. Dá para cancelar quando quiser, sem multa.")));
  }

  /* v1.33.0: QR Code e Pix copia e cola da fatura */
  function PagarPix({ cobrancaId, aoFechar, aoPago }) {
    const [p, setP] = useState(null);
    const [erro, setErro] = useState("");
    const [copiado, setCopiado] = useState(false);
    useEffect(() => { api("assinatura.pix", { cobrancaId }).then(setP, x => setErro(x.message)); }, [cobrancaId]);
    function copiar() {
      try { navigator.clipboard.writeText(p.copiaECola).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2500); }); } catch (x) { K.avisar("Selecione o código e copie.", true); }
    }
    return h(Painel, { titulo: "Pagar com Pix", aoFechar,
        rodape: [h("button", { key: "f", className: "bt", onClick: aoFechar }, "Fechar"),
                 p ? h("button", { key: "j", className: "bt bt-marca", onClick: aoPago }, "Já paguei") : null] },
      h(Aviso, null, erro),
      !p && !erro ? h("div", { className: "bloco vazio" }, "Gerando o Pix…") : null,
      p ? h("div", { className: "as-pix" },
        h("div", { className: "as-pix-valor" }, h("small", null, "Valor"), h("b", null, BRL(p.valor)), h("small", null, "vence " + dia(p.vencimento))),
        p.imagem ? h("img", { className: "as-pix-qr", src: "data:image/png;base64," + p.imagem, alt: "QR Code do Pix da fatura de " + BRL(p.valor), width: 220, height: 220 }) : null,
        h("p", { className: "cel-sub" }, "Abra o app do banco, escolha Pix › Ler QR Code. No celular, use o copia e cola:"),
        h("textarea", { className: "as-pix-cod", readOnly: true, rows: 3, value: p.copiaECola, onFocus: ev => ev.target.select(), "aria-label": "Pix copia e cola" }),
        h("button", { type: "button", className: "bt bt-marca", onClick: copiar }, copiado ? "Copiado!" : "Copiar código Pix"),
        h("p", { className: "cel-sub" }, "A confirmação chega em segundos e o sistema se atualiza sozinho. Se não mudar, toque em “Já paguei”.")) : null);
  }

  function FormCancelar({ d, aoFechar, aoConcluir }) {
    const [motivo, setMotivo] = useState("");
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    async function cancelar() {
      setErro(""); setSalvando(true);
      try { const r = await api("assinatura.cancelar", { motivo }); K.avisar("Assinatura cancelada."); aoConcluir(r); }
      catch (x) { setErro(x.message); setSalvando(false); }
    }
    return h(Painel, { titulo: "Cancelar assinatura", aoFechar,
        rodape: [h("button", { key: "v", className: "bt", onClick: aoFechar }, "Voltar"),
                 h("button", { key: "c", className: "bt bt-perigo", disabled: salvando, onClick: cancelar }, salvando ? "Cancelando…" : "Confirmar cancelamento")] },
      h(Aviso, null, erro),
      h("p", null, "As próximas faturas deixam de ser geradas e a fatura em aberto é cancelada. A empresa continua usando normalmente até o fim do período já pago; depois o sistema fica em modo de consulta, com todos os dados guardados."),
      h(Campo, { rotulo: "Conte o motivo (opcional)", dica: "Ajuda a melhorar o SGClim." },
        h("textarea", { value: motivo, onChange: ev => setMotivo(ev.target.value), rows: 3, maxLength: 255 })));
  }

  K.AvisoAssinatura = AvisoAssinatura;
  K.modulos = K.modulos || {};
  K.modulos.assinatura = { titulo: "Assinatura", icone: "cartao", perfis: ["admin"], Tela: Assinatura };
})();
