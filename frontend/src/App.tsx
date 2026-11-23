import { useCallback, useEffect, useState } from 'react'
import { api, carregarSessao, quandoPerderSessao, type Usuario } from './api'
import { Carregando, Icone, useRota } from './ui'
import { Entrar, TrocarSenha } from './telas/Acesso'
import { Inicio } from './telas/Inicio'
import { CasaDetalhe, ListaCasas } from './telas/Casas'
import { ChamadoDetalhe, ListaChamados, NovoChamado } from './telas/Chamados'
import { ListaOrdens, ListaPendencias, ModelosEtapas, OrdemDetalhe } from './telas/Ordens'
import { CatalogoLimpeza, CiclosLimpeza, ConferirPedido, ConsolidadoLimpeza, LojaLimpeza, PainelLimpeza, PedidosLimpeza } from './telas/Limpeza'
import { EstoqueDetalhe, ListaEstoques } from './telas/Estoque'
import { ChecklistVisitas, ListaVisitas, VisitaDetalhe } from './telas/Visitas'
import { Admin } from './telas/Admin'
import { Conta } from './telas/Conta'

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined)
  const [falhaInicial, setFalhaInicial] = useState(false)
  const [pendencias, setPendencias] = useState(0)
  const [pendObras, setPendObras] = useState(0)
  const [pendLimpeza, setPendLimpeza] = useState(0)
  const rotaCompleta = useRota()
  const [rota, textoConsulta = ''] = rotaCompleta.split('?')
  const consulta = new URLSearchParams(textoConsulta)

  const recarregar = useCallback(async () => {
    try {
      setUsuario(await carregarSessao())
      setFalhaInicial(false)
    } catch {
      setFalhaInicial(true)
    }
  }, [])

  useEffect(() => {
    quandoPerderSessao(() => setUsuario(null))
    recarregar()
  }, [recarregar])

  const veChamados = !!usuario && !usuario.trocar_senha && usuario.permissoes.includes('chamados.ver')
  // Número de chamados esperando a pessoa, no menu. Atualiza a cada troca de tela.
  useEffect(() => {
    if (!veChamados) return
    api<{ para_mim: number }>('GET', '/chamados/resumo').then((r) => setPendencias(r.para_mim)).catch(() => {})
  }, [veChamados, rotaCompleta])
  useEffect(() => {
    if (!veChamados) return
    api<{ para_mim: number }>('GET', '/ordens/resumo').then((r) => setPendObras(r.para_mim)).catch(() => {})
  }, [veChamados, rotaCompleta])
  const veLimpeza = !!usuario && !usuario.trocar_senha && usuario.permissoes.includes('cns.ver')
  useEffect(() => {
    if (!veLimpeza) return
    api<{ para_mim: number }>('GET', '/cns/resumo').then((r) => setPendLimpeza(r.para_mim)).catch(() => {})
  }, [veLimpeza, rotaCompleta])

  if (falhaInicial) {
    return (
      <main className="centro">
        <p>Não foi possível conectar ao servidor.</p>
        <button className="botao" onClick={recarregar}>Tentar de novo</button>
      </main>
    )
  }
  if (usuario === undefined) return <main className="centro"><Carregando /></main>
  if (usuario === null) return <Entrar aoEntrar={setUsuario} />
  if (usuario.trocar_senha) return <TrocarSenha obrigatoria aoConcluir={recarregar} />

  const ehAdmin = usuario.permissoes.some((p) => p.startsWith('admin.'))
  const partes = rota.split('/')
  const secao = partes[1] || ''

  let tela
  if (secao === '') tela = <Inicio usuario={usuario} />
  else if (secao === 'casas' && partes[2]) tela = <CasaDetalhe id={Number(partes[2])} />
  else if (secao === 'casas') tela = <ListaCasas />
  else if (secao === 'chamados' && veChamados && partes[2] === 'novo' && usuario.permissoes.includes('chamados.abrir'))
    tela = <NovoChamado key={rotaCompleta} usuario={usuario} casaInicial={consulta.get('casa')} />
  else if (secao === 'chamados' && veChamados && partes[2]) tela = <ChamadoDetalhe key={rotaCompleta} id={Number(partes[2])} consulta={consulta} />
  else if (secao === 'chamados' && veChamados) tela = <ListaChamados key={rotaCompleta} usuario={usuario} consulta={consulta} />
  else if (secao === 'ordens' && veChamados && partes[2] === 'pendencias') tela = <ListaPendencias />
  else if (secao === 'ordens' && veChamados && partes[2] === 'modelos' && usuario.permissoes.includes('etapas.modelos')) tela = <ModelosEtapas />
  else if (secao === 'ordens' && veChamados && partes[2]) tela = <OrdemDetalhe key={rotaCompleta} id={Number(partes[2])} />
  else if (secao === 'ordens' && veChamados) tela = <ListaOrdens key={rotaCompleta} usuario={usuario} consulta={consulta} />
  else if (secao === 'limpeza' && veLimpeza) {
    const id = Number(partes[3])
    if (partes[2] === 'loja' && id) tela = <LojaLimpeza key={rotaCompleta} casaId={id} />
    else if (partes[2] === 'pedidos' && id) tela = <ConferirPedido key={rotaCompleta} id={id} />
    else if (partes[2] === 'pedidos') tela = <PedidosLimpeza />
    else if (partes[2] === 'consolidado' && id) tela = <ConsolidadoLimpeza key={rotaCompleta} id={id} aba={partes[4]} />
    else if (partes[2] === 'catalogo' && usuario.permissoes.includes('cns.gerir')) tela = <CatalogoLimpeza />
    else if (partes[2] === 'ciclos') tela = <CiclosLimpeza />
    else if (partes[2] === 'visitas' && partes[3] === 'checklist' && usuario.permissoes.includes('cns.gerir')) tela = <ChecklistVisitas />
    else if (partes[2] === 'visitas' && id && usuario.permissoes.includes('cns.visitas')) tela = <VisitaDetalhe key={rotaCompleta} id={id} />
    else if (partes[2] === 'visitas' && usuario.permissoes.includes('cns.visitas')) tela = <ListaVisitas usuario={usuario} />
    else if (partes[2] === 'estoque' && id) tela = <EstoqueDetalhe key={rotaCompleta} id={id} />
    else if (partes[2] === 'estoque') tela = <ListaEstoques />
    else tela = <PainelLimpeza key={rotaCompleta} usuario={usuario} />
  }
  else if (secao === 'admin' && ehAdmin) tela = <Admin rota={rota} usuario={usuario} aoMudarProprio={recarregar} />
  else if (secao === 'conta') tela = <Conta usuario={usuario} aoSair={() => setUsuario(null)} />
  else tela = <main className="pagina"><p>Página não encontrada.</p><a href="#/">Voltar ao início</a></main>

  type ItemMenu = { rota: string; secao: string; rotulo: string; icone: string; curto?: string; aviso?: number; titulo?: string }
  const itens: ItemMenu[] = [
    { rota: '/', secao: '', rotulo: 'Início', icone: 'inicio' },
    ...(veChamados ? [{ rota: '/chamados', secao: 'chamados', rotulo: 'Chamados', icone: 'chamados', aviso: pendencias, titulo: 'Manutenção' }] : []),
    ...(veChamados ? [{ rota: '/ordens', secao: 'ordens', rotulo: 'Ordens de Serviço', curto: 'OS', icone: 'lista', aviso: pendObras }] : []),
    ...(veLimpeza ? [{ rota: '/limpeza', secao: 'limpeza', rotulo: 'Limpeza', icone: 'balde', aviso: pendLimpeza, titulo: 'CNS' }] : []),
    { rota: '/casas', secao: 'casas', rotulo: 'Casas', icone: 'casas', titulo: 'Cadastros' },
    ...(ehAdmin ? [{ rota: '/admin', secao: 'admin', rotulo: 'Administração', curto: 'Admin', icone: 'admin' }] : []),
    { rota: '/conta', secao: 'conta', rotulo: 'Minha conta', curto: 'Conta', icone: 'conta' },
  ]

  return (
    <div className="app">
      <nav className="navegacao" aria-label="Menu principal">
        <div className="marca"><img src="/icone.svg" alt="" width="34" height="34" /><span>Sistema CCB<small>{usuario.tenant?.nome}</small></span></div>
        {itens.map((i) => [
          i.titulo ? <span key={'t' + i.rota} className="nav-titulo">{i.titulo}</span> : null,
          <a key={i.rota} href={'#' + i.rota} className={secao === i.secao ? 'ativo' : ''} aria-current={secao === i.secao ? 'page' : undefined}>
            <span className="nav-icone">
              <Icone nome={i.icone} />
              {i.aviso ? <b className="nav-aviso" aria-label={`${i.aviso} esperando por você`}>{i.aviso > 9 ? '9+' : i.aviso}</b> : null}
            </span>
            {i.curto ? <><span className="rotulo-longo">{i.rotulo}</span><span className="rotulo-curto">{i.curto}</span></> : <span>{i.rotulo}</span>}
          </a>,
        ])}
        <div className="nav-rodape">
          <span className="avatar" aria-hidden="true">{usuario.nome.trim().charAt(0).toUpperCase()}</span>
          <span><strong>{usuario.nome}</strong>{usuario.email}</span>
        </div>
      </nav>
      <div className="conteudo">{tela}</div>
    </div>
  )
}
