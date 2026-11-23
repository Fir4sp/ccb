// Cliente da API. Toda decisão de permissão é do servidor; aqui só exibimos.

export type Usuario = {
  id: number
  nome: string
  email: string
  tenant: { id: number; nome: string } | null
  trocar_senha: boolean
  perfis: string[]
  permissoes: string[]
  grupos: number[]
  casas: { id: number; codigo: string; nome: string; grupo: string }[]
  funcoes_casa: { casa_id: number; funcao: string }[]
}

export type Grupo = { id: number; nome: string; ativo: boolean; casas?: number }

export type Casa = {
  id: number
  codigo: string
  nome: string
  grupo_id: number
  grupo: string
  endereco: string | null
  bairro: string | null
  cidade: string | null
  cep: string | null
  horarios_culto: string | null
  capacidade: number | null
  observacoes: string | null
  responsaveis: string | null
  ativo: boolean
  capa_url?: string | null
  dml_local?: { id: number; nome: string } | null
  ministerio?: Ministro[]
  fotos?: Foto[]
  pode_editar?: boolean
  pode_abrir_chamado?: boolean
  usuarios?: { id: number; nome: string; email: string; funcao: string; ativo: number }[]
}

export type Ministro = { id: number; cargo: string; nome: string; telefone: string | null; ordem: number }
export type Foto = { id: number; url: string; mini_url?: string | null; legenda: string | null; capa: boolean; largura?: number | null; altura?: number | null }

// ---------------------------------------------------------------- Chamados (Fase 3)

export type Categoria = { id: number; nome: string; icone: string; exige_parecer_seguranca: boolean; ativo: boolean }

export type Material = {
  id: number; descricao: string; quantidade: number; unidade: string; valor_unitario: number | null
  situacao: 'a_comprar' | 'comprado' | 'entregue' | 'cancelado'; situacao_nome: string; observacao: string | null; autor: string | null; criado_em: string
}

export type Anexo = {
  id: number; categoria: 'foto' | 'documento' | 'orcamento' | 'nota'; url: string; mini_url: string | null; imagem: boolean
  nome: string | null; legenda: string | null; autor: string | null; criado_em: string; pode_apagar?: boolean
}

export type Evento = {
  id: number; tipo: string; status_de: string | null; status_para: string | null
  texto: string | null; valor: number | null; usuario: string | null; criado_em: string
}

export type Area = { id: number; nome: string; descricao: string | null; ativo: boolean; membros: { id: number; nome: string }[] }

export type ResumoOS = { id: number; numero: number; rotulo: string; status: string; status_nome: string; progresso: number | null }

export type ItemChamado = {
  id: number; numero: number; titulo: string; descricao: string; status: string; status_nome: string
  tipo: 'servico' | 'obra'; tipo_nome: string; os: ResumoOS | null
  area: { id: number; nome: string } | null; origem: 'sistema' | 'sharepoint'
  urgente: boolean; prioridade: string | null
  casa: { id: number; nome: string; codigo: string; grupo: string }
  categoria: { id: number; nome: string; icone: string } | null
  responsavel: { id: number; nome: string } | null
  valor_estimado: number | null; nivel_aprovacao: string | null
  criado_em: string; atualizado_em: string
  foto_url?: string | null; para_mim?: boolean
}

export type Chamado = ItemChamado & {
  local: string | null
  descricao: string | null
  aberto_por: { id: number; nome: string }
  link_externo: string | null; status_externo: string | null
  servico_descricao: string | null
  valor_aprovado: number | null; valor_final: number | null
  nivel_nome: string | null; em_reaprovacao: boolean
  aprovado_por: string | null; aprovado_em: string | null
  exige_parecer: boolean
  parecer: { resultado: 'favoravel' | 'com_ressalvas' | 'desfavoravel'; texto: string | null; por: string | null; em: string | null } | null
  concluido_em: string | null; encerrado_em: string | null; motivo_cancelamento: string | null
  acoes: string[]; para_mim: boolean; pode_anexar_documento: boolean; pode_escolher_tipo: boolean; ve_valores: boolean
  anexos: Anexo[]; eventos: Evento[]
  materiais: Material[]; pode_editar_materiais: boolean
  regras: { orcamento_obrigatorio_acima: number; alcada_coordenacao_max: number; alcada_gestao_max: number; reaprovacao_aumento_min: number }
}

export type ResumoChamados = { para_mim: number; abertos: number; urgentes: number; por_status: Record<string, number>; por_tipo: { servico: number; obra: number }; por_area: Record<string, number> }

export const PRIORIDADES: Record<string, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', emergencia: 'Emergência' }

export const CARGOS_MINISTERIO = ['Ancião', 'Diácono', 'Cooperador do Ofício Ministerial', 'Cooperador de Jovens e Menores',
  'Encarregado Regional', 'Encarregado Local', 'Examinadora', 'Auxiliar da Escrita', 'Porteiro']

