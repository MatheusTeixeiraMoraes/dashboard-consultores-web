/**
 * Plano de consulta — a query do Supabase descrita como dado, não como chamada.
 *
 * O app inteiro fala com o Supabase pelo mesmo encadeamento
 * (`.from(t).select(cols).eq(...).order(...)`), tanto em Server Component
 * quanto em componente de navegador. No modo demo esse encadeamento não pode
 * virar HTTP para o Postgres — mas também não pode ser executado em dois
 * lugares diferentes, senão o navegador leria de uma cópia dos dados e o
 * servidor de outra, e qualquer edição feita na gravação sumiria ao trocar de
 * tela.
 *
 * A saída é: o encadeamento constrói este objeto (serializável), e QUEM executa
 * é sempre o servidor — direto, quando a chamada já nasceu lá; via Server
 * Action, quando veio do navegador. Uma fonte da verdade só.
 *
 * O vocabulário abaixo é fechado de propósito: cobre exatamente os operadores
 * que o app usa hoje. Operador novo estoura em `motor.ts` com mensagem clara,
 * em vez de devolver lista vazia e virar tela em branco sem erro.
 */

export type Filtro =
  | { tipo: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; coluna: string; valor: unknown }
  | { tipo: 'in'; coluna: string; valores: unknown[] }
  | { tipo: 'is'; coluna: string; valor: null | boolean }
  | { tipo: 'not'; coluna: string; operador: string; valor: unknown }

export interface Ordenacao {
  coluna: string
  ascendente: boolean
  /** Ausente = padrão do Postgres (ASC → nulos por último, DESC → primeiro). */
  nulosPrimeiro?: boolean
}

export type Operacao = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

export interface PlanoConsulta {
  tabela: string
  operacao: Operacao
  /** String crua do `.select()`. Ausente numa mutação = não devolve linhas. */
  colunas?: string
  contarExato?: boolean
  /** `head: true` → só o total, sem corpo (o `buscarTudo` conta assim). */
  semCorpo?: boolean
  filtros: Filtro[]
  ordenacoes: Ordenacao[]
  limite?: number
  faixa?: { de: number; ate: number }
  singular?: 'single' | 'maybeSingle'
  /** Payload de insert/update/upsert. */
  valores?: unknown
  aoConflitar?: string
  ignorarDuplicados?: boolean
}

export interface RespostaDemo<T = Record<string, unknown>> {
  data: T[] | T | null
  error: { message: string; code?: string; details?: string; hint?: string } | null
  count: number | null
  status: number
  statusText: string
}

export function planoVazio(tabela: string, operacao: Operacao): PlanoConsulta {
  return { tabela, operacao, filtros: [], ordenacoes: [] }
}
