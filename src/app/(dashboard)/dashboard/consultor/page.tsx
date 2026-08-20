import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import ConsultorClient from './ConsultorClient'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { normalizarNome } from '@/lib/convites'

export default async function ConsultorPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role === 'consultor') redirect('/dashboard/meu-score')

  const supabase = await createClient()

  const { data: uploads } = await supabase
    .from('score_uploads')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1)

  const latestDate = uploads?.[0]?.data_referencia ?? null

  if (!latestDate) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink">Consultor</h1>
          <p className="text-sm text-ink-muted mt-0.5">Performance individual</p>
        </div>
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Nenhum dado carregado ainda</p>
          <p className="text-sm text-ink-muted mt-1">Vá em <strong className="text-good">Upar Planilha</strong> para começar.</p>
        </div>
      </div>
    )
  }

  // Tamanho da carteira pra meta de Acionáveis (metaAcionaveis em
  // lib/pilares.ts): é `mp_carteira` — a Planilha Ação Oportunidades, fonte
  // real que o MP usa — e NÃO `clientes` (a tabela do app, que só tem uma
  // fração disso: validado contra os scores reais, `clientes` subestimava a
  // carteira de um consultor em 5x).
  const { data: ultimoSnapshot } = await supabase
    .from('mp_carteira')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1)
  const dataCarteira = ultimoSnapshot?.[0]?.data_referencia

  // `data_referencia` já vem gravada em cada linha de resultado (mesmo valor
  // do upload que a gerou) — filtrar direto por ela poupa a ida extra de buscar
  // os uploadIds do dia só para usar em `upload_id in (...)`.
  const [{ data: pilaresConfig }, { data: resultados }, carteiraLinhas] = await Promise.all([
    supabase.from('pillar_config').select('pilar_key, pontos_max, meta, tipo_comp, unidade'),
    supabase
      .from('score_consultor_resultados')
      .select('id_carteira, consultor_nome, pilar_key, score_planilha, metricas, valor_metrica')
      .eq('data_referencia', latestDate),
    // Busca todo mundo de uma vez (admin/dono/lider veem tudo via RLS) e conta
    // por consultor no servidor, em vez de uma ida por consultor selecionado.
    dataCarteira
      ? buscarTudo<{ consultor_nome: string }>((opcoes, de, ate) =>
          supabase.from('mp_carteira').select('consultor_nome', opcoes).eq('data_referencia', dataCarteira).range(de, ate),
        )
      : Promise.resolve([]),
  ])

  const carteiraPorConsultor: Record<string, number> = {}
  for (const c of carteiraLinhas) {
    const chave = normalizarNome(c.consultor_nome)
    carteiraPorConsultor[chave] = (carteiraPorConsultor[chave] ?? 0) + 1
  }

  const dateDisplay = new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <ConsultorClient
      resultados={resultados ?? []}
      dateDisplay={dateDisplay}
      dataReferencia={latestDate}
      pilaresConfig={pilaresConfig ?? []}
      carteiraPorConsultor={carteiraPorConsultor}
    />
  )
}
