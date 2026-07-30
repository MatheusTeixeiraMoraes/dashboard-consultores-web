/**
 * "Entrar na conta de" — a parte neutra, sem `next/headers` e sem Supabase,
 * para poder ser importada tanto pelo servidor quanto por componente de tela
 * (o mesmo motivo de `lib/demo/cookie.ts` existir).
 */

/**
 * Guarda a sessão de quem DELEGOU, para o botão "voltar" existir.
 *
 * httpOnly de verdade: aqui dentro vai o refresh token do admin, que é
 * credencial de longa duração. Diferente do cookie do modo demo — aquele é
 * legível pelo navegador porque não autoriza nada; este é a chave de volta.
 *
 * ATENÇÃO, e isto custou uma revisão inteira para aparecer: httpOnly impede o
 * JS de LER e de SOBRESCREVER um cookie existente, mas NÃO impede o navegador
 * de CRIAR um cookie com esse nome quando ele não existe. Logo, este cookie
 * nunca pode ser tratado como autoridade — quem restaura só confia nele depois
 * de conferir, contra a sessão de verdade, que o usuário logado agora é
 * exatamente o alvo registrado aqui dentro.
 */
export const COOKIE_DELEGACAO = 'delegacao_origem'

/**
 * Sinal legível pelo navegador de que há delegação em curso. Não carrega token
 * nenhum — é só um id.
 *
 * Existe pelo motivo documentado em `lib/demo/cookie.ts`: layout do App Router
 * NÃO re-renderiza em navegação client-side. Com duas abas abertas, a aba
 * antiga continua exibindo a casca do admin enquanto a sessão do navegador
 * inteiro já é a do alvo — ou seja, a barra de aviso some justamente quando
 * mais importa. A tela lê este sinal na hora e se corrige.
 */
export const COOKIE_DELEGACAO_SINAL = 'delegacao_ativa'

export interface DelegacaoOrigem {
  /** Sessão do admin, para restaurar quando ele voltar. */
  access_token: string
  refresh_token: string
  /** Quem delegou — é o que a barra mostra, já que o perfil da vez é o do alvo. */
  admin_id: string
  admin_nome: string
  admin_email: string
  /** Em cuja conta ele entrou. É contra ISTO que o retorno se valida. */
  alvo_id: string
  /** Linha de `acessos_delegados` a fechar no retorno. */
  registro_id: string
  /** Epoch ms. O prazo mora no PAYLOAD, não só no maxAge do cookie. */
  expira_em: number
}

/**
 * Teto de duração da delegação.
 *
 * Não é conforto: enquanto ela dura, tudo o que a gestão escreve fica gravado
 * no nome do consultor. Duas horas cobrem com folga "olhar o que ele está
 * vendo".
 *
 * O prazo é gravado DENTRO do payload além do maxAge do cookie, porque expirar
 * o cookie sozinho não encerra nada: a sessão do alvo instalada pelo magiclink
 * tem vida própria: o que sumiria é a barra de aviso e o botão de voltar,
 * deixando a gestão escrevendo no nome do consultor sem nenhum sinal na tela.
 */
export const DELEGACAO_MAX_SEGUNDOS = 2 * 60 * 60

/** Há delegação em curso, segundo o navegador? Devolve o id do registro. */
export function delegacaoNoCookie(): string | null {
  if (typeof document === 'undefined') return null
  const parte = document.cookie.split(';').find(p => p.trim().startsWith(`${COOKIE_DELEGACAO_SINAL}=`))
  return parte ? decodeURIComponent(parte.split('=')[1] ?? '') || null : null
}
