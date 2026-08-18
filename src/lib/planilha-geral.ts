// Leitura da "Planilha Geral" que o Mercado Pago manda todo mês.
//
// É um SNAPSHOT da carteira: uma linha por cliente, com o que o MP mandou fazer
// com ele (os "acionáveis"), a prioridade e o contexto da abordagem.
//
// Esta planilha NÃO se mistura com a tabela `clientes`. `clientes` é cadastro
// editável, usado para gerar rotas (Radar/Roteirizar); isto aqui é snapshot
// descartável, substituído a cada mês. O import nunca escreve em `clientes` —
// a tela só consulta nome/telefone por seller_id na hora de exibir.
//
// Ela identifica o cliente APENAS por `ID SELLER`: não traz nome, telefone,
// endereço nem documento.

import { findCol } from './pilares.ts'

/** Os 12 acionáveis conhecidos, na planilha de 13/07/2026. Ver ACIONAVEIS_ESPERADOS. */
export const ACIONAVEIS = [
  'Limpeza de balcão 1x',
  'Aumentar TPV',
  'Oferecer device com cupom',
  'Limpeza de balcão parcelado',
  'Reverter queda TPV',
  'Assinar software',
  'Habilitar open finance',
  'Ofertar investimentos',
  'Renegociar dívida',
  'Pausa cobrança autom. dívidas',
  'Prevenir churn',
  'Reativar seller',
] as const

const MESES: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
}

/**
 * Converte a data por extenso da planilha para ISO.
 *
 * O MP manda "26 de jun. de 2026" — texto, não data do Excel. Vazio e "-"
 * viram null: 11% dos clientes nunca foram contatados, e isso é informação
 * ("nunca"), não erro.
 *
 * DT_ULTIMA_TRANSACAO (chegou em 18/08/2026) vem num formato DIFERENTE —
 * "16/08/2026", dia/mês/ano com barra — por isso o segundo formato aqui.
 */
export function parseData(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s || s === '-') return null

  const m = s.match(/^(\d{1,2})\s+de\s+([a-zç]+)\.?\s+de\s+(\d{4})$/i)
  if (m) {
    const mes = MESES[m[2].toLowerCase().slice(0, 3)]
    if (mes) return `${m[3]}-${mes}-${m[1].padStart(2, '0')}`
  }
  const barra = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (barra) return `${barra[3]}-${barra[2].padStart(2, '0')}-${barra[1].padStart(2, '0')}`
  // Fallback: se um dia vier como data do Excel ou ISO, aproveita.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

/** Número tolerante a vírgula decimal e a "-" (que na planilha significa vazio). */
export function paraNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (!s || s === '-') return null
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** "SIM" -> true. Qualquer outra coisa (inclusive "-") -> false. */
export const paraBool = (v: unknown) => String(v ?? '').trim().toUpperCase() === 'SIM'

/**
 * Separa a lista multivalorada de acionáveis.
 *
 * O separador é vírgula E quebra de linha — na planilha real os itens vêm como
 * "Limpeza de balcão 1x\n,Aumentar TPV". Errar o split não dá erro: dá uma fila
 * com clientes faltando e ninguém percebe. Por isso o import confere a
 * contagem contra a coluna "#ACIONÁVEIS COMERCIAIS".
 */
