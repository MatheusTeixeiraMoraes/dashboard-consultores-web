import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { carregarFichaMP } from '@/lib/supabase/ficha-mp'
import { redirect } from 'next/navigation'
import type { ClienteRadar } from '../radar/page'
import RoteirizarClient from './RoteirizarClient'

export default async function RoteirizarPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  /* Carteira e ficha do MP em paralelo — uma não depende da outra, e em fila a
   * tela pagaria a soma das duas (ver o mesmo raciocínio na página de Clientes). */
  const [clientes, { dataMP, fichaTecnica }] = await Promise.all([
    // Clientes geocodados da carteira (para adicionar paradas manualmente).
    // `seller_id` como ordem: é `unique` em `clientes`, ordem TOTAL sozinho.
    buscarTudo<ClienteRadar>(
      opcoes =>
        supabase
          .from('clientes')
          .select('seller_id, seller_nome, seller_telefone, consultor_nome, cidade, bairro, endereco_completo, lat, lng, coordenada_origem', opcoes)
          .eq('em_carteira', true)
          .not('lat', 'is', null)
          .not('lng', 'is', null),
      'seller_id',
    ),

    // Situação, prioridade e segmento vêm daqui: são os eixos por onde o
    // consultor escolhe quem visitar, e sem a ficha o Roteirizar só sabia
    // filtrar por geografia.
    carregarFichaMP(supabase),
  ])

  return (
    <RoteirizarClient
      clientes={clientes}
      meuNome={profile.nome || profile.email}
      fichaTecnica={fichaTecnica}
      dataMP={dataMP}
    />
  )
}
