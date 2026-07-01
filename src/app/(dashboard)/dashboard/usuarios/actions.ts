'use server'

import { getProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageUsers } from '@/lib/types'
import type { Profile, UserRole } from '@/lib/types'

export async function criarUsuario(data: {
  email: string
  nome: string
  role: UserRole
  id_carteira: string
  senha: string
}): Promise<{ ok: boolean; error?: string; profile?: Profile }> {
  try {
  const me = await getProfile()
  if (!me || !canManageUsers(me.role, data.role)) {
    return { ok: false, error: 'Sem permissão para criar esse tipo de usuário' }
  }

  const admin = createAdminClient()

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.senha,
    email_confirm: true,
  })

  if (authErr || !authData.user) {
    return { ok: false, error: authErr?.message ?? 'Erro ao criar usuário' }
  }

  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .upsert({
      id: authData.user.id,
      nome: data.nome,
      email: data.email,
      role: data.role,
      id_carteira: data.id_carteira || null,
      ativo: true,
    })
    .select()
    .single()

  if (profErr) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return { ok: false, error: profErr.message }
  }

  return { ok: true, profile: prof as Profile }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}

export async function excluirUsuario(
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const me = await getProfile()
    if (!me || (me.role !== 'admin' && me.role !== 'dono')) {
      return { ok: false, error: 'Sem permissão' }
    }
    if (userId === me.id) {
      return { ok: false, error: 'Não é possível excluir a própria conta' }
    }

    const admin = createAdminClient()

    const { data: target } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (!canManageUsers(me.role, target?.role as UserRole)) {
      return { ok: false, error: 'Sem permissão para excluir esse usuário' }
    }

    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return { ok: false, error: error.message }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}
