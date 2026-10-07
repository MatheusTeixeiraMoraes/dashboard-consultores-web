// Teste da detecção de escala de percentual (o coração da normalização do upload).
// Sem framework: roda com `node src/lib/pilares.test.mjs` (Node 24+ importa o .ts
// direto por type stripping). Importa a função REAL — não copia a lógica.
//
// O caso que motivou este teste: o TPV é uma razão (atual ÷ passado) que orbita
// 1,0. Quando um consultor cresce, o valor passa de 1 e a regra antiga (maior
// valor ≤ 1) tratava a coluna como já-em-0–100, deixando o TPV como 1,01% em vez
// de 100,79%. A regra por mediana resolve isso.

import assert from 'node:assert/strict'
import {
  escalaPercentual, metaAwareness, ehCarteiraAtiva, ativosMinimosNetChurn, textoMetaNetChurn,
  aderentesMinimosAgenda, textoMetaAderencia,
} from './pilares.ts'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('  ok:', nome) }

// TPV: razão orbitando 1,0, com uns crescendo (>1) e outros caindo (<1).
// É decimal → precisa de ×100 mesmo com valores acima de 1.
t('TPV com consultores crescendo (o bug) → ×100', () => {
  assert.equal(escalaPercentual([1.008, 0.897, 1.067, 0.856, 1.039, 0.903]), 100)
})

t('TPV com todos caindo → ×100', () => {
  assert.equal(escalaPercentual([0.95, 0.86, 0.98, 0.91]), 100)
})

// Percentuais comuns em decimal → ×100.
t('awareness decimal (0,25…0,68) → ×100', () => {
  assert.equal(escalaPercentual([0.2512, 0.6759, 0.5045, 0.3545]), 100)
})

t('net churn decimal, pequeno e negativo → ×100', () => {
  assert.equal(escalaPercentual([0, 0.0035, -0.0135, -0.1504, -0.0415]), 100)
})

t('aderência 100% (1,0 exato) → ×100', () => {
  assert.equal(escalaPercentual([1.0, 0.46, 0.71, 0.86]), 100)
})

// Coluna já em 0–100 (o "erro de formatação" que pode aparecer) → deixa como está.
t('coluna já em 0–100 → ×1 (não mexe)', () => {
  assert.equal(escalaPercentual([25.12, 67.59, 50.45, 46.15]), 1)
})

t('TPV já em 0–100 (95, 106…) → ×1', () => {
  assert.equal(escalaPercentual([95.1, 106.6, 89.7, 103.9]), 1)
})

// Bordas.
t('coluna vazia / só zeros → ×1 (nada a converter)', () => {
  assert.equal(escalaPercentual([]), 1)
  assert.equal(escalaPercentual([0, 0, 0]), 1)
})

// Awareness (05/10/2026): meta = quantidade de respostas pela carteira ATIVA.
// Faixas do slide "Bloco 1 — Atuação" do MP; piso de 40.
const FAIXAS_AW = [
  { min_carteira: 1,   meta_respostas: 40 },
  { min_carteira: 101, meta_respostas: 40 },
  { min_carteira: 201, meta_respostas: 80 },
  { min_carteira: 301, meta_respostas: 120 },
  { min_carteira: 401, meta_respostas: 120 },
  { min_carteira: 501, meta_respostas: 120 },
]

t('awareness: a faixa vale a partir de min_carteira (200 ainda é 40, 201 já é 80)', () => {
  assert.equal(metaAwareness(166, FAIXAS_AW, 40), 40)
  assert.equal(metaAwareness(200, FAIXAS_AW, 40), 40)
  assert.equal(metaAwareness(201, FAIXAS_AW, 40), 80)
  assert.equal(metaAwareness(300, FAIXAS_AW, 40), 80)
  assert.equal(metaAwareness(301, FAIXAS_AW, 40), 120)
  assert.equal(metaAwareness(900, FAIXAS_AW, 40), 120)
})

