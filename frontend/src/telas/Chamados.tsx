import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  api, PRIORIDADES, type Anexo, type Area, type Categoria, type Chamado, type Evento, type ItemChamado, type Material, type ResumoChamados, type Usuario,
} from '../api'
import {
  AreaTexto, Aviso, Campo, Carregando, EnviarFotos, Icone, Topo, Vazio, Visor,
  camposDe, dataCurta, dataDia, dataHora, ir, lerArquivo, mensagemDe, numero, reais, reduzirImagem,
} from '../ui'
import { BarraProgresso, SeloOS, SeloTipo } from './Ordens'

// ================================================================ textos e cores

/** Cor do selo: quem precisa agir agora (aguarda), em andamento, resolvido ou parado. */
const TOM: Record<string, string> = {
  aberto: 'aguarda', aguardando_parecer: 'aguarda', aguardando_aprovacao: 'aguarda', concluido: 'aguarda',
  em_orcamento: 'andamento', aprovado: 'andamento', em_execucao: 'andamento',
  encerrado: 'feito', cancelado: 'parado',
}

const ETAPAS = ['Pedido', 'Triagem', 'Orçamento', 'Aprovação', 'Execução', 'Confirmação']
const ETAPA_DO_STATUS: Record<string, number> = {
  aberto: 1, em_orcamento: 3, aguardando_parecer: 4, aguardando_aprovacao: 4, aprovado: 5, em_execucao: 5, concluido: 6, encerrado: 7,
}

const EVENTOS: Record<string, [string, string]> = {
  abertura: ['Abriu o chamado', 'chamados'],
  triagem: ['Fez a triagem', 'certo'],
  atribuicao: ['Mudou o responsável', 'pessoas'],
  orcamento: ['Enviou o orçamento', 'documento'],
  parecer: ['Deu o parecer de segurança', 'escudo'],
  aprovacao: ['Aprovou', 'certo'],
  reaprovacao: ['Aprovou o novo valor', 'certo'],
  devolucao: ['Devolveu', 'voltar'],
  inicio: ['Iniciou a OS', 'play'],
  material: ['Mexeu na lista de materiais', 'lista'],
  os_gerada: ['Gerou a Ordem de Serviço', 'documento'],
  tipo: ['Mudou o tipo', 'editar'],
  etapas: ['Mexeu nas etapas', 'lista'],
  etapa: ['Marcou etapas da OS', 'certo'],
  pausa: ['Pausou a OS', 'pausa'],
  retomada: ['Retomou a OS', 'play'],
  pendencia_resolvida: ['Resolveu uma pendência', 'certo'],
  gasto: ['Lançou um gasto', 'moeda'],
  estorno: ['Estornou um gasto', 'voltar'],
  pedido_teto: ['Pediu teto novo', 'moeda'],
  aumento_aprovado: ['Aprovou o teto novo', 'certo'],
  teto_recusado: ['Recusou o teto novo', 'fechar'],
  acima_teto: ['Aviso: passou do teto', 'alerta'],
  ajuste_valor: ['Atualizou o valor', 'editar'],
  pedido_reaprovacao: ['Pediu aprovação do novo valor', 'alerta'],
  conclusao: ['Concluiu a OS', 'certo'],
  confirmacao: ['Confirmou que está resolvido', 'certo'],
  reabertura: ['Reabriu: o problema continua', 'alerta'],
  cancelamento: ['Cancelou o chamado', 'fechar'],
  comentario: ['Comentou', 'conversa'],
  anexo: ['Enviou um arquivo', 'imagem'],
  anexo_excluido: ['Apagou um arquivo', 'lixo'],
  importacao: ['Importou do SharePoint', 'baixar'],
}

function explicacao(c: Chamado): string {
  switch (c.status) {
    case 'aberto': return 'A Coordenação do grupo vai olhar o pedido e definir a prioridade.'
    case 'em_orcamento': return c.responsavel ? `${c.responsavel.nome} está vendo o que precisa ser feito e quanto custa.` : 'A equipe está vendo o que precisa ser feito e quanto custa.'
    case 'aguardando_parecer': return 'A Segurança do Trabalho precisa dar o parecer antes da aprovação.'
    case 'aguardando_aprovacao': return c.em_reaprovacao
      ? `O valor do serviço mudou. Aguardando nova aprovação: ${c.nivel_nome}.`
      : c.tipo === 'obra' ? 'O teto da obra está com os Procuradores para aprovação.' : `Aguardando aprovação: ${c.nivel_nome}.`
    case 'aprovado': return `Aprovado. A ${c.os?.rotulo ?? 'Ordem de Serviço'} foi aberta e a equipe monta as etapas para começar.`
    case 'em_execucao': return `${c.tipo === 'obra' ? 'Obra' : 'Serviço'} em andamento${c.responsavel ? ` com ${c.responsavel.nome}` : ''}. Acompanhe as etapas na ${c.os?.rotulo ?? 'Ordem de Serviço'}.`
    case 'concluido': return c.os ? 'A equipe concluiu a Ordem de Serviço. A casa precisa confirmar se o problema foi resolvido.' : 'O serviço foi feito. A casa precisa confirmar se o problema foi resolvido.'
    case 'encerrado': return 'Problema resolvido e confirmado pela casa.'
    case 'cancelado': return 'Chamado cancelado' + (c.motivo_cancelamento ? `: ${c.motivo_cancelamento}` : '.')
  }
  return ''
}

export function SeloStatus({ status, nome }: { status: string; nome: string }) {
  return <span className={'selo-status tom-' + (TOM[status] ?? 'parado')}>{nome}</span>
}

function SeloUrgencia({ c }: { c: { urgente: boolean; prioridade: string | null } }) {
  if (c.prioridade === 'emergencia') return <span className="selo-urgente"><Icone nome="alerta" tamanho={14} />Emergência</span>
  if (c.urgente && !c.prioridade) return <span className="selo-urgente"><Icone nome="alerta" tamanho={14} />Urgente</span>
  if (c.prioridade === 'alta') return <span className="selo-prioridade">Prioridade alta</span>
  return null
}

// ================================================================ lista

export function ItemDaLista({ c, semCasa }: { c: ItemChamado; semCasa?: boolean }) {
  return (
    <a className={'item item-chamado' + (c.para_mim ? ' para-mim' : '')} href={`#/chamados/${c.id}`}>
      <span className="chamado-simbolo">
        {c.foto_url ? <img src={c.foto_url} alt="" loading="lazy" /> : <Icone nome={c.categoria?.icone ?? 'chamados'} />}
      </span>
      <div>
        <strong>{c.titulo}</strong>
        <span>#{c.numero}{semCasa ? '' : ` · ${c.casa.nome}`}{c.area ? ` · ${c.area.nome}` : ''} · {dataCurta(c.atualizado_em)}</span>
        <span className="linha-selos">
          {c.tipo === 'obra' && <SeloTipo tipo="obra" />}
          <SeloStatus status={c.status} nome={c.status_nome} />
          <SeloUrgencia c={c} />
          {c.para_mim && <span className="selo-vez">Sua vez</span>}
        </span>
      </div>
      {c.os ? (
        <div className="item-lado">
          <small>{c.os.rotulo}</small>
          <BarraProgresso valor={c.os.progresso} grande />
        </div>
      ) : <Icone nome="seta" />}
    </a>
  )
}

