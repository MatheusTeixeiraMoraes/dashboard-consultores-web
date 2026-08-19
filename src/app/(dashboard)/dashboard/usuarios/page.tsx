import { getProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UsuariosClient from './UsuariosClient'
import type { Profile, UserRole } from '@/lib/types'

export interface ConviteLinha {
  id: string
  consultor_nome: string
  id_carteira: string | null
  /** Papel que a conta vai receber ao aceitar. Agora existe link de líder
   *  também, e sem isto os dois tipos ficariam indistinguíveis na lista. */
  role: UserRole
  criado_em: string
  expira_em: string
  usado_em: string | null
  revogado_em: string | null
}

export default async function UsuariosPage() {
  const profile = await getProfile()
  // Líder entra aqui pela primeira vez pra "Entrar na conta" — mas só enxerga
  // consultores e nenhuma das ações de gestão de usuário (ver filtro abaixo e
  // o gate de UI em UsuariosClient.tsx).
  if (!profile || (profile.role !== 'admin' && profile.role !== 'dono' && profile.role !== 'lider')) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').order('nome')

  const usuarios = (data as Profile[]).filter(u => {
    if (profile.role === 'lider') return u.role === 'consultor'   // só o que ele pode delegar
    if (profile.role === 'admin') return true
    return u.role !== 'admin'   // dono não vê admins
  })

  // Convites (links de acesso) são exclusivos de admin/dono — líder não deve
  // nem ver que a funcionalidade existe. Nem consulta a tabela pra ele: a RLS
  // já bloquearia, mas poupa a ida de rede.
  let convites: ConviteLinha[] = []
  if (profile.role === 'admin' || profile.role === 'dono') {
    // A lista de consultores das planilhas NÃO é carregada aqui: varrer
    // clientes (~3,9 mil linhas) + scores custava ~3s nesta tela e chegou a
    // estourar `statement timeout` do Postgres sob concorrência. Ela é
    // buscada por `listarConsultoresDaPlanilha()` quando o modal de gerar
    // link abre — que é o único momento em que alguém precisa dela.
    const { data: dataConvites } = await supabase
      .from('convites_acesso')
      .select('id, consultor_nome, id_carteira, role, criado_em, expira_em, usado_em, revogado_em')
      .order('criado_em', { ascending: false })
      .limit(50)
    convites = (dataConvites ?? []) as ConviteLinha[]
  }

  return (
    <UsuariosClient
      usuarios={usuarios}
      myRole={profile.role}
      myId={profile.id}
      convites={convites}
    />
  )
}
