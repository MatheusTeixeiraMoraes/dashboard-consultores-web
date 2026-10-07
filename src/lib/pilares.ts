import type { PilarKey } from './types'

/**
 * Contrato único das planilhas do Mercado Pago.
 *
 * Os nomes de coluna aqui são EXATAMENTE os cabeçalhos dos .xlsx. Toda leitura
 * (upload) e toda exibição (telas) passam por aqui — se o MP mudar o layout da
 * planilha, este arquivo é o único lugar a mexer.
 *
 * O dashboard espelha a planilha: o score de cada pilar vem pronto na coluna de
 * SCORE e nunca é recalculado. A curva de pontuação do MP não é linear (um
 * consultor com -2,28% de net churn tira 3/3 e outro com -4,15% tira 0), então
 * qualquer tentativa de derivar o score daria número errado.
 */

export type ColType = 'currency' | 'percent' | 'int' | 'decimal'

export interface ColSpec {
  /** Cabeçalho exato na planilha. */
  col: string
  /** Como aparece na tela. */
  label: string
  type: ColType
}

export interface PilarSpec {
  key: PilarKey
  label: string
  color: string
  grupo: 'atuacao' | 'resultado'
  /** Coluna com o score já pontuado pelo MP. */
  scoreCol: string
  /** Coluna da métrica principal — a que é confrontada com a meta. */
  valorCol: string
  /** Todas as colunas de métrica da planilha, na ordem de exibição. */
  cols: ColSpec[]
  /** Valor maior é melhor. Falso só se algum pilar inverter (hoje nenhum). */
  maiorMelhor: boolean
  /** Nota curta exibida no card, quando o pilar precisa de contexto. */
  nota?: string
}

