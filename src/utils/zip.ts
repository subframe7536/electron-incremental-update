import { writeFileSync } from 'node:fs'
import { brotliCompress } from 'node:zlib'

export async function defaultZipFile(buffer: Buffer, targetFilePath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    brotliCompress(buffer, (err, buffer) => {
      if (err) {
        reject(err)
      }
      writeFileSync(targetFilePath, buffer)
      resolve()
    })
  })
}
