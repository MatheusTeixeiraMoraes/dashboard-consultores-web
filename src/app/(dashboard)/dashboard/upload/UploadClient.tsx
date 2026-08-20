'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import ImportPlanilhaGeral from './ImportPlanilhaGeral'
import { registrarEvento } from '@/lib/atividade'
import type { PilarKey } from '@/lib/types'
import {
  PILARES as PILAR_SPECS, PILAR_KEYS, COL_CARTEIRA, COL_NOME,
  findCol, escalaPercentual,
} from '@/lib/pilares'

function today() {
  return new Date().toISOString().split('T')[0]
}

interface ParsedRow {
  id_carteira: string
  consultor_nome: string
  valor_metrica: number
  score_planilha: number
  metricas: Record<string, unknown>
}

/**
 * Lê a planilha de um pilar e devolve as linhas já normalizadas.
 *
 * As colunas de percentual são convertidas para a escala 0–100 AQUI, olhando a
 * coluna inteira (ver escalaPercentual). É a única conversão do sistema: o que
 * entra no banco já está pronto pra exibir, e nenhuma tela precisa adivinhar
 * escala depois.
 */
async function parsePilarFile(file: File, pilarKey: PilarKey): Promise<ParsedRow[]> {
  const { read, utils } = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = utils.sheet_to_json(ws, { defval: '' })

  if (rows.length === 0) throw new Error('Planilha vazia.')

  const headers = Object.keys(rows[0])
  const spec = PILAR_SPECS[pilarKey]

  const colCarteira = findCol(headers, COL_CARTEIRA)
  const colNome     = findCol(headers, COL_NOME)
  const colScore    = findCol(headers, spec.scoreCol)

  if (!colCarteira) throw new Error(`Coluna "${COL_CARTEIRA}" não encontrada.\nColunas: ${headers.join(', ')}`)
  if (!colNome)     throw new Error(`Coluna "${COL_NOME}" não encontrada.\nColunas: ${headers.join(', ')}`)
  if (!colScore)    throw new Error(`Coluna "${spec.scoreCol}" não encontrada.\nColunas: ${headers.join(', ')}`)

  const validas = rows.filter(r => String(r[colCarteira] ?? '').trim() !== '')
  if (validas.length === 0) throw new Error('Nenhuma linha com ID Carteira preenchido.')

  // Resolve cada coluna do contrato e, nas de percentual, decide a escala
  // olhando todos os valores daquela coluna.
  const resolvidas = spec.cols.map(c => {
    const header = findCol(headers, c.col)
    const fator = header && c.type === 'percent'
      ? escalaPercentual(validas.map(r => Number(r[header])))
      : 1
    return { ...c, header, fator }
  })

  const faltando = resolvidas.filter(c => !c.header).map(c => c.col)
  if (faltando.length > 0) {
    throw new Error(
      `Coluna(s) não encontrada(s): ${faltando.join(', ')}.\n\n` +
      `A planilha veio com: ${headers.join(', ')}`
    )
  }

  const colValor = resolvidas.find(c => c.col === spec.valorCol)

  return validas
    .map(r => {
      const metricas: Record<string, unknown> = {}
      for (const c of resolvidas) {
        const raw = r[c.header!]
        const n = Number(raw)
        metricas[c.col] = raw === '' || raw == null || !Number.isFinite(n) ? raw : n * c.fator
      }
      return {
        id_carteira:    String(r[colCarteira]).trim(),
        consultor_nome: String(r[colNome]).trim(),
        valor_metrica:  colValor ? Number(metricas[colValor.col]) || 0 : 0,
        score_planilha: Number(r[colScore]) || 0,
        metricas,
      }
    })
    .filter(r => r.id_carteira && r.consultor_nome)
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

const PILARES = PILAR_KEYS.map(k => [k, PILAR_SPECS[k]] as const)

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

  async function handleFile(pilarKey: PilarKey, file: File) {
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

    // Upsert: remove upload anterior do mesmo pilar+data (evita duplicatas)
    const { data: existing } = await supabase
      .from('score_uploads')
      .select('id')
      .eq('pilar_key', pilarKey)
      .eq('data_referencia', date)
    if (existing && existing.length > 0) {
      const ids = existing.map((u: { id: string }) => u.id)
      await supabase.from('score_consultor_resultados').delete().in('upload_id', ids)
      await supabase.from('score_uploads').delete().in('id', ids)
    }

    const { data: upload, error: uploadErr } = await supabase
      .from('score_uploads')
      .insert({ uploaded_by: uploadedBy, pilar_key: pilarKey, filename: file.name, data_referencia: date, record_count: rows.length })
      .select('id').single()

    if (uploadErr || !upload) {
      setStateFor(pilarKey, { status: 'error', message: 'Erro ao salvar: ' + uploadErr?.message })
      return
    }

    const { error: recErr } = await supabase.from('score_consultor_resultados').insert(
      rows.map(r => ({
        upload_id: upload.id,
        id_carteira: r.id_carteira,
        consultor_nome: r.consultor_nome,
        pilar_key: pilarKey,
        valor_metrica: r.valor_metrica,
        score_planilha: r.score_planilha,
        data_referencia: date,
        metricas: r.metricas,
      }))
    )

    if (recErr) {
      setStateFor(pilarKey, { status: 'error', message: 'Erro ao salvar resultados: ' + recErr.message })
      return
    }

    registrarEvento({
      tipo: 'score_upload_criado',
      alvoTipo: 'score_upload',
      alvoId: upload.id,
      alvoDescricao: `${PILAR_SPECS[pilarKey].label} · ${formatDateBR(date)}`,
      detalhes: { pilar_key: pilarKey, data_referencia: date, record_count: rows.length, substituiu: (existing?.length ?? 0) > 0 },
    })

    setStateFor(pilarKey, { status: 'ok', count: rows.length })
    if (inputRefs.current[pilarKey]) inputRefs.current[pilarKey]!.value = ''
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Upar Planilha</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Envie a planilha de cada pilar separadamente sempre que receber do Mercado Pago. O histórico completo é preservado.
        </p>
      </div>

      <div className="glass rounded-2xl border border-line p-5 mb-6 flex items-center gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-ink">Data de referência</p>
          <p className="text-xs text-ink-muted mt-0.5">Preenchida automaticamente com hoje</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm font-medium text-good">{formatDateBR(date)}</span>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={e => setDate(e.target.value)}
            className="border border-field-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* A Planilha Geral nao e um pilar de score: alimenta Campanhas e vive em
          tabela separada. Fica acima para nao se perder no meio dos 6 pilares. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <ImportPlanilhaGeral data={date} />
      </div>

      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">Planilhas de pontuação</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PILARES.map(([key, cfg]) => {
          const state = getState(key)
          return (
            <div
              key={key}
              className="glass rounded-2xl border border-line p-5 hover:shadow-md transition-shadow"
              style={{ borderLeft: `4px solid ${cfg.color}` }}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${cfg.color}20` }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.color }} />
                </div>
                <p className="text-sm font-semibold text-ink">{cfg.label}</p>
              </div>

              {state.status === 'ok' && (
                <div className="text-xs text-good bg-good-bg rounded-lg px-3 py-2 mb-3 flex items-center gap-1.5">
                  <span>✓</span> {state.count} registros salvos — {formatDateBR(date)}
                </div>
              )}
              {state.status === 'error' && (
                <div className="text-xs text-bad bg-bad-bg rounded-lg px-3 py-2 mb-3 whitespace-pre-wrap">
                  {state.message}
                </div>
              )}
              {(state.status === 'parsing' || state.status === 'saving') && (
                <div className="text-xs text-ink-muted bg-card-2 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-good border-t-transparent rounded-full" />
                  {state.status === 'parsing' ? 'Lendo planilha...' : 'Salvando...'}
                </div>
              )}

              <label className={`flex items-center justify-center gap-2 w-full text-sm font-medium rounded-xl py-2.5 transition-colors cursor-pointer ${
                state.status === 'parsing' || state.status === 'saving'
                  ? 'opacity-50 cursor-not-allowed bg-card-2 text-ink-faint border border-line'
                  : 'text-good border border-good/30 bg-good-bg hover:bg-good/25'
              }`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
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
