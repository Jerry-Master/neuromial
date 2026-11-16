import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Data } from './logic.ts'

let cache: Promise<Data> | undefined

// data.json is bundled next to the handler at deploy time (git-ignored, never public),
// so a cold start reads a local file instead of waiting on S3.
export function getData(): Promise<Data> {
  cache ??= readFile(join(process.env.LAMBDA_TASK_ROOT ?? '.', 'data.json'), 'utf8').then((s) => JSON.parse(s) as Data)
  return cache
}
