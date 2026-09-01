import { getProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MetasClient from './MetasClient'
import { SCORE_GERAL_FAIXAS_PADRAO, type PillarConfig, type ScoreGeralFaixas } from '@/lib/types'

export default async function MetasPage() {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'dono')) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const [{ data }, { data: faixasAcionaveis }, { data: faixasScore }] = await Promise.all([
    supabase.from('pillar_config').select('*').order('categoria').order('pontos_max', { ascending: false }),
    supabase.from('metas_acionaveis_faixas').select('id, min_carteira, meta_tarefas').order('min_carteira'),
    supabase.from('score_geral_faixas').select('limite_critico, meta_objetivo').maybeSingle(),
  ])
  const faixasScoreGeral: ScoreGeralFaixas = faixasScore ?? SCORE_GERAL_FAIXAS_PADRAO

  return (
    <MetasClient
      pilares={data as PillarConfig[]}
      profileId={profile.id}
      faixasAcionaveis={faixasAcionaveis ?? []}
      faixasScoreGeral={faixasScoreGeral}
    />
  )
}
