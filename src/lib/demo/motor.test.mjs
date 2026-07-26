// Teste do modo demo: replica as consultas REAIS de cada tela contra o motor.
//
// Roda com `node src/lib/demo/motor.test.mjs` (Node 24 lê .ts direto). Sem
// framework, como os outros testes do projeto.
//
// Por que este teste existe: o modo demo troca a fonte de dados por baixo de
// ~20 telas que não sabem disso. Se uma consulta não for emulada direito, a tela
// não quebra — ela abre VAZIA, sem erro nenhum, e isso só apareceria no meio da
// gravação. Então cada consulta do catálogo é reproduzida aqui exatamente como
// a tela faz, incluindo a string de colunas, e o teste exige linha de volta.

import assert from 'node:assert/strict'
import { executarPlano, executarRpc, reiniciarDemo } from './motor.ts'
import { envolverComDemo } from './construtor.ts'
import { buscarTudo } from '../supabase/buscar-tudo.ts'

let n = 0
const ta = async (nome, fn) => { await fn(); n++; console.log('  ok:', nome) }

// Cliente demo igual ao que o app recebe no servidor.
const supabase = envolverComDemo(
  {},
  async plano => executarPlano(plano),
  async (fn, args) => executarRpc(fn, args),
)

/** Falha com mensagem útil quando a consulta volta vazia ou com erro. */
function exigirLinhas(resp, onde) {
  assert.equal(resp.error, null, `${onde}: erro inesperado — ${resp.error?.message}`)
  assert.ok(Array.isArray(resp.data), `${onde}: data deveria ser lista`)
  assert.ok(resp.data.length > 0, `${onde}: voltou VAZIO (a tela abriria em branco)`)
  return resp.data
}

console.log('\n— fundamentos do motor —')

await ta('as 8 tabelas do dataset têm linhas', async () => {
  for (const tabela of [
    'profiles', 'pillar_config', 'score_uploads', 'score_consultor_resultados',
    'clientes', 'mp_carteira', 'mp_acionaveis', 'rotas',
  ]) {
    exigirLinhas(await supabase.from(tabela).select('*'), tabela)
  }
})

await ta('tabela desconhecida falha alto (não devolve vazio em silêncio)', async () => {
  const r = await supabase.from('tabela_que_nao_existe').select('*')
  assert.ok(r.error, 'deveria ter erro')
  assert.match(r.error.message, /não existe no dataset/)
})

await ta('projeção devolve exatamente as colunas pedidas', async () => {
  const [linha] = exigirLinhas(
    await supabase.from('clientes').select('seller_id, cidade').limit(1),
    'projeção',
  )
  assert.deepEqual(Object.keys(linha).sort(), ['cidade', 'seller_id'])
})

await ta('count exact + head devolve total sem corpo', async () => {
  const r = await supabase.from('clientes').select('*', { count: 'exact', head: true })
  assert.equal(r.data, null, 'head:true não deve trazer corpo')
  assert.ok(r.count > 0, 'count deveria vir preenchido')
})

await ta('single() com 0 linhas devolve PGRST116; maybeSingle() devolve null', async () => {
  const s = await supabase.from('clientes').select('id').eq('seller_id', 'inexistente').single()
  assert.equal(s.data, null)
  assert.equal(s.error?.code, 'PGRST116')

  const m = await supabase.from('clientes').select('id').eq('seller_id', 'inexistente').maybeSingle()
  assert.equal(m.data, null)
  assert.equal(m.error, null, 'maybeSingle não erra com zero linhas')
})

await ta('order desc + limit(1) traz a maior data', async () => {
  const [linha] = exigirLinhas(
    await supabase.from('score_uploads').select('data_referencia')
      .order('data_referencia', { ascending: false }).limit(1),
    'order desc',
  )
  const todas = (await supabase.from('score_uploads').select('data_referencia')).data
    .map(u => u.data_referencia).sort()
  assert.equal(linha.data_referencia, todas[todas.length - 1])
})

await ta('not(col, is, null) descarta nulos', async () => {
  const comGeo = exigirLinhas(
    await supabase.from('clientes').select('lat, lng').not('lat', 'is', null).not('lng', 'is', null),
    'not is null',
  )
  assert.ok(comGeo.every(c => c.lat !== null && c.lng !== null))

  const todos = (await supabase.from('clientes').select('lat')).data
  assert.ok(todos.some(c => c.lat === null), 'o dataset precisa ter cliente sem GPS (os stubs)')
})

