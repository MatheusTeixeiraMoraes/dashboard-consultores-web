import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { precisaIdentificar } from '@/lib/texto'
import { redirect } from 'next/navigation'
import GeralClient from './GeralClient'

// Os nomes vêm de duas planilhas diferentes (pontuação × Ação Oportunidades),
// então a junção ignora caixa/acento — mesma regra do cliente_e_meu no banco.
const norm = (s: string) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

/** Números de carteira de um consultor, agregados das duas fontes. */
export interface CarteiraResumo {
  clientes: number     // em carteira (tabela clientes)
  pendentes: number    // ainda "Pendente de identificação"
  tpv: number          // soma do TPV do mês (Planilha Ação Oportunidades)
  status: Record<string, number>  // ATIVO / INATIVO / CHURN / REATIVADO
}

export default async function GeralPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  // Consultor também tem home: o RLS devolve só a carteira e o score dele,
  // então a MESMA busca serve para gestão e consultor.

  const supabase = await createClient()

  const [{ data: uploads }, { data: ultCarteira }] = await Promise.all([
    supabase.from('score_uploads').select('data_referencia').order('data_referencia', { ascending: false }).limit(1),
    supabase.from('mp_carteira').select('data_referencia').order('data_referencia', { ascending: false }).limit(1),
  ])

  const latestDate = uploads?.[0]?.data_referencia ?? null
  const dataCarteira = ultCarteira?.[0]?.data_referencia ?? null

  if (!latestDate && !dataCarteira) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink">Visão Geral</h1>
          <p className="text-sm text-ink-muted mt-0.5">Visão consolidada de todos os consultores</p>
        </div>
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-good-bg flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </div>
          <p className="font-semibold text-ink">Nenhum dado carregado ainda</p>
          <p className="text-sm text-ink-muted mt-1">Vá em <strong className="text-good">Upar Planilha</strong> para começar.</p>
        </div>
      </div>
    )
  }

  /* Score + carteira, tudo numa onda só.
   *
   * `resultados` filtra `score_consultor_resultados` direto por `data_referencia`
   * (a coluna já vem gravada em cada linha, igual ao upload que a gerou) — não
   * precisa do hop de buscar `uploadIds` para usar em `upload_id in (...)`.
   * E `clientes`/`linhasCarteira` nunca dependeram do score: só de `dataCarteira`,
   * que já saiu da primeira onda. Antes essas quatro buscas rodavam em três ondas
   * em fila; nenhuma depende do resultado de outra, então cabem todas juntas. */
  type ResultadoRow = { id_carteira: string; consultor_nome: string; pilar_key: string; score_planilha: number }
  const [{ data: pilaresConfig }, { data: resultadosData }, clientes, linhasCarteira] = await Promise.all([
    latestDate
      ? supabase.from('pillar_config').select('pilar_key, meta, unidade')
      : Promise.resolve({ data: [] as { pilar_key: string; meta: number; unidade: string }[] }),
    latestDate
      ? supabase
          .from('score_consultor_resultados')
          .select('id_carteira, consultor_nome, pilar_key, score_planilha')
          .eq('data_referencia', latestDate)
      : Promise.resolve({ data: [] as ResultadoRow[] }),
    buscarTudo<{ consultor_nome: string; seller_nome: string; seller_id: string }>((opcoes, de, ate) =>
      supabase.from('clientes')
        .select('consultor_nome, seller_nome, seller_id', opcoes)
        .eq('em_carteira', true)
        .range(de, ate),
    ),
    dataCarteira
      ? buscarTudo<{ consultor_nome: string; tpv_mes_atual: number | null; status: string | null }>((opcoes, de, ate) =>
          supabase.from('mp_carteira')
            .select('consultor_nome, tpv_mes_atual, status', opcoes)
            .eq('data_referencia', dataCarteira)
            .range(de, ate),
        )
      : Promise.resolve([]),
  ])

  const metaMap: Record<string, { meta: number; unidade: string }> = Object.fromEntries(
    (pilaresConfig ?? []).map(p => [p.pilar_key, { meta: p.meta, unidade: p.unidade }])
  )
  const resultados: ResultadoRow[] = resultadosData ?? []

  const consultoresMap = new Map<string, { nome: string; scores: Record<string, number>; total: number }>()
  for (const r of resultados) {
    if (!consultoresMap.has(r.id_carteira)) {
      consultoresMap.set(r.id_carteira, { nome: r.consultor_nome, scores: {}, total: 0 })
    }
    const c = consultoresMap.get(r.id_carteira)!
    c.scores[r.pilar_key] = r.score_planilha
    c.total += r.score_planilha
  }

  const carteiras = new Map<string, CarteiraResumo & { nome: string }>()
  const pega = (nome: string) => {
    const k = norm(nome)
    let c = carteiras.get(k)
    if (!c) { c = { nome, clientes: 0, pendentes: 0, tpv: 0, status: {} }; carteiras.set(k, c) }
    return c
  }
  for (const c of clientes) {
    if (!c.consultor_nome) continue
    const e = pega(c.consultor_nome)
    e.clientes++
    if (precisaIdentificar(c.seller_nome, c.seller_id)) e.pendentes++
  }
  for (const l of linhasCarteira) {
    if (!l.consultor_nome) continue
    const e = pega(l.consultor_nome)
    e.tpv += l.tpv_mes_atual ?? 0
    const s = (l.status ?? '').trim().toUpperCase() || '—'
    e.status[s] = (e.status[s] ?? 0) + 1
  }

  // --- Junta: score + carteira, e quem só existe numa das fontes também entra ---
  const ranking = Array.from(consultoresMap.entries())
    .map(([id, c]) => ({
      id: id as string | null,
      nome: c.nome,
      total: Math.min(c.total, 10) as number | null,
      scores: c.scores,
      carteira: carteiras.get(norm(c.nome)) ?? null,
    }))
  const comScore = new Set(ranking.map(r => norm(r.nome)))
  for (const [k, v] of carteiras) {
    if (!comScore.has(k)) {
      ranking.push({ id: null, nome: v.nome, total: null, scores: {}, carteira: v })
    }
  }
  ranking.sort((a, b) => (b.total ?? -1) - (a.total ?? -1))

  const dateDisplay = latestDate
    ? new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null
  const dataCarteiraBR = dataCarteira ? dataCarteira.slice(0, 10).split('-').reverse().join('/') : null

  return (
    <GeralClient
      ranking={ranking}
      dateDisplay={dateDisplay}
      dataCarteiraBR={dataCarteiraBR}
      metaMap={metaMap}
      modoConsultor={profile.role === 'consultor'}
      meuNome={profile.nome || profile.email}
    />
  )
}
