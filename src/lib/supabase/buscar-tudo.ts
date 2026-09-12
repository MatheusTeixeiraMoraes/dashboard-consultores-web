// Busca de tabela grande sem enfileirar ida e volta.

/** Teto de linhas que o PostgREST devolve por resposta. Não é opcional: pedir
 *  `limit=5000` devolve 1000 do mesmo jeito, então paginar é obrigatório. */
const PAGINA = 1000

interface Resposta<T> {
  data: T[] | null
  count: number | null
  error: { message: string } | null
  /** A lib do Supabase sempre devolve isto — ver descreverErro() sobre por que
   *  captar agora é o que faltava pra diagnosticar de verdade. */
  status?: number
  statusText?: string
}

/**
 * O que sobra de uma query do Supabase depois do `.select()` e dos filtros:
 * ainda dá para encadear `.order()`, e o fim da linha é `.range()`.
 */
interface ConsultaOrdenavel<T> {
  order(coluna: string, opcoes?: { ascending?: boolean; nullsFirst?: boolean }): ConsultaOrdenavel<T>
  range(de: number, ate: number): PromiseLike<Resposta<T>>
}

/**
 * A consulta, parametrizada pelo helper. Recebe as opções do `.select()` e
 * devolve a query já filtrada — SEM `.order()` nem `.range()`. Quem
 * acrescenta os dois é o próprio `buscarTudo`, a partir do `ordenarPor` que
 * `buscarTudo` exige do chamador (ver o porquê no comentário dela).
 */
type Consulta<T> = (opcoes: { count?: 'exact' }) => ConsultaOrdenavel<T>

/** Uma coluna do ORDER BY. Atalho: uma string vira `{ coluna }` (ascendente). */
export type OrdemColuna = string | { coluna: string; ascending?: boolean; nullsFirst?: boolean }

function normalizarOrdem(o: OrdemColuna): { coluna: string; ascending?: boolean; nullsFirst?: boolean } {
  return typeof o === 'string' ? { coluna: o } : o
}

/** Acrescenta o(s) `.order()` na query, na ordem dada — o último tem que ser
 *  uma coluna única na tabela (ou o conjunto, único), senão não é ordem TOTAL. */
function aplicarOrdem<T>(consulta: ConsultaOrdenavel<T>, ordens: OrdemColuna[]): ConsultaOrdenavel<T> {
  return ordens.reduce((q, o) => {
    const { coluna, ascending, nullsFirst } = normalizarOrdem(o)
    return q.order(coluna, { ascending: ascending ?? true, nullsFirst })
  }, consulta)
}

const TENTATIVAS = 5
const ESPERA_BASE_MS = 500

function esperar(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Descreve o erro pro log do servidor mesmo quando `.message` vem vazio.
 *
 * Achado em produção (lendo o código-fonte de @supabase/postgrest-js): pra
 * `head: true` (a contagem), a resposta HTTP NUNCA tem corpo — nem no
 * sucesso, nem no erro, é assim que HEAD funciona. Quando o servidor devolve
 * um status de erro, a lib tenta ler o corpo (vazio), falha o JSON.parse e
 * cai num fallback que descarta o status: `error = { message: '' }`. Por
 * isso a mensagem sempre vinha vazia, sempre do mesmo jeito — não era
 * aleatório, era estrutural. `status`/`statusText` sobrevivem nesse fallback
 * e são o único jeito de saber o que realmente aconteceu (503 = banco
 * sobrecarregado, 500 = erro interno, 429 = limite de requisições, etc.).
 */
function descreverErro(error: { message: string }, status?: number, statusText?: string): string {
  const detalhe = error.message || JSON.stringify(error) || 'erro sem detalhe'
  return status ? `HTTP ${status}${statusText ? ' ' + statusText : ''} — ${detalhe}` : detalhe
}

/**
 * Repete em caso de falha antes de desistir — instabilidade de rede
 * momentânea (o que a tela de erro já promete pro usuário) costuma sumir
 * numa próxima tentativa. Sem isto, qualquer soluço breve na conexão com o
 * banco virava tela de erro cheia, mesmo quando uma nova tentativa teria
 * resolvido sozinha.
 *
 * Subiu de 3 pra 5 tentativas (e a espera, de até 1,2s pra até 5s de janela
 * total) depois de um caso real em que 3 não bastaram: aconteceu com mais
 * frequência acessando via "entrar na conta de" um consultor — a tela de
 * Clientes é a mais pesada do app (~11 idas em paralelo por abertura, entre
 * contagens e páginas), e sob uso concorrente (vários gestores checando
 * consultores ao mesmo tempo, por exemplo) a instabilidade pode durar mais
 * que um soluço de sub-segundo. Espera crescente (500ms, 1s, 1,5s, 2s) —
 * nem trava a resposta por tempo demais, nem bate no banco de novo cedo
 * demais enquanto a contenção ainda não passou.
 */
async function comRetentativa<T>(fn: () => PromiseLike<Resposta<T>>): Promise<Resposta<T>> {
  let ultima: Resposta<T>
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    ultima = await fn()
    if (!ultima.error) return ultima
    if (tentativa < TENTATIVAS) await esperar(ESPERA_BASE_MS * tentativa)
  }
  return ultima!
}

