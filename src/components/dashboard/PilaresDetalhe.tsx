'use client'

import type { ReactNode } from 'react'
import {
  PILARES, GRUPOS, fmtValor, fmtMeta, calcFaltam, metaAcionaveis, metaAwareness, PISO_AWARENESS_PADRAO,
  type FaixaAcionaveis, type FaixaAwareness,
} from '@/lib/pilares'
import type { PilarKey } from '@/lib/types'

/**
 * Detalhe dos 6 pilares de um consultor, agrupados em Atuação e Resultado.
 *
 * Compartilhado entre a tela do gestor (/dashboard/consultor) e a do próprio
 * consultor (/dashboard/meu-score) — as duas mostram exatamente os mesmos
 * números, mudando só quem está olhando.
 *
 * Tudo que aparece aqui vem da planilha. O score é o da coluna de SCORE, os
 * valores são os das colunas de métrica (já na escala certa, normalizados no
 * upload) e a única conta é "faltam X pra meta", que é subtração.
 */

export interface ResultadoPilar {
  pilar_key: string
  score_planilha: number
  valor_metrica: number
  metricas: Record<string, unknown> | null
}

export interface PilarConfigMin {
  pilar_key: string
  pontos_max: number
  meta: number
  tipo_comp: string
  unidade: string
  /** Mínimo obrigatório (só o Awareness): abaixo dele o Bloco 1 inteiro zera. */
  piso_minimo?: number | null
}

