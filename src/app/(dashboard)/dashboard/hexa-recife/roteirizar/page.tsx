import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import { tabelaAusente, type HexaCliente } from '@/lib/hexa-recife'
import HexaRoteirizarClient from './HexaRoteirizarClient'

export default async function HexaRoteirizarPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  // Só quem tem coordenada: sem GPS não há parada. Quem está sem aparece no
  // painel, marcado, e o admin resolve por lá (geocodar ou corrigir endereço).
  const { data, error } = await supabase
    .from('hexa_recife_clientes')
    .select('id, seller_id, seller_nome, nome_comercio, tpv, seller_telefone, cidade, bairro, endereco_completo, lat, lng, consultor_nome, status_operacional')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('tpv', { ascending: false, nullsFirst: false })

  // Base ainda não criada: o painel é quem explica o que falta.
  if (tabelaAusente(error?.code)) redirect('/dashboard/hexa-recife')
  if (error) throw new Error(`Falha ao carregar a rota Hexa: ${error.message}`)

  return (
    <HexaRoteirizarClient
      clientes={(data ?? []) as unknown as HexaCliente[]}
      meuNome={profile.nome || profile.email}
      gestao={profile.role === 'admin' || profile.role === 'dono' || profile.role === 'lider'}
    />
  )
}
