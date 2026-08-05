'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { otimizarRota, geocodar, sleep, type Ponto, type ClienteSelecionado } from '@/lib/geo'
import {
  planejarRotas, separarForaDeArea, distanciaAoCentroKm, nomeSugerido,
  type ClienteGeo, type GrupoRota,
} from '@/lib/planejar-rotas'
import { fmtDinheiroCurto, type HexaCliente } from '@/lib/hexa-recife'

/** Acima disto, um dia de visitas deixa de ser realista. */
const PARADAS_CONFORTAVEIS = 10

interface Props {
  clientes: HexaCliente[]
  meuNome: string
}

type Fase = 'idle' | 'planejado' | 'criando' | 'ok' | 'erro'

export default function PlanejarRotas({ clientes, meuNome }: Props) {
  const router = useRouter()

  const [quantidade, setQuantidade] = useState(5)
  const [fase, setFase] = useState<Fase>('idle')
  const [erro, setErro] = useState('')
  const [progresso, setProgresso] = useState('')
  const [criadas, setCriadas] = useState(0)
  const [plano, setPlano] = useState<GrupoRota[]>([])

  const [partidaBusca, setPartidaBusca] = useState('')
  const [partida, setPartida] = useState<(Ponto & { endereco: string }) | null>(null)
  const [buscando, setBuscando] = useState(false)

  // Só quem tem coordenada entra no plano — sem lat/lng não há região.
  const geo: ClienteGeo[] = useMemo(
    () => clientes
      .filter(c => c.lat != null && c.lng != null)
      .map(c => ({
        seller_id: c.seller_id, lat: c.lat as number, lng: c.lng as number,
        bairro: c.bairro, cidade: c.cidade, tpv: c.tpv, consultor_nome: c.consultor_nome,
      })),
    [clientes],
  )

  const { dentro, fora, centro } = useMemo(() => separarForaDeArea(geo), [geo])
  const semGps = clientes.length - geo.length

  const porId = useMemo(() => new Map(clientes.map(c => [c.seller_id, c])), [clientes])

  function planejar() {
    setErro(''); setCriadas(0)
    const grupos = planejarRotas(dentro, { quantidade })
    if (grupos.length === 0) { setErro('Nenhum cliente com coordenada para planejar.'); return }
    setPlano(grupos)
    setFase('planejado')
  }

  async function buscarPartida() {
    const q = partidaBusca.trim()
    if (!q) return
    setErro(''); setBuscando(true)
    const p = await geocodar(q)
    setBuscando(false)
    if (!p) { setErro('Endereço de partida não encontrado.'); return }
    setPartida({ ...p, endereco: q })
  }

  function usarMeuGps() {
    if (!('geolocation' in navigator)) { setErro('GPS indisponível — informe a partida por endereço.'); return }
    navigator.geolocation.getCurrentPosition(
      p => setPartida({ lat: p.coords.latitude, lng: p.coords.longitude, endereco: 'Minha localização' }),
      () => setErro('Não consegui o GPS. Informe a partida por endereço.'),
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 },
    )
  }

  /**
   * Cria uma rota por grupo: otimiza a ordem no OSRM e grava em `rotas`.
   *
   * SEM data de visita, de propósito. A rota nasce como "plano" e o dia é
   * escolhido na Agenda — que é onde se enxerga a semana inteira e o que já
   * está marcado. Encaixar aqui obrigaria a adivinhar o calendário de quem vai.
   *
   * Uma chamada ao OSRM por vez, com pausa: é servidor público de demonstração,
   * e disparar 5 a 12 requisições juntas é abusar de graça alheia.
   */
  async function criarRotas() {
    setFase('criando'); setErro(''); setCriadas(0)
    const supabase = createClient()
    let feitas = 0

    for (const grupo of plano) {
      setProgresso(`rota ${grupo.indice} de ${plano.length}: calculando o trajeto…`)

      // Sem partida informada, o ponto de largada é o centro geográfico do
      // próprio grupo: o trajeto sai coerente e nenhum cliente é rebaixado a
      // "ponto de partida" (o que o tiraria da lista de visitas).
      const largada: Ponto = partida ?? grupo.centro
      const paradas = grupo.clientes.map(c => ({ lat: c.lat, lng: c.lng }))

      let ordem = grupo.clientes
      let km: number | null = null
      let min: number | null = null
      try {
        const r = await otimizarRota(largada, paradas, null)
        ordem = r.ordemStops.map(i => grupo.clientes[i])
        km = r.distanciaKm
        min = r.tempoMin
      } catch {
        // Rota salva mesmo assim, na ordem do agrupamento e sem km/tempo — o
        // OSRM público cai de vez em quando, e perder o plano inteiro por causa
        // disso seria pior. A Agenda tem "Refazer" justamente para isto.
        setProgresso(`rota ${grupo.indice}: trajeto indisponível, salvando sem otimizar…`)
      }

      const stops: ClienteSelecionado[] = ordem.map(c => {
        const cli = porId.get(c.seller_id)
        return {
          seller_id: c.seller_id,
          seller_nome: cli?.seller_nome || cli?.nome_comercio || c.seller_id,
          lat: c.lat, lng: c.lng,
          telefone: cli?.seller_telefone ?? null,
          endereco: cli?.endereco_completo ?? '',
          cidade: c.cidade, bairro: c.bairro,
          consultor_nome: c.consultor_nome,
        }
      })

      const { error } = await supabase.from('rotas').insert({
        consultor_nome: meuNome,
        nome_rota: nomeSugerido(grupo),
        data_visita: null,
        partida_endereco: partida?.endereco ?? `Centro da região (${grupo.bairrosPrincipais[0] ?? 'grupo ' + grupo.indice})`,
        partida_lat: largada.lat, partida_lng: largada.lng,
        chegada_endereco: null, chegada_lat: null, chegada_lng: null,
        stops, distancia_km: km, tempo_minutos: min,
        origem: 'hexa_recife',
      })
      if (error) {
        setFase('erro')
        setErro(`Criei ${feitas} de ${plano.length} rotas e parei: ${error.message}`)
        router.refresh()
        return
      }
      feitas++
      setCriadas(feitas)
      if (feitas < plano.length) await sleep(1100)
    }

    setFase('ok')
    setProgresso('')
    router.refresh()
  }

  const paradasPorRota = plano.length > 0 ? Math.round(dentro.length / plano.length) : Math.round(dentro.length / quantidade)
  const muitasParadas = paradasPorRota > PARADAS_CONFORTAVEIS

  return (
    <div className="glass rounded-2xl border border-line p-5 border-l-4 border-l-good">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-8 h-8 rounded-lg bg-good-bg grid place-items-center flex-shrink-0 text-good">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Planejar a semana</p>
          <p className="text-[11px] text-ink-muted">Divide a base por região e cria uma rota por dia</p>
        </div>
      </div>

      <p className="text-xs text-ink-muted my-3 leading-relaxed">
        Agrupa os {dentro.length} clientes por proximidade — não por nome de bairro, que separaria
        vizinhos de ruas diferentes — e monta uma rota para cada grupo, já na melhor ordem de visita.
        As rotas nascem <b className="text-ink">sem data</b>: o dia você escolhe na Agenda.
      </p>

      {/* Quantidade + partida */}
      {(fase === 'idle' || fase === 'planejado' || fase === 'ok') && (
        <div className="space-y-2.5 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-ink-muted">Quantas rotas:</span>
            {[3, 5, 8, 12].map(n => (
              <button key={n} onClick={() => { setQuantidade(n); setFase('idle') }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  quantidade === n ? 'border-primary bg-primary/15 text-ink' : 'border-field-line bg-field text-ink-muted hover:text-ink'
                }`}>
                {n}
              </button>
            ))}
            <input type="number" min={1} max={30} value={quantidade}
              onChange={e => { setQuantidade(Math.max(1, Math.min(30, Number(e.target.value) || 1))); setFase('idle') }}
              className="w-16 border border-field-line bg-field rounded-lg px-2 py-1.5 text-xs text-ink" />
            <span className="text-[11px] text-ink-faint">≈ {paradasPorRota} paradas cada</span>
          </div>

          {muitasParadas && (
            <p className="text-[11px] text-warn bg-warn-bg rounded-lg px-2.5 py-2">
              {paradasPorRota} visitas num dia é muito para trabalho de rua — o usual são 6 a 10.
              Com {Math.ceil(dentro.length / PARADAS_CONFORTAVEIS)} rotas cada dia fica em ~{PARADAS_CONFORTAVEIS}.
            </p>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-ink-muted w-full">Partida (opcional):</span>
            <input value={partidaBusca} onChange={e => setPartidaBusca(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') buscarPartida() }}
              placeholder="Endereço de onde o dia começa…"
              className="flex-1 min-w-[180px] border border-field-line bg-field rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint" />
            <button onClick={buscarPartida} disabled={buscando || !partidaBusca.trim()}
              className="border border-field-line text-primary-lt text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-50">
              {buscando ? '…' : 'Buscar'}
            </button>
            <button onClick={usarMeuGps} className="text-xs text-primary-lt font-medium hover:underline px-1">GPS</button>
          </div>
          {partida ? (
            <p className="text-[11px] text-good truncate">📍 sai de: {partida.endereco}</p>
          ) : (
            <p className="text-[11px] text-ink-faint">Sem partida, cada rota começa pelo centro da própria região.</p>
          )}
        </div>
      )}

      {erro && <div className="text-xs bg-bad-bg text-bad rounded-lg px-3 py-2 mb-3 whitespace-pre-wrap">{erro}</div>}

      {fase === 'criando' && (
        <div className="text-xs text-ink-muted bg-card-2 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <span className="animate-spin inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
          {progresso} ({criadas}/{plano.length} criadas)
        </div>
      )}

      {fase === 'ok' && (
        <div className="text-xs bg-good-bg text-good rounded-lg px-3 py-2 mb-3">
          ✓ {criadas} rota{criadas !== 1 ? 's' : ''} criada{criadas !== 1 ? 's' : ''}. Agora é só marcar o dia de cada uma na{' '}
          <button onClick={() => router.push('/dashboard/agenda')} className="underline font-semibold">Agenda</button>.
        </div>
      )}

      {/* Prévia dos grupos */}
      {(fase === 'planejado' || fase === 'criando') && plano.length > 0 && (
        <div className="border border-line rounded-lg divide-y divide-line mb-3">
          {plano.map(g => (
            <div key={g.indice} className="px-3 py-2 flex items-baseline gap-2 text-[11px]">
              <span className="font-bold text-primary-lt w-10 flex-shrink-0">#{g.indice}</span>
              <span className="text-ink font-semibold w-16 flex-shrink-0 tabular-nums">{g.clientes.length} par.</span>
              <span className="text-ink-dim truncate flex-1" title={`${g.cidades.join(', ')} — ${g.bairrosPrincipais.join(', ')}`}>
                {g.bairrosPrincipais.join(', ') || g.cidades.join(', ')}
              </span>
              <span className="text-ink-faint tabular-nums flex-shrink-0">{g.diametroKm.toFixed(0)} km</span>
              <span className="text-good tabular-nums flex-shrink-0 w-16 text-right">{fmtDinheiroCurto(g.tpvTotal)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quem não entra no plano */}
      {(fora.length > 0 || semGps > 0) && (
        <details className="text-[11px] border border-line rounded-lg p-2.5 mb-3">
          <summary className="cursor-pointer text-warn font-semibold">
            {fora.length + semGps} cliente{fora.length + semGps !== 1 ? 's' : ''} fora do plano
          </summary>
          <div className="mt-2 space-y-1 text-ink-muted">
            {semGps > 0 && <p>{semGps} sem GPS — use o botão de geocodificar acima.</p>}
            {fora.length > 0 && (
              <>
                <p className="text-ink-dim">
                  {fora.length} com coordenada longe demais da região. Cidade próxima e distância grande
                  quase sempre significa <b className="text-warn">GPS errado na planilha</b>, não cliente distante:
                </p>
                {fora.map(c => (
                  <p key={c.seller_id} className="truncate">
                    · {c.cidade || '—'}{c.bairro ? `, ${c.bairro}` : ''} —{' '}
                    <b className="text-warn">{distanciaAoCentroKm(c, centro).toFixed(0)} km</b> do centro
                  </p>
                ))}
              </>
            )}
          </div>
        </details>
      )}

      {fase === 'planejado' ? (
        <div className="flex gap-2">
          <button onClick={criarRotas}
            className="flex-1 bg-good hover:opacity-90 text-white text-sm font-semibold py-2.5 rounded-xl">
            Criar {plano.length} rota{plano.length !== 1 ? 's' : ''}
          </button>
          <button onClick={() => setFase('idle')}
            className="px-3 py-2 rounded-xl text-xs font-medium text-ink-dim border border-line hover:bg-card-2">
            Refazer
          </button>
        </div>
      ) : (
        <button onClick={planejar} disabled={fase === 'criando' || dentro.length === 0}
          className="w-full text-good border border-good/30 bg-good-bg hover:bg-good/20 disabled:opacity-50 text-sm font-semibold py-2.5 rounded-xl">
          {fase === 'ok' ? 'Planejar de novo' : `Planejar ${quantidade} rotas`}
        </button>
      )}
    </div>
  )
}
