'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { otimizarRota, linksGoogleMaps, type Ponto } from '@/lib/geo'
import { precisaIdentificar } from '@/lib/texto'
import type { Rota } from './page'

function linksMapsDaRota(r: Rota): string[] {
  const seq: Ponto[] = [
    ...(r.partida_lat != null && r.partida_lng != null ? [{ lat: r.partida_lat, lng: r.partida_lng }] : []),
    ...r.stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng)).map(s => ({ lat: s.lat, lng: s.lng })),
    ...(r.chegada_lat != null && r.chegada_lng != null ? [{ lat: r.chegada_lat, lng: r.chegada_lng }] : []),
  ]
  return linksGoogleMaps(seq)
}

function fmtData(iso: string | null) {
  if (!iso) return 'sem data'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function KPI({ label, valor, sufixo }: { label: string; valor: string; sufixo?: string }) {
  return (
    <div className="glass rounded-2xl border border-line p-4">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted mb-1">{label}</p>
      <p className="text-3xl font-bold text-ink">{valor}<span className="text-base font-medium text-ink-faint">{sufixo}</span></p>
    </div>
  )
}

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function pontosDaRota(r: Rota): { lat: number; lng: number }[] {
  return [
    ...(r.partida_lat != null && r.partida_lng != null ? [{ lat: r.partida_lat, lng: r.partida_lng }] : []),
    ...r.stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng)).map(s => ({ lat: s.lat, lng: s.lng })),
    ...(r.chegada_lat != null && r.chegada_lng != null ? [{ lat: r.chegada_lat, lng: r.chegada_lng }] : []),
  ]
}

// Traço leve da rota a partir das coordenadas — sem carregar mapa nenhum.
// Normaliza lat/lng na caixa (norte pra cima) e numera os pontos na ordem.
function TracadoRota({ pontos }: { pontos: { lat: number; lng: number }[] }) {
  const pts = pontos.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (pts.length < 2) {
    return (
      <div className="w-full rounded-lg bg-card-2 flex items-center justify-center text-[10px] text-ink-faint py-4">
        sem traçado
      </div>
    )
  }
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const W = 100, H = 56, pad = 9
  const spanLat = maxLat - minLat || 1e-6, spanLng = maxLng - minLng || 1e-6
  const x = (lng: number) => pad + ((lng - minLng) / spanLng) * (W - 2 * pad)
  const y = (lat: number) => pad + ((maxLat - lat) / spanLat) * (H - 2 * pad)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block rounded-lg bg-card-2" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.65" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(p.lng)} cy={y(p.lat)} r={i === 0 ? 2.8 : 2.1}
          fill={i === 0 ? 'var(--color-good)' : 'var(--color-primary)'} stroke="#fff" strokeWidth="0.9" />
      ))}
    </svg>
  )
}

