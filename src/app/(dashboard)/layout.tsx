import { cookies } from 'next/headers'
import { getProfile } from '@/lib/supabase/profile'
import { modoDemoAtivo, podeUsarDemo } from '@/lib/demo/estado'
import { redirect } from 'next/navigation'
import Shell from '@/components/layout/Shell'
import BarraDelegacao from '@/components/layout/BarraDelegacao'
import AcessoDesativado from './AcessoDesativado'
import { COOKIE_DELEGACAO } from '@/lib/delegacao'
import type { DelegacaoOrigem } from '@/lib/delegacao'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  /* Autenticação sempre no cliente REAL: mesmo numa demonstração, a sessão é
   * de verdade. O modo demo troca os dados exibidos, não quem está logado.
   *
   * Uma chamada só. Aqui existia um `createClientReal()` + `auth.getUser()`
   * antes desta linha, e ele era ida de rede pura jogada fora: `getProfile()`
   * chama `perfilReal()`, que faz EXATAMENTE o mesmo `getUser()` — e o
   * `cache()` do React não dedupava, porque cada `createClientReal()` monta uma
   * instância nova de GoTrueClient. O `if (!profile)` abaixo cobre o mesmo caso
   * que o `if (!user)` cobria: sem sessão, `perfilReal()` devolve null.
   *
   * O token continua sendo validado CONTRA O SERVIDOR de auth (dentro de
   * `perfilReal`), não contra o cookie — isso não é atalho de segurança. */
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

  /* Delegação em curso ("entrar na conta de").
   *
   * A sessão desta requisição já é a do ALVO — é assim que a RLS entrega os
   * dados dele. Quem está delegando só é conhecido pelo cookie, que guarda o
   * nome de quem entrou e a sessão para voltar.
   *
   * É seguro passar por prop (ao contrário do cookie do modo demo, que precisa
   * ser lido no navegador): entrar e voltar sempre terminam em `redirect`, e
   * redirect re-renderiza o layout. Não existe navegação client-side que mude
   * este estado sem passar por aqui. */
  let delegacao: DelegacaoOrigem | null = null
  const bruto = (await cookies()).get(COOKIE_DELEGACAO)?.value
  if (bruto) {
    try { delegacao = JSON.parse(bruto) as DelegacaoOrigem } catch { delegacao = null }
  }

  // A casca é client (a gaveta do mobile tem estado); a autenticação fica aqui,
  // no servidor.
  return (
    <>
      {delegacao && (
        <BarraDelegacao
          adminNome={delegacao.admin_nome}
          alvoNome={profile.nome || profile.email}
          registroId={delegacao.registro_id}
        />
      )}
      <Shell profile={profile} demoAtivo={demoAtivo} demoDisponivel={demoDisponivel}>
        {children}
      </Shell>
    </>
  )
}
