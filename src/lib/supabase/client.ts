import { createBrowserClient } from '@supabase/ssr'
import { envolverComDemo } from '@/lib/demo/construtor'
import { consultarDemo, chamarRpcDemo } from '@/lib/demo/acoes'
import { demoNoCookie } from '@/lib/demo/cookie'

/**
 * Cliente Supabase das telas (navegador).
 *
 * Com o modo demo ligado, `from`/`rpc` passam a ser respondidos pelo servidor,
 * a partir do MESMO dataset que renderizou a página — nada sai daqui para o
 * banco de produção. `auth` continua real: login e logout não são simulados.
 *
 * A decisão é tomada AQUI, lendo o cookie no momento da chamada, e não a partir
 * de um valor recebido no render. O porquê está em `@/lib/demo/cookie`: layout
 * não re-renderiza em navegação client-side, então um valor capturado no render
 * envelhece — e a versão envelhecida mandava escrita para produção com a tela
 * mostrando dado fictício.
 */
export function createClient() {
  const real = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  if (!demoNoCookie()) return real

  return envolverComDemo(real, consultarDemo, chamarRpcDemo)
}
