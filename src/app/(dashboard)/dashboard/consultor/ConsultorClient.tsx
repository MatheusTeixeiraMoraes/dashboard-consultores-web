'use client'

import { useState, useMemo } from 'react'

const PILARES = ['tpv', 'net_churn', 'acionaveis', 'aderencia', 'awareness', 'produtividade']

const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'Net Churn', acionaveis: 'Acionáveis Comerciais',
  aderencia: 'Aderência a Agenda', awareness: 'Awareness', produtividade: 'Produtividade',
}

const PILAR_COLOR: Record<string, string> = {
  tpv: '#60a5fa', net_churn: '#c084fc', acionaveis: '#fb923c',
  aderencia: '#2dd4bf', awareness: '#f472b6', produtividade: '#818cf8',
}

// Ordem preferida de exibição por pilar — nomes exatos das colunas da planilha (norm matching)
const PILAR_COLS: Record<string, string[]> = {
  tpv: [
    'PV Total mês atual', 'PV Total mês passado',
    'TPV médio mês atual', 'TPV médio mês passado',
    'Variação de TPV versus mês passado', '% Objetivo Maio', '% Total a Realizar',
  ],
  net_churn: [
    'Sellers ativos (atual)', 'Sellers ativos (passado)',
    'Sellers em churn', 'Sellers reativos',
    '%Net churn', '% Objetivo Maio', 'Objetivo Final', 'Total a Reverter',
  ],
  acionaveis: [
    'Total Acionáveis (Tarefas)', 'Total Acionáveis (Revertido)',
    'Total Acionáveis %Tarefa-Revertido', '% Objetivo Maio', 'Objetivo Final', 'Total a Reverter',
  ],
  aderencia: [
    'Sellers agendados', 'Sellers aderentes à agenda', 'Sellers visitados',
    '%Aderência à agenda', '% Objetivo', 'Total a Reverter',
  ],
  awareness: [
    'Sellers visitados', 'Sellers que responderam pesquisa',
    '%Awareness', '% Objetivo', 'Total a Reverter',
  ],
  produtividade: [
    'Visitas', 'Visitas efetivas', 'Sellers visitados',
    'Prod média por dia útil', 'Produtividade média (objetivo)', 'Total Média a Realizar',
  ],
}

// Colunas que representam "total a reverter" (mostrar em âmbar apenas se > 0)
const REVERTER_KEYS = new Set([
  'total a reverter', '% total a realizar', 'total media a realizar', 'total medio a realizar',
])

