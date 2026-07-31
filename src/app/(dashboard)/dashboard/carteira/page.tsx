import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { redirect } from 'next/navigation'
import { compararCarteira, type LinhaCarteira, type RelatorioCarteira } from '@/lib/carteira'
import CarteiraClient from './CarteiraClient'

export interface ConsultorCarteira {
  consultor_nome: string
  total: number
  temLogin: boolean
}

export default async function CarteiraPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  // Visão de gestão: quem enxerga a equipe inteira.
  if (!(profile.role === 'admin' || profile.role === 'dono' || profile.role === 'lider')) {
    redirect('/dashboard/acionaveis')
  }

  const supabase = await createClient()

  /* Esta tela baixava mp_carteira INTEIRA — todo snapshot já enviado — só para
   * o `compararCarteira` jogar fora tudo menos dois meses. Era a única tela do
   * app cujo custo crescia sem teto a cada upload (a tabela guarda histórico de
   * propósito: migrations/2026-07-20_campanhas.sql:31-32), e a próxima candidata
   * a estourar statement timeout — como já aconteceu em Usuários.
   *
   * Agora as duas datas são descobertas com duas consultas de UMA linha, e só
   * os dois snapshots relevantes são trazidos. O custo vira fixo.
   *
   * As datas reproduzem EXATAMENTE o que o compararCarteira escolheria:
   *   dataAtual    = último snapshot do mês mais recente;
   *   dataAnterior = último snapshot do mês ANTERIOR que tem dado.
   * O `.lt(primeiroDoMes)` é o que garante a segunda: pegar simplesmente "as
   * duas datas mais recentes" estaria ERRADO — com upload quinzenal isso
   * compararia quinzena com quinzena, e a REGRA-MÃE de lib/carteira.ts é
   * comparar MÊS com mês. */
  const [datas, { data: perfis }] = await Promise.all([
    (async (): Promise<{ atual: string | null; anterior: string | null }> => {
      const { data: maisRecente } = await supabase
        .from('mp_carteira')
        .select('data_referencia')
        .order('data_referencia', { ascending: false })
        .limit(1)
        .maybeSingle()

      const atual: string | null = maisRecente?.data_referencia ?? null
      if (!atual) return { atual: null, anterior: null }

      const { data: anteriorRow } = await supabase
        .from('mp_carteira')
        .select('data_referencia')
        .lt('data_referencia', `${atual.slice(0, 7)}-01`)
        .order('data_referencia', { ascending: false })
        .limit(1)
        .maybeSingle()

      return { atual, anterior: anteriorRow?.data_referencia ?? null }
    })(),
    supabase.from('profiles').select('nome'),
  ])

  // Histórico de dono por seller — só as 3 colunas que a comparação usa, e só
  // dos snapshots que ela vai olhar.
  //
  // O `.order()` NÃO é enfeite: `buscarTudo` dispara as páginas em paralelo, e
  // sem ORDER BY o Postgres não garante ordem estável entre OFFSET/LIMIT
  // independentes — dá para uma linha aparecer em duas páginas e outra em
  // nenhuma, corrompendo o diff em silêncio. `(data_referencia, seller_id)` é
  // ordem TOTAL aqui, garantida pelo `unique (data_referencia, seller_id)` da
  // tabela; ordenar só por seller_id não bastaria, porque o mesmo seller
  // aparece uma vez em cada snapshot.
  const alvos = [datas.atual, datas.anterior].filter((d): d is string => !!d)
  const linhas: LinhaCarteira[] = alvos.length
    ? await buscarTudo<LinhaCarteira>((opcoes, de, ate) =>
        supabase
          .from('mp_carteira')
          .select('seller_id, consultor_nome, data_referencia', opcoes)
          .in('data_referencia', alvos)
          .order('data_referencia', { ascending: true })
          .order('seller_id', { ascending: true })
          .range(de, ate),
      )
    : []

  /* Continua passando por compararCarteira em vez de montar o relatório aqui:
   * ele é testado (lib/carteira.test.mjs) e é dono da regra. Com o conjunto
   * reduzido o resultado é o mesmo — `snapshotsPorMes` enxerga os dois meses,
   * um snapshot cada, e `at(-1)`/`at(-2)` caem nas mesmas datas. Com um
   * snapshot só, ele devolve o baseline vazio, que é o comportamento correto
   * e idêntico ao de antes. */
  const relatorio: RelatorioCarteira = compararCarteira(linhas)

  // Carteira ATUAL: contagem por consultor no último snapshot.
  const consultoresComLogin = new Set<string>()
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  for (const p of perfis ?? []) if (p.nome) consultoresComLogin.add(norm(p.nome))

  const carteiraAtual: ConsultorCarteira[] = []
  if (relatorio.dataAtual) {
    const cont = new Map<string, number>()
    for (const l of linhas) {
      if (l.data_referencia !== relatorio.dataAtual) continue
      cont.set(l.consultor_nome, (cont.get(l.consultor_nome) ?? 0) + 1)
    }
    for (const [nome, total] of cont) {
      carteiraAtual.push({ consultor_nome: nome, total, temLogin: consultoresComLogin.has(norm(nome)) })
    }
    carteiraAtual.sort((a, b) => b.total - a.total)
  }

  return <CarteiraClient carteiraAtual={carteiraAtual} relatorio={relatorio} />
}
