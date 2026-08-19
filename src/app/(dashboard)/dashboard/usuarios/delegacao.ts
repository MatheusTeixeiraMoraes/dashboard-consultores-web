'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClientReal } from '@/lib/supabase/server-real'
import { createAdminClient } from '@/lib/supabase/admin'
import { perfilAutorizado } from '@/lib/demo/estado'
import { escritaBloqueadaPeloDemo, MSG_BLOQUEIO_DEMO } from '@/lib/demo/guarda'
import { canDelegateInto } from '@/lib/types'
import {
  COOKIE_DELEGACAO, COOKIE_DELEGACAO_SINAL, DELEGACAO_MAX_SEGUNDOS,
} from '@/lib/delegacao'
import type { DelegacaoOrigem } from '@/lib/delegacao'
import type { UserRole } from '@/lib/types'
import { registrarEvento } from '@/lib/atividade'

const BASE_COOKIE = {
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: DELEGACAO_MAX_SEGUNDOS,
}
const COOKIE_SEGREDO = { ...BASE_COOKIE, httpOnly: true }
const COOKIE_SINAL = { ...BASE_COOKIE, httpOnly: false }

/** Apaga os dois cookies da delegação. Sempre juntos, ou a tela mente. */
async function limparCookies() {
  const c = await cookies()
  c.delete(COOKIE_DELEGACAO)
  c.delete(COOKIE_DELEGACAO_SINAL)
}

/**
 * Fecha, com service_role, a delegação aberta de um usuário.
 *
 * Fecha pelo par (quem é a sessão agora) + (ainda aberta) — NUNCA por um id
 * vindo do cookie. O id no cookie é escolhido por quem chama, e a gestão LÊ a
 * tabela inteira: fechar por ele deixaria qualquer pessoa carimbar
 * `encerrado_em` na linha de outro e apagar o próprio rastro.
 */
async function fecharAberta(campo: 'admin_id' | 'alvo_id', id: string) {
  await createAdminClient()
    .from('acessos_delegados')
    .update({ encerrado_em: new Date().toISOString() })
    .eq(campo, id)
    .is('encerrado_em', null)
}

/**
 * Abre o painel COMO outra pessoa.
 *
 * POR QUE TROCAR A SESSÃO DE VERDADE, e não só "fingir" outro perfil: as telas
 * não filtram por papel — elas confiam na RLS do Postgres, que decide a partir
 * do `auth.uid()` do token. Trocar só o objeto `Profile` no Next deixaria a
 * gestão vendo os 3.885 clientes com o nome do consultor no topo: uma mentira
 * pior que não ter a funcionalidade.
 */