// Colunas de currency (R$)
const CURRENCY_KEYS = /tpv total|tpv medio|tpv médio/i

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function formatVal(key: string, val: unknown): string {
  if (val === '' || val == null) return '—'
  const n = Number(val)
  if (isNaN(n)) return String(val)

  // Currency: colunas de TPV/PV Total
  if (CURRENCY_KEYS.test(key)) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
  }
  // Percentual: apenas se o nome da coluna tem "%" literal OU é coluna de variação
  const isPercent = key.includes('%') || /variacao|variação/i.test(norm(key))
  if (isPercent) {
    if (Math.abs(n) > 0 && Math.abs(n) <= 5) {
      return `${n > 0 ? '+' : ''}${(n * 100).toFixed(2).replace('.', ',')}%`
    }
    return `${n >= 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')}%`
  }
  // Número inteiro
  if (Number.isInteger(n)) return n.toLocaleString('pt-BR')
  // Decimal genérico
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m) - 1]}/${y}`
}

function statusLabel(score: number) {
  if (score >= 4.5) return { label: 'Acima da meta', bg: '#F0FDF4', text: '#10B981' }
  if (score >= 3.0) return { label: 'Na linha', bg: '#FFFBEB', text: '#F59E0B' }
  return { label: 'Crítico', bg: '#FEF2F2', text: '#EF4444' }
}

interface Resultado {
  id_carteira: string
  consultor_nome: string
  pilar_key: string
  score_planilha: number
  total_a_reverter: number | null
  metricas: Record<string, unknown> | null
}

interface PontosMax {
  pilar_key: string
  pontos_max: number
}

interface Props {
  resultados: Resultado[]
  dateDisplay: string
  dataReferencia: string
  pontosMax: PontosMax[]
}

export default function ConsultorClient({ resultados, dateDisplay, dataReferencia, pontosMax }: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const maxMap = useMemo(() =>
    Object.fromEntries(pontosMax.map(p => [p.pilar_key, p.pontos_max])),
    [pontosMax]
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

  const totalScore = scoresByPilar
    ? Math.min(PILARES.reduce((s, p) => s + (scoresByPilar[p]?.score_planilha ?? 0), 0), 10)
    : null

  const selectedNome = selectedId ? consultores.find(c => c.id === selectedId)?.nome : null
  const refLabel = formatRefDate(dataReferencia)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Consultor</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Performance individual · {dateDisplay}</p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Lista */}
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

        {/* Detalhe */}
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
              {/* Header total */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-lg font-bold text-[#111827]">{selectedNome}</p>
                  <p className="text-sm text-[#6B7280]">Carteira {selectedId} · {dateDisplay}</p>
                </div>
                {totalScore !== null && (() => {
                  const st = statusLabel(totalScore)
                  return (
                    <div className="text-right">
                      <p className="text-xs text-[#6B7280] mb-1">Score Total</p>
                      <span className="text-2xl font-bold px-4 py-1.5 rounded-xl inline-block" style={{ background: st.bg, color: st.text }}>
                        {totalScore.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <p className="text-xs mt-1 font-medium" style={{ color: st.text }}>{st.label}</p>
                    </div>
                  )
                })()}
              </div>

              {/* Cards por pilar */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {PILARES.map(pilar => {
                  const color = PILAR_COLOR[pilar]
                  const r = scoresByPilar?.[pilar]
                  const pontos = maxMap[pilar] ?? 0
                  const scoreStr = r
                    ? `${r.score_planilha.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${pontos % 1 === 0 ? pontos : pontos.toFixed(1)}`
                    : null
                  const cols = PILAR_COLS[pilar] ?? []
                  const metricas = r?.metricas ?? {}

                  return (
                    <div key={pilar} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
                      {/* Cabeçalho do card */}
                      <div className="px-4 py-3 flex items-center justify-between border-b border-[#F3F4F6]">
                        <div>
                          <p className="text-sm font-bold" style={{ color }}>{PILAR_LABEL[pilar]}</p>
                          {pilar === 'net_churn' && (
                            <p className="text-[10px] text-[#9CA3AF]">↓ quanto menor, melhor</p>
                          )}
                        </div>
                        {scoreStr ? (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: `${color}18`, color }}>
                            {scoreStr}
                          </span>
                        ) : (
                          <span className="text-xs text-[#D1D5DB]">sem dados</span>
                        )}
                      </div>

                      {!r ? (
                        <div className="px-4 py-6 text-center text-sm text-[#9CA3AF]">Sem dados para este pilar</div>
                      ) : (
                        <div className="px-4 py-1">
                          {/* Ref */}
                          <div className="flex items-center justify-between py-2 border-b border-[#F9FAFB]">
                            <span className="text-xs text-[#9CA3AF]">Ref.:</span>
                            <span className="text-xs font-medium text-[#6B7280]">{refLabel}</span>
                          </div>

                          {/* Linhas de métricas */}
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
                              <div key={label} className="flex items-center justify-between py-1.5 border-b border-[#F9FAFB] last:border-0">
                                <span className="text-xs text-[#6B7280] leading-tight pr-2">{key}</span>
                                <span className={`text-xs font-semibold whitespace-nowrap ${isReverter && numVal > 0 ? 'text-[#F59E0B]' : 'text-[#111827]'}`}>
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
          )}
        </div>
      </div>
    </div>
  )
}