export default function AgendaClient({ rotas, podeVerTodos }: { rotas: Rota[]; podeVerTodos: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [refazendo, setRefazendo] = useState<string | null>(null)

  const [view, setView] = useState<'semana' | 'lista'>('semana')
  const [semanaOffset, setSemanaOffset] = useState(0)
  // `hoje` só no cliente: new Date() no SSR daria mismatch de hidratação.
  const [hoje, setHoje] = useState<Date | null>(null)
  useEffect(() => setHoje(new Date()), [])

  const kpis = useMemo(() => {
    const km = rotas.reduce((s, r) => s + (r.distancia_km ?? 0), 0)
    const min = rotas.reduce((s, r) => s + (r.tempo_minutos ?? 0), 0)
    return { km, rotas: rotas.length, horas: min / 60 }
  }, [rotas])

  // Rotas com data, agrupadas por dia (yyyy-mm-dd).
  const porDia = useMemo(() => {
    const m = new Map<string, Rota[]>()
    for (const r of rotas) {
      if (!r.data_visita) continue
      const k = r.data_visita.slice(0, 10)
      const l = m.get(k)
      if (l) l.push(r); else m.set(k, [r])
    }
    return m
  }, [rotas])

  const semDia = useMemo(() => rotas.filter(r => !r.data_visita), [rotas])

  // Os 7 dias (segunda→domingo) da semana selecionada.
  const semana = useMemo(() => {
    if (!hoje) return [] as Date[]
    const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const dow = (base.getDay() + 6) % 7   // 0 = segunda
    base.setDate(base.getDate() - dow + semanaOffset * 7)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i); return d
    })
  }, [hoje, semanaOffset])

  const hojeIso = hoje ? isoLocal(hoje) : ''

  async function salvarNome(id: string) {
    if (!nomeEdit.trim()) return
    const supabase = createClient()
    const { error } = await supabase.from('rotas').update({ nome_rota: nomeEdit.trim(), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { setErro(error.message); return }
    setEditando(null)
    router.refresh()
  }

  async function excluir(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('rotas').delete().eq('id', id)
    if (error) { setErro(error.message); return }
    setConfirmar(null)
    router.refresh()
  }

  // Recalcula a rota com o mesmo ponto de partida e clientes — útil quando um
  // cliente teve o endereço/coordenada corrigido.
  async function refazer(r: Rota) {
    setErro('')
    if (r.partida_lat == null || r.partida_lng == null) {
      setErro('Rota sem ponto de partida salvo — refaça pelo Roteirizar.')
      return
    }
    const comCoord = r.stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    if (comCoord.length === 0) { setErro('Nenhuma parada com coordenada.'); return }

    setRefazendo(r.id)
    try {
      const chegada = r.chegada_lat != null && r.chegada_lng != null ? { lat: r.chegada_lat, lng: r.chegada_lng } : null
      const { ordemStops, distanciaKm, tempoMin } = await otimizarRota(
        { lat: r.partida_lat, lng: r.partida_lng },
        comCoord.map(s => ({ lat: s.lat, lng: s.lng })),
        chegada,
      )
      const stopsOrdenados = ordemStops.map(i => comCoord[i])
      const supabase = createClient()
      const { error } = await supabase.from('rotas').update({
        stops: stopsOrdenados, distancia_km: distanciaKm, tempo_minutos: tempoMin,
        updated_at: new Date().toISOString(),
      }).eq('id', r.id)
      if (error) { setErro(error.message); return }
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setRefazendo(null)
    }
  }

  // --- Peças reutilizadas pelos dois modos (Semana e Lista) ---

  /* Selo da categoria temporária. A rota da Hexa vive na MESMA tabela das
   * outras (é o que dá agenda única ao consultor), então o selo é a única
   * coisa que diz de onde ela veio. `origem` pode vir indefinida em banco
   * anterior à migration — aí é rota de carteira, e nada é mostrado. */
  const selo = (r: Rota) =>
    r.origem === 'hexa_recife' ? (
      <span className="bg-warn-bg text-warn border border-warn/40 px-1.5 py-0.5 rounded" title="Rota Inter/Hexa Recife">Hexa</span>
    ) : null

  const badges = (r: Rota) => (
    <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-semibold">
      {selo(r)}
      <span className="bg-primary/10 text-primary-lt px-1.5 py-0.5 rounded">{r.stops?.length ?? 0} cliente{(r.stops?.length ?? 0) !== 1 ? 's' : ''}</span>
      {r.distancia_km != null && <span className="bg-card-2 text-ink-dim px-1.5 py-0.5 rounded">{r.distancia_km.toFixed(1).replace('.', ',')} km</span>}
      {r.tempo_minutos != null && <span className="bg-card-2 text-ink-dim px-1.5 py-0.5 rounded">{Math.round(r.tempo_minutos)} min</span>}
    </div>
  )

  const paradas = (r: Rota) =>
    (r.stops?.length ?? 0) === 0 ? null : (
      <ol className="text-[11px] text-ink-dim space-y-0.5 mt-2">
        {r.stops.map((s, i) => (
          <li key={s.seller_id} className="truncate">
            <span className="text-ink-faint">{i + 1}.</span>{' '}
            {precisaIdentificar(s.seller_nome, s.seller_id) ? `Pendente #${s.seller_id}` : s.seller_nome}
          </li>
        ))}
      </ol>
    )

  const gmaps = (r: Rota) => {
    const links = linksMapsDaRota(r)
    if (links.length === 0) return null
    return links.length === 1 ? (
      <a href={links[0]} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 bg-gmaps hover:bg-gmaps-dk text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
        Ver no mapa
      </a>
    ) : (
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] text-ink-muted">Maps:</span>
        {links.map((l, i) => (
          <a key={i} href={l} target="_blank" rel="noopener noreferrer"
            className="bg-gmaps hover:bg-gmaps-dk text-white text-[11px] font-semibold px-2 py-1 rounded-md">{i + 1}</a>
        ))}
      </div>
    )
  }

  // Cartão de uma rota dentro da coluna do dia (semana).
  const cartaoSemana = (r: Rota) => (
    <div className="rounded-xl border border-line bg-card p-2.5">
      {editando === r.id ? (
        <div className="flex items-center gap-1 mb-1">
          <input value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} className="border border-line rounded-md px-1.5 py-0.5 text-xs w-full" autoFocus />
          <button onClick={() => salvarNome(r.id)} className="text-good text-[11px] font-semibold">ok</button>
        </div>
      ) : (
        <p className="text-xs font-semibold text-ink truncate mb-1.5" title={r.nome_rota}>{r.nome_rota || 'Rota sem nome'}</p>
      )}
      {badges(r)}
      <div className="my-2"><TracadoRota pontos={pontosDaRota(r)} /></div>
      {paradas(r)}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-line">
        {gmaps(r)}
        <div className="ml-auto flex items-center gap-2 text-ink-faint">
          <button onClick={() => { setEditando(r.id); setNomeEdit(r.nome_rota) }} title="Renomear" className="hover:text-primary">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          </button>
          {confirmar === r.id ? (
            <span className="text-[10px] flex items-center gap-1">
              <button onClick={() => excluir(r.id)} className="text-bad font-bold">sim</button>
              <button onClick={() => setConfirmar(null)} className="text-ink-muted">não</button>
            </span>
          ) : (
            <button onClick={() => setConfirmar(r.id)} title="Excluir" className="hover:text-bad">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )

  // Cartão completo (lista).
  const cartaoLista = (r: Rota) => (
    <div key={r.id} className="glass rounded-2xl border border-line p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {editando === r.id ? (
            <div className="flex items-center gap-2">
              <input value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} className="border border-line rounded-lg px-2 py-1 text-sm" autoFocus />
              <button onClick={() => salvarNome(r.id)} className="text-good text-xs font-semibold">Salvar</button>
              <button onClick={() => setEditando(null)} className="text-ink-muted text-xs">Cancelar</button>
            </div>
          ) : (
            <p className="font-semibold text-ink flex items-center gap-2 flex-wrap">
              {r.nome_rota || 'Rota sem nome'}
              <span className="text-[10px] font-semibold">{selo(r)}</span>
            </p>
          )}
          <p className="text-xs text-ink-muted mt-0.5">
            {fmtData(r.data_visita)} · {r.stops?.length ?? 0} cliente{(r.stops?.length ?? 0) !== 1 ? 's' : ''}
            {r.distancia_km != null ? ` · ${r.distancia_km.toFixed(1).replace('.', ',')} km` : ''}
            {r.tempo_minutos != null ? ` · ${Math.round(r.tempo_minutos)} min` : ''}
            {podeVerTodos && r.consultor_nome ? ` · ${r.consultor_nome}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {confirmar === r.id ? (
            <>
              <span className="text-bad">Excluir?</span>
              <button onClick={() => excluir(r.id)} className="bg-bad text-white px-2 py-0.5 rounded-md font-semibold">Sim</button>
              <button onClick={() => setConfirmar(null)} className="text-ink-muted">Não</button>
            </>
          ) : (
            <>
              <button onClick={() => refazer(r)} disabled={refazendo === r.id} className="text-good font-medium hover:underline disabled:opacity-50">
                {refazendo === r.id ? 'Refazendo…' : 'Refazer'}
              </button>
              <button onClick={() => { setEditando(r.id); setNomeEdit(r.nome_rota) }} className="text-primary font-medium hover:underline">Renomear</button>
              <button onClick={() => setConfirmar(r.id)} className="text-bad font-medium hover:underline">Excluir</button>
            </>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr_200px] gap-4 mt-3">
        <div>{paradas(r) ?? <p className="text-xs text-ink-faint">Sem paradas.</p>}</div>
        <TracadoRota pontos={pontosDaRota(r)} />
      </div>

      <div className="mt-3 pt-3 border-t border-line">{gmaps(r)}</div>
    </div>
  )

  const tabs = (
    <div className="flex gap-0.5 bg-field border border-field-line rounded-xl p-0.5">
      {(['semana', 'lista'] as const).map(v => (
        <button key={v} onClick={() => setView(v)}
          className={`px-3.5 py-1.5 text-sm font-medium capitalize rounded-lg transition-colors ${view === v ? 'bg-primary text-white shadow-[0_2px_8px_rgba(79,95,224,0.4)]' : 'text-ink-muted hover:text-ink-dim'}`}>
          {v}
        </button>
      ))}
    </div>
  )

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink">Agenda</h1>
          <p className="text-sm text-ink-muted mt-0.5">Visualize e gerencie as rotas{podeVerTodos ? ' da sua equipe' : ''}.</p>
        </div>
        <button onClick={() => router.push('/dashboard/roteirizar')} className="bg-primary hover:bg-primary-dk text-white text-sm font-semibold px-4 py-2 rounded-xl inline-flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Nova rota
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <KPI label="Rotas" valor={String(kpis.rotas)} />
        <KPI label="Km percorridos" valor={kpis.km.toFixed(1).replace('.', ',')} sufixo=" km" />
        <KPI label="Horas em rota" valor={kpis.horas.toFixed(1).replace('.', ',')} sufixo=" h" />
      </div>

      {erro && <p className="text-xs text-bad bg-bad-bg rounded-lg px-3 py-2 mb-3">{erro}</p>}

      {/* Abas + navegação de semana */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        {tabs}
        {view === 'semana' && semana.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setSemanaOffset(o => o - 1)} className="w-8 h-8 grid place-items-center rounded-lg border border-field-line text-ink-muted hover:bg-card-2">‹</button>
            <span className="text-sm font-medium text-ink tabular-nums min-w-[150px] text-center">
              {semana[0].getDate()} {MESES[semana[0].getMonth()]} – {semana[6].getDate()} {MESES[semana[6].getMonth()]} {semana[6].getFullYear()}
            </span>
            <button onClick={() => setSemanaOffset(o => o + 1)} className="w-8 h-8 grid place-items-center rounded-lg border border-field-line text-ink-muted hover:bg-card-2">›</button>
            {semanaOffset !== 0 && <button onClick={() => setSemanaOffset(0)} className="text-xs text-primary-lt font-medium hover:underline px-1">Hoje</button>}
          </div>
        )}
      </div>

      {view === 'semana' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {semana.map(d => {
            const iso = isoLocal(d)
            const doDia = porDia.get(iso) ?? []
            const ehHoje = iso === hojeIso
            const idx = (d.getDay() + 6) % 7
            return (
              <div key={iso} className={`glass rounded-2xl border p-3 flex flex-col ${ehHoje ? 'border-primary/60 ring-1 ring-primary/20' : 'border-line'}`}>
                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${ehHoje ? 'text-primary-lt' : 'text-ink-muted'}`}>{DIAS[idx]}</p>
                    <p className="text-lg font-bold text-ink leading-none">{d.getDate()} <span className="text-xs font-medium text-ink-faint">{MESES[d.getMonth()]}</span></p>
                  </div>
                  {doDia.length === 0 && <span className="text-[10px] text-ink-faint border border-line rounded-full px-2 py-0.5">Sem rota</span>}
                </div>

                {doDia.length === 0 ? (
                  <button onClick={() => router.push('/dashboard/roteirizar')}
                    className="flex-1 min-h-[120px] rounded-xl border border-dashed border-line flex flex-col items-center justify-center gap-1 text-center hover:border-primary/50 hover:bg-card-2/50 transition-colors group">
                    <span className="text-[11px] text-ink-faint">Nenhuma rota programada</span>
                    <span className="text-[11px] text-primary-lt font-medium group-hover:underline">+ Nova rota</span>
                  </button>
                ) : (
                  <div className="space-y-2.5">{doDia.map(r => <div key={r.id}>{cartaoSemana(r)}</div>)}</div>
                )}
              </div>
            )
          })}
        </div>
      ) : rotas.length === 0 ? (
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Nenhuma rota salva ainda</p>
          <p className="text-sm text-ink-muted mt-1">Monte uma no <strong className="text-good">Roteirizar</strong> ou pelo Radar.</p>
        </div>
      ) : (
        <div className="space-y-3">{rotas.map(r => cartaoLista(r))}</div>
      )}

      {/* Rotas sem data marcam presença mesmo no modo Semana */}
      {view === 'semana' && semDia.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Sem data definida ({semDia.length})</p>
          <div className="space-y-3">{semDia.map(r => cartaoLista(r))}</div>
        </div>
      )}
    </div>
  )
}
