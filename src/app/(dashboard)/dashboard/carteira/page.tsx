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

  // Histórico de dono por seller — só as 3 colunas que a comparação usa.
  const linhas = await buscarTudo<LinhaCarteira>((opcoes, de, ate) =>
    supabase
      .from('mp_carteira')
      .select('seller_id, consultor_nome, data_referencia', opcoes)
      .range(de, ate),
  )

  const relatorio: RelatorioCarteira = compararCarteira(linhas)

  // Carteira ATUAL: contagem por consultor no último snapshot.
  const consultoresComLogin = new Set<string>()
  const { data: perfis } = await supabase.from('profiles').select('nome')
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
