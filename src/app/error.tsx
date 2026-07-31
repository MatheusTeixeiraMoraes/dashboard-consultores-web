'use client' // Error boundary é obrigatoriamente Client Component.

import { useEffect } from 'react'

/**
 * Rede acima da casca — a que faltava.
 *
 * `src/app/(dashboard)/dashboard/error.tsx` cobre as telas, mas NÃO cobre o
 * `src/app/(dashboard)/layout.tsx`, porque error.js nunca envolve o layout do
 * seu próprio segmento nem os de cima. E é justamente lá que roda o caminho de
 * rede mais frequente do app: `getProfile()` -> `perfilReal()` -> `getUser()` +
 * `profiles`. Quando esse caminho falha (e agora ele LANÇA em vez de fingir que
 * não há sessão), sem este arquivo a resposta era 500 em branco.
 *
 * `(dashboard)` é route group: não vira segmento de URL, mas VIRA segmento de
 * boundary — então este error.tsx fica acima daquele layout e o aparência.
 *
 * Aqui não dá para reaproveitar o Shell (ele está justamente no layout que
 * quebrou), então a tela é autossuficiente. O root layout continua aplicado:
 * fontes, globals.css e <body> vêm dele.
 */
export default function ErroRaiz({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[raiz] erro fora da casca:', error)
  }, [error])

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="glass rounded-2xl border border-line p-10 text-center max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-bad-bg flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <p className="font-semibold text-ink">Alguma coisa falhou aqui</p>
        <p className="text-sm text-ink-muted mt-1">
          Não foi possível falar com o servidor agora. Você continua logado —
          isto não desfez nada.
        </p>

        {/* Sem o texto do erro: pode carregar detalhe de banco. O digest casa
            com a linha correspondente no log do servidor. */}
        {error.digest && (
          <p className="text-[11px] text-ink-faint mt-3 font-mono">código: {error.digest}</p>
        )}

        <button
          onClick={() => unstable_retry()}
          className="mt-6 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
        >
          Tentar de novo
        </button>
      </div>
    </main>
  )
}
