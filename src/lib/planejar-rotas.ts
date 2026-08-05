// Divide uma carteira de clientes em N rotas por PROXIMIDADE GEOGRÁFICA.
//
// O problema real: "quero visitar estes 140 clientes em 5 dias, sem ficar
// atravessando a região toda todo dia". Isso não é ordenar paradas (o OSRM já
// faz isso dentro de uma rota) — é decidir QUEM vai com QUEM antes de ordenar.
//
// POR QUE NÃO AGRUPAR POR BAIRRO
//
// Seria o óbvio, e é pior. A base tem 82 bairros para 140 clientes: agrupar por
// nome daria dezenas de grupos minúsculos, e ainda separaria vizinhos que só
// estão em bairros diferentes por causa de uma rua divisória — enquanto juntaria
// dois "Centro" de cidades distintas. O que importa para a rota é distância, e
// distância está nas coordenadas, não no nome. O bairro entra depois, como
// RÓTULO do grupo, para a pessoa reconhecer a região no mapa mental dela.
//
// COMO FUNCIONA
//
// k-means com atribuição balanceada. O k-means puro resolveria a proximidade mas
// entregaria grupos de 60 e de 8 — inútil para dividir a semana. Aqui cada
// rodada de atribuição respeita um teto de tamanho, então os grupos saem
// parelhos e continuam geograficamente coesos.
//
// É determinístico de propósito (PRNG com semente fixa): rodar duas vezes com a
// mesma base tem que dar o mesmo plano, senão a pessoa não consegue conferir o
// que mudou.

export interface ClienteGeo {
  seller_id: string
  lat: number
  lng: number
  bairro: string
  cidade: string
  tpv: number | null
  consultor_nome: string
}

export interface GrupoRota {
  /** 1, 2, 3… na ordem em que devem ser percorridos ao longo dos dias. */
  indice: number
  clientes: ClienteGeo[]
  /** Bairros que mais aparecem, para nomear e reconhecer a região. */
  bairrosPrincipais: string[]
  cidades: string[]
  tpvTotal: number
  /** Maior distância entre dois clientes do grupo, em km — o "espalhamento". */
  diametroKm: number
  /** Centro geográfico, para o rótulo e para ordenar os grupos entre si. */
  centro: { lat: number; lng: number }
}

const RAIO_TERRA_KM = 6371
const grau = (g: number) => (g * Math.PI) / 180

