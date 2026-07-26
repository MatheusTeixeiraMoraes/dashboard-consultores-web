/**
 * Motor do modo demo — executa um `PlanoConsulta` contra os dados em memória.
 *
 * É o "banco" da demonstração. Roda SÓ no servidor (ver `plano.ts` para o
 * porquê) e nunca abre conexão com o Postgres: no modo demo o app não chega
 * perto do banco de produção, e essa é justamente a garantia que o modo demo
 * precisa dar.
 *
 * Imita o PostgREST no que importa para as telas: projeção de colunas, filtros,
 * ordenação com nulos, `range`, `count exact` com `head`, e o erro PGRST116 do
 * `.single()`. Não imita o que o app não usa — join embutido, agregação,
 * full-text. Operador desconhecido levanta exceção com o nome dele, em vez de
 * devolver lista vazia: tela vazia sem erro é o pior modo de falhar aqui.
 */

import { bancoDemo, TABELAS_DEMO, type BancoDemo, type TabelaDemo } from './dataset.ts'
import type { Filtro, Ordenacao, PlanoConsulta, RespostaDemo } from './plano.ts'

type Linha = Record<string, unknown>

// ---------------------------------------------------------------------------
// Estado
//
// Cópia mutável do dataset gerado. As telas de gravação editam cliente, criam
// rota e renomeiam agenda; sem uma cópia própria, essas edições sujariam o
// baseline determinístico e as duas telas passariam a discordar.
//
// Vive no módulo, então dura o processo. Em `next dev` isso é uma sessão de
// gravação inteira. Em serverless a instância pode reciclar e o dataset volta
// ao baseline — as LEITURAS continuam idênticas (o gerador é determinístico),
// só as edições feitas durante a gravação é que se perdem.
// ---------------------------------------------------------------------------

let estado: BancoDemo | null = null

function banco(): BancoDemo {
  if (!estado) estado = structuredClone(bancoDemo())
  return estado
}

/** Devolve o dataset ao estado original. Usado ao desligar o modo demo. */
export function reiniciarDemo(): void {
  estado = null
}

function tabela(nome: string): Linha[] {
  if (!(TABELAS_DEMO as readonly string[]).includes(nome)) {
    throw new Error(
      `[demo] tabela "${nome}" não existe no dataset de demonstração. ` +
      `Adicione em src/lib/demo/dataset.ts ou a tela ficará vazia sem erro.`,
    )
  }
  return banco()[nome as TabelaDemo] as Linha[]
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/** Compara como o Postgres: número com número, resto como texto. */
function iguais(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b)
  return String(a) === String(b)
}

function ordem(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return String(a).localeCompare(String(b), 'pt-BR')
}

function passa(linha: Linha, f: Filtro): boolean {
  const v = linha[f.coluna]

  switch (f.tipo) {
    case 'eq':  return iguais(v, f.valor)
    case 'neq': return !iguais(v, f.valor)
    case 'in':  return f.valores.some(x => iguais(v, x))
    case 'is':  return f.valor === null ? v === null || v === undefined : v === f.valor
    // Comparações com null nunca casam, igual ao SQL.
    case 'gt':  return v != null && ordem(v, f.valor) > 0
    case 'gte': return v != null && ordem(v, f.valor) >= 0
    case 'lt':  return v != null && ordem(v, f.valor) < 0
    case 'lte': return v != null && ordem(v, f.valor) <= 0
    case 'not': {
      if (f.operador === 'is') {
        return f.valor === null ? v !== null && v !== undefined : v !== f.valor
      }
      throw new Error(`[demo] "not ${f.operador}" ainda não é suportado no modo demo.`)
    }
    default: {
      const desconhecido = f as { tipo: string }
      throw new Error(`[demo] filtro "${desconhecido.tipo}" ainda não é suportado no modo demo.`)
    }
  }
}

// ---------------------------------------------------------------------------
// Ordenação — nulos seguem o padrão do Postgres (ASC último, DESC primeiro)
// salvo quando a chamada disser o contrário.
// ---------------------------------------------------------------------------

