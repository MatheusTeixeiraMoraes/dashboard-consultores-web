import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import { COLUNAS_HEXA, tabelaAusente, type HexaCliente } from '@/lib/hexa-recife'
import HexaPainelClient from './HexaPainelClient'

export default async function HexaRecifePage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  // A RLS já escopa: gestão vê os 145, consultor vê só os do nome dele.
  // São 145 linhas — cabem numa resposta só, sem precisar de buscarTudo.
  const { data, error } = await supabase
    .from('hexa_recife_clientes')
    .select(COLUNAS_HEXA)
    .order('tpv', { ascending: false, nullsFirst: false })

  const baseAusente = tabelaAusente(error?.code)
  if (error && !baseAusente) throw new Error(`Falha ao carregar a rota Hexa: ${error.message}`)

  return (
    <HexaPainelClient
      clientes={(data ?? []) as unknown as HexaCliente[]}
      role={profile.role}
      uploadedBy={profile.id}
      baseAusente={baseAusente}
    />
  )
}
