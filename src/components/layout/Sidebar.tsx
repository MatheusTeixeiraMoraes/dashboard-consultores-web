'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'Visão Geral', icon: '🏆' },
  { href: '/dashboard/area', label: 'Por Área', icon: '📊' },
  { href: '/dashboard/consultor', label: 'Consultor', icon: '👤' },
  { href: '/dashboard/comparar', label: 'Comparar Datas', icon: '📅' },
  { href: '/dashboard/upload', label: 'Upar Planilha', icon: '⬆' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-[#14141a] text-white flex flex-col z-40">
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <div>
            <p className="text-sm font-semibold leading-tight">Dashboard</p>
            <p className="text-xs text-gray-400 leading-tight">Consultores MP</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#3b82f6] text-white'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-[10px] text-gray-500 text-center">Mercado Pago © 2025</p>
      </div>
    </aside>
  )
}
