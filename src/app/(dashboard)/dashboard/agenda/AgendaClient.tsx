'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { otimizarRota, linksGoogleMaps, alternarVisitado, type Ponto, type ClienteSelecionado } from '@/lib/geo'
import { registrarEvento } from '@/lib/atividade'
import type { FichaMP } from '@/lib/supabase/ficha-mp'
import CategoryHeader from '@/components/dashboard/CategoryHeader'
import ParadaCliente from './ParadaCliente'
import type { Rota } from './page'

function linksMapsDaRota(r: Rota): string[] {
  const seq: Ponto[] = [
    ...(r.partida_lat != null && r.partida_lng != null
      ? [{ lat: r.partida_lat, lng: r.partida_lng }] : []),
    ...r.stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .map(s => ({ lat: s.lat, lng: s.lng })),
    ...(r.chegada_lat != null && r.chegada_lng != null ? [{ lat: r.chegada_lat, lng: r.chegada_lng }] : []),
  ]
  return linksGoogleMaps(seq)
}

function fmtData(iso: string | null) {
  if (!iso) return 'sem data'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function KPI({ label, valor, sufixo }: { label: string; valor: string; sufixo?: string }) {
  return (
    <div className="glass rounded-2xl border border-line p-4">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted mb-1">{label}</p>
      <p className="text-3xl font-bold text-ink">{valor}<span className="text-base font-medium text-ink-faint">{sufixo}</span></p>
    </div>
  )
}

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function pontosDaRota(r: Rota): { lat: number; lng: number }[] {
  return [
    ...(r.partida_lat != null && r.partida_lng != null ? [{ lat: r.partida_lat, lng: r.partida_lng }] : []),
    ...r.stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng)).map(s => ({ lat: s.lat, lng: s.lng })),
    ...(r.chegada_lat != null && r.chegada_lng != null ? [{ lat: r.chegada_lat, lng: r.chegada_lng }] : []),
  ]
}

// Traço leve da rota a partir das coordenadas — sem carregar mapa nenhum.
// Normaliza lat/lng na caixa (norte pra cima) e numera os pontos na ordem.
function TracadoRota({ pontos }: { pontos: { lat: number; lng: number }[] }) {
  const pts = pontos.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (pts.length < 2) {
    return (
      <div className="w-full rounded-lg bg-card-2 flex items-center justify-center text-[10px] text-ink-faint py-4">
        sem traçado
      </div>
    )
  }
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const W = 100, H = 56, pad = 9
  const spanLat = maxLat - minLat || 1e-6, spanLng = maxLng - minLng || 1e-6
  const x = (lng: number) => pad + ((lng - minLng) / spanLng) * (W - 2 * pad)
  const y = (lat: number) => pad + ((maxLat - lat) / spanLat) * (H - 2 * pad)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block rounded-lg bg-card-2" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.65" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(p.lng)} cy={y(p.lat)} r={i === 0 ? 2.8 : 2.1}
          fill={i === 0 ? 'var(--color-good)' : 'var(--color-primary)'} stroke="#fff" strokeWidth="0.9" />
      ))}
    </svg>
  )
}

/** Quantas paradas já foram visitadas — o "3/9" do cabeçalho. */
function progresso(r: Rota) {
  const total = r.stops?.length ?? 0
  return { total, feitos: (r.stops ?? []).filter(s => s.visitado_em).length }
}

