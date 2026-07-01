import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import ConsultorClient from './ConsultorClient'

export default async function ConsultorPage() {
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
          <h1 className="text-xl font-bold text-[#111827]">Consultor</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Performance individual</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <p className="font-semibold text-[#111827]">Nenhum dado carregado ainda</p>
          <p className="text-sm text-[#6B7280] mt-1">Vá em <strong className="text-[#10B981]">Upar Planilha</strong> para começar.</p>
        </div>
      </div>
    )
  }

  const [{ data: uploadIds }, { data: pilaresConfig }] = await Promise.all([
    supabase.from('score_uploads').select('id').eq('data_referencia', latestDate),
    supabase.from('pillar_config').select('pilar_key, pontos_max, meta, tipo_comp, unidade'),
  ])

  const idList = (uploadIds ?? []).map(u => u.id)

  const { data: resultados } = await supabase
    .from('score_consultor_resultados')
    .select('id_carteira, consultor_nome, pilar_key, score_planilha, total_a_reverter, metricas, valor_metrica')
    .in('upload_id', idList.length > 0 ? idList : ['none'])

  const dateDisplay = new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <ConsultorClient
      resultados={resultados ?? []}
      dateDisplay={dateDisplay}
      dataReferencia={latestDate}
      pilaresConfig={pilaresConfig ?? []}
    />
  )
}
