import assert from 'node:assert/strict'
import {
  gerarToken, hashToken, estadoDoConvite, expiraEm, normalizarNome, emailValido,
} from './convites.ts'

let passou = 0
function t(nome, fn) {
  try { fn(); console.log('  ok:', nome); passou++ }
  catch (e) { console.error('  FALHOU:', nome, '\n   ', e.message); process.exitCode = 1 }
}

const VALIDO = { expira_em: '2999-01-01T00:00:00Z', usado_em: null, revogado_em: null }

t('token é aleatório e não se repete', () => {
  const vistos = new Set()
  for (let i = 0; i < 500; i++) vistos.add(gerarToken())
  assert.equal(vistos.size, 500)
})

t('token é url-safe: nada de +, / ou = para escapar no link', () => {
  for (let i = 0; i < 200; i++) assert.match(gerarToken(), /^[A-Za-z0-9_-]+$/)
})

t('hash é estável e não devolve o token', () => {
  const tk = gerarToken()
  assert.equal(hashToken(tk), hashToken(tk))
  assert.notEqual(hashToken(tk), tk)
  assert.match(hashToken(tk), /^[0-9a-f]{64}$/)
})

t('tokens diferentes geram hashes diferentes', () => {
  assert.notEqual(hashToken('a'), hashToken('b'))
})

t('convite novo é válido', () => {
  assert.equal(estadoDoConvite(VALIDO), 'valido')
})

t('expirado: a comparação é <=, então o instante exato do vencimento já morreu', () => {
  const agora = new Date('2026-07-29T12:00:00Z')
  assert.equal(estadoDoConvite({ ...VALIDO, expira_em: '2026-07-29T12:00:00Z' }, agora), 'expirado')
  assert.equal(estadoDoConvite({ ...VALIDO, expira_em: '2026-07-29T12:00:01Z' }, agora), 'valido')
})

t('usado uma vez, nunca mais', () => {
  assert.equal(estadoDoConvite({ ...VALIDO, usado_em: '2026-07-29T10:00:00Z' }), 'usado')
})

t('REVOGADO vence USADO e EXPIRADO: cortar acesso não pode virar "gere outro"', () => {
  const revogadoEExpirado = {
    expira_em: '2020-01-01T00:00:00Z',
    usado_em: '2020-01-01T00:00:00Z',
    revogado_em: '2020-01-02T00:00:00Z',
  }
  assert.equal(estadoDoConvite(revogadoEExpirado), 'revogado')
})

t('usado vence expirado', () => {
  assert.equal(estadoDoConvite({
    expira_em: '2020-01-01T00:00:00Z', usado_em: '2020-01-01T00:00:00Z', revogado_em: null,
  }), 'usado')
})

t('expiraEm soma dias corridos', () => {
  const base = new Date('2026-07-29T12:00:00Z')
  assert.equal(expiraEm(7, base).toISOString(), '2026-08-05T12:00:00.000Z')
})

t('normalizarNome casa as grafias que a planilha mistura', () => {
  assert.equal(normalizarNome('LIDIO XAVIER'), normalizarNome('  lidio xavier  '))
  assert.equal(normalizarNome('NICOLAS'), normalizarNome('Nicolás'))
  assert.equal(normalizarNome('REINELDES CRISTIANE'), 'reineldes cristiane')
})

t('normalizarNome NÃO junta pessoas diferentes', () => {
  assert.notEqual(
    normalizarNome('FELIPE ANTONIO CARLOS DELFINO'),
    normalizarNome('FELIPE DELFINO'),
  )
})

t('emailValido rejeita o que o formulário não deve deixar passar', () => {
  for (const bom of ['a@b.co', 'renata.silva@inovvagroup.com.br']) assert.ok(emailValido(bom), bom)
  for (const ruim of ['', 'sem-arroba', 'a@b', 'a b@c.co', '@b.co']) assert.ok(!emailValido(ruim), ruim)
})

console.log(`\n${passou} testes passaram`)
