import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

/**
 * Host do Supabase, tirado do MESMO env que o app usa (lido no build).
 *
 * O fallback é largo de propósito: se a variável faltar no build da Vercel, uma
 * CSP frouxa é muito melhor que um app 100% quebrado — sem este host em
 * `connect-src`, login, refresh de sessão e todas as telas param de funcionar.
 */
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : 'https://*.supabase.co'

/**
 * Os hosts abaixo não são chute: foram levantados lendo o código.
 *   - tiles do Radar: Esri (satélite) e CARTO (mapa claro; o `{s}` do Leaflet
 *     expande para a/b/c/d, daí o curinga);
 *   - geocodificação e rota: Nominatim, Photon e OSRM — todos chamados do
 *     NAVEGADOR, então entram em connect-src;
 *   - fontes: nenhuma. `next/font` baixa a Geist no build e auto-hospeda, então
 *     `font-src 'self'` basta;
 *   - imagens: só as nossas, em /public.
 *
 * Os dois `'unsafe-inline'` são obrigatórios aqui, não preguiça:
 *   - script: o App Router inlina o payload RSC. Tirar exige nonce via proxy,
 *     que força render dinâmico no app inteiro e mata cache de CDN;
 *   - style: o popup do Radar é montado com innerHTML cheio de style="".
 *     Sem isso o card do cliente perde toda a formatação.
 */
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
          // frame-ancestors acima é o que os browsers atuais honram; este fica
          // por compatibilidade com scanner e navegador antigo.
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
