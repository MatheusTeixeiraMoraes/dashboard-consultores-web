'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import MultiFiltro from '@/components/MultiFiltro'
import { BotaoWhatsApp, BotaoMapa } from '@/components/BotaoContato'
import { compararRitmo, faixaTPV, ROTULO_FAIXA, type FaixaTPV } from '@/lib/tpv'
import { precisaIdentificar } from '@/lib/texto'
import type { LinhaTPV } from './page'

// Cartão ocupa bem mais altura que uma linha de tabela — 50 por página
// virava uma rolagem enorme. 20 mantém a lista escaneável de uma vez.
const POR_PAGINA = 20

const nBR = (n: number) => n.toLocaleString('pt-BR')
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null)

const CorFaixa: Record<FaixaTPV, string> = {
  'queda-forte': 'text-bad',
  'queda': 'text-warn',
  'estavel': 'text-ink-muted',
  'alta': 'text-good',
  'sem-base': 'text-ink-faint',
}

// Cor do avatar sorteada pelo nome — estável por cliente, sem significado.
// Mesmo padrão de src/app/(dashboard)/dashboard/clientes/ClientesClient.tsx:
// classes escritas por extenso porque o Tailwind não gera nome montado em runtime.
const AVATARES = ['bg-av-1', 'bg-av-2', 'bg-av-3', 'bg-av-4', 'bg-av-5']
function corAvatar(chave: string) {
  let soma = 0
  for (let i = 0; i < chave.length; i++) soma += chave.charCodeAt(i)
  return AVATARES[soma % AVATARES.length]
}
// Primeira LETRA, não primeiro caractere: nome de cliente às vezes vem com
// número na frente, e o avatar viraria um dígito sem sentido.
const inicial = (texto: string) => (texto.match(/\p{L}/u)?.[0] ?? '?').toUpperCase()

const PillSituacao: Record<string, { bg: string; dot: string }> = {
  ATIVO: { bg: 'bg-card-2 text-ink-dim', dot: 'bg-ink-faint' },
  CHURN: { bg: 'bg-bad-bg text-bad', dot: 'bg-bad-fill' },
  INATIVO: { bg: 'bg-warn-bg text-warn', dot: 'bg-warn-fill' },
  REATIVADO: { bg: 'bg-good-bg text-good', dot: 'bg-good-fill' },
}

const IconCifrao = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-2.5 h-2.5">
    <line x1="12" y1="2" x2="12" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)
const IconAlerta = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-2.5 h-2.5">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)
const IconVazamento = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-2.5 h-2.5">
    <path d="M17 7 7 17M7 7l10 10" />
  </svg>
)
const IconRelogio = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-2.5 h-2.5">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
)
const IconTendenciaQueda = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
    <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" />
  </svg>
)
const IconTendenciaAlta = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
  </svg>
)

/**
 * Tendência de 3 meses, em 3 passos consecutivos (não 2) — cada um é a
 * diferença "período mais recente − período mais antigo" de uma dupla
 * seguida, olhando de trás pra frente até achar onde a direção mudou:
 *   passo1 = M2 − M3   (virou de 3 pra 2 meses atrás?)
 *   passo2 = M1 − M2   (= tpv_m2_vs_m1, já pronto do MP)
 *   passo3 = M0 − mesma-data-M1  (= tpv_m0_vs_mesma_data, já pronto do MP)
 * "Piorando agora" é o sinal mais raro e mais útil: cliente estável (ou
 * crescendo) nos meses fechados que começou a cair SÓ neste mês — ninguém
 * pega isso olhando só o ritmo/dia (que compara com o mês passado inteiro,
 * não com o mesmo pedaço de dias). Separar "queda há 2 meses" de "crônica
 * (3 meses)" evita tratar os dois como o mesmo problema.
 */
type Tendencia3Meses = 'queda-cronica' | 'queda-2-meses' | 'piorando-agora' | 'recuperando' | 'crescimento-sustentado' | null
function classificarTendencia(
  tpvM3: number | null, tpvM2: number | null, m2vsM1: number | null, m0vsMesmaData: number | null,
): Tendencia3Meses {
  if (m2vsM1 == null || m0vsMesmaData == null) return null
  const passo3 = m0vsMesmaData
  const passo2 = m2vsM1
  if (passo3 >= 0) return passo2 < 0 ? 'recuperando' : 'crescimento-sustentado'
  if (passo2 >= 0) return 'piorando-agora'
  // Caindo neste mês E no mês passado — olha mais um passo pra trás se der.
  const passo1 = (tpvM3 != null && tpvM2 != null) ? tpvM2 - tpvM3 : null
  if (passo1 == null) return 'queda-2-meses'   // sem dado de 3 meses atrás pra confirmar crônica
  return passo1 < 0 ? 'queda-cronica' : 'queda-2-meses'
}
const RotuloTendencia: Record<Exclude<Tendencia3Meses, null>, string> = {
  'queda-cronica': 'Queda crônica (3 meses)',
  'queda-2-meses': 'Queda há 2 meses',
  'piorando-agora': 'Piorando agora',
  'recuperando': 'Recuperando',
  'crescimento-sustentado': 'Crescimento sustentado',
}
const ExplicacaoTendencia: Record<Exclude<Tendencia3Meses, null>, string> = {
  'queda-cronica': 'caindo nos 3 meses seguidos — não é um mês ruim isolado, é um padrão.',
  'queda-2-meses': 'estava bem 3 meses atrás, mas já caiu nos últimos 2 — vale entender o que mudou.',
  'piorando-agora': 'vinha estável ou crescendo, e só começou a cair neste mês — pega o problema no início.',
  'recuperando': 'vinha caindo, mas este mês já está melhor que o mesmo período do mês passado.',
  'crescimento-sustentado': 'crescendo de forma consistente nos últimos meses.',
}

function Campo({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string | null }) {
  return (
    <div>
      <p className="text-[11px] text-ink-faint">{rotulo}</p>
      <p className="text-sm font-medium text-ink">{valor}</p>
      {sub && <p className="text-[10px] text-ink-faint mt-0.5">{sub}</p>}
    </div>
  )
}

