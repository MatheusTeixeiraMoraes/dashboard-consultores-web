import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Dashboard de Performance — Consultores',
  description: 'Acompanhamento de performance dos consultores Mercado Pago',
}

/**
 * Sem isto, o celular finge ter 980px de largura e encolhe a página inteira —
 * era por isso que o dashboard aparecia minúsculo no Android/iPhone. É a
 * primeira peça: nenhum breakpoint do Tailwind vale nada enquanto o navegador
 * mente sobre a largura da tela.
 *
 * `viewportFit: 'cover'` deixa o app pintar atrás do notch/ilha do iPhone; o
 * respiro volta pelo safe-area-inset no globals.css.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#E4EBFA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.className} h-full`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
