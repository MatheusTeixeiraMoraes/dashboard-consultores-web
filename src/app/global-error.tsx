'use client' // Error boundary é obrigatoriamente Client Component.

import './globals.css'

/**
 * Última rede: pega o que quebrar no PRÓPRIO root layout (src/app/layout.tsx) —
 * fonte, metadata, viewport. Quase nunca dispara, e é exatamente por isso que
 * ela precisa existir: quando dispara, a alternativa é a tela de erro crua do
 * navegador com o app inteiro fora do ar.
 *
 * Este arquivo SUBSTITUI o root layout quando ativo, então precisa trazer os
 * próprios <html>/<body> e importar o globals.css na mão — nada do layout de
 * cima está disponível aqui.
 *
 * Sem `export const metadata`: global-error é Client Component e metadata não é
 * suportada. O título vai pelo componente <title> do React.
 */
export default function ErroGlobal({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full antialiased">
        <title>Erro — Inovva Group</title>
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="glass rounded-2xl border border-line p-10 text-center max-w-md">
            <p className="font-semibold text-ink">O aplicativo não conseguiu iniciar</p>
            <p className="text-sm text-ink-muted mt-1">
              Falha inesperada ao montar a página. Tentar de novo costuma
              resolver; se insistir, avise o suporte com o código abaixo.
            </p>

            {error.digest && (
              <p className="text-[11px] text-ink-faint mt-3 font-mono">código: {error.digest}</p>
            )}

            <button
              onClick={() => unstable_retry()}
              className="mt-6 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Tentar de novo
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
