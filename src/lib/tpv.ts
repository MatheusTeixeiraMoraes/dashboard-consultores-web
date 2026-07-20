// Comparação honesta de TPV entre um mês em curso e o mês fechado.
//
// O PROBLEMA, nas palavras do dono:
//   "se eu subo a planilha no dia 20, o TPV que vai ter lá é referente do dia 1
//    ao dia 20. Porém TPV mês anterior é sempre fechado, de todos os dias do
//    mês passado."
//
// Comparar os dois valores brutos é comparar 13 dias com 30. Na planilha de
// 13/07 isso dava −62%, quando a verdade era −12,1%.
//
// A saída é dividir os dois pelo número de dias de cada período: o
// resultado é um RITMO (R$ por dia), que é comparável desde o dia 1 e não
// depende de projeção nenhuma.
//
// Este é o único lugar do painel que calcula em vez de espelhar, e é
// deliberado: sem isso, a tela mostra um número que engana. O valor bruto da
// planilha continua aparecendo ao lado, para conferência.

/**
 * Dias do mês, ou até `ateDia` inclusive. Conta SEGUNDA A SEGUNDA.
 *
 * A carteira é de comércio — padaria, restaurante, mercearia — e comércio
 * fatura no sábado, no domingo e no feriado. Contar só dias úteis (seg-sex)
 * subestimaria o denominador e mostraria um ritmo diário maior do que o real.
 *
 * De quebra, some a dependência de calendário de feriados: como todo dia conta,
 * não há dia especial para tratar.
 */
export function diasCorridos(ano: number, mes: number, ateDia?: number): number {
  return ateDia ?? new Date(ano, mes, 0).getDate()
}

/** Quebra "2026-07-13" em partes, sem passar por Date (que aplica fuso). */
export function partesData(iso: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return { ano, mes, dia }
}

export interface RitmoTPV {
  /** R$ por dia no mês em curso. */
  ritmoAtual: number
  /** R$ por dia no mês fechado anterior. */
  ritmoPassado: number
  /** Variação do ritmo: 0.12 = +12%. null se não dá para comparar. */
  variacao: number | null
  /** Onde o mês fecha se o ritmo se mantiver — estimativa, rotulada como tal. */
  projecaoMes: number
  diasDecorridos: number
  diasMesPassado: number
}

/**
 * Compara o mês em curso com o mês passado, normalizando por dia.
 *
 * `dataSnapshot` é a data da planilha (ex.: "2026-07-13") — o mês anterior é
 * deduzido dela, virando o ano quando preciso.
 */
export function compararRitmo(
  tpvMesAtual: number | null,
  tpvMesPassado: number | null,
  dataSnapshot: string,
): RitmoTPV {
  const { ano, mes, dia } = partesData(dataSnapshot)
  const diasDecorridos = diasCorridos(ano, mes, dia)
  const anoAnt = mes === 1 ? ano - 1 : ano
  const mesAnt = mes === 1 ? 12 : mes - 1
  const diasMesPassado = diasCorridos(anoAnt, mesAnt)
  const diasMesTodo = diasCorridos(ano, mes)

  const atual = tpvMesAtual ?? 0
  const passado = tpvMesPassado ?? 0
  const ritmoAtual = diasDecorridos > 0 ? atual / diasDecorridos : 0
  const ritmoPassado = diasMesPassado > 0 ? passado / diasMesPassado : 0

  return {
    ritmoAtual,
    ritmoPassado,
    // Sem base de comparação, "caiu 100%" seria tão errado quanto "subiu": quem
    // não faturava nada no mês passado não caiu, apenas não tem histórico.
    variacao: ritmoPassado > 0 ? ritmoAtual / ritmoPassado - 1 : null,
    projecaoMes: ritmoAtual * diasMesTodo,
    diasDecorridos,
    diasMesPassado,
  }
}

/** Um ponto da série: quanto o cliente tinha acumulado naquela data. */
export interface PontoTPV {
  data: string        // ISO, a data_referencia do snapshot
  tpv: number | null  // acumulado do mês até aquela data
}

export interface Estagnacao {
  /** Dias corridos desde a última vez que o acumulado subiu. null = não dá para saber. */
  diasSemVender: number | null
  /** Data do último envio em que o TPV subiu. */
  ultimaVenda: string | null
  /** Quanto faturou entre os dois envios mais recentes. */
  ultimoDelta: number | null
  /** false quando só há um envio no mês — a série ainda não diz nada. */
  temSerie: boolean
}

/**
 * Há quantos dias o cliente não fatura, medido pela diferença entre envios.
 *
 * O TPV da planilha é ACUMULADO do mês. Então, entre dois envios, a diferença é
 * exatamente o que o cliente faturou no intervalo — isso é fato, não estimativa.
 * Se o acumulado não mudou, ele não vendeu.
 *
 * ARMADILHA TRATADA: o acumulado ZERA quando vira o mês. Comparar 31/07 com
 * 01/08 mostraria uma queda de 100% no melhor cliente da base. Por isso a série
 * é cortada no mês do snapshot mais recente — só se compara dentro do mesmo mês.
 */
export function estagnacao(serie: PontoTPV[]): Estagnacao {
  const ordenada = [...serie]
    .filter(p => p.data)
    .sort((a, b) => a.data.localeCompare(b.data))
  if (ordenada.length === 0) return { diasSemVender: null, ultimaVenda: null, ultimoDelta: null, temSerie: false }

  const ultimo = ordenada[ordenada.length - 1]
  const mesAtual = ultimo.data.slice(0, 7)
  const doMes = ordenada.filter(p => p.data.slice(0, 7) === mesAtual)

  // Um único envio no mês: não existe intervalo para medir.
  if (doMes.length < 2) return { diasSemVender: null, ultimaVenda: null, ultimoDelta: null, temSerie: false }

  const dif = (a: string, b: string) =>
    Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000)

  // Caminha de trás para frente até achar o envio em que o acumulado subiu.
  let ultimaVenda: string | null = null
  for (let i = doMes.length - 1; i > 0; i--) {
    const delta = (doMes[i].tpv ?? 0) - (doMes[i - 1].tpv ?? 0)
    if (delta > 0) { ultimaVenda = doMes[i].data; break }
  }

  const ultimoDelta = (doMes[doMes.length - 1].tpv ?? 0) - (doMes[doMes.length - 2].tpv ?? 0)

  return {
    // Sem nenhuma subida no mês inteiro, conta desde o primeiro envio: é o
    // máximo que a série consegue provar.
    diasSemVender: dif(ultimaVenda ?? doMes[0].data, ultimo.data),
    ultimaVenda,
    ultimoDelta,
    temSerie: true,
  }
}

/** Faixas de variação, para colorir e filtrar sem espalhar número mágico. */
export type FaixaTPV = 'queda-forte' | 'queda' | 'estavel' | 'alta' | 'sem-base'

export function faixaTPV(variacao: number | null): FaixaTPV {
  if (variacao === null) return 'sem-base'
  if (variacao <= -0.3) return 'queda-forte'
  if (variacao <= -0.1) return 'queda'
  if (variacao >= 0.1) return 'alta'
  return 'estavel'
}

export const ROTULO_FAIXA: Record<FaixaTPV, string> = {
  'queda-forte': 'Queda forte (-30% ou mais)',
  'queda': 'Queda (-10% a -30%)',
  'estavel': 'Estável (-10% a +10%)',
  'alta': 'Em alta (+10% ou mais)',
  'sem-base': 'Sem base de comparação',
}
