'use client'

import { PILARES, GRUPOS, fmtValor, fmtMeta, calcFaltam } from '@/lib/pilares'
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
}

export default function PilaresDetalhe({ resultados, pilaresConfig, dataReferencia }: Props) {
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
  pilarKey, resultado, config, refLabel,
}: {
  pilarKey: PilarKey
  resultado?: ResultadoPilar
  config?: PilarConfigMin
  refLabel: string
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
  const unidadeSufixo = config.unidade === '%' ? '%' : ''

  // faltam > 0 = ainda não bateu. Negativo = passou da meta.
  const faltam = calcFaltam(resultado.valor_metrica, config.meta, config.tipo_comp)
  const bateuMeta = faltam <= 0
  const excedente = Math.abs(faltam)

  const valorSpec = spec.cols.find(c => c.col === spec.valorCol)
  const valorFmt = fmtValor(valorSpec?.type ?? 'decimal', resultado.valor_metrica)

  return (
    <div className="glass rounded-2xl border border-line overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
      {header}

      <div className="px-4 py-3 space-y-3">
        {/* Métrica principal confrontada com a meta */}
        <div className="bg-card-2 rounded-xl p-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-ink">{valorFmt}</span>
            <span className="text-xs text-ink-muted">
              meta: <span className="font-semibold">{fmtMeta(config.meta, config.unidade)}</span>
            </span>
          </div>
          {bateuMeta ? (
            <p className="text-[11px] text-good font-medium mt-1">
              ✓ Meta atingida
              {excedente >= 0.05 && ` — ${excedente.toFixed(1).replace('.', ',')}${unidadeSufixo} acima`}
            </p>
          ) : (
            <p className="text-[11px] text-bad font-medium mt-1">
              ✗ Faltam {faltam.toFixed(1).replace('.', ',')}{unidadeSufixo} para a meta
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-faint">Ref.:</span>
          <span className="text-ink-muted font-medium">{refLabel}</span>
        </div>

        {/* Demais colunas da planilha, na ordem do contrato.
            A métrica principal já aparece grande acima, então sai da lista. */}
        {spec.cols
          .filter(c => c.col !== spec.valorCol)
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
