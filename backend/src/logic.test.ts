import test from 'node:test'
import assert from 'node:assert/strict'
import { checkAnswer, epochDay, nextStreak, pointsFor, publicQuestion, questionIdForDay, type Data } from './logic.ts'

const q = (answer: number) => ({
  type: 'location', prompt: 'p', options: ['a', 'b', 'c', 'd'], tags: ['t'], answer, explanation: 'why',
})
const data: Data = { order: ['q2', 'q1', 'q3'], questions: { q1: q(1), q2: q(2), q3: q(3) } }

test('same day gives same question, rolls over', () => {
  const d = epochDay(Date.UTC(2026, 10, 16, 23, 59))
  assert.equal(questionIdForDay(data, d), questionIdForDay(data, epochDay(Date.UTC(2026, 10, 16, 0, 0))))
  assert.notEqual(questionIdForDay(data, d), questionIdForDay(data, d + 1))
})

test('public question never leaks the answer or explanation', () => {
  const p = publicQuestion(data, 'q1') as Record<string, unknown>
  assert.equal('answer' in p, false)
  assert.equal('explanation' in p, false)
  assert.equal(p.id, 'q1')
})

test('check answer', () => {
  assert.equal(checkAnswer(data, 'q1', 1)?.correct, true)
  assert.equal(checkAnswer(data, 'q1', 0)?.correct, false)
  assert.equal(checkAnswer(data, 'nope', 0), null)
})

test('points and streak', () => {
  assert.equal(pointsFor(false, 3), 0)
  assert.equal(pointsFor(true, 0), 10)
  assert.equal(pointsFor(true, 99), 15)
  assert.equal(nextStreak(9, 10, 4), 5)
  assert.equal(nextStreak(7, 10, 4), 1)
  assert.equal(nextStreak(undefined, 10, 0), 1)
})
