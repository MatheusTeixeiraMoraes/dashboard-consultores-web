// Teste do leitor da Planilha Geral.
// Roda com `node src/lib/planilha-geral.test.mjs` (Node 24 importa o .ts direto).
// Importa as funções REAIS — sem cópia.
//
// Existe porque um erro aqui é SILENCIOSO: um split errado não quebra a tela,
// só entrega uma fila com clientes faltando, e ninguém percebe. Todos os casos
// abaixo saíram da planilha real de 13/07/2026.

import assert from 'node:assert/strict'
import {
  parseData, paraNumero, paraBool, separarAcionaveis,
  lerPlanilhaGeral, acionaveisDesconhecidos, ErroPlanilha, ACIONAVEIS,
} from './planilha-geral.ts'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('  ok:', nome) }

t('data por extenso, o formato que o MP manda', () => {
  assert.equal(parseData('26 de jun. de 2026'), '2026-06-26')
  assert.equal(parseData('3 de jul. de 2026'), '2026-07-03')    // dia sem zero
  assert.equal(parseData('18 de nov. de 2025'), '2025-11-18')
  assert.equal(parseData('1 de mai. de 2026'), '2026-05-01')
})

t('os 12 meses abreviados', () => {
  const esperado = ['01','02','03','04','05','06','07','08','09','10','11','12']
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  meses.forEach((m, i) => assert.equal(parseData(`15 de ${m}. de 2026`), `2026-${esperado[i]}-15`))
})

t('DT_ULTIMA_TRANSACAO vem em DD/MM/AAAA, formato diferente do resto', () => {
  assert.equal(parseData('16/08/2026'), '2026-08-16')
  assert.equal(parseData('1/7/2026'), '2026-07-01')     // dia e mês sem zero
  assert.equal(parseData('31/12/2025'), '2025-12-31')
})

t('"-" é "nunca contatado", não erro (11% da planilha)', () => {
  assert.equal(parseData('-'), null)
  assert.equal(parseData(''), null)
  assert.equal(parseData(null), null)
  assert.equal(parseData(undefined), null)
})

t('separa acionáveis por vírgula E quebra de linha', () => {
  // Como vem na planilha real: quebra de linha ANTES da vírgula.
  assert.deepEqual(
    separarAcionaveis('Limpeza de balcão 1x\n,Aumentar TPV'),
    ['Limpeza de balcão 1x', 'Aumentar TPV'],
  )
  assert.deepEqual(separarAcionaveis('Aumentar TPV'), ['Aumentar TPV'])
  assert.deepEqual(separarAcionaveis(''), [])
  // O caso de 6, que é o máximo observado.
  assert.equal(separarAcionaveis('a\n,b\n,c\n,d\n,e\n,f').length, 6)
})

t('número tolera vírgula decimal e "-"', () => {
  assert.equal(paraNumero(0.538052380952381), 0.538052380952381)
  assert.equal(paraNumero('0,538'), 0.538)
  assert.equal(paraNumero('13230'), 13230)
  assert.equal(paraNumero('-'), null)          // "-" é vazio na planilha
  assert.equal(paraNumero(''), null)
  assert.equal(paraNumero(0), 0)               // zero é valor, não vazio
})

t('paraBool só aceita SIM', () => {
  assert.equal(paraBool('SIM'), true)
  assert.equal(paraBool('sim'), true)
  assert.equal(paraBool('-'), false)
  assert.equal(paraBool(''), false)
})

// Uma linha no formato REAL da planilha, com os espaços do header inclusive.
const linha = (over = {}) => ({
  'CONSULTOR': 'JESSICA DE BRITO',
  'ID SELLER': '468021320',
  'STATUS': 'ATIVO',
  'MULTICONTAS': '-',
  'TPV OUTRAS CONTAS': '-',
  'QUARTIL DE PRIORIDADE': 'P1',
  'PRIO': 1,
  'ÚLTIMO CONTATO': '26 de jun. de 2026',
  ' TPV ESTE MÊS ': 4210,          // <- espaço nas duas bordas, como no arquivo
  ' TPV MÊS PASSADO ': 6100,
  'LISTA ACIONÁVEIS COMERCIAIS': 'Limpeza de balcão 1x\n,Aumentar TPV',
  'STATUS CRÉDITO': '5. CREDITO EM DIA',
  'MCC': 'ALIMENTOS E BEBIDAS',
  'RECORRÊNCIA': 'MUITO ALTA',
  'OPORTUNIDADE LIMPEZA 1X': 'SIM',
  'TPV_ACT_1X': 3650,
  'ATING_1X': 0.627,
  'REVERTIDO_1X': 0,
  'OPORTUNIDADE LIMPEZA PARCELADO': '-',
  'TPV_ACT_PARC': '-',
  'ATING_PARC': '-',
  'REVERTIDO_PARC': 0,
  '#ACIONÁVEIS COMERCIAIS': 2,
  'PESQUISA MAIS RECENTE': '-',
  ' TPV MESMA DATA MÊS PASSADO ': 3900,
  ' TPV M-2 ': 5800,
  ' TPV M-3 ': 7200,
  'DIAS SEM TRANSACIONAR': 3,
  'DT_ULTIMA_TRANSACAO': '15/08/2026',
  ' TPV M3 vs M1 ': -1100,   // M1(6100) - M3(7200)
  ' TPV M2 vs M1 ': 300,     // M1(6100) - M2(5800)
  ' TPV M0 vs Mesma data mês anterior ': 310,  // atual(4210) - mesmaData(3900)
  ...over,
})

