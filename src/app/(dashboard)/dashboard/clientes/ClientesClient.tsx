'use client'

import { useState, useMemo, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { findCol } from '@/lib/pilares'
import { geocodar, sleep } from '@/lib/geo'
import { tituloCaso } from '@/lib/texto'
import type { Cliente, UserRole } from '@/lib/types'

const POR_PAGINA = 50
const LOTE_IMPORT = 500

const VAZIO = {
  seller_id: '', seller_nome: '', seller_telefone: '', seller_email: '',
  doc_tipo: '', cpf_cnpj: '',
  cidade: '', bairro: '', endereco_completo: '',
  lat: '', lng: '', consultor_nome: '',
}
type FormState = typeof VAZIO

function soDigitos(s: string | null) {
  return (s ?? '').replace(/\D/g, '')
}

function whatsappUrl(telefone: string | null, texto?: string) {
  const num = soDigitos(telefone)
  if (!num) return null
  const base = `https://wa.me/${num.startsWith('55') ? num : '55' + num}`
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base
}

function paraNum(v: unknown): number | null {
  const s = String(v ?? '').trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function paraForm(c: Cliente): FormState {
  return {
    seller_id: c.seller_id, seller_nome: c.seller_nome,
    seller_telefone: c.seller_telefone ?? '', seller_email: c.seller_email ?? '',
    doc_tipo: c.doc_tipo ?? '', cpf_cnpj: c.cpf_cnpj ?? '',
    cidade: c.cidade, bairro: c.bairro, endereco_completo: c.endereco_completo,
    lat: c.lat != null ? String(c.lat) : '', lng: c.lng != null ? String(c.lng) : '',
    consultor_nome: c.consultor_nome,
  }
}

// Placeholders que NÃO são endereço — geocodá-los devolveria um pino aleatório.
const SEM_ENDERECO = /^(endereç?o\s+n[ãa]o\s+informad[oa]|n[ãa]o\s+informad[oa]|sem\s+endereç?o|n\/?a|-+|—+)$/i

/** Melhor texto de endereço para geocodificar, ou '' se não houver nada útil. */
const enderecoDe = (c: { endereco_completo: string; bairro: string; cidade: string }) => {
  const end = c.endereco_completo.trim()
  const real = end && !SEM_ENDERECO.test(end) ? end : ''
  return real || [c.bairro, c.cidade].filter(Boolean).join(', ')
}

interface ImportState {
  status: 'idle' | 'parsing' | 'saving' | 'ok' | 'error'
  msg?: string
  inseridos?: number
  ignorados?: number
}

interface Props {
  clientes: Cliente[]
  role: UserRole
  meuNome: string
  nomesConsultores: string[]
}

export default function ClientesClient({ clientes, role, meuNome, nomesConsultores }: Props) {
  const router = useRouter()
  const podeGerir = role === 'admin' || role === 'dono'

  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormState>(VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null)
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' })
  const inputImport = useRef<HTMLInputElement>(null)

  // Geocodificação
  const [geoLinha, setGeoLinha] = useState<string | null>(null)
  const [geoForm, setGeoForm] = useState(false)
  const [bulk, setBulk] = useState<{ running: boolean; done: number; ok: number; total: number } | null>(null)
  const bulkStop = useRef(false)

  // WhatsApp em massa
  const [waSel, setWaSel] = useState<Set<string>>(new Set())
  const [waOpen, setWaOpen] = useState(false)
  const [waMsg, setWaMsg] = useState('Olá {nome}, tudo bem?')

  const semGpsCount = useMemo(() => clientes.filter(c => c.lat == null || c.lng == null).length, [clientes])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(c =>
      [c.seller_nome, c.seller_id, c.endereco_completo, c.cidade, c.bairro, c.consultor_nome]
        .some(v => (v ?? '').toLowerCase().includes(q))
    )
  }, [clientes, busca])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)

  function abrirNovo() {
    setEditando(null)
    setForm({ ...VAZIO, consultor_nome: podeGerir ? '' : meuNome })
    setErro('')
    setModalAberto(true)
  }
  function abrirEdicao(c: Cliente) {
    setEditando(c)
    setForm(paraForm(c))
    setErro('')
    setModalAberto(true)
  }
  const set = (campo: keyof FormState) => (v: string) => setForm(f => ({ ...f, [campo]: v }))

  async function geocodarForm() {
    const end = enderecoDe({ endereco_completo: form.endereco_completo, bairro: form.bairro, cidade: form.cidade })
    if (!end) return setErro('Preencha o endereço, bairro ou cidade primeiro.')
    setErro(''); setGeoForm(true)
    const p = await geocodar(end)
    setGeoForm(false)
    if (!p) return setErro('Endereço não encontrado na geocodificação.')
    setForm(f => ({ ...f, lat: String(p.lat), lng: String(p.lng) }))
  }

  async function salvar() {
    setErro('')
    if (!form.seller_id.trim()) return setErro('Seller ID é obrigatório.')
    if (!form.cidade.trim()) return setErro('Cidade é obrigatória.')
    if (!form.bairro.trim()) return setErro('Bairro é obrigatório.')
    if (!form.endereco_completo.trim()) return setErro('Endereço é obrigatório.')

    const nomeConsultor = podeGerir ? form.consultor_nome.trim() : meuNome
    if (!nomeConsultor) return setErro('Informe o consultor responsável.')

    const latNum = paraNum(form.lat), lngNum = paraNum(form.lng)
    if ((form.lat.trim() && latNum === null) || (form.lng.trim() && lngNum === null)) {
      return setErro('Latitude/Longitude inválidas.')
    }

    const payload = {
      consultor_nome: nomeConsultor,
      seller_id: form.seller_id.trim(),
      seller_nome: form.seller_nome.trim(),
      seller_telefone: form.seller_telefone.trim() || null,
      seller_email: form.seller_email.trim() || null,
      doc_tipo: form.doc_tipo || null,
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      // Canoniza a grafia na escrita: sem isso "Centro"/"CENTRO"/"centro" viram
      // três opções distintas nos filtros.
      cidade: tituloCaso(form.cidade),
      bairro: tituloCaso(form.bairro),
      endereco_completo: form.endereco_completo.trim(),
      lat: latNum, lng: lngNum,
    }

    setSalvando(true)
    const supabase = createClient()
    let error
    if (editando) {
      ;({ error } = await supabase
        .from('clientes')
        .update({ ...payload, status_atualizacao: 'Cliente Atualizado', updated_at: new Date().toISOString() })
        .eq('id', editando.id))
    } else {
      ;({ error } = await supabase.from('clientes').insert(payload))
    }
    setSalvando(false)
    if (error) {
      setErro(error.code === '23505' ? 'Já existe um cliente com esse Seller ID.' : error.message)
      return
    }
    setModalAberto(false)
    router.refresh()
  }

  async function excluir(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (error) { setErro(error.message); return }
    setConfirmarExcluir(null)
    router.refresh()
  }

  async function geocodarLinha(c: Cliente) {
    const end = enderecoDe(c)
    if (!end) return setErro(`"${c.seller_nome || c.seller_id}" não tem endereço para geocodificar.`)
    setErro(''); setGeoLinha(c.id)
    const p = await geocodar(end)
    setGeoLinha(null)
    if (!p) return setErro(`Não foi possível geocodificar "${c.seller_nome || c.seller_id}".`)
    const supabase = createClient()
    const { error } = await supabase.from('clientes').update({ lat: p.lat, lng: p.lng, updated_at: new Date().toISOString() }).eq('id', c.id)
    if (error) { setErro(error.message); return }
    router.refresh()
  }

  // Geocodifica em massa os clientes sem lat/lng. Throttle de ~1s respeita a
  // política do Nominatim. Interrompível.
  async function geocodarEmMassa() {
    const semGps = clientes.filter(c => c.lat == null || c.lng == null)
    if (semGps.length === 0) return
    setErro(''); bulkStop.current = false
    setBulk({ running: true, done: 0, ok: 0, total: semGps.length })
    const supabase = createClient()
    let done = 0, ok = 0
    for (const c of semGps) {
      if (bulkStop.current) break
      const end = enderecoDe(c)
      if (!end) { done++; setBulk({ running: true, done, ok, total: semGps.length }); continue }  // sem endereço → pula sem request
      const p = await geocodar(end)
      if (p) {
        const { error } = await supabase.from('clientes').update({ lat: p.lat, lng: p.lng, updated_at: new Date().toISOString() }).eq('id', c.id)
        if (!error) ok++
      }
      done++
      setBulk({ running: true, done, ok, total: semGps.length })
      await sleep(1100)
    }
    setBulk({ running: false, done, ok, total: semGps.length })
    router.refresh()
  }

  function toggleWa(id: string) {
    setWaSel(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const selecionadosWa = useMemo(() => clientes.filter(c => waSel.has(c.id)), [clientes, waSel])

  return (
    <div className="pb-16">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink">Clientes</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {podeGerir ? 'Carteira de clientes da equipe' : 'Sua carteira de clientes'} · {clientes.length} no total
            {semGpsCount > 0 && ` · ${semGpsCount} sem GPS`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {podeGerir && semGpsCount > 0 && (
            <button onClick={geocodarEmMassa} disabled={bulk?.running}
              className="border border-line hover:bg-card-2 disabled:opacity-50 text-ink-dim text-sm font-medium px-4 py-2 rounded-xl flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              Geocodar sem GPS ({semGpsCount})
            </button>
          )}
          {podeGerir && (
            <>
              <button onClick={() => inputImport.current?.click()} disabled={importState.status === 'parsing' || importState.status === 'saving'}
                className="border border-line hover:bg-card-2 disabled:opacity-50 text-ink-dim text-sm font-medium px-4 py-2 rounded-xl flex items-center gap-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                Importar planilha
              </button>
              <input ref={inputImport} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) importarPlanilha(f); e.target.value = '' }} />
            </>
          )}
          <button onClick={abrirNovo} className="bg-primary hover:bg-primary-dk text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Novo Cliente
          </button>
        </div>
      </div>

      {bulk && (
        <div className="mb-4 text-sm rounded-xl px-4 py-2.5 bg-card-2 text-ink-muted flex items-center gap-2">
          {bulk.running && <Spinner />}
          {bulk.running
            ? <>Geocodificando… {bulk.done}/{bulk.total} ({bulk.ok} com sucesso)</>
            : <>✓ Geocodificação concluída: {bulk.ok} de {bulk.total} localizados.</>}
          {bulk.running && <button onClick={() => { bulkStop.current = true }} className="ml-auto text-bad font-medium">Parar</button>}
        </div>
      )}

      {importState.status !== 'idle' && (
        <div className={`mb-4 text-sm rounded-xl px-4 py-2.5 ${
          importState.status === 'error' ? 'bg-bad-bg text-bad whitespace-pre-wrap'
          : importState.status === 'ok' ? 'bg-good-bg text-good'
          : 'bg-card-2 text-ink-muted flex items-center gap-2'}`}>
          {importState.status === 'parsing' && <><Spinner /> Lendo planilha…</>}
          {importState.status === 'saving' && <><Spinner /> Importando… {importState.inseridos} inseridos</>}
          {importState.status === 'ok' && `✓ ${importState.inseridos} clientes importados${importState.ignorados ? ` · ${importState.ignorados} já existiam (ignorados)` : ''}.`}
          {importState.status === 'error' && importState.msg}
        </div>
      )}

      <div className="mb-4">
        <input type="text" placeholder="Buscar por nome, seller ID, endereço, cidade ou bairro..."
          value={busca} onChange={e => { setBusca(e.target.value); setPagina(0) }}
          className="w-full max-w-md text-sm bg-field border border-field-line rounded-xl px-3.5 py-2.5 text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>

      {filtrados.length === 0 ? (
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">{clientes.length === 0 ? 'Nenhum cliente ainda' : 'Nenhum resultado'}</p>
          <p className="text-sm text-ink-muted mt-1">
            {clientes.length === 0 ? (podeGerir ? 'Importe a planilha ou cadastre o primeiro cliente.' : 'Cadastre o primeiro cliente no botão acima.') : 'Ajuste a busca.'}
          </p>
        </div>
      ) : (
        <div className="glass rounded-2xl border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-card-2 text-left">
                <th className="px-3 py-3 w-8"></th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Local</th>
                {podeGerir && <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Consultor</th>}
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider text-center">GPS</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visiveis.map(c => {
                const wa = whatsappUrl(c.seller_telefone)
                const temGps = c.lat != null && c.lng != null
                return (
                  <tr key={c.id} className="hover:bg-card-2 transition-colors">
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={waSel.has(c.id)} onChange={() => toggleWa(c.id)} className="accent-good w-4 h-4" />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink leading-tight">{c.seller_nome || '—'}</p>
                      <p className="text-[11px] text-ink-faint">#{c.seller_id}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {wa && (
                          <a href={wa} target="_blank" rel="noopener noreferrer" className="text-[11px] text-good hover:underline flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                            WhatsApp
                          </a>
                        )}
                        {c.seller_email && <span className="text-[11px] text-ink-faint" title={c.seller_email}>✉ e-mail</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink leading-tight">{c.cidade || '—'}</p>
                      <p className="text-[11px] text-ink-faint">{c.bairro || '—'}</p>
                    </td>
                    {podeGerir && <td className="px-4 py-3"><p className="text-ink-dim leading-tight">{c.consultor_nome || '—'}</p></td>}
                    <td className="px-4 py-3 text-center">
                      {temGps ? (
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-good-bg text-good">GPS</span>
                      ) : geoLinha === c.id ? (
                        <span className="text-[10px] text-ink-muted inline-flex items-center gap-1"><Spinner /> …</span>
                      ) : (
                        <button onClick={() => geocodarLinha(c)} className="text-[10px] font-semibold text-primary hover:underline">geocodar</button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium ${c.status_atualizacao === 'Cliente Atualizado' ? 'text-good' : 'text-ink-faint'}`}>{c.status_atualizacao}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {confirmarExcluir === c.id ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="text-bad">Excluir?</span>
                          <button onClick={() => excluir(c.id)} className="bg-bad text-white px-2 py-0.5 rounded-md font-semibold">Sim</button>
                          <button onClick={() => setConfirmarExcluir(null)} className="text-ink-muted px-1">Não</button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-3">
                          <button onClick={() => abrirEdicao(c)} className="text-primary hover:underline text-xs font-medium">Editar</button>
                          <button onClick={() => setConfirmarExcluir(c.id)} className="text-bad hover:underline text-xs font-medium">Excluir</button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-ink-muted">{paginaAtual * POR_PAGINA + 1}–{Math.min((paginaAtual + 1) * POR_PAGINA, filtrados.length)} de {filtrados.length}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={paginaAtual === 0} className="px-3 py-1.5 rounded-lg border border-line text-ink-dim disabled:opacity-40 hover:bg-card-2">Anterior</button>
            <span className="text-ink-muted">{paginaAtual + 1} / {totalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} disabled={paginaAtual >= totalPaginas - 1} className="px-3 py-1.5 rounded-lg border border-line text-ink-dim disabled:opacity-40 hover:bg-card-2">Próxima</button>
          </div>
        </div>
      )}

      {/* Barra de seleção WhatsApp */}
      {waSel.size > 0 && (
        <div className="fixed bottom-0 left-60 right-0 glass border-t border-line px-6 py-3 flex items-center gap-3 z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <span className="text-sm font-semibold text-ink">{waSel.size} selecionado{waSel.size !== 1 ? 's' : ''}</span>
          <button onClick={() => setWaSel(new Set())} className="text-sm text-ink-muted hover:underline ml-auto">Limpar</button>
          <button onClick={() => setWaOpen(true)} className="bg-primary hover:bg-primary-dk text-white text-sm font-semibold px-5 py-2 rounded-xl">Enviar WhatsApp</button>
        </div>
      )}

      {/* Modal cadastro/edição */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={() => setModalAberto(false)}>
          <div className="glass rounded-2xl w-full max-w-lg my-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <h2 className="font-bold text-ink">{editando ? 'Editar cliente' : 'Novo cliente'}</h2>
              <button onClick={() => setModalAberto(false)} className="text-ink-faint hover:text-ink-dim text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              {podeGerir && (
                <Campo label="Consultor responsável">
                  <input list="consultores-list" value={form.consultor_nome} onChange={e => set('consultor_nome')(e.target.value)} className={inputCls} placeholder="Nome do consultor" />
                  <datalist id="consultores-list">{nomesConsultores.map(n => <option key={n} value={n} />)}</datalist>
                </Campo>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Seller ID *"><input value={form.seller_id} onChange={e => set('seller_id')(e.target.value)} className={inputCls} disabled={!!editando} /></Campo>
                <Campo label="Nome do cliente"><input value={form.seller_nome} onChange={e => set('seller_nome')(e.target.value)} className={inputCls} /></Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Telefone (WhatsApp)"><input value={form.seller_telefone} onChange={e => set('seller_telefone')(e.target.value)} className={inputCls} placeholder="(11) 90000-0000" /></Campo>
                <Campo label="E-mail"><input value={form.seller_email} onChange={e => set('seller_email')(e.target.value)} className={inputCls} /></Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Documento">
                  <select value={form.doc_tipo} onChange={e => set('doc_tipo')(e.target.value)} className={inputCls}>
                    <option value="">—</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option>
                  </select>
                </Campo>
                <Campo label="CPF / CNPJ"><input value={form.cpf_cnpj} onChange={e => set('cpf_cnpj')(e.target.value)} className={inputCls} /></Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Cidade *"><input value={form.cidade} onChange={e => set('cidade')(e.target.value)} className={inputCls} /></Campo>
                <Campo label="Bairro *"><input value={form.bairro} onChange={e => set('bairro')(e.target.value)} className={inputCls} /></Campo>
              </div>
              <Campo label="Endereço completo *">
                <input value={form.endereco_completo} onChange={e => set('endereco_completo')(e.target.value)} className={inputCls} placeholder="Rua, número, cidade" />
              </Campo>
              <div className="flex items-end gap-2">
                <div className="grid grid-cols-2 gap-3 flex-1">
                  <Campo label="Latitude"><input value={form.lat} onChange={e => set('lat')(e.target.value)} className={inputCls} placeholder="-23.55" /></Campo>
                  <Campo label="Longitude"><input value={form.lng} onChange={e => set('lng')(e.target.value)} className={inputCls} placeholder="-46.63" /></Campo>
                </div>
                <button onClick={geocodarForm} disabled={geoForm} className="border border-good/40 text-good text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap disabled:opacity-50">
                  {geoForm ? '…' : 'Buscar do endereço'}
                </button>
              </div>
              <p className="text-[11px] text-ink-faint">Sem lat/lng o cliente não aparece no Radar. Use &quot;Buscar do endereço&quot; para geocodificar.</p>
              {erro && <p className="text-xs text-bad bg-bad-bg rounded-lg px-3 py-2">{erro}</p>}
            </div>
            <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
              <button onClick={() => setModalAberto(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-ink-dim hover:bg-card-2">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="bg-primary hover:bg-primary-dk disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-xl">
                {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo WhatsApp em massa */}
      {waOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={() => setWaOpen(false)}>
          <div className="glass rounded-2xl w-full max-w-lg my-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <h2 className="font-bold text-ink">WhatsApp — {selecionadosWa.length} cliente{selecionadosWa.length !== 1 ? 's' : ''}</h2>
              <button onClick={() => setWaOpen(false)} className="text-ink-faint hover:text-ink-dim text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              <Campo label="Mensagem (use {nome} para o nome do cliente)">
                <textarea value={waMsg} onChange={e => setWaMsg(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
              </Campo>
              <p className="text-[11px] text-ink-faint">
                O WhatsApp não permite disparo automático em massa. Abra a conversa de cada cliente abaixo — a mensagem já vai preenchida.
              </p>
              <div className="max-h-64 overflow-y-auto divide-y divide-line border border-line rounded-xl">
                {selecionadosWa.map(c => {
                  const link = whatsappUrl(c.seller_telefone, waMsg.replace(/\{nome\}/g, c.seller_nome || 'cliente'))
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate">{c.seller_nome || `#${c.seller_id}`}</p>
                        <p className="text-[11px] text-ink-faint">{c.seller_telefone || 'sem telefone'}</p>
                      </div>
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="bg-good text-white text-xs font-semibold px-3 py-1.5 rounded-lg">Abrir</a>
                      ) : (
                        <span className="text-[11px] text-ink-faint">sem telefone</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // Import admin (definido depois pra manter o topo do componente legível).
  async function importarPlanilha(file: File) {
    setImportState({ status: 'parsing' })
    try {
      const { read, utils } = await import('xlsx')
      const wb = read(await file.arrayBuffer(), { type: 'array' })
      const rows: Record<string, unknown>[] = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      if (rows.length === 0) { setImportState({ status: 'error', msg: 'Planilha vazia.' }); return }

      const h = Object.keys(rows[0])
      const cSeller = findCol(h, 'seller_id')
      if (!cSeller) { setImportState({ status: 'error', msg: `Coluna "seller_id" não encontrada.\nColunas: ${h.join(', ')}` }); return }
      const c = {
        nome: findCol(h, 'seller_nome'), tel: findCol(h, 'seller_telefone'), email: findCol(h, 'seller_email'),
        cons: findCol(h, 'nome_consultor') ?? findCol(h, 'consultor_nome'), end: findCol(h, 'endereco_completo'),
        cid: findCol(h, 'cidade'), bai: findCol(h, 'bairro'), lat: findCol(h, 'lat'), lng: findCol(h, 'lng'), stat: findCol(h, 'status_atualizacao'),
      }
      const val = (r: Record<string, unknown>, col: string | null) => col ? String(r[col] ?? '').trim() : ''
      const linhas = rows.filter(r => val(r, cSeller) !== '').map(r => ({
        seller_id: val(r, cSeller), seller_nome: val(r, c.nome),
        seller_telefone: val(r, c.tel) || null, seller_email: val(r, c.email) || null,
        consultor_nome: val(r, c.cons), endereco_completo: val(r, c.end),
        // Mesma canonização do cadastro manual: a planilha traz "RECIFE" e
        // "Recife" misturados, e cada variante viraria um filtro separado.
        cidade: tituloCaso(val(r, c.cid)), bairro: tituloCaso(val(r, c.bai)),
        lat: c.lat ? paraNum(r[c.lat]) : null, lng: c.lng ? paraNum(r[c.lng]) : null,
        status_atualizacao: val(r, c.stat) === 'Cliente Atualizado' ? 'Cliente Atualizado' : 'Cliente não atualizado',
      }))

      setImportState({ status: 'saving', inseridos: 0 })
      const supabase = createClient()
      let inseridos = 0
      for (let i = 0; i < linhas.length; i += LOTE_IMPORT) {
        const lote = linhas.slice(i, i + LOTE_IMPORT)
        const { data, error } = await supabase.from('clientes').upsert(lote, { onConflict: 'seller_id', ignoreDuplicates: true }).select('id')
        if (error) { setImportState({ status: 'error', msg: `Erro ao importar: ${error.message}` }); return }
        inseridos += data?.length ?? 0
        setImportState({ status: 'saving', inseridos })
      }
      setImportState({ status: 'ok', inseridos, ignorados: linhas.length - inseridos })
      router.refresh()
    } catch (e) {
      setImportState({ status: 'error', msg: (e as Error).message })
    }
  }
}

const inputCls = 'w-full border border-field-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-card-2 disabled:text-ink-faint'

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-ink-muted mb-1 block">{label}</span>
      {children}
    </label>
  )
}

function Spinner() {
  return <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-good border-t-transparent rounded-full" />
}
