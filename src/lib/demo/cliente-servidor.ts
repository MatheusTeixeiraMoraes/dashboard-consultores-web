import { createClientReal } from '@/lib/supabase/server-real'
import { envolverComDemo } from './construtor'
import { executarPlano, executarRpc } from './motor'

/**
 * Cliente do modo demo para uso no servidor.
 *
 * Mantém `auth` do cliente real (sessão e logout continuam de verdade) e manda
 * `from`/`rpc` para o dataset em memória. Como já está no servidor, executa o
 * plano direto — sem ida de rede nenhuma, nem para o Supabase nem para si
 * mesmo. As telas ficam mais rápidas no modo demo, o que ajuda na gravação.
 */
export async function criarClienteDemoServidor() {
  const real = await createClientReal()

  return envolverComDemo(
    real,
    async plano => executarPlano(plano),
    async (fn, args) => executarRpc(fn, args),
  )
}
