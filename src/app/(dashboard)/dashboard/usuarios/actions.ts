'use server'

import { getProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { escritaBloqueadaPeloDemo, MSG_BLOQUEIO_DEMO } from '@/lib/demo/guarda'
import { canManageUsers } from '@/lib/types'
import type { Profile, UserRole } from '@/lib/types'

export async function criarUsuario(data: {
  email: string
  nome: string
  role: UserRole
  id_carteira: string
  senha: string
}): Promise<{ ok: boolean; error?: string; profile?: Profile }> {
  // DEBUG TEMPORÁRIO
  const keyPresente = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!keyPresente) return { ok: false, error: 'SERVICE_ROLE_KEY ausente no servidor' }

  try {
  const me = await getProfile()
  if (!me || !canManageUsers(me.role, data.role)) {
    return { ok: false, error: 'Sem permissão para criar esse tipo de usuário' }
  }

  // service_role + auth.users não passam pela troca de fonte do modo demo:
  // sem esta barreira, demonstrar a criação de usuário criaria um de verdade.
  if (await escritaBloqueadaPeloDemo()) return { ok: false, error: MSG_BLOQUEIO_DEMO }

  const admin = createAdminClient()

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.senha,
    email_confirm: true,
  })

  if (authErr || !authData.user) {
    const msg = authErr?.message || authErr?.name || String(authErr) || 'Erro ao criar usuário'
    console.error('[criarUsuario] authErr:', JSON.stringify(authErr, null, 2))
    return { ok: false, error: msg }
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
    const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : String(err))
    console.error('[criarUsuario] catch:', msg)
    return { ok: false, error: msg || 'Erro inesperado' }
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
    // ANTES da checagem de "não exclua a si mesmo": no modo demo o `me.id` é o
    // da persona fictícia, então aquela comparação nunca casaria com o id real
    // e a proteção sumiria. A barreira é sempre a primeira coisa depois do
    // papel — mesma ordem das rotas em /api/usuarios.
    if (await escritaBloqueadaPeloDemo()) return { ok: false, error: MSG_BLOQUEIO_DEMO }

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
