'use client'

import { useState, useTransition } from 'react'
import { alternarModoDemo } from '@/lib/demo/acoes'

/**
 * Liga/desliga os dados de demonstração. Só aparece para admin.
 *
 * Recarrega a página inteira depois de alternar, em vez de `router.refresh()`.
 * O motivo é concreto: o aviso de "estou em demo" que o `createClient()` do
 * navegador consulta mora numa variável de módulo, preenchida pelo layout. Um
 * refresh de rota atualiza a árvore React mas não garante a ordem em que os
 * módulos já carregados enxergam o novo valor, e uma tela meio-demo/meio-real
 * durante a gravação seria pior do que esperar meio segundo.
 */
export default function BotaoDemo({ ativo }: { ativo: boolean }) {
  const [pendente, iniciarTransicao] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function alternar() {
    setErro(null)
    iniciarTransicao(async () => {
      const r = await alternarModoDemo(!ativo)
      if (!r.ok) {
        setErro(r.erro ?? 'Não foi possível alternar o modo demonstração.')
        return
      }
      window.location.reload()
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={alternar}
        disabled={pendente}
        aria-pressed={ativo}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60 ${
          ativo
            ? 'bg-warn-bg text-warn border border-warn/30'
            : 'text-ink-muted hover:bg-card-2 hover:text-ink border border-transparent'
        }`}
      >
        <span className={ativo ? 'text-warn' : 'text-ink-faint'}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </span>
        <span className="flex-1 text-left leading-tight">
          {pendente ? 'Trocando…' : ativo ? 'Demonstração ativa' : 'Dados demo'}
        </span>
        {ativo && !pendente && <span className="text-[10px] font-bold uppercase tracking-wide">Sair</span>}
      </button>

      {ativo && (
        <p className="text-[10px] leading-snug text-ink-faint px-1">
          Dados fictícios. A operação real está escondida e nada é gravado no banco.
        </p>
      )}

      {erro && <p className="text-[11px] leading-snug text-bad px-1">{erro}</p>}
    </div>
  )
}
