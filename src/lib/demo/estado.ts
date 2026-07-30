/**
 * Gate do modo demo — quem pode ligar, e se está ligado agora.
 *
 * Duas condições, sempre as duas: existe o cookie E o usuário é admin DE
 * VERDADE, conferido contra o banco a cada requisição. O cookie sozinho não
 * liga nada. Isso é o que garante a exigência do produto: consultor e líder
 * continuam vendo a operação real mesmo que forjem o cookie no navegador.
 *
 * O modo demo é por navegador, não global: enquanto o admin grava o vídeo, todo
 * mundo que está trabalhando no sistema segue nos dados de produção.
 */

import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClientReal } from '@/lib/supabase/server-real'
import { COOKIE_DEMO } from './cookie'
import type { Profile } from '@/lib/types'

export { COOKIE_DEMO }

/**
 * Perfil real do usuário logado — o do banco, nunca a persona de demonstração.
 *
 * Toda decisão de permissão passa por aqui. `getProfile()` (em profile.ts) pode
 * devolver a persona fictícia para a tela não exibir o nome real do admin no
 * vídeo; autorização não pode usar aquilo.
 */
export const perfilReal = cache(async (): Promise<Profile | null> => {
  const supabase = await createClientReal()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data ?? null
})

/**
 * Perfil que pode AUTORIZAR uma ação — `perfilReal` filtrado por `ativo`.
 *
 * Existem os dois porque eles respondem perguntas diferentes:
 *   - `perfilReal()`  = "quem é este usuário?"  → o layout precisa disso mesmo
 *     de alguém desativado, senão não teria como exibir a tela explicando que o
 *     acesso foi cortado (cairia num laço de login);
 *   - `perfilAutorizado()` = "este usuário pode agir?" → é o que toda server
 *     action privilegiada deve usar.
 *
 * Sem esta separação, `ativo` protegia só o que passa pela RLS: `get_my_role()`
 * filtra por ativo, mas as actions que rodam com `service_role` (criar usuário,
 * excluir usuário, gerar convite, entrar na conta) liam o papel direto de
 * `profiles` e ignoravam a revogação. Um admin desligado continuava criando e
 * apagando contas com a sessão que já tinha no navegador — o Supabase Auth não
 * conhece `ativo` e não derruba ninguém.
 */
export const perfilAutorizado = cache(async (): Promise<Profile | null> => {
  const perfil = await perfilReal()
  return perfil && perfil.ativo ? perfil : null
})

/** Só admin. Não inclui `dono`: o pedido foi explícito quanto a isso. */
export async function podeUsarDemo(): Promise<boolean> {
  const perfil = await perfilAutorizado()
  return perfil?.role === 'admin'
}

/**
 * Modo demo ligado para ESTA requisição.
 *
 * `cache()` porque quase toda tela pergunta mais de uma vez (o layout, a
 * página, e o `createClient()` de cada consulta) e cada checagem custa duas
 * idas de rede. O cache é por requisição — não vaza estado entre usuários.
 */
export const modoDemoAtivo = cache(async (): Promise<boolean> => {
  const cookieStore = await cookies()
  if (cookieStore.get(COOKIE_DEMO)?.value !== '1') return false
  return podeUsarDemo()
})
