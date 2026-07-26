import { getProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { escritaBloqueadaPeloDemo, MSG_BLOQUEIO_DEMO } from '@/lib/demo/guarda'
import { canManageUsers } from '@/lib/types'
import type { UserRole } from '@/lib/types'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const me = await getProfile()
    if (!me || (me.role !== 'admin' && me.role !== 'dono')) {
      return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })
    }

    // service_role + auth.users: escapa da troca de fonte do modo demo, então
    // precisa da barreira explícita. Excluir usuário é irreversível.
    if (await escritaBloqueadaPeloDemo()) {
      return NextResponse.json({ ok: false, error: MSG_BLOQUEIO_DEMO }, { status: 403 })
    }

    const { userId } = await request.json()

    if (userId === me.id) {
      return NextResponse.json({ ok: false, error: 'Não é possível excluir a própria conta' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: target } = await admin.from('profiles').select('role').eq('id', userId).single()

    if (!canManageUsers(me.role, target?.role as UserRole)) {
      return NextResponse.json({ ok: false, error: 'Sem permissão para excluir esse usuário' }, { status: 403 })
    }

    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
