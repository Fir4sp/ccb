import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ErroApi } from './api'

// ---------------------------------------------------------------- rotas (hash)

export function useRota(): string {
  const [rota, setRota] = useState(() => location.hash.slice(1) || '/')
  useEffect(() => {
    const f = () => {
      setRota(location.hash.slice(1) || '/')
      window.scrollTo(0, 0)
    }
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return rota
}

export function ir(rota: string) {
  location.hash = rota
}

// ---------------------------------------------------------------- ícones (traço simples, 24px)

const caminhos: Record<string, string> = {
  inicio: 'M3 11 12 4l9 7v9h-6v-6H9v6H3z',
  casas: 'M4 21V10l8-6 8 6v11M9 21v-5h6v5M2 12l10-8 10 8',
  admin: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  conta: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  voltar: 'M15 18l-6-6 6-6',
  seta: 'M9 18l6-6-6-6',
  mais: 'M12 5v14M5 12h14',
  busca: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  usuarios: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  grupos: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  ajustes: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  historico: 'M12 8v4l3 3M3.05 11a9 9 0 1 1 .5 4M3 4v5h5',
  // v1.1.0
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  telefone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  mapa: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  editar: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  lixo: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  cima: 'M18 15l-6-6-6 6',
  baixo: 'M6 9l6 6 6-6',
  fechar: 'M18 6 6 18M6 6l12 12',
  estrela: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  imagem: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  pessoas: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  // Fase 3 — chamados
  chamados: 'M9 3h6v3H9zM16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2M8.5 12.5l2 2 4.5-4.5M9 18h6',
  alerta: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  documento: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  certo: 'M20 6 9 17l-5-5',
  enviar: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  relogio: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  conversa: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  raio: 'M13 2 4 14h7l-1 8 9-12h-7z',
  gota: 'M12 2.7c-3.6 4.5-6 7.9-6 11.1a6 6 0 0 0 12 0c0-3.2-2.4-6.6-6-11.1z',
  telhado: 'M2 12 12 4l10 8M5 10v10h14V10M10 20v-5h4v5',
  vento: 'M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h6',
  chave: 'M21 2l-2 2M11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zM11.4 11.6 15.5 7.5M15.5 7.5l3 3L22 7l-3-3',
  pincel: 'M18.4 2.6a2 2 0 0 1 3 3L12 15l-4 1 1-4zM7 17c-2 0-3.5 1.3-3.5 3.5 2 0 3.5-.6 4.3-1.6',
  piso: 'M3 3h18v18H3zM3 12h18M12 3v9M8 12v9M16 12v9',
  som: 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  escudo: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  banco: 'M4 10h16M4 14h16M6 14v6M18 14v6M6 10V6h12v4',
  folha: 'M11 20a7 7 0 0 1-7-7c0-6 5-10 16-10 0 11-4 16-9 17zM4 21c4-5 7-8 12-11',
  balde: 'M4 8h16l-1.6 12.2A2 2 0 0 1 16.4 22H7.6a2 2 0 0 1-2-1.8zM8 8a4 4 0 0 1 8 0M9 13h6',
  carrinho: 'M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21 8H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  menos: 'M5 12h14',
  imprimir: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  baixar: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  obra: 'M2 18h20M4 18v-3a8 8 0 0 1 16 0v3M10 7.3V4h4v3.3M8 18v-4M16 18v-4',
  moeda: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  pausa: 'M10 4H6v16h4zM18 4h-4v16h4z',
  play: 'M6 4l14 8-14 8z',
  lista: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  menu: 'M3 6h18M3 12h18M3 18h18',
  sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  outros: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
}

export function Icone({ nome, tamanho = 22 }: { nome: string; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={caminhos[nome]} />
    </svg>
  )
}

// ---------------------------------------------------------------- blocos

export function Topo({ titulo, voltar, acao }: { titulo: string; voltar?: string; acao?: ReactNode }) {
  return (
    <header className="topo">
      {voltar && (
        <a className="topo-voltar" href={'#' + voltar} aria-label="Voltar">
          <Icone nome="voltar" />
        </a>
      )}
      <h1>{titulo}</h1>
      {acao}
    </header>
  )
}

export function Carregando() {
  return <div className="carregando" role="status"><span className="girador" />Carregando…</div>
}

export function Aviso({ tipo = 'erro', children }: { tipo?: 'erro' | 'ok' | 'info'; children: ReactNode }) {
  return <div className={'aviso aviso-' + tipo} role={tipo === 'erro' ? 'alert' : 'status'}>{children}</div>
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="vazio">{children}</p>
}

type CampoProps = {
  rotulo: string
  nome: string
  valor: string
  aoMudar: (v: string) => void
  erro?: string
  tipo?: string
  dica?: string
  obrigatorio?: boolean
  autoComplete?: string
  inputMode?: 'text' | 'email' | 'numeric' | 'decimal' | 'tel'
}

export function Campo({ rotulo, nome, valor, aoMudar, erro, tipo = 'text', dica, obrigatorio, autoComplete, inputMode }: CampoProps) {
  const id = 'c-' + nome
  return (
    <div className={'campo' + (erro ? ' campo-erro' : '')}>
      <label htmlFor={id}>{rotulo}{obrigatorio && <span aria-hidden="true"> *</span>}</label>
      <input id={id} name={nome} type={tipo} value={valor} onChange={(e) => aoMudar(e.target.value)}
        required={obrigatorio} autoComplete={autoComplete} inputMode={inputMode}
        aria-invalid={!!erro} aria-describedby={erro ? id + '-e' : dica ? id + '-d' : undefined} />
      {dica && !erro && <small id={id + '-d'}>{dica}</small>}
      {erro && <small id={id + '-e'} className="msg-erro">{erro}</small>}
    </div>
  )
}

export function Selecao({ rotulo, nome, valor, aoMudar, opcoes, erro, obrigatorio }: {
  rotulo: string; nome: string; valor: string; aoMudar: (v: string) => void
  opcoes: { valor: string; texto: string }[]; erro?: string; obrigatorio?: boolean
}) {
  const id = 'c-' + nome
  return (
    <div className={'campo' + (erro ? ' campo-erro' : '')}>
      <label htmlFor={id}>{rotulo}{obrigatorio && <span aria-hidden="true"> *</span>}</label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} aria-invalid={!!erro}>
        <option value="">Escolha…</option>
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
      {erro && <small className="msg-erro">{erro}</small>}
    </div>
  )
}

export function AreaTexto({ rotulo, nome, valor, aoMudar, erro, dica, linhas = 3, obrigatorio, placeholder }: {
  rotulo: string; nome: string; valor: string; aoMudar: (v: string) => void; erro?: string; dica?: string
  linhas?: number; obrigatorio?: boolean; placeholder?: string
}) {
  const id = 'c-' + nome
  return (
    <div className={'campo' + (erro ? ' campo-erro' : '')}>
      <label htmlFor={id}>{rotulo}{obrigatorio && <span aria-hidden="true"> *</span>}</label>
      <textarea id={id} rows={linhas} value={valor} onChange={(e) => aoMudar(e.target.value)} aria-invalid={!!erro} placeholder={placeholder} />
      {dica && !erro && <small>{dica}</small>}
      {erro && <small className="msg-erro">{erro}</small>}
    </div>
  )
}

// ---------------------------------------------------------------- fotos

/** Reduz a foto no próprio celular (máx. 1600 px, JPEG) antes de enviar: sobe rápido mesmo com sinal fraco. */
export async function reduzirImagem(arquivo: File): Promise<string> {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => falha(new Error('Não foi possível abrir esta imagem.'))
      i.src = url
    })
    const f = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * f)
    c.height = Math.round(img.naturalHeight * f)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** PDF vai como está (máx. 8 MB). */
