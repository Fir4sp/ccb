// Sistema CCB — botão "Instalar o app no aparelho" (v1.9.1).
import { useEffect, useState } from 'react'

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> }

let pedido: EventoInstalar | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedido = e as EventoInstalar; avisar() })
window.addEventListener('appinstalled', () => { pedido = null; avisar() })

const instalado = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const ehIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function useInstalar() {
  const [, setN] = useState(0)
  useEffect(() => {
    const f = () => setN((n) => n + 1)
    ouvintes.add(f)
    return () => { ouvintes.delete(f) }
  }, [])
  return { pronto: !!pedido, instalado: instalado(), ios: ehIos() }
}

async function instalar() {
  if (!pedido) return
  await pedido.prompt()
  await pedido.userChoice.catch(() => null)
  pedido = null
  avisar()
}

/** Na entrada e no início: só o botão (quando o navegador permite). Em "Minha conta" (completo): também as dicas. */
export function InstalarApp({ completo = false }: { completo?: boolean }) {
  const { pronto, instalado: jaInstalado, ios } = useInstalar()
  if (jaInstalado) return null
  if (pronto) {
    return (
      <button type="button" className="botao botao-instalar" onClick={instalar}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 3v12m0 0-5-5m5 5 5-5M5 21h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Instalar o app no aparelho
      </button>
    )
  }
  if (ios) {
    return (
      <p className="dica-instalar">
        <b>Instalar no iPhone:</b> abra no Safari, toque em <b>Compartilhar</b> (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>.
      </p>
    )
  }
  if (!completo) return null
  return (
    <p className="dica-instalar">
      <b>Instalar o app:</b> no Chrome, abra o menu <b>⋮</b> e toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>). No computador, use o ícone de instalar na barra de endereço.
    </p>
  )
}