export default function AgendaClient({ rotas, podeVerTodos, fichaTecnica }: {
  rotas: Rota[]
  podeVerTodos: boolean
  /** Ficha da Planilha Geral por seller_id. Vazio se a planilha não foi importada. */
  fichaTecnica: Record<string, FichaMP>
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [editandoData, setEditandoData] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [refazendo, setRefazendo] = useState<string | null>(null)

  /* Rotas que o usuário abriu ou fechou À MÃO. O que não está aqui usa o padrão
   * (só a rota de hoje nasce aberta) — por isso um mapa de exceções e não um
   * `Set` de abertas: um Set não sabe distinguir "nunca mexeram" de "fecharam". */
  const [alternadas, setAlternadas] = useState<Record<string, boolean>>({})

  /* Marcação de visita aplicada na hora, antes de a tela recarregar.
   *
   * Sem isto, dois toques rápidos em paradas diferentes leriam o MESMO `stops`
   * das props (o refresh do servidor ainda não voltou) e o segundo gravaria por
   * cima do primeiro — a primeira marcação sumiria calada. Como a escrita manda
   * o array inteiro de volta, a fonte da verdade durante a sessão tem que ser
   * local. */
  const [stopsLocais, setStopsLocais] = useState<Record<string, ClienteSelecionado[]>>({})
  const [salvandoParada, setSalvandoParada] = useState<string | null>(null)

  const [view, setView] = useState<'semana' | 'lista'>('semana')
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [diaMobile, setDiaMobile] = useState<number | null>(null)
  // `hoje` só no cliente: new Date() no SSR daria mismatch de hidratação.
  // Exceção legítima ao lint de setState-em-efeito — não tem como derivar
  // isto durante o render, já que o valor não existe até montar no cliente.
  const [hoje, setHoje] = useState<Date | null>(null)
  useEffect(() => {
    const atual = new Date()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data local necessária para evitar divergência de hidratação.
    setHoje(atual)
  }, [])

  const kpis = useMemo(() => {
    const km = rotas.reduce((s, r) => s + (r.distancia_km ?? 0), 0)
    const min = rotas.reduce((s, r) => s + (r.tempo_minutos ?? 0), 0)
    return { km, rotas: rotas.length, horas: min / 60 }
  }, [rotas])

  // Rotas com data, agrupadas por dia (yyyy-mm-dd).
  const porDia = useMemo(() => {
    const m = new Map<string, Rota[]>()
    for (const r of rotas) {
      if (!r.data_visita) continue
      const k = r.data_visita.slice(0, 10)
      const l = m.get(k)
      if (l) l.push(r); else m.set(k, [r])
    }
    return m
  }, [rotas])

  const semDia = useMemo(() => rotas.filter(r => !r.data_visita), [rotas])

  // Os 7 dias (segunda→domingo) da semana selecionada.
  const semana = useMemo(() => {
    if (!hoje) return [] as Date[]
    const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const dow = (base.getDay() + 6) % 7   // 0 = segunda
    base.setDate(base.getDate() - dow + semanaOffset * 7)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i); return d
    })
  }, [hoje, semanaOffset])

  const hojeIso = hoje ? isoLocal(hoje) : ''
  const indiceDiaMobile = diaMobile ?? (hoje ? (hoje.getDay() + 6) % 7 : 0)
  const dataSelecionadaMobile = semana[indiceDiaMobile] ?? semana[0]
  const rotasDiaMobile = dataSelecionadaMobile ? porDia.get(isoLocal(dataSelecionadaMobile)) ?? [] : []

  /** A rota com as marcações de visita desta sessão já aplicadas. */
  const comLocal = (r: Rota): Rota => (stopsLocais[r.id] ? { ...r, stops: stopsLocais[r.id] } : r)

  /* Recolhida por padrão — era isto que fazia a tela descer sem fim: dez rotas
   * de nove clientes abriam noventa linhas de uma vez. A de HOJE nasce aberta
   * porque é a única que alguém abre a Agenda para ler. */
  const estaAberta = (r: Rota) =>
    alternadas[r.id] ?? (!!r.data_visita && r.data_visita.slice(0, 10) === hojeIso)

  const alternarAberta = (r: Rota) =>
    setAlternadas(m => ({ ...m, [r.id]: !estaAberta(r) }))

  /* "Ver os clientes" na Semana: troca para a Lista com ESTA rota aberta.
   *
   * O scroll mora num efeito porque no clique a Lista ainda não existe no DOM —
   * `getElementById` voltaria null. O sufixo de tempo faz cada clique ser um
   * valor NOVO: com o id puro, pedir a mesma rota duas vezes seria o mesmo
   * estado, o React descartaria o segundo `setState` e a tela não rolaria. */
  const [focar, setFocar] = useState<string | null>(null)
  useEffect(() => {
    if (!focar) return
    const id = focar.split('#')[0]
    document.getElementById(`rota-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [focar])

  function verClientes(r: Rota) {
    setView('lista')
    setAlternadas(m => ({ ...m, [r.id]: true }))
    setFocar(`${r.id}#${Date.now()}`)
  }

  /**
   * Marca (ou desmarca) uma parada como visitada.
   *
   * Grava dentro de `rotas.stops` (jsonb) em vez de tabela nova: a marca é do
   * par (rota, parada) e já viaja junto com o snapshot. A RLS de `rotas` é a
   * mesma de sempre — consultor só mexe nas suas.
   *
   * Sem `registrarEvento`: seriam nove eventos por rota no log de atividade do
   * admin, afogando criar/renomear/excluir, que são as ações que o log existe
   * para vigiar.
   *
   * Uma gravação por rota de cada vez (o botão das vizinhas fica travado): como
   * a escrita manda o array INTEIRO, duas em voo se sobrescrevem — a segunda
   * carrega a marca otimista da primeira, e o rollback da primeira apaga a
   * marca da segunda. Travar por ~200ms é mais barato que reconciliar isso.
   */
  async function marcarVisitado(r: Rota, sellerId: string) {
    if (salvandoParada?.startsWith(`${r.id}:`)) return
    setErro('')
    const antes = stopsLocais[r.id] ?? r.stops ?? []
    const depois = alternarVisitado(antes, sellerId, new Date().toISOString())

    setSalvandoParada(`${r.id}:${sellerId}`)
    setStopsLocais(m => ({ ...m, [r.id]: depois }))
    const supabase = createClient()
    /* `.select('id')` não é enfeite: sem ele, um UPDATE que a RLS não deixa
     * casar linha nenhuma volta 204 SEM erro, e o ✓ ficaria na tela com nada
     * gravado — o consultor acreditaria ter registrado a visita. Acontece de
     * verdade quando o acesso é revogado com a sessão aberta. */
    const { data, error } = await supabase
      .from('rotas')
      .update({ stops: depois, updated_at: new Date().toISOString() })
      .eq('id', r.id)
      .select('id')
    setSalvandoParada(null)
    if (error || !data?.length) {
      // Desfaz o otimismo: deixar o ✓ na tela faria o consultor acreditar que a
      // visita ficou registrada quando o banco recusou.
      setStopsLocais(m => ({ ...m, [r.id]: antes }))
      setErro(error?.message ?? 'A visita não foi salva — você não tem permissão para alterar esta rota.')
    }
  }

  async function salvarNome(id: string) {
    if (!nomeEdit.trim()) return
    const supabase = createClient()
    const { error } = await supabase.from('rotas').update({ nome_rota: nomeEdit.trim(), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { setErro(error.message); return }
    registrarEvento({ tipo: 'rota_editada', alvoTipo: 'rota', alvoId: id, alvoDescricao: nomeEdit.trim(), detalhes: { campo: 'nome' } })
    setEditando(null)
    router.refresh()
  }

  /**
   * Marca (ou desmarca) o dia da visita.
   *
   * É o que transforma um plano em agenda: uma rota pode nascer SEM data (o dia
   * se decide olhando a semana, que é esta tela). Sem isto, a única forma de
   * datar uma rota seria refazê-la no Roteirizar.
   *
   * Data vazia volta para "sem data" em vez de recusar: tirar do calendário é
   * uma decisão legítima, e o cartão continua na lista de pendentes.
   */
  async function marcarData(id: string, data: string) {
    setErro('')
    const supabase = createClient()
    const { error } = await supabase
      .from('rotas')
      .update({ data_visita: data || null, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { setErro(error.message); return }
    registrarEvento({
      tipo: 'rota_agendada',
      alvoTipo: 'rota',
      alvoId: id,
      alvoDescricao: rotas.find(r => r.id === id)?.nome_rota,
      detalhes: { data: data || null },
    })
    setEditandoData(null)
    router.refresh()
  }

  async function excluir(id: string) {
    const supabase = createClient()
    const nome = rotas.find(r => r.id === id)?.nome_rota
    const { error } = await supabase.from('rotas').delete().eq('id', id)
    if (error) { setErro(error.message); return }
    registrarEvento({ tipo: 'rota_excluida', alvoTipo: 'rota', alvoId: id, alvoDescricao: nome })
    setConfirmar(null)
    router.refresh()
  }

  // Recalcula a rota com o mesmo ponto de partida e clientes — útil quando um
  // cliente teve o endereço/coordenada corrigido.
  async function refazer(r: Rota) {
    setErro('')
    if (r.partida_lat == null || r.partida_lng == null) {
      setErro('Rota sem ponto de partida salvo — refaça pelo Roteirizar.')
      return
    }
    const comCoord = r.stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    if (comCoord.length === 0) { setErro('Nenhuma parada com coordenada.'); return }

    setRefazendo(r.id)
    try {
      const chegada = r.chegada_lat != null && r.chegada_lng != null ? { lat: r.chegada_lat, lng: r.chegada_lng } : null
      const { ordemStops, distanciaKm, tempoMin } = await otimizarRota(
        { lat: r.partida_lat, lng: r.partida_lng },
        comCoord.map(s => ({ lat: s.lat, lng: s.lng })),
        chegada,
      )
      const stopsOrdenados = ordemStops.map(i => comCoord[i])
      const supabase = createClient()
      const { error } = await supabase.from('rotas').update({
        stops: stopsOrdenados, distancia_km: distanciaKm, tempo_minutos: tempoMin,
        updated_at: new Date().toISOString(),
      }).eq('id', r.id)
      if (error) { setErro(error.message); return }
      /* Refazer REORDENA as paradas. O cache local ficou com a ordem velha e,
       * se continuasse valendo, desfaria na tela a reordenação que acabou de ir
       * pro banco. As marcações não se perdem: `stopsOrdenados` sai de `r.stops`,
       * que já chega daqui com elas. */
      setStopsLocais(m => { const copia = { ...m }; delete copia[r.id]; return copia })
      registrarEvento({ tipo: 'rota_editada', alvoTipo: 'rota', alvoId: r.id, alvoDescricao: r.nome_rota, detalhes: { campo: 'trajeto' } })
      router.refresh()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setRefazendo(null)
    }
  }

  // --- Peças reutilizadas pelos dois modos (Semana e Lista) ---

  const badges = (r: Rota) => (
    <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-semibold">
      <span className="bg-primary/10 text-primary-lt px-1.5 py-0.5 rounded">{r.stops?.length ?? 0} cliente{(r.stops?.length ?? 0) !== 1 ? 's' : ''}</span>
      {(r.stops ?? []).some(s => s.coordenada_origem === 'aproximada') && (
        <span title="Esta rota tem paradas cujo ponto é o centro do bairro, não o endereço do cliente."
          className="bg-warn-bg text-warn px-1.5 py-0.5 rounded font-medium">
          {(r.stops ?? []).filter(s => s.coordenada_origem === 'aproximada').length} aproximada{(r.stops ?? []).filter(s => s.coordenada_origem === 'aproximada').length !== 1 ? 's' : ''}
        </span>
      )}
      {(r.stops ?? []).some(s => s.coordenada_origem === 'estimada') && (
        <span title="Esta rota tem paradas cujo ponto a máquina estimou pelo endereço escrito e ninguém conferiu — pode errar por uma quadra."
          className="bg-warn-bg text-warn px-1.5 py-0.5 rounded font-medium">
          {(r.stops ?? []).filter(s => s.coordenada_origem === 'estimada').length} a conferir
        </span>
      )}
      {r.distancia_km != null && <span className="bg-card-2 text-ink-dim px-1.5 py-0.5 rounded">{r.distancia_km.toFixed(1).replace('.', ',')} km</span>}
      {r.tempo_minutos != null && <span className="bg-card-2 text-ink-dim px-1.5 py-0.5 rounded">{Math.round(r.tempo_minutos)} min</span>}
    </div>
  )

  /* As paradas em si. Esta é a tela aberta no carro, na hora da visita: cada
   * item traz o que decide o próximo movimento (quem é, onde é, como está no
   * MP) e os botões para agir sem sair daqui. Ver ParadaCliente.tsx.
   *
   * `key` com o índice junto do seller_id: o mesmo cliente pode aparecer duas
   * vezes numa rota (duas lojas com o mesmo cadastro acontece), e só o id
   * repetiria a chave. */
  const paradas = (r: Rota) =>
    (r.stops?.length ?? 0) === 0 ? null : (
      <ol className="space-y-2 mt-2">
        {r.stops.map((s, i) => (
          <ParadaCliente
            key={`${s.seller_id}-${i}`}
            parada={s}
            ordem={i + 1}
            ficha={fichaTecnica[s.seller_id]}
            onVisitar={() => marcarVisitado(r, s.seller_id)}
            salvando={salvandoParada === `${r.id}:${s.seller_id}`}
            bloqueado={!!salvandoParada?.startsWith(`${r.id}:`)}
          />
        ))}
      </ol>
    )

  /** "3/9" — quanto da rota já foi feito. Só aparece quando alguém começou. */
  const seloProgresso = (r: Rota) => {
    const { total, feitos } = progresso(r)
    if (feitos === 0 || total === 0) return null
    const completa = feitos === total
    return (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums flex-shrink-0 ${
        completa ? 'bg-good text-white' : 'bg-good-bg text-good'
      }`}>
        {feitos}/{total} ✓
      </span>
    )
  }

  /** Seta do acordeão — a única pista de que o cabeçalho abre. */
  const chevron = (aberta: boolean) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`flex-shrink-0 mt-1 text-ink-faint transition-transform ${aberta ? 'rotate-90' : ''}`}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )

  /* Seletor de dia. Um `input[type=date]` e não arrastar-e-soltar: funciona no
   * celular (onde a rota é consultada em campo), abre o calendário nativo, é
   * acessível pelo teclado, e permite marcar um dia que nem está na semana à
   * vista — arrastar só alcançaria as 7 colunas visíveis. */
  const seletorData = (r: Rota, compacto = false) => {
    if (editandoData === r.id) {
      return (
        <span className="inline-flex items-center gap-1">
          <input type="date" defaultValue={r.data_visita?.slice(0, 10) ?? ''} autoFocus
            onChange={e => marcarData(r.id, e.target.value)}
            className="border border-field-line bg-field rounded-md px-1.5 py-0.5 text-[11px] text-ink" />
          <button onClick={() => setEditandoData(null)} className="text-ink-muted text-[11px] px-1">×</button>
        </span>
      )
    }
    return (
      <button onClick={() => setEditandoData(r.id)}
        title={r.data_visita ? 'Mudar o dia' : 'Marcar o dia'}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium transition-colors ${
          compacto ? 'text-[10px]' : 'text-[11px]'
        } ${r.data_visita
          ? 'text-ink-muted hover:text-primary hover:bg-card-2'
          : 'text-primary-lt border border-primary/40 bg-primary/10 hover:bg-primary/20'}`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {r.data_visita ? fmtData(r.data_visita) : 'Marcar dia'}
      </button>
    )
  }

  const gmaps = (r: Rota) => {
    const links = linksMapsDaRota(r)
    if (links.length === 0) return null
    return links.length === 1 ? (
      <a href={links[0]} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 bg-gmaps hover:bg-gmaps-dk text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
        Ver no mapa
      </a>
    ) : (
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] text-ink-muted">Maps:</span>
        {links.map((l, i) => (
          <a key={i} href={l} target="_blank" rel="noopener noreferrer"
            aria-label={`Abrir trecho ${i + 1} no Google Maps`}
            className="inline-flex min-h-10 min-w-10 items-center justify-center bg-gmaps hover:bg-gmaps-dk text-white text-[11px] font-semibold px-2 py-1 rounded-md">{i + 1}</a>
        ))}
      </div>
    )
  }

  /* Cartão de uma rota dentro da coluna do dia (semana).
   *
   * Aqui as paradas NÃO abrem: a coluna de um dia tem ~140px em 7 colunas (e
   * ~170px nas 2 do celular), e o cartão de cliente transborda — nome quebrando
   * letra a letra e botões saindo da caixa. A Semana responde "que dias têm
   * rota"; quem vai visitar precisa de largura, e é para lá que o botão manda. */
  const cartaoSemana = (r: Rota) => {
    const total = r.stops?.length ?? 0
    return (
    <div className="agenda-route-card rounded-xl border border-line bg-card p-2.5">
      <div className="agenda-route-card__main">
        <div className="agenda-route-card__details">
          {editando === r.id ? (
            <div className="flex items-center gap-1 mb-1">
              <input value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} className="border border-line rounded-md px-1.5 py-1 text-xs w-full min-w-0" autoFocus />
              <button onClick={() => salvarNome(r.id)} aria-label="Salvar nome da rota" className="text-good text-[11px] font-semibold">ok</button>
            </div>
          ) : (
            <div className="agenda-route-card__title-row">
              <span className="agenda-route-card__title" title={r.nome_rota}>{r.nome_rota || 'Rota sem nome'}</span>
              {seloProgresso(r)}
            </div>
          )}
          <div className="agenda-route-card__badges">{badges(r)}</div>
          <div className="agenda-route-card__date">{seletorData(r, true)}</div>
        </div>
        <div className="agenda-route-card__trace"><TracadoRota pontos={pontosDaRota(r)} /></div>
      </div>
      <div className="agenda-route-card__footer">
        {total > 0 && (
          <button onClick={() => verClientes(r)} className="agenda-route-card__clients">
            Ver {total} cliente{total !== 1 ? 's' : ''}
          </button>
        )}
        <div className="agenda-route-card__tools">
          {gmaps(r)}
          <div className="agenda-route-card__manage">
            <button onClick={() => { setEditando(r.id); setNomeEdit(r.nome_rota) }} title="Renomear" aria-label="Renomear rota" className="hover:text-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
            </button>
            {confirmar === r.id ? (
              <span className="agenda-route-card__confirm">
                <span>Excluir rota?</span>
                <button onClick={() => excluir(r.id)} className="text-bad font-bold">Sim</button>
                <button onClick={() => setConfirmar(null)} className="text-ink-muted">Não</button>
              </span>
            ) : (
              <button onClick={() => setConfirmar(r.id)} title="Excluir" aria-label="Excluir rota" className="hover:text-bad">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    )
  }

  /* Cartão completo (lista).
   *
   * O cabeçalho (nome · dia · contagem · progresso) fica sempre à vista e as
   * paradas abrem no toque. Renomear/Refazer/Excluir vivem DENTRO do aberto:
   * repetidos em cada cabeçalho eles eram o grosso do ruído da tela, e deixar
   * Excluir atrás de um toque a mais é um pedágio bem-vindo num botão que apaga
   * a rota inteira. */
  const cartaoLista = (r: Rota) => {
    const aberta = estaAberta(r)
    const total = r.stops?.length ?? 0
    return (
    <div key={r.id} id={`rota-${r.id}`} className="glass rounded-2xl border border-line p-4 sm:p-5 scroll-mt-4">
      {editando === r.id ? (
        <div className="flex items-center gap-2">
          <input value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} className="border border-line rounded-lg px-2 py-1 text-sm" autoFocus />
          <button onClick={() => salvarNome(r.id)} className="text-good text-xs font-semibold">Salvar</button>
          <button onClick={() => setEditando(null)} className="text-ink-muted text-xs">Cancelar</button>
        </div>
      ) : (
        <button onClick={() => alternarAberta(r)} aria-expanded={aberta}
          className="w-full flex items-start gap-2 text-left">
          {chevron(aberta)}
          <span className="font-semibold text-ink min-w-0 flex-1 break-words">{r.nome_rota || 'Rota sem nome'}</span>
          {seloProgresso(r)}
        </button>
      )}

      <p className="text-xs text-ink-muted mt-1 flex items-center gap-1.5 flex-wrap">
        {seletorData(r)}
        <span>
          · {total} cliente{total !== 1 ? 's' : ''}
          {r.distancia_km != null ? ` · ${r.distancia_km.toFixed(1).replace('.', ',')} km` : ''}
          {r.tempo_minutos != null ? ` · ${Math.round(r.tempo_minutos)} min` : ''}
          {podeVerTodos && r.consultor_nome ? ` · ${r.consultor_nome}` : ''}
        </span>
      </p>

      {aberta && (
        <>
          <div className="grid sm:grid-cols-[1fr_200px] gap-4 mt-3">
            <div>{paradas(r) ?? <p className="text-xs text-ink-faint">Sem paradas.</p>}</div>
            <TracadoRota pontos={pontosDaRota(r)} />
          </div>

          <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-3 flex-wrap">
            {gmaps(r)}
            <div className="flex items-center gap-3 text-xs ml-auto">
              {confirmar === r.id ? (
                <>
                  <span className="text-bad">Excluir?</span>
                  <button onClick={() => excluir(r.id)} className="bg-bad text-white px-2 py-0.5 rounded-md font-semibold">Sim</button>
                  <button onClick={() => setConfirmar(null)} className="text-ink-muted">Não</button>
                </>
              ) : (
                <>
                  {/* p-2 -m-2: cresce a área de toque sem mexer no desenho nem
                      no espaçamento entre os 3 — estavam colados, sem área
                      clicável nenhuma além do texto, e Excluir é destrutivo. */}
                  <button onClick={() => refazer(r)} disabled={refazendo === r.id} className="text-good font-medium hover:underline disabled:opacity-50 p-2 -m-2">
                    {refazendo === r.id ? 'Refazendo…' : 'Refazer'}
                  </button>
                  <button onClick={() => { setEditando(r.id); setNomeEdit(r.nome_rota) }} className="text-primary font-medium hover:underline p-2 -m-2">Renomear</button>
                  <button onClick={() => setConfirmar(r.id)} className="text-bad font-medium hover:underline p-2 -m-2">Excluir</button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
    )
  }

  const tabs = (
    <div className="flex gap-0.5 bg-field border border-field-line rounded-xl p-0.5" role="group" aria-label="Visualização da agenda">
      {(['semana', 'lista'] as const).map(v => (
        <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
          className={`min-h-10 px-4 text-sm font-semibold rounded-lg transition-colors ${view === v ? 'bg-primary text-white shadow-[0_2px_8px_rgba(79,95,224,0.24)]' : 'text-ink-muted hover:text-ink-dim'}`}>
          {v === 'semana' ? 'Semana' : 'Lista'}
        </button>
      ))}
    </div>
  )

  return (
    <div className="category-page category-page--field agenda-page">
      <CategoryHeader category="field" title="Agenda de visitas"
        description={`Acompanhe rotas, clientes e visitas${podeVerTodos ? ' da equipe' : ''}.`}
        actions={<button onClick={() => router.push('/dashboard/roteirizar')} className="min-h-11 bg-primary hover:bg-primary-dk text-white text-sm font-semibold px-4 py-2.5 rounded-xl inline-flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Nova rota
        </button>}
      />

      {/* grid-cols-2 lg:grid-cols-3 — mesmo padrão de KPI que
          GeralClient.tsx/ClientesClient.tsx/RadarClient.tsx (lá com 4
          itens, aqui com 3). Sem breakpoint nenhum (como estava), "Km
          percorridos" com "1.234,5 km" não cabia nos ~64px de texto útil
          que sobravam de 3 colunas fixas num iPhone SE. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <KPI label="Rotas" valor={String(kpis.rotas)} />
        <KPI label="Km percorridos" valor={kpis.km.toFixed(1).replace('.', ',')} sufixo=" km" />
        <KPI label="Horas em rota" valor={kpis.horas.toFixed(1).replace('.', ',')} sufixo=" h" />
      </div>

      {erro && <p className="text-xs text-bad bg-bad-bg rounded-lg px-3 py-2 mb-3">{erro}</p>}

      {/* Abas + navegação de semana */}
      <div className="agenda-toolbar flex items-center justify-between gap-3 flex-wrap mb-4">
        {tabs}
        {view === 'semana' && semana.length > 0 && (
          <div className="flex items-center gap-2">
            {/* w-10 h-10 (40px), não w-8 (32px): mesmo padrão de alvo de
                toque do BotaoContato — aqui é um botão de verdade (com
                borda própria), não um link de texto, então o ajuste é no
                próprio tamanho, não numa área invisível por cima. */}
            <button onClick={() => setSemanaOffset(o => o - 1)} className="w-10 h-10 grid place-items-center rounded-lg border border-field-line text-ink-muted hover:bg-card-2">‹</button>
            <span className="text-sm font-medium text-ink tabular-nums min-w-[150px] text-center">
              {semana[0].getDate()} {MESES[semana[0].getMonth()]} – {semana[6].getDate()} {MESES[semana[6].getMonth()]} {semana[6].getFullYear()}
            </span>
            <button onClick={() => setSemanaOffset(o => o + 1)} className="w-10 h-10 grid place-items-center rounded-lg border border-field-line text-ink-muted hover:bg-card-2">›</button>
            {semanaOffset !== 0 && <button onClick={() => { setSemanaOffset(0); setDiaMobile(hoje ? (hoje.getDay() + 6) % 7 : 0) }} className="min-h-10 text-xs text-primary-lt font-semibold hover:underline px-2">Hoje</button>}
          </div>
        )}
      </div>

      {view === 'semana' ? (
        // Pula o degrau de 4 colunas: em md (768px, quando a sidebar entra),
        // 4 colunas davam ~110px por dia com o cartão de rota (nome, paradas,
        // ações) dentro — apertado demais. Fica em 2 colunas até xl (1280),
        // que é quando sobra espaço de verdade pras 7 de uma vez.
        <>
        <div className="agenda-week-strip md:hidden" role="group" aria-label="Dias desta semana">
          {semana.map((d, i) => {
            const iso = isoLocal(d)
            const doDia = porDia.get(iso) ?? []
            const idx = (d.getDay() + 6) % 7
            const selecionado = i === indiceDiaMobile
            const ehHoje = iso === hojeIso
            return (
              <button key={iso} onClick={() => setDiaMobile(i)} aria-pressed={selecionado}
                aria-label={`${DIAS[idx]} ${d.getDate()}${doDia.length ? `, ${doDia.length} rotas` : ', sem rota'}`}
                className={`agenda-day-chip ${selecionado ? 'is-selected' : ''} ${ehHoje ? 'is-today' : ''}`}>
                <span className="agenda-day-chip__name">{DIAS[idx].slice(0, 3)}</span>
                <span className="agenda-day-chip__date">{d.getDate()}</span>
                <span className="agenda-day-chip__count" aria-hidden="true">{doDia.length || '·'}</span>
              </button>
            )
          })}
        </div>

        <section className="agenda-mobile-day md:hidden">
          {dataSelecionadaMobile && (
            <div className="agenda-mobile-day__heading" aria-live="polite">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-lt">{isoLocal(dataSelecionadaMobile) === hojeIso ? 'Hoje' : DIAS[(dataSelecionadaMobile.getDay() + 6) % 7]}</p>
                <h2 className="text-lg font-bold text-ink">{dataSelecionadaMobile.getDate()} de {MESES[dataSelecionadaMobile.getMonth()]}</h2>
              </div>
              <span className="text-xs font-semibold text-ink-muted bg-card-2 rounded-full px-3 py-1.5">{rotasDiaMobile.length} rota{rotasDiaMobile.length === 1 ? '' : 's'}</span>
            </div>
          )}
          {rotasDiaMobile.length === 0 ? (
            <div className="glass rounded-2xl border border-line p-5 text-center">
              <p className="font-semibold text-ink">Dia livre</p>
              <p className="text-sm text-ink-muted mt-1">Nenhuma visita programada para este dia.</p>
              <button onClick={() => router.push('/dashboard/roteirizar')} className="mt-4 min-h-11 px-4 rounded-xl bg-primary/10 text-primary-lt font-semibold text-sm">Montar uma rota</button>
            </div>
          ) : (
            <div className="space-y-3">{rotasDiaMobile.map(r => <div key={r.id}>{cartaoSemana(comLocal(r))}</div>)}</div>
          )}
        </section>

        <div className="hidden md:grid grid-cols-2 xl:grid-cols-7 gap-3">
          {semana.map(d => {
            const iso = isoLocal(d)
            const doDia = porDia.get(iso) ?? []
            const ehHoje = iso === hojeIso
            const idx = (d.getDay() + 6) % 7
            return (
              <div key={iso} className={`agenda-day-column glass rounded-2xl border p-3 flex flex-col ${ehHoje ? 'is-today border-primary/60 ring-1 ring-primary/20' : 'border-line'}`}>
                <div className="agenda-day-column__header">
                  <div>
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${ehHoje ? 'text-primary-lt' : 'text-ink-muted'}`}>{DIAS[idx]}</p>
                    <p className="text-lg font-bold text-ink leading-none">{d.getDate()} <span className="text-xs font-medium text-ink-faint">{MESES[d.getMonth()]}</span></p>
                  </div>
                  <span className={`agenda-day-column__count ${doDia.length ? 'has-routes' : ''}`}>{doDia.length ? `${doDia.length} rota${doDia.length === 1 ? '' : 's'}` : 'Livre'}</span>
                </div>

                {doDia.length === 0 ? (
                  <button onClick={() => router.push('/dashboard/roteirizar')}
                    className="flex-1 min-h-[120px] rounded-xl border border-dashed border-line flex flex-col items-center justify-center gap-1 text-center hover:border-primary/50 hover:bg-card-2/50 transition-colors group">
                    <span className="text-[11px] text-ink-faint">Nenhuma rota programada</span>
                    <span className="text-[11px] text-primary-lt font-medium group-hover:underline">+ Nova rota</span>
                  </button>
                ) : (
                  <div className="space-y-2.5">{doDia.map(r => <div key={r.id}>{cartaoSemana(comLocal(r))}</div>)}</div>
                )}
              </div>
            )
          })}
        </div>
        </>
      ) : rotas.length === 0 ? (
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Nenhuma rota salva ainda</p>
          <p className="text-sm text-ink-muted mt-1">Monte uma no <strong className="text-good">Roteirizar</strong> ou pelo Radar.</p>
        </div>
      ) : (
        <div className="space-y-3">{rotas.map(r => cartaoLista(comLocal(r)))}</div>
      )}

      {/* Rotas sem data marcam presença mesmo no modo Semana */}
      {view === 'semana' && semDia.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Sem data definida ({semDia.length})</p>
          <div className="space-y-3">{semDia.map(r => cartaoLista(comLocal(r)))}</div>
        </div>
      )}
    </div>
  )
}
