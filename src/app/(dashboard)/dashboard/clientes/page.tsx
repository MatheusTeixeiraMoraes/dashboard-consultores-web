import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { redirect } from 'next/navigation'
import type { Cliente } from '@/lib/types'
import ClientesClient from './ClientesClient'

/** Ficha do cliente na Planilha Geral do MP. Ausente = não está na planilha. */
export interface FichaMP {
  status: string | null
  quartil: string | null
  prio: number | null
  tpv_mes_atual: number | null
  tpv_mes_passado: number | null
  status_credito: string | null
  mcc: string | null
  recorrencia: string | null
  ultimo_contato: string | null
  qtd_acionaveis: number | null
}

export default async function ClientesPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  const podeGerir = profile.role === 'admin' || profile.role === 'dono'

  /* Três frentes independentes, disparadas juntas.
   *
   * Antes elas eram três `await` em fila e a tela pagava a SOMA: a carteira
   * inteira (duas ondas de rede), depois a data da Planilha Geral, depois as
   * fichas (mais duas ondas), depois os nomes. Nenhuma usava o resultado da
   * anterior — só a ficha depende da data, e essa dependência continua dentro
   * da própria frente. Agora o custo é o da frente mais lenta.
   */
  const [clientes, mp, nomesConsultores] = await Promise.all([
    // A RLS já escopa: consultor recebe só os seus (por nome); gestão recebe tudo.
    // `em_carteira`: só quem está na Planilha Geral atual. Quem saiu da carteira
    // fica no banco (com o cadastro), mas some do painel — a Planilha Geral manda.
    // Lista as colunas em vez de `select('*')`: a tela não usa created_at,
    // created_by nem updated_at, e cada lote de 1000 linhas vira payload.
    buscarTudo<Cliente>((opcoes, de, ate) =>
      supabase
        .from('clientes')
        .select(
          'id, consultor_nome, seller_id, seller_nome, seller_telefone, seller_email, doc_tipo, cpf_cnpj, cidade, bairro, endereco_completo, lat, lng, status_atualizacao',
          opcoes,
        )
        .eq('em_carteira', true)
        .order('seller_nome', { ascending: true })
        .range(de, ate),
    ),

    // Ficha técnica vinda da Planilha Geral do MP: TPV, situação, prioridade,
    // crédito, segmento. É LEITURA — as duas bases continuam separadas e nada é
    // escrito de volta em `clientes`. Quem não está na Planilha Geral simplesmente
    // não tem ficha, e a tela mostra o cadastro sozinho.
    (async () => {
      const { data: ultimaMP } = await supabase
        .from('mp_carteira')
        .select('data_referencia')
        .order('data_referencia', { ascending: false })
        .limit(1)
        .maybeSingle()

      const dataMP: string | null = ultimaMP?.data_referencia ?? null
      const fichaTecnica: Record<string, FichaMP> = {}
      if (dataMP) {
        const linhas = await buscarTudo<FichaMP & { seller_id: string }>((opcoes, de, ate) =>
          supabase
            .from('mp_carteira')
            .select('seller_id, status, quartil, prio, tpv_mes_atual, tpv_mes_passado, status_credito, mcc, recorrencia, ultimo_contato, qtd_acionaveis', opcoes)
            .eq('data_referencia', dataMP)
            .range(de, ate),
        )
        for (const m of linhas) fichaTecnica[m.seller_id] = m
      }
      return { dataMP, fichaTecnica }
    })(),

    // Nomes de consultor para o datalist do cadastro manual (gestão).
    (async (): Promise<string[]> => {
      if (!podeGerir) return []
      const { data } = await supabase
        .from('profiles')
        .select('nome')
        .eq('role', 'consultor')
        .order('nome', { ascending: true })
      return [...new Set((data ?? []).map(p => p.nome).filter((n): n is string => !!n))]
    })(),
  ])

  const { dataMP, fichaTecnica } = mp

  return (
    <ClientesClient
      clientes={clientes}
      role={profile.role}
      meuNome={profile.nome || profile.email}
      nomesConsultores={nomesConsultores}
      fichaTecnica={fichaTecnica}
      dataMP={dataMP}
    />
  )
}
