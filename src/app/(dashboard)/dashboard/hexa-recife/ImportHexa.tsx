'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { lerXlsxEmStream } from '@/lib/xlsx-grande'
import { geocodar, sleep } from '@/lib/geo'
import {
  lerPlanilhaHexa, ErroPlanilhaHexa, fmtDinheiroCurto,
  type HexaClienteLido, type HexaCliente,
} from '@/lib/hexa-recife'

const LOTE = 200   // linhas por insert; a planilha tem 145, então é uma volta só

interface Estado {
  status: 'idle' | 'lendo' | 'previa' | 'gravando' | 'ok' | 'erro'
  msg?: string
  progresso?: string
  lidos?: HexaClienteLido[]
  arquivo?: string
  gravados?: number
}

/**
 * Import da planilha da rota Inter/Hexa Recife — SÓ ADMIN.
 *
 * Duas coisas o separam dos outros imports do projeto:
 *
 * 1. NÃO usa a biblioteca `xlsx`. O arquivo desta rota tem 653 MB de XML dentro
 *    do zip (145 linhas de conteúdo e ~1 milhão de linhas em branco que o Excel
 *    salvou formatadas) e a `xlsx` devolve, EM SILÊNCIO, um workbook sem aba
 *    nenhuma — a tela diria "planilha vazia" para um arquivo cheio. Quem lê é o
 *    `lerXlsxEmStream`, que descomprime em stream. Se ele falhar (arquivo .xls
 *    antigo, navegador sem DecompressionStream), cai para a `xlsx`, que dá conta
 *    de planilha de tamanho normal.
 *
 * 2. É SNAPSHOT: gravar substitui a base inteira. Por isso mostra a prévia e
 *    espera confirmação — e por isso o delete vem antes do insert, na ordem, em
 *    vez de upsert (o que sumiu da planilha tem que sumir da rota).
 */