/** Linha da tabela (computador): o mesmo chamado, em colunas, como no SGK. */
function LinhaTabela({ c }: { c: ItemChamado }) {
  return (
    <tr className={c.para_mim ? 'para-mim' : ''} onClick={() => ir(`/chamados/${c.id}`)}>
      <td className="col-num"><a href={`#/chamados/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.numero}</a>
        {c.origem === 'sharepoint' && <small className="origem" title="Importado do SharePoint">SP</small>}</td>
      <td className="col-casa"><strong>{c.casa.nome}</strong><small>{c.casa.grupo}</small></td>
      <td className="col-assunto">
        <strong>{c.titulo}</strong>
        <span className="linha-selos">
          {c.tipo === 'obra' && <SeloTipo tipo="obra" />}
          {c.categoria && <small className="fraco">{c.categoria.nome}</small>}
          <SeloUrgencia c={c} />
          {c.para_mim && <span className="selo-vez">Sua vez</span>}
        </span>
      </td>
      <td className="col-area">{c.area ? <strong>{c.area.nome}</strong> : <span className="fraco">—</span>}<small>{c.responsavel?.nome ?? ''}</small></td>
      <td className="col-status"><SeloStatus status={c.status} nome={c.status_nome} /></td>
      <td className="col-data">{dataDia(c.criado_em)}<small>{diasEmAberto(c)}</small></td>
      <td className="col-os">{c.os ? <><small>{c.os.rotulo}</small><BarraProgresso valor={c.os.progresso} grande /></> : <span className="fraco">—</span>}</td>
    </tr>
  )
}

function diasEmAberto(c: ItemChamado): string {
  if (['encerrado', 'cancelado'].includes(c.status)) return 'finalizado'
  const d = Math.max(0, Math.floor((Date.now() - new Date(c.criado_em.replace(' ', 'T')).getTime()) / 86400000))
  return d === 0 ? 'hoje' : `${d} d em aberto`
}

const FILTROS: [string, string][] = [['abertos', 'Ativos'], ['para_mim', 'Para você'], ['encerrados', 'Finalizados'], ['todos', 'Todos']]
const CHIPS_STATUS: [string, string, string][] = [
  ['aberto', 'Aguardando triagem', 'aguarda'], ['em_orcamento', 'Em orçamento', 'andamento'], ['aguardando_parecer', 'Segurança do Trabalho', 'aguarda'],
  ['aguardando_aprovacao', 'Aguardando aprovação', 'aguarda'], ['aprovado', 'OS aberta', 'andamento'], ['em_execucao', 'Em execução', 'andamento'],
  ['concluido', 'Aguardando confirmação', 'aguarda'],
]

export function ListaChamados({ usuario, consulta }: { usuario: Usuario; consulta: URLSearchParams }) {
  const casaFixa = consulta.get('casa')
  const [filtro, setFiltro] = useState(consulta.get('filtro') ?? (casaFixa ? 'abertos' : ''))
  const [status, setStatus] = useState(consulta.get('status') ?? '')
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState(consulta.get('tipo') ?? '')
  const [area, setArea] = useState(consulta.get('area') ?? '')
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState<{ itens: ItemChamado[]; total: number } | null>(null)
  const [resumo, setResumo] = useState<ResumoChamados | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [erro, setErro] = useState('')
  const podeAbrir = usuario.permissoes.includes('chamados.abrir')
  const casaNome = casaFixa ? usuario.casas.find((c) => String(c.id) === casaFixa)?.nome : undefined

  // Na primeira visita, abre em "Para você" quando há algo esperando a pessoa.
  useEffect(() => {
    api<ResumoChamados>('GET', '/chamados/resumo').then((r) => {
      setResumo(r)
      setFiltro((f) => f || (r.para_mim > 0 ? 'para_mim' : 'abertos'))
    }).catch(() => setFiltro((f) => f || 'abertos'))
    api<Area[]>('GET', '/areas').then(setAreas).catch(() => {})
  }, [])

  useEffect(() => {
    if (!filtro) return
    const t = setTimeout(() => {
      const q = new URLSearchParams({ filtro, pagina: String(pagina) })
      if (busca) q.set('busca', busca)
      if (tipo) q.set('tipo', tipo)
      if (status) q.set('status', status)
      if (area) q.set('area_id', area)
      if (casaFixa) q.set('casa_id', casaFixa)
      api<{ itens: ItemChamado[]; total: number }>('GET', '/chamados?' + q)
        .then((r) => { setDados(r); setErro('') })
        .catch((e) => setErro(mensagemDe(e)))
    }, busca ? 300 : 0)
    return () => clearTimeout(t)
  }, [filtro, busca, pagina, casaFixa, tipo, status, area])

  const vazio: Record<string, string> = {
    para_mim: 'Nada esperando por você agora.',
    abertos: 'Nenhum chamado em andamento.',
    encerrados: 'Nenhum chamado finalizado ainda.',
    todos: 'Nenhum chamado ainda.',
  }
  const ps = resumo?.por_status ?? {}
  const n = (...k: string[]) => k.reduce((t, x) => t + (ps[x] ?? 0), 0)
  const mudar = (f: () => void) => { f(); setPagina(1); setDados(null) }

  return (
    <main className="pagina pagina-larga pagina-lista">
      <Topo titulo={casaNome ? `Chamados · ${casaNome}` : 'Chamados'} voltar={casaFixa ? `/casas/${casaFixa}` : undefined}
        acao={podeAbrir && <a className="botao botao-cheio" href={'#/chamados/novo' + (casaFixa ? `?casa=${casaFixa}` : '')}><Icone nome="mais" tamanho={18} />Novo chamado</a>} />

      {resumo && !casaFixa && (
        <div className="kpis">
          <button className="kpi" onClick={() => mudar(() => { setFiltro('abertos'); setStatus('') })}><span>Em aberto</span><strong>{resumo.abertos}</strong><small>chamados ativos agora</small></button>
          <button className={'kpi' + (resumo.para_mim ? ' kpi-destaque' : '')} onClick={() => mudar(() => { setFiltro('para_mim'); setStatus('') })}><span>Para você</span><strong>{resumo.para_mim}</strong><small>esperando a sua ação</small></button>
          <button className="kpi kpi-alerta" onClick={() => mudar(() => { setFiltro('abertos'); setStatus('') })}><span>Urgentes</span><strong>{resumo.urgentes}</strong><small>urgência ou emergência</small></button>
          <button className="kpi kpi-aguarda" onClick={() => mudar(() => { setFiltro('abertos'); setStatus('aguardando_aprovacao') })}><span>Aguardando aprovação</span><strong>{n('aguardando_aprovacao', 'aguardando_parecer')}</strong><small>com parecer ou alçada</small></button>
          <button className="kpi kpi-andamento" onClick={() => mudar(() => { setFiltro('abertos'); setStatus('em_execucao') })}><span>Em execução</span><strong>{n('aprovado', 'em_execucao')}</strong><small>com Ordem de Serviço</small></button>
          <button className="kpi kpi-ok" onClick={() => mudar(() => { setFiltro('abertos'); setStatus('concluido') })}><span>Aguardando a casa</span><strong>{n('concluido')}</strong><small>confirmar o serviço</small></button>
        </div>
      )}

      <div className="chips" role="group" aria-label="Mostrar">
        {FILTROS.map(([k, rotulo]) => (
          <button key={k} className={'chip' + (filtro === k && !status ? ' ativo' : '')} onClick={() => mudar(() => { setFiltro(k); setStatus('') })}>
            {rotulo}{k === 'abertos' && resumo ? <b>{resumo.abertos}</b> : k === 'para_mim' && resumo?.para_mim ? <b>{resumo.para_mim}</b> : null}
          </button>
        ))}
        <span className="chips-separador" aria-hidden="true" />
        {CHIPS_STATUS.filter(([k]) => (ps[k] ?? 0) > 0 || status === k).map(([k, rotulo, tom]) => (
          <button key={k} className={'chip chip-' + tom + (status === k ? ' ativo' : '')} onClick={() => mudar(() => { setFiltro('abertos'); setStatus(status === k ? '' : k) })}>
            {rotulo}<b>{ps[k] ?? 0}</b>
          </button>
        ))}
      </div>

      <div className="barra-ferramentas">
        <label className="busca">
          <Icone nome="busca" tamanho={18} />
          <input type="search" placeholder="Buscar por nº do chamado ou da OS, casa ou assunto" value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1) }} aria-label="Buscar chamados" />
        </label>
        <select value={area} onChange={(e) => mudar(() => setArea(e.target.value))} aria-label="Área">
          <option value="">Todas as áreas</option>
          <option value="sem">Sem área{resumo?.por_area?.sem ? ` (${resumo.por_area.sem})` : ''}</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}{resumo?.por_area?.[a.id] ? ` (${resumo.por_area[a.id]})` : ''}</option>)}
        </select>
        <select value={tipo} onChange={(e) => mudar(() => setTipo(e.target.value))} aria-label="Tipo">
          <option value="">Serviços e obras</option>
          <option value="servico">Só serviços</option>
          <option value="obra">Só obras</option>
        </select>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados && dados.itens.length === 0 && (
        <div className="vazio-grande">
          <Vazio>{busca ? 'Nenhum chamado encontrado.' : status || area ? 'Nenhum chamado com esse filtro.' : vazio[filtro]}</Vazio>
          {podeAbrir && !busca && filtro !== 'encerrados' && (
            <a className="botao botao-cheio" href={'#/chamados/novo' + (casaFixa ? `?casa=${casaFixa}` : '')}><Icone nome="mais" />Abrir um chamado</a>
          )}
        </div>
      )}
      {dados && dados.itens.length > 0 && (
        <>
          <div className="tabela-cartao so-computador">
            <table className="tabela tabela-chamados">
              <thead><tr><th>Nº</th><th>Casa</th><th>Assunto</th><th>Área · responsável</th><th>Status</th><th>Abertura</th><th>OS</th></tr></thead>
              <tbody>{dados.itens.map((c) => <LinhaTabela key={c.id} c={c} />)}</tbody>
            </table>
          </div>
          <ul className="lista so-celular">{dados.itens.map((c) => <li key={c.id}><ItemDaLista c={c} /></li>)}</ul>
          <div className="paginacao">
            <span>{dados.total} {dados.total === 1 ? 'chamado' : 'chamados'}{dados.total > 50 ? ` · página ${pagina} de ${Math.ceil(dados.total / 50)}` : ''}</span>
            {dados.total > 50 && (
              <span className="paginacao-botoes">
                <button className="botao botao-pequeno" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anteriores</button>
                <button className="botao botao-pequeno" disabled={pagina * 50 >= dados.total} onClick={() => setPagina(pagina + 1)}>Próximos</button>
              </span>
            )}
          </div>
        </>
      )}
    </main>
  )
}

// ================================================================ abrir chamado

type FotoLocal = { id: number; dados: string; nome: string }

export function NovoChamado({ usuario, casaInicial }: { usuario: Usuario; casaInicial: string | null }) {
  const casas = usuario.casas
  const [casaId, setCasaId] = useState(casaInicial ?? (casas.length === 1 ? String(casas[0].id) : ''))
  const [categorias, setCategorias] = useState<Categoria[] | null>(null)
  const [categoria, setCategoria] = useState<number | null>(null)
  const [local, setLocal] = useState('')
  const [assunto, setAssunto] = useState('')
  const [descricao, setDescricao] = useState('')
  const [urgente, setUrgente] = useState(false)
  const [tipo, setTipo] = useState<'servico' | 'obra'>('servico')
  const escolheTipo = usuario.permissoes.includes('chamados.triar')
  const [fotos, setFotos] = useState<FotoLocal[]>([])
  const [preparando, setPreparando] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState('')

  useEffect(() => { api<Categoria[]>('GET', '/chamados/categorias').then(setCategorias).catch((e) => setErro(mensagemDe(e))) }, [])

  async function adicionarFotos(arquivos: File[]) {
    setPreparando(true)
    for (const a of arquivos.slice(0, 6 - fotos.length)) {
      try {
        const dados = await reduzirImagem(a)
        setFotos((f) => [...f, { id: Math.random(), dados, nome: a.name }])
      } catch (e) {
        setErro(mensagemDe(e))
      }
    }
    setPreparando(false)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setErros({})
    const faltando: Record<string, string> = {}
    if (!casaId) faltando.casa_id = 'Escolha a casa.'
    if (!categoria) faltando.categoria_id = 'Escolha o tipo do problema.'
    if (descricao.trim().length < 10) faltando.descricao = 'Conte um pouco mais (pelo menos uma frase).'
    if (Object.keys(faltando).length) { setErros(faltando); setErro('Faltam algumas informações.'); return }

    setEnviando('Enviando o chamado…')
    let novo: Chamado
    try {
      novo = await api<Chamado>('POST', '/chamados', { casa_id: Number(casaId), categoria_id: categoria, local, assunto, descricao, urgente, tipo })
    } catch (err) {
      setErro(mensagemDe(err)); setErros(camposDe(err)); setEnviando('')
      return
    }
    let falhas = 0
    for (let i = 0; i < fotos.length; i++) {
      setEnviando(`Enviando foto ${i + 1} de ${fotos.length}…`)
      try { await api('POST', `/chamados/${novo.id}/anexos`, { arquivo: fotos[i].dados, nome: fotos[i].nome, categoria: 'foto' }) } catch { falhas++ }
    }
    ir(`/chamados/${novo.id}?${falhas ? 'fotos_falharam=' + falhas : 'novo=1'}`)
  }

  const nomeCategoria = categorias?.find((c) => c.id === categoria)
  return (
    <main className="pagina">
      <Topo titulo="Abrir chamado" voltar={casaInicial ? `/casas/${casaInicial}` : '/chamados'} />
      <form onSubmit={enviar} noValidate className="form-chamado">
        {erro && <Aviso>{erro}</Aviso>}

        {casas.length !== 1 && (
          <section className="passo">
            <h2><span className="passo-numero">1</span>Qual Casa de Oração?</h2>
            <div className={'campo' + (erros.casa_id ? ' campo-erro' : '')}>
              <select value={casaId} onChange={(e) => setCasaId(e.target.value)} aria-label="Casa de Oração" aria-invalid={!!erros.casa_id}>
                <option value="">Escolha a casa…</option>
                {[...new Set(casas.map((c) => c.grupo))].map((g) => (
                  <optgroup key={g} label={g}>
                    {casas.filter((c) => c.grupo === g).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </optgroup>
                ))}
              </select>
              {erros.casa_id && <small className="msg-erro">{erros.casa_id}</small>}
            </div>
          </section>
        )}
        {casas.length === 1 && <p className="contexto-casa"><Icone nome="casas" tamanho={18} />{casas[0].nome}</p>}

        <section className="passo">
          <h2><span className="passo-numero">{casas.length !== 1 ? 2 : 1}</span>Qual é o problema?</h2>
          {!categorias && <Carregando />}
          <div className={'categorias' + (erros.categoria_id ? ' campo-erro' : '')} role="radiogroup" aria-label="Tipo do problema">
            {categorias?.map((c) => (
              <button type="button" key={c.id} role="radio" aria-checked={categoria === c.id}
                className={'categoria' + (categoria === c.id ? ' escolhida' : '')} onClick={() => setCategoria(c.id)}>
                <Icone nome={c.icone} tamanho={28} /><span>{c.nome}</span>
              </button>
            ))}
          </div>
          {erros.categoria_id && <small className="msg-erro">{erros.categoria_id}</small>}
          {nomeCategoria?.exige_parecer_seguranca && (
            <p className="dica-passo"><Icone nome="escudo" tamanho={16} />Este tipo de serviço passa pela Segurança do Trabalho antes de ser aprovado.</p>
          )}
        </section>

        <section className="passo">
          <h2><span className="passo-numero">{casas.length !== 1 ? 3 : 2}</span>Onde e o que está acontecendo?</h2>
          <Campo rotulo="Assunto" nome="assunto" valor={assunto} aoMudar={setAssunto} erro={erros.assunto}
            dica="Uma frase curta que resuma o pedido. Ex.: Vazamento no telhado do salão." />
          <Campo rotulo="Onde fica" nome="local" valor={local} aoMudar={setLocal} erro={erros.local}
            dica="Ex.: banheiro feminino, salão, cozinha, telhado da frente." />
          <AreaTexto rotulo="O que está acontecendo" nome="descricao" valor={descricao} aoMudar={setDescricao} erro={erros.descricao} linhas={4} obrigatorio
            placeholder="Ex.: A torneira da pia está pingando sem parar desde domingo." />
          <label className={'caixa caixa-urgente' + (urgente ? ' marcada' : '')}>
            <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
            <span>
              <strong>É urgente</strong>
              <small>Há risco para as pessoas (choque, vazamento grande, algo pode cair) ou o problema impede o culto.</small>
            </span>
          </label>
          {urgente && <Aviso tipo="info">Se houver risco imediato, avise também o encarregado por telefone.</Aviso>}
          {escolheTipo && (
            <div className="campo">
              <label>É serviço ou obra?</label>
              <div className="segmentado segmentado-grande" role="radiogroup" aria-label="Tipo">
                <button type="button" role="radio" aria-checked={tipo === 'servico'} className={tipo === 'servico' ? 'ativo' : ''} onClick={() => setTipo('servico')}>Serviço</button>
                <button type="button" role="radio" aria-checked={tipo === 'obra'} className={tipo === 'obra' ? 'ativo' : ''} onClick={() => setTipo('obra')}>Obra</button>
              </div>
              <small>{tipo === 'obra' ? 'Obra: o valor pedido é o teto, aprovado pelos Procuradores, e os gastos são controlados na OS.' : 'Serviço: aprovado pela alçada do valor. Pode virar obra depois, na triagem.'}</small>
            </div>
          )}
        </section>

        <section className="passo">
          <h2><span className="passo-numero">{casas.length !== 1 ? 4 : 3}</span>Fotos <small>(ajudam muito)</small></h2>
          {fotos.length < 6 && <EnviarFotos aoEscolher={adicionarFotos} desativado={preparando || !!enviando} />}
          {preparando && <p className="carregando" role="status"><span className="girador" />Preparando foto…</p>}
          {fotos.length > 0 && (
            <ul className="galeria galeria-previa">
              {fotos.map((f) => (
                <li key={f.id}>
                  <img src={f.dados} alt="" />
                  <button type="button" className="tirar-foto" onClick={() => setFotos(fotos.filter((x) => x.id !== f.id))} aria-label="Tirar esta foto">
                    <Icone nome="fechar" tamanho={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button className="botao botao-cheio botao-grande" disabled={!!enviando || preparando}>
          {enviando || <><Icone nome="enviar" />Enviar chamado</>}
        </button>
      </form>
    </main>
  )
}

// ================================================================ detalhe

export function ChamadoDetalhe({ id, consulta }: { id: number; consulta: URLSearchParams }) {
  const [c, setC] = useState<Chamado | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState(() => consulta.get('novo') ? 'Chamado enviado. Você pode acompanhar tudo por aqui.'
    : consulta.get('fotos_falharam') ? 'Chamado enviado, mas algumas fotos não subiram. Tente mandar de novo abaixo.' : '')

  const carregar = useCallback(() => api<Chamado>('GET', '/chamados/' + id).then(setC).catch((e) => setErro(mensagemDe(e))), [id])
  useEffect(() => { carregar() }, [carregar])

  if (erro && !c) return <main className="pagina"><Topo titulo="Chamado" voltar="/chamados" /><Aviso>{erro}</Aviso></main>
  if (!c) return <main className="pagina"><Carregando /></main>

  const etapa = ETAPA_DO_STATUS[c.status]
  return (
    <main className="pagina pagina-larga pagina-chamado">
      <Topo titulo={`Chamado #${c.numero}`} voltar="/chamados" />
      {aviso && <Aviso tipo={consulta.get('fotos_falharam') ? 'erro' : 'ok'}>{aviso}</Aviso>}

      <section className="cartao cabeca-chamado">
        <div className="cabeca-linha">
          <span className="chamado-simbolo grande"><Icone nome={c.categoria?.icone ?? 'chamados'} tamanho={26} /></span>
          <div>
            <h2>{c.titulo}</h2>
            <a href={`#/casas/${c.casa.id}`}>{c.casa.nome}</a><span className="fraco"> · {c.casa.grupo}</span>
          </div>
        </div>
        <div className="linha-selos">
          <SeloTipo tipo={c.tipo} />
          <SeloStatus status={c.status} nome={c.status_nome} />
          {c.area && <span className="selo-area"><Icone nome="pessoas" tamanho={13} />{c.area.nome}</span>}
          <SeloUrgencia c={c} />
          {c.prioridade && c.prioridade !== 'alta' && c.prioridade !== 'emergencia' && <span className="selo-prioridade fraca">Prioridade {PRIORIDADES[c.prioridade].toLowerCase()}</span>}
        </div>
        {etapa && (
          <ol className="etapas" aria-label="Etapas do chamado">
            {ETAPAS.map((e, i) => (
              <li key={e} className={i + 1 < etapa ? 'feita' : i + 1 === etapa ? 'atual' : ''} aria-current={i + 1 === etapa ? 'step' : undefined}>
                <span>{e}</span>
              </li>
            ))}
          </ol>
        )}
        <p className={'explicacao tom-' + (TOM[c.status] ?? 'parado')}>{explicacao(c)}</p>
      </section>

      {c.os && (
        <a className="cartao cartao-os" href={`#/ordens/${c.os.id}`}>
          <span className="os-numero"><small>OS</small>{String(c.os.numero).padStart(4, '0')}</span>
          <span className="cartao-os-meio">
            <strong>Ordem de Serviço {c.tipo === 'obra' ? 'da obra' : 'do serviço'}</strong>
            <span className="linha-selos"><SeloOS status={c.os.status} nome={c.os.status_nome} /></span>
            <BarraProgresso valor={c.os.progresso} />
          </span>
          <span className="link-seta">Etapas e andamento<Icone nome="seta" tamanho={16} /></span>
        </a>
      )}
      <Acoes c={c} aoMudar={(n) => { setC(n); setAviso('') }} />
      <div className="chamado-colunas">
        <aside>
      <section className="cartao">
        <h2>O pedido</h2>
        <dl className="ficha ficha-plana">
          {c.categoria && <div><dt>Tipo do problema</dt><dd>{c.categoria.nome}</dd></div>}
          {c.local && <div><dt>Onde</dt><dd>{c.local}</dd></div>}
          {c.descricao && <div><dt>O que está acontecendo</dt><dd className="pre">{c.descricao}</dd></div>}
          <div><dt>Aberto por</dt><dd>{c.aberto_por.nome}{c.origem === 'sharepoint' ? ' (no SharePoint)' : ''} · {dataHora(c.criado_em)}</dd></div>
          <div><dt>Área</dt><dd>{c.area?.nome ?? 'Ainda não encaminhado'}</dd></div>
          {c.responsavel && <div><dt>Responsável</dt><dd>{c.responsavel.nome}</dd></div>}
          {c.origem === 'sharepoint' && (
            <div><dt>Veio do SharePoint</dt><dd>
              {c.status_externo && <>Status lá: {c.status_externo}. </>}
              {c.link_externo && <a href={c.link_externo} target="_blank" rel="noopener">Abrir o chamado original</a>}
            </dd></div>
          )}
        </dl>
      </section>

        </aside>
        <div>
      {(c.servico_descricao || c.valor_estimado !== null) && (
        <section className="cartao">
          <h2>{c.tipo === 'obra' ? 'Escopo e teto da obra' : 'Serviço e valores'}</h2>
          <dl className="ficha ficha-plana">
            {c.servico_descricao && <div><dt>{c.tipo === 'obra' ? 'Escopo' : 'O que será feito'}</dt><dd className="pre">{c.servico_descricao}</dd></div>}
            {c.ve_valores && (
              <div className="valores">
                <div><dt>{c.tipo === 'obra' ? 'Teto pedido' : 'Orçado'}</dt><dd>{reais(c.valor_estimado)}</dd></div>
                <div><dt>{c.tipo === 'obra' ? 'Teto aprovado' : 'Aprovado'}</dt><dd>{reais(c.valor_aprovado)}</dd></div>
                {c.valor_final !== null && <div><dt>{c.tipo === 'obra' ? 'Gasto final' : 'Final'}</dt><dd>{reais(c.valor_final)}</dd></div>}
              </div>
            )}
            {c.aprovado_por && <div><dt>Aprovado por</dt><dd>{c.aprovado_por} · {dataHora(c.aprovado_em)}</dd></div>}
            {c.nivel_nome && !c.aprovado_por && <div><dt>Quem aprova</dt><dd>{c.nivel_nome}</dd></div>}
            {c.parecer && (
              <div>
                <dt>Segurança do Trabalho</dt>
                <dd>
                  <strong className={'parecer-' + c.parecer.resultado}>
                    {{ favoravel: 'Favorável', com_ressalvas: 'Favorável com ressalvas', desfavoravel: 'Desfavorável' }[c.parecer.resultado]}
                  </strong>
                  {c.parecer.texto && <span className="pre"> — {c.parecer.texto}</span>}
                  <span className="fraco"> · {c.parecer.por}</span>
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <Materiais c={c} aoMudar={setC} />
      <Arquivos c={c} aoMudar={setC} />
      <LinhaDoTempo c={c} aoMudar={setC} />
        </div>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------- ações

const ROTULO_ACAO: Record<string, string> = {
  triar: 'Fazer a triagem', enviar_orcamento: 'Registrar orçamento', parecer: 'Dar parecer', aprovar: 'Aprovar', devolver: 'Devolver',
  ajustar_valor: 'Mudou o valor', confirmar: 'Sim, está resolvido',
  reabrir: 'Não, o problema continua', atribuir: 'Área e responsável', mudar_tipo: 'Serviço ou obra', cancelar: 'Cancelar chamado',
}
const PRINCIPAIS = ['triar', 'enviar_orcamento', 'parecer', 'aprovar', 'confirmar']
const SECUNDARIAS = ['devolver', 'ajustar_valor', 'reabrir', 'atribuir', 'mudar_tipo']

function Acoes({ c, aoMudar }: { c: Chamado; aoMudar: (c: Chamado) => void }) {
  const [aberta, setAberta] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { setAberta(null); setErro(''); setErros({}) }, [c.status, c.id])

  const principais = c.acoes.filter((a) => PRINCIPAIS.includes(a))
  const secundarias = c.acoes.filter((a) => SECUNDARIAS.includes(a))
  const podeCancelar = c.acoes.includes('cancelar')
  if (!principais.length && !secundarias.length && !podeCancelar) return null
  // Só pode cancelar (quem abriu, antes da triagem): um link discreto, sem cartão.
  if (!principais.length && !secundarias.length && aberta !== 'cancelar') {
    return <div className="cancelar-solto"><button className="link-perigo" onClick={() => setAberta('cancelar')}>Cancelar este chamado</button></div>
  }

  async function executar(acao: string, dados: Record<string, unknown> = {}) {
    setErro(''); setErros({}); setEnviando(true)
    try {
      aoMudar(await api<Chamado>('POST', `/chamados/${c.id}/acoes`, { acao, ...dados }))
      setAberta(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setErro(mensagemDe(e)); setErros(camposDe(e))
    } finally {
      setEnviando(false)
    }
  }

  // Ações de um clique (sem formulário)
  const direta = (a: string) => a === 'confirmar'
  const clicar = (a: string) => {
    if (direta(a)) executar(a)
    else setAberta(aberta === a ? null : a)
  }

  return (
    <section className={'cartao cartao-acoes' + (c.para_mim ? ' sua-vez' : '')}>
      <h2>{c.para_mim ? 'Sua vez' : 'O que você pode fazer'}</h2>
      {erro && !aberta && <Aviso>{erro}</Aviso>}
      {(principais.length > 0 || secundarias.length > 0) && (
        <div className="botoes-acao">
          {principais.map((a) => (
            <button key={a} className={'botao' + (aberta === a ? ' botao-marcado' : ' botao-cheio')} disabled={enviando} onClick={() => clicar(a)}>
              {a === 'aprovar' ? (c.tipo === 'obra' ? `Aprovar teto de ${reais(c.valor_estimado)}` : `Aprovar ${reais(c.valor_estimado)}`)
                : a === 'enviar_orcamento' && c.tipo === 'obra' ? 'Pedir o teto da obra' : ROTULO_ACAO[a]}
            </button>
          ))}
          {secundarias.map((a) => (
            <button key={a} className={'botao' + (aberta === a ? ' botao-marcado' : '')} disabled={enviando} onClick={() => clicar(a)}>{ROTULO_ACAO[a]}</button>
          ))}
        </div>
      )}
      {aberta && (
        <div className="painel-acao">
          {erro && <Aviso>{erro}</Aviso>}
          <FormAcao acao={aberta} c={c} erros={erros} enviando={enviando} aoEnviar={(d) => executar(aberta, d)} aoCancelar={() => setAberta(null)} />
        </div>
      )}
      {podeCancelar && aberta !== 'cancelar' && (
        <button className="link-perigo" onClick={() => setAberta('cancelar')}>Cancelar este chamado</button>
      )}
    </section>
  )
}

type PropsForm = {
  acao: string; c: Chamado; erros: Record<string, string>; enviando: boolean
  aoEnviar: (d: Record<string, unknown>) => void; aoCancelar: () => void
}

function nivelPara(v: number, r: Chamado['regras'], tipo: string = 'servico'): string {
  if (tipo === 'obra') return 'os Procuradores'
  if (v <= r.alcada_coordenacao_max) return 'a Coordenação do grupo'
  if (v <= r.alcada_gestao_max) return 'a Gestão de Manutenção'
  return 'os Procuradores'
}

function FormAcao({ acao, c, erros, enviando, aoEnviar, aoCancelar }: PropsForm) {
  const [texto, setTexto] = useState('')
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState<'servico' | 'obra'>(acao === 'mudar_tipo' ? (c.tipo === 'obra' ? 'servico' : 'obra') : c.tipo)
  const [prioridade, setPrioridade] = useState(c.prioridade ?? (c.urgente ? 'alta' : ''))
  const [responsavel, setResponsavel] = useState(c.responsavel ? String(c.responsavel.id) : '')
  const [resultado, setResultado] = useState('')
  const [pessoas, setPessoas] = useState<{ id: number; nome: string; perfis: string[] }[] | null>(null)
  const [areas, setAreas] = useState<Area[] | null>(null)
  const [area, setArea] = useState(c.area ? String(c.area.id) : '')
  const [cats, setCats] = useState<Categoria[] | null>(null)
  const [categoria, setCategoria] = useState(c.categoria ? String(c.categoria.id) : '')
  const precisaPessoas = acao === 'triar' || acao === 'atribuir'

  useEffect(() => {
    if (!precisaPessoas) return
    api<{ id: number; nome: string; perfis: string[] }[]>('GET', '/chamados/responsaveis').then(setPessoas).catch(() => setPessoas([]))
    api<Area[]>('GET', '/areas').then(setAreas).catch(() => setAreas([]))
    if (acao === 'triar') api<Categoria[]>('GET', '/chamados/categorias').then(setCats).catch(() => setCats([]))
  }, [precisaPessoas, acao])

  const r = c.regras
  const v = numero(valor)
  const temOrcamento = c.anexos.some((a) => a.categoria === 'orcamento')
  const rodape = (rotulo: string, perigo = false, liberado = true) => (
    <div className="acoes-form">
      <button type="button" className="botao" onClick={aoCancelar}>Voltar</button>
      <button className={'botao ' + (perigo ? 'botao-perigo' : 'botao-cheio')} disabled={enviando || !liberado}>{enviando ? 'Salvando…' : rotulo}</button>
    </div>
  )
  const enviar = (d: Record<string, unknown>) => (e: FormEvent) => { e.preventDefault(); aoEnviar(d) }
  const papel = (p: string[]) => p.includes('equipe_manutencao') ? 'Equipe' : p.includes('engenharia') ? 'Engenharia' : p.includes('compras') ? 'Compras' : p.includes('coordenacao_manutencao') ? 'Coordenação' : 'Gestão'
  const escolhaTipo = (
    <div className="campo">
      <label>É serviço ou obra?</label>
      <div className="segmentado segmentado-grande" role="radiogroup" aria-label="Tipo">
        <button type="button" role="radio" aria-checked={tipo === 'servico'} className={tipo === 'servico' ? 'ativo' : ''} onClick={() => setTipo('servico')}>Serviço</button>
        <button type="button" role="radio" aria-checked={tipo === 'obra'} className={tipo === 'obra' ? 'ativo' : ''} onClick={() => setTipo('obra')}>Obra</button>
      </div>
      <small>{tipo === 'obra' ? 'Obra: o valor é o teto, aprovado pelos Procuradores; os gastos são lançados na OS.' : 'Serviço: aprovado conforme a alçada do valor.'}</small>
      {erros.tipo && <small className="msg-erro">{erros.tipo}</small>}
    </div>
  )
  const areaEscolhida = areas?.find((a) => String(a.id) === area)
  const membros = areaEscolhida?.membros ?? []
  const outros = (pessoas ?? []).filter((p) => !membros.some((m) => m.id === p.id))
  const selecaoArea = (
    <div className={'campo' + (erros.area_id ? ' campo-erro' : '')}>
      <label htmlFor="c-area">Encaminhar para a área</label>
      <select id="c-area" value={area} onChange={(e) => { setArea(e.target.value); setResponsavel('') }}>
        <option value="">{areas ? 'Nenhuma área (fica com a manutenção)' : 'Carregando…'}</option>
        {areas?.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.membros.length ? ` (${a.membros.length})` : ' (sem pessoas ainda)'}</option>)}
      </select>
      <small>{areaEscolhida ? `Quem é da área ${areaEscolhida.nome} passa a ver e cuidar deste chamado.` : 'Civil, Elétrica, Compras… As pessoas entram nas áreas pelo cadastro de usuário.'}</small>
      {erros.area_id && <small className="msg-erro">{erros.area_id}</small>}
    </div>
  )
  const selecaoPessoa = (
    <div className={'campo' + (erros.responsavel_id ? ' campo-erro' : '')}>
      <label htmlFor="c-resp">Responsável (opcional)</label>
      <select id="c-resp" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
        <option value="">{pessoas ? (areaEscolhida ? 'Qualquer pessoa da área' : 'Ninguém por enquanto') : 'Carregando…'}</option>
        {membros.length > 0 && <optgroup label={`Área ${areaEscolhida?.nome}`}>{membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</optgroup>}
        {outros.length > 0 && <optgroup label="Manutenção">{outros.map((p) => <option key={p.id} value={p.id}>{p.nome} — {papel(p.perfis)}</option>)}</optgroup>}
      </select>
      {erros.responsavel_id && <small className="msg-erro">{erros.responsavel_id}</small>}
    </div>
  )
  const selecaoCategoria = (
    <div className={'campo' + (erros.categoria_id ? ' campo-erro' : '')}>
      <label htmlFor="c-cat">Tipo do problema{c.categoria ? '' : ' (o chamado veio sem)'}</label>
      <select id="c-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
        <option value="">{cats ? 'Escolha…' : 'Carregando…'}</option>
        {cats?.map((x) => <option key={x.id} value={x.id}>{x.nome}{x.exige_parecer_seguranca ? ' · passa pela Segurança' : ''}</option>)}
      </select>
      {erros.categoria_id && <small className="msg-erro">{erros.categoria_id}</small>}
    </div>
  )

  switch (acao) {
    case 'triar':
      return (
        <form onSubmit={enviar({ prioridade, tipo, area_id: area || null, responsavel_id: responsavel || null, categoria_id: categoria || null, texto })} noValidate>
          {escolhaTipo}
          {selecaoArea}
          {selecaoCategoria}
          <div className={'campo' + (erros.prioridade ? ' campo-erro' : '')}>
            <label>Prioridade</label>
            <div className="opcoes-grandes" role="radiogroup" aria-label="Prioridade">
              {Object.entries(PRIORIDADES).map(([k, nome]) => (
                <button type="button" key={k} role="radio" aria-checked={prioridade === k} className={'opcao tom-prio-' + k + (prioridade === k ? ' escolhida' : '')}
                  onClick={() => setPrioridade(k)}>{nome}</button>
              ))}
            </div>
            {erros.prioridade && <small className="msg-erro">{erros.prioridade}</small>}
          </div>
          {selecaoPessoa}
          <AreaTexto rotulo="Observação (opcional)" nome="texto" valor={texto} aoMudar={setTexto} erro={erros.texto} linhas={2} />
          {rodape('Concluir triagem', false, !!prioridade)}
        </form>
      )
    case 'mudar_tipo':
      return (
        <form onSubmit={enviar({ tipo, texto })} noValidate>
          {escolhaTipo}
          <AreaTexto rotulo="Por quê (opcional)" nome="texto" valor={texto} aoMudar={setTexto} erro={erros.texto} linhas={2} />
          {rodape('Salvar', false, tipo !== c.tipo)}
        </form>
      )
    case 'atribuir':
      return (
        <form onSubmit={enviar({ area_id: area || null, responsavel_id: responsavel || null, texto })} noValidate>
          {selecaoArea}{selecaoPessoa}
          <AreaTexto rotulo="Observação (opcional)" nome="texto" valor={texto} aoMudar={setTexto} linhas={2} />
          {rodape('Salvar')}
        </form>
      )
    case 'enviar_orcamento':
      return (
        <form onSubmit={enviar({ valor, servico: texto })} noValidate>
          <AreaTexto rotulo={c.tipo === 'obra' ? 'Escopo da obra' : 'O que será feito'} nome="servico" valor={texto} aoMudar={setTexto} erro={erros.servico} linhas={3} obrigatorio
            placeholder={c.tipo === 'obra' ? 'Ex.: Recuperar a laje, trocar o forro e pintar o salão.' : 'Ex.: Trocar o reparo da válvula de descarga e a vedação.'} />
          <Campo rotulo={c.tipo === 'obra' ? 'Teto da obra (R$)' : 'Valor total (R$)'} nome="valor" valor={valor} aoMudar={setValor} erro={erros.valor} inputMode="decimal"
            dica={c.tipo === 'obra' ? 'Quanto pode ser gasto na obra. Se faltar, pede-se um teto novo na OS.' : 'Material e mão de obra. Use 0 se não houver custo.'} obrigatorio />
          {v !== null && (
            <p className="dica-passo"><Icone nome="certo" tamanho={16} />Quem aprova {reais(v)}: {nivelPara(v, r, c.tipo)}.</p>
          )}
          {c.tipo === 'servico' && v !== null && v > r.orcamento_obrigatorio_acima && !temOrcamento && (
            <Aviso tipo="info">Acima de {reais(r.orcamento_obrigatorio_acima)} é preciso anexar o orçamento (foto ou PDF) em “Fotos e documentos”, abaixo.</Aviso>
          )}
          {c.exige_parecer && !(c.parecer && c.parecer.resultado !== 'desfavoravel') && (
            <p className="dica-passo"><Icone nome="escudo" tamanho={16} />Antes da aprovação, passa pela Segurança do Trabalho.</p>
          )}
          {rodape('Enviar para aprovação', false, !!texto.trim() && valor !== '')}
        </form>
      )
    case 'parecer':
      return (
        <form onSubmit={enviar({ resultado, texto })} noValidate>
          <div className={'campo' + (erros.resultado ? ' campo-erro' : '')}>
            <label>Parecer</label>
            <div className="opcoes-grandes" role="radiogroup" aria-label="Parecer">
              {([['favoravel', 'Favorável'], ['com_ressalvas', 'Com ressalvas'], ['desfavoravel', 'Desfavorável']] as const).map(([k, nome]) => (
                <button type="button" key={k} role="radio" aria-checked={resultado === k} className={'opcao tom-parecer-' + k + (resultado === k ? ' escolhida' : '')}
                  onClick={() => setResultado(k)}>{nome}</button>
              ))}
            </div>
          </div>
          <AreaTexto rotulo={resultado === 'favoravel' ? 'Observação (opcional)' : 'Orientações de segurança'} nome="texto" valor={texto} aoMudar={setTexto}
            erro={erros.texto} linhas={3} obrigatorio={resultado !== 'favoravel' && resultado !== ''}
            dica={resultado === 'desfavoravel' ? 'O orçamento volta para ser refeito seguindo estas orientações.' : 'Ex.: EPIs, NR-10 / NR-35, isolamento da área.'} />
          {rodape('Registrar parecer', false, !!resultado)}
        </form>
      )
    case 'aprovar':
      return (
        <form onSubmit={enviar({ texto })} noValidate>
          <div className="resumo-aprovacao">
            <div><span>{c.tipo === 'obra' ? 'Teto da obra' : 'Valor'}</span><strong>{reais(c.valor_estimado)}</strong></div>
            {c.em_reaprovacao && <div><span>Aprovado antes</span><strong>{reais(c.valor_aprovado)}</strong></div>}
            <div><span>Alçada</span><strong>{c.nivel_nome}</strong></div>
          </div>
          <p className="dica-passo"><Icone nome="documento" tamanho={16} />Ao aprovar, a Ordem de Serviço é aberta na hora.</p>
          {c.tipo === 'servico' && !temOrcamento && (c.valor_estimado ?? 0) > 0 && <p className="fraco">Sem orçamento anexado (não é obrigatório até {reais(r.orcamento_obrigatorio_acima)}).</p>}
          <AreaTexto rotulo="Observação (opcional)" nome="texto" valor={texto} aoMudar={setTexto} linhas={2} />
          {rodape('Confirmar aprovação')}
        </form>
      )
    case 'devolver':
      return (
        <form onSubmit={enviar({ texto })} noValidate>
          <AreaTexto rotulo={c.em_reaprovacao ? 'Por que o aumento não foi aprovado' : 'O que precisa mudar'} nome="texto" valor={texto} aoMudar={setTexto}
            erro={erros.texto} linhas={3} obrigatorio
            dica={c.em_reaprovacao ? `O serviço continua com o valor aprovado antes (${reais(c.valor_aprovado)}).` : 'O orçamento volta para quem fez, para ser revisto.'} />
          {rodape('Devolver', true, !!texto.trim())}
        </form>
      )
    case 'ajustar_valor': {
      const aumento = v !== null && c.valor_aprovado !== null ? v - c.valor_aprovado : 0
      const precisa = v !== null && c.valor_aprovado !== null && aumento > 0 && (
        aumento >= r.reaprovacao_aumento_min || nivelPara(v, r) !== nivelPara(c.valor_aprovado, r))
      return (
        <form onSubmit={enviar({ valor, texto })} noValidate>
          <Campo rotulo="Novo valor total (R$)" nome="valor" valor={valor} aoMudar={setValor} erro={erros.valor} inputMode="decimal"
            dica={`Valor aprovado hoje: ${reais(c.valor_aprovado)}.`} obrigatorio />
          {v !== null && (precisa
            ? <Aviso tipo="info">Este valor precisa de nova aprovação ({aumento >= r.reaprovacao_aumento_min ? 'os Procuradores' : nivelPara(v, r)}). O chamado fica aguardando até lá.</Aviso>
            : <p className="dica-passo"><Icone nome="certo" tamanho={16} />Não precisa de nova aprovação.</p>)}
          <AreaTexto rotulo="Por que mudou" nome="texto" valor={texto} aoMudar={setTexto} erro={erros.texto} linhas={2} obrigatorio />
          {rodape(precisa ? 'Pedir nova aprovação' : 'Salvar novo valor', false, valor !== '' && !!texto.trim())}
        </form>
      )
    }
    case 'reabrir':
      return (
        <form onSubmit={enviar({ texto })} noValidate>
          <AreaTexto rotulo="O que ainda não está bom" nome="texto" valor={texto} aoMudar={setTexto} erro={erros.texto} linhas={3} obrigatorio />
          <p className="dica-passo"><Icone nome="alerta" tamanho={16} />A Ordem de Serviço volta para andamento.</p>
          {rodape('Reabrir chamado', true, !!texto.trim())}
        </form>
      )
    case 'cancelar':
      return (
        <form onSubmit={enviar({ texto })} noValidate>
          <AreaTexto rotulo="Motivo do cancelamento" nome="texto" valor={texto} aoMudar={setTexto} erro={erros.texto} linhas={2} obrigatorio
            dica={c.os ? `A ${c.os.rotulo} também será cancelada.` : 'Ex.: chamado repetido, problema já resolvido pela casa.'} />
          {rodape('Cancelar chamado', true, !!texto.trim())}
        </form>
      )
  }
  return null
}

// ---------------------------------------------------------------- fotos e documentos

function Arquivos({ c, aoMudar }: { c: Chamado; aoMudar: (c: Chamado) => void }) {
  const fotos = c.anexos.filter((a) => a.imagem && a.categoria === 'foto')
  const docs = c.anexos.filter((a) => a.categoria !== 'foto')
  const [aberta, setAberta] = useState<number | null>(null)
  const [envio, setEnvio] = useState('')
  const [erro, setErro] = useState('')
  const aceita = !['encerrado', 'cancelado'].includes(c.status)

  async function mandar(arquivos: File[], categoria: 'foto' | 'documento' | 'orcamento' | 'nota') {
    setErro('')
    for (let i = 0; i < arquivos.length; i++) {
      setEnvio(arquivos.length > 1 ? `Enviando ${i + 1} de ${arquivos.length}…` : 'Enviando…')
      try {
        const a = arquivos[i]
        const dados = a.type === 'application/pdf' ? await lerArquivo(a) : await reduzirImagem(a)
        aoMudar(await api<Chamado>('POST', `/chamados/${c.id}/anexos`, { arquivo: dados, nome: a.name, categoria }))
      } catch (e) {
        setErro(`${arquivos[i].name}: ${mensagemDe(e)}`)
      }
    }
    setEnvio('')
  }

  async function apagar(a: Anexo) {
    if (!confirm('Apagar este arquivo?')) return
    setErro('')
    try { aoMudar(await api<Chamado>('DELETE', `/chamados/${c.id}/anexos/${a.id}`)); setAberta(null) } catch (e) { setErro(mensagemDe(e)) }
  }

  if (!aceita && !c.anexos.length) return null
  return (
    <section className="cartao">
      <div className="cartao-cabeca"><h2>Fotos e arquivos {c.anexos.length > 0 && <small>({c.anexos.length})</small>}</h2></div>
      {erro && <Aviso>{erro}</Aviso>}
      {aceita && <EnviarFotos aoEscolher={(l) => mandar(l, 'foto')} desativado={!!envio} />}
      {aceita && <EnviarDocumento desativado={!!envio} comOrcamento={c.pode_anexar_documento} aoEscolher={(l, cat) => mandar(l, cat)} />}
      {envio && <p className="carregando" role="status"><span className="girador" />{envio}</p>}
      {!c.anexos.length && !envio && <Vazio>Nenhuma foto ou arquivo ainda.</Vazio>}
      {fotos.length > 0 && (
        <ul className="galeria">
          {fotos.map((f, i) => (
            <li key={f.id}>
              <button onClick={() => setAberta(i)} aria-label="Abrir foto"><img src={f.mini_url ?? f.url} alt="" loading="lazy" /></button>
              <span className="galeria-legenda">{f.autor?.split(' ')[0]} · {dataCurta(f.criado_em)}</span>
            </li>
          ))}
        </ul>
      )}
      {docs.length > 0 && (
        <ul className="documentos">
          {docs.map((d) => (
            <li key={d.id}>
              <a href={d.url} target="_blank" rel="noopener">
                <Icone nome="documento" />
                <span><strong>{d.categoria === 'orcamento' ? 'Orçamento' : d.categoria === 'nota' ? 'Nota fiscal' : (d.nome ?? 'Documento')}</strong><small>{d.nome ?? (d.imagem ? 'foto' : 'PDF')} · {d.autor} · {dataCurta(d.criado_em)}</small></span>
              </a>
              {d.pode_apagar && <button className="botao-icone perigo" onClick={() => apagar(d)} aria-label="Apagar documento"><Icone nome="lixo" tamanho={18} /></button>}
            </li>
          ))}
        </ul>
      )}
      {aberta !== null && fotos[aberta] && (
        <Visor fotos={fotos.map((f) => ({ id: f.id, url: f.url, legenda: f.legenda }))} indice={aberta} aoMudarIndice={setAberta} aoFechar={() => setAberta(null)}
          rodape={
            <div className="visor-acoes">
              <span className="visor-texto">{fotos[aberta].autor} · {dataHora(fotos[aberta].criado_em)}</span>
              {fotos[aberta].pode_apagar && (
                <button className="botao botao-pequeno perigo" onClick={() => apagar(fotos[aberta])}><Icone nome="lixo" tamanho={16} />Apagar</button>
              )}
            </div>
          } />
      )}
    </section>
  )
}

type CatDoc = 'documento' | 'orcamento' | 'nota'
function EnviarDocumento({ aoEscolher, desativado, comOrcamento }: { aoEscolher: (a: File[], cat: CatDoc) => void; desativado: boolean; comOrcamento: boolean }) {
  const [cat, setCat] = useState<CatDoc | null>(null)
  const escolher = (c: CatDoc) => {
    setCat(c)
    setTimeout(() => document.getElementById('doc-arquivo')?.click(), 0)
  }
  return (
    <div className="fotos-enviar">
      <input id="doc-arquivo" type="file" accept="image/*,application/pdf" hidden multiple={cat === 'documento'}
        onChange={(e) => { const l = Array.from(e.target.files ?? []); if (l.length && cat) aoEscolher(l, cat); e.target.value = '' }} />
      <button type="button" className="botao botao-pequeno" disabled={desativado} onClick={() => escolher('documento')}><Icone nome="documento" tamanho={18} />Anexar PDF</button>
      {comOrcamento && <button type="button" className="botao botao-pequeno" disabled={desativado} onClick={() => escolher('orcamento')}><Icone nome="documento" tamanho={18} />Anexar orçamento</button>}
      {comOrcamento && <button type="button" className="botao botao-pequeno" disabled={desativado} onClick={() => escolher('nota')}><Icone nome="documento" tamanho={18} />Anexar nota fiscal</button>}
    </div>
  )
}

// ---------------------------------------------------------------- lista de materiais

const SIT_MATERIAL: Record<Material['situacao'], [string, string]> = {
  a_comprar: ['A comprar', 'aguarda'], comprado: ['Comprado', 'andamento'], entregue: ['Entregue', 'feito'], cancelado: ['Cancelado', 'parado'],
}
const UNIDADES = ['un', 'pç', 'cx', 'm', 'm²', 'm³', 'kg', 'L', 'lata', 'saco', 'galão', 'rolo', 'par', 'jogo', 'serviço']
const vazioMaterial = { descricao: '', quantidade: '1', unidade: 'un', valor_unitario: '', observacao: '' }
const qtdTexto = (q: number) => q.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

function Materiais({ c, aoMudar }: { c: Chamado; aoMudar: (c: Chamado) => void }) {
  const lista = c.materiais ?? []
  const pode = c.pode_editar_materiais
  const [form, setForm] = useState<null | { id: number | null; d: typeof vazioMaterial }>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const mudar = (k: keyof typeof vazioMaterial) => (v: string) => setForm((f) => f && { ...f, d: { ...f.d, [k]: v } })

  if (!pode && !lista.length) return null

  const ativos = lista.filter((m) => m.situacao !== 'cancelado')
  const comValor = ativos.filter((m) => m.valor_unitario !== null)
  const total = comValor.reduce((s, m) => s + (m.valor_unitario ?? 0) * m.quantidade, 0)
  const faltam = ativos.filter((m) => m.situacao === 'a_comprar').length

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro(''); setErros({}); setEnviando(true)
    const corpo: Record<string, unknown> = { ...form.d, valor_unitario: form.d.valor_unitario === '' ? null : form.d.valor_unitario }
    if (!c.ve_valores) delete corpo.valor_unitario
    try {
      aoMudar(await api<Chamado>(form.id ? 'PUT' : 'POST', `/chamados/${c.id}/materiais${form.id ? '/' + form.id : ''}`, corpo))
      setForm(form.id ? null : { id: null, d: { ...vazioMaterial } })
      if (!form.id) setTimeout(() => document.getElementById('c-m-descricao')?.focus(), 0)
    } catch (err) { setErro(mensagemDe(err)); setErros(camposDe(err)) } finally { setEnviando(false) }
  }

  async function situacao(m: Material, s: string) {
    setErro('')
    try { aoMudar(await api<Chamado>('PUT', `/chamados/${c.id}/materiais/${m.id}`, { situacao: s })) } catch (err) { setErro(mensagemDe(err)) }
  }

  async function apagar(m: Material) {
    if (!confirm(`Tirar "${m.descricao}" da lista?`)) return
    setErro('')
    try { aoMudar(await api<Chamado>('DELETE', `/chamados/${c.id}/materiais/${m.id}`)); setForm(null) } catch (err) { setErro(mensagemDe(err)) }
  }

  const editar = (m: Material) => setForm({ id: m.id, d: {
    descricao: m.descricao, quantidade: String(m.quantidade).replace('.', ','), unidade: m.unidade,
    valor_unitario: m.valor_unitario === null ? '' : m.valor_unitario.toFixed(2).replace('.', ','), observacao: m.observacao ?? '',
  } })

  return (
    <section className="cartao materiais">
      <div className="cartao-cabeca">
        <h2>Lista de materiais {ativos.length > 0 && <small>({ativos.length})</small>}</h2>
        {pode && !form && <button className="botao botao-cheio botao-pequeno" onClick={() => setForm({ id: null, d: { ...vazioMaterial } })}><Icone nome="mais" tamanho={18} />Adicionar material</button>}
      </div>
      {erro && !form && <Aviso>{erro}</Aviso>}
      {ativos.length > 0 && (
        <ul className="materiais-resumo">
          <li><span>Itens</span><strong>{ativos.length}</strong></li>
          <li><span>A comprar</span><strong className={faltam ? 'tom-aguarda-texto' : ''}>{faltam}</strong></li>
          {c.ve_valores && comValor.length > 0 && <li><span>Total estimado</span><strong>{reais(total)}</strong></li>}
        </ul>
      )}
      {form && (
        <form className="form-material" onSubmit={salvar} noValidate>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="material-campos">
            <div className="m-desc"><Campo rotulo="Material" nome="m-descricao" valor={form.d.descricao} aoMudar={mudar('descricao')} erro={erros.descricao} obrigatorio dica="Ex.: Tinta acrílica branca fosca 18 L" /></div>
            <div className="m-qtd"><Campo rotulo="Qtd." nome="m-quantidade" valor={form.d.quantidade} aoMudar={mudar('quantidade')} erro={erros.quantidade} inputMode="decimal" /></div>
            <div className="campo m-un">
              <label htmlFor="m-unidade">Unidade</label>
              <input id="m-unidade" list="m-unidades" value={form.d.unidade} maxLength={12} onChange={(e) => mudar('unidade')(e.target.value)} />
              <datalist id="m-unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
            </div>
            {c.ve_valores && <div className="m-valor"><Campo rotulo="Valor unit. (R$)" nome="m-valor" valor={form.d.valor_unitario} aoMudar={mudar('valor_unitario')} erro={erros.valor_unitario} inputMode="decimal" /></div>}
          </div>
          <Campo rotulo="Observação (opcional)" nome="m-observacao" valor={form.d.observacao} aoMudar={mudar('observacao')} erro={erros.observacao} dica="Marca, cor, medida, onde comprar…" />
          <div className="acoes-form">
            {form.id && <button type="button" className="link-perigo pequeno" onClick={() => { const m = lista.find((x) => x.id === form.id); if (m) apagar(m) }}>Tirar da lista</button>}
            <button type="button" className="botao" onClick={() => { setForm(null); setErros({}); setErro('') }}>{form.id ? 'Cancelar' : 'Fechar'}</button>
            <button className="botao botao-cheio" disabled={enviando || form.d.descricao.trim().length < 2}>{enviando ? 'Salvando…' : form.id ? 'Salvar' : 'Adicionar'}</button>
          </div>
        </form>
      )}
      {!lista.length && !form && <Vazio>Nenhum material na lista.</Vazio>}
      {lista.length > 0 && (
        <ul className="materiais-cartoes so-celular">
          {lista.map((m) => (
            <li key={m.id} className={m.situacao === 'cancelado' ? 'estornado' : ''}>
              <div className="mc-topo">
                <strong>{m.descricao}</strong>
                {pode && <button className="botao-icone" onClick={() => editar(m)} aria-label={`Editar ${m.descricao}`}><Icone nome="editar" tamanho={16} /></button>}
              </div>
              {m.observacao && <span className="fraco">{m.observacao}</span>}
              <div className="mc-linha">
                <span>{qtdTexto(m.quantidade)} {m.unidade}{c.ve_valores && m.valor_unitario !== null && <> × {reais(m.valor_unitario)} = <b>{reais(m.valor_unitario * m.quantidade)}</b></>}</span>
                {pode ? (
                  <select className={'selo-select tom-' + SIT_MATERIAL[m.situacao][1]} value={m.situacao} aria-label={`Situação de ${m.descricao}`}
                    onChange={(e) => situacao(m, e.target.value)}>
                    {Object.entries(SIT_MATERIAL).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}
                  </select>
                ) : <span className={'selo-status tom-' + SIT_MATERIAL[m.situacao][1]}>{m.situacao_nome}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && (
        <div className="tabela-rolagem so-computador">
          <table className="tabela tabela-materiais">
            <thead><tr>
              <th>Material</th><th className="num">Qtd.</th><th>Un.</th>
              {c.ve_valores && <><th className="num so-computador-cel">Valor unit.</th><th className="num">Total</th></>}
              <th>Situação</th>{pode && <th></th>}
            </tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id} className={m.situacao === 'cancelado' ? 'estornado' : ''}>
                  <td><strong>{m.descricao}</strong>{m.observacao && <span className="fraco bloco">{m.observacao}</span>}</td>
                  <td className="num">{qtdTexto(m.quantidade)}</td>
                  <td>{m.unidade}</td>
                  {c.ve_valores && <>
                    <td className="num so-computador-cel">{m.valor_unitario === null ? '—' : reais(m.valor_unitario)}</td>
                    <td className="num">{m.valor_unitario === null ? '—' : reais(m.valor_unitario * m.quantidade)}</td>
                  </>}
                  <td>
                    {pode ? (
                      <select className={'selo-select tom-' + SIT_MATERIAL[m.situacao][1]} value={m.situacao} aria-label={`Situação de ${m.descricao}`}
                        onChange={(e) => situacao(m, e.target.value)}>
                        {Object.entries(SIT_MATERIAL).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}
                      </select>
                    ) : <span className={'selo-status tom-' + SIT_MATERIAL[m.situacao][1]}>{m.situacao_nome}</span>}
                  </td>
                  {pode && <td className="acoes-linha"><button className="botao-icone" onClick={() => editar(m)} aria-label={`Editar ${m.descricao}`}><Icone nome="editar" tamanho={16} /></button></td>}
                </tr>
              ))}
            </tbody>
            {c.ve_valores && comValor.length > 0 && (
              <tfoot><tr><td colSpan={3}>Total estimado{comValor.length < ativos.length ? ` (${comValor.length} de ${ativos.length} com valor)` : ''}</td><td className="so-computador-cel"></td><td className="num"><strong>{reais(total)}</strong></td><td colSpan={pode ? 2 : 1}></td></tr></tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- linha do tempo

function LinhaDoTempo({ c, aoMudar }: { c: Chamado; aoMudar: (c: Chamado) => void }) {
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const pode = c.acoes.includes('comentar')

  async function comentar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    try { aoMudar(await api<Chamado>('POST', `/chamados/${c.id}/comentarios`, { texto })); setTexto('') } catch (err) { setErro(mensagemDe(err)) } finally { setEnviando(false) }
  }

  // Mais recente primeiro; "enviou um arquivo" seguidos viram uma linha só.
  const eventos: (Evento & { vezes?: number })[] = []
  for (const ev of c.eventos) {
    const ultimo = eventos[eventos.length - 1]
    if (ultimo && ev.tipo === 'anexo' && ultimo.tipo === 'anexo' && ultimo.usuario === ev.usuario) { ultimo.vezes = (ultimo.vezes ?? 1) + 1; continue }
    // Etapas marcadas em sequência pela mesma pessoa no mesmo dia viram um bloco só.
    if (ultimo && ev.tipo === 'etapa' && ultimo.tipo === 'etapa' && ultimo.usuario === ev.usuario && ultimo.criado_em.slice(0, 10) === ev.criado_em.slice(0, 10)) {
      ultimo.texto = (ultimo.texto ?? '') + '\n' + (ev.texto ?? ''); ultimo.vezes = (ultimo.vezes ?? 1) + 1; ultimo.criado_em = ev.criado_em; continue
    }
    eventos.push({ ...ev })
  }
  eventos.reverse()

  return (
    <section className="cartao">
      <h2>Histórico</h2>
      {pode && (
        <form className="form-comentario" onSubmit={comentar} noValidate>
          {erro && <Aviso>{erro}</Aviso>}
          <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma mensagem para quem está cuidando…" aria-label="Mensagem" maxLength={2000} />
          <button className="botao botao-pequeno" disabled={enviando || !texto.trim()}><Icone nome="enviar" tamanho={16} />Enviar</button>
        </form>
      )}
      <ol className="linha-tempo">
        {eventos.map((ev) => {
          const [rotulo, icone] = EVENTOS[ev.tipo] ?? [ev.tipo, 'relogio']
          return (
            <li key={ev.id} className={'ev-' + ev.tipo}>
              <span className="ev-icone"><Icone nome={icone} tamanho={16} /></span>
              <div>
                <p className="ev-cabeca"><strong>{ev.usuario ?? 'Sistema'}</strong> {rotulo.charAt(0).toLowerCase() + rotulo.slice(1)}{ev.vezes ? ` (${ev.vezes})` : ''}
                  {ev.valor !== null && ev.tipo !== 'anexo' && <> · <b>{reais(ev.valor)}</b></>}</p>
                {ev.texto && ev.tipo !== 'anexo' && <p className="ev-texto pre">{ev.texto}</p>}
                <time className="fraco">{dataHora(ev.criado_em)}</time>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------- resumo da tela inicial

export function ResumoChamados({ usuario }: { usuario: Usuario }) {
  const [r, setR] = useState<{ para_mim: number; abertos: number; urgentes: number } | null>(null)
  useEffect(() => { api<{ para_mim: number; abertos: number; urgentes: number }>('GET', '/chamados/resumo').then(setR).catch(() => {}) }, [])
  const podeAbrir = usuario.permissoes.includes('chamados.abrir')
  const blocos: [string, number, string, string][] = r ? [
    ['Para você', r.para_mim, '#/chamados?filtro=para_mim', r.para_mim ? 'destaque' : ''],
    ['Em andamento', r.abertos, '#/chamados?filtro=abertos', ''],
    ...(r.urgentes ? [['Urgentes', r.urgentes, '#/chamados?filtro=abertos', 'urgente'] as [string, number, string, string]] : []),
  ] : []
  return (
    <section className="bloco">
      <div className="bloco-cabeca"><h2>Chamados</h2><a href="#/chamados">Ver todos</a></div>
      {podeAbrir && (
        <a className="botao botao-cheio botao-grande botao-abrir" href="#/chamados/novo"><Icone nome="mais" />Abrir chamado</a>
      )}
      {r && (
        <div className="contadores">
          {blocos.map(([rotulo, n, link, tom]) => (
            <a key={rotulo} href={link} className={'contador-bloco ' + tom}><strong>{n}</strong><span>{rotulo}</span></a>
          ))}
        </div>
      )}
    </section>
  )
}
