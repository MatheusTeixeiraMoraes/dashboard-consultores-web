import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import Shell from '@/components/layout/Shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (!profile) redirect('/login')

  // A casca é client (a gaveta do mobile tem estado); a autenticação fica aqui,
  // no servidor.
  return <Shell profile={profile}>{children}</Shell>
}
