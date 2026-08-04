import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import type { ClienteSelecionado } from '@/lib/geo'
import AgendaClient from './AgendaClient'

export interface Rota {
  id: string
  consultor_nome: string
  nome_rota: string
  data_visita: string | null
  partida_endereco: string | null
  partida_lat: number | null
  partida_lng: number | null
  chegada_lat: number | null
  chegada_lng: number | null
  stops: ClienteSelecionado[]
  distancia_km: number | null
  tempo_minutos: number | null
  created_at: string
  /** 'carteira' (padrão) ou 'hexa_recife' — a rota da categoria temporária. */
  origem: string
}

const COLUNAS =
  'id, consultor_nome, nome_rota, data_visita, partida_endereco, partida_lat, partida_lng, ' +
  'chegada_lat, chegada_lng, stops, distancia_km, tempo_minutos, created_at'

/** Coluna inexistente no Postgres — a `origem` só existe depois da migration. */
const COLUNA_AUSENTE = '42703'

export default async function AgendaPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  // RLS escopa: consultor vê as suas; gestão vê todas.
  const buscar = (colunas: string) =>
    supabase
      .from('rotas')
      .select(colunas)
      .order('data_visita', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

  let { data: rotas, error } = await buscar(`${COLUNAS}, origem`)

  /* A `origem` chega com a migration da rota Inter/Hexa, que é rodada à mão no
   * SQL Editor. Enquanto ela não roda, pedir a coluna derrubaria a Agenda
   * INTEIRA — uma tela que hoje funciona — por causa de um selo. Então: tenta
   * com a coluna e, se o banco disser que ela não existe, refaz sem, tratando
   * toda rota como 'carteira' (que é exatamente o default da migration). */
  if (error?.code === COLUNA_AUSENTE) {
    const semOrigem = await buscar(COLUNAS)
    rotas = semOrigem.data
    error = semOrigem.error
  }

  const podeVerTodos = profile.role === 'admin' || profile.role === 'dono' || profile.role === 'lider'

  // `unknown` no meio porque o select recebe a lista de colunas como string
  // montada em runtime (por causa do retry sem `origem`), e aí o cliente do
  // Supabase não consegue inferir a forma da linha.
  return <AgendaClient rotas={(rotas ?? []) as unknown as Rota[]} podeVerTodos={podeVerTodos} />
}
