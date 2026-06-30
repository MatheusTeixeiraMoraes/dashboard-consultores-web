import { getProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UsuariosClient from './UsuariosClient'
import type { Profile } from '@/lib/types'

export default async function UsuariosPage() {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'dono')) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('nome')

  // Dono não vê admins
  const usuarios = (data as Profile[]).filter(u =>
    profile.role === 'admin' ? true : u.role !== 'admin'
  )

  return <UsuariosClient usuarios={usuarios} myRole={profile.role} myId={profile.id} />
}