export class ErroApi extends Error {
  status: number
  campos: Record<string, string>
  constructor(status: number, mensagem: string, campos: Record<string, string> = {}) {
    super(mensagem)
    this.status = status
    this.campos = campos
  }
}

let csrf = ''
let aoPerderSessao: () => void = () => {}

export function quandoPerderSessao(fn: () => void) {
  aoPerderSessao = fn
}

export async function api<T = unknown>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  let resp: Response
  try {
    resp = await fetch('/api' + caminho, {
      method: metodo,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(metodo !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    })
  } catch {
    throw new ErroApi(0, 'Sem conexão com a internet. Verifique o sinal e tente de novo.')
  }
  const dados = await resp.json().catch(() => ({}))
  if (dados && typeof dados === 'object' && 'csrf' in dados) csrf = dados.csrf
  if (!resp.ok) {
    if (resp.status === 401 && caminho !== '/auth/login') aoPerderSessao()
    if (resp.status === 419) await carregarSessao()
    throw new ErroApi(resp.status, (dados.erro ?? 'Algo deu errado. Tente novamente.') + (dados.detalhe ? ' Detalhe: ' + dados.detalhe : ''), dados.campos ?? {})
  }
  return dados as T
}

export async function carregarSessao(): Promise<Usuario | null> {
  const r = await api<{ csrf: string; usuario: Usuario | null }>('GET', '/auth/sessao')
  return r.usuario
}

export const NOMES_PERFIS: Record<string, string> = {
  administrador: 'Administrador',
  casa_oracao: 'Casa de Oração',
  coordenacao_manutencao: 'Coordenação de Manutenção',
  gestao_manutencao: 'Gestão de Manutenção',
  equipe_manutencao: 'Equipe de Manutenção',
  orientadora_cns: 'Orientadora CNS',
  coordenacao_cns: 'Coordenação CNS',
  compras: 'Compras',
  seguranca_trabalho: 'Segurança do Trabalho',
  procurador: 'Procurador',
  engenharia: 'Engenharia',
}

export const NOMES_FUNCOES: Record<string, string> = {
  manutencao: 'Manutenção',
  escrita: 'Escrita',
  limpeza: 'Limpeza',
  outra: 'Outra',
}

// ---------------------------------------------------------------- Ordens de Serviço (v1.6.0)

export type Situacao = 'pendente' | 'andamento' | 'ok' | 'nao_ok' | 'nao_aplica'

export type FotoEtapa = Anexo & { pode_apagar: boolean }

export type Etapa = {
  id: number; ordem: number; nome: string; situacao: Situacao; situacao_nome: string; percentual: number
  observacao: string | null; atualizado_por: string | null; atualizado_em: string | null
  pendencia_id: number | null; fotos: FotoEtapa[]
}

export type Pendencia = {
  id: number; etapa_id: number; etapa: string; descricao: string; status: 'aberta' | 'resolvida'
  aberta_por: string; criado_em: string; resolvida_por: string | null; resolvida_em: string | null; resolucao: string | null
  os?: { id: number; numero: number; rotulo: string; tipo: 'servico' | 'obra' }
  chamado?: { id: number; numero: number; titulo: string }
  casa?: { id: number; nome: string }
}

export type ItemOS = {
  id: number; numero: number; rotulo: string; tipo: 'servico' | 'obra'; tipo_nome: string; status: string; status_nome: string
  titulo: string
  chamado: { id: number; numero: number; status: string }
  casa: { id: number; nome: string; codigo: string; grupo: string }
  categoria: { nome: string; icone: string }
  area: { id: number; nome: string } | null
  prioridade: string | null; urgente: boolean
  responsavel: { id: number; nome: string } | null
  progresso: number | null; etapas_total: number; etapas_abertas: number; pendencias_abertas: number
  pedido_pendente: boolean
  teto: number | null; gasto: number | null; saldo: number | null; percentual_gasto: number | null; acima_teto: boolean | null
  previsao_inicio: string | null; previsao_fim: string | null; iniciada_em: string | null; concluida_em: string | null
  criado_em: string; atualizado_em: string; para_mim?: boolean
}

export type Gasto = {
  id: number; data: string; categoria: string; descricao: string; fornecedor: string | null; valor: number
  lancado_por: string; criado_em: string; estornado: boolean; motivo_estorno: string | null; estornado_por: string | null
  comprovante_url: string | null
}

export type PedidoTeto = {
  id: number; valor_anterior: number | null; valor_novo: number; motivo: string; status: 'pendente' | 'aprovado' | 'recusado'
  pedido_por: string; decidido_por: string | null; decidido_em: string | null; resposta: string | null; criado_em: string
}