function ordenar(linhas: Linha[], ordenacoes: Ordenacao[]): Linha[] {
  if (ordenacoes.length === 0) return linhas

  return [...linhas].sort((a, b) => {
    for (const o of ordenacoes) {
      const va = a[o.coluna]
      const vb = b[o.coluna]
      const aNulo = va === null || va === undefined
      const bNulo = vb === null || vb === undefined

      if (aNulo || bNulo) {
        if (aNulo && bNulo) continue
        const nulosPrimeiro = o.nulosPrimeiro ?? !o.ascendente
        return aNulo === nulosPrimeiro ? -1 : 1
      }

      const c = ordem(va, vb)
      if (c !== 0) return o.ascendente ? c : -c
    }
    return 0
  })
}

// ---------------------------------------------------------------------------
// Projeção de colunas
// ---------------------------------------------------------------------------

function projetar(linhas: Linha[], colunas: string | undefined): Linha[] {
  const spec = (colunas ?? '*').trim()
  if (spec === '' || spec === '*') return linhas.map(l => ({ ...l }))

  const campos = spec.split(',').map(c => c.trim()).filter(Boolean)
  return linhas.map(l => {
    const saida: Linha = {}
    for (const campo of campos) saida[campo] = l[campo] ?? null
    return saida
  })
}

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

function ok<T>(data: T, count: number | null = null): RespostaDemo {
  return { data: data as never, error: null, count, status: 200, statusText: 'OK' }
}

function erro(message: string, code: string, details = ''): RespostaDemo {
  return {
    data: null,
    error: { message, code, details, hint: '' },
    count: null,
    status: 400,
    statusText: 'Bad Request',
  }
}

