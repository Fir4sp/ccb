/* =====================================================================
   KONSTANTE SaaS — app/entrada.js
   Telas de acesso usadas pelo sistema das empresas e pelo console:
   entrar, criar senha no 1º acesso e trocar a senha.
   ===================================================================== */
(function () {
  "use strict";
  const { h, api, Campo, Texto, Senha, Aviso } = K;
  const { useState } = React;

  /* v1.29.0: símbolo do SGClim (ícone do app) */
  const Simbolo = () => h("img", { src: "/app/icone-192.png", alt: "", "aria-hidden": true, style: { width: "100%", height: "100%", borderRadius: "22%", display: "block", objectFit: "cover" } });

  function LadoMarca({ titulo, texto }) {
    return h("div", { className: "entrada-lado" },
      h("div", { className: "entrada-marca" }, h("span", { style: { width: 30, height: 30, display: "inline-flex", flex: "none" } }, h(Simbolo)), "Sistema CCB"),
      h("div", null, h("h1", null, titulo), texto ? h("p", null, texto) : null),
      h("div", { className: "entrada-grade" }));
  }

  /* ---------------- entrada ---------------- */

  function Entrada({ aoEntrar, titulo, texto, sub, semLembrar }) {
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [lembrar, setLembrar] = useState(true);
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);

    async function entrar(e) {
      e.preventDefault();
      setErro("");
      if (!email.trim() || !senha) { setErro("Informe seu e-mail e sua senha."); return; }
      setEnviando(true);
      try { aoEntrar(await api("auth.login", { email: email.trim(), senha, lembrar })); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }

    return h("div", { className: "entrada" },
      h(LadoMarca, { titulo: titulo || "Manutenção e limpeza das Casas de Oração.", texto: texto === undefined ? "Do chamado da casa até a OS assinada em campo." : texto }),
      h("form", { className: "entrada-form", onSubmit: entrar, noValidate: true },
        h("h2", null, "Entrar"),
        h("p", { className: "sub" }, sub || "Use o e-mail cadastrado pela sua empresa."),
        h(Aviso, null, erro),
        h(Campo, { rotulo: "E-mail" }, h(Texto, { valor: email, aoMudar: setEmail, type: "email", autoComplete: "username", autoFocus: true, inputMode: "email" })),
        h(Campo, { rotulo: "Senha" }, h(Senha, { valor: senha, aoMudar: setSenha })),
        semLembrar ? h("div", { style: { height: 8 } }) : h("label", { className: "check" }, h("input", { type: "checkbox", checked: lembrar, onChange: e => setLembrar(e.target.checked) }), "Manter conectado neste aparelho"),
        h("button", { className: "bt bt-marca bt-cheio", disabled: enviando }, enviando ? "Entrando…" : "Entrar"),
        sub ? null : h("p", { className: "sub", style: { marginTop: 20, fontSize: 13 } }, "Esqueceu a senha? Peça ao administrador da sua empresa para definir uma nova.")));
  }

  /* ---------------- troca de senha ---------------- */

  function FormTrocaSenha({ aoConcluir, aoCancelar, obrigatoria, minimo }) {
    const [atual, setAtual] = useState("");
    const [nova, setNova] = useState("");
    const [conf, setConf] = useState("");
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);

    async function salvar(e) {
      if (e) e.preventDefault();
      setErro("");
      const min = minimo || 8;
      if (!K.senhaBoa(nova) || nova.length < min) { setErro("A nova senha precisa ter pelo menos " + min + " caracteres, com letras e números."); return; }
      if (nova !== conf) { setErro("A confirmação não é igual à nova senha."); return; }
      setEnviando(true);
      try { await api("auth.trocar_senha", { atual, nova }); K.avisar("Senha alterada."); aoConcluir(); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }

    return h("form", { onSubmit: salvar, noValidate: true },
      h(Aviso, null, erro),
      h(Campo, { rotulo: obrigatoria ? "Senha temporária (a que você recebeu)" : "Senha atual" }, h(Senha, { valor: atual, aoMudar: setAtual, autoFocus: true })),
      h(Campo, { rotulo: "Nova senha", dica: "Pelo menos " + (minimo || 8) + " caracteres, com letras e números." }, h(Senha, { valor: nova, aoMudar: setNova, autoComplete: "new-password" })),
      h(Campo, { rotulo: "Repita a nova senha" }, h(Senha, { valor: conf, aoMudar: setConf, autoComplete: "new-password" })),
      h("div", { style: { display: "flex", gap: 8, marginTop: 8 } },
        aoCancelar ? h("button", { type: "button", className: "bt", onClick: aoCancelar }, "Cancelar") : null,
        h("button", { className: "bt bt-marca" + (obrigatoria ? " bt-cheio" : ""), disabled: enviando }, enviando ? "Salvando…" : "Salvar nova senha")));
  }

  function TrocaObrigatoria({ sessao, aoConcluir, aoSair, minimo }) {
    return h("div", { className: "entrada" },
      h(LadoMarca, { titulo: "Crie a sua senha.", texto: "Por segurança, a senha que você recebeu vale só para o primeiro acesso." }),
      h("div", { className: "entrada-form" },
        h("h2", null, "Olá, " + sessao.usuario.nome.split(" ")[0]),
        h("p", { className: "sub" }, "Defina uma senha só sua para continuar."),
        h(FormTrocaSenha, { obrigatoria: true, aoConcluir, minimo }),
        h("button", { className: "bt bt-leve", style: { marginTop: 16, alignSelf: "flex-start" }, onClick: aoSair }, "Sair")));
  }

  /* v1.14.0: aceite dos Termos de Uso e da Política de Privacidade (no 1º acesso e a cada versão nova) */
  function AceiteTermos({ sessao, aoAceitar, aoSair }) {
    const [ok, setOk] = useState(false);
    const [erro, setErro] = useState("");
    const [enviando, setEnviando] = useState(false);
    async function aceitar() {
      setErro(""); setEnviando(true);
      try { aoAceitar(await K.api("auth.aceitar_termos", { aceito: true })); }
      catch (x) { setErro(x.message); setEnviando(false); }
    }
    return h("div", { className: "entrada" },
      h(LadoMarca, { titulo: "Termos e privacidade.", texto: "Antes de continuar, leia como a plataforma funciona e como cuidamos dos dados." }),
      h("div", { className: "entrada-form" },
        h("h2", null, "Olá, " + sessao.usuario.nome.split(" ")[0]),
        h("p", { className: "sub" }, sessao.termosVersao ? "Versão de " + String(sessao.termosVersao).split("-").reverse().join("/") + "." : ""),
        h("div", { className: "termos-links" },
          h("a", { className: "bt", href: "legal/termos.html", target: "_blank", rel: "noopener" }, "Ler os Termos de Uso"),
          h("a", { className: "bt", href: "legal/privacidade.html", target: "_blank", rel: "noopener" }, "Ler a Política de Privacidade")),
        h("label", { className: "check termos-check" }, h("input", { type: "checkbox", checked: ok, onChange: e => setOk(e.target.checked) }),
          h("span", null, "Li e concordo com os Termos de Uso e com a Política de Privacidade.")),
        h(K.Aviso, null, erro),
        h("button", { className: "bt bt-marca", disabled: !ok || enviando, onClick: aceitar, style: { width: "100%" } }, enviando ? "Registrando…" : "Aceitar e continuar"),
        h("button", { className: "bt bt-leve", style: { marginTop: 16, alignSelf: "flex-start" }, onClick: aoSair }, "Sair")));
  }

  K.AceiteTermos = AceiteTermos;
  K.Simbolo = Simbolo;
  K.Entrada = Entrada;
  K.FormTrocaSenha = FormTrocaSenha;
  K.TrocaObrigatoria = TrocaObrigatoria;
})();
