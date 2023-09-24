import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { gunzip, gzip } from 'node:zlib'

export async function unzipFile(gzipPath: string, targetFilePath = gzipPath.slice(0, -3)) {
  if (!existsSync(gzipPath)) {
    throw new Error(`path to zipped file not exist: ${gzipPath}`)
  }

  const compressedBuffer = readFileSync(gzipPath)

  return new Promise((resolve, reject) => {
    gunzip(compressedBuffer, (err, buffer) => {
      rmSync(gzipPath)
      if (err) {
        reject(err)
      }
      writeFileSync(targetFilePath, buffer)
      resolve(null)
    })
  })
}

export async function zipFile(filePath: string, targetFilePath = `${filePath}.gz`) {
  if (!existsSync(filePath)) {
    throw new Error(`path to be zipped not exist: ${filePath}`)
  }
  const buffer = readFileSync(filePath)
  return new Promise((resolve, reject) => {
    gzip(buffer, (err, buffer) => {
      if (err) {
        reject(err)
      }
      writeFileSync(targetFilePath, buffer)
      resolve(null)
    })
  })
}
