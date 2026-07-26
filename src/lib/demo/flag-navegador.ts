'use client'

/**
 * Se o modo demo está ligado, do ponto de vista do navegador.
 *
 * Quem decide isso é o servidor (que confere cookie + papel de admin no banco);
 * aqui é só o veredito já pronto, entregue pelo layout do dashboard e guardado
 * no módulo. Guardar no módulo em vez de num Context é de propósito: quem
 * precisa da resposta é o `createClient()` do navegador, chamado dentro de
 * handlers e effects, onde não há hook disponível.
 *
 * Não é barreira de segurança. Forjar isto no navegador não revela nada: as
 * telas são renderizadas no servidor, e a Server Action que serve os dados de
 * demonstração revalida a permissão por conta própria.
 */

let ligado = false

/**
 * Só tem efeito no navegador, e isso é essencial.
 *
 * Quem chama é o Shell, que também roda no servidor durante o SSR — e lá uma
 * variável de módulo é COMPARTILHADA entre requisições de usuários diferentes.
 * Sem esta guarda, o SSR da tela de um admin em demonstração deixaria o módulo
 * marcado como "em demo" para a requisição seguinte, de outro usuário. Hoje
 * nenhum componente chama o `createClient()` do navegador durante o render
 * (todos chamam dentro de handlers, que só rodam no cliente), mas isso é uma
 * coincidência do código atual, não uma garantia — e o custo de não depender
 * dela é uma linha.
 */
export function definirDemoNoNavegador(valor: boolean): void {
  if (typeof window === 'undefined') return
  ligado = valor
}

export function demoLigadoNoNavegador(): boolean {
  return typeof window !== 'undefined' && ligado
}
