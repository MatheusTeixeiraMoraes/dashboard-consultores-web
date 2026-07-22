'use client'

import { useState, useMemo } from 'react'
import MultiFiltro from '@/components/MultiFiltro'
import { entregarAoRoteirizar } from '@/lib/geo'
import { precisaIdentificar } from '@/lib/texto'
import { useRouter } from 'next/navigation'
import type { CarteiraMP, Ficha } from './page'

const TOP_INICIAL = 20   // a fila abre no topo; 100 linhas de cara é paralisia

const nBR = (n: number) => n.toLocaleString('pt-BR')
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

function whatsappUrl(t: string | null) {
  const n = (t ?? '').replace(/\D/g, '')
  return n ? `https://wa.me/${n.startsWith('55') ? n : '55' + n}` : null
}

const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : null

/** Quartil P1 é o mais quente. Cor só nos dois extremos — tudo colorido não informa. */
const CorQuartil: Record<string, string> = {
  P1: 'bg-bad-fill', P2: 'bg-warn-fill', P3: 'bg-primary', P4: 'bg-ink-faint',
}

const CorStatus: Record<string, string> = {
  ATIVO: 'text-good', CHURN: 'text-bad', INATIVO: 'text-warn', REATIVADO: 'text-good',
}

interface Props {
  dataReferencia: string | null
  carteira: CarteiraMP[]
  acoes: { seller_id: string; acionavel: string; consultor_nome: string }[]
  fichas: Record<string, Ficha>
  podeGerir: boolean
}

