'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import CategoryHeader from '@/components/dashboard/CategoryHeader'

/* recharts fora do first-load desta tela.
 *
 * Esta é a porta de entrada do app: importar o gráfico direto colocava ~338 KB
 * (~84 KB brotli) no pacote inicial de todo mundo — inclusive do consultor, para
 * quem o `!modoConsultor` abaixo nunca desenha o gráfico.
 *
 * `ssr: false` não custa conteúdo aqui: o ResponsiveContainer mede o DOM para se
 * dimensionar, então no servidor ele já não pintava gráfico nenhum. Só é válido
 * porque este arquivo é 'use client'.
 *
 * O `loading` devolve a mesma altura do container (h-28) para a página não dar
 * salto quando o chunk chega. */
const DistribuicaoEquipe = dynamic(() => import('./DistribuicaoEquipe'), {
  ssr: false,
  loading: () => <div className="h-full" />,
})
import type { CarteiraResumo } from './page'
import type { ScoreGeralFaixas } from '@/lib/types'
import {
  ativosMinimosNetChurn,
  aderentesMinimosAgenda,
  metaAcionaveis,
  metaAwareness,
  numeroOuNaN,
  PISO_AWARENESS_PADRAO,
  textoMetaNetChurn,
  textoMetaAderencia,
  type FaixaAcionaveis,
  type FaixaAwareness,
} from '@/lib/pilares'

const PILARES = ['tpv', 'net_churn', 'acionaveis', 'aderencia', 'awareness', 'produtividade']
const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'NC', acionaveis: 'AC',
  aderencia: 'Agenda', awareness: 'AW', produtividade: 'Prod',
}
const PILAR_NOME: Record<string, string> = {
  tpv: 'TPV', net_churn: 'Net Churn', acionaveis: 'Acionáveis',
  aderencia: 'Aderência', awareness: 'Pesquisas', produtividade: 'Produtividade',
}
const PILAR_COLOR: Record<string, string> = {
  tpv: 'var(--color-pilar-tpv)', net_churn: 'var(--color-pilar-net-churn)', acionaveis: 'var(--color-pilar-acionaveis)',
  aderencia: 'var(--color-pilar-aderencia)', awareness: 'var(--color-pilar-awareness)', produtividade: 'var(--color-pilar-produtividade)',
}

// Situação da carteira (Planilha Ação Oportunidades), na ordem da barrinha.
const STATUS_ORDEM = ['ATIVO', 'REATIVADO', 'INATIVO', 'CHURN']
const STATUS_COR: Record<string, string> = {
  ATIVO: 'var(--color-good-fill)', REATIVADO: 'var(--color-primary)',
  INATIVO: 'var(--color-warn-fill)', CHURN: 'var(--color-bad-fill)',
}

function statusStyle(score: number, faixas: ScoreGeralFaixas) {
  if (score >= faixas.meta_objetivo) return { bg: 'var(--color-good-bg)', text: 'var(--color-good)' }
  if (score >= faixas.limite_critico) return { bg: 'var(--color-warn-bg)', text: 'var(--color-warn)' }
  return { bg: 'var(--color-bad-bg)', text: 'var(--color-bad)' }
}

function fmtMeta(meta: number, unidade: string): string {
  if (unidade === '%') {
    const digits = Math.abs(meta) % 1 === 0 ? 0 : 2
    return `${meta.toFixed(digits).replace('.', ',')}%`
  }
  if (Number.isInteger(meta)) return String(meta)
  return meta.toFixed(1).replace('.', ',')
}

const nBR = (n: number) => n.toLocaleString('pt-BR')
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
// "R$ 12,3 mi" — os totais passam de milhão e o card não é lugar de contar dígito.
const brlCompacto = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

interface ConsultorData {
  id: string | null
  nome: string
  total: number | null          // null = está na carteira mas sem planilha de score
  scores: Record<string, number>
  carteira: (CarteiraResumo & { nome: string }) | null
  metricas?: Record<string, unknown> | null
}