export const PILARES: Record<PilarKey, PilarSpec> = {
  awareness: {
    key: 'awareness',
    label: 'Awareness',
    color: 'var(--color-pilar-awareness)',
    grupo: 'atuacao',
    scoreCol: 'SCORE pesquisa',
    valorCol: '%Awareness',
    maiorMelhor: true,
    // Meta (05/10/2026 em diante): quantidade de respostas por tamanho da carteira
    // ativa — ver metaAwareness mais abaixo. valorCol continua sendo o %Awareness
    // pra não misturar % e quantidade na mesma série do histórico.
    nota: 'meta = respostas por carteira ativa',
    cols: [
      { col: 'Sellers visitados',                 label: 'Sellers visitados',                 type: 'int' },
      { col: 'Sellers que responderam pesquisa',  label: 'Sellers que responderam pesquisa',  type: 'int' },
      { col: '%Awareness',                        label: '% Awareness',                       type: 'percent' },
    ],
  },

  produtividade: {
    key: 'produtividade',
    label: 'Produtividade',
    color: 'var(--color-pilar-produtividade)',
    grupo: 'atuacao',
    scoreCol: 'SCORE prod',
    valorCol: 'Prod média por dia útil',
    maiorMelhor: true,
    cols: [
      { col: 'Visitas',                        label: 'Visitas',                        type: 'int' },
      { col: 'Visitas efetivas',               label: 'Visitas efetivas',               type: 'int' },
      { col: 'Sellers visitados',              label: 'Sellers visitados',              type: 'int' },
      { col: 'Visitas por dia útil',           label: 'Visitas por dia útil',           type: 'decimal' },
      { col: 'Visitas efetivas por dia útil',  label: 'Visitas efetivas por dia útil',  type: 'decimal' },
      { col: 'Prod média por dia útil',        label: 'Prod média por dia útil',        type: 'decimal' },
    ],
  },

  aderencia: {
    key: 'aderencia',
    label: 'Aderência a Agenda',
    color: 'var(--color-pilar-aderencia)',
    grupo: 'atuacao',
    scoreCol: 'SCORE aderência à agenda',
    valorCol: '%Aderência à agenda',
    maiorMelhor: true,
    cols: [
      { col: 'Sellers agendados',           label: 'Sellers agendados',           type: 'int' },
      { col: 'Sellers aderentes à agenda',  label: 'Sellers aderentes à agenda',  type: 'int' },
      { col: 'Sellers visitados',           label: 'Sellers visitados',           type: 'int' },
      { col: '%Aderência à agenda',         label: '% Aderência à agenda',        type: 'percent' },
    ],
  },

  tpv: {
    key: 'tpv',
    label: 'TPV',
    color: 'var(--color-pilar-tpv)',
    grupo: 'resultado',
    scoreCol: 'SCORE tpv',
    valorCol: 'Variação de TPV versus mês passado',
    maiorMelhor: true,
    // Meta (20/08/2026 em diante): deixou de ser um % fixo digitado à mão em
    // pillar_config e virou o valor exato que o MP já manda por consultor na
    // coluna "Objetivo TPV Total Atual" — ver usarObjetivoTPV em PilaresDetalhe.tsx.
    nota: 'meta = objetivo definido pelo MP',
    cols: [
      { col: 'TPV Total mês atual',                 label: 'TPV total mês atual',      type: 'currency' },
      { col: 'TPV Total mês passado',               label: 'TPV total mês passado',    type: 'currency' },
      { col: 'TPV médio mês atual',                 label: 'TPV médio mês atual',      type: 'currency' },
      { col: 'TPV médio mês passado',               label: 'TPV médio mês passado',    type: 'currency' },
      { col: 'Variação de TPV versus mês passado',  label: 'Variação vs mês passado',  type: 'percent' },
      { col: 'Objetivo TPV Total Atual',             label: 'Objetivo TPV (mês atual)', type: 'currency' },
    ],
  },

  net_churn: {
    key: 'net_churn',
    label: 'Net Churn',
    color: 'var(--color-pilar-net-churn)',
    grupo: 'resultado',
    scoreCol: 'SCORE net churn',
    valorCol: '%Net churn',
    // Negativo = perdeu sellers (Marceli: -15,04% → score 0).
    // Positivo = cresceu. Logo, maior é melhor — o inverso do que o card dizia antes.
    maiorMelhor: true,
    nota: 'negativo = perdeu sellers',
    cols: [
      { col: 'Sellers ativos mês atual',    label: 'Sellers ativos mês atual',    type: 'int' },
      { col: 'Sellers ativos mês passado',  label: 'Sellers ativos mês passado',  type: 'int' },
      { col: 'Sellers em churn',            label: 'Sellers em churn',            type: 'int' },
      { col: 'Sellers Reativados',          label: 'Sellers reativados',          type: 'int' },
      { col: '%Net churn',                  label: '% Net churn',                 type: 'percent' },
    ],
  },

  acionaveis: {
    key: 'acionaveis',
    label: 'Acionáveis Comerciais',
    color: 'var(--color-pilar-acionaveis)',
    grupo: 'resultado',
    scoreCol: 'SCORE acionáveis comerciais',
    valorCol: 'Total Acionáveis %Tarefa-Revertido',
    maiorMelhor: true,
    cols: [
      { col: 'Total Acionáveis Tarefas',              label: 'Total de tarefas',        type: 'int' },
      { col: 'Total Acionáveis Revertido',            label: 'Total revertido',         type: 'int' },
      { col: 'Total Acionáveis %Tarefa-Revertido',    label: '% Tarefa revertida',      type: 'percent' },
    ],
  },
}

export const GRUPOS = [
  { key: 'atuacao',   label: 'Atuação',   pilares: ['awareness', 'produtividade', 'aderencia'] },
  { key: 'resultado', label: 'Resultado', pilares: ['tpv', 'net_churn', 'acionaveis'] },
] as const

export const PILAR_KEYS = Object.keys(PILARES) as PilarKey[]

/** Colunas de identificação, iguais em toda planilha. */
export const COL_CARTEIRA = 'ID Carteira'
export const COL_NOME = 'Executivo'

export function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/**
 * Acha o cabeçalho real correspondente a `target`, tolerando acento, caixa e
 * espaço. Sem match por prefixo: um palpite errado aqui vira número errado na
 * tela — melhor a coluna faltar e o erro aparecer no upload.
 */
export function findCol(headers: string[], target: string): string | null {
  return headers.find(h => h === target)
    ?? headers.find(h => norm(h) === norm(target))
    ?? null
}

