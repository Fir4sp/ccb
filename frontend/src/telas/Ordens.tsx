import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  api, PRIORIDADES, type Etapa, type FotoEtapa, type Gasto, type ItemOS, type ModeloEtapas, type OrdemServico,
  type Pendencia, type PedidoTeto, type ResumoOrdens, type Situacao, type Usuario,
} from '../api'
import {
  AreaTexto, Aviso, Campo, Carregando, EnviarFotos, Icone, Topo, Vazio, Visor,
  camposDe, dataCurta, dataDia, dataHora, ir, lerArquivo, mensagemDe, numero, reais, reduzirImagem,
} from '../ui'

// ================================================================ textos, selos e barras

const TOM_OS: Record<string, string> = { aberta: 'aguarda', em_andamento: 'andamento', pausada: 'parado', concluida: 'feito', cancelada: 'parado' }

export function SeloOS({ status, nome }: { status: string; nome: string }) {
  return <span className={'selo-status tom-' + (TOM_OS[status] ?? 'parado')}>{nome}</span>
}

export function SeloTipo({ tipo }: { tipo: 'servico' | 'obra' }) {
  return <span className={'selo-tipo tipo-' + tipo}><Icone nome={tipo === 'obra' ? 'obra' : 'outros'} tamanho={13} />{tipo === 'obra' ? 'Obra' : 'Serviço'}</span>
}

/** Barra de andamento da OS (0 a 100). */
export function BarraProgresso({ valor, grande }: { valor: number | null; grande?: boolean }) {
  const v = valor ?? 0
  return (
    <span className={'barra-progresso' + (grande ? ' grande' : '')}>
      <span className="barra-trilho" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label="Andamento">
        <span className={'barra-cheia' + (v >= 100 ? ' completa' : '')} style={{ width: `${Math.max(v, v > 0 ? 2 : 0)}%` }} />
      </span>
      {!grande && <span className="barra-texto">{valor === null ? 'Sem etapas' : `${fmtPct(v)} concluído`}</span>}
    </span>
  )
}

const fmtPct = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')}%`

/** Barra de gasto × teto: azul até 80%, laranja depois, vermelha quando passa do teto. */
export function BarraTeto({ gasto, teto, alerta = 0.8, grande }: { gasto: number | null; teto: number | null; alerta?: number; grande?: boolean }) {
  if (gasto === null) return null
  if (!teto) return <span className="fraco">Teto ainda não aprovado</span>
  const p = Math.min(1, gasto / teto)
  const passou = gasto > teto + 0.004
  const tom = passou ? 'cheio' : p >= alerta ? 'alerta' : 'ok'
  return (
    <span className={'barra-teto' + (grande ? ' grande' : '')}>
      <span className="barra-trilho" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label="Gasto do teto">
        <span className={'barra-cheia tom-barra-' + tom} style={{ width: `${Math.max(p * 100, 1.5)}%` }} />
      </span>
      {!grande && (passou
        ? <span className="barra-texto passou">Passou do teto em {reais(gasto - teto)}</span>
        : <span className="barra-texto">{reais(gasto)} de {reais(teto)} · {Math.round(p * 100)}%</span>)}
    </span>
  )
}

// ================================================================ lista

export function ItemDaListaOS({ o, semCasa }: { o: ItemOS; semCasa?: boolean }) {
  return (
    <a className={'item item-os' + (o.para_mim ? ' para-mim' : '') + (o.acima_teto ? ' acima-teto' : '')} href={`#/ordens/${o.id}`}>
      <span className="os-numero"><small>OS</small>{String(o.numero).padStart(4, '0')}</span>
      <div>
        <strong>{o.titulo}</strong>
        <span>{semCasa ? '' : `${o.casa.nome} · `}Chamado #{o.chamado.numero}{o.responsavel ? ` · ${o.responsavel.nome}` : ''}</span>
        <span className="linha-selos">
          <SeloTipo tipo={o.tipo} />
          <SeloOS status={o.status} nome={o.status_nome} />
          {o.pendencias_abertas > 0 && <span className="selo-pendencia"><Icone nome="alerta" tamanho={13} />{o.pendencias_abertas} {o.pendencias_abertas === 1 ? 'pendência' : 'pendências'}</span>}
          {o.pedido_pendente && <span className="selo-status tom-aguarda">Teto aguardando</span>}
          {o.para_mim && <span className="selo-vez">Sua vez</span>}
        </span>
      </div>
      <div className="item-lado">
        <strong className="pct">{o.progresso === null ? '—' : fmtPct(o.progresso)}</strong>
        <BarraProgresso valor={o.progresso} grande />
      </div>
    </a>
  )
}

const FILTROS: [string, string][] = [['para_mim', 'Para você'], ['ativas', 'Em andamento'], ['pendencias', 'Com pendências'], ['finalizadas', 'Finalizadas'], ['todas', 'Todas']]
const TIPOS: [string, string][] = [['', 'Serviços e obras'], ['servico', 'Serviços'], ['obra', 'Obras']]

