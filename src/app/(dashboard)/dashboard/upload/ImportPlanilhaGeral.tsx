'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  lerPlanilhaGeral, acionaveisDesconhecidos, ErroPlanilha, type Lido,
} from '@/lib/planilha-geral'

const LOTE = 500   // mesmo lote do import da carteira

/**
 * Tabelas de SNAPSHOT que o import escreve direto. `clientes` NÃO está aqui: o
 * import nunca faz insert/update/delete direto em `clientes`. A sincronização
 * de membership/dono acontece via a função reconciliar_carteira (RPC), que
 * escreve APENAS colunas estruturais e nunca o contato do cliente.
 * separacao-planilhas.test.mjs guarda esse invariante.
 */
const TABELAS = ['mp_acionaveis', 'mp_carteira'] as const

/** O que a reconciliação mudaria (ou mudou) em `clientes`. */
interface Diff {
  aplicado: boolean
  bloqueado: boolean
  total_snapshot: number
  total_anterior: number
  stubs: number
  reatribuidos: number
  ocultados: number
  reativados: number
  sem_perfil: string[]
}

interface Estado {
  status: 'idle' | 'lendo' | 'salvando' | 'previa' | 'aplicando' | 'ok' | 'erro'
  msg?: string
  lido?: Lido
  diff?: Diff
  progresso?: string
}

/**
 * Import da "Planilha Geral" do MP — a FONTE DA VERDADE da carteira.
 *
 * Grava o snapshot em mp_carteira/mp_acionaveis e depois RECONCILIA `clientes`:
 * cria stub para quem é novo, transfere o dono de quem mudou de consultor, e
 * esconde quem saiu da carteira. Isso é feito pela função reconciliar_carteira,
 * que só toca colunas estruturais — o contato digitado pelo consultor (telefone,
 * CPF, endereço, GPS) NUNCA é sobrescrito.
 *
 * A reconciliação NÃO é automática: mostra o preview do que vai mudar e espera
 * confirmação. Se o snapshot encolheu demais (planilha errada/parcial), o piso
 * de sanidade bloqueia e exige revisão.
 */
