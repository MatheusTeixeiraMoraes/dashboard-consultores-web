import { NextResponse } from 'next/server'
import { perfilAutorizado } from '@/lib/demo/estado'
import { coordenadaNoTexto, type Ponto } from '@/lib/geo'

/**
 * Proxy de geocodificação — existe pra chave do LocationIQ nunca chegar no
 * bundle do cliente. Ordem: atalho de coordenada no texto (grátis, sem rede)
 * → LocationIQ (chave, sem o 1 req/s do Nominatim) → Nominatim → Photon
 * (públicos, reserva se a chave faltar ou falhar).
 */
export async function POST(request: Request) {
  try {
    const me = await perfilAutorizado()
    if (!me) return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })

    const { endereco } = (await request.json()) as { endereco?: string }
    const q = (endereco ?? '').trim()
    if (!q) return NextResponse.json({ ok: true, ponto: null })

    const direta = coordenadaNoTexto(q)
    if (direta) return NextResponse.json({ ok: true, ponto: direta })

    const chave = process.env.LOCATIONIQ_API_KEY
    if (chave) {
      const p = await buscarNominatimCompativel(
        `https://us1.locationiq.com/v1/search?key=${chave}&format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`,
      )
      if (p) return NextResponse.json({ ok: true, ponto: p })
    }

    const nominatim = await buscarNominatimCompativel(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`,
    )
    if (nominatim) return NextResponse.json({ ok: true, ponto: nominatim })

    const photon = await buscarPhoton(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`)
    if (photon) return NextResponse.json({ ok: true, ponto: photon })

    return NextResponse.json({ ok: true, ponto: null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

/** LocationIQ e Nominatim respondem no mesmo formato ([{ lat, lon }, ...]). */
async function buscarNominatimCompativel(url: string): Promise<Ponto | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const j = await r.json()
    if (!j[0]) return null
    const lat = Number(j[0].lat), lng = Number(j[0].lon)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

async function buscarPhoton(url: string): Promise<Ponto | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const j = await r.json()
    const c = j.features?.[0]?.geometry?.coordinates
    return c && Number.isFinite(c[1]) && Number.isFinite(c[0]) ? { lat: c[1], lng: c[0] } : null
  } catch {
    return null
  }
}