export async function entrarNaConta(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  // `perfilAutorizado` (e não `perfilReal`): devolve null para quem está
  // desativado. Sem isso, um admin desligado continuaria entrando na conta dos
  // outros com a sessão que já tinha no navegador — o Supabase Auth não conhece
  // `ativo` e não derruba ninguém.
  const me = await perfilAutorizado()
  // Líder pode delegar (só pra dentro de consultor — checado abaixo por
  // `canDelegateInto`), mas continua sem alçada nenhuma sobre criar/editar/
  // excluir usuário: isso é outro gate (`canManageUsers`), em outro lugar.
  if (!me || (me.role !== 'admin' && me.role !== 'dono' && me.role !== 'lider')) {
    return { ok: false, error: 'Sem permissão' }
  }

  // Delegação aninhada é recusada. Sem isto, entrar numa segunda conta
  // SOBRESCREVE o cookie de origem: o caminho de volta para quem começou some,
  // a linha anterior da trilha nunca fecha, e o novo registro sai com o nome de
  // quem foi delegado, não de quem realmente agiu.
  const cookieStore = await cookies()
  if (cookieStore.get(COOKIE_DELEGACAO)) {
    return { ok: false, error: 'Você já está na conta de outra pessoa. Volte para a sua antes de entrar em outra.' }
  }

  if (await escritaBloqueadaPeloDemo()) return { ok: false, error: MSG_BLOQUEIO_DEMO }
  if (userId === me.id) return { ok: false, error: 'Você já está na sua conta' }

  const admin = createAdminClient()
  const { data: alvo } = await admin
    .from('profiles')
    .select('id, nome, role, ativo')
    .eq('id', userId)
    .maybeSingle()

  if (!alvo) return { ok: false, error: 'Usuário não encontrado' }

  // Mesma ideia do gate de hierarquia de `excluirUsuario` (um dono não entra
  // na conta de um admin), mas com a régua própria de delegação: líder só
  // entra em consultor, nunca em outro líder/admin/dono.
  if (!canDelegateInto(me.role, alvo.role as UserRole)) {
    return { ok: false, error: 'Sem permissão para entrar nesta conta' }
  }

  if (!alvo.ativo) {
    return { ok: false, error: 'Esta conta está desativada. Reative antes de entrar nela.' }
  }

  /* O E-MAIL VEM DE auth.users, NUNCA DE profiles.
   *
   * `generateLink` resolve o usuário POR E-MAIL. Como `profiles.email` é uma
   * coluna que a gestão pode editar (a policy "dono gerencia lider e consultor"
   * não restringe coluna), usar o e-mail de lá abria uma escalada limpa: o dono
   * trocava o e-mail de um consultor para o e-mail do admin, clicava em "entrar
   * na conta" desse consultor — o gate passava, porque o PAPEL conferido era o
   * do consultor — e recebia a sessão do ADMIN. Autorizar por um id e abrir a
   * sessão por outro campo é a mesma classe de furo do convite. */
  const { data: authUser, error: erroAuth } = await admin.auth.admin.getUserById(userId)
  const emailReal = authUser?.user?.email
  if (erroAuth || !emailReal) {
    return { ok: false, error: 'Não foi possível abrir a sessão desta conta' }
  }

  const supabase = await createClientReal()
  const { data: { session: minhaSessao } } = await supabase.auth.getSession()
  if (!minhaSessao) return { ok: false, error: 'Sua sessão expirou. Entre de novo.' }

  const { data: link, error: erroLink } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: emailReal,
  })
  const hash = link?.properties?.hashed_token
  if (erroLink || !hash) {
    return { ok: false, error: erroLink?.message ?? 'Não foi possível abrir a sessão desta conta' }
  }

  // Cinto e suspensório: confere que o link voltou para o MESMO id que passou
  // pelo gate, antes de consumi-lo. Se um dia o e-mail deixar de ser único ou
  // alguém trocar a forma de resolver o usuário, isto para o ataque aqui.
  if (link?.user?.id !== userId) {
    return { ok: false, error: 'Não foi possível abrir a sessão desta conta' }
  }

  await fecharAberta('admin_id', me.id)

  const { data: registro } = await admin
    .from('acessos_delegados')
    .insert({
      admin_id: me.id, admin_nome: me.nome, admin_email: me.email,
      alvo_id: alvo.id, alvo_nome: alvo.nome, alvo_email: emailReal,
    })
    .select('id')
    .single()

  registrarEvento({
    tipo: 'delegacao_iniciada',
    alvoTipo: 'usuario',
    alvoId: alvo.id,
    alvoDescricao: alvo.nome,
    atorOverride: { id: me.id, nome: me.nome || me.email, email: me.email },
  })

  // Guarda a volta ANTES de trocar a sessão: depois do verifyOtp os cookies já
  // são do alvo e a sessão do admin não estaria mais ao alcance.
  const origem: DelegacaoOrigem = {
    access_token: minhaSessao.access_token,
    refresh_token: minhaSessao.refresh_token,
    admin_id: me.id,
    admin_nome: me.nome || me.email,
    admin_email: me.email,
    alvo_id: alvo.id,
    registro_id: registro?.id ?? '',
    expira_em: Date.now() + DELEGACAO_MAX_SEGUNDOS * 1000,
  }
  cookieStore.set(COOKIE_DELEGACAO, JSON.stringify(origem), COOKIE_SEGREDO)
  cookieStore.set(COOKIE_DELEGACAO_SINAL, registro?.id ?? '1', COOKIE_SINAL)

  const { error: erroOtp } = await supabase.auth.verifyOtp({ token_hash: hash, type: 'email' })
  if (erroOtp) {
    await limparCookies()
    if (registro?.id) await fecharAberta('admin_id', me.id)
    return { ok: false, error: erroOtp.message }
  }

  redirect('/dashboard')
}

/**
 * Volta para a própria conta.
 *
 * Esta função NÃO confia no cookie. Ele diz o que restaurar, e a sessão de
 * verdade diz se aquilo é legítimo — a ordem importa, porque o cookie é
 * forjável (httpOnly não impede o navegador de CRIAR um que não existe) e aqui
 * dentro se escreve com service_role.
 */
