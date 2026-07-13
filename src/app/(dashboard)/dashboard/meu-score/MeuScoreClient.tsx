'use client'

import PilaresDetalhe, { type ResultadoPilar, type PilarConfigMin } from '@/components/dashboard/PilaresDetalhe'
import EvolucaoScore from '@/components/dashboard/EvolucaoScore'
import { PILAR_KEYS } from '@/lib/pilares'
import { SCORE_MAX, SCORE_META_MINIMA, scoreStatus } from '@/lib/types'

const STATUS = {
  acima:    { label: 'Acima da meta', bg: '#F0FDF4', text: '#10B981' },
  na_linha: { label: 'Na linha',      bg: '#FFFBEB', text: '#F59E0B' },
  critico:  { label: 'Crítico',       bg: '#FEF2F2', text: '#EF4444' },
} as const

interface Props {
  resultados: ResultadoPilar[]
  dateDisplay: string
  dataReferencia: string
  pilaresConfig: PilarConfigMin[]
  profileNome: string
  idCarteira: string
}

export default function MeuScoreClient({
  resultados, dateDisplay, dataReferencia, pilaresConfig, profileNome, idCarteira,
}: Props) {
  const porPilar = Object.fromEntries(resultados.map(r => [r.pilar_key, r]))
  const total = Math.min(
    PILAR_KEYS.reduce((s, k) => s + (porPilar[k]?.score_planilha ?? 0), 0),
    SCORE_MAX,
  )
  const st = STATUS[scoreStatus(total)]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Meu Desempenho</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          {profileNome} · Carteira {idCarteira} · {dateDisplay}
        </p>
      </div>

      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <p className="text-xs text-[#9CA3AF] uppercase tracking-wide mb-1">Score Geral</p>
              <p className="text-5xl font-bold" style={{ color: st.text }}>
                {total.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span className="text-2xl font-normal text-[#9CA3AF]">/{SCORE_MAX}</span>
              </p>
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              <span
                className="inline-block px-3 py-1.5 rounded-xl text-sm font-semibold"
                style={{ background: st.bg, color: st.text }}
              >
                {st.label}
              </span>
              <p className="text-xs text-[#9CA3AF]">
                Meta mínima: {SCORE_META_MINIMA.toFixed(1).replace('.', ',')} pts
              </p>
            </div>
          </div>

          <div className="w-full bg-[#F3F4F6] rounded-full h-2.5 mb-2 overflow-hidden">
            <div
              className="h-2.5 rounded-full transition-all duration-700"
              style={{ width: `${(total / SCORE_MAX) * 100}%`, background: st.text }}
            />
          </div>
          <div className="flex justify-between text-xs text-[#9CA3AF]">
            <span>0</span>
            <span>{SCORE_MAX.toFixed(1).replace('.', ',')}</span>
          </div>
        </div>

        <PilaresDetalhe
          resultados={resultados}
          pilaresConfig={pilaresConfig}
          dataReferencia={dataReferencia}
        />

        <EvolucaoScore idCarteira={idCarteira} minPontos={2} />
      </div>
    </div>
  )
}
