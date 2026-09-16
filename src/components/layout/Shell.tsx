'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import SincronizarDemo from './SincronizarDemo'
import type { Profile } from '@/lib/types'

/**
 * Casca do dashboard: sidebar + topbar + conteúdo.
 *
 * Existe por causa do celular. A sidebar é `fixed w-60` (240px) e o conteúdo
 * vinha com `ml-60` fixo — num iPhone SE (375px) sobravam 135px de tela útil,
 * que é o que fazia o painel parecer sem suporte a mobile. A partir de `md` o
 * layout é o de sempre; abaixo disso a sidebar vira gaveta e o conteúdo ocupa
 * a largura inteira.
 *
 * O estado da gaveta mora aqui porque quem abre (botão na Topbar) e quem é
 * aberto (Sidebar) são irmãos — é o menor ancestral comum dos dois.
 */
export default function Shell({
  profile,
  demoAtivo = false,
  demoDisponivel = false,
  children,
}: {
  profile: Profile
  demoAtivo?: boolean
  demoDisponivel?: boolean
  children: React.ReactNode
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const fechar = useCallback(() => setMenuAberto(false), [])
  const pathname = usePathname()
  const mainRef = useRef<HTMLElement>(null)

  /* Quem rola é o `main` (overflow-auto), não o documento — html/body ficam
   * travados em height:100%. A restauração de rolagem do App Router age
   * sobre a JANELA, então não enxerga este contêiner: `main` é o MESMO nó
   * DOM em toda navegação dentro da casca (só `children` troca), e sem isto
   * a posição de rolagem da tela anterior atravessa pra tela nova — abrir
   * Agenda depois de descer uma lista longa em Clientes abria no meio, não
   * no topo. Confirmado ao vivo antes de corrigir (era bug de verdade). */
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])

  // Esc fecha, como todo menu modal.
  useEffect(() => {
    if (!menuAberto) return
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [menuAberto, fechar])

  // Trava a rolagem do fundo enquanto a gaveta está aberta (mobile) — sem
  // isto o corpo da página ainda balança/rola (bounce do iOS) atrás do véu.
  useEffect(() => {
    if (!menuAberto) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = anterior }
  }, [menuAberto])

  return (
    <div className="flex h-full">
      {/* Não desenha nada: só mantém esta aba honesta se o modo demo mudar
          noutra. */}
      <SincronizarDemo renderizadoComDemo={demoAtivo} habilitado={demoDisponivel} />

      <Sidebar
        role={profile.role}
        aberto={menuAberto}
        fechar={fechar}
        demoAtivo={demoAtivo}
        demoDisponivel={demoDisponivel}
      />

      {/* Véu: cobre o conteúdo enquanto a gaveta está aberta e fecha ao tocar
          fora. Só no mobile — no desktop a sidebar é parte do layout. */}
      {menuAberto && (
        <div onClick={fechar} aria-hidden className="fixed inset-0 bg-black/40 z-30 md:hidden" />
      )}

      <div className="flex-1 flex flex-col min-w-0 md:ml-60">
        <Topbar profile={profile} abrirMenu={() => setMenuAberto(true)} demoAtivo={demoAtivo} />
        <main ref={mainRef} className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
          {/* Reserva o espaço da faixa de delegação (BarraDelegacao publica a
              própria altura em --delegacao-h). Sem isto o último item da
              lista fica escondido atrás dela sempre que há delegação em
              curso. 0px quando não há faixa — sem efeito visual nenhum. */}
          <div aria-hidden style={{ height: 'var(--delegacao-h, 0px)' }} />
        </main>
      </div>
    </div>
  )
}
