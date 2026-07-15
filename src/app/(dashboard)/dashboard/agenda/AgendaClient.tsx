'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { otimizarRota } from '@/lib/geo'
import type { Rota } from './page'

function fmtData(iso: string | null) {
  if (!iso) return 'sem data'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function KPI({ label, valor, sufixo }: { label: string; valor: string; sufixo?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#6B7280] mb-1">{label}</p>
      <p className="text-3xl font-bold text-[#111827]">{valor}<span className="text-base font-medium text-[#9CA3AF]">{sufixo}</span></p>
    </div>
  )
}

export default function AgendaClient({ rotas, podeVerTodos }: { rotas: Rota[]; podeVerTodos: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [refazendo, setRefazendo] = useState<string | null>(null)

  const kpis = useMemo(() => {
    const km = rotas.reduce((s, r) => s + (r.distancia_km ?? 0), 0)
    const min = rotas.reduce((s, r) => s + (r.tempo_minutos ?? 0), 0)
    return { km, rotas: rotas.length, horas: min / 60 }
  }, [rotas])

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

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#111827]">Agenda</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Rotas salvas{podeVerTodos ? ' da equipe' : ''}</p>
        </div>
        <button onClick={() => router.push('/dashboard/roteirizar')} className="bg-[#10B981] hover:bg-[#047857] text-white text-sm font-semibold px-4 py-2 rounded-xl">Nova rota</button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <KPI label="Rotas" valor={String(kpis.rotas)} />
        <KPI label="Km percorridos" valor={kpis.km.toFixed(1).replace('.', ',')} sufixo=" km" />
        <KPI label="Horas em rota" valor={kpis.horas.toFixed(1).replace('.', ',')} sufixo=" h" />
      </div>

      {erro && <p className="text-xs text-[#EF4444] bg-[#FEF2F2] rounded-lg px-3 py-2 mb-3">{erro}</p>}

      {rotas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <p className="font-semibold text-[#111827]">Nenhuma rota salva ainda</p>
          <p className="text-sm text-[#6B7280] mt-1">Monte uma no <strong className="text-[#10B981]">Roteirizar</strong> ou pelo Radar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rotas.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  {editando === r.id ? (
                    <div className="flex items-center gap-2">
                      <input value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} className="border border-[#E5E7EB] rounded-lg px-2 py-1 text-sm" autoFocus />
                      <button onClick={() => salvarNome(r.id)} className="text-[#10B981] text-xs font-semibold">Salvar</button>
                      <button onClick={() => setEditando(null)} className="text-[#6B7280] text-xs">Cancelar</button>
                    </div>
                  ) : (
                    <p className="font-semibold text-[#111827]">{r.nome_rota || 'Rota sem nome'}</p>
                  )}
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    {fmtData(r.data_visita)} · {r.stops?.length ?? 0} cliente{(r.stops?.length ?? 0) !== 1 ? 's' : ''}
                    {r.distancia_km != null ? ` · ${r.distancia_km.toFixed(1).replace('.', ',')} km` : ''}
                    {r.tempo_minutos != null ? ` · ${Math.round(r.tempo_minutos)} min` : ''}
                    {podeVerTodos && r.consultor_nome ? ` · ${r.consultor_nome}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {confirmar === r.id ? (
                    <>
                      <span className="text-[#EF4444]">Excluir?</span>
                      <button onClick={() => excluir(r.id)} className="bg-[#EF4444] text-white px-2 py-0.5 rounded-md font-semibold">Sim</button>
                      <button onClick={() => setConfirmar(null)} className="text-[#6B7280]">Não</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => refazer(r)} disabled={refazendo === r.id} className="text-[#10B981] font-medium hover:underline disabled:opacity-50">
                        {refazendo === r.id ? 'Refazendo…' : 'Refazer'}
                      </button>
                      <button onClick={() => { setEditando(r.id); setNomeEdit(r.nome_rota) }} className="text-[#3B82F6] font-medium hover:underline">Renomear</button>
                      <button onClick={() => setConfirmar(r.id)} className="text-[#EF4444] font-medium hover:underline">Excluir</button>
                    </>
                  )}
                </div>
              </div>

              {(r.stops?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {r.stops.map((s, i) => (
                    <span key={s.seller_id} className="text-[11px] bg-[#F9FAFB] border border-[#F3F4F6] rounded-lg px-2 py-1 text-[#374151]">
                      {i + 1}. {s.seller_nome || `#${s.seller_id}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
