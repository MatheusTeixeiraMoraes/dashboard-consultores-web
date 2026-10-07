'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { FaixaAwareness } from '@/lib/pilares'
import { registrarEvento } from '@/lib/atividade'

interface FaixaEdit { min_carteira: string; meta_respostas: string }

/**
 * Editor das faixas de meta do Awareness (`metas_awareness_faixas`): a partir de
 * quantos clientes ATIVOS na carteira, quantas respostas de pesquisa valem a
 * nota cheia. O MP muda isso quando quiser — sem este editor, cada mudança
 * exigiria código e deploy. Mesmo molde do bloco de Acionáveis em MetasClient.
 *
 * ponytail: duplica o editor de Acionáveis em vez de generalizá-lo, pra não mexer
 * numa tela que funciona; unificar os dois quando surgir um terceiro.
 */
export default function FaixasAwareness({ faixasIniciais, profileId }: {
  faixasIniciais: FaixaAwareness[]
  profileId: string
}) {
  const router = useRouter()
  const [faixas, setFaixas] = useState<FaixaEdit[]>(
    [...faixasIniciais]
      .sort((a, b) => a.min_carteira - b.min_carteira)
      .map(f => ({ min_carteira: String(f.min_carteira), meta_respostas: String(f.meta_respostas) })),
  )
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState('')

  function adicionar() {
    setFaixas(prev => [...prev, { min_carteira: '', meta_respostas: '' }])
  }

  function remover(i: number) {
    // Sempre pelo menos 1 faixa: sem nenhuma, a meta de todo mundo cai no piso.
    if (faixas.length <= 1) return
    setFaixas(prev => prev.filter((_, idx) => idx !== i))
  }

  function atualizar(i: number, campo: keyof FaixaEdit, valor: string) {
    setFaixas(prev => prev.map((f, idx) => idx === i ? { ...f, [campo]: valor } : f))
  }

  async function salvar() {
    const parsed = faixas.map(f => ({
      min_carteira: parseInt(f.min_carteira, 10),
      meta_respostas: parseInt(f.meta_respostas, 10),
    }))

    if (parsed.length === 0) {
      setErro('Cadastre pelo menos uma faixa.')
      return
    }
    if (parsed.some(f => isNaN(f.min_carteira) || f.min_carteira <= 0 || isNaN(f.meta_respostas) || f.meta_respostas <= 0)) {
      setErro('Todas as faixas precisam de números válidos e maiores que zero.')
      return
    }
    if (new Set(parsed.map(f => f.min_carteira)).size !== parsed.length) {
      setErro('Não repita o mesmo "a partir de" em duas faixas.')
      return
    }

    setSalvando(true)
    setErro('')

    const supabase = createClient()
    // Grava as novas ANTES de apagar as que saíram: se a segunda etapa falhar,
    // sobra faixa velha (e o erro aparece) — nunca a tabela vazia, que mandaria
    // a meta de todo mundo pro piso sem ninguém perceber.
    // ponytail: dois passos sem transação; num corte entre eles ficam as faixas
    // velhas junto com as novas e o erro aparece. RPC transacional se isso incomodar.
    const agora = new Date().toISOString()
    const { error: upErr } = await supabase.from('metas_awareness_faixas').upsert(
      parsed.map(f => ({ ...f, updated_at: agora, updated_by: profileId })),
      { onConflict: 'min_carteira' },
    )
    if (upErr) {
      setSalvando(false)
      setErro(upErr.message)
      return
    }
    const { error: delErr } = await supabase.from('metas_awareness_faixas')
      .delete()
      .not('min_carteira', 'in', `(${parsed.map(f => f.min_carteira).join(',')})`)
    setSalvando(false)
    if (delErr) {
      setErro(delErr.message)
      return
    }

    registrarEvento({
      tipo: 'meta_awareness_faixas_alterada',
      alvoTipo: 'meta',
      alvoId: 'awareness',
      alvoDescricao: 'Awareness',
      detalhes: { faixas: parsed },
    })

    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
    router.refresh()
  }

  return (
    <div className="glass rounded-2xl border border-line p-5 mt-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">Faixas de meta — Awareness</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          A partir de quantos clientes <strong className="text-ink">ativos</strong> na carteira (ATIVO e
          REATIVADO — churn e inativo não contam), quantas respostas de pesquisa valem a nota cheia
          (tudo ou nada). Vale pra todo mundo. O piso mínimo fica no card do Awareness, acima — e a
          meta de uma faixa nunca vale menos que ele.
        </p>
      </div>

      <div className="space-y-2 mb-4">
        {faixas.map((f, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-ink-muted flex-shrink-0">A partir de</span>
            <input
              type="number" min="1" value={f.min_carteira}
              onChange={e => atualizar(i, 'min_carteira', e.target.value)}
              className="w-20 border border-field-line rounded-lg px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-xs text-ink-muted flex-shrink-0">clientes ativos → meta:</span>
            <input
              type="number" min="1" value={f.meta_respostas}
              onChange={e => atualizar(i, 'meta_respostas', e.target.value)}
              className="w-20 border border-field-line rounded-lg px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-xs text-ink-muted flex-shrink-0">respostas de pesquisa</span>
            <button
              onClick={() => remover(i)}
              disabled={faixas.length <= 1}
              className="ml-auto text-xs font-medium text-bad hover:bg-bad-bg px-2 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <button
          onClick={adicionar}
          className="text-xs font-medium text-primary hover:text-primary-dk transition-colors"
        >
          + Adicionar faixa
        </button>
      </div>

      {erro && (
        <p className="text-[11px] text-bad bg-bad-bg rounded-lg px-2.5 py-1.5 mb-3">{erro}</p>
      )}

      <button
        onClick={salvar}
        disabled={salvando}
        className={`w-full sm:w-auto px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
          salvo
            ? 'bg-good-bg text-good border border-good/30'
            : 'bg-primary hover:bg-primary-dk text-white disabled:opacity-60'
        }`}
      >
        {salvando ? 'Salvando...' : salvo ? '✓ Salvo' : 'Salvar faixas'}
      </button>
    </div>
  )
}
