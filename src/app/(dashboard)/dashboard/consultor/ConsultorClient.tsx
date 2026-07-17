'use client'

import { useState, useMemo } from 'react'
import PilaresDetalhe, { type ResultadoPilar, type PilarConfigMin } from '@/components/dashboard/PilaresDetalhe'
import EvolucaoScore from '@/components/dashboard/EvolucaoScore'
import { PILAR_KEYS } from '@/lib/pilares'
import { SCORE_MAX, SCORE_META_MINIMA, scoreStatus } from '@/lib/types'

const STATUS = {
  acima:    { label: `Acima da meta mínima (${SCORE_META_MINIMA.toFixed(1).replace('.', ',')} pts)`, text: '#3ECF8E' },
  na_linha: { label: 'Na linha', text: '#F5B04E' },
  critico:  { label: 'Crítico',  text: '#F2777A' },
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
        <h1 className="text-xl font-bold text-[#F4F4F5]">Consultor</h1>
        <p className="text-sm text-[#8A8A93] mt-0.5">Performance individual · {dateDisplay}</p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Lista de consultores */}
        <div className="w-60 flex-shrink-0 bg-[#17171B] rounded-2xl border border-[#26262B] overflow-hidden">
          <div className="px-3 py-3 border-b border-[#26262B]">
            <input
              type="text"
              placeholder="Buscar consultor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm bg-[#1D1D22] border border-[#26262B] rounded-xl px-3 py-2 text-[#F4F4F5] placeholder-[#5C5C64] focus:outline-none focus:ring-2 focus:ring-[#4F5FE0]"
            />
          </div>
          <div className="overflow-y-auto max-h-[70vh] divide-y divide-[#1D1D22]">
            {filtrados.length === 0 ? (
              <p className="text-sm text-[#5C5C64] text-center py-8">Nenhum resultado</p>
            ) : (
              filtrados.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    selectedId === c.id
                      ? 'bg-[#163A28] text-[#3ECF8E] font-semibold'
                      : 'text-[#C4C4CC] hover:bg-[#1D1D22]'
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
            <div className="bg-[#17171B] rounded-2xl border border-[#26262B] p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#163A28] flex items-center justify-center mx-auto mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3ECF8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <p className="font-semibold text-[#F4F4F5]">Selecione um consultor</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#17171B] rounded-2xl border border-[#26262B] px-6 py-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <p className="text-lg font-bold text-[#F4F4F5]">{nomeSelecionado}</p>
                    <p className="text-sm text-[#8A8A93]">Carteira {selectedId} · {dateDisplay}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[#8A8A93] mb-1">Score Geral</p>
                    <p className="text-3xl font-bold" style={{ color: st.text }}>
                      {total.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      <span className="text-base font-medium text-[#5C5C64]"> /{SCORE_MAX.toFixed(1).replace('.', ',')}</span>
                    </p>
                  </div>
                </div>

                <div className="w-full bg-[#26262B] rounded-full h-2.5 mb-2 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${(total / SCORE_MAX) * 100}%`, background: st.text }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#5C5C64]">0</span>
                  <span className="text-xs font-medium" style={{ color: st.text }}>{st.label}</span>
                  <span className="text-xs text-[#5C5C64]">{SCORE_MAX.toFixed(1).replace('.', ',')}</span>
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
