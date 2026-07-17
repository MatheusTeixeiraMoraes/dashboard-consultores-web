'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { SCORE_MAX, SCORE_META_MINIMA } from '@/lib/types'

/** Score de um consultor ao longo das datas de referência já carregadas. */

interface Ponto { date: string; score: number }

function formatRefDate(iso: string) {
  const [y, m] = iso.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[parseInt(m) - 1]}/${y}`
}

export default function EvolucaoScore({
  idCarteira,
  minPontos = 1,
}: {
  idCarteira: string
  /** Abaixo disso o gráfico não aparece (uma linha só não é evolução). */
  minPontos?: number
}) {
  const [data, setData] = useState<Ponto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('score_consultor_resultados')
        .select('data_referencia, pilar_key, score_planilha')
        .eq('id_carteira', idCarteira)

      if (cancelled) return

      // Uma data pode ter mais de uma linha por pilar se houve re-upload; fica
      // a mais recente por (data, pilar) e os 6 pilares somam o score do dia.
      const porData = new Map<string, Map<string, number>>()
      for (const r of rows ?? []) {
        if (!r.data_referencia) continue
        if (!porData.has(r.data_referencia)) porData.set(r.data_referencia, new Map())
        porData.get(r.data_referencia)!.set(r.pilar_key, r.score_planilha)
      }

      const pontos: Ponto[] = Array.from(porData.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, pilares]) => ({
          date: formatRefDate(date),
          score: Math.min(Array.from(pilares.values()).reduce((s, v) => s + v, 0), SCORE_MAX),
        }))

      setData(pontos)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [idCarteira])

  if (loading) {
    return (
      <div className="glass rounded-2xl border border-line p-5">
        <p className="text-sm font-semibold text-ink mb-4">Evolução do Score</p>
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <span className="animate-spin w-4 h-4 border-2 border-good border-t-transparent rounded-full inline-block" />
          Carregando histórico...
        </div>
      </div>
    )
  }

  if (data.length < minPontos) return null

  return (
    <div className="glass rounded-2xl border border-line p-5">
      <p className="text-sm font-semibold text-ink mb-1">Evolução do Score</p>
      <p className="text-xs text-ink-faint mb-4">Soma dos 6 pilares em cada data de referência</p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-ink-faint)' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, SCORE_MAX]} tick={{ fontSize: 11, fill: 'var(--color-ink-faint)' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              formatter={(v) => [
                `${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pts`,
                'Score',
              ]}
              // sem backgroundColor o Recharts cai no #fff default e o texto claro some
              contentStyle={{ backgroundColor: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-line)', fontSize: 12 }}
              labelStyle={{ color: 'var(--color-ink)' }}
              itemStyle={{ color: 'var(--color-ink-dim)' }}
            />
            <ReferenceLine
              y={SCORE_META_MINIMA} stroke="var(--color-warn)" strokeDasharray="4 4"
              label={{ value: 'meta mín.', position: 'insideTopRight', fontSize: 10, fill: 'var(--color-warn)' }}
            />
            <Line
              type="monotone" dataKey="score" stroke="var(--color-good)" strokeWidth={2.5}
              dot={{ fill: 'var(--color-good)', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: 'var(--color-good)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