/** Haversine — mesma fórmula do radar, repetida aqui para a lib ficar sem dependência. */
function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = grau(b.lat - a.lat)
  const dLng = grau(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(grau(a.lat)) * Math.cos(grau(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RAIO_TERRA_KM * Math.asin(Math.sqrt(s))
}

/**
 * Projeta lat/lng num plano onde distância euclidiana ≈ distância real.
 *
 * Sem a correção por cos(latitude), um grau de longitude valeria o mesmo que um
 * de latitude — e em Recife (−8°) um grau de longitude vale ~110 km enquanto o
 * de latitude vale ~111: quase igual, o erro seria pequeno aqui. A correção fica
 * porque a carteira pode crescer para outras regiões, e no Sul do país a
 * diferença já distorce o agrupamento.
 */
function projetar(clientes: ClienteGeo[]): { x: number; y: number }[] {
  const latMedia = clientes.reduce((s, c) => s + c.lat, 0) / clientes.length
  const k = Math.cos(grau(latMedia))
  return clientes.map(c => ({ x: c.lng * k, y: c.lat }))
}

/** PRNG com semente — o mesmo plano tem que sair toda vez (mulberry32). */
function prng(semente: number) {
  let a = semente
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type P = { x: number; y: number }
const dist2 = (a: P, b: P) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

/** Centros iniciais bem espalhados (k-means++), com o sorteio preso à semente. */
function centrosIniciais(pontos: P[], k: number, aleatorio: () => number): P[] {
  const centros: P[] = [pontos[Math.floor(aleatorio() * pontos.length)]]
  while (centros.length < k) {
    const pesos = pontos.map(p => Math.min(...centros.map(c => dist2(p, c))))
    const total = pesos.reduce((s, w) => s + w, 0)
    if (total === 0) { centros.push(pontos[Math.floor(aleatorio() * pontos.length)]); continue }
    let alvo = aleatorio() * total
    let i = 0
    while (i < pontos.length - 1 && (alvo -= pesos[i]) > 0) i++
    centros.push(pontos[i])
  }
  return centros.map(c => ({ ...c }))
}

/**
 * Atribui cada ponto a um grupo respeitando o teto de tamanho.
 *
 * Guloso pela distância: monta todos os pares (ponto, grupo), ordena do mais
 * perto para o mais longe e vai fixando — pulando quem já foi atribuído e grupo
 * que já encheu. Com 140 pontos e 5 grupos são 700 pares, então a simplicidade
 * vale mais que a esperteza aqui.
 */
function atribuirBalanceado(pontos: P[], centros: P[], teto: number): number[] {
  const pares: { p: number; c: number; d: number }[] = []
  for (let p = 0; p < pontos.length; p++) {
    for (let c = 0; c < centros.length; c++) pares.push({ p, c, d: dist2(pontos[p], centros[c]) })
  }
  pares.sort((a, b) => a.d - b.d)

  const grupoDe = new Array<number>(pontos.length).fill(-1)
  const tamanho = new Array<number>(centros.length).fill(0)
  let faltam = pontos.length

  for (const { p, c } of pares) {
    if (faltam === 0) break
    if (grupoDe[p] !== -1 || tamanho[c] >= teto) continue
    grupoDe[p] = c
    tamanho[c]++
    faltam--
  }
  // Sobra teórica (todos os grupos cheios antes do fim): joga no menos cheio.
  for (let p = 0; p < grupoDe.length; p++) {
    if (grupoDe[p] !== -1) continue
    const menor = tamanho.indexOf(Math.min(...tamanho))
    grupoDe[p] = menor
    tamanho[menor]++
  }
  return grupoDe
}

/** Mediana — resiste a ponto perdido, ao contrário da média. */
function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(v.length / 2)
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2
}

/**
 * Tira da divisão quem está longe demais para caber num dia de visitas.
 *
 * Isto não é preciosismo — apareceu na base real: um cliente em **Natal/RN**,
 * a ~700 km de Recife, era absorvido por uma das rotas e o "raio" daquele dia
 * saltava de 7 km para 699 km. O agrupamento continuava "correto" (ele ficou
 * com o grupo mais próximo), mas a rota virava ficção: ninguém visita Recife e
 * Natal no mesmo dia.
 *
 * O centro é a MEDIANA de lat/lng, não a média: com média, o próprio ponto
 * distante puxa o centro na direção dele e ajuda a se esconder.
 *
 * Quem fica de fora não some — volta em `fora`, para a tela mostrar e alguém
 * decidir (visita à parte, corrigir endereço errado, ou ignorar).
 */
export function separarForaDeArea(
  clientes: ClienteGeo[],
  raioMaximoKm = 60,
): { dentro: ClienteGeo[]; fora: ClienteGeo[]; centro: { lat: number; lng: number } } {
  const validos = clientes.filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng))
  if (validos.length === 0) return { dentro: [], fora: [], centro: { lat: 0, lng: 0 } }

  const centro = {
    lat: mediana(validos.map(c => c.lat)),
    lng: mediana(validos.map(c => c.lng)),
  }
  const dentro: ClienteGeo[] = []
  const fora: ClienteGeo[] = []
  for (const c of validos) {
    (distanciaKm(centro, c) <= raioMaximoKm ? dentro : fora).push(c)
  }
  return { dentro, fora, centro }
}

/**
 * Distância de um ponto ao centro da operação.
 *
 * Serve para dois avisos: "este cliente está fora de área" e "esta PARTIDA está
 * longe da região". O segundo apareceu na prática — um plano foi criado com o
 * GPS de quem planejava (em São Paulo) e as cinco rotas saíram com ~2.800 km,
 * porque cada dia incluía a viagem até Recife.
 */
export function distanciaAoCentroKm(
  ponto: { lat: number; lng: number },
  centro: { lat: number; lng: number },
): number {
  return distanciaKm(centro, ponto)
}

export interface OpcoesPlano {
  /** Quantas rotas (dias). */
  quantidade: number
  /** Semente do sorteio — trocar gera um plano alternativo com a mesma base. */
  semente?: number
  /** Rodadas de refinamento. 30 já estabiliza numa base deste tamanho. */
  iteracoes?: number
}

