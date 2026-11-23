import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api, type AgendaLimpeza, type Ciclo, type Loja, type PedidoLimpeza, type Produto, type ResumoLimpeza, type Usuario } from '../api'
import { AreaTexto, Aviso, Campo, Carregando, Icone, Selecao, Topo, Vazio, camposDe, dataCurta, dataDia, dataHora, ir, mensagemDe, reais, reduzirImagem } from '../ui'

// ================================================================ textos

const TOM_PEDIDO: Record<string, string> = {
  rascunho: 'aguarda', enviado: 'andamento', conferido: 'andamento', devolvido: 'aguarda', aprovado: 'feito', entregue: 'feito', cancelado: 'parado',
}
const ICONE_CATEGORIA: Record<string, string> = {
  limpeza: 'balde', banheiro: 'gota', cozinha: 'balde', descartaveis: 'lixo', utensilios: 'outros', epi: 'escudo', equipamentos: 'ajustes', outros: 'outros',
}
const EVENTOS: Record<string, string> = {
  criado: 'Começou o pedido', enviado: 'Enviou o pedido', envio_desfeito: 'Desfez o envio para corrigir',
  conferido: 'Fez a 1ª análise e passou para a coordenação', aprovado: 'Aprovou o pedido (análise final)',
  devolvido: 'Devolveu para ajuste', recebido: 'Confirmou o recebimento', fora_do_ciclo: 'Ficou fora do ciclo', faltou_na_entrega: 'Registrou o que faltou na entrega',
}
const TAREFAS: Record<string, string> = {
  fechar: 'Fechar o ciclo', consolidar: 'Consolidar e liberar a compra', comprar: 'Registrar a compra', receber: 'Registrar a chegada da compra', distribuir: 'Marcar a entrega',
}

