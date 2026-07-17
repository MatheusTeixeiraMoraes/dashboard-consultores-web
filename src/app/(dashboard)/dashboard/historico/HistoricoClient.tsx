'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/lib/types'

const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV',
  net_churn: 'Net Churn',
  acionaveis: 'Acionáveis',
  aderencia: 'Aderência',
  awareness: 'Awareness',
  produtividade: 'Produtividade',
}

const PILAR_COLOR: Record<string, string> = {
  tpv: '#60a5fa',
  net_churn: '#c084fc',
  acionaveis: '#fb923c',
  aderencia: '#2dd4bf',
  awareness: '#f472b6',
  produtividade: '#818cf8',
}

interface UploadRow {
  id: string
  pilar_key: string
  filename: string
  data_referencia: string
  record_count: number
  uploaded_by: string
  created_at: string
  uploader_nome: string
}

function formatDateBR(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

function formatDateTimeBR(iso: string) {
  const dt = new Date(iso)
  return dt.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function HistoricoClient({ rows: initialRows, role }: { rows: UploadRow[]; role: UserRole }) {
  const [rows, setRows] = useState(initialRows)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    const supabase = createClient()

    await supabase.from('score_consultor_resultados').delete().eq('upload_id', id)
    const { error } = await supabase.from('score_uploads').delete().eq('id', id)

    if (!error) {
      setRows(prev => prev.filter(r => r.id !== id))
    }
    setDeleting(null)
    setConfirmId(null)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#F4F4F5]">Histórico de Uploads</h1>
        <p className="text-sm text-[#8A8A93] mt-0.5">
          {rows.length} {rows.length === 1 ? 'envio registrado' : 'envios registrados'}
          {role === 'admin' && ' · Apenas administradores podem excluir'}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-[#17171B] rounded-2xl border border-[#26262B] p-12 text-center">
          <p className="font-semibold text-[#F4F4F5]">Nenhuma planilha enviada ainda</p>
          <p className="text-sm text-[#8A8A93] mt-1">Vá em <strong className="text-[#3ECF8E]">Upar Planilha</strong> para começar.</p>
        </div>
      ) : (
        <div className="bg-[#17171B] rounded-2xl border border-[#26262B] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#26262B] bg-[#1D1D22]">
                <th className="text-left px-4 py-3 font-semibold text-[#8A8A93] text-xs uppercase tracking-wider">Pilar</th>
                <th className="text-left px-4 py-3 font-semibold text-[#8A8A93] text-xs uppercase tracking-wider">Arquivo</th>
                <th className="text-center px-4 py-3 font-semibold text-[#8A8A93] text-xs uppercase tracking-wider">Ref.</th>
                <th className="text-center px-4 py-3 font-semibold text-[#8A8A93] text-xs uppercase tracking-wider">Registros</th>
                <th className="text-left px-4 py-3 font-semibold text-[#8A8A93] text-xs uppercase tracking-wider">Enviado por</th>
                <th className="text-left px-4 py-3 font-semibold text-[#8A8A93] text-xs uppercase tracking-wider">Data Ref.</th>
                {role === 'admin' && (
                  <th className="text-center px-4 py-3 font-semibold text-[#8A8A93] text-xs uppercase tracking-wider">Ação</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#26262B]">
              {rows.map(row => {
                const color = PILAR_COLOR[row.pilar_key] ?? '#8A8A93'
                const isConfirming = confirmId === row.id
                const isDeleting = deleting === row.id
                return (
                  <tr key={row.id} className="hover:bg-[#1D1D22] transition-colors">
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg"
                        style={{ background: `${color}18`, color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        {PILAR_LABEL[row.pilar_key] ?? row.pilar_key}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#C4C4CC] max-w-[200px]">
                      <p className="truncate text-sm" title={row.filename}>{row.filename}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-[#C4C4CC] whitespace-nowrap">
                      {formatDateBR(row.data_referencia)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-[#F4F4F5]">{row.record_count}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#C4C4CC]">{row.uploader_nome}</td>
                    <td className="px-4 py-3 text-sm text-[#8A8A93] whitespace-nowrap">
                      {formatDateBR(row.created_at)}
                    </td>
                    {role === 'admin' && (
                      <td className="px-4 py-3 text-center">
                        {isConfirming ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleDelete(row.id)}
                              disabled={isDeleting}
                              className="text-xs font-semibold text-white bg-[#F2777A] hover:bg-[#E0585B] disabled:opacity-60 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              {isDeleting ? 'Excluindo...' : 'Confirmar'}
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              disabled={isDeleting}
                              className="text-xs font-medium text-[#8A8A93] hover:text-[#C4C4CC] px-2 py-1 rounded-lg transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(row.id)}
                            className="text-xs font-medium text-[#F2777A] hover:bg-[#3C1E22] px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Excluir
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
