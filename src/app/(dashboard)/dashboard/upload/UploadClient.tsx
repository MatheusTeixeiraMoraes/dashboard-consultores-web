'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PilarKey } from '@/lib/types'

const PILARES: { key: PilarKey; label: string; color: string; hint: string }[] = [
  { key: 'tpv',           label: 'TPV',                   color: '#60a5fa', hint: 'Planilha de TPV — Total Payment Volume' },
  { key: 'net_churn',     label: 'Net Churn',             color: '#c084fc', hint: 'Planilha de Net Churn' },
  { key: 'acionaveis',    label: 'Acionáveis Comerciais', color: '#fb923c', hint: 'Planilha de Acionáveis Comerciais' },
  { key: 'aderencia',     label: 'Aderência a Agenda',    color: '#2dd4bf', hint: 'Planilha de Aderência a Agenda' },
  { key: 'awareness',     label: 'Awareness',             color: '#f472b6', hint: 'Planilha de Awareness (L3M)' },
  { key: 'produtividade', label: 'Produtividade',         color: '#818cf8', hint: 'Planilha de Produtividade' },
]

// Normaliza cabeçalhos para matching flexível
function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// Tenta encontrar coluna por lista de candidatos
function findCol(headers: string[], candidates: string[]): string | null {
  for (const h of headers) {
    for (const c of candidates) {
      if (norm(h).includes(norm(c))) return h
    }
  }
  return null
}

interface ParsedRow {
  id_carteira: string
  consultor_nome: string
  valor_metrica: number
  score_planilha: number
}

async function parseExcel(file: File): Promise<ParsedRow[]> {
  const { read, utils } = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = utils.sheet_to_json(ws, { defval: '' })

  if (rows.length === 0) throw new Error('Planilha vazia.')

  const headers = Object.keys(rows[0])

  const colCarteira = findCol(headers, ['id_carteira', 'id carteira', 'carteira', 'codigo', 'id'])
  const colNome     = findCol(headers, ['executivo', 'consultor', 'nome', 'name'])
  const colScore    = findCol(headers, ['score', 'nota', 'pontuacao', 'pontuação', 'pts'])
  const colValor    = findCol(headers, ['valor', 'metrica', 'métrica', 'resultado', 'percentual', '%', 'atingimento'])

  if (!colCarteira) throw new Error('Coluna de ID Carteira não encontrada. Esperado: "id_carteira", "carteira" ou similar.')
  if (!colNome)     throw new Error('Coluna de nome não encontrada. Esperado: "executivo", "consultor" ou "nome".')
  if (!colScore)    throw new Error('Coluna de score não encontrada. Esperado: "score", "nota" ou "pontuacao".')

  return rows
    .filter(r => r[colCarteira!] !== '')
    .map(r => ({
      id_carteira:    String(r[colCarteira!]).trim(),
      consultor_nome: String(r[colNome!]).trim(),
      valor_metrica:  colValor ? Number(r[colValor]) || 0 : 0,
      score_planilha: Number(r[colScore!]) || 0,
    }))
    .filter(r => r.id_carteira && r.consultor_nome)
}

interface UploadState {
  status: 'idle' | 'parsing' | 'saving' | 'ok' | 'error'
  message?: string
  count?: number
}