export type OrdemServico = ItemOS & {
  chamado: ItemOS['chamado'] & {
    status_nome: string; descricao: string; local: string | null; servico: string | null; em_reaprovacao: boolean
    valor_aprovado: number | null; valor_estimado: number | null
  }
  relatorio_final: string | null
  acoes: string[]; para_mim: boolean; ve_valores: boolean
  pode_editar_etapas: boolean; pode_marcar_etapas: boolean; pode_resolver_pendencias: boolean; pode_enviar_fotos: boolean
  etapas: Etapa[]; contagem: Record<Situacao, number>; pendencias: Pendencia[]
  evolucao: { data: string; percentual: number }[]
  situacoes: Record<Situacao, string>
  gastos?: Gasto[]; por_categoria?: Record<string, number>; categorias_gasto?: Record<string, string>; alerta?: number
  pode_estornar?: boolean; tetos?: PedidoTeto[]; pedido_pendente_detalhe?: PedidoTeto | null
}

export type ModeloEtapas = { id: number; nome: string; ativo: boolean; etapas: string[] }

export type ResumoOrdens = {
  para_mim: number; ativas: number; em_andamento: number; pendencias: number
  obras_alerta: number; obras_acima_teto: number; tetos_aguardando: number
}

// ---------------------------------------------------------------- CNS Limpeza (Fase 5)

export type Ciclo = {
  id: number; nome: string; prazo: string; status: 'aberto' | 'fechado' | 'comprado' | 'distribuido'; status_nome: string
  prazo_passou: boolean; observacao: string | null; automatico: boolean; fechado_em: string | null; liberado_compras_em: string | null
  comprado_em: string | null; distribuido_em: string | null
  valor_compra: number | null; estoque_recebido_em: string | null; pedidos?: Record<string, number>
}

export type JanelaAgenda = { abre: string; prazo: string; referencia: string; nome: string }
export type AgendaLimpeza = { ativa: boolean; dia_abertura: number; dia_prazo: number; proxima: JanelaAgenda | null }

export type Produto = {
  id: number; codigo: string | null; nome: string; familia: string | null; variacao: string | null
  embalagem: string | null; unidade: string; categoria: string; fornecedor: string | null
  foto_url: string | null; mini_url: string | null; preco_ref: number | null; max_por_pedido: number | null; ativo: boolean
  minimo_central: number | null; no_central: number | null
}

export type ItemPedido = {
  produto_id: number; nome: string; embalagem: string | null; unidade: string; categoria: string; mini_url: string | null
  quantidade: number; quantidade_aprovada: number | null; preco: number | null; subtotal: number | null
  na_casa: number | null; contado_em: string | null
}

export type PedidoLimpeza = {
  id: number; status: string; status_nome: string
  casa: { id: number; nome: string; codigo: string; grupo: string }
  ciclo: Ciclo; observacao: string | null; motivo: string | null; itens: ItemPedido[]; total: number; sem_preco: number
  enviado_por: string | null; enviado_em: string | null; conferido_por: string | null; conferido_em: string | null
  analisado_por: string | null; analisado_em: string | null
  recebido_por: string | null; recebido_em: string | null; recebimento_obs: string | null
  acoes: string[]; etapa_analise: 'primeira' | 'final' | null; tem_orientadora: boolean; para_mim: boolean; estoque_casa_id: number | null; pode_excluir?: boolean
  eventos: { id: number; tipo: string; texto: string | null; usuario: string | null; criado_em: string }[]
}

export type Loja = {
  casa: { id: number; nome: string; codigo: string; grupo: string }
  categorias: Record<string, string>
  ciclo: Ciclo | null; pedido: PedidoLimpeza | null; produtos: Produto[]; acoes: string[]
}

export type ResumoLimpeza = {
  ciclo: Ciclo | null; para_mim: number; conferir: number; tarefa_ciclo: 'fechar' | 'consolidar' | 'comprar' | 'receber' | 'distribuir' | null
  pode_gerir?: boolean; agenda?: AgendaLimpeza | null
  casas: { casa_id: number; casa_nome: string; status: string | null; status_nome: string; para_mim: boolean }[]
}

// ---------------------------------------------------------------- Estoques (Fase 6)

export type ResumoLocal = {
  id: number; tipo: 'central' | 'local'; nome: string; casa: { id: number; nome: string; grupo: string } | null
  produtos: number; unidades: number; ultima_contagem: string | null; pode_contar: boolean
}

export type LocalEstoque = {
  local: ResumoLocal; acoes: string[]
  saldos: { produto_id: number; nome: string; embalagem: string | null; unidade: string; categoria: string; mini_url: string | null; ativo: boolean; quantidade: number; contado_em: string | null; minimo: number | null }[]
  movimentos: { id: number; produto: string; tipo: string; origem: string; origem_nome: string; quantidade: number; saldo_apos: number; motivo: string | null; outro_local: string | null; usuario: string; criado_em: string }[]
  inventarios: { id: number; usuario: string; diferencas: number; observacao: string | null; criado_em: string }[]
}
