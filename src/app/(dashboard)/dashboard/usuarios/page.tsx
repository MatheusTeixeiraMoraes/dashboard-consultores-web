import { getProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UsuariosClient from './UsuariosClient'
import type { Profile } from '@/lib/types'

export interface ConviteLinha {
  id: string
  consultor_nome: string
  id_carteira: string | null
  criado_em: string
  expira_em: string
  usado_em: string | null
  revogado_em: string | null
}

export default async function UsuariosPage() {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'dono')) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').order('nome')

  // Dono não vê admins
  const usuarios = (data as Profile[]).filter(u =>
    profile.role === 'admin' ? true : u.role !== 'admin'
  )

  // A lista de consultores das planilhas NÃO é carregada aqui: varrer clientes
  // (~3,9 mil linhas) + scores custava ~3s nesta tela e chegou a estourar
  // `statement timeout` do Postgres sob concorrência. Ela é buscada por
  // `listarConsultoresDaPlanilha()` quando o modal de gerar link abre — que é
  // o único momento em que alguém precisa dela.
  const { data: convites } = await supabase
    .from('convites_acesso')
    .select('id, consultor_nome, id_carteira, criado_em, expira_em, usado_em, revogado_em')
    .order('criado_em', { ascending: false })
    .limit(50)

  return (
    <UsuariosClient
      usuarios={usuarios}
      myRole={profile.role}
      myId={profile.id}
      convites={(convites ?? []) as ConviteLinha[]}
    />
  )
}
