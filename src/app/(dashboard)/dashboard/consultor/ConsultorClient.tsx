'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

// Grupos de pilares
const GRUPOS = [
  { key: 'atuacao', label: 'Atuação', pilares: ['awareness', 'produtividade', 'aderencia'] },
  { key: 'resultado', label: 'Resultado', pilares: ['tpv', 'net_churn', 'acionaveis'] },
] as const

const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'Net Churn', acionaveis: 'Acionáveis Comerciais',
  aderencia: 'Aderência a Agenda', awareness: 'Awareness', produtividade: 'Produtividade',
}
const PILAR_COLOR: Record<string, string> = {
  tpv: '#60a5fa', net_churn: '#c084fc', acionaveis: '#fb923c',
  aderencia: '#2dd4bf', awareness: '#f472b6', produtividade: '#818cf8',
}

// Colunas de detalhe por pilar
const PILAR_COLS: Record<string, string[]> = {
  tpv: ['PV Total mês atual', 'PV Total mês passado', 'TPV médio mês atual', 'TPV médio mês passado', 'Variação de TPV versus mês passado'],
  net_churn: ['Sellers ativos (atual)', 'Sellers ativos (passado)', 'Sellers em churn', 'Sellers reativos', 'Objetivo Final', 'Total a Reverter'],
  acionaveis: ['Total Acionáveis (Tarefas)', 'Total Acionáveis (Revertido)', 'Objetivo Final', 'Total a Reverter'],
  aderencia: ['Sellers agendados', 'Sellers aderentes à agenda', 'Sellers visitados', 'Total a Reverter'],
  awareness: ['Sellers visitados', 'Sellers que responderam pesquisa', 'Total a Reverter'],
  produtividade: ['Visitas', 'Visitas efetivas', 'Sellers visitados', 'Produtividade média (objetivo)', 'Total Média a Realizar'],
}

const REVERTER_KEYS = new Set([
  'total a reverter', '% total a realizar', 'total media a realizar', 'total medio a realizar',
])
const CURRENCY_KEYS = /tpv total|pv total|tpv medio|tpv médio/i
const PILAR_IS_PERCENT = new Set(['tpv', 'net_churn', 'acionaveis', 'aderencia', 'awareness'])

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function formatVal(key: string, val: unknown): string {
  if (val === '' || val == null) return '—'
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (CURRENCY_KEYS.test(key)) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
  }
  const isPercent = key.includes('%') || /variacao|variação/i.test(norm(key))
  if (isPercent) {
    if (Math.abs(n) > 0 && Math.abs(n) <= 5) {
      return `${n > 0 ? '+' : ''}${(n * 100).toFixed(2).replace('.', ',')}%`
    }
    return `${n >= 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')}%`
  }
  if (Number.isInteger(n)) return n.toLocaleString('pt-BR')
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtMeta(meta: number, unidade: string): string {
  if (unidade === '%') {
    const digits = Math.abs(meta) % 1 === 0 ? 0 : 2
    return `${meta.toFixed(digits).replace('.', ',')}%`
  }
  if (Number.isInteger(meta)) return String(meta)
  return meta.toFixed(1).replace('.', ',')
}

function fmtValorMetrica(pilar: string, val: number): string {
  if (!PILAR_IS_PERCENT.has(pilar)) {
    if (Number.isInteger(val)) return String(val)
    return val.toFixed(1).replace('.', ',')
  }
  if (Math.abs(val) > 0 && Math.abs(val) <= 5) {
    return `${(val * 100).toFixed(1).replace('.', ',')}%`
  }
  return `${val.toFixed(1).replace('.', ',')}%`
}

function calcFaltam(pilar: string, valorMetrica: number, meta: number, tipoComp: string): number {
  let val = valorMetrica
  if (PILAR_IS_PERCENT.has(pilar) && Math.abs(valorMetrica) > 0 && Math.abs(valorMetrica) <= 5) {
    val = valorMetrica * 100
  }
  if (tipoComp === 'ge') return Math.max(0, meta - val)
  return Math.max(0, val - meta)
}

function findMetrica(metricas: Record<string, unknown>, targetLabel: string): [string, unknown] | null {
  const normTarget = norm(targetLabel)
  for (const [k, v] of Object.entries(metricas)) {
    if (norm(k) === normTarget) return [k, v]
  }
  return null
}

