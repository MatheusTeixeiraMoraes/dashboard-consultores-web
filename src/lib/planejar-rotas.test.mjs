// Teste da divisão da carteira em rotas por proximidade.
// Roda com `node src/lib/planejar-rotas.test.mjs` (Node 24+ importa .ts direto).
//
// O que precisa ser garantido, em ordem de importância:
//   1. grupos BALANCEADOS — se sair 60 e 8, não serve para dividir a semana;
//   2. grupos COESOS — quem está perto no mapa tem que cair junto;
//   3. NINGUÉM sumir nem aparecer duas vezes — é o tipo de erro que só se
//      descobre quando um cliente nunca é visitado;
//   4. DETERMINÍSTICO — rodar de novo com a mesma base dá o mesmo plano.

import assert from 'node:assert/strict'
import { planejarRotas, nomeSugerido, separarForaDeArea, distanciaAoCentroKm } from './planejar-rotas.ts'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('  ok:', nome) }

const cliente = (id, lat, lng, extra = {}) => ({
  seller_id: String(id), lat, lng,
  bairro: extra.bairro ?? 'Centro', cidade: extra.cidade ?? 'Recife',
  // `in` e não `??`: com `??`, passar `tpv: null` (que é justamente o caso a
  // testar) cairia no padrão 1000 e o teste testaria outra coisa.
  tpv: 'tpv' in extra ? extra.tpv : 1000,
  consultor_nome: extra.consultor ?? 'FULANO',
})

// Três blocos bem separados: Recife (-8.05,-34.88), Camaragibe (-8.02,-34.98)
// e Paulista (-7.93,-34.87). Distâncias reais da base.
function tresBlocos(porBloco = 10) {
  const centros = [
    { lat: -8.05, lng: -34.88, bairro: 'Boa Vista', cidade: 'Recife' },
    { lat: -8.02, lng: -34.98, bairro: 'Centro', cidade: 'Camaragibe' },
    { lat: -7.93, lng: -34.87, bairro: 'Maranguape', cidade: 'Paulista' },
  ]
  const lista = []
  let id = 1
  for (const c of centros) {
    for (let i = 0; i < porBloco; i++) {
      // espalha ~1 km em volta do centro, de forma determinística
      lista.push(cliente(id++, c.lat + (i % 5) * 0.002, c.lng + Math.floor(i / 5) * 0.002,
        { bairro: c.bairro, cidade: c.cidade }))
    }
  }
  return lista
}

t('ninguém some e ninguém duplica', () => {
  const base = tresBlocos(10)
  const grupos = planejarRotas(base, { quantidade: 5 })
  const ids = grupos.flatMap(g => g.clientes.map(c => c.seller_id))
  assert.equal(ids.length, base.length)
  assert.equal(new Set(ids).size, base.length)
})

t('grupos ficam balanceados (nenhum passa do teto)', () => {
  const base = tresBlocos(10)        // 30 clientes
  const grupos = planejarRotas(base, { quantidade: 5 })
  const teto = Math.ceil(base.length / 5)
  const tamanhos = grupos.map(g => g.clientes.length)
  assert.ok(Math.max(...tamanhos) <= teto, `maior grupo ${Math.max(...tamanhos)} > teto ${teto}`)
  assert.ok(Math.min(...tamanhos) >= 1)
})

t('blocos distantes não se misturam (coesão)', () => {
  // 3 blocos, 3 grupos: cada grupo tem que ser de uma cidade só.
  const grupos = planejarRotas(tresBlocos(8), { quantidade: 3 })
  assert.equal(grupos.length, 3)
  for (const g of grupos) {
    assert.equal(g.cidades.length, 1, `grupo com cidades ${g.cidades.join('/')}`)
  }
})

t('grupo coeso tem diâmetro pequeno; base espalhada tem diâmetro grande', () => {
  const [grupo] = planejarRotas(tresBlocos(8), { quantidade: 3 })
  assert.ok(grupo.diametroKm < 5, `diametro ${grupo.diametroKm} deveria ser pequeno`)
  const [unico] = planejarRotas(tresBlocos(8), { quantidade: 1 })
  assert.ok(unico.diametroKm > 10, `diametro ${unico.diametroKm} deveria cobrir a regiao toda`)
})

t('determinístico: mesma base, mesmo plano', () => {
  const base = tresBlocos(10)
  const a = planejarRotas(base, { quantidade: 5 })
  const b = planejarRotas(base, { quantidade: 5 })
  assert.deepEqual(
    a.map(g => g.clientes.map(c => c.seller_id).sort()),
    b.map(g => g.clientes.map(c => c.seller_id).sort()),
  )
})

t('semente diferente dá plano alternativo (mas continua válido)', () => {
  const base = tresBlocos(10)
  const a = planejarRotas(base, { quantidade: 5, semente: 1 })
  const b = planejarRotas(base, { quantidade: 5, semente: 999 })
  for (const plano of [a, b]) {
    assert.equal(plano.flatMap(g => g.clientes).length, base.length)
  }
})

t('sem coordenada fica de fora (não entra em grupo nenhum)', () => {
  const base = [
    ...tresBlocos(5),
    { ...cliente(900, NaN, NaN), bairro: 'Sem GPS' },
    { ...cliente(901, undefined, undefined), bairro: 'Sem GPS' },
  ]
  const grupos = planejarRotas(base, { quantidade: 3 })
  const ids = grupos.flatMap(g => g.clientes.map(c => c.seller_id))
  assert.equal(ids.length, 15)
  assert.ok(!ids.includes('900') && !ids.includes('901'))
})

