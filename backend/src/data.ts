import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Data } from './logic.ts'

const s3 = new S3Client({})
let cache: Data | undefined

// Read once per warm Lambda container: one S3 GET per cold start, not per request.
export async function getData(): Promise<Data> {
  if (!cache) {
    const res = await s3.send(new GetObjectCommand({ Bucket: process.env.DATA_BUCKET!, Key: 'data.json' }))
    cache = JSON.parse(await res.Body!.transformToString()) as Data
  }
  return cache
}
