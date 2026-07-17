'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/lib/types'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  dono: 'Dono',
  lider: 'Líder',
  consultor: 'Consultor',
}

export default function Topbar({ profile, abrirMenu }: { profile: Profile; abrirMenu?: () => void }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = profile.nome || profile.email
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <header className="h-14 bg-shell backdrop-blur-xl border-b border-line flex items-center justify-between px-4 md:px-6 flex-shrink-0">
      {/* Único acesso ao menu no celular, onde a sidebar está escondida.
          44px é o alvo mínimo de toque que a Apple recomenda — abaixo disso o
          dedo erra. */}
      <button
        onClick={abrirMenu}
        aria-label="Abrir menu"
        className="md:hidden -ml-2 w-11 h-11 grid place-items-center rounded-xl text-ink-dim hover:bg-card-2 active:bg-card-2"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div className="hidden md:block" />
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
