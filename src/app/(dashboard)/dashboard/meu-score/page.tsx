import { getProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MeuScoreClient from './MeuScoreClient'

export default async function MeuScorePage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'consultor') redirect('/dashboard')

  if (!profile.id_carteira) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#111827]">Meu Desempenho</h1>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <p className="font-semibold text-[#111827]">ID Carteira não configurado</p>
          <p className="text-sm text-[#6B7280] mt-1">Solicite ao administrador que vincule seu ID de carteira ao perfil.</p>
        </div>
      </div>
    )
  }

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
          <h1 className="text-xl font-bold text-[#111827]">Meu Desempenho</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">{profile.nome || profile.email} · Carteira {profile.id_carteira}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <p className="font-semibold text-[#111827]">Nenhum dado disponível ainda</p>
          <p className="text-sm text-[#6B7280] mt-1">Aguarde o upload das planilhas pelo administrador.</p>
        </div>
      </div>
    )
  }

  const [{ data: uploadIds }, { data: pilaresConfig }] = await Promise.all([
    supabase.from('score_uploads').select('id').eq('data_referencia', latestDate),
    supabase.from('pillar_config').select('pilar_key, pontos_max, meta, tipo_comp, unidade'),
  ])

  const idList = (uploadIds ?? []).map((u: { id: string }) => u.id)

  const { data: resultados } = await supabase
    .from('score_consultor_resultados')
    .select('id_carteira, consultor_nome, pilar_key, score_planilha, metricas, valor_metrica')
    .in('upload_id', idList.length > 0 ? idList : ['none'])
    .eq('id_carteira', profile.id_carteira)

  const dateDisplay = new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <MeuScoreClient
      resultados={resultados ?? []}
      dateDisplay={dateDisplay}
      dataReferencia={latestDate}
      pilaresConfig={pilaresConfig ?? []}
      profileNome={profile.nome || profile.email}
      idCarteira={profile.id_carteira}
    />
  )
}
