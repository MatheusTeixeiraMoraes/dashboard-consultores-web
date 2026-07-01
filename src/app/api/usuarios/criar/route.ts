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

    const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const keyDiag = `len=${rawKey.length} code0=${rawKey.charCodeAt(0)} starts_eyJ=${rawKey.startsWith('eyJ')}`

    // Decode JWT payload para confirmar role sem expor a chave
    let keyRole = '?'
    try {
      const payload = JSON.parse(Buffer.from(rawKey.split('.')[1], 'base64url').toString())
      keyRole = payload.role ?? '?'
    } catch {}

    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${rawKey}`,
        'apikey': rawKey,
      },
      body: JSON.stringify({ email, password: senha, email_confirm: true }),
    })

    if (!createRes.ok) {
      let body = ''
      try { body = await createRes.text() } catch {}
      return NextResponse.json(
        { ok: false, error: `status=${createRes.status} body=${body.substring(0, 300)} [key:${keyDiag} role=${keyRole}]` },
        { status: 400 }
      )
    }

    const authUser = await createRes.json() as { id: string }

    const admin = createAdminClient()

    const { data: prof, error: profErr } = await admin
      .from('profiles')
      .upsert({ id: authUser.id, nome, email, role, id_carteira: id_carteira || null, ativo: true })
      .select()
      .single()

    if (profErr) {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${authUser.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${rawKey}`, 'apikey': rawKey },
      })
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, profile: prof })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
