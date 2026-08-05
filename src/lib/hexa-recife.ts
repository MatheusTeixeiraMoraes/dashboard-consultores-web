// Leitura da planilha da rota Inter/Hexa Recife — categoria TEMPORÁRIA.
//
// É a lista de clientes aprovados da ação, já cruzada com o cadastro do
// dashboard: cada linha traz o lado "planilha" (documento, TPV, CNAE, status
// operacional) e o lado "dashboard" (nome, telefone, endereço, GPS, consultor),
// mais as conferências que o cruzamento já resolveu ("Consultor confere?",
// "Está na carteira?", "Cadastro completo?").
//
// Esta base NÃO se mistura com `clientes`: é snapshot temporário, vive em
// hexa_recife_clientes e sai inteira quando a rota acabar. O porquê está na
// migration 2026-08-04_rota_inter_hexa_recife.sql.
//
// Como as outras planilhas do projeto, o contrato das colunas mora num lugar
// só: se o arquivo mudar de layout, mexe aqui.

import { findCol, norm } from './pilares.ts'

/** Cabeçalhos da planilha, exatamente como vieram no arquivo de 04/08/2026. */
export const COLUNAS = {
  documento: 'Documento',
  documentoTipo: 'Tipo',
  nomeComercio: 'Nome Comércio (planilha)',
  tpv: 'TPV',
  cnae: 'CNAE',
  mcc: 'MCC',
  regiao: 'Região',
  consultorPlanilha: 'Consultor (planilha)',
  statusOperacional: 'Status Operacional',
  casouPor: 'Casou por',
  sellerId: 'Seller ID',
  sellerNome: 'Nome no dashboard',
  telefone: 'Telefone',
  email: 'E-mail',
  docTipo: 'Doc tipo (dashboard)',
  cpfCnpj: 'CPF/CNPJ (dashboard)',
  cidade: 'Cidade',
  bairro: 'Bairro',
  endereco: 'Endereço completo',
  lat: 'Lat',
  lng: 'Lng',
  consultorDashboard: 'Consultor (dashboard)',
  consultorConfere: 'Consultor confere?',
  statusCadastro: 'Status do cadastro',
  emCarteira: 'Está na carteira?',
  cadastroCompleto: 'Cadastro completo?',
  camposFaltando: 'Campos faltando',
} as const

/**
 * Colunas sem as quais a tela não tem o que mostrar.
 *
 * `Seller ID` identifica a linha e `Consultor (dashboard)` é quem a RLS usa
 * para decidir de quem é o cliente — sem ela, a base inteira ficaria invisível
 * para todo consultor. As demais podem faltar: a planilha é gerada por um
 * cruzamento que pode mudar de recorte, e um endereço ausente é dado faltando,
 * não arquivo errado.
 */
const OBRIGATORIAS = [
  COLUNAS.sellerId,
  COLUNAS.consultorDashboard,
  COLUNAS.sellerNome,
  COLUNAS.statusOperacional,
] as const

/** Erro de leitura — import parcial deixa a base pior do que não importar. */
export class ErroPlanilhaHexa extends Error {}

/**
 * Valor em dinheiro no formato pt-BR do Excel: "R$ 231.056,66" → 231056.66.
 *
 * Ponto é SEMPRE separador de milhar aqui e vírgula é SEMPRE o decimal — é
 * assim que a coluna TPV veio nas 145 linhas. Não tento adivinhar formato:
 * chutar por magnitude é como "R$ 231.056" viraria 231,06.
 *
 * O separador entre "R$" e o número no arquivo é NBSP (U+00A0), não espaço
 * comum — é o que o Excel grava ao formatar como moeda. O `\s` do JavaScript já
 * cobre NBSP; o teste guarda esse caso porque é o tipo de caractere invisível
 * que faz `Number()` devolver NaN e a coluna inteira virar null sem explicação.
 */
export function paraDinheiroBR(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').replace(/[\s ]/g, '')
  if (!s || s === '-') return null
  const limpo = s.replace(/R\$/i, '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/**
 * Coordenada: "-8.0542767000000008" → -8.0542767.
 *
 * Aqui o ponto é o DECIMAL (regra oposta à do dinheiro — por isso são duas
 * funções e não uma esperta). Aceita vírgula como decimal para o caso de alguém
 * reexportar a planilha com locale pt-BR. Fora da faixa de lat/lng vira null:
 * coordenada inválida no mapa é pino no lugar errado, pior que pino nenhum.
 */
export function paraCoordenada(v: unknown, tipo: 'lat' | 'lng'): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(n) || n === 0) return null
  const limite = tipo === 'lat' ? 90 : 180
  return Math.abs(n) <= limite ? n : null
}

