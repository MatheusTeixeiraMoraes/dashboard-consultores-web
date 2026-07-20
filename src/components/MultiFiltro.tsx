'use client'

import { useState, useEffect, useMemo, useRef } from 'react'

const IconChevron = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

/**
 * Filtro de múltipla escolha. Nenhum selecionado = sem filtro (mostra tudo),
 * que é o padrão esperado e evita o estado "zero resultados" ao abrir.
 * Tem busca interna porque a lista de bairros passa de 800 opções.
 *
 * Usado no Roteirizar e em Clientes — as duas telas filtram a mesma carteira
 * pelos mesmos eixos, então o componente mora aqui e não dentro de uma tela.
 */
export default function MultiFiltro({ label, opcoes, sel, onChange }: {
  label: string
  opcoes: string[]
  sel: Set<string>
  onChange: (s: Set<string>) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? opcoes.filter(o => o.toLowerCase().includes(q)) : opcoes
  }, [opcoes, busca])

  function alternar(o: string) {
    const s = new Set(sel)
    if (s.has(o)) s.delete(o); else s.add(o)
    onChange(s)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto(a => !a)}
        className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
          sel.size > 0
            ? 'border-primary/60 bg-primary/15 text-ink'
            : 'border-field-line bg-field text-ink-muted hover:text-ink'
        }`}
      >
        {label}
        {sel.size > 0 && (
          <span className="bg-primary text-white text-[10px] font-bold rounded-full px-1.5 min-w-[17px] text-center">{sel.size}</span>
        )}
        <IconChevron />
      </button>

      {/* Desktop: painel ancorado à direita — estes filtros ficam na borda
          direita da toolbar e, abrindo para a esquerda, não estouram a tela.
          Celular: vira folha inferior. Qualquer ancoragem brigaria com a
          posição do chip (ancorado à direita ele saía pela esquerda; à
          esquerda, sairia pela direita), e o polegar alcança o rodapé melhor
          que o meio da tela. */}
      {aberto && (
        <div className="glass-blur border border-line shadow-2xl overflow-hidden
          fixed inset-x-3 bottom-3 z-50 rounded-2xl pb-[env(safe-area-inset-bottom)]
          md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:mt-1.5 md:w-64 md:z-40 md:rounded-xl md:pb-0">
          {opcoes.length > 8 && (
            <input
              autoFocus value={busca} onChange={e => setBusca(e.target.value)}
              placeholder={`Buscar ${label.toLowerCase()}…`}
              className="w-full bg-transparent border-b border-line px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none"
            />
          )}
          {/* py-2.5 no celular: alvo de toque de ~40px. Com py-1.5 o dedo erra
              a opção e marca a de cima. */}
          <div className="max-h-[45vh] md:max-h-56 overflow-y-auto py-1">
            {lista.length === 0 ? (
              <p className="text-xs text-ink-faint text-center py-3">Nada encontrado</p>
            ) : lista.map(o => (
              <label key={o} className="flex items-center gap-2.5 px-3 py-2.5 md:py-1.5 text-sm md:text-xs text-ink-dim hover:bg-card-2 cursor-pointer">
                <input type="checkbox" checked={sel.has(o)} onChange={() => alternar(o)} className="accent-primary w-4 h-4 md:w-3.5 md:h-3.5 flex-shrink-0" />
                <span className="truncate min-w-0">{o}</span>
              </label>
            ))}
          </div>
          {sel.size > 0 && (
            <button onClick={() => onChange(new Set())} className="w-full border-t border-line px-3 py-2 text-xs text-ink-muted hover:text-ink">
              Limpar {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
