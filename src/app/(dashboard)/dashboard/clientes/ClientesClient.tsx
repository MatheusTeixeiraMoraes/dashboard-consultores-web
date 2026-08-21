'use client'

import { useState, useMemo, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import MultiFiltro from '@/components/MultiFiltro'
import { BotaoWhatsApp, BotaoMapa, urlWhatsApp } from '@/components/BotaoContato'
import { findCol } from '@/lib/pilares'
import { geocodar, sleep } from '@/lib/geo'
import { tituloCaso, tipoDoc, precisaIdentificar } from '@/lib/texto'
import type { Cliente, UserRole } from '@/lib/types'
import type { FichaMP } from './page'
import { registrarEvento } from '@/lib/atividade'

const PinMapa = dynamic(() => import('./PinMapa'), {
  ssr: false,
  loading: () => <div className="h-80 rounded-xl border border-line bg-card-2 flex items-center justify-center text-xs text-ink-faint">Carregando mapa…</div>,
})

const POR_PAGINA = 48        // múltiplo de 2 e 3: fecha a última fila do grid
const LOTE_IMPORT = 500

const VAZIO = {
  seller_id: '', seller_nome: '', seller_telefone: '', seller_email: '',
  doc_tipo: '', cpf_cnpj: '',
  cidade: '', bairro: '', endereco_completo: '',
  lat: '', lng: '', consultor_nome: '',
}
type FormState = typeof VAZIO

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

const temGps = (c: Cliente) => c.lat != null && c.lng != null

const GPS_OPCOES = ['Com GPS', 'Sem GPS']
const rotuloGps = (c: Cliente) => (temGps(c) ? 'Com GPS' : 'Sem GPS')

const ordenar = (s: Iterable<string>) => [...new Set(s)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'))

const nBR = (n: number) => n.toLocaleString('pt-BR')
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null)

// Cor do avatar sorteada pelo nome — estável por cliente, sem significado.
// Classes escritas por extenso porque o Tailwind não gera nome montado em runtime.
const AVATARES = ['bg-av-1', 'bg-av-2', 'bg-av-3', 'bg-av-4', 'bg-av-5']
function corAvatar(chave: string) {
  let soma = 0
  for (let i = 0; i < chave.length; i++) soma += chave.charCodeAt(i)
  return AVATARES[soma % AVATARES.length]
}
// Primeira LETRA, não primeiro caractere: quase todo seller_nome vem com o
// CNPJ na frente ("01.467.973 LUCIANO TEIXEIRA"), e o avatar viraria "0".
const inicial = (c: Cliente) => (c.seller_nome.match(/\p{L}/u)?.[0] ?? '?').toUpperCase()

const precisaEnriquecer = (c: Cliente) => precisaIdentificar(c.seller_nome, c.seller_id)

// Placeholders que NÃO são endereço — geocodá-los devolveria um pino aleatório.
const SEM_ENDERECO = /^(endereç?o\s+n[ãa]o\s+informad[oa]|n[ãa]o\s+informad[oa]|sem\s+endereç?o|n\/?a|-+|—+)$/i

/** Melhor texto de endereço para geocodificar, ou '' se não houver nada útil. */
const enderecoDe = (c: { endereco_completo: string; bairro: string; cidade: string }) => {
  const end = c.endereco_completo.trim()
  const real = end && !SEM_ENDERECO.test(end) ? end : ''
  return real || [c.bairro, c.cidade].filter(Boolean).join(', ')
}

/** Top N de uma dimensão, para os painéis do rodapé. */
function contar(lista: Cliente[], campo: (c: Cliente) => string, n = 6): [string, number][] {
  const m = new Map<string, number>()
  for (const c of lista) {
    const k = campo(c)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n)
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
  /** Ficha da Planilha Geral, por seller_id. Vazio se a planilha não foi importada. */
  fichaTecnica: Record<string, FichaMP>
  /** Data do snapshot do MP — o TPV do mês é parcial até esta data. */
  dataMP: string | null
}

export default function ClientesClient({ clientes, role, meuNome, nomesConsultores, fichaTecnica, dataMP }: Props) {
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

  // Filtros (mesmo componente do Roteirizar)
  const [fConsultores, setFConsultores] = useState<Set<string>>(new Set())
  const [fCidades, setFCidades] = useState<Set<string>>(new Set())
  const [fBairros, setFBairros] = useState<Set<string>>(new Set())
  const [fGps, setFGps] = useState<Set<string>>(new Set())
  // Filtros que vem da Planilha Geral (so aparecem se ela foi importada).
  const [fSituacao, setFSituacao] = useState<Set<string>>(new Set())
  const [fQuartil, setFQuartil] = useState<Set<string>>(new Set())
  const [fMcc, setFMcc] = useState<Set<string>>(new Set())

  // Geocodificação
  const [geoLinha, setGeoLinha] = useState<string | null>(null)
  const [geoForm, setGeoForm] = useState(false)
  const [mapaAberto, setMapaAberto] = useState(false)
  const [bulk, setBulk] = useState<{ running: boolean; done: number; ok: number; total: number } | null>(null)
  const bulkStop = useRef(false)

  // WhatsApp em massa
  const [waSel, setWaSel] = useState<Set<string>>(new Set())
  const [waOpen, setWaOpen] = useState(false)
  const [waMsg, setWaMsg] = useState('Olá {nome}, tudo bem?')

  // Enriquecimento: copiar o ID pra buscar no painel do MP, e filtrar pendentes.
  const [copiado, setCopiado] = useState<string | null>(null)
  const [soPendentes, setSoPendentes] = useState(false)
  function copiarId(id: string) {
    navigator.clipboard?.writeText(id)
    setCopiado(id)
    setTimeout(() => setCopiado(atual => (atual === id ? null : atual)), 1500)
  }
  const pendentesCount = useMemo(() => clientes.filter(precisaEnriquecer).length, [clientes])

  const temFicha = Object.keys(fichaTecnica).length > 0
  const mccs = useMemo(
    () => ordenar(clientes.map(c => fichaTecnica[c.seller_id]?.mcc ?? '')),
    [clientes, fichaTecnica],
  )

  const consultores = useMemo(() => ordenar(clientes.map(c => c.consultor_nome)), [clientes])
  const cidades = useMemo(() => ordenar(clientes.map(c => c.cidade)), [clientes])
  // Bairros seguem as cidades escolhidas — senão a lista tem 800 opções, quase
  // todas de cidades que o usuário nem está olhando.
  const bairros = useMemo(() => {
    const base = fCidades.size ? clientes.filter(c => fCidades.has(c.cidade)) : clientes
    return ordenar(base.map(c => c.bairro))
  }, [clientes, fCidades])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return clientes.filter(c =>
      (!soPendentes || precisaEnriquecer(c)) &&
      (fConsultores.size === 0 || fConsultores.has(c.consultor_nome)) &&
      (fCidades.size === 0 || fCidades.has(c.cidade)) &&
      (fBairros.size === 0 || fBairros.has(c.bairro)) &&
      (fGps.size === 0 || fGps.has(rotuloGps(c))) &&
      (fSituacao.size === 0 || fSituacao.has(fichaTecnica[c.seller_id]?.status ?? '')) &&
      (fQuartil.size === 0 || fQuartil.has(fichaTecnica[c.seller_id]?.quartil ?? '')) &&
      (fMcc.size === 0 || fMcc.has(fichaTecnica[c.seller_id]?.mcc ?? '')) &&
      (!q || [c.seller_nome, c.seller_id, c.endereco_completo, c.cidade, c.bairro, c.consultor_nome]
        .some(v => (v ?? '').toLowerCase().includes(q)))
    )
  }, [clientes, busca, soPendentes, fConsultores, fCidades, fBairros, fGps, fSituacao, fQuartil, fMcc, fichaTecnica])

  // Os KPIs leem o resultado filtrado: eles são o placar do que está na tela,
  // não um total fixo que ignora os filtros.
  const semGps = useMemo(() => filtrados.filter(c => !temGps(c)), [filtrados])
  const kpis = useMemo(() => {
    const comGps = filtrados.length - semGps.length
    return [
      { icon: 'users', label: 'Clientes', valor: filtrados.length },
      { icon: 'pin', label: 'Com GPS', valor: comGps },
      { icon: 'alert', label: 'Sem GPS', valor: semGps.length },
      { icon: 'doc', label: 'A identificar', valor: filtrados.filter(precisaEnriquecer).length },
    ]
  }, [filtrados, semGps])

  const porCidade = useMemo(() => contar(filtrados, c => c.cidade), [filtrados])
  const porSegundo = useMemo(
    () => contar(filtrados, c => (podeGerir ? c.consultor_nome : c.bairro)),
    [filtrados, podeGerir],
  )

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)

  const qtdFiltros = fConsultores.size + fCidades.size + fBairros.size + fGps.size + fSituacao.size + fQuartil.size + fMcc.size
  const filtrando = qtdFiltros > 0 || busca.trim() !== '' || soPendentes

  // Trocar de filtro volta pra primeira página: manter a página 7 depois de
  // filtrar para 30 clientes mostraria uma tela vazia.
  const aoFiltrar = (aplicar: (s: Set<string>) => void) => (s: Set<string>) => { aplicar(s); setPagina(0) }

  function limparFiltros() {
    setBusca('')
    setFConsultores(new Set()); setFCidades(new Set()); setFBairros(new Set())
    setFGps(new Set())
    setFSituacao(new Set()); setFQuartil(new Set()); setFMcc(new Set())
    setSoPendentes(false)
    setPagina(0)
  }

  function abrirNovo() {
    setEditando(null)
    setForm({ ...VAZIO, consultor_nome: podeGerir ? '' : meuNome })
    setErro('')
    setMapaAberto(false)
    setModalAberto(true)
  }
  function abrirEdicao(c: Cliente) {
    setEditando(c)
    setForm(paraForm(c))
    setErro('')
    setMapaAberto(false)
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
    // Endereço/cidade/bairro são OPCIONAIS: identificar um cliente (nome, CPF,
    // telefone) não exige endereço. Sem lat/lng ele já não aparece no Radar, e o
    // enriquecimento tem que poder salvar só a identidade que o consultor achou.

    const nomeConsultor = podeGerir ? form.consultor_nome.trim() : meuNome
    if (!nomeConsultor) return setErro('Informe o consultor responsável.')

    const latNum = paraNum(form.lat), lngNum = paraNum(form.lng)
    if ((form.lat.trim() && latNum === null) || (form.lng.trim() && lngNum === null)) {
      return setErro('Coordenadas inválidas.')
    }

    const payload = {
      seller_id: form.seller_id.trim(),
      seller_nome: form.seller_nome.trim(),
      seller_telefone: form.seller_telefone.trim() || null,
      seller_email: form.seller_email.trim() || null,
      doc_tipo: form.doc_tipo || null,
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      // Canoniza a grafia na escrita: sem isso "Centro"/"CENTRO"/"centro" viram
      // três opções distintas nos filtros. Vazio é '' (a coluna é NOT NULL
      // default ''), não null — um stub sem endereço é válido.
      cidade: form.cidade.trim() ? tituloCaso(form.cidade) : '',
      bairro: form.bairro.trim() ? tituloCaso(form.bairro) : '',
      endereco_completo: form.endereco_completo.trim(),
      lat: latNum, lng: lngNum,
    }

    setSalvando(true)
    const supabase = createClient()
    try {
      if (editando) {
        // consultor_nome só entra quando GESTÃO reatribui. O consultor editando
        // o próprio cliente NÃO carimba o dono — a carteira é da Planilha Geral,
        // e reescrever aqui poderia sobrepor uma transferência recente.
        const update = podeGerir
          ? { ...payload, consultor_nome: nomeConsultor, status_atualizacao: 'Cliente Atualizado', updated_at: new Date().toISOString() }
          : { ...payload, status_atualizacao: 'Cliente Atualizado', updated_at: new Date().toISOString() }
        // .select() é obrigatório: sem ele, um UPDATE que a RLS barra (cliente
        // transferido para outro consultor no meio da edição) volta com ZERO
        // linhas e SEM erro — o modal fecharia "salvo" e o trabalho sumiria.
        const { data, error } = await supabase.from('clientes').update(update).eq('id', editando.id).select('id')
        if (error) throw error
        if (!data || data.length === 0) {
          setErro('Não foi possível salvar: este cliente pode ter saído da sua carteira. Recarregue a página.')
          return
        }
        registrarEvento({
          tipo: 'cliente_editado',
          alvoTipo: 'cliente',
          alvoId: payload.seller_id,
          alvoDescricao: payload.seller_nome || payload.seller_id,
          detalhes: { consultor_nome: nomeConsultor },
        })
      } else {
        const { error } = await supabase.from('clientes').insert({ ...payload, consultor_nome: nomeConsultor })
        if (error) throw error
        registrarEvento({
          tipo: 'cliente_criado',
          alvoTipo: 'cliente',
          alvoId: payload.seller_id,
          alvoDescricao: payload.seller_nome || payload.seller_id,
          detalhes: { consultor_nome: nomeConsultor },
        })
      }
    } catch (e) {
      const err = e as { code?: string; message: string }
      setErro(err.code === '23505' ? 'Já existe um cliente com esse Seller ID.' : err.message)
      return
    } finally {
      setSalvando(false)
    }
    setModalAberto(false)
    router.refresh()
  }

  // "Tirar da carteira" = soft-hide, não delete. Se apagasse a linha, a próxima
  // reconciliação recriaria o cliente como stub em branco (perdendo o cadastro
  // enriquecido). Marcando em_carteira=false, o dado sobrevive; se o cliente
  // ainda estiver na Planilha Geral, a reconciliação o traz de volta — correto,
  // porque a planilha é quem diz de quem é a carteira.
  async function excluir(c: Cliente) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('clientes')
      .update({ em_carteira: false, updated_at: new Date().toISOString() })
      .eq('id', c.id).select('id')
    if (error) { setErro(error.message); return }
    if (!data || data.length === 0) { setErro('Este cliente já não está na sua carteira. Recarregue a página.'); return }
    registrarEvento({
      tipo: 'cliente_removido_carteira',
      alvoTipo: 'cliente',
      alvoId: c.seller_id,
      alvoDescricao: c.seller_nome || c.seller_id,
    })
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
    const { data, error } = await supabase.from('clientes').update({ lat: p.lat, lng: p.lng, updated_at: new Date().toISOString() }).eq('id', c.id).select('id')
    if (error) { setErro(error.message); return }
    if (!data || data.length === 0) { setErro(`"${c.seller_nome || c.seller_id}" saiu da sua carteira. Recarregue a página.`); return }
    registrarEvento({
      tipo: 'cliente_editado',
      alvoTipo: 'cliente',
      alvoId: c.seller_id,
      alvoDescricao: c.seller_nome || c.seller_id,
      detalhes: { via: 'geocodificacao' },
    })
    router.refresh()
  }

  // Geocodifica em massa os clientes sem lat/lng DO FILTRO ATUAL — o botão diz
  // o mesmo número que o KPI "Sem GPS" ao lado, então tem que agir sobre os
  // mesmos clientes. Throttle de ~1s respeita a política do Nominatim.
  // Interrompível.
  async function geocodarEmMassa() {
    if (semGps.length === 0) return
    const alvo = semGps
    setErro(''); bulkStop.current = false
    setBulk({ running: true, done: 0, ok: 0, total: alvo.length })
    const supabase = createClient()
    let done = 0, ok = 0
    for (const c of alvo) {
      if (bulkStop.current) break
      const end = enderecoDe(c)
      if (!end) { done++; setBulk({ running: true, done, ok, total: alvo.length }); continue }  // sem endereço → pula sem request
      const p = await geocodar(end)
      if (p) {
        const { error } = await supabase.from('clientes').update({ lat: p.lat, lng: p.lng, updated_at: new Date().toISOString() }).eq('id', c.id)
        if (!error) ok++
      }
      done++
      setBulk({ running: true, done, ok, total: alvo.length })
      await sleep(1100)
    }
    setBulk({ running: false, done, ok, total: alvo.length })
    if (ok > 0) {
      registrarEvento({
        tipo: 'clientes_editados_em_massa',
        alvoTipo: 'cliente',
        detalhes: { via: 'geocodificacao_em_massa', quantidade: ok },
      })
    }
    router.refresh()
  }

  function toggleWa(id: string) {
    setWaSel(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }
  const selecionadosWa = useMemo(() => clientes.filter(c => waSel.has(c.id)), [clientes, waSel])

  return (
    <div className="pb-20">
      {/* Cabeçalho + ações */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink">Clientes</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {podeGerir ? 'Carteira de clientes da equipe' : 'Sua carteira de clientes'}
            {filtrando ? ` · ${nBR(filtrados.length)} de ${nBR(clientes.length)}` : ` · ${nBR(clientes.length)} no total`}
            {dataMP && <> · ficha do MP de {dataBR(dataMP)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {podeGerir && semGps.length > 0 && (
            <button onClick={geocodarEmMassa} disabled={bulk?.running}
              className="border border-line hover:bg-card-2 disabled:opacity-50 text-ink-dim text-sm font-medium px-4 py-2 rounded-xl flex items-center gap-2">
              <Icon name="pin" size={15} />
              Geocodar sem GPS ({nBR(semGps.length)})
            </button>
          )}
          {podeGerir && (
            <>
              <button onClick={() => inputImport.current?.click()} disabled={importState.status === 'parsing' || importState.status === 'saving'}
                className="border border-line hover:bg-card-2 disabled:opacity-50 text-ink-dim text-sm font-medium px-4 py-2 rounded-xl flex items-center gap-2">
                <Icon name="upload" size={15} />
                Importar planilha
              </button>
              <input ref={inputImport} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) importarPlanilha(f); e.target.value = '' }} />
            </>
          )}
          <button onClick={abrirNovo} className="bg-primary hover:bg-primary-dk text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2">
            <Icon name="plus" size={16} />
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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {kpis.map(k => (
          <div key={k.label} className="glass rounded-2xl border border-line px-4 py-3.5">
            <div className="flex items-center gap-2 text-ink-muted mb-2">
              <Icon name={k.icon} size={14} />
              <span className="text-xs font-medium">{k.label}</span>
            </div>
            <p className="text-2xl font-semibold text-ink tracking-tight">{nBR(k.valor)}</p>
          </div>
        ))}
      </div>

      {/* Busca + filtros */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"><Icon name="search" size={14} /></span>
          <input type="text" placeholder="Buscar nome, seller ID, endereço…"
            value={busca} onChange={e => { setBusca(e.target.value); setPagina(0) }}
            className="w-full text-sm bg-field border border-field-line rounded-lg pl-9 pr-3 py-1.5 text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        {podeGerir && <MultiFiltro label="Consultores" opcoes={consultores} sel={fConsultores} onChange={aoFiltrar(setFConsultores)} />}
        <MultiFiltro label="Cidades" opcoes={cidades} sel={fCidades} onChange={aoFiltrar(setFCidades)} />
        <MultiFiltro label="Bairros" opcoes={bairros} sel={fBairros} onChange={aoFiltrar(setFBairros)} />
        <MultiFiltro label="GPS" opcoes={GPS_OPCOES} sel={fGps} onChange={aoFiltrar(setFGps)} />
        {temFicha && <>
          <MultiFiltro label="Situação" opcoes={['ATIVO', 'CHURN', 'INATIVO', 'REATIVADO']} sel={fSituacao} onChange={aoFiltrar(setFSituacao)} />
          <MultiFiltro label="Prioridade" opcoes={['P1', 'P2', 'P3', 'P4']} sel={fQuartil} onChange={aoFiltrar(setFQuartil)} />
          <MultiFiltro label="Segmento" opcoes={mccs} sel={fMcc} onChange={aoFiltrar(setFMcc)} />
        </>}
        {pendentesCount > 0 && (
          <button onClick={() => { setSoPendentes(v => !v); setPagina(0) }}
            className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
              soPendentes ? 'border-warn/60 bg-warn-bg text-warn' : 'border-field-line bg-field text-ink-muted hover:text-ink'
            }`}>
            Só pendentes
            <span className="bg-warn text-white text-[10px] font-bold rounded-full px-1.5 min-w-[17px] text-center">{nBR(pendentesCount)}</span>
          </button>
        )}
        {filtrando && (
          <button onClick={limparFiltros} className="text-xs text-ink-muted hover:text-ink underline underline-offset-2">Limpar filtros</button>
        )}
      </div>

      {/* Cards */}
      {filtrados.length === 0 ? (
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">{clientes.length === 0 ? 'Nenhum cliente ainda' : 'Nenhum cliente com esses filtros'}</p>
          <p className="text-sm text-ink-muted mt-1">
            {clientes.length === 0
              ? (podeGerir ? 'Importe a planilha ou cadastre o primeiro cliente.' : 'Cadastre o primeiro cliente no botão acima.')
              : 'Tire um filtro ou ajuste a busca.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map(c => {
            const wa = urlWhatsApp(c.seller_telefone)
            const gps = temGps(c)
            const local = [c.bairro, c.cidade].filter(Boolean).join(', ') || '—'
            // "Endereço não informado" é placeholder da planilha, não endereço:
            // exibi-lo seria fingir que o dado existe.
            const end = c.endereco_completo.trim()
            const endereco = end && !SEM_ENDERECO.test(end) ? end : ''
            const marcado = waSel.has(c.id)
            const ficha = fichaTecnica[c.seller_id]
            const pendente = precisaEnriquecer(c)
            return (
              // min-w-0: item de grid tem min-width:auto e NÃO encolhe abaixo do
              // conteúdo. Sem isto, um e-mail ou endereço longo estica o card e
              // o `truncate` nunca chega a truncar — no celular o card ficava
              // com 751px numa tela de 360.
              <div key={c.id} className={`glass rounded-2xl border p-4 flex flex-col min-w-0 transition-colors ${marcado ? 'border-primary/60' : 'border-line'}`}>
                <div className="flex items-start gap-2.5">
                  <input type="checkbox" checked={marcado} onChange={() => toggleWa(c.id)} title="Selecionar para WhatsApp"
                    className="accent-primary w-4 h-4 mt-1 flex-shrink-0 cursor-pointer" />
                  <span className={`w-9 h-9 rounded-full grid place-items-center text-white text-sm font-semibold flex-shrink-0 ${corAvatar(c.seller_id)}`}>
                    {inicial(c)}
                  </span>
                  <div className="min-w-0 flex-1">
                    {pendente ? (
                      // Cliente sem identidade: o ID vira o título e ganha um botão
                      // de copiar — é o que o consultor leva pro painel do MP.
                      <>
                        <button onClick={() => copiarId(c.seller_id)} title="Copiar o ID para buscar no painel do MP"
                          className="flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-primary transition-colors max-w-full">
                          <span className="font-mono truncate">#{c.seller_id}</span>
                          <span className="flex-shrink-0 text-ink-muted">
                            {copiado === c.seller_id
                              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
                          </span>
                        </button>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warn mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-warn" />
                          {copiado === c.seller_id ? 'ID copiado' : 'Pendente de identificação'}
                        </span>
                      </>
                    ) : (
                      <>
                        {/* Duas linhas: o nome real vem depois do CNPJ, e numa linha
                            só o corte cai antes da pessoa aparecer. */}
                        <p className="text-sm font-semibold text-ink leading-snug line-clamp-2" title={c.seller_nome || undefined}>{c.seller_nome || '—'}</p>
                        <p className="text-[11px] text-ink-faint truncate mt-0.5">#{c.seller_id}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Ficha completa no card. Estes dados só apareciam abrindo o
                    "Editar" — para consultar um cliente em campo, ler não pode
                    exigir entrar no formulário de edição. */}
                <div className="flex flex-col gap-1.5 mt-3.5 pt-3.5 border-t border-line">
                  <Linha icon="pin" iconCls={gps ? 'text-ink-faint' : 'text-warn'}>
                    <span className="truncate min-w-0">{local}</span>
                    {!gps && (geoLinha === c.id
                      ? <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1 text-[11px]"><Spinner /> …</span>
                      : <button onClick={() => geocodarLinha(c)} className="ml-auto flex-shrink-0 text-[11px] font-semibold text-warn hover:underline">
                          sem GPS · geocodar
                        </button>)}
                  </Linha>
                  <Linha icon="home">
                    {endereco
                      ? <span className="truncate min-w-0" title={endereco}>{endereco}</span>
                      : <span className="text-ink-faint">sem endereço</span>}
                  </Linha>
                  <Linha icon="phone">
                    {wa
                      ? <a href={wa} target="_blank" rel="noopener noreferrer" className="text-good hover:underline truncate min-w-0">{c.seller_telefone}</a>
                      : <span className="text-ink-faint">sem telefone</span>}
                  </Linha>
                  <Linha icon="mail">
                    {c.seller_email
                      ? <a href={`mailto:${c.seller_email}`} className="truncate min-w-0 hover:underline hover:text-ink" title={c.seller_email}>{c.seller_email}</a>
                      : <span className="text-ink-faint">sem e-mail</span>}
                  </Linha>
                  <Linha icon="doc">
                    {c.cpf_cnpj
                      ? <span className="truncate min-w-0">{c.doc_tipo ? `${c.doc_tipo} ${c.cpf_cnpj}` : c.cpf_cnpj}</span>
                      : <span className="text-ink-faint">sem CPF/CNPJ</span>}
                  </Linha>
                  {podeGerir && (
                    <Linha icon="user"><span className="truncate">{c.consultor_nome || '—'}</span></Linha>
                  )}
                </div>

                {/* Ficha técnica da Planilha Geral. Só aparece para quem está
                    nela — os dois cadastros seguem separados, isto é leitura. */}
                {ficha && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {ficha.status && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          ficha.status === 'CHURN' ? 'bg-bad-bg text-bad'
                          : ficha.status === 'INATIVO' ? 'bg-warn-bg text-warn' : 'bg-good-bg text-good'}`}>
                          {ficha.status}
                        </span>
                      )}
                      {ficha.quartil && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary-lt">
                          {ficha.quartil}{ficha.prio != null && ` #${ficha.prio}`}
                        </span>
                      )}
                      {!!ficha.qtd_acionaveis && (
                        <span className="text-[10px] text-ink-muted">
                          {ficha.qtd_acionaveis} acionáve{ficha.qtd_acionaveis === 1 ? 'l' : 'is'}
                        </span>
                      )}
                    </div>

                    {/* Os dois TPVs aparecem ROTULADOS e sem variação calculada:
                        o do mês é parcial (planilha tirada no meio do mês) e o
                        do mês passado é fechado. Comparar aqui mostraria uma
                        queda que não existe — quem compara direito, dividindo
                        por dias úteis, é a tela de Queda de TPV. */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <p className="text-ink-faint">TPV no mês (parcial)</p>
                        <p className="text-ink font-medium tabular-nums">
                          {ficha.tpv_mes_atual != null ? brl(ficha.tpv_mes_atual) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-ink-faint">Mês passado (fechado)</p>
                        <p className="text-ink-dim tabular-nums">
                          {ficha.tpv_mes_passado != null ? brl(ficha.tpv_mes_passado) : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5 mt-2 text-[11px] text-ink-muted">
                      {ficha.mcc && <span className="truncate">{ficha.mcc}</span>}
                      {ficha.status_credito && <span>{ficha.status_credito.replace(/^\d+\.\s*/, '')}</span>}
                      {ficha.recorrencia && <span>Recorrência {ficha.recorrencia.toLowerCase()}</span>}
                      <span>{ficha.ultimo_contato ? `Contato em ${dataBR(ficha.ultimo_contato)}` : 'Nunca contatado'}</span>
                    </div>
                  </div>
                )}

                <div className="mt-3.5 pt-3.5 border-t border-line">
                  {confirmarExcluir === c.id ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-bad font-medium">Tirar da carteira?</span>
                      <button onClick={() => excluir(c)} className="ml-auto bg-bad hover:bg-bad-dk text-white px-3 py-1.5 rounded-lg font-semibold">Sim</button>
                      <button onClick={() => setConfirmarExcluir(null)} className="text-ink-muted hover:text-ink px-2 py-1.5">Não</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {/* Os quatro alvos com a mesma altura de 40px: WhatsApp e
                          mapa saem do componente compartilhado, e Editar/excluir
                          acompanham para a linha não ficar torta. É o mínimo
                          para o dedo acertar sem precisar ampliar a tela. */}
                      <button onClick={() => abrirEdicao(c)} className={`flex-1 h-10 text-xs font-semibold rounded-xl transition-colors ${
                        pendente ? 'bg-warn/20 hover:bg-warn/30 text-warn' : 'bg-primary/15 hover:bg-primary/25 text-primary-lt'
                      }`}>
                        {pendente ? 'Identificar cliente' : 'Editar'}
                      </button>
                      <BotaoWhatsApp telefone={c.seller_telefone} nome={c.seller_nome || c.seller_id} />
                      <BotaoMapa lat={c.lat} lng={c.lng} nome={c.seller_nome || c.seller_id} />
                      <button onClick={() => setConfirmarExcluir(c.id)} title="Tirar da carteira"
                        aria-label={`Tirar ${c.seller_nome || c.seller_id} da carteira`}
                        className="w-10 h-10 grid place-items-center border border-line rounded-xl text-ink-muted hover:text-bad hover:bg-card-2 active:scale-95 transition flex-shrink-0">
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginação */}
      {filtrados.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap mt-4 text-sm">
          <span className="text-ink-faint text-xs">
            Mostrando {nBR(paginaAtual * POR_PAGINA + 1)}–{nBR(Math.min((paginaAtual + 1) * POR_PAGINA, filtrados.length))} de {nBR(filtrados.length)} clientes
          </span>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={paginaAtual === 0}
                className="px-3 py-1.5 rounded-lg border border-line text-ink-dim text-xs disabled:opacity-40 hover:bg-card-2">Anterior</button>
              <span className="text-ink-muted text-xs">{paginaAtual + 1} / {totalPaginas}</span>
              <button onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} disabled={paginaAtual >= totalPaginas - 1}
                className="px-3 py-1.5 rounded-lg border border-line text-ink-dim text-xs disabled:opacity-40 hover:bg-card-2">Próxima</button>
            </div>
          )}
        </div>
      )}

      {/* Painéis: recorte do que está filtrado, não da base inteira */}
      {filtrados.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr] mt-4">
          <Painel titulo="Clientes por cidade" dados={porCidade} />
          <Painel titulo={podeGerir ? 'Clientes por consultor' : 'Clientes por bairro'} dados={porSegundo} />
        </div>
      )}

      {/* Barra de seleção WhatsApp */}
      {waSel.size > 0 && (
        <div className="fixed bottom-0 left-0 md:left-60 right-0 glass-blur border-t border-line px-4 md:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3 z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <span className="text-sm font-semibold text-ink">{waSel.size} selecionado{waSel.size !== 1 ? 's' : ''}</span>
          <button onClick={() => setWaSel(new Set())} className="text-sm text-ink-muted hover:underline ml-auto">Limpar</button>
          <button onClick={() => setWaOpen(true)} className="bg-primary hover:bg-primary-dk text-white text-sm font-semibold px-5 py-2 rounded-xl">Enviar WhatsApp</button>
        </div>
      )}

      {/* Modal cadastro/edição */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={() => setModalAberto(false)}>
          <div className="glass-blur rounded-2xl w-full max-w-lg my-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <h2 className="font-bold text-ink">
                {!editando ? 'Novo cliente' : precisaEnriquecer(editando) ? 'Identificar cliente' : 'Editar cliente'}
              </h2>
              <button onClick={() => setModalAberto(false)} className="text-ink-faint hover:text-ink-dim text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              {editando && precisaEnriquecer(editando) && (
                <div className="text-xs bg-warn-bg text-warn rounded-lg px-3 py-2.5 flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                  </span>
                  <span>
                    Busque o ID <button type="button" onClick={() => copiarId(editando.seller_id)} className="font-mono font-semibold underline underline-offset-2 hover:text-ink">#{editando.seller_id}</button> no
                    painel do Mercado Pago e preencha nome, CPF/CNPJ e telefone deste cliente.
                    {copiado === editando.seller_id && <span className="font-semibold"> · copiado</span>}
                  </span>
                </div>
              )}
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
                <Campo label="Cidade"><input value={form.cidade} onChange={e => set('cidade')(e.target.value)} className={inputCls} /></Campo>
                <Campo label="Bairro"><input value={form.bairro} onChange={e => set('bairro')(e.target.value)} className={inputCls} /></Campo>
              </div>
              <Campo label="Endereço completo">
                <input value={form.endereco_completo} onChange={e => set('endereco_completo')(e.target.value)} className={inputCls} placeholder="Rua, número, cidade" />
              </Campo>
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <Campo label="Coordenadas">
                    <input
                      value={form.lat || form.lng ? `${form.lat}, ${form.lng}` : ''}
                      onChange={e => {
                        const [lat = '', lng = ''] = e.target.value.split(',').map(s => s.trim())
                        setForm(f => ({ ...f, lat, lng }))
                      }}
                      className={inputCls}
                      placeholder="-23.55, -46.63"
                    />
                  </Campo>
                </div>
                <button onClick={geocodarForm} disabled={geoForm} className="border border-good/40 text-good text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap disabled:opacity-50">
                  {geoForm ? '…' : 'Buscar do endereço'}
                </button>
                <button type="button" onClick={() => setMapaAberto(v => !v)} className="border border-primary/40 text-primary text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap">
                  {mapaAberto ? 'Ocultar mapa' : 'Ver no mapa'}
                </button>
              </div>
              {mapaAberto && (
                <div className="space-y-1">
                  <PinMapa
                    lat={paraNum(form.lat)}
                    lng={paraNum(form.lng)}
                    onChange={(lat, lng) => setForm(f => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }))}
                  />
                  <p className="text-[11px] text-ink-faint">Arraste o alfinete ou clique no mapa para ajustar a posição exata.</p>
                </div>
              )}
              <p className="text-[11px] text-ink-faint">Sem coordenadas o cliente não aparece no Radar. Copie do Google Maps (formato &quot;lat, lng&quot;), use &quot;Buscar do endereço&quot; ou ajuste no mapa.</p>
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
          <div className="glass-blur rounded-2xl w-full max-w-lg my-8 shadow-xl" onClick={e => e.stopPropagation()}>
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
                  const link = urlWhatsApp(c.seller_telefone, waMsg.replace(/\{nome\}/g, c.seller_nome || 'cliente'))
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
        // O documento vem numa coluna só e com o nome do MP ("CPF/CNPJ"). Sem
        // ler as duas grafias, o import descartava calado — era por isso que os
        // 3.272 clientes estavam com cpf_cnpj vazio, apesar de a planilha ter.
        cpf: findCol(h, 'cpf_cnpj') ?? findCol(h, 'CPF/CNPJ'),
      }
      const val = (r: Record<string, unknown>, col: string | null) => col ? String(r[col] ?? '').trim() : ''
      const linhas = rows.filter(r => val(r, cSeller) !== '').map(r => ({
        seller_id: val(r, cSeller), seller_nome: val(r, c.nome),
        seller_telefone: val(r, c.tel) || null, seller_email: val(r, c.email) || null,
        // A planilha não diz se é CPF ou CNPJ — quem diz é a quantidade de dígitos.
        cpf_cnpj: val(r, c.cpf) || null, doc_tipo: tipoDoc(val(r, c.cpf)),
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
      // Import por planilha é o outro jeito de "cliente ser adicionado" — sem
      // isto o log de atividade só via o cadastro manual (um de cada vez).
      if (inseridos > 0) {
        registrarEvento({
          tipo: 'clientes_importados',
          alvoTipo: 'cliente',
          detalhes: { quantidade: inseridos, ignorados: linhas.length - inseridos },
        })
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

/** Linha de informação do card: ícone + conteúdo, tudo truncável. */
function Linha({ icon, iconCls = 'text-ink-faint', children }: { icon: string; iconCls?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-muted min-w-0">
      <span className={`${iconCls} flex-shrink-0`}><Icon name={icon} size={13} /></span>
      {children}
    </div>
  )
}

/** Painel de distribuição. A barra é relativa ao maior item, não ao total —
 *  com 148 cidades, barras relativas ao total ficariam todas invisíveis. */
function Painel({ titulo, dados }: { titulo: string; dados: [string, number][] }) {
  const maior = dados[0]?.[1] ?? 1
  return (
    <div className="glass rounded-2xl border border-line p-5">
      <p className="font-semibold text-ink text-sm mb-3">{titulo}</p>
      {dados.length === 0 ? (
        <p className="text-xs text-ink-faint">Sem dados.</p>
      ) : dados.map(([nome, n]) => (
        <div key={nome} className="py-1.5">
          <div className="flex justify-between gap-3 text-xs mb-1">
            <span className="text-ink-dim truncate">{nome}</span>
            <span className="text-ink-muted flex-shrink-0 tabular-nums">{nBR(n)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-card-2 overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(n / maior) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'users': return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    case 'user': return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
    case 'pin': return <svg {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
    case 'home': return <svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
    case 'mail': return <svg {...p}><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
    case 'doc': return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M15 9h3M15 13h3M5.5 16c.7-1.5 2-2.2 3.5-2.2s2.8.7 3.5 2.2" /></svg>
    case 'alert': return <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
    case 'check': return <svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
    case 'phone': return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
    case 'search': return <svg {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
    case 'upload': return <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
    case 'plus': return <svg {...p} strokeWidth={2.4}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
    case 'trash': return <svg {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
    default: return null
  }
}
