'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PILARES, PILAR_KEYS, PILARES_COM_QUANTIDADE, fmtValor, fmtMeta, textoMetaNetChurn, textoMetaAderencia,
  quantidadeDoPilar, textoQuantidade, textoSituacao,
  type FaixaAcionaveis, type FaixaAwareness, type QuantidadeConsultor,
} from '@/lib/pilares'
import { normalizarNome } from '@/lib/convites'
import type { PilarKey } from '@/lib/types'
import CategoryHeader from '@/components/dashboard/CategoryHeader'

/**
 * O aproveitamento (score ÷ pontos_max) é o que dá pra comparar entre pilares:
 * o score cru não serve, porque cada pilar vale um teto diferente (Awareness vale
 * 1,5 pts; Net Churn vale 3). Comparar 1,5 com o corte do score TOTAL (ver
 * score_geral_faixas) pintaria Awareness de vermelho mesmo com nota cheia.
 *
 * A cor continua sempre baseada no score, mesmo quando o número em destaque do
 * card é o resultado bruto — é o indicador de "quão bem está" já usado no resto
 * do app; trocar de critério muda o número exibido, não o que a cor significa.
 */
function statusStyle(score: number, pontosMax: number) {
  const aproveitamento = pontosMax > 0 ? score / pontosMax : 0
  if (aproveitamento >= 0.9) return { bg: 'var(--color-good-bg)', text: 'var(--color-good)' }
  if (aproveitamento >= 0.6) return { bg: 'var(--color-warn-bg)', text: 'var(--color-warn)' }
  return { bg: 'var(--color-bad-bg)', text: 'var(--color-bad)' }
}

