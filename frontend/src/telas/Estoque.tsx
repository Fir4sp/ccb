import { useEffect, useState, type FormEvent } from 'react'
import { api, type LocalEstoque, type ResumoLocal } from '../api'
import { AreaTexto, Aviso, Campo, Carregando, Icone, Topo, Vazio, camposDe, dataCurta, mensagemDe } from '../ui'
import { Contador, FotoProduto } from './Limpeza'

type Locais = { central: (ResumoLocal & { abaixo_minimo: { id: number; nome: string; quantidade: number; minimo: number }[] }) | null; casas: ResumoLocal[] }

function quando(s: string | null): string {
  return s ? `contado ${dataCurta(s)}` : 'ainda não contado'
}

// ================================================================ lista de DMLs

export function ListaEstoques() {
  const [d, setD] = useState<Locais | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  useEffect(() => { api<Locais>('GET', '/estoque/locais').then(setD).catch((e) => setErro(mensagemDe(e))) }, [])
  if (erro) return <main className="pagina"><Topo titulo="Estoque" voltar="/limpeza" /><Aviso>{erro}</Aviso></main>
  if (!d) return <main className="pagina"><Carregando /></main>
  const casas = d.casas.filter((c) => !busca || (c.casa?.nome ?? '').toLowerCase().includes(busca.toLowerCase()))

  return (
    <main className="pagina">
      <Topo titulo="Estoque de limpeza" voltar="/limpeza" />
      {d.central && (
        <a className={'cartao cartao-link' + (d.central.abaixo_minimo.length ? ' alerta-borda' : '')} href={`#/limpeza/estoque/${d.central.id}`}>
          <Icone nome="balde" />
          <span>
            <strong>DML Central</strong>
            <small>{d.central.produtos} produtos · {d.central.unidades} unidades · {d.central.ultima_contagem ? `contado ${dataCurta(d.central.ultima_contagem)}` : 'ainda não contado'}</small>
            {d.central.abaixo_minimo.length > 0 && <small className="texto-alerta">Abaixo do mínimo: {d.central.abaixo_minimo.map((a) => `${a.nome} (${a.quantidade}/${a.minimo})`).join(', ')}</small>}
          </span>
          <Icone nome="seta" />
        </a>
      )}
      <section className="bloco">
        <h2>{d.casas.length === 1 ? 'DML da casa' : `DMLs das casas (${d.casas.length})`}</h2>
        {d.casas.length > 6 && (
          <label className="busca margem-baixo"><Icone nome="busca" tamanho={18} />
            <input type="search" placeholder="Buscar casa" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar casa" /></label>
        )}
        {casas.length === 0 && <Vazio>Nenhuma casa.</Vazio>}
        <ul className="lista">
          {casas.map((l) => (
            <li key={l.id}>
              <a className="item" href={`#/limpeza/estoque/${l.id}`}>
                <div>
                  <strong>{l.casa?.nome}</strong>
                  <span>{l.casa?.grupo} · {l.unidades} {l.unidades === 1 ? 'unidade' : 'unidades'} em estoque</span>
                  <span className={'fraco' + (!l.ultima_contagem ? ' texto-aguarda' : '')}>{quando(l.ultima_contagem)}</span>
                </div>
                <Icone nome="seta" />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

// ================================================================ um DML

export function EstoqueDetalhe({ id }: { id: number }) {
  const [d, setD] = useState<LocalEstoque | null>(null)
  const [modo, setModo] = useState<'ver' | 'contar' | 'entrada' | 'saida' | 'enviar'>('ver')
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  useEffect(() => { api<LocalEstoque>('GET', '/estoque/locais/' + id).then(setD).catch((e) => setErro(mensagemDe(e))) }, [id])

  if (erro && !d) return <main className="pagina"><Topo titulo="Estoque" voltar="/limpeza/estoque" /><Aviso>{erro}</Aviso></main>
  if (!d) return <main className="pagina"><Carregando /></main>
  const titulo = d.local.tipo === 'central' ? 'DML Central' : d.local.casa?.nome ?? d.local.nome
  const voltarPara = (n: LocalEstoque, msg: string) => { setD(n); setModo('ver'); setAviso(msg); window.scrollTo(0, 0) }

  if (modo === 'contar') return <Contagem d={d} titulo={titulo} aoCancelar={() => setModo('ver')} aoSalvar={(n) => voltarPara(n, 'Contagem salva. O estoque foi atualizado.')} />
  if (modo !== 'ver') return <Movimento d={d} tipo={modo} aoCancelar={() => setModo('ver')} aoSalvar={(n) => voltarPara(n, 'Lançamento salvo.')} />

  const comSaldo = d.saldos.filter((s) => s.quantidade > 0 || (s.minimo !== null && s.ativo))
  return (
    <main className="pagina">
      <Topo titulo={titulo} voltar="/limpeza/estoque" />
      <p className="contexto">{d.local.tipo === 'central' ? 'Galpão / depósito central' : `DML Local · ${d.local.casa?.grupo}`} · {d.local.ultima_contagem ? `última contagem ${dataCurta(d.local.ultima_contagem)}` : 'ainda não contado'}</p>
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {d.acoes.length > 0 && (
        <div className="botoes-acao">
          {d.acoes.includes('contar') && <button className="botao botao-cheio" onClick={() => { setAviso(''); setModo('contar') }}><Icone nome="certo" />Fazer contagem</button>}
          {d.acoes.includes('entrada') && <button className="botao" onClick={() => { setAviso(''); setModo('entrada') }}><Icone nome="mais" />Entrada</button>}
          {d.acoes.includes('saida') && <button className="botao" onClick={() => { setAviso(''); setModo('saida') }}><Icone nome="menos" />Saída</button>}
          {d.acoes.includes('enviar') && <button className="botao" onClick={() => { setAviso(''); setModo('enviar') }}><Icone nome="enviar" />Enviar para uma casa</button>}
        </div>
      )}
      <section className="cartao margem-cima">
        <h2>O que tem agora</h2>
        {comSaldo.length === 0 && <Vazio>Nenhum produto em estoque.{d.acoes.includes('contar') ? ' Faça a primeira contagem.' : ''}</Vazio>}
        <ul className="revisao">
          {comSaldo.map((s) => {
            const baixo = s.minimo !== null && s.quantidade < s.minimo
            return (
              <li key={s.produto_id} className={baixo ? 'abaixo-minimo' : ''}>
                <FotoProduto url={s.mini_url} categoria={s.categoria} />
                <span><strong>{s.nome}</strong><small>{s.embalagem}{s.minimo !== null ? ` · mínimo ${s.minimo}` : ''}{s.contado_em ? ` · ${quando(s.contado_em)}` : ''}</small></span>
                <span className="qtd-final"><b>{s.quantidade}</b><small>{s.unidade}</small></span>
              </li>
            )
          })}
        </ul>
      </section>
      <section className="cartao">
        <h2>Movimentações</h2>
        {d.movimentos.length === 0 && <Vazio>Nada registrado ainda.</Vazio>}
        <ul className="movimentos">
          {d.movimentos.map((m) => (
            <li key={m.id}>
              <span className={'mov-qtd ' + (m.quantidade > 0 ? 'mais' : 'menos')}>{m.quantidade > 0 ? '+' : ''}{m.quantidade}</span>
              <span>
                <strong>{m.produto}</strong>
                <small>{m.origem_nome}{m.outro_local ? ` · ${m.quantidade > 0 ? 'de' : 'para'} ${m.outro_local.replace('DML Local — ', '')}` : ''}{m.motivo && m.origem !== 'distribuicao' && m.origem !== 'compra' ? ` · ${m.motivo}` : ''}</small>
                <small className="fraco">{m.usuario} · {dataCurta(m.criado_em)} · ficou {m.saldo_apos}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

function Contagem({ d, titulo, aoCancelar, aoSalvar }: { d: LocalEstoque; titulo: string; aoCancelar: () => void; aoSalvar: (n: LocalEstoque) => void }) {
  const ativos = d.saldos.filter((s) => s.ativo || s.quantidade > 0)
  const [qtd, setQtd] = useState<Record<number, number>>(() => Object.fromEntries(ativos.map((s) => [s.produto_id, s.quantidade])))
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const mudou = ativos.filter((s) => qtd[s.produto_id] !== s.quantidade).length

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    try {
      aoSalvar(await api<LocalEstoque>('POST', `/estoque/locais/${d.local.id}/contagem`, {
        itens: ativos.map((s) => ({ produto_id: s.produto_id, contado: qtd[s.produto_id] })), observacao: obs,
      }))
    } catch (err) { setErro(mensagemDe(err)) } finally { setEnviando(false) }
  }

  return (
    <main className="pagina">
      <Topo titulo={`Contagem · ${titulo}`} />
      <button className="botao-texto voltar-loja" onClick={aoCancelar}><Icone nome="voltar" tamanho={18} />Voltar sem salvar</button>
      <p className="dica-passo"><Icone nome="certo" tamanho={16} />Conte o que tem no DML e acerte cada produto com + e −. O que não mexer fica como está.</p>
      {erro && <Aviso>{erro}</Aviso>}
      <form className="cartao" onSubmit={salvar} noValidate>
        <ul className="revisao">
          {ativos.map((s) => (
            <li key={s.produto_id} className={qtd[s.produto_id] !== s.quantidade ? 'alterado' : ''}>
              <FotoProduto url={s.mini_url} categoria={s.categoria} />
              <span><strong>{s.nome}</strong><small>{s.embalagem} · antes: {s.quantidade}</small></span>
              <Contador valor={qtd[s.produto_id]} nome={s.nome} max={null} semLixo
                aoMenos={() => setQtd({ ...qtd, [s.produto_id]: Math.max(0, qtd[s.produto_id] - 1) })}
                aoMais={() => setQtd({ ...qtd, [s.produto_id]: qtd[s.produto_id] + 1 })} />
            </li>
          ))}
        </ul>
        <AreaTexto rotulo="Observação (opcional)" nome="obs-contagem" valor={obs} aoMudar={setObs} linhas={2} />
        <button className="botao botao-cheio botao-grande" disabled={enviando}>{enviando ? 'Salvando…' : `Salvar contagem${mudou ? ` (${mudou} ${mudou === 1 ? 'mudança' : 'mudanças'})` : ''}`}</button>
      </form>
    </main>
  )
}

function Movimento({ d, tipo, aoCancelar, aoSalvar }: {
  d: LocalEstoque; tipo: 'entrada' | 'saida' | 'enviar'; aoCancelar: () => void; aoSalvar: (n: LocalEstoque) => void
}) {
  const ativos = d.saldos.filter((s) => s.ativo && (tipo === 'entrada' || s.quantidade > 0))
  const [qtd, setQtd] = useState<Record<number, number>>({})
  const [motivo, setMotivo] = useState('')
  const [casa, setCasa] = useState('')
  const [casas, setCasas] = useState<ResumoLocal[]>([])
  useEffect(() => { if (tipo === 'enviar') api<Locais>('GET', '/estoque/locais').then((r) => setCasas(r.casas)).catch(() => {}) }, [tipo])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const titulo = { entrada: 'Entrada no Central', saida: 'Saída do Central', enviar: 'Enviar para uma casa' }[tipo]
  const itens = Object.entries(qtd).filter(([, q]) => q > 0)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setErros({}); setEnviando(true)
    try {
      aoSalvar(await api<LocalEstoque>('POST', `/estoque/locais/${d.local.id}/movimentos`, {
        tipo, motivo, casa_id: casa ? Number(casa) : undefined, itens: itens.map(([produto_id, quantidade]) => ({ produto_id: Number(produto_id), quantidade })),
      }))
    } catch (err) { setErro(mensagemDe(err)); setErros(camposDe(err)) } finally { setEnviando(false) }
  }

  return (
    <main className="pagina">
      <Topo titulo={titulo} />
      <button className="botao-texto voltar-loja" onClick={aoCancelar}><Icone nome="voltar" tamanho={18} />Voltar sem salvar</button>
      {erro && <Aviso>{erro}</Aviso>}
      <form className="cartao painel-form" onSubmit={salvar} noValidate>
        {tipo === 'enviar' && (
          <div className={'campo' + (erros.casa_id ? ' campo-erro' : '')}>
            <label htmlFor="mv-casa">Para qual casa</label>
            <select id="mv-casa" value={casa} onChange={(e) => setCasa(e.target.value)}>
              <option value="">Escolha a casa…</option>
              {[...new Set(casas.map((c) => c.casa?.grupo ?? ''))].map((g) => (
                <optgroup key={g} label={g}>{casas.filter((c) => c.casa?.grupo === g).map((c) => <option key={c.id} value={c.casa?.id}>{c.casa?.nome}</option>)}</optgroup>
              ))}
            </select>
            {erros.casa_id && <small className="msg-erro">{erros.casa_id}</small>}
          </div>
        )}
        <Campo rotulo="Motivo" nome="mv-motivo" valor={motivo} aoMudar={setMotivo} erro={erros.motivo} obrigatorio
          dica={{ entrada: 'Ex.: doação, compra avulsa.', saida: 'Ex.: produto vencido, galão furado, uso no galpão.', enviar: 'Ex.: faltou para a Santa Ceia.' }[tipo]} />
        {ativos.length === 0 && <Vazio>Nenhum produto com saldo no Central.</Vazio>}
        <ul className="revisao">
          {ativos.map((s) => (
            <li key={s.produto_id} className={qtd[s.produto_id] ? 'alterado' : ''}>
              <FotoProduto url={s.mini_url} categoria={s.categoria} />
              <span><strong>{s.nome}</strong><small>{s.embalagem} · no Central: {s.quantidade}</small></span>
              <Contador valor={qtd[s.produto_id] ?? 0} nome={s.nome} semLixo max={tipo === 'entrada' ? null : s.quantidade}
                aoMenos={() => setQtd({ ...qtd, [s.produto_id]: Math.max(0, (qtd[s.produto_id] ?? 0) - 1) })}
                aoMais={() => setQtd({ ...qtd, [s.produto_id]: (qtd[s.produto_id] ?? 0) + 1 })} />
            </li>
          ))}
        </ul>
        {erros.quantidade && <Aviso>{erros.quantidade}</Aviso>}
        <button className="botao botao-cheio botao-grande" disabled={enviando || itens.length === 0 || motivo.trim().length < 3}>
          {enviando ? 'Salvando…' : `Salvar ${itens.length ? `(${itens.length} ${itens.length === 1 ? 'produto' : 'produtos'})` : ''}`}
        </button>
      </form>
    </main>
  )
}
