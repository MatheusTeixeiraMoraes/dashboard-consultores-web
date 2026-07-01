import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'

const PILARES = ['tpv', 'net_churn', 'acionaveis', 'aderencia', 'awareness', 'produtividade']
const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'Net Churn', acionaveis: 'Acionáveis',
  aderencia: 'Aderência', awareness: 'Awareness', produtividade: 'Produtividade',
}
const PILAR_COLOR: Record<string, string> = {
  tpv: '#60a5fa', net_churn: '#c084fc', acionaveis: '#fb923c',
  aderencia: '#2dd4bf', awareness: '#f472b6', produtividade: '#818cf8',
}

function statusStyle(score: number) {
  if (score >= 4.5) return { bg: '#F0FDF4', text: '#10B981' }
  if (score >= 3.0) return { bg: '#FFFBEB', text: '#F59E0B' }
  return { bg: '#FEF2F2', text: '#EF4444' }
}

function fmtMeta(meta: number, unidade: string): string {
  if (unidade === '%') {
    const digits = Math.abs(meta) % 1 === 0 ? 0 : 2
    return `${meta.toFixed(digits).replace('.', ',')}%`
  }
  if (Number.isInteger(meta)) return String(meta)
  return meta.toFixed(1).replace('.', ',')
}

export default async function AreaPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

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
          <h1 className="text-xl font-bold text-[#111827]">Por Área</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Ranking de cada pilar separadamente</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <p className="font-semibold text-[#111827]">Nenhum dado carregado ainda</p>
          <p className="text-sm text-[#6B7280] mt-1">Vá em <strong className="text-[#10B981]">Upar Planilha</strong> para começar.</p>
        </div>
      </div>
    )
  }

  const [{ data: uploadIds }, { data: pilaresConfig }] = await Promise.all([
    supabase.from('score_uploads').select('id, pilar_key').eq('data_referencia', latestDate),
    supabase.from('pillar_config').select('pilar_key, meta, unidade, tipo_comp, pontos_max'),
  ])

  const idList = (uploadIds ?? []).map(u => u.id)

  const { data: resultados } = await supabase
    .from('score_consultor_resultados')
    .select('id_carteira, consultor_nome, pilar_key, score_planilha, total_a_reverter')
    .in('upload_id', idList.length > 0 ? idList : ['none'])

  const metaMap = Object.fromEntries(
    (pilaresConfig ?? []).map(p => [p.pilar_key, { meta: p.meta, unidade: p.unidade, tipo_comp: p.tipo_comp, pontos_max: p.pontos_max }])
  )

  const byPilar: Record<string, Array<{ id: string; nome: string; score: number; reverter: number | null }>> = {}
  for (const r of resultados ?? []) {
    if (!byPilar[r.pilar_key]) byPilar[r.pilar_key] = []
    byPilar[r.pilar_key].push({ id: r.id_carteira, nome: r.consultor_nome, score: r.score_planilha, reverter: r.total_a_reverter })
  }
  for (const key of Object.keys(byPilar)) {
    byPilar[key].sort((a, b) => b.score - a.score)
  }

  const dateDisplay = new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Por Área</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Ranking de cada pilar · {dateDisplay}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {PILARES.map(pilar => {
          const color = PILAR_COLOR[pilar]
          const consultores = byPilar[pilar] ?? []
          const avg = consultores.length > 0
            ? consultores.reduce((s, c) => s + c.score, 0) / consultores.length
            : null
          const mc = metaMap[pilar]

          return (
            <div key={pilar} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
              <div className="px-5 py-4 flex items-center justify-between border-b border-[#F3F4F6]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  </div>
                  <div>
                    <p className="font-semibold text-[#111827] text-sm">{PILAR_LABEL[pilar]}</p>
                    {pilar === 'net_churn' && (
                      <p className="text-[10px] text-[#9CA3AF]">↓ quanto menor, melhor</p>
                    )}
                    {mc && (
                      <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                        Meta: <span className="font-semibold text-[#6B7280]">{fmtMeta(mc.meta, mc.unidade)}</span>
                      </p>
                    )}
                  </div>
                </div>
                {avg !== null && (
                  <div className="text-right">
                    <p className="text-xs text-[#6B7280]">Média</p>
                    <p className="text-sm font-bold" style={{ color }}>{avg.toFixed(2)}</p>
                  </div>
                )}
              </div>

              {consultores.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-[#9CA3AF]">Sem dados para este pilar</div>
              ) : (
                <div className="divide-y divide-[#F9FAFB]">
                  {consultores.map((c, i) => {
                    const st = statusStyle(c.score)
                    return (
                      <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                        <span className="text-xs font-medium text-[#9CA3AF] w-5 text-center">{i + 1}</span>
                        <p className="flex-1 text-sm text-[#111827] truncate">{c.nome}</p>
                        {c.reverter != null && c.reverter > 0 && (
                          <p className="text-[11px] text-[#F59E0B]">
                            falta {Math.abs(c.reverter) < 2 ? `${(c.reverter * 100).toFixed(1)}%` : String(c.reverter)}
                          </p>
                        )}
                        <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg" style={{ background: st.bg, color: st.text }}>
                          {c.score.toFixed(1)}
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
