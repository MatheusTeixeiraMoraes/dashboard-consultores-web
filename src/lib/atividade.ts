'use server'

import { getProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { DELEGACAO_MAX_SEGUNDOS } from '@/lib/delegacao'

/** Postgres: coluna inexistente. PGRST204: o mesmo, visto pelo cache do PostgREST. */
const COLUNA_AUSENTE = ['42703', 'PGRST204']

/**
 * Quem está DENTRO da conta desta pessoa agora, se houver alguém.
 *
 * A fonte é `acessos_delegados` — tabela que só o servidor escreve, com
 * service_role, dentro de `entrarNaConta`. NÃO é o cookie `delegacao_origem`:
 * httpOnly impede o JS de ler e de sobrescrever, mas NÃO impede o navegador de
 * CRIAR um cookie com aquele nome (documentado em `lib/delegacao.ts`). Carimbar
 * o log pelo cookie deixaria qualquer consultor forjar "via <um admin>" nas
 * próprias ações, e log falsificável é pior que log nenhum.
 *
 * O corte por `iniciado_em` existe porque a linha só fecha quando a pessoa
 * clica em "voltar": quem apenas fecha o navegador deixa a delegação aberta
 * para sempre, e sem o corte TODO evento futuro daquele consultor sairia
 * marcado como se a gestão estivesse dentro. O teto é o mesmo da própria
 * delegação (2h), que é quando ela deixa de valer de qualquer forma.
 */
async function delegacaoAbertaSobre(alvoId: string) {
  const desde = new Date(Date.now() - DELEGACAO_MAX_SEGUNDOS * 1000).toISOString()
  const { data } = await createAdminClient()
    .from('acessos_delegados')
    .select('admin_id, admin_nome, admin_email')
    .eq('alvo_id', alvoId)
    .is('encerrado_em', null)
    .gte('iniciado_em', desde)
    .order('iniciado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

/**
 * Grava uma linha no log de atividade (`eventos_atividade`), pra
 * administradores enxergarem quem fez o quê e quando.
 *
 * O ATOR é sempre resolvido AQUI, no servidor, via `getProfile()` — nunca
 * aceita nome/id vindo de quem chama. Mesma razão de segurança já
 * documentada em `entrarNaConta` (usuarios/delegacao.ts): autorizar por um
 * campo e gravar por outro é como se forjava convite de admin antes.
 *
 * Um componente cliente pode chamar isto direto (é uma server action —
 * `'use server'` no topo do arquivo já cobre o arquivo inteiro), ou código
 * de servidor pode importar e chamar como função normal.
 *
 * NUNCA lança: um log que falha não pode derrubar a ação real por trás dele
 * (editar cliente tem que funcionar mesmo se o log falhar). Erro vira
 * `console.error` e para — evento perdido é aceitável, ação bloqueada não.
 */
export async function registrarEvento(input: {
  tipo: string
  alvoTipo?: string
  alvoId?: string
  alvoDescricao?: string
  detalhes?: Record<string, unknown>
  /**
   * SÓ pra durante uma delegação ("entrar na conta de"): ali a sessão atual
   * fica ambígua entre admin e alvo no meio da troca, então `getProfile()`
   * sozinho atribuiria o evento a quem não devia. Use isto SÓ quando quem
   * chama já validou a identidade no servidor um passo antes (mesmo
   * raciocínio de `acessos_delegados` guardar admin_id/nome/email direto,
   * não derivado da sessão no instante da escrita) — nunca com dado vindo
   * do cliente.
   */
  atorOverride?: { id: string; nome: string; email: string }
}): Promise<void> {
  try {
    const ator = input.atorOverride ?? await getProfile()
    if (!ator) return   // sem sessão, não há o que atribuir — silencioso de propósito

    /* Com `atorOverride` não se pergunta: são os eventos da PRÓPRIA delegação
     * (entrar/voltar), onde o ator já é a gestão e "via gestão" seria redundante
     * — pior, o de encerramento sairia carimbado por uma linha que ele mesmo
     * acabou de fechar. */
    const via = input.atorOverride ? null : await delegacaoAbertaSobre(ator.id)

    const linha = {
      tipo: input.tipo,
      ator_id: ator.id,
      ator_nome: ator.nome || ator.email,
      ator_email: ator.email,
      alvo_tipo: input.alvoTipo ?? null,
      alvo_id: input.alvoId ?? null,
      alvo_descricao: input.alvoDescricao ?? null,
      detalhes: input.detalhes ?? null,
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from('eventos_atividade').insert({
      ...linha,
      delegado_por_id: via?.admin_id ?? null,
      delegado_por_nome: via?.admin_nome ?? null,
      delegado_por_email: via?.admin_email ?? null,
    })

    /* As colunas chegam por migration rodada à mão no SQL Editor. Enquanto ela
     * não roda, insistir nelas derrubaria o log INTEIRO — inclusive os eventos
     * que nada têm a ver com delegação. Então: tenta com o carimbo e, se o banco
     * disser que a coluna não existe, regrava sem ele. Mesmo padrão do retry de
     * `rotas.origem` na Agenda. */
    if (error && COLUNA_AUSENTE.includes(error.code)) {
      await supabase.from('eventos_atividade').insert(linha)
      return
    }
    if (error) throw error
  } catch (err) {
    console.error(`[atividade] falha ao registrar evento "${input.tipo}":`, err)
  }
}
