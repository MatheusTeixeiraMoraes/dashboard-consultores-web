// Guarda de arquitetura: a Planilha Geral dirige a ESTRUTURA da carteira, nunca
// o CONTATO do cliente.
//
// Roda com `node src/lib/separacao-planilhas.test.mjs`.
//
// A regra evoluiu (e o teste tem que dizer a verdade sobre ela, senão vira uma
// guarda em que alguém confia por engano):
//
//   ANTES: "a Planilha Geral não toca `clientes`, ponto." Uma parede total.
//   AGORA: o dono quer que a Planilha Geral seja a FONTE DA VERDADE — ela cria
//          stub, transfere o dono e esconde quem saiu. Mas o CONTATO (nome,
//          telefone, e-mail, CPF/CNPJ, endereço, lat/lng) é digitado pelo
//          consultor e continua intocável por import.
//
// A linha que NÃO pode ser cruzada, então, é estreita e precisa:
//   1. O import (ImportPlanilhaGeral) nunca faz insert/update/delete DIRETO em
//      `clientes`. Escreve só nas tabelas de snapshot; a sincronização de
//      `clientes` passa pela função reconciliar_carteira (RPC).
//   2. O corpo de reconciliar_carteira NUNCA referencia uma coluna de contato.
//      É esse invariante que protege o dado do consultor.
//
// Este teste lê o código-fonte. É chato de propósito.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('  ok:', nome) }

const ler = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const IMPORT_GERAL = 'app/(dashboard)/dashboard/upload/ImportPlanilhaGeral.tsx'
const PAGE_ACIONAVEIS = 'app/(dashboard)/dashboard/acionaveis/page.tsx'
const CLIENT_ACIONAVEIS = 'app/(dashboard)/dashboard/acionaveis/AcionaveisClient.tsx'
const MIGRATION_CARTEIRA = '../supabase/migrations/2026-07-21_carteira_fonte_da_verdade.sql'

/** Toda chamada `.from('x')` com literal — só as escritas/leituras diretas. */
const tabelasDe = src => [...src.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g)].map(m => m[1])
const ESCRITA = /\.(insert|update|upsert|delete)\s*\(/g

// As colunas de CONTATO de `clientes` — o que o import jamais pode escrever.
const CONTATO = [
  'seller_nome', 'seller_telefone', 'seller_email', 'doc_tipo', 'cpf_cnpj',
  'cidade', 'bairro', 'endereco_completo', 'lat', 'lng', 'status_atualizacao',
]

t('o import não escreve DIRETO em `clientes` (só via reconciliar_carteira)', () => {
  const src = ler(IMPORT_GERAL)
  assert.equal(
    tabelasDe(src).includes('clientes'), false,
    'O import faz `.from(\'clientes\')` direto. A sincronização de clientes tem que passar ' +
    'pela função reconciliar_carteira, que protege o contato do consultor.',
  )
  assert.ok(
    /rpc\(\s*['"`]reconciliar_carteira['"`]/.test(src),
    'O import deveria reconciliar via rpc(\'reconciliar_carteira\', ...).',
  )
})

t('a lista de tabelas de escrita direta do import é só o snapshot', () => {
  const src = ler(IMPORT_GERAL)
  const m = src.match(/const TABELAS = \[([^\]]*)\]/)
  assert.ok(m, 'esperava a constante TABELAS declarando o que o import escreve direto')
  const tabelas = [...m[1].matchAll(/['"`]([a-z_]+)['"`]/g)].map(x => x[1]).sort()
  assert.deepEqual(
    tabelas, ['mp_acionaveis', 'mp_carteira'],
    `O import escreve direto em ${tabelas.join(', ')}. Só o snapshot pode; clientes é via RPC.`,
  )
})

t('INVARIANTE: reconciliar_carteira nunca referencia coluna de contato', () => {
  const sql = ler(MIGRATION_CARTEIRA).toLowerCase()
  // Recorta o corpo da função (do cabeçalho até o terminador $$;).
  const corpo = sql.match(/function reconciliar_carteira[\s\S]*?\$\$;/)
  assert.ok(corpo, 'não achei o corpo de reconciliar_carteira na migration')
  for (const col of CONTATO) {
    assert.ok(
      !corpo[0].includes(col),
      `reconciliar_carteira referenciou a coluna de contato "${col}". A Planilha Geral dirige ` +
      `MEMBERSHIP e DONO (seller_id, consultor_nome, em_carteira), nunca o contato do cliente.`,
    )
  }
})

t('a tela de Acionáveis apenas LÊ a base de rotas, nunca escreve', () => {
  const src = ler(PAGE_ACIONAVEIS)
  assert.ok(tabelasDe(src).includes('clientes'), 'esperado consultar `clientes` para exibir o nome')
  const escritas = src.match(ESCRITA) ?? []
  assert.deepEqual(escritas, [], `A página de Acionáveis fez escrita (${escritas.join(', ')}). Ela deve só ler.`)
})

t('a tela de Acionáveis não grava no cadastro de clientes', () => {
  const src = ler(CLIENT_ACIONAVEIS)
  assert.equal(tabelasDe(src).includes('clientes'), false, 'O componente de Acionáveis acessou `clientes` direto.')
})

t('a migration da carteira não apaga nem trunca nada', () => {
  const sql = ler(MIGRATION_CARTEIRA).toLowerCase()
  for (const re of [/drop\s+table/, /truncate/, /delete\s+from\s+clientes/]) {
    assert.equal(re.test(sql), false, `A migration tem comando destrutivo: ${re}`)
  }
  // Só adiciona coluna em clientes, nunca dropa/renomeia.
  assert.ok(sql.includes('add column if not exists em_carteira'), 'faltou a coluna em_carteira')
  assert.ok(!/alter table clientes\s+drop/.test(sql), 'a migration dropa coluna de clientes')
})

t('as migrations de snapshot ligam RLS nas tabelas novas', () => {
  const sql = ler('../supabase/migrations/2026-07-20_campanhas.sql')
  for (const tab of ['mp_carteira', 'mp_acionaveis']) {
    assert.match(sql, new RegExp(`alter table\\s+${tab}\\s+enable row level security`, 'i'),
      `${tab} sem RLS — tabela nova sem RLS é bug de segurança.`)
  }
})

console.log(`\n${n} testes passaram`)
