// Geometria e integração Radar → Roteirizar.

import { enderecoExibivel } from '@/lib/texto'

export interface Ponto {
  lat: number
  lng: number
}

const R_TERRA_KM = 6371

/** Distância em km entre dois pontos (fórmula de Haversine). */
export function distanciaKm(a: Ponto, b: Ponto): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_TERRA_KM * Math.asin(Math.sqrt(s))
}

// Um cliente selecionado no Radar, "entregue" ao Roteirizar via localStorage.
// O Radar não escreve no banco — só passa a seleção adiante (regra da spec).
export interface ClienteSelecionado {
  seller_id: string
  seller_nome: string
  lat: number
  lng: number
  telefone: string | null
  endereco: string
  cidade: string
  bairro: string
  consultor_nome: string
}

export const CHAVE_RADAR_ROTA = 'radar_add_to_rota'

export function entregarAoRoteirizar(clientes: ClienteSelecionado[]) {
  localStorage.setItem(CHAVE_RADAR_ROTA, JSON.stringify(clientes))
}

export function receberDoRadar(): ClienteSelecionado[] {
  try {
    const raw = localStorage.getItem(CHAVE_RADAR_ROTA)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function limparEntregaDoRadar() {
  localStorage.removeItem(CHAVE_RADAR_ROTA)
}

// --- Geocodificação (endereço → lat/lng) ---
//
// Nominatim é mais preciso para endereços BR (resolve número); Photon entra de
// reserva. Ambos públicos, CORS liberado. Uso leve/pontual — em massa, jogar
// throttle (~1 req/s) para respeitar a política do Nominatim.

export async function geocodar(endereco: string): Promise<Ponto | null> {
  const q = endereco.trim()
  if (!q) return null

  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`)
    if (r.ok) {
      const j = await r.json()
      if (j[0]) {
        const lat = Number(j[0].lat), lng = Number(j[0].lon)
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
      }
    }
  } catch { /* tenta o fallback */ }

  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`)
    if (r.ok) {
      const j = await r.json()
      const c = j.features?.[0]?.geometry?.coordinates
      if (c && Number.isFinite(c[1]) && Number.isFinite(c[0])) return { lat: c[1], lng: c[0] }
    }
  } catch { /* sem geocodificação */ }

  return null
}

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// --- Link de navegação no Google Maps ---

const MAX_PONTOS_MAPS = 10  // origem + 8 paradas + destino: o teto do Maps do consumidor

/** Rótulo gravado na partida quando ela vem do GPS do aparelho — não é endereço. */
export const PARTIDA_GPS = 'Minha localização'

// Rótulos que o próprio app grava em `partida_endereco` para descrever a
// largada na tela. Mandar isso ao Maps abriria uma busca por texto solto.
const ROTULO_INTERNO = new RegExp(`^(${PARTIDA_GPS}|centro da regi[ãa]o)`, 'i')

/** Ponto da rota levando o endereço textual, quando a base tem um de verdade. */
export interface PontoMaps extends Ponto {
  endereco?: string | null
  bairro?: string | null
  cidade?: string | null
}

/**
 * Como o ponto entra no link: endereço por extenso quando existe, "lat,lng" só
 * quando não existe.
 *
 * O app do Google Maps no iPhone não abria a rota montada só com coordenada —
 * com o endereço escrito, abre. E não se perde precisão trocando: a coordenada
 * da base saiu justamente do endereço, geocodificada. Onde não há rua de
 * verdade (metade da base traz o campo com o par de coordenadas ou um
 * placeholder), a coordenada segue sendo o único alvo — bairro e cidade
 * sozinhos cairiam no centro do bairro, não na porta do cliente.
 */
