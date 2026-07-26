import { modoDemoAtivo } from '@/lib/demo/estado'
import { criarClienteDemoServidor } from '@/lib/demo/cliente-servidor'
import { createClientReal } from './server-real'

export { createClientReal }

/**
 * Cliente Supabase das telas.
 *
 * Com o modo demo ligado (só admin — ver `src/lib/demo/estado.ts`), devolve um
 * cliente que lê do dataset de demonstração em vez do banco. As telas não
 * mudam: continuam chamando `.from(...).select(...)` do mesmo jeito.
 *
 * Quem precisa do banco REAL mesmo durante uma demonstração — autenticação,
 * perfil de verdade, barreiras de escrita — deve usar `createClientReal()`.
 */
export async function createClient() {
  if (await modoDemoAtivo()) return criarClienteDemoServidor()
  return createClientReal()
}
