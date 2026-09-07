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
}

const COLUNAS =
  'id, consultor_nome, nome_rota, data_visita, partida_endereco, partida_lat, partida_lng, ' +
  'chegada_lat, chegada_lng, stops, distancia_km, tempo_minutos, created_at'

export default async function AgendaPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  /* RLS escopa: consultor vê as suas; gestão vê todas.
   *
   * A coluna `rotas.origem` continua no banco (default 'carteira'), mas não é
   * mais lida: existia para separar a rota Inter/Hexa Recife, categoria
   * temporária encerrada em 07/09/2026. Com ela foi embora o retry que esta
   * página fazia quando a coluna ainda não existia. */
  const { data: rotas } = await supabase
    .from('rotas')
    .select(COLUNAS)
    .order('data_visita', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  const podeVerTodos = profile.role === 'admin' || profile.role === 'dono' || profile.role === 'lider'

  return <AgendaClient rotas={(rotas ?? []) as unknown as Rota[]} podeVerTodos={podeVerTodos} />
}
