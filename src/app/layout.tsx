import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Dashboard de Performance — Consultores',
  description: 'Acompanhamento de performance dos consultores Mercado Pago',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.className} h-full`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
