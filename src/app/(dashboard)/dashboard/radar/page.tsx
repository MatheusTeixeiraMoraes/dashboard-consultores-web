import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
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
  const clientes = await buscarTudo<ClienteRadar>((opcoes, de, ate) =>
    supabase
      .from('clientes')
      .select('seller_id, seller_nome, seller_telefone, consultor_nome, cidade, bairro, endereco_completo, lat, lng', opcoes)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .range(de, ate),
  )

  const podeVerTodos = profile.role === 'admin' || profile.role === 'dono' || profile.role === 'lider'

  return (
    <RadarClient
      clientes={clientes}
      podeVerTodos={podeVerTodos}
      meuNome={profile.nome || profile.email}
    />
  )
}
