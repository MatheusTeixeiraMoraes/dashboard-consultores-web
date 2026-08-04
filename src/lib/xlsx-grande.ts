// Leitor de .xlsx grande demais para a biblioteca `xlsx`.
//
// POR QUE ISTO EXISTE
//
// A planilha da rota Inter/Hexa Recife tem 74 MB no disco e 653 MB de XML
// dentro do zip: 145 linhas com conteúdo e ~1 milhão de linhas em branco que o
// Excel salvou formatadas. Nesse arquivo, `xlsx.read()` (0.18.5) NÃO levanta
// erro — devolve `wb.SheetNames = ['Planilha1']` e `wb.Sheets['Planilha1'] ===
// undefined`. Medido aqui: 3 s, 815 MB de RSS e zero linha. Quem chamasse
// `sheet_to_json` receberia `[]` e a tela diria "planilha vazia" para um arquivo
// cheio — o pior tipo de falha, a silenciosa. No navegador, com menos memória
// que o Node, a aba trava antes disso.
//
// A causa é a biblioteca materializar o XML da aba inteiro como UMA string
// JavaScript. 653 MB de UTF-8 viram ~1,3 GB em UTF-16 e passam do teto de
// string do V8.
//
// A SAÍDA
//
// Ler o zip na mão e descomprimir a aba em STREAM, com `DecompressionStream`
// (nativo do navegador, sem dependência nova), processando as linhas conforme
// chegam. A memória fica constante e o arquivo inteiro sai em ~8 s.
//
// LIMITES ACEITOS (por isso existe o fallback para a `xlsx` em quem chama)
//
//  - Lê só a PRIMEIRA aba — é o que todos os imports do projeto usam.
//  - Não interpreta data do Excel (número serial + formato). A planilha Hexa não
//    tem coluna de data; se um dia tiver, este leitor devolveria o número cru.
//  - Só .xlsx (zip + OOXML). .xls e .csv não passam por aqui.

/** Entrada do zip que interessa: onde estão os bytes e como estão comprimidos. */
interface EntradaZip {
  nome: string
  metodo: number
  tamanhoComprimido: number
  offsetLocal: number
}

const ler32 = (v: DataView, p: number) => v.getUint32(p, true)
const ler16 = (v: DataView, p: number) => v.getUint16(p, true)
const ler64 = (v: DataView, p: number) => Number(v.getBigUint64(p, true))

