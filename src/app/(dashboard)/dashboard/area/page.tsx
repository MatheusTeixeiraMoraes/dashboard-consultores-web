import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { contarCarteiraPorConsultor } from '@/lib/carteira-por-consultor'
import { redirect } from 'next/navigation'
import AreaClient from './AreaClient'

export default async function AreaPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role === 'consultor') redirect('/dashboard/meu-score')

  const supabase = await createClient()

  const [{ data: uploads }, { data: ultimoSnapshot }] = await Promise.all([
    supabase.from('score_uploads').select('data_referencia').order('data_referencia', { ascending: false }),
    supabase.from('mp_carteira').select('data_referencia').order('data_referencia', { ascending: false }).limit(1),
  ])

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
  const dataCarteira = ultimoSnapshot?.[0]?.data_referencia

  // `data_referencia` já vem gravada em cada linha de resultado (mesmo valor
  // do upload que a gerou) — filtrar direto por ela poupa a ida extra de buscar
  // os uploadIds do dia só para usar em `upload_id in (...)`.
  //
  // A carteira (último snapshot de mp_carteira) só serve para dizer, em quantidade,
  // quanto falta no Awareness e nos Acionáveis: a meta deles depende do tamanho da
  // carteira de cada consultor. Mesmo padrão da tela do Consultor.
  const [{ data: pilaresConfig }, { data: resultados }, carteiraLinhas, { data: faixasAwareness }, { data: faixasAcionaveis }] = await Promise.all([
    supabase.from('pillar_config').select('pilar_key, meta, unidade, tipo_comp, pontos_max, piso_minimo'),
    supabase
      .from('score_consultor_resultados')
      .select('id_carteira, consultor_nome, pilar_key, score_planilha, valor_metrica, metricas')
      .eq('data_referencia', latestDate),
    // Filtrado num único `data_referencia`, `seller_id` sozinho já é ordem TOTAL.
    dataCarteira
      ? buscarTudo<{ consultor_nome: string; status: string | null }>(
          opcoes => supabase.from('mp_carteira').select('consultor_nome, status', opcoes).eq('data_referencia', dataCarteira),
          'seller_id',
        )
      : Promise.resolve([]),
    supabase.from('metas_awareness_faixas').select('min_carteira, meta_respostas'),
    supabase.from('metas_acionaveis_faixas').select('min_carteira, meta_tarefas'),
  ])

  // Acionáveis conta TODAS as linhas da carteira; Awareness só a ATIVA (ATIVO +
  // REATIVADO) — bases diferentes de propósito, ver contarCarteiraPorConsultor.
  const { total: carteiraPorConsultor, ativa: carteiraAtivaPorConsultor } = contarCarteiraPorConsultor(carteiraLinhas)

  return (
    <AreaClient
      dates={dates}
      pilaresConfig={pilaresConfig ?? []}
      initialDate={latestDate}
      initialResultados={resultados ?? []}
      carteiraPorConsultor={carteiraPorConsultor}
      carteiraAtivaPorConsultor={carteiraAtivaPorConsultor}
      faixasAwareness={faixasAwareness ?? []}
      faixasAcionaveis={faixasAcionaveis ?? []}
    />
  )
}
