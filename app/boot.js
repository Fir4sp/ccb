/* KONSTANTE SaaS — app/boot.js  ·  decide o que mostrar: carregando, entrada, troca de senha ou o app */
(function () {
  "use strict";
  const { h } = K;
  const { useState, useEffect } = React;

  /* v1.29.0: SGClim — a apresentação mora em conheca/ (sgclim.xclim.com.br/conheca/).
     Link antigo #/conhecer leva para lá. */
  const LANDING = "conheca/";
  if (location.hash === "#/conhecer") location.replace(LANDING);

  function Raiz() {
    const [sessao, setSessao] = useState(undefined);   // undefined = verificando
    const [erro, setErro] = useState("");
    useEffect(() => { if (sessao) { try { localStorage.setItem("k_entrou", "1"); } catch (e) {} } }, [sessao]);

    function verificar() {
      setErro("");
      K.api("auth.eu").then(setSessao, e => {
        if (e.codigo === "SEM_SESSAO") setSessao(null);
        else setErro(e.message);
      });
    }
    useEffect(() => { K.aoPerderSessao = () => setSessao(null); verificar(); }, []);
    useEffect(() => { K.aplicarTema(sessao ? sessao.empresa : null); }, [sessao]);
    /* v1.27.2: guarda no aparelho as OS abertas da pessoa (para trabalhar sem internet) — ao entrar e quando a internet volta */
    useEffect(() => {
      if (!sessao || sessao.trocarSenha || !K.OS || !K.OS.preBaixar) return;
      const ir = () => setTimeout(() => { K.OS.preBaixar(sessao); if (K.offline.preCarregar) setTimeout(() => K.offline.preCarregar(sessao), 8000); }, 4000);   /* v1.36.0: CRM/Financeiro para consulta sem internet */
      const t = ir();
      window.addEventListener("online", ir);
      return () => { clearTimeout(t); window.removeEventListener("online", ir); };
    }, [sessao]);

    async function sair() {
      const n = K.offline ? K.offline.pendentes() : 0;
      if (n && !(await K.confirmar({ titulo: n + " alteração(ões) ainda não enviada(s)", texto: "Estão guardadas neste aparelho e sobem quando houver internet com você conectado. Se sair agora, continuam guardadas e são enviadas quando você entrar de novo neste aparelho.", botao: "Sair mesmo assim" }))) return;
      try { await K.api("auth.logout"); } catch (e) {}
      location.hash = "";
      setSessao(null);
    }

    K.liberados = sessao && Array.isArray(sessao.modulos) ? sessao.modulos : null;   /* v1.19.0 */
    let tela;
    if (erro) tela = h("div", { className: "carregando" }, h("div", { style: { textAlign: "center" } },
      h("p", null, erro), h("button", { className: "bt", onClick: verificar }, "Tentar de novo")));
    else if (sessao === undefined) tela = h("div", { className: "carregando" }, "Carregando…");
    else if (sessao === null) tela = h(React.Fragment, null, h(K.Entrada, { aoEntrar: s => { if (location.hash === "#/entrar") history.replaceState(null, "", location.pathname + location.search); setSessao(s); } }),
      h("a", { href: LANDING, className: "entrada-conhecer" }, "Ainda não tem acesso? Conheça o SGClim"));
    else if (sessao.trocarSenha) tela = h(K.TrocaObrigatoria, { sessao, aoSair: sair, aoConcluir: () => setSessao(Object.assign({}, sessao, { trocarSenha: false })) });
    else if (sessao.termosPendentes && K.AceiteTermos) tela = h(K.AceiteTermos, { sessao, aoSair: sair, aoAceitar: setSessao });   /* v1.14.0 */
    else tela = h(K.App, { sessao, setSessao, aoSair: sair });

    return h(React.Fragment, null, tela, h(K.Avisos), h(K.Confirmacoes));
  }

  ReactDOM.createRoot(document.getElementById("raiz")).render(h(Raiz));
})();
