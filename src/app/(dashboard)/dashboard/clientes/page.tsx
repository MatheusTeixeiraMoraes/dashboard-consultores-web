import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import type { Cliente } from '@/lib/types'
import ClientesClient from './ClientesClient'

export default async function ClientesPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  // A RLS já escopa: consultor recebe só os seus (por nome); gestão recebe tudo.
  // O PostgREST devolve no máx. 1000 linhas por resposta, então pagina-se até o
  // fim (a carteira de um admin passa de 3 mil).
  // ponytail: carrega tudo pro cliente e pagina/busca no navegador; se a base
  // passar de ~10 mil, migrar pra paginação/busca no servidor.
  const PAGINA = 1000
  const clientes: Cliente[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('seller_nome', { ascending: true })
      .range(de, de + PAGINA - 1)
    if (error || !data || data.length === 0) break
    clientes.push(...(data as Cliente[]))
    if (data.length < PAGINA) break
  }

  const podeGerir = profile.role === 'admin' || profile.role === 'dono'

  // Nomes de consultor para o datalist do cadastro manual (gestão).
  let nomesConsultores: string[] = []
  if (podeGerir) {
    const { data } = await supabase
      .from('profiles')
      .select('nome')
      .eq('role', 'consultor')
      .order('nome', { ascending: true })
    nomesConsultores = [...new Set((data ?? []).map(p => p.nome).filter((n): n is string => !!n))]
  }

  return (
    <ClientesClient
      clientes={clientes}
      role={profile.role}
      meuNome={profile.nome || profile.email}
      nomesConsultores={nomesConsultores}
    />
  )
}
