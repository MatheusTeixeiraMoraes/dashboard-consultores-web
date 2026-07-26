'use client'

import { precisaIdentificar, enderecoExibivel } from '@/lib/texto'
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

      // Duas bases, alternáveis pelo seletor no canto:
      // - Mapa: tiles claros do CARTO (a identidade "mapa de dia").
      // - Satélite: imagem aérea do Esri (sem chave) + ruas e rótulos por cima,
      //   o mesmo "híbrido" do Google Maps. Padrão = satélite (mais realista).
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
      // Pin em gota, borda branca e sombra própria (drop-shadow segue o contorno):
      // salta tanto no mapa claro quanto no satélite. Selecionado = verde com ✓;
      // não selecionado = vermelho com miolo branco.
      const cor = c.selecionado ? 'var(--color-good)' : 'var(--color-bad)'
      const miolo = c.selecionado
        ? '<path d="M9.2 12.4 12 15.2 16.2 10.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<circle cx="13" cy="12.6" r="4.4" fill="#fff"/>'
      const icon = L.divIcon({
        className: '',
        html: `<svg width="30" height="39" viewBox="0 0 26 34" style="filter:drop-shadow(0 3px 3px rgba(0,0,0,.55))"><path d="M13 .6C6.4.6 1 5.9 1 12.4c0 8 10 19.4 11.4 20.9a.9.9 0 0 0 1.3 0C15 31.8 25 20.4 25 12.4 25 5.9 19.6.6 13 .6Z" fill="${cor}" stroke="#fff" stroke-width="2"/>${miolo}</svg>`,
        iconSize: [30, 39], iconAnchor: [15, 38], popupAnchor: [0, -34],
      })
      const marker = L.marker([c.lat, c.lng], { icon })

      const dig = (c.seller_telefone ?? '').replace(/\D/g, '')
      const telNac = dig.startsWith('55') && dig.length > 11 ? dig.slice(2) : dig
      const telFmt = telNac.length === 11 ? `(${telNac.slice(0, 2)}) ${telNac.slice(2, 7)}-${telNac.slice(7)}`
        : telNac.length === 10 ? `(${telNac.slice(0, 2)}) ${telNac.slice(2, 6)}-${telNac.slice(6)}`
        : c.seller_telefone ?? ''
      // Ícone verde de telefone antes do número — clica e abre o WhatsApp.
      const telLinha = dig
        ? `<a href="https://wa.me/${dig.startsWith('55') ? dig : '55' + dig}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:6px;color:var(--color-good);font-weight:600;text-decoration:none;margin-top:5px">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>
             ${esc(telFmt)}
           </a>`
        : ''
      const endereco = enderecoExibivel(c.endereco_completo)
      const local = endereco || [c.bairro, c.cidade].filter(Boolean).join(', ')
      const el = document.createElement('div')
      el.style.fontSize = '12px'
      el.style.minWidth = '220px'
      el.innerHTML = `
        <div style="color:var(--color-ink-faint);font-size:11px;letter-spacing:.02em">ID ${esc(c.seller_id)}</div>
        <div style="font-weight:700;font-size:14px;margin-top:1px;color:${precisaIdentificar(c.seller_nome, c.seller_id) ? 'var(--color-warn)' : 'var(--color-ink)'}">${precisaIdentificar(c.seller_nome, c.seller_id) ? 'Pendente de identificação' : esc(c.seller_nome)}</div>
        ${telLinha}
        ${local ? `<div style="color:var(--color-ink-dim);margin-top:5px;line-height:1.35">${esc(local)}</div>` : ''}
        ${c.consultor_nome ? `<div style="margin-top:7px;padding-top:7px;border-top:1px solid var(--color-line)">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-ink-faint)">Consultor</div>
            <div style="color:var(--color-ink-dim);margin-top:1px">${esc(c.consultor_nome)}</div>
          </div>` : ''}
        <div style="display:flex;align-items:center;gap:6px;margin-top:9px">
          <span style="background:var(--color-good-bg);color:var(--color-good);font-weight:700;font-size:11px;padding:3px 9px;border-radius:999px">${c.dist.toFixed(1).replace('.', ',')} km</span>
          <a href="https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}" target="_blank" rel="noopener" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--color-field-line);border-radius:9px;padding:6px 8px;color:var(--color-ink-dim);text-decoration:none;font-weight:600">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Ver no mapa
          </a>
        </div>
        <button type="button" style="margin-top:8px;width:100%;background:${c.selecionado ? 'var(--color-good-bg)' : 'var(--color-good)'};color:${c.selecionado ? 'var(--color-good)' : '#fff'};border:1px solid ${c.selecionado ? 'var(--color-good)' : 'transparent'};border-radius:9px;padding:7px 10px;cursor:pointer;font-weight:700;font-size:12px">
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
      className="h-[calc(100dvh-26rem)] min-h-[420px] rounded-2xl border border-line overflow-hidden relative z-0 shadow-[0_8px_28px_rgba(28,42,90,0.14)]"
    />
  )
}
