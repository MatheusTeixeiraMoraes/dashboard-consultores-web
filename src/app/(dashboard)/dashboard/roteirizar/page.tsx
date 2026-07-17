import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { redirect } from 'next/navigation'
import type { ClienteRadar } from '../radar/page'
import RoteirizarClient from './RoteirizarClient'

export default async function RoteirizarPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  // Clientes geocodados da carteira (para adicionar paradas manualmente).
  const clientes = await buscarTudo<ClienteRadar>((opcoes, de, ate) =>
    supabase
      .from('clientes')
      .select('seller_id, seller_nome, seller_telefone, consultor_nome, cidade, bairro, endereco_completo, lat, lng', opcoes)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .range(de, ate),
  )

  return <RoteirizarClient clientes={clientes} meuNome={profile.nome || profile.email} />
}
