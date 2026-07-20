// Teste da detecção de movimentação de carteira.
// Roda com `node src/lib/carteira.test.mjs`.
//
// A armadilha central: a PRIMEIRA carga não pode inventar transferências. E a
// virada do mês tem que agrupar pelo ÚLTIMO snapshot de cada mês, não por
// snapshot cru — senão dois uploads do mesmo mês viram "transferência".

import assert from 'node:assert/strict'
import { compararCarteira, snapshotsPorMes } from './carteira.ts'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('  ok:', nome) }

const linha = (seller_id, consultor_nome, data_referencia) => ({ seller_id, consultor_nome, data_referencia })

t('BASELINE: um snapshot só não emite transferência', () => {
  const r = compararCarteira([
    linha('1', 'Frahnz', '2026-07-13'),
    linha('2', 'Marceli', '2026-07-13'),
  ])
  assert.equal(r.dataAnterior, null)
  assert.equal(r.movimentacoes.length, 0)
  assert.equal(r.pares.length, 0)
})

t('nenhum snapshot: tudo vazio, sem quebrar', () => {
  const r = compararCarteira([])
  assert.equal(r.dataAtual, null)
  assert.equal(r.movimentacoes.length, 0)
})

t('transferência real entre dois meses', () => {
  const r = compararCarteira([
    linha('1', 'Frahnz', '2026-06-30'),
    linha('2', 'Frahnz', '2026-06-30'),
    linha('1', 'Marceli', '2026-07-13'),   // cliente 1 passou para Marceli
    linha('2', 'Frahnz', '2026-07-13'),
  ])
  assert.equal(r.dataAnterior, '2026-06-30')
  assert.equal(r.dataAtual, '2026-07-13')
  assert.equal(r.movimentacoes.length, 1)
  assert.deepEqual(r.movimentacoes[0], { seller_id: '1', de: 'Frahnz', para: 'Marceli' })
})

t('cliente NOVO não é transferência (não tinha dono antes)', () => {
  const r = compararCarteira([
    linha('1', 'Frahnz', '2026-06-30'),
    linha('1', 'Frahnz', '2026-07-13'),
    linha('9', 'Marceli', '2026-07-13'),   // entrou agora, sem histórico
  ])
  assert.equal(r.movimentacoes.length, 0)
})

t('CARTEIRA INTEIRA: consultor sai e outro assume tudo', () => {
  const r = compararCarteira([
    linha('1', 'Geraldo', '2026-06-30'),
    linha('2', 'Geraldo', '2026-06-30'),
    linha('3', 'Geraldo', '2026-06-30'),
    linha('1', 'Felipe', '2026-07-13'),
    linha('2', 'Felipe', '2026-07-13'),
    linha('3', 'Felipe', '2026-07-13'),
  ])
  assert.equal(r.pares.length, 1)
  assert.equal(r.pares[0].de, 'Geraldo')
  assert.equal(r.pares[0].para, 'Felipe')
  assert.equal(r.pares[0].clientes.length, 3)
  assert.equal(r.pares[0].carteiraInteira, true)   // Geraldo sumiu e levou os 3
  assert.deepEqual(r.consultoresQueSairam, ['Geraldo'])
  assert.deepEqual(r.novosConsultores, ['Felipe'])
})

t('carteira PARCIAL não é "inteira" (consultor continua existindo)', () => {
  const r = compararCarteira([
    linha('1', 'Lidio', '2026-06-30'),
    linha('2', 'Lidio', '2026-06-30'),
    linha('1', 'Marceli', '2026-07-13'),   // só 1 dos 2 foi
    linha('2', 'Lidio', '2026-07-13'),     // Lidio continua com o outro
  ])
  assert.equal(r.pares.length, 1)
  assert.equal(r.pares[0].carteiraInteira, false)
  assert.equal(r.consultoresQueSairam.length, 0)
})

t('agrupa pelo ÚLTIMO snapshot do mês — dois uploads no mesmo mês não viram transferência', () => {
  // Dois envios em julho: no dia 13 o cliente é do Frahnz, no 17 já é da Marceli.
  // Como só o ÚLTIMO de julho (17) representa o mês, e não há mês anterior,
  // isto é baseline: zero transferências.
  const meses = snapshotsPorMes([
    linha('1', 'Frahnz', '2026-07-13'),
    linha('1', 'Marceli', '2026-07-17'),
  ])
  assert.equal(meses.get('2026-07'), '2026-07-17')   // o último vence
  const r = compararCarteira([
    linha('1', 'Frahnz', '2026-07-13'),
    linha('1', 'Marceli', '2026-07-17'),
  ])
  assert.equal(r.movimentacoes.length, 0)   // um mês só = baseline
})

t('só o último de cada mês entra no diff (ignora o meio do mês)', () => {
  const r = compararCarteira([
    linha('1', 'Frahnz', '2026-06-01'),
    linha('1', 'Frahnz', '2026-06-30'),    // junho fecha com Frahnz
    linha('1', 'Frahnz', '2026-07-05'),
    linha('1', 'Marceli', '2026-07-20'),   // julho fecha com Marceli
  ])
  assert.equal(r.dataAnterior, '2026-06-30')
  assert.equal(r.dataAtual, '2026-07-20')
  assert.equal(r.movimentacoes.length, 1)
  assert.equal(r.movimentacoes[0].para, 'Marceli')
})

console.log(`\n${n} testes passaram`)