/**
 * "Sim" → true. "Não", "NÃO — divergente", "Não (fora da planilha geral)",
 * vazio → false.
 *
 * Compara só o começo porque a planilha qualifica o "não" com o motivo, e o
 * motivo é texto livre que muda entre gerações do arquivo.
 */
export function paraSimNao(v: unknown): boolean {
  return norm(String(v ?? '')).startsWith('sim')
}

/** Uma linha da planilha, pronta para virar linha de hexa_recife_clientes. */
export interface HexaClienteLido {
  seller_id: string
  documento: string
  documento_tipo: string
  nome_comercio: string
  tpv: number | null
  cnae: string
  mcc: string
  regiao: string
  consultor_planilha: string
  status_operacional: string
  casou_por: string
  seller_nome: string
  seller_telefone: string | null
  seller_email: string | null
  doc_tipo: 'CPF' | 'CNPJ' | null
  cpf_cnpj: string | null
  cidade: string
  bairro: string
  endereco_completo: string
  lat: number | null
  lng: number | null
  consultor_nome: string
  consultor_confere: boolean
  status_cadastro: string
  em_carteira: boolean
  cadastro_completo: boolean
  campos_faltando: string
}

export interface LidoHexa {
  clientes: HexaClienteLido[]
  /** Nomes de consultor (lado dashboard) encontrados — o import mostra na tela. */
  consultores: string[]
  /** Cabeçalhos esperados que a planilha não trouxe. Não bloqueia; avisa. */
  colunasAusentes: string[]
}

/**
 * Lê a planilha inteira ou levanta erro.
 *
 * Levanta em vez de pular a linha porque o import é delete+insert: importar
 * metade deixa a categoria com um pedaço da rota faltando e nada na tela
 * dizendo isso.
 */
export function lerPlanilhaHexa(linhas: Record<string, unknown>[]): LidoHexa {
  if (linhas.length === 0) throw new ErroPlanilhaHexa('Planilha vazia.')

  const h = Object.keys(linhas[0])
  const col = Object.fromEntries(
    Object.entries(COLUNAS).map(([k, alvo]) => [k, findCol(h, alvo)]),
  ) as Record<keyof typeof COLUNAS, string | null>

  const faltando = OBRIGATORIAS.filter(alvo => !findCol(h, alvo))
  if (faltando.length > 0) {
    throw new ErroPlanilhaHexa(
      `Colunas obrigatórias não encontradas: ${faltando.join(', ')}.\n\n` +
      `A planilha veio com: ${h.map(x => x.trim()).join(', ')}`,
    )
  }

  const txt = (r: Record<string, unknown>, c: string | null) => (c ? String(r[c] ?? '').trim() : '')
  const clientes: HexaClienteLido[] = []
  const consultores = new Set<string>()
  const vistos = new Set<string>()

  linhas.forEach((r, i) => {
    const seller_id = txt(r, col.sellerId)
    if (!seller_id) return   // linha em branco no fim da planilha (o arquivo tem ~1 milhão delas)

    if (vistos.has(seller_id)) {
      throw new ErroPlanilhaHexa(
        `Linha ${i + 2}: o seller ${seller_id} aparece duas vezes na planilha. ` +
        `Isso normalmente é arquivo errado (dois recortes colados).`,
      )
    }
    vistos.add(seller_id)

    const consultor_nome = txt(r, col.consultorDashboard)
    if (consultor_nome) consultores.add(consultor_nome)

    const docTipoBruto = txt(r, col.docTipo).toUpperCase()
    const cpf_cnpj = txt(r, col.cpfCnpj)

    clientes.push({
      seller_id,
      documento: txt(r, col.documento),
      documento_tipo: txt(r, col.documentoTipo),
      nome_comercio: txt(r, col.nomeComercio),
      tpv: paraDinheiroBR(r[col.tpv ?? '']),
      cnae: txt(r, col.cnae),
      mcc: txt(r, col.mcc),
      regiao: txt(r, col.regiao),
      consultor_planilha: txt(r, col.consultorPlanilha),
      status_operacional: txt(r, col.statusOperacional),
      casou_por: txt(r, col.casouPor),
      seller_nome: txt(r, col.sellerNome),
      seller_telefone: txt(r, col.telefone) || null,
      seller_email: txt(r, col.email) || null,
      doc_tipo: docTipoBruto === 'CPF' || docTipoBruto === 'CNPJ' ? docTipoBruto : null,
      cpf_cnpj: cpf_cnpj || null,
      cidade: txt(r, col.cidade),
      bairro: txt(r, col.bairro),
      endereco_completo: txt(r, col.endereco),
      lat: paraCoordenada(r[col.lat ?? ''], 'lat'),
      lng: paraCoordenada(r[col.lng ?? ''], 'lng'),
      consultor_nome,
      // Ausência da coluna não pode virar alarme falso: sem a coluna de
      // conferência, o padrão é "confere" / "está na carteira" / "completo".
      consultor_confere: col.consultorConfere ? paraSimNao(r[col.consultorConfere]) : true,
      status_cadastro: txt(r, col.statusCadastro),
      em_carteira: col.emCarteira ? paraSimNao(r[col.emCarteira]) : true,
      cadastro_completo: col.cadastroCompleto ? paraSimNao(r[col.cadastroCompleto]) : true,
      campos_faltando: txt(r, col.camposFaltando),
    })
  })

  if (clientes.length === 0) {
    throw new ErroPlanilhaHexa(`Nenhuma linha com "${COLUNAS.sellerId}" preenchido.`)
  }

  return {
    clientes,
    consultores: [...consultores].sort(),
    colunasAusentes: Object.values(COLUNAS).filter(alvo => !findCol(h, alvo)),
  }
}

