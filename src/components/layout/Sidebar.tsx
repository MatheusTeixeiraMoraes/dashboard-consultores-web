'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/lib/types'
import { canUpload } from '@/lib/types'

interface NavItem {
  href: string
  label: string
  roles: UserRole[]
  icon: React.ReactNode
}

const IconGrid = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
)
const IconBars = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)
const IconUser = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)
const IconActivity = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)
const IconUpload = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)
const IconSettings = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
const IconUsers = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const IconClock = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
)
const IconAlert = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const NAV: NavItem[] = [
  { href: '/dashboard',           label: 'Visão Geral',    roles: ['admin','dono','lider'],        icon: <IconGrid /> },
  { href: '/dashboard/area',      label: 'Por Área',       roles: ['admin','dono','lider'],        icon: <IconBars /> },
  { href: '/dashboard/consultor', label: 'Consultor',      roles: ['admin','dono','lider'],        icon: <IconUser /> },
  { href: '/dashboard/comparar',  label: 'Comparar Datas', roles: ['admin','dono','lider'],        icon: <IconActivity /> },
  { href: '/dashboard/alertas',   label: 'Alertas',        roles: ['admin','dono','lider'],        icon: <IconAlert /> },
  { href: '/dashboard/meu-score', label: 'Meu Desempenho', roles: ['consultor'],                   icon: <IconActivity /> },
  { href: '/dashboard/comparar',  label: 'Comparar Datas', roles: ['consultor'],                   icon: <IconActivity /> },
  { href: '/dashboard/upload',    label: 'Upar Planilha',    roles: ['admin','dono'],              icon: <IconUpload /> },
  { href: '/dashboard/historico', label: 'Histórico',        roles: ['admin','dono'],              icon: <IconClock /> },
  { href: '/dashboard/metas',     label: 'Configurar Metas', roles: ['admin','dono'],              icon: <IconSettings /> },
  { href: '/dashboard/usuarios',  label: 'Usuários',         roles: ['admin','dono'],              icon: <IconUsers /> },
]

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  dono: 'Dono',
  lider: 'Líder',
  consultor: 'Consultor',
}

const ROLE_COLOR: Record<UserRole, string> = {
  admin:     'bg-purple-500',
  dono:      'bg-[#10B981]',
  lider:     'bg-[#3B82F6]',
  consultor: 'bg-gray-500',
}

export default function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const visible = NAV.filter(item => item.roles.includes(role))

  const adminItems = visible.filter(i => i.href === '/dashboard/upload' || i.href === '/dashboard/historico' || i.href === '/dashboard/metas' || i.href === '/dashboard/usuarios')
  const mainItems = visible.filter(i => !adminItems.includes(i))

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#111827] flex flex-col z-40 border-r border-white/5">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#10B981] flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">Dashboard</p>
            <p className="text-[11px] text-gray-500 leading-tight">Consultores MP</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {mainItems.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-3 mb-2">
              {role === 'consultor' ? 'Minha Performance' : 'Painel'}
            </p>
            {mainItems.map(({ href, label, icon }) => {
              const active = pathname === href
              return (
                <Link key={href} href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? 'bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className={active ? 'text-white' : 'text-gray-500'}>{icon}</span>
                  {label}
                </Link>
              )
            })}
          </div>
        )}

        {adminItems.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-3 mb-2">Administração</p>
            {adminItems.map(({ href, label, icon }) => {
              const active = pathname === href
              return (
                <Link key={href} href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? 'bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className={active ? 'text-white' : 'text-gray-500'}>{icon}</span>
                  {label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Role badge */}
      <div className="px-4 py-4 border-t border-white/5">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${ROLE_COLOR[role]}`} />
          <p className="text-[11px] text-gray-400">{ROLE_LABEL[role]}</p>
        </div>
      </div>
    </aside>
  )
}
