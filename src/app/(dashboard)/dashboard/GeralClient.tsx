'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts'
import type { CarteiraResumo } from './page'

const PILARES = ['tpv', 'net_churn', 'acionaveis', 'aderencia', 'awareness', 'produtividade']
const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'NC', acionaveis: 'AC',
  aderencia: 'Agenda', awareness: 'AW', produtividade: 'Prod',
}
const PILAR_COLOR: Record<string, string> = {
  tpv: 'var(--color-pilar-tpv)', net_churn: 'var(--color-pilar-net-churn)', acionaveis: 'var(--color-pilar-acionaveis)',
  aderencia: 'var(--color-pilar-aderencia)', awareness: 'var(--color-pilar-awareness)', produtividade: 'var(--color-pilar-produtividade)',
}

// Situação da carteira (Planilha Ação Oportunidades), na ordem da barrinha.
const STATUS_ORDEM = ['ATIVO', 'REATIVADO', 'INATIVO', 'CHURN']
const STATUS_COR: Record<string, string> = {
  ATIVO: 'var(--color-good-fill)', REATIVADO: 'var(--color-primary)',
  INATIVO: 'var(--color-warn-fill)', CHURN: 'var(--color-bad-fill)',
}

function statusStyle(score: number) {
  if (score >= 4.5) return { bg: 'var(--color-good-bg)', text: 'var(--color-good)' }
  if (score >= 3.0) return { bg: 'var(--color-warn-bg)', text: 'var(--color-warn)' }
  return { bg: 'var(--color-bad-bg)', text: 'var(--color-bad)' }
}

function fmtMeta(meta: number, unidade: string): string {
  if (unidade === '%') {
    const digits = Math.abs(meta) % 1 === 0 ? 0 : 2
    return `${meta.toFixed(digits).replace('.', ',')}%`
  }
  if (Number.isInteger(meta)) return String(meta)
  return meta.toFixed(1).replace('.', ',')
}

const nBR = (n: number) => n.toLocaleString('pt-BR')
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
// "R$ 12,3 mi" — os totais passam de milhão e o card não é lugar de contar dígito.
const brlCompacto = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

interface ConsultorData {
  id: string | null
  nome: string
  total: number | null          // null = está na carteira mas sem planilha de score
  scores: Record<string, number>
  carteira: (CarteiraResumo & { nome: string }) | null
}

interface Props {
  ranking: ConsultorData[]
  dateDisplay: string | null
  dataCarteiraBR: string | null
  metaMap: Record<string, { meta: number; unidade: string }>
  modoConsultor: boolean
  meuNome: string
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div
      className="glass rounded-2xl border border-line p-4"
      style={color ? { borderLeft: `3px solid ${color}` } : undefined}
    >
      <p className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: color ?? 'var(--color-ink-muted)' }}>
        {label}
      </p>
      <p className="text-3xl font-bold" style={{ color: color ?? 'var(--color-ink)' }}>{value}</p>
      {sub && <p className="text-xs text-ink-muted mt-1">{sub}</p>}
    </div>
  )
}

/** Barrinha de situação da carteira (mesma linguagem visual dos quartis em Acionáveis). */
function BarraSituacao({ status }: { status: Record<string, number> }) {
  const total = Object.values(status).reduce((s, n) => s + n, 0)
  if (total === 0) return <span className="text-ink-faint">—</span>
  const titulo = STATUS_ORDEM.filter(s => status[s]).map(s => `${s}: ${nBR(status[s])}`).join(' · ')
  return (
    <div title={titulo}>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-card-2 min-w-[72px]">
        {STATUS_ORDEM.map(s => {
          const n = status[s] ?? 0
          return n ? <div key={s} style={{ width: `${(n / total) * 100}%`, background: STATUS_COR[s] }} /> : null
        })}
      </div>
      <p className="text-[10px] text-ink-faint mt-1 whitespace-nowrap">
        <span className="text-good">{nBR(status.ATIVO ?? 0)} atv</span>
        {(status.CHURN ?? 0) > 0 && <> · <span className="text-bad">{nBR(status.CHURN)} churn</span></>}
      </p>
    </div>
  )
}

