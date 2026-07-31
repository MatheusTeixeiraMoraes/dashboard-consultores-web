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
/**
 * "Este erro significa que NÃO HÁ sessão" — em oposição a "não deu para saber".
 *
 * A diferença é a linha entre deslogar alguém e mentir sobre quem ele é. Sem
 * sessão o certo é devolver null (e a tela manda para o login). Com a rede
 * falhando, devolver null faz o app EXPULSAR um usuário logado — que é a
 * "instabilidade" relatada: logout aleatório, sem log, sem explicação.
 *
 * Checagem por `name`/`status` em vez de `instanceof AuthSessionMissingError`
 * de propósito: essa classe mora em `@supabase/auth-js`, que é dependência
 * transitiva (só `@supabase/ssr` e `supabase-js` estão no package.json).
 * Importar dali quebraria calado numa troca de versão.
 */
function ehFaltaDeSessao(erro: { name?: string; status?: number } | null): boolean {
  if (!erro) return true
  if (erro.name === 'AuthSessionMissingError') return true
  // 401/403 do servidor de auth = token inválido/expirado. É deslogado de
  // verdade, não falha de infra.
  return erro.status === 401 || erro.status === 403
}

export const perfilReal = cache(async (): Promise<Profile | null> => {
  const supabase = await createClientReal()

  const { data: { user }, error: erroAuth } = await supabase.auth.getUser()
  /* Erro que NÃO é falta de sessão (rede caiu, 5xx, 429 do Auth) sobe como
   * exceção. Antes era descartado, virava `user` undefined, virava null, e o
   * `if (!profile) redirect('/login')` das 20 telas chutava para fora alguém
   * que estava perfeitamente logado. */
  if (erroAuth && !ehFaltaDeSessao(erroAuth)) {
    throw new Error(`Falha ao verificar a sessão: ${erroAuth.message}`, { cause: erroAuth })
  }
  if (!user) return null

  /* `maybeSingle` e não `single`: `single` trata "zero linhas" como ERRO
   * (PGRST116), o que misturava de novo "não tem perfil" com "a consulta
   * falhou". Com `maybeSingle`, zero linhas devolve data null sem erro, e aí
   * `error` preenchido significa falha de verdade. */
  const { data, error: erroPerfil } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (erroPerfil) {
    throw new Error(`Falha ao carregar o perfil: ${erroPerfil.message}`, { cause: erroPerfil })
  }

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