t('awareness: faixas fora de ordem dão o mesmo resultado', () => {
  assert.equal(metaAwareness(248, [...FAIXAS_AW].reverse(), 40), 80)
})

t('awareness: sem faixa que valha (tabela vazia ou carteira 0) a meta é o piso', () => {
  assert.equal(metaAwareness(250, [], 40), 40)
  assert.equal(metaAwareness(0, FAIXAS_AW, 40), 40)
})

t('awareness: a meta nunca fica abaixo do piso', () => {
  assert.equal(metaAwareness(150, [{ min_carteira: 1, meta_respostas: 30 }], 40), 40)
})

// Os 3 consultores de 06/10/2026 em que contar TODAS as linhas da carteira (e não só
// a ativa) dava meta maior que a da planilha: a nota deles veio cheia (1,5).
t('awareness 06/10: os 3 casos em que a carteira TOTAL erraria a meta (166 → 40, 200 → 40, 248 → 80)', () => {
  assert.equal(metaAwareness(166, FAIXAS_AW, 40), 40) // 69 respostas ≥ 40
  assert.equal(metaAwareness(200, FAIXAS_AW, 40), 40) // 77 respostas ≥ 40
  assert.equal(metaAwareness(248, FAIXAS_AW, 40), 80) // 119 respostas ≥ 80
})

t('carteira ativa: ATIVO e REATIVADO contam; CHURN, INATIVO e vazio não', () => {
  assert.equal(ehCarteiraAtiva('ATIVO'), true)
  assert.equal(ehCarteiraAtiva(' reativado '), true)
  assert.equal(ehCarteiraAtiva('CHURN'), false)
  assert.equal(ehCarteiraAtiva('INATIVO'), false)
  assert.equal(ehCarteiraAtiva(null), false)
  assert.equal(ehCarteiraAtiva(''), false)
})

// Net Churn: ativos mínimos para a meta (T1 = −2,10%). Base e "hoje" são os 10 consultores
// reais da planilha de 06/10/2026; o mínimo e o "faltam" foram conferidos à mão e por SQL.
const NC_REAL = [
  // [base (ativos mês passado), hoje (ativos mês atual), mínimo p/ meta, faltam]
  [258, 218, 253, 35],
  [246, 207, 241, 34],
  [303, 264, 297, 33],
  [240, 204, 235, 31],
  [415, 376, 407, 31],
  [377, 341, 370, 29],
  [308, 275, 302, 27],
  [269, 238, 264, 26],
  [193, 173, 189, 16],
  [203, 185, 199, 14],
]

t('net churn: mínimo e "faltam" dos 10 consultores reais (meta −2,10%)', () => {
  for (const [base, hoje, minimo, faltam] of NC_REAL) {
    assert.equal(ativosMinimosNetChurn(base, -2.1), minimo, `base ${base}`)
    assert.equal(minimo - hoje, faltam, `faltam, base ${base}`)
  }
})

// Aritmética INTEIRA (sem comparar % em ponto flutuante, que mascararia justamente a fronteira exata):
// net churn ≥ −2,10%  ⟺  (mínimo − base) × 10000 ≥ −210 × base.
t('net churn: no mínimo o net churn cumpre a meta; com um seller a menos, não', () => {
  const metaCentesimos = -210
  const bases = [...NC_REAL.map(l => l[0]), 1000, 250, 100] // as 3 últimas caem EXATAMENTE na fronteira
  for (const base of bases) {
    const minimo = ativosMinimosNetChurn(base, -2.1)
    assert.ok((minimo - base) * 10000 >= metaCentesimos * base, `base ${base}: no mínimo deveria cumprir`)
    assert.ok((minimo - 1 - base) * 10000 < metaCentesimos * base, `base ${base}: com um a menos deveria falhar`)
  }
})

