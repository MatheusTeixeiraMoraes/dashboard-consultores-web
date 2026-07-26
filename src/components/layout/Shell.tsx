'use client'

import { useState, useEffect, useCallback } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { definirDemoNoNavegador } from '@/lib/demo/flag-navegador'
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

  // Repassa ao navegador o veredito do servidor sobre o modo demo, para o
  // `createClient()` do lado do cliente saber a quem perguntar. É feito no
  // corpo do render (e não num efeito) porque este é o ancestral de todas as
  // telas: quando o efeito de qualquer uma delas rodar, o valor já está lá.
  // Idempotente — reexecutar não muda nada.
  definirDemoNoNavegador(demoAtivo)

  // Esc fecha, como todo menu modal.
  useEffect(() => {
    if (!menuAberto) return
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [menuAberto, fechar])

  return (
    <div className="flex h-full">
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
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
