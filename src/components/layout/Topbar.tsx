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

  return (
    <header className="h-14 bg-white border-b border-[#c7d0db] flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#525c6b]">{user.email}</span>
        <button
          onClick={handleLogout}
          className="text-sm text-[#dc2626] hover:text-[#b91c1c] font-medium transition-colors"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
