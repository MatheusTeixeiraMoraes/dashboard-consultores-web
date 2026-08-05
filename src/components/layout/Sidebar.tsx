'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BotaoDemo from './BotaoDemo'
import type { UserRole } from '@/lib/types'

// Seções do menu, na ordem de exibição. Cada uma agrupa um domínio do produto:
// Desempenho = planilhas de pontuação; Carteira = Planilha Ação Oportunidades;
// Campo = trabalho de rua (mapa, rotas, agenda).
// "Rota Inter/Hexa Recife" é TEMPORÁRIA e por isso tem bloco próprio em vez de
// entrar em Campo: quando a ação acabar, some a seção inteira daqui e a pasta
// src/app/(dashboard)/dashboard/hexa-recife — sem deixar item órfão no meio de
// um menu permanente. Ver supabase/migrations/2026-08-04_rota_inter_hexa_recife.sql.
const SECOES = ['Desempenho', 'Carteira', 'Campo', 'Rota Inter/Hexa Recife', 'Administração'] as const
type Secao = (typeof SECOES)[number]

interface NavItem {
  href: string
  label: string
  roles: UserRole[]
  secao: Secao
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
const IconPin = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
)
const IconRadar = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="10" />
  </svg>
)
const IconRoute = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="M9 19h6a4 4 0 0 0 4-4V9M15 5H9a4 4 0 0 0-4 4v6" />
  </svg>
)

const IconCampanha = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
)

const IconQueda = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" />
  </svg>
)

const IconCarteira = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><path d="M2 13h20" />
  </svg>
)

const NAV: NavItem[] = [
  // Desempenho — score das planilhas de pontuação
  { href: '/dashboard',           label: 'Visão Geral',    roles: ['admin','dono','lider','consultor'], secao: 'Desempenho', icon: <IconGrid /> },
  { href: '/dashboard/meu-score', label: 'Meu Desempenho', roles: ['consultor'],                   secao: 'Desempenho', icon: <IconActivity /> },
  { href: '/dashboard/area',      label: 'Por Área',       roles: ['admin','dono','lider'],        secao: 'Desempenho', icon: <IconBars /> },
  { href: '/dashboard/consultor', label: 'Consultor',      roles: ['admin','dono','lider'],        secao: 'Desempenho', icon: <IconUser /> },
  { href: '/dashboard/comparar',  label: 'Comparar Datas', roles: ['admin','dono','lider','consultor'], secao: 'Desempenho', icon: <IconActivity /> },
  { href: '/dashboard/alertas',   label: 'Alertas',        roles: ['admin','dono','lider'],        secao: 'Desempenho', icon: <IconAlert /> },
  // Carteira — clientes da Planilha Ação Oportunidades
  { href: '/dashboard/clientes',  label: 'Clientes',       roles: ['admin','dono','lider','consultor'], secao: 'Carteira', icon: <IconPin /> },
  { href: '/dashboard/acionaveis', label: 'Acionáveis',      roles: ['admin','dono','lider','consultor'], secao: 'Carteira', icon: <IconCampanha /> },
  { href: '/dashboard/queda-tpv', label: 'Queda de TPV',   roles: ['admin','dono','lider','consultor'], secao: 'Carteira', icon: <IconQueda /> },
  { href: '/dashboard/carteira',  label: 'Carteira',          roles: ['admin','dono','lider'],       secao: 'Carteira', icon: <IconCarteira /> },
  // Campo — trabalho de rua
  { href: '/dashboard/radar',     label: 'Radar',          roles: ['admin','dono','lider','consultor'], secao: 'Campo', icon: <IconRadar /> },
  { href: '/dashboard/roteirizar',label: 'Roteirizar',     roles: ['admin','dono','lider','consultor'], secao: 'Campo', icon: <IconRoute /> },
  { href: '/dashboard/agenda',    label: 'Agenda',         roles: ['admin','dono','lider','consultor'], secao: 'Campo', icon: <IconClock /> },
  // Rota Inter/Hexa Recife — categoria temporária, SÓ admin e dono (decisão do
  // dono em 05/08). Nem líder, ao contrário das outras telas de carteira. Quem
  // fecha de verdade é a RLS (2026-08-05_hexa_recife_so_admin_e_dono.sql); esta
  // lista só evita mostrar um item que levaria a uma tela vazia.
  { href: '/dashboard/hexa-recife',            label: 'Painel',     roles: ['admin','dono'], secao: 'Rota Inter/Hexa Recife', icon: <IconPin /> },
  { href: '/dashboard/hexa-recife/roteirizar', label: 'Roteirizar', roles: ['admin','dono'], secao: 'Rota Inter/Hexa Recife', icon: <IconRoute /> },
  // Administração
  { href: '/dashboard/upload',    label: 'Upar Planilha',    roles: ['admin','dono'],              secao: 'Administração', icon: <IconUpload /> },
  { href: '/dashboard/historico', label: 'Histórico',        roles: ['admin','dono'],              secao: 'Administração', icon: <IconClock /> },
  { href: '/dashboard/metas',     label: 'Configurar Metas', roles: ['admin','dono'],              secao: 'Administração', icon: <IconSettings /> },
  { href: '/dashboard/usuarios',  label: 'Usuários',         roles: ['admin','dono'],              secao: 'Administração', icon: <IconUsers /> },
]

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  dono: 'Dono',
  lider: 'Líder',
  consultor: 'Consultor',
}

