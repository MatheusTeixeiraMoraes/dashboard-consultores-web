'use client'

import PilaresDetalhe, { type ResultadoPilar, type PilarConfigMin } from '@/components/dashboard/PilaresDetalhe'
import EvolucaoScore from '@/components/dashboard/EvolucaoScore'
import { PILAR_KEYS } from '@/lib/pilares'
import { SCORE_MAX, SCORE_META_MINIMA, scoreStatus } from '@/lib/types'

const STATUS = {
  acima:    { label: 'Acima da meta', bg: 'var(--color-good-bg)', text: '#3ECF8E' },
  na_linha: { label: 'Na linha',      bg: 'var(--color-warn-bg)', text: '#F5B04E' },
  critico:  { label: 'Crítico',       bg: 'var(--color-bad-bg)', text: '#F2777A' },
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
        <h1 className="text-xl font-bold text-ink">Meu Desempenho</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {profileNome} · Carteira {idCarteira} · {dateDisplay}
        </p>
      </div>

      <div className="space-y-5">
        <div className="glass rounded-2xl border border-line px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <p className="text-xs text-ink-faint uppercase tracking-wide mb-1">Score Geral</p>
              <p className="text-5xl font-bold" style={{ color: st.text }}>
                {total.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span className="text-2xl font-normal text-ink-faint">/{SCORE_MAX}</span>
              </p>
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              <span
                className="inline-block px-3 py-1.5 rounded-xl text-sm font-semibold"
                style={{ background: st.bg, color: st.text }}
              >
                {st.label}
              </span>
              <p className="text-xs text-ink-faint">
                Meta mínima: {SCORE_META_MINIMA.toFixed(1).replace('.', ',')} pts
              </p>
            </div>
          </div>

          <div className="w-full bg-line rounded-full h-2.5 mb-2 overflow-hidden">
            <div
              className="h-2.5 rounded-full transition-all duration-700"
              style={{ width: `${(total / SCORE_MAX) * 100}%`, background: st.text }}
            />
          </div>
          <div className="flex justify-between text-xs text-ink-faint">
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
