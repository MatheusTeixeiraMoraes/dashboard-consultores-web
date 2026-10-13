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

const PILAR_TABELA_LABEL: Record<PilarKey, string> = {
  awareness: 'Awareness', produtividade: 'Produtividade', aderencia: 'Aderência',
  tpv: 'TPV', net_churn: 'Net Churn', acionaveis: 'Acionáveis',
}

function formatScore(score: number | undefined) {
  return score?.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? '—'
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

type ConsultorRankingGeral = {
  id: string
  nome: string
  total: number
  scores: Partial<Record<PilarKey, number>>
}

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

function agruparRankingGeral(resultados: Resultado[]): ConsultorRankingGeral[] {
  const consultores = new Map<string, ConsultorRankingGeral>()
  for (const r of resultados) {
    let consultor = consultores.get(r.id_carteira)
    if (!consultor) {
      consultor = { id: r.id_carteira, nome: r.consultor_nome, total: 0, scores: {} }
      consultores.set(r.id_carteira, consultor)
    }
    consultor.scores[r.pilar_key] = r.score_planilha
    consultor.total = Math.min(consultor.total + r.score_planilha, 10)
  }
  return [...consultores.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))
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
  const [selectedPilar, setSelectedPilar] = useState<PilarKey | 'geral'>('geral')
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
  const rankingGeral = agruparRankingGeral(resultados)
  // A carteira vem do último snapshot: só vale para a data mais recente. Nas antigas
  // o Awareness e os Acionáveis mostram a contagem, sem o "faltam".
  const dataAtual = selectedDate === initialDate

  return (
    <div className="category-page category-page--performance">
      <div className="mb-5">
        <CategoryHeader
          category="performance"
          title="Por área"
          description={`${selectedPilar === 'geral' ? 'Ranking geral por score total' : `Ranking de ${PILARES[selectedPilar].label}`} · ${formatDateBR(selectedDate)}`}
        />

        <div className="glass rounded-2xl border border-line p-3 mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-ink-muted">
              <span>Ranking</span>
            <select
              aria-label="Ranking por"
              value={selectedPilar}
              onChange={e => setSelectedPilar(e.target.value as PilarKey | 'geral')}
              className="border border-field-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary bg-field min-w-[210px]"
            >
              <option value="geral">Geral — todos os pilares</option>
              {PILAR_KEYS.map(pilar => <option key={pilar} value={pilar}>{PILARES[pilar].label}</option>)}
            </select>
            </label>

            {selectedPilar !== 'geral' && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-muted">Ordenar por</span>
                <div className="flex items-center gap-0.5 text-xs bg-field border border-field-line rounded-lg p-0.5 h-[38px]">
                  {([['resultado', 'Resultado'], ['score', 'Score']] as [Criterio, string][]).map(([k, rot]) => (
                    <button key={k} onClick={() => setCriterio(k)} aria-pressed={criterio === k}
                      className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                        criterio === k ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink'
                      }`}>
                      {rot}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <label className="flex flex-col gap-1 text-[11px] font-medium text-ink-muted">
            <span>Data de referência</span>
            <select
              aria-label="Data de referência"
              value={selectedDate}
              onChange={e => handleDateChange(e.target.value)}
              className="border border-field-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary bg-field min-w-[140px]"
            >
              {dates.map(d => <option key={d} value={d}>{formatDateBR(d)}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className={`w-full min-w-0 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        {selectedPilar === 'geral' ? (
          <section className="glass rounded-2xl border border-line overflow-hidden" aria-label="Ranking geral dos consultores">
            <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-line">
              <div>
                <h2 className="font-semibold text-ink text-sm">Todos os pilares</h2>
                <p className="text-[11px] text-ink-faint mt-0.5">Soma dos scores · máximo de 10 pontos</p>
              </div>
              <p className="text-xs text-ink-muted flex-shrink-0">{rankingGeral.length} consultores</p>
            </div>
            {rankingGeral.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-ink-faint">Sem dados para esta data</div>
            ) : (
              <>
                <div className="hidden xl:block">
                  <table className="w-full table-fixed text-sm">
                    <thead className="bg-card-2/70 text-[11px] text-ink-muted">
                      <tr>
                        <th scope="col" className="w-14 px-3 py-3 text-center font-semibold">#</th>
                        <th scope="col" className="w-[22%] px-3 py-3 text-left font-semibold">Consultor</th>
                        {PILAR_KEYS.map(pilar => (
                          <th key={pilar} scope="col" className="px-2 py-3 text-center font-semibold">
                            <span className="inline-flex items-center justify-center gap-1.5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PILARES[pilar].color }} />
                              <span>{PILAR_TABELA_LABEL[pilar]}</span>
                            </span>
                          </th>
                        ))}
                        <th scope="col" className="w-28 px-5 py-3 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-2">
                      {rankingGeral.map((c, i) => (
                        <tr key={c.id} className="hover:bg-card-2/40 transition-colors">
                          <td className="px-3 py-3.5 text-center text-xs font-medium text-ink-faint">{i + 1}</td>
                          <th scope="row" className="px-3 py-3.5 text-left font-medium text-ink truncate">{c.nome}</th>
                          {PILAR_KEYS.map(pilar => (
                            <td key={pilar} className="px-2 py-3.5 text-center tabular-nums text-ink-dim">{formatScore(c.scores[pilar])}</td>
                          ))}
                          <td className="px-5 py-3.5 text-right">
                            <span className="text-base font-bold text-ink tabular-nums">{formatScore(c.total)}</span>
                            <span className="block text-[10px] text-ink-faint">de 10 pontos</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="xl:hidden divide-y divide-card-2">
                  {rankingGeral.map((c, i) => (
                    <article key={c.id} className="px-4 sm:px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                          i === 0 ? 'bg-primary text-white' : i < 3 ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-card-2 text-ink-muted border border-line'
                        }`}>{i + 1}</span>
                        <p className="flex-1 min-w-0 text-sm font-semibold text-ink leading-tight">{c.nome}</p>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-ink tabular-nums">{formatScore(c.total)}</p>
                          <p className="text-[10px] text-ink-faint">de 10 pontos</p>
                        </div>
                      </div>
                      <dl className="grid grid-cols-3 gap-x-3 gap-y-3 mt-4 pl-11">
                        {PILAR_KEYS.map(pilar => (
                          <div key={pilar} className="min-w-0">
                            <dt className="flex items-center gap-1 text-[10px] text-ink-muted truncate">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PILARES[pilar].color }} />
                              {PILAR_TABELA_LABEL[pilar]}
                            </dt>
                            <dd className="mt-0.5 text-sm font-semibold text-ink tabular-nums">{formatScore(c.scores[pilar])}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : (
        <div className="glass rounded-2xl border border-line overflow-hidden" style={{ borderTop: `3px solid ${PILARES[selectedPilar].color}` }}>
        {PILAR_KEYS.filter(pilar => pilar === selectedPilar).map(pilar => {
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

          const linhas = consultores.map((c, i) => {
            const st = statusStyle(c.score, cfg?.pontos_max ?? 0)
            const falta = ehTpvResultado ? tpvFalta(c.metricas) : null
            const bateuMeta = falta != null && falta <= 0
            const q = quantidades[i]
            const destaque = q ? textoQuantidade(pilar, q.numero, q.de) : null
            const situacao = q ? textoSituacao(pilar, q) : null
            const semCarteira = q != null && q.faltam == null && dataAtual && (pilar === 'awareness' || pilar === 'acionaveis')
            const pct = c.valorMetrica != null && valorSpec ? fmtValor(valorSpec.type, c.valorMetrica) : null
            const scoreTxt = c.score.toFixed(1).replace('.', ',')
            const valorResultado = ehTpvResultado
              ? falta == null ? '—' : `${bateuMeta ? '+' : ''}${fmtValor('currency', Math.abs(falta))}`
              : destaque ?? pct ?? '—'
            const detalheResultado = ehTpvResultado
              ? falta == null ? 'objetivo não informado' : bateuMeta ? 'meta batida' : 'faltam para a meta'
              : [semCarteira ? 'carteira não encontrada' : null, situacao, pct && destaque ? `${pct} na planilha` : null].filter(Boolean).join(' · ')
            return { c, i, st, scoreTxt, valorResultado, detalheResultado }
          })

          return (
            <div key={pilar}>
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
                <div className="hidden xl:grid grid-cols-[48px_minmax(0,1fr)_minmax(180px,260px)_120px] gap-3 px-5 py-2.5 bg-card-2/60 text-[11px] font-semibold text-ink-muted">
                  <span className="text-center">#</span>
                  <span>Consultor</span>
                  <span className="text-right">Resultado</span>
                  <span className="text-right">Score</span>
                </div>
                {linhas.map(({ c, i, st, scoreTxt, valorResultado, detalheResultado }) => (
                  <div key={c.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] xl:grid-cols-[48px_minmax(0,1fr)_minmax(180px,260px)_120px] gap-x-3 gap-y-2 px-4 sm:px-5 py-3 items-center hover:bg-card-2/30 transition-colors">
                    <span className="text-xs font-medium text-ink-faint text-center">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink leading-tight">{c.nome}</p>
                      <p className="xl:hidden text-[11px] text-ink-muted mt-1">
                        {valorResultado}{detalheResultado ? ` · ${detalheResultado}` : ''}
                      </p>
                    </div>
                    <div className="hidden xl:block text-right min-w-0">
                      <p className="text-sm font-semibold text-ink-dim tabular-nums truncate">{valorResultado}</p>
                      {detalheResultado && <p className="text-[10px] text-ink-faint mt-0.5 truncate">{detalheResultado}</p>}
                    </div>
                    <span className="text-sm font-bold px-2.5 py-1 rounded-lg text-right tabular-nums" style={{ background: st.bg, color: st.text }}>
                      {scoreTxt}<span className="text-[10px] font-medium opacity-70"> / {cfg?.pontos_max}</span>
                    </span>
                  </div>
                ))}
              </div>
              )}
            </div>
          )
        })}
        </div>
        )}
      </div>
    </div>
  )
}
