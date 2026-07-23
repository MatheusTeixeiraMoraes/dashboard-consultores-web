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
function BarraSituacao({ status, largura = 'min-w-[72px]' }: { status: Record<string, number>; largura?: string }) {
  const total = Object.values(status).reduce((s, n) => s + n, 0)
  if (total === 0) return <span className="text-ink-faint">—</span>
  const titulo = STATUS_ORDEM.filter(s => status[s]).map(s => `${s}: ${nBR(status[s])}`).join(' · ')
  return (
    <div title={titulo}>
      <div className={`flex h-2 rounded-full overflow-hidden bg-card-2 ${largura}`}>
        {STATUS_ORDEM.map(s => {
          const n = status[s] ?? 0
          return n ? <div key={s} style={{ width: `${(n / total) * 100}%`, background: STATUS_COR[s] }} /> : null
        })}
      </div>
      <p className="text-[11px] text-ink-faint mt-1 whitespace-nowrap">
        <span className="text-good font-medium">{nBR(status.ATIVO ?? 0)} ativos</span>
        {(status.CHURN ?? 0) > 0 && <> · <span className="text-bad font-medium">{nBR(status.CHURN)} churn</span></>}
      </p>
    </div>
  )
}

/** Bloco de número com rótulo — o vocabulário dos cards do ranking. */
function Stat({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[120px]">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-1">{rotulo}</p>
      {children}
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

      {/* Ranking em cards — números com respiro, sem cara de planilha */}
      {ranking.length === 0 ? (
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="text-ink-muted">Nenhum resultado na data mais recente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ranking.map((c, i) => {
            const st = c.total !== null ? statusStyle(c.total) : null
            const pos = c.total !== null ? i + 1 : null
            return (
              <div key={c.id ?? `carteira-${c.nome}`} className="glass rounded-2xl border border-line p-5 hover:border-primary/40 transition-colors">
                <div className="flex items-center gap-x-6 gap-y-4 flex-wrap">
                  {/* posição — só o topo do pódio ganha destaque */}
                  <span className={`w-9 h-9 rounded-full grid place-items-center text-sm font-bold flex-shrink-0 ${
                    pos === 1 ? 'bg-primary text-white shadow-[0_2px_10px_rgba(79,95,224,0.4)]'
                    : pos !== null && pos <= 3 ? 'bg-primary/15 text-primary-lt border border-primary/30'
                    : 'bg-card-2 text-ink-muted border border-line'
                  }`}>
                    {pos ?? '—'}
                  </span>

                  {/* nome */}
                  <div className="min-w-[180px] flex-1">
                    <p className="font-semibold text-ink leading-tight">{c.nome}</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">{c.id ? `Carteira ${c.id}` : 'sem planilha de score'}</p>
                  </div>

                  {/* números da carteira */}
                  <Stat rotulo="Clientes">
                    {c.carteira ? (
                      <>
                        <p className="text-xl font-bold text-ink tabular-nums leading-none">{nBR(c.carteira.clientes)}</p>
                        {c.carteira.pendentes > 0
                          ? <p className="text-[11px] text-warn mt-1 whitespace-nowrap">{nBR(c.carteira.pendentes)} a identificar</p>
                          : <p className="text-[11px] text-ink-faint mt-1">todos identificados</p>}
                      </>
                    ) : <p className="text-ink-faint">—</p>}
                  </Stat>

                  <Stat rotulo="TPV do mês">
                    {c.carteira && c.carteira.tpv > 0 ? (
                      <p className="text-xl font-bold text-good tabular-nums leading-none" title={brl(c.carteira.tpv)}>
                        {brlCompacto(c.carteira.tpv)}
                      </p>
                    ) : <p className="text-ink-faint">—</p>}
                  </Stat>

                  <Stat rotulo="Situação">
                    {c.carteira ? <BarraSituacao status={c.carteira.status} largura="w-36" /> : <p className="text-ink-faint">—</p>}
                  </Stat>

                  {/* score — o veredito do card, grande e colorido */}
                  <div className="text-center pl-2 ml-auto">
                    {c.total !== null && st ? (
                      <>
                        <span className="inline-block px-3.5 py-2 rounded-2xl text-2xl font-bold leading-none" style={{ background: st.bg, color: st.text }}>
                          {c.total.toFixed(1).replace('.', ',')}
                        </span>
                        <p className="text-[10px] text-ink-faint mt-1">de 10 pts</p>
                      </>
                    ) : (
                      <span className="text-ink-faint text-xl">—</span>
                    )}
                  </div>
                </div>

                {/* pilares como chips — meta no tooltip */}
                {c.total !== null && (
                  <div className="flex items-center gap-2 flex-wrap mt-4 pt-3.5 border-t border-line">
                    {PILARES.map(p => {
                      const score = c.scores[p]
                      const mc = metaMap[p]
                      return (
                        <span key={p}
                          title={mc ? `${PILAR_LABEL[p]} · meta ${fmtMeta(mc.meta, mc.unidade)}` : PILAR_LABEL[p]}
                          className="inline-flex items-center gap-1.5 text-xs bg-card-2 border border-line rounded-lg px-2.5 py-1.5">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PILAR_COLOR[p] }} />
                          <span className="text-ink-muted">{PILAR_LABEL[p]}</span>
                          <b className="text-ink">{score !== undefined ? score.toFixed(1).replace('.', ',') : '—'}</b>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
