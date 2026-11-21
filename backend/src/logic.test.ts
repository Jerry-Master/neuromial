import test from 'node:test'
import assert from 'node:assert/strict'
import { checkAnswer, parseLang, epochDay, nextStreak, pointsFor, publicQuestion, questionIdForDay, type Data, type Question } from './logic.ts'

const q = (answer: number): Question => ({
  type: 'location', prompt: 'p', options: ['a', 'b', 'c', 'd'], tags: ['t'], answer, explanation: 'why',
})
const data: Data = { order: ['q2', 'q1', 'q3'], questions: { q1: q(1), q2: q(2), q3: q(3) } }

test('same day gives same question, rolls over', () => {
  const d = epochDay(Date.UTC(2026, 10, 16, 23, 59))
  assert.equal(questionIdForDay(data, d), questionIdForDay(data, epochDay(Date.UTC(2026, 10, 16, 0, 0))))
  assert.notEqual(questionIdForDay(data, d), questionIdForDay(data, d + 1))
})

test('public question never leaks the answer or explanation', () => {
  const p = publicQuestion(data.questions.q1) as Record<string, unknown>
  assert.equal('answer' in p, false)
  assert.equal('explanation' in p, false)
  for (const k of ['feedback', 'references', 'es']) assert.equal(k in p, false)
  assert.deepEqual(p.tags, data.questions.q1.tags)
  assert.equal(p.difficulty, data.questions.q1.difficulty)
})

test('check answer', () => {
  assert.equal(checkAnswer(data.questions.q1, 1)?.correct, true)
  assert.equal(checkAnswer(data.questions.q1, 0)?.correct, false)
  assert.equal(checkAnswer(undefined, 0), null)
})

test('points and streak', () => {
  assert.equal(pointsFor(false, 3), 0)
  assert.equal(pointsFor(true, 0), 10)
  assert.equal(pointsFor(true, 99), 15)
  assert.equal(nextStreak(9, 10, 4), 5)
  assert.equal(nextStreak(7, 10, 4), 1)
  assert.equal(nextStreak(undefined, 10, 0), 1)
})

const loc: Question = { ...q(1), feedback: ['f0', 'f1', 'f2', 'f3'], references: [{ title: 'T', url: 'https://x.test' }],
  es: { prompt: 'pe', options: ['A', 'B', 'C', 'D'], explanation: 'porque' } }

test('lang falls back to EN when es fields are missing', () => {
  assert.equal(parseLang('fr'), 'en')
  assert.equal(parseLang('es'), 'es')
  assert.equal(publicQuestion(data.questions.q1, 'es').prompt, 'p')
  assert.equal(checkAnswer(data.questions.q1, 1, 'es')?.explanation, 'why')
  assert.equal(checkAnswer(data.questions.q1, 1, 'es')?.feedback, null)
  assert.deepEqual(checkAnswer(data.questions.q1, 1)?.references, [])
})

test('es localizes prompt/options/explanation, keeps feedback and references', () => {
  assert.equal(publicQuestion(loc, 'es').prompt, 'pe')
  assert.deepEqual(publicQuestion(loc, 'es').options, ['A', 'B', 'C', 'D'])
  assert.equal(publicQuestion(loc, 'en').prompt, 'p')
  const r = checkAnswer(loc, 0, 'es')!
  assert.equal(r.explanation, 'porque')
  assert.equal(r.feedback?.length, 4)
  assert.equal(r.references[0].url, 'https://x.test')
})
