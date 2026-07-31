'use client' // Error boundary é obrigatoriamente Client Component.

import { useEffect } from 'react'

/**
 * Rede de segurança das 20 telas de /dashboard.
 *
 * Por que ela precisa existir: `buscarTudo` (src/lib/supabase/buscar-tudo.ts:45)
 * lança exceção de propósito — engolir o erro e devolver lista vazia faria a
 * tela dizer "Nenhum cliente ainda" quando o banco só falhou, que é mentira
 * pior que um erro na cara. Só que, sem NENHUM error.tsx no app, esse throw
 * correto subia até o topo e virava 500 em branco. O throw estava certo; faltava
 * quem o aparasse.
 *
 * Fica em `dashboard/` e não em `(dashboard)/`: o error.js NÃO envolve o layout
 * do próprio segmento, então daqui o `Shell` (montado em
 * src/app/(dashboard)/layout.tsx) continua de pé — o usuário mantém sidebar e
 * topbar e navega para outra tela em vez de ficar preso numa página órfã.
 */
export default function ErroDashboard({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    // Vai para o log do servidor/Vercel, não para a tela.
    console.error('[dashboard] erro na tela:', error)
  }, [error])

  return (
    <div className="glass rounded-2xl border border-line p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-bad-bg flex items-center justify-center mx-auto mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      <p className="font-semibold text-ink">Não consegui carregar esta tela</p>
      <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
        Quase sempre é instabilidade momentânea na conexão com o banco. Seus
        dados estão intactos — nada foi perdido.
      </p>

      {/* Texto do erro NUNCA vai para a tela: a mensagem do buscarTudo carrega o
          retorno cru do PostgREST (nome de tabela, de coluna, dica de policy).
          O digest é o que o suporte usa para achar a linha no log do servidor. */}
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
  )
}
