import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { brotliDecompress } from 'node:zlib'

export async function unzipFile(gzipPath: string, targetFilePath = gzipPath.slice(0, -3)): Promise<void> {
  if (!existsSync(gzipPath)) {
    throw new Error(`path to zipped file not exist: ${gzipPath}`)
  }

  const compressedBuffer = readFileSync(gzipPath)

  return new Promise<void>((resolve, reject) => {
    brotliDecompress(compressedBuffer, (err, buffer) => {
      rmSync(gzipPath)
      if (err) {
        reject(err)
      }
      writeFileSync(targetFilePath, buffer)
      resolve()
    })
  })
}
