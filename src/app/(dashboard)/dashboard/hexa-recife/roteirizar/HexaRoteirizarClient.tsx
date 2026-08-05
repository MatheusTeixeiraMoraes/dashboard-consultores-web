'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import MultiFiltro from '@/components/MultiFiltro'
import { enderecoExibivel } from '@/lib/texto'
import { otimizarRota, geocodar, linksGoogleMaps, type Ponto, type ClienteSelecionado } from '@/lib/geo'
import { receberDoPainelHexa, fmtDinheiro, fmtDinheiroCurto, type HexaCliente } from '@/lib/hexa-recife'

const MAX_STOPS = 100   // teto do OSRM /trip público, igual ao Roteirizar da carteira
const POR_PAGINA = 24

/**
 * Vira parada no formato que `rotas.stops` já guarda — o MESMO da carteira.
 * É isso que faz a Agenda, o "Refazer" e os links do Maps funcionarem para as
 * rotas Hexa sem uma linha de código novo lá.
 */
function paraParada(c: HexaCliente): ClienteSelecionado {
  return {
    seller_id: c.seller_id,
    seller_nome: c.seller_nome || c.nome_comercio,
    lat: c.lat as number,
    lng: c.lng as number,
    telefone: c.seller_telefone,
    endereco: c.endereco_completo,
    cidade: c.cidade,
    bairro: c.bairro,
    consultor_nome: c.consultor_nome,
  }
}

