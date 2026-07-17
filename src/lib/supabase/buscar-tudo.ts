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
 * Erro sobe como exceção, de propósito. Engolir e devolver lista vazia faria a
 * tela dizer "Nenhum cliente ainda" quando o banco só falhou — mentira pior que
 * um erro na cara.
 *
 * ponytail: carrega a carteira inteira pro navegador, que filtra e pagina lá.
 * Se a base passar de ~10 mil, migrar busca/paginação pro servidor.
 */
export async function buscarTudo<T>(consulta: Consulta<T>): Promise<T[]> {
  const { count, error } = await consulta({ count: 'exact', head: true }, 0, 0)
  if (error) throw new Error(`Falha ao contar as linhas: ${error.message}`)
  if (!count) return []

  const paginas = Math.ceil(count / PAGINA)
  const partes = await Promise.all(
    Array.from({ length: paginas }, (_, i) => consulta({}, i * PAGINA, (i + 1) * PAGINA - 1)),
  )

  const falha = partes.find(p => p.error)
  if (falha) throw new Error(`Falha ao buscar as linhas: ${falha.error!.message}`)

  return partes.flatMap(p => p.data ?? [])
}