await ta('gte/lte filtram faixa de datas', async () => {
  const todas = [...new Set((await supabase.from('mp_carteira').select('data_referencia')).data
    .map(l => l.data_referencia))].sort()
  const faixa = exigirLinhas(
    await supabase.from('mp_carteira').select('seller_id, data_referencia, tpv_mes_atual')
      .gte('data_referencia', todas[1]).lte('data_referencia', todas[todas.length - 1]),
    'gte/lte',
  )
  assert.ok(faixa.every(l => l.data_referencia >= todas[1]))
  assert.ok(!faixa.some(l => l.data_referencia === todas[0]), 'a data anterior à faixa não pode entrar')
})

console.log('\n— o helper buscarTudo (paginação real das telas de carteira) —')

await ta('buscarTudo traz TODAS as linhas, não só as 1000 da 1ª página', async () => {
  const tudo = await buscarTudo((opcoes, de, ate) =>
    supabase.from('mp_carteira').select('seller_id, consultor_nome, data_referencia', opcoes).range(de, ate),
  )
  const total = (await supabase.from('mp_carteira').select('*', { count: 'exact', head: true })).count
  assert.equal(tudo.length, total, 'buscarTudo perdeu linhas na paginação')
  assert.ok(total > 1000, 'o dataset precisa passar de 1000 linhas para este teste valer')
})

console.log('\n— consultas exatas das telas (do catálogo do repo) —')

await ta('Visão Geral', async () => {
  const ultimo = await supabase.from('score_uploads').select('data_referencia')
    .order('data_referencia', { ascending: false }).limit(1)
  const data = exigirLinhas(ultimo, 'geral/uploads')[0].data_referencia

  const ids = exigirLinhas(
    await supabase.from('score_uploads').select('id').eq('data_referencia', data),
    'geral/ids',
  ).map(u => u.id)

  exigirLinhas(await supabase.from('pillar_config').select('pilar_key, meta, unidade'), 'geral/metas')
  exigirLinhas(
    await supabase.from('score_consultor_resultados')
      .select('id_carteira, consultor_nome, pilar_key, score_planilha').in('upload_id', ids),
    'geral/resultados',
  )

  const clientes = await buscarTudo((o, de, ate) =>
    supabase.from('clientes').select('consultor_nome, seller_nome, seller_id', o)
      .eq('em_carteira', true).range(de, ate))
  assert.ok(clientes.length > 0, 'geral/clientes vazio')
})

await ta('Clientes', async () => {
  const clientes = await buscarTudo((o, de, ate) =>
    supabase.from('clientes').select(
      'id, consultor_nome, seller_id, seller_nome, seller_telefone, seller_email, doc_tipo, cpf_cnpj, cidade, bairro, endereco_completo, lat, lng, status_atualizacao', o)
      .eq('em_carteira', true).order('seller_nome', { ascending: true }).range(de, ate))
  assert.ok(clientes.length > 0, 'clientes vazio')

  const mp = await supabase.from('mp_carteira').select('data_referencia')
    .order('data_referencia', { ascending: false }).limit(1).maybeSingle()
  assert.ok(mp.data?.data_referencia, 'clientes/dataMP ausente')

  exigirLinhas(
    await supabase.from('profiles').select('nome').eq('role', 'consultor').order('nome', { ascending: true }),
    'clientes/nomes',
  )
})

await ta('Radar e Roteirizar (só quem tem GPS)', async () => {
  const comGeo = await buscarTudo((o, de, ate) =>
    supabase.from('clientes').select(
      'seller_id, seller_nome, seller_telefone, consultor_nome, cidade, bairro, endereco_completo, lat, lng', o)
      .eq('em_carteira', true).not('lat', 'is', null).not('lng', 'is', null).range(de, ate))
  assert.ok(comGeo.length > 0, 'radar vazio — o mapa abriria sem pino')
  assert.ok(comGeo.every(c => typeof c.lat === 'number' && typeof c.lng === 'number'))
})

await ta('Acionáveis', async () => {
  const dataRef = (await supabase.from('mp_carteira').select('data_referencia')
    .order('data_referencia', { ascending: false }).limit(1).maybeSingle()).data.data_referencia

  const carteira = await buscarTudo((o, de, ate) =>
    supabase.from('mp_carteira').select(
      'seller_id, consultor_nome, status, quartil, prio, tpv_mes_atual, tpv_mes_passado, status_credito, mcc, recorrencia, ultimo_contato, valor_1x, valor_parc, qtd_acionaveis', o)
      .eq('data_referencia', dataRef).order('prio', { ascending: true, nullsFirst: false }).range(de, ate))
  assert.ok(carteira.length > 0, 'acionaveis/carteira vazio')

  const acionaveis = await buscarTudo((o, de, ate) =>
    supabase.from('mp_acionaveis').select('seller_id, acionavel, consultor_nome', o)
      .eq('data_referencia', dataRef).range(de, ate))
  assert.ok(acionaveis.length > 0, 'acionaveis vazio — a fila abriria sem tarefa')
})

