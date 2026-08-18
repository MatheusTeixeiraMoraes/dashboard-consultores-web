'use client'

import { useState, useMemo } from 'react'
import MultiFiltro from '@/components/MultiFiltro'
import { compararRitmo, estagnacao, faixaTPV, ROTULO_FAIXA, type FaixaTPV } from '@/lib/tpv'
import { precisaIdentificar } from '@/lib/texto'
import type { LinhaTPV, PontoSerie } from './page'

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

type Ordem = 'pior-ritmo' | 'maior-perda' | 'mais-parado' | 'maior-tpv'

interface Props {
  dataReferencia: string | null
  linhas: LinhaTPV[]
  serie: PontoSerie[]
  fichas: Record<string, { nome: string; telefone: string | null; local: string }>
  sellersComAcao: string[]
  podeGerir: boolean
}

/** Limiares de primeira versão para "sinal de abandono" — fáceis de ajustar. */
const DIAS_SEM_CONTATO = 30
const DIAS_SEM_PESQUISA = 90

const SINAIS = ['Sem ação atribuída', 'Oportunidade aberta', 'TPV em outras contas', 'Sem contato/pesquisa recente'] as const

const diasDesde = (iso: string | null, hoje: string): number | null => {
  if (!iso) return null
  return Math.round((Date.parse(hoje) - Date.parse(iso.slice(0, 10))) / 86400000)
}

/**
 * Tendência do mês num traço só, sem eixo nem tooltip — cabe dentro da
 * célula, ao lado do valor. Recharts fica de fora de propósito (é ~84KB
 * brotli, já reservado só pra gráfico full-size em outra tela); aqui é SVG
 * cru porque é a única coisa que cabe no espaço de uma linha de tabela.
 */
