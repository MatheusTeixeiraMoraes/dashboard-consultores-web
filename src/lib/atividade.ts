'use server'

import { getProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Grava uma linha no log de atividade (`eventos_atividade`), pra
 * administradores enxergarem quem fez o quê e quando.
 *
 * O ATOR é sempre resolvido AQUI, no servidor, via `getProfile()` — nunca
 * aceita nome/id vindo de quem chama. Mesma razão de segurança já
 * documentada em `entrarNaConta` (usuarios/delegacao.ts): autorizar por um
 * campo e gravar por outro é como se forjava convite de admin antes.
 *
 * Um componente cliente pode chamar isto direto (é uma server action —
 * `'use server'` no topo do arquivo já cobre o arquivo inteiro), ou código
 * de servidor pode importar e chamar como função normal.
 *
 * NUNCA lança: um log que falha não pode derrubar a ação real por trás dele
 * (editar cliente tem que funcionar mesmo se o log falhar). Erro vira
 * `console.error` e para — evento perdido é aceitável, ação bloqueada não.
 */
export async function registrarEvento(input: {
  tipo: string
  alvoTipo?: string
  alvoId?: string
  alvoDescricao?: string
  detalhes?: Record<string, unknown>
  /**
   * SÓ pra durante uma delegação ("entrar na conta de"): ali a sessão atual
   * fica ambígua entre admin e alvo no meio da troca, então `getProfile()`
   * sozinho atribuiria o evento a quem não devia. Use isto SÓ quando quem
   * chama já validou a identidade no servidor um passo antes (mesmo
   * raciocínio de `acessos_delegados` guardar admin_id/nome/email direto,
   * não derivado da sessão no instante da escrita) — nunca com dado vindo
   * do cliente.
   */
  atorOverride?: { id: string; nome: string; email: string }
}): Promise<void> {
  try {
    const ator = input.atorOverride ?? await getProfile()
    if (!ator) return   // sem sessão, não há o que atribuir — silencioso de propósito

    await createAdminClient().from('eventos_atividade').insert({
      tipo: input.tipo,
      ator_id: ator.id,
      ator_nome: ator.nome || ator.email,
      ator_email: ator.email,
      alvo_tipo: input.alvoTipo ?? null,
      alvo_id: input.alvoId ?? null,
      alvo_descricao: input.alvoDescricao ?? null,
      detalhes: input.detalhes ?? null,
    })
  } catch (err) {
    console.error(`[atividade] falha ao registrar evento "${input.tipo}":`, err)
  }
}
