'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PilarKey } from '@/lib/types'

// Colunas exatas por pilar (baseado nas planilhas reais do Mercado Pago)
const PILAR_CONFIG: Record<PilarKey, {
  label: string
  color: string
  scoreCol: string
  valorCol: string
  reverterCol: string | null
}> = {
  tpv:           { label: 'TPV',                   color: '#60a5fa', scoreCol: 'SCORE tpv',                      valorCol: '% Objetivo Maio',                    reverterCol: '% Total a Realizar' },
  net_churn:     { label: 'Net Churn',             color: '#c084fc', scoreCol: 'SCORE net churn',                valorCol: '%Net churn',                         reverterCol: 'Total a Reverter' },
  acionaveis:    { label: 'Acionáveis Comerciais', color: '#fb923c', scoreCol: 'SCORE acionáveis comerciais',    valorCol: 'Total Acionáveis %Tarefa-Revertido',  reverterCol: 'Total a Reverter' },
  aderencia:     { label: 'Aderência a Agenda',    color: '#2dd4bf', scoreCol: 'SCORE aderência à agenda',       valorCol: '%Aderência à agenda',                reverterCol: 'Total a Reverter' },
  awareness:     { label: 'Awareness',             color: '#f472b6', scoreCol: 'SCORE pesquisa',                 valorCol: '%Awareness',                         reverterCol: 'Total a Reverter' },
  produtividade: { label: 'Produtividade',         color: '#818cf8', scoreCol: 'SCORE prod',                     valorCol: 'Prod média por dia útil',            reverterCol: 'Total Média a Realizar' },
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function findColExact(headers: string[], target: string): string | null {
  // Tenta match exato primeiro, depois normalizado
  const exact = headers.find(h => h === target)
  if (exact) return exact
  const normalized = headers.find(h => norm(h) === norm(target))
  return normalized ?? null
}

interface ParsedRow {
  id_carteira: string
  consultor_nome: string
  valor_metrica: number
  score_planilha: number
  total_a_reverter: number | null
}

// Parser para arquivo individual de pilar
async function parsePilarFile(file: File, pilarKey: PilarKey): Promise<ParsedRow[]> {
  const { read, utils } = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = utils.sheet_to_json(ws, { defval: '' })

  if (rows.length === 0) throw new Error('Planilha vazia.')

  const headers = Object.keys(rows[0])
  const cfg = PILAR_CONFIG[pilarKey]

  const colCarteira = findColExact(headers, 'ID Carteira')
  const colNome     = findColExact(headers, 'Executivo')
  const colScore    = findColExact(headers, cfg.scoreCol)
  const colValor    = findColExact(headers, cfg.valorCol)
  const colReverter = cfg.reverterCol ? findColExact(headers, cfg.reverterCol) : null

  if (!colCarteira) throw new Error(`Coluna "ID Carteira" não encontrada.\nColunas encontradas: ${headers.join(', ')}`)
  if (!colNome)     throw new Error(`Coluna "Executivo" não encontrada.`)
  if (!colScore)    throw new Error(`Coluna "${cfg.scoreCol}" não encontrada.\nColunas encontradas: ${headers.join(', ')}`)

  return rows
    .filter(r => r[colCarteira] !== '' && r[colCarteira] != null)
    .map(r => ({
      id_carteira:      String(r[colCarteira]).trim(),
      consultor_nome:   String(r[colNome!]).trim(),
      valor_metrica:    colValor ? Number(r[colValor]) || 0 : 0,
      score_planilha:   Number(r[colScore]) || 0,
      total_a_reverter: colReverter ? (Number(r[colReverter]) || null) : null,
    }))
    .filter(r => r.id_carteira && r.consultor_nome)
}

// Parser para Score.xlsx consolidado — retorna dados para cada pilar
interface ConsolidadoRow {
  pilar_key: PilarKey
  id_carteira: string
  consultor_nome: string
  score_planilha: number
}

async function parseScoreConsolidado(file: File): Promise<ConsolidadoRow[]> {
  const { read, utils } = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = utils.sheet_to_json(ws, { defval: '' })

  if (rows.length === 0) throw new Error('Planilha vazia.')

  const result: ConsolidadoRow[] = []
  const SCORE_MAP: [string, PilarKey][] = [
    ['SCORE tpv', 'tpv'],
    ['SCORE net churn', 'net_churn'],
    ['SCORE acionáveis comerciais', 'acionaveis'],
    ['SCORE aderência à agenda', 'aderencia'],
    ['SCORE pesquisa', 'awareness'],
    ['SCORE prod', 'produtividade'],
  ]

  for (const row of rows) {
    const idCarteira = String(row['ID Carteira'] ?? '').trim()
    const nome       = String(row['Executivo'] ?? '').trim()
    if (!idCarteira || !nome) continue

    for (const [col, pilarKey] of SCORE_MAP) {
      if (row[col] !== undefined && row[col] !== '') {
        result.push({
          pilar_key: pilarKey,
          id_carteira: idCarteira,
          consultor_nome: nome,
          score_planilha: Number(row[col]) || 0,
        })
      }
    }
  }

  if (result.length === 0) throw new Error('Nenhum dado reconhecido. Verifique se é o arquivo Score.xlsx correto.')
  return result
}

interface UploadState {
  status: 'idle' | 'parsing' | 'saving' | 'ok' | 'error'
  message?: string
  count?: number
}

function formatDateBR(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const PILARES = Object.entries(PILAR_CONFIG) as [PilarKey, typeof PILAR_CONFIG[PilarKey]][]

export default function UploadClient({ uploadedBy }: { uploadedBy: string }) {
  const [date, setDate] = useState(today)
  const [states, setStates] = useState<Record<string, UploadState>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function setStateFor(key: string, s: UploadState) {
    setStates(prev => ({ ...prev, [key]: s }))
  }

  function getState(key: string): UploadState {
    return states[key] ?? { status: 'idle' }
  }

  async function handlePilarFile(pilarKey: PilarKey, file: File) {
    setStateFor(pilarKey, { status: 'parsing' })
    let rows: ParsedRow[]
    try {
      rows = await parsePilarFile(file, pilarKey)
    } catch (e) {
      setStateFor(pilarKey, { status: 'error', message: (e as Error).message })
      return
    }

    setStateFor(pilarKey, { status: 'saving' })
    const supabase = createClient()

    const { data: upload, error: uploadErr } = await supabase
      .from('score_uploads')
      .insert({ uploaded_by: uploadedBy, pilar_key: pilarKey, filename: file.name, data_referencia: date, record_count: rows.length })
      .select('id').single()

    if (uploadErr || !upload) {
      setStateFor(pilarKey, { status: 'error', message: 'Erro ao salvar: ' + uploadErr?.message })
      return
    }

    const { error: recErr } = await supabase.from('score_consultor_resultados').insert(
      rows.map(r => ({ upload_id: upload.id, id_carteira: r.id_carteira, consultor_nome: r.consultor_nome, pilar_key: pilarKey, valor_metrica: r.valor_metrica, score_planilha: r.score_planilha, total_a_reverter: r.total_a_reverter, data_referencia: date }))
    )
    if (recErr) { setStateFor(pilarKey, { status: 'error', message: 'Erro ao salvar resultados: ' + recErr.message }); return }

    setStateFor(pilarKey, { status: 'ok', count: rows.length })
    if (inputRefs.current[pilarKey]) inputRefs.current[pilarKey]!.value = ''
  }

  async function handleScoreConsolidado(file: File) {
    setStateFor('consolidado', { status: 'parsing' })
    let rows: ConsolidadoRow[]
    try {
      rows = await parseScoreConsolidado(file)
    } catch (e) {
      setStateFor('consolidado', { status: 'error', message: (e as Error).message })
      return
    }

    setStateFor('consolidado', { status: 'saving' })
    const supabase = createClient()

    // Agrupa por pilar e faz um upload por pilar
    const porPilar = new Map<PilarKey, ConsolidadoRow[]>()
    for (const r of rows) {
      if (!porPilar.has(r.pilar_key)) porPilar.set(r.pilar_key, [])
      porPilar.get(r.pilar_key)!.push(r)
    }

    let totalRecords = 0
    for (const [pilarKey, pilarRows] of porPilar) {
      const { data: upload, error: uploadErr } = await supabase
        .from('score_uploads')
        .insert({ uploaded_by: uploadedBy, pilar_key: pilarKey, filename: file.name, data_referencia: date, record_count: pilarRows.length })
        .select('id').single()
      if (uploadErr || !upload) { setStateFor('consolidado', { status: 'error', message: 'Erro: ' + uploadErr?.message }); return }

      const { error: recErr } = await supabase.from('score_consultor_resultados').insert(
        pilarRows.map(r => ({ upload_id: upload.id, id_carteira: r.id_carteira, consultor_nome: r.consultor_nome, pilar_key: pilarKey, valor_metrica: r.score_planilha, score_planilha: r.score_planilha, data_referencia: date }))
      )
      if (recErr) { setStateFor('consolidado', { status: 'error', message: 'Erro resultados: ' + recErr.message }); return }
      totalRecords += pilarRows.length
    }

    setStateFor('consolidado', { status: 'ok', count: totalRecords })
    if (inputRefs.current['consolidado']) inputRefs.current['consolidado']!.value = ''
  }

  const consolidadoState = getState('consolidado')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Upar Planilha</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Envie a planilha sempre que receber do Mercado Pago. O histórico completo é preservado.</p>
      </div>

      {/* Data */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-6 flex items-center gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-[#111827]">Data de referência</p>
          <p className="text-xs text-[#6B7280] mt-0.5">Preenchida automaticamente com hoje</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm font-medium text-[#10B981]">{formatDateBR(date)}</span>
          <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)}
            className="border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
        </div>
      </div>

      {/* Score Consolidado */}
      <div className="bg-white rounded-2xl border-2 border-[#10B981]/30 p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">Score Consolidado <span className="ml-1 text-xs font-medium text-[#10B981] bg-[#F0FDF4] px-2 py-0.5 rounded-full">Recomendado</span></p>
            <p className="text-xs text-[#6B7280]">Arquivo Score.xlsx — carrega todos os 6 pilares de uma vez</p>
          </div>
        </div>

        {consolidadoState.status === 'ok' && (
          <div className="text-xs text-[#10B981] bg-[#F0FDF4] rounded-lg px-3 py-2 mb-3 flex items-center gap-1.5">
            ✓ {consolidadoState.count} registros salvos em todos os pilares — {formatDateBR(date)}
          </div>
        )}
        {consolidadoState.status === 'error' && (
          <div className="text-xs text-[#EF4444] bg-[#FEF2F2] rounded-lg px-3 py-2 mb-3 whitespace-pre-wrap">{consolidadoState.message}</div>
        )}
        {(consolidadoState.status === 'parsing' || consolidadoState.status === 'saving') && (
          <div className="text-xs text-[#6B7280] bg-[#F9FAFB] rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
            <span className="animate-spin inline-block w-3 h-3 border-2 border-[#10B981] border-t-transparent rounded-full" />
            {consolidadoState.status === 'parsing' ? 'Lendo Score.xlsx...' : 'Salvando todos os pilares...'}
          </div>
        )}

        <label className={`flex items-center justify-center gap-2 w-full text-sm font-semibold rounded-xl py-2.5 transition-colors cursor-pointer ${
          consolidadoState.status === 'parsing' || consolidadoState.status === 'saving'
            ? 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-400 border border-gray-200'
            : 'text-white bg-[#10B981] hover:bg-[#047857]'
        }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {consolidadoState.status === 'ok' ? 'Enviar nova versão do Score.xlsx' : 'Selecionar Score.xlsx'}
          <input ref={el => { inputRefs.current['consolidado'] = el }} type="file" accept=".xlsx,.xls"
            className="hidden" disabled={consolidadoState.status === 'parsing' || consolidadoState.status === 'saving'}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScoreConsolidado(f) }} />
        </label>
      </div>

      {/* Pilares individuais */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Ou envie por pilar individualmente (inclui Total a Reverter)</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PILARES.map(([key, cfg]) => {
          const state = getState(key)
          return (
            <div key={key} className="bg-white rounded-2xl border border-[#E5E7EB] p-5 hover:shadow-md transition-shadow" style={{ borderLeft: `4px solid ${cfg.color}` }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${cfg.color}20` }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                </div>
                <p className="text-sm font-semibold text-[#111827]">{cfg.label}</p>
              </div>

              {state.status === 'ok' && (
                <div className="text-xs text-[#10B981] bg-[#F0FDF4] rounded-lg px-3 py-2 mb-3">✓ {state.count} registros — {formatDateBR(date)}</div>
              )}
              {state.status === 'error' && (
                <div className="text-xs text-[#EF4444] bg-[#FEF2F2] rounded-lg px-3 py-2 mb-3 whitespace-pre-wrap">{state.message}</div>
              )}
              {(state.status === 'parsing' || state.status === 'saving') && (
                <div className="text-xs text-[#6B7280] bg-[#F9FAFB] rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-[#10B981] border-t-transparent rounded-full" />
                  {state.status === 'parsing' ? 'Lendo...' : 'Salvando...'}
                </div>
              )}

              <label className={`flex items-center justify-center gap-2 w-full text-sm font-medium rounded-xl py-2 transition-colors cursor-pointer ${
                state.status === 'parsing' || state.status === 'saving'
                  ? 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-400 border border-gray-200'
                  : 'text-[#10B981] border border-[#10B981]/30 bg-[#F0FDF4] hover:bg-[#D1FAE5]'
              }`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {state.status === 'ok' ? 'Nova versão' : 'Selecionar arquivo'}
                <input ref={el => { inputRefs.current[key] = el }} type="file" accept=".xlsx,.xls,.csv"
                  className="hidden" disabled={state.status === 'parsing' || state.status === 'saving'}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePilarFile(key, f) }} />
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
