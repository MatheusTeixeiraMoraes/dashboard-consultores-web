import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import GeralClient from './GeralClient'

export default async function GeralPage() {
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
    supabase.from('score_uploads').select('id').eq('data_referencia', latestDate),
    supabase.from('pillar_config').select('pilar_key, meta, unidade'),
  ])

  const metaMap = Object.fromEntries(
    (pilaresConfig ?? []).map(p => [p.pilar_key, { meta: p.meta, unidade: p.unidade }])
  )

  const uploadIdList = (uploadIds ?? []).map(u => u.id)

  const { data: resultados } = await supabase
    .from('score_consultor_resultados')
    .select('id_carteira, consultor_nome, pilar_key, score_planilha, total_a_reverter')
    .in('upload_id', uploadIdList.length > 0 ? uploadIdList : ['none'])

  const consultoresMap = new Map<string, {
    nome: string
    scores: Record<string, number>
    reverter: Record<string, number | null>
    total: number
  }>()

  for (const r of resultados ?? []) {
    if (!consultoresMap.has(r.id_carteira)) {
      consultoresMap.set(r.id_carteira, { nome: r.consultor_nome, scores: {}, reverter: {}, total: 0 })
    }
    const c = consultoresMap.get(r.id_carteira)!
    c.scores[r.pilar_key] = r.score_planilha
    c.reverter[r.pilar_key] = r.total_a_reverter
    c.total += r.score_planilha
  }

  const ranking = Array.from(consultoresMap.entries())
    .map(([id, c]) => ({ id, ...c, total: Math.min(c.total, 10) }))
    .sort((a, b) => b.total - a.total)

  const dateDisplay = new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return <GeralClient ranking={ranking} dateDisplay={dateDisplay} metaMap={metaMap} />
}
