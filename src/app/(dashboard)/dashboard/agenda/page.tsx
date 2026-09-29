import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { carregarFichaMP } from '@/lib/supabase/ficha-mp'
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

  /* As duas frentes são independentes — a ficha é indexada por seller_id, não
   * depende de quais rotas voltaram. Em fila, a tela pagaria a soma. */
  const [{ data: rotas }, mp] = await Promise.all([
    /* RLS escopa: consultor vê as suas; gestão vê todas.
     *
     * A coluna `rotas.origem` continua no banco (default 'carteira'), mas não é
     * mais lida: existia para separar a rota Inter/Hexa Recife, categoria
     * temporária encerrada em 07/09/2026. Com ela foi embora o retry que esta
     * página fazia quando a coluna ainda não existia. */
    supabase
      .from('rotas')
      .select(COLUNAS)
      .order('data_visita', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),

    /* Ficha da Planilha Geral do MP: situação, prioridade, TPV, último contato.
     * O snapshot em `stops` guarda o cadastro (nome, endereço, telefone), que
     * não envelhece; a ficha é o estado do cliente HOJE, e é ela que diz ao
     * consultor na rua se aquela porta é resgate ou manutenção. Mesma consulta
     * que Clientes e Roteirizar já fazem.
     *
     * O catch é o que separa esta tela das outras duas: aqui a ficha é ENFEITE
     * — a Agenda funciona inteira sem ela, exatamente como funciona quando a
     * planilha nunca foi importada. `buscarTudo` lança, e sem isto uma falha na
     * consulta acessória derrubaria a tela que o consultor está usando na rua.
     * Filtrar por seller_id foi descartado: são ~370 ids nas rotas salvas, e a
     * URL do `in()` cresce junto com o número de rotas. */
    carregarFichaMP(supabase).catch(() => ({ dataMP: null, fichaTecnica: {} })),
  ])

  const podeVerTodos = profile.role === 'admin' || profile.role === 'dono' || profile.role === 'lider'

  return (
    <AgendaClient
      rotas={(rotas ?? []) as unknown as Rota[]}
      podeVerTodos={podeVerTodos}
      fichaTecnica={mp.fichaTecnica}
    />
  )
}
