// Sistema CCB — v1.10.0: relatório de visita do CNS Limpeza (checklist editável + fotos, imprimir/PDF).
import { useEffect, useState, type FormEvent } from 'react'
import { api, type Casa, type Usuario } from '../api'
import { AreaTexto, Aviso, Campo, Carregando, EnviarFotos, Icone, Selecao, Topo, Vazio, camposDe, dataDia, dataHora, ir, mensagemDe, reduzirImagem } from '../ui'

type ItemChecklist = { id: number; secao: string | null; texto: string; ordem: number; ativo: boolean }
type Resposta = 'ok' | 'ajustar' | 'na'
type ItemVisita = { id: number; secao: string | null; texto: string; resposta: Resposta | null; obs: string | null }
type FotoVisita = { id: number; url: string; mini_url: string | null; legenda: string | null }
type Visita = {
  id: number; status: 'rascunho' | 'concluida'; data_visita: string; observacao: string | null
  casa: { id: number; nome: string; codigo: string; grupo: string }
  criado_por: string | null; criado_em: string; concluida_por: string | null; concluida_em: string | null
  itens: ItemVisita[]; fotos: FotoVisita[]; pode_editar: boolean; pode_reabrir: boolean; pode_excluir: boolean
}
type LinhaVisita = {
  id: number; data_visita: string; status: 'rascunho' | 'concluida'
  casa: { id: number; nome: string; codigo: string; grupo: string }
  criado_por: string; qtd_itens: number; qtd_ajustar: number; qtd_fotos: number
}

const RESPOSTAS: { valor: Resposta; texto: string; marca: string }[] = [
  { valor: 'ok', texto: 'OK', marca: '✓' },
  { valor: 'ajustar', texto: 'Precisa ajustar', marca: '✗' },
  { valor: 'na', texto: 'Não se aplica', marca: '—' },
]

/** Sugestão para a Coordenação começar (pode editar ou apagar depois). */
const SUGESTAO: { secao: string; texto: string }[] = [
  { secao: 'Salão e entrada', texto: 'Piso limpo e sem manchas' },
  { secao: 'Salão e entrada', texto: 'Bancos e púlpito sem pó' },
  { secao: 'Banheiros', texto: 'Banheiros limpos e sem mau cheiro' },
  { secao: 'Banheiros', texto: 'Papel higiênico, papel toalha e sabonete abastecidos' },
  { secao: 'Cozinha', texto: 'Cozinha e pia limpas' },
  { secao: 'DML', texto: 'DML organizado, produtos identificados' },
  { secao: 'DML', texto: 'Produtos dentro da validade' },
  { secao: 'Lixo', texto: 'Lixo recolhido e lixeiras limpas' },
]

function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Agrupa os itens por seção, mantendo a ordem. */
function porSecao<T extends { secao: string | null }>(itens: T[]): { secao: string | null; itens: T[] }[] {
  const g: { secao: string | null; itens: T[] }[] = []
  for (const i of itens) {
    const ult = g[g.length - 1]
    if (ult && ult.secao === i.secao) ult.itens.push(i); else g.push({ secao: i.secao, itens: [i] })
  }
  return g
}

// ================================================================ lista

