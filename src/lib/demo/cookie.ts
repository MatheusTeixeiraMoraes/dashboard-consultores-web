/**
 * O cookie do modo demo, e como o navegador lê o estado ATUAL dele.
 *
 * Módulo neutro de propósito: não importa `next/headers` nem Supabase, então
 * pode ser usado tanto pelo gate no servidor quanto por código de tela.
 *
 * ---
 *
 * Por que o navegador lê o cookie direto, em vez de receber a resposta pronta:
 *
 * A primeira versão entregava o veredito por prop, do layout para uma variável
 * de módulo. Estava errado, e de um jeito perigoso. Layout no App Router **não
 * re-renderiza em navegação client-side** (partial rendering — está em
 * `docs/01-app/02-guides/authentication.md`: layouts "don't re-render on
 * navigation"). O cookie, esse, é relido pelo servidor a cada requisição. Os
 * dois dessincronizavam:
 *
 *   1. Aba A aberta com o modo demo desligado (variável = false).
 *   2. Em outra aba, o admin liga o modo demo — o cookie vale para o navegador
 *      inteiro.
 *   3. Aba A navega pelo menu: o servidor lê o cookie e manda dado FICTÍCIO,
 *      mas o layout não re-renderizou, então a variável continua false.
 *   4. Qualquer edição feita na aba A ia para o BANCO DE PRODUÇÃO, com a tela
 *      exibindo dados de demonstração.
 *
 * O caminho mais caro nesse estado é o import da Planilha Geral, que começa
 * apagando o snapshot real da data. Ou seja: o modo cuja única promessa é não
 * encostar em produção podia apagar dado de produção.
 *
 * Lendo o cookie na hora da chamada, a decisão do navegador passa a vir da
 * mesma fonte que o servidor usa, e a janela de divergência deixa de existir.
 *
 * Por isso o cookie NÃO é httpOnly. Não se perde nada com isso: ele nunca foi
 * a autorização — quem autoriza é `estado.ts`, que exige papel de admin lido do
 * banco a cada requisição. Um consultor que forje o cookie continua vendo
 * produção; o único efeito é o próprio navegador dele passar a mandar as
 * consultas para uma Server Action que vai recusá-las.
 */

export const COOKIE_DEMO = 'modo_demo'

/** Estado do modo demo agora, segundo o cookie. Fora do navegador, false. */
export function demoNoCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split(';')
    .some(parte => parte.trim() === `${COOKIE_DEMO}=1`)
}

/**
 * Apaga o cookie pelo navegador. Usado no logout: sem isto, quem sair com o
 * modo demo ligado volta direto nele — e, pior, o próximo admin a entrar
 * NAQUELE navegador começa numa demonstração que nunca ligou.
 */
export function limparCookieDemo(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${COOKIE_DEMO}=; Max-Age=0; path=/; SameSite=Lax`
}
