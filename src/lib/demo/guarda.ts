import { modoDemoAtivo } from './estado'

/**
 * Barreira para escritas que NÃO passam pelo cliente Supabase das telas.
 *
 * A troca de fonte do modo demo cobre `.from(...)`, mas há dois caminhos que
 * escapam dela e escrevem em produção de qualquer jeito:
 *
 *   - `createAdminClient()` (service_role), que atravessa a RLS;
 *   - `auth.admin.createUser` / `deleteUser`, que mexem em `auth.users`.
 *
 * São exatamente os caminhos da tela de Usuários. Sem esta barreira, mostrar a
 * criação de um usuário durante a gravação criaria um usuário DE VERDADE no
 * sistema em produção — o oposto do que o modo demo promete.
 */
export const MSG_BLOQUEIO_DEMO =
  'Modo demonstração ativo: esta ação foi bloqueada para não alterar dados reais. ' +
  'Desligue o modo demonstração na barra lateral para executá-la.'

/** `true` quando a ação deve ser recusada por estar numa demonstração. */
export async function escritaBloqueadaPeloDemo(): Promise<boolean> {
  return modoDemoAtivo()
}
