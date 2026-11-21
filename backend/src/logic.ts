export const DAY_MS = 86_400_000

export type Question = {
  type: string
  prompt: string
  options: string[]
  tags: string[]
  answer: number
  explanation: string
  difficulty?: string
  feedback?: string[]
  references?: Reference[]
  es?: { prompt?: string; options?: string[]; explanation?: string; feedback?: string[] }
}
export type Reference = { title: string; url: string }
export type Lang = 'en' | 'es'
export type CheckResult = {
  correct: boolean
  correctIndex: number
  explanation: string
  feedback: string[] | null
  references: Reference[]
}

export const parseLang = (v: unknown): Lang => (v === 'es' ? 'es' : 'en')
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

// what the client may see before answering: no answer, no explanation. Missing es fields fall back to EN.
export function publicQuestion(q: Question, lang: Lang = 'en') {
  const l = lang === 'es' ? q.es : undefined
  const options = l?.options?.length === 4 ? l.options : q.options
  return { type: q.type, prompt: l?.prompt || q.prompt, options, difficulty: q.difficulty, tags: q.tags ?? [] }
}

export function checkAnswer(q: Question | undefined, choice: number, lang: Lang = 'en'): CheckResult | null {
  if (!q) return null
  const l = lang === 'es' ? q.es : undefined
  return {
    correct: choice === q.answer,
    correctIndex: q.answer,
    explanation: l?.explanation || q.explanation,
    feedback: (l?.feedback?.length === 4 ? l.feedback : q.feedback) ?? null,
    references: q.references ?? [],
  }
}

export function pointsFor(correct: boolean, streakBefore: number): number {
  return correct ? 10 + Math.min(streakBefore, 5) : 0
}

// streak counts consecutive days with an answer
export function nextStreak(lastDay: number | undefined, today: number, streak: number): number {
  return lastDay === today - 1 ? streak + 1 : 1
}
