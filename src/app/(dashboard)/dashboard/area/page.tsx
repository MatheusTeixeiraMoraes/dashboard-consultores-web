import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import AreaClient from './AreaClient'

export default async function AreaPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role === 'consultor') redirect('/dashboard/meu-score')

  const supabase = await createClient()

  const { data: uploads } = await supabase
    .from('score_uploads')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })

  const dates = [...new Set((uploads ?? []).map(u => u.data_referencia as string))]

  if (dates.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink">Por Área</h1>
          <p className="text-sm text-ink-muted mt-0.5">Ranking de cada pilar separadamente</p>
        </div>
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Nenhum dado carregado ainda</p>
          <p className="text-sm text-ink-muted mt-1">Vá em <strong className="text-good">Upar Planilha</strong> para começar.</p>
        </div>
      </div>
    )
  }

  const latestDate = dates[0]

  // `data_referencia` já vem gravada em cada linha de resultado (mesmo valor
  // do upload que a gerou) — filtrar direto por ela poupa a ida extra de buscar
  // os uploadIds do dia só para usar em `upload_id in (...)`.
  const [{ data: pilaresConfig }, { data: resultados }] = await Promise.all([
    supabase.from('pillar_config').select('pilar_key, meta, unidade, tipo_comp, pontos_max'),
    supabase
      .from('score_consultor_resultados')
      .select('id_carteira, consultor_nome, pilar_key, score_planilha, valor_metrica, metricas')
      .eq('data_referencia', latestDate),
  ])

  return (
    <AreaClient
      dates={dates}
      pilaresConfig={pilaresConfig ?? []}
      initialDate={latestDate}
      initialResultados={resultados ?? []}
    />
  )
}
