import type { AreaConfig } from './types'

export const AREAS: AreaConfig[] = [
  {
    key: 'tpv',
    label: 'TPV',
    abbr: 'TPV',
    color: '#60a5fa',
    group: 'resultado',
    scoreMax: 3,
    sheetHint: 'tpv',
    fields: [
      { key: 'pctObjetivo', label: '% Objetivo', format: 'percentRatio' },
      { key: 'tpvRealizado', label: 'TPV Realizado', format: 'number' },
    ],
  },
  {
    key: 'netChurn',
    label: 'Net Churn',
    abbr: 'NC',
    color: '#c084fc',
    group: 'resultado',
    scoreMax: 2,
    sheetHint: 'churn',
    fields: [
      { key: 'pctObjetivo', label: '% Objetivo', format: 'percentRatio', negate: true },
      { key: 'churned', label: 'Churned', format: 'number' },
    ],
  },
  {
    key: 'acionaveis',
    label: 'Acionáveis Comerciais',
    abbr: 'AC',
    color: '#fb923c',
    group: 'resultado',
    scoreMax: 2,
    sheetHint: 'acion',
    fields: [
      { key: 'pctObjetivo', label: '% Objetivo', format: 'percentRatio' },
      { key: 'realizados', label: 'Realizados', format: 'number' },
    ],
  },
  {
    key: 'agenda',
    label: 'Aderência a Agenda',
    abbr: 'Agenda',
    color: '#2dd4bf',
    group: 'atuacao',
    scoreMax: 1,
    sheetHint: 'agenda',
    fields: [
      { key: 'pctAderencia', label: '% Aderência', format: 'percentRatio' },
    ],
  },
  {
    key: 'awareness',
    label: 'Awareness',
    abbr: 'Aware',
    color: '#f472b6',
    group: 'atuacao',
    scoreMax: 1,
    sheetHint: 'aware',
    fields: [
      { key: 'pctObtido', label: '% Obtido', format: 'percentRatio' },
    ],
  },
  {
    key: 'produtividade',
    label: 'Produtividade',
    abbr: 'Prod',
    color: '#818cf8',
    group: 'atuacao',
    scoreMax: 1,
    sheetHint: 'produt',
    fields: [
      { key: 'pctObjetivo', label: '% Objetivo', format: 'percentRatio' },
    ],
  },
]

export const AREA_MAP = Object.fromEntries(AREAS.map((a) => [a.key, a])) as Record<string, AreaConfig>
