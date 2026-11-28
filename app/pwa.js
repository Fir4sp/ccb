/* KONSTANTE SaaS — app/pwa.js
   Registra o service worker e mostra o botão "Instalar app".
   - Android/Chrome/Edge/Samsung: usa a instalação nativa do navegador.
   - iPhone/iPad (Safari): mostra o passo a passo (Compartilhar › Adicionar à Tela de Início).
   - Não aparece se o app já estiver instalado ou se a pessoa dispensou (volta em 14 dias).
   - Fica em window.K_PWA.instalar() para um botão do menu usar no futuro. */
(function () {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      /* v1.27.3: confere versão nova ao abrir e sempre que o app volta para a tela (celular deixa o app aberto dias);
         quando a versão nova assume, recarrega uma vez — o rascunho automático guarda o que estava digitado */
      var tinha = !!navigator.serviceWorker.controller, recarregou = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (!tinha || recarregou) { tinha = true; return; }
        recarregou = true; location.reload();
      });
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
        reg.update().catch(function () {});
        document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") reg.update().catch(function () {}); });
      }).catch(function () {});
    });
  }

  var CHAVE = "ksaas_pwa_dispensado";
  var instalado = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  var ua = navigator.userAgent;
  var ehIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var ehSafari = ehIOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  var pedido = null;      // evento beforeinstallprompt guardado
  var chip = null;

  function dispensadoRecente() {
    try { var t = +localStorage.getItem(CHAVE); return t && (Date.now() - t) < 14 * 864e5; } catch (e) { return false; }
  }
  function dispensar() {
    try { localStorage.setItem(CHAVE, String(Date.now())); } catch (e) {}
    esconder();
  }

  var css =
    ".kpwa-chip{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:9000;" +
    "display:flex;align-items:center;gap:2px;background:#111;color:#fff;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.28);" +
    "font:600 14px/1 Archivo,system-ui,sans-serif;animation:kpwa-in .25s ease-out}" +
    ".kpwa-chip button{background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:12px 6px 12px 16px;display:flex;align-items:center;gap:8px}" +
    ".kpwa-chip .kpwa-x{padding:12px 14px 12px 8px;opacity:.6;font-size:16px}" +
    ".kpwa-chip svg{width:18px;height:18px}" +
    ".kpwa-fundo{position:fixed;inset:0;z-index:9001;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}" +
    ".kpwa-caixa{background:#fff;color:#111;width:100%;max-width:440px;border-radius:18px 18px 0 0;" +
    "padding:22px 22px calc(22px + env(safe-area-inset-bottom,0px));font:400 15px/1.5 Archivo,system-ui,sans-serif}" +
    ".kpwa-caixa h3{margin:0 0 12px;font-size:18px}.kpwa-caixa ol{margin:0 0 18px;padding-left:20px}.kpwa-caixa li{margin:6px 0}" +
    ".kpwa-caixa .kpwa-ok{width:100%;padding:13px;border:0;border-radius:10px;background:#111;color:#fff;font:600 15px Archivo,system-ui,sans-serif}" +
    "@keyframes kpwa-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}" +
    "@media print{.kpwa-chip,.kpwa-fundo{display:none!important}}";

  function estilo() {
    if (document.getElementById("kpwa-css")) return;
    var s = document.createElement("style"); s.id = "kpwa-css"; s.textContent = css;
    document.head.appendChild(s);
  }

  var ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';

  function mostrar() {
    if (instalado || chip || dispensadoRecente()) return;
    estilo();
    chip = document.createElement("div");
    chip.className = "kpwa-chip";
    chip.innerHTML = '<button type="button" class="kpwa-sim">' + ICONE + 'Instalar app</button>' +
                     '<button type="button" class="kpwa-x" aria-label="Agora não">✕</button>';
    chip.querySelector(".kpwa-sim").onclick = instalar;
    chip.querySelector(".kpwa-x").onclick = dispensar;
    document.body.appendChild(chip);
  }
  function esconder() { if (chip) { chip.remove(); chip = null; } }

  function passoAPassoIOS() {
    estilo();
    var f = document.createElement("div");
    f.className = "kpwa-fundo";
    f.innerHTML = '<div class="kpwa-caixa"><h3>Instalar no iPhone</h3><ol>' +
      '<li>Toque no botão <b>Compartilhar</b> do Safari (o quadrado com a seta para cima).</li>' +
      '<li>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</li>' +
      '<li>Toque em <b>Adicionar</b>. O ícone da Konstante aparece junto dos outros apps.</li>' +
      '</ol><button type="button" class="kpwa-ok">Entendi</button></div>';
    f.onclick = function (e) { if (e.target === f || e.target.className === "kpwa-ok") f.remove(); };
    document.body.appendChild(f);
  }

  function instalar() {
    if (pedido) {
      pedido.prompt();
      pedido.userChoice.then(function (r) { pedido = null; if (r.outcome === "accepted") esconder(); });
    } else if (ehIOS) {
      if (ehSafari) passoAPassoIOS();
      else alert("No iPhone, abra este endereço no Safari para instalar o app.");
    } else {
      alert("Use o menu do navegador (⋮) e toque em \"Instalar app\" ou \"Adicionar à tela inicial\".");
    }
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    pedido = e;
    mostrar();
  });
  window.addEventListener("appinstalled", function () { instalado = true; pedido = null; esconder(); });

  if (ehIOS && !instalado) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mostrar);
    else mostrar();
  }

  window.K_PWA = { instalar: instalar, podeInstalar: function () { return !instalado && (!!pedido || ehIOS); } };
})();
