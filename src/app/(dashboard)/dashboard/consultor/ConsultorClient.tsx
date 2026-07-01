'use client'

import { useState, useMemo } from 'react'

const PILARES = ['tpv', 'net_churn', 'acionaveis', 'aderencia', 'awareness', 'produtividade']
const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'Net Churn', acionaveis: 'Acionáveis',
  aderencia: 'Aderência', awareness: 'Awareness', produtividade: 'Produtividade',
}
const PILAR_COLOR: Record<string, string> = {
  tpv: '#60a5fa', net_churn: '#c084fc', acionaveis: '#fb923c',
  aderencia: '#2dd4bf', awareness: '#f472b6', produtividade: '#818cf8',
}

interface Resultado {
  id_carteira: string
  consultor_nome: string
  pilar_key: string
  score_planilha: number
  total_a_reverter: number | null
}

interface Props {
  resultados: Resultado[]
  dateDisplay: string
}

function statusLabel(score: number) {
  if (score >= 4.5) return { label: 'Acima da meta', bg: '#F0FDF4', text: '#10B981' }
  if (score >= 3.0) return { label: 'Na linha', bg: '#FFFBEB', text: '#F59E0B' }
  return { label: 'Crítico', bg: '#FEF2F2', text: '#EF4444' }
}

export default function ConsultorClient({ resultados, dateDisplay }: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const consultores = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of resultados) map.set(r.id_carteira, r.consultor_nome)
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  }, [resultados])

  const filtered = search.length >= 2
    ? consultores.filter(c => c.nome.toLowerCase().includes(search.toLowerCase()))
    : consultores

  const selected = selectedId
    ? resultados.filter(r => r.id_carteira === selectedId)
    : null

  const scoresByPilar = selected
    ? Object.fromEntries(selected.map(r => [r.pilar_key, r]))
    : null

  const totalScore = scoresByPilar
    ? Math.min(PILARES.reduce((s, p) => s + (scoresByPilar[p]?.score_planilha ?? 0), 0), 10)
    : null

  const selectedNome = selectedId ? consultores.find(c => c.id === selectedId)?.nome : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Consultor</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Performance individual · {dateDisplay}</p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Lista de consultores */}
        <div className="w-64 flex-shrink-0 bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <div className="px-3 py-3 border-b border-[#F3F4F6]">
            <input
              type="text"
              placeholder="Buscar consultor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
            />
          </div>
          <div className="overflow-y-auto max-h-[60vh] divide-y divide-[#F9FAFB]">
            {filtered.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-8">Nenhum resultado</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    selectedId === c.id
                      ? 'bg-[#F0FDF4] text-[#10B981] font-semibold'
                      : 'text-[#374151] hover:bg-[#F9FAFB]'
                  }`}
                >
                  {c.nome}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detalhe do consultor */}
        <div className="flex-1">
          {!selectedId ? (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <p className="font-semibold text-[#111827]">Selecione um consultor</p>
              <p className="text-sm text-[#6B7280] mt-1">Escolha na lista à esquerda</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header do consultor */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-lg font-bold text-[#111827]">{selectedNome}</p>
                  <p className="text-sm text-[#6B7280] mt-0.5">Cart. {selectedId}</p>
                </div>
                {totalScore !== null && (() => {
                  const st = statusLabel(totalScore)
                  return (
                    <div className="text-right">
                      <p className="text-xs text-[#6B7280] mb-1">Score Total</p>
                      <span className="text-2xl font-bold px-4 py-1.5 rounded-xl inline-block" style={{ background: st.bg, color: st.text }}>
                        {totalScore.toFixed(1)}
                      </span>
                      <p className="text-xs mt-1 font-medium" style={{ color: st.text }}>{st.label}</p>
                    </div>
                  )
                })()}
              </div>

              {/* Cards por pilar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {PILARES.map(pilar => {
                  const color = PILAR_COLOR[pilar]
                  const r = scoresByPilar?.[pilar]
                  return (
                    <div key={pilar} className="bg-white rounded-2xl border border-[#E5E7EB] p-5" style={{ borderLeft: `3px solid ${color}` }}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-[#111827]">{PILAR_LABEL[pilar]}</p>
                        {r ? (
                          <span className="text-base font-bold" style={{ color }}>{r.score_planilha.toFixed(1)}</span>
                        ) : (
                          <span className="text-sm text-[#D1D5DB]">—</span>
                        )}
                      </div>
                      {r && (
                        <>
                          <div className="w-full bg-[#F3F4F6] rounded-full h-1.5 mb-2">
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min((r.score_planilha / 5) * 100, 100)}%`, background: color }}
                            />
                          </div>
                          {pilar === 'net_churn' && (
                            <p className="text-[10px] text-[#9CA3AF] mb-1">↓ quanto menor, melhor</p>
                          )}
                          {r.total_a_reverter != null && r.total_a_reverter > 0 && (
                            <p className="text-[11px] text-[#F59E0B] font-medium">
                              Falta atingir: {Math.abs(r.total_a_reverter) < 2
                                ? `${(r.total_a_reverter * 100).toFixed(1)}%`
                                : String(r.total_a_reverter)}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
