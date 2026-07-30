'use client'

import Image from 'next/image'
import { limparCookieDemo } from '@/lib/demo/cookie'
import { sairEncerrandoDelegacao } from '@/app/(dashboard)/dashboard/usuarios/delegacao'
import type { Profile } from '@/lib/types'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  dono: 'Dono',
  lider: 'Líder',
  consultor: 'Consultor',
}

export default function Topbar({ profile, abrirMenu, demoAtivo = false }: {
  profile: Profile
  abrirMenu?: () => void
  demoAtivo?: boolean
}) {
  async function handleLogout() {
    // A demonstração não pode sobreviver à troca de usuário: o cookie vale para
    // o navegador, não para a conta.
    limparCookieDemo()

    /* A SAÍDA INTEIRA ACONTECE NO SERVIDOR, e a ordem aqui não é estilo.
     *
     * Havia um `supabase.auth.signOut()` do navegador ANTES desta chamada. Isso
     * quebrava as duas coisas que a action precisa fazer: sem os cookies `sb-*`
     * ela não descobre quem está saindo, então (a) não fechava a linha de
     * `acessos_delegados` — ficava "em curso" para sempre — e (b) não apagava o
     * cookie httpOnly da delegação, que JS nenhum alcança. O resultado media era
     * o pior desta feature: o refresh token de um admin sobrevivendo ao logout,
     * e o próximo a usar aquele navegador encontrando "voltar para minha conta".
     *
     * Também não existe `.catch()` aqui: `redirect()` de dentro de uma Server
     * Action se propaga como exceção, e capturá-la engolia justamente a
     * navegação para /login. */
    await sairEncerrandoDelegacao()
  }

  const displayName = profile.nome || profile.email
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <header className="h-14 bg-shell backdrop-blur-xl border-b border-line flex items-center justify-between px-4 md:px-6 flex-shrink-0">
      {/* Só no celular: lá a sidebar vira gaveta e leva a marca junto, então
          sem isto o app fica sem assinatura nenhuma na tela. No desktop o bloco
          inteiro some — a marca já está fixa no topo da sidebar. */}
      <div className="flex items-center gap-2 md:hidden">
        {/* Único acesso ao menu no celular. 44px é o alvo mínimo de toque que a
            Apple recomenda — abaixo disso o dedo erra. */}
        <button
          onClick={abrirMenu}
          aria-label="Abrir menu"
          className="-ml-2 w-11 h-11 grid place-items-center rounded-xl text-ink-dim hover:bg-card-2 active:bg-card-2"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Image src="/inovva-simbolo.png" alt="Inovva Group" width={56} height={56} className="w-7 h-7" />
      </div>
      {/* Selo de demonstração. Discreto de propósito: precisa aparecer no vídeo
          para ninguém confundir com a operação real, sem roubar a cena. */}
      {demoAtivo ? (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warn-bg border border-warn/30">
          <span className="w-1.5 h-1.5 rounded-full bg-warn-fill" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-warn">
            Dados demo
          </span>
        </div>
      ) : (
        <div className="hidden md:block" />
      )}
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-ink leading-tight">{displayName}</p>
          <p className="text-[11px] text-ink-muted leading-tight">{ROLE_LABEL[profile.role]}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-white">{initials}</span>
        </div>
        <span className="text-line">|</span>
        <button
          onClick={handleLogout}
          className="text-sm text-ink-muted hover:text-bad font-medium transition-colors"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