export function separarAcionaveis(v: unknown): string[] {
  return String(v ?? '')
    .split(/[\n\r,]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

export interface ClienteSnapshot {
  seller_id: string
  consultor_nome: string
  status: string
  quartil: string
  prio: number | null
  tpv_mes_atual: number | null
  tpv_mes_passado: number | null
  status_credito: string
  mcc: string
  recorrencia: string
  ultimo_contato: string | null
  pesquisa_recente: string | null
  multicontas: number | null
  tpv_outras_contas: number | null
  oportunidade_1x: boolean
  valor_1x: number | null
  ating_1x: number | null
  revertido_1x: boolean
  oportunidade_parc: boolean
  valor_parc: number | null
  ating_parc: number | null
  revertido_parc: boolean
  qtd_acionaveis: number

  // Colunas novas de 18/08/2026 — TPV multi-mês, tudo pronto do MP.
  /** TPV do mês passado, só até o mesmo dia da planilha atual — comparável
   *  direto com tpv_mes_atual, sem dividir por dias. */
  tpv_mesma_data_mes_passado: number | null
  tpv_m2: number | null   // mês fechado de 2 meses atrás (M-2)
  tpv_m3: number | null   // mês fechado de 3 meses atrás (M-3)
  /** Dias corridos desde a última transação na maquininha — do MP, não derivado. */
  dias_sem_transacionar: number | null
  dt_ultima_transacao: string | null
  // "vs": valor = período MAIS RECENTE − período MAIS ANTIGO. Positivo =
  // cresceu, negativo = caiu. Confirmado linha a linha contra a planilha real.
  tpv_m3_vs_m1: number | null
  tpv_m2_vs_m1: number | null
  tpv_m0_vs_mesma_data: number | null
}

export interface AcaoSnapshot {
  seller_id: string
  consultor_nome: string
  acionavel: string
}

export interface Lido {
  clientes: ClienteSnapshot[]
  acoes: AcaoSnapshot[]
  /** Quantos clientes por acionável — o import confere isto contra o esperado. */
  totaisPorAcionavel: Record<string, number>
  /** Nomes de consultor encontrados, para o import avisar quem não casou. */
  consultores: string[]
}

/** Erro de leitura com a linha citada — import parcial deixa o banco pior. */
export class ErroPlanilha extends Error {}

/**
 * Lê a planilha inteira, ou levanta erro.
 *
 * Levanta (em vez de pular a linha) de propósito: o import é delete+insert, e
 * um import parcial deixa a carteira do consultor faltando pedaço sem nada na
 * tela indicando isso. Melhor não importar do que importar errado.
 */
export function lerPlanilhaGeral(linhas: Record<string, unknown>[]): Lido {
  if (linhas.length === 0) throw new ErroPlanilha('Planilha vazia.')

  const h = Object.keys(linhas[0])
  // findCol tolera acento, caixa e espaço nas bordas — " TPV ESTE MÊS " vem
  // com espaço dos dois lados na planilha real.
  const col = {
    seller: findCol(h, 'ID SELLER'),
    consultor: findCol(h, 'CONSULTOR'),
    status: findCol(h, 'STATUS'),
    quartil: findCol(h, 'QUARTIL DE PRIORIDADE'),
    prio: findCol(h, 'PRIO'),
    lista: findCol(h, 'LISTA ACIONÁVEIS COMERCIAIS'),
    qtd: findCol(h, '#ACIONÁVEIS COMERCIAIS'),
    tpvAtual: findCol(h, 'TPV ESTE MÊS'),
    tpvPassado: findCol(h, 'TPV MÊS PASSADO'),
    credito: findCol(h, 'STATUS CRÉDITO'),
    mcc: findCol(h, 'MCC'),
    recorrencia: findCol(h, 'RECORRÊNCIA'),
    contato: findCol(h, 'ÚLTIMO CONTATO'),
    pesquisa: findCol(h, 'PESQUISA MAIS RECENTE'),
    multicontas: findCol(h, 'MULTICONTAS'),
    outrasContas: findCol(h, 'TPV OUTRAS CONTAS'),
    op1x: findCol(h, 'OPORTUNIDADE LIMPEZA 1X'),
    val1x: findCol(h, 'TPV_ACT_1X'),
    at1x: findCol(h, 'ATING_1X'),
    rev1x: findCol(h, 'REVERTIDO_1X'),
    opParc: findCol(h, 'OPORTUNIDADE LIMPEZA PARCELADO'),
    valParc: findCol(h, 'TPV_ACT_PARC'),
    atParc: findCol(h, 'ATING_PARC'),
    revParc: findCol(h, 'REVERTIDO_PARC'),

    // Colunas novas de 18/08/2026.
    mesmaData: findCol(h, 'TPV MESMA DATA MÊS PASSADO'),
    tpvM2: findCol(h, 'TPV M-2'),
    tpvM3: findCol(h, 'TPV M-3'),
    diasSemTransacionar: findCol(h, 'DIAS SEM TRANSACIONAR'),
    dtUltimaTransacao: findCol(h, 'DT_ULTIMA_TRANSACAO'),
    m3vsM1: findCol(h, 'TPV M3 vs M1'),
    m2vsM1: findCol(h, 'TPV M2 vs M1'),
    m0vsMesmaData: findCol(h, 'TPV M0 vs Mesma data mês anterior'),
  }

  const obrigatorias: (keyof typeof col)[] = ['seller', 'consultor', 'lista', 'qtd', 'quartil', 'status']
  const faltando = obrigatorias.filter(k => !col[k])
  if (faltando.length) {
    throw new ErroPlanilha(
      `Colunas obrigatórias não encontradas: ${faltando.join(', ')}.\n` +
      `A planilha tem: ${h.map(x => x.trim()).join(', ')}`,
    )
  }

  const txt = (r: Record<string, unknown>, c: string | null) => (c ? String(r[c] ?? '').trim() : '')
  const clientes: ClienteSnapshot[] = []
  const acoes: AcaoSnapshot[] = []
  const totaisPorAcionavel: Record<string, number> = {}
  const consultores = new Set<string>()
  const vistos = new Set<string>()

  linhas.forEach((r, i) => {
    const seller_id = txt(r, col.seller)
    if (!seller_id) return          // linha em branco no fim da planilha

    // A planilha é um snapshot por cliente: seller repetido significa arquivo
    // errado (dois meses colados, por exemplo), e o unique do banco recusaria.
    if (vistos.has(seller_id)) {
      throw new ErroPlanilha(`Linha ${i + 2}: seller ${seller_id} aparece duas vezes na planilha.`)
    }
    vistos.add(seller_id)

    const consultor_nome = txt(r, col.consultor)
    consultores.add(consultor_nome)

    const lista = separarAcionaveis(r[col.lista!])
    const qtdDeclarada = paraNumero(r[col.qtd!])
    // A guarda que impede o split silencioso de errar: se o separador mudar, a
    // contagem deixa de bater e o import para em vez de gravar fila incompleta.
    if (qtdDeclarada !== null && lista.length !== qtdDeclarada) {
      throw new ErroPlanilha(
        `Linha ${i + 2} (seller ${seller_id}): a planilha diz ${qtdDeclarada} acionáveis, ` +
        `mas a lista tem ${lista.length} — "${txt(r, col.lista)}"`,
      )
    }

    clientes.push({
      seller_id,
      consultor_nome,
      status: txt(r, col.status),
      quartil: txt(r, col.quartil),
      prio: paraNumero(r[col.prio!]),
      tpv_mes_atual: paraNumero(r[col.tpvAtual!]),
      tpv_mes_passado: paraNumero(r[col.tpvPassado!]),
      status_credito: txt(r, col.credito),
      mcc: txt(r, col.mcc),
      recorrencia: txt(r, col.recorrencia),
      ultimo_contato: parseData(r[col.contato!]),
      pesquisa_recente: parseData(r[col.pesquisa!]),
      multicontas: paraNumero(r[col.multicontas!]),
      tpv_outras_contas: paraNumero(r[col.outrasContas!]),
      oportunidade_1x: paraBool(r[col.op1x!]),
      valor_1x: paraNumero(r[col.val1x!]),
      ating_1x: paraNumero(r[col.at1x!]),
      revertido_1x: paraNumero(r[col.rev1x!]) === 1,
      oportunidade_parc: paraBool(r[col.opParc!]),
      valor_parc: paraNumero(r[col.valParc!]),
      ating_parc: paraNumero(r[col.atParc!]),
      revertido_parc: paraNumero(r[col.revParc!]) === 1,
      qtd_acionaveis: lista.length,

      tpv_mesma_data_mes_passado: paraNumero(r[col.mesmaData!]),
      tpv_m2: paraNumero(r[col.tpvM2!]),
      tpv_m3: paraNumero(r[col.tpvM3!]),
      dias_sem_transacionar: paraNumero(r[col.diasSemTransacionar!]),
      dt_ultima_transacao: parseData(r[col.dtUltimaTransacao!]),
      tpv_m3_vs_m1: paraNumero(r[col.m3vsM1!]),
      tpv_m2_vs_m1: paraNumero(r[col.m2vsM1!]),
      tpv_m0_vs_mesma_data: paraNumero(r[col.m0vsMesmaData!]),
    })

    for (const acionavel of lista) {
      acoes.push({ seller_id, consultor_nome, acionavel })
      totaisPorAcionavel[acionavel] = (totaisPorAcionavel[acionavel] ?? 0) + 1
    }
  })

  return {
    clientes,
    acoes,
    totaisPorAcionavel,
    consultores: [...consultores].filter(Boolean).sort(),
  }
}

/**
 * Acionáveis que aparecem na planilha e não estão na lista conhecida.
 *
 * Não é erro: o MP pode criar um acionável novo. Mas o import mostra na tela,
 * porque um nome novo aparecendo em silêncio é como a gente descobre tarde que
 * a planilha mudou de formato.
 */
export function acionaveisDesconhecidos(totais: Record<string, number>): string[] {
  const conhecidos = new Set<string>(ACIONAVEIS)
  return Object.keys(totais).filter(a => !conhecidos.has(a))
}
