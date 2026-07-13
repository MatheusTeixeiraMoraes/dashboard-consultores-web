'use client'

import { useState, useMemo } from 'react'
import PilaresDetalhe, { type ResultadoPilar, type PilarConfigMin } from '@/components/dashboard/PilaresDetalhe'
import EvolucaoScore from '@/components/dashboard/EvolucaoScore'
import { PILAR_KEYS } from '@/lib/pilares'
import { SCORE_MAX, SCORE_META_MINIMA, scoreStatus } from '@/lib/types'

const STATUS = {
  acima:    { label: `Acima da meta mínima (${SCORE_META_MINIMA.toFixed(1).replace('.', ',')} pts)`, text: '#10B981' },
  na_linha: { label: 'Na linha', text: '#F59E0B' },
  critico:  { label: 'Crítico',  text: '#EF4444' },
} as const

interface Resultado extends ResultadoPilar {
  id_carteira: string
  consultor_nome: string
}

interface Props {
  resultados: Resultado[]
  dateDisplay: string
  dataReferencia: string
  pilaresConfig: PilarConfigMin[]
}

export default function ConsultorClient({ resultados, dateDisplay, dataReferencia, pilaresConfig }: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const consultores = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of resultados) map.set(r.id_carteira, r.consultor_nome)
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  }, [resultados])

  const filtrados = search.length >= 2
    ? consultores.filter(c => c.nome.toLowerCase().includes(search.toLowerCase()))
    : consultores

  const doConsultor = useMemo(
    () => selectedId ? resultados.filter(r => r.id_carteira === selectedId) : [],
    [resultados, selectedId],
  )

  const total = useMemo(() => {
    if (!selectedId) return null
    const porPilar = Object.fromEntries(doConsultor.map(r => [r.pilar_key, r]))
    return Math.min(
      PILAR_KEYS.reduce((s, k) => s + (porPilar[k]?.score_planilha ?? 0), 0),
      SCORE_MAX,
    )
  }, [doConsultor, selectedId])

  const nomeSelecionado = selectedId ? consultores.find(c => c.id === selectedId)?.nome : null
  const st = total !== null ? STATUS[scoreStatus(total)] : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Consultor</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Performance individual · {dateDisplay}</p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Lista de consultores */}
        <div className="w-60 flex-shrink-0 bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <div className="px-3 py-3 border-b border-[#F3F4F6]">
            <input
              type="text"
              placeholder="Buscar consultor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
            />
          </div>
          <div className="overflow-y-auto max-h-[70vh] divide-y divide-[#F9FAFB]">
            {filtrados.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-8">Nenhum resultado</p>
            ) : (
              filtrados.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
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

        {/* Detalhe */}
        <div className="flex-1 min-w-0">
          {!selectedId || total === null || !st ? (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <p className="font-semibold text-[#111827]">Selecione um consultor</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-[#E5E7EB] px-6 py-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <p className="text-lg font-bold text-[#111827]">{nomeSelecionado}</p>
                    <p className="text-sm text-[#6B7280]">Carteira {selectedId} · {dateDisplay}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[#6B7280] mb-1">Score Geral</p>
                    <p className="text-3xl font-bold" style={{ color: st.text }}>
                      {total.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      <span className="text-base font-medium text-[#9CA3AF]"> /{SCORE_MAX.toFixed(1).replace('.', ',')}</span>
                    </p>
                  </div>
                </div>

                <div className="w-full bg-[#F3F4F6] rounded-full h-2.5 mb-2 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${(total / SCORE_MAX) * 100}%`, background: st.text }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#9CA3AF]">0</span>
                  <span className="text-xs font-medium" style={{ color: st.text }}>{st.label}</span>
                  <span className="text-xs text-[#9CA3AF]">{SCORE_MAX.toFixed(1).replace('.', ',')}</span>
                </div>
              </div>

              <PilaresDetalhe
                resultados={doConsultor}
                pilaresConfig={pilaresConfig}
                dataReferencia={dataReferencia}
              />

              <EvolucaoScore idCarteira={selectedId} minPontos={2} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
