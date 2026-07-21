// Teste da canonização de cidade/bairro.
// Roda com `node src/lib/texto.test.mjs` (Node 24 importa o .ts direto).
// Importa a função REAL — sem cópia.
//
// Existe porque esta função ESCREVE no banco: um erro aqui corrompe a grafia de
// milhares de clientes de uma vez. Os casos de parênteses e conector já pegaram
// dois bugs de verdade.

import assert from 'node:assert/strict'
import { tituloCaso, tipoDoc, precisaIdentificar, enderecoExibivel } from './texto.ts'

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

t('precisaIdentificar pega INOVVA, vazio e nome=ID', () => {
  assert.equal(precisaIdentificar('INOVVA', '123'), true)
  assert.equal(precisaIdentificar('inovva', '123'), true)   // caixa não importa
  assert.equal(precisaIdentificar('  INOVVA  ', '123'), true) // espaço não importa
  assert.equal(precisaIdentificar('', '123'), true)         // sem nome
  assert.equal(precisaIdentificar(null, '123'), true)
  assert.equal(precisaIdentificar('123', '123'), true)      // nome = próprio ID
})

t('precisaIdentificar deixa passar quem tem nome de verdade', () => {
  assert.equal(precisaIdentificar('Bar do Zé', '123'), false)
  assert.equal(precisaIdentificar('INOVVA COMÉRCIO LTDA', '123'), false) // contém, mas não É
})

t('enderecoExibivel mostra rua de verdade', () => {
  assert.equal(enderecoExibivel('Rua 01 157, Floriano, Jaboatão dos Guararapes, Pernambuco'),
    'Rua 01 157, Floriano, Jaboatão dos Guararapes, Pernambuco')
  assert.equal(enderecoExibivel('CEP 66613-115, Souza, Belém, Brasil'), 'CEP 66613-115, Souza, Belém, Brasil')
})

t('enderecoExibivel descarta coordenada crua (o motivo de existir)', () => {
  assert.equal(enderecoExibivel('-1.3895221468593852, -48.3724784591573'), '')
  assert.equal(enderecoExibivel('-23.500117, -47.461337'), '')
  assert.equal(enderecoExibivel(' -1.35, -48.40 '), '')            // com espaço nas bordas
})

t('enderecoExibivel descarta placeholder e vazio', () => {
  assert.equal(enderecoExibivel('Endereço não informado'), '')
  assert.equal(enderecoExibivel('nao informado'), '')
  assert.equal(enderecoExibivel('—'), '')
  assert.equal(enderecoExibivel(''), '')
  assert.equal(enderecoExibivel(null), '')
})

console.log(`\n${n} testes passaram`)
