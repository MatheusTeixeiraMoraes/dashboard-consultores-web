import { cache } from 'react'
import { modoDemoAtivo, perfilReal } from '@/lib/demo/estado'
import { ADMIN_DEMO } from '@/lib/demo/dataset'
import type { Profile } from '@/lib/types'

/**
 * Perfil do usuário logado, ou null se não houver sessão válida.
 *
 * Envolto em `cache()` do React porque o layout do dashboard chama isto E a
 * página dentro dele chama de novo. Cada chamada custa DUAS idas de rede
 * (`auth.getUser` valida o token no Supabase, depois busca `profiles`), então
 * sem o cache toda tela pagava quatro idas — metade puro desperdício.
 *
 * O `cache()` dedupa por request: a segunda chamada devolve o mesmo resultado
 * sem tocar a rede. Não é cache entre usuários nem entre requests — cada
 * request tem o seu, então não vaza perfil de um usuário para outro.
 *
 * MODO DEMO: devolve a persona fictícia, para o nome e o e-mail reais do admin
 * não aparecerem na gravação. O papel continua `admin`, e isso não afrouxa
 * nada — o modo demo só liga para quem já é admin de verdade. Ainda assim,
 * decisão de permissão deve usar `perfilReal()`, não isto: é o perfil do banco,
 * imune ao modo demo.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const real = await perfilReal()
  if (!real) return null

  if (await modoDemoAtivo()) return { ...ADMIN_DEMO }

  return real
})
