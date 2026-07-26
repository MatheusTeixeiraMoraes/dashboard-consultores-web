import { createBrowserClient } from '@supabase/ssr'
import { envolverComDemo } from '@/lib/demo/construtor'
import { consultarDemo, chamarRpcDemo } from '@/lib/demo/acoes'
import { demoLigadoNoNavegador } from '@/lib/demo/flag-navegador'

/**
 * Cliente Supabase das telas (navegador).
 *
 * Com o modo demo ligado, `from`/`rpc` passam a ser respondidos pelo servidor,
 * a partir do MESMO dataset que renderizou a página — nada sai daqui para o
 * banco de produção. `auth` continua real: login e logout não são simulados.
 */
export function createClient() {
  const real = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  if (!demoLigadoNoNavegador()) return real

  return envolverComDemo(real, consultarDemo, chamarRpcDemo)
}
