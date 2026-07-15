'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  otimizarRota, receberDoRadar, limparEntregaDoRadar, geocodar,
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

  // Filtros da grade de seleção
  const [fBusca, setFBusca] = useState('')
  const [fCidade, setFCidade] = useState('')
  const [fBairro, setFBairro] = useState('')
  const [fConsultor, setFConsultor] = useState('')

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
  const bairros = useMemo(
    () => [...new Set(clientes.filter(c => !fCidade || c.cidade === fCidade).map(c => c.bairro).filter(Boolean))].sort(),
    [clientes, fCidade],
  )

  const filtrados = useMemo(() => {
    const q = fBusca.trim().toLowerCase()
    return clientes.filter(c =>
      (!fCidade || c.cidade === fCidade) &&
      (!fBairro || c.bairro === fBairro) &&
      (!fConsultor || c.consultor_nome === fConsultor) &&
      (!q || c.seller_id.toLowerCase().includes(q) || c.seller_nome.toLowerCase().includes(q))
    )
  }, [clientes, fBusca, fCidade, fBairro, fConsultor])

  const temFiltro = !!(fBusca.trim() || fCidade || fBairro || fConsultor)

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
      const total = [...prev, ...novos].slice(0, MAX_STOPS)
      if (prev.length + novos.length > MAX_STOPS) setErro(`Selecionei os primeiros ${MAX_STOPS} (limite por rota).`)
      return total
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

  return (
    <div className="max-w-4xl pb-4">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#111827]">Roteirizar</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Selecione clientes (por bairro, cidade ou busca) e monte a rota.</p>
      </div>

      {/* Barra fixa de seleção + gerar */}
      <div className="bg-[#111827] rounded-2xl px-5 py-4 mb-4 flex items-center justify-between gap-4 flex-wrap sticky top-2 z-20">
        <div>
          <p className="text-[11px] text-gray-400 uppercase tracking-wide">Clientes na rota</p>
          <p className="text-3xl font-bold text-white leading-none">{stops.length}</p>
        </div>
        <div className="flex items-center gap-2">
          {stops.length > 0 && <button onClick={() => { setStops([]); setResultado(null) }} className="text-sm text-gray-300 hover:text-white">Limpar</button>}
          <button onClick={gerar} disabled={gerando || stops.length === 0}
            className="bg-[#10B981] hover:bg-[#047857] disabled:opacity-40 text-white text-sm font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            {gerando ? 'Gerando…' : 'Gerar rota'}
          </button>
        </div>
      </div>

      {preSelecionados > 0 && (
        <div className="mb-4 text-sm bg-[#F0FDF4] text-[#10B981] rounded-xl px-4 py-2.5">
          {preSelecionados} cliente{preSelecionados !== 1 ? 's' : ''} vieram do Radar.
        </div>
      )}
      {resultado && (
        <div className="mb-4 text-sm bg-[#F0FDF4] text-[#065F46] rounded-xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
          <span>Rota otimizada: <b>{resultado.km.toFixed(1).replace('.', ',')} km</b> · <b>{Math.round(resultado.min)} min</b> · ordem definida abaixo.</span>
        </div>
      )}
      {erro && <p className="text-xs text-[#EF4444] bg-[#FEF2F2] rounded-lg px-3 py-2 mb-4">{erro}</p>}

      {/* Pontos de partida/chegada */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><circle cx="12" cy="12" r="2" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="10" /></svg>
          <span className="text-sm font-semibold text-[#111827]">Pontos de referência</span>
        </div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-[#6B7280]">Ponto de partida *</span>
          <button onClick={usarMinhaLocalizacao} className="text-xs text-[#10B981] font-medium hover:underline">Usar minha localização</button>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <input value={partBuscaEnd} onChange={e => setPartBuscaEnd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') buscarPartida() }}
            placeholder="Buscar por endereço (ex.: Av. Boa Viagem, Recife)" className={`${inp} flex-1`} />
          <button onClick={buscarPartida} disabled={buscandoPart || !partBuscaEnd.trim()}
            className="border border-[#10B981]/40 text-[#10B981] text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap disabled:opacity-50">{buscandoPart ? '…' : 'Buscar'}</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={partLat} onChange={e => setPartLat(e.target.value)} placeholder="Latitude" className={inp} />
          <input value={partLng} onChange={e => setPartLng(e.target.value)} placeholder="Longitude" className={inp} />
        </div>
        {partEnd && <p className="text-[11px] text-[#9CA3AF] mt-1">📍 {partEnd}</p>}
        <div className="mt-3">
          <span className="text-xs font-semibold text-[#6B7280] mb-1.5 block">Ponto de chegada (opcional)</span>
          <div className="grid grid-cols-2 gap-2">
            <input value={chegLat} onChange={e => setChegLat(e.target.value)} placeholder="Latitude" className={inp} />
            <input value={chegLng} onChange={e => setChegLng(e.target.value)} placeholder="Longitude" className={inp} />
          </div>
          <p className="text-[11px] text-[#9CA3AF] mt-1">Sem chegada, a rota termina no último cliente.</p>
        </div>
      </div>

      {/* Rota gerada (ordem) */}
      {stops.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-4">
          <p className="text-sm font-semibold text-[#111827] mb-2">
            {resultado ? 'Ordem da rota' : `Selecionados (${stops.length})`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stops.map((s, i) => (
              <span key={s.seller_id} className="inline-flex items-center gap-1.5 text-[11px] bg-[#F9FAFB] border border-[#F3F4F6] rounded-lg pl-2 pr-1 py-1 text-[#374151]">
                {resultado && <span className="w-4 h-4 rounded-full bg-[#10B981] text-white flex items-center justify-center text-[9px] font-bold">{i + 1}</span>}
                {s.seller_nome || `#${s.seller_id}`}
                <button onClick={() => removeStop(s.seller_id)} className="text-[#9CA3AF] hover:text-[#EF4444] w-4 text-center">×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grade de seleção */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
        <input value={fBusca} onChange={e => setFBusca(e.target.value)} placeholder="Buscar por ID do cliente ou nome…" className={`${inp} w-full mb-3`} />
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {consultores.length > 1 && (
            <select value={fConsultor} onChange={e => setFConsultor(e.target.value)} className={sel}>
              <option value="">Todos os consultores</option>
              {consultores.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select value={fCidade} onChange={e => { setFCidade(e.target.value); setFBairro('') }} className={sel}>
            <option value="">Todas as cidades</option>
            {cidades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={fBairro} onChange={e => setFBairro(e.target.value)} className={sel}>
            <option value="">Todos os bairros</option>
            {bairros.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <button onClick={selecionarTodos} disabled={filtrados.length === 0}
            className="ml-auto bg-[#111827] hover:bg-black disabled:opacity-40 text-white text-xs font-semibold px-3.5 py-2 rounded-xl whitespace-nowrap">
            Selecionar todos ({filtrados.length})
          </button>
        </div>

        {!temFiltro && clientes.length > MAX_CARDS && (
          <p className="text-[11px] text-[#9CA3AF] mb-2">Filtre por bairro/cidade ou busque para focar. Mostrando {visiveis.length} de {clientes.length}.</p>
        )}
        {temFiltro && filtrados.length > MAX_CARDS && (
          <p className="text-[11px] text-[#9CA3AF] mb-2">Mostrando {MAX_CARDS} de {filtrados.length} — &quot;Selecionar todos&quot; pega todos os {filtrados.length}.</p>
        )}

        {filtrados.length === 0 ? (
          <p className="text-sm text-[#9CA3AF] text-center py-6">Nenhum cliente com esses filtros.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[560px] overflow-y-auto pr-1">
            {visiveis.map(c => {
              const sel = idsNaRota.has(c.seller_id)
              const wa = whatsappUrl(c.seller_telefone)
              return (
                <button key={c.seller_id} onClick={() => toggleStop(c)}
                  className={`text-left rounded-xl border p-3 transition-colors ${sel ? 'border-[#10B981] bg-[#F0FDF4]' : 'border-[#E5E7EB] hover:bg-[#F9FAFB]'}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-[#10B981] border-[#10B981]' : 'border-[#D1D5DB]'}`}>
                      {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono bg-[#EEF2FF] text-[#4F46E5] px-1.5 py-0.5 rounded">{c.seller_id}</span>
                        {wa && <span className="text-[#10B981]" title="tem WhatsApp"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" /></svg></span>}
                      </div>
                      <p className="text-sm font-medium text-[#111827] truncate mt-0.5">{c.seller_nome || '—'}</p>
                      <p className="text-[11px] text-[#9CA3AF] truncate">{c.bairro ? `${c.bairro}, ` : ''}{c.cidade}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Salvar */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mt-4">
        <span className="text-sm font-semibold text-[#111827] mb-3 block">Salvar na agenda</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input value={nomeRota} onChange={e => setNomeRota(e.target.value)} placeholder="Nome da rota (ex.: Visitas Boa Viagem)" className={inp} />
          <input type="date" value={dataVisita} onChange={e => setDataVisita(e.target.value)} className={inp} />
        </div>
        <button onClick={salvar} disabled={salvando || stops.length === 0}
          className="w-full bg-[#10B981] hover:bg-[#047857] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl">
          {salvando ? 'Salvando…' : 'Salvar rota'}
        </button>
      </div>
    </div>
  )
}

const inp = 'border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#10B981]'
const sel = 'border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-sm text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#10B981]'
