export type AreaKey = 'tpv' | 'netChurn' | 'acionaveis' | 'agenda' | 'awareness' | 'produtividade'

export interface AreaConfig {
  key: AreaKey
  label: string
  abbr: string
  color: string
  group: 'resultado' | 'atuacao'
  scoreMax: number
  sheetHint: string
  fields: FieldConfig[]
}

export interface FieldConfig {
  key: string
  label: string
  format: 'percentPoints' | 'percentRatio' | 'number'
  negate?: boolean
}

export interface ConsultantRecord {
  idCarteira: string
  executivo: string
  mes: string
  score: number
  [key: string]: string | number | undefined
}

export interface Upload {
  id: string
  area_key: AreaKey
  uploaded_at: string
  filename: string
  record_count: number
}

export interface UploadRecord {
  id: string
  upload_id: string
  id_carteira: string
  executivo: string
  mes: string
  score: number
  fields: Record<string, number>
}

export interface ConsultantSummary {
  executivo: string
  scoreGeral: number
  scoreAtuacao: number
  scoreResultado: number
  areas: Partial<Record<AreaKey, { score: number; fields: Record<string, number> }>>
}
