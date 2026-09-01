import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import { SCORE_GERAL_FAIXAS_PADRAO, type ScoreGeralFaixas } from '@/lib/types'

const PILARES = ['tpv', 'net_churn', 'acionaveis', 'aderencia', 'awareness', 'produtividade']
const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'Net Churn', acionaveis: 'Acionáveis',
  aderencia: 'Aderência', awareness: 'Awareness', produtividade: 'Produtividade',
}
const PILAR_COLOR: Record<string, string> = {
  tpv: 'var(--color-pilar-tpv)', net_churn: 'var(--color-pilar-net-churn)', acionaveis: 'var(--color-pilar-acionaveis)',
  aderencia: 'var(--color-pilar-aderencia)', awareness: 'var(--color-pilar-awareness)', produtividade: 'var(--color-pilar-produtividade)',
}

interface Consultor {
  id: string
  nome: string
  total: number
  scores: Record<string, number>
}

const fmtPts = (n: number) => n.toFixed(1).replace('.', ',')

function AlertCard({ c, faixas }: { c: Consultor; faixas: ScoreGeralFaixas }) {
  const isCritico = c.total < faixas.limite_critico
  const color = isCritico ? 'var(--color-bad)' : 'var(--color-warn)'
  const bg = isCritico ? 'var(--color-bad-bg)' : 'var(--color-warn-bg)'
  const label = isCritico ? 'CRÍTICO' : 'ALERTA'

  return (
    <div className="glass rounded-2xl border border-line p-5" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-ink text-sm">{c.nome}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: bg, color }}>
              {label}
            </span>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">
            Carteira {c.id} · Score abaixo de {fmtPts(isCritico ? faixas.limite_critico : faixas.meta_objetivo)} pts
          </p>
        </div>
        <span className="text-2xl font-bold" style={{ color }}>
          {c.total.toFixed(1)}
        </span>
      </div>

      {/* Score de cada pilar, como veio da planilha. Um pilar zerado é destacado
          porque não somou nada — mas "zero" não quer dizer "abaixo da meta": a
          comparação com a meta vive no card do consultor, não aqui. */}
      <div className="flex flex-wrap gap-2 mt-4">
        {PILARES.map(p => {
          const score = c.scores[p]
          if (score === undefined) return null
          const pilarColor = PILAR_COLOR[p]
          const zerado = score === 0
          return (
            <div
              key={p}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border"
              style={{
                background: zerado ? 'var(--color-bad-bg)' : `${pilarColor}12`,
                color: zerado ? 'var(--color-bad)' : pilarColor,
                borderColor: zerado ? 'var(--color-bad)' : `${pilarColor}30`,
              }}
            >
              <span className="font-medium">{PILAR_LABEL[p]}</span>
              <span className="font-bold">{score.toFixed(1).replace('.', ',')}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default async function AlertasPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role === 'consultor') redirect('/dashboard/meu-score')

  const supabase = await createClient()

  const { data: uploads } = await supabase
    .from('score_uploads')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1)

  const latestDate = uploads?.[0]?.data_referencia ?? null

  if (!latestDate) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink">Alertas</h1>
          <p className="text-sm text-ink-muted mt-0.5">Performance abaixo do objetivo</p>
        </div>
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Nenhum dado carregado ainda</p>
        </div>
      </div>
    )
  }

  // `data_referencia` já vem gravada em cada linha de resultado (mesmo valor
  // do upload que a gerou) — filtrar direto por ela poupa a ida extra de buscar
  // os uploadIds do dia só para usar em `upload_id in (...)`.
  const [{ data: resultados }, { data: faixasScore }] = await Promise.all([
    supabase
      .from('score_consultor_resultados')
      .select('id_carteira, consultor_nome, pilar_key, score_planilha')
      .eq('data_referencia', latestDate),
    supabase.from('score_geral_faixas').select('limite_critico, meta_objetivo').maybeSingle(),
  ])
  const faixas: ScoreGeralFaixas = faixasScore ?? SCORE_GERAL_FAIXAS_PADRAO

  const map = new Map<string, { nome: string; scores: Record<string, number>; total: number }>()
  for (const r of resultados ?? []) {
    if (!map.has(r.id_carteira)) map.set(r.id_carteira, { nome: r.consultor_nome, scores: {}, total: 0 })
    const c = map.get(r.id_carteira)!
    c.scores[r.pilar_key] = r.score_planilha
    c.total += r.score_planilha
  }

  const todos: Consultor[] = Array.from(map.entries())
    .map(([id, c]) => ({ id, ...c, total: Math.min(c.total, 10) }))

  const criticos = todos.filter(c => c.total < faixas.limite_critico).sort((a, b) => a.total - b.total)
  const naLinha = todos.filter(c => c.total >= faixas.limite_critico && c.total < faixas.meta_objetivo).sort((a, b) => a.total - b.total)

  const dateDisplay = new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Alertas</h1>
        <p className="text-sm text-ink-muted mt-0.5">Performance abaixo do objetivo · {dateDisplay}</p>
      </div>

      {criticos.length === 0 && naLinha.length === 0 ? (
        <div className="glass rounded-2xl border border-line p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-good-bg flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="font-semibold text-good">Nenhum alerta!</p>
          <p className="text-sm text-ink-muted mt-1">Toda a equipe está acima do objetivo.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {criticos.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-bad" />
                <h2 className="text-sm font-semibold text-ink">
                  Crítico
                  <span className="ml-1.5 text-ink-muted font-normal">— score abaixo de {fmtPts(faixas.limite_critico)} pts</span>
                </h2>
                <span className="ml-auto text-xs font-bold text-bad bg-bad-bg px-2.5 py-0.5 rounded-full">
                  {criticos.length} consultor{criticos.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <div className="space-y-3">
                {criticos.map(c => <AlertCard key={c.id} c={c} faixas={faixas} />)}
              </div>
            </section>
          )}

          {naLinha.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-warn" />
                <h2 className="text-sm font-semibold text-ink">
                  Alerta
                  <span className="ml-1.5 text-ink-muted font-normal">— score entre {fmtPts(faixas.limite_critico)} e {fmtPts(faixas.meta_objetivo)} pts</span>
                </h2>
                <span className="ml-auto text-xs font-bold text-warn bg-warn-bg px-2.5 py-0.5 rounded-full">
                  {naLinha.length} consultor{naLinha.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <div className="space-y-3">
                {naLinha.map(c => <AlertCard key={c.id} c={c} faixas={faixas} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