export function ListaOrdens({ usuario, consulta }: { usuario: Usuario; consulta: URLSearchParams }) {
  const [filtro, setFiltro] = useState(consulta.get('filtro') ?? '')
  const [tipo, setTipo] = useState(consulta.get('tipo') ?? '')
  const [busca, setBusca] = useState('')
  const [dados, setDados] = useState<{ itens: ItemOS[]; total: number } | null>(null)
  const [resumo, setResumo] = useState<ResumoOrdens | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api<ResumoOrdens>('GET', '/ordens/resumo').then((r) => {
      setResumo(r)
      setFiltro((f) => f || (r.para_mim > 0 ? 'para_mim' : 'ativas'))
    }).catch(() => setFiltro((f) => f || 'ativas'))
  }, [])

  useEffect(() => {
    if (!filtro) return
    const t = setTimeout(() => {
      const q = new URLSearchParams({ filtro })
      if (tipo) q.set('tipo', tipo)
      if (busca) q.set('busca', busca)
      api<{ itens: ItemOS[]; total: number }>('GET', '/ordens?' + q).then((r) => { setDados(r); setErro('') }).catch((e) => setErro(mensagemDe(e)))
    }, busca ? 300 : 0)
    return () => clearTimeout(t)
  }, [filtro, tipo, busca])

  const vazio: Record<string, string> = {
    para_mim: 'Nenhuma Ordem de Serviço esperando por você.',
    ativas: 'Nenhuma Ordem de Serviço em andamento.',
    pendencias: 'Nenhuma OS com pendência. Tudo em dia.',
    finalizadas: 'Nenhuma OS finalizada ainda.',
    todas: 'Nenhuma Ordem de Serviço ainda. Ela nasce quando um chamado é aprovado.',
  }

  return (
    <main className="pagina pagina-larga pagina-lista">
      <Topo titulo="Ordens de Serviço" acao={
        <div className="topo-acoes">
          {usuario.permissoes.includes('etapas.modelos') && <a className="botao botao-pequeno" href="#/ordens/modelos"><Icone nome="lista" tamanho={18} />Modelos de etapas</a>}
          <a className="botao botao-pequeno" href="#/ordens/pendencias"><Icone nome="alerta" tamanho={18} />Pendências{resumo?.pendencias ? <b className="contador">{resumo.pendencias}</b> : null}</a>
        </div>
      } />
      {resumo && (
        <div className="indicadores">
          <Indicador rotulo="Para você" valor={resumo.para_mim} destaque={resumo.para_mim > 0} aoClicar={() => setFiltro('para_mim')} />
          <Indicador rotulo="Em andamento" valor={resumo.em_andamento} aoClicar={() => setFiltro('ativas')} />
          <Indicador rotulo="A iniciar" valor={resumo.ativas - resumo.em_andamento} aoClicar={() => setFiltro('ativas')} />
          <Indicador rotulo="Pendências abertas" valor={resumo.pendencias} alerta={resumo.pendencias > 0} href="#/ordens/pendencias" />
          {resumo.obras_acima_teto > 0 && <Indicador rotulo="Obras acima do teto" valor={resumo.obras_acima_teto} alerta aoClicar={() => { setTipo('obra'); setFiltro('ativas') }} />}
        </div>
      )}
      <div className="filtros">
        <div className="pilulas" role="group" aria-label="Mostrar">
          {FILTROS.map(([k, rotulo]) => (
            <button key={k} className={filtro === k ? 'ativo' : ''} onClick={() => { setFiltro(k); setDados(null) }}>{rotulo}</button>
          ))}
        </div>
        <div className="filtros-linha">
          <div className="segmentado" role="group" aria-label="Tipo">
            {TIPOS.map(([k, rotulo]) => <button key={k} className={tipo === k ? 'ativo' : ''} onClick={() => { setTipo(k); setDados(null) }}>{rotulo}</button>)}
          </div>
          <label className="busca">
            <Icone nome="busca" tamanho={18} />
            <input type="search" placeholder="Número da OS ou do chamado, casa, palavra" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar ordens" />
          </label>
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados && dados.itens.length === 0 && <div className="vazio-grande"><Vazio>{busca ? 'Nenhuma OS encontrada.' : vazio[filtro]}</Vazio></div>}
      {dados && dados.itens.length > 0 && (
        <>
          <p className="contagem">{dados.total} {dados.total === 1 ? 'ordem de serviço' : 'ordens de serviço'}</p>
          <div className="tabela-cartao so-computador">
            <table className="tabela tabela-chamados">
              <thead><tr><th>OS</th><th>Casa</th><th>Assunto</th><th>Área · responsável</th><th>Status</th><th>Andamento</th></tr></thead>
              <tbody>{dados.itens.map((o) => (
                <tr key={o.id} className={o.para_mim ? 'para-mim' : ''} onClick={() => ir(`/ordens/${o.id}`)}>
                  <td className="col-num"><a href={`#/ordens/${o.id}`} onClick={(e) => e.stopPropagation()}>{String(o.numero).padStart(4, '0')}</a><small>Chamado #{o.chamado.numero}</small></td>
                  <td className="col-casa"><strong>{o.casa.nome}</strong><small>{o.casa.grupo}</small></td>
                  <td className="col-assunto"><strong>{o.titulo}</strong>
                    <span className="linha-selos"><SeloTipo tipo={o.tipo} />
                      {o.pendencias_abertas > 0 && <span className="selo-pendencia"><Icone nome="alerta" tamanho={13} />{o.pendencias_abertas}</span>}
                      {o.acima_teto && <span className="selo-pendencia">Acima do teto</span>}
                      {o.para_mim && <span className="selo-vez">Sua vez</span>}</span></td>
                  <td className="col-area">{o.area ? <strong>{o.area.nome}</strong> : <span className="fraco">—</span>}<small>{o.responsavel?.nome ?? ''}</small></td>
                  <td className="col-status"><SeloOS status={o.status} nome={o.status_nome} /></td>
                  <td className="col-os"><small>{o.progresso === null ? 'Sem etapas' : fmtPct(o.progresso)}</small><BarraProgresso valor={o.progresso} grande /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <ul className="lista so-celular">{dados.itens.map((o) => <li key={o.id}><ItemDaListaOS o={o} /></li>)}</ul>
        </>
      )}
    </main>
  )
}

function Indicador({ rotulo, valor, destaque, alerta, aoClicar, href }: { rotulo: string; valor: number; destaque?: boolean; alerta?: boolean; aoClicar?: () => void; href?: string }) {
  const cls = 'indicador' + (destaque ? ' destaque' : '') + (alerta ? ' alerta' : '')
  const corpo = <><strong>{valor}</strong><span>{rotulo}</span></>
  return href ? <a className={cls} href={href}>{corpo}</a> : <button type="button" className={cls} onClick={aoClicar}>{corpo}</button>
}

// ================================================================ detalhe

export function OrdemDetalhe({ id }: { id: number }) {
  const [o, setO] = useState<OrdemServico | null>(null)
  const [erro, setErro] = useState('')
  const carregar = useCallback(() => api<OrdemServico>('GET', '/ordens/' + id).then(setO).catch((e) => setErro(mensagemDe(e))), [id])
  useEffect(() => { carregar() }, [carregar])

  if (erro && !o) return <main className="pagina"><Topo titulo="Ordem de Serviço" voltar="/ordens" /><Aviso>{erro}</Aviso></main>
  if (!o) return <main className="pagina"><Carregando /></main>
  const obra = o.tipo === 'obra'

  return (
    <main className="pagina pagina-larga pagina-os">
      <Topo titulo={o.rotulo} voltar="/ordens" acao={<a className="botao botao-pequeno" href={`#/chamados/${o.chamado.id}`}><Icone nome="chamados" tamanho={18} />Chamado #{o.chamado.numero}</a>} />

      <section className="cartao cabeca-os">
        <div className="cabeca-linha">
          <span className="chamado-simbolo grande"><Icone nome={o.categoria.icone} tamanho={26} /></span>
          <div>
            <h2>{o.titulo}</h2>
            <a href={`#/casas/${o.casa.id}`}>{o.casa.nome}</a><span className="fraco"> · {o.casa.grupo}</span>
          </div>
        </div>
        <div className="linha-selos">
          <SeloTipo tipo={o.tipo} />
          <SeloOS status={o.status} nome={o.status_nome} />
          {o.prioridade && <span className={'selo-prioridade' + (o.prioridade === 'alta' || o.prioridade === 'emergencia' ? '' : ' fraca')}>Prioridade {PRIORIDADES[o.prioridade].toLowerCase()}</span>}
          {o.pendencias_abertas > 0 && <span className="selo-pendencia"><Icone nome="alerta" tamanho={13} />{o.pendencias_abertas} {o.pendencias_abertas === 1 ? 'pendência' : 'pendências'}</span>}
        </div>
        <dl className="ficha-grade">
          <div><dt>Responsável</dt><dd>{o.responsavel?.nome ?? 'Ainda sem responsável'}</dd></div>
          <div><dt>Aberta em</dt><dd>{dataDia(o.criado_em)}</dd></div>
          <div><dt>Iniciada</dt><dd>{o.iniciada_em ? dataDia(o.iniciada_em) : '—'}</dd></div>
          <div><dt>{o.concluida_em ? 'Concluída' : 'Previsão de término'}</dt><dd>{o.concluida_em ? dataDia(o.concluida_em) : dataDia(o.previsao_fim)}</dd></div>
        </dl>
      </section>

      <div className="os-colunas">
        <div className="os-principal">
          <Andamento o={o} />
          <AcoesOS o={o} aoMudar={setO} />
          {obra && o.ve_valores && o.pedido_pendente_detalhe && <PedidoPendente o={o} aoMudar={setO} />}
          <Etapas o={o} aoMudar={setO} />
          {o.relatorio_final && (
            <section className="cartao">
              <h2>{obra ? 'Relatório final' : 'O que foi feito'}</h2>
              <p className="pre">{o.relatorio_final}</p>
            </section>
          )}
        </div>
        <aside className="os-lateral">
          <Pendencias o={o} aoMudar={setO} />
          {obra && o.ve_valores && <Financeiro o={o} />}
          {!obra && o.ve_valores && o.chamado.valor_aprovado !== null && (
            <section className="cartao">
              <h2>Valor</h2>
              <div className="numeros-obra numeros-dois">
                <div><span>Aprovado</span><strong>{reais(o.chamado.valor_aprovado)}</strong></div>
                <div><span>Atual</span><strong>{reais(o.chamado.valor_estimado)}</strong></div>
              </div>
              {o.chamado.em_reaprovacao && <p className="dica-passo"><Icone nome="alerta" tamanho={16} />O novo valor está aguardando aprovação.</p>}
            </section>
          )}
          <section className="cartao">
            <h2>O pedido</h2>
            <dl className="ficha ficha-plana">
              {o.chamado.local && <div><dt>Onde</dt><dd>{o.chamado.local}</dd></div>}
              <div><dt>O que está acontecendo</dt><dd className="pre">{o.chamado.descricao}</dd></div>
              {o.chamado.servico && <div><dt>{obra ? 'Escopo da obra' : 'O que será feito'}</dt><dd className="pre">{o.chamado.servico}</dd></div>}
            </dl>
            <a className="link-seta" href={`#/chamados/${o.chamado.id}`}>Fotos, conversa e histórico no chamado #{o.chamado.numero}<Icone nome="seta" tamanho={16} /></a>
          </section>
          {obra && o.ve_valores && o.tetos && o.tetos.length > 0 && <HistoricoTetos tetos={o.tetos} />}
        </aside>
      </div>
      {obra && o.ve_valores && o.gastos && <Gastos o={o} aoMudar={setO} />}
    </main>
  )
}

// ---------------------------------------------------------------- andamento e gráfico

function Andamento({ o }: { o: OrdemServico }) {
  const c = o.contagem
  const aplicaveis = o.etapas.length - c.nao_aplica
  return (
    <section className="cartao cartao-andamento">
      <div className="andamento-topo">
        <div className="andamento-numero">
          <strong>{o.progresso === null ? '—' : fmtPct(o.progresso)}</strong>
          <span>{o.progresso === null ? 'Adicione as etapas para acompanhar o andamento' : `concluído · ${c.ok} de ${aplicaveis} ${aplicaveis === 1 ? 'etapa' : 'etapas'} OK`}</span>
        </div>
        <ul className="contagem-etapas" aria-label="Etapas por situação">
          <li className="sit-ok"><b>{c.ok}</b>OK</li>
          <li className="sit-andamento"><b>{c.andamento}</b>Em andamento</li>
          <li className="sit-nao_ok"><b>{c.nao_ok}</b>Não OK</li>
          <li className="sit-nao_aplica"><b>{c.nao_aplica}</b>Não se aplica</li>
          <li className="sit-pendente"><b>{c.pendente}</b>A fazer</li>
        </ul>
      </div>
      <BarraProgresso valor={o.progresso} grande />
      {o.evolucao.length > 0 && o.progresso !== null && (
        <>
          <h3 className="sub">Evolução</h3>
          <GraficoEvolucao pontos={o.evolucao} />
        </>
      )}
    </section>
  )
}

/** Linha da evolução (0 a 100%) por dia. Um ponto por dia: o último valor do dia. */
export function GraficoEvolucao({ pontos }: { pontos: { data: string; percentual: number }[] }) {
  const [foco, setFoco] = useState<number | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(640)
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLargura(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // O desenho acompanha a largura real: no celular o gráfico não encolhe as letras.
  const L = largura, A = largura < 480 ? 180 : 210, m = { e: 40, d: 16, t: 14, b: 28 }
  const w = L - m.e - m.d, h = A - m.t - m.b
  const n = pontos.length
  const x = (i: number) => m.e + (n === 1 ? w / 2 : (i / (n - 1)) * w)
  const y = (v: number) => m.t + h - (v / 100) * h
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.percentual).toFixed(1)}`).join(' ')
  const area = n > 1 ? `${linha} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : ''
  const passo = Math.max(1, Math.ceil(n / (largura < 480 ? 4 : 7)))
  const rotuloData = (d: string) => { const [, mm, dd] = d.split('-'); return `${dd}/${mm}` }
  const ultimo = pontos[n - 1]

  return (
    <div className="grafico-evolucao" ref={caixa}>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Evolução da OS: ${fmtPct(ultimo.percentual)} em ${dataDia(ultimo.data)}`}
        onMouseLeave={() => setFoco(null)}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={m.e} x2={L - m.d} y1={y(v)} y2={y(v)} className="grade" />
            <text x={m.e - 8} y={y(v) + 4} textAnchor="end" className="eixo">{v}%</text>
          </g>
        ))}
        {pontos.map((p, i) => (i % passo === 0 || i === n - 1) && (
          <text key={p.data} x={x(i)} y={A - 8} textAnchor="middle" className="eixo">{rotuloData(p.data)}</text>
        ))}
        {area && <path d={area} className="area" />}
        <path d={linha} className="linha" />
        {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={m.t} y2={m.t + h} className="mira" />}
        {pontos.map((p, i) => (
          <circle key={p.data} cx={x(i)} cy={y(p.percentual)} r={foco === i || i === n - 1 ? 5 : 3.5} className="ponto" />
        ))}
        {pontos.map((p, i) => (
          <rect key={'a' + p.data} x={x(i) - (n === 1 ? w / 2 : w / (n - 1) / 2)} y={m.t} width={n === 1 ? w : w / (n - 1)} height={h}
            fill="transparent" onMouseEnter={() => setFoco(i)} onTouchStart={() => setFoco(i)} />
        ))}
      </svg>
      {foco !== null && (
        <div className="dica-grafico" style={{ left: `${(x(foco) / L) * 100}%` }}>
          <strong>{fmtPct(pontos[foco].percentual)}</strong><span>{dataDia(pontos[foco].data)}</span>
        </div>
      )}
      <table className="so-leitor">
        <caption>Evolução por dia</caption>
        <tbody>{pontos.map((p) => <tr key={p.data}><td>{dataDia(p.data)}</td><td>{fmtPct(p.percentual)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- ações da OS

const ROTULO: Record<string, string> = {
  iniciar: 'Iniciar a OS', retomar: 'Retomar', concluir: 'Concluir a OS', pausar: 'Pausar', pedir_teto: 'Pedir teto novo',
}

function AcoesOS({ o, aoMudar }: { o: OrdemServico; aoMudar: (o: OrdemServico) => void }) {
  const [aberta, setAberta] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { setAberta(null); setTexto(''); setErro(''); setErros({}) }, [o.status, o.pedido_pendente])

  const lista = ['iniciar', 'retomar', 'concluir', 'pausar', 'pedir_teto'].filter((a) => o.acoes.includes(a))
  if (!lista.length) return null
  const obra = o.tipo === 'obra'

  async function executar(acao: string, dados: Record<string, unknown> = {}) {
    setErro(''); setErros({}); setEnviando(true)
    try { aoMudar(await api<OrdemServico>('POST', `/ordens/${o.id}/acoes`, { acao, ...dados })); setAberta(null) }
    catch (e) { setErro(mensagemDe(e)); setErros(camposDe(e)) } finally { setEnviando(false) }
  }
  const clicar = (a: string) => {
    if (a === 'iniciar' || a === 'retomar') return executar(a)
    if (a === 'concluir' && !obra) setValor(o.chamado.valor_estimado !== null ? String(o.chamado.valor_estimado).replace('.', ',') : '')
    setAberta(aberta === a ? null : a)
  }
  const rodape = (rotulo: string, liberado: boolean) => (
    <div className="acoes-form">
      <button type="button" className="botao" onClick={() => setAberta(null)}>Voltar</button>
      <button className="botao botao-cheio" disabled={enviando || !liberado}>{enviando ? 'Salvando…' : rotulo}</button>
    </div>
  )
  const semMarcar = o.etapas.filter((e) => e.situacao === 'pendente' || e.situacao === 'andamento').length

  return (
    <section className={'cartao cartao-acoes' + (o.para_mim ? ' sua-vez' : '')}>
      <h2>{o.status === 'aberta' ? 'Pronta para começar' : 'O que você pode fazer'}</h2>
      {o.status === 'aberta' && <p className="fraco">Monte as etapas abaixo (use um modelo ou crie as suas) e inicie quando a equipe começar.</p>}
      {erro && !aberta && <Aviso>{erro}</Aviso>}
      <div className="botoes-acao">
        {lista.map((a) => (
          <button key={a} className={'botao' + (aberta === a ? ' botao-marcado' : ['iniciar', 'retomar', 'concluir'].includes(a) ? ' botao-cheio' : '')}
            disabled={enviando} onClick={() => clicar(a)}>
            <Icone nome={a === 'iniciar' || a === 'retomar' ? 'play' : a === 'pausar' ? 'pausa' : a === 'concluir' ? 'certo' : 'moeda'} tamanho={18} />{ROTULO[a]}
          </button>
        ))}
      </div>
      {aberta && (
        <div className="painel-acao">
          {erro && <Aviso>{erro}</Aviso>}
          {aberta === 'concluir' && (
            <form onSubmit={(e) => { e.preventDefault(); executar('concluir', obra ? { texto } : { texto, valor }) }} noValidate>
              {semMarcar > 0 && <Aviso tipo="info">Ainda {semMarcar === 1 ? 'há 1 etapa' : `há ${semMarcar} etapas`} sem marcar. Marque cada uma como OK, Não OK ou Não se aplica.</Aviso>}
              {o.pendencias_abertas > 0 && <p className="dica-passo"><Icone nome="alerta" tamanho={16} />A OS pode ser concluída com {o.pendencias_abertas === 1 ? 'a pendência' : 'as pendências'}: elas continuam na lista para resolver depois.</p>}
              <AreaTexto rotulo={obra ? 'Relatório final' : 'O que foi feito'} nome="texto" valor={texto} aoMudar={setTexto} erro={erros.texto} linhas={4} obrigatorio
                dica={obra ? 'O que foi feito, pendências e garantias. Depois de concluída, a obra não aceita mais gastos.' : 'A casa vai conferir e confirmar.'} />
              {!obra && o.ve_valores && (
                <Campo rotulo="Valor final (R$)" nome="valor" valor={valor} aoMudar={setValor} erro={erros.valor} inputMode="decimal"
                  dica={`Aprovado: ${reais(o.chamado.valor_aprovado)}.`} />
              )}
              {rodape(obra ? 'Concluir a obra' : 'Concluir a OS', texto.trim().length >= 5)}
            </form>
          )}
          {aberta === 'pausar' && (
            <form onSubmit={(e) => { e.preventDefault(); executar('pausar', { texto }) }} noValidate>
              <AreaTexto rotulo="Motivo da pausa" nome="texto" valor={texto} aoMudar={setTexto} erro={erros.texto} linhas={2} obrigatorio
                dica="Ex.: aguardando material, chuva, liberação da casa." />
              {rodape('Pausar', texto.trim().length >= 5)}
            </form>
          )}
          {aberta === 'pedir_teto' && (
            <form onSubmit={(e) => { e.preventDefault(); executar('pedir_teto', { valor, texto }) }} noValidate>
              <Campo rotulo="Teto novo (R$)" nome="valor" valor={valor} aoMudar={setValor} erro={erros.valor} inputMode="decimal" obrigatorio
                dica={`Teto atual: ${reais(o.teto)} · já gasto: ${reais(o.gasto)}.`} />
              <AreaTexto rotulo="Por que precisa mudar" nome="texto" valor={texto} aoMudar={setTexto} erro={erros.texto} linhas={3} obrigatorio />
              {rodape('Enviar aos Procuradores', !!valor && !!texto.trim())}
            </form>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- etapas

const SIT_BOTOES: [Situacao, string, string][] = [['ok', 'OK', 'certo'], ['nao_ok', 'Não OK', 'fechar'], ['nao_aplica', 'Não se aplica', 'menos'], ['andamento', 'Em andamento', 'relogio']]

function Etapas({ o, aoMudar }: { o: OrdemServico; aoMudar: (o: OrdemServico) => void }) {
  const [modelos, setModelos] = useState<ModeloEtapas[] | null>(null)
  const [modelo, setModelo] = useState('')
  const [nova, setNova] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aberta, setAberta] = useState<number | null>(null)
  const edita = o.pode_editar_etapas

  useEffect(() => { if (edita) api<ModeloEtapas[]>('GET', '/modelos-etapas').then(setModelos).catch(() => setModelos([])) }, [edita])

  async function chamar(metodo: string, caminho: string, corpo?: unknown) {
    setErro(''); setEnviando(true)
    try { aoMudar(await api<OrdemServico>(metodo, `/ordens/${o.id}${caminho}`, corpo)); return true }
    catch (e) { setErro(mensagemDe(e)); return false } finally { setEnviando(false) }
  }
  const usarModelo = async () => { if (modelo && await chamar('POST', '/etapas', { modelo_id: Number(modelo) })) setModelo('') }
  const adicionar = async (e: FormEvent) => { e.preventDefault(); if (nova.trim() && await chamar('POST', '/etapas', { nome: nova.trim() })) setNova('') }
  const mover = (i: number, d: number) => {
    const ids = o.etapas.map((x) => x.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    chamar('PUT', '/etapas/ordem', { ordem: ids })
  }
  const modeloEscolhido = modelos?.find((m) => String(m.id) === modelo)

  return (
    <section className="cartao cartao-etapas">
      <div className="cartao-cabeca">
        <h2>Etapas {o.etapas.length > 0 && <small>({o.etapas.length})</small>}</h2>
        {o.status === 'aberta' && o.pode_editar_etapas && o.etapas.length > 0 && <span className="fraco">Inicie a OS para marcar as etapas</span>}
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {o.etapas.length === 0 && <Vazio>{edita ? 'Ainda não há etapas. Use um modelo (Pintura, Troca de piso…) ou crie as suas.' : 'As etapas ainda não foram definidas.'}</Vazio>}
      {o.etapas.length > 0 && (
        <ol className="etapas-lista">
          {o.etapas.map((e, i) => (
            <LinhaEtapa key={e.id} e={e} i={i} o={o} aberta={aberta === e.id} aoAbrir={() => setAberta(aberta === e.id ? null : e.id)}
              aoMudar={aoMudar} enviando={enviando} chamar={chamar}
              mover={edita ? (d) => mover(i, d) : undefined} total={o.etapas.length} />
          ))}
        </ol>
      )}
      {edita && (
        <div className="etapas-adicionar">
          <div className="campo campo-linha">
            <label htmlFor="c-modelo">Usar um modelo</label>
            <div className="linha-controles">
              <select id="c-modelo" value={modelo} onChange={(e) => setModelo(e.target.value)}>
                <option value="">{modelos ? 'Escolha o modelo…' : 'Carregando…'}</option>
                {modelos?.map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.etapas.length} etapas)</option>)}
              </select>
              <button type="button" className="botao" disabled={!modelo || enviando} onClick={usarModelo}>Adicionar etapas</button>
            </div>
            {modeloEscolhido && <small>{modeloEscolhido.etapas.join(' · ')}</small>}
          </div>
          <form className="campo campo-linha" onSubmit={adicionar} noValidate>
            <label htmlFor="c-nova-etapa">Etapa personalizada</label>
            <div className="linha-controles">
              <input id="c-nova-etapa" value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Ex.: Trocar a tomada do púlpito" maxLength={150} />
              <button className="botao" disabled={nova.trim().length < 2 || enviando}><Icone nome="mais" tamanho={18} />Adicionar</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function LinhaEtapa({ e, i, o, aberta, aoAbrir, aoMudar, enviando, chamar, mover, total }: {
  e: Etapa; i: number; o: OrdemServico; aberta: boolean; aoAbrir: () => void; aoMudar: (o: OrdemServico) => void
  enviando: boolean; chamar: (m: string, c: string, corpo?: unknown) => Promise<boolean>; mover?: (d: number) => void; total: number
}) {
  const [escolha, setEscolha] = useState<Situacao | null>(null)
  const [obs, setObs] = useState(e.observacao ?? '')
  const [pct, setPct] = useState(e.percentual || 50)
  const [nome, setNome] = useState(e.nome)
  const [renomeando, setRenomeando] = useState(false)
  const [visor, setVisor] = useState<number | null>(null)
  const [envioFoto, setEnvioFoto] = useState('')
  const [erroFoto, setErroFoto] = useState('')
  const marca = o.pode_marcar_etapas
  useEffect(() => { setEscolha(null); setObs(e.observacao ?? ''); setPct(e.percentual || 50) }, [e.situacao, e.percentual, e.observacao])

  const marcar = async (s: Situacao) => {
    // OK e Não se aplica são um toque; Não OK pede o que faltou; Em andamento pede o percentual.
    if (s === 'ok' || s === 'nao_aplica') { await chamar('PUT', `/etapas/${e.id}`, { situacao: s }); return }
    setEscolha(escolha === s ? null : s)
  }
  const salvarEscolha = async (ev: FormEvent) => {
    ev.preventDefault()
    if (await chamar('PUT', `/etapas/${e.id}`, escolha === 'andamento' ? { situacao: 'andamento', percentual: pct, observacao: obs } : { situacao: 'nao_ok', observacao: obs })) setEscolha(null)
  }
  async function mandarFotos(arquivos: File[]) {
    setErroFoto('')
    for (let k = 0; k < arquivos.length; k++) {
      setEnvioFoto(arquivos.length > 1 ? `Enviando ${k + 1} de ${arquivos.length}…` : 'Enviando…')
      try { aoMudar(await api<OrdemServico>('POST', `/ordens/${o.id}/etapas/${e.id}/fotos`, { arquivo: await reduzirImagem(arquivos[k]), nome: arquivos[k].name })) }
      catch (err) { setErroFoto(mensagemDe(err)) }
    }
    setEnvioFoto('')
  }
  async function apagarFoto(f: FotoEtapa) {
    if (!confirm('Apagar esta foto?')) return
    try { aoMudar(await api<OrdemServico>('DELETE', `/ordens/${o.id}/etapas/${e.id}/fotos/${f.id}`)); setVisor(null) } catch (err) { setErroFoto(mensagemDe(err)) }
  }

  return (
    <li className={'etapa sit-' + e.situacao + (aberta ? ' aberta' : '')}>
      <div className="etapa-linha">
        <span className="etapa-marca" aria-hidden="true">{e.situacao === 'ok' ? <Icone nome="certo" tamanho={16} /> : e.situacao === 'nao_ok' ? <Icone nome="fechar" tamanho={16} /> : e.situacao === 'nao_aplica' ? <Icone nome="menos" tamanho={16} /> : i + 1}</span>
        <button className="etapa-nome" onClick={aoAbrir} aria-expanded={aberta}>
          <strong>{e.nome}</strong>
          <span>
            {e.situacao === 'andamento' ? `Em andamento · ${e.percentual}%` : e.situacao_nome}
            {e.atualizado_por && e.situacao !== 'pendente' ? ` · ${e.atualizado_por.split(' ')[0]}, ${dataCurta(e.atualizado_em)}` : ''}
            {e.fotos.length > 0 && <> · <Icone nome="camera" tamanho={13} />{e.fotos.length}</>}
          </span>
          {e.observacao && e.situacao !== 'ok' && <em className="etapa-obs">{e.observacao}</em>}
        </button>
        {marca && (
          <div className="etapa-botoes" role="group" aria-label={`Situação de ${e.nome}`}>
            {SIT_BOTOES.map(([s, rotulo, icone]) => (
              <button key={s} type="button" title={rotulo} aria-pressed={e.situacao === s}
                className={'sit-botao sb-' + s + (e.situacao === s ? ' marcado' : '') + (escolha === s ? ' escolhendo' : '')}
                disabled={enviando} onClick={() => marcar(s)}>
                <Icone nome={icone} tamanho={16} /><span>{rotulo}</span>
              </button>
            ))}
          </div>
        )}
        {e.situacao === 'andamento' && <span className="etapa-pct" style={{ ['--pct' as string]: `${e.percentual}%` }} aria-hidden="true" />}
      </div>
      {escolha && (
        <form className="etapa-form" onSubmit={salvarEscolha} noValidate>
          {escolha === 'andamento' && (
            <div className="campo">
              <label htmlFor={'pct-' + e.id}>Quanto já foi feito: <b>{pct}%</b></label>
              <input id={'pct-' + e.id} type="range" min={5} max={95} step={5} value={pct} onChange={(ev) => setPct(Number(ev.target.value))} />
            </div>
          )}
          <AreaTexto rotulo={escolha === 'nao_ok' ? 'O que não está OK' : 'Observação (opcional)'} nome={'obs-' + e.id} valor={obs} aoMudar={setObs} linhas={2}
            obrigatorio={escolha === 'nao_ok'} dica={escolha === 'nao_ok' ? 'Vira uma pendência para resolver depois. Não trava a OS.' : undefined} />
          <div className="acoes-form">
            <button type="button" className="botao" onClick={() => setEscolha(null)}>Voltar</button>
            <button className={'botao ' + (escolha === 'nao_ok' ? 'botao-perigo' : 'botao-cheio')} disabled={enviando || (escolha === 'nao_ok' && obs.trim().length < 3)}>
              {escolha === 'nao_ok' ? 'Marcar Não OK' : `Salvar ${pct}%`}
            </button>
          </div>
        </form>
      )}
      {aberta && (
        <div className="etapa-detalhe">
          {erroFoto && <Aviso>{erroFoto}</Aviso>}
          {e.fotos.length > 0 && (
            <ul className="galeria galeria-mini">
              {e.fotos.map((f, k) => (
                <li key={f.id}><button onClick={() => setVisor(k)} aria-label="Abrir foto"><img src={f.mini_url ?? f.url} alt="" loading="lazy" /></button></li>
              ))}
            </ul>
          )}
          {o.pode_enviar_fotos && <EnviarFotos aoEscolher={mandarFotos} desativado={!!envioFoto} rotuloGaleria="Da galeria" />}
          {envioFoto && <p className="carregando" role="status"><span className="girador" />{envioFoto}</p>}
          {mover && (
            <div className="etapa-edicao">
              {renomeando ? (
                <form className="linha-controles" onSubmit={async (ev) => { ev.preventDefault(); if (await chamar('PUT', `/etapas/${e.id}`, { nome })) setRenomeando(false) }} noValidate>
                  <input value={nome} onChange={(ev) => setNome(ev.target.value)} aria-label="Nome da etapa" maxLength={150} autoFocus />
                  <button type="button" className="botao botao-pequeno" onClick={() => { setRenomeando(false); setNome(e.nome) }}>Voltar</button>
                  <button className="botao botao-pequeno botao-cheio" disabled={nome.trim().length < 2 || enviando}>Salvar</button>
                </form>
              ) : (
                <>
                  <button className="botao-texto" onClick={() => setRenomeando(true)}><Icone nome="editar" tamanho={16} />Renomear</button>
                  <button className="botao-texto" disabled={i === 0 || enviando} onClick={() => mover(-1)}><Icone nome="cima" tamanho={16} />Subir</button>
                  <button className="botao-texto" disabled={i === total - 1 || enviando} onClick={() => mover(1)}><Icone nome="baixo" tamanho={16} />Descer</button>
                  {e.situacao === 'pendente' && !e.pendencia_id && (
                    <button className="botao-texto perigo" disabled={enviando} onClick={() => { if (confirm(`Tirar a etapa "${e.nome}"?`)) chamar('DELETE', `/etapas/${e.id}`) }}><Icone nome="lixo" tamanho={16} />Tirar</button>
                  )}
                </>
              )}
            </div>
          )}
          {!e.fotos.length && !o.pode_enviar_fotos && !mover && <p className="fraco">Sem fotos nesta etapa.</p>}
        </div>
      )}
      {visor !== null && e.fotos[visor] && (
        <Visor fotos={e.fotos.map((f) => ({ id: f.id, url: f.url, legenda: f.legenda }))} indice={visor} aoMudarIndice={setVisor} aoFechar={() => setVisor(null)}
          rodape={
            <div className="visor-acoes">
              <span className="visor-texto">{e.nome} · {e.fotos[visor].autor} · {dataHora(e.fotos[visor].criado_em)}</span>
              {e.fotos[visor].pode_apagar && <button className="botao botao-pequeno perigo" onClick={() => apagarFoto(e.fotos[visor])}><Icone nome="lixo" tamanho={16} />Apagar</button>}
            </div>
          } />
      )}
    </li>
  )
}

// ---------------------------------------------------------------- pendências

function Pendencias({ o, aoMudar }: { o: OrdemServico; aoMudar: (o: OrdemServico) => void }) {
  const abertas = o.pendencias.filter((p) => p.status === 'aberta')
  const resolvidas = o.pendencias.filter((p) => p.status === 'resolvida')
  const [verResolvidas, setVerResolvidas] = useState(false)
  if (!o.pendencias.length) return null
  return (
    <section className={'cartao cartao-pendencias' + (abertas.length ? ' com-abertas' : '')}>
      <h2>Pendências {abertas.length > 0 && <small>({abertas.length} {abertas.length === 1 ? 'aberta' : 'abertas'})</small>}</h2>
      {abertas.length === 0 && <p className="fraco">Todas resolvidas.</p>}
      <ul className="pendencias">
        {abertas.map((p) => <ItemPendencia key={p.id} p={p} osId={o.id} pode={o.pode_resolver_pendencias} aoMudar={aoMudar} />)}
        {verResolvidas && resolvidas.map((p) => <ItemPendencia key={p.id} p={p} osId={o.id} pode={false} aoMudar={aoMudar} />)}
      </ul>
      {resolvidas.length > 0 && (
        <button className="botao-texto" onClick={() => setVerResolvidas(!verResolvidas)}>
          {verResolvidas ? 'Esconder resolvidas' : `Ver ${resolvidas.length} ${resolvidas.length === 1 ? 'resolvida' : 'resolvidas'}`}
        </button>
      )}
    </section>
  )
}

function ItemPendencia({ p, osId, pode, aoMudar, comOrigem }: { p: Pendencia; osId: number; pode: boolean; aoMudar: (o: OrdemServico) => void; comOrigem?: boolean }) {
  const [resolvendo, setResolvendo] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function resolver(e: FormEvent) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    try { aoMudar(await api<OrdemServico>('POST', `/ordens/${osId}/pendencias/${p.id}/resolver`, { texto })); setResolvendo(false) }
    catch (err) { setErro(mensagemDe(err)) } finally { setEnviando(false) }
  }
  return (
    <li className={'pendencia ' + p.status}>
      <div className="pendencia-cabeca">
        <span className="pendencia-icone"><Icone nome={p.status === 'aberta' ? 'alerta' : 'certo'} tamanho={16} /></span>
        <div>
          {comOrigem && p.os && <a className="pendencia-origem" href={`#/ordens/${p.os.id}`}>{p.os.rotulo} · {p.casa?.nome}</a>}
          <strong>{p.etapa}</strong>
          <p className="pre">{p.descricao}</p>
          <span className="fraco">{p.aberta_por} · {dataCurta(p.criado_em)}</span>
          {p.status === 'resolvida' && <span className="pendencia-resolucao"><Icone nome="certo" tamanho={14} />{p.resolucao} — {p.resolvida_por}, {dataCurta(p.resolvida_em)}</span>}
        </div>
      </div>
      {pode && p.status === 'aberta' && !resolvendo && <button className="botao botao-pequeno" onClick={() => setResolvendo(true)}>Resolver</button>}
      {resolvendo && (
        <form className="pendencia-form" onSubmit={resolver} noValidate>
          {erro && <Aviso>{erro}</Aviso>}
          <AreaTexto rotulo="O que foi feito" nome={'res-' + p.id} valor={texto} aoMudar={setTexto} linhas={2} obrigatorio dica="A etapa passa a OK." />
          <div className="acoes-form">
            <button type="button" className="botao" onClick={() => setResolvendo(false)}>Voltar</button>
            <button className="botao botao-cheio" disabled={enviando || texto.trim().length < 3}>Marcar como resolvida</button>
          </div>
        </form>
      )}
    </li>
  )
}

export function ListaPendencias() {
  const [status, setStatus] = useState<'aberta' | 'resolvida'>('aberta')
  const [itens, setItens] = useState<Pendencia[] | null>(null)
  const [erro, setErro] = useState('')
  const carregar = useCallback(() => {
    setItens(null)
    api<Pendencia[]>('GET', '/ordens/pendencias?status=' + status).then(setItens).catch((e) => setErro(mensagemDe(e)))
  }, [status])
  useEffect(() => { carregar() }, [carregar])
  return (
    <main className="pagina">
      <Topo titulo="Pendências" voltar="/ordens" />
      <p className="contexto">Cada etapa marcada como Não OK vira uma pendência. Ela não trava a OS e pode ser resolvida depois, abrindo a OS.</p>
      <div className="segmentado" role="group" aria-label="Mostrar">
        <button className={status === 'aberta' ? 'ativo' : ''} onClick={() => setStatus('aberta')}>Abertas</button>
        <button className={status === 'resolvida' ? 'ativo' : ''} onClick={() => setStatus('resolvida')}>Resolvidas</button>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!itens && !erro && <Carregando />}
      {itens && itens.length === 0 && <Vazio>{status === 'aberta' ? 'Nenhuma pendência aberta.' : 'Nenhuma pendência resolvida ainda.'}</Vazio>}
      {itens && itens.length > 0 && (
        <section className="cartao">
          <ul className="pendencias">
            {itens.map((p) => (
              <ItemPendencia key={p.id} p={p} osId={p.os!.id} pode={false} aoMudar={carregar} comOrigem />
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

// ---------------------------------------------------------------- obra: teto e gastos

function Financeiro({ o }: { o: OrdemServico }) {
  const alerta = o.alerta ?? 0.8
  return (
    <section className={'cartao cartao-financeiro' + (o.acima_teto ? ' acima-teto' : '')}>
      <h2>Teto da obra</h2>
      {o.acima_teto && o.saldo !== null && (
        <p className="alerta-teto"><Icone nome="alerta" tamanho={18} />Passou do teto em {reais(-o.saldo)}.{o.pedido_pendente ? ' O teto novo está com os Procuradores.' : ' Peça um teto novo aos Procuradores.'}</p>
      )}
      <div className="numeros-obra">
        <div><span>Teto</span><strong>{reais(o.teto)}</strong></div>
        <div><span>Gasto</span><strong>{reais(o.gasto)}</strong></div>
        <div className={o.saldo !== null && o.teto && o.saldo <= o.teto * (1 - alerta) ? 'saldo-baixo' : ''}><span>Saldo</span><strong>{reais(o.saldo)}</strong></div>
      </div>
      <BarraTeto gasto={o.gasto} teto={o.teto} alerta={alerta} grande />
      {o.percentual_gasto !== null && !o.acima_teto && <p className="fraco">{Math.round(o.percentual_gasto * 100)}% do teto já foi usado.</p>}
    </section>
  )
}

function PedidoPendente({ o, aoMudar }: { o: OrdemServico; aoMudar: (o: OrdemServico) => void }) {
  const p = o.pedido_pendente_detalhe
  const [recusando, setRecusando] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (!p) return null
  const decide = o.acoes.includes('decidir_teto')

  async function decidir(decisao: 'aprovar' | 'recusar') {
    setErro(''); setEnviando(true)
    try { aoMudar(await api<OrdemServico>('POST', `/ordens/${o.id}/acoes`, { acao: 'decidir_teto', decisao, texto })); setRecusando(false); setTexto('') }
    catch (e) { setErro(mensagemDe(e)) } finally { setEnviando(false) }
  }

  return (
    <section className={'cartao cartao-acoes' + (decide ? ' sua-vez' : '')}>
      <h2>{decide ? 'Sua vez: ' : ''}pedido de teto novo</h2>
      <div className="resumo-aprovacao">
        <div><span>Teto atual</span><strong>{reais(p.valor_anterior)}</strong></div>
        <div><span>Teto novo</span><strong>{reais(p.valor_novo)}</strong></div>
        {p.valor_anterior !== null && <div><span>Diferença</span><strong>{p.valor_novo > p.valor_anterior ? '+' : ''}{reais(p.valor_novo - p.valor_anterior)}</strong></div>}
      </div>
      <p className="pre motivo-pedido">{p.motivo}</p>
      <p className="fraco">Pedido por {p.pedido_por} · {dataHora(p.criado_em)}</p>
      {erro && <Aviso>{erro}</Aviso>}
      {decide && !recusando && (
        <div className="botoes-acao">
          <button className="botao botao-cheio" disabled={enviando} onClick={() => decidir('aprovar')}>Aprovar {reais(p.valor_novo)}</button>
          <button className="botao" disabled={enviando} onClick={() => setRecusando(true)}>Recusar</button>
        </div>
      )}
      {decide && recusando && (
        <div className="painel-acao">
          <form onSubmit={(e) => { e.preventDefault(); decidir('recusar') }} noValidate>
            <AreaTexto rotulo="Por que não foi aprovado" nome="texto" valor={texto} aoMudar={setTexto} linhas={2} obrigatorio />
            <div className="acoes-form">
              <button type="button" className="botao" onClick={() => setRecusando(false)}>Voltar</button>
              <button className="botao botao-perigo" disabled={enviando || !texto.trim()}>Recusar pedido</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function Gastos({ o, aoMudar }: { o: OrdemServico; aoMudar: (o: OrdemServico) => void }) {
  const gastos = o.gastos ?? []
  const categorias = o.categorias_gasto ?? {}
  const pode = o.acoes.includes('lancar_gasto')
  const [aberto, setAberto] = useState(false)
  const hoje = new Date().toLocaleDateString('sv-SE')
  const [d, setD] = useState({ data: hoje, categoria: '', descricao: '', fornecedor: '', valor: '' })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [estornando, setEstornando] = useState<Gasto | null>(null)
  const [motivo, setMotivo] = useState('')
  const [verEstornados, setVerEstornados] = useState(false)
  const mudar = (k: keyof typeof d) => (v: string) => setD((x) => ({ ...x, [k]: v }))

  async function lancar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setErros({}); setEnviando(true)
    try {
      let comprovante: string | undefined
      if (arquivo) comprovante = arquivo.type === 'application/pdf' ? await lerArquivo(arquivo) : await reduzirImagem(arquivo)
      aoMudar(await api<OrdemServico>('POST', `/ordens/${o.id}/gastos`, { ...d, comprovante, comprovante_nome: arquivo?.name }))
      setD({ data: hoje, categoria: '', descricao: '', fornecedor: '', valor: '' }); setArquivo(null); setAberto(false)
    } catch (err) { setErro(mensagemDe(err)); setErros(camposDe(err)) } finally { setEnviando(false) }
  }

  async function estornar(e: FormEvent) {
    e.preventDefault()
    if (!estornando) return
    setErro(''); setEnviando(true)
    try { aoMudar(await api<OrdemServico>('POST', `/ordens/${o.id}/gastos/${estornando.id}/estorno`, { texto: motivo })); setEstornando(null); setMotivo('') }
    catch (err) { setErro(mensagemDe(err)) } finally { setEnviando(false) }
  }

  const valorDigitado = numero(d.valor)
  const passa = valorDigitado !== null && o.saldo !== null && valorDigitado > o.saldo + 0.004
  const visiveis = gastos.filter((g) => verEstornados || !g.estornado)
  const estornados = gastos.filter((g) => g.estornado).length
  const porCat = Object.entries(o.por_categoria ?? {}).filter(([, v]) => v > 0)

  return (
    <section className="cartao">
      <div className="cartao-cabeca">
        <h2>Gastos da obra {gastos.length > 0 && <small>({gastos.length - estornados})</small>}</h2>
        {pode && !aberto && <button className="botao botao-cheio botao-pequeno" onClick={() => setAberto(true)}><Icone nome="mais" tamanho={18} />Lançar gasto</button>}
      </div>
      {erro && !aberto && <Aviso>{erro}</Aviso>}
      {aberto && (
        <form className="form-ministerio" onSubmit={lancar} noValidate>
          {erro && <Aviso>{erro}</Aviso>}
          <div className={'campo' + (erros.categoria ? ' campo-erro' : '')}>
            <label>Tipo do gasto</label>
            <div className="opcoes-grandes">
              {Object.entries(categorias).map(([k, nome]) => (
                <button type="button" key={k} className={'opcao' + (d.categoria === k ? ' escolhida' : '')} onClick={() => mudar('categoria')(k)}>{nome}</button>
              ))}
            </div>
            {erros.categoria && <small className="msg-erro">{erros.categoria}</small>}
          </div>
          <Campo rotulo="Descrição" nome="g-descricao" valor={d.descricao} aoMudar={mudar('descricao')} erro={erros.descricao} obrigatorio dica="Ex.: 40 sacos de cimento, diária do pedreiro." />
          <Campo rotulo="Fornecedor (opcional)" nome="g-fornecedor" valor={d.fornecedor} aoMudar={mudar('fornecedor')} erro={erros.fornecedor} />
          <div className="duas-colunas">
            <Campo rotulo="Valor (R$)" nome="g-valor" valor={d.valor} aoMudar={mudar('valor')} erro={erros.valor} inputMode="decimal" obrigatorio
              dica={o.saldo !== null ? `Saldo: ${reais(o.saldo)}` : undefined} />
            <Campo rotulo="Data" nome="g-data" tipo="date" valor={d.data} aoMudar={mudar('data')} erro={erros.data} />
          </div>
          {passa && <Aviso tipo="info">Este gasto passa do teto em {reais((valorDigitado ?? 0) - (o.saldo ?? 0))}. Ele será lançado, mas a obra fica em vermelho até os Procuradores aprovarem um teto novo.</Aviso>}
          <div className="campo">
            <label htmlFor="g-arquivo">Nota fiscal ou recibo (foto ou PDF)</label>
            <input id="g-arquivo" type="file" accept="image/*,application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </div>
          <div className="acoes-form">
            <button type="button" className="botao" onClick={() => { setAberto(false); setErros({}); setErro('') }}>Cancelar</button>
            <button className="botao botao-cheio" disabled={enviando || !d.categoria || !d.descricao.trim() || !d.valor}>{enviando ? 'Salvando…' : passa ? 'Lançar mesmo assim' : 'Lançar'}</button>
          </div>
        </form>
      )}
      {porCat.length > 0 && (
        <ul className="por-categoria">
          {porCat.map(([k, v]) => <li key={k}><span>{categorias[k]}</span><strong>{reais(v)}</strong></li>)}
        </ul>
      )}
      {gastos.length === 0 && !aberto && <Vazio>{o.status === 'aberta' ? 'Os gastos começam a ser lançados quando a obra for iniciada.' : 'Nenhum gasto lançado ainda.'}</Vazio>}
      {visiveis.length > 0 && (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Lançado por</th><th className="num">Valor</th><th></th></tr></thead>
            <tbody>
              {visiveis.map((g) => (
                <tr key={g.id} className={g.estornado ? 'estornado' : ''}>
                  <td>{dataDia(g.data)}</td>
                  <td>
                    <strong>{g.descricao}</strong>{g.fornecedor && <span className="fraco"> · {g.fornecedor}</span>}
                    {g.estornado && <span className="motivo-estorno">Estornado por {g.estornado_por}: {g.motivo_estorno}</span>}
                    {estornando?.id === g.id && (
                      <form className="form-estorno" onSubmit={estornar} noValidate>
                        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo do estorno (ex.: lançado em dobro)" aria-label="Motivo do estorno" autoFocus />
                        <button type="button" className="botao botao-pequeno" onClick={() => setEstornando(null)}>Voltar</button>
                        <button className="botao botao-pequeno botao-perigo" disabled={enviando || motivo.trim().length < 5}>Estornar</button>
                      </form>
                    )}
                  </td>
                  <td>{categorias[g.categoria]}</td>
                  <td>{g.lancado_por}</td>
                  <td className="num">{reais(g.valor)}</td>
                  <td className="acoes-linha">
                    {g.comprovante_url && <a href={g.comprovante_url} target="_blank" rel="noopener"><Icone nome="documento" tamanho={16} />Nota</a>}
                    {!g.estornado && o.pode_estornar && estornando?.id !== g.id && <button className="link-perigo pequeno" onClick={() => { setEstornando(g); setMotivo('') }}>Estornar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {estornados > 0 && (
        <button className="botao-texto" onClick={() => setVerEstornados(!verEstornados)}>
          {verEstornados ? 'Esconder estornados' : `Mostrar ${estornados} ${estornados === 1 ? 'estornado' : 'estornados'}`}
        </button>
      )}
    </section>
  )
}

function HistoricoTetos({ tetos }: { tetos: PedidoTeto[] }) {
  const nome = { pendente: 'Aguardando', aprovado: 'Aprovado', recusado: 'Recusado' }
  return (
    <section className="cartao">
      <h2>Pedidos de teto</h2>
      <ul className="tetos">
        {tetos.map((p) => (
          <li key={p.id}>
            <div className="gasto-linha">
              <div>
                <strong>{p.valor_anterior === null ? `Teto inicial: ${reais(p.valor_novo)}` : `${reais(p.valor_anterior)} → ${reais(p.valor_novo)}`}</strong>
                <span className="fraco">{p.pedido_por} · {dataCurta(p.criado_em)}</span>
              </div>
              <span className={'selo-status tom-' + (p.status === 'aprovado' ? 'feito' : p.status === 'pendente' ? 'aguarda' : 'parado')}>{nome[p.status]}</span>
            </div>
            {p.decidido_por && p.valor_anterior !== null && <p className="fraco">{p.decidido_por}{p.resposta ? `: ${p.resposta}` : ''}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ================================================================ modelos de etapas

export function ModelosEtapas() {
  const [modelos, setModelos] = useState<ModeloEtapas[] | null>(null)
  const [editando, setEditando] = useState<number | 'novo' | null>(null)
  const [erro, setErro] = useState('')
  const carregar = useCallback(() => api<ModeloEtapas[]>('GET', '/modelos-etapas?todos=1').then(setModelos).catch((e) => setErro(mensagemDe(e))), [])
  useEffect(() => { carregar() }, [carregar])

  return (
    <main className="pagina">
      <Topo titulo="Modelos de etapas" voltar="/ordens"
        acao={editando !== 'novo' && <button className="botao botao-cheio botao-pequeno" onClick={() => setEditando('novo')}><Icone nome="mais" tamanho={18} />Novo modelo</button>} />
      <p className="contexto">Ao montar uma OS, a equipe escolhe um modelo e as etapas entram de uma vez. Dá para ajustar em cada OS. Mudar um modelo não mexe nas OS que já usaram.</p>
      {erro && <Aviso>{erro}</Aviso>}
      {editando === 'novo' && <FormModelo aoSalvar={() => { setEditando(null); carregar() }} aoCancelar={() => setEditando(null)} />}
      {!modelos && !erro && <Carregando />}
      {modelos && (
        <ul className="lista modelos">
          {modelos.map((m) => (
            <li key={m.id} className={m.ativo ? '' : 'inativo'}>
              {editando === m.id ? (
                <FormModelo m={m} aoSalvar={() => { setEditando(null); carregar() }} aoCancelar={() => setEditando(null)} />
              ) : (
                <button className="item" onClick={() => setEditando(m.id)}>
                  <span className="item-simbolo"><Icone nome="lista" /></span>
                  <div>
                    <strong>{m.nome}{!m.ativo && <span className="selo-status tom-parado">Desativado</span>}</strong>
                    <span>{m.etapas.length} etapas: {m.etapas.slice(0, 4).join(' · ')}{m.etapas.length > 4 ? ' …' : ''}</span>
                  </div>
                  <Icone nome="editar" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function FormModelo({ m, aoSalvar, aoCancelar }: { m?: ModeloEtapas; aoSalvar: () => void; aoCancelar: () => void }) {
  const [nome, setNome] = useState(m?.nome ?? '')
  const [etapas, setEtapas] = useState(m ? m.etapas.join('\n') : '')
  const [ativo, setAtivo] = useState(m?.ativo ?? true)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const lista = etapas.split('\n').map((l) => l.trim()).filter((l) => l.length >= 2)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setErros({}); setEnviando(true)
    try {
      await api(m ? 'PUT' : 'POST', m ? `/modelos-etapas/${m.id}` : '/modelos-etapas', { nome, etapas: lista, ativo })
      aoSalvar()
    } catch (err) { setErro(mensagemDe(err)); setErros(camposDe(err)) } finally { setEnviando(false) }
  }

  return (
    <form className="cartao form-modelo" onSubmit={salvar} noValidate>
      <h2>{m ? 'Editar modelo' : 'Novo modelo'}</h2>
      {erro && <Aviso>{erro}</Aviso>}
      <Campo rotulo="Nome" nome="m-nome" valor={nome} aoMudar={setNome} erro={erros.nome} obrigatorio dica="Ex.: Pintura, Troca de piso, Bebedouro." />
      <AreaTexto rotulo="Etapas (uma por linha, na ordem)" nome="m-etapas" valor={etapas} aoMudar={setEtapas} erro={erros.etapas} linhas={Math.max(6, lista.length + 1)} obrigatorio
        placeholder={'Proteção do piso\nMassa corrida\nPrimeira demão\nSegunda demão'} dica={`${lista.length} ${lista.length === 1 ? 'etapa' : 'etapas'}`} />
      {m && (
        <label className="caixa">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          <span><strong>Ativo</strong><small>Desativado, o modelo some da lista ao montar uma OS.</small></span>
        </label>
      )}
      <div className="acoes-form">
        <button type="button" className="botao" onClick={aoCancelar}>Cancelar</button>
        <button className="botao botao-cheio" disabled={enviando || nome.trim().length < 2 || !lista.length}>{enviando ? 'Salvando…' : 'Salvar modelo'}</button>
      </div>
    </form>
  )
}

// ================================================================ tela inicial e página da casa

export function ResumoOrdensInicio() {
  const [r, setR] = useState<ResumoOrdens | null>(null)
  useEffect(() => { api<ResumoOrdens>('GET', '/ordens/resumo').then(setR).catch(() => {}) }, [])
  if (!r || (r.ativas === 0 && r.pendencias === 0)) return null
  const blocos: [string, number, string, string][] = [
    ['Para você', r.para_mim, '#/ordens?filtro=para_mim', r.para_mim ? 'destaque' : ''],
    ['Em andamento', r.em_andamento, '#/ordens?filtro=ativas', ''],
    ['Pendências', r.pendencias, '#/ordens/pendencias', r.pendencias ? 'urgente' : ''],
    ...(r.tetos_aguardando ? [['Teto aguardando', r.tetos_aguardando, '#/ordens?tipo=obra', ''] as [string, number, string, string]] : []),
    ...(r.obras_acima_teto ? [['Obras acima do teto', r.obras_acima_teto, '#/ordens?tipo=obra', 'urgente'] as [string, number, string, string]] : []),
  ]
  return (
    <section className="bloco">
      <div className="bloco-cabeca"><h2>Ordens de Serviço</h2><a href="#/ordens">Ver todas</a></div>
      <div className="contadores">
        {blocos.map(([rotulo, n, link, tom]) => <a key={rotulo} href={link} className={'contador-bloco ' + tom}><strong>{n}</strong><span>{rotulo}</span></a>)}
      </div>
    </section>
  )
}

export function OrdensDaCasa({ casaId }: { casaId: number }) {
  const [itens, setItens] = useState<ItemOS[] | null>(null)
  useEffect(() => {
    api<{ itens: ItemOS[] }>('GET', `/ordens?filtro=todas&casa_id=${casaId}`).then((r) => setItens(r.itens)).catch(() => setItens(null))
  }, [casaId])
  if (!itens || itens.length === 0) return null
  return (
    <section className="cartao">
      <h2>Serviços e obras <small>({itens.length})</small></h2>
      <ul className="lista lista-plana">{itens.slice(0, 5).map((o) => <li key={o.id}><ItemDaListaOS o={o} semCasa /></li>)}</ul>
    </section>
  )
}