await ta('Agenda (ordem por data e criação)', async () => {
  exigirLinhas(
    await supabase.from('rotas').select(
      'id, consultor_nome, nome_rota, data_visita, partida_endereco, partida_lat, partida_lng, chegada_lat, chegada_lng, stops, distancia_km, tempo_minutos, created_at')
      .order('data_visita', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    'agenda',
  )
})

await ta('Histórico (uploads + quem subiu)', async () => {
  const uploads = exigirLinhas(
    await supabase.from('score_uploads')
      .select('id, pilar_key, filename, data_referencia, record_count, uploaded_by')
      .order('data_referencia', { ascending: false }),
    'historico/uploads',
  )
  const ids = [...new Set(uploads.map(u => u.uploaded_by))]
  const autores = exigirLinhas(
    await supabase.from('profiles').select('id, nome').in('id', ids),
    'historico/autores',
  )
  assert.ok(autores[0].nome, 'o autor do upload precisa ter nome')
})

await ta('Meu Desempenho (escopo por id_carteira)', async () => {
  const eu = (await supabase.from('profiles').select('id_carteira').eq('role', 'consultor').limit(1)).data[0]
  const data = (await supabase.from('score_uploads').select('data_referencia')
    .order('data_referencia', { ascending: false }).limit(1)).data[0].data_referencia
  const ids = (await supabase.from('score_uploads').select('id').eq('data_referencia', data)).data.map(u => u.id)

  const meus = exigirLinhas(
    await supabase.from('score_consultor_resultados')
      .select('id_carteira, consultor_nome, pilar_key, score_planilha, metricas, valor_metrica')
      .in('upload_id', ids).eq('id_carteira', eu.id_carteira),
    'meu-score',
  )
  assert.ok(meus.every(r => r.id_carteira === eu.id_carteira), 'vazou score de outro consultor')
  assert.equal(meus.length, 6, 'deveria vir um resultado por pilar')
  assert.ok(meus[0].metricas && Object.keys(meus[0].metricas).length > 0, 'metricas vazio quebra o detalhe do pilar')
})

console.log('\n— coerência entre as tabelas —')

await ta('todo mp_carteira/mp_acionaveis aponta para um cliente existente', async () => {
  const sellers = new Set((await supabase.from('clientes').select('seller_id')).data.map(c => c.seller_id))
  const mp = (await supabase.from('mp_carteira').select('seller_id')).data
  const ac = (await supabase.from('mp_acionaveis').select('seller_id')).data
  assert.ok(mp.every(l => sellers.has(l.seller_id)), 'mp_carteira tem seller órfão')
  assert.ok(ac.every(l => sellers.has(l.seller_id)), 'mp_acionaveis tem seller órfão')
})

await ta('nome do consultor casa entre score, clientes e carteira', async () => {
  const norm = s => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
  const noScore = new Set((await supabase.from('score_consultor_resultados').select('consultor_nome')).data.map(r => norm(r.consultor_nome)))
  const nosClientes = new Set((await supabase.from('clientes').select('consultor_nome')).data.map(c => norm(c.consultor_nome)))
  for (const nome of nosClientes) {
    assert.ok(noScore.has(nome), `consultor "${nome}" tem cliente mas não tem score — a Visão Geral mostraria linha sem nota`)
  }
})

await ta('todo consultor da carteira tem profile (o furo do vínculo por nome)', async () => {
  const norm = s => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
  const perfis = new Set((await supabase.from('profiles').select('nome')).data.map(p => norm(p.nome)))
  const donos = new Set((await supabase.from('mp_carteira').select('consultor_nome')).data.map(l => norm(l.consultor_nome)))
  for (const nome of donos) {
    assert.ok(perfis.has(nome), `"${nome}" tem carteira mas não tem perfil — abriria a tela vazia sem erro`)
  }
})

await ta('a Visão Geral tem o que mostrar em cada card', async () => {
  const clientes = (await supabase.from('clientes').select('seller_nome, seller_id')).data
  const pendentes = clientes.filter(c => !c.seller_nome)
  assert.ok(pendentes.length > 0, 'sem pendente de identificação o card fica sempre zerado')

  const status = new Set((await supabase.from('mp_carteira').select('status')).data.map(l => l.status))
  for (const esperado of ['ATIVO', 'INATIVO', 'CHURN', 'REATIVADO']) {
    assert.ok(status.has(esperado), `faltou status ${esperado} na carteira`)
  }
})

await ta('score fica dentro do teto de cada pilar e o total não passa de 10', async () => {
  const metas = Object.fromEntries((await supabase.from('pillar_config').select('pilar_key, pontos_max')).data
    .map(p => [p.pilar_key, p.pontos_max]))
  const res = (await supabase.from('score_consultor_resultados')
    .select('id_carteira, pilar_key, score_planilha, data_referencia')).data

  for (const r of res) {
    assert.ok(r.score_planilha >= 0 && r.score_planilha <= metas[r.pilar_key],
      `score ${r.score_planilha} fora do teto ${metas[r.pilar_key]} em ${r.pilar_key}`)
  }

  const totais = {}
  for (const r of res) {
    const k = `${r.id_carteira}|${r.data_referencia}`
    totais[k] = (totais[k] ?? 0) + r.score_planilha
  }
  for (const [k, v] of Object.entries(totais)) {
    assert.ok(v <= 10.001, `total ${v} passou de 10 em ${k}`)
  }
})

console.log('\n— escrita: fica na memória, some ao reiniciar —')

await ta('update altera a linha e o select pós-mutação devolve id', async () => {
  const alvo = (await supabase.from('clientes').select('id, seller_nome').limit(1)).data[0]
  const r = await supabase.from('clientes').update({ seller_nome: 'Editado na demo' })
    .eq('id', alvo.id).select('id')
  assert.equal(r.error, null)
  assert.equal(r.data.length, 1)

  const depois = (await supabase.from('clientes').select('seller_nome').eq('id', alvo.id)).data[0]
  assert.equal(depois.seller_nome, 'Editado na demo')
})

await ta('insert cria linha com id e aparece na leitura seguinte', async () => {
  const antes = (await supabase.from('rotas').select('*', { count: 'exact', head: true })).count
  const r = await supabase.from('rotas').insert({
    consultor_nome: 'Ana Beatriz Rocha', nome_rota: 'Rota criada no teste',
    data_visita: '2026-08-01', stops: [],
  }).select('id').single()
  assert.equal(r.error, null)
  assert.ok(r.data.id, 'insert deveria gerar id')

  const depois = (await supabase.from('rotas').select('*', { count: 'exact', head: true })).count
  assert.equal(depois, antes + 1)
})

await ta('upsert ignoreDuplicates: não duplica e não conta o ignorado', async () => {
  const existente = (await supabase.from('clientes').select('seller_id').limit(1)).data[0].seller_id
  const antes = (await supabase.from('clientes').select('*', { count: 'exact', head: true })).count

  const r = await supabase.from('clientes')
    .upsert(
      [{ seller_id: existente, consultor_nome: 'X' }, { seller_id: 'novo-9999', consultor_nome: 'Y' }],
      { onConflict: 'seller_id', ignoreDuplicates: true },
    )
    .select('id')

  const depois = (await supabase.from('clientes').select('*', { count: 'exact', head: true })).count
  assert.equal(depois, antes + 1, 'só o seller novo deveria entrar')
  // A tela de importação usa `data.length` para dizer quantos entraram.
  assert.equal(r.data.length, 1, 'o ignorado não pode aparecer no retorno')
})

await ta('delete sem filtro é recusado', async () => {
  const r = await supabase.from('rotas').delete()
  assert.ok(r.error, 'delete sem filtro deveria falhar')
  assert.equal(r.error.code, 'DEMO_DELETE_SEM_FILTRO')
})

await ta('delete com filtro remove só o alvo', async () => {
  const alvo = (await supabase.from('rotas').select('id').limit(1)).data[0]
  const antes = (await supabase.from('rotas').select('*', { count: 'exact', head: true })).count
  await supabase.from('rotas').delete().eq('id', alvo.id)
  const depois = (await supabase.from('rotas').select('*', { count: 'exact', head: true })).count
  assert.equal(depois, antes - 1)
})

await ta('reiniciarDemo() desfaz tudo que a gravação editou', async () => {
  reiniciarDemo()
  const c = (await supabase.from('clientes').select('seller_nome').eq('seller_nome', 'Editado na demo')).data
  assert.equal(c.length, 0, 'a edição sobreviveu ao reinício')
  const r = (await supabase.from('rotas').select('nome_rota').eq('nome_rota', 'Rota criada no teste')).data
  assert.equal(r.length, 0, 'a rota criada sobreviveu ao reinício')
})

await ta('RPC reconciliar_carteira responde sem aplicar nada', async () => {
  const data = (await supabase.from('mp_carteira').select('data_referencia')
    .order('data_referencia', { ascending: false }).limit(1)).data[0].data_referencia
  const r = await supabase.rpc('reconciliar_carteira', { p_data: data, p_aplicar: true, p_forcar: true })
  assert.equal(r.error, null)
  assert.equal(r.data.aplicado, false, 'a demo nunca deve aplicar reconciliação')
  assert.ok(r.data.total_snapshot > 0)
})

await ta('RPC desconhecida falha alto', async () => {
  const r = await supabase.rpc('funcao_inventada', {})
  assert.ok(r.error)
})

console.log(`\n${n} testes passaram\n`)
