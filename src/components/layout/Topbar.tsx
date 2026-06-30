'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

export default function Topbar({ user }: { user: User }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = (user.email ?? '?').slice(0, 2).toUpperCase()

  return (
    <header className="h-14 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-[#10B981] flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">{initials}</span>
        </div>
        <span className="text-sm text-[#6B7280]">{user.email}</span>
        <span className="text-gray-300">·</span>
        <button
          onClick={handleLogout}
          className="text-sm text-[#EF4444] hover:text-[#DC2626] font-medium transition-colors"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
