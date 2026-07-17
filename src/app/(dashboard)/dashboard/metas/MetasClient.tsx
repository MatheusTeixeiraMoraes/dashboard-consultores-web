'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { PillarConfig } from '@/lib/types'

const CAT_LABEL: Record<string, string> = { atuacao: 'Atuação', resultado: 'Resultado' }
const CAT_COLOR: Record<string, string> = { atuacao: 'var(--color-primary)', resultado: '#3ECF8E' }

/** 'numero' é o enum do banco, não uma unidade pra mostrar em tela. */
function sufixoUnidade(unidade: string) {
  return unidade === '%' ? '%' : ''
}

export default function MetasClient({ pilares, profileId }: { pilares: PillarConfig[]; profileId: string }) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(pilares.map(p => [p.pilar_key, String(p.meta)]))
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [erro, setErro] = useState<Record<string, string>>({})

  async function handleSave(pilar: PillarConfig) {
    const novaMeta = parseFloat(values[pilar.pilar_key])
    if (isNaN(novaMeta)) {
      setErro(prev => ({ ...prev, [pilar.pilar_key]: 'Informe um número válido.' }))
      return
    }

    setSaving(pilar.pilar_key)
    setErro(prev => ({ ...prev, [pilar.pilar_key]: '' }))

    const supabase = createClient()
    const { error } = await supabase.from('pillar_config').update({
      meta: novaMeta,
      updated_at: new Date().toISOString(),
      updated_by: profileId,
    }).eq('pilar_key', pilar.pilar_key)

    setSaving(null)

    if (error) {
      setErro(prev => ({ ...prev, [pilar.pilar_key]: error.message }))
      return
    }

    setSaved(pilar.pilar_key)
    setTimeout(() => setSaved(null), 2000)
    router.refresh()
  }

  const grupos = ['atuacao', 'resultado'] as const

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Configurar Metas</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          A meta não altera o score — esse vem pronto da planilha. Ela define o selo
          &quot;Meta atingida&quot; e o &quot;Faltam X&quot; exibidos nos cards.
        </p>
      </div>

      <div className="space-y-6">
        {grupos.map(cat => {
          const grupo = pilares.filter(p => p.categoria === cat)
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLOR[cat] }} />
                <h2 className="text-sm font-semibold text-ink">
                  Pilares de {CAT_LABEL[cat]}
                  <span className="ml-2 text-ink-muted font-normal text-xs">
                    ({grupo.reduce((s, p) => s + p.pontos_max, 0).toFixed(1)} pts no total)
                  </span>
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grupo.map(pilar => (
                  <div key={pilar.pilar_key} className="glass rounded-2xl border border-line p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-semibold text-ink">{pilar.label}</p>
                        <p className="text-xs text-ink-muted mt-0.5">Peso: {pilar.pontos_max} pts</p>
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: `${CAT_COLOR[cat]}15`, color: CAT_COLOR[cat] }}>
                        {CAT_LABEL[cat]}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-ink-muted mb-1 block">
                          Meta atual{' '}
                          <span className="text-ink-faint">
                            (atinge com {pilar.tipo_comp === 'le' ? '≤' : '≥'})
                          </span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={values[pilar.pilar_key]}
                            onChange={e => setValues(prev => ({ ...prev, [pilar.pilar_key]: e.target.value }))}
                            className="flex-1 border border-field-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <span className="text-sm text-ink-muted w-4">{sufixoUnidade(pilar.unidade)}</span>
                        </div>
                      </div>

                      {erro[pilar.pilar_key] && (
                        <p className="text-[11px] text-bad bg-bad-bg rounded-lg px-2.5 py-1.5">
                          {erro[pilar.pilar_key]}
                        </p>
                      )}

                      <button
                        onClick={() => handleSave(pilar)}
                        disabled={saving === pilar.pilar_key}
                        className={`w-full py-2 rounded-xl text-sm font-medium transition-colors ${
                          saved === pilar.pilar_key
                            ? 'bg-good-bg text-good border border-good/30'
                            : 'bg-primary hover:bg-primary-dk text-white disabled:opacity-60'
                        }`}
                      >
                        {saving === pilar.pilar_key ? 'Salvando...' : saved === pilar.pilar_key ? '✓ Salvo' : 'Salvar meta'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
