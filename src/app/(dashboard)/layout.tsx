import { createClientReal } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { modoDemoAtivo, podeUsarDemo } from '@/lib/demo/estado'
import { redirect } from 'next/navigation'
import Shell from '@/components/layout/Shell'
import AcessoDesativado from './AcessoDesativado'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Autenticação sempre no cliente REAL: mesmo numa demonstração, a sessão é
  // de verdade. O modo demo troca os dados exibidos, não quem está logado.
  const supabase = await createClientReal()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (!profile) redirect('/login')

  /* Conta desativada.
   *
   * Quem revoga de verdade é o banco: `get_my_role()` devolve null para inativo
   * e a RLS deixa de casar qualquer linha. Esta tela existe porque, sem ela, a
   * experiência é péssima e parece defeito: a senha está certa, o Supabase Auth
   * (que não conhece `ativo`) autentica, o login redireciona para o dashboard e
   * algo manda de volta para o login — a pessoa fica num pisca-pisca sem
   * nenhuma explicação, e o suporte vai atrás de um bug que não existe.
   *
   * Fica DEPOIS do redirect de sessão e ANTES de montar a casca: um inativo não
   * deve ver menu, nome de colega nem número nenhum. Ele ainda consegue ler a
   * própria linha de `profiles` (é o ramo `id = auth.uid()` da policy), que é
   * exatamente o que faz esta mensagem ser possível. */
  if (!profile.ativo) return <AcessoDesativado nome={profile.nome || profile.email} />

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
