// Guarda de arquitetura: a Planilha Geral NÃO se funde com a base de rotas.
//
// Roda com `node src/lib/separacao-planilhas.test.mjs`.
//
// Esta é uma regra do produto, dita pelo dono: são duas planilhas diferentes,
// com alguns clientes em comum, e elas NÃO DEVEM SE FUNDIR.
//
//   clientes                    -> cadastro editável: telefone, endereço, GPS.
//                                  Serve para gerar rotas (Radar/Roteirizar).
//                                  Tem `status_atualizacao` protegendo a edição
//                                  manual contra sobrescrita de import.
//   mp_carteira/mp_acionaveis   -> retrato mensal do MP, descartado e trocado a
//                                  cada planilha nova.
//
// Fundir significaria que todo import mensal teria que decidir campo a campo o
// que sobrescrever — e é assim que se perde o telefone que alguém corrigiu na
// mão. Por isso a única ligação permitida é LER nome/telefone por seller_id na
// hora de desenhar a tela.
//
// Este teste lê o código-fonte. É chato de propósito: uma regra que só existe
// em comentário é uma regra que alguém apaga sem perceber daqui a três meses.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('  ok:', nome) }

const ler = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const IMPORT_GERAL = 'app/(dashboard)/dashboard/upload/ImportPlanilhaGeral.tsx'
const PAGE_CAMPANHAS = 'app/(dashboard)/dashboard/campanhas/page.tsx'
const CLIENT_CAMPANHAS = 'app/(dashboard)/dashboard/campanhas/CampanhasClient.tsx'

/** Toda chamada `.from('x')` no arquivo. */
const tabelasDe = src => [...src.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g)].map(m => m[1])

/** Operações de escrita do supabase-js. */
const ESCRITA = /\.(insert|update|upsert|delete)\s*\(/g

t('o import da Planilha Geral não menciona a tabela `clientes`', () => {
  const src = ler(IMPORT_GERAL)
  assert.equal(
    tabelasDe(src).includes('clientes'), false,
    'O import da Planilha Geral tocou em `clientes`. As duas planilhas não devem se fundir: ' +
    'o retrato mensal do MP não pode sobrescrever o cadastro que alimenta as rotas.',
  )
})

t('a lista de tabelas do import contém só as do snapshot', () => {
  const src = ler(IMPORT_GERAL)
  // O import declara suas tabelas numa constante nomeada, justamente para esta
  // regra ser verificável em vez de depender de regex adivinhando o que é nome
  // de tabela e o que é texto de tela.
  const m = src.match(/const TABELAS = \[([^\]]*)\]/)
  assert.ok(m, 'esperava a constante TABELAS declarando o que o import governa')

  const tabelas = [...m[1].matchAll(/['"`]([a-z_]+)['"`]/g)].map(x => x[1]).sort()
  assert.deepEqual(
    tabelas, ['mp_acionaveis', 'mp_carteira'],
    `O import governa ${tabelas.join(', ')}. Só as tabelas do snapshot podem entrar: ` +
    'a Planilha Geral não escreve no cadastro que gera as rotas.',
  )
})

t('a tela de Campanhas apenas LÊ a base de rotas, nunca escreve', () => {
  const src = ler(PAGE_CAMPANHAS)
  assert.ok(tabelasDe(src).includes('clientes'), 'esperado consultar `clientes` para exibir o nome')

  // Nenhuma escrita no arquivo inteiro — é uma página de leitura.
  const escritas = src.match(ESCRITA) ?? []
  assert.deepEqual(
    escritas, [],
    `A página de Campanhas fez escrita (${escritas.join(', ')}). Ela deve só ler: ` +
    'nome e telefone vêm da base de rotas como consulta, não como fusão.',
  )
})

t('a tela de Campanhas não grava no cadastro de clientes', () => {
  const src = ler(CLIENT_CAMPANHAS)
  assert.equal(
    tabelasDe(src).includes('clientes'), false,
    'O componente de Campanhas acessou a tabela `clientes` diretamente. ' +
    'A identificação já chega pronta do servidor, em `fichas`.',
  )
})

t('a migration não altera nem apaga tabela existente', () => {
  const sql = ler('../supabase/migrations/2026-07-20_campanhas.sql').toLowerCase()
  // `drop policy if exists` é sobre as policies das tabelas novas — permitido.
  const perigosas = [
    /drop\s+table/,
    /alter\s+table\s+(?!mp_)/,      // alter só nas tabelas do snapshot
    /truncate/,
    /delete\s+from\s+clientes/,
  ]
  for (const re of perigosas) {
    assert.equal(re.test(sql), false, `A migration tem comando destrutivo: ${re}`)
  }
  // E cria o que promete.
  for (const t of ['mp_carteira', 'mp_acionaveis']) {
    assert.ok(sql.includes(`create table if not exists ${t}`), `faltou criar ${t}`)
    assert.ok(sql.includes(`alter table ${t}`.replace(t, t)) || sql.includes(t), `faltou RLS em ${t}`)
  }
})

t('a migration liga RLS nas duas tabelas novas', () => {
  const sql = ler('../supabase/migrations/2026-07-20_campanhas.sql')
  for (const tab of ['mp_carteira', 'mp_acionaveis']) {
    assert.match(
      sql, new RegExp(`alter table\\s+${tab}\\s+enable row level security`, 'i'),
      `${tab} sem RLS — tabela nova sem RLS é bug de segurança.`,
    )
  }
})

console.log(`\n${n} testes passaram`)