type Ordem = 'pior-ritmo' | 'maior-perda' | 'mais-parado' | 'maior-tpv'

interface Props {
  dataReferencia: string | null
  linhas: LinhaTPV[]
  fichas: Record<string, { nome: string; telefone: string | null; local: string }>
  sellersComAcao: string[]
  podeGerir: boolean
}

/** Limiares de primeira versão para "sinal de abandono" — fáceis de ajustar. */
const DIAS_SEM_CONTATO = 30
const DIAS_SEM_PESQUISA = 90

const SINAIS = [
  'Sem ação atribuída', 'Oportunidade aberta', 'TPV em outras contas', 'Sem contato/pesquisa recente',
  'Piorando agora', 'Queda há 2 meses', 'Queda crônica (3 meses)', 'Recuperando',
] as const

/** Faixas em vez de número solto — mesmo padrão dos outros filtros
 *  (MultiFiltro é feito pra opção discreta, não pra range numérico). */
const FAIXAS_DIAS_TRANSACIONAR: [string, (d: number | null) => boolean][] = [
  ['0-2 dias', d => d != null && d <= 2],
  ['3-7 dias', d => d != null && d >= 3 && d <= 7],
  ['8-30 dias', d => d != null && d >= 8 && d <= 30],
  ['31+ dias', d => d != null && d >= 31],
]
const FAIXAS_DIAS_CONTATO: [string, (d: number | null) => boolean][] = [
  ['Até 15 dias', d => d != null && d <= 15],
  ['16-30 dias', d => d != null && d >= 16 && d <= 30],
  ['31+ dias', d => d != null && d >= 31],
  ['Nunca contatado', d => d == null],
]
// Cortes calibrados pela distribuição real da carteira (p25≈6k, p50≈12k,
// p75≈20k, p90≈33k) — não são redondos por estética, são pra não deixar
// nenhuma faixa concentrando metade da carteira sozinha.
const FAIXAS_PORTE: [string, (v: number | null) => boolean][] = [
  ['Até R$5 mil', v => v != null && v <= 5000],
  ['R$5 mil-15 mil', v => v != null && v > 5000 && v <= 15000],
  ['R$15 mil-35 mil', v => v != null && v > 15000 && v <= 35000],
  ['Acima de R$35 mil', v => v != null && v > 35000],
]

const diasDesde = (iso: string | null, hoje: string): number | null => {
  if (!iso) return null
  return Math.round((Date.parse(hoje) - Date.parse(iso.slice(0, 10))) / 86400000)
}

/**
 * Traço de 4 pontos (M-3, M-2, M-1, este mês) sem eixo nem tooltip — cabe
 * dentro da célula. Todos os 4 valores já vêm carregados junto com o resto
 * da linha (nenhuma busca nova), diferente do sparkline diário antigo que
 * puxava o mês inteiro à parte e foi cortado por custar 1,3MB de payload.
 * O último ponto é `projecaoMes` (estimativa pro mês fechar), não o TPV
 * parcial cru — comparar parcial com 3 meses fechados mostraria uma queda
 * no fim que não existe, a mesma armadilha do ritmo/dia.
 */
