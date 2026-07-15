import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import RadarClient from './RadarClient'

export interface ClienteRadar {
  seller_id: string
  seller_nome: string
  seller_telefone: string | null
  consultor_nome: string
  cidade: string
  bairro: string
  endereco_completo: string
  lat: number
  lng: number
}

export default async function RadarPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  // Só clientes com coordenada entram no Radar. RLS escopa por papel/nome.
  // Pagina até o fim (PostgREST corta em 1000/resposta).
  const PAGINA = 1000
  const clientes: ClienteRadar[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('clientes')
      .select('seller_id, seller_nome, seller_telefone, consultor_nome, cidade, bairro, endereco_completo, lat, lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .range(de, de + PAGINA - 1)
    if (error || !data || data.length === 0) break
    clientes.push(...(data as ClienteRadar[]))
    if (data.length < PAGINA) break
  }

  const podeVerTodos = profile.role === 'admin' || profile.role === 'dono' || profile.role === 'lider'

  return (
    <RadarClient
      clientes={clientes}
      podeVerTodos={podeVerTodos}
      meuNome={profile.nome || profile.email}
    />
  )
}