/**
 * Fator para levar uma coluna de percentual à escala 0–100 (×100 ou ×1).
 *
 * As planilhas do MP mandam percentuais como decimal (0,4615 = 46,15%), mas as
 * células vêm sem formato de porcentagem no Excel — não dá pra perguntar ao
 * arquivo. A decisão é tomada olhando a COLUNA INTEIRA, nunca a célula isolada
 * (decidir por célula transformaria 0,35% de net churn em 35%).
 *
 * Usa a MEDIANA, não o maior valor. O "% Variação de TPV" é uma razão
 * (atual ÷ passado) que orbita 1,0: quem cai fica < 1, quem cresce fica > 1.
 * Com o corte no maior valor, bastava um consultor crescer para a coluna
 * "estourar" 1,0 e ser tratada como já-em-0–100 — aí o TPV inteiro aparecia
 * como 1,01% em vez de 100,79%. A mediana de uma coluna decimal fica sempre
 * perto de 0–1 (a do TPV ~0,95, cresça quem crescer); uma coluna genuinamente
 * em 0–100 tem mediana nas dezenas.
 *
 * Limitação: para métricas cujo valor típico é pequeno (net churn ~2%), decimal
 * (0,02) e já-em-0–100 (2,0) são indistinguíveis por magnitude. Todas as
 * planilhas vistas até hoje vêm em decimal; se um dia o MP mandar net churn em
 * 0–100, esta coluna específica precisará de tratamento à parte.
 */
const LIMIAR_ESCALA_0_100 = 5

export function escalaPercentual(valores: number[]): 1 | 100 {
  const abs = valores
    .filter(v => Number.isFinite(v) && v !== 0)
    .map(Math.abs)
    .sort((a, b) => a - b)
  if (abs.length === 0) return 1
  const mediana = abs[Math.floor(abs.length / 2)]
  return mediana >= LIMIAR_ESCALA_0_100 ? 1 : 100
}

// ---------------------------------------------------------------------------
// Formatação
//
// Percentuais já chegam aqui na escala 0–100: a conversão acontece uma única
// vez, no upload (escalaPercentual). Daqui pra frente é só formatar.
// ---------------------------------------------------------------------------

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
})