const ROLE_COLOR: Record<UserRole, string> = {
  admin:     'bg-purple-500',
  dono:      'bg-good',
  lider:     'bg-primary',
  consultor: 'bg-gray-500',
}

/**
 * `aberto`/`fechar` só valem abaixo de `md`, onde a sidebar é gaveta. Do `md`
 * pra cima ela é fixa e ignora os dois (o `md:translate-x-0` sempre vence).
 */
export default function Sidebar({
  role,
  aberto = false,
  fechar,
  demoAtivo = false,
  demoDisponivel = false,
}: {
  role: UserRole
  aberto?: boolean
  fechar?: () => void
  /** Dados de demonstração no ar. */
  demoAtivo?: boolean
  /** Se este usuário pode alternar — só admin, decidido no servidor. */
  demoDisponivel?: boolean
}) {
  const pathname = usePathname()
  const visible = NAV.filter(item => item.roles.includes(role))

  return (
    <aside
      className={`fixed left-0 top-0 h-full w-60 bg-shell backdrop-blur-xl flex flex-col z-40 border-r border-line
        transition-transform duration-200 ease-out md:translate-x-0
        ${aberto ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
    >
      {/* Assinatura da marca: o gradiente do chevron atravessando o topo. É a
          única superfície do app pintada com as cores cruas da logo — cabe
          porque não tem texto em cima (nenhuma delas passa em contraste). */}
      <div className="h-[3px] bg-linear-to-r from-marca-1 via-marca-2 to-marca-3" />

      {/* Marca. O símbolo entra como imagem e o nome como texto ao lado, então
          a imagem é decorativa (alt vazio) — com alt="Inovva Group" o leitor de
          tela anunciaria a marca duas vezes seguidas. */}
      <div className="px-5 py-5 border-b border-line">
        <div className="flex items-center gap-3">
          <Image
            src="/inovva-simbolo.png"
            alt=""
            width={64}
            height={64}
            priority
            className="w-8 h-8 flex-shrink-0"
          />
          <div>
            <p className="text-sm font-semibold text-ink leading-tight">Inovva Group</p>
            <p className="text-[11px] text-ink-faint leading-tight">Dashboard</p>
          </div>
        </div>
      </div>

      {/* Nav — uma bloco por seção, na ordem de SECOES */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {SECOES.map(secao => {
          const itens = visible.filter(i => i.secao === secao)
          if (itens.length === 0) return null
          return (
            <div key={secao} className="space-y-0.5">
              <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider px-3 mb-2">{secao}</p>
              {itens.map(({ href, label, icon }) => {
                const active = pathname === href
                return (
                  <Link key={href} href={href} onClick={fechar}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'text-ink-muted hover:bg-card-2 hover:text-ink'
                    }`}
                  >
                    <span className={active ? 'text-white' : 'text-ink-faint'}>{icon}</span>
                    {label}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Rodapé: alternador de demonstração (só admin) + papel do usuário */}
      <div className="px-4 py-4 border-t border-line space-y-3">
        {demoDisponivel && <BotaoDemo ativo={demoAtivo} />}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${ROLE_COLOR[role]}`} />
          <p className="text-[11px] text-ink-muted">{ROLE_LABEL[role]}</p>
        </div>
      </div>
    </aside>
  )
}
