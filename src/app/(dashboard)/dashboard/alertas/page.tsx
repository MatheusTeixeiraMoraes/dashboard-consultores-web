import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'

const PILARES = ['tpv', 'net_churn', 'acionaveis', 'aderencia', 'awareness', 'produtividade']
const PILAR_LABEL: Record<string, string> = {
  tpv: 'TPV', net_churn: 'Net Churn', acionaveis: 'Acionáveis',
  aderencia: 'Aderência', awareness: 'Awareness', produtividade: 'Produtividade',
}
const PILAR_COLOR: Record<string, string> = {
  tpv: '#60a5fa', net_churn: '#c084fc', acionaveis: '#fb923c',
  aderencia: '#2dd4bf', awareness: '#f472b6', produtividade: '#818cf8',
}

interface Consultor {
  id: string
  nome: string
  total: number
  scores: Record<string, number>
}

function AlertCard({ c }: { c: Consultor }) {
  const isCritico = c.total < 3.0
  const color = isCritico ? '#EF4444' : '#F59E0B'
  const bg = isCritico ? '#FEF2F2' : '#FFFBEB'
  const label = isCritico ? 'CRÍTICO' : 'NA LINHA'

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[#111827] text-sm">{c.nome}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: bg, color }}>
              {label}
            </span>
          </div>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Carteira {c.id} · Score abaixo de {isCritico ? '3,0' : '4,5'} pts
          </p>
        </div>
        <span className="text-2xl font-bold" style={{ color }}>
          {c.total.toFixed(1)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {PILARES.map(p => {
          const score = c.scores[p]
          if (score === undefined) return null
          const pilarColor = PILAR_COLOR[p]
          const notHit = score === 0
          return (
            <div
              key={p}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border"
              style={{
                background: notHit ? '#FEF2F2' : `${pilarColor}12`,
                color: notHit ? '#EF4444' : pilarColor,
                borderColor: notHit ? '#FCA5A5' : `${pilarColor}30`,
              }}
            >
              <span className="font-medium">{PILAR_LABEL[p]}</span>
              <span className="font-bold">{score.toFixed(1)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default async function AlertasPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

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
          <h1 className="text-xl font-bold text-[#111827]">Alertas</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Consultores com performance crítica</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <p className="font-semibold text-[#111827]">Nenhum dado carregado ainda</p>
        </div>
      </div>
    )
  }

  const { data: uploadIds } = await supabase
    .from('score_uploads').select('id').eq('data_referencia', latestDate)

  const idList = (uploadIds ?? []).map(u => u.id)

  const { data: resultados } = await supabase
    .from('score_consultor_resultados')
    .select('id_carteira, consultor_nome, pilar_key, score_planilha')
    .in('upload_id', idList.length > 0 ? idList : ['none'])

  const map = new Map<string, { nome: string; scores: Record<string, number>; total: number }>()
  for (const r of resultados ?? []) {
    if (!map.has(r.id_carteira)) map.set(r.id_carteira, { nome: r.consultor_nome, scores: {}, total: 0 })
    const c = map.get(r.id_carteira)!
    c.scores[r.pilar_key] = r.score_planilha
    c.total += r.score_planilha
  }

  const todos: Consultor[] = Array.from(map.entries())
    .map(([id, c]) => ({ id, ...c, total: Math.min(c.total, 10) }))

  const criticos = todos.filter(c => c.total < 3.0).sort((a, b) => a.total - b.total)
  const naLinha = todos.filter(c => c.total >= 3.0 && c.total < 4.5).sort((a, b) => a.total - b.total)

  const dateDisplay = new Date(latestDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Alertas</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Performance abaixo da meta · {dateDisplay}</p>
      </div>

      {criticos.length === 0 && naLinha.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="font-semibold text-[#10B981]">Nenhum alerta!</p>
          <p className="text-sm text-[#6B7280] mt-1">Toda a equipe está acima da meta mínima.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {criticos.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                <h2 className="text-sm font-semibold text-[#111827]">
                  Crítico
                  <span className="ml-1.5 text-[#6B7280] font-normal">— score abaixo de 3,0 pts</span>
                </h2>
                <span className="ml-auto text-xs font-bold text-[#EF4444] bg-[#FEF2F2] px-2.5 py-0.5 rounded-full">
                  {criticos.length} consultor{criticos.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <div className="space-y-3">
                {criticos.map(c => <AlertCard key={c.id} c={c} />)}
              </div>
            </section>
          )}

          {naLinha.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                <h2 className="text-sm font-semibold text-[#111827]">
                  Na linha
                  <span className="ml-1.5 text-[#6B7280] font-normal">— score entre 3,0 e 4,5 pts</span>
                </h2>
                <span className="ml-auto text-xs font-bold text-[#F59E0B] bg-[#FFFBEB] px-2.5 py-0.5 rounded-full">
                  {naLinha.length} consultor{naLinha.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <div className="space-y-3">
                {naLinha.map(c => <AlertCard key={c.id} c={c} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
