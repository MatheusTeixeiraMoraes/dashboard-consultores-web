// Teste da comparação de TPV.
// Roda com `node src/lib/tpv.test.mjs`.
//
// Existe porque este é o único lugar do painel que CALCULA em vez de espelhar,
// e um erro aqui não aparece na tela: mostra um número plausível e errado. O
// caso da virada de mês é o mais perigoso — sem ele, todo cliente da base
// pareceria ter parado de vender no dia 1.

import assert from 'node:assert/strict'
import { diasCorridos, compararRitmo, estagnacao, faixaTPV, partesData } from './tpv.ts'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('  ok:', nome) }
const perto = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`)

t('conta dias corridos do mês e até um dia', () => {
  assert.equal(diasCorridos(2026, 7, 13), 13)   // 01 a 13/07
  assert.equal(diasCorridos(2026, 6), 30)       // junho fechado
  assert.equal(diasCorridos(2026, 7), 31)       // julho inteiro
})

t('fim de semana CONTA: comércio fatura sábado e domingo', () => {
  // 04 e 05/07/2026 são sábado e domingo — e a padaria vende nos dois.
  assert.equal(diasCorridos(2026, 7, 5) - diasCorridos(2026, 7, 3), 2)
})

t('fevereiro e bissexto saem certos', () => {
  assert.equal(diasCorridos(2026, 2), 28)
  assert.equal(diasCorridos(2024, 2), 29)
})

t('partesData não escorrega no fuso', () => {
  // new Date("2026-07-13") em GMT-3 vira dia 12. Por isso não usamos Date aqui.
  assert.deepEqual(partesData('2026-07-13'), { ano: 2026, mes: 7, dia: 13 })
  assert.deepEqual(partesData('2026-01-01T00:00:00Z'), { ano: 2026, mes: 1, dia: 1 })
})

t('o caso real da base: -62% vira -12,1%', () => {
  const r = compararRitmo(35_762_015, 93_884_472, '2026-07-13')
  assert.equal(r.diasDecorridos, 13)
  assert.equal(r.diasMesPassado, 30)
  perto(r.ritmoAtual, 2_750_924, 1)
  perto(r.ritmoPassado, 3_129_482, 1)
  perto(r.variacao, -0.1209, 0.001)
  // A comparação bruta daria -0.619. O teste existe para essa diferença: sem
  // dividir pelos dias, a tela grita uma queda 5x maior do que a real.
  assert.ok(r.variacao > -0.2, 'ritmo não pode reproduzir o -62% da comparação bruta')
})

t('vira o ano ao buscar o mês anterior', () => {
  const r = compararRitmo(1000, 2000, '2026-01-15')
  assert.equal(r.diasMesPassado, diasCorridos(2025, 12))   // dezembro do ano anterior
})

t('sem base no mês passado, variação é null (não -100%)', () => {
  // Cliente novo: não caiu, só não tem histórico. Dizer "-100%" seria mentira.
  assert.equal(compararRitmo(5000, 0, '2026-07-13').variacao, null)
  assert.equal(compararRitmo(5000, null, '2026-07-13').variacao, null)
})

t('projeção usa o mês inteiro, e é rotulada como estimativa', () => {
  const r = compararRitmo(35_762_015, 93_884_472, '2026-07-13')
  perto(r.projecaoMes, r.ritmoAtual * 31, 1)   // julho tem 31 dias
})

// ---- série entre envios ----

t('um envio só: a série ainda não diz nada', () => {
  const e = estagnacao([{ data: '2026-07-13', tpv: 1000 }])
  assert.equal(e.temSerie, false)
  assert.equal(e.diasSemVender, null)
})

t('acumulado parado = dias sem vender', () => {
  const e = estagnacao([
    { data: '2026-07-13', tpv: 23_050 },
    { data: '2026-07-14', tpv: 23_050 },
    { data: '2026-07-16', tpv: 23_050 },
  ])
  assert.equal(e.temSerie, true)
  assert.equal(e.ultimoDelta, 0)
  assert.equal(e.diasSemVender, 3)     // desde 13/07
})

t('acumulado subindo = vendeu, e o delta é o faturamento do intervalo', () => {
  const e = estagnacao([
    { data: '2026-07-13', tpv: 20_000 },
    { data: '2026-07-15', tpv: 23_050 },
  ])
  assert.equal(e.ultimoDelta, 3_050)
  assert.equal(e.ultimaVenda, '2026-07-15')
  assert.equal(e.diasSemVender, 0)
})

t('A ARMADILHA: virada de mês não é queda', () => {
  // O acumulado zera no dia 1. Sem o corte por mês, este cliente apareceria
  // como "parou de vender" — quando na verdade começou um mês novo.
  const e = estagnacao([
    { data: '2026-07-30', tpv: 90_000 },
    { data: '2026-07-31', tpv: 95_000 },
    { data: '2026-08-03', tpv: 4_000 },     // mês novo, acumulado reiniciou
  ])
  assert.equal(e.ultimoDelta, null ?? e.ultimoDelta)
  // Só há UM envio de agosto: a série do mês novo ainda não tem intervalo.
  assert.equal(e.temSerie, false)
  assert.equal(e.diasSemVender, null)
})

t('mês novo com dois envios volta a medir, sem contaminar do mês anterior', () => {
  const e = estagnacao([
    { data: '2026-07-31', tpv: 95_000 },
    { data: '2026-08-03', tpv: 4_000 },
    { data: '2026-08-05', tpv: 4_000 },
  ])
  assert.equal(e.temSerie, true)
  assert.equal(e.ultimoDelta, 0)          // não vendeu entre 03 e 05
  assert.equal(e.diasSemVender, 2)        // e não 5 dias contando desde julho
})

t('série fora de ordem é ordenada antes de medir', () => {
  const e = estagnacao([
    { data: '2026-07-16', tpv: 23_050 },
    { data: '2026-07-13', tpv: 20_000 },
  ])
  assert.equal(e.ultimoDelta, 3_050)
})

t('faixas cobrem os cortes sem número mágico solto', () => {
  assert.equal(faixaTPV(-0.5), 'queda-forte')
  assert.equal(faixaTPV(-0.3), 'queda-forte')
  assert.equal(faixaTPV(-0.15), 'queda')
  assert.equal(faixaTPV(0), 'estavel')
  assert.equal(faixaTPV(0.25), 'alta')
  assert.equal(faixaTPV(null), 'sem-base')
})

console.log(`\n${n} testes passaram`)
