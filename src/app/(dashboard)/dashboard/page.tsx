import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'

const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'Net Churn', acionaveis: 'AC',
  aderencia: 'Agenda', awareness: 'Awareness', produtividade: 'Prod'
}
const PILAR_COLOR: Record<string, string> = {
  tpv: '#60a5fa', net_churn: '#c084fc', acionaveis: '#fb923c',
  aderencia: '#2dd4bf', awareness: '#f472b6', produtividade: '#818cf8'
}
const PILARES = ['tpv','net_churn','acionaveis','aderencia','awareness','produtividade']

function statusStyle(score: number) {
  if (score >= 4.5) return { bg: '#F0FDF4', text: '#10B981' }
  if (score >= 3.0) return { bg: '#FFFBEB', text: '#F59E0B' }
  return { bg: '#FEF2F2', text: '#EF4444' }
}

export default async function GeralPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  // Pega a data mais recente com dados
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
          <h1 className="text-xl font-bold text-[#111827]">Ranking Geral</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Visão consolidada de todos os consultores</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </div>
          <p className="font-semibold text-[#111827]">Nenhum dado carregado ainda</p>
          <p className="text-sm text-[#6B7280] mt-1">Vá em <strong className="text-[#10B981]">Upar Planilha</strong> para começar.</p>
        </div>
      </div>
    )
  }

  const [{ data: uploadIds }, { data: pilaresConfig }] = await Promise.all([
    supabase.from('score_uploads').select('id, pilar_key').eq('data_referencia', latestDate),
    supabase.from('pillar_config').select('pilar_key, meta, unidade'),
  ])

  const metaMap = Object.fromEntries(
    (pilaresConfig ?? []).map(p => [p.pilar_key, { meta: p.meta, unidade: p.unidade }])
  )

  function fmtMeta(meta: number, unidade: string): string {
    if (unidade === '%') {
      const digits = Math.abs(meta) % 1 === 0 ? 0 : 2
      return `${meta.toFixed(digits).replace('.', ',')}%`
    }
    if (Number.isInteger(meta)) return String(meta)
    return meta.toFixed(1).replace('.', ',')
  }

  const uploadIdList = (uploadIds ?? []).map(u => u.id)

  const { data: resultados } = await supabase
    .from('score_consultor_resultados')
    .select('id_carteira, consultor_nome, pilar_key, score_planilha, total_a_reverter')
    .in('upload_id', uploadIdList.length > 0 ? uploadIdList : ['none'])

  // Consolida por consultor
  const consultores = new Map<string, {
    nome: string
    scores: Record<string, number>
    reverter: Record<string, number | null>
    total: number
  }>()

  for (const r of resultados ?? []) {
    if (!consultores.has(r.id_carteira)) {
      consultores.set(r.id_carteira, { nome: r.consultor_nome, scores: {}, reverter: {}, total: 0 })
    }
    const c = consultores.get(r.id_carteira)!
    c.scores[r.pilar_key] = r.score_planilha
    c.reverter[r.pilar_key] = r.total_a_reverter
    c.total += r.score_planilha
  }

  const ranking = Array.from(consultores.entries())
    .map(([id, c]) => ({ id, ...c, total: Math.min(c.total, 10) }))
    .sort((a, b) => b.total - a.total)

  const dateDisplay = new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#111827]">Ranking Geral</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">{ranking.length} consultores · {dateDisplay}</p>
        </div>
      </div>

      {ranking.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <p className="text-[#6B7280]">Nenhum resultado na data mais recente.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <th className="text-left px-4 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wider w-8">#</th>
                <th className="text-left px-4 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wider">Consultor</th>
                <th className="text-center px-3 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wider">Score</th>
                {PILARES.map(p => {
                  const mc = metaMap[p]
                  return (
                    <th key={p} className="text-center px-2 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: PILAR_COLOR[p] }}>
                      {PILAR_LABEL[p]}
                      {mc && (
                        <div className="text-[10px] font-normal text-[#9CA3AF] normal-case tracking-normal mt-0.5">
                          meta {fmtMeta(mc.meta, mc.unidade)}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {ranking.map((c, i) => {
                const st = statusStyle(c.total)
                return (
                  <tr key={c.id} className="hover:bg-[#F9FAFB] transition-colors">
                    <td className="px-4 py-3 text-[#6B7280] font-medium text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#111827] text-sm leading-tight">{c.nome}</p>
                      <p className="text-[11px] text-[#6B7280]">Cart. {c.id}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-block px-2.5 py-1 rounded-xl text-sm font-bold" style={{ background: st.bg, color: st.text }}>
                        {c.total.toFixed(1)}
                      </span>
                    </td>
                    {PILARES.map(p => {
                      const score = c.scores[p]
                      const reverter = c.reverter[p]
                      return (
                        <td key={p} className="px-2 py-3 text-center">
                          {score !== undefined ? (
                            <div>
                              <p className="text-sm font-semibold text-[#111827]">{score.toFixed(1)}</p>
                              {reverter != null && reverter > 0 && (
                                <p className="text-[10px] text-[#F59E0B] mt-0.5">
                                  falta {Math.abs(reverter) < 2 ? `${(reverter * 100).toFixed(1)}%` : String(reverter)}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#D1D5DB]">—</span>
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
