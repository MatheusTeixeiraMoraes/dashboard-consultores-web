'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  otimizarRota, entregarAoRoteirizar, MAX_PARADAS_ROTA,
  type Ponto, type ClienteSelecionado,
} from '@/lib/geo'
import { registrarEvento } from '@/lib/atividade'
import type { Cliente } from '@/lib/types'

/**
 * Transforma os clientes marcados na carteira em UMA rota na Agenda.
 *
 * Só duas perguntas, porque só duas importam aqui: em que dia e com que nome.
 * O resto o app resolve — a ordem de visita sai otimizada pelo OSRM e a largada
 * é o centro geográfico do próprio grupo, então nenhum cliente é rebaixado a
 * "ponto de partida" (o que o tiraria da lista de visitas).
 *
 * Quem quiser escolher a partida, conferir a ordem ou mexer parada a parada
 * continua tendo o Roteirizar, no link do rodapé.
 */
export default function GerarRota({
  selecionados, roteaveis, meuNome, aoFechar,
}: {
  /** Tudo que está marcado — inclusive quem não pode virar parada. */
  selecionados: Cliente[]
  /** O subconjunto que vira parada: com GPS e já identificado. */
  roteaveis: Cliente[]
  meuNome: string
  aoFechar: () => void
}) {
  const router = useRouter()

  const semGps = selecionados.filter(c => c.lat == null || c.lng == null).length
  const pendentes = selecionados.length - roteaveis.length - semGps
  const excedeu = roteaveis.length > MAX_PARADAS_ROTA
  // Diferente de "sem GPS" e "pendente": estes NÃO ficam de fora, entram na
  // rota. O aviso existe porque o ponto deles é o centro do bairro, e é aqui —
  // montando o roteiro — que dá tempo de conferir. Na porta já é tarde.
  const aproximados = roteaveis.filter(c => c.coordenada_origem === 'aproximada')

  // Uma rota aceita até MAX_PARADAS_ROTA paradas; o excedente fica de fora e é
  // dito na tela, nunca cortado calado.
  const paradas = useMemo(() => roteaveis.slice(0, MAX_PARADAS_ROTA), [roteaveis])

  /** Bairro que mais aparece — vira o nome sugerido e o rótulo da largada. */
  const bairroPrincipal = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const c of paradas) {
      const b = (c.bairro || '').trim()
      if (b) contagem.set(b, (contagem.get(b) ?? 0) + 1)
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  }, [paradas])

  /** Centro geográfico das paradas: é de onde o trajeto sai. */
  const centro: Ponto = useMemo(() => ({
    lat: paradas.reduce((s, c) => s + (c.lat as number), 0) / (paradas.length || 1),
    lng: paradas.reduce((s, c) => s + (c.lng as number), 0) / (paradas.length || 1),
  }), [paradas])

  const [nomeRota, setNomeRota] = useState(bairroPrincipal ? `Visitas · ${bairroPrincipal}` : 'Visitas')
  const [dataVisita, setDataVisita] = useState('')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')

  function paraParada(c: Cliente): ClienteSelecionado {
    return {
      seller_id: c.seller_id,
      seller_nome: c.seller_nome,
      lat: c.lat as number, lng: c.lng as number,
      telefone: c.seller_telefone,
      endereco: c.endereco_completo,
      cidade: c.cidade,
      bairro: c.bairro,
      consultor_nome: c.consultor_nome,
      coordenada_origem: c.coordenada_origem,
    }
  }

  async function criarNaAgenda() {
    if (!dataVisita) { setErro('Escolha o dia da visita.'); return }
    if (!nomeRota.trim()) { setErro('Dê um nome à rota.'); return }

    setErro('')
    setCriando(true)

    let ordem = paradas
    let km: number | null = null
    let min: number | null = null
    try {
      const r = await otimizarRota(centro, paradas.map(c => ({ lat: c.lat as number, lng: c.lng as number })), null)
      ordem = r.ordemStops.map(i => paradas[i])
      km = r.distanciaKm
      min = r.tempoMin
    } catch {
      /* O OSRM público cai de vez em quando. A rota é salva assim mesmo, na
       * ordem em que veio e sem km/tempo — perder a montagem inteira por causa
       * do servidor de terceiro seria pior, e a Agenda tem "Refazer" para
       * recalcular depois. */
    }

    const { error } = await createClient().from('rotas').insert({
      consultor_nome: meuNome,
      nome_rota: nomeRota.trim(),
      data_visita: dataVisita,
      partida_endereco: `Centro da região${bairroPrincipal ? ` (${bairroPrincipal})` : ''}`,
      partida_lat: centro.lat, partida_lng: centro.lng,
      chegada_endereco: null, chegada_lat: null, chegada_lng: null,
      stops: ordem.map(paraParada),
      distancia_km: km, tempo_minutos: min,
      origem: 'carteira',
    })

    setCriando(false)
    if (error) { setErro(error.message); return }

    registrarEvento({
      tipo: 'rota_criada',
      alvoTipo: 'rota',
      alvoDescricao: nomeRota.trim(),
      detalhes: { paradas: ordem.length, via: 'clientes' },
    })
    router.push('/dashboard/agenda')
  }

  /** Saída alternativa: montar à mão, com partida e ordem escolhidas. */
  function abrirNoRoteirizar() {
    entregarAoRoteirizar(paradas.map(paraParada), 'clientes')
    router.push('/dashboard/roteirizar')
  }

  const inp = 'w-full text-sm bg-field border border-field-line rounded-xl px-3 py-2 text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={aoFechar}>
      <div className="glass-blur rounded-2xl w-full max-w-md my-8 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h2 className="font-bold text-ink">
            Gerar rota — {paradas.length.toLocaleString('pt-BR')} cliente{paradas.length !== 1 ? 's' : ''}
          </h2>
          <button onClick={aoFechar} className="text-ink-faint hover:text-ink-dim text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Quem ficou de fora aparece antes de qualquer campo: é a diferença
              entre o que a pessoa marcou e o que vai virar visita. */}
          {(semGps > 0 || pendentes > 0 || excedeu || aproximados.length > 0) && (
            <div className="text-xs bg-warn-bg text-warn rounded-lg px-3 py-2.5 space-y-1">
              {aproximados.length > 0 && (
                <p>
                  <b>{aproximados.length.toLocaleString('pt-BR')}</b>{' '}
                  {aproximados.length === 1 ? 'parada entra' : 'paradas entram'} com{' '}
                  <b>GPS aproximado</b> (o ponto é o centro do bairro, não o endereço):{' '}
                  {aproximados.slice(0, 3).map(c => c.seller_nome || c.seller_id).join(', ')}
                  {aproximados.length > 3 && ` e mais ${aproximados.length - 3}`}.
                </p>
              )}
              {semGps > 0 && (
                <p>
                  <b>{semGps.toLocaleString('pt-BR')}</b> sem GPS {semGps === 1 ? 'ficou' : 'ficaram'} de fora —
                  use “geocodar” na lista para achar as coordenadas.
                </p>
              )}
              {pendentes > 0 && (
                <p>
                  <b>{pendentes.toLocaleString('pt-BR')}</b> pendente{pendentes !== 1 ? 's' : ''} de identificação
                  {pendentes === 1 ? ' ficou' : ' ficaram'} de fora — identifique antes de marcar visita.
                </p>
              )}
              {excedeu && (
                <p>
                  Uma rota aceita {MAX_PARADAS_ROTA} paradas: entram as {MAX_PARADAS_ROTA} primeiras
                  de {roteaveis.length.toLocaleString('pt-BR')}. Monte o resto numa segunda rota.
                </p>
              )}
            </div>
          )}

          {paradas.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Nenhum dos selecionados pode virar parada ainda. Resolva o GPS ou a identificação e tente de novo.
            </p>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-ink-muted mb-1.5 block">Nome da rota</label>
                <input value={nomeRota} onChange={e => setNomeRota(e.target.value)}
                  placeholder="Ex.: Visitas Boa Viagem" className={inp} />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-muted mb-1.5 block">Dia da visita</label>
                <input type="date" value={dataVisita} onChange={e => setDataVisita(e.target.value)} className={inp} />
                <p className="text-[11px] text-ink-faint mt-1">
                  {paradas.length} cliente{paradas.length !== 1 ? 's' : ''} {paradas.length !== 1 ? 'vão' : 'vai'} para
                  este dia na Agenda, já na melhor ordem de visita.
                </p>
              </div>

              {erro && <p className="text-xs text-bad bg-bad-bg rounded-lg px-3 py-2">{erro}</p>}

              <button onClick={criarNaAgenda} disabled={criando}
                className="w-full bg-primary hover:bg-primary-dk disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2">
                {criando && <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/60 border-t-transparent rounded-full" />}
                {criando ? 'Otimizando o trajeto…' : 'Criar rota na Agenda'}
              </button>

              <p className="text-[11px] text-ink-faint text-center">
                Quer escolher a partida ou mexer na ordem?{' '}
                <button onClick={abrirNoRoteirizar} className="text-primary-lt font-medium hover:underline">
                  Abrir no Roteirizar
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
