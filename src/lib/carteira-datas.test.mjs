// Prova que estreitar a busca da tela de Carteira NÃO muda o relatório.
// Roda com `node src/lib/carteira-datas.test.mjs`.
//
// Contexto: a tela baixava mp_carteira INTEIRA e deixava o compararCarteira
// descartar tudo menos dois meses. Agora ela descobre as duas datas em SQL e
// traz só esses dois snapshots. Isso só é seguro se as duas regras de escolha
// concordarem SEMPRE — é o que este arquivo verifica.
//
// A armadilha que motivou o teste: "as duas datas mais recentes" NÃO é a mesma
// coisa que "os dois últimos snapshots mensais". Com upload quinzenal, a
// primeira leitura compara quinzena com quinzena e viola a REGRA-MÃE.

import assert from 'node:assert/strict'
import { compararCarteira, datasDoRelatorio } from './carteira.ts'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('  ok:', nome) }

const linha = (seller_id, consultor_nome, data_referencia) => ({ seller_id, consultor_nome, data_referencia })

/** O que a TELA faz agora: escolhe as datas, traz só elas, e compara. */
const comoATelaFazAgora = (todas) => {
  const { atual, anterior } = datasDoRelatorio(todas.map(l => l.data_referencia))
  const alvos = [atual, anterior].filter(Boolean)
  return compararCarteira(todas.filter(l => alvos.includes(l.data_referencia)))
}

/** O que a tela fazia ANTES: baixava tudo e comparava. */
const comoEraAntes = (todas) => compararCarteira(todas)

const mesmoRelatorio = (todas, nota) => {
  assert.deepEqual(comoATelaFazAgora(todas), comoEraAntes(todas), nota)
}

t('as duas regras escolhem o mesmo par de datas', () => {
  const datas = ['2026-05-10', '2026-05-31', '2026-06-15', '2026-06-30', '2026-07-13']
  const { atual, anterior } = datasDoRelatorio(datas)
  assert.equal(atual, '2026-07-13')
  assert.equal(anterior, '2026-06-30', 'tem que ser o ÚLTIMO de junho, não o primeiro')
})

t('upload quinzenal: NÃO compara quinzena com quinzena', () => {
  // As duas datas mais recentes são 2026-07-13 e 2026-07-27, ambas de julho.
  // Pegar "as duas mais recentes" daria um diff dentro do mesmo mês — errado.
  const datas = ['2026-06-30', '2026-07-13', '2026-07-27']
  const { atual, anterior } = datasDoRelatorio(datas)
  assert.equal(atual, '2026-07-27')
  assert.equal(anterior, '2026-06-30')
})

t('mês pulado: cai no mês anterior que TEM dado', () => {
  const datas = ['2026-03-31', '2026-07-13']   // sem abril, maio, junho
  const { atual, anterior } = datasDoRelatorio(datas)
  assert.equal(atual, '2026-07-13')
  assert.equal(anterior, '2026-03-31')
})

t('só um mês: baseline, sem anterior', () => {
  const { atual, anterior } = datasDoRelatorio(['2026-07-13', '2026-07-27'])
  assert.equal(atual, '2026-07-27')
  assert.equal(anterior, null)
})

t('nenhuma data: os dois nulos, sem quebrar', () => {
  assert.deepEqual(datasDoRelatorio([]), { atual: null, anterior: null })
})

// ---- Equivalência ponta a ponta: o relatório sai IDÊNTICO ----

t('EQUIVALÊNCIA: transferência entre meses sai igual', () => {
  mesmoRelatorio([
    linha('1', 'Frahnz', '2026-06-30'),
    linha('2', 'Marceli', '2026-06-30'),
    linha('1', 'Marceli', '2026-07-13'),   // 1 mudou de dono
    linha('2', 'Marceli', '2026-07-13'),
  ])
})

t('EQUIVALÊNCIA: com histórico velho que o antigo baixava à toa', () => {
  mesmoRelatorio([
    // Meses antigos — antes vinham pelo fio e eram descartados
    linha('1', 'Frahnz', '2026-03-31'),
    linha('2', 'Frahnz', '2026-04-30'),
    linha('1', 'Frahnz', '2026-05-31'),
    // Os dois que importam
    linha('1', 'Frahnz', '2026-06-30'),
    linha('2', 'Marceli', '2026-06-30'),
    linha('1', 'Marceli', '2026-07-13'),
    linha('2', 'Marceli', '2026-07-13'),
  ])
})

t('EQUIVALÊNCIA: dois snapshots no mesmo mês (o último manda)', () => {
  mesmoRelatorio([
    linha('1', 'Frahnz', '2026-06-30'),
    linha('1', 'Marceli', '2026-07-13'),
    linha('1', 'Rafael', '2026-07-27'),   // último de julho vence
  ])
})

t('EQUIVALÊNCIA: baseline (um mês só) continua vazio', () => {
  mesmoRelatorio([
    linha('1', 'Frahnz', '2026-07-13'),
    linha('2', 'Marceli', '2026-07-13'),
  ])
})

t('EQUIVALÊNCIA: consultor saiu e outro assumiu a carteira inteira', () => {
  mesmoRelatorio([
    linha('9', 'Antigo', '2026-05-31'),
    linha('1', 'Frahnz', '2026-06-30'),
    linha('2', 'Frahnz', '2026-06-30'),
    linha('1', 'Marceli', '2026-07-13'),
    linha('2', 'Marceli', '2026-07-13'),
  ])
})

t('EQUIVALÊNCIA: sem dado nenhum', () => {
  mesmoRelatorio([])
})

console.log(`\n${n} testes passaram`)