export function ListaVisitas({ usuario }: { usuario: Usuario }) {
  const [lista, setLista] = useState<LinhaVisita[] | null>(null)
  const [casas, setCasas] = useState<Casa[]>([])
  const [casa, setCasa] = useState('')
  const [data, setData] = useState(hoje())
  const [erro, setErro] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const gerir = usuario.permissoes.includes('cns.gerir')

  useEffect(() => {
    api<LinhaVisita[]>('GET', '/cns/visitas').then(setLista).catch((e) => setErro(mensagemDe(e)))
    api<Casa[]>('GET', '/casas').then((c) => { setCasas(c); if (c.length === 1) setCasa(String(c[0].id)) }).catch(() => {})
  }, [])

  async function comecar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setErros({}); setEnviando(true)
    try {
      const v = await api<Visita>('POST', '/cns/visitas', { casa_id: Number(casa), data_visita: data })
      ir(`/limpeza/visitas/${v.id}`)
    } catch (err) { setErro(mensagemDe(err)); setErros(camposDe(err)) } finally { setEnviando(false) }
  }

  return (
    <main className="pagina">
      <Topo titulo="Visitas às casas" voltar="/limpeza" acao={gerir ? <a className="botao botao-pequeno" href="#/limpeza/visitas/checklist"><Icone nome="lista" tamanho={18} />Checklist</a> : undefined} />
      {erro && <Aviso>{erro}</Aviso>}
      <form className="cartao painel-form" onSubmit={comecar} noValidate>
        <h2>Nova visita</h2>
        <Selecao rotulo="Casa de Oração" nome="visita-casa" valor={casa} aoMudar={setCasa} erro={erros.casa_id} obrigatorio
          opcoes={casas.map((c) => ({ valor: String(c.id), texto: `${c.nome} · ${c.grupo}` }))} />
        <Campo rotulo="Data da visita" nome="data_visita" tipo="date" valor={data} aoMudar={setData} erro={erros.data_visita} obrigatorio />
        <button className="botao botao-cheio" disabled={enviando || !casa}><Icone nome="mais" />Começar a visita</button>
      </form>

      <section className="bloco">
        <h2>Visitas feitas</h2>
        {!lista && !erro && <Carregando />}
        {lista && lista.length === 0 && <Vazio>Nenhuma visita registrada ainda.</Vazio>}
        {lista && lista.length > 0 && (
          <ul className="lista">
            {lista.map((v) => (
              <li key={v.id}>
                <a className="item item-chamado" href={`#/limpeza/visitas/${v.id}`}>
                  <span className="chamado-simbolo"><Icone nome="lista" /></span>
                  <div>
                    <strong>{v.casa.nome}</strong>
                    <span>{dataDia(v.data_visita)} · {v.criado_por} · {v.qtd_fotos} {v.qtd_fotos === 1 ? 'foto' : 'fotos'}</span>
                    <span className="linha-selos">
                      <span className={'selo-status ' + (v.status === 'concluida' ? 'tom-feito' : 'tom-andamento')}>{v.status === 'concluida' ? 'Concluída' : 'Em preenchimento'}</span>
                      {v.qtd_ajustar > 0 && <span className="selo-vez">{v.qtd_ajustar} a ajustar</span>}
                    </span>
                  </div>
                  <Icone nome="seta" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

// ================================================================ checklist (Coordenação CNS)

export function ChecklistVisitas() {
  const [itens, setItens] = useState<ItemChecklist[] | null>(null)
  const [secao, setSecao] = useState('')
  const [texto, setTexto] = useState('')
  const [editando, setEditando] = useState<ItemChecklist | null>(null)
  const [erro, setErro] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const carregar = () => api<ItemChecklist[]>('GET', '/cns/checklist?todos=1').then(setItens).catch((e) => setErro(mensagemDe(e)))
  useEffect(() => { carregar() }, [])

  async function fazer(f: () => Promise<unknown>) {
    setErro(''); setErros({}); setEnviando(true)
    try { await f(); await carregar(); return true } catch (e) { setErro(mensagemDe(e)); setErros(camposDe(e)); return false } finally { setEnviando(false) }
  }
  async function adicionar(e: FormEvent) {
    e.preventDefault()
    if (await fazer(() => api('POST', '/cns/checklist', { secao, texto }))) setTexto('')
  }
  async function salvarEdicao(e: FormEvent) {
    e.preventDefault()
    if (editando && await fazer(() => api('PUT', `/cns/checklist/${editando.id}`, editando))) setEditando(null)
  }
  const mover = (i: number, d: -1 | 1) => {
    if (!itens) return
    const ids = itens.map((x) => x.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    fazer(() => api('PUT', '/cns/checklist/ordem', { ids }))
  }
  const usarSugestao = () => fazer(async () => { for (const s of SUGESTAO) await api('POST', '/cns/checklist', s) })

  if (!itens) return <main className="pagina">{erro ? <Aviso>{erro}</Aviso> : <Carregando />}</main>
  const secoes = [...new Set(itens.map((i) => i.secao).filter(Boolean))] as string[]

  return (
    <main className="pagina">
      <Topo titulo="Checklist da visita" voltar="/limpeza/visitas" />
      <p className="contexto">Os itens que a orientadora marca em cada visita. Mudar aqui não altera visitas já começadas.</p>
      {erro && <Aviso>{erro}</Aviso>}
      {itens.length === 0 && (
        <section className="cartao">
          <p>O checklist está vazio. Cadastre os itens abaixo ou comece com uma sugestão e ajuste como achar melhor.</p>
          <button className="botao" disabled={enviando} onClick={usarSugestao}>Começar com a sugestão ({SUGESTAO.length} itens)</button>
        </section>
      )}
      {itens.length > 0 && (
        <ul className="lista lista-checklist">
          {itens.map((i, n) => (
            <li key={i.id} className={i.ativo ? '' : 'inativo'}>
              {editando?.id === i.id ? (
                <form className="painel-form" onSubmit={salvarEdicao} noValidate>
                  <Campo rotulo="Seção (opcional)" nome="edit-secao" valor={editando.secao ?? ''} aoMudar={(v) => setEditando({ ...editando, secao: v })} erro={erros.secao} />
                  <Campo rotulo="Item" nome="edit-texto" valor={editando.texto} aoMudar={(v) => setEditando({ ...editando, texto: v })} erro={erros.texto} obrigatorio />
                  <label className="marcar"><input type="checkbox" checked={editando.ativo} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} /> Usar nas próximas visitas</label>
                  <div className="acoes-form"><button type="button" className="botao" onClick={() => setEditando(null)}>Voltar</button><button className="botao botao-cheio" disabled={enviando}>Salvar</button></div>
                </form>
              ) : (
                <div className="item-checklist">
                  <div>
                    {i.secao && <small className="fraco">{i.secao}</small>}
                    <strong>{i.texto}</strong>
                    {!i.ativo && <small className="fraco">desativado — não entra nas próximas visitas</small>}
                  </div>
                  <div className="acoes-item">
                    <button className="botao-icone" aria-label="Subir" disabled={enviando || n === 0} onClick={() => mover(n, -1)}>↑</button>
                    <button className="botao-icone" aria-label="Descer" disabled={enviando || n === itens.length - 1} onClick={() => mover(n, 1)}>↓</button>
                    <button className="botao-icone" aria-label={`Editar ${i.texto}`} onClick={() => setEditando(i)}><Icone nome="editar" tamanho={18} /></button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="cartao painel-form margem-cima" onSubmit={adicionar} noValidate>
        <h2>Novo item</h2>
        <Campo rotulo="Seção (opcional)" nome="secao" valor={secao} aoMudar={setSecao} dica={secoes.length ? `Já usadas: ${secoes.join(', ')}` : 'Ex.: Banheiros, Cozinha, DML'} erro={editando ? undefined : erros.secao} />
        <Campo rotulo="Item a conferir" nome="texto" valor={texto} aoMudar={setTexto} erro={editando ? undefined : erros.texto} obrigatorio />
        <button className="botao botao-cheio" disabled={enviando || texto.trim().length < 2}><Icone nome="mais" />Adicionar</button>
      </form>
    </main>
  )
}

// ================================================================ visita

export function VisitaDetalhe({ id }: { id: number }) {
  const [v, setV] = useState<Visita | null>(null)
  const [itens, setItens] = useState<ItemVisita[]>([])
  const [data, setData] = useState('')
  const [obs, setObs] = useState('')
  const [mudou, setMudou] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)
  const aplicar = (x: Visita) => { setV(x); setItens(x.itens); setData(x.data_visita); setObs(x.observacao ?? ''); setMudou(false) }
  useEffect(() => { api<Visita>('GET', '/cns/visitas/' + id).then(aplicar).catch((e) => setErro(mensagemDe(e))) }, [id])

  const corpo = () => ({ data_visita: data, observacao: obs, itens: itens.map((i) => ({ id: i.id, resposta: i.resposta, obs: i.obs })) })
  async function fazer(f: () => Promise<Visita>, msg = '') {
    setErro(''); setOk(''); setEnviando(true)
    try { aplicar(await f()); if (msg) { setOk(msg); window.scrollTo(0, 0) } }
    catch (e) { setErro(mensagemDe(e)); window.scrollTo(0, 0) } finally { setEnviando(false) }
  }
  const salvar = () => fazer(() => api<Visita>('PUT', '/cns/visitas/' + id, corpo()), 'Visita salva.')
  const concluir = () => fazer(async () => {
    if (mudou) await api('PUT', '/cns/visitas/' + id, corpo())
    return api<Visita>('POST', `/cns/visitas/${id}/acoes`, { acao: 'concluir' })
  }, 'Visita concluída. Agora é só gerar o PDF ou imprimir.')
  const reabrir = () => fazer(() => api<Visita>('POST', `/cns/visitas/${id}/acoes`, { acao: 'reabrir' }), 'Visita reaberta para edição.')
  async function excluir() {
    if (!v || !confirm(`Excluir a visita de ${dataDia(v.data_visita)} na ${v.casa.nome}? As fotos também são apagadas. Não dá para desfazer.`)) return
    setEnviando(true)
    try { await api('DELETE', '/cns/visitas/' + id); ir('/limpeza/visitas') } catch (e) { setErro(mensagemDe(e)) } finally { setEnviando(false) }
  }
  async function enviarFotos(arquivos: File[]) {
    setErro(''); setEnviando(true)
    try {
      if (mudou) await api('PUT', '/cns/visitas/' + id, corpo())
      let ultima: Visita | null = null
      for (const a of arquivos) ultima = await api<Visita>('POST', `/cns/visitas/${id}/fotos`, { arquivo: await reduzirImagem(a) })
      if (ultima) aplicar(ultima)
    } catch (e) { setErro(mensagemDe(e)) } finally { setEnviando(false) }
  }
  const legenda = (f: FotoVisita) => {
    const nova = prompt('Legenda da foto (ex.: Banheiro feminino):', f.legenda ?? '')
    if (nova !== null) fazer(() => api<Visita>('PUT', `/cns/visitas/${id}/fotos/${f.id}`, { legenda: nova }))
  }
  const apagarFoto = (f: FotoVisita) => { if (confirm('Apagar esta foto?')) fazer(() => api<Visita>('DELETE', `/cns/visitas/${id}/fotos/${f.id}`)) }
  const marcar = (itemId: number, campo: 'resposta' | 'obs', valor: string | null) => {
    setItens(itens.map((i) => i.id === itemId ? { ...i, [campo]: valor } : i)); setMudou(true)
  }

  if (erro && !v) return <main className="pagina"><Topo titulo="Visita" voltar="/limpeza/visitas" /><Aviso>{erro}</Aviso></main>
  if (!v) return <main className="pagina"><Carregando /></main>
  const editar = v.pode_editar
  const faltam = itens.filter((i) => !i.resposta).length
  const ajustar = itens.filter((i) => i.resposta === 'ajustar').length

  return (
    <main className="pagina pagina-visita">
      <Topo titulo="Relatório de visita" voltar="/limpeza/visitas" />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}

      <header className="cartao visita-cabeca">
        <span className="rotulo-pequeno">Relatório de visita · CNS Limpeza</span>
        <h2>Casa de oração {v.casa.nome}</h2>
        <p>{v.casa.grupo}{v.casa.codigo ? ` · ${v.casa.codigo}` : ''}</p>
        {editar
          ? <div className="nao-imprimir"><Campo rotulo="Data da visita" nome="data_visita" tipo="date" valor={data} aoMudar={(x) => { setData(x); setMudou(true) }} obrigatorio /></div>
          : null}
        <p className={editar ? 'so-imprimir' : ''}><b>Data da visita:</b> {dataDia(data)} · <b>Responsável:</b> {v.criado_por}</p>
        <p className="fraco so-imprimir">Legenda: ✓ OK · ✗ Precisa ajustar · — Não se aplica · ☐ não marcado</p>
        <p className="fraco">{v.status === 'concluida' ? `Concluída em ${dataHora(v.concluida_em)}` : 'Em preenchimento'}{itens.length ? ` · ${itens.length - faltam} de ${itens.length} itens marcados` : ''}{ajustar ? ` · ${ajustar} a ajustar` : ''}</p>
      </header>

      {porSecao(itens).map((g, n) => (
        <section className="cartao visita-secao" key={n}>
          {g.secao && <h2>{g.secao}</h2>}
          <ul className="itens-visita">
            {g.itens.map((i) => (
              <li key={i.id} className={'item-visita' + (i.resposta ? ' resp-' + i.resposta : '')}>
                <p className="item-visita-texto"><span className="marca-resposta" aria-hidden="true">{RESPOSTAS.find((r) => r.valor === i.resposta)?.marca ?? '☐'}</span>{i.texto}</p>
                {editar ? (
                  <>
                    <div className="opcoes-resposta nao-imprimir" role="group" aria-label={i.texto}>
                      {RESPOSTAS.map((r) => (
                        <button key={r.valor} type="button" className={'resp ' + r.valor + (i.resposta === r.valor ? ' ativo' : '')} aria-pressed={i.resposta === r.valor}
                          onClick={() => marcar(i.id, 'resposta', i.resposta === r.valor ? null : r.valor)}>{r.texto}</button>
                      ))}
                    </div>
                    {(i.resposta === 'ajustar' || i.obs) && (
                      <div className="nao-imprimir"><Campo rotulo="Observação do item" nome={'obs-' + i.id} valor={i.obs ?? ''} aoMudar={(x) => marcar(i.id, 'obs', x)} /></div>
                    )}
                    {i.obs && <p className="obs-item so-imprimir">{i.obs}</p>}
                  </>
                ) : (
                  <>
                    <p className="resp-texto">{RESPOSTAS.find((r) => r.valor === i.resposta)?.texto ?? 'Não marcado'}</p>
                    {i.obs && <p className="obs-item">{i.obs}</p>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="cartao">
        <h2>Observações gerais</h2>
        {editar
          ? <><div className="nao-imprimir"><AreaTexto rotulo="Observações" nome="observacao" valor={obs} aoMudar={(x) => { setObs(x); setMudou(true) }} linhas={3} /></div><p className="pre so-imprimir">{obs || '—'}</p></>
          : <p className="pre">{obs || '—'}</p>}
      </section>

      <section className="cartao">
        <h2>Fotos ({v.fotos.length})</h2>
        {v.fotos.length === 0 && <p className="fraco">Nenhuma foto ainda.</p>}
        <ul className="fotos-visita">
          {v.fotos.map((f) => (
            <li key={f.id}>
              <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.legenda ?? 'Foto da visita'} loading="lazy" /></a>
              <p>{f.legenda || <span className="fraco nao-imprimir">sem legenda</span>}</p>
              {editar && (
                <div className="acoes-item nao-imprimir">
                  <button className="botao-texto" onClick={() => legenda(f)}>Legenda</button>
                  <button className="botao-texto perigo" onClick={() => apagarFoto(f)}>Apagar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {editar && <div className="nao-imprimir margem-cima"><EnviarFotos aoEscolher={enviarFotos} desativado={enviando} /></div>}
      </section>

      <p className="so-imprimir assinatura-visita">Assinatura da orientadora: ______________________________ &nbsp; Responsável pela casa: ______________________________</p>

      <div className="botoes-acao nao-imprimir margem-cima">
        {editar && <button className="botao" disabled={enviando || !mudou} onClick={salvar}>Salvar</button>}
        {editar && <button className="botao botao-cheio" disabled={enviando} onClick={concluir} title={faltam ? `Faltam ${faltam} itens` : ''}><Icone nome="certo" />Concluir a visita</button>}
        <button className="botao" onClick={() => window.print()}><Icone nome="imprimir" />Gerar PDF / imprimir</button>
        {v.pode_reabrir && <button className="botao" disabled={enviando} onClick={reabrir}><Icone nome="editar" />Reabrir</button>}
      </div>
      {editar && faltam > 0 && <p className="fraco nao-imprimir">Para concluir, marque todos os itens ({faltam} faltando).</p>}
      {v.pode_excluir && (
        <section className="bloco nao-imprimir">
          <h2>Excluir visita</h2>
          <button type="button" className="botao perigo" onClick={excluir} disabled={enviando}><Icone nome="lixo" tamanho={18} />Excluir visita</button>
        </section>
      )}
    </main>
  )
}