export function fmtValor(type: ColType, val: unknown): string {
  if (val === '' || val == null) return '—'
  const n = Number(val)
  if (!Number.isFinite(n)) return String(val)

  switch (type) {
    case 'currency': return BRL.format(n)
    case 'percent':  return `${n.toFixed(2).replace('.', ',')}%`
    case 'int':      return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
    case 'decimal':  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
}

export function fmtMeta(meta: number, unidade: string): string {
  const s = (Math.abs(meta) % 1 === 0 ? meta.toFixed(0) : meta.toFixed(1)).replace('.', ',')
  return unidade === '%' ? `${s}%` : s
}

/**
 * Quanto falta pra bater a meta, em pontos percentuais (ou unidades).
 * Negativo = já passou da meta.
 *
 * Ex.: TPV meta 106%, atual 95,1% → faltam 10,9 pontos percentuais.
 */
export function calcFaltam(valor: number, meta: number, tipoComp: string): number {
  return tipoComp === 'le' ? valor - meta : meta - valor
}

/** Uma linha da tabela `metas_acionaveis_faixas` — a partir de quantos
 *  clientes na carteira, quantas tarefas revertidas valem a meta cheia. */
export interface FaixaAcionaveis {
  min_carteira: number
  meta_tarefas: number
}

/**
 * Acionáveis mudou de regra (19/08/2026): deixou de ser "% de tarefa
 * revertida" contra uma meta fixa e virou uma QUANTIDADE fixa de tarefas
 * revertidas, que varia pelo tamanho da carteira do consultor. O
 * `score_planilha` que o MP manda já reflete a regra nova (nunca é
 * recalculado aqui) — o que ficou desatualizado foi só a comparação de meta
 * que a tela fazia com `pillar_config.meta` (22,4%, da regra antiga).
 *
 * As faixas em si moram em `metas_acionaveis_faixas` (editável em
 * /dashboard/metas) — o MP manda uma quantidade nova todo mês, então não dá
 * pra deixar hardcoded aqui feito antes. `faixas` vazio (banco fora do ar,
 * ou tabela ainda sem seed) cai num fallback conservador de 6 tarefas fixas,
 * pra nunca travar a tela por falta de config.
 */
export function metaAcionaveis(carteiraSize: number, faixas: FaixaAcionaveis[]): number {
  if (faixas.length === 0) return 6
  let meta = faixas[0].meta_tarefas
  for (const f of [...faixas].sort((a, b) => a.min_carteira - b.min_carteira)) {
    if (carteiraSize >= f.min_carteira) meta = f.meta_tarefas
  }
  return meta
}

/** Uma linha da tabela `metas_awareness_faixas` — a partir de quantos sellers
 *  ATIVOS na carteira, quantas respostas de pesquisa valem a nota cheia. */
export interface FaixaAwareness {
  min_carteira: number
  meta_respostas: number
}

/** Piso do Awareness quando `pillar_config.piso_minimo` não chega (banco fora
 *  do ar, ou coluna ainda não criada) — o valor do slide do MP de 05/10/2026. */
export const PISO_AWARENESS_PADRAO = 40

/** Status que contam como carteira ATIVA. CHURN e INATIVO ficam de fora. */
export const STATUS_CARTEIRA_ATIVA = ['ATIVO', 'REATIVADO'] as const

export function ehCarteiraAtiva(status: string | null | undefined): boolean {
  return (STATUS_CARTEIRA_ATIVA as readonly string[]).includes((status ?? '').trim().toUpperCase())
}

/**
 * Awareness mudou de regra (05/10/2026, Bloco 1 — Atuação): deixou de ser "%
 * Awareness" em degraus e virou tudo-ou-nada contra uma QUANTIDADE de sellers
 * que responderam a pesquisa, que varia pelo tamanho da carteira ATIVA do
 * consultor (ATIVO + REATIVADO — `ehCarteiraAtiva`). Abaixo do PISO o Bloco 1
 * inteiro zera, então a meta efetiva nunca fica abaixo dele.
 *
 * É a carteira ATIVA, e não o total de linhas de `mp_carteira`, porque é ela que
 * reproduz a nota da planilha: conferido nos 10 consultores em 05 e 06/10/2026
 * (20 de 20). Contar CHURN e INATIVO errava a meta de 3 deles.
 *
 * Mesmo molde de `metaAcionaveis` (faixas editáveis em /dashboard/metas), mas
 * sem o fallback de número fixo: sem faixa que valha — tabela vazia, ou carteira
 * menor que a primeira faixa — a meta é o próprio piso.
 */
export function metaAwareness(carteiraAtiva: number, faixas: FaixaAwareness[], piso: number): number {
  const faixa = [...faixas]
    .sort((a, b) => b.min_carteira - a.min_carteira)
    .find(f => carteiraAtiva >= f.min_carteira)
  return Math.max(faixa?.meta_respostas ?? piso, piso)
}

/**
 * Net Churn: quantos sellers ATIVOS o consultor precisa ter ao FECHAR o mês para
 * o net churn ficar na meta (o T1 do MP, que é a meta de sempre, em pillar_config).
 *
 *   net churn = (ativos hoje − ativos do mês passado) ÷ ativos do mês passado
 *   net churn ≥ meta   ⇒   ativos hoje ≥ base × (1 + meta/100)
 *
 * Seller não vem pela metade, então arredonda PARA CIMA: numa base de 269, 264
 * ativos dão −1,86% (dentro de −2,10%) e 263 dão −2,23% (fora). A conta é em
 * inteiros (centésimos de ponto percentual) para que 250 × 0,98 = 245 exato não
 * vire 245,00000000000003 e exija um seller a mais sem motivo.
 *
 * Os dois lados da conta vêm da planilha (`Sellers ativos mês passado` e `…mês
 * atual`); isto não recalcula a nota do MP — só traduz a meta de % para sellers.
 * Conferido nas 410 linhas de net churn do banco (15/07 a 06/10/2026): o saldo
 * `atual − base` ÷ `base` reproduz o `%Net churn` da planilha em todas.
 *
 * A meta é lida com até 2 casas decimais, como o MP publica (2,10%); `base` é uma
 * contagem de sellers (inteiro).
 */
export function ativosMinimosNetChurn(base: number, metaPct: number): number {
  return Math.ceil((base * (10000 + Math.round(metaPct * 100))) / 10000)
}

/**
 * Como dizer a meta de Net Churn em telas que NÃO têm a base de cada consultor
 * (Por Área, Visão Geral) — onde o número em sellers não existe. O card do
 * consultor traz a conta em sellers (ver ativosMinimosNetChurn).
 */
export function textoMetaNetChurn(metaPct: number): string {
  if (metaPct < 0) return `perder no máx. ${fmtValor('percent', -metaPct)} dos sellers do mês passado`
  if (metaPct === 0) return 'não perder nenhum seller em relação ao mês passado'
  return `crescer pelo menos ${fmtValor('percent', metaPct)} sobre o mês passado`
}

/**
 * Aderência à agenda: quantos sellers AGENDADOS o consultor precisa ter visitado
 * (aderentes) para a aderência ficar na meta (o T1, em pillar_config).
 *
 *   aderência = aderentes ÷ agendados ≥ meta   ⇒   aderentes ≥ agendados × meta/100
 *
 * Arredonda PARA CIMA (seller não vem pela metade) e conta em inteiros (centésimos
 * de ponto percentual): 20 × 65% = 13 exato não vira 13,000000000000002 e pede 14.
 *
 * Agendados e aderentes são acumulados do mês e crescem todo dia, então o mínimo
 * de HOJE sobe quando entram novos agendados. Visita atrasada conta como aderente
 * (confirmado pelo usuário em 07/10/2026), por isso "faltam N" são visitas que
 * ainda dá para fazer entre os agendados sem visita.
 *
 * Conferido nas 410 linhas de aderência do banco (15/07 a 06/10/2026): aderentes ÷
 * agendados reproduz o `%Aderência à agenda` da planilha em todas. A nota do MP
 * não é recalculada aqui — só a meta é traduzida de % para visitas.
 */
export function aderentesMinimosAgenda(agendados: number, metaPct: number): number {
  // O teto evita pedir mais visitas do que há agendados se alguém salvar uma meta
  // acima de 100% por engano (meta 150 → "mínimo" de 38 para 25 agendados).
  return Math.min(agendados, Math.ceil((agendados * Math.round(metaPct * 100)) / 10000))
}

/**
 * Como dizer a meta de Aderência em telas sem a agenda de cada consultor (Por Área,
 * Visão Geral). Duas casas, como a conta e como o MP publica (65,00%).
 */
export function textoMetaAderencia(metaPct: number): string {
  return `${fmtValor('percent', metaPct)} dos sellers agendados visitados`
}

/** Célula em branco ou ausente vira NaN, e não 0: "a planilha não trouxe o dado" não é "zero". */
export function numeroOuNaN(v: unknown): number {
  return v === '' || v == null ? NaN : Number(v)
}

// ---------------------------------------------------------------------------
// Quantidade por consultor (tela Por Área)
//
// Uma porcentagem não diz ao consultor o que fazer. Para cada pilar que já tem a
// meta traduzida em número, estas funções dizem — com a mesma conta dos cards do
// Consultor/Meu Desempenho — "quanto" o consultor tem e "quanto falta" para a meta.
// A nota e a % continuam sendo as da planilha.
// ---------------------------------------------------------------------------

/** Pilares da tela Por Área que têm quantidade (Produtividade e TPV já são número/R$). */
export const PILARES_COM_QUANTIDADE: readonly PilarKey[] = ['net_churn', 'aderencia', 'awareness', 'acionaveis']

/** O que é preciso saber de cada consultor (e do pilar) para traduzir a meta em número. */
export interface ContextoQuantidade {
  /** `pillar_config.meta` do pilar (net churn: −2,1; aderência: 65). */
  meta: number
  /** Awareness: piso mínimo, faixas e sellers ATIVOS da carteira deste consultor. */
  piso?: number
  faixasAwareness?: FaixaAwareness[]
  carteiraAtiva?: number
  /** Acionáveis: faixas e tamanho TOTAL da carteira deste consultor. */
  faixasAcionaveis?: FaixaAcionaveis[]
  carteiraTotal?: number
}

export interface QuantidadeConsultor {
  /** Número em destaque: saldo de sellers, aderentes, respostas ou tarefas revertidas. */
  numero: number
  /** Denominador do "N de M" (só a Aderência). */
  de?: number
  /** > 0: faltam N para a meta. ≤ 0: meta atingida, com |N| de sobra. null: sem meta ou carteira para comparar. */
  faltam: number | null
  /** A meta em quantidade, quando é um número próprio do consultor (Awareness e Acionáveis). */
  metaQtd?: number
}

/** Devolve null quando a planilha não trouxe o que a conta precisa — a tela volta a mostrar a %. */
export function quantidadeDoPilar(
  pilar: PilarKey, metricas: Record<string, unknown> | null, ctx: ContextoQuantidade,
): QuantidadeConsultor | null {
  const m = metricas ?? {}
  switch (pilar) {
    case 'net_churn': {
      const base = numeroOuNaN(m['Sellers ativos mês passado'])
      const hoje = numeroOuNaN(m['Sellers ativos mês atual'])
      if (!(base > 0) || !Number.isFinite(hoje)) return null
      // Meta inválida não tira o saldo (ele não depende dela): só o "faltam" fica de fora.
      return { numero: hoje - base, faltam: Number.isFinite(ctx.meta) ? ativosMinimosNetChurn(base, ctx.meta) - hoje : null }
    }
    case 'aderencia': {
      const agendados = numeroOuNaN(m['Sellers agendados'])
      const aderentes = numeroOuNaN(m['Sellers aderentes à agenda'])
      if (!(agendados > 0) || !Number.isFinite(aderentes)) return null
      return {
        numero: aderentes, de: agendados,
        faltam: Number.isFinite(ctx.meta) ? aderentesMinimosAgenda(agendados, ctx.meta) - aderentes : null,
      }
    }
    case 'awareness': {
      const respostas = numeroOuNaN(m['Sellers que responderam pesquisa'])
      if (!Number.isFinite(respostas)) return null
      if (ctx.carteiraAtiva == null) return { numero: respostas, faltam: null }
      const metaQtd = metaAwareness(ctx.carteiraAtiva, ctx.faixasAwareness ?? [], ctx.piso ?? PISO_AWARENESS_PADRAO)
      return { numero: respostas, faltam: metaQtd - respostas, metaQtd }
    }
    case 'acionaveis': {
      const revertidas = numeroOuNaN(m['Total Acionáveis Revertido'])
      if (!Number.isFinite(revertidas)) return null
      if (ctx.carteiraTotal == null) return { numero: revertidas, faltam: null }
      const metaQtd = metaAcionaveis(ctx.carteiraTotal, ctx.faixasAcionaveis ?? [])
      return { numero: revertidas, faltam: metaQtd - revertidas, metaQtd }
    }
    default:
      return null
  }
}

const plural = (n: number, um: string, varios: string) => (Math.abs(n) === 1 ? um : varios)

/** O número em destaque da pílula (e da média do cabeçalho): "−31 sellers", "11 de 25", "109 respostas", "4 revertidas". */
export function textoQuantidade(pilar: PilarKey, numero: number, de?: number): string {
  const n = Math.round(numero) || 0 // `|| 0` troca o −0 (média de −0,3) por 0: "−0 sellers" não existe
  const fmt = (v: number) => v.toLocaleString('pt-BR')
  switch (pilar) {
    case 'net_churn': return `${n > 0 ? '+' : ''}${fmt(n)} ${plural(n, 'seller', 'sellers')}`
    case 'aderencia': return `${fmt(n)} de ${fmt(Math.round(de ?? 0))}`
    case 'awareness': return `${fmt(n)} ${plural(n, 'resposta', 'respostas')}`
    case 'acionaveis': return `${fmt(n)} ${plural(n, 'revertida', 'revertidas')}`
    default: return fmt(n)
  }
}

const UNIDADE_DO_FALTAM: Partial<Record<PilarKey, readonly [string, string]>> = {
  net_churn: ['seller', 'sellers'],
  aderencia: ['visita', 'visitas'],
  awareness: ['resposta', 'respostas'],
  acionaveis: ['tarefa', 'tarefas'],
}

/** A linha de situação: "faltam 14 sellers p/ meta" ou "✓ 8 visitas acima da meta". null = sem como comparar. */
export function textoSituacao(pilar: PilarKey, q: QuantidadeConsultor): string | null {
  const unidade = UNIDADE_DO_FALTAM[pilar]
  if (q.faltam == null || !unidade) return null
  const f = q.faltam
  const meta = q.metaQtd != null ? ` (${q.metaQtd})` : ''
  if (f > 0) return `${f === 1 ? 'falta' : 'faltam'} ${f} ${plural(f, ...unidade)} p/ meta${meta}`
  return f < 0 ? `✓ ${-f} ${plural(-f, ...unidade)} acima da meta${meta}` : `✓ meta atingida${meta}`
}
