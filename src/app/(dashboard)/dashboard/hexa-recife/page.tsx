import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import { COLUNAS_HEXA, tabelaAusente, type HexaCliente } from '@/lib/hexa-recife'
import HexaPainelClient from './HexaPainelClient'

export default async function HexaRecifePage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  /* Categoria de gestão: só admin e dono. Nem líder nem consultor.
   *
   * Este redirect é conveniência — quem realmente fecha é a RLS
   * (2026-08-05_hexa_recife_so_admin_e_dono.sql). Sem a policy, esconder a tela
   * não protegeria nada: a chave anon está no navegador de todo mundo e uma
   * chamada direta ao PostgREST leria a base. Sem o redirect, um consultor que
   * digitasse a URL veria uma tela vazia e acharia que é defeito. */
  if (profile.role !== 'admin' && profile.role !== 'dono') redirect('/dashboard')

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
