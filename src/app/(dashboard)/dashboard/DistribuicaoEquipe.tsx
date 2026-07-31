'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts'

export interface FatiaDistribuicao {
  name: string
  count: number
  color: string
}

/**
 * Barra de distribuição da equipe, separada do GeralClient para poder ser
 * carregada sob demanda.
 *
 * O motivo é peso, não organização: o `recharts` são ~338 KB (~84 KB brotli) e,
 * importado direto no GeralClient, entrava no first-load da Visão Geral — que é
 * a tela de entrada de TODO mundo. Pior: o bloco só é desenhado para gestão
 * (`!modoConsultor`), então cada consultor baixava um gráfico que a própria
 * condição nunca renderiza.
 *
 * Com o import dinâmico lá, este arquivo vira um chunk à parte, buscado só
 * quando há equipe para mostrar.
 */
export default function DistribuicaoEquipe({
  dados,
  total,
}: {
  dados: FatiaDistribuicao[]
  total: number
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 4 }}>
        <XAxis type="number" hide domain={[0, Math.max(total, 1)]} />
        <YAxis
          type="category" dataKey="name" width={120}
          tick={{ fontSize: 12, fill: 'var(--color-ink-muted)' }} axisLine={false} tickLine={false}
        />
        <Tooltip
          formatter={(v) => { const n = Number(v ?? 0); return [`${n} consultor${n !== 1 ? 'es' : ''}`, ''] }}
          // backgroundColor é obrigatório: sem ele o Recharts usa #fff e o texto
          // claro do body some. itemStyle idem — o default é #000 porque a cor
          // das barras vive nas <Cell>, não no <Bar>.
          contentStyle={{ backgroundColor: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-line)', fontSize: 12 }}
          labelStyle={{ color: 'var(--color-ink)' }}
          itemStyle={{ color: 'var(--color-ink-dim)' }}
          cursor={{ fill: 'var(--color-card-2)' }}
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={22}
          label={{ position: 'right', fontSize: 12, fill: 'var(--color-ink-muted)', fontWeight: 600 }}
        >
          {dados.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
