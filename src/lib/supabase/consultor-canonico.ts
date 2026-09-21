// Nome de exibição canônico do consultor, para telas que leem de tabelas SEM
// id_carteira (clientes, mp_carteira, mp_acionaveis).
//
// Essas tabelas só guardam `consultor_nome` (texto, vindo da Planilha Geral).
// `score_consultor_resultados` é a única com `id_carteira` estável. Quando a
// planilha de pontuação muda o formato do nome de alguém (ou quando um admin
// cadastra um alias manual em `consultor_aliases` para uma grafia antiga —
// ver migration 2026-09-21_consultor_aliases.sql), as tabelas sem id_carteira
// continuam com a grafia velha até o próximo envio — e podem inclusive ter as
// DUAS grafias ao mesmo tempo, parte dos registros já atualizada e parte não
// (caso real: Rivaldo, 21/09/2026).
//
// Sem canonizar, qualquer tela que agrupa/filtra/compara por `consultor_nome`
// (Set de opções de filtro, groupBy, diff entre dois snapshots em
// lib/carteira.ts) trata as duas grafias como duas pessoas diferentes.
//
// USAR canonizarNome() em QUALQUER lugar que monte Set/Map/groupBy de
// consultor_nome vindo de clientes/mp_carteira/mp_acionaveis — aplicar ANTES
// de agrupar, nunca depois. Ver src/app/(dashboard)/dashboard/page.tsx, que
// resolve o mesmo problema por id_carteira (em vez de nome de exibição)
// porque ali o merge já é feito contra score_consultor_resultados.

import type { createClient } from './server'
import { normalizarNome } from '@/lib/convites'

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Carrega o resolvedor de nome canônico a partir do score mais recente e dos
 * aliases cadastrados à mão. Quem nunca teve grafia divergente devolve o
 * próprio nome, sem custo de comportamento.
 */
export async function carregarCanonizadorDeConsultor(supabase: Supabase): Promise<(nome: string) => string> {
  const [{ data: uploads }, { data: aliases }] = await Promise.all([
    supabase.from('score_uploads').select('data_referencia').order('data_referencia', { ascending: false }).limit(1),
    supabase.from('consultor_aliases').select('nome_normalizado, id_carteira'),
  ])
  const latestDate = uploads?.[0]?.data_referencia ?? null

  const { data: score } = latestDate
    ? await supabase.from('score_consultor_resultados').select('consultor_nome, id_carteira').eq('data_referencia', latestDate)
    : { data: [] as { consultor_nome: string; id_carteira: string }[] }

  // Nome normalizado → id_carteira: o que o score já conhece (bate direto) + os aliases manuais.
  const idPorNome = new Map<string, string>()
  for (const s of score ?? []) idPorNome.set(normalizarNome(s.consultor_nome), s.id_carteira)
  for (const a of aliases ?? []) idPorNome.set(a.nome_normalizado, a.id_carteira)

  // id_carteira → nome de exibição canônico (o nome mais recente da pontuação).
  const nomePorId = new Map<string, string>()
  for (const s of score ?? []) nomePorId.set(s.id_carteira, s.consultor_nome)

  return (nomeBruto: string) => {
    const id = idPorNome.get(normalizarNome(nomeBruto))
    if (!id) return nomeBruto
    return nomePorId.get(id) ?? nomeBruto
  }
}
