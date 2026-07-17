'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { distanciaKm, entregarAoRoteirizar, geocodar, type Ponto, type ClienteSelecionado } from '@/lib/geo'
import type { ClienteRadar } from './page'

const RadarMapa = dynamic(() => import('./RadarMapa'), {
  ssr: false,
  loading: () => <div className="h-[520px] flex items-center justify-center text-sm text-[#5C5C64]">Carregando mapa…</div>,
})

const CHAVE_PREF = 'radar_pref'

function whatsappUrl(telefone: string | null) {
  const num = (telefone ?? '').replace(/\D/g, '')
  if (!num) return null
  return `https://wa.me/${num.startsWith('55') ? num : '55' + num}`
}

function fmtDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`
}

export interface ClienteComDist extends ClienteRadar {
  dist: number
  selecionado: boolean
}

interface Props {
  clientes: ClienteRadar[]
  podeVerTodos: boolean
  meuNome: string
}

export default function RadarClient({ clientes, podeVerTodos, meuNome }: Props) {
  const router = useRouter()

  const [pos, setPos] = useState<Ponto | null>(null)
  const [geoStatus, setGeoStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [geoMsg, setGeoMsg] = useState('')

  const [raio, setRaio] = useState(10)
  const [viewMode, setViewMode] = useState<'lista' | 'mapa'>('lista')
  const [fCidade, setFCidade] = useState('')
  const [fBairro, setFBairro] = useState('')
  const [fConsultor, setFConsultor] = useState('')
  const [buscaSeller, setBuscaSeller] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [manualEnd, setManualEnd] = useState('')
  const [buscandoManual, setBuscandoManual] = useState(false)

  // Restaura preferências (raio, view).
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(CHAVE_PREF) || '{}')
      if (typeof p.raio === 'number') setRaio(p.raio)
      if (p.viewMode === 'mapa' || p.viewMode === 'lista') setViewMode(p.viewMode)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    localStorage.setItem(CHAVE_PREF, JSON.stringify({ raio, viewMode }))
  }, [raio, viewMode])

  const lerGps = useCallback((forcar = false) => {
    if (!('geolocation' in navigator)) {
      setGeoStatus('error'); setGeoMsg('Este dispositivo não expõe geolocalização.'); return
    }
    setGeoStatus('loading')
    navigator.geolocation.getCurrentPosition(
      p => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeoStatus('ok') },
      e => {
        setGeoStatus('error')
        // 1 = permissão negada, 3 = timeout.
        setGeoMsg(
          e.code === 1 ? 'Permissão de localização bloqueada no navegador. Libere pelo ícone à esquerda da barra de endereço, ou informe sua localização abaixo.'
          : e.code === 3 ? 'O GPS demorou a responder. Tente de novo ou informe sua localização abaixo.'
          : (e.message || 'Não foi possível obter sua localização.')
        )
      },
      // Baixa precisão: no desktop (sem chip de GPS) é bem mais rápido e confiável;
      // para proximidade em km não precisa de precisão de metros.
      { enableHighAccuracy: false, timeout: 20000, maximumAge: forcar ? 0 : 300000 },
    )
  }, [])

  useEffect(() => { lerGps() }, [lerGps])

  // Alternativa quando o GPS falha/está bloqueado: definir a posição por endereço.
  async function usarEndereco() {
    const q = manualEnd.trim()
    if (!q) return
    setBuscandoManual(true)
    const p = await geocodar(q)
    setBuscandoManual(false)
    if (p) { setPos(p); setGeoStatus('ok') }
    else setGeoMsg('Endereço não encontrado. Tente com cidade/bairro.')
  }

  // Distância de cada cliente até a posição atual (só quando há GPS).
  const comDistancia = useMemo(() => {
    if (!pos) return []
    return clientes
      .map(c => ({ ...c, dist: distanciaKm(pos, { lat: c.lat, lng: c.lng }), selecionado: selecionados.has(c.seller_id) }))
      .sort((a, b) => a.dist - b.dist)
  }, [pos, clientes, selecionados])

  const dentroDoRaio = useMemo(
    () => comDistancia.filter(c => c.dist <= raio),
    [comDistancia, raio],
  )

  const cidades = useMemo(
    () => [...new Set(dentroDoRaio.map(c => c.cidade).filter(Boolean))].sort(),
    [dentroDoRaio],
  )
  const bairros = useMemo(
    () => [...new Set(dentroDoRaio.filter(c => !fCidade || c.cidade === fCidade).map(c => c.bairro).filter(Boolean))].sort(),
    [dentroDoRaio, fCidade],
  )
  const consultores = useMemo(
    () => podeVerTodos ? [...new Set(dentroDoRaio.map(c => c.consultor_nome).filter(Boolean))].sort() : [],
    [dentroDoRaio, podeVerTodos],
  )

  const filtrados = useMemo(() => {
    const q = buscaSeller.trim().toLowerCase()
    return dentroDoRaio.filter(c =>
      (!fCidade || c.cidade === fCidade) &&
      (!fBairro || c.bairro === fBairro) &&
      (!fConsultor || c.consultor_nome === fConsultor) &&
      (!q || c.seller_id.toLowerCase().includes(q) || c.seller_nome.toLowerCase().includes(q))
    )
  }, [dentroDoRaio, fCidade, fBairro, fConsultor, buscaSeller])

  const toggle = useCallback((sellerId: string) => {
    setSelecionados(prev => {
      const s = new Set(prev)
      if (s.has(sellerId)) s.delete(sellerId); else s.add(sellerId)
      return s
    })
  }, [])

  function criarRota() {
    const mapaClientes = new Map(clientes.map(c => [c.seller_id, c]))
    const payload: ClienteSelecionado[] = [...selecionados]
      .map(id => mapaClientes.get(id))
      .filter((c): c is ClienteRadar => !!c)
      .map(c => ({
        seller_id: c.seller_id, seller_nome: c.seller_nome, lat: c.lat, lng: c.lng,
        telefone: c.seller_telefone, endereco: c.endereco_completo, cidade: c.cidade,
        bairro: c.bairro, consultor_nome: c.consultor_nome,
      }))
    if (payload.length === 0) return
    entregarAoRoteirizar(payload)
    router.push('/dashboard/roteirizar')
  }

  // --- Estados de GPS ---
  if (geoStatus === 'loading' && !pos) {
    return (
      <RadarShell>
        <div className="bg-[#17171B] rounded-2xl border border-[#26262B] p-14 text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[#3ECF8E] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="font-semibold text-[#F4F4F5]">Obtendo sua localização…</p>
          <p className="text-sm text-[#8A8A93] mt-1">Autorize o acesso ao GPS no navegador.</p>
        </div>
      </RadarShell>
    )
  }

  if (geoStatus === 'error' && !pos) {
    return (
      <RadarShell>
        <div className="bg-[#17171B] rounded-2xl border border-[#26262B] p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#3C1E22] flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F2777A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </div>
          <p className="font-semibold text-[#F4F4F5]">Não foi possível obter sua localização</p>
          <p className="text-sm text-[#8A8A93] mt-1 mb-4 max-w-md mx-auto">{geoMsg}</p>
          <button onClick={() => lerGps(true)} className="bg-[#4F5FE0] hover:bg-[#3D4BC4] text-white text-sm font-semibold px-5 py-2 rounded-xl">Tentar novamente</button>

          <div className="mt-6 pt-6 border-t border-[#26262B] max-w-sm mx-auto">
            <p className="text-xs font-semibold text-[#8A8A93] mb-2">Ou informe sua localização por endereço</p>
            <div className="flex items-center gap-2">
              <input value={manualEnd} onChange={e => setManualEnd(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') usarEndereco() }}
                placeholder="Ex.: Av. Boa Viagem, Recife"
                className="flex-1 border border-[#26262B] rounded-xl px-3 py-2 text-sm text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-[#4F5FE0]" />
              <button onClick={usarEndereco} disabled={buscandoManual || !manualEnd.trim()}
                className="bg-[#1D1D22] hover:bg-[#26262B] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl whitespace-nowrap">
                {buscandoManual ? '…' : 'Usar'}
              </button>
            </div>
          </div>
        </div>
      </RadarShell>
    )
  }

  return (
    <RadarShell
      contador={`${filtrados.length} cliente${filtrados.length !== 1 ? 's' : ''} em ${raio} km`}
      onAtualizarGps={() => lerGps(true)}
      atualizando={geoStatus === 'loading'}
    >
      {/* Controles */}
      <div className="bg-[#17171B] rounded-2xl border border-[#26262B] p-4 mb-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-[#8A8A93]">Raio</span>
          <input type="range" min={1} max={50} value={raio} onChange={e => setRaio(Number(e.target.value))} className="flex-1 min-w-[160px] accent-[#3ECF8E]" />
          <div className="flex items-center gap-1">
            <input type="number" min={1} max={50} value={raio} onChange={e => setRaio(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} className="w-16 border border-[#26262B] rounded-lg px-2 py-1 text-sm text-[#F4F4F5]" />
            <span className="text-sm text-[#8A8A93]">km</span>
          </div>
          <div className="flex rounded-xl border border-[#26262B] overflow-hidden ml-auto">
            {(['lista', 'mapa'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3.5 py-1.5 text-sm font-medium capitalize ${viewMode === m ? 'bg-[#4F5FE0] text-white' : 'text-[#8A8A93] hover:bg-[#1D1D22]'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select value={fCidade} onChange={e => { setFCidade(e.target.value); setFBairro('') }} className={selCls}>
            <option value="">Todas as cidades</option>
            {cidades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={fBairro} onChange={e => setFBairro(e.target.value)} className={selCls}>
            <option value="">Todos os bairros</option>
            {bairros.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          {podeVerTodos && (
            <select value={fConsultor} onChange={e => setFConsultor(e.target.value)} className={selCls}>
              <option value="">Todos os consultores</option>
              {consultores.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input value={buscaSeller} onChange={e => setBuscaSeller(e.target.value)} placeholder="Buscar seller / nome" className={`${selCls} flex-1 min-w-[160px]`} />
        </div>
      </div>

      {/* Conteúdo */}
      {viewMode === 'mapa' ? (
        <RadarMapa pos={pos!} raio={raio} clientes={filtrados} onToggle={toggle} />
      ) : filtrados.length === 0 ? (
        <div className="bg-[#17171B] rounded-2xl border border-[#26262B] p-12 text-center">
          <p className="font-semibold text-[#F4F4F5]">Nenhum cliente no raio de {raio} km</p>
          <p className="text-sm text-[#8A8A93] mt-1">Aumente o raio ou ajuste os filtros.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(c => {
            const wa = whatsappUrl(c.seller_telefone)
            return (
              <div key={c.seller_id} className={`bg-[#17171B] rounded-xl border p-3.5 flex items-center gap-3 ${c.selecionado ? 'border-[#3ECF8E] ring-1 ring-[#4F5FE0]/30' : 'border-[#26262B]'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-[#F4F4F5] truncate">{c.seller_nome || `#${c.seller_id}`}</p>
                    <span className="text-[11px] font-bold text-[#3ECF8E] bg-[#163A28] px-2 py-0.5 rounded-full whitespace-nowrap">{fmtDist(c.dist)}</span>
                    {c.selecionado && <span className="text-[11px] font-bold text-white bg-[#3ECF8E] px-2 py-0.5 rounded-full">Selecionado</span>}
                  </div>
                  <p className="text-[11px] text-[#5C5C64] mt-0.5">
                    #{c.seller_id} · {c.bairro ? `${c.bairro}, ` : ''}{c.cidade}
                    {podeVerTodos && c.consultor_nome ? ` · ${c.consultor_nome}` : ''}
                  </p>
                </div>
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="text-[#3ECF8E] p-1.5" title="WhatsApp">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                  </a>
                )}
                <button onClick={() => toggle(c.seller_id)}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap ${c.selecionado ? 'bg-[#163A28] text-[#3ECF8E] border border-[#3ECF8E]/30' : 'bg-[#3ECF8E] text-white'}`}>
                  {c.selecionado ? '✓ Selecionado' : '+ Selecionar'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Barra de seleção */}
      {selecionados.size > 0 && (
        <div className="fixed bottom-0 left-60 right-0 bg-[#17171B] border-t border-[#26262B] px-6 py-3 flex items-center gap-3 z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <span className="text-sm font-semibold text-[#F4F4F5]">{selecionados.size} cliente{selecionados.size !== 1 ? 's' : ''} selecionado{selecionados.size !== 1 ? 's' : ''}</span>
          <button onClick={() => setSelecionados(new Set())} className="text-sm text-[#8A8A93] hover:underline ml-auto">Limpar</button>
          <button onClick={criarRota} className="bg-[#4F5FE0] hover:bg-[#3D4BC4] text-white text-sm font-semibold px-5 py-2 rounded-xl">Criar Rota →</button>
        </div>
      )}
    </RadarShell>
  )
}

const selCls = 'border border-[#26262B] rounded-lg px-2.5 py-1.5 text-sm text-[#F4F4F5] bg-[#17171B] focus:outline-none focus:ring-2 focus:ring-[#4F5FE0]'

function RadarShell({ children, contador, onAtualizarGps, atualizando }: {
  children: React.ReactNode; contador?: string; onAtualizarGps?: () => void; atualizando?: boolean
}) {
  return (
    <div className="pb-16">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#F4F4F5]">Radar de Clientes</h1>
          <p className="text-sm text-[#8A8A93] mt-0.5">{contador ?? 'Clientes próximos de você agora'}</p>
        </div>
        {onAtualizarGps && (
          <button onClick={onAtualizarGps} disabled={atualizando}
            className="border border-[#26262B] hover:bg-[#1D1D22] disabled:opacity-50 text-[#C4C4CC] text-sm font-medium px-4 py-2 rounded-xl flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={atualizando ? 'animate-spin' : ''}><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
            Atualizar GPS
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
