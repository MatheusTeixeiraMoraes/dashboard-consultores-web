'use client'

import Image from 'next/image'
import { useState } from 'react'
import { loginAction } from './actions'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await loginAction(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Aqui a logo COMPLETA (com o nome), não só o símbolo: é a única tela
            que alguém de fora vê, então carrega o alt de verdade e faz o papel
            de título da marca — o h1 abaixo diz o que o produto é. */}
        <div className="text-center mb-8">
          <Image
            src="/inovva-logo.png"
            alt="Inovva Group"
            width={716}
            height={400}
            priority
            className="w-52 h-auto mx-auto mb-4"
          />
          <h1 className="text-xl font-bold text-ink">Dashboard de Consultores</h1>
          <p className="text-sm text-ink-muted mt-1">Desempenho, carteira e rotas</p>
        </div>

        <div className="glass rounded-2xl p-7 border border-line">
          {/* Mesma faixa da sidebar, encaixada na borda do card: as margens
              negativas cancelam o p-7 para ela encostar no canto arredondado. */}
          <div className="-mx-7 -mt-7 mb-6 h-1.5 rounded-t-2xl bg-linear-to-r from-marca-1 via-marca-2 to-marca-3" />
          <h2 className="text-base font-semibold text-ink mb-5">Entrar na sua conta</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5" htmlFor="email">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full bg-field border border-field-line rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5" htmlFor="password">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full bg-field border border-field-line rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-bad bg-bad/10 border border-bad/20 rounded-xl px-3.5 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-dk disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors mt-2"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-ink-faint mt-6">Inovva Group © 2026</p>
      </div>
    </div>
  )
}
