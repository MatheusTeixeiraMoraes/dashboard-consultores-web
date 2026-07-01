import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import HistoricoClient from './HistoricoClient'

export default async function HistoricoPage() {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'dono')) {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  const { data: uploads } = await supabase
    .from('score_uploads')
    .select('id, pilar_key, filename, data_referencia, record_count, uploaded_by, created_at')
    .order('created_at', { ascending: false })

  const uploaderIds = [...new Set((uploads ?? []).map(u => u.uploaded_by))]

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, nome')
    .in('id', uploaderIds.length > 0 ? uploaderIds : ['none'])

  const profileMap = Object.fromEntries((profilesData ?? []).map(p => [p.id, p.nome]))

  const rows = (uploads ?? []).map(u => ({
    ...u,
    uploader_nome: profileMap[u.uploaded_by] ?? '—',
  }))

  return <HistoricoClient rows={rows} role={profile.role} />
}
