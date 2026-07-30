'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { limparCookieDemo } from '@/lib/demo/cookie'

/**
 * Tela do usuário cujo acesso foi desativado.
 *
 * O corte real acontece no banco (`get_my_role()` devolve null e a RLS não casa
 * nada). Isto aqui é só a explicação — e o botão de sair, que importa: sem ele
 * a pessoa fica presa, porque a sessão do Supabase Auth continua válida e o
 * refresh token seguiria renovando sozinho.
 */
export default function AcessoDesativado({ nome }: { nome: string }) {
  const router = useRouter()

  async function sair() {
    limparCookieDemo()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/inovva-logo.png"
            alt="Inovva Group"
            width={716}
            height={400}
            priority
            className="w-44 h-auto mx-auto mb-4"
          />
        </div>

        <div className="glass rounded-2xl p-7 border border-line">
          <div className="-mx-7 -mt-7 mb-6 h-1.5 rounded-t-2xl bg-linear-to-r from-marca-1 via-marca-2 to-marca-3" />

          <h1 className="text-base font-bold text-ink">Acesso desativado</h1>
          <p className="text-sm text-ink-dim mt-2">
            Olá, {nome}. Sua conta existe, mas o acesso ao painel está desativado no momento.
          </p>
          <p className="text-sm text-ink-muted mt-3">
            Isso não é um erro de senha. Fale com quem cuida do painel para reativar.
          </p>

          <button
            onClick={sair}
            className="w-full mt-6 bg-primary hover:bg-primary-dk text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
          >
            Sair
          </button>
        </div>

        <p className="text-center text-[11px] text-ink-faint mt-6">Inovva Group © 2026</p>
      </div>
    </div>
  )
}
