import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { checkAnswer, dayString, epochDay, nextStreak, pointsFor, publicQuestion, questionIdForDay } from './logic.ts'
import { getData } from './data.ts'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const USERS = process.env.USERS_TABLE!
const ANSWERS = process.env.ANSWERS_TABLE!

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
    return { error: json(409, { error: 'not today’s question' }) }
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
  const displayName = String(claims.name ?? claims.nickname ?? `Player-${userId.slice(0, 4)}`)
  const day = dayString(v.today)

  const user = (await db.send(new GetCommand({ TableName: USERS, Key: { userId } }))).Item
  const streak = nextStreak(user?.lastDay, v.today, user?.streak ?? 0)
  const points = pointsFor(v.result.correct, user?.lastDay === v.today - 1 ? user.streak : 0)

  try {
    await db.send(
      new PutCommand({
        TableName: ANSWERS,
        Item: { userId, day, choice: v.choice, correct: v.result.correct, points },
        ConditionExpression: 'attribute_not_exists(userId)',
      }),
    )
  } catch (e: any) {
    if (e.name === 'ConditionalCheckFailedException') {
      const prev = (await db.send(new GetCommand({ TableName: ANSWERS, Key: { userId, day } }))).Item
      return json(409, { error: 'already answered', previous: prev })
    }
    throw e
  }

  await db.send(
    new UpdateCommand({
      TableName: USERS,
      Key: { userId },
      UpdateExpression:
        'SET displayName = :n, streak = :s, lastDay = :d ADD total :p, answered :one, correctCount :c',
      ExpressionAttributeValues: {
        ':n': displayName,
        ':s': streak,
        ':d': v.today,
        ':p': points,
        ':one': 1,
        ':c': v.result.correct ? 1 : 0,
      },
    }),
  )
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
    total: user.Item?.total ?? 0,
    streak: user.Item?.lastDay >= epochDay() - 1 ? user.Item?.streak ?? 0 : 0,
    answered: user.Item?.answered ?? 0,
    correctCount: user.Item?.correctCount ?? 0,
    answeredToday: history.Items?.some((i) => i.day === today) ?? false,
    history: history.Items ?? [],
  })
}

// GET /leaderboard : public. Small scale, a scan is fine.
let boardCache: { at: number; top: unknown[] } | undefined
export async function leaderboard(): Promise<APIGatewayProxyResultV2> {
  const headers = { 'content-type': 'application/json', 'cache-control': 'public, max-age=120' }
  if (boardCache && Date.now() - boardCache.at < 120_000) {
    return { statusCode: 200, headers, body: JSON.stringify({ top: boardCache.top }) }
  }
  const res = await db.send(new ScanCommand({ TableName: USERS, Limit: 1000 }))
  const top = (res.Items ?? [])
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 50)
    .map((u) => ({ name: u.displayName, total: u.total ?? 0, streak: u.streak ?? 0 }))
  boardCache = { at: Date.now(), top }
  return { statusCode: 200, headers, body: JSON.stringify({ top }) }
}
