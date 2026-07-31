import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { redirect } from 'next/navigation'
import QuedaTpvClient from './QuedaTpvClient'

export interface LinhaTPV {
  seller_id: string
  consultor_nome: string
  status: string | null
  quartil: string | null
  mcc: string | null
  recorrencia: string | null
  status_credito: string | null
  tpv_mes_atual: number | null
  tpv_mes_passado: number | null
  ultimo_contato: string | null
}

/** Um envio anterior do mesmo mês, para medir se o acumulado andou. */
export interface PontoSerie {
  seller_id: string
  data_referencia: string
  tpv_mes_atual: number | null
}

export default async function QuedaTpvPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  const { data: ultima } = await supabase
    .from('mp_carteira')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1)
    .maybeSingle()

  const dataReferencia: string | null = ultima?.data_referencia ?? null
  if (!dataReferencia) {
    return <QuedaTpvClient dataReferencia={null} linhas={[]} serie={[]} fichas={{}} podeGerir={false} />
  }

  // Série do MESMO MÊS, para medir estagnação. O TPV é acumulado e zera na
  // virada, então misturar meses mostraria queda de 100% em todo mundo no dia 1.
  const mes = dataReferencia.slice(0, 7)

  /* As três buscas só dependem de `dataReferencia`, que já foi resolvida acima —
   * nenhuma delas usa o resultado da outra. Em fila, cada uma esperava a
   * anterior terminar à toa, e como `buscarTudo` já custa duas ondas de rede
   * (contar, depois as páginas), isso somava SEIS ondas antes do primeiro pixel.
   * Em paralelo o custo passa a ser o da mais lenta. */
  const [linhas, serie, cadastro] = await Promise.all([
    buscarTudo<LinhaTPV>((opcoes, de, ate) =>
      supabase
        .from('mp_carteira')
        .select('seller_id, consultor_nome, status, quartil, mcc, recorrencia, status_credito, tpv_mes_atual, tpv_mes_passado, ultimo_contato', opcoes)
        .eq('data_referencia', dataReferencia)
        .range(de, ate),
    ),
    buscarTudo<PontoSerie>((opcoes, de, ate) =>
      supabase
        .from('mp_carteira')
        .select('seller_id, data_referencia, tpv_mes_atual', opcoes)
        .gte('data_referencia', `${mes}-01`)
        .lte('data_referencia', dataReferencia)
        .range(de, ate),
    ),
    // Nome e telefone vêm da base de rotas só para exibir — as duas bases seguem
    // separadas, nada é escrito de volta.
    //
    // Sem `.eq('em_carteira', true)` DE PROPÓSITO: quem filtra é o
    // `naCarteira.has(...)` logo abaixo, que usa os seller_id da Planilha Geral.
    // Filtrar aqui por `em_carteira` é outro critério — cliente tirado da
    // carteira à mão, ou snapshot ainda não reconciliado, perderia nome e
    // telefone e voltaria a aparecer pelo ID cru.
    buscarTudo<{ seller_id: string; seller_nome: string; seller_telefone: string | null; cidade: string; bairro: string }>(
      (opcoes, de, ate) =>
        supabase.from('clientes').select('seller_id, seller_nome, seller_telefone, cidade, bairro', opcoes).range(de, ate),
    ),
  ])

  const naCarteira = new Set(linhas.map(l => l.seller_id))
  const fichas: Record<string, { nome: string; telefone: string | null; local: string }> = {}
  for (const c of cadastro) {
    if (!naCarteira.has(c.seller_id)) continue
    fichas[c.seller_id] = {
      nome: c.seller_nome,
      telefone: c.seller_telefone,
      local: [c.bairro, c.cidade].filter(Boolean).join(', '),
    }
  }

  const podeGerir = profile.role === 'admin' || profile.role === 'dono' || profile.role === 'lider'

  return (
    <QuedaTpvClient
      dataReferencia={dataReferencia}
      linhas={linhas}
      serie={serie}
      fichas={fichas}
      podeGerir={podeGerir}
    />
  )
}
