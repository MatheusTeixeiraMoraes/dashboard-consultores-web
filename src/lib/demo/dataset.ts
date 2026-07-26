/**
 * Dados de demonstração — carteira, score e rotas de uma operação fictícia.
 *
 * Existe para gravar vídeo/portfólio sem expor a operação real. NADA aqui toca
 * o banco: o dataset é gerado em memória a cada processo e servido no lugar do
 * Supabase quando o modo demo está ligado (ver `src/lib/demo/README.md`).
 *
 * Tudo é DETERMINÍSTICO (PRNG com semente fixa). Duas execuções produzem os
 * mesmos números, e é isso que permite servir o mesmo dataset no servidor e no
 * navegador sem a tela "piscar" valores diferentes entre o HTML e a hidratação.
 *
 * As colunas são as do schema real (supabase/schema.sql e as migrations) porque
 * as telas leem coluna a coluna — dataset com nome de coluna errado vira tela
 * vazia sem erro. Os nomes das chaves de `metricas` vêm de `src/lib/pilares.ts`,
 * o contrato único das planilhas.
 */

// Imports relativos (e não pelo alias `@/`) para o dataset e o motor rodarem
// direto no Node, sem bundler — é o que permite o teste em `motor.test.mjs`.
import { PILARES, PILAR_KEYS } from '../pilares.ts'
import type { PilarKey } from '../types.ts'

// ---------------------------------------------------------------------------
// Aleatoriedade com semente — mesma entrada, mesma saída, sempre.
// ---------------------------------------------------------------------------

