import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : 'https://*.supabase.co'

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://server.arcgisonline.com",
  "font-src 'self'",
  `connect-src 'self' ${supabase} https://nominatim.openstreetmap.org https://photon.komoot.io https://router.project-osrm.org${isDev ? ' ws: wss: http://localhost:* http://127.0.0.1:*' : ''}`,
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const nextConfig: NextConfig = {
  // Deixa de anunciar "Next.js" em toda resposta.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Manda só a origem para Nominatim/OSRM — nunca o caminho, que pode
          // levar id de cliente para dentro do log de um terceiro.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // `geolocation=(self)` e não `()`: o Radar e o Roteirizar usam GPS.
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
          // Sem `preload`: entrar na lista de preload é praticamente irreversível.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
}

export default nextConfig
