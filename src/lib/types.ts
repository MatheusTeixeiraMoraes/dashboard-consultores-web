export type UserRole = 'admin' | 'dono' | 'lider' | 'consultor'

export type PilarKey =
  | 'awareness'
  | 'produtividade'
  | 'aderencia'
  | 'net_churn'
  | 'tpv'
  | 'acionaveis'

export type Categoria = 'atuacao' | 'resultado'

export interface Profile {
  id: string
  nome: string
  email: string
  role: UserRole
  id_carteira: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface PillarConfig {
  id: string
  pilar_key: PilarKey
  label: string
  categoria: Categoria
  meta: number
  pontos_max: number
  unidade: '%' | 'numero'
  tipo_comp: 'ge' | 'le'
  updated_at: string
  updated_by: string | null
}

export interface ScoreUpload {
  id: string
  uploaded_by: string
  pilar_key: PilarKey
  filename: string
  mes_referencia: string | null
  data_referencia: string | null
  record_count: number
  uploaded_at: string
}

export interface ScoreResultado {
  id: string
  upload_id: string
  id_carteira: string
  consultor_nome: string
  pilar_key: PilarKey
  valor_metrica: number
  score_planilha: number
  mes_referencia: string | null
  data_referencia: string | null
}

// Score consolidado de um consultor (todos os pilares somados)
export interface ConsultorScore {
  id_carteira: string
  consultor_nome: string
  score_total: number
  pilares: Partial<Record<PilarKey, {
    valor_metrica: number
    score_planilha: number
    sem_dados: boolean
  }>>
}

// Cliente da carteira (módulo Smart Routes / Radar).
// Vínculo com o consultor é por nome (consultor_nome), não por id_carteira.
export interface Cliente {
  id: string
  consultor_nome: string
  seller_id: string
  seller_nome: string
  seller_telefone: string | null
  seller_email: string | null
  doc_tipo: 'CPF' | 'CNPJ' | null
  cpf_cnpj: string | null
  cidade: string
  bairro: string
  endereco_completo: string
  lat: number | null
  lng: number | null
  status_atualizacao: 'Cliente não atualizado' | 'Cliente Atualizado'
  // Existem na tabela, mas a tela não busca: são ~130 bytes por linha × 3,2 mil
  // clientes de payload que ninguém lê. Opcionais para não prometer o que não
  // vem. Se for usar alguma, inclua no select de `clientes/page.tsx`.
  created_at?: string
  updated_at?: string
  created_by?: string | null
}

// Status visual baseado na nota
export type ScoreStatus = 'acima' | 'na_linha' | 'critico'

export function scoreStatus(score: number): ScoreStatus {
  if (score >= 4.5) return 'acima'
  if (score >= 3.0) return 'na_linha'
  return 'critico'
}

export const SCORE_META_MINIMA = 4.5
export const SCORE_MAX = 10.0

// Hierarquia de roles (índice maior = mais permissão)
export const ROLE_LEVEL: Record<UserRole, number> = {
  consultor: 0,
  lider: 1,
  dono: 2,
  admin: 3,
}

export function hasRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[minRole]
}

export function canUpload(role: UserRole): boolean {
  return role === 'admin' || role === 'dono'
}

export function canEditMetas(role: UserRole): boolean {
  return role === 'admin' || role === 'dono'
}

export function canManageUsers(role: UserRole, targetRole?: UserRole): boolean {
  if (role === 'admin') return true
  if (role === 'dono') return targetRole === 'lider' || targetRole === 'consultor'
  return false
}