function mulberry32(semente: number) {
  let a = semente
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** UUID de mentira, estável por (prefixo, índice). Só precisa ser único e parecer id. */
function uuid(prefixo: string, i: number): string {
  const h = (n: number, tam: number) => n.toString(16).padStart(tam, '0').slice(-tam)
  const semente = [...prefixo].reduce((acc, c) => acc * 31 + c.charCodeAt(0), 7) >>> 0
  return `${h(semente ^ i, 8)}-${h(i, 4)}-4${h(semente, 3)}-a${h(i * 7, 3)}-${h(semente + i, 12)}`
}

// ---------------------------------------------------------------------------
// Datas
//
// As planilhas ficam ancoradas numa data fixa para que servidor e navegador
// gerem exatamente o mesmo dataset (âncora derivada do relógio divergiria na
// virada do dia entre um fuso e outro). As ROTAS, essas sim, andam com o
// calendário — a Agenda mostrando visitas de meses atrás estragaria o vídeo, e
// `rotas` só é lida no servidor, então não há risco de divergência.
// ---------------------------------------------------------------------------

/** Data da planilha mais recente. Atualize se o vídeo for gravado bem depois. */
const DATA_BASE = '2026-07-24'

function somaDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Três quinzenas: a atual e duas anteriores (Comparar Datas e Histórico). */
const DATAS = [somaDias(DATA_BASE, -28), somaDias(DATA_BASE, -14), DATA_BASE]
const DATA_ATUAL = DATAS[DATAS.length - 1]

// ---------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------

const CONSULTORES = [
  'Ana Beatriz Rocha', 'Carlos Eduardo Lima', 'Mariana Duarte', 'Rafael Antunes',
  'Juliana Vasques', 'Thiago Moreira', 'Patrícia Nogueira', 'Bruno Sales',
  'Camila Ferraz', 'Diego Barbosa', 'Letícia Amaral', 'Vinícius Prado',
]

const LIDERES = ['Renata Coelho', 'Marcos Tavares']

/** Persona exibida no lugar do usuário real enquanto o modo demo está ligado. */
export const ADMIN_DEMO = {
  id: uuid('admin', 0),
  nome: 'Alex Martins',
  email: 'alex.martins@empresa-demo.com.br',
  role: 'admin' as const,
  id_carteira: null,
  ativo: true,
  created_at: `${somaDias(DATA_BASE, -400)}T09:00:00.000Z`,
  updated_at: `${DATA_ATUAL}T09:00:00.000Z`,
}

// ---------------------------------------------------------------------------
// Geografia — cidades reais para o mapa do Radar fazer sentido.
// ---------------------------------------------------------------------------

const CIDADES: { cidade: string; lat: number; lng: number; bairros: string[] }[] = [
  { cidade: 'São Paulo',      lat: -23.5505, lng: -46.6333, bairros: ['Pinheiros', 'Tatuapé', 'Santana', 'Ipiranga', 'Lapa', 'Vila Mariana', 'Butantã'] },
  { cidade: 'Guarulhos',      lat: -23.4543, lng: -46.5337, bairros: ['Centro', 'Vila Galvão', 'Bom Clima', 'Picanço'] },
  { cidade: 'Osasco',         lat: -23.5324, lng: -46.7916, bairros: ['Centro', 'Km 18', 'Presidente Altino'] },
  { cidade: 'Santo André',    lat: -23.6639, lng: -46.5383, bairros: ['Centro', 'Vila Assunção', 'Utinga'] },
  { cidade: 'São Bernardo',   lat: -23.6914, lng: -46.5646, bairros: ['Centro', 'Rudge Ramos', 'Ferrazópolis'] },
  { cidade: 'Barueri',        lat: -23.5106, lng: -46.8761, bairros: ['Alphaville', 'Centro', 'Jardim Belval'] },
  { cidade: 'Campinas',       lat: -22.9099, lng: -47.0626, bairros: ['Cambuí', 'Barão Geraldo', 'Centro', 'Taquaral'] },
]

const RUAS = [
  'Rua das Palmeiras', 'Av. Brasil', 'Rua Sete de Setembro', 'Av. Paulista',
  'Rua XV de Novembro', 'Av. Santos Dumont', 'Rua João Pessoa', 'Av. das Nações',
  'Rua Dom Pedro II', 'Rua Marechal Deodoro', 'Av. Independência', 'Rua Barão do Rio Branco',
]

/** Ramos de comércio de rua — é a carteira típica de maquininha. */
const RAMOS = [
  { nome: 'Mercearia', mcc: 'Supermercados' },
  { nome: 'Padaria', mcc: 'Padarias' },
  { nome: 'Salão', mcc: 'Salões de Beleza' },
  { nome: 'Barbearia', mcc: 'Salões de Beleza' },
  { nome: 'Lanchonete', mcc: 'Restaurantes' },
  { nome: 'Pizzaria', mcc: 'Restaurantes' },
  { nome: 'Farmácia', mcc: 'Farmácias' },
  { nome: 'Pet Shop', mcc: 'Pet Shop' },
  { nome: 'Auto Center', mcc: 'Automotivo' },
  { nome: 'Boutique', mcc: 'Vestuário' },
  { nome: 'Papelaria', mcc: 'Papelaria' },
  { nome: 'Hortifruti', mcc: 'Hortifruti' },
  { nome: 'Açaí', mcc: 'Restaurantes' },
  { nome: 'Ótica', mcc: 'Óticas' },
  { nome: 'Loja de Materiais', mcc: 'Construção' },
]

const SOBRENOMES_FANTASIA = [
  'do Bairro', 'Central', 'Express', 'da Praça', 'Popular', 'Prime', 'da Esquina',
  'São Jorge', 'Bom Preço', 'Ideal', 'Real', 'Estrela', 'Progresso', 'Aliança',
]

// ---------------------------------------------------------------------------
// Tipos das linhas (espelham o schema)
// ---------------------------------------------------------------------------

export interface BancoDemo {
  profiles: Record<string, unknown>[]
  pillar_config: Record<string, unknown>[]
  score_uploads: Record<string, unknown>[]
  score_consultor_resultados: Record<string, unknown>[]
  clientes: Record<string, unknown>[]
  mp_carteira: Record<string, unknown>[]
  mp_acionaveis: Record<string, unknown>[]
  rotas: Record<string, unknown>[]
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

/** Metas vigentes — iguais às de produção, que são configuração e não dado. */
const METAS: Record<PilarKey, { meta: number; pontos_max: number; unidade: '%' | 'numero'; categoria: 'atuacao' | 'resultado' }> = {
  awareness:     { meta: 47.5,  pontos_max: 1.5, unidade: '%',      categoria: 'atuacao' },
  produtividade: { meta: 6.0,   pontos_max: 0.5, unidade: 'numero', categoria: 'atuacao' },
  aderencia:     { meta: 60.0,  pontos_max: 1.0, unidade: '%',      categoria: 'atuacao' },
  net_churn:     { meta: -1.5,  pontos_max: 3.0, unidade: '%',      categoria: 'resultado' },
  tpv:           { meta: 106.0, pontos_max: 1.0, unidade: '%',      categoria: 'resultado' },
  acionaveis:    { meta: 22.4,  pontos_max: 3.0, unidade: '%',      categoria: 'resultado' },
}

const STATUS_CARTEIRA = ['ATIVO', 'ATIVO', 'ATIVO', 'ATIVO', 'INATIVO', 'CHURN', 'REATIVADO']
const QUARTIS = ['P1', 'P2', 'P3', 'P4']
const RECORRENCIAS = ['Alta', 'Média', 'Baixa']
const STATUS_CREDITO = ['Pré-aprovado', 'Sem oferta', 'Em análise', 'Contratado']

const ACIONAVEIS = [
  'Limpeza de balcão 1x',
  'Limpeza de balcão parcelado',
  'Aumentar TPV',
  'Reativar cliente',
  'Oferta de crédito',
  'Atualizar cadastro',
]

function gerar(): BancoDemo {
  const rnd = mulberry32(20260724)
  const escolha = <T,>(lista: T[]): T => lista[Math.floor(rnd() * lista.length)]
  const entre = (min: number, max: number) => min + rnd() * (max - min)
  const inteiro = (min: number, max: number) => Math.floor(entre(min, max + 1))

  // --- profiles ---------------------------------------------------------
  const profiles: Record<string, unknown>[] = [ADMIN_DEMO]

  LIDERES.forEach((nome, i) => {
    profiles.push({
      id: uuid('lider', i),
      nome,
      email: `${nome.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ /g, '.')}@empresa-demo.com.br`,
      role: 'lider',
      id_carteira: null,
      ativo: true,
      created_at: `${somaDias(DATA_BASE, -300)}T09:00:00.000Z`,
      updated_at: `${DATA_ATUAL}T09:00:00.000Z`,
    })
  })

  const carteiraDe: Record<string, string> = {}
  CONSULTORES.forEach((nome, i) => {
    const idCarteira = `C${String(101 + i)}`
    carteiraDe[nome] = idCarteira
    profiles.push({
      id: uuid('consultor', i),
      nome,
      email: `${nome.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ /g, '.')}@empresa-demo.com.br`,
      role: 'consultor',
      id_carteira: idCarteira,
      ativo: true,
      created_at: `${somaDias(DATA_BASE, -250 + i * 3)}T09:00:00.000Z`,
      updated_at: `${DATA_ATUAL}T09:00:00.000Z`,
    })
  })

  // --- pillar_config ----------------------------------------------------
  const pillar_config = PILAR_KEYS.map((key, i) => ({
    id: uuid('pilar', i),
    pilar_key: key,
    label: PILARES[key].label,
    categoria: METAS[key].categoria,
    meta: METAS[key].meta,
    pontos_max: METAS[key].pontos_max,
    unidade: METAS[key].unidade,
    tipo_comp: 'ge',
    updated_at: `${DATA_ATUAL}T09:00:00.000Z`,
    updated_by: ADMIN_DEMO.id,
  }))

  // --- score_uploads + score_consultor_resultados -----------------------
  //
  // "Talento base" por consultor: quem vai bem tende a ir bem em todos os
  // pilares e nas três datas. Sem isso o ranking embaralha a cada data e o
  // gráfico de evolução vira ruído — não parece dado de operação real.
  const talento = CONSULTORES.map((_, i) => 0.28 + (i / CONSULTORES.length) * 0.62 + entre(-0.08, 0.08))

  const score_uploads: Record<string, unknown>[] = []
  const score_consultor_resultados: Record<string, unknown>[] = []
  let up = 0
  let res = 0

  DATAS.forEach((data, di) => {
    // Tendência de melhora ao longo das datas: o vídeo mostra evolução.
    const maré = di * 0.05

    PILAR_KEYS.forEach(pilarKey => {
      const uploadId = uuid('upload', up)
      score_uploads.push({
        id: uploadId,
        uploaded_by: ADMIN_DEMO.id,
        pilar_key: pilarKey,
        filename: `${pilarKey}_${data.split('-').reverse().join('.')}.xlsx`,
        mes_referencia: data.slice(0, 8) + '01',
        data_referencia: data,
        record_count: CONSULTORES.length,
        uploaded_at: `${data}T18:${String(10 + up % 40).padStart(2, '0')}:00.000Z`,
      })
      up++

      CONSULTORES.forEach((nome, ci) => {
        const forca = Math.min(0.98, Math.max(0.05, talento[ci] + maré + entre(-0.12, 0.12)))
        const spec = PILARES[pilarKey]
        const cfg = METAS[pilarKey]

        // Métricas coerentes com a força — e a métrica principal e o score
        // contam a MESMA história (score alto com métrica ruim denunciaria o
        // dado falso na hora).
        const metricas: Record<string, unknown> = {}
        let valorPrincipal = 0

        switch (pilarKey) {
          case 'awareness': {
            const visitados = inteiro(60, 140)
            const responderam = Math.round(visitados * (0.2 + forca * 0.55))
            valorPrincipal = (responderam / visitados) * 100
            metricas['Sellers visitados'] = visitados
            metricas['Sellers que responderam pesquisa'] = responderam
            metricas['%Awareness'] = valorPrincipal
            break
          }
          case 'produtividade': {
            const visitas = inteiro(90, 190)
            const efetivas = Math.round(visitas * (0.45 + forca * 0.4))
            const diasUteis = 21
            valorPrincipal = 3.2 + forca * 5.4
            metricas['Visitas'] = visitas
            metricas['Visitas efetivas'] = efetivas
            metricas['Sellers visitados'] = Math.round(efetivas * 0.85)
            metricas['Visitas por dia útil'] = visitas / diasUteis
            metricas['Visitas efetivas por dia útil'] = efetivas / diasUteis
            metricas['Prod média por dia útil'] = valorPrincipal
            break
          }
          case 'aderencia': {
            const agendados = inteiro(70, 160)
            const aderentes = Math.round(agendados * (0.3 + forca * 0.6))
            valorPrincipal = (aderentes / agendados) * 100
            metricas['Sellers agendados'] = agendados
            metricas['Sellers aderentes à agenda'] = aderentes
            metricas['Sellers visitados'] = Math.round(agendados * (0.5 + forca * 0.45))
            metricas['%Aderência à agenda'] = valorPrincipal
            break
          }
          case 'tpv': {
            const passado = entre(380_000, 1_450_000)
            valorPrincipal = 88 + forca * 32
            const atual = passado * (valorPrincipal / 100)
            const sellers = inteiro(150, 320)
            metricas['TPV Total mês atual'] = atual
            metricas['TPV Total mês passado'] = passado
            metricas['TPV médio mês atual'] = atual / sellers
            metricas['TPV médio mês passado'] = passado / sellers
            metricas['Variação de TPV versus mês passado'] = valorPrincipal
            break
          }
          case 'net_churn': {
            const passado = inteiro(180, 340)
            valorPrincipal = -9 + forca * 12
            const atual = Math.round(passado * (1 + valorPrincipal / 100))
            metricas['Sellers ativos mês atual'] = atual
            metricas['Sellers ativos mês passado'] = passado
            metricas['Sellers em churn'] = Math.max(0, passado - atual) + inteiro(4, 18)
            metricas['Sellers Reativados'] = inteiro(3, 22)
            metricas['%Net churn'] = valorPrincipal
            break
          }
          case 'acionaveis': {
            const tarefas = inteiro(120, 420)
            valorPrincipal = 6 + forca * 34
            const revertido = Math.round(tarefas * (valorPrincipal / 100))
            metricas['Total Acionáveis Tarefas'] = tarefas
            metricas['Total Acionáveis Revertido'] = revertido
            metricas['Total Acionáveis %Tarefa-Revertido'] = valorPrincipal
            break
          }
        }

        // O score do MP não é linear; aqui é uma curva suave que respeita a
        // meta (bater a meta ≈ 70% dos pontos) e o teto do pilar.
        //
        // Proporcional à força, SEM piso nem teto artificial. Já teve as duas
        // coisas aqui, e as duas denunciavam dado gerado: com o teto, os
        // melhores saturavam no mesmo valor e o ranking abria com dois
        // consultores empatados na mesma casa decimal. Deixando a fração seguir
        // a força (que tem ruído por consultor, pilar e data), as posições saem
        // naturalmente distintas e ninguém crava o 10,00 do teto.
        const bateuMeta = valorPrincipal >= cfg.meta
        const fracao = bateuMeta
          ? 0.7 + 0.24 * forca
          : Math.max(0, forca * 0.72)
        const score = Math.round(cfg.pontos_max * fracao * 100) / 100

        score_consultor_resultados.push({
          id: uuid('res', res++),
          upload_id: uploadId,
          id_carteira: carteiraDe[nome],
          consultor_nome: nome,
          pilar_key: pilarKey,
          valor_metrica: Math.round(valorPrincipal * 100) / 100,
          score_planilha: score,
          metricas,
          mes_referencia: data.slice(0, 8) + '01',
          data_referencia: data,
          total_a_reverter: null,
        })
        void spec
      })
    })
  })

  // --- clientes + mp_carteira + mp_acionaveis ---------------------------
  //
  // As três tabelas compartilham `seller_id` de propósito: é assim que as telas
  // cruzam cadastro (endereço/GPS) com o snapshot do MP (TPV/status).
  const clientes: Record<string, unknown>[] = []
  const mp_carteira: Record<string, unknown>[] = []
  const mp_acionaveis: Record<string, unknown>[] = []

  let ci = 0
  let mc = 0
  let ma = 0

  CONSULTORES.forEach((consultor, idx) => {
    // Cada consultor atua em 2 cidades vizinhas — carteira espalhada pelo
    // estado inteiro não existe no mundo real e estragaria o mapa.
    const base = CIDADES[idx % CIDADES.length]
    const vizinha = CIDADES[(idx + 3) % CIDADES.length]
    // ~90 por consultor ≈ 1,1 mil clientes e ~3,2 mil linhas de snapshot — a
    // mesma ordem de grandeza da operação real. Não é capricho: abaixo de mil
    // linhas o `buscarTudo` nunca pagina, e a demonstração deixaria de exercitar
    // justamente o caminho que as telas de carteira usam em produção.
    const quantos = inteiro(75, 105)

    for (let k = 0; k < quantos; k++) {
      const local = rnd() < 0.75 ? base : vizinha
      const bairro = escolha(local.bairros)
      const ramo = escolha(RAMOS)
      const sellerId = String(200_000_000 + ci * 137 + idx * 11)
      const nomeFantasia = `${ramo.nome} ${escolha(SOBRENOMES_FANTASIA)}`

      // ~12% da carteira é "stub" da reconciliação: veio da planilha e ainda
      // não foi cadastrado em campo. É o que alimenta o "Pendente de
      // identificação" da Visão Geral — sem isso aquele número fica sempre 0.
      const pendente = rnd() < 0.12
      const cnpj = rnd() < 0.7

      clientes.push({
        id: uuid('cliente', ci),
        consultor_nome: consultor,
        seller_id: sellerId,
        seller_nome: pendente ? '' : nomeFantasia,
        seller_telefone: pendente ? null : `(11) 9${inteiro(4000, 9999)}-${inteiro(1000, 9999)}`,
        seller_email: pendente || rnd() < 0.4 ? null : `contato@${ramo.nome.toLowerCase().replace(/ /g, '')}${k}.com.br`,
        doc_tipo: pendente ? null : (cnpj ? 'CNPJ' : 'CPF'),
        cpf_cnpj: pendente
          ? null
          : cnpj
            ? `${inteiro(10, 99)}.${inteiro(100, 999)}.${inteiro(100, 999)}/0001-${inteiro(10, 99)}`
            : `${inteiro(100, 999)}.${inteiro(100, 999)}.${inteiro(100, 999)}-${inteiro(10, 99)}`,
        cidade: pendente ? '' : local.cidade,
        bairro: pendente ? '' : bairro,
        endereco_completo: pendente ? '' : `${escolha(RUAS)}, ${inteiro(10, 2400)} — ${bairro}, ${local.cidade}/SP`,
        // Jitter de ~±0,045° ≈ 5 km: marcadores espalhados pelo bairro em vez
        // de empilhados no centro da cidade.
        lat: pendente ? null : local.lat + entre(-0.045, 0.045),
        lng: pendente ? null : local.lng + entre(-0.045, 0.045),
        status_atualizacao: pendente ? 'Cliente não atualizado' : (rnd() < 0.62 ? 'Cliente Atualizado' : 'Cliente não atualizado'),
        em_carteira: true,
        created_at: `${somaDias(DATA_BASE, -inteiro(30, 220))}T10:00:00.000Z`,
        updated_at: `${somaDias(DATA_BASE, -inteiro(1, 29))}T10:00:00.000Z`,
        created_by: ADMIN_DEMO.id,
      })
      ci++

      // Snapshot do MP nas três datas — a Queda de TPV compara duas delas.
      const statusFixo = escolha(STATUS_CARTEIRA)
      const tpvBase = entre(1_800, 62_000)
      const quartil = escolha(QUARTIS)
      const qtdAcion = inteiro(0, 4)

      DATAS.forEach((data, di) => {
        const inativo = statusFixo === 'INATIVO' || statusFixo === 'CHURN'
        // Quem está em churn vem caindo: a tela de Queda de TPV precisa ter o
        // que mostrar, senão abre vazia.
        const fator = inativo ? 1 - di * 0.32 : 1 + entre(-0.18, 0.26)
        const atual = Math.max(0, tpvBase * fator)
        const anterior = tpvBase * (inativo ? 1 - (di - 1) * 0.32 : 1 + entre(-0.15, 0.2))

        mp_carteira.push({
          id: uuid('mpc', mc++),
          data_referencia: data,
          seller_id: sellerId,
          consultor_nome: consultor,
          status: statusFixo,
          quartil,
          prio: inteiro(1, 449),
          tpv_mes_atual: Math.round(atual * 100) / 100,
          tpv_mes_passado: Math.round(Math.max(0, anterior) * 100) / 100,
          status_credito: escolha(STATUS_CREDITO),
          mcc: ramo.mcc,
          recorrencia: escolha(RECORRENCIAS),
          ultimo_contato: rnd() < 0.11 ? null : somaDias(data, -inteiro(1, 75)),
          pesquisa_recente: rnd() < 0.5 ? null : somaDias(data, -inteiro(5, 120)),
          multicontas: rnd() < 0.2 ? inteiro(2, 4) : 1,
          tpv_outras_contas: rnd() < 0.2 ? Math.round(entre(500, 20_000) * 100) / 100 : null,
          oportunidade_1x: rnd() < 0.3,
          valor_1x: rnd() < 0.3 ? Math.round(entre(300, 9_000) * 100) / 100 : null,
          ating_1x: Math.round(rnd() * 100) / 100,
          revertido_1x: rnd() < 0.18,
          oportunidade_parc: rnd() < 0.25,
          valor_parc: rnd() < 0.25 ? Math.round(entre(500, 15_000) * 100) / 100 : null,
          ating_parc: Math.round(rnd() * 100) / 100,
          revertido_parc: rnd() < 0.15,
          qtd_acionaveis: qtdAcion,
          created_at: `${data}T08:00:00.000Z`,
        })

        // Acionáveis só da planilha vigente — é o que as telas consultam.
        if (data === DATA_ATUAL) {
          const sorteados = [...ACIONAVEIS].sort(() => rnd() - 0.5).slice(0, qtdAcion)
          sorteados.forEach(acionavel => {
            mp_acionaveis.push({
              id: uuid('mpa', ma++),
              data_referencia: data,
              seller_id: sellerId,
              consultor_nome: consultor,
              acionavel,
              created_at: `${data}T08:00:00.000Z`,
            })
          })
        }
      })
    }
  })

  // --- rotas (Agenda) ---------------------------------------------------
  //
  // Datas relativas a HOJE para a Agenda abrir com algo marcado. Ver a nota
  // sobre datas no topo do arquivo.
  const hoje = hojeISO()
  const rotas: Record<string, unknown>[] = []
  const NOMES_ROTA = ['Rota Centro', 'Rota Zona Sul', 'Visitas P1', 'Reativação', 'Rota Alphaville', 'Fila de churn']

  for (let i = 0; i < 14; i++) {
    const consultor = CONSULTORES[i % CONSULTORES.length]
    const meus = clientes.filter(c => c.consultor_nome === consultor && c.lat != null)
    if (meus.length === 0) continue

    const paradas = meus.slice(0, inteiro(3, 6)).map((c, ordem) => ({
      ordem,
      cliente_id: c.id,
      seller_id: c.seller_id,
      seller_nome: c.seller_nome,
      endereco: c.endereco_completo,
      lat: c.lat,
      lng: c.lng,
    }))
    const cidade = CIDADES[i % CIDADES.length]

    rotas.push({
      id: uuid('rota', i),
      consultor_nome: consultor,
      nome_rota: `${NOMES_ROTA[i % NOMES_ROTA.length]} — ${cidade.cidade}`,
      // De 3 dias atrás a 10 dias à frente: a Agenda mostra passado e futuro.
      data_visita: somaDias(hoje, -3 + i),
      partida_endereco: `${escolha(RUAS)}, ${inteiro(10, 900)} — ${cidade.cidade}/SP`,
      partida_lat: cidade.lat,
      partida_lng: cidade.lng,
      chegada_endereco: null,
      chegada_lat: null,
      chegada_lng: null,
      stops: paradas,
      distancia_km: Math.round(entre(8, 46) * 10) / 10,
      tempo_minutos: Math.round(entre(45, 210)),
      created_at: `${somaDias(hoje, -10 + i)}T11:00:00.000Z`,
      updated_at: `${somaDias(hoje, -10 + i)}T11:00:00.000Z`,
      created_by: ADMIN_DEMO.id,
    })
  }

  return {
    profiles,
    pillar_config,
    score_uploads,
    score_consultor_resultados,
    clientes,
    mp_carteira,
    mp_acionaveis,
    rotas,
  }
}

// Gerado uma vez por processo. As telas leem MUITO (a Visão Geral sozinha faz
// sete consultas), e regerar a cada uma custaria caro à toa.
let cache: BancoDemo | null = null

export function bancoDemo(): BancoDemo {
  if (!cache) cache = gerar()
  return cache
}

/** Tabelas que o modo demo conhece. Consulta a outra tabela é erro, não vazio. */
export const TABELAS_DEMO = [
  'profiles', 'pillar_config', 'score_uploads', 'score_consultor_resultados',
  'clientes', 'mp_carteira', 'mp_acionaveis', 'rotas',
] as const

export type TabelaDemo = (typeof TABELAS_DEMO)[number]
