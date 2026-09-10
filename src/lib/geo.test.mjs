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

const { entregarAoRoteirizar, receberSelecao, limparSelecao, CHAVE_RADAR_ROTA, MAX_PARADAS_ROTA,
  coordenadaNoTexto, geocodar } = await import('./geo.ts')

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

// --- Coordenada embutida no campo de endereço ---
//
// Regressão de campo: 5 clientes de Terra Firme/Belém tinham a coordenada exata
// gravada em `endereco_completo` e um lat/lng compartilhado que caía em Nazaré,
// 5 km fora. A rota levava o consultor ao lugar errado. Quem geocodifica tem
// que enxergar que o par de coordenadas JÁ é a resposta.

t('par de coordenadas no campo de endereço é lido como coordenada', () => {
  assert.deepEqual(coordenadaNoTexto('-1.4611027731776192, -48.451071204631326'),
    { lat: -1.4611027731776192, lng: -48.451071204631326 })
})

t('aceita o par sem espaço depois da vírgula', () => {
  assert.deepEqual(coordenadaNoTexto('-8.05,-34.9'), { lat: -8.05, lng: -34.9 })
})

t('rua de verdade não é coordenada', () => {
  assert.equal(coordenadaNoTexto('Rua 01 157, Boa Viagem, Recife'), null)
  assert.equal(coordenadaNoTexto('Endereço não informado'), null)
  assert.equal(coordenadaNoTexto(''), null)
  assert.equal(coordenadaNoTexto(null), null)
})

// A regex casa a FORMA, não a faixa: sem esta checagem "-999.5, -48.4" viraria
// um ponto e o mapa o desenharia em lugar nenhum.
t('par fora da faixa do globo não é coordenada', () => {
  assert.equal(coordenadaNoTexto('-999.5, -48.4'), null)
  assert.equal(coordenadaNoTexto('-1.46, -481.5'), null)
})

// Assíncrono: geocodar não pode sair para a rede quando a resposta já está no
// texto — era a rede que devolvia o lugar errado. Sem stub de sucesso: se ele
// tentar buscar, o contador denuncia.
let chamouRede = 0
globalThis.fetch = async () => { chamouRede++; throw new Error('não deveria buscar') }

assert.deepEqual(await geocodar('-1.4611027731776192, -48.451071204631326'),
  { lat: -1.4611027731776192, lng: -48.451071204631326 })
assert.equal(chamouRede, 0, 'geocodar buscou na rede uma coordenada que já tinha')
n++; console.log('  ok: geocodar devolve a coordenada do texto sem ir à rede')

assert.equal(await geocodar('   '), null)
assert.equal(chamouRede, 0)
n++; console.log('  ok: endereço vazio não vira busca')

console.log(`\n${n} testes ok`)
