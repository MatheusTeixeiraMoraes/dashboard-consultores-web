'use client'

import { useState, useMemo } from 'react'
import MultiFiltro from '@/components/MultiFiltro'
import type { EventoAtividade } from './page'

const ROTULO_EVENTO: Record<string, string> = {
  login: 'entrou no sistema',
  cliente_criado: 'cadastrou o cliente',
  cliente_editado: 'editou o cliente',
  cliente_removido_carteira: 'removeu da carteira o cliente',
  clientes_importados: 'importou clientes por planilha',
  usuario_criado: 'criou o usuário',
  usuario_excluido: 'excluiu o usuário',
  usuario_editado: 'editou o usuário',
  usuario_ativo_alterado: 'alterou o acesso do usuário',
  usuario_senha_redefinida: 'redefiniu a senha via convite',
  meta_alterada: 'alterou a meta',
  delegacao_iniciada: 'entrou na conta de',
  delegacao_encerrada: 'voltou da conta de',
  rota_criada: 'criou a rota',
  rota_editada: 'editou a rota',
  rota_agendada: 'agendou a rota',
  rota_excluida: 'excluiu a rota',
  convite_gerado: 'gerou link de acesso para',
  convite_revogado: 'revogou o link de acesso de',
  convite_excluido: 'excluiu o link de acesso de',
  score_upload_criado: 'enviou a planilha',
  score_upload_excluido: 'excluiu o envio de planilha',
  carteira_reconciliada: 'importou a carteira',
}

const COR_EVENTO: Record<string, string> = {
  login: 'bg-ink-faint',
  cliente_criado: 'bg-good-fill',
  cliente_editado: 'bg-primary',
  cliente_removido_carteira: 'bg-warn-fill',
  clientes_importados: 'bg-good-fill',
  usuario_criado: 'bg-good-fill',
  usuario_excluido: 'bg-bad-fill',
  usuario_editado: 'bg-primary',
  usuario_ativo_alterado: 'bg-warn-fill',
  usuario_senha_redefinida: 'bg-primary',
  meta_alterada: 'bg-primary',
  delegacao_iniciada: 'bg-warn-fill',
  delegacao_encerrada: 'bg-ink-faint',
  rota_criada: 'bg-good-fill',
  rota_editada: 'bg-primary',
  rota_agendada: 'bg-primary',
  rota_excluida: 'bg-bad-fill',
  convite_gerado: 'bg-good-fill',
  convite_revogado: 'bg-warn-fill',
  convite_excluido: 'bg-bad-fill',
  score_upload_criado: 'bg-good-fill',
  score_upload_excluido: 'bg-bad-fill',
  carteira_reconciliada: 'bg-warn-fill',
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
  if (tipo === 'clientes_importados' && 'quantidade' in detalhes) {
    const ignorados = typeof detalhes.ignorados === 'number' && detalhes.ignorados > 0 ? ` · ${detalhes.ignorados} ignorado(s)` : ''
    return `${detalhes.quantidade} cliente(s)${ignorados}`
  }
  if (tipo === 'rota_criada' && 'quantidade' in detalhes) {
    return `${detalhes.quantidade} rota(s)`
  }
  if (tipo === 'rota_criada' && 'paradas' in detalhes) {
    return `${detalhes.paradas} parada(s)`
  }
  if (tipo === 'rota_agendada') {
    return detalhes.data ? `para ${String(detalhes.data)}` : 'removida do calendário'
  }
  if (tipo === 'rota_editada' && 'campo' in detalhes) {
    return detalhes.campo === 'trajeto' ? 'trajeto recalculado' : 'nome alterado'
  }
  if ((tipo === 'usuario_criado' || tipo === 'usuario_senha_redefinida') && detalhes.via === 'convite') {
    return 'via link de convite'
  }
  if (tipo === 'convite_gerado' && 'role' in detalhes) {
    return `papel: ${detalhes.role}`
  }
  if (tipo === 'score_upload_criado' && 'record_count' in detalhes) {
    const subst = detalhes.substituiu ? ' · substituiu envio anterior' : ''
    return `${detalhes.record_count} linha(s)${subst}`
  }
  if (tipo === 'carteira_reconciliada') {
    const partes: string[] = []
    if (typeof detalhes.novos === 'number' && detalhes.novos > 0) partes.push(`${detalhes.novos} novos`)
    if (typeof detalhes.transferidos === 'number' && detalhes.transferidos > 0) partes.push(`${detalhes.transferidos} transferidos`)
    if (typeof detalhes.escondidos === 'number' && detalhes.escondidos > 0) partes.push(`${detalhes.escondidos} escondidos`)
    if (typeof detalhes.reativados === 'number' && detalhes.reativados > 0) partes.push(`${detalhes.reativados} reativados`)
    return partes.length ? partes.join(' · ') : null
  }
  return null
}

export default function AtividadeClient({ eventos }: { eventos: EventoAtividade[] }) {
  const [busca, setBusca] = useState('')
  const [fTipos, setFTipos] = useState<Set<string>>(new Set())
  const [fAtores, setFAtores] = useState<Set<string>>(new Set())

  const tiposPresentes = useMemo(
    () => [...new Set(eventos.map(e => e.tipo))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [eventos],
  )

  // Nome já congelado na linha (sobrevive a perfil apagado) — mesma fonte
  // usada pra exibir quem fez a ação, não precisa de join com `profiles`.
  const atoresPresentes = useMemo(
    () => [...new Set(eventos.map(e => e.ator_nome))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [eventos],
  )

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return eventos.filter(e =>
      (fTipos.size === 0 || fTipos.has(e.tipo)) &&
      (fAtores.size === 0 || fAtores.has(e.ator_nome)) &&
      (!q || e.ator_nome.toLowerCase().includes(q) || (e.alvo_descricao ?? '').toLowerCase().includes(q)),
    )
  }, [eventos, busca, fTipos, fAtores])

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
        <div className="ml-auto flex items-center gap-2">
          <MultiFiltro
            label="Consultor"
            opcoes={atoresPresentes}
            sel={fAtores}
            onChange={setFAtores}
          />
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
