// Busca de tabela grande sem enfileirar ida e volta.

/** Teto de linhas que o PostgREST devolve por resposta. Não é opcional: pedir
 *  `limit=5000` devolve 1000 do mesmo jeito, então paginar é obrigatório. */
const PAGINA = 1000

interface Resposta<T> {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

/**
 * A consulta, parametrizada pelo helper. Recebe as opções do `.select()` e a
 * faixa de linhas — o chamador escreve colunas, filtros e ordem UMA vez, e o
 * helper decide quantas vezes chamar.
 */
type Consulta<T> = (
  opcoes: { count?: 'exact'; head?: boolean },
  de: number,
  ate: number,
) => PromiseLike<Resposta<T>>

const TENTATIVAS = 5
const ESPERA_BASE_MS = 500

function esperar(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Descreve o erro pro log do servidor mesmo quando `.message` vem vazio —
 *  já aconteceu em produção (instabilidade de rede: o erro que a lib do
 *  Supabase devolve às vezes não tem mensagem nenhuma, só o objeto cru). */
function descreverErro(error: { message: string }): string {
  return error.message || JSON.stringify(error) || 'erro sem detalhe'
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
 * Conta primeiro (a resposta é só um header, ~230ms) e aí dispara as páginas
 * todas de uma vez: o custo passa a ser o da página mais lenta, não a soma.
 *
 * Erro sobe como exceção, de propósito, DEPOIS de esgotar as tentativas.
 * Engolir e devolver lista vazia faria a tela dizer "Nenhum cliente ainda"
 * quando o banco só falhou — mentira pior que um erro na cara.
 *
 * ponytail: carrega a carteira inteira pro navegador, que filtra e pagina lá.
 * Se a base passar de ~10 mil, migrar busca/paginação pro servidor.
 */
export async function buscarTudo<T>(consulta: Consulta<T>): Promise<T[]> {
  const { count, error } = await comRetentativa(() => consulta({ count: 'exact', head: true }, 0, 0))
  if (error) throw new Error(`Falha ao contar as linhas: ${descreverErro(error)}`)
  if (!count) return []

  const paginas = Math.ceil(count / PAGINA)
  const partes = await Promise.all(
    Array.from({ length: paginas }, (_, i) => comRetentativa(() => consulta({}, i * PAGINA, (i + 1) * PAGINA - 1))),
  )

  const falha = partes.find(p => p.error)
  if (falha) throw new Error(`Falha ao buscar as linhas: ${descreverErro(falha.error!)}`)

  return partes.flatMap(p => p.data ?? [])
}
