import type { PilarKey } from './types'

/**
 * Contrato único das planilhas do Mercado Pago.
 *
 * Os nomes de coluna aqui são EXATAMENTE os cabeçalhos dos .xlsx. Toda leitura
 * (upload) e toda exibição (telas) passam por aqui — se o MP mudar o layout da
 * planilha, este arquivo é o único lugar a mexer.
 *
 * O dashboard espelha a planilha: o score de cada pilar vem pronto na coluna de
 * SCORE e nunca é recalculado. A curva de pontuação do MP não é linear (um
 * consultor com -2,28% de net churn tira 3/3 e outro com -4,15% tira 0), então
 * qualquer tentativa de derivar o score daria número errado.
 */

export type ColType = 'currency' | 'percent' | 'int' | 'decimal'

export interface ColSpec {
  /** Cabeçalho exato na planilha. */
  col: string
  /** Como aparece na tela. */
  label: string
  type: ColType
}

export interface PilarSpec {
  key: PilarKey
  label: string
  color: string
  grupo: 'atuacao' | 'resultado'
  /** Coluna com o score já pontuado pelo MP. */
  scoreCol: string
  /** Coluna da métrica principal — a que é confrontada com a meta. */
  valorCol: string
  /** Todas as colunas de métrica da planilha, na ordem de exibição. */
  cols: ColSpec[]
  /** Valor maior é melhor. Falso só se algum pilar inverter (hoje nenhum). */
  maiorMelhor: boolean
  /** Nota curta exibida no card, quando o pilar precisa de contexto. */
  nota?: string
}

export const PILARES: Record<PilarKey, PilarSpec> = {
  awareness: {
    key: 'awareness',
    label: 'Awareness',
    color: '#f472b6',
    grupo: 'atuacao',
    scoreCol: 'SCORE pesquisa',
    valorCol: '%Awareness',
    maiorMelhor: true,
    cols: [
      { col: 'Sellers visitados',                 label: 'Sellers visitados',                 type: 'int' },
      { col: 'Sellers que responderam pesquisa',  label: 'Sellers que responderam pesquisa',  type: 'int' },
      { col: '%Awareness',                        label: '% Awareness',                       type: 'percent' },
    ],
  },

  produtividade: {
    key: 'produtividade',
    label: 'Produtividade',
    color: '#818cf8',
    grupo: 'atuacao',
    scoreCol: 'SCORE prod',
    valorCol: 'Prod média por dia útil',
    maiorMelhor: true,
    cols: [
      { col: 'Visitas',                        label: 'Visitas',                        type: 'int' },
      { col: 'Visitas efetivas',               label: 'Visitas efetivas',               type: 'int' },
      { col: 'Sellers visitados',              label: 'Sellers visitados',              type: 'int' },
      { col: 'Visitas por dia útil',           label: 'Visitas por dia útil',           type: 'decimal' },
      { col: 'Visitas efetivas por dia útil',  label: 'Visitas efetivas por dia útil',  type: 'decimal' },
      { col: 'Prod média por dia útil',        label: 'Prod média por dia útil',        type: 'decimal' },
    ],
  },

  aderencia: {
    key: 'aderencia',
    label: 'Aderência a Agenda',
    color: '#2dd4bf',
    grupo: 'atuacao',
    scoreCol: 'SCORE aderência à agenda',
    valorCol: '%Aderência à agenda',
    maiorMelhor: true,
    cols: [
      { col: 'Sellers agendados',           label: 'Sellers agendados',           type: 'int' },
      { col: 'Sellers aderentes à agenda',  label: 'Sellers aderentes à agenda',  type: 'int' },
      { col: 'Sellers visitados',           label: 'Sellers visitados',           type: 'int' },
      { col: '%Aderência à agenda',         label: '% Aderência à agenda',        type: 'percent' },
    ],
  },

  tpv: {
    key: 'tpv',
    label: 'TPV',
    color: '#60a5fa',
    grupo: 'resultado',
    scoreCol: 'SCORE tpv',
    valorCol: 'Variação de TPV versus mês passado',
    maiorMelhor: true,
    // 95,1% = fez 95,1% do TPV do mês passado. A meta (106%) é sobre essa mesma base.
    nota: 'mês passado = 100%',
    cols: [
      { col: 'TPV Total mês atual',                 label: 'TPV total mês atual',      type: 'currency' },
      { col: 'TPV Total mês passado',               label: 'TPV total mês passado',    type: 'currency' },
      { col: 'TPV médio mês atual',                 label: 'TPV médio mês atual',      type: 'currency' },
      { col: 'TPV médio mês passado',               label: 'TPV médio mês passado',    type: 'currency' },
      { col: 'Variação de TPV versus mês passado',  label: 'Variação vs mês passado',  type: 'percent' },
    ],
  },

  net_churn: {
    key: 'net_churn',
    label: 'Net Churn',
    color: '#c084fc',
    grupo: 'resultado',
    scoreCol: 'SCORE net churn',
    valorCol: '%Net churn',
    // Negativo = perdeu sellers (Marceli: -15,04% → score 0).
    // Positivo = cresceu. Logo, maior é melhor — o inverso do que o card dizia antes.
    maiorMelhor: true,
    nota: 'negativo = perdeu sellers',
    cols: [
      { col: 'Sellers ativos mês atual',    label: 'Sellers ativos mês atual',    type: 'int' },
      { col: 'Sellers ativos mês passado',  label: 'Sellers ativos mês passado',  type: 'int' },
      { col: 'Sellers em churn',            label: 'Sellers em churn',            type: 'int' },
      { col: 'Sellers Reativados',          label: 'Sellers reativados',          type: 'int' },
      { col: '%Net churn',                  label: '% Net churn',                 type: 'percent' },
    ],
  },

  acionaveis: {
    key: 'acionaveis',
    label: 'Acionáveis Comerciais',
    color: '#fb923c',
    grupo: 'resultado',
    scoreCol: 'SCORE acionáveis comerciais',
    valorCol: 'Total Acionáveis %Tarefa-Revertido',
    maiorMelhor: true,
    cols: [
      { col: 'Total Acionáveis Tarefas',              label: 'Total de tarefas',        type: 'int' },
      { col: 'Total Acionáveis Revertido',            label: 'Total revertido',         type: 'int' },
      { col: 'Total Acionáveis %Tarefa-Revertido',    label: '% Tarefa revertida',      type: 'percent' },
    ],
  },
}

