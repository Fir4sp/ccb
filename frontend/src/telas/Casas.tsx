import { useEffect, useState, type FormEvent } from 'react'
import { api, CARGOS_MINISTERIO, NOMES_FUNCOES, type Casa, type Foto, type Grupo, type ItemChamado, type Ministro } from '../api'
import { Aviso, Carregando, EnviarFotos, Icone, Topo, Vazio, Visor, camposDe, mensagemDe, reduzirImagem } from '../ui'
import { ItemDaLista } from './Chamados'
import { OrdensDaCasa } from './Ordens'

export function ListaCasas({ admin }: { admin?: boolean }) {
  const [casas, setCasas] = useState<Casa[] | null>(null)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [busca, setBusca] = useState('')
  const [grupo, setGrupo] = useState('')
  const [inativas, setInativas] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api<Grupo[]>('GET', '/grupos').then(setGrupos).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams()
      if (busca) q.set('busca', busca)
      if (grupo) q.set('grupo_id', grupo)
      if (inativas) q.set('ativas', '0')
      api<Casa[]>('GET', '/casas?' + q).then((c) => { setCasas(c); setErro('') }).catch((e) => setErro(mensagemDe(e)))
    }, 250)
    return () => clearTimeout(t)
  }, [busca, grupo, inativas])

  const base = admin ? '#/admin/casas/' : '#/casas/'

  return (
    <main className="pagina pagina-larga">
      <Topo titulo="Casas de Oração" voltar={admin ? '/admin' : undefined}
        acao={admin && <a className="botao botao-cheio botao-pequeno" href="#/admin/casas/nova"><Icone nome="mais" tamanho={18} />Nova</a>} />
      <div className="filtros">
        <label className="busca">
          <Icone nome="busca" tamanho={18} />
          <input type="search" placeholder="Buscar por nome, código ou bairro" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar casas" />
        </label>
        {grupos.length > 1 && (
          <div className="pilulas" role="group" aria-label="Filtrar por grupo">
            <button className={grupo === '' ? 'ativo' : ''} onClick={() => setGrupo('')}>Todos</button>
            {grupos.map((g) => (
              <button key={g.id} className={grupo === String(g.id) ? 'ativo' : ''} onClick={() => setGrupo(String(g.id))}>{g.nome}</button>
            ))}
          </div>
        )}
        {admin && (
          <label className="caixa"><input type="checkbox" checked={inativas} onChange={(e) => setInativas(e.target.checked)} />Mostrar casas desativadas</label>
        )}
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!casas && !erro && <Carregando />}
      {casas && casas.length === 0 && <Vazio>Nenhuma casa encontrada.</Vazio>}
      {casas && casas.length > 0 && (
        <>
          <p className="contagem">{casas.length} {casas.length === 1 ? 'casa' : 'casas'}</p>
          <ul className="lista lista-casas">
            {casas.map((c) => (
              <li key={c.id}>
                <a className="item" href={base + c.id}>
                  <span className="miniatura">{c.capa_url ? <img src={c.capa_url} alt="" loading="lazy" /> : <Icone nome="casas" />}</span>
                  <div>
                    <strong>{c.nome}{!c.ativo && <em className="selo">desativada</em>}</strong>
                    <span>{c.codigo} · {c.grupo}</span>
                    {c.endereco && <span className="fraco">{c.endereco}</span>}
                  </div>
                  <Icone nome="seta" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}

export function CasaDetalhe({ id }: { id: number }) {
  const [casa, setCasa] = useState<Casa | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api<Casa>('GET', '/casas/' + id).then(setCasa).catch((e) => setErro(mensagemDe(e)))
  }, [id])

  if (erro && !casa) return <main className="pagina"><Topo titulo="Casa de Oração" voltar="/casas" /><Aviso>{erro}</Aviso></main>
  if (!casa) return <main className="pagina"><Carregando /></main>

  const capa = casa.fotos?.find((f) => f.capa)
  const endereco = [casa.endereco, casa.cep, casa.cidade || 'São Paulo'].filter(Boolean).join(', ')
  const mapa = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Congregação Cristã no Brasil ' + endereco)
  const editar = !!casa.pode_editar

  return (
    <main className="pagina pagina-larga pagina-casa">
      <Topo titulo={casa.nome} voltar="/casas"
        acao={editar && <a className="botao botao-pequeno" href={`#/admin/casas/${casa.id}`}><Icone nome="editar" tamanho={18} />Editar dados</a>} />
      <div className={'casa-capa' + (capa ? '' : ' casa-capa-vazia')}>
        {capa ? <img src={capa.url} alt={capa.legenda || `Foto de ${casa.nome}`} />
          : <><Icone nome="imagem" tamanho={40} /><span>Sem foto ainda</span></>}
        <div className="casa-capa-legenda"><span>{casa.codigo} · {casa.grupo}</span></div>
      </div>
      <div className="casa-colunas">
        <div className="casa-col">
          <ChamadosDaCasa casa={casa} />
          <OrdensDaCasa casaId={casa.id} />
          <section className="cartao">
            <h2>Informações</h2>
            <dl className="ficha ficha-plana">
              <div><dt>Endereço</dt><dd>{casa.endereco || '—'}{casa.cep ? ` · CEP ${casa.cep}` : ''}</dd></div>
              <div><dt>Horários de culto</dt><dd>{casa.horarios_culto || '—'}</dd></div>
              <div><dt>Capacidade</dt><dd>{casa.capacidade ? `${casa.capacidade} pessoas` : '—'}</dd></div>
              {casa.observacoes && <div><dt>Observações</dt><dd className="pre">{casa.observacoes}</dd></div>}
              <div><dt>Estoque de limpeza</dt><dd>{casa.dml_local?.nome ?? '—'}</dd></div>
            </dl>
            {casa.endereco && (
              <a className="botao botao-pequeno botao-largo" href={mapa} target="_blank" rel="noopener noreferrer">
                <Icone nome="mapa" tamanho={18} />Abrir no mapa
              </a>
            )}
          </section>
          <MinisterioDaCasa casaId={casa.id} lista={casa.ministerio ?? []} editar={editar} aoMudar={(m) => setCasa({ ...casa, ministerio: m })} />
        </div>
        <div className="casa-col">
          <FotosDaCasa casa={casa} editar={editar} aoMudar={(f) => setCasa({ ...casa, fotos: f })} />
          {casa.usuarios && (
            <section className="cartao">
              <h2>Usuários da casa</h2>
              {casa.usuarios.length === 0 && <Vazio>Nenhum usuário vinculado.</Vazio>}
              <ul className="lista lista-plana">
                {casa.usuarios.map((u) => (
                  <li key={u.id}>
                    <a className="item" href={`#/admin/usuarios/${u.id}`}>
                      <div><strong>{u.nome}</strong><span>{NOMES_FUNCOES[u.funcao]} · {u.email}</span></div>
                      <Icone nome="seta" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------- chamados da casa (Fase 3)

function ChamadosDaCasa({ casa }: { casa: Casa }) {
  const [itens, setItens] = useState<ItemChamado[] | null>(null)
  const [total, setTotal] = useState(0)
  useEffect(() => {
    api<{ itens: ItemChamado[]; total: number }>('GET', `/chamados?filtro=abertos&casa_id=${casa.id}`)
      .then((r) => { setItens(r.itens.slice(0, 3)); setTotal(r.total) })
      .catch(() => setItens(null))
  }, [casa.id])
  if (itens === null && !casa.pode_abrir_chamado) return null
  return (
    <section className="cartao">
      <div className="cartao-cabeca">
        <h2>Chamados em andamento {total > 0 && <small>({total})</small>}</h2>
        {casa.pode_abrir_chamado && (
          <a className="botao botao-cheio botao-pequeno" href={`#/chamados/novo?casa=${casa.id}`}><Icone nome="mais" tamanho={18} />Abrir chamado</a>
        )}
      </div>
      {itens && itens.length === 0 && <Vazio>Nenhum chamado em andamento nesta casa.</Vazio>}
      {itens && itens.length > 0 && (
        <ul className="lista lista-plana">
          {itens.map((c) => <li key={c.id}><ItemDaLista c={c} semCasa /></li>)}
        </ul>
      )}
      {total > 3 && <a className="ver-todos" href={`#/chamados?casa=${casa.id}`}>Ver os {total} chamados</a>}
    </section>
  )
}

// ---------------------------------------------------------------- ministério

function MinisterioDaCasa({ casaId, lista, editar, aoMudar }: { casaId: number; lista: Ministro[]; editar: boolean; aoMudar: (m: Ministro[]) => void }) {
  const [form, setForm] = useState<{ id: number | null; cargo: string; nome: string; telefone: string } | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro(''); setErros({}); setSalvando(true)
    try {
      const corpo = { cargo: form.cargo, nome: form.nome, telefone: form.telefone }
      aoMudar(await api<Ministro[]>(form.id ? 'PUT' : 'POST', `/casas/${casaId}/ministerio${form.id ? '/' + form.id : ''}`, corpo))
      setForm(null)
    } catch (err) {
      setErro(mensagemDe(err)); setErros(camposDe(err))
    } finally {
      setSalvando(false)
    }
  }

  async function tirar(m: Ministro) {
    if (!confirm(`Tirar ${m.nome} do ministério desta casa?`)) return
    try { aoMudar(await api<Ministro[]>('DELETE', `/casas/${casaId}/ministerio/${m.id}`)) } catch (err) { setErro(mensagemDe(err)) }
  }

  async function mover(i: number, d: number) {
    const nova = [...lista]
    const [m] = nova.splice(i, 1)
    nova.splice(i + d, 0, m)
    aoMudar(nova)
    try { aoMudar(await api<Ministro[]>('PUT', `/casas/${casaId}/ministerio/ordem`, { ordem: nova.map((x) => x.id) })) } catch (err) { setErro(mensagemDe(err)) }
  }

  return (
    <section className="cartao">
      <div className="cartao-cabeca">
        <h2>Ministério</h2>
        {editar && !form && (
          <button className="botao botao-pequeno" onClick={() => setForm({ id: null, cargo: '', nome: '', telefone: '' })}>
            <Icone nome="mais" tamanho={18} />Adicionar
          </button>
        )}
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {form && (
        <form className="form-ministerio" onSubmit={salvar} noValidate>
          <div className={'campo' + (erros.cargo ? ' campo-erro' : '')}>
            <label htmlFor="m-cargo">Cargo</label>
            <input id="m-cargo" list="cargos-ccb" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} autoFocus />
            <datalist id="cargos-ccb">{CARGOS_MINISTERIO.map((c) => <option key={c} value={c} />)}</datalist>
            {erros.cargo && <small className="msg-erro">{erros.cargo}</small>}
          </div>
          <div className={'campo' + (erros.nome ? ' campo-erro' : '')}>
            <label htmlFor="m-nome">Nome</label>
            <input id="m-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            {erros.nome && <small className="msg-erro">{erros.nome}</small>}
          </div>
          <div className={'campo' + (erros.telefone ? ' campo-erro' : '')}>
            <label htmlFor="m-tel">Telefone</label>
            <input id="m-tel" type="tel" inputMode="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            {erros.telefone && <small className="msg-erro">{erros.telefone}</small>}
          </div>
          <div className="acoes-form">
            <button type="button" className="botao" onClick={() => { setForm(null); setErros({}) }}>Cancelar</button>
            <button className="botao botao-cheio" disabled={salvando || !form.cargo.trim() || !form.nome.trim()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      )}
      {lista.length === 0 && !form && <Vazio>{editar ? 'Ninguém cadastrado ainda. Use "Adicionar".' : 'Ninguém cadastrado ainda.'}</Vazio>}
      <ul className="ministerio">
        {lista.map((m, i) => (
          <li key={m.id}>
            <div className="ministerio-texto"><span className="ministerio-cargo">{m.cargo}</span><strong>{m.nome}</strong></div>
            {m.telefone && (
              <a className="botao-icone" href={'tel:' + m.telefone.replace(/[^\d+]/g, '')} aria-label={`Ligar para ${m.nome}`} title={m.telefone}>
                <Icone nome="telefone" tamanho={20} />
              </a>
            )}
            {editar && (
              <div className="ministerio-acoes">
                <button className="botao-icone" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><Icone nome="cima" tamanho={18} /></button>
                <button className="botao-icone" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Descer"><Icone nome="baixo" tamanho={18} /></button>
                <button className="botao-icone" onClick={() => setForm({ id: m.id, cargo: m.cargo, nome: m.nome, telefone: m.telefone ?? '' })} aria-label={`Editar ${m.nome}`}>
                  <Icone nome="editar" tamanho={18} />
                </button>
                <button className="botao-icone perigo" onClick={() => tirar(m)} aria-label={`Tirar ${m.nome}`}><Icone nome="lixo" tamanho={18} /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------- fotos

function FotosDaCasa({ casa, editar, aoMudar }: { casa: Casa; editar: boolean; aoMudar: (f: Foto[]) => void }) {
  const fotos = casa.fotos ?? []
  const [aberta, setAberta] = useState<number | null>(null)
  const [envio, setEnvio] = useState<{ feito: number; total: number } | null>(null)
  const [erro, setErro] = useState('')

  async function enviar(arquivos: File[]) {
    setErro('')
    setEnvio({ feito: 0, total: arquivos.length })
    for (let i = 0; i < arquivos.length; i++) {
      try {
        const dados = await reduzirImagem(arquivos[i])
        aoMudar(await api<Foto[]>('POST', `/casas/${casa.id}/fotos`, { arquivo: dados, nome: arquivos[i].name }))
      } catch (err) {
        setErro(`${arquivos[i].name}: ${mensagemDe(err)}`)
      }
      setEnvio({ feito: i + 1, total: arquivos.length })
    }
    setEnvio(null)
  }

  return (
    <section className="cartao">
      <div className="cartao-cabeca"><h2>Fotos {fotos.length > 0 && <small>({fotos.length})</small>}</h2></div>
      {erro && <Aviso>{erro}</Aviso>}
      {editar && <EnviarFotos aoEscolher={enviar} desativado={!!envio} />}
      {envio && (
        <p className="carregando" role="status"><span className="girador" />Enviando {Math.min(envio.feito + 1, envio.total)} de {envio.total}…</p>
      )}
      {fotos.length === 0 && !envio && <Vazio>{editar ? 'Nenhuma foto ainda. A primeira foto vira a capa da página.' : 'Nenhuma foto ainda.'}</Vazio>}
      <ul className="galeria">
        {fotos.map((f, i) => (
          <li key={f.id}>
            <button onClick={() => setAberta(i)} aria-label={`Abrir foto${f.legenda ? ': ' + f.legenda : ''}`}>
              <img src={f.mini_url ?? f.url} alt={f.legenda ?? ''} loading="lazy" />
              {f.capa && <span className="selo-capa"><Icone nome="estrela" tamanho={12} />Capa</span>}
            </button>
            {f.legenda && <span className="galeria-legenda">{f.legenda}</span>}
          </li>
        ))}
      </ul>
      {aberta !== null && fotos[aberta] && (
        <Visor fotos={fotos} indice={aberta} aoMudarIndice={setAberta} aoFechar={() => setAberta(null)}
          rodape={editar ? (
            <EdicaoDaFoto casaId={casa.id} foto={fotos[aberta]} aoMudar={(f) => {
              aoMudar(f)
              if (f.length === 0) setAberta(null)
              else setAberta(Math.min(aberta, f.length - 1))
            }} />
          ) : undefined} />
      )}
    </section>
  )
}

function EdicaoDaFoto({ casaId, foto, aoMudar }: { casaId: number; foto: Foto; aoMudar: (f: Foto[]) => void }) {
  const [legenda, setLegenda] = useState(foto.legenda ?? '')
  const [erro, setErro] = useState('')
  useEffect(() => { setLegenda(foto.legenda ?? ''); setErro('') }, [foto.id, foto.legenda])

  async function fazer(f: () => Promise<Foto[]>) {
    setErro('')
    try { aoMudar(await f()) } catch (err) { setErro(mensagemDe(err)) }
  }

  return (
    <>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="visor-legenda">
        <input value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Escreva uma legenda (ex.: Fachada)" aria-label="Legenda" maxLength={200} />
        <button className="botao botao-pequeno" disabled={legenda === (foto.legenda ?? '')}
          onClick={() => fazer(() => api<Foto[]>('PUT', `/casas/${casaId}/fotos/${foto.id}`, { legenda }))}>Salvar</button>
      </div>
      <div className="visor-acoes">
        {!foto.capa && (
          <button className="botao botao-pequeno" onClick={() => fazer(() => api<Foto[]>('PUT', `/casas/${casaId}/fotos/${foto.id}`, { capa: true }))}>
            <Icone nome="estrela" tamanho={16} />Usar como capa
          </button>
        )}
        {foto.capa && <span className="selo-capa estatico"><Icone nome="estrela" tamanho={12} />Foto de capa</span>}
        <button className="botao botao-pequeno perigo"
          onClick={() => { if (confirm('Apagar esta foto?')) fazer(() => api<Foto[]>('DELETE', `/casas/${casaId}/fotos/${foto.id}`)) }}>
          <Icone nome="lixo" tamanho={16} />Apagar
        </button>
      </div>
    </>
  )
}