export function alvoMaps(p: PontoMaps): string {
  const rua = enderecoExibivel(p.endereco ?? null)
  if (!rua || ROTULO_INTERNO.test(rua)) return `${p.lat},${p.lng}`
  // Completa com bairro/cidade só o que a rua ainda não disser — a base traz os
  // dois formatos ("Rua 01 157" e "Rua 01 157, Boa Viagem, Recife"). A
  // comparação é por componente inteiro entre vírgulas, não por substring:
  // bairro "Recife Antigo" contém "Recife" sem ser a cidade.
  const partes = [rua]
  for (const extra of [p.bairro, p.cidade]) {
    const t = (extra ?? '').trim()
    const jaTem = partes.flatMap(x => x.split(',')).some(x => x.trim().toLowerCase() === t.toLowerCase())
    if (t && !jaTem) partes.push(t)
  }
  return partes.join(', ')
}

/**
 * Monta link(s) de direções do Google Maps para a sequência de pontos (partida →
 * paradas na ordem → chegada). Se passar de ~10 pontos, quebra em trechos com 1
 * ponto de sobreposição (o fim de um trecho é o começo do próximo), pra caber no
 * limite do Maps sem perder continuidade.
 *
 * Usa o formato oficial `dir/?api=1&origin=…&destination=…&waypoints=…`, e não o
 * caminho legado `dir/A/B/C`: o legado é URL da interface web e o app do Maps no
 * iPhone lia cada trecho como busca de texto — com coordenada crua não achava
 * nada e a rota não abria. O `api=1` é o formato que o Google documenta para
 * abrir no app em qualquer plataforma.
 */
export function linksGoogleMaps(pontos: PontoMaps[]): string[] {
  const validos = pontos.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (validos.length < 2) return []
  const links: string[] = []
  for (let i = 0; i < validos.length - 1; i += MAX_PONTOS_MAPS - 1) {
    const trecho = validos.slice(i, i + MAX_PONTOS_MAPS)
    if (trecho.length < 2) break
    const alvos = trecho.map(alvoMaps)
    const params = new URLSearchParams({
      api: '1',
      travelmode: 'driving',
      origin: alvos[0],
      destination: alvos[alvos.length - 1],
    })
    const paradas = alvos.slice(1, -1)
    if (paradas.length > 0) params.set('waypoints', paradas.join('|'))
    links.push(`https://www.google.com/maps/dir/?${params}`)
  }
  return links
}

// --- Otimização de rota via OSRM público (endpoint /trip resolve a ordem ótima) ---

export interface RotaOtimizada {
  /** Índices no array `stops` original, na ordem de visita ótima. */
  ordemStops: number[]
  distanciaKm: number
  tempoMin: number
}

/**
 * Ordena as paradas pela melhor sequência de visita, partindo de `partida`
 * (fixo) e, se houver, terminando em `chegada` (fixo). Usa o servidor OSRM
 * público — sem chave, CORS liberado. É demo, então serve para poucas dezenas
 * de paradas, não cargas pesadas.
 */
export async function otimizarRota(
  partida: Ponto,
  stops: Ponto[],
  chegada?: Ponto | null,
): Promise<RotaOtimizada> {
  const pontos: Ponto[] = [partida, ...stops, ...(chegada ? [chegada] : [])]
  const coords = pontos.map(p => `${p.lng},${p.lat}`).join(';')
  const params = new URLSearchParams({ source: 'first', roundtrip: 'false', overview: 'false' })
  if (chegada) params.set('destination', 'last')

  const res = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coords}?${params}`)
  const j = await res.json()
  if (j.code !== 'Ok' || !j.trips?.[0]) {
    throw new Error(j.message || 'Não foi possível gerar a rota (OSRM).')
  }

  // waypoints[i].waypoint_index = posição do ponto i na rota otimizada.
  const wp: number[] = j.waypoints.map((w: { waypoint_index: number }) => w.waypoint_index)
  const ordemStops = stops
    .map((_, i) => i)                          // índice no array stops
    .sort((a, b) => wp[a + 1] - wp[b + 1])     // +1 porque partida é o ponto 0
  const trip = j.trips[0]
  return { ordemStops, distanciaKm: trip.distance / 1000, tempoMin: trip.duration / 60 }
}
