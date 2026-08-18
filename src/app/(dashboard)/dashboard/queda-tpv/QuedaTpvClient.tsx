'use client'

import { useState, useMemo } from 'react'
import MultiFiltro from '@/components/MultiFiltro'
import { compararRitmo, estagnacao, faixaTPV, ROTULO_FAIXA, type FaixaTPV } from '@/lib/tpv'
import { precisaIdentificar } from '@/lib/texto'
import type { LinhaTPV, PontoSerie } from './page'

const POR_PAGINA = 50

const nBR = (n: number) => n.toLocaleString('pt-BR')
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null)

const CorFaixa: Record<FaixaTPV, string> = {
  'queda-forte': 'text-bad',
  'queda': 'text-warn',
  'estavel': 'text-ink-muted',
  'alta': 'text-good',
  'sem-base': 'text-ink-faint',
}

type Ordem = 'pior-ritmo' | 'maior-perda' | 'mais-parado' | 'maior-tpv'

interface Props {
  dataReferencia: string | null
  linhas: LinhaTPV[]
  serie: PontoSerie[]
  fichas: Record<string, { nome: string; telefone: string | null; local: string }>
  podeGerir: boolean
}

export default function QuedaTpvClient({ dataReferencia, linhas, serie, fichas, podeGerir }: Props) {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [ordem, setOrdem] = useState<Ordem>('maior-perda')
  const [fConsultores, setFConsultores] = useState<Set<string>>(new Set())
  const [fFaixas, setFFaixas] = useState<Set<string>>(new Set())
  const [fStatus, setFStatus] = useState<Set<string>>(new Set())
  const [fMcc, setFMcc] = useState<Set<string>>(new Set())

  // Série por cliente, para saber há quantos dias o acumulado não sobe.
  const seriePorSeller = useMemo(() => {
    const m = new Map<string, { data: string; tpv: number | null }[]>()
    for (const p of serie) {
      const l = m.get(p.seller_id)
      const ponto = { data: p.data_referencia, tpv: p.tpv_mes_atual }
      if (l) l.push(ponto); else m.set(p.seller_id, [ponto])
    }
    return m
  }, [serie])

  const enriquecidas = useMemo(() => {
    if (!dataReferencia) return []
    return linhas.map(l => {
      const r = compararRitmo(l.tpv_mes_atual, l.tpv_mes_passado, dataReferencia)
      const e = estagnacao(seriePorSeller.get(l.seller_id) ?? [])
      // Quanto de faturamento se perdeu no ritmo, projetado no mês. É derivado
      // (ritmo × dias), e serve só para ordenar por tamanho do problema — quem
      // cai 50% faturando R$ 200 não é o mesmo problema que quem cai 12%
      // faturando R$ 2 milhões.
      const perda = r.variacao !== null && r.variacao < 0
        ? (r.ritmoPassado - r.ritmoAtual) * r.diasMesPassado
        : 0
      return { ...l, ...r, ...e, perda, faixa: faixaTPV(r.variacao) }
    })
  }, [linhas, dataReferencia, seriePorSeller])

  const consultores = useMemo(
    () => [...new Set(linhas.map(l => l.consultor_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas],
  )
  const mccs = useMemo(
    () => [...new Set(linhas.map(l => l.mcc).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas],
  )

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const arr = enriquecidas.filter(l =>
      (fConsultores.size === 0 || fConsultores.has(l.consultor_nome)) &&
      (fFaixas.size === 0 || fFaixas.has(ROTULO_FAIXA[l.faixa])) &&
      (fStatus.size === 0 || fStatus.has(l.status ?? '')) &&
      (fMcc.size === 0 || fMcc.has(l.mcc ?? '')) &&
      (!q || l.seller_id.includes(q) || (fichas[l.seller_id]?.nome ?? '').toLowerCase().includes(q)),
    )
    const cmp: Record<Ordem, (a: typeof arr[0], b: typeof arr[0]) => number> = {
      'pior-ritmo': (a, b) => (a.variacao ?? 9) - (b.variacao ?? 9),
      'maior-perda': (a, b) => b.perda - a.perda,
      'mais-parado': (a, b) => (b.diasSemVender ?? -1) - (a.diasSemVender ?? -1),
      'maior-tpv': (a, b) => (b.tpv_mes_atual ?? 0) - (a.tpv_mes_atual ?? 0),
    }
    return [...arr].sort(cmp[ordem])
  }, [enriquecidas, busca, fConsultores, fFaixas, fStatus, fMcc, ordem, fichas])

  const kpis = useMemo(() => {
    const emQueda = filtradas.filter(l => l.faixa === 'queda' || l.faixa === 'queda-forte')
    const parados = filtradas.filter(l => (l.diasSemVender ?? 0) >= 3)
    return {
      total: filtradas.length,
      emQueda: emQueda.length,
      perdaTotal: emQueda.reduce((s, l) => s + l.perda, 0),
      emAlta: filtradas.filter(l => l.faixa === 'alta').length,
      parados: parados.length,
    }
  }, [filtradas])

  const temSerie = useMemo(() => enriquecidas.some(l => l.temSerie), [enriquecidas])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtradas.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)
  const ref = enriquecidas[0]

  if (!dataReferencia) {
    return (
      <div className="glass rounded-2xl border border-line p-12 text-center">
        <p className="font-semibold text-ink">Nenhuma Planilha Ação Oportunidades importada</p>
        <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
          Suba a Planilha Ação Oportunidades em <span className="text-primary">Upar Planilha</span> para
          acompanhar aqui a evolução do faturamento dos seus clientes.
        </p>
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">Queda de TPV</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Planilha de {dataBR(dataReferencia)} · {ref?.diasDecorridos} dias corridos no mês,
          contra {ref?.diasMesPassado} do mês passado fechado
        </p>
      </div>

      {/* Os números primeiro — é a resposta que o líder quer, antes de qualquer
          controle de filtro ou explicação de método. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {[
          { l: 'Clientes', v: nBR(kpis.total), c: 'text-ink' },
          { l: 'Em queda', v: nBR(kpis.emQueda), c: 'text-bad' },
          { l: 'Perda no ritmo', v: brl(kpis.perdaTotal), c: 'text-bad' },
          { l: 'Em alta', v: nBR(kpis.emAlta), c: 'text-good' },
        ].map(k => (
          <div key={k.l} className="glass rounded-2xl border border-line px-4 py-3.5">
            <p className="text-xs font-medium text-ink-muted mb-1.5">{k.l}</p>
            <p className={`text-2xl font-semibold tracking-tight ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Por que os números não são o que a planilha mostra crua. Fica visível
          de propósito: sem esta linha, alguém compara os brutos e entra em pânico.
          Uma linha só, sem caixa — é contexto, não é o destaque da tela. */}
      <p className="text-xs text-ink-faint mb-4 leading-relaxed">
        Mês em curso: comparação por <span className="text-ink-muted font-medium">ritmo diário</span> (faturamento
        ÷ dias de cada período), não pelos valores brutos da planilha.
      </p>

      {/* Todos os controles que afetam a tabela, juntos numa barra só, logo
          acima dela — busca e ordenação à esquerda, filtros à direita. */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <input
          type="text" placeholder="Buscar cliente ou seller ID…"
          value={busca} onChange={e => { setBusca(e.target.value); setPagina(0) }}
          className="flex-1 min-w-56 max-w-sm text-sm bg-field border border-field-line rounded-lg px-3 py-1.5 text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-muted">Ordenar:</span>
          {([
            ['maior-perda', 'Maior perda'],
            ['pior-ritmo', 'Pior queda %'],
            ['mais-parado', 'Mais parado'],
            ['maior-tpv', 'Maior TPV'],
          ] as [Ordem, string][]).map(([k, rot]) => (
            <button key={k} onClick={() => { setOrdem(k); setPagina(0) }}
              className={`px-2.5 py-1.5 rounded-lg border transition-colors ${
                ordem === k ? 'border-primary/60 bg-primary/15 text-ink' : 'border-field-line bg-field text-ink-muted hover:text-ink'
              }`}>
              {rot}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {podeGerir && <MultiFiltro label="Consultores" opcoes={consultores} sel={fConsultores} onChange={setFConsultores} />}
          <MultiFiltro label="Faixa" opcoes={Object.values(ROTULO_FAIXA)} sel={fFaixas} onChange={setFFaixas} />
          <MultiFiltro label="Situação" opcoes={['ATIVO', 'CHURN', 'INATIVO', 'REATIVADO']} sel={fStatus} onChange={setFStatus} />
          <MultiFiltro label="Segmento" opcoes={mccs} sel={fMcc} onChange={setFMcc} />
        </div>
      </div>

      {!temSerie && (
        <p className="text-xs text-warn bg-warn-bg rounded-xl px-4 py-2.5 mb-4">
          Só existe um envio deste mês. A coluna &quot;sem vender&quot; começa a funcionar no
          segundo envio — é a diferença entre dois retratos que mostra quem parou.
        </p>
      )}

      {/* Quatro colunas, não sete: ritmo, variação e perda contam a mesma
          história (o que o cliente fatura por dia e como isso mudou), então
          viram uma célula composta em vez de três colunas de número cru lado
          a lado — é o que dava a cara de planilha. Mesmo raciocínio juntando
          situação e dias parado. */}
      <div className="glass rounded-2xl border border-line overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line bg-card-2 text-left">
              {['Cliente', 'Ritmo diário', 'TPV no mês', 'Situação'].map((h, i) => (
                <th key={h} className={`px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider ${i > 0 && i < 3 ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visiveis.map(l => {
              const f = fichas[l.seller_id]
              return (
                <tr key={l.seller_id} className="hover:bg-card-2 transition-colors">
                  <td className="px-4 py-2.5 max-w-[240px]">
                    {precisaIdentificar(f?.nome ?? '', l.seller_id)
                      ? <p className="text-warn truncate leading-tight">Pendente de identificação <span className="font-mono text-[11px] text-ink-faint">#{l.seller_id}</span></p>
                      : <p className="text-ink truncate leading-tight">{f?.nome}</p>}
                    <p className="text-[11px] text-ink-faint truncate">
                      {podeGerir ? l.consultor_nome : f?.local || `#${l.seller_id}`}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <p className="tabular-nums text-ink leading-tight">
                      {brl(l.ritmoAtual)}<span className="text-ink-faint font-normal">/dia</span>
                    </p>
                    <p className={`text-xs tabular-nums font-medium leading-tight mt-0.5 ${CorFaixa[l.faixa]}`}>
                      {l.variacao === null ? '—' : pct(l.variacao)}
                      {l.perda > 0 && <span className="text-ink-faint font-normal"> · -{brl(l.perda)}</span>}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                    {l.tpv_mes_atual != null ? brl(l.tpv_mes_atual) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-medium ${l.status === 'CHURN' ? 'text-bad' : l.status === 'INATIVO' ? 'text-warn' : 'text-ink-muted'}`}>
                      {l.status}
                    </span>
                    <p className={`text-[11px] mt-0.5 ${l.diasSemVender != null && l.diasSemVender >= 3 ? 'text-bad font-medium' : 'text-ink-faint'}`}>
                      {l.diasSemVender == null ? '—' : `${l.diasSemVender}d sem vender`}
                    </p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtradas.length === 0 && (
        <p className="text-sm text-ink-muted glass rounded-2xl border border-line p-8 text-center mt-3">
          Nenhum cliente com esses filtros.
        </p>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap mt-4 text-sm">
          <span className="text-ink-faint text-xs">
            {nBR(paginaAtual * POR_PAGINA + 1)}–{nBR(Math.min((paginaAtual + 1) * POR_PAGINA, filtradas.length))} de {nBR(filtradas.length)}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={paginaAtual === 0}
              className="px-3 py-1.5 rounded-lg border border-line text-ink-dim text-xs disabled:opacity-40 hover:bg-card-2">Anterior</button>
            <span className="text-ink-muted text-xs">{paginaAtual + 1} / {totalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} disabled={paginaAtual >= totalPaginas - 1}
              className="px-3 py-1.5 rounded-lg border border-line text-ink-dim text-xs disabled:opacity-40 hover:bg-card-2">Próxima</button>
          </div>
        </div>
      )}
    </div>
  )
}
