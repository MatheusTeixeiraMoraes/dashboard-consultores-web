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
      const map = L.map(div, { zoomControl: false }).setView([pos.lat, pos.lng], 13)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      // Tiles dark (CARTO, sem chave) para o mapa não brigar com a identidade escura.
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO', maxZoom: 19,
      }).addTo(map)
      const cluster = L.markerClusterGroup({
        maxClusterRadius: 60,
        disableClusteringAtZoom: 17,
        iconCreateFunction: c => L.divIcon({
          html: `<div class="radar-cluster">${c.getChildCount()}</div>`,
          className: '', iconSize: [38, 38],
        }),
      })
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
      radius: 7, color: '#fff', fillColor: 'var(--color-primary)', fillOpacity: 1, weight: 2,
      className: 'radar-me',
    }).bindPopup('📍 Sua localização').addTo(map)

    circleRef.current?.remove()
    circleRef.current = L.circle([pos.lat, pos.lng], {
      radius: raio * 1000, color: 'var(--color-primary)', fillColor: 'var(--color-primary)',
      fillOpacity: 0.07, weight: 1.5, opacity: 0.5, dashArray: '6 6',
    }).addTo(map)

    cluster.clearLayers()
    for (const c of clientes) {
      const cor = c.selecionado ? '#3ECF8E' : '#F2777A'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;border-radius:50%;background:${cor};border:1.5px solid rgba(255,255,255,.9);box-shadow:0 0 0 4px ${cor}33,0 2px 6px rgba(0,0,0,.6)"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      })
      const marker = L.marker([c.lat, c.lng], { icon })

      const tel = (c.seller_telefone ?? '').replace(/\D/g, '')
      const wa = tel ? `<a href="https://wa.me/${tel.startsWith('55') ? tel : '55' + tel}" target="_blank" rel="noopener" style="color:#3ECF8E">WhatsApp</a>` : ''
      const el = document.createElement('div')
      el.style.fontSize = '12px'
      el.style.minWidth = '180px'
      el.innerHTML = `
        <div style="font-weight:600;font-size:13px;color:var(--color-ink)">${esc(c.seller_nome || '#' + c.seller_id)}</div>
        <div style="color:var(--color-ink-muted);margin-top:2px">#${esc(c.seller_id)} · ${c.bairro ? esc(c.bairro) + ', ' : ''}${esc(c.cidade)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
          <span style="background:var(--color-good-bg);color:#3ECF8E;font-weight:700;font-size:11px;padding:2px 8px;border-radius:999px">${c.dist.toFixed(1).replace('.', ',')} km</span>
          ${wa}
        </div>
        <button type="button" style="margin-top:8px;width:100%;background:${c.selecionado ? 'var(--color-good-bg)' : '#3ECF8E'};color:${c.selecionado ? '#3ECF8E' : 'var(--color-bg)'};border:1px solid ${c.selecionado ? '#3ECF8E' : 'transparent'};border-radius:8px;padding:5px 10px;cursor:pointer;font-weight:600;font-size:12px">
          ${c.selecionado ? '✓ Selecionado' : '+ Selecionar'}
        </button>`
      el.querySelector('button')!.addEventListener('click', () => onToggleRef.current(c.seller_id))
      marker.bindPopup(el)
      cluster.addLayer(marker)
    }
  }

  // 26rem = altura fixa do que fica acima/abaixo do mapa (topbar, título,
  // controles, respiro da barra de seleção). Medido no browser, não chutado.
  return (
    <div
      ref={divRef}
      className="h-[calc(100vh-26rem)] min-h-[420px] rounded-2xl border border-line overflow-hidden relative z-0 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
    />
  )
}
