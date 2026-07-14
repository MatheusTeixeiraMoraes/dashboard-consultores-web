// Teste da detecção de escala de percentual (o coração da normalização do upload).
// Sem framework: roda com `node src/lib/pilares.test.mjs` (Node 24+ importa o .ts
// direto por type stripping). Importa a função REAL — não copia a lógica.
//
// O caso que motivou este teste: o TPV é uma razão (atual ÷ passado) que orbita
// 1,0. Quando um consultor cresce, o valor passa de 1 e a regra antiga (maior
// valor ≤ 1) tratava a coluna como já-em-0–100, deixando o TPV como 1,01% em vez
// de 100,79%. A regra por mediana resolve isso.

import assert from 'node:assert/strict'
import { escalaPercentual } from './pilares.ts'

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

console.log(`\n${n} testes passaram`)
