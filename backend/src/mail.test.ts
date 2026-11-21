import test from 'node:test'
import assert from 'node:assert/strict'

process.env.USERS_TABLE = 'users'
process.env.SITE_URL = 'https://example.test'
process.env.EMAIL_SECRET = 'secret'
process.env.SENDER_EMAIL = 'a@example.test'
process.env.API_URL = 'https://api.example.test'

const { unsubscribe, COPY, renderMail } = await import('./mail.ts')

const ev = (method: string, q: Record<string, string>) =>
  ({ queryStringParameters: q, requestContext: { http: { method } } }) as never

test('GET unsubscribe with bad token is refused', async () => {
  const r = (await unsubscribe(ev('GET', { u: 'x', t: 'bad' }))) as { statusCode: number }
  assert.equal(r.statusCode, 400)
})

test('POST unsubscribe with bad token is refused', async () => {
  const r = (await unsubscribe(ev('POST', { u: 'x', t: 'bad' }))) as { statusCode: number }
  assert.equal(r.statusCode, 400)
})

test('unsubscribe page falls back to English for unknown lang', async () => {
  const r = (await unsubscribe(ev('GET', { u: 'x', t: 'bad', lang: 'fr' }))) as { body: string }
  assert.match(r.body, new RegExp(COPY.en.invalid))
})

test('unsubscribe page speaks Spanish with lang=es', async () => {
  const r = (await unsubscribe(ev('GET', { u: 'x', t: 'bad', lang: 'es' }))) as { body: string }
  assert.match(r.body, new RegExp(COPY.es.invalid))
})

test('every EN copy key has an ES counterpart', () => {
  assert.deepEqual(Object.keys(COPY.es).sort(), Object.keys(COPY.en).sort())
})

test('mail links each option with its index and escapes the prompt', () => {
  const { text, html } = renderMail({ lang: 'en', name: 'A', streak: '', q: { prompt: 'x <b>', options: ['a', 'b', 'c', 'd'] }, unsub: 'https://u' })
  for (let i = 0; i < 4; i++) assert.ok(html.includes(`https://example.test/?a=${i}`) && text.includes(`?a=${i}`))
  assert.ok(html.includes('x &lt;b&gt;'))
})