export async function voltarParaMinhaConta(): Promise<{ ok: boolean; error?: string }> {
  const cookieStore = await cookies()
  const bruto = cookieStore.get(COOKIE_DELEGACAO)?.value
  const supabase = await createClientReal()

  // Quem está logado AGORA. É a única fonte confiável desta função.
  const { data: { user } } = await supabase.auth.getUser()

  const desistir = async () => {
    if (user) await fecharAberta('alvo_id', user.id)
    await limparCookies()
    await supabase.auth.signOut()
    redirect('/login')
  }

  if (!bruto || !user) return desistir()

  let origem: DelegacaoOrigem
  try {
    origem = JSON.parse(bruto) as DelegacaoOrigem
  } catch {
    return desistir()
  }

  /* OS TRÊS PORTÕES.
   *
   * 1. A sessão atual TEM que ser a do alvo registrado. Fecha o pior cenário
   *    desta feature: a gestão entra na conta de alguém, sai pelo "Sair" normal
   *    (que é client-side e não apaga cookie httpOnly), e o próximo a logar
   *    naquele navegador — o próprio consultor, por exemplo — clicaria em
   *    "voltar" e receberia a sessão do admin.
   * 2. Prazo conferido pelo PAYLOAD, não pelo maxAge do cookie: o navegador
   *    pode mandar um cookie forjado sem prazo nenhum.
   * 3. Quem delegou tem que continuar podendo. Se o admin foi desativado no
   *    meio, a volta não pode ressuscitar o acesso dele. */
  if (user.id !== origem.alvo_id) return desistir()
  if (!origem.expira_em || Date.now() > origem.expira_em) return desistir()

  // Fecha a trilha pelo dono da SESSÃO, nunca pelo registro_id do cookie.
  await fecharAberta('alvo_id', user.id)

  registrarEvento({
    tipo: 'delegacao_encerrada',
    alvoTipo: 'usuario',
    alvoId: origem.alvo_id,
    alvoDescricao: user.email ?? origem.alvo_id,
    atorOverride: { id: origem.admin_id, nome: origem.admin_nome, email: origem.admin_email },
  })

  // Revoga a sessão criada para o alvo. Sem isto, quem delegou podia copiar os
  // cookies `sb-*` antes de voltar e ficar com um refresh token permanente
  // daquela pessoa — e o teto de 2 horas viraria enfeite. Escopo 'local' derruba
  // só esta sessão, não as outras do consultor.
  const { data: { session: sessaoAlvo } } = await supabase.auth.getSession()

  const { error } = await supabase.auth.setSession({
    access_token: origem.access_token,
    refresh_token: origem.refresh_token,
  })
  await limparCookies()

  if (error) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  if (sessaoAlvo?.access_token) {
    try {
      await createAdminClient().auth.admin.signOut(sessaoAlvo.access_token, 'local')
    } catch {
      // Se a revogação falhar, a volta já aconteceu — não vale derrubar o
      // fluxo. A sessão do alvo expira sozinha.
    }
  }

  redirect('/dashboard/usuarios')
}

/**
 * Sair do sistema, encerrando a delegação se houver uma.
 *
 * O "Sair" da Topbar é client-side: ele apaga os cookies `sb-*` mas NÃO alcança
 * o cookie httpOnly da delegação, e nunca fecha a linha da trilha. Resultado
 * sem isto: cookie órfão de credencial de admin no navegador e um registro de
 * auditoria "em curso" para sempre.
 */
export async function sairEncerrandoDelegacao(): Promise<void> {
  const supabase = await createClientReal()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await fecharAberta('alvo_id', user.id)

    // Lê o cookie ANTES de limpar, só pra saber quem era o admin que delegou
    // (mesmo raciocínio de voltarParaMinhaConta: a sessão atual é do alvo,
    // não de quem começou a delegação).
    const bruto = (await cookies()).get(COOKIE_DELEGACAO)?.value
    if (bruto) {
      try {
        const origem = JSON.parse(bruto) as DelegacaoOrigem
        registrarEvento({
          tipo: 'delegacao_encerrada',
          alvoTipo: 'usuario',
          alvoId: user.id,
          alvoDescricao: user.email ?? user.id,
          detalhes: { via: 'sair' },
          atorOverride: { id: origem.admin_id, nome: origem.admin_nome, email: origem.admin_email },
        })
      } catch {
        // cookie corrompido — sem trilha de quem delegou, não força o log.
      }
    }
  }
  await limparCookies()
  await supabase.auth.signOut()
  redirect('/login')
}
