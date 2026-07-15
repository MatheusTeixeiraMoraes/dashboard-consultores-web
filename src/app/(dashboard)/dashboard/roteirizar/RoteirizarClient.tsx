'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  otimizarRota, receberDoRadar, limparEntregaDoRadar, geocodar,
  type Ponto, type ClienteSelecionado,
} from '@/lib/geo'
import type { ClienteRadar } from '../radar/page'

const MAX_STOPS = 25  // limite prático do /trip público

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
  const [busca, setBusca] = useState('')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<{ km: number; min: number } | null>(null)

  const [nomeRota, setNomeRota] = useState('')
  const [dataVisita, setDataVisita] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [preSelecionados, setPreSelecionados] = useState(0)

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

  const candidatos = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return []
    return clientes
      .filter(c => !idsNaRota.has(c.seller_id) &&
        (c.seller_nome.toLowerCase().includes(q) || c.seller_id.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [clientes, busca, idsNaRota])

  function addStop(c: ClienteRadar) {
    if (stops.length >= MAX_STOPS) { setErro(`Máximo de ${MAX_STOPS} paradas.`); return }
    setStops(s => [...s, paraSelecionado(c)])
    setBusca('')
    setResultado(null)
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
    if (!partida) return setErro('Informe o ponto de partida (use o GPS ou cole lat, lng).')
    if (stops.length < 1) return setErro('Adicione ao menos um cliente à rota.')
    const chegada = coord(chegLat, chegLng)

    setGerando(true)
    try {
      const { ordemStops, distanciaKm, tempoMin } = await otimizarRota(
        partida, stops.map(s => ({ lat: s.lat, lng: s.lng })), chegada,
      )
      setStops(ordemStops.map(i => stops[i]))  // reordena pela sequência ótima
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
      partida_lat: partida?.lat ?? null,
      partida_lng: partida?.lng ?? null,
      chegada_endereco: null,
      chegada_lat: chegada?.lat ?? null,
      chegada_lng: chegada?.lng ?? null,
      stops,
      distancia_km: resultado?.km ?? null,
      tempo_minutos: resultado?.min ?? null,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    router.push('/dashboard/agenda')
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#111827]">Roteirizar</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Monte a melhor sequência de visitas e salve na agenda.</p>
      </div>

      {preSelecionados > 0 && (
        <div className="mb-4 text-sm bg-[#F0FDF4] text-[#10B981] rounded-xl px-4 py-2.5">
          {preSelecionados} cliente{preSelecionados !== 1 ? 's' : ''} pré-selecionado{preSelecionados !== 1 ? 's' : ''} do Radar.
        </div>
      )}

      {/* Pontos */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-4 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[#6B7280]">Ponto de partida *</span>
            <button onClick={usarMinhaLocalizacao} className="text-xs text-[#10B981] font-medium hover:underline">Usar minha localização</button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input value={partBuscaEnd} onChange={e => setPartBuscaEnd(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') buscarPartida() }}
              placeholder="Buscar por endereço (ex.: Av. Boa Viagem, Recife)" className={`${inp} flex-1`} />
            <button onClick={buscarPartida} disabled={buscandoPart || !partBuscaEnd.trim()}
              className="border border-[#10B981]/40 text-[#10B981] text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap disabled:opacity-50">
              {buscandoPart ? '…' : 'Buscar'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={partLat} onChange={e => setPartLat(e.target.value)} placeholder="Latitude" className={inp} />
            <input value={partLng} onChange={e => setPartLng(e.target.value)} placeholder="Longitude" className={inp} />
          </div>
          {partEnd && <p className="text-[11px] text-[#9CA3AF] mt-1">📍 {partEnd}</p>}
        </div>
        <div>
          <span className="text-xs font-semibold text-[#6B7280] mb-1.5 block">Ponto de chegada (opcional)</span>
          <div className="grid grid-cols-2 gap-2">
            <input value={chegLat} onChange={e => setChegLat(e.target.value)} placeholder="Latitude" className={inp} />
            <input value={chegLng} onChange={e => setChegLng(e.target.value)} placeholder="Longitude" className={inp} />
          </div>
          <p className="text-[11px] text-[#9CA3AF] mt-1">Sem chegada, a rota termina no último cliente.</p>
        </div>
      </div>

      {/* Adicionar clientes */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-[#111827]">Clientes na rota ({stops.length})</span>
        </div>
        <div className="relative mb-3">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente da carteira para adicionar…" className={`${inp} w-full`} />
          {candidatos.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-lg z-10 overflow-hidden">
              {candidatos.map(c => (
                <button key={c.seller_id} onClick={() => addStop(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-[#F9FAFB]">
                  <span className="font-medium text-[#111827]">{c.seller_nome || `#${c.seller_id}`}</span>
                  <span className="text-[11px] text-[#9CA3AF]"> · {c.bairro}, {c.cidade}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {stops.length === 0 ? (
          <p className="text-sm text-[#9CA3AF] text-center py-4">Nenhum cliente ainda. Busque acima ou venha do Radar.</p>
        ) : (
          <div className="space-y-1.5">
            {stops.map((s, i) => {
              const wa = whatsappUrl(s.telefone)
              return (
                <div key={s.seller_id} className="flex items-center gap-3 border border-[#F3F4F6] rounded-xl px-3 py-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${resultado ? 'bg-[#10B981] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#111827] truncate">{s.seller_nome || `#${s.seller_id}`}</p>
                    <p className="text-[11px] text-[#9CA3AF]">{s.bairro ? `${s.bairro}, ` : ''}{s.cidade}</p>
                  </div>
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-[#10B981] text-xs hover:underline">WhatsApp</a>}
                  <button onClick={() => removeStop(s.seller_id)} className="text-[#EF4444] text-xs hover:underline">remover</button>
                </div>
              )
            })}
          </div>
        )}

        <button onClick={gerar} disabled={gerando || stops.length === 0}
          className="mt-4 w-full bg-[#111827] hover:bg-black disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
          {gerando ? 'Gerando rota…' : 'Gerar rota otimizada'}
        </button>
        {resultado && (
          <div className="mt-3 flex items-center justify-center gap-6 text-sm">
            <span className="text-[#6B7280]">Distância: <b className="text-[#111827]">{resultado.km.toFixed(1).replace('.', ',')} km</b></span>
            <span className="text-[#6B7280]">Tempo: <b className="text-[#111827]">{Math.round(resultado.min)} min</b></span>
          </div>
        )}
      </div>

      {/* Salvar */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
        <span className="text-sm font-semibold text-[#111827] mb-3 block">Salvar na agenda</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input value={nomeRota} onChange={e => setNomeRota(e.target.value)} placeholder="Nome da rota (ex.: Visitas Centro)" className={inp} />
          <input type="date" value={dataVisita} onChange={e => setDataVisita(e.target.value)} className={inp} />
        </div>
        {erro && <p className="text-xs text-[#EF4444] bg-[#FEF2F2] rounded-lg px-3 py-2 mb-3">{erro}</p>}
        <button onClick={salvar} disabled={salvando || stops.length === 0}
          className="w-full bg-[#10B981] hover:bg-[#047857] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
          {salvando ? 'Salvando…' : 'Salvar rota'}
        </button>
      </div>
    </div>
  )
}

const inp = 'border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#10B981]'
