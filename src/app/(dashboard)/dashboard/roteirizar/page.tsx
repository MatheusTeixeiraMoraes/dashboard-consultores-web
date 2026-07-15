import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import type { ClienteRadar } from '../radar/page'
import RoteirizarClient from './RoteirizarClient'

export default async function RoteirizarPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  // Clientes geocodados da carteira (para adicionar paradas manualmente).
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

  return <RoteirizarClient clientes={clientes} meuNome={profile.nome || profile.email} />
}
