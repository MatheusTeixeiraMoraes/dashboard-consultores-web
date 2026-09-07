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
  /** Quem estava DENTRO da conta do ator na hora ("entrar na conta de"). Null
   *  no caso normal. O ator continua sendo a conta em que a ação foi gravada. */
  delegado_por_nome?: string | null
  delegado_por_email?: string | null
}

// Postgres: coluna inexistente (a migration do carimbo de delegação é rodada à
// mão no SQL Editor, como todas deste projeto).
const COLUNA_AUSENTE = '42703'

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

  const COLUNAS = 'id, tipo, ator_id, ator_nome, ator_email, alvo_tipo, alvo_id, alvo_descricao, detalhes, criado_em'
  const buscar = (colunas: string) =>
    supabase
      .from('eventos_atividade')
      .select(colunas)
      .order('criado_em', { ascending: false })
      .limit(LIMITE)

  let { data, error } = await buscar(`${COLUNAS}, delegado_por_nome, delegado_por_email`)

  /* Mesmo retry de `rotas.origem` na Agenda: enquanto a migration do carimbo
   * não roda, pedir as colunas derrubaria a tela INTEIRA por causa de um selo
   * que quase nenhum evento tem. Sem elas, todo evento é ação direta — que é
   * exatamente o que o default da migration diz. */
  if (error?.code === COLUNA_AUSENTE) {
    const semCarimbo = await buscar(COLUNAS)
    data = semCarimbo.data
    error = semCarimbo.error
  }

  // `unknown` no meio porque a lista de colunas é string montada em runtime
  // (por causa do retry), e aí o cliente do Supabase não infere a forma da linha.
  return <AtividadeClient eventos={(data ?? []) as unknown as EventoAtividade[]} />
}
