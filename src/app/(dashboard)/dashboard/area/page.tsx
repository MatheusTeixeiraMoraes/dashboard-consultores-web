import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import { PILARES, PILAR_KEYS, fmtValor, fmtMeta } from '@/lib/pilares'

/**
 * O aproveitamento (score ÷ pontos_max) é o que dá pra comparar entre pilares:
 * o score cru não serve, porque cada pilar vale um teto diferente (Awareness vale
 * 1,5 pts; Net Churn vale 3). Comparar 1,5 com o corte de 4,5 do score TOTAL
 * pintaria Awareness de vermelho mesmo com nota cheia.
 */
function statusStyle(score: number, pontosMax: number) {
  const aproveitamento = pontosMax > 0 ? score / pontosMax : 0
  if (aproveitamento >= 0.9) return { bg: 'var(--color-good-bg)', text: 'var(--color-good)' }
  if (aproveitamento >= 0.6) return { bg: 'var(--color-warn-bg)', text: 'var(--color-warn)' }
  return { bg: 'var(--color-bad-bg)', text: 'var(--color-bad)' }
}

export default async function AreaPage() {
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
          <h1 className="text-xl font-bold text-ink">Por Área</h1>
          <p className="text-sm text-ink-muted mt-0.5">Ranking de cada pilar separadamente</p>
        </div>
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Nenhum dado carregado ainda</p>
          <p className="text-sm text-ink-muted mt-1">Vá em <strong className="text-good">Upar Planilha</strong> para começar.</p>
        </div>
      </div>
    )
  }

  const [{ data: uploadIds }, { data: pilaresConfig }] = await Promise.all([
    supabase.from('score_uploads').select('id').eq('data_referencia', latestDate),
    supabase.from('pillar_config').select('pilar_key, meta, unidade, tipo_comp, pontos_max'),
  ])

  const idList = (uploadIds ?? []).map(u => u.id)

  const { data: resultados } = await supabase
    .from('score_consultor_resultados')
    .select('id_carteira, consultor_nome, pilar_key, score_planilha, valor_metrica')
    .in('upload_id', idList.length > 0 ? idList : ['none'])

  const cfgPorPilar = Object.fromEntries((pilaresConfig ?? []).map(p => [p.pilar_key, p]))

  const porPilar: Record<string, Array<{
    id: string; nome: string; score: number; valorMetrica: number | null
  }>> = {}

  for (const r of resultados ?? []) {
    if (!porPilar[r.pilar_key]) porPilar[r.pilar_key] = []
    porPilar[r.pilar_key].push({
      id: r.id_carteira,
      nome: r.consultor_nome,
      score: r.score_planilha,
      valorMetrica: r.valor_metrica ?? null,
    })
  }
  for (const key of Object.keys(porPilar)) {
    porPilar[key].sort((a, b) => b.score - a.score)
  }

  const dateDisplay = new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Por Área</h1>
        <p className="text-sm text-ink-muted mt-0.5">Ranking de cada pilar · {dateDisplay}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {PILAR_KEYS.map(pilar => {
          const spec = PILARES[pilar]
          const { color } = spec
          const consultores = porPilar[pilar] ?? []
          const cfg = cfgPorPilar[pilar]

          // Rótulo e tipo da métrica principal vêm do contrato — nada hardcoded.
          const valorSpec = spec.cols.find(c => c.col === spec.valorCol)

          const media = consultores.length > 0
            ? consultores.reduce((s, c) => s + c.score, 0) / consultores.length
            : null

          return (
            <div key={pilar} className="glass rounded-2xl border border-line overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
              <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-line">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink text-sm">{spec.label}</p>
                    {spec.nota && <p className="text-[10px] text-ink-faint">{spec.nota}</p>}
                    {cfg && (
                      <p className="text-[11px] text-ink-faint mt-0.5">
                        Meta: <span className="font-semibold text-ink-muted">{fmtMeta(cfg.meta, cfg.unidade)}</span>
                      </p>
                    )}
                  </div>
                </div>
                {media !== null && cfg && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-ink-muted">Média score</p>
                    <p className="text-sm font-bold" style={{ color }}>
                      {media.toFixed(2).replace('.', ',')}
                      <span className="text-ink-faint font-normal"> / {cfg.pontos_max}</span>
                    </p>
                  </div>
                )}
              </div>

              {consultores.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-ink-faint">Sem dados para este pilar</div>
              ) : (
                <div className="divide-y divide-card-2">
                  {consultores.map((c, i) => {
                    const st = statusStyle(c.score, cfg?.pontos_max ?? 0)
                    return (
                      <div key={c.id} className="px-5 py-2.5 flex items-center gap-3">
                        <span className="text-xs font-medium text-ink-faint w-5 text-center flex-shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink truncate leading-tight">{c.nome}</p>
                          {c.valorMetrica != null && valorSpec && (
                            <p className="text-[11px] text-ink-muted mt-0.5">
                              {valorSpec.label}:{' '}
                              <span className="font-semibold text-ink-dim">
                                {fmtValor(valorSpec.type, c.valorMetrica)}
                              </span>
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg flex-shrink-0" style={{ background: st.bg, color: st.text }}>
                          {c.score.toFixed(1).replace('.', ',')}
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
}