export default function HexaRoteirizarClient({
  clientes, meuNome, gestao,
}: {
  clientes: HexaCliente[]
  meuNome: string
  gestao: boolean
}) {
  const router = useRouter()

  const [partLat, setPartLat] = useState('')
  const [partLng, setPartLng] = useState('')
  const [partEnd, setPartEnd] = useState('')
  const [partBusca, setPartBusca] = useState('')
  const [buscandoPart, setBuscandoPart] = useState(false)
  const [chegLat, setChegLat] = useState('')
  const [chegLng, setChegLng] = useState('')

  const [stops, setStops] = useState<ClienteSelecionado[]>([])
  const [gerando, setGerando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<{ km: number; min: number } | null>(null)
  const [doPainel, setDoPainel] = useState(0)

  const [nomeRota, setNomeRota] = useState('')
  const [dataVisita, setDataVisita] = useState('')

  const [busca, setBusca] = useState('')
  const [fCidades, setFCidades] = useState<Set<string>>(new Set())
  const [fBairros, setFBairros] = useState<Set<string>>(new Set())
  const [fConsultores, setFConsultores] = useState<Set<string>>(new Set())
  const [pagina, setPagina] = useState(0)

  /* Seleção vinda do painel. Só os seller_id atravessam o localStorage — os
   * dados vêm do banco —, então uma entrega esquecida nunca ressuscita cadastro
   * velho.
   *
   * É um efeito de montagem mesmo: `localStorage` não existe no servidor, então
   * ler no corpo do componente (ou num inicializador de useState) quebraria o
   * render do lado do servidor. É o caso que a regra abaixo abre exceção —
   * sincronizar com sistema externo — e é como o Roteirizar da carteira faz. */
  /* eslint-disable react-hooks/set-state-in-effect -- leitura de localStorage na montagem; ver comentário acima */
  useEffect(() => {
    const ids = new Set(receberDoPainelHexa())
    if (ids.size === 0) return
    const encontrados = clientes.filter(c => ids.has(c.seller_id))
    const escolhidos = encontrados.slice(0, MAX_STOPS)
    if (escolhidos.length > 0) {
      setStops(escolhidos.map(paraParada))
      setDoPainel(escolhidos.length)
    }
    // Passar do teto do OSRM não pode acontecer calado: sem este aviso, o
    // consultor sairia com 100 paradas achando que leva as 145 selecionadas.
    if (encontrados.length > MAX_STOPS) {
      setErro(`O painel mandou ${encontrados.length} clientes e uma rota aceita ${MAX_STOPS}. Entraram os ${MAX_STOPS} de maior TPV — monte o resto numa segunda rota.`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Mudar filtro volta para a primeira página. Fica nos handlers, e não num
   * efeito que observa os filtros: o efeito renderizaria a página errada uma
   * vez antes de corrigir. */
  const comReset = <T,>(aplicar: (v: T) => void) => (v: T) => { aplicar(v); setPagina(0) }

  const naRota = useMemo(() => new Set(stops.map(s => s.seller_id)), [stops])

  const consultores = useMemo(() => [...new Set(clientes.map(c => c.consultor_nome).filter(Boolean))].sort(), [clientes])
  const cidades = useMemo(() => [...new Set(clientes.map(c => c.cidade).filter(Boolean))].sort(), [clientes])
  const bairros = useMemo(() => [...new Set(
    clientes.filter(c => fCidades.size === 0 || fCidades.has(c.cidade)).map(c => c.bairro).filter(Boolean),
  )].sort(), [clientes, fCidades])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return clientes.filter(c =>
      (fCidades.size === 0 || fCidades.has(c.cidade)) &&
      (fBairros.size === 0 || fBairros.has(c.bairro)) &&
      (fConsultores.size === 0 || fConsultores.has(c.consultor_nome)) &&
      (!q || c.seller_id.toLowerCase().includes(q) || c.seller_nome.toLowerCase().includes(q) || c.nome_comercio.toLowerCase().includes(q)),
    )
  }, [clientes, busca, fCidades, fBairros, fConsultores])

  const temFiltro = fCidades.size + fBairros.size + fConsultores.size > 0 || !!busca.trim()
  const tpvDaRota = useMemo(() => {
    const porId = new Map(clientes.map(c => [c.seller_id, c.tpv ?? 0]))
    return stops.reduce((s, p) => s + (porId.get(p.seller_id) ?? 0), 0)
  }, [stops, clientes])

  function alternar(c: HexaCliente) {
    setResultado(null)
    setStops(prev => {
      if (prev.some(s => s.seller_id === c.seller_id)) return prev.filter(s => s.seller_id !== c.seller_id)
      if (prev.length >= MAX_STOPS) { setErro(`Máximo de ${MAX_STOPS} clientes por rota.`); return prev }
      return [...prev, paraParada(c)]
    })
  }

  function selecionarTodos() {
    setErro(''); setResultado(null)
    setStops(prev => {
      const jaTem = new Set(prev.map(s => s.seller_id))
      const novos = filtrados.filter(c => !jaTem.has(c.seller_id)).map(paraParada)
      if (prev.length + novos.length > MAX_STOPS) setErro(`Selecionei os primeiros ${MAX_STOPS} (limite por rota).`)
      return [...prev, ...novos].slice(0, MAX_STOPS)
    })
  }

  function usarMeuGps() {
    if (!('geolocation' in navigator)) { setErro('GPS indisponível — informe a partida por endereço ou lat/lng.'); return }
    setErro('')
    navigator.geolocation.getCurrentPosition(
      p => { setPartLat(String(p.coords.latitude)); setPartLng(String(p.coords.longitude)); setPartEnd('Minha localização') },
      err => setErro(err.code === 1
        ? 'Localização bloqueada no navegador. Informe a partida por endereço ou lat/lng abaixo.'
        : 'Não foi possível obter o GPS. Informe a partida por endereço ou lat/lng.'),
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 },
    )
  }

  async function buscarPartida() {
    const q = partBusca.trim()
    if (!q) return
    setErro(''); setBuscandoPart(true)
    const p = await geocodar(q)
    setBuscandoPart(false)
    if (!p) { setErro('Endereço de partida não encontrado.'); return }
    setPartLat(String(p.lat)); setPartLng(String(p.lng)); setPartEnd(q)
  }

  function coord(latS: string, lngS: string): Ponto | null {
    const lat = Number(latS.replace(',', '.')), lng = Number(lngS.replace(',', '.'))
    return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null
  }

  async function gerar() {
    setErro('')
    const partida = coord(partLat, partLng)
    if (!partida) { setErro('Informe o ponto de partida (GPS, endereço ou lat, lng).'); return }
    if (stops.length < 1) { setErro('Selecione ao menos um cliente.'); return }

    setGerando(true)
    try {
      const { ordemStops, distanciaKm, tempoMin } = await otimizarRota(
        partida, stops.map(s => ({ lat: s.lat, lng: s.lng })), coord(chegLat, chegLng),
      )
      setStops(ordemStops.map(i => stops[i]))
      setResultado({ km: distanciaKm, min: tempoMin })
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setGerando(false)
    }
  }

  async function salvar() {
    setErro('')
    if (!nomeRota.trim()) { setErro('Dê um nome à rota.'); return }
    if (stops.length < 1) { setErro('A rota está vazia.'); return }

    const partida = coord(partLat, partLng)
    const chegada = coord(chegLat, chegLng)
    setSalvando(true)
    const supabase = createClient()
    // origem: é o que separa esta rota das da carteira — na Agenda ela ganha o
    // selo, e encerrar a categoria apaga exatamente estas.
    const { error } = await supabase.from('rotas').insert({
      consultor_nome: meuNome,
      nome_rota: nomeRota.trim(),
      data_visita: dataVisita || null,
      partida_endereco: partEnd.trim() || null,
      partida_lat: partida?.lat ?? null, partida_lng: partida?.lng ?? null,
      chegada_endereco: null,
      chegada_lat: chegada?.lat ?? null, chegada_lng: chegada?.lng ?? null,
      stops,
      distancia_km: resultado?.km ?? null,
      tempo_minutos: resultado?.min ?? null,
      origem: 'hexa_recife',
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    router.push('/dashboard/agenda')
  }

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)

  const linksMaps = useMemo(() => {
    const partida = coord(partLat, partLng)
    const chegada = coord(chegLat, chegLng)
    return linksGoogleMaps([
      ...(partida ? [partida] : []),
      ...stops.map(s => ({ lat: s.lat, lng: s.lng })),
      ...(chegada ? [chegada] : []),
    ])
  }, [partLat, partLng, chegLat, chegLng, stops])

  if (clientes.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold text-ink mb-4">Roteirizar · Rota Inter/Hexa Recife</h1>
        <div className="glass rounded-2xl border border-line p-12 text-center">
          <p className="font-semibold text-ink">Nenhum cliente com GPS nesta rota</p>
          <p className="text-sm text-ink-muted mt-1">
            Volte ao <button onClick={() => router.push('/dashboard/hexa-recife')} className="text-primary hover:underline">painel da rota</button> para
            ver a base e resolver os endereços sem coordenada.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-ink">Roteirizar · Rota Inter/Hexa Recife</h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-warn border border-warn/40 bg-warn-bg rounded-full px-2 py-0.5">temporária</span>
        </div>
        <p className="text-sm text-ink-muted mt-0.5">
          Só os clientes desta rota. A rota salva vai para a sua Agenda, marcada como Hexa.
        </p>
      </div>

      {doPainel > 0 && (
        <div className="mb-3 text-sm bg-good-bg text-good rounded-xl px-4 py-2.5">
          {doPainel} cliente{doPainel !== 1 ? 's vieram' : ' veio'} do painel da rota.
        </div>
      )}
      {erro && <p className="text-xs text-bad bg-bad-bg rounded-lg px-3 py-2 mb-3">{erro}</p>}

      <div className="grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-3 items-start">
        {/* Coluna esquerda: pontos + salvar */}
        <div className="flex flex-col gap-3">
          <div className="glass rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-ink-muted">Partida *</span>
              <button onClick={usarMeuGps} className="text-xs text-primary-lt font-medium hover:underline">Usar meu GPS</button>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <input value={partBusca} onChange={e => setPartBusca(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') buscarPartida() }}
                placeholder="Buscar endereço…" className={`${inp} flex-1 min-w-0`} />
              <button onClick={buscarPartida} disabled={buscandoPart || !partBusca.trim()}
                className="border border-field-line text-primary-lt text-xs font-semibold px-2.5 py-2 rounded-xl whitespace-nowrap disabled:opacity-50">
                {buscandoPart ? '…' : 'Buscar'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input value={partLat} onChange={e => setPartLat(e.target.value)} placeholder="Latitude" className={inp} />
              <input value={partLng} onChange={e => setPartLng(e.target.value)} placeholder="Longitude" className={inp} />
            </div>
            {partEnd && <p className="text-[11px] text-ink-faint mt-1 truncate">📍 {partEnd}</p>}

            <span className="text-xs font-semibold text-ink-muted mt-3 mb-1.5 block">Chegada (opcional)</span>
            <div className="grid grid-cols-2 gap-1.5">
              <input value={chegLat} onChange={e => setChegLat(e.target.value)} placeholder="Latitude" className={inp} />
              <input value={chegLng} onChange={e => setChegLng(e.target.value)} placeholder="Longitude" className={inp} />
            </div>
            <p className="text-[11px] text-ink-faint mt-1">Sem chegada, termina no último cliente.</p>
          </div>

          <div className="glass rounded-2xl border border-line p-4">
            <span className="text-sm font-semibold text-ink mb-2.5 block">Salvar na agenda</span>
            <div className="flex flex-col gap-2 mb-2.5">
              <input value={nomeRota} onChange={e => setNomeRota(e.target.value)}
                placeholder="Nome da rota (ex.: Hexa — Boa Viagem)" className={inp} />
              <input type="date" value={dataVisita} onChange={e => setDataVisita(e.target.value)} className={inp} />
            </div>
            {/* Salvar sem ter gerado é permitido (às vezes a pessoa só quer a
                lista do dia), mas não pode ser silencioso: aconteceu no primeiro
                teste real e a rota foi para a agenda sem km, sem tempo e na
                ordem de seleção — parecendo pronta. */}
            {stops.length > 0 && !resultado && (
              <p className="text-[11px] text-warn bg-warn-bg rounded-lg px-2.5 py-2 mb-2">
                Rota ainda não otimizada. Salvando assim, ela vai para a agenda sem km,
                sem tempo e na ordem em que você marcou. Clique em <b>Gerar rota</b> antes.
              </p>
            )}
            <button onClick={salvar} disabled={salvando || stops.length === 0}
              className={`w-full disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl ${
                resultado ? 'bg-primary hover:bg-primary-dk' : 'bg-ink-faint hover:bg-ink-muted'
              }`}>
              {salvando ? 'Salvando…' : resultado ? 'Salvar rota' : 'Salvar mesmo assim'}
            </button>
          </div>
        </div>

        {/* Coluna direita: selecionados + grade */}
        <div className="flex flex-col gap-3 min-w-0">
          <div className="glass rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">Clientes selecionados</span>
                <span className="text-xs font-bold text-primary-lt bg-primary/15 px-2 py-0.5 rounded-full">{stops.length}</span>
                {tpvDaRota > 0 && <span className="text-xs text-ink-muted">{fmtDinheiroCurto(tpvDaRota)} de TPV</span>}
              </div>
              <div className="flex items-center gap-2">
                {stops.length > 0 && (
                  <button onClick={() => { setStops([]); setResultado(null) }} className="text-sm text-ink-muted hover:text-ink">Limpar tudo</button>
                )}
                <button onClick={gerar} disabled={gerando || stops.length === 0}
                  className="bg-primary hover:bg-primary-dk disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  {gerando ? 'Gerando…' : 'Gerar rota'}
                </button>
              </div>
            </div>

            {stops.length === 0 ? (
              <p className="text-sm text-ink-faint mt-3">Marque clientes na lista abaixo para montar a rota.</p>
            ) : (
              <>
                {resultado && (
                  <div className="mt-3 text-sm bg-good-bg text-good rounded-xl px-4 py-2.5">
                    Rota otimizada: <b>{resultado.km.toFixed(1).replace('.', ',')} km</b> · <b>{Math.round(resultado.min)} min</b>
                  </div>
                )}
                {linksMaps.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-3">
                    {linksMaps.length === 1 ? (
                      <a href={linksMaps[0]} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-gmaps hover:bg-gmaps-dk text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                        Abrir no Google Maps
                      </a>
                    ) : (
                      <>
                        <span className="text-[11px] text-ink-muted w-full">Google Maps · {linksMaps.length} trechos:</span>
                        {linksMaps.map((l, i) => (
                          <a key={i} href={l} target="_blank" rel="noopener noreferrer"
                            className="bg-gmaps hover:bg-gmaps-dk text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">{i + 1}</a>
                        ))}
                      </>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-3 max-h-40 overflow-y-auto">
                  {stops.map((s, i) => (
                    <span key={s.seller_id} className="inline-flex items-center gap-1.5 text-[11px] bg-card-2 border border-line rounded-lg pl-1.5 pr-1 py-1 text-ink-dim max-w-full">
                      {resultado && <span className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">{i + 1}</span>}
                      <span className="truncate">{s.seller_nome || `#${s.seller_id}`}</span>
                      <button onClick={() => { setStops(x => x.filter(y => y.seller_id !== s.seller_id)); setResultado(null) }}
                        className="text-ink-faint hover:text-bad w-4 text-center flex-shrink-0">×</button>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="glass rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <span className="text-sm font-semibold text-ink">Selecionar clientes</span>
              <p className="text-xs text-ink-muted">
                <b className="text-ink">{filtrados.length.toLocaleString('pt-BR')}</b>{temFiltro ? ' encontrados' : ' com GPS'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              <input value={busca} onChange={e => { setBusca(e.target.value); setPagina(0) }}
                placeholder="Buscar por ID, nome ou comércio…" className={`${inp} flex-1 min-w-[220px]`} />
              {gestao && consultores.length > 1 && (
                <MultiFiltro label="Consultores" opcoes={consultores} sel={fConsultores} onChange={comReset(setFConsultores)} />
              )}
              <MultiFiltro label="Cidades" opcoes={cidades} sel={fCidades} onChange={comReset(setFCidades)} />
              <MultiFiltro label="Bairros" opcoes={bairros} sel={fBairros} onChange={comReset(setFBairros)} />
              <button onClick={selecionarTodos} disabled={filtrados.length === 0}
                className="ml-auto bg-card-2 hover:bg-primary/20 border border-field-line disabled:opacity-40 text-ink text-xs font-semibold px-3.5 py-2 rounded-xl whitespace-nowrap">
                + Selecionar todos ({filtrados.length.toLocaleString('pt-BR')})
              </button>
            </div>

            {filtrados.length === 0 ? (
              <p className="text-sm text-ink-faint text-center py-10">Nenhum cliente com esses filtros.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {visiveis.map(c => {
                    const sel = naRota.has(c.seller_id)
                    const endereco = enderecoExibivel(c.endereco_completo)
                    return (
                      <button key={c.seller_id} onClick={() => alternar(c)}
                        className={`text-left rounded-xl border p-3 transition-colors ${sel ? 'border-primary bg-primary/15' : 'border-line hover:bg-card-2'}`}>
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-primary border-primary' : 'border-ink-faint'}`}>
                            {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-mono bg-primary/15 text-primary-lt px-1.5 py-0.5 rounded">{c.seller_id}</span>
                              {c.tpv != null && <span className="text-[10px] font-semibold text-good">{fmtDinheiro(c.tpv)}</span>}
                            </div>
                            <p className="text-sm font-medium text-ink truncate mt-0.5">{c.seller_nome || c.nome_comercio || '—'}</p>
                            {endereco && <p className="text-[11px] text-ink-dim truncate" title={endereco}>{endereco}</p>}
                            <p className="text-[11px] text-ink-faint truncate">
                              {c.bairro ? `${c.bairro}, ` : ''}{c.cidade}
                              {c.status_operacional && <> · {c.status_operacional}</>}
                            </p>
                          </div>
                        </div>
                      </button>
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
      </div>
    </div>
  )
}

const inp = 'border border-field-line bg-field rounded-xl px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary'
