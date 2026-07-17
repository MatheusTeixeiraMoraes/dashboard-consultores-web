// Teste da canonização de cidade/bairro.
// Roda com `node src/lib/texto.test.mjs` (Node 24 importa o .ts direto).
// Importa a função REAL — sem cópia.
//
// Existe porque esta função ESCREVE no banco: um erro aqui corrompe a grafia de
// milhares de clientes de uma vez. Os casos de parênteses e conector já pegaram
// dois bugs de verdade.

import assert from 'node:assert/strict'
import { tituloCaso, tipoDoc } from './texto.ts'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('  ok:', nome) }

t('unifica as variantes de caixa (o motivo de existir)', () => {
  assert.equal(tituloCaso('centro'), 'Centro')
  assert.equal(tituloCaso('CENTRO'), 'Centro')
  assert.equal(tituloCaso('Centro'), 'Centro')
  assert.equal(tituloCaso('CeNtRo'), 'Centro')
})

t('preserva acento', () => {
  assert.equal(tituloCaso('BELÉM'), 'Belém')
  assert.equal(tituloCaso('MANGUEIRÃO'), 'Mangueirão')
})

t('parênteses mantêm a maiúscula (era bug: virava "(icoaraci)")', () => {
  assert.equal(tituloCaso('Tapanã (Icoaraci)'), 'Tapanã (Icoaraci)')
  assert.equal(tituloCaso('TAPANÃ (ICOARACI)'), 'Tapanã (Icoaraci)')
})

t('conector fica minúsculo no meio, maiúsculo no começo', () => {
  assert.equal(tituloCaso('RIO DE JANEIRO'), 'Rio de Janeiro')
  assert.equal(tituloCaso('Jardim Piazza di Roma'), 'Jardim Piazza di Roma')
  assert.equal(tituloCaso('DA PAZ'), 'Da Paz')  // conector na 1ª posição sobe
})

t('numeral romano fica maiúsculo', () => {
  assert.equal(tituloCaso('CIDADE NOVA II'), 'Cidade Nova II')
  assert.equal(tituloCaso('setor iv'), 'Setor IV')
})

t('hífen capitaliza os dois lados', () => {
  assert.equal(tituloCaso('vila-nova'), 'Vila-Nova')
})

t('normaliza espaço em excesso e vazio', () => {
  assert.equal(tituloCaso('  boa   vista '), 'Boa Vista')
  assert.equal(tituloCaso(''), '')
  assert.equal(tituloCaso('   '), '')
})

t('é idempotente (rodar de novo não muda)', () => {
  for (const s of ['Centro', 'Rio de Janeiro', 'Tapanã (Icoaraci)', 'Cidade Nova II']) {
    assert.equal(tituloCaso(tituloCaso(s)), tituloCaso(s))
  }
})

t('tipoDoc lê o formato real da planilha', () => {
  assert.equal(tipoDoc('45.950.024/0001-40'), 'CNPJ')   // como vem em Clientes_*.xlsx
  assert.equal(tipoDoc('123.456.789-09'), 'CPF')
  assert.equal(tipoDoc('45950024000140'), 'CNPJ')       // sem pontuação
  assert.equal(tipoDoc('12345678909'), 'CPF')
})

t('tipoDoc não chuta tipo em dado sujo', () => {
  assert.equal(tipoDoc(''), null)
  assert.equal(tipoDoc('não informado'), null)
  assert.equal(tipoDoc('123'), null)                    // curto demais
  assert.equal(tipoDoc('123456789012345'), null)        // longo demais
  assert.equal(tipoDoc(null), null)
})

console.log(`\n${n} testes passaram`)
