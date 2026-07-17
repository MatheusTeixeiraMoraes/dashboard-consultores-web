import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (!profile) redirect('/login')

  return (
    <div className="flex h-full">
      <Sidebar role={profile.role} />
      <div className="flex-1 flex flex-col min-w-0 ml-60">
        <Topbar profile={profile} />
        <main className="flex-1 p-6 overflow-auto bg-[#1D1D22]">
          {children}
        </main>
      </div>
    </div>
  )
}
