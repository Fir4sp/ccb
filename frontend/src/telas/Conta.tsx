import { api, NOMES_PERFIS, type Usuario } from '../api'
import { Topo } from '../ui'
import { TrocarSenha } from './Acesso'

export function Conta({ usuario, aoSair }: { usuario: Usuario; aoSair: () => void }) {
  async function sair() {
    try { await api('POST', '/auth/logout') } finally { aoSair(); location.hash = '/' }
  }
  return (
    <main className="pagina">
      <Topo titulo="Minha conta" />
      <dl className="ficha">
        <div><dt>Nome</dt><dd>{usuario.nome}</dd></div>
        <div><dt>E-mail</dt><dd>{usuario.email}</dd></div>
        <div><dt>Perfis</dt><dd>{usuario.perfis.map((p) => NOMES_PERFIS[p]).join(', ')}</dd></div>
      </dl>
      <section className="bloco">
        <h2>Trocar senha</h2>
        <TrocarSenha aoConcluir={() => {}} />
      </section>
      <button className="botao botao-sair" onClick={sair}>Sair do sistema</button>
    </main>
  )
}