export default function ImportPlanilhaGeral({ data }: { data: string }) {
  const router = useRouter()
  const [e, setE] = useState<Estado>({ status: 'idle' })
  const input = useRef<HTMLInputElement>(null)

  async function importar(file: File) {
    setE({ status: 'lendo' })
    let lido: Lido
    try {
      const { read, utils } = await import('xlsx')
      const wb = read(await file.arrayBuffer(), { type: 'array' })
      const linhas: Record<string, unknown>[] = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      lido = lerPlanilhaGeral(linhas)
    } catch (err) {
      setE({ status: 'erro', msg: err instanceof ErroPlanilha ? err.message : `Não consegui ler o arquivo: ${(err as Error).message}` })
      return
    }

    setE({ status: 'salvando', lido, progresso: 'limpando importação anterior…' })
    const supabase = createClient()

    for (const tabela of TABELAS) {
      const { error } = await supabase.from(tabela).delete().eq('data_referencia', data)
      if (error) { setE({ status: 'erro', msg: `Erro ao limpar ${tabela}: ${error.message}`, lido }); return }
    }

    const comData = <T,>(xs: T[]) => xs.map(x => ({ ...x, data_referencia: data }))
    const gravar = async (tabela: string, linhas: object[], rotulo: string) => {
      for (let i = 0; i < linhas.length; i += LOTE) {
        setE(s => ({ ...s, progresso: `${rotulo}: ${Math.min(i + LOTE, linhas.length)}/${linhas.length}` }))
        const { error } = await supabase.from(tabela).insert(linhas.slice(i, i + LOTE))
        if (error) throw new Error(`${tabela}: ${error.message}`)
      }
    }

    try {
      await gravar('mp_carteira', comData(lido.clientes), 'clientes')
      await gravar('mp_acionaveis', comData(lido.acoes), 'acionáveis')
    } catch (err) {
      setE({ status: 'erro', msg: (err as Error).message, lido })
      return
    }

    // Dry-run: mede o que a reconciliação MUDARIA, sem aplicar. É o preview que
    // impede a planilha errada de esconder metade da carteira em silêncio.
    setE(s => ({ ...s, progresso: 'conferindo o impacto na carteira…' }))
    const { data: diff, error: erroRec } = await supabase.rpc('reconciliar_carteira', { p_data: data, p_aplicar: false })
    if (erroRec) { setE({ status: 'erro', msg: `Snapshot salvo, mas não consegui conferir a carteira: ${erroRec.message}`, lido }); return }

    setE({ status: 'previa', lido, diff: diff as Diff })
    router.refresh()   // Acionáveis/Queda de TPV já refletem o snapshot novo
    if (input.current) input.current.value = ''
  }

  async function aplicarReconciliacao(forcar: boolean) {
    setE(s => ({ ...s, status: 'aplicando' }))
    const supabase = createClient()
    // forcar só quando o piso bloqueou e o humano confirmou olhando o preview.
    const { data: diff, error } = await supabase.rpc('reconciliar_carteira', { p_data: data, p_aplicar: true, p_forcar: forcar })
    if (error) { setE(s => ({ ...s, status: 'erro', msg: `Erro ao aplicar: ${error.message}` })); return }
    setE(s => ({ ...s, status: 'ok', diff: diff as Diff }))
    router.refresh()
  }

  const ocupado = e.status === 'lendo' || e.status === 'salvando' || e.status === 'aplicando'
  const desconhecidos = e.lido ? acionaveisDesconhecidos(e.lido.totaisPorAcionavel) : []
  const diff = e.diff

  return (
    <div className="glass rounded-2xl border border-line p-5 border-l-4 border-l-primary">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-8 h-8 rounded-lg bg-primary/15 grid place-items-center flex-shrink-0 text-primary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11H3v10h6V11zM15 3H9v18h6V3zM21 7h-6v14h6V7z" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Planilha Ação Oportunidades</p>
          <p className="text-[11px] text-ink-muted">A fonte da carteira — Acionáveis, Clientes e rotas</p>
        </div>
      </div>

      <p className="text-xs text-ink-muted my-3 leading-relaxed">
        Define quem está na carteira e de quem é cada cliente. Cria os novos, transfere os que
        mudaram de consultor e esconde quem saiu — sem nunca apagar o contato que o consultor digitou.
      </p>

      {e.status === 'ok' && (
        <div className="text-xs bg-good-bg text-good rounded-lg px-3 py-2 mb-3">
          ✓ Carteira reconciliada
          {diff && <> · {nBR(diff.stubs)} novos, {nBR(diff.reatribuidos)} transferidos, {nBR(diff.ocultados)} escondidos</>}
        </div>
      )}

      {e.status === 'erro' && (
        <div className="text-xs bg-bad-bg text-bad rounded-lg px-3 py-2 mb-3 whitespace-pre-wrap">{e.msg}</div>
      )}

      {ocupado && (
        <div className="text-xs text-ink-muted bg-card-2 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <span className="animate-spin inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
          {e.status === 'lendo' ? 'Lendo planilha…' : e.status === 'aplicando' ? 'Aplicando na carteira…' : e.progresso}
        </div>
      )}

      {/* PREVIEW da reconciliação: o que vai mudar em `clientes`, antes de aplicar */}
      {e.status === 'previa' && diff && (
        <div className={`rounded-lg p-3 mb-3 border ${diff.bloqueado ? 'border-bad/40 bg-bad-bg' : 'border-primary/30 bg-primary/5'}`}>
          {diff.bloqueado ? (
            <p className="text-xs text-bad font-medium mb-2">
              ⚠ Este snapshot tem {nBR(diff.total_snapshot)} clientes contra {nBR(diff.total_anterior)} do anterior,
              ou esconderia clientes demais de uma vez. Pode ser a planilha errada. Confira antes de aplicar.
            </p>
          ) : (
            <p className="text-xs text-ink-dim font-medium mb-2">Ao aplicar, a carteira muda assim:</p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink-muted">
            <Muda n={diff.stubs} rotulo="novos (viram pendentes)" />
            <Muda n={diff.reatribuidos} rotulo="transferidos de consultor" />
            <Muda n={diff.ocultados} rotulo="escondidos (saíram)" cor="text-warn" />
            <Muda n={diff.reativados} rotulo="reexibidos (voltaram)" cor="text-good" />
          </div>
          {diff.sem_perfil.length > 0 && (
            <p className="text-[11px] text-warn mt-2">
              Consultor sem login casado: {diff.sem_perfil.join(', ')} — a carteira dele fica só para a gestão até criar o acesso.
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={() => aplicarReconciliacao(diff.bloqueado)}
              className={`flex-1 text-white text-xs font-semibold py-2 rounded-lg transition-colors ${diff.bloqueado ? 'bg-bad hover:bg-bad-dk' : 'bg-primary hover:bg-primary-dk'}`}>
              {diff.bloqueado ? 'Aplicar mesmo assim' : 'Aplicar reconciliação'}
            </button>
            <button onClick={() => setE({ status: 'idle' })}
              className="px-3 py-2 rounded-lg text-xs font-medium text-ink-dim border border-line hover:bg-card-2">
              Agora não
            </button>
          </div>
        </div>
      )}

      {/* Conferência dos acionáveis — bater o olho antes de confiar na fila */}
      {e.lido && (e.status === 'previa' || e.status === 'ok') && (
        <details className="text-[11px] text-ink-muted border border-line rounded-lg p-3 mb-3">
          <summary className="cursor-pointer font-semibold text-ink-dim">
            {nBR(e.lido.clientes.length)} clientes · {nBR(e.lido.acoes.length)} acionáveis · {e.lido.consultores.length} consultores
          </summary>
          <div className="mt-2 space-y-1">
            {Object.entries(e.lido.totaisPorAcionavel).sort((a, b) => b[1] - a[1]).map(([a, n]) => (
              <div key={a} className="flex justify-between gap-3"><span className="truncate">{a}</span><span className="tabular-nums flex-shrink-0">{nBR(n)}</span></div>
            ))}
            {desconhecidos.length > 0 && (
              <p className="text-warn pt-1">Acionável fora dos 12 conhecidos: {desconhecidos.join(', ')} — a planilha pode ter mudado.</p>
            )}
          </div>
        </details>
      )}

      <label className={`flex items-center justify-center gap-2 w-full text-sm font-medium rounded-xl py-2.5 transition-colors cursor-pointer ${
        ocupado ? 'opacity-50 cursor-not-allowed bg-card-2 text-ink-faint border border-line'
                : 'text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20'
      }`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {e.status === 'ok' ? 'Enviar nova versão' : 'Selecionar arquivo'}
        <input
          ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={ocupado}
          onChange={ev => { const f = ev.target.files?.[0]; if (f) importar(f) }}
        />
      </label>
    </div>
  )
}

const nBR = (n: number) => n.toLocaleString('pt-BR')

function Muda({ n, rotulo, cor = 'text-ink' }: { n: number; rotulo: string; cor?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-semibold tabular-nums ${n > 0 ? cor : 'text-ink-faint'}`}>{nBR(n)}</span>
      <span>{rotulo}</span>
    </span>
  )
}