function Sparkline({ pontos, alto = false }: { pontos: (number | null)[]; alto?: boolean }) {
  const validos = pontos.filter((v): v is number => v != null)
  if (validos.length < 2) return null
  const w = alto ? 96 : 56, h = alto ? 32 : 20, pad = 2
  const min = Math.min(...validos)
  const max = Math.max(...validos)
  const span = max - min || 1
  const passo = (w - pad * 2) / (pontos.length - 1)
  const xy = pontos
    .map((v, i) => (v == null ? null : [pad + i * passo, pad + (h - pad * 2) * (1 - (v - min) / span)] as const))
    .filter((p): p is readonly [number, number] => p != null)
  const linha = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${xy[0][0]},${h - pad} ${linha} ${xy[xy.length - 1][0]},${h - pad}`
  const tendencia = validos[validos.length - 1] - validos[0]
  const cor = tendencia > 0 ? 'var(--color-good)' : tendencia < 0 ? 'var(--color-bad)' : 'var(--color-ink-faint)'
  const [lx, ly] = xy[xy.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0" aria-hidden="true">
      <polygon points={area} fill={cor} opacity={0.12} />
      <polyline points={linha} fill="none" stroke={cor} strokeWidth={alto ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={alto ? 2.6 : 2.1} fill={cor} />
    </svg>
  )
}

/** Campos que a lista NÃO carrega mais (cortados por payload — ver commit de
 *  performance) mas que o painel de detalhe de um cliente só busca quando
 *  abre, um de cada vez: rico sem pesar a tela toda. */
interface DetalheExtra {
  quartil: string | null
  status_credito: string | null
  recorrencia: string | null
  multicontas: number | null
  dt_ultima_transacao: string | null
  lat: number | null
  lng: number | null
  endereco_completo: string | null
}

async function buscarDetalheExtra(sellerId: string, dataReferencia: string): Promise<DetalheExtra> {
  const supabase = createClient()
  const [{ data: mp }, { data: cli }] = await Promise.all([
    supabase.from('mp_carteira')
      .select('quartil, status_credito, recorrencia, multicontas, dt_ultima_transacao')
      .eq('data_referencia', dataReferencia).eq('seller_id', sellerId).maybeSingle(),
    supabase.from('clientes')
      .select('lat, lng, endereco_completo')
      .eq('seller_id', sellerId).maybeSingle(),
  ])
  return {
    quartil: mp?.quartil ?? null,
    status_credito: mp?.status_credito ?? null,
    recorrencia: mp?.recorrencia ?? null,
    multicontas: mp?.multicontas ?? null,
    dt_ultima_transacao: mp?.dt_ultima_transacao ?? null,
    lat: cli?.lat ?? null,
    lng: cli?.lng ?? null,
    endereco_completo: cli?.endereco_completo ?? null,
  }
}

export default function QuedaTpvClient({ dataReferencia, linhas, fichas, sellersComAcao, podeGerir }: Props) {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [ordem, setOrdem] = useState<Ordem>('maior-perda')
  const [fConsultores, setFConsultores] = useState<Set<string>>(new Set())
  const [fFaixas, setFFaixas] = useState<Set<string>>(new Set())
  const [fStatus, setFStatus] = useState<Set<string>>(new Set())
  const [fMcc, setFMcc] = useState<Set<string>>(new Set())
  const [fSinais, setFSinais] = useState<Set<string>>(new Set())
  const [fDiasTransacionar, setFDiasTransacionar] = useState<Set<string>>(new Set())
  const [fDiasContato, setFDiasContato] = useState<Set<string>>(new Set())
  const [fPorte, setFPorte] = useState<Set<string>>(new Set())
  const [detalheId, setDetalheId] = useState<string | null>(null)
  // Guarda o resultado junto do id a que ele pertence — evita setState
  // síncrono de "reset" no início do efeito (o lint do React reclama, e com
  // razão: cascata de render). Enquanto `resultadoDetalhe.id` não bate com
  // `detalheId`, ainda está carregando.
  const [resultadoDetalhe, setResultadoDetalhe] = useState<{ id: string; dados: DetalheExtra } | null>(null)

  useEffect(() => {
    if (!detalheId || !dataReferencia) return
    let cancelado = false
    buscarDetalheExtra(detalheId, dataReferencia).then(dados => {
      if (!cancelado) setResultadoDetalhe({ id: detalheId, dados })
    })
    return () => { cancelado = true }
  }, [detalheId, dataReferencia])

  const detalheExtra = resultadoDetalhe?.id === detalheId ? resultadoDetalhe.dados : null
  const carregandoDetalhe = detalheId != null && resultadoDetalhe?.id !== detalheId

  const semAcaoSet = useMemo(() => new Set(sellersComAcao), [sellersComAcao])

  const enriquecidas = useMemo(() => {
    if (!dataReferencia) return []
    return linhas.map(l => {
      const r = compararRitmo(l.tpv_mes_atual, l.tpv_mes_passado, dataReferencia)
      // Quanto de faturamento se perdeu no ritmo, projetado no mês. É derivado
      // (ritmo × dias), e serve só para ordenar por tamanho do problema — quem
      // cai 50% faturando R$ 200 não é o mesmo problema que quem cai 12%
      // faturando R$ 2 milhões.
      const perda = r.variacao !== null && r.variacao < 0
        ? (r.ritmoPassado - r.ritmoAtual) * r.diasMesPassado
        : 0

      // Oportunidade de reversão: o MP já marca quais clientes têm uma (à
      // vista e/ou parcelada), com valor em aberto e fração já capturada
      // (`ating_*`). Combina as duas em um único valor e um único % — a tela
      // não precisa saber que por baixo são dois números da planilha.
      const temOportunidade = l.oportunidade_1x || l.oportunidade_parc
      const valorOportunidade =
        (l.oportunidade_1x ? l.valor_1x ?? 0 : 0) + (l.oportunidade_parc ? l.valor_parc ?? 0 : 0)
      const valorCapturado =
        (l.oportunidade_1x ? (l.ating_1x ?? 0) * (l.valor_1x ?? 0) : 0) +
        (l.oportunidade_parc ? (l.ating_parc ?? 0) * (l.valor_parc ?? 0) : 0)
      const pctCapturado = valorOportunidade > 0 ? valorCapturado / valorOportunidade : null
      const revertida =
        (!l.oportunidade_1x || l.revertido_1x) && (!l.oportunidade_parc || l.revertido_parc)

      // Quanto falta pra bater o mês passado — NÃO é a diferença bruta
      // (atual parcial vs. passado fechado): isso é exatamente a comparação
      // enganosa que o ritmo/dia existe pra evitar (ver cabeçalho do
      // arquivo). É o ritmo médio necessário nos dias que faltam pra que o
      // total do mês feche igual ao passado.
      const diasRestantes = r.diasMesTodo - r.diasDecorridos
      const faltaTotal = l.tpv_mes_passado != null && l.tpv_mes_atual != null
        ? l.tpv_mes_passado - l.tpv_mes_atual
        : null
      const ritmoNecessario = faltaTotal != null && faltaTotal > 0 && diasRestantes > 0
        ? faltaTotal / diasRestantes
        : null

      const semAcao = !semAcaoSet.has(l.seller_id)
      const vazandoFora = (l.tpv_outras_contas ?? 0) > 0 && (l.tpv_outras_contas ?? 0) > (l.tpv_mes_atual ?? 0)

      const diasSemContato = diasDesde(l.ultimo_contato, dataReferencia)
      const diasSemPesquisa = diasDesde(l.pesquisa_recente, dataReferencia)
      const riscoAbandono =
        (diasSemContato === null || diasSemContato >= DIAS_SEM_CONTATO) &&
        (diasSemPesquisa === null || diasSemPesquisa >= DIAS_SEM_PESQUISA)

      const tendencia = classificarTendencia(l.tpv_m3, l.tpv_m2, l.tpv_m2_vs_m1, l.tpv_m0_vs_mesma_data)

      // Referência "mesmo período" é mais precisa que "mês passado inteiro"
      // pra comparar com o TPV parcial de hoje — não depende de assumir
      // distribuição uniforme dos dias, é o número real do MP pro mesmo
      // intervalo. Cai pro mês fechado só quando essa coluna não existir.
      const referenciaComparavel = l.tpv_mesma_data_mes_passado ?? l.tpv_mes_passado
      const rotuloReferencia = l.tpv_mesma_data_mes_passado != null ? 'mesmo período' : 'mês passado'

      return {
        ...l, ...r, perda, faixa: faixaTPV(r.variacao),
        temOportunidade, valorOportunidade, pctCapturado, revertida,
        semAcao, vazandoFora, diasSemContato, diasSemPesquisa, riscoAbandono,
        diasRestantes, faltaTotal, ritmoNecessario, tendencia,
        referenciaComparavel, rotuloReferencia,
        pontosTrimestre: [l.tpv_m3, l.tpv_m2, l.tpv_mes_passado, r.projecaoMes] as (number | null)[],
      }
    })
  }, [linhas, dataReferencia, semAcaoSet])

  const clienteDetalhe = useMemo(
    () => enriquecidas.find(l => l.seller_id === detalheId) ?? null,
    [enriquecidas, detalheId],
  )

  const consultores = useMemo(
    () => [...new Set(linhas.map(l => l.consultor_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas],
  )
  const mccs = useMemo(
    () => [...new Set(linhas.map(l => l.mcc).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas],
  )

  const passaSinais = useMemo(() => (l: (typeof enriquecidas)[number]) => {
    if (fSinais.size === 0) return true
    if (fSinais.has('Sem ação atribuída') && l.semAcao) return true
    if (fSinais.has('Oportunidade aberta') && l.temOportunidade && !l.revertida) return true
    if (fSinais.has('TPV em outras contas') && l.vazandoFora) return true
    if (fSinais.has('Sem contato/pesquisa recente') && l.riscoAbandono) return true
    if (fSinais.has('Piorando agora') && l.tendencia === 'piorando-agora') return true
    if (fSinais.has('Queda há 2 meses') && l.tendencia === 'queda-2-meses') return true
    if (fSinais.has('Queda crônica (3 meses)') && l.tendencia === 'queda-cronica') return true
    if (fSinais.has('Recuperando') && l.tendencia === 'recuperando') return true
    return false
  }, [fSinais])

  const passaFaixaDias = <T,>(sel: Set<string>, valor: T, faixas: [string, (v: T) => boolean][]) =>
    sel.size === 0 || faixas.some(([rot, teste]) => sel.has(rot) && teste(valor))

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const arr = enriquecidas.filter(l =>
      (fConsultores.size === 0 || fConsultores.has(l.consultor_nome)) &&
      (fFaixas.size === 0 || fFaixas.has(ROTULO_FAIXA[l.faixa])) &&
      (fStatus.size === 0 || fStatus.has(l.status ?? '')) &&
      (fMcc.size === 0 || fMcc.has(l.mcc ?? '')) &&
      passaSinais(l) &&
      passaFaixaDias(fDiasTransacionar, l.dias_sem_transacionar, FAIXAS_DIAS_TRANSACIONAR) &&
      passaFaixaDias(fDiasContato, l.diasSemContato, FAIXAS_DIAS_CONTATO) &&
      passaFaixaDias(fPorte, l.tpv_mes_atual, FAIXAS_PORTE) &&
      (!q || l.seller_id.includes(q) || (fichas[l.seller_id]?.nome ?? '').toLowerCase().includes(q)),
    )
    const cmp: Record<Ordem, (a: typeof arr[0], b: typeof arr[0]) => number> = {
      'pior-ritmo': (a, b) => (a.variacao ?? 9) - (b.variacao ?? 9),
      'maior-perda': (a, b) => b.perda - a.perda,
      'mais-parado': (a, b) => (b.dias_sem_transacionar ?? -1) - (a.dias_sem_transacionar ?? -1),
      'maior-tpv': (a, b) => (b.tpv_mes_atual ?? 0) - (a.tpv_mes_atual ?? 0),
    }
    return [...arr].sort(cmp[ordem])
  }, [enriquecidas, busca, fConsultores, fFaixas, fStatus, fMcc, passaSinais, fDiasTransacionar, fDiasContato, fPorte, ordem, fichas])

  const kpis = useMemo(() => {
    const emQueda = filtradas.filter(l => l.faixa === 'queda' || l.faixa === 'queda-forte')
    const parados = filtradas.filter(l => (l.dias_sem_transacionar ?? 0) >= 3)
    const comOportunidade = filtradas.filter(l => l.temOportunidade && !l.revertida)
    return {
      total: filtradas.length,
      emQueda: emQueda.length,
      perdaTotal: emQueda.reduce((s, l) => s + l.perda, 0),
      emAlta: filtradas.filter(l => l.faixa === 'alta').length,
      parados: parados.length,
      oportunidadeAberta: comOportunidade.reduce((s, l) => s + l.valorOportunidade, 0),
      semAcaoQueda: emQueda.filter(l => l.semAcao).length,
    }
  }, [filtradas])

  /** Onde o líder deveria olhar primeiro: quem concentra a queda na equipe. */
  const porConsultor = useMemo(() => {
    const m = new Map<string, { nome: string; total: number; emQueda: number; perdaTotal: number }>()
    for (const l of filtradas) {
      if (!l.consultor_nome) continue
      let c = m.get(l.consultor_nome)
      if (!c) { c = { nome: l.consultor_nome, total: 0, emQueda: 0, perdaTotal: 0 }; m.set(l.consultor_nome, c) }
      c.total++
      if (l.faixa === 'queda' || l.faixa === 'queda-forte') { c.emQueda++; c.perdaTotal += l.perda }
    }
    return [...m.values()].sort((a, b) => b.perdaTotal - a.perdaTotal)
  }, [filtradas])
  const maiorPerdaConsultor = porConsultor[0]?.perdaTotal ?? 0

  /** Visão de portfólio: a carteira toda subiu ou caiu nos últimos 3 meses?
   *  Soma os mesmos 4 pontos do sparkline por cliente — nenhuma busca nova. */
  const tendenciaCarteira = useMemo(() => {
    const somas = filtradas.reduce((s, l) => ({
      m3: s.m3 + (l.tpv_m3 ?? 0),
      m2: s.m2 + (l.tpv_m2 ?? 0),
      m1: s.m1 + (l.tpv_mes_passado ?? 0),
      m0: s.m0 + l.projecaoMes,
    }), { m3: 0, m2: 0, m1: 0, m0: 0 })
    return [
      { rotulo: 'M-3', valor: somas.m3 },
      { rotulo: 'M-2', valor: somas.m2 },
      { rotulo: 'M-1', valor: somas.m1 },
      { rotulo: 'Este mês (proj.)', valor: somas.m0 },
    ]
  }, [filtradas])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtradas.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)
  const ref = enriquecidas[0]

  if (!dataReferencia) {
    return (
      <div className="glass rounded-2xl border border-line p-12 text-center">
        <p className="font-semibold text-ink">Nenhuma Planilha Ação Oportunidades importada</p>
        <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
          Suba a Planilha Ação Oportunidades em <span className="text-primary">Upar Planilha</span> para
          acompanhar aqui a evolução do faturamento dos seus clientes.
        </p>
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">Queda de TPV</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Planilha de {dataBR(dataReferencia)} · {ref?.diasDecorridos} dias corridos no mês,
          contra {ref?.diasMesPassado} do mês passado fechado
        </p>
      </div>

      {/* Os números primeiro — é a resposta que o líder quer, antes de qualquer
          controle de filtro ou explicação de método. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        {[
          { l: 'Clientes', v: nBR(kpis.total), c: 'text-ink' },
          { l: 'Em queda', v: nBR(kpis.emQueda), c: 'text-bad' },
          { l: 'Perda no ritmo', v: brl(kpis.perdaTotal), c: 'text-bad' },
          { l: 'Em alta', v: nBR(kpis.emAlta), c: 'text-good' },
          { l: 'Oportunidade aberta', v: brl(kpis.oportunidadeAberta), c: 'text-primary' },
          { l: 'Em queda sem ação', v: nBR(kpis.semAcaoQueda), c: 'text-warn' },
        ].map(k => (
          <div key={k.l} className="glass rounded-2xl border border-line px-4 py-3.5">
            <p className="text-xs font-medium text-ink-muted mb-1.5">{k.l}</p>
            <p className={`text-2xl font-semibold tracking-tight ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Visão de portfólio: a carteira (filtrada) inteira subiu ou caiu nos
          últimos 3 meses — pergunta que nenhum KPI acima responde sozinho,
          porque cada um olha só o mês atual vs passado. */}
      <div className="glass rounded-2xl border border-line px-4 py-3.5 mb-3">
        <p className="text-xs font-medium text-ink-muted mb-2.5">TPV da carteira · últimos 3 meses</p>
        <div className="flex items-center gap-5 flex-wrap">
          <Sparkline pontos={tendenciaCarteira.map(p => p.valor)} alto />
          <div className="flex gap-5 flex-wrap">
            {tendenciaCarteira.map(p => (
              <div key={p.rotulo}>
                <p className="text-[10px] text-ink-faint">{p.rotulo}</p>
                <p className="text-sm font-semibold text-ink tabular-nums">{brl(p.valor)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ranking por consultor: só quem gerencia vê (a mesma regra que já
          esconde o filtro de Consultores) — responde "por onde eu começo",
          pergunta que a tabela linha-a-linha não responde sozinha. */}
      {podeGerir && porConsultor.length > 0 && (
        <div className="glass rounded-2xl border border-line px-4 py-3.5 mb-3">
          <p className="text-xs font-medium text-ink-muted mb-2.5">Por consultor · maior perda primeiro</p>
          <div className="space-y-1">
            {porConsultor.map(c => (
              <button
                key={c.nome}
                onClick={() => setFConsultores(prev => {
                  const next = new Set(prev)
                  if (next.has(c.nome)) next.delete(c.nome); else { next.clear(); next.add(c.nome) }
                  return next
                })}
                className={`w-full flex items-center gap-3 text-left rounded-lg px-2.5 py-1.5 border transition-colors ${
                  fConsultores.has(c.nome) ? 'bg-primary/10 border-primary/35' : 'border-transparent hover:bg-card-2'
                }`}
              >
                <span className="text-xs text-ink-dim truncate w-32 flex-shrink-0">{c.nome}</span>
                <span className="flex-1 h-[7px] rounded-full bg-card-2 overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-bad-fill"
                    style={{ width: maiorPerdaConsultor > 0 ? `${Math.max(4, (c.perdaTotal / maiorPerdaConsultor) * 100)}%` : '0%' }}
                  />
                </span>
                <span className="text-[11px] text-ink-faint flex-shrink-0 w-12 text-right">{c.emQueda}/{c.total}</span>
                <span className="text-xs font-semibold text-bad flex-shrink-0 w-20 text-right tabular-nums">{brl(c.perdaTotal)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Por que os números não são o que a planilha mostra crua. Fica visível
          de propósito: sem esta linha, alguém compara os brutos e entra em pânico.
          Uma linha só, sem caixa — é contexto, não é o destaque da tela. */}
      <p className="text-xs text-ink-faint mb-4 leading-relaxed">
        Mês em curso: comparação por <span className="text-ink-muted font-medium">ritmo diário</span> (faturamento
        ÷ dias de cada período), não pelos valores brutos da planilha.
      </p>

      {/* Todos os controles que afetam a tabela, juntos numa barra só, logo
          acima dela — busca e ordenação à esquerda, filtros à direita. */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-ink-faint absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text" placeholder="Buscar cliente ou seller ID…"
            value={busca} onChange={e => { setBusca(e.target.value); setPagina(0) }}
            className="w-full text-sm bg-field border border-field-line rounded-lg pl-8 pr-3 py-1.5 text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-0.5 text-xs bg-field border border-field-line rounded-lg p-0.5">
          {([
            ['maior-perda', 'Maior perda'],
            ['pior-ritmo', 'Pior queda %'],
            ['mais-parado', 'Mais parado'],
            ['maior-tpv', 'Maior TPV'],
          ] as [Ordem, string][]).map(([k, rot]) => (
            <button key={k} onClick={() => { setOrdem(k); setPagina(0) }}
              className={`px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                ordem === k ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink'
              }`}>
              {rot}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {podeGerir && <MultiFiltro label="Consultores" opcoes={consultores} sel={fConsultores} onChange={setFConsultores} />}
          <MultiFiltro label="Faixa" opcoes={Object.values(ROTULO_FAIXA)} sel={fFaixas} onChange={setFFaixas} />
          <MultiFiltro label="Situação" opcoes={['ATIVO', 'CHURN', 'INATIVO', 'REATIVADO']} sel={fStatus} onChange={setFStatus} />
          <MultiFiltro label="Segmento" opcoes={mccs} sel={fMcc} onChange={setFMcc} />
          <MultiFiltro label="Sinais" opcoes={[...SINAIS]} sel={fSinais} onChange={setFSinais} />
          <MultiFiltro label="Sem transacionar" opcoes={FAIXAS_DIAS_TRANSACIONAR.map(([r]) => r)} sel={fDiasTransacionar} onChange={setFDiasTransacionar} />
          <MultiFiltro label="Sem contato" opcoes={FAIXAS_DIAS_CONTATO.map(([r]) => r)} sel={fDiasContato} onChange={setFDiasContato} />
          <MultiFiltro label="Porte" opcoes={FAIXAS_PORTE.map(([r]) => r)} sel={fPorte} onChange={setFPorte} />
        </div>
      </div>

      {/* Lista de cartões, não tabela: cada cliente é um bloco com respiro
          próprio, não uma linha presa numa grade de bordas de célula — é
          isso, mais do que qualquer cor, que tira a cara de planilha.
          Ritmo, variação e perda continuam numa célula composta só; situação
          e dias parado também. */}
      <div className="flex flex-col gap-2">
        {visiveis.map(l => {
          const f = fichas[l.seller_id]
          const pendente = precisaIdentificar(f?.nome ?? '', l.seller_id)
          const nomeExibido = pendente ? `#${l.seller_id}` : (f?.nome ?? `#${l.seller_id}`)
          const situacao = PillSituacao[l.status ?? ''] ?? { bg: 'bg-card-2 text-ink-dim', dot: 'bg-ink-faint' }
          return (
            <div key={l.seller_id}
              role="button" tabIndex={0} onClick={() => setDetalheId(l.seller_id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setDetalheId(l.seller_id) }}
              className="glass rounded-2xl border border-line px-4 py-3.5 grid grid-cols-1 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1.1fr)_minmax(0,1.15fr)_minmax(0,1fr)] gap-3 md:gap-4 md:items-center hover:border-primary/30 transition-colors cursor-pointer">

              {/* Identidade + sinais */}
              <div className="flex gap-2.5 min-w-0">
                <span className={`w-8 h-8 rounded-full grid place-items-center text-white text-xs font-semibold flex-shrink-0 ${corAvatar(l.seller_id)}`}>
                  {inicial(nomeExibido)}
                </span>
                <div className="min-w-0 flex-1">
                  {pendente
                    ? <p className="text-warn truncate leading-tight text-sm">Pendente de identificação <span className="font-mono text-[11px] text-ink-faint">#{l.seller_id}</span></p>
                    : <p className="text-ink truncate leading-tight text-sm font-medium">{nomeExibido}</p>}
                  <p className="text-[11px] text-ink-faint truncate mt-0.5">
                    {podeGerir ? l.consultor_nome : f?.local || `#${l.seller_id}`}
                  </p>
                  {(l.temOportunidade || l.semAcao || l.vazandoFora || l.riscoAbandono || l.tendencia === 'piorando-agora' || l.tendencia === 'queda-2-meses' || l.tendencia === 'queda-cronica' || l.tendencia === 'recuperando') && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {l.temOportunidade && !l.revertida && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/12 text-primary-lt">
                          <IconCifrao />{brl(l.valorOportunidade)}{l.pctCapturado != null && ` · ${Math.round(l.pctCapturado * 100)}%`}
                        </span>
                      )}
                      {l.semAcao && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warn-bg text-warn">
                          <IconAlerta />Sem ação
                        </span>
                      )}
                      {l.vazandoFora && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-card-2 text-ink-dim border border-line">
                          <IconVazamento />Processa fora
                        </span>
                      )}
                      {l.riscoAbandono && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warn-bg/70 text-warn">
                          <IconRelogio />Sem contato/pesquisa
                        </span>
                      )}
                      {/* Tendência de 3 meses — "crescimento sustentado" não gera
                          badge (a tela é de queda, não de comemoração), mas
                          "recuperando" agora sim: junto com o sparkline, ajuda o
                          consultor a saber quem já não precisa de urgência. */}
                      {l.tendencia === 'recuperando' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-good-bg text-good">
                          <IconTendenciaAlta />Recuperando
                        </span>
                      )}
                      {(l.tendencia === 'piorando-agora' || l.tendencia === 'queda-2-meses' || l.tendencia === 'queda-cronica') && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          l.tendencia === 'queda-cronica' ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn'
                        }`}>
                          <IconTendenciaQueda />{RotuloTendencia[l.tendencia]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* stopPropagation: o cartão inteiro abre o detalhe ao clicar;
                    o botão de WhatsApp precisa agir sozinho, sem abrir o painel
                    junto. */}
                <span onClick={e => e.stopPropagation()} className="flex-shrink-0">
                  <BotaoWhatsApp telefone={f?.telefone} nome={nomeExibido} />
                </span>
              </div>

              {/* Ritmo diário + variação + traço de 3 meses (M-3→M0) */}
              <div className="flex items-center justify-between gap-3 md:justify-end">
                <div className="text-right">
                  <p className="tabular-nums text-ink leading-tight text-sm font-medium">
                    {brl(l.ritmoAtual)}<span className="text-ink-faint font-normal text-xs">/dia</span>
                  </p>
                  <p className={`text-xs tabular-nums font-semibold leading-tight mt-0.5 ${CorFaixa[l.faixa]}`}>
                    {l.variacao === null ? '—' : pct(l.variacao)}
                    {l.perda > 0 && <span className="text-ink-faint font-normal"> · -{brl(l.perda)} proj.</span>}
                  </p>
                </div>
                <Sparkline pontos={l.pontosTrimestre} />
              </div>

              {/* TPV no mês — atual, o fechado do mês passado pra referência,
                  e o ritmo que falta pros dias restantes pra empatar (não a
                  diferença bruta atual-vs-passado, que compararia parcial
                  com fechado e mentiria — mesmo motivo do ritmo/dia acima). */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between md:justify-end md:gap-1.5">
                  <span className="text-[10px] text-ink-faint md:hidden">TPV no mês</span>
                  <span className="text-sm tabular-nums text-ink font-medium">
                    {l.tpv_mes_atual != null ? brl(l.tpv_mes_atual) : '—'}
                  </span>
                </div>
                {l.referenciaComparavel != null && (
                  <p className="text-[11px] tabular-nums text-ink-faint text-right">
                    {l.rotuloReferencia} {brl(l.referenciaComparavel)}
                  </p>
                )}
                {l.ritmoNecessario != null ? (
                  <p className="text-[11px] tabular-nums text-warn font-medium text-right">
                    faltam {brl(l.ritmoNecessario)}/dia · {l.diasRestantes}d
                  </p>
                ) : l.faltaTotal != null && l.faltaTotal < 0 && (
                  <p className="text-[11px] tabular-nums text-good font-medium text-right">
                    +{brl(-l.faltaTotal)} acima do mês passado
                  </p>
                )}
              </div>

              {/* Situação */}
              <div className="flex items-center justify-between md:flex-col md:items-end gap-1">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${situacao.bg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${situacao.dot}`} />
                  {l.status}
                </span>
                <span className={`text-[11px] ${l.dias_sem_transacionar != null && l.dias_sem_transacionar >= 3 ? 'text-bad font-semibold' : 'text-ink-faint'}`}>
                  {l.dias_sem_transacionar == null ? '—' : `${l.dias_sem_transacionar}d sem transacionar`}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {filtradas.length === 0 && (
        <p className="text-sm text-ink-muted glass rounded-2xl border border-line p-8 text-center mt-3">
          Nenhum cliente com esses filtros.
        </p>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap mt-4 text-sm">
          <span className="text-ink-faint text-xs">
            {nBR(paginaAtual * POR_PAGINA + 1)}–{nBR(Math.min((paginaAtual + 1) * POR_PAGINA, filtradas.length))} de {nBR(filtradas.length)}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={paginaAtual === 0}
              className="px-3 py-1.5 rounded-lg border border-line text-ink-dim text-xs disabled:opacity-40 hover:bg-card-2">Anterior</button>
            <span className="text-ink-muted text-xs">{paginaAtual + 1} / {totalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} disabled={paginaAtual >= totalPaginas - 1}
              className="px-3 py-1.5 rounded-lg border border-line text-ink-dim text-xs disabled:opacity-40 hover:bg-card-2">Próxima</button>
          </div>
        </div>
      )}

      {/* Painel de detalhe: tudo sobre UM cliente, incluindo o que a lista não
          carrega mais (quartil, crédito, recorrência, endereço) — busca só ao
          abrir, não pesa a lista inteira. */}
      {detalheId && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto"
          onClick={() => setDetalheId(null)}>
          <div className="glass-blur rounded-2xl border border-line max-w-xl w-full my-8" onClick={e => e.stopPropagation()}>
            {!clienteDetalhe ? (
              <div className="p-10 text-center text-sm text-ink-muted">Cliente não encontrado nesta página.</div>
            ) : (() => {
              const fd = fichas[clienteDetalhe.seller_id]
              const nomeDetalhe = precisaIdentificar(fd?.nome ?? '', clienteDetalhe.seller_id)
                ? `#${clienteDetalhe.seller_id}` : (fd?.nome ?? `#${clienteDetalhe.seller_id}`)
              return (
                <>
                  <div className="flex items-start justify-between gap-3 p-5 border-b border-line">
                    <div className="flex gap-3 min-w-0">
                      <span className={`w-11 h-11 rounded-full grid place-items-center text-white text-base font-semibold flex-shrink-0 ${corAvatar(clienteDetalhe.seller_id)}`}>
                        {inicial(nomeDetalhe)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-ink truncate">{nomeDetalhe}</p>
                        <p className="text-xs text-ink-faint truncate">#{clienteDetalhe.seller_id} · {clienteDetalhe.consultor_nome}</p>
                        {(fd?.local || detalheExtra?.endereco_completo) && (
                          <p className="text-xs text-ink-muted mt-0.5 truncate">{detalheExtra?.endereco_completo || fd?.local}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <BotaoWhatsApp telefone={fd?.telefone} nome={nomeDetalhe} />
                      {detalheExtra && <BotaoMapa lat={detalheExtra.lat} lng={detalheExtra.lng} nome={nomeDetalhe} />}
                      <button onClick={() => setDetalheId(null)} aria-label="Fechar"
                        className="text-ink-faint hover:text-ink-dim text-2xl leading-none w-8 h-8 grid place-items-center flex-shrink-0">×</button>
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    <section>
                      <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2">TPV · últimos 3 meses</p>
                      <div className="flex items-end gap-5 flex-wrap mb-3">
                        <Sparkline pontos={clienteDetalhe.pontosTrimestre} alto />
                        <div className="flex gap-4 flex-wrap">
                          {([
                            ['M-3', clienteDetalhe.tpv_m3], ['M-2', clienteDetalhe.tpv_m2],
                            ['M-1', clienteDetalhe.tpv_mes_passado], ['Este mês (proj.)', clienteDetalhe.projecaoMes],
                          ] as [string, number | null][]).map(([rot, v]) => (
                            <div key={rot}>
                              <p className="text-[10px] text-ink-faint">{rot}</p>
                              <p className="text-sm font-semibold text-ink tabular-nums">{v != null ? brl(v) : '—'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-card-2 rounded-xl px-3 py-2">
                          <p className="text-[11px] text-ink-faint">Ritmo diário</p>
                          <p className="text-sm font-semibold tabular-nums text-ink">{brl(clienteDetalhe.ritmoAtual)}/dia</p>
                          <p className={`text-xs tabular-nums font-medium ${CorFaixa[clienteDetalhe.faixa]}`}>
                            {clienteDetalhe.variacao == null ? '—' : pct(clienteDetalhe.variacao)} vs mês passado
                          </p>
                        </div>
                        <div className="bg-card-2 rounded-xl px-3 py-2">
                          <p className="text-[11px] text-ink-faint">Hoje vs {clienteDetalhe.rotuloReferencia}</p>
                          <p className="text-sm font-semibold tabular-nums text-ink">
                            {clienteDetalhe.tpv_mes_atual != null ? brl(clienteDetalhe.tpv_mes_atual) : '—'}
                          </p>
                          <p className="text-xs tabular-nums text-ink-faint">
                            era {clienteDetalhe.referenciaComparavel != null ? brl(clienteDetalhe.referenciaComparavel) : '—'}
                          </p>
                        </div>
                      </div>
                      {clienteDetalhe.tendencia && (
                        <p className={`text-xs mt-3 px-3 py-2 rounded-lg leading-relaxed ${
                          clienteDetalhe.tendencia === 'queda-cronica' ? 'bg-bad-bg text-bad'
                          : clienteDetalhe.tendencia === 'recuperando' || clienteDetalhe.tendencia === 'crescimento-sustentado' ? 'bg-good-bg text-good'
                          : 'bg-warn-bg text-warn'
                        }`}>
                          <strong>{RotuloTendencia[clienteDetalhe.tendencia]}</strong> — {ExplicacaoTendencia[clienteDetalhe.tendencia]}
                        </p>
                      )}

                      {/* Os 3 comparativos prontos do MP, com o número — não só
                          a categoria derivada. Mesma regra de sinal confirmada
                          contra a planilha real: período mais recente menos
                          período mais antigo (positivo = cresceu, negativo =
                          caiu). */}
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[10px] text-ink-faint">Comparativos · mais recente − mais antigo (positivo = cresceu, negativo = caiu)</p>
                        {([
                          ['TPV M3 vs M1', clienteDetalhe.tpv_m3_vs_m1, '3 meses atrás → mês passado'],
                          ['TPV M2 vs M1', clienteDetalhe.tpv_m2_vs_m1, '2 meses atrás → mês passado'],
                          ['TPV M0 vs mesma data mês anterior', clienteDetalhe.tpv_m0_vs_mesma_data, 'este mês até hoje → mesmo intervalo no mês passado'],
                        ] as [string, number | null, string][]).map(([rot, v, sub]) => (
                          <div key={rot} className="flex items-center justify-between gap-3 bg-card-2 rounded-lg px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs text-ink-dim">{rot}</p>
                              <p className="text-[10px] text-ink-faint truncate">{sub}</p>
                            </div>
                            <p className={`text-sm font-semibold tabular-nums flex-shrink-0 ${
                              v == null ? 'text-ink-faint' : v < 0 ? 'text-bad' : v > 0 ? 'text-good' : 'text-ink-muted'
                            }`}>
                              {v == null ? '—' : `${v >= 0 ? '+' : '-'}${brl(Math.abs(v))}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    {(clienteDetalhe.oportunidade_1x || clienteDetalhe.oportunidade_parc) && (
                      <section>
                        <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2">Oportunidade de reversão</p>
                        <div className="space-y-2">
                          {clienteDetalhe.oportunidade_1x && (
                            <div className="flex items-center justify-between bg-primary/8 rounded-xl px-3 py-2 text-sm">
                              <span className="text-ink-dim">À vista</span>
                              <span className="tabular-nums text-ink">
                                {brl(clienteDetalhe.valor_1x ?? 0)}
                                {clienteDetalhe.ating_1x != null && ` · ${Math.round(clienteDetalhe.ating_1x * 100)}% capturado`}
                                {clienteDetalhe.revertido_1x && <span className="text-good font-medium"> · revertida</span>}
                              </span>
                            </div>
                          )}
                          {clienteDetalhe.oportunidade_parc && (
                            <div className="flex items-center justify-between bg-primary/8 rounded-xl px-3 py-2 text-sm">
                              <span className="text-ink-dim">Parcelado</span>
                              <span className="tabular-nums text-ink">
                                {brl(clienteDetalhe.valor_parc ?? 0)}
                                {clienteDetalhe.ating_parc != null && ` · ${Math.round(clienteDetalhe.ating_parc * 100)}% capturado`}
                                {clienteDetalhe.revertido_parc && <span className="text-good font-medium"> · revertida</span>}
                              </span>
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    <section>
                      <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2">Situação e contexto</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-3">
                        <Campo rotulo="Status" valor={clienteDetalhe.status ?? '—'} />
                        <Campo rotulo="Segmento" valor={clienteDetalhe.mcc ?? '—'} />
                        <Campo rotulo="Prioridade MP" valor={carregandoDetalhe ? '…' : (detalheExtra?.quartil ?? '—')} />
                        <Campo rotulo="Crédito" valor={carregandoDetalhe ? '…' : (detalheExtra?.status_credito ?? '—')} />
                        <Campo rotulo="Recorrência" valor={carregandoDetalhe ? '…' : (detalheExtra?.recorrencia ?? '—')} />
                        <Campo rotulo="Multicontas" valor={carregandoDetalhe ? '…' : (detalheExtra?.multicontas != null ? String(detalheExtra.multicontas) : '—')} />
                        <Campo rotulo="Sem transacionar"
                          valor={clienteDetalhe.dias_sem_transacionar != null ? `${clienteDetalhe.dias_sem_transacionar}d` : '—'}
                          sub={!carregandoDetalhe && detalheExtra?.dt_ultima_transacao ? `última em ${dataBR(detalheExtra.dt_ultima_transacao)}` : null} />
                        <Campo rotulo="Sem contato" valor={clienteDetalhe.diasSemContato != null ? `${clienteDetalhe.diasSemContato}d` : 'nunca'} />
                        <Campo rotulo="Sem pesquisa" valor={clienteDetalhe.diasSemPesquisa != null ? `${clienteDetalhe.diasSemPesquisa}d` : 'nunca'} />
                      </div>
                      {clienteDetalhe.vazandoFora && (
                        <p className="text-xs text-ink-dim bg-card-2 rounded-lg px-3 py-2 mt-3">
                          Processa <strong className="tabular-nums">{brl(clienteDetalhe.tpv_outras_contas ?? 0)}</strong> em
                          outras contas MP — mais do que processa aqui.
                        </p>
                      )}
                      {clienteDetalhe.semAcao && (
                        <p className="text-xs text-warn bg-warn-bg rounded-lg px-3 py-2 mt-2">
                          Nenhuma ação comercial atribuída a este cliente ainda.
                        </p>
                      )}
                    </section>

                    <a href="/dashboard/acionaveis"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 rounded-lg px-3 py-2 transition-colors">
                      Ver na fila de Acionáveis →
                    </a>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
