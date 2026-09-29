'use client'

// Uma parada da rota, do jeito que ela é lida NA RUA.
//
// POR QUE ISTO EXISTE
//
// A Agenda imprimia só `1. MARILIA DE ANDRADE AMORIM`. O consultor parado na
// esquina com o celular na mão não tinha como saber onde é, para quem liga, nem
// por que aquele cliente entrou na rota — precisava sair da Agenda, abrir
// Clientes e procurar o nome. Tudo o que está aqui já vinha no payload: o
// snapshot da parada (`rotas.stops`) guarda telefone, endereço, bairro e
// cidade desde a primeira versão, e a ficha do MP é a mesma consulta que
// Clientes e Roteirizar já fazem.
//
// Os dois lados dizem coisas diferentes de propósito: o snapshot é o CADASTRO
// no dia em que a rota foi montada (não envelhece — é o endereço para onde o
// carro vai); a ficha é o ESTADO de hoje (TPV, situação), e é ela que separa
// visita de resgate de visita de manutenção.

import { BotaoWhatsApp, BotaoMapa } from '@/components/BotaoContato'
import { precisaIdentificar, enderecoExibivel } from '@/lib/texto'
import type { ClienteSelecionado } from '@/lib/geo'
import type { FichaMP } from '@/lib/supabase/ficha-mp'

const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

/** `ultimo_contato` é `date` puro no banco — fatiar o texto é o certo aqui;
 *  passar por `new Date()` o jogaria para UTC e mostraria o dia anterior. */
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null)

/** `visitado_em` é timestamp, não `date`: tem hora, e fatiar o ISO mostraria o
 *  dia em UTC. Uma visita marcada às 21h30 em Recife apareceria como AMANHÃ —
 *  justamente no fim da tarde, que é quando o consultor fecha a rota. */
const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

/** Situação do MP → cor. Fora da lista conhecida fica neutro em vez de sumir. */
const CORES_STATUS: Record<string, string> = {
  CHURN: 'bg-bad-bg text-bad',
  INATIVO: 'bg-warn-bg text-warn',
  ATIVO: 'bg-good-bg text-good',
  REATIVADO: 'bg-good-bg text-good',
}

/** O aviso de GPS: o pino pode não ser a porta, e aqui é o último lugar onde
 *  ainda dá para o consultor descobrir isso antes de dirigir até lá. */
const AVISO_GPS = {
  aproximada: {
    texto: 'GPS aproximado',
    ajuda: 'O ponto desta parada é o centro do bairro, não o endereço do cliente.',
  },
  estimada: {
    texto: 'ponto estimado',
    ajuda: 'A máquina estimou este ponto pelo endereço escrito e ninguém conferiu — pode errar por uma quadra.',
  },
} as const

export default function ParadaCliente({ parada, ordem, ficha, onVisitar, salvando, bloqueado }: {
  parada: ClienteSelecionado
  /** Posição na rota, começando em 1 — a ordem em que o carro passa. */
  ordem: number
  /** Ficha da Planilha Geral. Ausente = cliente fora da planilha atual. */
  ficha?: FichaMP
  onVisitar: () => void
  /** Esta parada é a que está gravando agora. */
  salvando: boolean
  /** Alguma parada DESTA rota está gravando — inclusive outra. Trava o botão
   *  porque a gravação manda o array inteiro: duas em voo ao mesmo tempo se
   *  sobrescrevem. */
  bloqueado: boolean
}) {
  const visitado = !!parada.visitado_em
  const nome = precisaIdentificar(parada.seller_nome, parada.seller_id)
    ? `Pendente #${parada.seller_id}`
    : parada.seller_nome
  const endereco = enderecoExibivel(parada.endereco)
  const local = [parada.bairro, parada.cidade].filter(Boolean).join(' · ')
  const aviso =
    parada.coordenada_origem === 'aproximada' || parada.coordenada_origem === 'estimada'
      ? AVISO_GPS[parada.coordenada_origem]
      : null
  const contato = dataBR(ficha?.ultimo_contato ?? null)

  return (
    <li
      className={`rounded-xl border p-3 transition-colors ${
        visitado ? 'border-good/30 bg-good-bg/40' : 'border-line bg-card-2/40'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* O número é a ordem da rota; virar ✓ mantém a contagem legível sem
            reordenar nada — quem já foi continua onde estava na sequência. */}
        <span
          aria-hidden="true"
          className={`mt-0.5 w-6 h-6 flex-shrink-0 grid place-items-center rounded-full text-[11px] font-bold tabular-nums ${
            visitado ? 'bg-good text-white' : 'bg-primary/15 text-primary-lt'
          }`}
        >
          {visitado ? '✓' : ordem}
        </span>

        <div className={`min-w-0 flex-1 ${visitado ? 'opacity-60' : ''}`}>
          <div className="flex items-start gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-ink leading-snug break-words">{nome}</p>
            {ficha?.status && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${CORES_STATUS[ficha.status] ?? 'bg-card-2 text-ink-dim'}`}>
                {ficha.status}
              </span>
            )}
            {ficha?.quartil && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary-lt">
                {ficha.quartil}{ficha.prio != null && ` #${ficha.prio}`}
              </span>
            )}
          </div>

          {local && <p className="text-[11px] text-ink-dim mt-0.5">{local}</p>}
          {endereco && <p className="text-[11px] text-ink-muted truncate" title={endereco}>{endereco}</p>}

          {aviso && (
            <p className="text-[11px] text-warn font-semibold mt-0.5" title={aviso.ajuda}>
              ⚠ {aviso.texto}
            </p>
          )}

          {ficha && (ficha.tpv_mes_atual != null || contato) && (
            <p className="text-[11px] text-ink-muted mt-1 tabular-nums">
              {ficha.tpv_mes_atual != null && <>TPV mês {brl(ficha.tpv_mes_atual)}</>}
              {ficha.tpv_mes_atual != null && contato && ' · '}
              {contato && `contato ${contato}`}
            </p>
          )}

          {visitado && (
            <p className="text-[11px] text-good font-semibold mt-1">
              Visitado{dataHoraBR(parada.visitado_em) ? ` em ${dataHoraBR(parada.visitado_em)}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Alvos de 40px, o mesmo padrão de BotaoContato: é a barra que o dedo
          acerta dentro do carro, não um rodapé decorativo.
          `flex-1` só no celular — na largura do desktop ele viraria um botão de
          700px atravessando o cartão. */}
      <div className="flex gap-2 mt-2.5 justify-end">
        <button
          onClick={onVisitar}
          disabled={bloqueado}
          aria-pressed={visitado}
          className={`flex-1 sm:flex-none sm:px-6 h-10 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 ${
            visitado
              ? 'bg-card-2 text-ink-muted hover:text-ink'
              : 'bg-good-bg text-good hover:bg-good/25'
          }`}
        >
          {salvando ? 'Salvando…' : visitado ? 'Desfazer' : 'Visitei'}
        </button>
        <BotaoWhatsApp telefone={parada.telefone} nome={nome} />
        <BotaoMapa lat={parada.lat} lng={parada.lng} nome={nome} />
      </div>
    </li>
  )
}
