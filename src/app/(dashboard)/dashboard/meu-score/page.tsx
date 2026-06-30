import { getProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function MeuScorePage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'consultor') redirect('/dashboard')

  if (!profile.id_carteira) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#111827]">Meu Score</h1>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <p className="font-semibold text-[#111827]">ID Carteira não configurado</p>
          <p className="text-sm text-[#6B7280] mt-1">Solicite ao administrador que vincule seu ID de carteira ao perfil.</p>
        </div>
      </div>
    )
  }

  const supabase = await createClient()

  // Busca os resultados mais recentes por pilar
  const { data: resultados } = await supabase
    .from('score_consultor_resultados')
    .select('*, score_uploads!inner(mes_referencia, uploaded_at)')
    .eq('id_carteira', profile.id_carteira)
    .order('mes_referencia', { ascending: false })

  const { data: pilares } = await supabase.from('pillar_config').select('*')

  // Agrupa por mês e pega o mais recente por pilar
  const porMes: Record<string, typeof resultados> = {}
  for (const r of resultados ?? []) {
    const mes = r.mes_referencia ?? 'sem-data'
    if (!porMes[mes]) porMes[mes] = []
    porMes[mes]!.push(r)
  }

  const meses = Object.keys(porMes).sort().reverse()
  const ultimoMes = meses[0]
  const dadosUltimo = porMes[ultimoMes] ?? []

  const scoreTotal = dadosUltimo.reduce((s: number, r: { score_planilha: number }) => s + (r.score_planilha || 0), 0)
  const scoreCapped = Math.min(scoreTotal, 10)

  function statusColor(score: number) {
    if (score >= 4.5) return { bg: '#F0FDF4', text: '#10B981', label: 'Acima da meta' }
    if (score >= 3.0) return { bg: '#FFFBEB', text: '#F59E0B', label: 'Na linha' }
    return { bg: '#FEF2F2', text: '#EF4444', label: 'Crítico' }
  }

  const status = statusColor(scoreCapped)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Meu Score</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          {profile.nome || profile.email} · Carteira {profile.id_carteira}
        </p>
      </div>

      {dadosUltimo.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <p className="font-semibold text-[#111827]">Nenhum dado disponível ainda</p>
          <p className="text-sm text-[#6B7280] mt-1">Aguarde o upload das planilhas pelo administrador.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hero card */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#6B7280] mb-1">Score Geral · {ultimoMes ? new Date(ultimoMes + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : ''}</p>
                <p className="text-5xl font-bold text-[#111827]">{scoreCapped.toFixed(1)}<span className="text-2xl text-[#6B7280] font-normal">/10</span></p>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1.5 rounded-xl text-sm font-semibold" style={{ background: status.bg, color: status.text }}>
                  {status.label}
                </span>
                <p className="text-xs text-[#6B7280] mt-2">Meta mínima: 4,5</p>
              </div>
            </div>
            {/* Barra de progresso */}
            <div className="mt-4 h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${(scoreCapped / 10) * 100}%`, background: status.text }}
              />
            </div>
          </div>

          {/* Pilares */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(pilares ?? []).map((pilar: { pilar_key: string; label: string; meta: number; pontos_max: number; unidade: string }) => {
              const resultado = dadosUltimo.find((r: { pilar_key: string }) => r.pilar_key === pilar.pilar_key)
              const semDados = !resultado
              const score = resultado?.score_planilha ?? 0
              const valor = resultado?.valor_metrica ?? 0
              const bateu = !semDados && (pilar.unidade === '%' ? valor >= pilar.meta : valor >= pilar.meta)
              const pct = Math.min((score / pilar.pontos_max) * 100, 100)

              return (
                <div key={pilar.pilar_key} className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
                  <div className="flex items-start justify-between mb-3">
                    <p className="text-sm font-semibold text-[#111827]">{pilar.label}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      semDados ? 'bg-gray-100 text-gray-400'
                      : bateu ? 'bg-[#F0FDF4] text-[#10B981]' : 'bg-[#FEF2F2] text-[#EF4444]'
                    }`}>
                      {semDados ? 'Sem dados' : bateu ? '✓ Meta' : '✗ Abaixo'}
                    </span>
                  </div>

                  <div className="flex items-end justify-between mb-2">
                    <p className="text-2xl font-bold text-[#111827]">
                      {semDados ? '—' : score.toFixed(1)}
                      <span className="text-sm text-[#6B7280] font-normal">/{pilar.pontos_max}</span>
                    </p>
                    <p className="text-xs text-[#6B7280]">
                      {semDados ? '' : `${valor}${pilar.unidade === '%' ? '%' : ''} · meta ${pilar.meta}${pilar.unidade === '%' ? '%' : ''}`}
                    </p>
                  </div>

                  <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${semDados ? 0 : pct}%`,
                      background: semDados ? '#E5E7EB' : bateu ? '#10B981' : '#EF4444'
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
