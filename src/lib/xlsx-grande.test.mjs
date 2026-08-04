// Teste do leitor de .xlsx em stream.
// Roda com `node src/lib/xlsx-grande.test.mjs` (Node 24+: importa o .ts direto,
// e já tem Blob, DecompressionStream e CompressionStream globais — os mesmos
// que o navegador usa, então isto exercita o código de produção, não um dublê).
//
// O teste MONTA um .xlsx de verdade (zip deflate + OOXML) em memória, com os
// casos que quebram parser ingênuo: linha formatada porém vazia, célula inline,
// escape XML, coluna com duas letras (AA) e buraco de coluna no meio.
//
// No fim, se a planilha real da rota Hexa estiver na máquina, confere o número
// de clientes contra ela. Fora dessa máquina o bloco é pulado — teste não pode
// depender de arquivo que não está no repositório.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { lerXlsxEmStream, indiceColuna } from './xlsx-grande.ts'

let n = 0
const t = async (nome, fn) => { await fn(); n++; console.log('  ok:', nome) }

// --- mini construtor de .xlsx (zip) ---------------------------------------

const TABELA_CRC = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function deflateRaw(bytes) {
  const cs = new CompressionStream('deflate-raw')
  const escritor = cs.writable.getWriter()
  escritor.write(bytes); escritor.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}

/** Monta um zip com as entradas dadas ({nome: string xml}), comprimidas. */
async function montarZip(entradas) {
  const utf8 = new TextEncoder()
  const partes = []
  const central = []
  let offset = 0

  for (const [nome, texto] of Object.entries(entradas)) {
    const cru = utf8.encode(texto)
    const comp = await deflateRaw(cru)
    const nomeBytes = utf8.encode(nome)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(8, 8, true)            // método deflate
    local.setUint32(14, crc32(cru), true)
    local.setUint32(18, comp.length, true)
    local.setUint32(22, cru.length, true)
    local.setUint16(26, nomeBytes.length, true)
    partes.push(new Uint8Array(local.buffer), nomeBytes, comp)

    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true); cd.setUint16(6, 20, true)
    cd.setUint16(10, 8, true)
    cd.setUint32(16, crc32(cru), true)
    cd.setUint32(20, comp.length, true)
    cd.setUint32(24, cru.length, true)
    cd.setUint16(28, nomeBytes.length, true)
    cd.setUint32(42, offset, true)
    central.push(new Uint8Array(cd.buffer), nomeBytes)

    offset += 30 + nomeBytes.length + comp.length
  }

  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, Object.keys(entradas).length, true)
  eocd.setUint16(10, Object.keys(entradas).length, true)
  eocd.setUint32(12, tamanhoCentral, true)
  eocd.setUint32(16, offset, true)

  return new Blob([...partes, ...central, new Uint8Array(eocd.buffer)])
}

const WORKBOOK = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Planilha1" sheetId="1" r:id="rId1"/></sheets></workbook>`
const RELS = (alvo) => `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${alvo}"/></Relationships>`
const SST = `<?xml version="1.0"?><sst count="4" uniqueCount="4"><si><t>Seller ID</t></si><si><t>Nome</t></si><si><t>Bar &amp; Restaurante</t></si><si><t>Campos faltando</t></si></sst>`

// Linha 1: cabeçalho (A, B, AA). Linha 2: dados com shared string escapada.
// Linha 3: só formatação, sem valor — é a linha que sobra do milhão em branco.
// Linha 4: célula inline + buraco na coluna B.
const ABA = `<?xml version="1.0"?><worksheet><dimension ref="A1:AA9"/><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="AA1" t="s"><v>3</v></c></row>
<row r="2"><c r="A2" t="str"><v>1178476194</v></c><c r="B2" t="s"><v>2</v></c><c r="AA2"><v>7</v></c></row>
<row r="3" s="4"><c r="A3" s="4"/><c r="B3" s="4"/></row>
<row r="4"><c r="A4" t="inlineStr"><is><t>2560735850</t></is></c><c r="AA4"><v>-8.05</v></c></row>
</sheetData></worksheet>`

// --- testes ---------------------------------------------------------------

await t('AA vira índice 26 (coluna de duas letras)', () => {
  assert.equal(indiceColuna('A'), 0)
  assert.equal(indiceColuna('Z'), 25)
  assert.equal(indiceColuna('AA'), 26)
})

await t('lê a aba resolvendo r:id → rels → sheet1.xml', async () => {
  const zip = await montarZip({
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': RELS('worksheets/sheet1.xml'),
    'xl/sharedStrings.xml': SST,
    'xl/worksheets/sheet1.xml': ABA,
  })
  const linhas = await lerXlsxEmStream(zip)

  assert.equal(linhas.length, 2, 'a linha só-formatação não pode virar registro')
  assert.deepEqual(Object.keys(linhas[0]).length, 27, 'cabeçalho vai de A até AA')
  assert.equal(linhas[0]['Seller ID'], '1178476194')
  assert.equal(linhas[0]['Nome'], 'Bar & Restaurante', 'escape XML tem que voltar ao texto')
  assert.equal(linhas[0]['Campos faltando'], '7')
  assert.equal(linhas[1]['Seller ID'], '2560735850', 'célula inlineStr')
  assert.equal(linhas[1]['Nome'], '', 'coluna sem valor vira string vazia (defval)')
  assert.equal(linhas[0]['Coluna 3'], '', 'coluna sem título ganha nome estável')
})

await t('aba fora do sheet1.xml (rels aponta para outro arquivo)', async () => {
  const zip = await montarZip({
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': RELS('worksheets/sheet7.xml'),
    'xl/sharedStrings.xml': SST,
    'xl/worksheets/sheet7.xml': ABA,
  })
  const linhas = await lerXlsxEmStream(zip)
  assert.equal(linhas.length, 2)
})

await t('progresso vai até 1', async () => {
  const zip = await montarZip({
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': RELS('worksheets/sheet1.xml'),
    'xl/sharedStrings.xml': SST,
    'xl/worksheets/sheet1.xml': ABA,
  })
  const vistos = []
  await lerXlsxEmStream(zip, { aoProgredir: f => vistos.push(f) })
  assert.equal(vistos.at(-1), 1)
})

await t('arquivo que não é zip dá erro claro', async () => {
  await assert.rejects(
    () => lerXlsxEmStream(new Blob(['isto aqui é um txt qualquer'])),
    /não parece um \.xlsx/i,
  )
})

// --- contra a planilha real, se ela estiver nesta máquina -----------------

const REAL = 'C:/Users/mathe/Documents/Material Deshboard Consultores/Planilha recife/Planilha Aprovados Compilada Hexa.xlsx'
if (fs.existsSync(REAL)) {
  await t('planilha real da rota Hexa: 145 clientes, 27 colunas', async () => {
    const blob = await fs.openAsBlob(REAL)
    const linhas = await lerXlsxEmStream(blob)
    assert.equal(linhas.length, 145)
    assert.equal(Object.keys(linhas[0]).length, 27)
    assert.equal(linhas[0]['Seller ID'], '1178476194')
    // NBSP entre "R$" e o número: é assim que o Excel grava moeda, e é o
    // caractere que faria um Number() ingênuo devolver NaN mais adiante.
    assert.equal(linhas[0]['TPV'], `R$${String.fromCharCode(160)}231.056,66`)
    assert.equal(linhas[0]['Consultor (dashboard)'], 'NICOLAS ARTHUR MEDEIROS BERNARDO')
  })
} else {
  console.log('  (pulado: a planilha real não está nesta máquina)')
}

console.log(`\n${n} testes ok`)
