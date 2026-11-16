// Validates questions/questions.json (git-ignored, private) and writes build/data.json,
// which is uploaded to a PRIVATE S3 bucket and read only by the Lambdas.
// Run: node scripts/build-questions.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const list = JSON.parse(readFileSync(join(root, 'questions/questions.json'), 'utf8'))

const questions = {}
for (const q of list) {
  if (questions[q.id]) throw new Error(`duplicate id ${q.id}`)
  if (q.options.length !== 4) throw new Error(`${q.id}: need 4 options`)
  if (!(q.answer >= 0 && q.answer <= 3)) throw new Error(`${q.id}: bad answer index`)
  const { id, ...rest } = q
  questions[id] = rest
}

// seeded shuffle (mulberry32): fixed order, never changes between builds
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const order = list.map((q) => q.id)
const rand = rng(20261116)
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[order[i], order[j]] = [order[j], order[i]]
}

mkdirSync(join(root, 'build'), { recursive: true })
writeFileSync(join(root, 'build/data.json'), JSON.stringify({ order, questions }))
console.log(`built ${list.length} questions`)
