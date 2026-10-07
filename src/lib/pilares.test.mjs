// Teste da detecção de escala de percentual (o coração da normalização do upload).
// Sem framework: roda com `node src/lib/pilares.test.mjs` (Node 24+ importa o .ts
// direto por type stripping). Importa a função REAL — não copia a lógica.
//
// O caso que motivou este teste: o TPV é uma razão (atual ÷ passado) que orbita
// 1,0. Quando um consultor cresce, o valor passa de 1 e a regra antiga (maior
// valor ≤ 1) tratava a coluna como já-em-0–100, deixando o TPV como 1,01% em vez
// de 100,79%. A regra por mediana resolve isso.

import assert from 'node:assert/strict'
import { escalaPercentual, metaAwareness, ehCarteiraAtiva } from './pilares.ts'

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
t('awareness 06/10: Felipe (166 ativos) → 40, Gleudison (200) → 40, Rivaldo (248) → 80', () => {
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

console.log(`\n${n} testes passaram`)