function formatRefDate(iso: string) {
  const [y, m] = iso.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[parseInt(m) - 1]}/${y}`
}

function fmtPontos(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(1).replace('.', ',')
}

interface Props {
  resultados: ResultadoPilar[]
  pilaresConfig: PilarConfigMin[]
  dataReferencia: string
  /** Clientes ativos na carteira do consultor — só usado por Acionáveis, cuja
   *  meta agora é uma quantidade fixa que varia por esse tamanho. undefined =
   *  tamanho desconhecido, cai no comportamento antigo (meta de pillar_config). */
  carteiraSize?: number
  /** Faixas de metas_acionaveis_faixas (editáveis em /dashboard/metas). */
  faixasAcionaveis: FaixaAcionaveis[]
  /** Sellers ATIVOS (ATIVO + REATIVADO) na carteira do consultor — só usado pelo
   *  Awareness, cuja meta varia por esse tamanho. undefined = carteira não
   *  encontrada: o card mostra só o piso, sem inventar uma meta. */
  carteiraAtiva?: number
  /** Faixas de metas_awareness_faixas (editáveis em /dashboard/metas). */
  faixasAwareness: FaixaAwareness[]
}

export default function PilaresDetalhe({
  resultados, pilaresConfig, dataReferencia, carteiraSize, faixasAcionaveis, carteiraAtiva, faixasAwareness,
}: Props) {
  const porPilar = Object.fromEntries(resultados.map(r => [r.pilar_key, r]))
  const cfgPorPilar = Object.fromEntries(pilaresConfig.map(p => [p.pilar_key, p]))
  const refLabel = formatRefDate(dataReferencia)

  return (
    <>
      {GRUPOS.map(grupo => {
        const grupoMax = grupo.pilares.reduce((s, p) => s + (cfgPorPilar[p]?.pontos_max ?? 0), 0)
        const grupoScore = grupo.pilares.reduce((s, p) => s + (porPilar[p]?.score_planilha ?? 0), 0)
        const grupoColor = grupoScore >= grupoMax ? 'var(--color-good)' : grupoScore > 0 ? 'var(--color-warn)' : 'var(--color-bad)'

        return (
          <div key={grupo.key}>
            <div className="flex items-center gap-3 mb-3 px-1">
              <div className="w-2 h-2 rounded-full" style={{ background: grupoColor }} />
              <p className="text-sm font-semibold text-ink uppercase tracking-wide">{grupo.label}</p>
              <span className="ml-auto text-sm font-bold" style={{ color: grupoColor }}>
                {grupoScore.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span className="text-ink-faint font-normal"> / {fmtPontos(grupoMax)} pts</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {grupo.pilares.map(key => (
                <PilarCard
                  key={key}
                  pilarKey={key as PilarKey}
                  resultado={porPilar[key]}
                  config={cfgPorPilar[key]}
                  refLabel={refLabel}
                  carteiraSize={carteiraSize}
                  faixasAcionaveis={faixasAcionaveis}
                  carteiraAtiva={carteiraAtiva}
                  faixasAwareness={faixasAwareness}
                />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

function PilarCard({
  pilarKey, resultado, config, refLabel, carteiraSize, faixasAcionaveis, carteiraAtiva, faixasAwareness,
}: {
  pilarKey: PilarKey
  resultado?: ResultadoPilar
  config?: PilarConfigMin
  refLabel: string
  carteiraSize?: number
  faixasAcionaveis: FaixaAcionaveis[]
  carteiraAtiva?: number
  faixasAwareness: FaixaAwareness[]
}) {
  const spec = PILARES[pilarKey]
  const { color } = spec

  const header = (
    <div className="px-4 py-3 border-b border-line">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-bold" style={{ color }}>{spec.label}</p>
        {resultado && config ? (
          <span className="text-xs font-bold px-2 py-0.5 rounded-lg whitespace-nowrap" style={{ background: `${color}18`, color }}>
            {resultado.score_planilha.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            {' / '}{fmtPontos(config.pontos_max)} pts
          </span>
        ) : (
          <span className="text-xs text-ink-faint">sem dados</span>
        )}
      </div>
      {spec.nota && <p className="text-[10px] text-ink-faint">{spec.nota}</p>}
    </div>
  )

  if (!resultado || !config) {
    return (
      <div className="glass rounded-2xl border border-line overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
        {header}
        <div className="px-4 py-8 text-center text-sm text-ink-faint">Sem dados</div>
      </div>
    )
  }

  const metricas = resultado.metricas ?? {}

  if (pilarKey === 'awareness') {
    return (
      <AwarenessCard
        header={header} color={color} refLabel={refLabel} metricas={metricas} config={config}
        carteiraAtiva={carteiraAtiva} faixasAwareness={faixasAwareness}
      />
    )
  }

  // Acionáveis (19/08/2026 em diante): meta deixou de ser percentual e virou
  // quantidade fixa de tarefas revertidas, que varia pelo tamanho da carteira
  // — um número global de pillar_config não dá conta disso. Com o tamanho da
  // carteira em mãos, a comparação usa a quantidade real (metricas['Total
  // Acionáveis Revertido']) contra a faixa certa; sem ele, cai no
  // comportamento antigo (só pra não quebrar se o dado não vier).
  const usarMetaTarefas = pilarKey === 'acionaveis' && carteiraSize != null

  // TPV (20/08/2026 em diante): a meta deixou de ser um % fixo em
  // pillar_config e virou o valor exato que o MP já manda por consultor, na
  // coluna "Objetivo TPV Total Atual" — comparação passa a ser R$ contra R$,
  // sem % nenhum envolvido (a coluna já vem pronta, não recalculamos nada).
  const usarObjetivoTPV = pilarKey === 'tpv'

  const unidadeSufixo = usarMetaTarefas ? '' : (config.unidade === '%' ? '%' : '')

  const revertido = Number(metricas['Total Acionáveis Revertido'] ?? 0)
  const metaTarefas = usarMetaTarefas ? metaAcionaveis(carteiraSize!, faixasAcionaveis) : null

  const tpvAtual = Number(metricas['TPV Total mês atual'] ?? 0)
  const objetivoRaw = metricas['Objetivo TPV Total Atual']
  // '' ou ausente = planilha antiga (upada antes desta coluna existir) ou
  // célula em branco pra este consultor específico — nos dois casos, R$0 NÃO
  // é um objetivo de verdade, então não pode contar como "meta batida".
  const temObjetivoTPV = objetivoRaw != null && objetivoRaw !== '' && Number(objetivoRaw) > 0
  const objetivoTPV = Number(objetivoRaw ?? 0)

  // faltam > 0 = ainda não bateu. Negativo = passou da meta.
  const faltam = usarMetaTarefas
    ? metaTarefas! - revertido
    : usarObjetivoTPV
    ? objetivoTPV - tpvAtual
    : calcFaltam(resultado.valor_metrica, config.meta, config.tipo_comp)
  const bateuMeta = faltam <= 0
  const excedente = Math.abs(faltam)

  const valorSpec = spec.cols.find(c => c.col === spec.valorCol)
  const valorFmt = usarMetaTarefas
    ? fmtValor('int', revertido)
    : usarObjetivoTPV
    ? fmtValor('currency', tpvAtual)
    : fmtValor(valorSpec?.type ?? 'decimal', resultado.valor_metrica)
  const metaFmt = usarMetaTarefas
    ? String(metaTarefas)
    : usarObjetivoTPV
    ? (temObjetivoTPV ? fmtValor('currency', objetivoTPV) : '—')
    : fmtMeta(config.meta, config.unidade)

  // TPV mede em R$: "faltam"/"acima" saem formatados como moeda (fmtValor já
  // cuida do "R$"), em vez do sufixo de % usado pelos demais pilares.
  const deltaFmt = (v: number) =>
    usarMetaTarefas ? v.toFixed(0).replace('.', ',')
    : usarObjetivoTPV ? fmtValor('currency', v)
    : `${v.toFixed(1).replace('.', ',')}${unidadeSufixo}`

  return (
    <div className="glass rounded-2xl border border-line overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
      {header}

      <div className="px-4 py-3 space-y-3">
        {/* Métrica principal confrontada com a meta */}
        <div className="bg-card-2 rounded-xl p-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-ink">{valorFmt}</span>
            <span className="text-xs text-ink-muted">
              meta: <span className="font-semibold">{metaFmt}</span>
              {usarMetaTarefas && ' tarefas'}
            </span>
          </div>
          {usarMetaTarefas && (
            <p className="text-[11px] text-ink-faint mt-0.5">carteira: {carteiraSize} clientes</p>
          )}
          {usarObjetivoTPV && !temObjetivoTPV ? (
            <p className="text-[11px] text-ink-faint font-medium mt-1">
              Objetivo ainda não informado nesta planilha
            </p>
          ) : bateuMeta ? (
            <p className="text-[11px] text-good font-medium mt-1">
              ✓ Meta atingida
              {excedente >= 0.05 && ` — ${deltaFmt(excedente)} acima`}
            </p>
          ) : (
            <p className="text-[11px] text-bad font-medium mt-1">
              ✗ Faltam {deltaFmt(faltam)} para a meta
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-faint">Ref.:</span>
          <span className="text-ink-muted font-medium">{refLabel}</span>
        </div>

        {/* Demais colunas da planilha, na ordem do contrato. A métrica
            principal já aparece grande acima, então sai da lista — exceto
            quando o número grande deixou de ser ela (acionáveis com meta por
            tarefas), caso em que a % continua valendo a pena mostrar aqui. */}
        {spec.cols
          .filter(c => usarMetaTarefas ? false : c.col !== (usarObjetivoTPV ? 'TPV Total mês atual' : spec.valorCol))
          .map(c => (
            <div key={c.col} className="flex items-center justify-between gap-2 border-t border-card-2 pt-1.5">
              <span className="text-[11px] text-ink-muted leading-tight">{c.label}:</span>
              <span className="text-[11px] font-semibold text-ink whitespace-nowrap">
                {fmtValor(c.type, metricas[c.col])}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

/**
 * Awareness (05/10/2026 em diante, Bloco 1 — Atuação): deixou de ser "% Awareness"
 * contra uma meta em % e virou QUANTIDADE de clientes que responderam a pesquisa.
 * A meta varia pela carteira ativa do consultor e há um PISO: abaixo dele o
 * Bloco 1 inteiro zera. A nota continua sendo a da planilha (nunca recalculada);
 * a única conta aqui é "quantas respostas faltam", que é subtração.
 *
 * Quem zera o Bloco 1 na nota é a planilha do MP — este card só avisa o risco
 * enquanto o mês corre.
 */
function AwarenessCard({
  header, color, refLabel, metricas, config, carteiraAtiva, faixasAwareness,
}: {
  header: ReactNode
  color: string
  refLabel: string
  metricas: Record<string, unknown>
  config: PilarConfigMin
  carteiraAtiva?: number
  faixasAwareness: FaixaAwareness[]
}) {
  // Célula em branco ou ausente = planilha SEM o dado, não zero respostas: tratar
  // como 0 dispararia o alerta do piso ("Bloco 1 zera") sem motivo.
  const bruto = metricas['Sellers que responderam pesquisa']
  const respostas = bruto === '' || bruto == null ? NaN : Number(bruto)
  const semRespostas = !Number.isFinite(respostas)
  const piso = config.piso_minimo ?? PISO_AWARENESS_PADRAO
  const meta = carteiraAtiva != null ? metaAwareness(carteiraAtiva, faixasAwareness, piso) : null
  const faltamMeta = meta != null && !semRespostas ? meta - respostas : null
  const faltamPiso = piso - respostas

  return (
    <div className="glass rounded-2xl border border-line overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
      {header}

      <div className="px-4 py-3 space-y-3">
        <div className="bg-card-2 rounded-xl p-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-ink">{semRespostas ? '—' : fmtValor('int', respostas)}</span>
            <span className="text-xs text-ink-muted">
              {respostas === 1 ? 'resposta' : 'respostas'} · meta: <span className="font-semibold">{meta ?? '—'}</span>
            </span>
          </div>
          <p className="text-[11px] text-ink-faint mt-0.5">
            {carteiraAtiva != null ? `carteira ativa: ${carteiraAtiva} clientes` : 'carteira ativa não encontrada'}
          </p>
          {semRespostas && (
            <p className="text-[11px] text-ink-faint font-medium mt-1">Respostas não informadas nesta planilha</p>
          )}
          {faltamMeta != null && (faltamMeta <= 0 ? (
            <p className="text-[11px] text-good font-medium mt-1">
              ✓ Meta atingida{faltamMeta < 0 && ` — ${-faltamMeta} acima`}
            </p>
          ) : (
            <p className="text-[11px] text-bad font-medium mt-1">
              ✗ {faltamMeta === 1 ? 'Falta 1 resposta' : `Faltam ${faltamMeta} respostas`} de clientes para a meta
            </p>
          ))}
        </div>

        {semRespostas ? null : faltamPiso > 0 ? (
          <div className="rounded-xl border border-bad/30 bg-bad-bg px-3 py-2">
            <p className="text-[11px] text-bad font-semibold">⚠ Abaixo do piso de {piso} respostas</p>
            <p className="text-[11px] text-bad mt-0.5">
              {faltamPiso === 1 ? 'Falta 1 resposta' : `Faltam ${faltamPiso} respostas`} para o piso.
              Sem ele, o Bloco 1 (Atuação) inteiro zera.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-ink-faint">Piso mínimo: {piso} respostas ✓</p>
        )}

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-faint">Ref.:</span>
          <span className="text-ink-muted font-medium">{refLabel}</span>
        </div>

        {PILARES.awareness.cols
          .filter(c => c.col !== 'Sellers que responderam pesquisa') /* já é o número grande */
          .map(c => (
            <div key={c.col} className="flex items-center justify-between gap-2 border-t border-card-2 pt-1.5">
              <span className="text-[11px] text-ink-muted leading-tight">{c.label}:</span>
              <span className="text-[11px] font-semibold text-ink whitespace-nowrap">
                {fmtValor(c.type, metricas[c.col])}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}