/** Lê o diretório central do zip (inclusive zip64) e devolve as entradas. */
async function lerDiretorio(arquivo: Blob): Promise<Map<string, EntradaZip>> {
  const cauda = Math.min(arquivo.size, 66_000)   // EOCD + comentário máximo
  const fim = new DataView(await arquivo.slice(arquivo.size - cauda, arquivo.size).arrayBuffer())

  let eocd = -1
  for (let i = fim.byteLength - 22; i >= 0; i--) {
    if (ler32(fim, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Não parece um .xlsx (fim do zip não encontrado).')

  let offset = ler32(fim, eocd + 16)
  let tamanho = ler32(fim, eocd + 12)
  let total = ler16(fim, eocd + 10)

  // zip64: os campos de 32 bits saturam em 0xffffffff e o valor real vive no
  // registro estendido. Sem isto, um arquivo grande apontaria para offset errado.
  if (offset === 0xffffffff || tamanho === 0xffffffff || total === 0xffff) {
    let loc = -1
    for (let i = eocd - 20; i >= 0; i--) {
      if (ler32(fim, i) === 0x07064b50) { loc = i; break }
    }
    if (loc < 0) throw new Error('Zip64 sem localizador — arquivo corrompido?')
    const inicio = ler64(fim, loc + 8)
    const z64 = new DataView(await arquivo.slice(inicio, inicio + 56).arrayBuffer())
    total = ler64(z64, 32)
    tamanho = ler64(z64, 40)
    offset = ler64(z64, 48)
  }

  const dir = new DataView(await arquivo.slice(offset, offset + tamanho).arrayBuffer())
  const bytes = new Uint8Array(dir.buffer)
  const utf8 = new TextDecoder()
  const entradas = new Map<string, EntradaZip>()

  let p = 0
  for (let i = 0; i < total && p + 46 <= dir.byteLength; i++) {
    if (ler32(dir, p) !== 0x02014b50) break
    const metodo = ler16(dir, p + 10)
    let tamComp = ler32(dir, p + 20)
    let tamDesc = ler32(dir, p + 24)
    const nomeLen = ler16(dir, p + 28)
    const extraLen = ler16(dir, p + 30)
    const comentLen = ler16(dir, p + 32)
    let offsetLocal = ler32(dir, p + 42)
    const nome = utf8.decode(bytes.subarray(p + 46, p + 46 + nomeLen))

    if (tamDesc === 0xffffffff || tamComp === 0xffffffff || offsetLocal === 0xffffffff) {
      let e = p + 46 + nomeLen
      const fimExtra = e + extraLen
      while (e + 4 <= fimExtra) {
        const id = ler16(dir, e)
        const tam = ler16(dir, e + 2)
        let q = e + 4
        if (id === 0x0001) {
          if (tamDesc === 0xffffffff) { tamDesc = ler64(dir, q); q += 8 }
          if (tamComp === 0xffffffff) { tamComp = ler64(dir, q); q += 8 }
          if (offsetLocal === 0xffffffff) { offsetLocal = ler64(dir, q) }
        }
        e += 4 + tam
      }
    }

    entradas.set(nome, { nome, metodo, tamanhoComprimido: tamComp, offsetLocal })
    p += 46 + nomeLen + extraLen + comentLen
  }
  return entradas
}

/**
 * Onde começam os BYTES de uma entrada.
 *
 * O offset do diretório aponta para o cabeçalho local, cujo tamanho varia (nome
 * e campo extra podem diferir do que está no diretório) — por isso é preciso ler
 * os 30 bytes do cabeçalho em vez de assumir um tamanho fixo.
 */
async function inicioDosDados(arquivo: Blob, e: EntradaZip): Promise<number> {
  const cab = new DataView(await arquivo.slice(e.offsetLocal, e.offsetLocal + 30).arrayBuffer())
  if (ler32(cab, 0) !== 0x04034b50) throw new Error(`Cabeçalho inválido em ${e.nome}.`)
  return e.offsetLocal + 30 + ler16(cab, 26) + ler16(cab, 28)
}

function descomprimir(pedaco: Blob, metodo: number): ReadableStream<Uint8Array> {
  if (metodo === 0) return pedaco.stream() as ReadableStream<Uint8Array>
  if (metodo !== 8) throw new Error(`Compressão não suportada no zip (método ${metodo}).`)
  // O cast é só de tipo: o lib.dom declara a entrada do DecompressionStream como
  // BufferSource, que não casa com ReadableStream<Uint8Array> na assinatura de
  // pipeThrough. Em execução é exatamente o mesmo objeto.
  const inflar = new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
  return (pedaco.stream() as ReadableStream<Uint8Array>).pipeThrough(inflar)
}

async function fatia(arquivo: Blob, e: EntradaZip): Promise<Blob> {
  const inicio = await inicioDosDados(arquivo, e)
  return arquivo.slice(inicio, inicio + e.tamanhoComprimido)
}

/** Descomprime uma entrada pequena inteira (workbook.xml, rels, sharedStrings). */
async function textoDaEntrada(arquivo: Blob, e: EntradaZip): Promise<string> {
  return new Response(descomprimir(await fatia(arquivo, e), e.metodo)).text()
}

const ESCAPES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function desescapar(s: string): string {
  if (!s.includes('&')) return s   // caminho rápido: a esmagadora maioria das células
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, c: string) => {
    if (c[0] !== '#') return ESCAPES[c] ?? _
    const n = c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)
    return Number.isFinite(n) ? String.fromCodePoint(n) : _
  })
}

/** "AA" → 26 (índice 0-based da coluna). */
export function indiceColuna(ref: string): number {
  let n = 0
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Tabela de strings compartilhadas; ausente em planilhas com strings inline. */
function lerSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
    desescapar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')),
  )
}

const RE_CELULA = /<c\s[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g
const RE_REF = /\sr="([A-Z]+)\d+"/
const RE_TIPO = /\st="([^"]+)"/
const RE_V = /<v>([\s\S]*?)<\/v>/
const RE_T = /<t[^>]*>([\s\S]*?)<\/t>/g

function valorDaCelula(celula: string, sst: string[]): string {
  const tipo = RE_TIPO.exec(celula)?.[1]
  if (tipo === 'inlineStr') {
    return desescapar([...celula.matchAll(RE_T)].map(m => m[1]).join(''))
  }
  const v = RE_V.exec(celula)?.[1]
  if (v == null) return ''
  if (tipo === 's') return sst[Number(v)] ?? ''
  return desescapar(v)
}

export interface OpcoesXlsxGrande {
  /** Progresso 0–1, para a tela não parecer travada nos ~8 s do arquivo grande. */
  aoProgredir?: (fracao: number) => void
}

