'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  lerPlanilhaGeral, acionaveisDesconhecidos, ErroPlanilha, type Lido,
} from '@/lib/planilha-geral'

const LOTE = 500   // mesmo lote do import da carteira

/**
 * As ÚNICAS tabelas que este import governa.
 *
 * `clientes` nunca entra aqui, e isso é regra de produto, não detalhe: a
 * Planilha Geral e a planilha de rotas são arquivos diferentes com alguns
 * clientes em comum, e não devem se fundir. O cadastro de rotas é editável à
 * mão; deixar um snapshot mensal escrever nele apagaria correção manual.
 * Há um teste guardando isto — ver separacao-planilhas.test.mjs.
 */
const TABELAS = ['mp_acionaveis', 'mp_carteira'] as const

interface Estado {
  status: 'idle' | 'lendo' | 'salvando' | 'ok' | 'erro'
  msg?: string
  lido?: Lido
  progresso?: string
}

/**
 * Import da "Planilha Geral" do MP — a fonte da categoria Campanhas.
 *
 * Grava em mp_carteira/mp_acionaveis e NUNCA toca em `clientes`: a base de
 * rotas é cadastro editável e não pode ser sobrescrita por snapshot mensal.
 *
 * Antes de gravar, mostra a conferência: quantos clientes, quantas ações e
 * quais consultores vieram. É a única chance de perceber que a planilha mudou
 * de formato antes de o dado entrar.
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
      // ErroPlanilha já vem com a linha e o seller citados.
      setE({ status: 'erro', msg: err instanceof ErroPlanilha ? err.message : `Não consegui ler o arquivo: ${(err as Error).message}` })
      return
    }

    setE({ status: 'salvando', lido, progresso: 'limpando importação anterior…' })
    const supabase = createClient()

    // Substitui o snapshot desta data. Sem o delete, reimportar o mesmo dia
    // duplicaria a fila inteira.
    for (const tabela of TABELAS) {
      const { error } = await supabase.from(tabela).delete().eq('data_referencia', data)
      if (error) {
        setE({ status: 'erro', msg: `Erro ao limpar ${tabela}: ${error.message}` })
        return
      }
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

    setE({ status: 'ok', lido })
    router.refresh()
    if (input.current) input.current.value = ''
  }

  const ocupado = e.status === 'lendo' || e.status === 'salvando'
  const desconhecidos = e.lido ? acionaveisDesconhecidos(e.lido.totaisPorAcionavel) : []

  return (
    <div className="glass rounded-2xl border border-line p-5 border-l-4 border-l-primary">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-8 h-8 rounded-lg bg-primary/15 grid place-items-center flex-shrink-0 text-primary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11H3v10h6V11zM15 3H9v18h6V3zM21 7h-6v14h6V7z" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Planilha Geral</p>
          <p className="text-[11px] text-ink-muted">Alimenta a categoria Campanhas</p>
        </div>
      </div>

      <p className="text-xs text-ink-muted my-3 leading-relaxed">
        A lista de acionáveis por cliente. Não altera o cadastro de Clientes nem as rotas —
        é um retrato do mês, substituído a cada envio.
      </p>

      {e.status === 'ok' && e.lido && (
        <div className="text-xs bg-good-bg text-good rounded-lg px-3 py-2 mb-3">
          ✓ {e.lido.clientes.length.toLocaleString('pt-BR')} clientes e{' '}
          {e.lido.acoes.length.toLocaleString('pt-BR')} acionáveis importados
        </div>
      )}

      {e.status === 'erro' && (
        <div className="text-xs bg-bad-bg text-bad rounded-lg px-3 py-2 mb-3 whitespace-pre-wrap">{e.msg}</div>
      )}

      {ocupado && (
        <div className="text-xs text-ink-muted bg-card-2 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <span className="animate-spin inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
          {e.status === 'lendo' ? 'Lendo planilha…' : e.progresso}
        </div>
      )}

      {/* Conferência: o que entrou, para bater o olho antes de confiar na tela */}
      {e.lido && (e.status === 'ok' || e.status === 'salvando') && (
        <div className="text-[11px] text-ink-muted border border-line rounded-lg p-3 mb-3 space-y-2">
          <div>
            <p className="font-semibold text-ink-dim mb-1">Acionáveis encontrados</p>
            {Object.entries(e.lido.totaisPorAcionavel)
              .sort((a, b) => b[1] - a[1])
              .map(([a, n]) => (
                <div key={a} className="flex justify-between gap-3">
                  <span className="truncate">{a}</span>
                  <span className="tabular-nums flex-shrink-0">{n.toLocaleString('pt-BR')}</span>
                </div>
              ))}
          </div>
          <div>
            <p className="font-semibold text-ink-dim mb-1">Consultores ({e.lido.consultores.length})</p>
            <p className="leading-relaxed">{e.lido.consultores.join(' · ')}</p>
            <p className="text-ink-faint mt-1">
              O consultor só vê a fila dele se o nome da conta bater com o nome acima.
            </p>
          </div>
          {desconhecidos.length > 0 && (
            <p className="text-warn">
              Acionável fora dos 12 conhecidos: {desconhecidos.join(', ')} — a planilha pode ter mudado.
            </p>
          )}
        </div>
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