/**
 * Uma linha como ela volta do banco — o que as telas da categoria consomem.
 *
 * Não estende `HexaClienteLido` de propósito: o select das telas não traz
 * documento, região nem "casou por" (dados da originação que ninguém exibe), e
 * herdar prometeria campos que não vêm.
 */
export interface HexaCliente {
  id: string
  seller_id: string
  seller_nome: string
  nome_comercio: string
  tpv: number | null
  mcc: string
  cnae: string
  status_operacional: string
  seller_telefone: string | null
  seller_email: string | null
  doc_tipo: 'CPF' | 'CNPJ' | null
  cpf_cnpj: string | null
  cidade: string
  bairro: string
  endereco_completo: string
  lat: number | null
  lng: number | null
  consultor_nome: string
  consultor_planilha: string
  consultor_confere: boolean
  status_cadastro: string
  em_carteira: boolean
  cadastro_completo: boolean
  campos_faltando: string
  importado_em: string
}

/**
 * Papéis que entram na categoria — precisa espelhar a policy de SELECT em
 * `hexa_recife_clientes` (migration 2026-08-05_hexa_recife_inclui_lider.sql).
 *
 * Mora aqui, e não solto em cada página, porque quem já mudou três vezes muda
 * de novo: com a lista repetida, o painel e o roteirizar divergiriam e alguém
 * cairia numa tela em branco sem entender o porquê. A tela é conveniência — o
 * que fecha o acesso de verdade é a RLS.
 *
 * `string[]` e não `UserRole[]` de propósito: este arquivo é importado pelos
 * testes que rodam direto no Node, e o alias `@/lib/types` não resolve lá.
 */
export const GESTAO_HEXA: string[] = ['admin', 'dono', 'lider']

/** Colunas que as telas da categoria leem. Vale para o painel e o roteirizar. */
export const COLUNAS_HEXA =
  'id, seller_id, seller_nome, nome_comercio, tpv, mcc, cnae, status_operacional, ' +
  'seller_telefone, seller_email, doc_tipo, cpf_cnpj, cidade, bairro, endereco_completo, ' +
  'lat, lng, consultor_nome, consultor_planilha, consultor_confere, status_cadastro, ' +
  'em_carteira, cadastro_completo, campos_faltando, importado_em'

/**
 * A tabela pode ainda não existir: a migration é rodada à mão no SQL Editor do
 * Supabase. Sem isto a tela quebraria com "relation does not exist" — e
 * quebraria para o consultor, que não tem o que fazer a respeito.
 *
 * São DOIS códigos, e isto foi MEDIDO contra o banco real, não deduzido: hoje o
 * PostgREST responde `PGRST205` ("Could not find the table in the schema
 * cache"); `42P01` é o código do próprio Postgres para relação inexistente, que
 * aparece quando a consulta chega até o banco.
 */
