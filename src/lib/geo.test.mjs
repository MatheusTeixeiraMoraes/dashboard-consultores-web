// Teste da entrega de seleção entre telas (Clientes/Radar/Acionáveis → Roteirizar).
// Roda com `node src/lib/geo.test.mjs` (Node 24 importa o .ts direto).
//
// Existe por causa do formato: a entrega atravessa o localStorage, e o formato
// MUDOU (era um array puro, virou { origem, clientes }). Se a leitura deixar de
// aceitar o formato antigo, quem tinha uma seleção pendente no navegador a perde
// sem nenhuma mensagem — o tipo de regressão que nenhuma tela denuncia.

import assert from 'node:assert/strict'

// O módulo mexe em localStorage, que não existe no Node. Stub mínimo, montado
// ANTES do import — o módulo lê a API na chamada, não na carga, mas deixar o
// global pronto antes evita depender disso.
const memoria = new Map()
globalThis.localStorage = {
  getItem: k => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: k => memoria.delete(k),
}

const { entregarAoRoteirizar, receberSelecao, limparSelecao, CHAVE_RADAR_ROTA, MAX_PARADAS_ROTA } =
  await import('./geo.ts')

let n = 0
const t = (nome, fn) => { memoria.clear(); fn(); n++; console.log('  ok:', nome) }

const cliente = (seller_id, extra = {}) => ({
  seller_id, seller_nome: 'Fulano ' + seller_id, lat: -8.05, lng: -34.9,
  telefone: null, endereco: 'Rua 1', cidade: 'Recife', bairro: 'Boa Viagem',
  consultor_nome: 'Consultor', ...extra,
})

t('entrega e leitura devolvem os mesmos clientes, com a origem', () => {
  entregarAoRoteirizar([cliente('1'), cliente('2')], 'clientes')
  const { origem, clientes } = receberSelecao()
  assert.equal(origem, 'clientes')
  assert.equal(clientes.length, 2)
  assert.equal(clientes[0].seller_id, '1')
})

t('sem origem informada, assume o Radar (o primeiro a usar o canal)', () => {
  entregarAoRoteirizar([cliente('1')])
  assert.equal(receberSelecao().origem, 'radar')
})

t('FORMATO ANTIGO (array puro) ainda é lido — seleção pendente não se perde', () => {
  localStorage.setItem(CHAVE_RADAR_ROTA, JSON.stringify([cliente('9')]))
  const { origem, clientes } = receberSelecao()
  assert.equal(clientes.length, 1)
  assert.equal(clientes[0].seller_id, '9')
  assert.equal(origem, 'radar')
})

t('nada guardado = lista vazia, não erro', () => {
  const { clientes } = receberSelecao()
  assert.deepEqual(clientes, [])
})

t('conteúdo corrompido não derruba a tela', () => {
  localStorage.setItem(CHAVE_RADAR_ROTA, '{isto não é json')
  assert.deepEqual(receberSelecao().clientes, [])

  localStorage.setItem(CHAVE_RADAR_ROTA, JSON.stringify({ origem: 'clientes' }))
  assert.deepEqual(receberSelecao().clientes, [])
})

t('origem desconhecida vira radar em vez de quebrar o rótulo da tela', () => {
  localStorage.setItem(CHAVE_RADAR_ROTA, JSON.stringify({ origem: 'lua', clientes: [cliente('1')] }))
  assert.equal(receberSelecao().origem, 'radar')
})

t('limpar apaga a entrega (senão ela voltaria na próxima visita à tela)', () => {
  entregarAoRoteirizar([cliente('1')], 'acionaveis')
  limparSelecao()
  assert.deepEqual(receberSelecao().clientes, [])
})

t('o teto de paradas é um número só para todas as telas', () => {
  assert.equal(MAX_PARADAS_ROTA, 100)
})

// Regressão: `in` acha chaves do protótipo, e a tela renderizaria uma função.
t('origem "constructor" não vira rótulo (protótipo não é origem válida)', () => {
  localStorage.setItem(CHAVE_RADAR_ROTA, JSON.stringify({ origem: 'constructor', clientes: [cliente('1')] }))
  assert.equal(receberSelecao().origem, 'radar')
})

console.log(`\n${n} testes ok`)
