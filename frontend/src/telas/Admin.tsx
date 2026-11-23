import { useEffect, useState, type FormEvent } from 'react'
import { api, NOMES_FUNCOES, type Area, type Casa, type Categoria, type Grupo, type Usuario } from '../api'
import { AreaTexto, Aviso, Campo, Carregando, Icone, Selecao, Topo, Vazio, camposDe, dataHora, ir, mensagemDe } from '../ui'
import { ListaCasas } from './Casas'

type Props = { rota: string; usuario: Usuario; aoMudarProprio: () => void }

export function Admin({ rota, usuario, aoMudarProprio }: Props) {
  const [, , area, id] = rota.split('/')
  const pode = (p: string) => usuario.permissoes.includes(p)

  if (area === 'usuarios' && pode('admin.usuarios')) {
    if (id) return <FormUsuario id={id === 'novo' ? null : Number(id)} proprioId={usuario.id} aoMudarProprio={aoMudarProprio} />
    return <ListaUsuarios />
  }
  if (area === 'casas' && pode('admin.casas')) {
    if (id) return <FormCasa id={id === 'nova' ? null : Number(id)} />
    return <ListaCasas admin />
  }
  if (area === 'grupos' && pode('admin.grupos')) return <Grupos />
  if (area === 'configuracoes' && pode('admin.configuracoes')) return <Configuracoes />
  if (area === 'auditoria' && pode('admin.auditoria')) return <Auditoria />
  if (area === 'categorias' && pode('admin.categorias')) return <Categorias />
  if (area === 'areas' && pode('admin.areas')) return <Areas />

  const opcoes = [
    { p: 'admin.usuarios', rota: '/admin/usuarios', icone: 'usuarios', titulo: 'Usuários', texto: 'Cadastro, perfis e vínculo com as casas' },
    { p: 'admin.casas', rota: '/admin/casas', icone: 'casas', titulo: 'Casas de Oração', texto: 'Endereço, grupo, horários, ministério e fotos' },
    { p: 'admin.areas', rota: '/admin/areas', icone: 'pessoas', titulo: 'Áreas', texto: 'Civil, Elétrica, Compras… e quem faz parte de cada uma' },
    { p: 'admin.grupos', rota: '/admin/grupos', icone: 'grupos', titulo: 'Grupos', texto: 'Organização das casas por grupo' },
    { p: 'admin.categorias', rota: '/admin/categorias', icone: 'chamados', titulo: 'Tipos de chamado', texto: 'Categorias e quais passam pela Segurança do Trabalho' },
    { p: 'etapas.modelos', rota: '/ordens/modelos', icone: 'lista', titulo: 'Modelos de etapas', texto: 'Etapas prontas para as Ordens de Serviço (Pintura, Troca de piso…)' },
    { p: 'admin.configuracoes', rota: '/admin/configuracoes', icone: 'ajustes', titulo: 'Alçadas e regras', texto: 'Valores de aprovação e prazos de guarda' },
    { p: 'admin.auditoria', rota: '/admin/auditoria', icone: 'historico', titulo: 'Auditoria', texto: 'Quem fez o quê, e quando' },
  ].filter((o) => pode(o.p))

  return (
    <main className="pagina">
      <Topo titulo="Administração" />
      <ul className="lista">
        {opcoes.map((o) => (
          <li key={o.rota}>
            <a className="item item-icone" href={'#' + o.rota}>
              <span className="item-simbolo"><Icone nome={o.icone} /></span>
              <div><strong>{o.titulo}</strong><span>{o.texto}</span></div>
              <Icone nome="seta" />
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}

// ================================================================ Usuários

type ItemUsuario = { id: number; nome: string; email: string; ativo: boolean; perfis: string | null; areas: string | null; ultimo_login_em: string | null }
type Perfil = { codigo: string; nome: string; escopo: string; descricao: string }
type UsuarioCompleto = {
  id: number; nome: string; email: string; telefone: string | null; ativo: boolean
  perfis: { perfil: string; grupo_id: number | null }[]
  casas: { casa_id: number; funcao: string }[]
  areas: number[]
}

function ListaUsuarios() {
  const [lista, setLista] = useState<ItemUsuario[] | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      api<ItemUsuario[]>('GET', '/usuarios' + (busca ? '?busca=' + encodeURIComponent(busca) : ''))
        .then(setLista).catch((e) => setErro(mensagemDe(e)))
    }, 250)
    return () => clearTimeout(t)
  }, [busca])

  return (
    <main className="pagina">
      <Topo titulo="Usuários" voltar="/admin"
        acao={<a className="botao botao-cheio botao-pequeno" href="#/admin/usuarios/novo"><Icone nome="mais" tamanho={18} />Novo</a>} />
      <div className="filtros">
        <label className="busca">
          <Icone nome="busca" tamanho={18} />
          <input type="search" placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar usuários" />
        </label>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!lista && !erro && <Carregando />}
      {lista && lista.length === 0 && <Vazio>Nenhum usuário encontrado.</Vazio>}
      <ul className="lista">
        {lista?.map((u) => (
          <li key={u.id}>
            <a className="item" href={`#/admin/usuarios/${u.id}`}>
              <div>
                <strong>{u.nome}{!u.ativo && <em className="selo">desativado</em>}</strong>
                <span>{[u.perfis, u.areas ? `Áreas: ${u.areas}` : null].filter(Boolean).join(' · ') || 'Sem perfil'}</span>
                <span className="fraco">{u.email} · último acesso: {dataHora(u.ultimo_login_em)}</span>
              </div>
              <Icone nome="seta" />
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}

function FormUsuario({ id, proprioId, aoMudarProprio }: { id: number | null; proprioId: number; aoMudarProprio: () => void }) {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [casas, setCasas] = useState<Casa[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [areasUsuario, setAreasUsuario] = useState<number[]>([])
  const [carregado, setCarregado] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [grupoCoord, setGrupoCoord] = useState<string[]>([])
  const [casasUsuario, setCasasUsuario] = useState<{ casa_id: number; funcao: string }[]>([])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [novaSenha, setNovaSenha] = useState('')

  useEffect(() => {
    Promise.all([
      api<Perfil[]>('GET', '/perfis'),
      api<Grupo[]>('GET', '/grupos'),
      api<Casa[]>('GET', '/casas'),
      id ? api<UsuarioCompleto>('GET', '/usuarios/' + id) : Promise.resolve(null),
      api<Area[]>('GET', '/areas?todas=1').catch(() => [] as Area[]),
    ]).then(([p, g, c, u, ar]) => {
      setPerfis(p); setGrupos(g.filter((x) => x.ativo)); setCasas(c); setAreas(ar)
      if (u) {
        setNome(u.nome); setEmail(u.email); setTelefone(u.telefone ?? ''); setAtivo(u.ativo)
        setMarcados(Object.fromEntries(u.perfis.map((x) => [x.perfil, true])))
        setGrupoCoord(u.perfis.filter((x) => x.grupo_id).map((x) => String(x.grupo_id)))
        setCasasUsuario(u.casas); setAreasUsuario(u.areas ?? [])
      }
      setCarregado(true)
    }).catch((e) => setErro(mensagemDe(e)))
  }, [id])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setErros({}); setOk('')
    const listaPerfis: { perfil: string; grupo_id?: number }[] = []
    for (const p of perfis) {
      if (!marcados[p.codigo]) continue
      if (p.escopo === 'grupo') {
        if (grupoCoord.length === 0) listaPerfis.push({ perfil: p.codigo })
        grupoCoord.forEach((g) => listaPerfis.push({ perfil: p.codigo, grupo_id: Number(g) }))
      } else listaPerfis.push({ perfil: p.codigo })
    }
    const corpo = {
      nome, email, telefone, ativo,
      perfis: listaPerfis,
      casas: marcados.casa_oracao ? casasUsuario : [],
      areas: areasUsuario,
      ...(id ? {} : { senha }),
    }
    setEnviando(true)
    try {
      const r = await api<UsuarioCompleto>(id ? 'PUT' : 'POST', id ? '/usuarios/' + id : '/usuarios', corpo)
      if (id === proprioId) aoMudarProprio()
      if (!id) ir('/admin/usuarios/' + r.id)
      setOk(id ? 'Alterações salvas.' : 'Usuário criado. Ele vai trocar a senha no primeiro acesso.')
    } catch (err) {
      setErro(mensagemDe(err)); setErros(camposDe(err))
    } finally {
      setEnviando(false)
    }
  }

  async function redefinir() {
    setErro(''); setOk(''); setErros({})
    try {
      await api('POST', `/usuarios/${id}/senha`, { senha: novaSenha })
      setNovaSenha('')
      setOk('Senha provisória definida. Passe para o usuário; ele troca no próximo acesso.')
    } catch (err) {
      setErro(mensagemDe(err)); setErros({ nova_senha_admin: camposDe(err).senha ?? '' })
    }
  }

  if (!carregado) return <main className="pagina">{erro ? <Aviso>{erro}</Aviso> : <Carregando />}</main>

  const alternarCasa = (casaId: number, funcao: string) => {
    setCasasUsuario((atual) => {
      const sem = atual.filter((c) => c.casa_id !== casaId)
      return funcao ? [...sem, { casa_id: casaId, funcao }] : sem
    })
  }
  const erroPerfis = Object.entries(erros).filter(([k]) => k.startsWith('perfis')).map(([, v]) => v)[0]

  return (
    <main className="pagina">
      <Topo titulo={id ? 'Editar usuário' : 'Novo usuário'} voltar="/admin/usuarios" />
      <form onSubmit={salvar} noValidate>
        {erro && <Aviso>{erro}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}

        <fieldset className="grupo-form">
          <legend>Dados pessoais</legend>
          <Campo rotulo="Nome completo" nome="nome" valor={nome} aoMudar={setNome} erro={erros.nome} obrigatorio />
          <Campo rotulo="E-mail (usado para entrar)" nome="email" tipo="email" valor={email} aoMudar={setEmail} erro={erros.email} inputMode="email" obrigatorio />
          <Campo rotulo="Telefone" nome="telefone" tipo="tel" valor={telefone} aoMudar={setTelefone} erro={erros.telefone} inputMode="tel" />
          {!id && (
            <Campo rotulo="Senha provisória" nome="senha" tipo="text" valor={senha} aoMudar={setSenha} erro={erros.senha}
              dica="Pelo menos 8 caracteres, com letras e números. A pessoa troca no primeiro acesso." obrigatorio />
          )}
          {id && (
            <label className="caixa">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} disabled={id === proprioId} />
              Acesso ativo
            </label>
          )}
          {erros.ativo && <small className="msg-erro">{erros.ativo}</small>}
        </fieldset>

        <fieldset className={'grupo-form' + (erroPerfis ? ' campo-erro' : '')}>
          <legend>Perfis</legend>
          {erroPerfis && <small className="msg-erro">{erroPerfis}</small>}
          {perfis.map((p) => (
            <div key={p.codigo} className="perfil-opcao">
              <label className="caixa">
                <input type="checkbox" checked={!!marcados[p.codigo]} onChange={(e) => setMarcados({ ...marcados, [p.codigo]: e.target.checked })} />
                <span><strong>{p.nome}</strong><small>{p.descricao}</small></span>
              </label>

              {p.escopo === 'grupo' && marcados[p.codigo] && (
                <div className="sub-opcoes">
                  <p>{p.codigo === 'orientadora_cns' ? 'Grupos em que é orientadora:' : 'Grupos que coordena:'}</p>
                  {grupos.map((g) => (
                    <label key={g.id} className="caixa">
                      <input type="checkbox" checked={grupoCoord.includes(String(g.id))}
                        onChange={(e) => setGrupoCoord(e.target.checked ? [...grupoCoord, String(g.id)] : grupoCoord.filter((x) => x !== String(g.id)))} />
                      {g.nome}
                    </label>
                  ))}
                </div>
              )}

              {p.codigo === 'casa_oracao' && marcados[p.codigo] && (
                <div className="sub-opcoes">
                  <p>Casa e função:</p>
                  {erros.casas && <small className="msg-erro">{erros.casas}</small>}
                  <ul className="vinculos">
                    {casasUsuario.map((v) => {
                      const c = casas.find((x) => x.id === v.casa_id)
                      return (
                        <li key={v.casa_id}>
                          <span><strong>{c?.nome ?? 'Casa #' + v.casa_id}</strong><small>{NOMES_FUNCOES[v.funcao]}</small></span>
                          <button type="button" className="botao botao-pequeno" onClick={() => alternarCasa(v.casa_id, '')}>Remover</button>
                        </li>
                      )
                    })}
                  </ul>
                  <AdicionarCasa casas={casas.filter((c) => !casasUsuario.some((v) => v.casa_id === c.id))} comFuncao
                    aoAdicionar={(id, f) => alternarCasa(id, f)} />
                </div>
              )}

            </div>
          ))}
        </fieldset>

        <fieldset className="grupo-form">
          <legend>Áreas</legend>
          <p className="fraco">Quem é de uma área vê e trabalha nos chamados encaminhados a ela (orçamento, Ordem de Serviço e etapas), mesmo sem outro perfil.</p>
          {erros.areas && <small className="msg-erro">{erros.areas}</small>}
          <div className="grade-caixas">
            {areas.map((a) => (
              <label key={a.id} className={'caixa caixa-cartao' + (areasUsuario.includes(a.id) ? ' marcada' : '') + (a.ativo ? '' : ' inativa')}>
                <input type="checkbox" checked={areasUsuario.includes(a.id)}
                  onChange={(e) => setAreasUsuario(e.target.checked ? [...areasUsuario, a.id] : areasUsuario.filter((x) => x !== a.id))} />
                <span><strong>{a.nome}</strong>{a.descricao && <small>{a.descricao}</small>}</span>
              </label>
            ))}
          </div>
          {areas.length === 0 && <p className="fraco">Nenhuma área cadastrada. Crie em Administração → Áreas.</p>}
        </fieldset>

        <button className="botao botao-cheio" disabled={enviando}>{enviando ? 'Salvando…' : id ? 'Salvar alterações' : 'Criar usuário'}</button>
      </form>

      {id && id !== proprioId && (
        <section className="bloco">
          <h2>Senha provisória</h2>
          <p className="fraco">Use quando a pessoa esquecer a senha.</p>
          <Campo rotulo="Nova senha provisória" nome="nova_senha_admin" valor={novaSenha} aoMudar={setNovaSenha} erro={erros.nova_senha_admin} />
          <button className="botao" onClick={redefinir} disabled={!novaSenha}>Definir senha provisória</button>
        </section>
      )}
    </main>
  )
}

/** Escolha de uma casa (agrupada por grupo) para vincular; evita listar as 32 casas na tela. */
function AdicionarCasa({ casas, comFuncao, aoAdicionar }: { casas: Casa[]; comFuncao?: boolean; aoAdicionar: (id: number, funcao: string) => void }) {
  const [casa, setCasa] = useState('')
  const [funcao, setFuncao] = useState('')
  const grupos = [...new Set(casas.map((c) => c.grupo))]
  if (casas.length === 0) return null
  return (
    <div className="adicionar-casa">
      <select value={casa} onChange={(e) => setCasa(e.target.value)} aria-label="Escolher casa">
        <option value="">Escolher casa…</option>
        {grupos.map((g) => (
          <optgroup key={g} label={g}>
            {casas.filter((c) => c.grupo === g).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </optgroup>
        ))}
      </select>
      {comFuncao && (
        <select value={funcao} onChange={(e) => setFuncao(e.target.value)} aria-label="Função na casa">
          <option value="">Função…</option>
          {Object.entries(NOMES_FUNCOES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      )}
      <button type="button" className="botao botao-pequeno" disabled={!casa || (comFuncao && !funcao)}
        onClick={() => { aoAdicionar(Number(casa), funcao); setCasa(''); setFuncao('') }}>
        Adicionar
      </button>
    </div>
  )
}

// ================================================================ Casas

function FormCasa({ id }: { id: number | null }) {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [d, setD] = useState({ grupo_id: '', codigo: '', nome: '', endereco: '', bairro: '', cidade: '', cep: '', horarios_culto: '', capacidade: '', observacoes: '', ativo: true })
  const [casa, setCasa] = useState<Casa | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    Promise.all([api<Grupo[]>('GET', '/grupos'), id ? api<Casa>('GET', '/casas/' + id) : Promise.resolve(null)])
      .then(([g, c]) => {
        setGrupos(g)
        if (c) {
          setCasa(c)
          setD({ grupo_id: String(c.grupo_id), codigo: c.codigo, nome: c.nome, endereco: c.endereco ?? '', bairro: c.bairro ?? '',
            cidade: c.cidade ?? '', cep: c.cep ?? '', horarios_culto: c.horarios_culto ?? '', capacidade: c.capacidade ? String(c.capacidade) : '',
            observacoes: c.observacoes ?? '', ativo: c.ativo })
        }
        setCarregado(true)
      }).catch((e) => setErro(mensagemDe(e)))
  }, [id])

  const mudar = (k: keyof typeof d) => (v: string) => setD({ ...d, [k]: v })

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setErros({}); setOk('')
    setEnviando(true)
    try {
      const r = await api<Casa>(id ? 'PUT' : 'POST', id ? '/casas/' + id : '/casas', d)
      if (!id) ir('/admin/casas/' + r.id)
      setOk(id ? 'Alterações salvas.' : 'Casa cadastrada, com o seu DML Local.')
    } catch (err) {
      setErro(mensagemDe(err)); setErros(camposDe(err))
    } finally {
      setEnviando(false)
    }
  }

  if (!carregado) return <main className="pagina">{erro ? <Aviso>{erro}</Aviso> : <Carregando />}</main>

  return (
    <main className="pagina">
      <Topo titulo={id ? 'Editar casa' : 'Nova Casa de Oração'} voltar={id ? `/casas/${id}` : '/admin/casas'}
        acao={id ? <a className="botao botao-pequeno" href={`#/casas/${id}`}>Ver página</a> : undefined} />
      <form onSubmit={salvar} noValidate>
        {erro && <Aviso>{erro}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        <Selecao rotulo="Grupo" nome="grupo_id" valor={d.grupo_id} aoMudar={mudar('grupo_id')} erro={erros.grupo_id} obrigatorio
          opcoes={grupos.filter((g) => g.ativo || String(g.id) === d.grupo_id).map((g) => ({ valor: String(g.id), texto: g.nome }))} />
        <Campo rotulo="Código" nome="codigo" valor={d.codigo} aoMudar={mudar('codigo')} erro={erros.codigo} dica="Identificador curto, único. Ex.: CO-01" obrigatorio />
        <Campo rotulo="Nome" nome="nome" valor={d.nome} aoMudar={mudar('nome')} erro={erros.nome} obrigatorio />
        <Campo rotulo="Endereço" nome="endereco" valor={d.endereco} aoMudar={mudar('endereco')} erro={erros.endereco} />
        <Campo rotulo="Bairro" nome="bairro" valor={d.bairro} aoMudar={mudar('bairro')} erro={erros.bairro} />
        <Campo rotulo="Cidade" nome="cidade" valor={d.cidade} aoMudar={mudar('cidade')} erro={erros.cidade} />
        <Campo rotulo="CEP" nome="cep" valor={d.cep} aoMudar={mudar('cep')} erro={erros.cep} inputMode="numeric" />
        <Campo rotulo="Horários de culto" nome="horarios_culto" valor={d.horarios_culto} aoMudar={mudar('horarios_culto')} erro={erros.horarios_culto}
          dica="Ex.: Domingo 18h30 · Quarta 19h30" />
        <Campo rotulo="Capacidade (pessoas)" nome="capacidade" valor={d.capacidade} aoMudar={mudar('capacidade')} erro={erros.capacidade} inputMode="numeric" />
        <AreaTexto rotulo="Observações" nome="observacoes" valor={d.observacoes} aoMudar={mudar('observacoes')} erro={erros.observacoes}
          dica="Informações úteis: estacionamento, acesso, chaves, particularidades do prédio." />
        {id && (
          <label className="caixa"><input type="checkbox" checked={d.ativo} onChange={(e) => setD({ ...d, ativo: e.target.checked })} />Casa ativa</label>
        )}
        <button className="botao botao-cheio" disabled={enviando}>{enviando ? 'Salvando…' : id ? 'Salvar alterações' : 'Cadastrar casa'}</button>
      </form>
      {casa?.usuarios && (
        <section className="bloco">
          <h2>Usuários vinculados</h2>
          {casa.usuarios.length === 0 && <Vazio>Nenhum usuário vinculado. Vincule pelo cadastro de usuários.</Vazio>}
          <ul className="lista">
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
    </main>
  )
}

// ================================================================ Grupos

function Grupos() {
  const [lista, setLista] = useState<Grupo[] | null>(null)
  const [novo, setNovo] = useState('')
  const [editando, setEditando] = useState<{ id: number; nome: string } | null>(null)
  const [erro, setErro] = useState('')

  const carregar = () => api<Grupo[]>('GET', '/grupos').then(setLista).catch((e) => setErro(mensagemDe(e)))
  useEffect(() => { carregar() }, [])

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    try { await api('POST', '/grupos', { nome: novo }); setNovo(''); carregar() } catch (err) { setErro(Object.values(camposDe(err))[0] ?? mensagemDe(err)) }
  }
  async function salvar(g: Grupo, nome: string, ativo: boolean) {
    setErro('')
    try { await api('PUT', '/grupos/' + g.id, { nome, ativo }); setEditando(null); carregar() } catch (err) { setErro(Object.values(camposDe(err))[0] ?? mensagemDe(err)) }
  }

  return (
    <main className="pagina">
      <Topo titulo="Grupos" voltar="/admin" />
      {erro && <Aviso>{erro}</Aviso>}
      <form className="linha-form" onSubmit={criar}>
        <input placeholder="Nome do novo grupo" value={novo} onChange={(e) => setNovo(e.target.value)} aria-label="Nome do novo grupo" />
        <button className="botao botao-cheio" disabled={!novo.trim()}>Adicionar</button>
      </form>
      {!lista && <Carregando />}
      <ul className="lista">
        {lista?.map((g) => (
          <li key={g.id} className="item">
            {editando?.id === g.id ? (
              <form className="linha-form" onSubmit={(e) => { e.preventDefault(); salvar(g, editando.nome, g.ativo) }}>
                <input value={editando.nome} onChange={(e) => setEditando({ id: g.id, nome: e.target.value })} aria-label="Nome do grupo" autoFocus />
                <button className="botao botao-cheio botao-pequeno">Salvar</button>
                <button type="button" className="botao botao-pequeno" onClick={() => setEditando(null)}>Cancelar</button>
              </form>
            ) : (
              <>
                <div><strong>{g.nome}{!g.ativo && <em className="selo">desativado</em>}</strong><span>{g.casas ?? 0} casas ativas</span></div>
                <div className="acoes">
                  <button className="botao botao-pequeno" onClick={() => setEditando({ id: g.id, nome: g.nome })}>Renomear</button>
                  <button className="botao botao-pequeno" onClick={() => salvar(g, g.nome, !g.ativo)}>{g.ativo ? 'Desativar' : 'Ativar'}</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}

// ================================================================ Configurações

const ROTULOS_CONFIG: Record<string, [string, string, string]> = {
  alcada_coordenacao_max: ['Coordenação aprova até', 'R$', 'Chamados até este valor são aprovados pela Coordenação do grupo.'],
  alcada_gestao_max: ['Gestão aprova até', 'R$', 'Acima deste valor, somente os Procuradores aprovam.'],
  reaprovacao_aumento_min: ['Reaprovação acima de', 'R$', 'Aumento que exige nova aprovação dos Procuradores.'],
  orcamento_obrigatorio_acima: ['Orçamento anexado acima de', 'R$', 'A partir deste valor, o orçamento precisa ir anexado.'],
  retencao_fotos_servico_meses: ['Guardar fotos de serviço por', 'meses', 'Depois disso são apagadas automaticamente.'],
  retencao_documentos_meses: ['Guardar notas e orçamentos por', 'meses', 'Prazo de guarda dos documentos.'],
}

function Configuracoes() {
  const [cfg, setCfg] = useState<Record<string, string> | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => { api<Record<string, string>>('GET', '/configuracoes').then(setCfg).catch((e) => setErro(mensagemDe(e))) }, [])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setErros({}); setOk('')
    try { setCfg(await api('PUT', '/configuracoes', cfg)); setOk('Regras atualizadas.') } catch (err) { setErro(mensagemDe(err)); setErros(camposDe(err)) }
  }

  return (
    <main className="pagina">
      <Topo titulo="Alçadas e regras" voltar="/admin" />
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {!cfg && !erro && <Carregando />}
      {cfg && (
        <form onSubmit={salvar} noValidate>
          {Object.entries(ROTULOS_CONFIG).map(([k, [rotulo, unidade, dica]]) => (
            <Campo key={k} rotulo={`${rotulo} (${unidade})`} nome={k} valor={cfg[k] ?? ''} aoMudar={(v) => setCfg({ ...cfg, [k]: v })}
              erro={erros[k]} dica={dica} inputMode="decimal" />
          ))}
          <p className="nota">Obras têm fluxo próprio: são sempre aprovadas pelos Procuradores.</p>
          <button className="botao botao-cheio">Salvar regras</button>
        </form>
      )}
    </main>
  )
}

// ================================================================ Auditoria

type Registro = { id: number; acao: string; entidade: string; entidade_id: number | null; usuario: string | null; ip: string; criado_em: string }

const ACOES: Record<string, string> = {
  criar: 'Criou', editar: 'Editou', excluir: 'Excluiu', login: 'Entrou no sistema', logout: 'Saiu do sistema', trocar_senha: 'Trocou a senha',
  redefinir_senha: 'Definiu senha provisória', enviar_foto: 'Enviou foto', excluir_foto: 'Apagou foto', excluir_anexo: 'Apagou arquivo',
  triar: 'Fez a triagem', atribuir: 'Mudou o responsável', enviar_orcamento: 'Enviou orçamento', parecer: 'Deu parecer de segurança',
  aprovar: 'Aprovou', devolver: 'Devolveu', iniciar: 'Iniciou o serviço', ajustar_valor: 'Mudou o valor', concluir: 'Concluiu o serviço',
  confirmar: 'Confirmou a solução', reabrir: 'Reabriu', cancelar: 'Cancelou', encaminhar_obra: 'Encaminhou para Obras',
  decidir_teto: 'Decidiu o teto', pedir_teto: 'Pediu teto novo', pausar: 'Pausou', retomar: 'Retomou', lancar_gasto: 'Lançou gasto', estornar_gasto: 'Estornou gasto',
}
const ENTIDADES: Record<string, string> = {
  casas_oracao: 'Casa de Oração', grupos: 'Grupo', usuarios: 'Usuário', configuracoes_tenant: 'Regras e alçadas', tenants: 'Organização',
  casas_ministerio: 'Ministério', chamados: 'Chamado', chamados_categorias: 'Tipo de chamado', obras: 'Obra',
}

function Auditoria() {
  const [pagina, setPagina] = useState(1)
  const [itens, setItens] = useState<Registro[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setItens(null)
    api<{ itens: Registro[] }>('GET', '/auditoria?pagina=' + pagina).then((r) => setItens(r.itens)).catch((e) => setErro(mensagemDe(e)))
  }, [pagina])

  const sessao = (a: string) => a === 'login' || a === 'logout' || a.includes('senha')

  return (
    <main className="pagina">
      <Topo titulo="Auditoria" voltar="/admin" />
      {erro && <Aviso>{erro}</Aviso>}
      {!itens && !erro && <Carregando />}
      {itens && itens.length === 0 && <Vazio>Nenhum registro nesta página.</Vazio>}
      <ul className="lista lista-compacta">
        {itens?.map((r) => (
          <li key={r.id} className="item">
            <div>
              <strong>{r.usuario ?? 'Sistema'}</strong>
              <span>{ACOES[r.acao] ?? r.acao}{!sessao(r.acao) ? ` · ${ENTIDADES[r.entidade] ?? r.entidade}${r.entidade_id ? ' #' + r.entidade_id : ''}` : ''}
                {(r.entidade === 'chamados' || r.entidade === 'obras') && r.entidade_id ? <> · <a href={`#/${r.entidade}/${r.entidade_id}`}>abrir</a></> : null}</span>
              <span className="fraco">{dataHora(r.criado_em)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="paginacao">
        <button className="botao botao-pequeno" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Mais recentes</button>
        <span>Página {pagina}</span>
        <button className="botao botao-pequeno" disabled={!itens || itens.length < 50} onClick={() => setPagina(pagina + 1)}>Mais antigos</button>
      </div>
    </main>
  )
}

// ================================================================ Tipos de chamado (Fase 3)

const ICONES_CATEGORIA = ['raio', 'gota', 'telhado', 'vento', 'chave', 'pincel', 'piso', 'som', 'escudo', 'banco', 'folha', 'outros']

function Categorias() {
  const [lista, setLista] = useState<Categoria[] | null>(null)
  const [nova, setNova] = useState('')
  const [editando, setEditando] = useState<{ id: number; nome: string } | null>(null)
  const [erro, setErro] = useState('')

  const carregar = () => api<Categoria[]>('GET', '/categorias-chamado').then(setLista).catch((e) => setErro(mensagemDe(e)))
  useEffect(() => { carregar() }, [])

  async function salvar(c: Categoria, mudancas: Partial<Categoria>) {
    setErro('')
    try {
      await api('PUT', '/categorias-chamado/' + c.id, { nome: c.nome, icone: c.icone, exige_parecer_seguranca: c.exige_parecer_seguranca, ativo: c.ativo, ...mudancas })
      setEditando(null); carregar()
    } catch (err) { setErro(Object.values(camposDe(err))[0] ?? mensagemDe(err)) }
  }
  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    try { await api('POST', '/categorias-chamado', { nome: nova }); setNova(''); carregar() } catch (err) { setErro(Object.values(camposDe(err))[0] ?? mensagemDe(err)) }
  }

  return (
    <main className="pagina">
      <Topo titulo="Tipos de chamado" voltar="/admin" />
      <p className="contexto">É o que a casa escolhe ao abrir um chamado. Marque os que precisam do parecer da Segurança do Trabalho antes da aprovação.</p>
      {erro && <Aviso>{erro}</Aviso>}
      <form className="linha-form" onSubmit={criar}>
        <input placeholder="Novo tipo (ex.: Bebedouro)" value={nova} onChange={(e) => setNova(e.target.value)} aria-label="Nome do novo tipo" />
        <button className="botao botao-cheio" disabled={!nova.trim()}>Adicionar</button>
      </form>
      {!lista && <Carregando />}
      <ul className="lista">
        {lista?.map((c) => (
          <li key={c.id} className="item item-categoria">
            {editando?.id === c.id ? (
              <form className="linha-form" onSubmit={(e) => { e.preventDefault(); salvar(c, { nome: editando.nome }) }}>
                <input value={editando.nome} onChange={(e) => setEditando({ id: c.id, nome: e.target.value })} aria-label="Nome do tipo" autoFocus />
                <button className="botao botao-cheio botao-pequeno">Salvar</button>
                <button type="button" className="botao botao-pequeno" onClick={() => setEditando(null)}>Cancelar</button>
              </form>
            ) : (
              <>
                <button className="item-simbolo" title="Trocar o ícone" aria-label={`Trocar o ícone de ${c.nome}`}
                  onClick={() => salvar(c, { icone: ICONES_CATEGORIA[(ICONES_CATEGORIA.indexOf(c.icone) + 1) % ICONES_CATEGORIA.length] })}>
                  <Icone nome={c.icone} />
                </button>
                <div>
                  <strong>{c.nome}{!c.ativo && <em className="selo">desativado</em>}</strong>
                  <label className="caixa caixa-pequena">
                    <input type="checkbox" checked={c.exige_parecer_seguranca} onChange={(e) => salvar(c, { exige_parecer_seguranca: e.target.checked })} />
                    Passa pela Segurança do Trabalho
                  </label>
                </div>
                <div className="acoes">
                  <button className="botao botao-pequeno" onClick={() => setEditando({ id: c.id, nome: c.nome })}>Renomear</button>
                  <button className="botao botao-pequeno" onClick={() => salvar(c, { ativo: !c.ativo })}>{c.ativo ? 'Desativar' : 'Ativar'}</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}

// ================================================================ Áreas (v1.7.0)

function Areas() {
  const [areas, setAreas] = useState<Area[] | null>(null)
  const [editando, setEditando] = useState<number | 'nova' | null>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const carregar = () => api<Area[]>('GET', '/areas?todas=1').then(setAreas).catch((e) => setErro(mensagemDe(e)))
  useEffect(() => { carregar() }, [])

  const abrir = (a: Area | null) => {
    setErros({}); setErro('')
    setEditando(a ? a.id : 'nova'); setNome(a?.nome ?? ''); setDescricao(a?.descricao ?? ''); setAtivo(a?.ativo ?? true)
  }
  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setErros({})
    try {
      await api(editando === 'nova' ? 'POST' : 'PUT', editando === 'nova' ? '/areas' : `/areas/${editando}`, { nome, descricao, ativo })
      setEditando(null); carregar()
    } catch (err) { setErro(mensagemDe(err)); setErros(camposDe(err)) }
  }
  const form = (
    <form className="cartao" onSubmit={salvar} noValidate>
      {erro && <Aviso>{erro}</Aviso>}
      <Campo rotulo="Nome da área" nome="a-nome" valor={nome} aoMudar={setNome} erro={erros.nome} obrigatorio dica="Ex.: Civil, Elétrica, Hidráulica, Compras." />
      <Campo rotulo="O que ela atende (opcional)" nome="a-desc" valor={descricao} aoMudar={setDescricao} erro={erros.descricao} />
      {editando !== 'nova' && (
        <label className="caixa"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          <span><strong>Ativa</strong><small>Desativada, some da triagem e os membros deixam de ver os chamados dela.</small></span></label>
      )}
      <div className="acoes-form">
        <button type="button" className="botao" onClick={() => setEditando(null)}>Cancelar</button>
        <button className="botao botao-cheio" disabled={nome.trim().length < 2}>Salvar</button>
      </div>
    </form>
  )
  return (
    <main className="pagina">
      <Topo titulo="Áreas" voltar="/admin" acao={editando === null && <button className="botao botao-cheio botao-pequeno" onClick={() => abrir(null)}><Icone nome="mais" tamanho={18} />Nova área</button>} />
      <p className="contexto">Cada chamado é encaminhado para uma área. As pessoas entram nas áreas pelo cadastro de usuário (Administração → Usuários).</p>
      {editando === 'nova' && form}
      {!areas && !erro && <Carregando />}
      {areas && (
        <ul className="lista">
          {areas.map((a) => (
            <li key={a.id} className={a.ativo ? '' : 'inativo'}>
              {editando === a.id ? form : (
                <button className="item" onClick={() => abrir(a)}>
                  <span className="item-simbolo"><Icone nome="pessoas" /></span>
                  <div>
                    <strong>{a.nome}{!a.ativo && <span className="selo-status tom-parado">Desativada</span>}</strong>
                    <span>{a.membros.length ? a.membros.map((m) => m.nome).join(', ') : 'Ninguém na área ainda'}</span>
                  </div>
                  <span className="contagem-pessoas">{a.membros.length}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
