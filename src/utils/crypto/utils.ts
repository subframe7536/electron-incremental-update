import { createHash } from 'node:crypto'

export function hashString(data: string | Buffer, length: number) {
  const hash = createHash('SHA256').update(data).digest('binary')
  return Buffer.from(hash).subarray(0, length)
}
