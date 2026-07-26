import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente Supabase de verdade, ligado no banco de produção.
 *
 * Vive num arquivo à parte de `server.ts` porque o modo demo precisa dos dois
 * lados sem ciclo de import: `server.ts` decide entre real e demo, e o gate do
 * modo demo (que confere se o usuário é mesmo admin) precisa do cliente REAL
 * para ler o perfil — se ele lesse pelo `createClient()` que decide, a checagem
 * de permissão consultaria o próprio dado falso que está tentando autorizar.
 *
 * Use este quando a resposta precisa vir do banco de verdade mesmo com o modo
 * demo ligado: autenticação, perfil real e as barreiras de escrita.
 */
export async function createClientReal() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — cookies set via middleware
          }
        },
      },
    }
  )
}