export const GRUPOS = [
  { key: 'atuacao',   label: 'Atuação',   pilares: ['awareness', 'produtividade', 'aderencia'] },
  { key: 'resultado', label: 'Resultado', pilares: ['tpv', 'net_churn', 'acionaveis'] },
] as const

export const PILAR_KEYS = Object.keys(PILARES) as PilarKey[]

/** Colunas de identificação, iguais em toda planilha. */
export const COL_CARTEIRA = 'ID Carteira'
export const COL_NOME = 'Executivo'

export function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/**
 * Acha o cabeçalho real correspondente a `target`, tolerando acento, caixa e
 * espaço. Sem match por prefixo: um palpite errado aqui vira número errado na
 * tela — melhor a coluna faltar e o erro aparecer no upload.
 */
export function findCol(headers: string[], target: string): string | null {
  return headers.find(h => h === target)
    ?? headers.find(h => norm(h) === norm(target))
    ?? null
}

/**
 * Converte uma coluna de percentual para a escala 0–100.
 *
 * As planilhas do MP mandam percentuais como decimal (0,4615 = 46,15%), mas as
 * células vêm sem formato de porcentagem no Excel — não dá pra perguntar ao
 * arquivo. A decisão é tomada olhando a COLUNA INTEIRA, nunca a célula isolada:
 * se todos os valores cabem em [-1, 1], a coluna está em decimal e vira ×100.
 * Se algum estoura, já veio em 0–100 e passa direto.
 *
 * Decidir por célula quebraria: um consultor com 0,35% de net churn viraria 35%.
 */
export function escalaPercentual(valores: number[]): 1 | 100 {
  const validos = valores.filter(v => Number.isFinite(v) && v !== 0)
  if (validos.length === 0) return 1
  const max = Math.max(...validos.map(Math.abs))
  return max <= 1 ? 100 : 1
}

// ---------------------------------------------------------------------------
// Formatação
//
// Percentuais já chegam aqui na escala 0–100: a conversão acontece uma única
// vez, no upload (escalaPercentual). Daqui pra frente é só formatar.
// ---------------------------------------------------------------------------

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
})

export function fmtValor(type: ColType, val: unknown): string {
  if (val === '' || val == null) return '—'
  const n = Number(val)
  if (!Number.isFinite(n)) return String(val)

  switch (type) {
    case 'currency': return BRL.format(n)
    case 'percent':  return `${n.toFixed(2).replace('.', ',')}%`
    case 'int':      return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
    case 'decimal':  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
}

export function fmtMeta(meta: number, unidade: string): string {
  const s = (Math.abs(meta) % 1 === 0 ? meta.toFixed(0) : meta.toFixed(1)).replace('.', ',')
  return unidade === '%' ? `${s}%` : s
}

/**
 * Quanto falta pra bater a meta, em pontos percentuais (ou unidades).
 * Negativo = já passou da meta.
 *
 * Ex.: TPV meta 106%, atual 95,1% → faltam 10,9 pontos percentuais.
 */
export function calcFaltam(valor: number, meta: number, tipoComp: string): number {
  return tipoComp === 'le' ? valor - meta : meta - valor
}
