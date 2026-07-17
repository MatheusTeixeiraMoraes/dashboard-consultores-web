import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { redirect } from 'next/navigation'
import type { Cliente } from '@/lib/types'
import ClientesClient from './ClientesClient'

export default async function ClientesPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  // A RLS já escopa: consultor recebe só os seus (por nome); gestão recebe tudo.
  // Lista as colunas em vez de `select('*')`: a tela não usa created_at,
  // created_by nem updated_at, e cada lote de 1000 linhas vira payload.
  const clientes = await buscarTudo<Cliente>((opcoes, de, ate) =>
    supabase
      .from('clientes')
      .select(
        'id, consultor_nome, seller_id, seller_nome, seller_telefone, seller_email, doc_tipo, cpf_cnpj, cidade, bairro, endereco_completo, lat, lng, status_atualizacao',
        opcoes,
      )
      .order('seller_nome', { ascending: true })
      .range(de, ate),
  )

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