/**
 * Traz TODAS as linhas de uma consulta que passa de 1000, em paralelo.
 *
 * As três telas de carteira (Clientes, Radar, Roteirizar) paginavam com um `for`
 * que esperava cada ida antes de pedir a próxima. Com ~800ms por ida e 3,2 mil
 * clientes, isso custava 3,2s de servidor por page view. Medido:
 *   4 idas em fila ................. 3.146 ms
 *   contar + todas em paralelo ..... 1.210 ms   <- este
 *   1a página + resto em paralelo .. 1.712 ms
 * Conta primeiro (a resposta era só um header, ~230ms — agora traz 1 linha
 * real também, ver nota sobre `head: true` abaixo) e aí dispara as páginas
 * todas de uma vez: o custo passa a ser o da página mais lenta, não a soma.
 *
 * `ordenarPor` é OBRIGATÓRIO, e por um motivo que não é estilo: como as
 * páginas saem em paralelo, cada uma é um OFFSET/LIMIT independente, e sem
 * ORDER BY o Postgres não garante ordem estável entre eles — a mesma linha
 * pode cair em duas páginas e outra em nenhuma, sem erro nenhum. Ordem
 * PARCIAL não resolve (ex.: `.order('seller_nome')` quando o nome repete):
 * o corte da página cai justo dentro do grupo empatado, que fica em ordem
 * indefinida. O último critério passado aqui tem que ser uma coluna (ou
 * conjunto de colunas) ÚNICA na tabela para a consulta em questão — confira
 * o `unique`/`primary key` em `supabase/migrations` antes de escolher, não
 * chute (ex.: em `mp_carteira`, `seller_id` sozinho não basta, porque o
 * mesmo seller aparece uma vez por snapshot; precisa `data_referencia` junto).
 *
 * Erro sobe como exceção, de propósito, DEPOIS de esgotar as tentativas.
 * Engolir e devolver lista vazia faria a tela dizer "Nenhum cliente ainda"
 * quando o banco só falhou — mentira pior que um erro na cara.
 *
 * ponytail: carrega a carteira inteira pro navegador, que filtra e pagina lá.
 * Se a base passar de ~10 mil, migrar busca/paginação pro servidor.
 */
export async function buscarTudo<T>(consulta: Consulta<T>, ordenarPor: OrdemColuna | OrdemColuna[]): Promise<T[]> {
  const ordens = Array.isArray(ordenarPor) ? ordenarPor : [ordenarPor]

  // SEM `head: true` de propósito, apesar do custo ser pra pegar só a
  // contagem: requisição HEAD nunca tem corpo, nem no sucesso nem no erro —
  // e sem corpo, um erro real do Postgres (RLS, timeout, o que for) chega
  // aqui como `{ message: '' }`, sem detalhe nenhum pra investigar. Erro
  // repetido em produção, sempre vazio, forçou essa troca: o custo extra é
  // 1 linha de dado real (a primeira página já ia trazer de qualquer jeito),
  // e em troca, um erro vem com mensagem/código de verdade.
  const contagem = await comRetentativa(() => aplicarOrdem(consulta({ count: 'exact' }), ordens).range(0, 0))
  if (contagem.error) {
    throw new Error(`Falha ao contar as linhas: ${descreverErro(contagem.error, contagem.status, contagem.statusText)}`)
  }
  if (!contagem.count) return []

  const paginas = Math.ceil(contagem.count / PAGINA)
  const partes = await Promise.all(
    Array.from({ length: paginas }, (_, i) =>
      comRetentativa(() => aplicarOrdem(consulta({}), ordens).range(i * PAGINA, (i + 1) * PAGINA - 1)),
    ),
  )

  const falha = partes.find(p => p.error)
  if (falha) throw new Error(`Falha ao buscar as linhas: ${descreverErro(falha.error!, falha.status, falha.statusText)}`)

  return partes.flatMap(p => p.data ?? [])
}
