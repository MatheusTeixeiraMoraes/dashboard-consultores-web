'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts'

const PILARES = ['tpv', 'net_churn', 'acionaveis', 'aderencia', 'awareness', 'produtividade']
const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'NC', acionaveis: 'AC',
  aderencia: 'Agenda', awareness: 'AW', produtividade: 'Prod',
}
const PILAR_COLOR: Record<string, string> = {
  tpv: '#60a5fa', net_churn: '#c084fc', acionaveis: '#fb923c',
  aderencia: '#2dd4bf', awareness: '#f472b6', produtividade: '#818cf8',
}

function statusStyle(score: number) {
  if (score >= 4.5) return { bg: '#163A28', text: '#3ECF8E' }
  if (score >= 3.0) return { bg: '#3A2E17', text: '#F5B04E' }
  return { bg: '#3C1E22', text: '#F2777A' }
}

function fmtMeta(meta: number, unidade: string): string {
  if (unidade === '%') {
    const digits = Math.abs(meta) % 1 === 0 ? 0 : 2
    return `${meta.toFixed(digits).replace('.', ',')}%`
  }
  if (Number.isInteger(meta)) return String(meta)
  return meta.toFixed(1).replace('.', ',')
}

interface ConsultorData {
  id: string
  nome: string
  total: number
  scores: Record<string, number>
}

interface Props {
  ranking: ConsultorData[]
  dateDisplay: string
  metaMap: Record<string, { meta: number; unidade: string }>
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div
      className="bg-[#17171B] rounded-2xl border border-[#26262B] p-4"
      style={color ? { borderLeft: `3px solid ${color}` } : undefined}
    >
      <p className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: color ?? '#8A8A93' }}>
        {label}
      </p>
      <p className="text-3xl font-bold" style={{ color: color ?? '#F4F4F5' }}>{value}</p>
      {sub && <p className="text-xs text-[#8A8A93] mt-1">{sub}</p>}
    </div>
  )
}

export default function GeralClient({ ranking, dateDisplay, metaMap }: Props) {
  const stats = useMemo(() => {
    const acima = ranking.filter(c => c.total >= 4.5).length
    const naLinha = ranking.filter(c => c.total >= 3.0 && c.total < 4.5).length
    const critico = ranking.filter(c => c.total < 3.0).length
    const media = ranking.length > 0
      ? ranking.reduce((s, c) => s + c.total, 0) / ranking.length
      : 0
    return { acima, naLinha, critico, media }
  }, [ranking])

  const chartData = [
    { name: 'Acima da meta', count: stats.acima, color: '#3ECF8E' },
    { name: 'Na linha', count: stats.naLinha, color: '#F5B04E' },
    { name: 'Crítico', count: stats.critico, color: '#F2777A' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#F4F4F5]">Ranking Geral</h1>
        <p className="text-sm text-[#8A8A93] mt-0.5">{ranking.length} consultores · {dateDisplay}</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <SummaryCard label="Total equipe" value={String(ranking.length)} />
        <SummaryCard
          label="Acima da meta"
          value={String(stats.acima)}
          sub={`${ranking.length > 0 ? Math.round(stats.acima / ranking.length * 100) : 0}% da equipe`}
          color="#3ECF8E"
        />
        <SummaryCard
          label="Crítico"
          value={String(stats.critico)}
          sub={`${ranking.length > 0 ? Math.round(stats.critico / ranking.length * 100) : 0}% da equipe`}
          color="#F2777A"
        />
        <SummaryCard
          label="Média da equipe"
          value={stats.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' pts'}
          sub="de 10,0 pts"
        />
      </div>

      {/* Gráfico de distribuição */}
      <div className="bg-[#17171B] rounded-2xl border border-[#26262B] p-5 mb-5">
        <p className="text-sm font-semibold text-[#F4F4F5] mb-4">Distribuição da equipe</p>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 4 }}>
              <XAxis type="number" hide domain={[0, Math.max(ranking.length, 1)]} />
              <YAxis
                type="category" dataKey="name" width={120}
                tick={{ fontSize: 12, fill: '#8A8A93' }} axisLine={false} tickLine={false}
              />
              <Tooltip
                formatter={(v) => { const n = Number(v ?? 0); return [`${n} consultor${n !== 1 ? 'es' : ''}`, ''] }}
                contentStyle={{ borderRadius: 8, border: '1px solid #26262B', fontSize: 12 }}
                cursor={{ fill: '#1D1D22' }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={22}
                label={{ position: 'right', fontSize: 12, fill: '#8A8A93', fontWeight: 600 }}
              >
                {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela de ranking */}
      {ranking.length === 0 ? (
        <div className="bg-[#17171B] rounded-2xl border border-[#26262B] p-12 text-center">
          <p className="text-[#8A8A93]">Nenhum resultado na data mais recente.</p>
        </div>
      ) : (
        <div className="bg-[#17171B] rounded-2xl border border-[#26262B] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#26262B] bg-[#1D1D22]">
                <th className="text-left px-4 py-3 font-semibold text-[#8A8A93] text-xs uppercase tracking-wider w-8">#</th>
                <th className="text-left px-4 py-3 font-semibold text-[#8A8A93] text-xs uppercase tracking-wider">Consultor</th>
                <th className="text-center px-3 py-3 font-semibold text-[#8A8A93] text-xs uppercase tracking-wider">Score</th>
                {PILARES.map(p => {
                  const mc = metaMap[p]
                  return (
                    <th key={p} className="text-center px-2 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: PILAR_COLOR[p] }}>
                      {PILAR_LABEL[p]}
                      {mc && (
                        <div className="text-[10px] font-normal text-[#5C5C64] normal-case tracking-normal mt-0.5">
                          meta {fmtMeta(mc.meta, mc.unidade)}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#26262B]">
              {ranking.map((c, i) => {
                const st = statusStyle(c.total)
                return (
                  <tr key={c.id} className="hover:bg-[#1D1D22] transition-colors">
                    <td className="px-4 py-3 text-[#8A8A93] font-medium text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#F4F4F5] text-sm leading-tight">{c.nome}</p>
                      <p className="text-[11px] text-[#8A8A93]">Cart. {c.id}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-block px-2.5 py-1 rounded-xl text-sm font-bold" style={{ background: st.bg, color: st.text }}>
                        {c.total.toFixed(1)}
                      </span>
                    </td>
                    {PILARES.map(p => {
                      const score = c.scores[p]
                      return (
                        <td key={p} className="px-2 py-3 text-center">
                          {score !== undefined ? (
                            <p className="text-sm font-semibold text-[#F4F4F5]">{score.toFixed(1).replace('.', ',')}</p>
                          ) : (
                            <span className="text-[#52525B]">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
