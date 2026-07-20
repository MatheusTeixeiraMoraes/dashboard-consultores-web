'use client'

import { useState } from 'react'
import type { RelatorioCarteira } from '@/lib/carteira'
import type { ConsultorCarteira } from './page'

const nBR = (n: number) => n.toLocaleString('pt-BR')
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null)

interface Props {
  carteiraAtual: ConsultorCarteira[]
  relatorio: RelatorioCarteira
}

export default function CarteiraClient({ carteiraAtual, relatorio }: Props) {
  const [aba, setAba] = useState<'atual' | 'movimentacoes'>('atual')

  const total = carteiraAtual.reduce((s, c) => s + c.total, 0)
  const maior = carteiraAtual[0]?.total ?? 1

  function exportarCsv() {
    const linhas = [['Consultor', 'Clientes na carteira', 'Tem login'],
      ...carteiraAtual.map(c => [c.consultor_nome, String(c.total), c.temLogin ? 'sim' : 'não'])]
    const csv = linhas.map(l => l.map(x => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `carteira-${relatorio.dataAtual ?? 'atual'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!relatorio.dataAtual) {
    return (
      <div className="glass rounded-2xl border border-line p-12 text-center">
        <p className="font-semibold text-ink">Nenhuma Planilha Geral importada</p>
        <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
          Suba a Planilha Geral em <span className="text-primary">Upar Planilha</span> para ver aqui a
          carteira de cada consultor e as movimentações entre eles.
        </p>
      </div>
    )
  }

  const semLogin = carteiraAtual.filter(c => !c.temLogin)

  return (
    <div className="pb-16">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-ink">Carteira</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Planilha de {dataBR(relatorio.dataAtual)} · {nBR(total)} clientes em {carteiraAtual.length} consultores
        </p>
      </div>

      <div className="flex items-center gap-1.5 mb-4">
        {([['atual', 'Por consultor'], ['movimentacoes', 'Movimentações']] as const).map(([k, rot]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              aba === k ? 'border-primary/60 bg-primary/15 text-ink' : 'border-field-line bg-field text-ink-muted hover:text-ink'
            }`}>
            {rot}
            {k === 'movimentacoes' && relatorio.movimentacoes.length > 0 && (
              <span className="ml-1.5 bg-warn text-white text-[10px] font-bold rounded-full px-1.5">{nBR(relatorio.movimentacoes.length)}</span>
            )}
          </button>
        ))}
      </div>

      {aba === 'atual' && (
        <>
          {semLogin.length > 0 && (
            <div className="text-xs text-warn bg-warn-bg rounded-xl px-4 py-2.5 mb-4">
              {semLogin.length} consultor{semLogin.length !== 1 ? 'es' : ''} sem login: {semLogin.map(c => c.consultor_nome).join(', ')}.
              A carteira deles aparece aqui, mas eles só verão a própria fila quando tiverem acesso criado.
            </div>
          )}
          <div className="glass rounded-2xl border border-line overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <p className="text-sm font-semibold text-ink">Carteira por consultor</p>
              <button onClick={exportarCsv} className="text-xs text-primary hover:underline flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Exportar CSV
              </button>
            </div>
            <div className="divide-y divide-line">
              {carteiraAtual.map(c => (
                <div key={c.consultor_nome} className="px-4 py-2.5">
                  <div className="flex justify-between items-baseline gap-3 mb-1">
                    <span className="text-sm text-ink truncate">
                      {c.consultor_nome}
                      {!c.temLogin && <span className="ml-2 text-[10px] text-warn border border-warn/40 rounded px-1.5 py-0.5">sem login</span>}
                    </span>
                    <span className="text-sm font-semibold text-ink tabular-nums flex-shrink-0">{nBR(c.total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-card-2 overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(c.total / maior) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {aba === 'movimentacoes' && (
        <>
          {relatorio.dataAnterior === null ? (
            <div className="glass rounded-2xl border border-line p-8 text-center">
              <p className="font-semibold text-ink">Ainda não há o que comparar</p>
              <p className="text-sm text-ink-muted mt-1 max-w-lg mx-auto">
                As movimentações aparecem a partir do segundo envio mensal. É a diferença entre duas Planilhas
                Gerais que mostra quem passou de um consultor para outro — com uma planilha só, não há movimento
                para relatar.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-ink-muted">
                De {dataBR(relatorio.dataAnterior)} para {dataBR(relatorio.dataAtual)}:{' '}
                {nBR(relatorio.movimentacoes.length)} cliente{relatorio.movimentacoes.length !== 1 ? 's' : ''} mudaram de consultor.
              </p>

              {(relatorio.novosConsultores.length > 0 || relatorio.consultoresQueSairam.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {relatorio.novosConsultores.length > 0 && (
                    <div className="glass rounded-2xl border border-line p-4">
                      <p className="text-xs font-semibold text-good mb-1.5">Entraram na equipe</p>
                      <p className="text-sm text-ink-dim">{relatorio.novosConsultores.join(' · ')}</p>
                    </div>
                  )}
                  {relatorio.consultoresQueSairam.length > 0 && (
                    <div className="glass rounded-2xl border border-line p-4">
                      <p className="text-xs font-semibold text-bad mb-1.5">Saíram da equipe</p>
                      <p className="text-sm text-ink-dim">{relatorio.consultoresQueSairam.join(' · ')}</p>
                    </div>
                  )}
                </div>
              )}

              {relatorio.pares.map(p => (
                <div key={`${p.de}-${p.para}`} className="glass rounded-2xl border border-line p-4">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium text-ink">{p.de}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    <span className="font-medium text-ink">{p.para}</span>
                    <span className="text-ink-muted">· {nBR(p.clientes.length)} cliente{p.clientes.length !== 1 ? 's' : ''}</span>
                    {p.carteiraInteira && (
                      <span className="text-[10px] font-bold text-primary bg-primary/15 rounded px-1.5 py-0.5">CARTEIRA INTEIRA</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
