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
/**
 * Cliente sem identidade: veio só com o ID. O MP exporta esses como "INOVVA",
 * e a reconciliação cria stubs sem nome. Quem preenche nome/CPF/telefone é o
 * consultor, olhando o painel do MP.
 *
 * Mora aqui porque três telas mostram "Pendente de identificação" no lugar do
 * nome-placeholder — Clientes, Roteirizar e Radar — e a regra tem que ser a
 * mesma nas três. Derivado, sem coluna: sai do estado sozinho quando o nome
 * real é salvo.
 */
export function precisaIdentificar(sellerNome: string | null, sellerId: string): boolean {
  const n = (sellerNome ?? '').trim()
  return !n || /^inovva$/i.test(n) || n === sellerId
}

/**
 * Deduz CPF ou CNPJ pela quantidade de dígitos.
 *
 * A planilha traz uma coluna só ("CPF/CNPJ", ex.: "45.950.024/0001-40") e não
 * diz qual é — mas o número diz: CPF tem 11 dígitos, CNPJ tem 14. Qualquer
 * outra contagem é dado sujo e vira null, em vez de chutar um tipo errado.
 */
export function tipoDoc(s: string): 'CPF' | 'CNPJ' | null {
  const digitos = (s ?? '').replace(/\D/g, '').length
  if (digitos === 11) return 'CPF'
  if (digitos === 14) return 'CNPJ'
  return null
}

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
