import { getProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MetasClient from './MetasClient'
import type { PillarConfig } from '@/lib/types'

export default async function MetasPage() {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'dono')) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const { data } = await supabase.from('pillar_config').select('*').order('categoria').order('pontos_max', { ascending: false })

  return <MetasClient pilares={data as PillarConfig[]} profileId={profile.id} />
}