function formatRefDate(iso: string) {
  const [y, m] = iso.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]}/${y}`
}

function statusLabel(score: number) {
  if (score >= 4.5) return { label: 'Acima da meta mínima (4,5 pts)', bg: '#F0FDF4', text: '#10B981' }
  if (score >= 3.0) return { label: 'Na linha', bg: '#FFFBEB', text: '#F59E0B' }
  return { label: 'Crítico', bg: '#FEF2F2', text: '#EF4444' }
}

interface Resultado {
  id_carteira: string
  consultor_nome: string
  pilar_key: string
  score_planilha: number
  total_a_reverter: number | null
  valor_metrica: number
  metricas: Record<string, unknown> | null
}

interface PilarConfigMin {
  pilar_key: string
  pontos_max: number
  meta: number
  tipo_comp: string
  unidade: string
}

interface Props {
  resultados: Resultado[]
  dateDisplay: string
  dataReferencia: string
  pilaresConfig: PilarConfigMin[]
}

interface EvoPoint { date: string; score: number }

function EvolucaoSection({ idCarteira }: { idCarteira: string }) {
  const [data, setData] = useState<EvoPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('score_consultor_resultados')
        .select('data_referencia, pilar_key, score_planilha')
        .eq('id_carteira', idCarteira)

      if (cancelled || !rows) return

      // Agrupa por data+pilar, pega o maior score (evita duplicatas de re-upload)
      const byDatePilar = new Map<string, Map<string, number>>()
      for (const r of rows) {
        if (!r.data_referencia) continue
        if (!byDatePilar.has(r.data_referencia)) byDatePilar.set(r.data_referencia, new Map())
        const pm = byDatePilar.get(r.data_referencia)!
        pm.set(r.pilar_key, Math.max(pm.get(r.pilar_key) ?? 0, r.score_planilha))
      }

      const points: EvoPoint[] = Array.from(byDatePilar.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, pm]) => ({
          date: formatRefDate(date),
          score: Math.min(Array.from(pm.values()).reduce((s, v) => s + v, 0), 10),
        }))

      if (!cancelled) { setData(points); setLoading(false) }
    }
    fetch()
    return () => { cancelled = true }
  }, [idCarteira])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
        <p className="text-sm font-semibold text-[#111827] mb-4">Evolução do Score</p>
        <div className="flex items-center gap-2 text-sm text-[#9CA3AF]">
          <span className="animate-spin w-4 h-4 border-2 border-[#10B981] border-t-transparent rounded-full inline-block" />
          Carregando histórico...
        </div>
      </div>
    )
  }

  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
      <p className="text-sm font-semibold text-[#111827] mb-4">Evolução do Score</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              formatter={(v) => { const n = Number(v ?? 0); return [n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' pts', 'Score'] }}
              contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
            />
            <ReferenceLine y={4.5} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: 'meta mín.', position: 'insideTopRight', fontSize: 10, fill: '#F59E0B' }} />
            <Line
              type="monotone" dataKey="score" stroke="#10B981" strokeWidth={2.5}
              dot={{ fill: '#10B981', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#10B981' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function ConsultorClient({ resultados, dateDisplay, dataReferencia, pilaresConfig }: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const maxMap = useMemo(() =>
    Object.fromEntries(pilaresConfig.map(p => [p.pilar_key, p.pontos_max])),
    [pilaresConfig]
  )
  const metaMap = useMemo(() =>
    Object.fromEntries(pilaresConfig.map(p => [p.pilar_key, { meta: p.meta, unidade: p.unidade, tipo_comp: p.tipo_comp }])),
    [pilaresConfig]
  )

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

  const scoresByPilar = selectedId
    ? Object.fromEntries(resultados.filter(r => r.id_carteira === selectedId).map(r => [r.pilar_key, r]))
    : null

  const rawTotal = scoresByPilar
    ? GRUPOS.flatMap(g => g.pilares).reduce((s, p) => s + (scoresByPilar[p]?.score_planilha ?? 0), 0)
    : null
  const totalScore = rawTotal !== null ? Math.min(rawTotal, 10) : null

  const selectedNome = selectedId ? consultores.find(c => c.id === selectedId)?.nome : null
  const refLabel = formatRefDate(dataReferencia)

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
            {filtered.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-8">Nenhum resultado</p>
            ) : (
              filtered.map(c => (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
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

        {/* Detalhe do consultor */}
        <div className="flex-1 min-w-0">
          {!selectedId ? (
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
              {/* Header: score total + barra de progresso */}
              {totalScore !== null && (() => {
                const st = statusLabel(totalScore)
                const pct = Math.min((totalScore / 10) * 100, 100)
                return (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] px-6 py-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                      <div>
                        <p className="text-lg font-bold text-[#111827]">{selectedNome}</p>
                        <p className="text-sm text-[#6B7280]">Carteira {selectedId} · {dateDisplay}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#6B7280] mb-1">Seu Score</p>
                        <p className="text-3xl font-bold" style={{ color: st.text }}>
                          {totalScore.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          <span className="text-base font-medium text-[#9CA3AF]"> /10,0</span>
                        </p>
                      </div>
                    </div>
                    {/* Barra de progresso */}
                    <div className="w-full bg-[#F3F4F6] rounded-full h-2.5 mb-2">
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: st.text }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#9CA3AF]">0</span>
                      <span className="text-xs font-medium" style={{ color: st.text }}>
                        {st.label}
                      </span>
                      <span className="text-xs text-[#9CA3AF]">10,0</span>
                    </div>
                  </div>
                )
              })()}

              {/* Cards por grupo */}
              {GRUPOS.map(grupo => {
                const grupoMax = grupo.pilares.reduce((s, p) => s + (maxMap[p] ?? 0), 0)
                const grupoScore = grupo.pilares.reduce((s, p) => s + (scoresByPilar?.[p]?.score_planilha ?? 0), 0)
                const grupoColor = grupoScore >= grupoMax ? '#10B981' : grupoScore > 0 ? '#F59E0B' : '#EF4444'

                return (
                  <div key={grupo.key}>
                    {/* Cabeçalho do grupo */}
                    <div className="flex items-center gap-3 mb-3 px-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: grupoColor }} />
                      <p className="text-sm font-semibold text-[#111827] uppercase tracking-wide">{grupo.label}</p>
                      <span className="ml-auto text-sm font-bold" style={{ color: grupoColor }}>
                        {grupoScore.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        <span className="text-[#9CA3AF] font-normal"> / {grupoMax % 1 === 0 ? grupoMax : grupoMax.toFixed(1)} pts</span>
                      </span>
                    </div>

                    {/* Cards dos pilares do grupo */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {grupo.pilares.map(pilar => {
                        const color = PILAR_COLOR[pilar]
                        const r = scoresByPilar?.[pilar]
                        const pontos = maxMap[pilar] ?? 0
                        const metaCfg = metaMap[pilar]
                        const scoreStr = r
                          ? `${r.score_planilha.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${pontos % 1 === 0 ? pontos : pontos.toFixed(1)} pts`
                          : null
                        const cols = PILAR_COLS[pilar] ?? []
                        const metricas = r?.metricas ?? {}

                        const faltam = r && metaCfg
                          ? calcFaltam(pilar, r.valor_metrica, metaCfg.meta, metaCfg.tipo_comp)
                          : null
                        const hitMeta = faltam !== null && faltam <= 0
                        const valorFmt = r ? fmtValorMetrica(pilar, r.valor_metrica) : null

                        return (
                          <div key={pilar} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
                            {/* Cabeçalho do card */}
                            <div className="px-4 py-3 border-b border-[#F3F4F6]">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-bold" style={{ color }}>{PILAR_LABEL[pilar]}</p>
                                {scoreStr ? (
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: `${color}18`, color }}>
                                    {scoreStr}
                                  </span>
                                ) : (
                                  <span className="text-xs text-[#D1D5DB]">sem dados</span>
                                )}
                              </div>
                              {pilar === 'net_churn' && (
                                <p className="text-[10px] text-[#9CA3AF]">↓ quanto menor, melhor</p>
                              )}
                            </div>

                            {!r ? (
                              <div className="px-4 py-6 text-center text-sm text-[#9CA3AF]">Sem dados</div>
                            ) : (
                              <div className="px-4 py-3 space-y-3">
                                {/* Valor atual vs meta */}
                                {valorFmt && metaCfg && (
                                  <div className="bg-[#F9FAFB] rounded-xl p-3">
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                      <span className="text-2xl font-bold text-[#111827]">{valorFmt}</span>
                                      <span className="text-xs text-[#6B7280]">
                                        meta: <span className="font-semibold">{fmtMeta(metaCfg.meta, metaCfg.unidade)}</span>
                                      </span>
                                    </div>
                                    {hitMeta ? (
                                      <p className="text-[11px] text-[#10B981] font-medium mt-1">
                                        ✓ Meta atingida! {faltam === 0 ? '' : `+${Math.abs(faltam).toFixed(1)}${metaCfg.unidade === '%' ? '%' : ''} acima do mínimo`}
                                      </p>
                                    ) : (
                                      <p className="text-[11px] text-[#EF4444] font-medium mt-1">
                                        ✗ Faltam {faltam!.toFixed(1).replace('.', ',')}{metaCfg.unidade === '%' ? '%' : ''} para atingir a meta de {fmtMeta(metaCfg.meta, metaCfg.unidade)}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* Referência */}
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-[#9CA3AF]">Ref.:</span>
                                  <span className="text-[#6B7280] font-medium">{refLabel}</span>
                                </div>

                                {/* Linhas de métricas adicionais */}
                                {cols.map(label => {
                                  const found = findMetrica(metricas, label)
                                  if (!found) return null
                                  const [key, val] = found
                                  const isReverter = REVERTER_KEYS.has(norm(key))
                                  const numVal = Number(val)
                                  if (isReverter && (isNaN(numVal) || numVal <= 0)) return null
                                  const formatted = formatVal(key, val)
                                  if (formatted === '—') return null
                                  return (
                                    <div key={label} className="flex items-center justify-between border-t border-[#F9FAFB] pt-1.5">
                                      <span className="text-[11px] text-[#6B7280] leading-tight pr-2">{key}</span>
                                      <span className={`text-[11px] font-semibold whitespace-nowrap ${isReverter && numVal > 0 ? 'text-[#F59E0B]' : 'text-[#111827]'}`}>
                                        {formatted}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Evolução do score ao longo do tempo */}
              <EvolucaoSection idCarteira={selectedId} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
