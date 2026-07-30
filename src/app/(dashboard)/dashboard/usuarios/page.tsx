import { getProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { normalizarNome } from '@/lib/convites'
import { redirect } from 'next/navigation'
import UsuariosClient from './UsuariosClient'
import type { Profile } from '@/lib/types'

/** Um consultor como as PLANILHAS o conhecem — a lista de onde sai o convite. */
export interface ConsultorPlanilha {
  nome: string
  id_carteira: string | null
  /** Já existe profile com este nome (comparado como a RLS compara). */
  temUsuario: boolean
  /** Outra grafia divide o mesmo id_carteira — provável duplicata na planilha. */
  carteiraRepetida: boolean
}

export interface ConviteLinha {
  id: string
  consultor_nome: string
  id_carteira: string | null
  criado_em: string
  expira_em: string
  usado_em: string | null
  revogado_em: string | null
}

export default async function UsuariosPage() {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'dono')) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').order('nome')

  // Dono não vê admins
  const usuarios = (data as Profile[]).filter(u =>
    profile.role === 'admin' ? true : u.role !== 'admin'
  )

  // ── de onde vem a lista do convite ───────────────────────────────────
  // O score é a fonte boa: é a única que traz nome E id_carteira na mesma
  // linha, e as duas chaves precisam estar certas para o consultor ver algo.
  // `clientes` entra por cima porque um consultor pode ter carteira de campo
  // sem ainda ter aparecido numa planilha de pontuação — esse fica sem
  // id_carteira, e a tela avisa.
  const doScore = await buscarTudo<{ consultor_nome: string; id_carteira: string }>(
    (opcoes, de, ate) =>
      supabase
        .from('score_consultor_resultados')
        .select('consultor_nome, id_carteira', opcoes)
        .range(de, ate),
  )
  const dosClientes = await buscarTudo<{ consultor_nome: string }>((opcoes, de, ate) =>
    supabase.from('clientes').select('consultor_nome', opcoes).range(de, ate),
  )

  const porChave = new Map<string, { nome: string; id_carteira: string | null }>()
  for (const s of doScore) {
    const chave = normalizarNome(s.consultor_nome)
    if (chave && !porChave.has(chave)) {
      porChave.set(chave, { nome: s.consultor_nome, id_carteira: s.id_carteira ?? null })
    }
  }
  for (const c of dosClientes) {
    const chave = normalizarNome(c.consultor_nome)
    if (chave && !porChave.has(chave)) {
      porChave.set(chave, { nome: c.consultor_nome, id_carteira: null })
    }
  }

  // Duas grafias com a MESMA carteira são a mesma pessoa escrita de dois
  // jeitos na planilha (existe pelo menos um caso real na base). Não dá para
  // adivinhar qual é a boa, então as duas aparecem marcadas e quem gera o link
  // decide.
  const contagemCarteira = new Map<string, number>()
  for (const { id_carteira } of porChave.values()) {
    if (id_carteira) contagemCarteira.set(id_carteira, (contagemCarteira.get(id_carteira) ?? 0) + 1)
  }

  const nomesComUsuario = new Set(usuarios.map(u => normalizarNome(u.nome)).filter(Boolean))

  const consultores: ConsultorPlanilha[] = [...porChave.entries()]
    .map(([chave, v]) => ({
      nome: v.nome,
      id_carteira: v.id_carteira,
      temUsuario: nomesComUsuario.has(chave),
      carteiraRepetida: !!v.id_carteira && (contagemCarteira.get(v.id_carteira) ?? 0) > 1,
    }))
    .sort((a, b) =>
      // Quem ainda não tem acesso primeiro: é o motivo de a tela existir.
      Number(a.temUsuario) - Number(b.temUsuario) || a.nome.localeCompare(b.nome),
    )

  const { data: convites } = await supabase
    .from('convites_acesso')
    .select('id, consultor_nome, id_carteira, criado_em, expira_em, usado_em, revogado_em')
    .order('criado_em', { ascending: false })
    .limit(50)

  return (
    <UsuariosClient
      usuarios={usuarios}
      myRole={profile.role}
      myId={profile.id}
      consultores={consultores}
      convites={(convites ?? []) as ConviteLinha[]}
    />
  )
}
