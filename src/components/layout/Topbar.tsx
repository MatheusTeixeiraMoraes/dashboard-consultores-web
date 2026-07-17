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

export default function Topbar({ profile }: { profile: Profile }) {
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
    <header className="h-14 bg-shell backdrop-blur-xl border-b border-line flex items-center justify-between px-6 flex-shrink-0">
      <div />
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