t('net churn: texto da meta nas telas sem base (negativa, zero e positiva)', () => {
  assert.equal(textoMetaNetChurn(-2.1), 'perder no máx. 2,10% dos sellers do mês passado')
  assert.equal(textoMetaNetChurn(0), 'não perder nenhum seller em relação ao mês passado')
  assert.equal(textoMetaNetChurn(1.5), 'crescer pelo menos 1,50% sobre o mês passado')
})

t('net churn: conta exata não sobe um seller por erro de ponto flutuante', () => {
  assert.equal(ativosMinimosNetChurn(1000, -2.1), 979) // 1000 × 0,979 = 979 exato
  assert.equal(ativosMinimosNetChurn(250, -2), 245)    // 250 × 0,98 = 245 exato
  assert.equal(ativosMinimosNetChurn(100, -1), 99)
})

t('net churn: meta 0 pede a base inteira; meta positiva pede crescimento', () => {
  assert.equal(ativosMinimosNetChurn(200, 0), 200)
  assert.equal(ativosMinimosNetChurn(200, 1), 202)
})

// Aderência à agenda: aderentes mínimos para a meta (T1 = 65%). Agendados e aderentes são os 10
// consultores reais da planilha de 06/10/2026; mínimo e "faltam" conferidos à mão e por SQL.
const AD_REAL = [
  // [agendados, aderentes, mínimo p/ 65%, faltam (negativo = acima do mínimo)]
  [26, 25, 17, -8],
  [24, 21, 16, -5],
  [15, 13, 10, -3],
  [23, 13, 15, 2],
  [25, 11, 17, 6],
  [25, 11, 17, 6],
  [24, 7, 16, 9],
  [30, 5, 20, 15],
  [22, 1, 15, 14],
  [29, 0, 19, 19],
]

t('aderência: mínimo e "faltam" dos 10 consultores reais (meta 65%)', () => {
  for (const [ag, ad, minimo, faltam] of AD_REAL) {
    assert.equal(aderentesMinimosAgenda(ag, 65), minimo, `agendados ${ag}`)
    assert.equal(minimo - ad, faltam, `faltam, agendados ${ag}`)
  }
})

// Aritmética INTEIRA, como no net churn: aderência ≥ 65% ⟺ aderentes × 10000 ≥ 6500 × agendados.
t('aderência: no mínimo a aderência cumpre a meta; com uma visita a menos, não', () => {
  const agendados = [...AD_REAL.map(l => l[0]), 20, 40, 60, 100] // as 4 últimas caem EXATAMENTE na fronteira
  for (const ag of agendados) {
    const minimo = aderentesMinimosAgenda(ag, 65)
    assert.ok(minimo * 10000 >= 6500 * ag, `agendados ${ag}: no mínimo deveria cumprir`)
    assert.ok((minimo - 1) * 10000 < 6500 * ag, `agendados ${ag}: com uma a menos deveria falhar`)
  }
})

t('aderência: conta exata não pede uma visita a mais por erro de ponto flutuante', () => {
  assert.equal(aderentesMinimosAgenda(20, 65), 13)
  assert.equal(aderentesMinimosAgenda(100, 65), 65)
  assert.equal(aderentesMinimosAgenda(40, 65), 26)
})

t('aderência: meta 100 pede todos; meta 0 e agenda vazia não pedem nada; meta > 100 não pede mais que os agendados', () => {
  assert.equal(aderentesMinimosAgenda(25, 100), 25)
  assert.equal(aderentesMinimosAgenda(25, 150), 25)
  assert.equal(aderentesMinimosAgenda(25, 0), 0)
  assert.equal(aderentesMinimosAgenda(0, 65), 0)
})

t('aderência: texto da meta nas telas sem a agenda do consultor', () => {
  assert.equal(textoMetaAderencia(65), '65,00% dos sellers agendados visitados')
  assert.equal(textoMetaAderencia(58.5), '58,50% dos sellers agendados visitados')
})

console.log(`\n${n} testes passaram`)
