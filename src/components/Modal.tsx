'use client'

import { useEffect, useRef } from 'react'

// Mapeia pros max-w-* que os 6 modais que existiam antes já usavam — nenhum
// precisou de largura fora deste conjunto.
const MAX_W = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl' } as const

interface ModalProps {
  aberto: boolean
  aoFechar: () => void
  /** Título simples — vira o cabeçalho padrão (título + X). Ignorado se
   * `cabecalho` for passado. */
  titulo?: string
  subtitulo?: string
  /** Cabeçalho por inteiro, pra quando título+X não bastam (ex.: avatar,
   * botões extras ao lado do X). Substitui o cabeçalho padrão — quem
   * fornece cuida do próprio botão de fechar. */
  cabecalho?: React.ReactNode
  maxWidth?: keyof typeof MAX_W
  /** Fecha ao clicar fora do painel. Default true — era o comportamento de
   * 4 dos 6 modais antigos; os 2 de Usuários que não fechavam assim viram
   * exceção explícita, não silenciosa. */
  fecharAoClicarFora?: boolean
  children: React.ReactNode
}

/**
 * Modal único do app, em cima do <dialog> nativo.
 *
 * POR QUE <dialog> E NÃO UM <div fixed> COM CLASSE COPIADA (o que os 6
 * modais anteriores faziam, cada um com uma pequena diferença):
 *
 * O navegador já entrega de graça, quando aberto via showModal(): fecha com
 * Escape, prende o foco dentro enquanto aberto, devolve o foco a quem abriu,
 * expõe role="dialog"/aria-modal corretos, e torna o resto do documento
 * inert (então nem toque nem scroll vazam pro fundo) — sem uma linha de JS
 * nossa pra nada disso. E o <dialog> renderiza no "top layer" do navegador,
 * acima de qualquer z-index que a casca já usa (sidebar, barra de
 * delegação, barra de ação fixa), então não compete com nenhum deles.
 *
 * O que o navegador NÃO dá de graça: o reset visual (zerado abaixo) e
 * "fechar clicando fora", que é o clique cujo target é o próprio <dialog> —
 * clicar no painel nunca bate essa condição porque o alvo vira um
 * descendente; é o mesmo idioma documentado pela MDN pra backdrop de
 * <dialog>.
 *
 * showModal()/close() são IMPERATIVOS: só alternar o atributo `open` via
 * JSX abre um <dialog> comum, sem backdrop, sem foco preso e sem top layer.
 */
export default function Modal({
  aberto, aoFechar, titulo, subtitulo, cabecalho, maxWidth = 'md', fecharAoClicarFora = true, children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (aberto && !dialog.open) dialog.showModal()
    if (!aberto && dialog.open) dialog.close()
  }, [aberto])

  // Escape dispara 'cancel' e o navegador fecha sozinho (ação padrão do
  // evento) — o 'close' que vem em seguida é o único aviso que precisamos
  // repassar pro React, senão `aberto` continua true e a próxima abertura
  // não faz nada (o <dialog> já estaria open).
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const aoFecharNativo = () => aoFechar()
    dialog.addEventListener('close', aoFecharNativo)
    return () => dialog.removeEventListener('close', aoFecharNativo)
  }, [aoFechar])

  // Reforço pro bounce do iOS (scroll elástico da página inteira, que não
  // depende de nenhum elemento ter overflow) — mesmo padrão já usado na
  // gaveta do menu (Shell.tsx, Sessão 03). O ::backdrop já bloqueia clique e
  // touch normal; isto é só rede de segurança.
  useEffect(() => {
    if (!aberto) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = anterior }
  }, [aberto])

  return (
    <dialog
      ref={ref}
      onClick={e => { if (fecharAoClicarFora && e.target === ref.current) aoFechar() }}
      className={`fixed inset-0 m-auto p-0 border-0 backdrop:bg-black/40 glass-blur rounded-2xl shadow-xl w-full ${MAX_W[maxWidth]} max-h-[85dvh] flex flex-col`}
    >
      {cabecalho ?? (
        <div className="px-6 py-5 border-b border-line flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">{titulo}</h2>
            {subtitulo && <p className="text-xs text-ink-muted mt-0.5">{subtitulo}</p>}
          </div>
          <button onClick={aoFechar} aria-label="Fechar" className="text-ink-faint hover:text-ink-dim transition-colors flex-shrink-0 ml-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
      <div className="overflow-y-auto min-h-0 flex-1">{children}</div>
    </dialog>
  )
}
