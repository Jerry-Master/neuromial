import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'
import { checkAnswer, dayString, epochDay, nextStreak, pointsFor, publicQuestion, questionIdForDay } from './logic.ts'
import { getData } from './data.ts'
import { emailEnabled, setEmailOptIn, unsubscribe } from './mail.ts'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const USERS = process.env.USERS_TABLE!
const ANSWERS = process.env.ANSWERS_TABLE!
const USERNAMES = process.env.USERNAMES_TABLE!
const REPORTS = process.env.REPORTS_TABLE!

// start reading the question bank during init, before the first request arrives
getData().catch(() => undefined)

type Event = APIGatewayProxyEventV2WithJWTAuthorizer

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

function parseBody(event: Event): { questionId?: string; choice?: number } {
  try {
    return JSON.parse(event.body ?? '{}')
  } catch {
    return {}
  }
}

async function validate(event: Event) {
  const data = await getData()
  const { questionId, choice } = parseBody(event)
  const today = epochDay()
  if (typeof questionId !== 'string' || !Number.isInteger(choice) || choice! < 0 || choice! > 3) {
    return { ok: false as const, error: json(400, { error: 'bad request' }) }
  }
  if (questionId !== questionIdForDay(data, today)) {
    return { ok: false as const, error: json(409, { error: 'not today’s question' }) }
  }
  const result = checkAnswer(data, questionId, choice!)
  if (!result) return { ok: false as const, error: json(400, { error: 'unknown question' }) }
  return { ok: true as const, today, questionId, choice: choice!, result }
}

// GET /today : public, today's question without answer or explanation
export async function today(): Promise<APIGatewayProxyResultV2> {
  const data = await getData()
  const day = epochDay()
  return {
    ...(json(200, { day: dayString(day), question: publicQuestion(data, questionIdForDay(data, day)) }) as object),
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  }
}

// POST /answer : anonymous, nothing stored
export async function answerAnon(event: Event): Promise<APIGatewayProxyResultV2> {
  const v = await validate(event)
  if (!v.ok) return v.error
  return json(200, { ...v.result, points: 0, saved: false })
}

// POST /answer/scored : JWT required, once per user per day
export async function answerScored(event: Event): Promise<APIGatewayProxyResultV2> {
  const v = await validate(event)
  if (!v.ok) return v.error
  const claims = event.requestContext.authorizer.jwt.claims
  const userId = String(claims.sub)
  const day = dayString(v.today)

  const user = (await db.send(new GetCommand({ TableName: USERS, Key: { userId } }))).Item
  if (!user?.username) return json(403, { error: 'username required' })
  const streak = nextStreak(user?.lastDay, v.today, user?.streak ?? 0)
  const points = pointsFor(v.result.correct, user?.lastDay === v.today - 1 ? user.streak : 0)

  // one atomic write: record the answer (once per day) and update totals together
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: ANSWERS,
              Item: { userId, day, choice: v.choice, correct: v.result.correct, points },
              ConditionExpression: 'attribute_not_exists(userId)',
            },
          },
          {
            Update: {
              TableName: USERS,
              Key: { userId },
              UpdateExpression:
                'SET username = :n, streak = :s, lastDay = :d ADD #total :p, answered :one, correctCount :c',
              ExpressionAttributeNames: { '#total': 'total' },
              ExpressionAttributeValues: {
                ':n': user.username,
                ':s': streak,
                ':d': v.today,
                ':p': points,
                ':one': 1,
                ':c': v.result.correct ? 1 : 0,
              },
            },
          },
        ],
      }),
    )
  } catch (e: any) {
    if (e.name === 'TransactionCanceledException') {
      const prev = (await db.send(new GetCommand({ TableName: ANSWERS, Key: { userId, day } }))).Item
      return json(409, { error: 'already answered', previous: prev })
    }
    throw e
  }
  return json(200, { ...v.result, points, streak, saved: true })
}

// GET /me : JWT required
export async function me(event: Event): Promise<APIGatewayProxyResultV2> {
  const userId = String(event.requestContext.authorizer.jwt.claims.sub)
  const [user, history] = await Promise.all([
    db.send(new GetCommand({ TableName: USERS, Key: { userId } })),
    db.send(
      new QueryCommand({
        TableName: ANSWERS,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
        ScanIndexForward: false,
        Limit: 60,
      }),
    ),
  ])
  const today = dayString(epochDay())
  return json(200, {
    username: user.Item?.username ?? null,
    total: user.Item?.total ?? 0,
    streak: user.Item?.lastDay >= epochDay() - 1 ? user.Item?.streak ?? 0 : 0,
    answered: user.Item?.answered ?? 0,
    correctCount: user.Item?.correctCount ?? 0,
    emailAvailable: emailEnabled(),
    emailOptIn: user.Item?.emailOptIn === true,
    answeredToday: history.Items?.some((i) => i.day === today) ?? false,
    history: history.Items ?? [],
  })
}