export function lerArquivo(arquivo: File): Promise<string> {
  return new Promise((ok, falha) => {
    if (arquivo.size > 8 * 1024 * 1024) { falha(new Error('O arquivo passa de 8 MB.')); return }
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = () => falha(new Error('Não foi possível ler o arquivo.'))
    r.readAsDataURL(arquivo)
  })
}

/** Botões "Tirar foto" e "Escolher da galeria" (no computador, os dois abrem a escolha de arquivo). */
export function EnviarFotos({ aoEscolher, desativado, rotuloGaleria = 'Escolher da galeria' }: {
  aoEscolher: (arquivos: File[]) => void; desativado?: boolean; rotuloGaleria?: string
}) {
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const escolher = (l: FileList | null, el: HTMLInputElement | null) => {
    if (l && l.length) aoEscolher(Array.from(l))
    if (el) el.value = ''
  }
  return (
    <div className="fotos-enviar">
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => escolher(e.target.files, e.target)} />
      <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={(e) => escolher(e.target.files, e.target)} />
      <button type="button" className="botao botao-pequeno" disabled={desativado} onClick={() => camera.current?.click()}>
        <Icone nome="camera" tamanho={18} />Tirar foto
      </button>
      <button type="button" className="botao botao-pequeno" disabled={desativado} onClick={() => galeria.current?.click()}>
        <Icone nome="imagem" tamanho={18} />{rotuloGaleria}
      </button>
    </div>
  )
}

