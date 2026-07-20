import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { redirect } from 'next/navigation'
import AcionaveisClient from './AcionaveisClient'

/** Uma linha da carteira no snapshot do MP. */
export interface CarteiraMP {
  seller_id: string
  consultor_nome: string
  status: string | null
  quartil: string | null
  prio: number | null
  tpv_mes_atual: number | null
  tpv_mes_passado: number | null
  status_credito: string | null
  mcc: string | null
  recorrencia: string | null
  ultimo_contato: string | null
  valor_1x: number | null
  valor_parc: number | null
  qtd_acionaveis: number
}

/** Identificação vinda da base de rotas — só leitura, nunca escrita. */
export interface Ficha {
  nome: string
  telefone: string | null
  local: string
}

export default async function AcionaveisPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  // Data do snapshot mais recente. A RLS já escopa por consultor, então o
  // consultor enxerga a última data em que ELE aparece.
  const { data: ultima } = await supabase
    .from('mp_carteira')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1)
    .maybeSingle()

  const dataReferencia: string | null = ultima?.data_referencia ?? null
  if (!dataReferencia) {
    return <AcionaveisClient dataReferencia={null} carteira={[]} acoes={[]} fichas={{}} podeGerir={false} />
  }

  const [carteira, acoes] = await Promise.all([
    buscarTudo<CarteiraMP>((opcoes, de, ate) =>
      supabase
        .from('mp_carteira')
        .select('seller_id, consultor_nome, status, quartil, prio, tpv_mes_atual, tpv_mes_passado, status_credito, mcc, recorrencia, ultimo_contato, valor_1x, valor_parc, qtd_acionaveis', opcoes)
        .eq('data_referencia', dataReferencia)
        .order('prio', { ascending: true, nullsFirst: false })
        .range(de, ate),
    ),
    buscarTudo<{ seller_id: string; acionavel: string; consultor_nome: string }>((opcoes, de, ate) =>
      supabase
        .from('mp_acionaveis')
        .select('seller_id, acionavel, consultor_nome', opcoes)
        .eq('data_referencia', dataReferencia)
        .range(de, ate),
    ),
  ])

  // Identificação do cliente: a Planilha Geral só traz o ID SELLER. Buscamos
  // nome e telefone na base de rotas APENAS para exibir — nada é escrito lá, e
  // as duas bases seguem separadas. Quem não estiver cadastrado aparece pelo ID.
  const cadastro = await buscarTudo<{ seller_id: string; seller_nome: string; seller_telefone: string | null; cidade: string; bairro: string }>(
    (opcoes, de, ate) =>
      supabase
        .from('clientes')
        .select('seller_id, seller_nome, seller_telefone, cidade, bairro', opcoes)
        .range(de, ate),
  )

  const naCarteira = new Set(carteira.map(c => c.seller_id))
  const fichas: Record<string, Ficha> = {}
  for (const c of cadastro) {
    if (!naCarteira.has(c.seller_id)) continue      // só o que a tela vai usar
    fichas[c.seller_id] = {
      nome: c.seller_nome,
      telefone: c.seller_telefone,
      local: [c.bairro, c.cidade].filter(Boolean).join(', '),
    }
  }

  const podeGerir = profile.role === 'admin' || profile.role === 'dono' || profile.role === 'lider'

  return (
    <AcionaveisClient
      dataReferencia={dataReferencia}
      carteira={carteira}
      acoes={acoes}
      fichas={fichas}
      podeGerir={podeGerir}
    />
  )
}
