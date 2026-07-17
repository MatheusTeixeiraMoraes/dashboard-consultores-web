'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const PILARES = ['tpv', 'net_churn', 'acionaveis', 'aderencia', 'awareness', 'produtividade']
const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'Net Churn', acionaveis: 'Acionáveis',
  aderencia: 'Aderência', awareness: 'Awareness', produtividade: 'Produtividade',
}

interface Resultado {
  id_carteira: string
  consultor_nome: string
  pilar_key: string
  score_planilha: number
}

interface ConsultorRow {
  id: string
  nome: string
  scoreA: number
  scoreB: number
  /** null = as duas datas não têm os mesmos pilares; não dá pra comparar. */
  delta: number | null
  pilares: Record<string, { a: number | null; b: number | null; delta: number | null }>
}

function formatDateBR(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

async function fetchResultados(date: string): Promise<Resultado[]> {
  const supabase = createClient()
  const { data: uploads } = await supabase
    .from('score_uploads')
    .select('id')
    .eq('data_referencia', date)

  const idList = (uploads ?? []).map((u: { id: string }) => u.id)
  if (idList.length === 0) return []

  const { data } = await supabase
    .from('score_consultor_resultados')
    .select('id_carteira, consultor_nome, pilar_key, score_planilha')
    .in('upload_id', idList)

  return data ?? []
}

function buildRows(a: Resultado[], b: Resultado[]): ConsultorRow[] {
  const map = new Map<string, ConsultorRow>()

  const addData = (rows: Resultado[], side: 'a' | 'b') => {
    for (const r of rows) {
      if (!map.has(r.id_carteira)) {
        map.set(r.id_carteira, {
          id: r.id_carteira, nome: r.consultor_nome,
          scoreA: 0, scoreB: 0, delta: null,
          pilares: Object.fromEntries(PILARES.map(p => [p, { a: null, b: null, delta: null }])),
        })
      }
      const row = map.get(r.id_carteira)!
      row.pilares[r.pilar_key] = {
        ...row.pilares[r.pilar_key],
        [side]: r.score_planilha,
        delta: null,
      }
    }
  }

  addData(a, 'a')
  addData(b, 'b')

  for (const row of map.values()) {
    let sA = 0, sB = 0
    for (const p of PILARES) {
      const pData = row.pilares[p]
      if (pData.a !== null && pData.b !== null) pData.delta = pData.b - pData.a
      sA += pData.a ?? 0
      sB += pData.b ?? 0
    }
    row.scoreA = Math.min(sA, 10)
    row.scoreB = Math.min(sB, 10)

    // Só compara o total quando as duas datas têm os MESMOS pilares. Se uma
    // delas veio incompleta, o pilar que falta entraria como 0 e o Δ mostraria
    // uma queda que nunca existiu — melhor não afirmar nada.
    const mesmosPilares = PILARES.every(p => {
      const { a, b } = row.pilares[p]
      return (a === null) === (b === null)
    })
    row.delta = mesmosPilares ? row.scoreB - row.scoreA : null
  }

  return Array.from(map.values()).sort((x, y) => y.scoreB - x.scoreB)
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-ink-faint text-xs">—</span>
  if (Math.abs(delta) < 0.05) return <span className="text-xs text-ink-faint">=</span>
  const up = delta > 0
  return (
    <span className={`text-xs font-semibold flex items-center justify-center gap-0.5 ${up ? 'text-good' : 'text-bad'}`}>
      {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
    </span>
  )
}

export default function CompararClient({ dates, idCarteira }: { dates: string[]; idCarteira?: string | null }) {
  const [dateA, setDateA] = useState(dates[1] ?? dates[0] ?? '')
  const [dateB, setDateB] = useState(dates[0] ?? '')
  const [rows, setRows] = useState<ConsultorRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleComparar() {
    if (!dateA || !dateB || dateA === dateB) return
    setLoading(true)
    const [a, b] = await Promise.all([fetchResultados(dateA), fetchResultados(dateB)])
    let built = buildRows(a, b)
    if (idCarteira) built = built.filter(r => r.id === idCarteira)
    setRows(built)
    setLoading(false)
  }

  if (dates.length < 2) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink">Comparar Datas</h1>
          <p className="text-sm text-ink-muted mt-0.5">Compare a evolução entre dois períodos</p>
        </div>
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Dados insuficientes</p>
          <p className="text-sm text-ink-muted mt-1">São necessários uploads em ao menos duas datas distintas.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Comparar Datas</h1>
        <p className="text-sm text-ink-muted mt-0.5">Compare a evolução entre dois períodos</p>
      </div>

      {/* Seletor de datas */}
      <div className="glass rounded-2xl border border-line p-5 mb-5 flex flex-wrap items-end gap-4">
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-1.5">Período A (base)</p>
          <select
            value={dateA}
            onChange={e => { setDateA(e.target.value); setRows(null) }}
            className="border border-field-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary bg-field"
          >
            {dates.map(d => <option key={d} value={d}>{formatDateBR(d)}</option>)}
          </select>
        </div>
        <div className="text-good font-bold text-lg pb-1.5">→</div>
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-1.5">Período B (comparação)</p>
          <select
            value={dateB}
            onChange={e => { setDateB(e.target.value); setRows(null) }}
            className="border border-field-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary bg-field"
          >
            {dates.map(d => <option key={d} value={d}>{formatDateBR(d)}</option>)}
          </select>
        </div>
        <button
          onClick={handleComparar}
          disabled={loading || !dateA || !dateB || dateA === dateB}
          className="bg-primary hover:bg-primary-dk disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
        >
          {loading ? 'Carregando...' : 'Comparar'}
        </button>
        {dateA === dateB && <p className="text-xs text-bad">Selecione datas diferentes</p>}
      </div>

      {/* Tabela de comparação */}
      {rows && (
        <div className="glass rounded-2xl border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-card-2">
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider w-6">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Consultor</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">{formatDateBR(dateA)}</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">{formatDateBR(dateB)}</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Δ Total</th>
                {PILARES.map(p => (
                  <th key={p} className="text-center px-2 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wider">
                    Δ {PILAR_LABEL[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, i) => (
                <tr key={row.id} className="hover:bg-card-2 transition-colors">
                  <td className="px-4 py-3 text-xs text-ink-faint font-medium">{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{row.nome}</p>
                    <p className="text-[11px] text-ink-faint">Cart. {row.id}</p>
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-semibold text-ink-muted">{row.scoreA.toFixed(1)}</td>
                  <td className="px-3 py-3 text-center text-sm font-bold text-ink">{row.scoreB.toFixed(1)}</td>
                  <td className="px-3 py-3 text-center">
                    <DeltaBadge delta={row.delta} />
                  </td>
                  {PILARES.map(p => (
                    <td key={p} className="px-2 py-3 text-center">
                      <DeltaBadge delta={row.pilares[p]?.delta ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
