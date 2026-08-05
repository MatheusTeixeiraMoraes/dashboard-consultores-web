'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import MultiFiltro from '@/components/MultiFiltro'
import { BotaoWhatsApp, BotaoMapa } from '@/components/BotaoContato'
import { enderecoExibivel } from '@/lib/texto'
import {
  resumoHexa, fmtDinheiro, fmtDinheiroCurto, entregarAoRoteirizarHexa,
  type HexaCliente, type Fatia,
} from '@/lib/hexa-recife'
import type { UserRole } from '@/lib/types'
import ImportHexa from './ImportHexa'
import PlanejarRotas from './PlanejarRotas'

const POR_PAGINA = 25

/** Marcadores derivados que a tela usa como filtro rápido. */
type Alerta = 'semGps' | 'divergente' | 'foraCarteira' | 'incompleto'

function fmtDataHora(iso: string | null | undefined) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR')
}

const nBR = (n: number) => n.toLocaleString('pt-BR')

function KPI({ label, valor, nota, tom = 'ink' }: {
  label: string; valor: string; nota?: string; tom?: 'ink' | 'good' | 'warn' | 'bad'
}) {
  const cor = { ink: 'text-ink', good: 'text-good', warn: 'text-warn', bad: 'text-bad' }[tom]
  return (
    <div className="glass rounded-2xl border border-line p-4">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted mb-1">{label}</p>
      <p className={`text-2xl font-bold ${cor} leading-tight`}>{valor}</p>
      {nota && <p className="text-[11px] text-ink-faint mt-0.5">{nota}</p>}
    </div>
  )
}

/**
 * Distribuição em barras de CSS, não em gráfico.
 *
 * São no máximo uma dúzia de fatias por bloco e quatro blocos na tela. O
 * recharts custa ~338 KB e entraria no first-load de uma categoria temporária
 * para desenhar o que uma div com `width` proporcional já mostra.
 */