t('pedir mais rotas que clientes não cria grupo vazio', () => {
  const grupos = planejarRotas([cliente(1, -8.05, -34.88), cliente(2, -8.06, -34.89)], { quantidade: 5 })
  assert.equal(grupos.length, 2)
  assert.ok(grupos.every(g => g.clientes.length > 0))
})

t('base vazia e quantidade inválida devolvem lista vazia', () => {
  assert.deepEqual(planejarRotas([], { quantidade: 5 }), [])
  assert.deepEqual(planejarRotas(tresBlocos(3), { quantidade: 0 }), [])
})

t('grupos saem numerados e encadeados de oeste para leste', () => {
  const grupos = planejarRotas(tresBlocos(8), { quantidade: 3 })
  assert.deepEqual(grupos.map(g => g.indice), [1, 2, 3])
  // o primeiro é o mais a oeste (Camaragibe, lng -34.98)
  assert.equal(grupos[0].cidades[0], 'Camaragibe')
})

t('rótulo traz os bairros que mais aparecem', () => {
  const grupos = planejarRotas(tresBlocos(8), { quantidade: 3 })
  const nomes = grupos.map(g => nomeSugerido(g))
  assert.ok(nomes.every(x => /^Dia \d · .+/.test(x)), nomes.join(' | '))
})

t('TPV do grupo é a soma dos clientes dele', () => {
  const base = [
    cliente(1, -8.05, -34.88, { tpv: 100 }),
    cliente(2, -8.051, -34.881, { tpv: 250 }),
    cliente(3, -7.93, -34.87, { tpv: 40 }),
  ]
  const grupos = planejarRotas(base, { quantidade: 2 })
  const total = grupos.reduce((s, g) => s + g.tpvTotal, 0)
  assert.equal(total, 390)
})

t('TPV nulo não vira NaN', () => {
  const base = [cliente(1, -8.05, -34.88, { tpv: null }), cliente(2, -8.051, -34.881, { tpv: 10 })]
  const grupos = planejarRotas(base, { quantidade: 1 })
  assert.equal(grupos[0].tpvTotal, 10)
})

// --- fora de área ---------------------------------------------------------
// O caso é real: a base da rota Hexa tem um cliente em Natal/RN, ~700 km de
// Recife. Sem separar, ele entrava numa rota de Recife e o raio daquele dia
// pulava de 7 km para 699 km.

t('cliente a 700 km é separado da operação', () => {
  const base = [...tresBlocos(6), cliente(999, -5.7793, -35.2009, { cidade: 'Natal', bairro: 'Igapó' })]
  const { dentro, fora } = separarForaDeArea(base)
  assert.equal(fora.length, 1)
  assert.equal(fora[0].seller_id, '999')
  assert.equal(dentro.length, 18)
})

t('todo mundo na mesma região: ninguém fica de fora', () => {
  const { dentro, fora } = separarForaDeArea(tresBlocos(6))
  assert.equal(fora.length, 0)
  assert.equal(dentro.length, 18)
})

t('o centro usa mediana, então o ponto distante não puxa o centro', () => {
  const base = [...tresBlocos(6), cliente(999, -5.7793, -35.2009, { cidade: 'Natal' })]
  const { centro } = separarForaDeArea(base)
  // A base fica entre -8.05 e -7.93; o centro tem que continuar aí, não subir
  // para o meio do caminho de Natal (-5.7).
  assert.ok(centro.lat < -7.5, `centro.lat ${centro.lat} foi puxado pelo ponto distante`)
})

t('sem o outlier, o plano volta a ter raio de cidade', () => {
  const base = [...tresBlocos(6), cliente(999, -5.7793, -35.2009, { cidade: 'Natal' })]
  const comOutlier = planejarRotas(base, { quantidade: 3 })
  assert.ok(Math.max(...comOutlier.map(g => g.diametroKm)) > 100, 'o outlier deveria estourar o raio')

  const { dentro } = separarForaDeArea(base)
  const limpo = planejarRotas(dentro, { quantidade: 3 })
  assert.ok(Math.max(...limpo.map(g => g.diametroKm)) < 20, 'sem o outlier, raio de cidade')
})

t('raio configurável', () => {
  // Um bloco só (~1 km de diâmetro) mais um ponto a ~28 km. Com os três blocos
  // a base inteira já se espalha por ~15 km, e um raio de 10 km cortaria os
  // blocos vizinhos junto — mediria o espalhamento da base, não o parâmetro.
  const bloco = tresBlocos(6).slice(0, 6)
  const base = [...bloco, cliente(999, -8.30, -34.88)]
  assert.equal(separarForaDeArea(base, 60).fora.length, 0)
  assert.equal(separarForaDeArea(base, 10).fora.length, 1)
})

t('distância ao centro é informada para explicar o corte', () => {
  const base = [...tresBlocos(6), cliente(999, -5.7793, -35.2009, { cidade: 'Natal' })]
  const { fora, centro } = separarForaDeArea(base)
  const d = distanciaAoCentroKm(fora[0], centro)
  assert.ok(d > 200 && d < 400, `distancia ${d} km fora do esperado para Recife-Natal`)
})

t('base sem coordenada nenhuma não quebra', () => {
  const { dentro, fora } = separarForaDeArea([cliente(1, NaN, NaN)])
  assert.deepEqual(dentro, [])
  assert.deepEqual(fora, [])
})

console.log(`\n${n} testes ok`)
