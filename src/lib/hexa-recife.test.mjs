// Teste da leitura da planilha da rota Inter/Hexa Recife.
// Sem framework: roda com `node src/lib/hexa-recife.test.mjs` (Node 24+ importa
// o .ts direto por type stripping). Importa as funções REAIS.
//
// Os casos vieram do arquivo de verdade ("Planilha Aprovados Compilada
// Hexa.xlsx", 04/08/2026): TPV como texto pt-BR com "R$", coordenadas com ponto
// decimal e 17 casas, "não" qualificado com o motivo, e ~1 milhão de linhas em
// branco depois da última com conteúdo.

import assert from 'node:assert/strict'
import {
  paraDinheiroBR, paraCoordenada, paraSimNao, lerPlanilhaHexa, resumoHexa, ErroPlanilhaHexa,
} from './hexa-recife.ts'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('  ok:', nome) }

// --- dinheiro -------------------------------------------------------------
t('TPV da planilha: "R$ 231.056,66" → 231056.66', () => {
  assert.equal(paraDinheiroBR('R$ 231.056,66'), 231056.66)
})

t('TPV sem milhar: "R$ 97.464,00" e "R$ 900,50"', () => {
  assert.equal(paraDinheiroBR('R$ 97.464,00'), 97464)
  assert.equal(paraDinheiroBR('R$ 900,50'), 900.5)
})

t('ponto é SEMPRE milhar no dinheiro (não vira 231,06)', () => {
  assert.equal(paraDinheiroBR('R$ 231.056'), 231056)
})

// Como o valor REALMENTE vem do arquivo: NBSP entre "R$" e o número.
t('TPV com NBSP (U+00A0), que é o do arquivo de verdade', () => {
  assert.equal(paraDinheiroBR('R$ 231.056,66'), 231056.66)
  // NBSP escrito por código, para o caso não depender de o editor preservar
  // um caractere invisível no meio da string.
  const nbsp = String.fromCharCode(160)
  assert.equal(paraDinheiroBR(`R$${nbsp}231.056,66`), 231056.66)
  assert.equal(paraDinheiroBR(`R$${nbsp}97.464,00`), 97464)
})

t('número puro do Excel passa direto', () => {
  assert.equal(paraDinheiroBR(231056.66), 231056.66)
})

t('vazio, "-" e lixo viram null', () => {
  assert.equal(paraDinheiroBR(''), null)
  assert.equal(paraDinheiroBR('-'), null)
  assert.equal(paraDinheiroBR('sem TPV'), null)
})

// --- coordenadas ----------------------------------------------------------
t('lat da planilha: "-8.0542767000000008"', () => {
  assert.equal(paraCoordenada('-8.0542767000000008', 'lat'), -8.054276700000001)
})

t('coordenada com vírgula decimal (reexport pt-BR)', () => {
  assert.equal(paraCoordenada('-34,888392', 'lng'), -34.888392)
})

t('vazio e zero viram null (0,0 é o meio do Atlântico, não endereço)', () => {
  assert.equal(paraCoordenada('', 'lat'), null)
  assert.equal(paraCoordenada(0, 'lat'), null)
})

t('fora da faixa vira null (lat 91, lng 200)', () => {
  assert.equal(paraCoordenada(91, 'lat'), null)
  assert.equal(paraCoordenada(200, 'lng'), null)
  assert.equal(paraCoordenada(-8.05, 'lat'), -8.05)
})

// --- sim/não --------------------------------------------------------------
t('"Sim" → true; "NÃO — divergente" e "Não (fora da planilha geral)" → false', () => {
  assert.equal(paraSimNao('Sim'), true)
  assert.equal(paraSimNao('sim'), true)
  assert.equal(paraSimNao('NÃO — divergente'), false)
  assert.equal(paraSimNao('Não (fora da planilha geral)'), false)
  assert.equal(paraSimNao(''), false)
})

// --- leitura da planilha --------------------------------------------------
const LINHA_REAL = {
  'Documento': '14.150.534/0001-09',
  'Tipo': 'CNPJ',
  'Nome Comércio (planilha)': 'Bete leite',
  'TPV': 'R$ 231.056,66',
  'CNAE': '5611203',
  'MCC': 'BARES E RESTAURANTES',
  'Região': 'Recife',
  'Consultor (planilha)': 'Nicolas Arthur Medeiros Bernardo',
  'Status Operacional': 'Aguardando Ativação',
  'Casou por': 'Documento',
  'Seller ID': '1178476194',
  'Nome no dashboard': 'PAULO FIDELIS DO NASCIMENTO',
  'Telefone': '81995658220',
  'E-mail': 'paulofidelisrecife@gmail.com',
  'Doc tipo (dashboard)': 'CNPJ',
  'CPF/CNPJ (dashboard)': '14.150.534/0001-09',
  'Cidade': 'Recife',
  'Bairro': 'Santo Amaro',
  'Endereço completo': 'Rua Bernardo Guimarães 409, Santo Amaro, Recife, Pernambuco, 50050-440',
  'Lat': '-8.0542767000000008',
  'Lng': '-34.888392000000003',
  'Consultor (dashboard)': 'NICOLAS ARTHUR MEDEIROS BERNARDO',
  'Consultor confere?': 'Sim',
  'Status do cadastro': 'Cliente não atualizado',
  'Está na carteira?': 'Sim',
  'Cadastro completo?': 'Sim',
  'Campos faltando': '',
}

