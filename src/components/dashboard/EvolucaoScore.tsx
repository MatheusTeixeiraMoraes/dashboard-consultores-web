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
      <div className="bg-[#17171B] rounded-2xl border border-[#26262B] p-5">
        <p className="text-sm font-semibold text-[#F4F4F5] mb-4">Evolução do Score</p>
        <div className="flex items-center gap-2 text-sm text-[#5C5C64]">
          <span className="animate-spin w-4 h-4 border-2 border-[#3ECF8E] border-t-transparent rounded-full inline-block" />
          Carregando histórico...
        </div>
      </div>
    )
  }

  if (data.length < minPontos) return null

  return (
    <div className="bg-[#17171B] rounded-2xl border border-[#26262B] p-5">
      <p className="text-sm font-semibold text-[#F4F4F5] mb-1">Evolução do Score</p>
      <p className="text-xs text-[#5C5C64] mb-4">Soma dos 6 pilares em cada data de referência</p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#26262B" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5C5C64' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, SCORE_MAX]} tick={{ fontSize: 11, fill: '#5C5C64' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              formatter={(v) => [
                `${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pts`,
                'Score',
              ]}
              contentStyle={{ borderRadius: 8, border: '1px solid #26262B', fontSize: 12 }}
            />
            <ReferenceLine
              y={SCORE_META_MINIMA} stroke="#F5B04E" strokeDasharray="4 4"
              label={{ value: 'meta mín.', position: 'insideTopRight', fontSize: 10, fill: '#F5B04E' }}
            />
            <Line
              type="monotone" dataKey="score" stroke="#3ECF8E" strokeWidth={2.5}
              dot={{ fill: '#3ECF8E', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#3ECF8E' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