export default function AcionaveisClient({ dataReferencia, carteira, acoes, fichas, podeGerir }: Props) {
  const router = useRouter()
  const [aberta, setAberta] = useState<string | null>(null)   // campanha aberta
  const [verTodos, setVerTodos] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [fConsultores, setFConsultores] = useState<Set<string>>(new Set())
  const [fQuartis, setFQuartis] = useState<Set<string>>(new Set())
  const [fStatus, setFStatus] = useState<Set<string>>(new Set())

  const porSeller = useMemo(() => {
    const m = new Map<string, CarteiraMP>()
    for (const c of carteira) m.set(c.seller_id, c)
    return m
  }, [carteira])

  // Todos os acionáveis de cada cliente — alimenta o selo "+N" para o consultor
  // resolver tudo numa ligação só, em vez de ligar quatro vezes.
  const acoesPorSeller = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const a of acoes) {
      const l = m.get(a.seller_id)
      if (l) l.push(a.acionavel); else m.set(a.seller_id, [a.acionavel])
    }
    return m
  }, [acoes])

  const consultores = useMemo(
    () => [...new Set(carteira.map(c => c.consultor_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [carteira],
  )

  /** Filtro que vale tanto no mural quanto na fila — o número tem que ser o mesmo nos dois. */
  const passa = useMemo(() => (c: CarteiraMP | undefined) => {
    if (!c) return false
    if (fConsultores.size && !fConsultores.has(c.consultor_nome)) return false
    if (fQuartis.size && !fQuartis.has(c.quartil ?? '')) return false
    if (fStatus.size && !fStatus.has(c.status ?? '')) return false
    return true
  }, [fConsultores, fQuartis, fStatus])

  /** Mural: um cartão por acionável, com o que existe na carteira filtrada. */
  const campanhas = useMemo(() => {
    const m = new Map<string, { nome: string; sellers: string[]; quartis: Record<string, number>; valor: number }>()
    for (const a of acoes) {
      const c = porSeller.get(a.seller_id)
      if (!passa(c)) continue
      let e = m.get(a.acionavel)
      if (!e) { e = { nome: a.acionavel, sellers: [], quartis: {}, valor: 0 }; m.set(a.acionavel, e) }
      e.sellers.push(a.seller_id)
      const q = c!.quartil ?? '—'
      e.quartis[q] = (e.quartis[q] ?? 0) + 1
      // Só o valor da limpeza correspondente — somar os dois em toda campanha
      // inflaria o número e ele deixaria de significar alguma coisa.
      if (a.acionavel.includes('1x')) e.valor += c!.valor_1x ?? 0
      else if (a.acionavel.includes('parcelado')) e.valor += c!.valor_parc ?? 0
    }
    return [...m.values()].sort((a, b) => b.sellers.length - a.sellers.length)
  }, [acoes, porSeller, passa])

  /** Fila da campanha aberta, na ordem de prioridade que o MP mandou. */
  const fila = useMemo(() => {
    if (!aberta) return []
    const ids = acoes.filter(a => a.acionavel === aberta).map(a => a.seller_id)
    return ids
      .map(id => porSeller.get(id))
      .filter((c): c is CarteiraMP => passa(c))
      .sort((a, b) => (a.prio ?? 9e9) - (b.prio ?? 9e9))
  }, [aberta, acoes, porSeller, passa])

  const visiveis = verTodos ? fila : fila.slice(0, TOP_INICIAL)
  const selecionados = useMemo(() => fila.filter(c => sel.has(c.seller_id)), [fila, sel])

  function alternar(id: string) {
    setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  /** Roteável = tem ficha na base de rotas E já foi identificado (não é INOVVA/sem
   *  nome). Cliente pendente fica em Clientes até o consultor preencher. */
  const roteavel = (c: CarteiraMP) => {
    const f = fichas[c.seller_id]
    return !!f && !precisaIdentificar(f.nome, c.seller_id)
  }

  /** Manda a seleção para o Roteirizar — só quem tem GPS na base de rotas e já foi identificado. */
  function mandarProRoteirizar() {
    const comLocal = selecionados.filter(roteavel)
    entregarAoRoteirizar(comLocal.map(c => ({
      seller_id: c.seller_id,
      seller_nome: fichas[c.seller_id]?.nome ?? c.seller_id,
      lat: 0, lng: 0,     // o Roteirizar recarrega a coordenada da base de rotas
      telefone: fichas[c.seller_id]?.telefone ?? null,
      endereco: fichas[c.seller_id]?.local ?? '',
      cidade: '', bairro: '', consultor_nome: c.consultor_nome,
    })))
    router.push('/dashboard/roteirizar')
  }

  if (!dataReferencia) {
    return (
      <div className="glass rounded-2xl border border-line p-12 text-center">
        <p className="font-semibold text-ink">Nenhuma Planilha Ação Oportunidades importada</p>
        <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
          Suba a Planilha Ação Oportunidades em <span className="text-primary">Upar Planilha</span> para ver
          aqui os acionáveis que o Mercado Pago mandou para cada cliente.
        </p>
      </div>
    )
  }

  const totalClientes = new Set(campanhas.flatMap(c => c.sellers)).size

  return (
    <div className="pb-20">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink">Acionáveis Comerciais</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Planilha Ação Oportunidades de {dataBR(dataReferencia)} · {nBR(totalClientes)} clientes com acionável
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {podeGerir && <MultiFiltro label="Consultores" opcoes={consultores} sel={fConsultores} onChange={setFConsultores} />}
          <MultiFiltro label="Prioridade" opcoes={['P1', 'P2', 'P3', 'P4']} sel={fQuartis} onChange={setFQuartis} />
          <MultiFiltro label="Situação" opcoes={['ATIVO', 'CHURN', 'INATIVO', 'REATIVADO']} sel={fStatus} onChange={setFStatus} />
        </div>
      </div>

      {/* MURAL — a home da categoria */}
      {!aberta && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {campanhas.map(c => {
            const total = c.sellers.length
            return (
              <button
                key={c.nome}
                onClick={() => { setAberta(c.nome); setVerTodos(false); setSel(new Set()) }}
                className="glass rounded-2xl border border-line p-4 text-left hover:border-primary/50 transition-colors"
              >
                <p className="text-sm font-semibold text-ink leading-snug">{c.nome}</p>
                <p className="text-2xl font-semibold text-ink tracking-tight mt-2">{nBR(total)}</p>
                <p className="text-xs text-ink-muted">
                  {total === 1 ? 'cliente' : 'clientes'}
                  {c.valor > 0 && <> · <span className="text-good">{brl(c.valor)}</span> em jogo</>}
                </p>

                {/* Onde a fila se concentra. P1 pesado = campanha quente. */}
                <div className="flex h-1.5 rounded-full overflow-hidden mt-3 bg-card-2">
                  {['P1', 'P2', 'P3', 'P4'].map(q => {
                    const n = c.quartis[q] ?? 0
                    return n ? <div key={q} className={CorQuartil[q]} style={{ width: `${(n / total) * 100}%` }} title={`${q}: ${n}`} /> : null
                  })}
                </div>
                <div className="flex gap-2 mt-1.5 text-[10px] text-ink-faint">
                  {['P1', 'P2', 'P3', 'P4'].map(q => c.quartis[q] ? <span key={q}>{q} {c.quartis[q]}</span> : null)}
                </div>
              </button>
            )
          })}
          {campanhas.length === 0 && (
            <p className="text-sm text-ink-muted col-span-full glass rounded-2xl border border-line p-8 text-center">
              Nenhum cliente com esses filtros.
            </p>
          )}
        </div>
      )}

      {/* FILA da campanha aberta */}
      {aberta && (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <button onClick={() => { setAberta(null); setSel(new Set()) }}
              className="text-sm text-ink-muted hover:text-ink flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Campanhas
            </button>
            <span className="text-ink-faint">/</span>
            <p className="font-semibold text-ink">{aberta}</p>
            <span className="text-sm text-ink-muted">{nBR(fila.length)} na fila</span>
          </div>

          <div className="glass rounded-2xl border border-line divide-y divide-line overflow-hidden">
            {visiveis.map(c => {
              const f = fichas[c.seller_id]
              const wa = whatsappUrl(f?.telefone ?? null)
              const outros = (acoesPorSeller.get(c.seller_id) ?? []).filter(a => a !== aberta)
              const queda = c.tpv_mes_passado != null && c.tpv_mes_atual != null
                ? c.tpv_mes_atual - c.tpv_mes_passado : null
              return (
                <div key={c.seller_id} className="flex items-start gap-3 p-3 hover:bg-card-2 transition-colors">
                  <input type="checkbox" checked={sel.has(c.seller_id)} onChange={() => alternar(c.seller_id)}
                    className="accent-primary w-4 h-4 mt-1 flex-shrink-0 cursor-pointer" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {precisaIdentificar(f?.nome ?? '', c.seller_id) ? (
                        <span className="text-sm font-semibold text-warn truncate">
                          Pendente de identificação <span className="font-mono text-[11px] text-ink-faint">#{c.seller_id}</span>
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-ink truncate">{f?.nome}</span>
                      )}
                      {c.quartil && (
                        <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md flex-shrink-0" style={{}}>
                          <span className={`${CorQuartil[c.quartil] ?? 'bg-ink-faint'} px-1.5 py-0.5 rounded-md`}>
                            {c.quartil}{c.prio != null && ` #${c.prio}`}
                          </span>
                        </span>
                      )}
                      {c.status && (
                        <span className={`text-[11px] font-medium ${CorStatus[c.status] ?? 'text-ink-muted'}`}>{c.status}</span>
                      )}
                      {!f && <span className="text-[10px] text-ink-faint border border-line rounded px-1.5 py-0.5">fora da base de rotas</span>}
                    </div>

                    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] text-ink-muted mt-1">
                      {c.tpv_mes_atual != null && (
                        <span>
                          TPV {brl(c.tpv_mes_atual)}
                          {queda != null && queda < 0 && <span className="text-bad"> ▼ {brl(Math.abs(queda))}</span>}
                        </span>
                      )}
                      {c.status_credito && <span>{c.status_credito.replace(/^\d+\.\s*/, '')}</span>}
                      {c.mcc && <span className="truncate max-w-[180px]">{c.mcc}</span>}
                      {f?.local && <span className="truncate max-w-[160px]">{f.local}</span>}
                      <span>{c.ultimo_contato ? `contato ${dataBR(c.ultimo_contato)}` : 'nunca contatado'}</span>
                    </div>

                    {outros.length > 0 && (
                      <p className="text-[11px] text-warn mt-1">
                        +{outros.length} {outros.length === 1 ? 'acionável' : 'acionáveis'}: {outros.join(' · ')}
                      </p>
                    )}
                  </div>

                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp"
                      className="w-9 h-9 grid place-items-center border border-line rounded-lg text-good hover:bg-card-2 flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                    </a>
                  )}
                </div>
              )
            })}
          </div>

          {fila.length > TOP_INICIAL && !verTodos && (
            <button onClick={() => setVerTodos(true)}
              className="w-full mt-3 border border-line rounded-xl py-2.5 text-sm text-ink-dim hover:bg-card-2">
              Ver todos os {nBR(fila.length)}
            </button>
          )}
        </>
      )}

      {/* Ação em massa — mesmo padrão de Clientes e Radar */}
      {sel.size > 0 && (
        <div className="fixed bottom-0 left-0 md:left-60 right-0 glass-blur border-t border-line px-4 md:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3 z-30 flex-wrap">
          <span className="text-sm font-semibold text-ink">{sel.size} selecionado{sel.size !== 1 ? 's' : ''}</span>
          <button onClick={() => setSel(new Set())} className="text-sm text-ink-muted hover:underline">Limpar</button>
          <button onClick={mandarProRoteirizar}
            disabled={!selecionados.some(roteavel)}
            className="ml-auto bg-primary hover:bg-primary-dk disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl">
            Montar rota
          </button>
        </div>
      )}
    </div>
  )
}
