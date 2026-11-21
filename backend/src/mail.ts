import { createHmac, timingSafeEqual } from 'node:crypto'
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { epochDay, parseLang, publicQuestion, questionIdForDay, type Lang } from './logic.ts'
import { getData } from './data.ts'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const USERS = process.env.USERS_TABLE!
const SITE = process.env.SITE_URL!
const SECRET = process.env.EMAIL_SECRET ?? ''
const SENDER = process.env.SENDER_EMAIL ?? ''
const API = process.env.API_URL ?? ''

export const emailEnabled = () => !!(SENDER && SECRET)

const sign = (userId: string) => createHmac('sha256', SECRET).update(userId).digest('base64url')
function verify(userId: string, token: string) {
  const a = Buffer.from(sign(userId))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const COPY = {
  en: {
    subject: 'Today’s neuroanatomy question is ready',
    hi: (n: string) => `Hi ${n},`,
    anon: 'there',
    streak: (n: number) => `Your streak is ${n}. Keep it going.`,
    today: 'Today\'s question',
    cta: 'Open today\'s question',
    pick: 'Tap your answer. It opens already selected.',
    tagline: 'One question a day, about a minute.',
    unsub: 'Unsubscribe',
    back: 'Back to neuromial',
    confirm: 'Unsubscribe from the neuromial daily email?',
    done: 'You are unsubscribed from the neuromial daily email.',
    invalid: 'This unsubscribe link is not valid.',
  },
  es: {
    subject: 'Ya está lista la pregunta de neuroanatomía de hoy',
    hi: (n: string) => `Hola ${n},`,
    anon: 'ahí',
    streak: (n: number) => `Llevas una racha de ${n}. ¡Sigue así!`,
    today: 'La pregunta de hoy',
    cta: 'Abrir la pregunta de hoy',
    pick: 'Toca tu respuesta. Se abre ya seleccionada.',
    tagline: 'Una pregunta al día, en un minuto.',
    unsub: 'Darse de baja',
    back: 'Volver a neuromial',
    confirm: '¿Darte de baja del correo diario de neuromial?',
    done: 'Te has dado de baja del correo diario de neuromial.',
    invalid: 'Este enlace de baja no es válido.',
  },
} satisfies Record<Lang, Record<string, unknown>>

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

// PUT /me/email : JWT required. Body { optIn: boolean }. The address comes from the verified token, not the body.
export async function setEmailOptIn(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  if (!emailEnabled()) return json(503, { error: 'Daily email is not available yet.' })
  const claims = event.requestContext.authorizer.jwt.claims
  let optIn: unknown
  try {
    optIn = JSON.parse(event.body ?? '{}').optIn
  } catch {
    optIn = undefined
  }
  if (typeof optIn !== 'boolean') return json(400, { error: 'bad request' })
  const email = typeof claims.email === 'string' ? claims.email : ''
  if (optIn && !email) return json(400, { error: 'No email on this account.' })
  await db.send(
    new UpdateCommand({
      TableName: USERS,
      Key: { userId: String(claims.sub) },
      UpdateExpression: optIn ? 'SET emailOptIn = :t, email = :e' : 'SET emailOptIn = :f',
      ExpressionAttributeValues: optIn ? { ':t': true, ':e': email } : { ':f': false },
    }),
  )
  return json(200, { emailOptIn: optIn })
}

// PUT /me/lang : JWT required. Body { lang: 'en' | 'es' }.
export async function setLang(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  let lang: unknown
  try {
    lang = JSON.parse(event.body ?? '{}').lang
  } catch {
    lang = undefined
  }
  if (lang !== 'en' && lang !== 'es') return json(400, { error: 'bad request' })
  await db.send(
    new UpdateCommand({
      TableName: USERS,
      Key: { userId: String(event.requestContext.authorizer.jwt.claims.sub) },
      UpdateExpression: 'SET lang = :l',
      ExpressionAttributeValues: { ':l': lang },
    }),
  )
  return json(200, { ok: true })
}

// GET or POST /unsubscribe?u=<userId>&t=<hmac> : public, one click, no login (RFC 8058)
export async function unsubscribe(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const u = event.queryStringParameters?.u ?? ''
  const t = event.queryStringParameters?.t ?? ''
  const ok = !!SECRET && !!u && verify(u, t)
  const lang = parseLang(event.queryStringParameters?.lang)
  const c = COPY[lang]
  const page = (status: number, body: string): APIGatewayProxyResultV2 => ({
    statusCode: status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><meta name="viewport" content="width=device-width"><html lang="${lang}"><body style="font:16px system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem">
${body}<p><a href="${SITE}/">${c.back}</a></p></body>`,
  })
  // GET only asks for confirmation: mail scanners prefetch links and must not unsubscribe anyone
  if (event.requestContext.http.method === 'GET') {
    if (!ok) return page(400, `<p>${c.invalid}</p>`)
    const action = `${API}/unsubscribe?u=${encodeURIComponent(u)}&amp;t=${encodeURIComponent(t)}&amp;lang=${lang}`
    return page(200, `<p>${c.confirm}</p><form method="post" action="${action}"><button type="submit">${c.unsub}</button></form>`)
  }
  if (ok) {
    await db.send(
      new UpdateCommand({
        TableName: USERS,
        Key: { userId: u },
        UpdateExpression: 'SET emailOptIn = :f',
        ConditionExpression: 'attribute_exists(userId)',
        ExpressionAttributeValues: { ':f': false },
      }),
    ).catch(() => undefined)
  }
  return page(ok ? 200 : 400, `<p>${ok ? c.done : c.invalid}</p>`)
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const LETTERS = 'ABCD'

// Email body: the question, each option a link to the site with that option preselected (/?a=<index>).
export function renderMail(o: { lang: Lang; name: string; streak: string; q: { prompt: string; options: string[] }; unsub: string }) {
  const c = COPY[o.lang]
  const link = (i: number) => `${SITE}/?a=${i}`
  const text = `${c.hi(o.name)}\n\n${o.streak ? `${o.streak}\n\n` : ''}${o.q.prompt}\n\n${o.q.options
    .map((x, i) => `${LETTERS[i]}) ${x}\n   ${link(i)}`)
    .join('\n')}\n\n${c.tagline}\n\n${c.unsub}: ${o.unsub}\n`
  const opts = o.q.options
    .map(
      (x, i) =>
        `<a href="${esc(link(i))}" style="display:block;margin:0 0 8px;padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;color:#111827;text-decoration:none"><b style="color:#2563eb">${LETTERS[i]}</b>&nbsp; ${esc(x)}</a>`,
    )
    .join('')
  const html = `<div lang="${o.lang}" style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:0 auto;color:#111827"><p>${esc(c.hi(o.name))}</p>${o.streak ? `<p>${esc(o.streak)}</p>` : ''}<p style="color:#6b7280;font-size:13px;margin-bottom:4px">${esc(c.today)}</p><p style="font-size:18px;font-weight:600;margin-top:0">${esc(o.q.prompt)}</p>${opts}<p style="color:#6b7280;font-size:13px">${esc(c.pick)}</p><p><a href="${SITE}/" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">${esc(c.cta)}</a></p><p style="color:#6b7280;font-size:13px">${esc(c.tagline)} · <a href="${esc(o.unsub)}" style="color:#6b7280">${esc(c.unsub)}</a></p></div>`
  return { text, html }
}

// EventBridge schedule: email every opted-in player who has not answered today.
export async function dailyMail(): Promise<{ sent: number }> {
  if (!emailEnabled()) return { sent: 0 }
  // loaded here, not at the top, so the API function's cold start skips the SES client
  const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2')
  const ses = new SESv2Client({})
  const data = await getData()
  const today = epochDay()
  let sent = 0
  let start: Record<string, unknown> | undefined
  do {
    const page = await db.send(
      new ScanCommand({
        TableName: USERS,
        FilterExpression: 'emailOptIn = :t',
        ExpressionAttributeValues: { ':t': true },
        ExclusiveStartKey: start,
      }),
    )
    for (const user of page.Items ?? []) {
      if (!user.email || user.lastDay === today) continue
      const lang = parseLang(user.lang)
      const c = COPY[lang]
      const unsub = `${API}/unsubscribe?u=${encodeURIComponent(user.userId)}&t=${sign(user.userId)}&lang=${lang}`
      const name = String(user.username ?? c.anon)
      const streak = user.lastDay === today - 1 && user.streak ? c.streak(user.streak) : ''
      const q = publicQuestion(data.questions[questionIdForDay(data, today)], lang)
      const { text, html } = renderMail({ lang, name, streak, q, unsub })
      try {
        await ses.send(
          new SendEmailCommand({
            FromEmailAddress: `neuromial <${SENDER}>`,
            Destination: { ToAddresses: [user.email] },
            Content: {
              Simple: {
                Subject: { Data: c.subject },
                Body: { Text: { Data: text }, Html: { Data: html } },
                Headers: [
                  { Name: 'List-Unsubscribe', Value: `<${unsub}>` },
                  { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
                ],
              },
            },
          }),
        )
        sent++
      } catch (e) {
        console.error('send failed', user.userId, (e as Error).name)
      }
    }
    start = page.LastEvaluatedKey
  } while (start)
  console.log(`sent ${sent}`)
  return { sent }
}