/**
 * Divide os clientes em `quantidade` grupos geograficamente coesos e de tamanho
 * parecido.
 *
 * Quem não tem coordenada NÃO entra — sem lat/lng não há como decidir a região,
 * e enfiar num grupo qualquer só faria a rota parecer completa. Cabe a quem
 * chama mostrar os que ficaram de fora.
 */
export function planejarRotas(
  clientes: ClienteGeo[],
  { quantidade, semente = 42, iteracoes = 30 }: OpcoesPlano,
): GrupoRota[] {
  const validos = clientes.filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng))
  if (validos.length === 0 || quantidade < 1) return []

  const k = Math.min(Math.floor(quantidade), validos.length)
  const pontos = projetar(validos)
  const aleatorio = prng(semente)
  let centros = centrosIniciais(pontos, k, aleatorio)
  const teto = Math.ceil(validos.length / k)
  let grupoDe = atribuirBalanceado(pontos, centros, teto)

  for (let it = 0; it < iteracoes; it++) {
    const soma = Array.from({ length: k }, () => ({ x: 0, y: 0, n: 0 }))
    for (let i = 0; i < pontos.length; i++) {
      const g = soma[grupoDe[i]]
      g.x += pontos[i].x; g.y += pontos[i].y; g.n++
    }
    const novos = soma.map((s, i) => (s.n === 0 ? centros[i] : { x: s.x / s.n, y: s.y / s.n }))
    const mexeu = novos.some((c, i) => dist2(c, centros[i]) > 1e-12)
    centros = novos
    const nova = atribuirBalanceado(pontos, centros, teto)
    const igual = nova.every((g, i) => g === grupoDe[i])
    grupoDe = nova
    if (!mexeu && igual) break
  }

  const porGrupo: ClienteGeo[][] = Array.from({ length: k }, () => [])
  validos.forEach((c, i) => porGrupo[grupoDe[i]].push(c))

  const grupos = porGrupo
    .filter(g => g.length > 0)
    .map(membros => {
      const centro = {
        lat: membros.reduce((s, c) => s + c.lat, 0) / membros.length,
        lng: membros.reduce((s, c) => s + c.lng, 0) / membros.length,
      }
      const contagem = new Map<string, number>()
      for (const c of membros) {
        const b = (c.bairro || '').trim()
        if (b) contagem.set(b, (contagem.get(b) ?? 0) + 1)
      }
      let diametro = 0
      for (let i = 0; i < membros.length; i++) {
        for (let j = i + 1; j < membros.length; j++) {
          const d = distanciaKm(membros[i], membros[j])
          if (d > diametro) diametro = d
        }
      }
      return {
        indice: 0,
        clientes: membros,
        bairrosPrincipais: [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b]) => b),
        cidades: [...new Set(membros.map(c => c.cidade).filter(Boolean))].sort(),
        tpvTotal: membros.reduce((s, c) => s + (c.tpv ?? 0), 0),
        diametroKm: diametro,
        centro,
      }
    })

  /* Ordem dos grupos entre si: encadeia do mais a oeste para o vizinho mais
   * próximo ainda não usado. Assim "dia 1, dia 2, dia 3" avança pela região em
   * vez de pular de um lado ao outro do mapa — importa para quem dorme fora ou
   * quer emendar o fim de um dia no começo do outro. */
  const ordenados: typeof grupos = []
  const restantes = [...grupos]
  let atual = restantes.reduce((oeste, g) => (g.centro.lng < oeste.centro.lng ? g : oeste), restantes[0])
  while (restantes.length > 0) {
    const i = restantes.indexOf(atual)
    restantes.splice(i, 1)
    ordenados.push(atual)
    if (restantes.length === 0) break
    atual = restantes.reduce((perto, g) =>
      distanciaKm(atual.centro, g.centro) < distanciaKm(atual.centro, perto.centro) ? g : perto,
    restantes[0])
  }

  return ordenados.map((g, i) => ({ ...g, indice: i + 1 }))
}

/** Nome sugerido: "Dia 1 · Boa Viagem, Centro". */
export function nomeSugerido(grupo: GrupoRota, prefixo = 'Dia'): string {
  const regiao = grupo.bairrosPrincipais.slice(0, 2).join(', ')
  return regiao ? `${prefixo} ${grupo.indice} · ${regiao}` : `${prefixo} ${grupo.indice}`
}
