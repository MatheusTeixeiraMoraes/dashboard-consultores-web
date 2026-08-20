'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LMap, Marker, LeafletMouseEvent } from 'leaflet'

interface Props {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}

// Sem coordenada ainda: abre no Brasil todo em vez de "0,0" no Golfo da Guiné.
const CENTRO_BRASIL: [number, number] = [-14.235, -51.9253]

export default function PinMapa({ lat, lng, onChange }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      const div = divRef.current
      // Guarda contra StrictMode/re-init (Leaflet lança se o container já tem mapa).
      if (cancelled || !div || mapRef.current || (div as unknown as { _leaflet_id?: number })._leaflet_id) return

      const temPonto = lat != null && lng != null
      const inicial: [number, number] = temPonto ? [lat, lng] : CENTRO_BRASIL
      const map = L.map(div, { zoomControl: false }).setView(inicial, temPonto ? 16 : 4)
      L.control.zoom({ position: 'bottomright' }).addTo(map)

      // Mesmas duas bases do Radar: satélite (Esri, padrão) e mapa claro
      // (CARTO), alternáveis pelo seletor no canto — dá mais acertividade
      // pra fixar o alfinete em cima da fachada/quadra real.
      const esri = (servico: string, opts: object = {}) =>
        L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${servico}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, ...opts })
      const claro = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO', maxZoom: 19,
      })
      const satelite = L.layerGroup([
        esri('World_Imagery', { attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
        esri('Reference/World_Transportation'),
        esri('Reference/World_Boundaries_and_Places'),
      ])
      satelite.addTo(map)
      L.control.layers({ 'Satélite': satelite, 'Mapa': claro }, undefined, { position: 'topright' }).addTo(map)

      // Ícone próprio em SVG — o marker padrão do Leaflet quebra sob bundler
      // (caminho de imagem relativo não resolve).
      const icon = L.divIcon({
        className: '',
        html: '<svg width="34" height="44" viewBox="0 0 26 34" style="filter:drop-shadow(0 3px 3px rgba(0,0,0,.55))"><path d="M13 .6C6.4.6 1 5.9 1 12.4c0 8 10 19.4 11.4 20.9a.9.9 0 0 0 1.3 0C15 31.8 25 20.4 25 12.4 25 5.9 19.6.6 13 .6Z" fill="var(--color-primary)" stroke="#fff" stroke-width="2"/><circle cx="13" cy="12.6" r="4.4" fill="#fff"/></svg>',
        iconSize: [34, 44], iconAnchor: [17, 43],
      })
      const marker = L.marker(inicial, { draggable: true, icon }).addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onChangeRef.current(p.lat, p.lng)
      })
      map.on('click', (e: LeafletMouseEvent) => {
        marker.setLatLng(e.latlng)
        onChangeRef.current(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
      markerRef.current = marker

      // Ainda sem coordenada: centra no GPS do consultor — em campo, ele
      // costuma estar no próprio endereço do cliente que está cadastrando.
      if (!temPonto && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          p => { if (!cancelled && mapRef.current) map.setView([p.coords.latitude, p.coords.longitude], 15) },
          () => { /* sem permissão/GPS: fica no Brasil todo mesmo */ },
          { enableHighAccuracy: false, timeout: 8000 },
        )
      }
    })()
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recentraliza quando lat/lng mudam por fora (colou no campo Coordenadas,
  // clicou "Buscar do endereço") — não quando a mudança veio do próprio
  // arrastar/clicar no mapa, porque aí o marker já está na posição certa.
  useEffect(() => {
    const map = mapRef.current, marker = markerRef.current
    if (!map || !marker || lat == null || lng == null) return
    const atual = marker.getLatLng()
    if (Math.abs(atual.lat - lat) < 1e-9 && Math.abs(atual.lng - lng) < 1e-9) return
    marker.setLatLng([lat, lng])
    map.setView([lat, lng], Math.max(map.getZoom(), 15))
  }, [lat, lng])

  return <div ref={divRef} className="h-80 rounded-xl border border-line overflow-hidden relative z-0 cursor-crosshair" />
}
