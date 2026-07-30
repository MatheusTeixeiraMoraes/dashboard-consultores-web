import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

/**
 * A imagem de compartilhamento (`opengraph-image.png`, convenção de arquivo do
 * Next) precisa virar URL absoluta. Sem uma base, o Next monta em cima de
 * `localhost` e o link colado no WhatsApp/Slack não abre imagem nenhuma.
 * Lê do ambiente em vez de fixar domínio: a Vercel injeta `VERCEL_URL` sozinha
 * em cada deploy, e `NEXT_PUBLIC_SITE_URL` cobre o domínio próprio quando houver.
 */
const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: 'Inovva Group — Dashboard de Consultores',
  description: 'Desempenho, carteira e roteirização dos consultores da Inovva Group',
  applicationName: 'Inovva Group',
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
  /* Pinta a barra do navegador no celular com o fundo do app (--color-bg).
     Tem que andar junto com o token: se um mudar sozinho, aparece um risco de
     cor diferente entre a barra e o topo da página. */
  themeColor: '#E3EFF3',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.className} h-full`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
