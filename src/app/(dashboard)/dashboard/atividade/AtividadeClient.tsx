'use client'

import { useState, useMemo } from 'react'
import MultiFiltro from '@/components/MultiFiltro'
import type { EventoAtividade } from './page'

const ROTULO_EVENTO: Record<string, string> = {
  login: 'entrou no sistema',
  cliente_criado: 'cadastrou o cliente',
  cliente_editado: 'editou o cliente',
  cliente_removido_carteira: 'removeu da carteira o cliente',
  usuario_criado: 'criou o usuário',
  usuario_excluido: 'excluiu o usuário',
  usuario_editado: 'editou o usuário',
  usuario_ativo_alterado: 'alterou o acesso do usuário',
  meta_alterada: 'alterou a meta',
  delegacao_iniciada: 'entrou na conta de',
  delegacao_encerrada: 'voltou da conta de',
}

const COR_EVENTO: Record<string, string> = {
  login: 'bg-ink-faint',
  cliente_criado: 'bg-good-fill',
  cliente_editado: 'bg-primary',
  cliente_removido_carteira: 'bg-warn-fill',
  usuario_criado: 'bg-good-fill',
  usuario_excluido: 'bg-bad-fill',
  usuario_editado: 'bg-primary',
  usuario_ativo_alterado: 'bg-warn-fill',
  meta_alterada: 'bg-primary',
  delegacao_iniciada: 'bg-warn-fill',
  delegacao_encerrada: 'bg-ink-faint',
}

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Resume `detalhes` numa linha curta, sem expor json cru na tela. */
function resumoDetalhes(tipo: string, detalhes: Record<string, unknown> | null): string | null {
  if (!detalhes) return null
  if (tipo === 'meta_alterada' && 'de' in detalhes && 'para' in detalhes) {
    return `${detalhes.de} → ${detalhes.para}`
  }
  if (tipo === 'usuario_ativo_alterado' && 'ativo' in detalhes) {
    return detalhes.ativo ? 'reativado' : 'acesso revogado'
  }
  if (tipo === 'usuario_editado') {
    const partes: string[] = []
    if (detalhes.role && typeof detalhes.role === 'object') {
      const r = detalhes.role as { de: string; para: string }
      partes.push(`papel: ${r.de} → ${r.para}`)
    }
    if (detalhes.nome && typeof detalhes.nome === 'object') {
      const n = detalhes.nome as { de: string; para: string }
      partes.push(`nome: ${n.de} → ${n.para}`)
    }
    return partes.length ? partes.join(' · ') : null
  }
  return null
}

export default function AtividadeClient({ eventos }: { eventos: EventoAtividade[] }) {
  const [busca, setBusca] = useState('')
  const [fTipos, setFTipos] = useState<Set<string>>(new Set())

  const tiposPresentes = useMemo(
    () => [...new Set(eventos.map(e => e.tipo))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [eventos],
  )

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return eventos.filter(e =>
      (fTipos.size === 0 || fTipos.has(e.tipo)) &&
      (!q || e.ator_nome.toLowerCase().includes(q) || (e.alvo_descricao ?? '').toLowerCase().includes(q)),
    )
  }, [eventos, busca, fTipos])

  return (
    <div className="pb-20">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">Atividade</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Últimos {eventos.length} eventos · login, edição de cliente, ações administrativas e delegação de acesso
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-ink-faint absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text" placeholder="Buscar por quem fez ou quem sofreu a ação…"
            value={busca} onChange={e => setBusca(e.target.value)}
            className="w-full text-sm bg-field border border-field-line rounded-lg pl-8 pr-3 py-1.5 text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="ml-auto">
          <MultiFiltro
            label="Tipo"
            opcoes={tiposPresentes.map(t => ROTULO_EVENTO[t] ?? t)}
            sel={new Set([...fTipos].map(t => ROTULO_EVENTO[t] ?? t))}
            onChange={rotulos => {
              const inverso = Object.fromEntries(tiposPresentes.map(t => [ROTULO_EVENTO[t] ?? t, t]))
              setFTipos(new Set([...rotulos].map(r => inverso[r] ?? r)))
            }}
          />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Nenhum evento ainda</p>
          <p className="text-sm text-ink-muted mt-1">
            {eventos.length === 0 ? 'O log começa a preencher conforme o sistema é usado.' : 'Nenhum evento com esses filtros.'}
          </p>
        </div>
      ) : (
        <div className="glass rounded-2xl border border-line divide-y divide-line">
          {filtrados.map(ev => {
            const resumo = resumoDetalhes(ev.tipo, ev.detalhes)
            return (
              <div key={ev.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${COR_EVENTO[ev.tipo] ?? 'bg-ink-faint'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink leading-snug">
                    <span className="font-semibold">{ev.ator_nome}</span>{' '}
                    {ROTULO_EVENTO[ev.tipo] ?? ev.tipo}
                    {ev.alvo_descricao && <span className="font-medium"> {ev.alvo_descricao}</span>}
                  </p>
                  {resumo && <p className="text-xs text-ink-muted mt-0.5">{resumo}</p>}
                </div>
                <span className="text-xs text-ink-faint flex-shrink-0 whitespace-nowrap">{formatarDataHora(ev.criado_em)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