/**
 * Lê a primeira aba de um .xlsx e devolve uma linha por objeto, com as chaves
 * vindas do cabeçalho — o MESMO formato de `utils.sheet_to_json(ws, { defval:
 * '' })`, para poder trocar um pelo outro sem mexer em quem consome.
 *
 * Linhas totalmente vazias são descartadas (é o que sobra do 1 milhão de linhas
 * formatadas). O arquivo inteiro é percorrido: não paro na primeira sequência de
 * vazias porque um bloco em branco no meio faria o import comer o resto da
 * planilha em silêncio — e importar pela metade é pior que não importar.
 */
export async function lerXlsxEmStream(
  arquivo: Blob,
  { aoProgredir }: OpcoesXlsxGrande = {},
): Promise<Record<string, string>[]> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador não suporta leitura em stream (DecompressionStream).')
  }

  const entradas = await lerDiretorio(arquivo)

  // Qual XML é a primeira aba: workbook.xml dá o r:id, o .rels dá o caminho.
  // O palpite "sheet1.xml" existe porque o Excel quase sempre gera assim, mas
  // planilhas que já perderam abas podem começar em sheet2.xml.
  let caminhoAba = 'xl/worksheets/sheet1.xml'
  const wbEntry = entradas.get('xl/workbook.xml')
  const relsEntry = entradas.get('xl/_rels/workbook.xml.rels')
  if (wbEntry && relsEntry) {
    const rid = /<sheet[^>]*r:id="([^"]+)"/.exec(await textoDaEntrada(arquivo, wbEntry))?.[1]
    if (rid) {
      const rels = await textoDaEntrada(arquivo, relsEntry)
      const alvo = new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
      if (alvo) caminhoAba = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`
    }
  }

  const abaEntry = entradas.get(caminhoAba)
  if (!abaEntry) throw new Error('Não encontrei a primeira aba dentro do arquivo.')

  const sstEntry = entradas.get('xl/sharedStrings.xml')
  const sst = sstEntry ? lerSharedStrings(await textoDaEntrada(arquivo, sstEntry)) : []

  const leitor = descomprimir(await fatia(arquivo, abaEntry), abaEntry.metodo).getReader()
  const decoder = new TextDecoder()

  let buffer = ''
  let cabecalho: string[] = []
  const linhas: Record<string, string>[] = []
  let lidos = 0

  /** Processa as linhas completas que já estão no buffer. */
  function consumir() {
    for (;;) {
      const fim = buffer.indexOf('</row>')
      if (fim === -1) break
      const inicio = buffer.indexOf('<row')
      if (inicio === -1 || inicio > fim) { buffer = buffer.slice(fim + 6); continue }
      const xmlLinha = buffer.slice(inicio, fim + 6)
      buffer = buffer.slice(fim + 6)

      // Caminho rápido para a linha vazia: sem <v> e sem <t>, não há valor
      // nenhum. É o que corta o custo das ~1 milhão de linhas formatadas.
      if (!xmlLinha.includes('<v>') && !xmlLinha.includes('<t')) continue

      const celulas: { col: number; valor: string }[] = []
      for (const m of xmlLinha.matchAll(RE_CELULA)) {
        const ref = RE_REF.exec(m[0])?.[1]
        if (!ref) continue
        const valor = valorDaCelula(m[0], sst)
        if (valor !== '') celulas.push({ col: indiceColuna(ref), valor })
      }
      if (celulas.length === 0) continue

      if (cabecalho.length === 0) {
        // Primeira linha com conteúdo = cabeçalho. Coluna sem título vira
        // "Coluna N" para não colidir com outra vazia (sheet_to_json faz igual).
        const largura = Math.max(...celulas.map(c => c.col)) + 1
        cabecalho = Array.from({ length: largura }, (_, i) => `Coluna ${i + 1}`)
        for (const c of celulas) cabecalho[c.col] = c.valor
        continue
      }

      const linha: Record<string, string> = {}
      for (const nome of cabecalho) linha[nome] = ''      // defval: '' — mesma promessa da xlsx
      for (const c of celulas) {
        const nome = cabecalho[c.col]
        if (nome !== undefined) linha[nome] = c.valor     // coluna além do cabeçalho é ignorada
      }
      linhas.push(linha)
    }
  }

  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    lidos += value.byteLength
    buffer += decoder.decode(value, { stream: true })
    consumir()
    aoProgredir?.(Math.min(1, lidos / Math.max(abaEntry.tamanhoComprimido, 1)))
  }
  buffer += decoder.decode()
  consumir()
  aoProgredir?.(1)

  return linhas
}
