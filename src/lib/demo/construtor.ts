/**
 * Construtor de consultas do modo demo.
 *
 * Imita o encadeamento do `@supabase/supabase-js` (`.from().select().eq()...`)
 * sem executar nada: cada método só acrescenta ao `PlanoConsulta`. A execução
 * acontece no `await`, e QUEM executa vem de fora — no servidor é o motor local,
 * no navegador é uma Server Action. É isso que permite as telas continuarem
 * escritas exatamente como estão, sem saber se estão falando com o Postgres ou
 * com o dataset de demonstração.
 *
 * O objeto devolvido é um Proxy do cliente real: só `from` e `rpc` são
 * trocados. `auth` continua o de verdade — no modo demo o login, a sessão e o
 * logout seguem reais, apenas os DADOS são fictícios.
 */

import { planoVazio, type Filtro, type PlanoConsulta, type RespostaDemo } from './plano.ts'

export type Executor = (plano: PlanoConsulta) => Promise<RespostaDemo>
export type ExecutorRpc = (fn: string, args: Record<string, unknown>) => Promise<RespostaDemo>

interface OpcoesSelect {
  count?: 'exact' | 'planned' | 'estimated'
  head?: boolean
}

interface OpcoesOrder {
  ascending?: boolean
  nullsFirst?: boolean
}

class ConstrutorDemo implements PromiseLike<RespostaDemo> {
  // Campos declarados e atribuídos no corpo, e não como parâmetros do
  // construtor: `constructor(private x)` é açúcar que exige transformação, e o
  // Node só REMOVE tipos quando lê .ts direto — este módulo precisa rodar assim
  // no teste.
  private readonly plano: PlanoConsulta
  private readonly executar: Executor

  constructor(plano: PlanoConsulta, executar: Executor) {
    this.plano = plano
    this.executar = executar
  }

  private filtro(f: Filtro): this {
    this.plano.filtros.push(f)
    return this
  }

  select(colunas = '*', opcoes?: OpcoesSelect): this {
    this.plano.colunas = colunas
    if (opcoes?.count === 'exact') this.plano.contarExato = true
    if (opcoes?.head) this.plano.semCorpo = true
    return this
  }

  eq(coluna: string, valor: unknown)  { return this.filtro({ tipo: 'eq', coluna, valor }) }
  neq(coluna: string, valor: unknown) { return this.filtro({ tipo: 'neq', coluna, valor }) }
  gt(coluna: string, valor: unknown)  { return this.filtro({ tipo: 'gt', coluna, valor }) }
  gte(coluna: string, valor: unknown) { return this.filtro({ tipo: 'gte', coluna, valor }) }
  lt(coluna: string, valor: unknown)  { return this.filtro({ tipo: 'lt', coluna, valor }) }
  lte(coluna: string, valor: unknown) { return this.filtro({ tipo: 'lte', coluna, valor }) }
  is(coluna: string, valor: null | boolean) { return this.filtro({ tipo: 'is', coluna, valor }) }
  in(coluna: string, valores: unknown[])    { return this.filtro({ tipo: 'in', coluna, valores }) }
  not(coluna: string, operador: string, valor: unknown) {
    return this.filtro({ tipo: 'not', coluna, operador, valor })
  }

  order(coluna: string, opcoes?: OpcoesOrder): this {
    this.plano.ordenacoes.push({
      coluna,
      ascendente: opcoes?.ascending ?? true,
      nulosPrimeiro: opcoes?.nullsFirst,
    })
    return this
  }

  limit(n: number): this {
    this.plano.limite = n
    return this
  }

  range(de: number, ate: number): this {
    this.plano.faixa = { de, ate }
    return this
  }

  single(): this {
    this.plano.singular = 'single'
    return this
  }

  maybeSingle(): this {
    this.plano.singular = 'maybeSingle'
    return this
  }

  /** Compatibilidade: no modo demo não há requisição para abortar. */
  abortSignal(): this {
    return this
  }

  then<R1 = RespostaDemo, R2 = never>(
    aoResolver?: ((v: RespostaDemo) => R1 | PromiseLike<R1>) | null,
    aoRejeitar?: ((m: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.executar(this.plano).then(aoResolver, aoRejeitar)
  }
}

function construtorDeTabela(tabela: string, executar: Executor) {
  return {
    select: (colunas?: string, opcoes?: OpcoesSelect) =>
      new ConstrutorDemo(planoVazio(tabela, 'select'), executar).select(colunas, opcoes),

    insert: (valores: unknown) =>
      new ConstrutorDemo({ ...planoVazio(tabela, 'insert'), valores }, executar),

    update: (valores: unknown) =>
      new ConstrutorDemo({ ...planoVazio(tabela, 'update'), valores }, executar),

    upsert: (valores: unknown, opcoes?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
      new ConstrutorDemo(
        {
          ...planoVazio(tabela, 'upsert'),
          valores,
          aoConflitar: opcoes?.onConflict,
          ignorarDuplicados: opcoes?.ignoreDuplicates,
        },
        executar,
      ),

    delete: () => new ConstrutorDemo(planoVazio(tabela, 'delete'), executar),
  }
}

/**
 * Envolve um cliente Supabase real, trocando só o acesso a dados.
 *
 * O cast final é deliberado: as telas continuam tipadas contra o cliente de
 * verdade (é ele que vale em produção) e este objeto só precisa se comportar
 * como tal em tempo de execução. Por isso o modo demo é verificado dirigindo as
 * telas, não pelo compilador.
 */
export function envolverComDemo<T extends object>(
  real: T,
  executar: Executor,
  executarRpc: ExecutorRpc,
): T {
  return new Proxy(real, {
    get(alvo, prop, receptor) {
      if (prop === 'from') return (tabela: string) => construtorDeTabela(tabela, executar)
      if (prop === 'rpc') {
        return (fn: string, args: Record<string, unknown> = {}) => executarRpc(fn, args)
      }
      return Reflect.get(alvo, prop, receptor)
    },
  })
}
