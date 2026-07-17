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
    <header className="h-14 bg-[#0A0A0C] border-b border-[#26262B] flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-[#F4F4F5] leading-tight">{displayName}</p>
          <p className="text-[11px] text-[#8A8A93] leading-tight">{ROLE_LABEL[profile.role]}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-[#4F5FE0] flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-white">{initials}</span>
        </div>
        <span className="text-[#26262B]">|</span>
        <button
          onClick={handleLogout}
          className="text-sm text-[#8A8A93] hover:text-[#F2777A] font-medium transition-colors"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