export default function ImportHexa({
  importadoPor,
  semGps = [],
  totalAtual = 0,
}: {
  importadoPor: string
  /** Clientes já na base sem coordenada — alvo do geocodar em massa. */
  semGps?: Pick<HexaCliente, 'id' | 'endereco_completo' | 'cidade' | 'bairro'>[]
  totalAtual?: number
}) {
  const router = useRouter()
  const [e, setE] = useState<Estado>({ status: 'idle' })
  const input = useRef<HTMLInputElement>(null)

  const [geo, setGeo] = useState<{ rodando: boolean; feitos: number; achados: number }>({ rodando: false, feitos: 0, achados: 0 })
  const pararGeo = useRef(false)

  const [encerrar, setEncerrar] = useState<'nao' | 'confirmando' | 'apagando'>('nao')

  async function lerArquivo(file: File): Promise<Record<string, unknown>[]> {
    try {
      return await lerXlsxEmStream(file, {
        aoProgredir: f => setE(s => ({ ...s, progresso: `lendo a planilha… ${Math.round(f * 100)}%` })),
      })
    } catch (err) {
      // Fallback para planilha "normal" (ou .xls/.csv, que não são zip OOXML).
      const { read, utils } = await import('xlsx')
      const wb = read(await file.arrayBuffer(), { type: 'array' })
      const aba = wb.Sheets[wb.SheetNames[0]]
      if (!aba) {
        throw new Error(
          'Não consegui ler esta planilha por nenhum dos dois caminhos.\n' +
          `Leitor em stream: ${(err as Error).message}`,
        )
      }
      return utils.sheet_to_json(aba, { defval: '' })
    }
  }

  async function selecionar(file: File) {
    setE({ status: 'lendo', arquivo: file.name })
    try {
      const linhas = await lerArquivo(file)
      const { clientes } = lerPlanilhaHexa(linhas)
      setE({ status: 'previa', lidos: clientes, arquivo: file.name })
    } catch (err) {
      setE({
        status: 'erro', arquivo: file.name,
        msg: err instanceof ErroPlanilhaHexa ? err.message : `Não consegui ler o arquivo: ${(err as Error).message}`,
      })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  async function gravar() {
    const lidos = e.lidos ?? []
    if (lidos.length === 0) return
    setE(s => ({ ...s, status: 'gravando', progresso: 'limpando a base anterior…' }))
    const supabase = createClient()

    // Snapshot: o que saiu da planilha sai da rota. `not id is null` porque o
    // PostgREST recusa delete sem filtro — é proteção contra apagar tudo por
    // acidente, e aqui apagar tudo é justamente a intenção.
    const { error: erroDel } = await supabase.from('hexa_recife_clientes').delete().not('id', 'is', null)
    if (erroDel) {
      setE(s => ({ ...s, status: 'erro', msg: `Erro ao limpar a base: ${erroDel.message}` }))
      return
    }

    for (let i = 0; i < lidos.length; i += LOTE) {
      setE(s => ({ ...s, progresso: `gravando ${Math.min(i + LOTE, lidos.length)}/${lidos.length}…` }))
      const { error } = await supabase
        .from('hexa_recife_clientes')
        .insert(lidos.slice(i, i + LOTE).map(c => ({ ...c, importado_por: importadoPor })))
      if (error) {
        setE(s => ({ ...s, status: 'erro', msg: `Erro ao gravar: ${error.message}` }))
        return
      }
    }

    setE({ status: 'ok', gravados: lidos.length, arquivo: e.arquivo })
    router.refresh()
  }

  /**
   * Geocodifica quem ficou sem coordenada (5 dos 145, na planilha de 04/08).
   * Um por vez, com pausa de ~1 s: é a política de uso do Nominatim, e
   * atropelar isso derruba o serviço para todo mundo do escritório.
   */
  async function geocodarFaltantes() {
    pararGeo.current = false
    setGeo({ rodando: true, feitos: 0, achados: 0 })
    const supabase = createClient()
    let feitos = 0, achados = 0

    for (const c of semGps) {
      if (pararGeo.current) break
      const consulta = [c.endereco_completo, c.bairro, c.cidade].map(s => (s ?? '').trim()).filter(Boolean).join(', ')
      const ponto = consulta ? await geocodar(consulta) : null
      if (ponto) {
        const { error } = await supabase
          .from('hexa_recife_clientes')
          .update({ lat: ponto.lat, lng: ponto.lng, updated_at: new Date().toISOString() })
          .eq('id', c.id)
        if (!error) achados++
      }
      feitos++
      setGeo({ rodando: true, feitos, achados })
      await sleep(1100)
    }

    setGeo({ rodando: false, feitos, achados })
    router.refresh()
  }

  /** Encerra a categoria: apaga a base e as rotas geradas por ela. */
  async function encerrarCategoria() {
    setEncerrar('apagando')
    const supabase = createClient()
    const { error: erroRotas } = await supabase.from('rotas').delete().eq('origem', 'hexa_recife')
    if (erroRotas) {
      setE({ status: 'erro', msg: `Erro ao apagar as rotas da categoria: ${erroRotas.message}` })
      setEncerrar('nao'); return
    }
    const { error } = await supabase.from('hexa_recife_clientes').delete().not('id', 'is', null)
    if (error) {
      setE({ status: 'erro', msg: `Erro ao apagar a base: ${error.message}` })
      setEncerrar('nao'); return
    }
    setEncerrar('nao')
    setE({ status: 'idle' })
    router.refresh()
  }

  const ocupado = e.status === 'lendo' || e.status === 'gravando'
  const lidos = e.lidos ?? []
  const semGpsNovos = lidos.filter(c => c.lat == null || c.lng == null).length
  const divergentes = lidos.filter(c => !c.consultor_confere).length
  const tpv = lidos.reduce((s, c) => s + (c.tpv ?? 0), 0)
  const consultores = [...new Set(lidos.map(c => c.consultor_nome).filter(Boolean))]

  return (
    <div className="glass rounded-2xl border border-line p-5 border-l-4 border-l-primary">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-8 h-8 rounded-lg bg-primary/15 grid place-items-center flex-shrink-0 text-primary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Planilha da rota Inter/Hexa</p>
          <p className="text-[11px] text-ink-muted">Só administrador · substitui a base inteira</p>
        </div>
      </div>

      {e.status === 'ok' && (
        <div className="text-xs bg-good-bg text-good rounded-lg px-3 py-2 my-3">
          ✓ {e.gravados?.toLocaleString('pt-BR')} clientes importados de {e.arquivo}
        </div>
      )}

      {e.status === 'erro' && (
        <div className="text-xs bg-bad-bg text-bad rounded-lg px-3 py-2 my-3 whitespace-pre-wrap">{e.msg}</div>
      )}

      {ocupado && (
        <div className="text-xs text-ink-muted bg-card-2 rounded-lg px-3 py-2 my-3 flex items-center gap-2">
          <span className="animate-spin inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
          {e.progresso ?? 'processando…'}
        </div>
      )}

      {/* Prévia antes de tocar no banco */}
      {e.status === 'previa' && (
        <div className="rounded-lg p-3 my-3 border border-primary/30 bg-primary/5">
          <p className="text-xs text-ink-dim font-medium mb-2">
            {e.arquivo} · a base passa a ter estes {lidos.length.toLocaleString('pt-BR')} clientes
            {totalAtual > 0 && <> (hoje tem {totalAtual.toLocaleString('pt-BR')})</>}:
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink-muted">
            <span><b className="text-ink">{fmtDinheiroCurto(tpv)}</b> de TPV somado</span>
            <span><b className="text-ink">{consultores.length}</b> consultor{consultores.length !== 1 ? 'es' : ''}</span>
            <span className={semGpsNovos > 0 ? 'text-warn' : ''}><b>{semGpsNovos}</b> sem GPS</span>
            <span className={divergentes > 0 ? 'text-warn' : ''}><b>{divergentes}</b> com consultor divergente</span>
          </div>
          {consultores.length > 0 && (
            <p className="text-[11px] text-ink-faint mt-2 truncate" title={consultores.join(', ')}>
              {consultores.join(' · ')}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={gravar} className="flex-1 bg-primary hover:bg-primary-dk text-white text-xs font-semibold py-2 rounded-lg">
              Substituir a base
            </button>
            <button onClick={() => setE({ status: 'idle' })} className="px-3 py-2 rounded-lg text-xs font-medium text-ink-dim border border-line hover:bg-card-2">
              Agora não
            </button>
          </div>
        </div>
      )}

      <label className={`flex items-center justify-center gap-2 w-full text-sm font-medium rounded-xl py-2.5 mt-3 transition-colors cursor-pointer ${
        ocupado ? 'opacity-50 cursor-not-allowed bg-card-2 text-ink-faint border border-line'
                : 'text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20'
      }`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {totalAtual > 0 ? 'Enviar nova versão' : 'Selecionar arquivo'}
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={ocupado}
          onChange={ev => { const f = ev.target.files?.[0]; if (f) selecionar(f) }} />
      </label>

      {/* Geocodar quem ficou sem coordenada */}
      {semGps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line">
          <p className="text-[11px] text-ink-muted mb-2">
            {semGps.length} cliente{semGps.length !== 1 ? 's' : ''} sem GPS {semGps.length !== 1 ? 'ficam' : 'fica'} fora das rotas.
            Buscar as coordenadas pelo endereço (~1s cada):
          </p>
          {geo.rodando ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-muted flex-1">{geo.feitos}/{semGps.length} · {geo.achados} encontrados</span>
              <button onClick={() => { pararGeo.current = true }} className="text-[11px] text-bad font-medium hover:underline">Parar</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={geocodarFaltantes}
                className="text-xs font-semibold text-good border border-good/30 bg-good-bg hover:bg-good/20 rounded-lg px-3 py-1.5">
                Geocodar {semGps.length} sem GPS
              </button>
              {geo.feitos > 0 && <span className="text-[11px] text-ink-faint">{geo.achados} de {geo.feitos} encontrados</span>}
            </div>
          )}
        </div>
      )}

      {/* Encerrar a categoria temporária */}
      {totalAtual > 0 && (
        <div className="mt-3 pt-3 border-t border-line">
          {encerrar === 'nao' ? (
            <button onClick={() => setEncerrar('confirmando')} className="text-[11px] text-ink-faint hover:text-bad">
              Encerrar categoria (apagar base e rotas)
            </button>
          ) : (
            <div className="text-[11px] bg-bad-bg rounded-lg p-2.5">
              <p className="text-bad font-medium mb-2">
                Apaga os {totalAtual.toLocaleString('pt-BR')} clientes desta rota E todas as rotas montadas a partir dela.
                A carteira normal e a agenda das outras rotas não são tocadas. Não dá para desfazer.
              </p>
              <div className="flex gap-2">
                <button onClick={encerrarCategoria} disabled={encerrar === 'apagando'}
                  className="bg-bad hover:bg-bad-dk disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg">
                  {encerrar === 'apagando' ? 'Apagando…' : 'Sim, encerrar'}
                </button>
                <button onClick={() => setEncerrar('nao')} className="text-ink-muted px-2">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