const CODIGOS_TABELA_AUSENTE = ['PGRST205', '42P01']

export function tabelaAusente(codigo: string | undefined): boolean {
  return !!codigo && CODIGOS_TABELA_AUSENTE.includes(codigo)
}

// ---------------------------------------------------------------------------
// Entrega painel → roteirizar da categoria
//
// Mesma mecânica do Radar → Roteirizar (localStorage, sem passar pelo banco),
// mas com CHAVE PRÓPRIA: se as duas telas dividissem a chave, uma seleção da
// Hexa poderia cair no Roteirizar da carteira, misturando as duas bases —
// exatamente o que a categoria separada existe para evitar.
// ---------------------------------------------------------------------------

export const CHAVE_HEXA_ROTA = 'hexa_recife_add_to_rota'

export function entregarAoRoteirizarHexa(sellerIds: string[]) {
  localStorage.setItem(CHAVE_HEXA_ROTA, JSON.stringify(sellerIds))
}

/** Devolve os seller_id selecionados no painel (e some com a entrega). */
export function receberDoPainelHexa(): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE_HEXA_ROTA)
    if (!bruto) return []
    localStorage.removeItem(CHAVE_HEXA_ROTA)
    const lista: unknown = JSON.parse(bruto)
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Painel — agregações puras (o mini dashboard só formata o que sai daqui)
// ---------------------------------------------------------------------------

/** O que o painel precisa de cada cliente. Subconjunto do que está no banco. */
export interface HexaClienteResumivel {
  tpv: number | null
  lat: number | null
  lng: number | null
  status_operacional: string
  consultor_nome: string
  cidade: string
  bairro: string
  mcc: string
  status_cadastro: string
  consultor_confere: boolean
  em_carteira: boolean
  cadastro_completo: boolean
}

export interface Fatia {
  nome: string
  n: number
  tpv: number
}

export interface ResumoHexa {
  total: number
  tpvTotal: number
  comGps: number
  semGps: number
  atualizados: number
  divergentes: number
  foraCarteira: number
  incompletos: number
  porStatus: Fatia[]
  porConsultor: Fatia[]
  porCidade: Fatia[]
  porBairro: Fatia[]
  porMcc: Fatia[]
}

/** Agrupa por um campo, somando TPV, do maior grupo para o menor. */
function agrupar(clientes: HexaClienteResumivel[], campo: (c: HexaClienteResumivel) => string): Fatia[] {
  const m = new Map<string, Fatia>()
  for (const c of clientes) {
    const nome = campo(c).trim() || '—'
    const f = m.get(nome)
    if (f) { f.n++; f.tpv += c.tpv ?? 0 }
    else m.set(nome, { nome, n: 1, tpv: c.tpv ?? 0 })
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.tpv - a.tpv)
}

export function resumoHexa(clientes: HexaClienteResumivel[]): ResumoHexa {
  const comGps = clientes.filter(c => c.lat != null && c.lng != null).length
  return {
    total: clientes.length,
    tpvTotal: clientes.reduce((s, c) => s + (c.tpv ?? 0), 0),
    comGps,
    semGps: clientes.length - comGps,
    atualizados: clientes.filter(c => norm(c.status_cadastro) === norm('Cliente Atualizado')).length,
    divergentes: clientes.filter(c => !c.consultor_confere).length,
    foraCarteira: clientes.filter(c => !c.em_carteira).length,
    incompletos: clientes.filter(c => !c.cadastro_completo).length,
    porStatus: agrupar(clientes, c => c.status_operacional),
    porConsultor: agrupar(clientes, c => c.consultor_nome),
    porCidade: agrupar(clientes, c => c.cidade),
    porBairro: agrupar(clientes, c => c.bairro),
    porMcc: agrupar(clientes, c => c.mcc),
  }
}

/** "R$ 231.056,66" — mesmo formato da planilha de origem. */
export function fmtDinheiro(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
}

/** Compacto para KPI: R$ 8,4 mi / R$ 231,1 mil. */
export function fmtDinheiroCurto(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return fmtDinheiro(n)
}
