'use server'

import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { escritaBloqueadaPeloDemo, MSG_BLOQUEIO_DEMO } from '@/lib/demo/guarda'
import { canManageUsers } from '@/lib/types'
import { gerarToken, hashToken, expiraEm, DIAS_VALIDADE_PADRAO } from '@/lib/convites'
import type { UserRole } from '@/lib/types'

/**
 * Gera o link de acesso de um consultor.
 *
 * O token volta EM CLARO nesta resposta e em nenhum outro lugar — o banco fica
 * só com o sha256. Se o gestor fechar a janela sem copiar, não há como
 * recuperar: tem que gerar outro. É o preço de não guardar o segredo.
 */
export async function gerarLinkAcesso(dados: {
  consultor_nome: string
  id_carteira: string | null
  role: UserRole
  dias?: number
}): Promise<{ ok: boolean; error?: string; token?: string; expira_em?: string }> {
  try {
    const me = await getProfile()
    if (!me || !canManageUsers(me.role, dados.role)) {
      return { ok: false, error: 'Sem permissão para dar acesso a esse cargo' }
    }

    // Mesma ordem das outras ações desta tela: papel primeiro, demo logo depois.
    // Um convite gerado durante a demonstração criaria usuário DE VERDADE ao ser
    // aceito — o modo demo troca a fonte de leitura, não o service_role.
    if (await escritaBloqueadaPeloDemo()) return { ok: false, error: MSG_BLOQUEIO_DEMO }

    const nome = dados.consultor_nome.trim()
    if (!nome) return { ok: false, error: 'Escolha o consultor' }

    // Teto de 30 dias: link de acesso é para ser usado hoje ou amanhã. Quanto
    // mais tempo no ar, mais chance de circular em conversa encaminhada.
    const dias = Math.min(Math.max(Math.trunc(dados.dias ?? DIAS_VALIDADE_PADRAO), 1), 30)
    const token = gerarToken()
    const validade = expiraEm(dias)

    // service_role: a tela é de admin/dono (já conferido acima), mas quem grava
    // é o servidor — assim a policy de insert não depende do cliente.
    const admin = createAdminClient()
    const { error } = await admin.from('convites_acesso').insert({
      token_hash: hashToken(token),
      consultor_nome: nome,
      id_carteira: dados.id_carteira?.trim() || null,
      role: dados.role,
      criado_por: me.id,
      expira_em: validade.toISOString(),
    })

    if (error) return { ok: false, error: error.message }

    revalidatePath('/dashboard/usuarios')
    return { ok: true, token, expira_em: validade.toISOString() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}

/** Corta um link que ainda não foi usado (ou que foi para a pessoa errada). */
export async function revogarLink(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const me = await getProfile()
    if (!me || (me.role !== 'admin' && me.role !== 'dono')) {
      return { ok: false, error: 'Sem permissão' }
    }
    if (await escritaBloqueadaPeloDemo()) return { ok: false, error: MSG_BLOQUEIO_DEMO }

    const admin = createAdminClient()
    // `revogado_em is null` deixa a ação idempotente: clicar duas vezes não
    // reescreve a data e não vira erro.
    const { error } = await admin
      .from('convites_acesso')
      .update({ revogado_em: new Date().toISOString() })
      .eq('id', id)
      .is('revogado_em', null)

    if (error) return { ok: false, error: error.message }

    revalidatePath('/dashboard/usuarios')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}