function diasAte(data: string): number {
  const [a, m, d] = data.split('-').map(Number)
  const alvo = new Date(a, m - 1, d)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

function textoPrazo(c: Ciclo): string {
  if (c.status !== 'aberto') return c.status_nome
  const n = diasAte(c.prazo)
  if (n < 0) return `Prazo encerrado em ${dataDia(c.prazo)}`
  if (n === 0) return 'Último dia para pedir: hoje'
  if (n === 1) return 'Último dia para pedir: amanhã'
  return `Pedidos até ${dataDia(c.prazo)} (faltam ${n} dias)`
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const precoTexto = (p: number | null, unidade?: string) => p === null ? 'Sem preço' : reais(p) + (unidade ? ` / ${unidade}` : '')

function SeloPedido({ status, nome }: { status: string | null; nome: string }) {
  return <span className={'selo-status tom-' + (status ? TOM_PEDIDO[status] ?? 'parado' : 'aguarda')}>{nome}</span>
}

export function FotoProduto({ url, categoria, grande }: { url: string | null; categoria: string; grande?: boolean }) {
  return (
    <span className={'foto-produto' + (grande ? ' grande' : '')}>
      {url ? <img src={url} alt="" loading="lazy" /> : <Icone nome={ICONE_CATEGORIA[categoria] ?? 'balde'} tamanho={grande ? 44 : 24} />}
    </span>
  )
}

// ================================================================ painel

export function PainelLimpeza({ usuario }: { usuario: Usuario }) {
  const [r, setR] = useState<ResumoLimpeza | null>(null)
  const [erro, setErro] = useState('')
  const carregar = useCallback(() => api<ResumoLimpeza>('GET', '/cns/resumo').then(setR).catch((e) => setErro(mensagemDe(e))), [])
  useEffect(() => { carregar() }, [carregar])
  const pode = (p: string) => usuario.permissoes.includes(p)

  if (erro) return <main className="pagina"><Topo titulo="Limpeza" /><Aviso>{erro}</Aviso></main>
  if (!r) return <main className="pagina"><Carregando /></main>
  const c = r.ciclo
  const final = pode('cns.gerir')

  return (
    <main className="pagina">
      <Topo titulo="Material de limpeza" />
      {c ? (
        <section className={'cartao cartao-ciclo tom-ciclo-' + c.status}>
          <span className="rotulo-pequeno">Pedido do mês{c.automatico ? ' · aberto pela agenda' : ''}</span>
          <h2>{c.nome}</h2>
          <p className="prazo-ciclo"><Icone nome="relogio" tamanho={18} />{textoPrazo(c)}</p>
          {c.observacao && <p className="pre fraco">{c.observacao}</p>}
        </section>
      ) : (
        <Aviso tipo="info">Nenhum pedido aberto no momento.{r.agenda?.proxima ? ` O próximo (${r.agenda.proxima.nome}) abre em ${dataDia(r.agenda.proxima.abre)}.` : ' A Coordenação CNS avisa quando abrir o próximo.'}</Aviso>
      )}

      {r.casas.length > 0 && c && (
        <section className="bloco">
          <h2>{r.casas.length === 1 ? 'Pedido da sua casa' : 'Pedidos das casas do grupo'}</h2>
          <ul className="lista">
            {r.casas.map((x) => (
              <li key={x.casa_id}>
                <a className={'item item-chamado' + (x.para_mim ? ' para-mim' : '')} href={`#/limpeza/loja/${x.casa_id}`}>
                  <span className="chamado-simbolo"><Icone nome="carrinho" /></span>
                  <div>
                    <strong>{x.casa_nome}</strong>
                    <span className="linha-selos"><SeloPedido status={x.status} nome={x.status_nome} />{x.para_mim && <span className="selo-vez">Sua vez</span>}</span>
                  </div>
                  <span className="botao botao-pequeno botao-cheio">{x.status === null ? 'Fazer pedido' : ['rascunho', 'devolvido'].includes(x.status) && c.status === 'aberto' && !c.prazo_passou ? 'Continuar' : 'Ver'}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pode('cns.conferir') && c && (
        <section className="bloco">
          <div className="bloco-cabeca"><h2>{final ? 'Análise final' : 'Análise dos pedidos'}</h2><a href="#/limpeza/pedidos">Ver todos os pedidos</a></div>
          <a className={'contador-bloco' + (r.conferir ? ' destaque' : '')} href="#/limpeza/pedidos">
            <strong>{r.conferir}</strong>
            <span>{r.conferir === 1 ? 'pedido esperando sua análise' : 'pedidos esperando sua análise'}</span>
          </a>
          <p className="fraco margem-cima">{final
            ? 'Chegam aqui os pedidos já analisados pelas orientadoras (e os das casas sem orientadora).'
            : 'Depois da sua análise, o pedido vai para a análise final da Coordenação CNS.'}</p>
        </section>
      )}

      {!pode('cns.gerir') && (r.casas.length > 0 || pode('cns.conferir') || pode('cns.compras')) && (
        <a className="cartao cartao-link margem-cima" href="#/limpeza/estoque">
          <Icone nome="grupos" />
          <span><strong>{r.casas.length === 1 && !pode('cns.conferir') ? 'Estoque da casa' : 'Estoque de limpeza'}</strong><small>{pode('cns.conferir') ? 'O que tem em cada casa e a contagem do DML' : 'O que a casa tem no DML'}</small></span>
          <Icone nome="seta" />
        </a>
      )}

      {pode('cns.visitas') && (
        <a className="cartao cartao-link margem-cima" href="#/limpeza/visitas">
          <Icone nome="lista" />
          <span><strong>Visitas às casas</strong><small>Relatório de visita: checklist e fotos, para imprimir ou gerar PDF</small></span>
          <Icone nome="seta" />
        </a>
      )}

      {usuario.perfis.includes('administrador') && !pode('cns.gerir') && !pode('cns.pedir') && (
        <Aviso tipo="info">Como administrador você só acompanha a limpeza. Para abrir ciclos e cuidar do catálogo, dê a você mesmo o perfil Coordenação CNS em <a href={`#/admin/usuarios/${usuario.id}`}>Admin › Usuários</a>.</Aviso>
      )}

      {(pode('cns.gerir') || pode('cns.compras')) && <GestaoCiclo resumo={r} usuario={usuario} aoMudar={carregar} />}
      {pode('cns.gerir') && r.agenda && <AgendaCiclos agenda={r.agenda} aoMudar={carregar} />}
    </main>
  )
}

function AgendaCiclos({ agenda, aoMudar }: { agenda: AgendaLimpeza; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [d, setD] = useState({ ativa: agenda.ativa, dia_abertura: String(agenda.dia_abertura), dia_prazo: String(agenda.dia_prazo) })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const dias = Array.from({ length: 28 }, (_, i) => String(i + 1))
  const prazoNoMesSeguinte = Number(d.dia_prazo) < Number(d.dia_abertura)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setErros({}); setEnviando(true)
    try { await api('PUT', '/cns/agenda', { ativa: d.ativa, dia_abertura: Number(d.dia_abertura), dia_prazo: Number(d.dia_prazo) }); setEditando(false); aoMudar() }
    catch (err) { setErro(mensagemDe(err)); setErros(camposDe(err)) } finally { setEnviando(false) }
  }

  return (
    <section className="bloco">
      <h2>Abertura automática</h2>
      {!editando ? (
        <div className="cartao">
          {agenda.ativa ? (
            <>
              <p><strong>Ligada.</strong> Todo mês o pedido abre sozinho no dia {agenda.dia_abertura}, com prazo até o dia {agenda.dia_prazo}{agenda.dia_prazo < agenda.dia_abertura ? ' do mês seguinte' : ''}.</p>
              {agenda.proxima && <p className="fraco">Próximo: {agenda.proxima.nome}, abre em {dataDia(agenda.proxima.abre)} e vai até {dataDia(agenda.proxima.prazo)}.</p>}
            </>
          ) : <p>Desligada. Os ciclos são abertos à mão, pelo botão acima.</p>}
          <button className="botao margem-cima" onClick={() => { setD({ ativa: agenda.ativa, dia_abertura: String(agenda.dia_abertura), dia_prazo: String(agenda.dia_prazo) }); setEditando(true) }}>
            <Icone nome="relogio" />{agenda.ativa ? 'Mudar os dias' : 'Ligar a abertura automática'}
          </button>
        </div>
      ) : (
        <form className="cartao painel-form" onSubmit={salvar} noValidate>
          {erro && <Aviso>{erro}</Aviso>}
          <label className="caixa"><input type="checkbox" checked={d.ativa} onChange={(e) => setD({ ...d, ativa: e.target.checked })} />
            <span><strong>Abrir o pedido do mês sozinho</strong><small>O ciclo abre no primeiro acesso a partir do dia marcado. Fechar continua com a Coordenação, depois da análise final.</small></span></label>
          <div className="duas-colunas">
            <div className={'campo' + (erros.dia_abertura ? ' campo-erro' : '')}>
              <label htmlFor="ag-abre">Abre no dia</label>
              <select id="ag-abre" value={d.dia_abertura} onChange={(e) => setD({ ...d, dia_abertura: e.target.value })}>{dias.map((x) => <option key={x}>{x}</option>)}</select>
              {erros.dia_abertura && <small className="msg-erro">{erros.dia_abertura}</small>}
            </div>
            <div className={'campo' + (erros.dia_prazo ? ' campo-erro' : '')}>
              <label htmlFor="ag-prazo">Prazo até o dia</label>
              <select id="ag-prazo" value={d.dia_prazo} onChange={(e) => setD({ ...d, dia_prazo: e.target.value })}>{dias.map((x) => <option key={x}>{x}</option>)}</select>
              {erros.dia_prazo ? <small className="msg-erro">{erros.dia_prazo}</small> : <small>{prazoNoMesSeguinte ? 'do mês seguinte' : 'do mesmo mês'}</small>}
            </div>
          </div>
          <p className="fraco">Vai até o dia 28 para funcionar em todos os meses.</p>
          <div className="acoes-form"><button type="button" className="botao" onClick={() => setEditando(false)}>Cancelar</button><button className="botao botao-cheio" disabled={enviando}>Salvar</button></div>
        </form>
      )}
    </section>
  )
}

function GestaoCiclo({ resumo, usuario, aoMudar }: { resumo: ResumoLimpeza; usuario: Usuario; aoMudar: () => void }) {
  const c = resumo.ciclo
  const gerir = usuario.permissoes.includes('cns.gerir')
  const compras = usuario.permissoes.includes('cns.compras')
  const [aberto, setAberto] = useState<string | null>(null)
  const [d, setD] = useState({ nome: '', prazo: '', observacao: '', valor: '', texto: '' })
  const [aprovarPendentes, setAprovarPendentes] = useState(true)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const mudar = (k: keyof typeof d) => (v: string) => setD((x) => ({ ...x, [k]: v }))
  const contagem = c?.pedidos
  const pendentes = (contagem?.enviado ?? 0) + (contagem?.conferido ?? 0)

  async function fazer(f: () => Promise<unknown>) {
    setErro(''); setErros({}); setEnviando(true)
    try { await f(); setAberto(null); aoMudar() } catch (e) { setErro(mensagemDe(e)); setErros(camposDe(e)) } finally { setEnviando(false) }
  }

  const [faltas, setFaltas] = useState<{ produto_id: number; nome: string; precisa: number; tem: number }[] | null>(null)
  async function entregar(forcar: boolean) {
    if (!c) return
    setErro(''); setEnviando(true)
    try { await api('POST', `/cns/ciclos/${c.id}/acoes`, { acao: 'distribuido', forcar }); setFaltas(null); aoMudar() }
    catch (e) {
      const f = camposDe(e).faltas
      if (f) { try { setFaltas(JSON.parse(f)) } catch { setErro(mensagemDe(e)) } } else setErro(mensagemDe(e))
    } finally { setEnviando(false) }
  }

  const sugestao = () => {
    const prox = new Date(); prox.setDate(prox.getDate() + 10)
    const mes = new Date(); mes.setMonth(mes.getMonth() + 1)
    const nome = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    setD((x) => ({ ...x, nome: nome.charAt(0).toUpperCase() + nome.slice(1).replace(' de ', '/'), prazo: prox.toLocaleDateString('sv-SE') }))
  }

  return (
    <section className="bloco">
      <h2>{gerir ? 'Coordenação' : 'Compras'}</h2>
      {erro && !aberto && <Aviso>{erro}</Aviso>}
      <div className="atalhos atalhos-tres">
        {c && <a href={`#/limpeza/consolidado/${c.id}`} className="atalho"><Icone nome="documento" />{gerir ? 'Consolidação' : 'Lista de compra'}</a>}
        {gerir && <a href="#/limpeza/catalogo" className="atalho"><Icone nome="balde" />Catálogo</a>}
        <a href="#/limpeza/ciclos" className="atalho"><Icone nome="historico" />Ciclos</a>
        {gerir && <a href="#/limpeza/estoque" className="atalho"><Icone nome="grupos" />Estoque</a>}
      </div>

      {gerir && (!c || c.status !== 'aberto') && aberto !== 'novo' && (
        <button className="botao botao-largo margem-cima" onClick={() => { sugestao(); setAberto('novo') }}><Icone nome="mais" />Abrir um ciclo agora</button>
      )}
      {aberto === 'novo' && (
        <form className="cartao painel-form" onSubmit={(e) => { e.preventDefault(); fazer(() => api('POST', '/cns/ciclos', d)) }} noValidate>
          {erro && <Aviso>{erro}</Aviso>}
          <Campo rotulo="Nome do ciclo" nome="ciclo-nome" valor={d.nome} aoMudar={mudar('nome')} erro={erros.nome} dica="Ex.: Novembro/2026" obrigatorio />
          <Campo rotulo="Prazo para as casas pedirem" nome="ciclo-prazo" tipo="date" valor={d.prazo} aoMudar={mudar('prazo')} erro={erros.prazo} obrigatorio />
          <AreaTexto rotulo="Aviso para as casas (opcional)" nome="ciclo-obs" valor={d.observacao} aoMudar={mudar('observacao')} erro={erros.observacao} linhas={2} />
          <div className="acoes-form">
            <button type="button" className="botao" onClick={() => setAberto(null)}>Cancelar</button>
            <button className="botao botao-cheio" disabled={enviando}>Abrir ciclo</button>
          </div>
        </form>
      )}

      {c && (
        <div className={'cartao' + (resumo.tarefa_ciclo ? ' cartao-acoes sua-vez' : '')}>
          <div className="cartao-cabeca"><h2>{c.nome}</h2><span className={'selo-status tom-' + (c.status === 'distribuido' ? 'feito' : 'andamento')}>{c.status_nome}</span></div>
          {contagem && (
            <ul className="por-categoria">
              {[['enviado', 'Com as orientadoras'], ['conferido', 'Para análise final'], ['aprovado', 'Aprovados'], ['devolvido', 'Devolvidos'], ['rascunho', 'Não enviados'], ['entregue', 'Recebidos'], ['cancelado', 'Fora do ciclo']]
                .filter(([k]) => contagem[k]).map(([k, n]) => <li key={k}><span>{n}</span><strong>{contagem[k]}</strong></li>)}
            </ul>
          )}
          {c.status === 'aberto' && gerir && (
            <>
              {c.prazo_passou && <p className="dica-passo"><Icone nome="alerta" tamanho={16} />O prazo terminou. Termine a análise final e feche o ciclo para consolidar.</p>}
              <div className="botoes-acao">
                <button className={'botao' + (c.prazo_passou ? ' botao-cheio' : '')} onClick={() => setAberto(aberto === 'fechar' ? null : 'fechar')}>Fechar o ciclo</button>
                <button className="botao" onClick={() => { setD((x) => ({ ...x, nome: c.nome, prazo: c.prazo, observacao: c.observacao ?? '' })); setAberto(aberto === 'editar' ? null : 'editar') }}>Mudar prazo</button>
                <a className="botao" href="#/limpeza/pedidos">Ver pedidos</a>
              </div>
            </>
          )}
          {aberto === 'editar' && (
            <form className="painel-acao" onSubmit={(e) => { e.preventDefault(); fazer(() => api('PUT', `/cns/ciclos/${c.id}`, { nome: d.nome, prazo: d.prazo, observacao: d.observacao })) }} noValidate>
              {erro && <Aviso>{erro}</Aviso>}
              <Campo rotulo="Nome" nome="e-ciclo-nome" valor={d.nome} aoMudar={mudar('nome')} erro={erros.nome} />
              <Campo rotulo="Prazo" nome="e-ciclo-prazo" tipo="date" valor={d.prazo} aoMudar={mudar('prazo')} erro={erros.prazo} />
              <AreaTexto rotulo="Aviso para as casas" nome="e-ciclo-obs" valor={d.observacao} aoMudar={mudar('observacao')} linhas={2} />
              <div className="acoes-form"><button type="button" className="botao" onClick={() => setAberto(null)}>Voltar</button><button className="botao botao-cheio" disabled={enviando}>Salvar</button></div>
            </form>
          )}
          {aberto === 'fechar' && (
            <form className="painel-acao" onSubmit={(e) => { e.preventDefault(); fazer(() => api('POST', `/cns/ciclos/${c.id}/acoes`, { acao: 'fechar', aprovar_enviados: aprovarPendentes })) }} noValidate>
              {erro && <Aviso>{erro}</Aviso>}
              <p>Depois de fechar, as casas não pedem mais neste ciclo e você consolida com o DML Central para liberar a compra.</p>
              {pendentes > 0 && (
                <label className="caixa"><input type="checkbox" checked={aprovarPendentes} onChange={(e) => setAprovarPendentes(e.target.checked)} />
                  <span><strong>Aprovar como estão os {pendentes} pedido(s) ainda em análise</strong><small>Mantém os ajustes já feitos pelas orientadoras. Se desmarcar, eles ficam fora deste ciclo.</small></span></label>
              )}
              {!!(contagem?.rascunho || contagem?.devolvido) && <p className="fraco">{(contagem.rascunho ?? 0) + (contagem.devolvido ?? 0)} pedido(s) não enviado(s) ou devolvido(s) vão ficar fora deste ciclo.</p>}
              <div className="acoes-form"><button type="button" className="botao" onClick={() => setAberto(null)}>Voltar</button><button className="botao botao-cheio" disabled={enviando}>Fechar ciclo</button></div>
            </form>
          )}
          {c.status === 'fechado' && !c.liberado_compras_em && (
            gerir ? (
              <>
                <p className="dica-passo"><Icone nome="documento" tamanho={16} />Todos os pedidos estão fechados. Toque em Consolidar para ver a lista de compras, o gasto por casa e a separação — e liberar a lista para Compras.</p>
                <div className="botoes-acao"><a className="botao botao-cheio" href={`#/limpeza/consolidado/${c.id}`}><Icone nome="documento" />Consolidar</a></div>
              </>
            ) : <p className="fraco">Esperando a Coordenação CNS consolidar com o DML Central e liberar a lista de compra.</p>
          )}
          {c.status === 'fechado' && c.liberado_compras_em && compras && aberto !== 'comprado' && (
            <>
              <p className="fraco">Lista liberada pela Coordenação em {dataCurta(c.liberado_compras_em)}.</p>
              <div className="botoes-acao">
                <a className="botao" href={`#/limpeza/consolidado/${c.id}/compra`}><Icone nome="documento" />Ver lista por fornecedor</a>
                <button className="botao botao-cheio" onClick={() => setAberto('comprado')}>Registrar compra</button>
              </div>
            </>
          )}
          {aberto === 'comprado' && (
            <form className="painel-acao" onSubmit={(e) => { e.preventDefault(); fazer(() => api('POST', `/cns/ciclos/${c.id}/acoes`, { acao: 'comprado', valor: d.valor, texto: d.texto })) }} noValidate>
              {erro && <Aviso>{erro}</Aviso>}
              <Campo rotulo="Valor total da compra (R$, opcional)" nome="compra-valor" valor={d.valor} aoMudar={mudar('valor')} erro={erros.valor} inputMode="decimal" />
              <AreaTexto rotulo="Observação (opcional)" nome="compra-texto" valor={d.texto} aoMudar={mudar('texto')} linhas={2} dica="Ex.: o que faltou em algum fornecedor." />
              <div className="acoes-form"><button type="button" className="botao" onClick={() => setAberto(null)}>Voltar</button><button className="botao botao-cheio" disabled={enviando}>Confirmar compra</button></div>
            </form>
          )}
          {c.status === 'comprado' && gerir && !c.estoque_recebido_em && (
            aberto === 'receber' ? <ReceberCompra ciclo={c} aoVoltar={() => setAberto(null)} aoSalvar={() => { setAberto(null); aoMudar() }} />
              : (
                <>
                  <p className="dica-passo"><Icone nome="balde" tamanho={16} />Quando o material chegar no DML Central, confira e registre a chegada. Depois é só entregar às casas.</p>
                  <div className="botoes-acao">
                    <button className="botao botao-cheio" onClick={() => setAberto('receber')}><Icone nome="certo" />Registrar a chegada da compra</button>
                  </div>
                </>
              )
          )}
          {c.status === 'comprado' && gerir && c.estoque_recebido_em && (
            <>
              <p className="fraco">Chegou no DML Central em {dataCurta(c.estoque_recebido_em)}.</p>
              {faltas ? (
                <div className="painel-acao painel-faltas">
                  <p><strong>Não tem no DML Central tudo o que foi aprovado:</strong></p>
                  <ul className="lista-faltas">{faltas.map((f) => <li key={f.produto_id}><span>{f.nome}</span><span>precisa {f.precisa}, tem {f.tem}</span></li>)}</ul>
                  <p className="fraco">Você pode lançar uma entrada no Central (se o material chegou depois) ou entregar o que tem. O que faltar fica registrado no pedido de cada casa.</p>
                  <div className="acoes-form">
                    <button type="button" className="botao" onClick={() => setFaltas(null)}>Voltar</button>
                    <button className="botao botao-cheio" disabled={enviando} onClick={() => entregar(true)}>Entregar mesmo assim</button>
                  </div>
                </div>
              ) : (
                <div className="botoes-acao">
                  <a className="botao" href={`#/limpeza/consolidado/${c.id}/separacao`}><Icone nome="imprimir" />Separação por casa</a>
                  <button className="botao botao-cheio" disabled={enviando} onClick={() => entregar(false)}>Marcar como entregue às casas</button>
                </div>
              )}
            </>
          )}
          {c.valor_compra !== null && <p className="fraco">Compra registrada: {reais(c.valor_compra)}</p>}
        </div>
      )}
    </section>
  )
}

function ReceberCompra({ ciclo, aoVoltar, aoSalvar }: { ciclo: Ciclo; aoVoltar: () => void; aoSalvar: () => void }) {
  const [d, setD] = useState<Consolidado | null>(null)
  const [qtd, setQtd] = useState<Record<number, number>>({})
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    api<Consolidado>('GET', `/cns/ciclos/${ciclo.id}/consolidado`).then((r) => { setD(r); setQtd(Object.fromEntries(r.produtos.filter((p) => p.comprar > 0).map((p) => [p.produto_id, p.comprar]))) }).catch((e) => setErro(mensagemDe(e)))
  }, [ciclo.id])
  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    try {
      await api('POST', `/cns/ciclos/${ciclo.id}/receber`, { texto, itens: Object.entries(qtd).map(([produto_id, quantidade]) => ({ produto_id: Number(produto_id), quantidade })) })
      aoSalvar()
    } catch (err) { setErro(mensagemDe(err)) } finally { setEnviando(false) }
  }
  if (!d) return erro ? <Aviso>{erro}</Aviso> : <Carregando />
  const lista = d.produtos.filter((p) => p.comprar > 0)
  const diferente = lista.filter((p) => qtd[p.produto_id] !== p.comprar).length
  return (
    <form className="painel-acao" onSubmit={salvar} noValidate>
      <p>Confira o que chegou no DML Central. Já vem preenchido com a lista de compra; acerte o que veio diferente.</p>
      {erro && <Aviso>{erro}</Aviso>}
      <ul className="revisao">
        {lista.map((p) => (
          <li key={p.produto_id} className={qtd[p.produto_id] !== p.comprar ? 'alterado' : ''}>
            <FotoProduto url={null} categoria={p.categoria} />
            <span><strong>{p.nome}</strong><small>{p.fornecedor ? p.fornecedor + ' · ' : ''}comprado: {p.comprar}</small></span>
            <Contador valor={qtd[p.produto_id] ?? 0} nome={p.nome} max={null} semLixo
              aoMenos={() => setQtd({ ...qtd, [p.produto_id]: Math.max(0, (qtd[p.produto_id] ?? 0) - 1) })}
              aoMais={() => setQtd({ ...qtd, [p.produto_id]: (qtd[p.produto_id] ?? 0) + 1 })} />
          </li>
        ))}
      </ul>
      <AreaTexto rotulo="Observação (opcional)" nome="receber-texto" valor={texto} aoMudar={setTexto} linhas={2} dica="Ex.: o fornecedor não tinha um dos produtos." />
      <div className="acoes-form">
        <button type="button" className="botao" onClick={aoVoltar}>Voltar</button>
        <button className="botao botao-cheio" disabled={enviando}>{diferente ? `Confirmar (${diferente} diferente${diferente > 1 ? 's' : ''})` : 'Chegou tudo — confirmar'}</button>
      </div>
    </form>
  )
}

// ================================================================ loja (pedido da casa)

/** Produtos com tamanho (família) viram um cartão só na loja. */
type CartaoLoja = { chave: string; titulo: string; categoria: string; variantes: Produto[] }

function agrupar(produtos: Produto[]): CartaoLoja[] {
  const lista: CartaoLoja[] = []
  const familias: Record<string, CartaoLoja> = {}
  for (const p of produtos) {
    if (p.familia) {
      const k = p.categoria + '|' + p.familia
      if (!familias[k]) { familias[k] = { chave: 'f' + k, titulo: p.familia, categoria: p.categoria, variantes: [] }; lista.push(familias[k]) }
      familias[k].variantes.push(p)
    } else lista.push({ chave: 'p' + p.id, titulo: p.nome, categoria: p.categoria, variantes: [p] })
  }
  return lista
}

export function LojaLimpeza({ casaId }: { casaId: number }) {
  const [loja, setLoja] = useState<Loja | null>(null)
  const [carrinho, setCarrinho] = useState<Record<number, number>>({})
  const [obs, setObs] = useState('')
  const [categoria, setCategoria] = useState('')
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<'loja' | 'revisar'>('loja')
  const [salvando, setSalvando] = useState<'' | 'salvando' | 'salvo'>('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const aplicar = useCallback((l: Loja) => {
    setLoja(l)
    setCarrinho(Object.fromEntries((l.pedido?.itens ?? []).map((i) => [i.produto_id, i.quantidade])))
    setObs(l.pedido?.observacao ?? '')
  }, [])

  useEffect(() => { api<Loja>('GET', '/cns/loja?casa_id=' + casaId).then(aplicar).catch((e) => setErro(mensagemDe(e))) }, [casaId, aplicar])

  const editavel = !!loja?.acoes.includes('editar')
  const porId = useMemo(() => Object.fromEntries((loja?.produtos ?? []).map((p) => [p.id, p])), [loja])

  function salvar(novo: Record<number, number>, novaObs: string) {
    window.clearTimeout(timer.current)
    setSalvando('salvando')
    timer.current = window.setTimeout(() => {
      const itens = Object.entries(novo).map(([produto_id, quantidade]) => ({ produto_id: Number(produto_id), quantidade }))
      api<Loja>('PUT', '/cns/loja', { casa_id: casaId, itens, observacao: novaObs })
        .then((l) => { setLoja(l); setSalvando('salvo'); setErro('') })
        .catch((e) => { setErro(mensagemDe(e)); setSalvando('') })
    }, 500)
  }

  function mudarQtd(p: Produto, delta: number) {
    if (!editavel) return
    const atual = carrinho[p.id] ?? 0
    let q = Math.max(0, atual + delta)
    if (p.max_por_pedido !== null) q = Math.min(q, p.max_por_pedido)
    const novo = { ...carrinho, [p.id]: q }
    if (q === 0) delete novo[p.id]
    setCarrinho(novo)
    salvar(novo, obs)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    try {
      window.clearTimeout(timer.current)
      const itens = Object.entries(carrinho).map(([produto_id, quantidade]) => ({ produto_id: Number(produto_id), quantidade }))
      const l = await api<Loja>('PUT', '/cns/loja', { casa_id: casaId, itens, observacao: obs })
      await api('POST', `/cns/pedidos/${l.pedido!.id}/acoes`, { acao: 'enviar' })
      aplicar(await api<Loja>('GET', '/cns/loja?casa_id=' + casaId))
      setModo('loja'); setAviso('Pedido enviado! A orientadora do grupo faz a primeira análise e depois a Coordenação CNS aprova.')
      window.scrollTo(0, 0)
    } catch (err) { setErro(mensagemDe(err)) } finally { setEnviando(false) }
  }

  async function acao(nome: string, dados: Record<string, unknown> = {}) {
    if (!loja?.pedido) return
    setErro(''); setEnviando(true)
    try {
      await api('POST', `/cns/pedidos/${loja.pedido.id}/acoes`, { acao: nome, ...dados })
      aplicar(await api<Loja>('GET', '/cns/loja?casa_id=' + casaId))
      setAviso(nome === 'confirmar_recebimento' ? 'Recebimento confirmado. Obrigado!' : '')
    } catch (err) { setErro(mensagemDe(err)) } finally { setEnviando(false) }
  }

  const cartoes = useMemo(() => agrupar(loja?.produtos ?? []), [loja])

  if (erro && !loja) return <main className="pagina"><Topo titulo="Pedido de limpeza" voltar="/limpeza" /><Aviso>{erro}</Aviso></main>
  if (!loja) return <main className="pagina"><Carregando /></main>
  const c = loja.ciclo
  const p = loja.pedido
  const escolhidos = Object.entries(carrinho).filter(([id, q]) => q > 0 && porId[Number(id)])
  const totalItens = escolhidos.reduce((a, [, q]) => a + q, 0)
  const tipos = escolhidos.length
  const valorCarrinho = escolhidos.reduce((a, [id, q]) => a + (porId[Number(id)].preco_ref ?? 0) * q, 0)
  const semPrecoCarrinho = escolhidos.filter(([id]) => porId[Number(id)].preco_ref === null).length
  const termo = semAcento(busca.trim())
  const visiveis = cartoes.filter((k) => (!categoria || k.categoria === categoria)
    && (!termo || semAcento(k.titulo).includes(termo) || k.variantes.some((v) => semAcento(v.nome).includes(termo))))
  const categoriasUsadas = Object.entries(loja.categorias).filter(([k]) => loja.produtos.some((x) => x.categoria === k))

  if (!c) {
    return <main className="pagina"><Topo titulo="Pedido de limpeza" voltar="/limpeza" /><Aviso tipo="info">Nenhum pedido aberto no momento. A Coordenação CNS avisa quando abrir o próximo.</Aviso></main>
  }

  // Pedido já enviado (ou ciclo fechado): mostra o que foi pedido e o andamento.
  if (!editavel) {
    return (
      <main className="pagina">
        <Topo titulo="Pedido de limpeza" voltar="/limpeza" />
        {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
        {erro && <Aviso>{erro}</Aviso>}
        <section className="cartao">
          <span className="rotulo-pequeno">{c.nome} · {loja.casa.nome}</span>
          {p ? <div className="linha-selos"><SeloPedido status={p.status} nome={p.status_nome} /></div> : <p>Esta casa não fez pedido neste ciclo.</p>}
          {!p && c.status === 'aberto' && c.prazo_passou && <p className="fraco">O prazo terminou em {dataDia(c.prazo)}. Fale com a orientadora do grupo.</p>}
          {p?.status === 'enviado' && <p className="fraco">Enviado por {p.enviado_por} em {dataHora(p.enviado_em)}. {p.tem_orientadora ? 'A orientadora do grupo vai fazer a primeira análise.' : 'A Coordenação CNS vai analisar.'}</p>}
          {p?.status === 'conferido' && <p className="fraco">A orientadora ({p.conferido_por}) já analisou. Falta a análise final da Coordenação CNS.</p>}
          {p?.status === 'aprovado' && c.status !== 'distribuido' && <p className="fraco">Aprovado. O material chega depois da compra.</p>}
          {p?.motivo && <p className="pre motivo-pedido">{p.motivo}</p>}
          {p?.acoes.includes('desfazer_envio') && (
            <button className="botao botao-largo margem-cima" disabled={enviando} onClick={() => acao('desfazer_envio')}><Icone nome="editar" />Desfazer envio para corrigir</button>
          )}
        </section>
        {p?.acoes.includes('confirmar_recebimento') && <ConfirmarRecebimento enviando={enviando} aoConfirmar={(texto) => acao('confirmar_recebimento', { texto })} />}
        {p && p.itens.length > 0 && <ItensDoPedido pedido={p} />}
        {p && <HistoricoPedido pedido={p} />}
      </main>
    )
  }

  if (modo === 'revisar') {
    return (
      <main className="pagina">
        <Topo titulo="Revisar pedido" />
        <button className="botao-texto voltar-loja" onClick={() => setModo('loja')}><Icone nome="voltar" tamanho={18} />Voltar aos produtos</button>
        {erro && <Aviso>{erro}</Aviso>}
        <form className="cartao" onSubmit={enviar} noValidate>
          <span className="rotulo-pequeno">{c.nome} · {loja.casa.nome}</span>
          {escolhidos.length === 0 ? <Vazio>Nenhum produto escolhido ainda.</Vazio> : (
            <ul className="revisao">
              {escolhidos.map(([id, q]) => {
                const x = porId[Number(id)]
                return (
                  <li key={id}>
                    <FotoProduto url={x.mini_url} categoria={x.categoria} />
                    <span><strong>{x.nome}</strong><small>{precoTexto(x.preco_ref, x.unidade)}{x.preco_ref !== null ? ` · ${reais(x.preco_ref * q)}` : ''}</small></span>
                    <Contador valor={q} aoMenos={() => mudarQtd(x, -1)} aoMais={() => mudarQtd(x, 1)} max={x.max_por_pedido} nome={x.nome} />
                  </li>
                )
              })}
            </ul>
          )}
          <p className="total-pedido"><span>Total do pedido</span><strong>{reais(valorCarrinho)}</strong></p>
          {semPrecoCarrinho > 0 && <p className="fraco">{semPrecoCarrinho} {semPrecoCarrinho === 1 ? 'produto ainda está' : 'produtos ainda estão'} sem preço e não entra{semPrecoCarrinho === 1 ? '' : 'm'} no total.</p>}
          <AreaTexto rotulo="Recado para a orientadora (opcional)" nome="obs" valor={obs} aoMudar={(v) => { setObs(v); salvar(carrinho, v) }} linhas={2} />
          <button className="botao botao-cheio botao-grande" disabled={enviando || escolhidos.length === 0}>
            {enviando ? 'Enviando…' : <><Icone nome="enviar" />Enviar pedido</>}
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="pagina pagina-larga pagina-loja">
      <Topo titulo="Pedido de limpeza" voltar="/limpeza" />
      <p className="contexto-casa"><Icone nome="casas" tamanho={18} />{loja.casa.nome} · {c.nome}</p>
      <p className={'prazo-ciclo' + (diasAte(c.prazo) <= 2 ? ' prazo-perto' : '')}><Icone nome="relogio" tamanho={18} />{textoPrazo(c)}</p>
      {p?.status === 'devolvido' && <Aviso tipo="info">O pedido voltou para ajuste{p.motivo ? `: ${p.motivo}` : '.'} Ajuste e envie de novo.</Aviso>}
      {c.observacao && <Aviso tipo="info">{c.observacao}</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="filtros">
        <label className="busca">
          <Icone nome="busca" tamanho={18} />
          <input type="search" placeholder={`Procurar entre ${loja.produtos.length} produtos`} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Procurar produto" />
        </label>
        <div className="pilulas" role="group" aria-label="Categorias">
          <button className={categoria === '' ? 'ativo' : ''} onClick={() => setCategoria('')}>Todos</button>
          {categoriasUsadas.map(([k, n]) => <button key={k} className={categoria === k ? 'ativo' : ''} onClick={() => setCategoria(k)}>{n}</button>)}
        </div>
      </div>
      {visiveis.length === 0 && <Vazio>Nenhum produto encontrado{busca ? ` para “${busca}”` : ''}.</Vazio>}
      <ul className="vitrine">
        {visiveis.map((k) => <CartaoProduto key={k.chave} cartao={k} carrinho={carrinho} aoMudar={mudarQtd} />)}
      </ul>
      <div className="barra-carrinho" role="region" aria-label="Seu pedido">
        <span>
          <strong>{tipos === 0 ? 'Carrinho vazio' : `${tipos} ${tipos === 1 ? 'produto' : 'produtos'} · ${totalItens} un. · ${reais(valorCarrinho)}`}</strong>
          <small>{salvando === 'salvando' ? 'Salvando…' : salvando === 'salvo' ? 'Salvo ✓' : semPrecoCarrinho ? `${semPrecoCarrinho} sem preço` : 'Use + e −'}</small>
        </span>
        <button className="botao botao-cheio" disabled={tipos === 0} onClick={() => { setModo('revisar'); window.scrollTo(0, 0) }}>
          <Icone nome="carrinho" />Revisar e enviar
        </button>
      </div>
    </main>
  )
}

function CartaoProduto({ cartao, carrinho, aoMudar }: { cartao: CartaoLoja; carrinho: Record<number, number>; aoMudar: (p: Produto, d: number) => void }) {
  const vs = cartao.variantes
  const [sel, setSel] = useState<number>(() => (vs.find((v) => carrinho[v.id]) ?? vs[0]).id)
  const atual = vs.find((v) => v.id === sel) ?? vs[0]
  const q = carrinho[atual.id] ?? 0
  const noCarrinho = vs.filter((v) => carrinho[v.id])
  const varios = vs.length > 1
  return (
    <li className={noCarrinho.length ? 'no-carrinho' : ''}>
      <FotoProduto url={atual.mini_url} categoria={atual.categoria} grande />
      <div className="vitrine-texto">
        <strong>{cartao.titulo}</strong>
        <small>{[atual.embalagem, atual.max_por_pedido !== null ? `até ${atual.max_por_pedido}` : null].filter(Boolean).join(' · ')}</small>
        <span className={'preco-produto' + (atual.preco_ref === null ? ' sem' : '')}>{precoTexto(atual.preco_ref, atual.unidade)}</span>
      </div>
      {varios && (
        <div className="tamanhos" role="group" aria-label={`Tamanho de ${cartao.titulo}`}>
          {vs.map((v) => (
            <button key={v.id} type="button" className={(v.id === atual.id ? 'ativo' : '') + (carrinho[v.id] ? ' tem' : '')} onClick={() => setSel(v.id)} aria-pressed={v.id === atual.id}>
              {v.variacao}{carrinho[v.id] ? <sup>{carrinho[v.id]}</sup> : null}
            </button>
          ))}
        </div>
      )}
      {q === 0
        ? <button className="botao botao-adicionar" onClick={() => aoMudar(atual, 1)} aria-label={`Adicionar ${atual.nome}`}><Icone nome="mais" tamanho={20} />{varios ? `Adicionar nº ${atual.variacao}` : 'Adicionar'}</button>
        : <Contador valor={q} aoMenos={() => aoMudar(atual, -1)} aoMais={() => aoMudar(atual, 1)} max={atual.max_por_pedido} nome={atual.nome} />}
      {varios && noCarrinho.length > 0 && <small className="fraco">No pedido: {noCarrinho.map((v) => `nº ${v.variacao} (${carrinho[v.id]})`).join(', ')}</small>}
    </li>
  )
}

export function Contador({ valor, aoMenos, aoMais, max, nome, semLixo }: { valor: number; aoMenos: () => void; aoMais: () => void; max: number | null; nome: string; semLixo?: boolean }) {
  return (
    <span className="contador-qtd">
      <button type="button" onClick={aoMenos} disabled={semLixo && valor === 0} aria-label={`Menos ${nome}`}><Icone nome={valor === 1 && !semLixo ? 'lixo' : 'menos'} tamanho={20} /></button>
      <b aria-live="polite">{valor}</b>
      <button type="button" onClick={aoMais} disabled={max !== null && valor >= max} aria-label={`Mais ${nome}`}><Icone nome="mais" tamanho={20} /></button>
    </span>
  )
}

function ConfirmarRecebimento({ enviando, aoConfirmar }: { enviando: boolean; aoConfirmar: (t: string) => void }) {
  const [faltou, setFaltou] = useState(false)
  const [texto, setTexto] = useState('')
  return (
    <section className="cartao cartao-acoes sua-vez">
      <h2>O material chegou?</h2>
      {!faltou ? (
        <div className="botoes-acao">
          <button className="botao botao-cheio" disabled={enviando} onClick={() => aoConfirmar('')}><Icone nome="certo" />Sim, chegou tudo</button>
          <button className="botao" onClick={() => setFaltou(true)}>Chegou, mas faltou algo</button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); aoConfirmar(texto) }} noValidate>
          <AreaTexto rotulo="O que faltou ou veio diferente" nome="faltou" valor={texto} aoMudar={setTexto} linhas={2} obrigatorio />
          <div className="acoes-form"><button type="button" className="botao" onClick={() => setFaltou(false)}>Voltar</button><button className="botao botao-cheio" disabled={enviando || !texto.trim()}>Confirmar</button></div>
        </form>
      )}
    </section>
  )
}

function ItensDoPedido({ pedido }: { pedido: PedidoLimpeza }) {
  const ajustado = pedido.itens.some((i) => i.quantidade_aprovada !== null)
  return (
    <section className="cartao">
      <h2>Itens <small>({pedido.itens.length})</small></h2>
      <ul className="revisao">
        {pedido.itens.map((i) => (
          <li key={i.produto_id}>
            <FotoProduto url={i.mini_url} categoria={i.categoria} />
            <span><strong>{i.nome}</strong><small>{precoTexto(i.preco, i.unidade)}{i.subtotal !== null ? ` · ${reais(i.subtotal)}` : ''}</small></span>
            <span className="qtd-final">
              {ajustado && i.quantidade_aprovada !== null && i.quantidade_aprovada !== i.quantidade
                ? <><s>{i.quantidade}</s> <b>{i.quantidade_aprovada}</b></>
                : <b>{i.quantidade_aprovada ?? i.quantidade}</b>}
            </span>
          </li>
        ))}
      </ul>
      <p className="total-pedido"><span>Total{ajustado ? ' (com os ajustes)' : ''}</span><strong>{reais(pedido.total)}</strong></p>
      {pedido.sem_preco > 0 && <p className="fraco">{pedido.sem_preco} item(ns) sem preço não entra(m) no total.</p>}
      {pedido.observacao && <p className="pre motivo-pedido">Recado: {pedido.observacao}</p>}
      {pedido.recebimento_obs && <p className="pre motivo-pedido">No recebimento: {pedido.recebimento_obs}</p>}
    </section>
  )
}

function HistoricoPedido({ pedido }: { pedido: PedidoLimpeza }) {
  if (!pedido.eventos.length) return null
  return (
    <section className="cartao">
      <h2>Histórico</h2>
      <ol className="linha-tempo">
        {[...pedido.eventos].reverse().map((e) => (
          <li key={e.id} className={'ev-' + e.tipo}>
            <span className="ev-icone"><Icone nome={e.tipo === 'devolvido' || e.tipo === 'fora_do_ciclo' || e.tipo === 'faltou_na_entrega' ? 'alerta' : ['aprovado', 'conferido', 'recebido'].includes(e.tipo) ? 'certo' : 'carrinho'} tamanho={16} /></span>
            <div>
              <p className="ev-cabeca"><strong>{e.usuario ?? 'Sistema'}</strong> {(EVENTOS[e.tipo] ?? e.tipo).toLowerCase()}</p>
              {e.texto && <p className="ev-texto pre">{e.texto}</p>}
              <time className="fraco">{dataHora(e.criado_em)}</time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ================================================================ análises

type ItemLista = {
  id: number; status: string; status_nome: string; casa: { id: number; nome: string; codigo: string; grupo: string }
  qtd_itens: number; qtd_total: number; valor: number | null; enviado_por: string | null; enviado_em: string | null
  para_mim: boolean; etapa_analise: 'primeira' | 'final' | null
}

export function PedidosLimpeza() {
  const [dados, setDados] = useState<{ ciclo: Ciclo | null; itens: ItemLista[]; sem_pedido?: { id: number; nome: string; grupo: string }[] } | null>(null)
  const [so, setSo] = useState<'mim' | 'todos'>('todos')
  const [erro, setErro] = useState('')
  const [ciclos, setCiclos] = useState<Ciclo[]>([])
  const [cicloId, setCicloId] = useState('')
  useEffect(() => { api<Ciclo[]>('GET', '/cns/ciclos').then(setCiclos).catch(() => {}) }, [])
  useEffect(() => {
    api<NonNullable<typeof dados>>('GET', '/cns/pedidos' + (cicloId ? '?ciclo_id=' + cicloId : '')).then((d) => { setDados(d); setSo(d.itens.some((i) => i.para_mim) ? 'mim' : 'todos') }).catch((e) => setErro(mensagemDe(e)))
  }, [cicloId])
  if (erro) return <main className="pagina"><Topo titulo="Pedidos de limpeza" voltar="/limpeza" /><Aviso>{erro}</Aviso></main>
  if (!dados) return <main className="pagina"><Carregando /></main>
  const meus = dados.itens.filter((i) => i.para_mim).length
  const lista = so === 'mim' ? dados.itens.filter((i) => i.para_mim) : dados.itens
  return (
    <main className="pagina">
      <Topo titulo="Pedidos de limpeza" voltar="/limpeza" />
      {dados.ciclo && <p className="contexto">{dados.ciclo.nome} · {textoPrazo(dados.ciclo)}</p>}
      {ciclos.length > 1 && (
        <Selecao rotulo="Ciclo" nome="ciclo-pedidos" valor={cicloId || String(dados.ciclo?.id ?? '')} aoMudar={(v) => v && setCicloId(v)}
          opcoes={ciclos.map((c) => ({ valor: String(c.id), texto: `${c.nome} — ${c.status_nome}` }))} />
      )}
      {dados.itens.length > 0 && (
        <div className="pilulas margem-baixo" role="group">
          <button className={so === 'mim' ? 'ativo' : ''} onClick={() => setSo('mim')}>Esperando você<span className="contador">{meus}</span></button>
          <button className={so === 'todos' ? 'ativo' : ''} onClick={() => setSo('todos')}>Todos ({dados.itens.length})</button>
        </div>
      )}
      {dados.itens.length === 0 && <Vazio>Nenhum pedido neste ciclo ainda.</Vazio>}
      {dados.itens.length > 0 && lista.length === 0 && <Vazio>Nada esperando você agora.</Vazio>}
      {lista.length > 0 && (
        <ul className="lista">
          {lista.map((p) => (
            <li key={p.id}>
              <a className={'item item-chamado' + (p.para_mim ? ' para-mim' : '')} href={`#/limpeza/pedidos/${p.id}`}>
                <span className="chamado-simbolo"><Icone nome="carrinho" /></span>
                <div>
                  <strong>{p.casa.nome}</strong>
                  <span>{p.casa.grupo} · {p.qtd_itens} {p.qtd_itens === 1 ? 'produto' : 'produtos'} · {p.qtd_total} un.{p.valor !== null ? ` · ${reais(p.valor)}` : ''}</span>
                  <span className="linha-selos"><SeloPedido status={p.status} nome={p.status_nome} />{p.para_mim && <span className="selo-vez">{p.etapa_analise === 'final' ? 'Análise final' : 'Sua vez'}</span>}</span>
                </div>
                <Icone nome="seta" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {!!dados.sem_pedido?.length && dados.ciclo?.status === 'aberto' && (
        <section className="bloco">
          <h2>Ainda não começaram o pedido ({dados.sem_pedido.length})</h2>
          <ul className="lista lista-compacta">
            {dados.sem_pedido.map((c) => <li key={c.id}><a className="item" href={`#/limpeza/loja/${c.id}`}><div><strong>{c.nome}</strong><span>{c.grupo}</span></div><Icone nome="seta" /></a></li>)}
          </ul>
        </section>
      )}
    </main>
  )
}

export function ConferirPedido({ id }: { id: number }) {
  const [p, setP] = useState<PedidoLimpeza | null>(null)
  const [qtd, setQtd] = useState<Record<number, number>>({})
  const [devolvendo, setDevolvendo] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)
  const aplicar = (x: PedidoLimpeza) => { setP(x); setQtd(Object.fromEntries(x.itens.map((i) => [i.produto_id, i.quantidade_aprovada ?? i.quantidade]))) }
  useEffect(() => { api<PedidoLimpeza>('GET', '/cns/pedidos/' + id).then(aplicar).catch((e) => setErro(mensagemDe(e))) }, [id])

  async function excluir() {
    if (!p || !confirm(`Excluir o pedido de ${p.casa.nome} (${p.ciclo.nome})? Os itens e o histórico do pedido são apagados. Não dá para desfazer.`)) return
    setErro(''); setOk(''); setEnviando(true)
    try { await api('DELETE', '/cns/pedidos/' + id); ir('/limpeza/pedidos') }
    catch (e) { setErro(mensagemDe(e)); window.scrollTo(0, 0) } finally { setEnviando(false) }
  }

  async function acao(nome: string, dados: Record<string, unknown>) {
    setErro(''); setOk(''); setEnviando(true)
    try {
      const r = await api<PedidoLimpeza>('POST', `/cns/pedidos/${id}/acoes`, { acao: nome, ...dados })
      aplicar(r); setDevolvendo(false); setTexto('')
      setOk(nome === 'devolver' ? 'Pedido devolvido para a casa.' : r.status === 'conferido' ? 'Pronto! O pedido foi para a análise final da Coordenação CNS.' : r.status === 'aprovado' ? 'Pedido aprovado.' : '')
      window.scrollTo(0, 0)
    } catch (e) { setErro(mensagemDe(e)) } finally { setEnviando(false) }
  }

  if (erro && !p) return <main className="pagina"><Topo titulo="Pedido" voltar="/limpeza/pedidos" /><Aviso>{erro}</Aviso></main>
  if (!p) return <main className="pagina"><Carregando /></main>
  const analisar = p.acoes.includes('aprovar')
  const final = p.etapa_analise === 'final'
  const total = p.itens.reduce((a, i) => a + (i.preco ?? 0) * (analisar ? qtd[i.produto_id] ?? 0 : i.quantidade_aprovada ?? i.quantidade), 0)

  return (
    <main className="pagina">
      <Topo titulo={p.casa.nome} voltar="/limpeza/pedidos" />
      <p className="contexto">{p.casa.grupo} · {p.ciclo.nome}</p>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}
      <section className={'cartao' + (analisar ? ' cartao-acoes sua-vez' : '')}>
        <div className="linha-selos"><SeloPedido status={p.status} nome={p.status_nome} />{analisar && <span className="selo-vez">{final ? 'Análise final' : '1ª análise'}</span>}</div>
        <ol className="etapas-pedido">
          <li className={p.enviado_em ? 'feito' : ''}><b>Casa</b><small>{p.enviado_em ? `${p.enviado_por} · ${dataCurta(p.enviado_em)}` : 'ainda não enviou'}</small></li>
          <li className={p.conferido_em && p.status !== 'enviado' ? 'feito' : p.status === 'enviado' ? 'agora' : ''}><b>Orientadora</b><small>{p.conferido_em && p.status !== 'enviado' ? `${p.conferido_por} · ${dataCurta(p.conferido_em)}` : p.tem_orientadora ? '1ª análise' : 'casa sem orientadora'}</small></li>
          <li className={p.analisado_em && ['aprovado', 'entregue'].includes(p.status) ? 'feito' : p.status === 'conferido' ? 'agora' : ''}><b>Coordenação</b><small>{p.analisado_em && ['aprovado', 'entregue'].includes(p.status) ? `${p.analisado_por} · ${dataCurta(p.analisado_em)}` : 'análise final'}</small></li>
        </ol>
        {p.observacao && <p className="pre motivo-pedido">Recado da casa: {p.observacao}</p>}
        {p.motivo && p.status !== 'devolvido' && <p className="pre motivo-pedido">Observação da análise: {p.motivo}</p>}
        {p.estoque_casa_id && <p><a href={`#/limpeza/estoque/${p.estoque_casa_id}`}>Ver o estoque da casa</a></p>}
        {analisar && <p className="dica-passo"><Icone nome="editar" tamanho={16} />Confira as quantidades. Se precisar, ajuste com + e − antes de aprovar.</p>}
        <ul className="revisao">
          {p.itens.map((i) => (
            <li key={i.produto_id}>
              <FotoProduto url={i.mini_url} categoria={i.categoria} />
              <span><strong>{i.nome}</strong>
                <small>pediu {i.quantidade}{i.quantidade_aprovada !== null && i.quantidade_aprovada !== i.quantidade ? ` · ajustado para ${i.quantidade_aprovada}` : ''} · {precoTexto(i.preco, i.unidade)}</small>
                {i.na_casa !== null && <small className="na-casa">Na casa: {i.na_casa}{i.contado_em ? ` · contado ${dataCurta(i.contado_em)}` : ' · não contado'}</small>}</span>
              {analisar
                ? <Contador valor={qtd[i.produto_id]} nome={i.nome} max={null}
                    aoMenos={() => setQtd({ ...qtd, [i.produto_id]: Math.max(0, qtd[i.produto_id] - 1) })}
                    aoMais={() => setQtd({ ...qtd, [i.produto_id]: qtd[i.produto_id] + 1 })} />
                : <span className="qtd-final">{i.quantidade_aprovada !== null && i.quantidade_aprovada !== i.quantidade ? <><s>{i.quantidade}</s> <b>{i.quantidade_aprovada}</b></> : <b>{i.quantidade_aprovada ?? i.quantidade}</b>}</span>}
            </li>
          ))}
        </ul>
        <p className="total-pedido"><span>Total</span><strong>{reais(total)}</strong></p>
        {p.sem_preco > 0 && <p className="fraco">{p.sem_preco} item(ns) sem preço não entra(m) no total.</p>}
        {analisar && !devolvendo && (
          <>
            <AreaTexto rotulo="Observação (opcional)" nome="obs-analise" valor={texto} aoMudar={setTexto} linhas={2} />
            <div className="botoes-acao margem-cima">
              <button className="botao botao-cheio" disabled={enviando}
                onClick={() => acao('aprovar', { texto, itens: Object.entries(qtd).map(([produto_id, q]) => ({ produto_id: Number(produto_id), quantidade_aprovada: q })) })}>
                <Icone nome="certo" />{final ? 'Aprovar (análise final)' : 'Aprovar e enviar para a coordenação'}
              </button>
              <button className="botao" onClick={() => setDevolvendo(true)}>Devolver para a casa</button>
            </div>
          </>
        )}
        {devolvendo && (
          <form className="painel-acao" onSubmit={(e) => { e.preventDefault(); acao('devolver', { texto }) }} noValidate>
            <AreaTexto rotulo="O que a casa precisa ajustar" nome="devolver" valor={texto} aoMudar={setTexto} linhas={2} obrigatorio />
            {p.ciclo.prazo_passou && <p className="fraco">Atenção: o prazo já passou. A casa só consegue corrigir se você estender o prazo do ciclo.</p>}
            <div className="acoes-form"><button type="button" className="botao" onClick={() => setDevolvendo(false)}>Voltar</button><button className="botao botao-perigo" disabled={enviando || texto.trim().length < 5}>Devolver</button></div>
          </form>
        )}
        {p.acoes.includes('confirmar_recebimento') && <button className="botao botao-largo margem-cima" disabled={enviando} onClick={() => acao('confirmar_recebimento', {})}>Confirmar que a casa recebeu</button>}
      </section>
      {p.pode_excluir && (
        <section className="bloco">
          <h2>Excluir pedido</h2>
          <p className="fraco">Apaga este pedido com os itens e o histórico. O estoque que já foi movimentado não muda. {p.ciclo.status === 'aberto' ? 'Com o ciclo aberto, a casa pode fazer um pedido novo.' : ''}</p>
          <button type="button" className="botao perigo" onClick={excluir} disabled={enviando}><Icone nome="lixo" tamanho={18} />Excluir pedido</button>
        </section>
      )}
      <HistoricoPedido pedido={p} />
    </main>
  )
}

// ================================================================ consolidação e lista de compra

type ProdutoConsolidado = {
  produto_id: number; nome: string; embalagem: string | null; unidade: string; categoria: string; fornecedor: string | null
  preco_ref: number | null; total: number; no_central: number; minimo_central: number | null; sugestao: number; comprar: number; subtotal: number | null
}
type Consolidado = {
  ciclo: Ciclo; casas: number; estimado: number; sem_preco: number; valor_pedidos: number; lista_salva: boolean
  pode_editar_compra: boolean; pode_liberar: boolean; pode_reabrir: boolean
  produtos: ProdutoConsolidado[]
  fornecedores: { fornecedor: string; itens: number; valor: number; sem_preco: number }[]
  grupos: { grupo: string; valor: number; casas: { casa_id: number; casa: string; codigo: string; status: string; valor: number; sem_preco: number; itens: Record<string, number> }[] }[]
}

const SEM_FORNECEDOR = 'Sem fornecedor'

type AbaConsolidado = 'compra' | 'gasto' | 'separacao'
const OPCOES_CONSOLIDAR: { aba: AbaConsolidado; titulo: string; texto: string; icone: string }[] = [
  { aba: 'compra', titulo: 'Lista de compras', texto: 'O total de cada produto para comprar, separado por fornecedor.', icone: 'carrinho' },
  { aba: 'gasto', titulo: 'Gasto por casa', texto: 'Quanto cada Casa de Oração pediu, com o total de cada grupo.', icone: 'casas' },
  { aba: 'separacao', titulo: 'Separação', texto: 'Uma página por Casa de Oração com os pedidos dela, para imprimir e colocar no pacote.', icone: 'imprimir' },
]

export function ConsolidadoLimpeza({ id, aba: abaInicial }: { id: number; aba?: string }) {
  const [c, setC] = useState<Consolidado | null>(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [aba, setAbaEstado] = useState<AbaConsolidado | null>(OPCOES_CONSOLIDAR.some((o) => o.aba === abaInicial) ? abaInicial as AbaConsolidado : null)
  const setAba = (a: AbaConsolidado | null) => { setAbaEstado(a); history.replaceState(null, '', `#/limpeza/consolidado/${id}${a ? '/' + a : ''}`); window.scrollTo(0, 0) }
  const [qtd, setQtd] = useState<Record<number, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const aplicar = (r: Consolidado) => { setC(r); setQtd(Object.fromEntries(r.produtos.map((p) => [p.produto_id, String(p.comprar)]))) }
  useEffect(() => { api<Consolidado>('GET', `/cns/ciclos/${id}/consolidado`).then(aplicar).catch((e) => setErro(mensagemDe(e))) }, [id])

  const editavel = !!c?.pode_editar_compra
  const comprarDe = (p: ProdutoConsolidado) => editavel ? Math.max(0, parseInt(qtd[p.produto_id] ?? '0', 10) || 0) : p.comprar
  const mudou = !!c && c.produtos.some((p) => comprarDe(p) !== p.comprar)
  const itensCorpo = () => (c?.produtos ?? []).map((p) => ({ produto_id: p.produto_id, quantidade: comprarDe(p) }))

  async function fazer(f: () => Promise<unknown>, msg: string) {
    setErro(''); setOk(''); setEnviando(true)
    try { await f(); aplicar(await api<Consolidado>('GET', `/cns/ciclos/${id}/consolidado`)); setOk(msg); setConfirmar(false) }
    catch (e) { setErro(mensagemDe(e)) } finally { setEnviando(false) }
  }

  const visiveis = useMemo(() => (c?.produtos ?? []).filter((p) => editavel || p.comprar > 0 || p.total > 0), [c, editavel])
  const porFornecedor = useMemo(() => {
    const g: { fornecedor: string; itens: ProdutoConsolidado[] }[] = []
    for (const p of visiveis) {
      const f = p.fornecedor ?? SEM_FORNECEDOR
      const ult = g[g.length - 1]
      if (ult && ult.fornecedor === f) ult.itens.push(p); else g.push({ fornecedor: f, itens: [p] })
    }
    return g
  }, [visiveis])

  function baixarPlanilha() {
    if (!c) return
    const n = (v: number | null) => v === null ? '' : v.toFixed(2).replace('.', ',')
    const linhas: string[][] = [[`Lista de compra · ${c.ciclo.nome}`], ['Fornecedor', 'Produto', 'Unidade', 'Pedido pelas casas', 'No DML Central', 'Mínimo', 'Sugestão', 'Comprar', 'Preço', 'Subtotal']]
    for (const p of c.produtos) {
      const q = comprarDe(p)
      if (q <= 0 && p.total <= 0) continue
      linhas.push([p.fornecedor ?? SEM_FORNECEDOR, p.nome, p.unidade, String(p.total), String(p.no_central), p.minimo_central === null ? '' : String(p.minimo_central), String(p.sugestao), String(q), n(p.preco_ref), n(p.preco_ref === null ? null : p.preco_ref * q)])
    }
    linhas.push([], ['Gasto por casa'], ['Grupo', 'Casa', 'Código', 'Valor'])
    for (const g of c.grupos) { for (const casa of g.casas) linhas.push([g.grupo, casa.casa, casa.codigo, n(casa.valor)]); linhas.push([g.grupo, 'Total do grupo', '', n(g.valor)]) }
    linhas.push([], ['Separação por casa'], ['Grupo', 'Casa', 'Código', ...c.produtos.filter((p) => p.total > 0).map((p) => p.nome)])
    for (const g of c.grupos) for (const casa of g.casas) linhas.push([g.grupo, casa.casa, casa.codigo, ...c.produtos.filter((p) => p.total > 0).map((p) => String(casa.itens[p.produto_id] ?? ''))])
    const csv = '﻿' + linhas.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `limpeza-${c.ciclo.nome.replace(/[^\w-]+/g, '-')}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (erro && !c) return <main className="pagina"><Topo titulo="Consolidação" voltar="/limpeza" /><Aviso>{erro}</Aviso></main>
  if (!c) return <main className="pagina"><Carregando /></main>
  const totalCompra = visiveis.reduce((a, p) => a + (p.preco_ref ?? 0) * comprarDe(p), 0)
  const semPreco = visiveis.filter((p) => comprarDe(p) > 0 && p.preco_ref === null).length
  const produtosPedidos = c.produtos.filter((p) => p.total > 0)
  const casasSeparacao = c.grupos.flatMap((g) => g.casas.map((casa) => ({ ...casa, grupo: g.grupo })))
  const datasCiclo = `Ciclo ${c.ciclo.nome}` + (c.ciclo.fechado_em ? ` · fechado em ${dataDia(c.ciclo.fechado_em)}` : ` · prazo ${dataDia(c.ciclo.prazo)}`)

  return (
    <main className={'pagina pagina-larga pagina-consolidado' + (aba === 'separacao' ? ' imprimindo-separacao' : '')}>
      <Topo titulo={`Consolidar · ${c.ciclo.nome}`} voltar="/limpeza" />
      <p className="contexto">{c.casas} {c.casas === 1 ? 'casa' : 'casas'} com pedido aprovado · {reais(c.valor_pedidos)} em pedidos · {c.ciclo.status_nome}</p>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}
      {c.ciclo.status === 'aberto' && <Aviso tipo="info">O ciclo ainda está aberto: estes números ainda podem mudar. A lista de compra é montada depois de fechar.</Aviso>}
      {editavel && <Aviso tipo="info">Confira a coluna <strong>Comprar</strong>. A sugestão é o que as casas pediram, mais o mínimo do DML Central, menos o que já tem lá. Ajuste o que precisar e libere para Compras.</Aviso>}
      {c.ciclo.liberado_compras_em && <Aviso tipo="ok">Lista liberada para Compras em {dataCurta(c.ciclo.liberado_compras_em)}.</Aviso>}
      {aba === null && (
        <section className="opcoes-consolidar nao-imprimir" aria-label="O que você quer ver">
          {OPCOES_CONSOLIDAR.map((o) => (
            <button key={o.aba} type="button" className="opcao-consolidar" onClick={() => setAba(o.aba)}>
              <Icone nome={o.icone} tamanho={28} />
              <span><strong>{o.titulo}</strong><small>{o.texto}</small></span>
              <Icone nome="seta" />
            </button>
          ))}
          <button type="button" className="botao margem-cima" onClick={baixarPlanilha}><Icone nome="baixar" />Baixar tudo em planilha (Excel)</button>
        </section>
      )}
      {aba !== null && (
        <>
          <div className="pilulas nao-imprimir" role="group">
            {OPCOES_CONSOLIDAR.map((o) => <button key={o.aba} className={aba === o.aba ? 'ativo' : ''} onClick={() => setAba(o.aba)}>{o.titulo}</button>)}
          </div>
          <div className="botoes-acao nao-imprimir margem-cima">
            {aba === 'separacao'
              ? <button className="botao botao-cheio" onClick={() => window.print()} disabled={casasSeparacao.length === 0}><Icone nome="imprimir" />Gerar PDF da separação</button>
              : <button className="botao" onClick={() => window.print()}><Icone nome="imprimir" />Imprimir</button>}
            <button className="botao" onClick={baixarPlanilha}><Icone nome="baixar" />Baixar planilha (Excel)</button>
          </div>
          {aba === 'separacao' && casasSeparacao.length > 0 && <p className="fraco nao-imprimir">Sai uma página por Casa de Oração ({casasSeparacao.length} {casasSeparacao.length === 1 ? 'página' : 'páginas'}). Na janela que abrir, escolha <b>Salvar como PDF</b> ou a impressora.</p>}
        </>
      )}

      {aba === 'compra' && (
        <>
          {visiveis.length === 0 && <Vazio>Nada para comprar neste ciclo.</Vazio>}
          {porFornecedor.map((g) => {
            const sub = g.itens.reduce((a, p) => a + (p.preco_ref ?? 0) * comprarDe(p), 0)
            return (
              <section className="cartao quebra-grupo" key={g.fornecedor}>
                <div className="cartao-cabeca"><h2>{g.fornecedor}</h2><strong>{reais(sub)}</strong></div>
                <div className="tabela-rolagem">
                  <table className="tabela tabela-compra">
                    <thead><tr><th>Produto</th><th className="num">Pedido</th><th className="num">No DML</th><th className="num">Sugestão</th><th className="num">Comprar</th><th className="num">Preço</th><th className="num">Subtotal</th></tr></thead>
                    <tbody>
                      {g.itens.map((p) => {
                        const q = comprarDe(p)
                        return (
                          <tr key={p.produto_id} className={(q === 0 ? 'zerado' : '') + (editavel && q !== p.comprar ? ' alterado' : '')}>
                            <td><strong>{p.nome}</strong><small>{p.unidade}{p.minimo_central !== null ? ` · mínimo ${p.minimo_central}` : ''}</small></td>
                            <td className="num">{p.total}</td>
                            <td className="num">{p.no_central}</td>
                            <td className="num">{p.sugestao}</td>
                            <td className="num">{editavel
                              ? <input className="qtd-compra" inputMode="numeric" value={qtd[p.produto_id] ?? ''} aria-label={`Comprar ${p.nome}`}
                                  onChange={(e) => setQtd({ ...qtd, [p.produto_id]: e.target.value.replace(/\D/g, '') })} />
                              : <b>{q}</b>}</td>
                            <td className="num">{p.preco_ref !== null ? reais(p.preco_ref) : '—'}</td>
                            <td className="num">{p.preco_ref !== null ? reais(p.preco_ref * q) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
          {visiveis.length > 0 && (
            <section className="cartao">
              <p className="total-pedido"><span>Total estimado da compra{semPreco ? ` (${semPreco} sem preço)` : ''}</span><strong>{reais(totalCompra)}</strong></p>
              {editavel && !confirmar && (
                <div className="botoes-acao nao-imprimir">
                  <button className="botao" disabled={enviando || !mudou} onClick={() => fazer(() => api('PUT', `/cns/ciclos/${id}/compra`, { itens: itensCorpo() }), 'Lista salva.')}>Salvar lista</button>
                  <button className="botao botao-cheio" disabled={enviando} onClick={() => setConfirmar(true)}><Icone nome="enviar" />Liberar para Compras</button>
                </div>
              )}
              {confirmar && (
                <div className="painel-acao nao-imprimir">
                  <p>Compras vai receber a lista com {visiveis.filter((p) => comprarDe(p) > 0).length} produto(s), separada por fornecedor. Até Compras registrar a compra, você ainda pode reabrir.</p>
                  <div className="acoes-form">
                    <button className="botao" onClick={() => setConfirmar(false)}>Voltar</button>
                    <button className="botao botao-cheio" disabled={enviando} onClick={() => fazer(() => api('POST', `/cns/ciclos/${id}/acoes`, { acao: 'liberar_compras', itens: itensCorpo() }), 'Lista liberada para Compras.')}>Liberar</button>
                  </div>
                </div>
              )}
              {c.pode_reabrir && (
                <button className="botao margem-cima nao-imprimir" disabled={enviando} onClick={() => fazer(() => api('POST', `/cns/ciclos/${id}/acoes`, { acao: 'reabrir_consolidacao' }), 'Consolidação reaberta: Compras não vê mais como liberada.')}>
                  <Icone nome="editar" />Reabrir a consolidação
                </button>
              )}
            </section>
          )}
        </>
      )}

      {aba === 'gasto' && (
        <>
          {c.grupos.length === 0 && <Vazio>Nenhum pedido aprovado neste ciclo.</Vazio>}
          {c.grupos.map((g) => (
            <section className="cartao quebra-grupo" key={g.grupo}>
              <div className="cartao-cabeca"><h2>{g.grupo}</h2><strong>{reais(g.valor)}</strong></div>
              <table className="tabela">
                <thead><tr><th>Casa de Oração</th><th className="num">Itens</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {g.casas.map((casa) => (
                    <tr key={casa.casa_id}>
                      <td><strong>{casa.casa}</strong><small>{casa.codigo}{casa.sem_preco ? ` · ${casa.sem_preco} sem preço` : ''}</small></td>
                      <td className="num">{Object.values(casa.itens).reduce((a, b) => a + b, 0)}</td>
                      <td className="num">{reais(casa.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {c.grupos.length > 0 && <section className="cartao"><p className="total-pedido"><span>Total dos pedidos do setor</span><strong>{reais(c.valor_pedidos)}</strong></p></section>}
        </>
      )}

      {aba === 'separacao' && casasSeparacao.length === 0 && <Vazio>Nenhum pedido aprovado neste ciclo.</Vazio>}
      {aba === 'separacao' && casasSeparacao.map((casa) => {
        const itens = produtosPedidos.filter((p) => casa.itens[p.produto_id])
        return (
          <section className="cartao etiqueta-casa" key={casa.casa_id}>
            <header className="etiqueta-cabeca">
              <h2>Casa de oração {casa.casa}</h2>
              <p>{casa.grupo}{casa.codigo ? ` · ${casa.codigo}` : ''}</p>
              <p className="etiqueta-ciclo">{datasCiclo}</p>
            </header>
            <table className="tabela tabela-etiqueta">
              <thead><tr><th className="col-check" aria-label="Separado"></th><th>Produto</th><th className="num">Quantidade</th></tr></thead>
              <tbody>
                {itens.map((p) => (
                  <tr key={p.produto_id}>
                    <td className="col-check"><span className="caixa-check" aria-hidden="true"></span></td>
                    <td><strong>{p.nome}</strong>{p.embalagem && <small>{p.embalagem}</small>}</td>
                    <td className="num"><b>{casa.itens[p.produto_id]}</b> <small>{p.unidade}</small></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td></td><td colSpan={2}>{itens.length} {itens.length === 1 ? 'produto' : 'produtos'}</td></tr></tfoot>
            </table>
            <p className="etiqueta-rodape">Separado por: ____________________ &nbsp; Conferido por: ____________________</p>
          </section>
        )
      })}
    </main>
  )
}

// ================================================================ catálogo e ciclos

type ProdutoEdicao = Partial<Produto> & { preco?: string; max?: string; min?: string }

export function CatalogoLimpeza() {
  const [produtos, setProdutos] = useState<Produto[] | null>(null)
  const [categorias, setCategorias] = useState<Record<string, string>>({})
  const [editando, setEditando] = useState<ProdutoEdicao | null>(null)
  const [busca, setBusca] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const carregar = () => api<{ produtos: Produto[]; categorias: Record<string, string> }>('GET', '/cns/produtos?todos=1')
    .then((r) => { setProdutos(r.produtos); setCategorias(r.categorias) }).catch((e) => setErro(mensagemDe(e)))
  useEffect(() => { carregar() }, [])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!editando) return
    setErro(''); setErros({})
    const corpo = { nome: editando.nome, embalagem: editando.embalagem, unidade: editando.unidade, categoria: editando.categoria, codigo: editando.codigo,
      fornecedor: editando.fornecedor ?? '', familia: editando.familia ?? '', variacao: editando.variacao ?? '',
      preco_ref: editando.preco ?? '', max_por_pedido: editando.max ?? '', minimo_central: editando.min ?? '', ativo: editando.ativo ?? true }
    try {
      await api(editando.id ? 'PUT' : 'POST', editando.id ? `/cns/produtos/${editando.id}` : '/cns/produtos', corpo)
      setEditando(null); carregar()
    } catch (err) { setErro(mensagemDe(err)); setErros(camposDe(err)) }
  }

  async function foto(p: Produto, arquivo: File | undefined) {
    if (!arquivo) return
    setErro('')
    try { await api('POST', `/cns/produtos/${p.id}/foto`, { arquivo: await reduzirImagem(arquivo), nome: arquivo.name }); carregar() } catch (err) { setErro(mensagemDe(err)) }
  }

  const abrir = (p?: Produto) => setEditando(p
    ? { ...p, preco: p.preco_ref !== null ? String(p.preco_ref).replace('.', ',') : '', max: p.max_por_pedido !== null ? String(p.max_por_pedido) : '', min: p.minimo_central !== null ? String(p.minimo_central) : '' }
    : { nome: '', embalagem: '', unidade: 'unidade', categoria: 'limpeza', codigo: '', fornecedor: fornecedor || '', familia: '', variacao: '', preco: '', max: '', ativo: true })
  const m = (k: string) => (v: string) => setEditando((x) => ({ ...x, [k]: v }))
  const fornecedores = [...new Set((produtos ?? []).map((p) => p.fornecedor).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const termo = semAcento(busca.trim())
  const lista = (produtos ?? []).filter((p) => (!fornecedor || (fornecedor === '-' ? !p.fornecedor : p.fornecedor === fornecedor)) && (!termo || semAcento(p.nome).includes(termo)))
  const semPreco = (produtos ?? []).filter((p) => p.ativo && p.preco_ref === null).length

  return (
    <main className="pagina">
      <Topo titulo="Catálogo de limpeza" voltar="/limpeza" acao={!editando && <button className="botao botao-cheio botao-pequeno" onClick={() => abrir()}><Icone nome="mais" tamanho={18} />Novo</button>} />
      <p className="contexto">É o que aparece na loja das casas, com o preço. Fotos ajudam muito quem tem pouca prática.</p>
      {semPreco > 0 && !editando && <Aviso tipo="info">{semPreco} {semPreco === 1 ? 'produto da loja está' : 'produtos da loja estão'} sem preço. A casa vê “Sem preço” e o item não entra no total.</Aviso>}
      {erro && !editando && <Aviso>{erro}</Aviso>}
      {editando && (
        <form className="cartao painel-form" onSubmit={salvar} noValidate>
          {erro && <Aviso>{erro}</Aviso>}
          <Campo rotulo="Nome" nome="p-nome" valor={editando.nome ?? ''} aoMudar={m('nome')} erro={erros.nome} obrigatorio />
          <div className="duas-colunas">
            <Campo rotulo="Fornecedor" nome="p-forn" valor={editando.fornecedor ?? ''} aoMudar={m('fornecedor')} erro={erros.fornecedor} dica="A lista de compra sai separada por fornecedor. A casa não vê." />
            <div className={'campo' + (erros.categoria ? ' campo-erro' : '')}>
              <label htmlFor="p-cat">Categoria</label>
              <select id="p-cat" value={editando.categoria} onChange={(e) => m('categoria')(e.target.value)}>
                {Object.entries(categorias).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="duas-colunas">
            <Campo rotulo="Embalagem" nome="p-emb" valor={editando.embalagem ?? ''} aoMudar={m('embalagem')} erro={erros.embalagem} dica="Ex.: galão 5 L, caixa com 8 rolos" />
            <Campo rotulo="Unidade" nome="p-un" valor={editando.unidade ?? ''} aoMudar={m('unidade')} erro={erros.unidade} dica="Ex.: galão, caixa, pacote, par" obrigatorio />
          </div>
          <div className="duas-colunas">
            <Campo rotulo="Produto com tamanho: nome comum" nome="p-fam" valor={editando.familia ?? ''} aoMudar={m('familia')} erro={erros.familia} dica="Ex.: Bota de borracha. Os tamanhos aparecem juntos na loja." />
            <Campo rotulo="Tamanho" nome="p-var" valor={editando.variacao ?? ''} aoMudar={m('variacao')} erro={erros.variacao} dica="Ex.: 38, P, M, G" />
          </div>
          <div className="duas-colunas">
            <Campo rotulo="Preço (R$)" nome="p-preco" valor={editando.preco ?? ''} aoMudar={m('preco')} erro={erros.preco_ref} inputMode="decimal" dica="A casa vê na loja. Pedidos já enviados guardam o preço da época." />
            <Campo rotulo="Máximo por pedido" nome="p-max" valor={editando.max ?? ''} aoMudar={m('max')} erro={erros.max_por_pedido} inputMode="numeric" dica="Deixe vazio para sem limite." />
            <Campo rotulo="Estoque mínimo no Central" nome="p-min" valor={editando.min ?? ''} aoMudar={m('min')} erro={erros.minimo_central} inputMode="numeric" dica="Entra na sugestão de compra para repor o DML Central." />
          </div>
          <Campo rotulo="Código (opcional)" nome="p-cod" valor={editando.codigo ?? ''} aoMudar={m('codigo')} erro={erros.codigo} />
          {editando.id && <label className="caixa"><input type="checkbox" checked={editando.ativo ?? true} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} />Aparece na loja</label>}
          <div className="acoes-form"><button type="button" className="botao" onClick={() => setEditando(null)}>Cancelar</button><button className="botao botao-cheio">Salvar</button></div>
        </form>
      )}
      {!produtos && <Carregando />}
      {produtos && !editando && (
        <div className="filtros filtros-linha">
          <label className="busca">
            <Icone nome="busca" tamanho={18} />
            <input type="search" placeholder="Procurar produto" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Procurar produto" />
          </label>
          <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} aria-label="Fornecedor" className="filtro-select">
            <option value="">Todos os fornecedores ({produtos.length})</option>
            {fornecedores.map((f) => <option key={f} value={f}>{f}</option>)}
            <option value="-">Sem fornecedor</option>
          </select>
        </div>
      )}
      {produtos && lista.length === 0 && <Vazio>Nenhum produto encontrado.</Vazio>}
      <ul className="lista">
        {lista.map((p) => (
          <li key={p.id} className="item item-produto">
            <label className="foto-trocar" title="Trocar foto">
              <FotoProduto url={p.mini_url} categoria={p.categoria} />
              <input type="file" accept="image/*" hidden onChange={(e) => { foto(p, e.target.files?.[0]); e.target.value = '' }} />
              <span><Icone nome="camera" tamanho={14} /></span>
            </label>
            <div>
              <strong>{p.nome}{!p.ativo && <em className="selo">fora da loja</em>}</strong>
              <span>{[p.fornecedor, categorias[p.categoria], p.unidade, p.max_por_pedido !== null ? `até ${p.max_por_pedido}` : null, p.no_central !== null ? `${p.no_central} no Central` : null].filter(Boolean).join(' · ')}</span>
              <span className={p.preco_ref === null ? 'fraco' : ''}>{p.preco_ref !== null ? reais(p.preco_ref) : 'Sem preço'}</span>
            </div>
            <button className="botao botao-pequeno" onClick={() => { abrir(p); window.scrollTo(0, 0) }}>Editar</button>
          </li>
        ))}
      </ul>
    </main>
  )
}

export function CiclosLimpeza() {
  const [lista, setLista] = useState<Ciclo[] | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => { api<Ciclo[]>('GET', '/cns/ciclos').then(setLista).catch((e) => setErro(mensagemDe(e))) }, [])
  return (
    <main className="pagina">
      <Topo titulo="Ciclos de pedido" voltar="/limpeza" />
      {erro && <Aviso>{erro}</Aviso>}
      {!lista && !erro && <Carregando />}
      {lista && lista.length === 0 && <Vazio>Nenhum ciclo ainda.</Vazio>}
      <ul className="lista">
        {lista?.map((c) => (
          <li key={c.id}>
            <a className="item" href={`#/limpeza/consolidado/${c.id}`}>
              <div>
                <strong>{c.nome}{c.automatico && <em className="selo">automático</em>}</strong>
                <span>{c.status_nome} · prazo {dataDia(c.prazo)}</span>
                <span className="fraco">{Object.values(c.pedidos ?? {}).reduce((a, b) => a + b, 0)} pedidos{c.valor_compra !== null ? ` · compra ${reais(c.valor_compra)}` : ''}</span>
              </div>
              <Icone nome="seta" />
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}

// ================================================================ tela inicial

export function ResumoLimpezaInicio() {
  const [r, setR] = useState<ResumoLimpeza | null>(null)
  useEffect(() => { api<ResumoLimpeza>('GET', '/cns/resumo').then(setR).catch(() => {}) }, [])
  if (!r || !r.ciclo) return null
  const c = r.ciclo
  const minha = r.casas.find((x) => x.para_mim)
  return (
    <section className="bloco">
      <div className="bloco-cabeca"><h2>Material de limpeza</h2><a href="#/limpeza">Abrir</a></div>
      {minha && c.status === 'aberto' && !c.prazo_passou && minha.status !== 'enviado' && (
        <a className="botao botao-cheio botao-grande botao-abrir" href={`#/limpeza/loja/${minha.casa_id}`}>
          <Icone nome="carrinho" />{minha.status === null ? 'Fazer o pedido de limpeza' : 'Continuar o pedido de limpeza'}
        </a>
      )}
      {minha && c.status === 'distribuido' && (
        <a className="botao botao-cheio botao-grande botao-abrir" href={`#/limpeza/loja/${minha.casa_id}`}><Icone nome="certo" />Confirmar que o material chegou</a>
      )}
      <p className="prazo-ciclo"><Icone nome="relogio" tamanho={18} />{c.nome}: {textoPrazo(c)}</p>
      {(r.conferir > 0 || r.tarefa_ciclo) && (
        <div className="contadores">
          {r.conferir > 0 && <a className="contador-bloco destaque" href="#/limpeza/pedidos"><strong>{r.conferir}</strong><span>para analisar</span></a>}
          {r.tarefa_ciclo && <a className="contador-bloco destaque" href={r.tarefa_ciclo === 'consolidar' || r.tarefa_ciclo === 'comprar' ? `#/limpeza/consolidado/${c.id}` : '#/limpeza'}><strong>!</strong><span>{TAREFAS[r.tarefa_ciclo]}</span></a>}
        </div>
      )}
    </section>
  )
}
