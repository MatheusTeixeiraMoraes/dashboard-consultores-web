'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registrarEvento } from '@/lib/atividade'
import type { UserRole } from '@/lib/types'

const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV',
  net_churn: 'Net Churn',
  acionaveis: 'Acionáveis',
  aderencia: 'Aderência',
  awareness: 'Awareness',
  produtividade: 'Produtividade',
  carteira: 'Oportunidades',
}

const PILAR_COLOR: Record<string, string> = {
  tpv: 'var(--color-pilar-tpv)',
  net_churn: 'var(--color-pilar-net-churn)',
  acionaveis: 'var(--color-pilar-acionaveis)',
  aderencia: 'var(--color-pilar-aderencia)',
  awareness: 'var(--color-pilar-awareness)',
  produtividade: 'var(--color-pilar-produtividade)',
  carteira: 'var(--color-primary)',
}

export interface UploadRow {
  id: string
  /** 'pilar' = uma das 6 planilhas de score; 'carteira' = Planilha Ação
   *  Oportunidades — sem Excluir, porque apagar a linha não desfaz o que já
   *  foi reconciliado em `clientes`. */
  tipo: 'pilar' | 'carteira'
  pilar_key: string
  filename: string
  /** Caminho no bucket `planilhas-upload`. null = enviado antes deste
   *  recurso existir — arquivo original não foi guardado, sem como recuperar. */
  arquivo_path: string | null
  data_referencia: string
  record_count: number
  /** Só carteira: acionáveis, que não cabe no "Registros" (clientes). */
  extra?: string
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
  const [baixando, setBaixando] = useState<string | null>(null)
  const [erroBaixa, setErroBaixa] = useState<string | null>(null)

  async function handleDownload(row: UploadRow) {
    if (!row.arquivo_path) return
    setBaixando(row.id)
    setErroBaixa(null)
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from('planilhas-upload')
      .createSignedUrl(row.arquivo_path, 60, { download: row.filename })
    setBaixando(null)
    if (error || !data) {
      setErroBaixa(row.id)
      return
    }
    // Content-Disposition: attachment já vem do signed URL (download: filename),
    // então um <a> clicado programaticamente baixa sem navegar pra outra página
    // — mesmo padrão de exportarCsv() em Carteira/Hexa Recife.
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.click()
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const supabase = createClient()
    const alvo = rows.find(r => r.id === id)

    await supabase.from('score_consultor_resultados').delete().eq('upload_id', id)
    const { error } = await supabase.from('score_uploads').delete().eq('id', id)

    if (!error) {
      // Some da lista mesmo se o storage falhar: a linha já foi apagada, e um
      // arquivo órfão no bucket não é motivo pra travar a exclusão.
      if (alvo?.arquivo_path) {
        await supabase.storage.from('planilhas-upload').remove([alvo.arquivo_path])
      }
      setRows(prev => prev.filter(r => r.id !== id))
      if (alvo) {
        registrarEvento({
          tipo: 'score_upload_excluido',
          alvoTipo: 'score_upload',
          alvoId: id,
          alvoDescricao: `${PILAR_LABEL[alvo.pilar_key] ?? alvo.pilar_key} · ${formatDateBR(alvo.data_referencia)}`,
          detalhes: { pilar_key: alvo.pilar_key, data_referencia: alvo.data_referencia, record_count: alvo.record_count },
        })
      }
    }
    setDeleting(null)
    setConfirmId(null)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Histórico de Uploads</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {rows.length} {rows.length === 1 ? 'envio registrado' : 'envios registrados'}
          {role === 'admin' && ' · Apenas administradores podem excluir'}
          {' · Envios anteriores a este recurso não têm arquivo original pra baixar'}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Nenhuma planilha enviada ainda</p>
          <p className="text-sm text-ink-muted mt-1">Vá em <strong className="text-good">Upar Planilha</strong> para começar.</p>
        </div>
      ) : (
        <div className="glass rounded-2xl border border-line overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line bg-card-2">
                <th className="text-left px-4 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Pilar</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Arquivo</th>
                <th className="text-center px-4 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Ref.</th>
                <th className="text-center px-4 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Registros</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Enviado por</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Data Ref.</th>
                <th className="text-center px-4 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(row => {
                const color = PILAR_COLOR[row.pilar_key] ?? 'var(--color-ink-muted)'
                const isConfirming = confirmId === row.id
                const isDeleting = deleting === row.id
                return (
                  <tr key={row.id} className="hover:bg-card-2 transition-colors">
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg"
                        style={{ background: `${color}18`, color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        {PILAR_LABEL[row.pilar_key] ?? row.pilar_key}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-dim max-w-[200px]">
                      <p className="truncate text-sm" title={row.filename}>{row.filename}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-ink-dim whitespace-nowrap">
                      {formatDateBR(row.data_referencia)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-ink">{row.record_count}</span>
                      {row.extra && <p className="text-[11px] text-ink-faint">{row.extra}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-dim">{row.uploader_nome}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted whitespace-nowrap">
                      {formatDateBR(row.created_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isConfirming ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleDelete(row.id)}
                            disabled={isDeleting}
                            className="text-xs font-semibold text-white bg-bad hover:bg-bad-dk disabled:opacity-60 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            {isDeleting ? 'Excluindo...' : 'Confirmar'}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            disabled={isDeleting}
                            className="text-xs font-medium text-ink-muted hover:text-ink-dim px-2 py-1 rounded-lg transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          {row.arquivo_path ? (
                            <button
                              onClick={() => handleDownload(row)}
                              disabled={baixando === row.id}
                              className="text-xs font-medium text-primary hover:bg-primary/10 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-60"
                            >
                              {baixando === row.id ? 'Gerando...' : 'Baixar'}
                            </button>
                          ) : (
                            <span className="text-xs text-ink-faint" title="Enviado antes deste recurso existir">
                              Indisponível
                            </span>
                          )}
                          {role === 'admin' && row.tipo === 'pilar' && (
                            <button
                              onClick={() => setConfirmId(row.id)}
                              className="text-xs font-medium text-bad hover:bg-bad-bg px-2.5 py-1 rounded-lg transition-colors"
                            >
                              Excluir
                            </button>
                          )}
                          {erroBaixa === row.id && (
                            <span className="text-[11px] text-bad">Falha ao gerar link</span>
                          )}
                        </div>
                      )}
                    </td>
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
