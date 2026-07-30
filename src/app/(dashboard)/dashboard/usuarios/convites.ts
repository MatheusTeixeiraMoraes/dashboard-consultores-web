'use server'

import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { escritaBloqueadaPeloDemo, MSG_BLOQUEIO_DEMO } from '@/lib/demo/guarda'
import { canManageUsers } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { gerarToken, hashToken, expiraEm, normalizarNome, DIAS_VALIDADE_PADRAO } from '@/lib/convites'
import type { Profile, UserRole } from '@/lib/types'

/** Um consultor como as PLANILHAS o conhecem — a lista de onde sai o convite. */
export interface ConsultorPlanilha {
  nome: string
  id_carteira: string | null
  temUsuario: boolean
  carteiraRepetida: boolean
  qtdClientes: number
}

/**
 * Monta a lista de consultores das planilhas, SOB DEMANDA.
 *
 * Isto varre a tabela de clientes inteira (~3,9 mil linhas) e a de scores, e
 * por isso NÃO mora mais no carregamento da página: quando morava, a tela de
 * Usuários pagava ~3s e chegou a estourar `statement timeout` do Postgres sob
 * concorrência. Só quem clica em "Gerar link de acesso" precisa da lista, e aí
 * a espera tem contexto.
 *
 * (A alternativa seria agregar no banco, mas a agregação do PostgREST está
 * desligada neste projeto — `select=consultor_nome,count()` responde 400.)
 */
export async function listarConsultoresDaPlanilha(): Promise<{
  ok: boolean; error?: string; consultores?: ConsultorPlanilha[]
}> {
  try {
    const me = await getProfile()
    if (!me || (me.role !== 'admin' && me.role !== 'dono')) {
      return { ok: false, error: 'Sem permissão' }
    }

    const supabase = await createClient()

    // O score é a fonte boa: única que traz nome E id_carteira na mesma linha.
    // `clientes` entra por cima para quem tem carteira de campo mas ainda não
    // pontuou — esse fica sem id_carteira, e a tela avisa.
    const doScore = await buscarTudo<{ consultor_nome: string; id_carteira: string }>(
      (opcoes, de, ate) =>
        supabase.from('score_consultor_resultados').select('consultor_nome, id_carteira', opcoes).range(de, ate),
    )
    const dosClientes = await buscarTudo<{ consultor_nome: string }>((opcoes, de, ate) =>
      supabase.from('clientes').select('consultor_nome', opcoes).range(de, ate),
    )
    const { data: perfis } = await supabase.from('profiles').select('nome')

    const porChave = new Map<string, { nome: string; id_carteira: string | null }>()
    for (const s of doScore) {
      const chave = normalizarNome(s.consultor_nome)
      if (chave && !porChave.has(chave)) porChave.set(chave, { nome: s.consultor_nome, id_carteira: s.id_carteira ?? null })
    }
    const clientesPorNome = new Map<string, number>()
    for (const c of dosClientes) {
      const chave = normalizarNome(c.consultor_nome)
      if (!chave) continue
      clientesPorNome.set(chave, (clientesPorNome.get(chave) ?? 0) + 1)
      if (!porChave.has(chave)) porChave.set(chave, { nome: c.consultor_nome, id_carteira: null })
    }

    // Duas grafias com a MESMA carteira são a mesma pessoa escrita de dois
    // jeitos (existe caso real na base). Não dá para adivinhar a boa: as duas
    // aparecem marcadas e quem gera o link decide.
    const contagemCarteira = new Map<string, number>()
    for (const { id_carteira } of porChave.values()) {
      if (id_carteira) contagemCarteira.set(id_carteira, (contagemCarteira.get(id_carteira) ?? 0) + 1)
    }

    const comUsuario = new Set((perfis ?? []).map((p: Pick<Profile, 'nome'>) => normalizarNome(p.nome)).filter(Boolean))

    const consultores = [...porChave.entries()]
      .map(([chave, v]) => ({
        nome: v.nome,
        id_carteira: v.id_carteira,
        temUsuario: comUsuario.has(chave),
        carteiraRepetida: !!v.id_carteira && (contagemCarteira.get(v.id_carteira) ?? 0) > 1,
        qtdClientes: clientesPorNome.get(chave) ?? 0,
      }))
      // Quem ainda não tem acesso primeiro: é o motivo de a tela existir.
      .sort((a, b) => Number(a.temUsuario) - Number(b.temUsuario) || a.nome.localeCompare(b.nome))

    return { ok: true, consultores }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}

/**
 * Gera o link de acesso de um consultor.
 *
 * O token volta EM CLARO nesta resposta e em nenhum outro lugar — o banco fica
 * só com o sha256. Se o gestor fechar a janela sem copiar, não há como
 * recuperar: tem que gerar outro. É o preço de não guardar o segredo.
 */
export async function gerarLinkAcesso(dados: {
  consultor_nome: string
  id_carteira: string | null
  role: UserRole
  dias?: number
}): Promise<{ ok: boolean; error?: string; token?: string; expira_em?: string }> {
  try {
    const me = await getProfile()
    if (!me || !canManageUsers(me.role, dados.role)) {
      return { ok: false, error: 'Sem permissão para dar acesso a esse cargo' }
    }

    // Mesma ordem das outras ações desta tela: papel primeiro, demo logo depois.
    // Um convite gerado durante a demonstração criaria usuário DE VERDADE ao ser
    // aceito — o modo demo troca a fonte de leitura, não o service_role.
    if (await escritaBloqueadaPeloDemo()) return { ok: false, error: MSG_BLOQUEIO_DEMO }

    const nome = dados.consultor_nome.trim()
    if (!nome) return { ok: false, error: 'Escolha o consultor' }

    // Teto de 30 dias: link de acesso é para ser usado hoje ou amanhã. Quanto
    // mais tempo no ar, mais chance de circular em conversa encaminhada.
    const dias = Math.min(Math.max(Math.trunc(dados.dias ?? DIAS_VALIDADE_PADRAO), 1), 30)
    const token = gerarToken()
    const validade = expiraEm(dias)

    // service_role: a tela é de admin/dono (já conferido acima), mas quem grava
    // é o servidor — assim a policy de insert não depende do cliente.
    const admin = createAdminClient()
    const { error } = await admin.from('convites_acesso').insert({
      token_hash: hashToken(token),
      consultor_nome: nome,
      id_carteira: dados.id_carteira?.trim() || null,
      role: dados.role,
      criado_por: me.id,
      expira_em: validade.toISOString(),
    })

    if (error) return { ok: false, error: error.message }

    revalidatePath('/dashboard/usuarios')
    return { ok: true, token, expira_em: validade.toISOString() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}

/** Corta um link que ainda não foi usado (ou que foi para a pessoa errada). */
export async function revogarLink(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const me = await getProfile()
    if (!me || (me.role !== 'admin' && me.role !== 'dono')) {
      return { ok: false, error: 'Sem permissão' }
    }
    if (await escritaBloqueadaPeloDemo()) return { ok: false, error: MSG_BLOQUEIO_DEMO }

    const admin = createAdminClient()
    // `revogado_em is null` deixa a ação idempotente: clicar duas vezes não
    // reescreve a data e não vira erro.
    const { error } = await admin
      .from('convites_acesso')
      .update({ revogado_em: new Date().toISOString() })
      .eq('id', id)
      .is('revogado_em', null)

    if (error) return { ok: false, error: error.message }

    revalidatePath('/dashboard/usuarios')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}