// GET /leaderboard[?period=week] : public. Small scale, a scan is fine.
// "week" = points earned since Monday (UTC).
const boardCache: Record<string, { at: number; top: unknown[] }> = {}
export async function leaderboard(event?: Event): Promise<APIGatewayProxyResultV2> {
  const period = event?.queryStringParameters?.period === 'week' ? 'week' : 'all'
  const headers = { 'content-type': 'application/json', 'cache-control': 'public, max-age=120' }
  const hit = boardCache[period]
  if (hit && Date.now() - hit.at < 120_000) {
    return { statusCode: 200, headers, body: JSON.stringify({ top: hit.top, period }) }
  }
  const users = (await db.send(new ScanCommand({ TableName: USERS, Limit: 1000 }))).Items ?? []
  let score = (u: Record<string, any>) => (u.total ?? 0) as number
  if (period === 'week') {
    const today = epochDay()
    const monday = today - ((new Date(today * 86_400_000).getUTCDay() + 6) % 7)
    const res = await db.send(
      new ScanCommand({
        TableName: ANSWERS,
        FilterExpression: '#d >= :m',
        ExpressionAttributeNames: { '#d': 'day' },
        ExpressionAttributeValues: { ':m': dayString(monday) },
        ProjectionExpression: 'userId, points',
      }),
    )
    const week: Record<string, number> = {}
    for (const a of res.Items ?? []) week[a.userId] = (week[a.userId] ?? 0) + (a.points ?? 0)
    score = (u) => week[u.userId] ?? 0
  }
  const today = epochDay()
  const top = users
    .filter((u) => u.username && (period === 'all' || score(u) > 0))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 50)
    .map((u) => ({ name: u.username, total: score(u), streak: u.lastDay >= today - 1 ? u.streak ?? 0 : 0 }))
  boardCache[period] = { at: Date.now(), top }
  return { statusCode: 200, headers, body: JSON.stringify({ top, period }) }
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/

// PUT /me/username : JWT required. Names are unique, case-insensitive.
export async function setUsername(event: Event): Promise<APIGatewayProxyResultV2> {
  const userId = String(event.requestContext.authorizer.jwt.claims.sub)
  let username: unknown
  try {
    username = JSON.parse(event.body ?? '{}').username
  } catch {
    username = undefined
  }
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return json(400, { error: 'Use 3-20 letters, numbers or underscores.' })
  }
  const lower = username.toLowerCase()
  const user = (await db.send(new GetCommand({ TableName: USERS, Key: { userId } }))).Item
  const oldLower: string | undefined = user?.usernameLower

  const items: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']> = [
    {
      Put: {
        TableName: USERNAMES,
        Item: { name: lower, userId },
        // free, or already mine (lets me change only the capitalisation)
        ConditionExpression: 'attribute_not_exists(#n) OR userId = :u',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: { ':u': userId },
      },
    },
    {
      Update: {
        TableName: USERS,
        Key: { userId },
        UpdateExpression: 'SET username = :d, usernameLower = :l',
        ExpressionAttributeValues: { ':d': username, ':l': lower },
      },
    },
  ]
  if (oldLower && oldLower !== lower) {
    items.push({
      Delete: {
        TableName: USERNAMES,
        Key: { name: oldLower },
        ConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
      },
    })
  }
  try {
    await db.send(new TransactWriteCommand({ TransactItems: items }))
  } catch (e: any) {
    if (e.name === 'TransactionCanceledException') return json(409, { error: 'That username is taken.' })
    throw e
  }
  return json(200, { username })
}

// POST /report : public. A player flags a problem with a question.
export async function report(event: Event): Promise<APIGatewayProxyResultV2> {
  let body: { questionId?: unknown; note?: unknown }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    body = {}
  }
  const data = await getData()
  const { questionId, note } = body
  if (typeof questionId !== 'string' || !data.questions[questionId] || typeof note !== 'string') {
    return json(400, { error: 'bad request' })
  }
  const text = note.trim().slice(0, 500)
  if (!text) return json(400, { error: 'Write a short note.' })
  const sub = (event.requestContext as any).authorizer?.jwt?.claims?.sub
  await db.send(
    new PutCommand({
      TableName: REPORTS,
      Item: { questionId, at: new Date().toISOString(), note: text, ...(sub ? { userId: String(sub) } : {}) },
    }),
  )
  return json(200, { ok: true })
}

// One Lambda serves every route: a single warm container answers all requests,
// so loading /today also warms the answer path.
const routes: Record<string, (e: Event) => Promise<APIGatewayProxyResultV2>> = {
  'GET /today': today,
  'POST /answer': answerAnon,
  'POST /answer/scored': answerScored,
  'GET /me': me,
  'PUT /me/username': setUsername,
  'GET /leaderboard': leaderboard,
  'POST /report': report,
  'PUT /me/email': setEmailOptIn,
  'GET /unsubscribe': unsubscribe,
  'POST /unsubscribe': unsubscribe,
}

export async function main(event: Event): Promise<APIGatewayProxyResultV2> {
  const fn = routes[event.routeKey]
  return fn ? fn(event) : json(404, { error: 'not found' })
}
