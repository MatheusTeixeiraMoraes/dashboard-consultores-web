'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import MultiFiltro from '@/components/MultiFiltro'
import { precisaIdentificar } from '@/lib/texto'
import {
  otimizarRota, receberDoRadar, limparEntregaDoRadar, geocodar, linksGoogleMaps,
  type Ponto, type ClienteSelecionado,
} from '@/lib/geo'
import type { ClienteRadar } from '../radar/page'

const MAX_STOPS = 100      // OSRM /trip público aguenta ~100 pontos rápido
const MAX_CARDS = 120      // teto de cards renderizados por vez

function whatsappUrl(t: string | null) {
  const n = (t ?? '').replace(/\D/g, '')
  return n ? `https://wa.me/${n.startsWith('55') ? n : '55' + n}` : null
}

function paraSelecionado(c: ClienteRadar): ClienteSelecionado {
  return {
    seller_id: c.seller_id, seller_nome: c.seller_nome, lat: c.lat, lng: c.lng,
    telefone: c.seller_telefone, endereco: c.endereco_completo, cidade: c.cidade,
    bairro: c.bairro, consultor_nome: c.consultor_nome,
  }
}

interface Props {
  clientes: ClienteRadar[]
  meuNome: string
}

export default function RoteirizarClient({ clientes, meuNome }: Props) {
  const router = useRouter()

  const [partLat, setPartLat] = useState('')
  const [partLng, setPartLng] = useState('')
  const [partEnd, setPartEnd] = useState('')
  const [partBuscaEnd, setPartBuscaEnd] = useState('')
  const [buscandoPart, setBuscandoPart] = useState(false)
  const [chegLat, setChegLat] = useState('')
  const [chegLng, setChegLng] = useState('')

  const [stops, setStops] = useState<ClienteSelecionado[]>([])
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<{ km: number; min: number } | null>(null)

  const [nomeRota, setNomeRota] = useState('')
  const [dataVisita, setDataVisita] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [preSelecionados, setPreSelecionados] = useState(0)

  // Filtros da grade — conjuntos vazios = sem filtro.
  const [fBusca, setFBusca] = useState('')
  const [fCidades, setFCidades] = useState<Set<string>>(new Set())
  const [fBairros, setFBairros] = useState<Set<string>>(new Set())
  const [fConsultores, setFConsultores] = useState<Set<string>>(new Set())

  // Recebe a seleção vinda do Radar.
  useEffect(() => {
    const doRadar = receberDoRadar()
    if (doRadar.length > 0) {
      setStops(doRadar.slice(0, MAX_STOPS))
      setPreSelecionados(doRadar.length)
      limparEntregaDoRadar()
    }
  }, [])

  const idsNaRota = useMemo(() => new Set(stops.map(s => s.seller_id)), [stops])

  const consultores = useMemo(
    () => [...new Set(clientes.map(c => c.consultor_nome).filter(Boolean))].sort(),
    [clientes],
  )
  const cidades = useMemo(
    () => [...new Set(clientes.map(c => c.cidade).filter(Boolean))].sort(),
    [clientes],
  )
  // Bairros seguem as cidades escolhidas — não faz sentido oferecer bairro de
  // cidade que está fora do filtro.
  const bairros = useMemo(
    () => [...new Set(
      clientes.filter(c => fCidades.size === 0 || fCidades.has(c.cidade)).map(c => c.bairro).filter(Boolean),
    )].sort(),
    [clientes, fCidades],
  )

  const filtrados = useMemo(() => {
    const q = fBusca.trim().toLowerCase()
    return clientes.filter(c =>
      (fCidades.size === 0 || fCidades.has(c.cidade)) &&
      (fBairros.size === 0 || fBairros.has(c.bairro)) &&
      (fConsultores.size === 0 || fConsultores.has(c.consultor_nome)) &&
      (!q || c.seller_id.toLowerCase().includes(q) || c.seller_nome.toLowerCase().includes(q))
    )
  }, [clientes, fBusca, fCidades, fBairros, fConsultores])

  const nFiltros = fCidades.size + fBairros.size + fConsultores.size + (fBusca.trim() ? 1 : 0)
  const temFiltro = nFiltros > 0

  function limparFiltros() {
    setFBusca(''); setFCidades(new Set()); setFBairros(new Set()); setFConsultores(new Set())
  }

  function toggleStop(c: ClienteRadar) {
    setResultado(null)
    setStops(prev => prev.some(s => s.seller_id === c.seller_id)
      ? prev.filter(s => s.seller_id !== c.seller_id)
      : (prev.length >= MAX_STOPS ? (setErro(`Máximo de ${MAX_STOPS} clientes por rota.`), prev) : [...prev, paraSelecionado(c)]))
  }

  function selecionarTodos() {
    setErro(''); setResultado(null)
    setStops(prev => {
      const jaTem = new Set(prev.map(s => s.seller_id))
      const novos = filtrados.filter(c => !jaTem.has(c.seller_id)).map(paraSelecionado)
      if (prev.length + novos.length > MAX_STOPS) setErro(`Selecionei os primeiros ${MAX_STOPS} (limite por rota).`)
      return [...prev, ...novos].slice(0, MAX_STOPS)
    })
  }

  function removeStop(id: string) {
    setStops(s => s.filter(x => x.seller_id !== id))
    setResultado(null)
  }

  function usarMinhaLocalizacao() {
    if (!('geolocation' in navigator)) { setErro('GPS indisponível — informe a partida por endereço ou lat/lng.'); return }
    setErro('')
    navigator.geolocation.getCurrentPosition(
      p => { setPartLat(String(p.coords.latitude)); setPartLng(String(p.coords.longitude)); setPartEnd('Minha localização') },
      e => setErro(
        e.code === 1 ? 'Localização bloqueada no navegador. Informe a partida por endereço ou lat/lng abaixo.'
        : 'Não foi possível obter o GPS. Informe a partida por endereço ou lat/lng.'
      ),
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 },
    )
  }

  async function buscarPartida() {
    const q = partBuscaEnd.trim()
    if (!q) return
    setErro(''); setBuscandoPart(true)
    const p = await geocodar(q)
    setBuscandoPart(false)
    if (!p) return setErro('Endereço de partida não encontrado.')
    setPartLat(String(p.lat)); setPartLng(String(p.lng)); setPartEnd(q)
  }

  function coord(latS: string, lngS: string): Ponto | null {
    const lat = Number(latS.replace(',', '.')), lng = Number(lngS.replace(',', '.'))
    return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null
  }

  async function gerar() {
    setErro('')
    const partida = coord(partLat, partLng)
    if (!partida) return setErro('Informe o ponto de partida (GPS, endereço ou lat, lng).')
    if (stops.length < 1) return setErro('Selecione ao menos um cliente.')
    const chegada = coord(chegLat, chegLng)

    setGerando(true)
    try {
      const { ordemStops, distanciaKm, tempoMin } = await otimizarRota(
        partida, stops.map(s => ({ lat: s.lat, lng: s.lng })), chegada,
      )
      setStops(ordemStops.map(i => stops[i]))
      setResultado({ km: distanciaKm, min: tempoMin })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setGerando(false)
    }
  }

  async function salvar() {
    setErro('')
    if (!nomeRota.trim()) return setErro('Dê um nome à rota.')
    if (stops.length < 1) return setErro('A rota está vazia.')
    const partida = coord(partLat, partLng)
    const chegada = coord(chegLat, chegLng)

    setSalvando(true)
    const supabase = createClient()
    const { error } = await supabase.from('rotas').insert({
      consultor_nome: meuNome,
      nome_rota: nomeRota.trim(),
      data_visita: dataVisita || null,
      partida_endereco: partEnd.trim() || null,
      partida_lat: partida?.lat ?? null, partida_lng: partida?.lng ?? null,
      chegada_endereco: null,
      chegada_lat: chegada?.lat ?? null, chegada_lng: chegada?.lng ?? null,
      stops, distancia_km: resultado?.km ?? null, tempo_minutos: resultado?.min ?? null,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    router.push('/dashboard/agenda')
  }

  const visiveis = filtrados.slice(0, MAX_CARDS)

  // Links do Google Maps: partida (se houver) → paradas na ordem → chegada (se houver).
  const linksMaps = useMemo(() => {
    const partida = coord(partLat, partLng)
    const chegada = coord(chegLat, chegLng)
    const seq: Ponto[] = [
      ...(partida ? [partida] : []),
      ...stops.map(s => ({ lat: s.lat, lng: s.lng })),
      ...(chegada ? [chegada] : []),
    ]
    return linksGoogleMaps(seq)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partLat, partLng, chegLat, chegLng, stops])

  return (
    <div className="max-w-6xl pb-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">Roteirizar</h1>
        <p className="text-sm text-ink-muted mt-0.5">Filtre os clientes, selecione e monte a melhor sequência de visitas.</p>
      </div>

      {/* Barra de ação — acompanha a rolagem porque a seleção acontece embaixo */}
      <div className="glass-blur border border-line rounded-2xl px-5 py-3.5 mb-3 flex items-center justify-between gap-4 flex-wrap sticky top-2 z-30">
        <div className="flex items-baseline gap-2.5">
          <span className="text-3xl font-bold text-ink leading-none">{stops.length}</span>
          <span className="text-[11px] text-ink-muted uppercase tracking-wide">
            {stops.length === 1 ? 'cliente na rota' : 'clientes na rota'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {stops.length > 0 && (
            <button onClick={() => { setStops([]); setResultado(null) }} className="text-sm text-ink-muted hover:text-ink px-2">Limpar</button>
          )}
          <button onClick={gerar} disabled={gerando || stops.length === 0}
            className="bg-primary hover:bg-primary-dk disabled:opacity-40 text-white text-sm font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            {gerando ? 'Gerando…' : 'Gerar rota'}
          </button>
        </div>
      </div>

      {preSelecionados > 0 && (
        <div className="mb-3 text-sm bg-good-bg text-good rounded-xl px-4 py-2.5">
          {preSelecionados} cliente{preSelecionados !== 1 ? 's' : ''} vieram do Radar.
        </div>
      )}
      {resultado && (
        <div className="mb-3 text-sm bg-good-bg text-good rounded-xl px-4 py-2.5">
          Rota otimizada: <b>{resultado.km.toFixed(1).replace('.', ',')} km</b> · <b>{Math.round(resultado.min)} min</b>
        </div>
      )}
      {erro && <p className="text-xs text-bad bg-bad-bg rounded-lg px-3 py-2 mb-3">{erro}</p>}

      {/* Duas colunas: à esquerda a rota que se monta, à direita de onde se escolhe */}
      <div className="grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-3 items-start">

        {/* ---- Coluna esquerda ---- */}
        <div className="flex flex-col gap-3">
          {/* Pontos */}
          <div className="glass rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2"><circle cx="12" cy="12" r="2" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="10" /></svg>
              <span className="text-sm font-semibold text-ink">Pontos de referência</span>
            </div>

            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-ink-muted">Partida *</span>
              <button onClick={usarMinhaLocalizacao} className="text-xs text-primary-lt font-medium hover:underline">Usar meu GPS</button>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <input value={partBuscaEnd} onChange={e => setPartBuscaEnd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') buscarPartida() }}
                placeholder="Buscar endereço…" className={`${inp} flex-1 min-w-0`} />
              <button onClick={buscarPartida} disabled={buscandoPart || !partBuscaEnd.trim()}
                className="border border-field-line text-primary-lt text-xs font-semibold px-2.5 py-2 rounded-xl whitespace-nowrap disabled:opacity-50">
                {buscandoPart ? '…' : 'Buscar'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input value={partLat} onChange={e => setPartLat(e.target.value)} placeholder="Latitude" className={inp} />
              <input value={partLng} onChange={e => setPartLng(e.target.value)} placeholder="Longitude" className={inp} />
            </div>
            {partEnd && <p className="text-[11px] text-ink-faint mt-1 truncate">📍 {partEnd}</p>}

            <span className="text-xs font-semibold text-ink-muted mt-3 mb-1.5 block">Chegada (opcional)</span>
            <div className="grid grid-cols-2 gap-1.5">
              <input value={chegLat} onChange={e => setChegLat(e.target.value)} placeholder="Latitude" className={inp} />
              <input value={chegLng} onChange={e => setChegLng(e.target.value)} placeholder="Longitude" className={inp} />
            </div>
            <p className="text-[11px] text-ink-faint mt-1">Sem chegada, termina no último cliente.</p>
          </div>

          {/* Rota montada */}
          {stops.length > 0 && (
            <div className="glass rounded-2xl border border-line p-4">
              <p className="text-sm font-semibold text-ink mb-2">
                {resultado ? 'Ordem da rota' : `Selecionados (${stops.length})`}
              </p>

              {linksMaps.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {linksMaps.length === 1 ? (
                    <a href={linksMaps[0]} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-gmaps hover:bg-gmaps-dk text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                      Abrir no Google Maps
                    </a>
                  ) : (
                    <>
                      <span className="text-[11px] text-ink-muted w-full">Google Maps · {linksMaps.length} trechos:</span>
                      {linksMaps.map((l, i) => (
                        <a key={i} href={l} target="_blank" rel="noopener noreferrer"
                          className="bg-gmaps hover:bg-gmaps-dk text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">{i + 1}</a>
                      ))}
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto">
                {stops.map((s, i) => (
                  <span key={s.seller_id} className="inline-flex items-center gap-1.5 text-[11px] bg-card-2 border border-line rounded-lg pl-1.5 pr-1 py-1 text-ink-dim max-w-full">
                    {resultado && <span className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">{i + 1}</span>}
                    <span className="truncate">{precisaIdentificar(s.seller_nome, s.seller_id) ? `#${s.seller_id}` : s.seller_nome}</span>
                    <button onClick={() => removeStop(s.seller_id)} className="text-ink-faint hover:text-bad w-4 text-center flex-shrink-0">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Salvar */}
          <div className="glass rounded-2xl border border-line p-4">
            <span className="text-sm font-semibold text-ink mb-2.5 block">Salvar na agenda</span>
            <div className="flex flex-col gap-2 mb-2.5">
              <input value={nomeRota} onChange={e => setNomeRota(e.target.value)} placeholder="Nome da rota (ex.: Visitas Boa Viagem)" className={inp} />
              <input type="date" value={dataVisita} onChange={e => setDataVisita(e.target.value)} className={inp} />
            </div>
            <button onClick={salvar} disabled={salvando || stops.length === 0}
              className="w-full bg-primary hover:bg-primary-dk disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl">
              {salvando ? 'Salvando…' : 'Salvar rota'}
            </button>
          </div>
        </div>

        {/* ---- Coluna direita: escolher clientes ---- */}
        <div className="glass rounded-2xl border border-line p-4">
          {/* Toolbar de filtros */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <input value={fBusca} onChange={e => setFBusca(e.target.value)}
              placeholder="Buscar por ID do cliente ou nome…"
              className={`${inp} flex-1 min-w-[220px]`} />
            {consultores.length > 1 && (
              <MultiFiltro label="Consultores" opcoes={consultores} sel={fConsultores} onChange={setFConsultores} />
            )}
            <MultiFiltro label="Cidades" opcoes={cidades} sel={fCidades} onChange={setFCidades} />
            <MultiFiltro label="Bairros" opcoes={bairros} sel={fBairros} onChange={setFBairros} />
            {temFiltro && (
              <button onClick={limparFiltros} className="text-xs text-ink-muted hover:text-ink px-1.5">Limpar filtros</button>
            )}
          </div>

          {/* Resumo + ação em massa */}
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3 pb-3 border-b border-line">
            <p className="text-xs text-ink-muted">
              <b className="text-ink">{filtrados.length.toLocaleString('pt-BR')}</b>
              {temFiltro ? ' no filtro' : ' clientes'}
              {filtrados.length > MAX_CARDS && ` · mostrando ${MAX_CARDS}`}
            </p>
            <button onClick={selecionarTodos} disabled={filtrados.length === 0}
              className="bg-card-2 hover:bg-primary/20 border border-field-line disabled:opacity-40 text-ink text-xs font-semibold px-3.5 py-2 rounded-xl whitespace-nowrap">
              + Selecionar todos ({filtrados.length.toLocaleString('pt-BR')})
            </button>
          </div>

          {filtrados.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-10">Nenhum cliente com esses filtros.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[600px] overflow-y-auto pr-1">
              {visiveis.map(c => {
                const sel = idsNaRota.has(c.seller_id)
                const wa = whatsappUrl(c.seller_telefone)
                return (
                  <button key={c.seller_id} onClick={() => toggleStop(c)}
                    className={`text-left rounded-xl border p-3 transition-colors ${sel ? 'border-primary bg-primary/15' : 'border-line hover:bg-card-2'}`}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-primary border-primary' : 'border-ink-faint'}`}>
                        {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono bg-primary/15 text-primary-lt px-1.5 py-0.5 rounded">{c.seller_id}</span>
                          {wa && <span className="text-good" title="tem WhatsApp"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" /></svg></span>}
                        </div>
                        {precisaIdentificar(c.seller_nome, c.seller_id)
                          ? <p className="text-sm font-medium text-warn truncate mt-0.5">Pendente de identificação</p>
                          : <p className="text-sm font-medium text-ink truncate mt-0.5">{c.seller_nome || '—'}</p>}
                        <p className="text-[11px] text-ink-faint truncate">{c.bairro ? `${c.bairro}, ` : ''}{c.cidade}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const inp = 'border border-field-line bg-field rounded-xl px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary'
