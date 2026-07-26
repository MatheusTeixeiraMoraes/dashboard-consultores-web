import { createClientReal } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { modoDemoAtivo, podeUsarDemo } from '@/lib/demo/estado'
import { redirect } from 'next/navigation'
import Shell from '@/components/layout/Shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Autenticação sempre no cliente REAL: mesmo numa demonstração, a sessão é
  // de verdade. O modo demo troca os dados exibidos, não quem está logado.
  const supabase = await createClientReal()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (!profile) redirect('/login')

  // Ambos passam por `cache()` e reaproveitam a leitura de perfil que o
  // getProfile acima já fez — não custam ida de rede nova.
  const [demoAtivo, demoDisponivel] = await Promise.all([modoDemoAtivo(), podeUsarDemo()])

  // A casca é client (a gaveta do mobile tem estado); a autenticação fica aqui,
  // no servidor.
  return (
    <Shell profile={profile} demoAtivo={demoAtivo} demoDisponivel={demoDisponivel}>
      {children}
    </Shell>
  )
}
