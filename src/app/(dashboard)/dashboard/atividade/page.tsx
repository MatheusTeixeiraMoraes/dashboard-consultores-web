import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import AtividadeClient from './AtividadeClient'

export interface EventoAtividade {
  id: string
  tipo: string
  ator_id: string | null
  ator_nome: string
  ator_email: string
  alvo_tipo: string | null
  alvo_id: string | null
  alvo_descricao: string | null
  detalhes: Record<string, unknown> | null
  criado_em: string
}

// Teto fixo desde o início — não o erro de payload sem limite já corrigido
// em Queda de TPV (uma busca sem teto que só crescia a cada envio). Este
// log cresce pra sempre enquanto o app existir; 200 linhas mais recentes
// já é mais do que cabe numa sessão de revisão.
const LIMITE = 200

export default async function AtividadePage() {
  const profile = await getProfile()
  // Só admin — decisão explícita: nem dono vê o log de atividade.
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('eventos_atividade')
    .select('id, tipo, ator_id, ator_nome, ator_email, alvo_tipo, alvo_id, alvo_descricao, detalhes, criado_em')
    .order('criado_em', { ascending: false })
    .limit(LIMITE)

  return <AtividadeClient eventos={(data ?? []) as EventoAtividade[]} />
}
