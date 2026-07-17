import { cache } from 'react'
import { createClient } from './server'
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
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data ?? null
})
