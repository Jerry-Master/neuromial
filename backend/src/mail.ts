import { createHmac, timingSafeEqual } from 'node:crypto'
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { epochDay } from './logic.ts'

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

// GET or POST /unsubscribe?u=<userId>&t=<hmac> : public, one click, no login (RFC 8058)
export async function unsubscribe(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const u = event.queryStringParameters?.u ?? ''
  const t = event.queryStringParameters?.t ?? ''
  const ok = !!SECRET && !!u && verify(u, t)
  const page = (status: number, body: string): APIGatewayProxyResultV2 => ({
    statusCode: status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem">
${body}<p><a href="${SITE}/">Back to neuromial</a></p></body>`,
  })
  // GET only asks for confirmation: mail scanners prefetch links and must not unsubscribe anyone
  if (event.requestContext.http.method === 'GET') {
    if (!ok) return page(400, '<p>This unsubscribe link is not valid.</p>')
    const action = `${API}/unsubscribe?u=${encodeURIComponent(u)}&amp;t=${encodeURIComponent(t)}`
    return page(200, `<p>Unsubscribe from the neuromial daily email?</p><form method="post" action="${action}"><button type="submit">Unsubscribe</button></form>`)
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
  return page(ok ? 200 : 400, `<p>${ok ? 'You are unsubscribed from the neuromial daily email.' : 'This unsubscribe link is not valid.'}</p>`)
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// EventBridge schedule: email every opted-in player who has not answered today.
export async function dailyMail(): Promise<{ sent: number }> {
  if (!emailEnabled()) return { sent: 0 }
  // loaded here, not at the top, so the API function's cold start skips the SES client
  const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2')
  const ses = new SESv2Client({})
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
      const unsub = `${API}/unsubscribe?u=${encodeURIComponent(user.userId)}&t=${sign(user.userId)}`
      const streak = user.lastDay === today - 1 && user.streak ? `Your streak is ${user.streak}. Keep it going.\n\n` : ''
      try {
        await ses.send(
          new SendEmailCommand({
            FromEmailAddress: `neuromial <${SENDER}>`,
            Destination: { ToAddresses: [user.email] },
            Content: {
              Simple: {
                Subject: { Data: 'Today’s neuroanatomy question is ready' },
                Body: {
                  Text: {
                    Data: `Hi ${user.username ?? 'there'},\n\n${streak}Today's question: ${SITE}/\n\nOne question a day, about a minute.\n\nUnsubscribe: ${unsub}\n`,
                  },
                  Html: {
                    Data: `<div style="font:16px system-ui;max-width:32rem;margin:0 auto"><p>Hi ${esc(String(user.username ?? 'there'))},</p>${streak ? `<p>${esc(streak.trim())}</p>` : ''}<p><a href="${SITE}/" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">Answer today's question</a></p><p>One question a day, about a minute.</p><p style="color:#666;font-size:13px"><a href="${esc(unsub)}">Unsubscribe</a></p></div>`,
                  },
                },
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
