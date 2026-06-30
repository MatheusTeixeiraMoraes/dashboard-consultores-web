'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, UserRole } from '@/lib/types'
import { canManageUsers } from '@/lib/types'

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador', dono: 'Dono', lider: 'Líder', consultor: 'Consultor'
}
const ROLE_COLOR: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  dono: 'bg-emerald-100 text-emerald-700',
  lider: 'bg-blue-100 text-blue-700',
  consultor: 'bg-gray-100 text-gray-600',
}

export default function UsuariosClient({ usuarios, myRole, myId }: {
  usuarios: Profile[]
  myRole: UserRole
  myId: string
}) {
  const [lista, setLista] = useState(usuarios)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Profile>>({})

  function startEdit(u: Profile) {
    setEditing(u.id)
    setForm({ nome: u.nome, role: u.role, id_carteira: u.id_carteira ?? '' })
  }

  async function saveEdit(u: Profile) {
    setSaving(u.id)
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .update({ nome: form.nome, role: form.role, id_carteira: form.id_carteira || null })
      .eq('id', u.id)
      .select()
      .single()

    if (data) setLista(prev => prev.map(p => p.id === u.id ? data as Profile : p))
    setSaving(null)
    setEditing(null)
  }

  const rolesDisponiveis: UserRole[] = myRole === 'admin'
    ? ['admin', 'dono', 'lider', 'consultor']
    : ['lider', 'consultor']

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Usuários</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">{lista.length} usuário{lista.length !== 1 ? 's' : ''} cadastrado{lista.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
              <th className="text-left px-5 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wider">Nome / E-mail</th>
              <th className="text-left px-5 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wider">Cargo</th>
              <th className="text-left px-5 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wider">ID Carteira</th>
              <th className="text-left px-5 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {lista.map(u => {
              const isMe = u.id === myId
              const canEdit = !isMe && canManageUsers(myRole, u.role)
              const isEditing = editing === u.id

              return (
                <tr key={u.id} className="hover:bg-[#F9FAFB] transition-colors">
                  <td className="px-5 py-3.5">
                    {isEditing ? (
                      <input
                        className="border border-[#E5E7EB] rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                        value={form.nome ?? ''}
                        onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                        placeholder="Nome completo"
                      />
                    ) : (
                      <div>
                        <p className="font-medium text-[#111827]">{u.nome || '—'} {isMe && <span className="text-xs text-[#6B7280]">(você)</span>}</p>
                        <p className="text-xs text-[#6B7280]">{u.email}</p>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {isEditing ? (
                      <select
                        className="border border-[#E5E7EB] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                        value={form.role}
                        onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                      >
                        {rolesDisponiveis.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    ) : (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLOR[u.role]}`}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {isEditing ? (
                      <input
                        className="border border-[#E5E7EB] rounded-lg px-2 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                        value={form.id_carteira ?? ''}
                        onChange={e => setForm(f => ({ ...f, id_carteira: e.target.value }))}
                        placeholder="ex: 12345"
                      />
                    ) : (
                      <span className="text-[#6B7280]">{u.id_carteira || '—'}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {canEdit && (
                      isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(u)}
                            disabled={saving === u.id}
                            className="text-xs font-medium text-white bg-[#10B981] hover:bg-[#047857] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                          >
                            {saving === u.id ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="text-xs font-medium text-[#6B7280] hover:text-[#111827] px-3 py-1.5 rounded-lg border border-[#E5E7EB] transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(u)}
                          className="text-xs font-medium text-[#3B82F6] hover:text-[#2563EB] transition-colors"
                        >
                          Editar
                        </button>
                      )
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
