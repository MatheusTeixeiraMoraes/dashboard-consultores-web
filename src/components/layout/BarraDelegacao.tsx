'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { voltarParaMinhaConta } from '@/app/(dashboard)/dashboard/usuarios/delegacao'
import { delegacaoNoCookie } from '@/lib/delegacao'

/**
 * Faixa fixa no topo enquanto a gestão está dentro da conta de outra pessoa.
 *
 * Chamativa de propósito, e o texto diz o que importa: a escrita está LIBERADA,
 * então o que for feito aqui fica gravado no banco como sendo do consultor.
 * Quem esquece que está delegado edita achando que está na própria conta.
 */
export default function BarraDelegacao({ adminNome, alvoNome, registroId }: {
  adminNome: string
  alvoNome: string
  registroId: string
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  /* Conserta a divergência entre abas.
   *
   * O layout do App Router NÃO re-renderiza em navegação client-side, e os
   * cookies de sessão valem para o navegador inteiro. Então: aba A aberta como
   * admin; na aba B a gestão entra na conta de alguém; a aba A passa a falar
   * com o banco COMO o consultor, mas continua sem a barra — some justamente o
   * aviso de "você não está na sua conta". O caminho inverso é pior ainda: a
   * aba onde se voltou fica exibindo a barra de uma delegação que já acabou.
   *
   * É o mesmo bug que `lib/demo/cookie.ts` documenta ter acontecido aqui antes,
   * e o remédio é o mesmo: comparar com o cookie na hora, que é a fonte que o
   * servidor usa. `router.refresh()` só dispara quando eles divergem, então não
   * há laço de recarga. */
  useEffect(() => {
    const conferir = () => {
      if (delegacaoNoCookie() !== registroId) router.refresh()
    }
    conferir()
    document.addEventListener('visibilitychange', conferir)
    return () => document.removeEventListener('visibilitychange', conferir)
  }, [registroId, router])

  /* Fixa no RODAPÉ, não no topo: a sidebar é `fixed top-0 h-full z-40`, então
     uma faixa no topo passaria por baixo dela ou cobriria o bloco da marca.
     Embaixo não disputa espaço com nada, continua visível em qualquer rolagem
     e o safe-area cobre o gesto de home do iPhone. */
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-warn-fill text-white px-4 py-2 flex items-center justify-between gap-3 flex-wrap shadow-[0_-4px_16px_rgba(0,0,0,0.2)]"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
        </svg>
        <p className="text-xs font-semibold truncate">
          {adminNome}, você está na conta de <span className="underline">{alvoNome}</span>
          <span className="font-normal"> — o que você editar fica no nome dela.</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        {erro && <span className="text-[11px]">{erro}</span>}
        <button
          onClick={() => iniciar(async () => {
            const r = await voltarParaMinhaConta()
            if (r && !r.ok) setErro(r.error ?? 'Falha ao voltar')
          })}
          disabled={pendente}
          className="text-xs font-bold bg-white/25 hover:bg-white/35 disabled:opacity-60 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
        >
          {pendente ? 'Voltando...' : 'Voltar para minha conta'}
        </button>
      </div>
    </div>
  )
}