export default function GeralClient({ ranking, dateDisplay, dataCarteiraBR, metaMap, modoConsultor, meuNome }: Props) {
  const stats = useMemo(() => {
    const comScore = ranking.filter((c): c is ConsultorData & { total: number } => c.total !== null)
    const acima = comScore.filter(c => c.total >= 4.5).length
    const naLinha = comScore.filter(c => c.total >= 3.0 && c.total < 4.5).length
    const critico = comScore.filter(c => c.total < 3.0).length
    const media = comScore.length > 0 ? comScore.reduce((s, c) => s + c.total, 0) / comScore.length : 0
    // Totais de carteira — soma o que veio (no consultor, é só a dele).
    const clientes = ranking.reduce((s, c) => s + (c.carteira?.clientes ?? 0), 0)
    const pendentes = ranking.reduce((s, c) => s + (c.carteira?.pendentes ?? 0), 0)
    const tpv = ranking.reduce((s, c) => s + (c.carteira?.tpv ?? 0), 0)
    return { acima, naLinha, critico, media, nComScore: comScore.length, clientes, pendentes, tpv }
  }, [ranking])

  const chartData = [
    { name: 'Acima da meta', count: stats.acima, color: 'var(--color-good-fill)' },
    { name: 'Na linha', count: stats.naLinha, color: 'var(--color-warn-fill)' },
    { name: 'Crítico', count: stats.critico, color: 'var(--color-bad-fill)' },
  ]

  const meuScore = modoConsultor ? ranking.find(c => c.total !== null)?.total ?? null : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">{modoConsultor ? 'Minha Visão Geral' : 'Visão Geral'}</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {modoConsultor
            ? meuNome
            : `${ranking.length} consultores${dateDisplay ? ` · ${dateDisplay}` : ''}`}
          {dataCarteiraBR ? ` · carteira de ${dataCarteiraBR}` : ''}
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {modoConsultor ? (
          <SummaryCard
            label="Meu score"
            value={meuScore !== null ? meuScore.toFixed(1).replace('.', ',') + ' pts' : '—'}
            sub="de 10,0 pts"
            color={meuScore !== null ? statusStyle(meuScore).text : undefined}
          />
        ) : (
          <SummaryCard label="Total equipe" value={String(ranking.length)} />
        )}
        <SummaryCard
          label="Clientes na carteira"
          value={nBR(stats.clientes)}
          sub={dataCarteiraBR ? `Planilha Ação Oportunidades de ${dataCarteiraBR}` : undefined}
        />
        <SummaryCard
          label="TPV da carteira"
          value={brlCompacto(stats.tpv)}
          sub="faturamento do mês"
          color="var(--color-good)"
        />
        <SummaryCard
          label="Pendentes de identificação"
          value={nBR(stats.pendentes)}
          sub={stats.clientes > 0 ? `${Math.round(stats.pendentes / stats.clientes * 100)}% da carteira` : undefined}
          color={stats.pendentes > 0 ? 'var(--color-warn)' : undefined}
        />
        {!modoConsultor && (
          <>
            <SummaryCard
              label="Acima da meta"
              value={String(stats.acima)}
              sub={`${stats.nComScore > 0 ? Math.round(stats.acima / stats.nComScore * 100) : 0}% da equipe`}
              color="var(--color-good)"
            />
            <SummaryCard
              label="Crítico"
              value={String(stats.critico)}
              sub={`${stats.nComScore > 0 ? Math.round(stats.critico / stats.nComScore * 100) : 0}% da equipe`}
              color="var(--color-bad)"
            />
            <SummaryCard
              label="Média da equipe"
              value={stats.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' pts'}
              sub="de 10,0 pts"
            />
          </>
        )}
      </div>

      {/* Gráfico de distribuição — só faz sentido com equipe */}
      {!modoConsultor && (
        <div className="glass rounded-2xl border border-line p-5 mb-5">
          <p className="text-sm font-semibold text-ink mb-4">Distribuição da equipe</p>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 4 }}>
                <XAxis type="number" hide domain={[0, Math.max(stats.nComScore, 1)]} />
                <YAxis
                  type="category" dataKey="name" width={120}
                  tick={{ fontSize: 12, fill: 'var(--color-ink-muted)' }} axisLine={false} tickLine={false}
                />
                <Tooltip
                  formatter={(v) => { const n = Number(v ?? 0); return [`${n} consultor${n !== 1 ? 'es' : ''}`, ''] }}
                  // backgroundColor é obrigatório: sem ele o Recharts usa #fff e o texto
                  // claro do body some. itemStyle idem — o default é #000 porque a cor
                  // das barras vive nas <Cell>, não no <Bar>.
                  contentStyle={{ backgroundColor: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-line)', fontSize: 12 }}
                  labelStyle={{ color: 'var(--color-ink)' }}
                  itemStyle={{ color: 'var(--color-ink-dim)' }}
                  cursor={{ fill: 'var(--color-card-2)' }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={22}
                  label={{ position: 'right', fontSize: 12, fill: 'var(--color-ink-muted)', fontWeight: 600 }}
                >
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabela de ranking */}
      {ranking.length === 0 ? (
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="text-ink-muted">Nenhum resultado na data mais recente.</p>
        </div>
      ) : (
        // overflow-x-auto + min-w: no celular a tabela rola dentro do card em
        // vez de ser cortada, e as colunas não se espremem até virar sopa.
        <div className="glass rounded-2xl border border-line overflow-x-auto">
          <table className="w-full min-w-[1020px] text-sm">
            <thead>
              <tr className="border-b border-line bg-card-2">
                <th className="text-left px-4 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider w-8">#</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Consultor</th>
                <th className="text-center px-3 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Score</th>
                <th className="text-right px-3 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Clientes</th>
                <th className="text-right px-3 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">TPV carteira</th>
                <th className="text-left px-3 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Situação</th>
                {PILARES.map(p => {
                  const mc = metaMap[p]
                  return (
                    <th key={p} className="text-center px-2 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: PILAR_COLOR[p] }}>
                      {PILAR_LABEL[p]}
                      {mc && (
                        <div className="text-[10px] font-normal text-ink-faint normal-case tracking-normal mt-0.5">
                          meta {fmtMeta(mc.meta, mc.unidade)}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ranking.map((c, i) => {
                const st = c.total !== null ? statusStyle(c.total) : null
                return (
                  <tr key={c.id ?? `carteira-${c.nome}`} className="hover:bg-card-2 transition-colors">
                    <td className="px-4 py-3 text-ink-muted font-medium text-xs">{c.total !== null ? i + 1 : '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink text-sm leading-tight">{c.nome}</p>
                      <p className="text-[11px] text-ink-muted">{c.id ? `Cart. ${c.id}` : 'sem planilha de score'}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {c.total !== null && st ? (
                        <span className="inline-block px-2.5 py-1 rounded-xl text-sm font-bold" style={{ background: st.bg, color: st.text }}>
                          {c.total.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {c.carteira ? (
                        <>
                          <p className="font-semibold text-ink tabular-nums">{nBR(c.carteira.clientes)}</p>
                          {c.carteira.pendentes > 0 && (
                            <p className="text-[10px] text-warn whitespace-nowrap">{nBR(c.carteira.pendentes)} a identificar</p>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink">
                      {c.carteira && c.carteira.tpv > 0 ? brl(c.carteira.tpv) : <span className="text-ink-faint">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {c.carteira ? <BarraSituacao status={c.carteira.status} /> : <span className="text-ink-faint">—</span>}
                    </td>
                    {PILARES.map(p => {
                      const score = c.scores[p]
                      return (
                        <td key={p} className="px-2 py-3 text-center">
                          {score !== undefined ? (
                            <p className="text-sm font-semibold text-ink">{score.toFixed(1).replace('.', ',')}</p>
                          ) : (
                            <span className="text-ink-faint">—</span>
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