t('lê o header " TPV ESTE MÊS " com espaço nas bordas', () => {
  const { clientes } = lerPlanilhaGeral([linha()])
  assert.equal(clientes[0].tpv_mes_atual, 4210)
  assert.equal(clientes[0].tpv_mes_passado, 6100)
})

t('explode a lista em uma ação por linha', () => {
  const { clientes, acoes, totaisPorAcionavel } = lerPlanilhaGeral([linha()])
  assert.equal(clientes.length, 1)
  assert.equal(acoes.length, 2)
  assert.deepEqual(acoes.map(a => a.acionavel), ['Limpeza de balcão 1x', 'Aumentar TPV'])
  assert.equal(acoes[0].seller_id, '468021320')
  assert.equal(totaisPorAcionavel['Aumentar TPV'], 1)
  assert.equal(clientes[0].qtd_acionaveis, 2)
})

t('ABORTA se a contagem não bate com #ACIONÁVEIS (a guarda do split)', () => {
  // A planilha diz 3, a lista tem 2 — separador mudou ou dado corrompido.
  assert.throws(
    () => lerPlanilhaGeral([linha({ '#ACIONÁVEIS COMERCIAIS': 3 })]),
    e => e instanceof ErroPlanilha && /diz 3 acionáveis.*tem 2/s.test(e.message),
  )
})

t('a mensagem de erro cita a linha e o seller, para achar na planilha', () => {
  try {
    lerPlanilhaGeral([linha(), linha({ 'ID SELLER': '999', '#ACIONÁVEIS COMERCIAIS': 5 })])
    assert.fail('devia ter levantado')
  } catch (e) {
    assert.match(e.message, /Linha 3/)     // +2: cabeçalho e base 1
    assert.match(e.message, /999/)
  }
})

t('ABORTA com seller repetido (arquivo errado, dois meses colados)', () => {
  assert.throws(
    () => lerPlanilhaGeral([linha(), linha()]),
    e => e instanceof ErroPlanilha && /aparece duas vezes/.test(e.message),
  )
})

t('ABORTA se faltar coluna obrigatória, dizendo quais existem', () => {
  const semLista = linha()
  delete semLista['LISTA ACIONÁVEIS COMERCIAIS']
  assert.throws(
    () => lerPlanilhaGeral([semLista]),
    e => e instanceof ErroPlanilha && /LISTA ACIONÁVEIS|lista/i.test(e.message),
  )
})

t('converte os campos de oportunidade e ignora "-"', () => {
  const { clientes } = lerPlanilhaGeral([linha()])
  const c = clientes[0]
  assert.equal(c.oportunidade_1x, true)
  assert.equal(c.valor_1x, 3650)
  assert.equal(c.ating_1x, 0.627)
  assert.equal(c.revertido_1x, false)
  assert.equal(c.oportunidade_parc, false)
  assert.equal(c.valor_parc, null)      // "-" vira null, não 0
  assert.equal(c.ultimo_contato, '2026-06-26')
  assert.equal(c.pesquisa_recente, null)
})

t('lê as colunas novas de TPV multi-mês (18/08/2026)', () => {
  const { clientes } = lerPlanilhaGeral([linha()])
  const c = clientes[0]
  assert.equal(c.tpv_mesma_data_mes_passado, 3900)
  assert.equal(c.tpv_m2, 5800)
  assert.equal(c.tpv_m3, 7200)
  assert.equal(c.dias_sem_transacionar, 3)
  assert.equal(c.dt_ultima_transacao, '2026-08-15')
  assert.equal(c.tpv_m3_vs_m1, -1100)
  assert.equal(c.tpv_m2_vs_m1, 300)
  assert.equal(c.tpv_m0_vs_mesma_data, 310)
})

t('linha em branco no fim do arquivo é ignorada', () => {
  const branca = Object.fromEntries(Object.keys(linha()).map(k => [k, '']))
  const { clientes } = lerPlanilhaGeral([linha(), branca])
  assert.equal(clientes.length, 1)
})

t('avisa acionável fora dos 12 conhecidos (planilha mudou)', () => {
  assert.deepEqual(acionaveisDesconhecidos({ 'Aumentar TPV': 10 }), [])
  assert.deepEqual(acionaveisDesconhecidos({ 'Vender NFT': 3 }), ['Vender NFT'])
  assert.equal(ACIONAVEIS.length, 12)
})

t('coleta os consultores, para o import avisar quem não casou', () => {
  const { consultores } = lerPlanilhaGeral([
    linha(),
    linha({ 'ID SELLER': '2', 'CONSULTOR': 'RIVALDO BATISTA' }),
  ])
  assert.deepEqual(consultores, ['JESSICA DE BRITO', 'RIVALDO BATISTA'])
})

console.log(`\n${n} testes passaram`)