/** O `.single()` do PostgREST erra quando não vem exatamente uma linha. */
function aplicarSingular(
  linhas: Linha[],
  singular: 'single' | 'maybeSingle' | undefined,
  count: number | null,
): RespostaDemo {
  if (!singular) return ok(linhas, count)

  if (linhas.length === 1) return ok(linhas[0], count)

  if (linhas.length === 0) {
    if (singular === 'maybeSingle') return ok(null, count)
    return erro(
      'JSON object requested, multiple (or no) rows returned',
      'PGRST116',
      'The result contains 0 rows',
    )
  }

  return erro(
    'JSON object requested, multiple (or no) rows returned',
    'PGRST116',
    `The result contains ${linhas.length} rows`,
  )
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

function selecionar(plano: PlanoConsulta): RespostaDemo {
  const filtradas = tabela(plano.tabela).filter(l => plano.filtros.every(f => passa(l, f)))
  const total = plano.contarExato ? filtradas.length : null

  // `head: true` pede só o total — é a primeira ida do `buscarTudo`, que usa a
  // contagem para decidir quantas páginas pedir em paralelo.
  if (plano.semCorpo) return { data: null, error: null, count: total, status: 200, statusText: 'OK' }

  let linhas = ordenar(filtradas, plano.ordenacoes)

  if (plano.faixa) linhas = linhas.slice(plano.faixa.de, plano.faixa.ate + 1)
  if (plano.limite !== undefined) linhas = linhas.slice(0, plano.limite)

  return aplicarSingular(projetar(linhas, plano.colunas), plano.singular, total)
}

let sequencia = 0

function novoId(): string {
  sequencia++
  const h = (n: number, t: number) => n.toString(16).padStart(t, '0').slice(-t)
  return `fed0${h(sequencia, 4)}-0000-4000-b000-${h(sequencia, 12)}`
}

function inserir(plano: PlanoConsulta): RespostaDemo {
  const alvo = tabela(plano.tabela)
  const entrada = Array.isArray(plano.valores) ? plano.valores : [plano.valores]
  const agora = new Date().toISOString()
  const criadas: Linha[] = []

  for (const bruta of entrada as Linha[]) {
    if (!bruta) continue

    if (plano.operacao === 'upsert' && plano.aoConflitar) {
      const existente = alvo.find(l => iguais(l[plano.aoConflitar!], bruta[plano.aoConflitar!]))
      if (existente) {
        // `ignoreDuplicates` é o "não faça nada se já existe" do ON CONFLICT —
        // e o PostgREST NÃO devolve a linha ignorada. Respeitar isso importa:
        // a importação de clientes conta `data.length` para dizer quantos
        // entraram, e devolver os ignorados faria esse número mentir na tela.
        if (plano.ignorarDuplicados) continue
        Object.assign(existente, bruta, { updated_at: agora })
        criadas.push(existente)
        continue
      }
    }

    // upsert por chave primária (o caso do /usuarios, que faz upsert com id)
    if (plano.operacao === 'upsert' && !plano.aoConflitar && bruta.id) {
      const existente = alvo.find(l => iguais(l.id, bruta.id))
      if (existente) {
        Object.assign(existente, bruta, { updated_at: agora })
        criadas.push(existente)
        continue
      }
    }

    const linha: Linha = {
      id: bruta.id ?? novoId(),
      created_at: agora,
      updated_at: agora,
      ...bruta,
    }
    alvo.push(linha)
    criadas.push(linha)
  }

  if (!plano.colunas) return ok(null)
  return aplicarSingular(projetar(criadas, plano.colunas), plano.singular, null)
}

function atualizar(plano: PlanoConsulta): RespostaDemo {
  const atingidas = tabela(plano.tabela).filter(l => plano.filtros.every(f => passa(l, f)))
  const patch = (plano.valores ?? {}) as Linha
  for (const linha of atingidas) Object.assign(linha, patch)

  if (!plano.colunas) return ok(null)
  return aplicarSingular(projetar(atingidas, plano.colunas), plano.singular, null)
}

function remover(plano: PlanoConsulta): RespostaDemo {
  const alvo = tabela(plano.tabela)

  // Delete sem filtro apagaria a tabela inteira num clique errado. O app nunca
  // faz isso; se um dia fizer, é bug — e no demo ele falha alto.
  if (plano.filtros.length === 0) {
    return erro('[demo] DELETE sem filtro foi recusado no modo demo.', 'DEMO_DELETE_SEM_FILTRO')
  }

  const removidas: Linha[] = []
  for (let i = alvo.length - 1; i >= 0; i--) {
    if (plano.filtros.every(f => passa(alvo[i], f))) removidas.push(...alvo.splice(i, 1))
  }

  if (!plano.colunas) return ok(null)
  return aplicarSingular(projetar(removidas, plano.colunas), plano.singular, null)
}

export function executarPlano(plano: PlanoConsulta): RespostaDemo {
  try {
    switch (plano.operacao) {
      case 'select': return selecionar(plano)
      case 'insert':
      case 'upsert': return inserir(plano)
      case 'update': return atualizar(plano)
      case 'delete': return remover(plano)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[demo] falha ao executar plano:', msg, plano)
    return erro(msg, 'DEMO_ERRO')
  }
}

/**
 * RPC no modo demo. Só existe `reconciliar_carteira`, que em produção reescreve
 * a carteira inteira — aqui devolve um relatório plausível SEM tocar em nada,
 * para o preview do upload ter o que mostrar.
 */
export function executarRpc(fn: string, args: Record<string, unknown>): RespostaDemo {
  if (fn !== 'reconciliar_carteira') {
    return erro(`[demo] função "${fn}" não existe no modo demo.`, 'DEMO_RPC_DESCONHECIDA')
  }

  const total = banco().mp_carteira.filter(l => iguais(l.data_referencia, args.p_data)).length
  return ok({
    aplicado: false,
    bloqueado: false,
    total_snapshot: total,
    total_anterior: total,
    stubs: 0,
    reatribuidos: 0,
    ocultados: 0,
    reativados: 0,
    sem_perfil: [],
    demo: true,
  } as unknown as Linha)
}
