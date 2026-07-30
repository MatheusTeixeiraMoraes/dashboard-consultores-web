'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { canManageUsers } from '@/lib/types'
import type { UserRole } from '@/lib/types'
import {
  hashToken, estadoDoConvite, MOTIVO, emailValido, normalizarNome, SENHA_MIN,
} from '@/lib/convites'

/**
 * Aceite do convite. Rota PÚBLICA: roda sem sessão, para quem só tem o link.
 *
 * Por isso tudo aqui é paranoico. As regras que não podem cair:
 *
 *  1. `nome`, `id_carteira` e `role` vêm SEMPRE do convite, nunca do formulário.
 *     Se viessem do cliente, qualquer um com um link de consultor se cadastraria
 *     como admin.
 *  2. O convite é reservado com UPDATE condicional antes de mexer em usuário —
 *     é o que impede dois aceites simultâneos do mesmo link.
 *  3. E-mail já cadastrado só passa se a conta for DA MESMA PESSOA do convite
 *     (nome normalizado igual). Sem isso, qualquer um com um link digitaria o
 *     e-mail do admin e trocaria a senha dele.
 *  4. E — porque a regra 3 sozinha não segura — quem EMITIU o convite precisa
 *     ter alçada sobre o papel da conta alvo. O `consultor_nome` é escolhido na
 *     emissão, então a regra 3 é contornável por quem emite: bastava escrever
 *     ali o nome exato do admin. Confirmado em produção: um dono tomava a conta
 *     de um admin (senha trocada + rebaixado a consultor) com um convite de
 *     consultor legítimo. Nome não é identidade; alçada é.
 */
export async function aceitarConvite(dados: {
  token: string
  email: string
  senha: string
}): Promise<{ ok: boolean; error?: string; email?: string }> {
  try {
    const email = dados.email.trim().toLowerCase()
    if (!emailValido(email)) return { ok: false, error: 'E-mail inválido' }
    if (!dados.senha || dados.senha.length < SENHA_MIN) {
      return { ok: false, error: `A senha precisa de pelo menos ${SENHA_MIN} caracteres` }
    }

    const admin = createAdminClient()

    const { data: convite } = await admin
      .from('convites_acesso')
      .select('*')
      .eq('token_hash', hashToken(dados.token))
      .maybeSingle()

    // Mensagem idêntica para "não existe" e "token errado": dizer qual dos dois
    // seria um oráculo para quem estivesse tentando adivinhar token.
    if (!convite) return { ok: false, error: 'Link inválido.' }

    const estado = estadoDoConvite(convite)
    if (estado !== 'valido') return { ok: false, error: MOTIVO[estado] }

    // Já existe conta com este e-mail? A busca é em `profiles` (nossa tabela) e
    // não em auth.users porque a API admin não expõe busca por e-mail.
    const { data: existente } = await admin
      .from('profiles')
      .select('id, nome, role')
      .eq('email', email)
      .maybeSingle()

    if (existente) {
      // PRIMEIRA trava: o nome tem que bater. Sozinha ela NÃO basta, e por um
      // motivo que custou caro descobrir: `consultor_nome` é texto livre na
      // emissão do convite. Quem emite escolhe o nome, então escrever ali o
      // nome exato de um admin fazia esta comparação passar — e o aceite
      // trocava a senha do admin e o rebaixava. Um dono tomava a conta do admin
      // com um convite de consultor perfeitamente legítimo.
      if (normalizarNome(existente.nome) !== normalizarNome(convite.consultor_nome)) {
        return {
          ok: false,
          error: 'Este e-mail já pertence a outra conta. Use um e-mail seu ou peça ajuda a quem cuida do painel.',
        }
      }

      // SEGUNDA trava, a que fecha de verdade: quem emitiu o convite precisa
      // ter alçada sobre o PAPEL DA CONTA ALVO — não sobre o papel escrito no
      // convite. É a mesma checagem que `excluirUsuario` já fazia; aqui ela
      // faltava, embora o papel do alvo estivesse na mão desde a consulta acima.
      //
      // Convite órfão (quem emitiu saiu do sistema, `criado_por` virou null)
      // é recusado de propósito: sem saber a alçada de origem, o seguro é não
      // deixar mexer numa conta que já existe.
      const { data: emissor } = convite.criado_por
        ? await admin.from('profiles').select('role').eq('id', convite.criado_por).maybeSingle()
        : { data: null }

      if (!emissor || !canManageUsers(emissor.role as UserRole, existente.role as UserRole)) {
        return {
          ok: false,
          error: 'Este link não pode redefinir o acesso desta conta. Peça a um administrador.',
        }
      }
    }

    // RESERVA. O `is('usado_em', null)` é a trava de concorrência: se dois
    // aceites chegarem juntos, só um afeta linha. Reservamos ANTES de tocar em
    // auth.users e devolvemos a reserva se algo falhar depois — o contrário
    // (criar primeiro) deixaria conta criada com convite ainda aberto.
    const { data: reserva } = await admin
      .from('convites_acesso')
      .update({ usado_em: new Date().toISOString() })
      .eq('id', convite.id)
      .is('usado_em', null)
      .select('id')
      .maybeSingle()

    if (!reserva) return { ok: false, error: MOTIVO.usado }

    const devolverReserva = async () => {
      await admin.from('convites_acesso').update({ usado_em: null }).eq('id', convite.id)
    }

    let userId: string

    if (existente) {
      // Mesma pessoa: o link vale como "redefinir senha".
      const { error } = await admin.auth.admin.updateUserById(existente.id, { password: dados.senha })
      if (error) { await devolverReserva(); return { ok: false, error: error.message } }
      userId = existente.id
    } else {
      const { data: novo, error } = await admin.auth.admin.createUser({
        email,
        password: dados.senha,
        email_confirm: true,
      })
      if (error || !novo?.user) {
        await devolverReserva()
        return { ok: false, error: error?.message ?? 'Não foi possível criar o acesso' }
      }
      userId = novo.user.id
    }

    // O par nome+carteira do CONVITE é o que faz a RLS casar as linhas do
    // consultor. É a razão de existir desta feature — não venha do formulário.
    //
    // `ativo` só vai no cadastro NOVO. Numa conta que já existe, mandar
    // `ativo: true` aqui seria uma porta de reativação silenciosa: quem teve o
    // acesso cortado voltaria a entrar assim que alguém gerasse um link para o
    // mesmo nome, sem ninguém decidir isso. Reativar é ato explícito, na tela
    // de Usuários.
    const { error: profErr } = await admin.from('profiles').upsert({
      id: userId,
      nome: convite.consultor_nome,
      email,
      role: convite.role,
      id_carteira: convite.id_carteira,
      ...(existente ? {} : { ativo: true }),
    })

    if (profErr) {
      // Conta sem profile loga e não é nada. Só desfaz a conta se ela nasceu
      // agora: apagar um usuário preexistente por causa de um convite seria
      // destruir o que já funcionava.
      if (!existente) await admin.auth.admin.deleteUser(userId)
      await devolverReserva()
      // 23505 = o índice único de nome de consultor. O erro cru do Postgres não
      // pode vazar nesta tela, que é pública.
      return {
        ok: false,
        error: profErr.code === '23505'
          ? 'Já existe um consultor com este nome no painel. Avise quem enviou o link.'
          : profErr.message,
      }
    }

    await admin.from('convites_acesso').update({ usado_por: userId }).eq('id', convite.id)

    return { ok: true, email }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}
