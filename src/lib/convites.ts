import { createHash, randomBytes } from 'node:crypto'

/**
 * Convite de acesso — a parte pura, sem banco e sem rede, para poder ser
 * testada sozinha (`convites.test.mjs`).
 *
 * O par token/hash é o coração da coisa: o link que o gestor manda no WhatsApp
 * carrega o token em claro, e o banco guarda só o hash. Ver a migration
 * `2026-07-29_convites_acesso.sql` para o porquê.
 */

/** Dias de validade quando o gestor não escolhe outro prazo. */
export const DIAS_VALIDADE_PADRAO = 7

/** Piso de senha no aceite. Espelha o `minLength` do formulário de usuários. */
export const SENHA_MIN = 8

export interface ConviteEstado {
  expira_em: string
  usado_em: string | null
  revogado_em: string | null
}

export type EstadoConvite = 'valido' | 'revogado' | 'usado' | 'expirado'

/**
 * Token do link: 32 bytes de aleatoriedade criptográfica em base64url.
 *
 * base64url e não hex porque cabe em 43 caracteres em vez de 64 — o link vai
 * por WhatsApp, onde uma URL curta é menos provável de quebrar de linha. E não
 * leva `+`, `/` nem `=`, que precisariam de escape na URL.
 */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url')
}

/** sha256 em hex. É isto (e nunca o token) que vai para o banco. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Por que um convite não serve mais.
 *
 * A ordem importa e não é alfabética: revogado vence usado, que vence
 * expirado. Um link que o gestor revogou deve dizer "revogado" mesmo que já
 * tivesse expirado — senão a tela sugere "gere outro que dá certo" quando a
 * intenção foi justamente cortar o acesso.
 */
export function estadoDoConvite(c: ConviteEstado, agora: Date = new Date()): EstadoConvite {
  if (c.revogado_em) return 'revogado'
  if (c.usado_em) return 'usado'
  if (new Date(c.expira_em).getTime() <= agora.getTime()) return 'expirado'
  return 'valido'
}

export const MOTIVO: Record<Exclude<EstadoConvite, 'valido'>, string> = {
  revogado: 'Este link foi cancelado por quem o gerou.',
  usado:    'Este link já foi usado. Se você perdeu o acesso, peça um novo.',
  expirado: 'Este link expirou. Peça um novo para quem cuida do painel.',
}

/** Data de expiração a partir de agora. */
export function expiraEm(dias: number, agora: Date = new Date()): Date {
  return new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000)
}

/**
 * Mesma normalização de `cliente_e_meu()` no Postgres (lower + unaccent +
 * trim). Serve para casar o nome da planilha com o de um profile existente sem
 * tropeçar em acento ou caixa — que é exatamente o erro que o convite existe
 * para evitar.
 */
export function normalizarNome(nome: string): string {
  // NFD separa "á" em "a" + acento; \p{Mn} (Mark, nonspacing) é a classe desses
  // acentos soltos. Usa a propriedade Unicode em vez do range numérico porque
  // aquele range, escrito literalmente, são caracteres INVISÍVEIS no arquivo —
  // um merge ou um editor distraído os come e a função passa a não normalizar
  // nada, calada.
  return nome.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim()
}

/** Validação de e-mail suficiente para formulário; a verdade é do Supabase. */
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}
