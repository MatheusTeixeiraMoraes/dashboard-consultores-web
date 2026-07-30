import { perfilAutorizado } from '@/lib/demo/estado'
import { createAdminClient } from '@/lib/supabase/admin'
import { escritaBloqueadaPeloDemo, MSG_BLOQUEIO_DEMO } from '@/lib/demo/guarda'
import { canManageUsers } from '@/lib/types'
import type { UserRole } from '@/lib/types'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const me = await perfilAutorizado()
    if (!me || (me.role !== 'admin' && me.role !== 'dono')) {
      return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })
    }

    // Antes de qualquer coisa: este caminho usa service_role e cria usuário em
    // auth.users — nada disso é coberto pela troca de fonte do modo demo.
    if (await escritaBloqueadaPeloDemo()) {
      return NextResponse.json({ ok: false, error: MSG_BLOQUEIO_DEMO }, { status: 403 })
    }

    const body = await request.json()
    const { email, nome, role, id_carteira, senha } = body as {
      email: string; nome: string; role: UserRole; id_carteira: string; senha: string
    }

    if (!canManageUsers(me.role, role)) {
      return NextResponse.json({ ok: false, error: 'Sem permissão para criar esse cargo' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    if (authErr || !authUser?.user) {
      return NextResponse.json(
        { ok: false, error: authErr?.message ?? 'Falha ao criar usuário' },
        { status: 400 }
      )
    }

    // O profile é criado aqui, não por trigger em auth.users: um trigger que
    // falhe derruba a criação do usuário inteira com "Database error creating
    // new user", sem dizer o porquê. Aqui o erro é visível e reversível.
    const { data: prof, error: profErr } = await admin
      .from('profiles')
      .upsert({ id: authUser.user.id, nome, email, role, id_carteira: id_carteira || null, ativo: true })
      .select()
      .single()

    if (profErr) {
      // Sem profile o usuário fica órfão (loga e não é nada). Desfaz.
      await admin.auth.admin.deleteUser(authUser.user.id)
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, profile: prof })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
