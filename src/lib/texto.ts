// Normalização de texto de dados de cliente.

// Conectores ficam minúsculos no meio do nome ("Rio de Janeiro", "Vila da Paz",
// "Jardim Piazza di Roma").
const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'di', 'e', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'à'])
// Numerais romanos são comuns em bairro ("Cidade Nova II") e devem ficar maiúsculos.
const ROMANO = /^(i{1,3}|iv|v|vi{1,3}|ix|x{1,3})$/

/**
 * Forma canônica de cidade/bairro: Title Case.
 *
 * A base vem com a mesma localidade escrita de jeitos diferentes ("Centro",
 * "CENTRO", "centro"), o que fazia cada variante virar uma opção separada nos
 * filtros. Canonizar na escrita resolve na origem — sem isso, dedupe na tela
 * seria remendo e a duplicata voltaria no próximo cadastro.
 *
 * Limitação aceita: siglas viram Title Case ("SESI" → "Sesi"). É cosmético e
 * não atrapalha o objetivo, que é ter UM valor por localidade.
 */
export function tituloCaso(s: string): string {
  const limpo = (s ?? '').trim().replace(/\s+/g, ' ')
  if (!limpo) return ''
  return limpo
    .toLowerCase()
    .split(' ')
    .map((palavra, i) => {
      if (i > 0 && CONECTORES.has(palavra)) return palavra
      if (ROMANO.test(palavra)) return palavra.toUpperCase()
      // Sobe a primeira LETRA de cada parte, preservando a pontuação em volta:
      // "(icoaraci)" → "(Icoaraci)", "vila-nova" → "Vila-Nova", "d'ávila" → "D'ávila".
      // Pegar o primeiro caractere quebraria em "(", deixando a palavra minúscula.
      return palavra.replace(/\p{L}[\p{L}\p{M}']*/gu, t => t[0].toUpperCase() + t.slice(1))
    })
    .join(' ')
}
