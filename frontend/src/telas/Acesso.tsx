import { useState, type FormEvent } from 'react'
import { api, carregarSessao, type Usuario } from '../api'
import { Aviso, Campo, camposDe, mensagemDe } from '../ui'
import { InstalarApp } from '../instalar'

export function Entrar({ aoEntrar }: { aoEntrar: (u: Usuario) => void }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await carregarSessao() // garante o token CSRF da sessão
      const r = await api<{ usuario: Usuario }>('POST', '/auth/login', { email, senha })
      aoEntrar(r.usuario)
    } catch (err) {
      setErro(mensagemDe(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="tela-entrada">
      <div className="cartao-entrada">
        <img src="/icone.svg" alt="" width="64" height="64" />
        <h1>Sistema CCB</h1>
        <p className="subtitulo">Manutenção, obras e materiais das Casas de Oração</p>
        <form onSubmit={enviar} noValidate>
          {erro && <Aviso>{erro}</Aviso>}
          <Campo rotulo="E-mail" nome="email" tipo="email" valor={email} aoMudar={setEmail} autoComplete="username" inputMode="email" obrigatorio />
          <Campo rotulo="Senha" nome="senha" tipo="password" valor={senha} aoMudar={setSenha} autoComplete="current-password" obrigatorio />
          <button className="botao botao-cheio" disabled={enviando || !email || !senha}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <InstalarApp />
        <p className="rodape-entrada">Esqueceu a senha? Fale com o administrador do sistema.</p>
      </div>
    </main>
  )
}

export function TrocarSenha({ obrigatoria, aoConcluir }: { obrigatoria?: boolean; aoConcluir: () => void }) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setErros({})
    if (nova !== confirma) {
      setErros({ confirma: 'As duas senhas não são iguais.' })
      return
    }
    setEnviando(true)
    try {
      await api('POST', '/auth/senha', { senha_atual: atual, nova_senha: nova })
      setOk(true)
      setAtual(''); setNova(''); setConfirma('')
      aoConcluir()
    } catch (err) {
      setErro(mensagemDe(err))
      setErros(camposDe(err))
    } finally {
      setEnviando(false)
    }
  }

  const form = (
    <form onSubmit={enviar} noValidate>
      {erro && <Aviso>{erro}</Aviso>}
      {ok && !obrigatoria && <Aviso tipo="ok">Senha alterada.</Aviso>}
      <Campo rotulo="Senha atual" nome="senha_atual" tipo="password" valor={atual} aoMudar={setAtual} erro={erros.senha_atual} autoComplete="current-password" obrigatorio />
      <Campo rotulo="Nova senha" nome="nova_senha" tipo="password" valor={nova} aoMudar={setNova} erro={erros.nova_senha}
        dica="Pelo menos 8 caracteres, com letras e números." autoComplete="new-password" obrigatorio />
      <Campo rotulo="Repita a nova senha" nome="confirma" tipo="password" valor={confirma} aoMudar={setConfirma} erro={erros.confirma} autoComplete="new-password" obrigatorio />
      <button className="botao botao-cheio" disabled={enviando || !atual || !nova || !confirma}>
        {enviando ? 'Salvando…' : 'Salvar nova senha'}
      </button>
    </form>
  )

  if (!obrigatoria) return form
  return (
    <main className="tela-entrada">
      <div className="cartao-entrada">
        <h1>Crie sua senha</h1>
        <p className="subtitulo">No primeiro acesso, troque a senha provisória por uma só sua.</p>
        {form}
      </div>
    </main>
  )
}
