import { writeFileSync } from 'node:fs'
import { brotliDecompress } from 'node:zlib'

export async function defaultUnzipFile(buffer: Buffer, targetFilePath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    brotliDecompress(buffer, (err, buffer) => {
      if (err) {
        reject(err)
      }
      writeFileSync(targetFilePath, buffer)
      resolve()
    })
  })
}
