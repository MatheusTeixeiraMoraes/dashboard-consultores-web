// Ficha técnica do cliente na Planilha Geral do MP (tabela `mp_carteira`).
//
// É LEITURA — as duas bases (carteira de rotas e planilha do MP) continuam
// separadas e nada é escrito de volta em `clientes`. Quem não está na Planilha
// Geral simplesmente não tem ficha, e a tela mostra o cadastro sozinho.
//
// Mora aqui, e não dentro de uma tela, porque Clientes e Roteirizar filtram
// pelos mesmos eixos da ficha (situação, prioridade, segmento) — a consulta
// duplicada acabaria divergindo na próxima coluna nova.

import type { createClient } from './server'
import { buscarTudo } from './buscar-tudo'

type Supabase = Awaited<ReturnType<typeof createClient>>

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

export interface FichaCarregada {
  /** Data do snapshot mais recente do MP. Null = planilha nunca importada. */
  dataMP: string | null
  /** Ficha por seller_id. Vazio quando não há snapshot. */
  fichaTecnica: Record<string, FichaMP>
}

/** Situações possíveis na Planilha Geral — opções fixas do filtro. */
export const SITUACOES_MP = ['ATIVO', 'CHURN', 'INATIVO', 'REATIVADO']

/** Quartis de prioridade do MP, do mais para o menos prioritário. */
export const PRIORIDADES_MP = ['P1', 'P2', 'P3', 'P4']

export async function carregarFichaMP(supabase: Supabase): Promise<FichaCarregada> {
  const { data: ultimaMP } = await supabase
    .from('mp_carteira')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1)
    .maybeSingle()

  const dataMP: string | null = ultimaMP?.data_referencia ?? null
  const fichaTecnica: Record<string, FichaMP> = {}
  if (!dataMP) return { dataMP, fichaTecnica }

  // Filtrado num único `data_referencia`, `seller_id` sozinho já é ordem TOTAL.
  const linhas = await buscarTudo<FichaMP & { seller_id: string }>(
    opcoes =>
      supabase
        .from('mp_carteira')
        .select('seller_id, status, quartil, prio, tpv_mes_atual, tpv_mes_passado, status_credito, mcc, recorrencia, ultimo_contato, qtd_acionaveis', opcoes)
        .eq('data_referencia', dataMP),
    'seller_id',
  )
  for (const m of linhas) fichaTecnica[m.seller_id] = m

  return { dataMP, fichaTecnica }
}