/** Foto em tela cheia: arrastar para os lados, setas do teclado, toque para ampliar. */
export function Visor({ fotos, indice, aoMudarIndice, aoFechar, rodape }: {
  fotos: { id: number; url: string; legenda: string | null }[]
  indice: number
  aoMudarIndice: (i: number) => void
  aoFechar: () => void
  rodape?: ReactNode
}) {
  const foto = fotos[indice]
  const [zoom, setZoom] = useState(false)
  const toque = useRef<number | null>(null)

  useEffect(() => { setZoom(false) }, [foto.id])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
      if (e.key === 'ArrowRight' && indice < fotos.length - 1) aoMudarIndice(indice + 1)
      if (e.key === 'ArrowLeft' && indice > 0) aoMudarIndice(indice - 1)
    }
    addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', tecla); document.body.style.overflow = '' }
  }, [indice, fotos.length, aoFechar, aoMudarIndice])

  return (
    <div className="visor" role="dialog" aria-modal="true" aria-label="Foto ampliada">
      <div className="visor-topo">
        <span>{indice + 1} de {fotos.length}</span>
        <button className="botao-icone claro" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button>
      </div>
      <div className={'visor-imagem' + (zoom ? ' com-zoom' : '')}
        onTouchStart={(e) => { toque.current = e.touches.length === 1 ? e.touches[0].clientX : null }}
        onTouchEnd={(e) => {
          if (zoom || toque.current === null) return
          const dx = e.changedTouches[0].clientX - toque.current
          if (dx < -60 && indice < fotos.length - 1) aoMudarIndice(indice + 1)
          if (dx > 60 && indice > 0) aoMudarIndice(indice - 1)
        }}>
        <img src={foto.url} alt={foto.legenda ?? ''} onClick={() => setZoom(!zoom)} />
      </div>
      {indice > 0 && <button className="visor-nav anterior" onClick={() => aoMudarIndice(indice - 1)} aria-label="Foto anterior"><Icone nome="voltar" /></button>}
      {indice < fotos.length - 1 && <button className="visor-nav proxima" onClick={() => aoMudarIndice(indice + 1)} aria-label="Próxima foto"><Icone nome="seta" /></button>}
      <div className="visor-rodape">
        {rodape ?? (foto.legenda && <p className="visor-texto">{foto.legenda}</p>)}
      </div>
    </div>
  )
}

export function reais(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function dataDia(s: string | null): string {
  if (!s) return '—'
  const [a, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function dataCurta(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s.replace(' ', 'T'))
  const hoje = new Date()
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoje.toDateString()) return 'hoje, ' + hora
  if (d.toDateString() === ontem.toDateString()) return 'ontem, ' + hora
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: d.getFullYear() === hoje.getFullYear() ? undefined : '2-digit' })
}

export function mensagemDe(e: unknown): string {
  if (e instanceof ErroApi) return e.message
  if (e instanceof Error && e.message) return e.message
  return 'Algo deu errado. Tente novamente.'
}

export function camposDe(e: unknown): Record<string, string> {
  return e instanceof ErroApi ? e.campos : {}
}

export function dataHora(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s.replace(' ', 'T'))
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Mesmo jeito do servidor: "1.500" é mil e quinhentos; "1.234,56" e "1234,56" também valem. */
export function numero(v: string): number | null {
  const t = v.replace(/R\$|\s/g, '')
  if (t === '') return null
  let n: number
  if (t.includes(',')) n = Number(t.replace(/\./g, '').replace(',', '.'))
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ''))
  else n = Number(t)
  return Number.isNaN(n) ? null : n
}

