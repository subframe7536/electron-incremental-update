import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { brotliCompress } from 'node:zlib'

export async function zipFile(filePath: string, targetFilePath = `${filePath}.gz`): Promise<void> {
  if (!existsSync(filePath)) {
    throw new Error(`path to be zipped not exist: ${filePath}`)
  }
  const buffer = readFileSync(filePath)
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
