import { getProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageUsers } from '@/lib/types'
import type { UserRole } from '@/lib/types'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const me = await getProfile()
    if (!me || (me.role !== 'admin' && me.role !== 'dono')) {
      return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })
    }

    const body = await request.json()
    const { email, nome, role, id_carteira, senha } = body as {
      email: string; nome: string; role: UserRole; id_carteira: string; senha: string
    }

    if (!canManageUsers(me.role, role)) {
      return NextResponse.json({ ok: false, error: 'Sem permissão para criar esse cargo' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    if (authErr || !authData.user) {
      return NextResponse.json(
        { ok: false, error: authErr?.message ?? 'Erro ao criar usuário no Auth' },
        { status: 400 }
      )
    }

    const { data: prof, error: profErr } = await admin
      .from('profiles')
      .upsert({ id: authData.user.id, nome, email, role, id_carteira: id_carteira || null, ativo: true })
      .select()
      .single()

    if (profErr) {
      await admin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, profile: prof })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
