import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import HistoricoClient from './HistoricoClient'
import type { UploadRow } from './HistoricoClient'

export default async function HistoricoPage() {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'dono')) {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  const [{ data: uploads }, { data: carteira }] = await Promise.all([
    supabase
      .from('score_uploads')
      .select('id, pilar_key, filename, data_referencia, record_count, uploaded_by, arquivo_path')
      .order('data_referencia', { ascending: false }),
    supabase
      .from('carteira_uploads')
      .select('id, filename, data_referencia, total_clientes, total_acionaveis, uploaded_by, arquivo_path, created_at')
      .order('created_at', { ascending: false }),
  ])

  const uploaderIds = [...new Set([
    ...(uploads ?? []).map(u => u.uploaded_by),
    ...(carteira ?? []).map(u => u.uploaded_by),
  ])]

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, nome')
    .in('id', uploaderIds.length > 0 ? uploaderIds : ['none'])

  const profileMap = Object.fromEntries((profilesData ?? []).map(p => [p.id, p.nome]))

  const rowsPilar: UploadRow[] = (uploads ?? []).map(u => ({
    id: u.id,
    tipo: 'pilar',
    pilar_key: u.pilar_key,
    filename: u.filename,
    arquivo_path: u.arquivo_path,
    data_referencia: u.data_referencia,
    record_count: u.record_count,
    uploader_nome: profileMap[u.uploaded_by] ?? '—',
    created_at: u.data_referencia,
  }))

  // "Planilha Ação Oportunidades" não tinha NENHUM registro por envio antes
  // desta migration — só o snapshot vivo em mp_carteira/mp_acionaveis. Entra
  // na mesma lista, distinguida por `tipo` (sem Excluir: apagar esta linha não
  // desfaria o que já foi reconciliado em `clientes`).
  const rowsCarteira: UploadRow[] = (carteira ?? []).map(u => ({
    id: u.id,
    tipo: 'carteira',
    pilar_key: 'carteira',
    filename: u.filename,
    arquivo_path: u.arquivo_path,
    data_referencia: u.data_referencia,
    record_count: u.total_clientes,
    extra: `${u.total_acionaveis} acionável(is)`,
    uploader_nome: profileMap[u.uploaded_by] ?? '—',
    created_at: u.created_at,
  }))

  const rows = [...rowsPilar, ...rowsCarteira].sort((a, b) => b.created_at.localeCompare(a.created_at))

  return <HistoricoClient rows={rows} role={profile.role} />
}