interface Props {
  ranking: ConsultorData[]
  dateDisplay: string | null
  dataCarteiraBR: string | null
  metaMap: Record<string, { meta: number; unidade: string; piso_minimo?: number | null }>
  modoConsultor: boolean
  meuNome: string
  faixas: ScoreGeralFaixas
  faixasAwareness: FaixaAwareness[]
  faixasAcionaveis: FaixaAcionaveis[]
}

interface MetaDoMes {
  label: string
  valor: string
  detalhe: string
  progresso: number | null
  atingida: boolean | null
  color: string
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
}

function fmtDecimal(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function progresso(current: number, target: number): number {
  return target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : current >= target ? 100 : 0
}

function MetaCard({ item }: { item: MetaDoMes }) {
  const statusColor = item.atingida === null ? 'var(--color-ink-muted)' : item.atingida ? 'var(--color-good)' : 'var(--color-warn)'
  return (
    <div className="glass rounded-2xl border border-line p-4 min-w-0" style={{ borderLeft: `3px solid ${item.color}` }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-ink-muted">
          <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: item.color }} />
          {item.label}
        </p>
        {item.progresso !== null && <span className="text-[10px] font-semibold tabular-nums" style={{ color: statusColor }}>{Math.round(item.progresso)}%</span>}
      </div>
      <p className="text-xl sm:text-2xl font-bold text-ink tabular-nums leading-tight">{item.valor}</p>
      <div className="h-1.5 rounded-full bg-card-2 overflow-hidden mt-3">
        {item.progresso !== null && (
          <div role="progressbar" aria-label={`Progresso: ${item.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progresso)} className="h-full rounded-full transition-[width]" style={{ width: `${item.progresso}%`, background: item.color }} />
        )}
      </div>
      <p className="text-xs mt-2 min-h-8" style={{ color: item.atingida === null ? 'var(--color-ink-muted)' : statusColor }}>{item.detalhe}</p>
    </div>
  )
}

function metasDoMes(
  consultor: ConsultorData,
  metaMap: Props['metaMap'],
  faixasAwareness: FaixaAwareness[],
  faixasAcionaveis: FaixaAcionaveis[],
): MetaDoMes[] {
  const m = consultor.metricas ?? {}
  const status = consultor.carteira?.status
  const tamanhoCarteira = status ? Object.values(status).reduce((total, n) => total + n, 0) : null
  const carteiraAtiva = status && Object.keys(status).length > 0
    ? (status.ATIVO ?? 0) + (status.REATIVADO ?? 0)
    : null
  const cards: MetaDoMes[] = []
  const addQuantidade = (label: string, realizado: number, alvo: number, unidade: string, color: string) => {
    const atingida = realizado >= alvo
    const faltam = Math.max(0, Math.ceil(alvo - realizado))
    cards.push({
      label,
      valor: `${nBR(realizado)} / ${nBR(alvo)}`,
      detalhe: `${unidade} · ${atingida ? 'meta atingida' : `faltam ${nBR(faltam)}`}`,
      progresso: progresso(realizado, alvo),
      atingida,
      color,
    })
  }

  const tpvAtual = numeroOuNaN(m['TPV Total mês atual'])
  const tpvMeta = numeroOuNaN(m['Objetivo TPV Total Atual'])
  if (Number.isFinite(tpvAtual) && Number.isFinite(tpvMeta)) {
    const atingida = tpvAtual >= tpvMeta
    cards.push({
      label: 'TPV',
      valor: `${fmtCurrency(tpvAtual)} / ${fmtCurrency(tpvMeta)}`,
      detalhe: atingida ? 'meta atingida' : `faltam ${fmtCurrency(tpvMeta - tpvAtual)}`,
      progresso: progresso(tpvAtual, tpvMeta),
      atingida,
      color: PILAR_COLOR.tpv,
    })
  } else {
    cards.push({ label: 'TPV', valor: '— / —', detalhe: 'aguardando dados da planilha', progresso: null, atingida: null, color: PILAR_COLOR.tpv })
  }

  const baseNetChurn = numeroOuNaN(m['Sellers ativos mês passado'])
  const ativosHoje = numeroOuNaN(m['Sellers ativos mês atual'])
  const metaNetChurn = metaMap.net_churn?.meta
  if (baseNetChurn > 0 && Number.isFinite(ativosHoje) && Number.isFinite(metaNetChurn)) {
    const ativosMinimos = ativosMinimosNetChurn(baseNetChurn, metaNetChurn)
    const atingida = ativosHoje >= ativosMinimos
    const saldoNecessario = ativosMinimos - baseNetChurn
    if (metaNetChurn < 0) {
      const perdas = Math.max(0, baseNetChurn - ativosHoje)
      const limitePerdas = Math.max(0, baseNetChurn - ativosMinimos)
      cards.push({
        label: 'Net Churn',
        valor: `${nBR(perdas)} / máx. ${nBR(limitePerdas)}`,
        detalhe: atingida ? 'perdas líquidas de sellers · dentro do limite' : `perdas líquidas · recupere ${nBR(ativosMinimos - ativosHoje)} sellers ativos`,
        progresso: progresso(ativosHoje, ativosMinimos),
        atingida,
        color: PILAR_COLOR.net_churn,
      })
    } else {
      const saldoAtual = ativosHoje - baseNetChurn
      cards.push({
        label: 'Net Churn',
        valor: `${saldoAtual > 0 ? '+' : ''}${nBR(saldoAtual)} / mín. ${saldoNecessario > 0 ? '+' : ''}${nBR(saldoNecessario)}`,
        detalhe: atingida ? 'saldo líquido de sellers · meta atingida' : `saldo líquido · faltam ${nBR(ativosMinimos - ativosHoje)} ativos`,
        progresso: progresso(ativosHoje, ativosMinimos),
        atingida,
        color: PILAR_COLOR.net_churn,
      })
    }
  } else {
    cards.push({ label: 'Net Churn', valor: '— / —', detalhe: 'aguardando dados da planilha', progresso: null, atingida: null, color: PILAR_COLOR.net_churn })
  }

  const revertidas = numeroOuNaN(m['Total Acionáveis Revertido'])
  if (Number.isFinite(revertidas) && tamanhoCarteira !== null) {
    addQuantidade('Acionáveis', revertidas, metaAcionaveis(tamanhoCarteira, faixasAcionaveis), 'tarefas revertidas', PILAR_COLOR.acionaveis)
  } else {
    cards.push({ label: 'Acionáveis', valor: '— / —', detalhe: 'aguardando dados da carteira', progresso: null, atingida: null, color: PILAR_COLOR.acionaveis })
  }

  const agendados = numeroOuNaN(m['Sellers agendados'])
  const aderentes = numeroOuNaN(m['Sellers aderentes à agenda'])
  const metaAderencia = metaMap.aderencia?.meta
  if (agendados > 0 && Number.isFinite(aderentes) && Number.isFinite(metaAderencia)) {
    const minimo = aderentesMinimosAgenda(agendados, metaAderencia)
    const atingida = aderentes >= minimo
    cards.push({
      label: 'Aderência',
      valor: `${nBR(aderentes)} / ${nBR(minimo)}`,
      detalhe: `${nBR(agendados)} agendados · ${atingida ? 'meta atingida' : `faltam ${nBR(minimo - aderentes)} visitas`}`,
      progresso: progresso(aderentes, minimo),
      atingida,
      color: PILAR_COLOR.aderencia,
    })
  } else {
    cards.push({ label: 'Aderência', valor: '— / —', detalhe: 'aguardando dados da agenda', progresso: null, atingida: null, color: PILAR_COLOR.aderencia })
  }

  const respostas = numeroOuNaN(m['Sellers que responderam pesquisa'])
  if (Number.isFinite(respostas) && carteiraAtiva !== null) {
    addQuantidade('Pesquisas', respostas, metaAwareness(carteiraAtiva, faixasAwareness, metaMap.awareness?.piso_minimo ?? PISO_AWARENESS_PADRAO), 'respostas', PILAR_COLOR.awareness)
  } else {
    cards.push({ label: 'Pesquisas', valor: '— / —', detalhe: 'aguardando dados da carteira ativa', progresso: null, atingida: null, color: PILAR_COLOR.awareness })
  }

  const produtividade = numeroOuNaN(m['Prod média por dia útil'])
  const metaProdutividade = metaMap.produtividade?.meta
  if (Number.isFinite(produtividade) && Number.isFinite(metaProdutividade)) {
    const atingida = produtividade >= metaProdutividade
    const unidade = metaMap.produtividade?.unidade || 'por dia útil'
    cards.push({
      label: 'Produtividade',
      valor: `${fmtDecimal(produtividade)} / ${fmtMeta(metaProdutividade, unidade)}`,
      detalhe: `${unidade} · ${atingida ? 'meta atingida' : `faltam ${fmtDecimal(metaProdutividade - produtividade)}`}`,
      progresso: progresso(produtividade, metaProdutividade),
      atingida,
      color: PILAR_COLOR.produtividade,
    })
  } else {
    cards.push({ label: 'Produtividade', valor: '— / —', detalhe: 'aguardando dados da planilha', progresso: null, atingida: null, color: PILAR_COLOR.produtividade })
  }
  return cards
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div
      className="glass rounded-2xl border border-line p-4"
      style={color ? { borderLeft: `3px solid ${color}` } : undefined}
    >
      <p className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: color ?? 'var(--color-ink-muted)' }}>
        {label}
      </p>
      <p className="text-3xl font-bold" style={{ color: color ?? 'var(--color-ink)' }}>{value}</p>
      {sub && <p className="text-xs text-ink-muted mt-1">{sub}</p>}
    </div>
  )
}

/** Barrinha de situação da carteira (mesma linguagem visual dos quartis em Acionáveis). */
function BarraSituacao({ status, largura = 'min-w-[72px]' }: { status: Record<string, number>; largura?: string }) {
  const total = Object.values(status).reduce((s, n) => s + n, 0)
  if (total === 0) return <span className="text-ink-faint">—</span>
  const titulo = STATUS_ORDEM.filter(s => status[s]).map(s => `${s}: ${nBR(status[s])}`).join(' · ')
  return (
    <div title={titulo}>
      <div className={`flex h-2 rounded-full overflow-hidden bg-card-2 ${largura}`}>
        {STATUS_ORDEM.map(s => {
          const n = status[s] ?? 0
          return n ? <div key={s} style={{ width: `${(n / total) * 100}%`, background: STATUS_COR[s] }} /> : null
        })}
      </div>
      <p className="text-[11px] text-ink-faint mt-1 whitespace-nowrap">
        <span className="text-good font-medium">{nBR(status.ATIVO ?? 0)} ativos</span>
        {(status.CHURN ?? 0) > 0 && <> · <span className="text-bad font-medium">{nBR(status.CHURN)} churn</span></>}
      </p>
    </div>
  )
}

/** Bloco de número com rótulo — o vocabulário dos cards do ranking. */
function Stat({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[120px]">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-1">{rotulo}</p>
      {children}
    </div>
  )
}

export default function GeralClient({ ranking, dateDisplay, dataCarteiraBR, metaMap, modoConsultor, meuNome, faixas, faixasAwareness, faixasAcionaveis }: Props) {
  const stats = useMemo(() => {
    const comScore = ranking.filter((c): c is ConsultorData & { total: number } => c.total !== null)
    const acima = comScore.filter(c => c.total >= faixas.meta_objetivo).length
    const naLinha = comScore.filter(c => c.total >= faixas.limite_critico && c.total < faixas.meta_objetivo).length
    const critico = comScore.filter(c => c.total < faixas.limite_critico).length
    const media = comScore.length > 0 ? comScore.reduce((s, c) => s + c.total, 0) / comScore.length : 0
    // Totais de carteira — soma o que veio (no consultor, é só a dele).
    const clientes = ranking.reduce((s, c) => s + (c.carteira?.clientes ?? 0), 0)
    const pendentes = ranking.reduce((s, c) => s + (c.carteira?.pendentes ?? 0), 0)
    const tpv = ranking.reduce((s, c) => s + (c.carteira?.tpv ?? 0), 0)
    return { acima, naLinha, critico, media, nComScore: comScore.length, clientes, pendentes, tpv }
  }, [ranking, faixas])

  const chartData = [
    { name: 'Acima do objetivo', count: stats.acima, color: 'var(--color-good-fill)' },
    { name: 'Alerta', count: stats.naLinha, color: 'var(--color-warn-fill)' },
    { name: 'Crítico', count: stats.critico, color: 'var(--color-bad-fill)' },
  ]

  const meuScore = modoConsultor ? ranking.find(c => c.total !== null)?.total ?? null : null
  const metasConsultor = modoConsultor && ranking[0]
    ? metasDoMes(ranking[0], metaMap, faixasAwareness, faixasAcionaveis)
    : []

  return (
    <div className="category-page category-page--performance">
      <CategoryHeader
        category="performance"
        title={modoConsultor ? 'Minha visão geral' : 'Visão geral'}
        description={`${modoConsultor ? meuNome : `${ranking.length} consultores${dateDisplay ? ` · ${dateDisplay}` : ''}`}${dataCarteiraBR ? ` · carteira de ${dataCarteiraBR}` : ''}`}
      />

      {modoConsultor && (
        <section aria-labelledby="metas-do-mes" className="mb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <div>
              <h2 id="metas-do-mes" className="text-base font-semibold text-ink">Metas do mês</h2>
              <p className="text-xs text-ink-muted mt-0.5">Veja quanto já alcançou e o que falta em cada pilar.</p>
            </div>
            <p className="text-[11px] text-ink-faint">Net Churn considera perdas líquidas após reativações.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {metasConsultor.map(item => <MetaCard key={item.label} item={item} />)}
          </div>
        </section>
      )}

      {/* Resumo pessoal em destaque; a grade da equipe permanece inalterada. */}
      {modoConsultor ? (
        <div className="grid lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,2.2fr)] gap-3 mb-5">
          <div className="glass rounded-2xl border border-line p-5 sm:p-6 relative overflow-hidden" style={meuScore !== null ? { borderLeft: `4px solid ${statusStyle(meuScore, faixas).text}` } : undefined}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted">Meu score</p>
                <p className="text-4xl sm:text-5xl font-bold tracking-tight tabular-nums mt-2" style={{ color: meuScore !== null ? statusStyle(meuScore, faixas).text : 'var(--color-ink-muted)' }}>
                  {meuScore !== null ? meuScore.toFixed(1).replace('.', ',') : '—'}
                  {meuScore !== null && <span className="text-base sm:text-lg font-semibold ml-1">pts</span>}
                </p>
                <p className="text-xs text-ink-muted mt-1">de 10,0 pontos</p>
              </div>
              {meuScore !== null && <span className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: statusStyle(meuScore, faixas).bg, color: statusStyle(meuScore, faixas).text }}>
                {meuScore >= faixas.meta_objetivo ? 'Meta atingida' : meuScore >= faixas.limite_critico ? 'Em atenção' : 'Em desenvolvimento'}
              </span>}
            </div>
            <div className="h-2 rounded-full bg-card-2 overflow-hidden mt-5">
              {meuScore !== null && <div role="progressbar" aria-label="Meu score geral" aria-valuemin={0} aria-valuemax={10} aria-valuenow={meuScore} className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(0, Math.min(100, meuScore * 10))}%`, background: statusStyle(meuScore, faixas).text }} />}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              label="Clientes na carteira"
              value={nBR(stats.clientes)}
              sub={dataCarteiraBR ? `Planilha de ${dataCarteiraBR}` : undefined}
            />
            <SummaryCard label="TPV da carteira" value={brlCompacto(stats.tpv)} sub="faturamento do mês" color="var(--color-good)" />
            <SummaryCard
              label="Pendentes de identificação"
              value={nBR(stats.pendentes)}
              sub={stats.clientes > 0 ? `${Math.round(stats.pendentes / stats.clientes * 100)}% da carteira` : undefined}
              color={stats.pendentes > 0 ? 'var(--color-warn)' : undefined}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <SummaryCard label="Total equipe" value={String(ranking.length)} />
          <SummaryCard
            label="Clientes na carteira"
            value={nBR(stats.clientes)}
            sub={dataCarteiraBR ? `Planilha Ação Oportunidades de ${dataCarteiraBR}` : undefined}
          />
          <SummaryCard label="TPV da carteira" value={brlCompacto(stats.tpv)} sub="faturamento do mês" color="var(--color-good)" />
          <SummaryCard
            label="Pendentes de identificação"
            value={nBR(stats.pendentes)}
            sub={stats.clientes > 0 ? `${Math.round(stats.pendentes / stats.clientes * 100)}% da carteira` : undefined}
            color={stats.pendentes > 0 ? 'var(--color-warn)' : undefined}
          />
          <SummaryCard
            label="Acima do objetivo"
            value={String(stats.acima)}
            sub={`${stats.nComScore > 0 ? Math.round(stats.acima / stats.nComScore * 100) : 0}% da equipe`}
            color="var(--color-good)"
          />
          <SummaryCard
            label="Crítico"
            value={String(stats.critico)}
            sub={`${stats.nComScore > 0 ? Math.round(stats.critico / stats.nComScore * 100) : 0}% da equipe`}
            color="var(--color-bad)"
          />
          <SummaryCard
            label="Média da equipe"
            value={stats.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' pts'}
            sub="de 10,0 pts"
          />
        </div>
      )}

      {/* Gráfico de distribuição — só faz sentido com equipe */}
      {!modoConsultor && (
        <div className="glass rounded-2xl border border-line p-5 mb-5">
          <p className="text-sm font-semibold text-ink mb-4">Distribuição da equipe</p>
          <div className="hidden sm:block h-28">
            <DistribuicaoEquipe dados={chartData} total={stats.nComScore} />
          </div>
          {/* Abaixo de sm, 3 linhas rotuladas com barra em largura total no
              lugar do gráfico — o YAxis (width 120) + margem direita (48px)
              do Recharts num h-28 não cabiam em ~290px úteis, e "Acima do
              objetivo" a 12px não cabe em 120px (Recharts não quebra rótulo
              de categoria). São só 3 valores fixos — não precisa de gráfico
              pra contar essa história. */}
          <div className="sm:hidden space-y-2.5">
            {chartData.map(item => (
              <div key={item.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink-dim">{item.name}</span>
                  <span className="font-semibold text-ink tabular-nums">{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-card-2 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${stats.nComScore > 0 ? (item.count / stats.nComScore) * 100 : 0}%`, background: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Consultor vê os próprios pilares; a equipe mantém o ranking em cards. */}
      {modoConsultor ? (
        ranking[0] ? (
          <section aria-labelledby="pontuacao-pilares" className="glass rounded-2xl border border-line p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 id="pontuacao-pilares" className="text-sm font-semibold text-ink">Pontuação por pilar</h2>
                <p className="text-xs text-ink-muted mt-0.5">Sua contribuição em cada frente do resultado.</p>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                <span className="w-2 h-2 rounded-full" style={{ background: PILAR_COLOR.tpv }} />
                Cada cor representa um pilar
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
              {PILARES.map(p => {
                const score = ranking[0].scores[p]
                return (
                  <div key={p} className="rounded-xl border border-line p-3 min-w-0" style={{ borderTop: `3px solid ${PILAR_COLOR[p]}`, background: `color-mix(in srgb, ${PILAR_COLOR[p]} 8%, var(--color-card))` }}>
                    <p className="text-[11px] font-semibold text-ink-muted truncate">{PILAR_NOME[p]}</p>
                    <p className="text-2xl font-bold text-ink tabular-nums mt-2">{score !== undefined ? <>{score.toFixed(1).replace('.', ',')}<span className="text-xs font-medium text-ink-faint ml-1">pts</span></> : '—'}</p>
                  </div>
                )
              })}
            </div>
          </section>
        ) : (
          <div className="glass rounded-2xl border border-line p-12 text-center">
            <p className="text-ink-muted">Nenhum resultado na data mais recente.</p>
          </div>
        )
      ) : ranking.length === 0 ? (
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="text-ink-muted">Nenhum resultado na data mais recente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ranking.map((c, i) => {
            const st = c.total !== null ? statusStyle(c.total, faixas) : null
            const pos = c.total !== null ? i + 1 : null
            return (
              <div key={c.id ?? `carteira-${c.nome}`} className="glass rounded-2xl border border-line p-5 hover:border-primary/40 transition-colors">
                <div className="flex items-center gap-x-6 gap-y-4 flex-wrap">
                  {/* posição — só o topo do pódio ganha destaque */}
                  <span className={`w-9 h-9 rounded-full grid place-items-center text-sm font-bold flex-shrink-0 ${
                    pos === 1 ? 'bg-primary text-white shadow-[0_2px_10px_rgba(79,95,224,0.4)]'
                    : pos !== null && pos <= 3 ? 'bg-primary/15 text-primary-lt border border-primary/30'
                    : 'bg-card-2 text-ink-muted border border-line'
                  }`}>
                    {pos ?? '—'}
                  </span>

                  {/* nome */}
                  <div className="min-w-[180px] flex-1">
                    <p className="font-semibold text-ink leading-tight">{c.nome}</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">{c.id ? `Carteira ${c.id}` : 'sem planilha de score'}</p>
                  </div>

                  {/* números da carteira */}
                  <Stat rotulo="Clientes">
                    {c.carteira ? (
                      <>
                        <p className="text-xl font-bold text-ink tabular-nums leading-none">{nBR(c.carteira.clientes)}</p>
                        {c.carteira.pendentes > 0
                          ? <p className="text-[11px] text-warn mt-1 whitespace-nowrap">{nBR(c.carteira.pendentes)} a identificar</p>
                          : <p className="text-[11px] text-ink-faint mt-1">todos identificados</p>}
                      </>
                    ) : <p className="text-ink-faint">—</p>}
                  </Stat>

                  <Stat rotulo="TPV do mês">
                    {c.carteira && c.carteira.tpv > 0 ? (
                      <p className="text-xl font-bold text-good tabular-nums leading-none" title={brl(c.carteira.tpv)}>
                        {brlCompacto(c.carteira.tpv)}
                      </p>
                    ) : <p className="text-ink-faint">—</p>}
                  </Stat>

                  <Stat rotulo="Situação">
                    {c.carteira ? <BarraSituacao status={c.carteira.status} largura="w-36" /> : <p className="text-ink-faint">—</p>}
                  </Stat>

                  {/* score — o veredito do card, grande e colorido */}
                  <div className="text-center pl-2 ml-auto">
                    {c.total !== null && st ? (
                      <>
                        <span className="inline-block px-3.5 py-2 rounded-2xl text-2xl font-bold leading-none" style={{ background: st.bg, color: st.text }}>
                          {c.total.toFixed(1).replace('.', ',')}
                        </span>
                        <p className="text-[10px] text-ink-faint mt-1">de 10 pts</p>
                      </>
                    ) : (
                      <span className="text-ink-faint text-xl">—</span>
                    )}
                  </div>
                </div>

                {/* pilares como chips — meta no tooltip */}
                {c.total !== null && (
                  <div className="flex items-center gap-2 flex-wrap mt-4 pt-3.5 border-t border-line">
                    {PILARES.map(p => {
                      const score = c.scores[p]
                      const mc = metaMap[p]
                      return (
                        <span key={p}
                          title={
                            p === 'acionaveis'
                              ? `${PILAR_LABEL[p]} · meta: tarefas fixas por carteira`
                              : p === 'awareness'
                              ? `${PILAR_LABEL[p]} · meta: respostas fixas por carteira`
                              : p === 'net_churn' && mc
                              ? `${PILAR_LABEL[p]} · meta: ${textoMetaNetChurn(mc.meta)}`
                              : p === 'aderencia' && mc
                              ? `${PILAR_LABEL[p]} · meta: ${textoMetaAderencia(mc.meta)}`
                              : p === 'tpv'
                              ? `${PILAR_LABEL[p]} · meta: objetivo por consultor`
                              : mc ? `${PILAR_LABEL[p]} · meta ${fmtMeta(mc.meta, mc.unidade)}` : PILAR_LABEL[p]
                          }
                          className="inline-flex items-center gap-1.5 text-xs bg-card-2 border border-line rounded-lg px-2.5 py-1.5">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PILAR_COLOR[p] }} />
                          <span className="text-ink-muted">{PILAR_LABEL[p]}</span>
                          <b className="text-ink">{score !== undefined ? score.toFixed(1).replace('.', ',') : '—'}</b>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