const outra = (over) => ({ ...LINHA_REAL, ...over })

t('lê a linha real inteira', () => {
  const { clientes, consultores } = lerPlanilhaHexa([LINHA_REAL])
  assert.equal(clientes.length, 1)
  const c = clientes[0]
  assert.equal(c.seller_id, '1178476194')
  assert.equal(c.tpv, 231056.66)
  assert.equal(c.lat, -8.054276700000001)
  assert.equal(c.consultor_nome, 'NICOLAS ARTHUR MEDEIROS BERNARDO')
  assert.equal(c.doc_tipo, 'CNPJ')
  assert.equal(c.em_carteira, true)
  assert.equal(c.consultor_confere, true)
  assert.deepEqual(consultores, ['NICOLAS ARTHUR MEDEIROS BERNARDO'])
})

t('linhas em branco do fim do arquivo são ignoradas (não viram cliente)', () => {
  const vazia = Object.fromEntries(Object.keys(LINHA_REAL).map(k => [k, '']))
  const { clientes } = lerPlanilhaHexa([LINHA_REAL, vazia, vazia])
  assert.equal(clientes.length, 1)
})

t('seller repetido para o import (arquivo errado)', () => {
  assert.throws(
    () => lerPlanilhaHexa([LINHA_REAL, outra({ 'Cidade': 'Olinda' })]),
    err => err instanceof ErroPlanilhaHexa && /duas vezes/.test(err.message),
  )
})

t('coluna obrigatória faltando para o import, listando o que veio', () => {
  const semConsultor = { ...LINHA_REAL }
  delete semConsultor['Consultor (dashboard)']
  assert.throws(
    () => lerPlanilhaHexa([semConsultor]),
    err => err instanceof ErroPlanilhaHexa && /Consultor \(dashboard\)/.test(err.message),
  )
})

t('cabeçalho com acento/caixa diferente ainda casa (findCol)', () => {
  const linha = { ...LINHA_REAL }
  linha['REGIAO'] = linha['Região']; delete linha['Região']
  const { clientes, colunasAusentes } = lerPlanilhaHexa([linha])
  assert.equal(clientes[0].regiao, 'Recife')
  assert.deepEqual(colunasAusentes, [])
})

t('planilha vazia para o import', () => {
  assert.throws(() => lerPlanilhaHexa([]), ErroPlanilhaHexa)
})

// --- resumo do painel -----------------------------------------------------
t('resumo conta GPS, divergentes, fora da carteira e soma TPV', () => {
  const { clientes } = lerPlanilhaHexa([
    LINHA_REAL,
    outra({ 'Seller ID': '2', 'Lat': '', 'Lng': '', 'Consultor confere?': 'NÃO — divergente', 'TPV': 'R$ 1.000,00' }),
    outra({ 'Seller ID': '3', 'Está na carteira?': 'Não (fora da planilha geral)', 'Cadastro completo?': 'Não',
            'Status do cadastro': 'Cliente Atualizado', 'Cidade': 'Olinda', 'TPV': 'R$ 500,00',
            'Consultor (dashboard)': 'RIVALDO BATISTA' }),
  ])
  const r = resumoHexa(clientes)
  assert.equal(r.total, 3)
  assert.equal(r.tpvTotal, 231056.66 + 1000 + 500)
  assert.equal(r.comGps, 2)
  assert.equal(r.semGps, 1)
  assert.equal(r.divergentes, 1)
  assert.equal(r.foraCarteira, 1)
  assert.equal(r.incompletos, 1)
  assert.equal(r.atualizados, 1)
  assert.equal(r.porConsultor[0].nome, 'NICOLAS ARTHUR MEDEIROS BERNARDO')
  assert.equal(r.porConsultor[0].n, 2)
  assert.equal(r.porCidade.length, 2)
})

t('resumo de base vazia não quebra', () => {
  const r = resumoHexa([])
  assert.equal(r.total, 0)
  assert.equal(r.tpvTotal, 0)
  assert.deepEqual(r.porStatus, [])
})

console.log(`\n${n} testes ok`)
