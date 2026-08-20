import { getProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MeuScoreClient from './MeuScoreClient'

export default async function MeuScorePage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'consultor') redirect('/dashboard')

  if (!profile.id_carteira) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink">Meu Desempenho</h1>
        </div>
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-warn-bg flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-warn)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <p className="font-semibold text-ink">ID Carteira não configurado</p>
          <p className="text-sm text-ink-muted mt-1">Solicite ao administrador que vincule seu ID de carteira ao perfil.</p>
        </div>
      </div>
    )
  }

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
          <h1 className="text-xl font-bold text-ink">Meu Desempenho</h1>
          <p className="text-sm text-ink-muted mt-0.5">{profile.nome || profile.email} · Carteira {profile.id_carteira}</p>
        </div>
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Nenhum dado disponível ainda</p>
          <p className="text-sm text-ink-muted mt-1">Aguarde o upload das planilhas pelo administrador.</p>
        </div>
      </div>
    )
  }

  // Tamanho da carteira pra meta de Acionáveis (metaAcionaveis em lib/pilares.ts):
  // é `mp_carteira` — a Planilha Ação Oportunidades, fonte real que o MP usa —
  // e NÃO `clientes` (a tabela do app, que só tem uma fração disso: validado
  // contra os scores reais, `clientes` subestimava a carteira de um consultor
  // em 5x). RLS já restringe `mp_carteira` ao que é deste consultor.
  const { data: ultimoSnapshot } = await supabase
    .from('mp_carteira')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1)
  const dataCarteira = ultimoSnapshot?.[0]?.data_referencia

  // `data_referencia` já vem gravada em cada linha de resultado (mesmo valor
  // do upload que a gerou) — filtrar direto por ela poupa a ida extra de buscar
  // os uploadIds do dia só para usar em `upload_id in (...)`.
  const [{ data: pilaresConfig }, { data: resultados }, { count: carteiraSize }, { data: faixasAcionaveis }] = await Promise.all([
    supabase.from('pillar_config').select('pilar_key, pontos_max, meta, tipo_comp, unidade'),
    supabase
      .from('score_consultor_resultados')
      .select('id_carteira, consultor_nome, pilar_key, score_planilha, metricas, valor_metrica')
      .eq('data_referencia', latestDate)
      .eq('id_carteira', profile.id_carteira),
    dataCarteira
      ? supabase.from('mp_carteira').select('*', { count: 'exact', head: true }).eq('data_referencia', dataCarteira)
      : Promise.resolve({ count: null }),
    supabase.from('metas_acionaveis_faixas').select('min_carteira, meta_tarefas'),
  ])

  const dateDisplay = new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <MeuScoreClient
      resultados={resultados ?? []}
      dateDisplay={dateDisplay}
      dataReferencia={latestDate}
      pilaresConfig={pilaresConfig ?? []}
      profileNome={profile.nome || profile.email}
      idCarteira={profile.id_carteira}
      carteiraSize={carteiraSize ?? undefined}
      faixasAcionaveis={faixasAcionaveis ?? []}
    />
  )
}