function Sparkline({ pontos }: { pontos: number[] }) {
  if (pontos.length < 2) return null
  const w = 56, h = 20, pad = 2
  const min = Math.min(...pontos)
  const max = Math.max(...pontos)
  const span = max - min || 1
  const passo = (w - pad * 2) / (pontos.length - 1)
  const xy = pontos.map((v, i) => [pad + i * passo, pad + (h - pad * 2) * (1 - (v - min) / span)] as const)
  const linha = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${pad},${h - pad} ${linha} ${(w - pad).toFixed(1)},${h - pad}`
  const tendencia = pontos[pontos.length - 1] - pontos[0]
  const cor = tendencia > 0 ? 'var(--color-good)' : tendencia < 0 ? 'var(--color-bad)' : 'var(--color-ink-faint)'
  const [lx, ly] = xy[xy.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0" aria-hidden="true">
      <polygon points={area} fill={cor} opacity={0.12} />
      <polyline points={linha} fill="none" stroke={cor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.1" fill={cor} />
    </svg>
  )
}

export default function QuedaTpvClient({ dataReferencia, linhas, serie, fichas, sellersComAcao, podeGerir }: Props) {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [ordem, setOrdem] = useState<Ordem>('maior-perda')
  const [fConsultores, setFConsultores] = useState<Set<string>>(new Set())
  const [fFaixas, setFFaixas] = useState<Set<string>>(new Set())
  const [fStatus, setFStatus] = useState<Set<string>>(new Set())
  const [fMcc, setFMcc] = useState<Set<string>>(new Set())
  const [fSinais, setFSinais] = useState<Set<string>>(new Set())

  // Série por cliente, para saber há quantos dias o acumulado não sobe.
  const seriePorSeller = useMemo(() => {
    const m = new Map<string, { data: string; tpv: number | null }[]>()
    for (const p of serie) {
      const l = m.get(p.seller_id)
      const ponto = { data: p.data_referencia, tpv: p.tpv_mes_atual }
      if (l) l.push(ponto); else m.set(p.seller_id, [ponto])
    }
    return m
  }, [serie])

  const semAcaoSet = useMemo(() => new Set(sellersComAcao), [sellersComAcao])

  const enriquecidas = useMemo(() => {
    if (!dataReferencia) return []
    return linhas.map(l => {
      const r = compararRitmo(l.tpv_mes_atual, l.tpv_mes_passado, dataReferencia)
      const e = estagnacao(seriePorSeller.get(l.seller_id) ?? [])
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

      return {
        ...l, ...r, ...e, perda, faixa: faixaTPV(r.variacao),
        temOportunidade, valorOportunidade, pctCapturado, revertida,
        semAcao, vazandoFora, diasSemContato, diasSemPesquisa, riscoAbandono,
        diasRestantes, faltaTotal, ritmoNecessario,
      }
    })
  }, [linhas, dataReferencia, seriePorSeller, semAcaoSet])

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
    return false
  }, [fSinais])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const arr = enriquecidas.filter(l =>
      (fConsultores.size === 0 || fConsultores.has(l.consultor_nome)) &&
      (fFaixas.size === 0 || fFaixas.has(ROTULO_FAIXA[l.faixa])) &&
      (fStatus.size === 0 || fStatus.has(l.status ?? '')) &&
      (fMcc.size === 0 || fMcc.has(l.mcc ?? '')) &&
      passaSinais(l) &&
      (!q || l.seller_id.includes(q) || (fichas[l.seller_id]?.nome ?? '').toLowerCase().includes(q)),
    )
    const cmp: Record<Ordem, (a: typeof arr[0], b: typeof arr[0]) => number> = {
      'pior-ritmo': (a, b) => (a.variacao ?? 9) - (b.variacao ?? 9),
      'maior-perda': (a, b) => b.perda - a.perda,
      'mais-parado': (a, b) => (b.diasSemVender ?? -1) - (a.diasSemVender ?? -1),
      'maior-tpv': (a, b) => (b.tpv_mes_atual ?? 0) - (a.tpv_mes_atual ?? 0),
    }
    return [...arr].sort(cmp[ordem])
  }, [enriquecidas, busca, fConsultores, fFaixas, fStatus, fMcc, passaSinais, ordem, fichas])

  const kpis = useMemo(() => {
    const emQueda = filtradas.filter(l => l.faixa === 'queda' || l.faixa === 'queda-forte')
    const parados = filtradas.filter(l => (l.diasSemVender ?? 0) >= 3)
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

  const temSerie = useMemo(() => enriquecidas.some(l => l.temSerie), [enriquecidas])

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
        </div>
      </div>

      {!temSerie && (
        <p className="text-xs text-warn bg-warn-bg rounded-xl px-4 py-2.5 mb-4">
          Só existe um envio deste mês. A coluna &quot;sem vender&quot; começa a funcionar no
          segundo envio — é a diferença entre dois retratos que mostra quem parou.
        </p>
      )}

      {/* Lista de cartões, não tabela: cada cliente é um bloco com respiro
          próprio, não uma linha presa numa grade de bordas de célula — é
          isso, mais do que qualquer cor, que tira a cara de planilha.
          Ritmo, variação e perda continuam numa célula composta só; situação
          e dias parado também. */}
      <div className="flex flex-col gap-2">
        {visiveis.map(l => {
          const f = fichas[l.seller_id]
          const pontos = (seriePorSeller.get(l.seller_id) ?? [])
            .filter((p): p is { data: string; tpv: number } => p.tpv != null)
            .sort((a, b) => a.data.localeCompare(b.data))
            .map(p => p.tpv)
          const pendente = precisaIdentificar(f?.nome ?? '', l.seller_id)
          const nomeExibido = pendente ? `#${l.seller_id}` : (f?.nome ?? `#${l.seller_id}`)
          const situacao = PillSituacao[l.status ?? ''] ?? { bg: 'bg-card-2 text-ink-dim', dot: 'bg-ink-faint' }
          return (
            <div key={l.seller_id}
              className="glass rounded-2xl border border-line px-4 py-3.5 grid grid-cols-1 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1.1fr)_minmax(0,1.15fr)_minmax(0,1fr)] gap-3 md:gap-4 md:items-center hover:border-primary/30 transition-colors">

              {/* Identidade + sinais */}
              <div className="flex gap-2.5 min-w-0">
                <span className={`w-8 h-8 rounded-full grid place-items-center text-white text-xs font-semibold flex-shrink-0 ${corAvatar(l.seller_id)}`}>
                  {inicial(nomeExibido)}
                </span>
                <div className="min-w-0">
                  {pendente
                    ? <p className="text-warn truncate leading-tight text-sm">Pendente de identificação <span className="font-mono text-[11px] text-ink-faint">#{l.seller_id}</span></p>
                    : <p className="text-ink truncate leading-tight text-sm font-medium">{nomeExibido}</p>}
                  <p className="text-[11px] text-ink-faint truncate mt-0.5">
                    {podeGerir ? l.consultor_nome : f?.local || `#${l.seller_id}`}
                  </p>
                  {(l.temOportunidade || l.semAcao || l.vazandoFora || l.riscoAbandono) && (
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
                    </div>
                  )}
                </div>
              </div>

              {/* Ritmo diário + tendência */}
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
                <Sparkline pontos={pontos} />
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
                {l.tpv_mes_passado != null && (
                  <p className="text-[11px] tabular-nums text-ink-faint text-right">
                    mês passado {brl(l.tpv_mes_passado)}
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
                <span className={`text-[11px] ${l.diasSemVender != null && l.diasSemVender >= 3 ? 'text-bad font-semibold' : 'text-ink-faint'}`}>
                  {l.diasSemVender == null ? '—' : `${l.diasSemVender}d sem vender`}
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
    </div>
  )
}
