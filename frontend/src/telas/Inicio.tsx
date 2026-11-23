import { NOMES_FUNCOES, NOMES_PERFIS, type Usuario } from '../api'
import { Icone, Topo } from '../ui'
import { ResumoChamados } from './Chamados'
import { ResumoOrdensInicio } from './Ordens'
import { ResumoLimpezaInicio } from './Limpeza'
import { InstalarApp } from '../instalar'

export function Inicio({ usuario }: { usuario: Usuario }) {
  const primeiroNome = usuario.nome.split(' ')[0]
  const funcao = (casaId: number) => usuario.funcoes_casa.find((f) => f.casa_id === casaId)?.funcao
  const ehAdmin = usuario.permissoes.some((p) => p.startsWith('admin.'))

  return (
    <main className="pagina">
      <Topo titulo={`Olá, ${primeiroNome}`} />
      <p className="contexto">{usuario.tenant?.nome}</p>
      <InstalarApp />

      {usuario.permissoes.includes('chamados.ver') && <ResumoChamados usuario={usuario} />}
      {usuario.permissoes.includes('chamados.ver') && <ResumoOrdensInicio />}
      {usuario.permissoes.includes('cns.ver') && <ResumoLimpezaInicio />}

      <section className="bloco">
        <h2>Seus perfis</h2>
        <ul className="etiquetas">
          {usuario.perfis.map((p) => <li key={p}>{NOMES_PERFIS[p] ?? p}</li>)}
        </ul>
      </section>

      <section className="bloco">
        <div className="bloco-cabeca">
          <h2>{usuario.casas.length === 1 ? 'Sua Casa de Oração' : `Casas de Oração (${usuario.casas.length})`}</h2>
          {usuario.casas.length > 4 && <a href="#/casas">Ver todas</a>}
        </div>
        {usuario.casas.length === 0 && <p className="vazio">Nenhuma casa no seu acesso ainda.</p>}
        <ul className="lista">
          {usuario.casas.slice(0, 4).map((c) => (
            <li key={c.id}>
              <a className="item" href={`#/casas/${c.id}`}>
                <div>
                  <strong>{c.nome}</strong>
                  <span>{c.grupo} · {c.codigo}{funcao(c.id) ? ` · ${NOMES_FUNCOES[funcao(c.id)!]}` : ''}</span>
                </div>
                <Icone nome="seta" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      {ehAdmin && (
        <section className="bloco">
          <h2>Atalhos</h2>
          <div className="atalhos">
            <a href="#/admin/usuarios/novo" className="atalho"><Icone nome="usuarios" />Novo usuário</a>
            <a href="#/admin/casas/nova" className="atalho"><Icone nome="casas" />Nova casa</a>
          </div>
        </section>
      )}

    </main>
  )
}