function Distribuicao({ titulo, fatias, limite = 8 }: { titulo: string; fatias: Fatia[]; limite?: number }) {
  const maior = fatias[0]?.n ?? 1
  const mostradas = fatias.slice(0, limite)
  const resto = fatias.length - mostradas.length
  return (
    <div className="glass rounded-2xl border border-line p-4">
      <p className="text-sm font-semibold text-ink mb-3">{titulo}</p>
      {fatias.length === 0 ? (
        <p className="text-xs text-ink-faint">Sem dados.</p>
      ) : (
        <div className="space-y-2">
          {mostradas.map(f => (
            <div key={f.nome}>
              <div className="flex justify-between items-baseline gap-3 mb-1">
                <span className="text-xs text-ink-dim truncate" title={f.nome}>{f.nome}</span>
                <span className="text-xs font-semibold text-ink tabular-nums flex-shrink-0">
                  {nBR(f.n)}
                  {f.tpv > 0 && <span className="text-ink-faint font-normal"> · {fmtDinheiroCurto(f.tpv)}</span>}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-card-2 overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(f.n / maior) * 100}%` }} />
              </div>
            </div>
          ))}
          {resto > 0 && <p className="text-[11px] text-ink-faint pt-1">+{resto} {resto === 1 ? 'outro' : 'outros'}</p>}
        </div>
      )}
    </div>
  )
}

interface Props {
  clientes: HexaCliente[]
  role: UserRole
  /** Perfil de quem importa — vai para `importado_por`. */
  uploadedBy: string
  /** Nome de quem está logado — vira o dono das rotas criadas pelo planejador. */
  meuNome: string
  baseAusente: boolean
}

export default function HexaPainelClient({ clientes, role, uploadedBy, meuNome, baseAusente }: Props) {
  const router = useRouter()
  // Só admin e dono chegam aqui (a página redireciona, a RLS fecha). Dentro
  // disso, quem SOBE a planilha é apenas o admin — foi a regra pedida.
  const podeImportar = role === 'admin'

  const [busca, setBusca] = useState('')
  const [fConsultores, setFConsultores] = useState<Set<string>>(new Set())
  const [fCidades, setFCidades] = useState<Set<string>>(new Set())
  const [fBairros, setFBairros] = useState<Set<string>>(new Set())
  const [fStatus, setFStatus] = useState<Set<string>>(new Set())
  const [alerta, setAlerta] = useState<Alerta | null>(null)
  const [pagina, setPagina] = useState(0)
  const [selecao, setSelecao] = useState<Set<string>>(new Set())

  const resumo = useMemo(() => resumoHexa(clientes), [clientes])

  const consultores = useMemo(() => resumo.porConsultor.map(f => f.nome), [resumo])
  const cidades = useMemo(() => resumo.porCidade.map(f => f.nome).sort(), [resumo])
  const bairros = useMemo(() => {
    const base = fCidades.size === 0 ? clientes : clientes.filter(c => fCidades.has(c.cidade))
    return [...new Set(base.map(c => c.bairro).filter(Boolean))].sort()
  }, [clientes, fCidades])
  const status = useMemo(() => resumo.porStatus.map(f => f.nome), [resumo])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return clientes.filter(c =>
      (fConsultores.size === 0 || fConsultores.has(c.consultor_nome)) &&
      (fCidades.size === 0 || fCidades.has(c.cidade)) &&
      (fBairros.size === 0 || fBairros.has(c.bairro)) &&
      (fStatus.size === 0 || fStatus.has(c.status_operacional)) &&
      (alerta === null ||
        (alerta === 'semGps' && (c.lat == null || c.lng == null)) ||
        (alerta === 'divergente' && !c.consultor_confere) ||
        (alerta === 'foraCarteira' && !c.em_carteira) ||
        (alerta === 'incompleto' && !c.cadastro_completo)) &&
      (!q ||
        c.seller_id.toLowerCase().includes(q) ||
        c.seller_nome.toLowerCase().includes(q) ||
        c.nome_comercio.toLowerCase().includes(q) ||
        (c.cpf_cnpj ?? '').toLowerCase().includes(q)),
    )
  }, [clientes, busca, fConsultores, fCidades, fBairros, fStatus, alerta])

  const resumoFiltrado = useMemo(() => resumoHexa(filtrados), [filtrados])
  const temFiltro = fConsultores.size + fCidades.size + fBairros.size + fStatus.size > 0 || !!busca.trim() || alerta !== null

  function limparFiltros() {
    setBusca(''); setFConsultores(new Set()); setFCidades(new Set())
    setFBairros(new Set()); setFStatus(new Set()); setAlerta(null); setPagina(0)
  }

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)

  // Só quem tem coordenada pode virar parada — sem GPS não há rota.
  const selecionaveis = useMemo(() => filtrados.filter(c => c.lat != null && c.lng != null), [filtrados])
  const selecionadosValidos = useMemo(
    () => clientes.filter(c => selecao.has(c.seller_id) && c.lat != null && c.lng != null),
    [clientes, selecao],
  )

  function alternar(sellerId: string) {
    setSelecao(s => {
      const novo = new Set(s)
      if (novo.has(sellerId)) novo.delete(sellerId); else novo.add(sellerId)
      return novo
    })
  }

  function selecionarFiltrados() {
    setSelecao(s => new Set([...s, ...selecionaveis.map(c => c.seller_id)]))
  }

  function irRoteirizar() {
    entregarAoRoteirizarHexa(selecionadosValidos.map(c => c.seller_id))
    router.push('/dashboard/hexa-recife/roteirizar')
  }

  /**
   * Célula de CSV pronta para o Excel — mesmo tratamento do relatório de
   * carteira: as aspas resolvem o RFC 4180 e o apóstrofo impede que `=`, `+`,
   * `-` ou `@` no início virem fórmula na máquina de quem abre o arquivo. Aqui
   * é texto vindo de planilha de terceiro, então vale a mesma precaução.
   */
  function celulaCsv(valor: string) {
    const bruto = String(valor ?? '')
    const perigoso = /^[=+\-@\t\r]/.test(bruto)
    return `"${(perigoso ? `'${bruto}` : bruto).replace(/"/g, '""')}"`
  }

  function exportarCsv() {
    const cabecalho = [
      'Seller ID', 'Nome no dashboard', 'Nome comércio', 'TPV', 'Segmento', 'Status operacional',
      'Consultor', 'Consultor confere', 'Telefone', 'E-mail', 'CPF/CNPJ', 'Cidade', 'Bairro',
      'Endereço', 'Lat', 'Lng', 'Status do cadastro', 'Está na carteira', 'Cadastro completo', 'Campos faltando',
    ]
    const linhas = [cabecalho, ...filtrados.map(c => [
      c.seller_id, c.seller_nome, c.nome_comercio, c.tpv == null ? '' : String(c.tpv), c.mcc,
      c.status_operacional, c.consultor_nome, c.consultor_confere ? 'sim' : 'não',
      c.seller_telefone ?? '', c.seller_email ?? '', c.cpf_cnpj ?? '', c.cidade, c.bairro,
      c.endereco_completo, c.lat == null ? '' : String(c.lat), c.lng == null ? '' : String(c.lng),
      c.status_cadastro, c.em_carteira ? 'sim' : 'não', c.cadastro_completo ? 'sim' : 'não', c.campos_faltando,
    ])]
    const csv = linhas.map(l => l.map(celulaCsv).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `rota-inter-hexa-recife-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const ultimoImport = fmtDataHora(clientes[0]?.importado_em)

  const cabecalho = (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-ink">Rota Inter/Hexa Recife</h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-warn border border-warn/40 bg-warn-bg rounded-full px-2 py-0.5">
            temporária
          </span>
        </div>
        <p className="text-sm text-ink-muted mt-0.5">
          Base própria da ação, separada da carteira.
          {ultimoImport && <> Importada em {ultimoImport}.</>}
        </p>
      </div>
      {clientes.length > 0 && (
        <button onClick={() => router.push('/dashboard/hexa-recife/roteirizar')}
          className="bg-primary hover:bg-primary-dk text-white text-sm font-semibold px-4 py-2 rounded-xl inline-flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="M9 19h6a4 4 0 0 0 4-4V9M15 5H9a4 4 0 0 0-4 4v6" />
          </svg>
          Montar rota
        </button>
      )}
    </div>
  )

  // --- Base ainda não criada no banco (migration não rodada) ---
  if (baseAusente) {
    return (
      <div>
        {cabecalho}
        <div className="glass rounded-2xl border border-line p-10 text-center">
          <p className="font-semibold text-ink">A categoria ainda não foi criada no banco</p>
          <p className="text-sm text-ink-muted mt-1 max-w-lg mx-auto">
            Falta rodar a migration <span className="font-mono text-xs text-primary">supabase/migrations/2026-08-04_rota_inter_hexa_recife.sql</span> no
            SQL Editor do Supabase. Depois disso, esta tela passa a aceitar a planilha.
          </p>
        </div>
      </div>
    )
  }

  // --- Base criada, ainda sem planilha ---
  if (clientes.length === 0) {
    return (
      <div>
        {cabecalho}
        {podeImportar && <div className="max-w-md mb-4"><ImportHexa importadoPor={uploadedBy} /></div>}
        <div className="glass rounded-2xl border border-line p-10 text-center">
          <p className="font-semibold text-ink">Nenhuma planilha importada ainda</p>
          <p className="text-sm text-ink-muted mt-1 max-w-lg mx-auto">
            {podeImportar
              ? 'Suba a planilha da rota Inter/Hexa acima para ver o painel e montar rotas.'
              : 'A planilha desta rota é enviada por um administrador.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      {cabecalho}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {podeImportar && (
          <ImportHexa
            importadoPor={uploadedBy}
            totalAtual={clientes.length}
            semGps={clientes
              .filter(c => c.lat == null || c.lng == null)
              .map(c => ({ id: c.id, endereco_completo: c.endereco_completo, cidade: c.cidade, bairro: c.bairro }))}
          />
        )}
        <PlanejarRotas clientes={clientes} meuNome={meuNome} />
      </div>

      {/* KPIs — sempre da base inteira que o usuário enxerga, não do filtro:
          é o retrato da rota. O filtro tem o próprio contador na tabela. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KPI label="Clientes" valor={nBR(resumo.total)} nota={`${resumo.porConsultor.length} consultor${resumo.porConsultor.length !== 1 ? 'es' : ''}`} />
        <KPI label="TPV somado" valor={fmtDinheiroCurto(resumo.tpvTotal)} nota={fmtDinheiro(resumo.tpvTotal)} />
        <KPI label="Com GPS" valor={`${nBR(resumo.comGps)}/${nBR(resumo.total)}`} nota="prontos para rota" tom={resumo.semGps > 0 ? 'warn' : 'good'} />
        <KPI label="Cadastro atualizado" valor={nBR(resumo.atualizados)} nota={`${nBR(resumo.total - resumo.atualizados)} a atualizar`} />
        <KPI label="Fora da carteira" valor={nBR(resumo.foraCarteira)} nota="não estão na Planilha Geral" tom={resumo.foraCarteira > 0 ? 'warn' : 'ink'} />
        <KPI label="Consultor divergente" valor={nBR(resumo.divergentes)} nota="planilha ≠ dashboard" tom={resumo.divergentes > 0 ? 'bad' : 'ink'} />
      </div>

      {/* Atalhos de conferência: cada chip filtra a tabela pelo problema. */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <span className="text-xs text-ink-muted">Conferir:</span>
        {([
          ['semGps', `${resumo.semGps} sem GPS`, resumo.semGps],
          ['divergente', `${resumo.divergentes} com consultor divergente`, resumo.divergentes],
          ['foraCarteira', `${resumo.foraCarteira} fora da carteira`, resumo.foraCarteira],
          ['incompleto', `${resumo.incompletos} com cadastro incompleto`, resumo.incompletos],
        ] as [Alerta, string, number][]).map(([chave, rotulo, n]) => (
          <button key={chave} disabled={n === 0}
            onClick={() => { setAlerta(a => (a === chave ? null : chave)); setPagina(0) }}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
              alerta === chave ? 'border-primary bg-primary/15 text-ink' : 'border-field-line bg-field text-ink-muted hover:text-ink'
            }`}>
            {rotulo}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <Distribuicao titulo="Status operacional" fatias={resumo.porStatus} />
        <Distribuicao titulo="Por consultor" fatias={resumo.porConsultor} />
        <Distribuicao titulo="Por cidade" fatias={resumo.porCidade} />
        <Distribuicao titulo="Por segmento (MCC)" fatias={resumo.porMcc} />
      </div>

      {/* --- Lista --- */}
      <div className="glass rounded-2xl border border-line p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-ink">Clientes da rota</span>
            <span className="text-xs text-ink-muted">
              <b className="text-ink">{nBR(filtrados.length)}</b>{temFiltro ? ' encontrados' : ''}
              {temFiltro && filtrados.length > 0 && <> · {fmtDinheiroCurto(resumoFiltrado.tpvTotal)}</>}
            </span>
          </div>
          <button onClick={exportarCsv} disabled={filtrados.length === 0}
            className="text-xs text-primary hover:underline flex items-center gap-1.5 disabled:opacity-40">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exportar CSV
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-3">
          <input value={busca} onChange={e => { setBusca(e.target.value); setPagina(0) }}
            placeholder="Buscar por ID, nome, comércio ou CNPJ…" className={`${inp} flex-1 min-w-[220px]`} />
          {consultores.length > 1 && <MultiFiltro label="Consultores" opcoes={consultores} sel={fConsultores} onChange={s => { setFConsultores(s); setPagina(0) }} />}
          <MultiFiltro label="Status" opcoes={status} sel={fStatus} onChange={s => { setFStatus(s); setPagina(0) }} />
          <MultiFiltro label="Cidades" opcoes={cidades} sel={fCidades} onChange={s => { setFCidades(s); setPagina(0) }} />
          <MultiFiltro label="Bairros" opcoes={bairros} sel={fBairros} onChange={s => { setFBairros(s); setPagina(0) }} />
          {temFiltro && <button onClick={limparFiltros} className="text-xs text-ink-muted hover:text-ink px-1.5">Limpar filtros</button>}
        </div>

        {/* Barra de seleção → roteirizar */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <button onClick={selecionarFiltrados} disabled={selecionaveis.length === 0}
            className="bg-card-2 hover:bg-primary/20 border border-field-line disabled:opacity-40 text-ink text-xs font-semibold px-3 py-1.5 rounded-lg">
            + Selecionar com GPS ({nBR(selecionaveis.length)})
          </button>
          {selecao.size > 0 && (
            <>
              <button onClick={() => setSelecao(new Set())} className="text-xs text-ink-muted hover:text-ink">Limpar seleção</button>
              <button onClick={irRoteirizar} disabled={selecionadosValidos.length === 0}
                className="ml-auto bg-primary hover:bg-primary-dk disabled:opacity-40 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg">
                Roteirizar {nBR(selecionadosValidos.length)} selecionado{selecionadosValidos.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
        </div>

        {filtrados.length === 0 ? (
          <p className="text-sm text-ink-faint text-center py-10">Nenhum cliente com esses filtros.</p>
        ) : (
          <>
            <div className="divide-y divide-line">
              {visiveis.map(c => {
                const semGps = c.lat == null || c.lng == null
                const endereco = enderecoExibivel(c.endereco_completo)
                const marcado = selecao.has(c.seller_id)
                return (
                  <div key={c.id} className="py-2.5 flex items-start gap-3">
                    <label className="pt-0.5">
                      <input type="checkbox" checked={marcado} disabled={semGps}
                        onChange={() => alternar(c.seller_id)}
                        title={semGps ? 'Sem GPS — não entra em rota' : 'Selecionar para a rota'}
                        className="accent-primary w-4 h-4 disabled:opacity-30" />
                    </label>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono bg-primary/15 text-primary-lt px-1.5 py-0.5 rounded">{c.seller_id}</span>
                        {c.tpv != null && <span className="text-[10px] font-semibold text-good bg-good-bg px-1.5 py-0.5 rounded">{fmtDinheiro(c.tpv)}</span>}
                        {semGps && <span className="text-[10px] text-warn border border-warn/40 rounded px-1.5 py-0.5">sem GPS</span>}
                        {!c.consultor_confere && <span className="text-[10px] text-bad border border-bad/40 rounded px-1.5 py-0.5">consultor divergente</span>}
                        {!c.em_carteira && <span className="text-[10px] text-warn border border-warn/40 rounded px-1.5 py-0.5">fora da carteira</span>}
                      </div>

                      <p className="text-sm font-medium text-ink truncate mt-0.5" title={c.seller_nome}>{c.seller_nome || '—'}</p>
                      {c.nome_comercio && c.nome_comercio !== c.seller_nome && (
                        <p className="text-[11px] text-ink-dim truncate" title={c.nome_comercio}>{c.nome_comercio}</p>
                      )}
                      {endereco && <p className="text-[11px] text-ink-dim truncate" title={endereco}>{endereco}</p>}
                      <p className="text-[11px] text-ink-faint truncate">
                        {c.bairro ? `${c.bairro}, ` : ''}{c.cidade}
                        {c.status_operacional && <> · {c.status_operacional}</>}
                        {c.consultor_nome && <> · {c.consultor_nome}</>}
                      </p>
                      {c.campos_faltando && <p className="text-[11px] text-warn truncate">falta: {c.campos_faltando}</p>}
                    </div>

                    {/* Alvo de 40px: são os botões usados na rua, com o celular
                        na mão. O padrão mora em BotaoContato para não divergir
                        entre as telas — foi o que aconteceu antes. */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <BotaoWhatsApp telefone={c.seller_telefone} nome={c.seller_nome || c.seller_id} />
                      <BotaoMapa lat={c.lat} lng={c.lng} nome={c.seller_nome || c.seller_id} />
                    </div>
                  </div>
                )
              })}
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={paginaAtual === 0}
                  className="w-8 h-8 grid place-items-center rounded-lg border border-field-line text-ink-muted hover:bg-card-2 disabled:opacity-40">‹</button>
                <span className="text-xs text-ink-muted tabular-nums">Página {paginaAtual + 1} de {totalPaginas}</span>
                <button onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} disabled={paginaAtual === totalPaginas - 1}
                  className="w-8 h-8 grid place-items-center rounded-lg border border-field-line text-ink-muted hover:bg-card-2 disabled:opacity-40">›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const inp = 'border border-field-line bg-field rounded-xl px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary'
