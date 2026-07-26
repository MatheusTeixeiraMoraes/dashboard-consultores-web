'use server'

/**
 * Ponte do navegador para o modo demo.
 *
 * Componentes de tela (`'use client'`) também falam com o Supabase — o gráfico
 * de evolução, o Comparar Datas, o upload, a Agenda. No modo demo essas
 * chamadas não podem ir ao banco, e também não podem ser respondidas por uma
 * cópia local dos dados: o navegador teria um dataset e o servidor outro, e
 * qualquer edição feita durante a gravação sumiria ao trocar de tela.
 *
 * Então o navegador manda o PLANO e o servidor responde do mesmo dataset que
 * renderizou a página. Uma fonte da verdade só.
 *
 * Toda função aqui é ponto de entrada exposto ao cliente e revalida permissão
 * por conta própria — `modoDemoAtivo()` exige cookie E papel de admin conferido
 * no banco. Não dá para chamar isto de fora e receber dado de demonstração sem
 * ser admin.
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { modoDemoAtivo, podeUsarDemo, COOKIE_DEMO } from './estado'
import { executarPlano, executarRpc, reiniciarDemo } from './motor'
import type { PlanoConsulta, RespostaDemo } from './plano'

function recusado(mensagem: string): RespostaDemo {
  return {
    data: null,
    error: { message: mensagem, code: 'DEMO_NAO_AUTORIZADO' },
    count: null,
    status: 403,
    statusText: 'Forbidden',
  }
}

export async function consultarDemo(plano: PlanoConsulta): Promise<RespostaDemo> {
  if (!(await modoDemoAtivo())) return recusado('Modo demonstração não está ativo.')
  return executarPlano(plano)
}

export async function chamarRpcDemo(
  fn: string,
  args: Record<string, unknown>,
): Promise<RespostaDemo> {
  if (!(await modoDemoAtivo())) return recusado('Modo demonstração não está ativo.')
  return executarRpc(fn, args)
}

/**
 * Liga/desliga o modo demo para este navegador.
 *
 * Cookie `httpOnly`: quem decide o que a tela vê é o servidor, e a tela não
 * precisa (nem deve) conseguir mexer nisso por JavaScript.
 */
export async function alternarModoDemo(ligar: boolean): Promise<{ ok: boolean; erro?: string }> {
  if (!(await podeUsarDemo())) {
    return { ok: false, erro: 'Apenas administradores podem usar o modo demonstração.' }
  }

  const cookieStore = await cookies()

  if (ligar) {
    cookieStore.set(COOKIE_DEMO, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // Uma gravação cabe em 8 horas com folga. Expirar sozinho evita o pior
      // cenário: esquecer ligado e voltar ao sistema achando que é produção.
      maxAge: 60 * 60 * 8,
    })
  } else {
    // Path explícito, igual ao do `set`. Um delete que não case o path deixa o
    // cookie vivo — e falhar em DESLIGAR é a falha grave aqui: o admin acharia
    // que voltou para produção enquanto ainda vê dados fictícios.
    cookieStore.delete({ name: COOKIE_DEMO, path: '/' })
    // Descarta as edições feitas durante a gravação, para a próxima demo
    // começar do mesmo lugar.
    reiniciarDemo()
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
