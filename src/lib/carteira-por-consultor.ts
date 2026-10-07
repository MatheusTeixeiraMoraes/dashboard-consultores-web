import { normalizarNome } from './convites.ts'
import { ehCarteiraAtiva } from './pilares.ts'

/**
 * Quantos clientes cada consultor tem na carteira (último snapshot de `mp_carteira`),
 * pelo nome normalizado:
 *   - `total` = TODAS as linhas, qualquer status — a base dos Acionáveis;
 *   - `ativa` = só ATIVO + REATIVADO — a base do Awareness (ver `metaAwareness`).
 * São bases diferentes de propósito. Compartilhado pelas telas do Consultor e de Por
 * Área para que o "faltam" nunca divirja entre elas.
 */
export function contarCarteiraPorConsultor(linhas: { consultor_nome: string; status: string | null }[]) {
  const total: Record<string, number> = {}
  const ativa: Record<string, number> = {}
  for (const l of linhas) {
    const chave = normalizarNome(l.consultor_nome)
    total[chave] = (total[chave] ?? 0) + 1
    ativa[chave] = (ativa[chave] ?? 0) + (ehCarteiraAtiva(l.status) ? 1 : 0)
  }
  return { total, ativa }
}
