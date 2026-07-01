import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import CompararClient from './CompararClient'

export default async function CompararPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  const { data: uploads } = await supabase
    .from('score_uploads')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })

  const dates = [...new Set((uploads ?? []).map(u => u.data_referencia as string))]

  return <CompararClient dates={dates} />
}
