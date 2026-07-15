'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { Map as LMap, Circle, CircleMarker, LayerGroup } from 'leaflet'
import type { Ponto } from '@/lib/geo'
import type { ClienteComDist } from './RadarClient'

interface Props {
  pos: Ponto
  raio: number
  clientes: ClienteComDist[]
  onToggle: (sellerId: string) => void
}

// Escapa texto da planilha antes de ir pro innerHTML do popup.
function esc(s: string): string {
  return s.replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

export default function RadarMapa({ pos, raio, clientes, onToggle }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  // Refs imperativas do Leaflet — o mapa vive fora do ciclo do React.
  const LRef = useRef<typeof import('leaflet') | null>(null)
  const mapRef = useRef<LMap | null>(null)
  const clusterRef = useRef<LayerGroup | null>(null)
  const circleRef = useRef<Circle | null>(null)
  const meRef = useRef<CircleMarker | null>(null)
  const onToggleRef = useRef(onToggle)
  onToggleRef.current = onToggle

  // Inicializa o mapa uma vez.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet.markercluster')
      const div = divRef.current
      // Guarda contra StrictMode/re-init (Leaflet lança se o container já tem mapa).
      if (cancelled || !div || mapRef.current || (div as unknown as { _leaflet_id?: number })._leaflet_id) return

      LRef.current = L
      const map = L.map(div).setView([pos.lat, pos.lng], 13)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map)
      const cluster = L.markerClusterGroup({ maxClusterRadius: 60, disableClusteringAtZoom: 17 })
      map.addLayer(cluster)
      mapRef.current = map
      clusterRef.current = cluster
      desenhar()
    })()
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redesenha quando posição/raio/clientes mudam.
  useEffect(() => {
    desenhar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, raio, clientes])

  function desenhar() {
    const L = LRef.current
    const map = mapRef.current
    const cluster = clusterRef.current
    if (!L || !map || !cluster) return

    meRef.current?.remove()
    meRef.current = L.circleMarker([pos.lat, pos.lng], {
      radius: 8, color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 1, weight: 2,
    }).bindPopup('📍 Sua localização').addTo(map)

    circleRef.current?.remove()
    circleRef.current = L.circle([pos.lat, pos.lng], {
      radius: raio * 1000, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.06, weight: 1,
    }).addTo(map)

    cluster.clearLayers()
    for (const c of clientes) {
      const cor = c.selecionado ? '#10B981' : '#EF4444'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${cor};border:2px solid #fff;box-shadow:0 0 0 1px ${cor}"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      })
      const marker = L.marker([c.lat, c.lng], { icon })

      const tel = (c.seller_telefone ?? '').replace(/\D/g, '')
      const wa = tel ? `<a href="https://wa.me/${tel.startsWith('55') ? tel : '55' + tel}" target="_blank" rel="noopener" style="color:#10B981">WhatsApp</a>` : ''
      const el = document.createElement('div')
      el.style.fontSize = '12px'
      el.style.minWidth = '170px'
      el.innerHTML = `
        <b>${esc(c.seller_nome || '#' + c.seller_id)}</b><br/>
        #${esc(c.seller_id)}<br/>${c.bairro ? esc(c.bairro) + ', ' : ''}${esc(c.cidade)}<br/>
        <b>${c.dist.toFixed(1).replace('.', ',')} km</b>${wa ? ' · ' + wa : ''}<br/>
        <button type="button" style="margin-top:6px;background:${c.selecionado ? '#F0FDF4' : '#10B981'};color:${c.selecionado ? '#10B981' : '#fff'};border:1px solid ${c.selecionado ? '#10B981' : 'transparent'};border-radius:6px;padding:3px 10px;cursor:pointer;font-weight:600">
          ${c.selecionado ? '✓ Selecionado' : '+ Selecionar'}
        </button>`
      el.querySelector('button')!.addEventListener('click', () => onToggleRef.current(c.seller_id))
      marker.bindPopup(el)
      cluster.addLayer(marker)
    }
  }

  return <div ref={divRef} className="h-[520px] rounded-2xl border border-[#E5E7EB] overflow-hidden relative z-0" />
}
