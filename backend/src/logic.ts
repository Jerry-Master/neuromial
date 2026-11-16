export const DAY_MS = 86_400_000

export type Question = {
  type: string
  prompt: string
  options: string[]
  tags: string[]
  answer: number
  explanation: string
}
export type Data = { order: string[]; questions: Record<string, Question> }

export function epochDay(now: number = Date.now()): number {
  return Math.floor(now / DAY_MS)
}

export function dayString(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

export function questionIdForDay(data: Data, day: number): string {
  const n = data.order.length
  return data.order[((day % n) + n) % n]
}

// what the client may see before answering: no answer, no explanation
export function publicQuestion(data: Data, id: string) {
  const { answer: _a, explanation: _e, ...visible } = data.questions[id]
  return { id, ...visible }
}

export function checkAnswer(data: Data, questionId: string, choice: number) {
  const q = data.questions[questionId]
  if (!q) return null
  return { correct: choice === q.answer, correctIndex: q.answer, explanation: q.explanation }
}

export function pointsFor(correct: boolean, streakBefore: number): number {
  return correct ? 10 + Math.min(streakBefore, 5) : 0
}

// streak counts consecutive days with an answer
export function nextStreak(lastDay: number | undefined, today: number, streak: number): number {
  return lastDay === today - 1 ? streak + 1 : 1
}
