'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { PillarConfig } from '@/lib/types'
import type { FaixaAcionaveis } from '@/lib/pilares'
import { registrarEvento } from '@/lib/atividade'

const CAT_LABEL: Record<string, string> = { atuacao: 'Atuação', resultado: 'Resultado' }
const CAT_COLOR: Record<string, string> = { atuacao: 'var(--color-primary)', resultado: 'var(--color-good)' }

/** 'numero' é o enum do banco, não uma unidade pra mostrar em tela. */
function sufixoUnidade(unidade: string) {
  return unidade === '%' ? '%' : ''
}

interface FaixaEdit { min_carteira: string; meta_tarefas: string }

export default function MetasClient({ pilares, profileId, faixasAcionaveis }: {
  pilares: PillarConfig[]
  profileId: string
  faixasAcionaveis: FaixaAcionaveis[]
}) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(pilares.map(p => [p.pilar_key, String(p.meta)]))
  )
  const [pesos, setPesos] = useState<Record<string, string>>(
    Object.fromEntries(pilares.map(p => [p.pilar_key, String(p.pontos_max)]))
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [erro, setErro] = useState<Record<string, string>>({})

  const [faixas, setFaixas] = useState<FaixaEdit[]>(
    [...faixasAcionaveis]
      .sort((a, b) => a.min_carteira - b.min_carteira)
      .map(f => ({ min_carteira: String(f.min_carteira), meta_tarefas: String(f.meta_tarefas) })),
  )
  const [savingFaixas, setSavingFaixas] = useState(false)
  const [savedFaixas, setSavedFaixas] = useState(false)
  const [erroFaixas, setErroFaixas] = useState('')

  async function handleSave(pilar: PillarConfig) {
    const novaMeta = parseFloat(values[pilar.pilar_key])
    const novoPeso = parseFloat(pesos[pilar.pilar_key])
    if (isNaN(novaMeta)) {
      setErro(prev => ({ ...prev, [pilar.pilar_key]: 'Informe um número válido para a meta.' }))
      return
    }
    if (isNaN(novoPeso) || novoPeso <= 0) {
      setErro(prev => ({ ...prev, [pilar.pilar_key]: 'Informe um peso válido (maior que zero).' }))
      return
    }

    setSaving(pilar.pilar_key)
    setErro(prev => ({ ...prev, [pilar.pilar_key]: '' }))

    const supabase = createClient()
    const { error } = await supabase.from('pillar_config').update({
      meta: novaMeta,
      pontos_max: novoPeso,
      updated_at: new Date().toISOString(),
      updated_by: profileId,
    }).eq('pilar_key', pilar.pilar_key)

    setSaving(null)

    if (error) {
      setErro(prev => ({ ...prev, [pilar.pilar_key]: error.message }))
      return
    }

    // Dois eventos distintos, cada um só quando o campo de fato mudou — assim
    // trocar só a meta não gera ruído dizendo que o peso "mudou" de X pra X.
    if (novaMeta !== pilar.meta) {
      registrarEvento({
        tipo: 'meta_alterada',
        alvoTipo: 'meta',
        alvoId: pilar.pilar_key,
        alvoDescricao: pilar.label,
        detalhes: { de: pilar.meta, para: novaMeta, unidade: pilar.unidade },
      })
    }
    if (novoPeso !== pilar.pontos_max) {
      registrarEvento({
        tipo: 'peso_pilar_alterado',
        alvoTipo: 'meta',
        alvoId: pilar.pilar_key,
        alvoDescricao: pilar.label,
        detalhes: { de: pilar.pontos_max, para: novoPeso },
      })
    }

    setSaved(pilar.pilar_key)
    setTimeout(() => setSaved(null), 2000)
    router.refresh()
  }

  function adicionarFaixa() {
    setFaixas(prev => [...prev, { min_carteira: '', meta_tarefas: '' }])
  }

  function removerFaixa(i: number) {
    // Sempre pelo menos 1 faixa: sem nenhuma, metaAcionaveis() cai no
    // fallback fixo de 6 tarefas pra todo mundo, que é pior que qualquer faixa.
    if (faixas.length <= 1) return
    setFaixas(prev => prev.filter((_, idx) => idx !== i))
  }

  function atualizarFaixa(i: number, campo: keyof FaixaEdit, valor: string) {
    setFaixas(prev => prev.map((f, idx) => idx === i ? { ...f, [campo]: valor } : f))
  }

  async function salvarFaixas() {
    const parsed = faixas.map(f => ({
      min_carteira: parseInt(f.min_carteira, 10),
      meta_tarefas: parseInt(f.meta_tarefas, 10),
    }))

    if (parsed.some(f => isNaN(f.min_carteira) || f.min_carteira <= 0 || isNaN(f.meta_tarefas) || f.meta_tarefas <= 0)) {
      setErroFaixas('Todas as faixas precisam de números válidos e maiores que zero.')
      return
    }
    const minsUnicos = new Set(parsed.map(f => f.min_carteira))
    if (minsUnicos.size !== parsed.length) {
      setErroFaixas('Não repita o mesmo "a partir de" em duas faixas.')
      return
    }

    setSavingFaixas(true)
    setErroFaixas('')

    const supabase = createClient()
    // Sem PK estável do lado do cliente pra fazer upsert linha-a-linha (o
    // admin pode ter adicionado/removido faixas) — substitui tudo de uma vez.
    // Tabela de config de baixo tráfego, lida só ao carregar estas telas: o
    // instante entre apagar e inserir não é problema real aqui.
    const { error: delErr } = await supabase.from('metas_acionaveis_faixas').delete().gte('min_carteira', 0)
    if (delErr) {
      setSavingFaixas(false)
      setErroFaixas(delErr.message)
      return
    }
    const { error: insErr } = await supabase.from('metas_acionaveis_faixas').insert(
      parsed.map(f => ({ ...f, updated_by: profileId })),
    )
    setSavingFaixas(false)
    if (insErr) {
      setErroFaixas(insErr.message)
      return
    }

    registrarEvento({
      tipo: 'meta_acionaveis_faixas_alterada',
      alvoTipo: 'meta',
      alvoId: 'acionaveis',
      alvoDescricao: 'Acionáveis Comerciais',
      detalhes: { faixas: parsed },
    })

    setSavedFaixas(true)
    setTimeout(() => setSavedFaixas(false), 2000)
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
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: `${CAT_COLOR[cat]}15`, color: CAT_COLOR[cat] }}>
                        {CAT_LABEL[cat]}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {pilar.pilar_key === 'acionaveis' ? (
                        // Acionáveis (19/08/2026 em diante): deixou de ser percentual.
                        // Virou tudo-ou-nada — quantidade fixa de tarefas revertidas,
                        // que varia pelo tamanho da carteira de cada consultor. Não tem
                        // UM número global que valha pra todo mundo, então o campo de
                        // meta editável (que ainda seria só percentual) some daqui — a
                        // configuração de verdade é a seção "Faixas de meta" no fim
                        // desta página.
                        <div className="bg-card-2 rounded-xl p-3">
                          <p className="text-xs text-ink-dim font-medium mb-1">Meta: quantidade fixa por carteira</p>
                          <p className="text-[11px] text-ink-muted leading-relaxed">
                            Ajuste as faixas na seção <strong className="text-ink">Faixas de meta —
                            Acionáveis Comerciais</strong>, no fim desta página.
                          </p>
                        </div>
                      ) : (
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
                              /* min-w-0: input tem largura intrínseca (~20 caracteres) e
                                 min-width:auto, então `flex-1` não o encolhe — era ele
                                 que empurrava a página pro lado em tela estreita. */
                              className="flex-1 min-w-0 border border-field-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <span className="text-sm text-ink-muted w-4 flex-shrink-0">{sufixoUnidade(pilar.unidade)}</span>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="text-xs text-ink-muted mb-1 block">
                          Peso{' '}
                          <span className="text-ink-faint">(quanto este pilar vale na nota final)</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={pesos[pilar.pilar_key]}
                            onChange={e => setPesos(prev => ({ ...prev, [pilar.pilar_key]: e.target.value }))}
                            className="flex-1 min-w-0 border border-field-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <span className="text-sm text-ink-muted w-4 flex-shrink-0">pts</span>
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

      {/* Faixas de Acionáveis: o MP manda uma quantidade nova todo mês — sem
          isto, cada mudança exigia editar código e fazer deploy. */}
      <div className="glass rounded-2xl border border-line p-5 mt-6">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-ink">Faixas de meta — Acionáveis Comerciais</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            A partir de quantos clientes na carteira, quantas tarefas revertidas valem a meta
            cheia (tudo ou nada — sem meio termo). Vale pra todo mundo.
          </p>
        </div>

        <div className="space-y-2 mb-4">
          {faixas.map((f, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-ink-muted flex-shrink-0">A partir de</span>
              <input
                type="number" min="1" value={f.min_carteira}
                onChange={e => atualizarFaixa(i, 'min_carteira', e.target.value)}
                className="w-20 border border-field-line rounded-lg px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-xs text-ink-muted flex-shrink-0">clientes → meta:</span>
              <input
                type="number" min="1" value={f.meta_tarefas}
                onChange={e => atualizarFaixa(i, 'meta_tarefas', e.target.value)}
                className="w-20 border border-field-line rounded-lg px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-xs text-ink-muted flex-shrink-0">tarefas revertidas</span>
              <button
                onClick={() => removerFaixa(i)}
                disabled={faixas.length <= 1}
                className="ml-auto text-xs font-medium text-bad hover:bg-bad-bg px-2 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remover
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={adicionarFaixa}
          className="text-xs font-medium text-primary hover:text-primary-dk transition-colors mb-4"
        >
          + Adicionar faixa
        </button>

        {erroFaixas && (
          <p className="text-[11px] text-bad bg-bad-bg rounded-lg px-2.5 py-1.5 mb-3">{erroFaixas}</p>
        )}

        <button
          onClick={salvarFaixas}
          disabled={savingFaixas}
          className={`w-full sm:w-auto px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
            savedFaixas
              ? 'bg-good-bg text-good border border-good/30'
              : 'bg-primary hover:bg-primary-dk text-white disabled:opacity-60'
          }`}
        >
          {savingFaixas ? 'Salvando...' : savedFaixas ? '✓ Salvo' : 'Salvar faixas'}
        </button>
      </div>
    </div>
  )
}