export default function UploadClient({ uploadedBy }: { uploadedBy: string }) {
  const [date, setDate] = useState('')
  const [states, setStates] = useState<Record<PilarKey, UploadState>>(
    () => Object.fromEntries(PILARES.map(p => [p.key, { status: 'idle' }])) as Record<PilarKey, UploadState>
  )
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function setStateFor(key: PilarKey, s: UploadState) {
    setStates(prev => ({ ...prev, [key]: s }))
  }

  async function handleFile(pilarKey: PilarKey, file: File) {
    if (!date) {
      setStateFor(pilarKey, { status: 'error', message: 'Selecione a data de referência antes de fazer upload.' })
      return
    }

    setStateFor(pilarKey, { status: 'parsing' })
    let rows: ParsedRow[]
    try {
      rows = await parseExcel(file)
    } catch (e) {
      setStateFor(pilarKey, { status: 'error', message: (e as Error).message })
      return
    }

    setStateFor(pilarKey, { status: 'saving' })
    const supabase = createClient()

    const { data: upload, error: uploadErr } = await supabase
      .from('score_uploads')
      .insert({
        uploaded_by: uploadedBy,
        pilar_key: pilarKey,
        filename: file.name,
        mes_referencia: date + '-01',
        record_count: rows.length,
      })
      .select('id')
      .single()

    if (uploadErr || !upload) {
      setStateFor(pilarKey, { status: 'error', message: 'Erro ao salvar upload: ' + uploadErr?.message })
      return
    }

    const records = rows.map(r => ({
      upload_id: upload.id,
      id_carteira: r.id_carteira,
      consultor_nome: r.consultor_nome,
      pilar_key: pilarKey,
      valor_metrica: r.valor_metrica,
      score_planilha: r.score_planilha,
      mes_referencia: date + '-01',
    }))

    const { error: recErr } = await supabase.from('score_consultor_resultados').insert(records)
    if (recErr) {
      setStateFor(pilarKey, { status: 'error', message: 'Erro ao salvar resultados: ' + recErr.message })
      return
    }

    setStateFor(pilarKey, { status: 'ok', count: rows.length })
    if (inputRefs.current[pilarKey]) inputRefs.current[pilarKey]!.value = ''
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Upar Planilha</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Envie a planilha de cada pilar separadamente. O histórico completo é preservado.
        </p>
      </div>

      {/* Seletor de mês */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-6 flex items-center gap-4">
        <div>
          <p className="text-sm font-semibold text-[#111827] mb-1">Mês de referência</p>
          <p className="text-xs text-[#6B7280]">Selecione o mês ao qual as planilhas se referem</p>
        </div>
        <input
          type="month"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="ml-auto border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
        />
      </div>

      {/* Cards dos pilares */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PILARES.map(({ key, label, color, hint }) => {
          const state = states[key]
          return (
            <div key={key} className="bg-white rounded-2xl border border-[#E5E7EB] p-5 hover:shadow-md transition-shadow"
              style={{ borderLeft: `4px solid ${color}` }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#111827]">{label}</p>
                  <p className="text-[11px] text-[#6B7280]">{hint}</p>
                </div>
              </div>

              {/* Status */}
              {state.status === 'ok' && (
                <div className="text-xs text-[#10B981] bg-[#F0FDF4] rounded-lg px-3 py-2 mb-3 flex items-center gap-1.5">
                  <span>✓</span> {state.count} registros salvos com sucesso
                </div>
              )}
              {state.status === 'error' && (
                <div className="text-xs text-[#EF4444] bg-[#FEF2F2] rounded-lg px-3 py-2 mb-3">
                  {state.message}
                </div>
              )}
              {(state.status === 'parsing' || state.status === 'saving') && (
                <div className="text-xs text-[#6B7280] bg-[#F9FAFB] rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-[#10B981] border-t-transparent rounded-full" />
                  {state.status === 'parsing' ? 'Lendo planilha...' : 'Salvando...'}
                </div>
              )}

              <label className={`flex items-center justify-center gap-2 w-full text-sm font-medium rounded-xl py-2 transition-colors cursor-pointer ${
                state.status === 'parsing' || state.status === 'saving'
                  ? 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-400 border border-gray-200'
                  : 'text-[#10B981] border border-[#10B981]/30 bg-[#F0FDF4] hover:bg-[#D1FAE5]'
              }`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {state.status === 'ok' ? 'Enviar nova versão' : 'Selecionar arquivo'}
                <input
                  ref={el => { inputRefs.current[key] = el }}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  disabled={state.status === 'parsing' || state.status === 'saving'}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(key, f)
                  }}
                />
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