function formatDateBR(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

interface Resultado {
  id_carteira: string
  consultor_nome: string
  pilar_key: PilarKey
  score_planilha: number
  valor_metrica: number | null
  metricas: Record<string, unknown> | null
}

interface PilarConfigLite {
  pilar_key: string
  meta: number
  unidade: '%' | 'numero'
  tipo_comp: 'ge' | 'le'
  pontos_max: number
  /** Mínimo obrigatório (só o Awareness). */
  piso_minimo?: number | null
}

type Criterio = 'resultado' | 'score'

interface ConsultorRow {
  id: string
  nome: string
  score: number
  valorMetrica: number | null
  metricas: Record<string, unknown> | null
}

async function fetchResultados(date: string): Promise<Resultado[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('score_consultor_resultados')
    .select('id_carteira, consultor_nome, pilar_key, score_planilha, valor_metrica, metricas')
    .eq('data_referencia', date)
  return data ?? []
}

function agruparPorPilar(resultados: Resultado[]): Record<string, ConsultorRow[]> {
  const porPilar: Record<string, ConsultorRow[]> = {}
  for (const r of resultados) {
    if (!porPilar[r.pilar_key]) porPilar[r.pilar_key] = []
    porPilar[r.pilar_key].push({
      id: r.id_carteira,
      nome: r.consultor_nome,
      score: r.score_planilha,
      valorMetrica: r.valor_metrica ?? null,
      metricas: r.metricas ?? null,
    })
  }
  return porPilar
}

/**
 * TPV (20/08/2026 em diante): a meta não é mais um % fixo em `pillar_config`,
 * é o valor exato que o MP manda por consultor em "Objetivo TPV Total Atual"
 * — mesma regra de PilaresDetalhe.tsx. No ranking por resultado, o que importa
 * não é a variação % bruta e sim quanto falta em R$ pra bater essa meta:
 * negativo = já passou da meta (fica no topo ao ordenar ascendente), positivo
 * = quanto ainda falta. `null` = planilha sem objetivo informado pra esse
 * consultor (não dá pra ranquear).
 */
function tpvFalta(metricas: Record<string, unknown> | null): number | null {
  const objetivoRaw = metricas?.['Objetivo TPV Total Atual']
  const temObjetivo = objetivoRaw != null && objetivoRaw !== '' && Number(objetivoRaw) > 0
  if (!temObjetivo) return null
  const tpvAtual = Number(metricas?.['TPV Total mês atual'] ?? 0)
  return Number(objetivoRaw) - tpvAtual
}

function ordenar(consultores: ConsultorRow[], pilar: PilarKey, criterio: Criterio): ConsultorRow[] {
  if (criterio === 'score') {
    return [...consultores].sort((a, b) => b.score - a.score)
  }
  if (pilar === 'tpv') {
    const comFalta = consultores.filter(c => tpvFalta(c.metricas) != null)
    const semFalta = consultores.filter(c => tpvFalta(c.metricas) == null)
    comFalta.sort((a, b) => tpvFalta(a.metricas)! - tpvFalta(b.metricas)!)
    return [...comFalta, ...semFalta]
  }
  const maiorMelhor = PILARES[pilar].maiorMelhor
  const comValor = consultores.filter(c => c.valorMetrica != null)
  const semValor = consultores.filter(c => c.valorMetrica == null)
  comValor.sort((a, b) => maiorMelhor ? b.valorMetrica! - a.valorMetrica! : a.valorMetrica! - b.valorMetrica!)
  return [...comValor, ...semValor]
}

export default function AreaClient({
  dates, pilaresConfig, initialDate, initialResultados,
  carteiraPorConsultor, carteiraAtivaPorConsultor, faixasAwareness, faixasAcionaveis,
}: {
  dates: string[]
  pilaresConfig: PilarConfigLite[]
  initialDate: string
  initialResultados: Resultado[]
  /** Clientes na carteira de cada consultor (todas as linhas) e só os ATIVOS, pelo nome normalizado. */
  carteiraPorConsultor: Record<string, number>
  carteiraAtivaPorConsultor: Record<string, number>
  faixasAwareness: FaixaAwareness[]
  faixasAcionaveis: FaixaAcionaveis[]
}) {
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [criterio, setCriterio] = useState<Criterio>('resultado')
  const [resultados, setResultados] = useState(initialResultados)
  const [loading, setLoading] = useState(false)

  async function handleDateChange(date: string) {
    setSelectedDate(date)
    setLoading(true)
    setResultados(await fetchResultados(date))
    setLoading(false)
  }

  const cfgPorPilar = Object.fromEntries(pilaresConfig.map(p => [p.pilar_key, p]))
  const porPilar = agruparPorPilar(resultados)
  // A carteira vem do último snapshot: só vale para a data mais recente. Nas antigas
  // o Awareness e os Acionáveis mostram a contagem, sem o "faltam".
  const dataAtual = selectedDate === initialDate

  return (
    <div className="category-page category-page--performance">
      <div className="mb-5 space-y-4">
        <div>
          <CategoryHeader category="performance" title="Por área" description={`Ranking de cada pilar · ${formatDateBR(selectedDate)}`} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-0.5 text-xs bg-field border border-field-line rounded-lg p-0.5">
            {([['resultado', 'Resultado'], ['score', 'Score']] as [Criterio, string][]).map(([k, rot]) => (
              <button key={k} onClick={() => setCriterio(k)}
                className={`px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                  criterio === k ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink'
                }`}>
                {rot}
              </button>
            ))}
          </div>

          <select
            value={selectedDate}
            onChange={e => handleDateChange(e.target.value)}
            className="border border-field-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary bg-field"
          >
            {dates.map(d => <option key={d} value={d}>{formatDateBR(d)}</option>)}
          </select>
        </div>
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-5 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        {PILAR_KEYS.map(pilar => {
          const spec = PILARES[pilar]
          const { color } = spec
          const consultores = ordenar(porPilar[pilar] ?? [], pilar, criterio)
          const cfg = cfgPorPilar[pilar]

          // Quantidade por consultor (net churn, aderência, awareness, acionáveis): é ela
          // que vai em destaque, com a % na linha de baixo. null = a planilha não trouxe o
          // dado, e a linha volta a mostrar a %.
          const quantidades = consultores.map((c): QuantidadeConsultor | null => {
            if (!cfg || !PILARES_COM_QUANTIDADE.includes(pilar)) return null
            const chave = normalizarNome(c.nome)
            return quantidadeDoPilar(pilar, c.metricas, {
              meta: cfg.meta, piso: cfg.piso_minimo ?? undefined, faixasAwareness, faixasAcionaveis,
              carteiraAtiva: dataAtual ? carteiraAtivaPorConsultor[chave] : undefined,
              carteiraTotal: dataAtual ? carteiraPorConsultor[chave] : undefined,
            })
          })
          const comQuantidade = quantidades.filter((q): q is QuantidadeConsultor => q != null)
          const textoMediaQtd = criterio === 'resultado' && comQuantidade.length > 0
            ? textoQuantidade(
                pilar,
                comQuantidade.reduce((s, q) => s + q.numero, 0) / comQuantidade.length,
                comQuantidade.every(q => q.de != null)
                  ? comQuantidade.reduce((s, q) => s + q.de!, 0) / comQuantidade.length
                  : undefined,
              )
            : null
          // A % do cabeçalho é a média das MESMAS linhas que entram na média em quantidade.
          const comQtdEPct = consultores.filter((c, i) => quantidades[i] != null && c.valorMetrica != null)
          const mediaPctQtd = comQtdEPct.length > 0
            ? comQtdEPct.reduce((s, c) => s + c.valorMetrica!, 0) / comQtdEPct.length
            : null

          // Rótulo e tipo da métrica principal vêm do contrato — nada hardcoded.
          const valorSpec = spec.cols.find(c => c.col === spec.valorCol)
          const ehTpvResultado = pilar === 'tpv' && criterio === 'resultado'

          const comValor = consultores.filter(c => c.valorMetrica != null)
          const comFalta = consultores.map(c => tpvFalta(c.metricas)).filter((v): v is number => v != null)
          const media = criterio === 'score'
            ? (consultores.length > 0 ? consultores.reduce((s, c) => s + c.score, 0) / consultores.length : null)
            : ehTpvResultado
            ? (comFalta.length > 0 ? comFalta.reduce((s, v) => s + v, 0) / comFalta.length : null)
            : (comValor.length > 0 ? comValor.reduce((s, c) => s + c.valorMetrica!, 0) / comValor.length : null)

          return (
            <div key={pilar} className="glass rounded-2xl border border-line overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
              <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-line">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink text-sm">{spec.label}</p>
                    {spec.nota && <p className="text-[10px] text-ink-faint">{spec.nota}</p>}
                    {cfg && (
                      <p className="text-[11px] text-ink-faint mt-0.5">
                        {pilar === 'acionaveis' ? (
                          <>Meta: <span className="font-semibold text-ink-muted">tarefas fixas por carteira</span></>
                        ) : pilar === 'awareness' ? (
                          <>Meta: <span className="font-semibold text-ink-muted">respostas fixas por carteira</span></>
                        ) : pilar === 'net_churn' ? (
                          <>Meta: <span className="font-semibold text-ink-muted">{textoMetaNetChurn(cfg.meta)}</span></>
                        ) : pilar === 'aderencia' ? (
                          <>Meta: <span className="font-semibold text-ink-muted">{textoMetaAderencia(cfg.meta)}</span></>
                        ) : pilar === 'tpv' ? (
                          <>Meta: <span className="font-semibold text-ink-muted">objetivo por consultor</span></>
                        ) : (
                          <>Meta: <span className="font-semibold text-ink-muted">{fmtMeta(cfg.meta, cfg.unidade)}</span></>
                        )}
                      </p>
                    )}
                    {textoMediaQtd && (
                      <p className="text-[10px] text-ink-faint">ordem pela % da planilha, que compara carteiras de tamanhos diferentes</p>
                    )}
                  </div>
                </div>
                {media !== null && cfg && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-ink-muted">
                      {criterio === 'score' ? 'Média score' : ehTpvResultado ? 'Falta média p/ meta' : textoMediaQtd ? 'Média' : `Média ${valorSpec?.label ?? ''}`}
                    </p>
                    <p className="text-sm font-bold" style={{ color }}>
                      {criterio === 'score'
                        ? <>{media.toFixed(2).replace('.', ',')}<span className="text-ink-faint font-normal"> / {cfg.pontos_max}</span></>
                        : ehTpvResultado
                        ? fmtValor('currency', media)
                        : textoMediaQtd
                        ? textoMediaQtd
                        : (valorSpec ? fmtValor(valorSpec.type, media) : media.toFixed(2))}
                    </p>
                    {textoMediaQtd && valorSpec && mediaPctQtd != null && (
                      <p className="text-[11px] text-ink-faint">{fmtValor(valorSpec.type, mediaPctQtd)} na planilha</p>
                    )}
                  </div>
                )}
              </div>

              {consultores.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-ink-faint">Sem dados para este pilar</div>
              ) : (
                <div className="divide-y divide-card-2">
                  {consultores.map((c, i) => {
                    const st = statusStyle(c.score, cfg?.pontos_max ?? 0)
                    const falta = ehTpvResultado ? tpvFalta(c.metricas) : null
                    const bateuMeta = falta != null && falta <= 0
                    const q = quantidades[i]
                    const destaque = q ? textoQuantidade(pilar, q.numero, q.de) : null
                    const situacao = q ? textoSituacao(pilar, q) : null
                    // Na data mais recente, sem "faltam" no Awareness/Acionáveis = carteira do consultor
                    // não achada pelo nome (nas datas antigas é esperado). Melhor avisar do que sumir calado.
                    const semCarteira = q != null && q.faltam == null && dataAtual && (pilar === 'awareness' || pilar === 'acionaveis')
                    const pct = c.valorMetrica != null && valorSpec ? fmtValor(valorSpec.type, c.valorMetrica) : null
                    const scoreTxt = c.score.toFixed(1).replace('.', ',')
                    const semValorNesteCriterio = ehTpvResultado
                      ? falta == null
                      : criterio === 'resultado' && c.valorMetrica == null && !q
                    return (
                      <div key={c.id} className="px-5 py-2.5 flex items-center gap-3">
                        <span className="text-xs font-medium text-ink-faint w-5 text-center flex-shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink truncate leading-tight">{c.nome}</p>
                          {ehTpvResultado ? (
                            falta != null && (
                              <p className="text-[11px] text-ink-muted mt-0.5">
                                {bateuMeta
                                  ? <span className="text-good font-medium">Meta batida</span>
                                  : 'Faltam para a meta'}
                              </p>
                            )
                          ) : criterio === 'resultado' ? (
                            <p className="text-[11px] text-ink-muted mt-0.5">
                              {semCarteira && <>carteira não encontrada · </>}
                              {situacao && (
                                <>
                                  <span className={`font-medium ${(q?.faltam ?? 0) > 0 ? 'text-bad' : 'text-good'}`}>{situacao}</span>
                                  {' · '}
                                </>
                              )}
                              {destaque && pct && <>{pct} · </>}
                              Score: <span className="font-semibold text-ink-dim">{scoreTxt}</span>
                            </p>
                          ) : destaque ? (
                            <p className="text-[11px] text-ink-muted mt-0.5">
                              <span className="font-semibold text-ink-dim">{destaque}</span>{pct && ` · ${pct}`}
                            </p>
                          ) : (
                            c.valorMetrica != null && valorSpec && (
                              <p className="text-[11px] text-ink-muted mt-0.5">
                                {valorSpec.label}:{' '}
                                <span className="font-semibold text-ink-dim">
                                  {fmtValor(valorSpec.type, c.valorMetrica)}
                                </span>
                              </p>
                            )
                          )}
                        </div>
                        {semValorNesteCriterio ? (
                          <span className="text-sm font-medium px-2.5 py-0.5 rounded-lg flex-shrink-0 text-ink-faint bg-card-2">—</span>
                        ) : (
                          <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg flex-shrink-0 whitespace-nowrap" style={{ background: st.bg, color: st.text }}>
                            {ehTpvResultado
                              ? `${bateuMeta ? '+' : ''}${fmtValor('currency', Math.abs(falta!))}`
                              : criterio === 'score'
                              ? scoreTxt
                              : (destaque ?? (valorSpec ? fmtValor(valorSpec.type, c.valorMetrica) : '—'))}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
