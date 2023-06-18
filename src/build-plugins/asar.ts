import { constants, createSign } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import zlib from 'node:zlib'
import type { Buffer } from 'node:buffer'
import { isCI } from 'ci-info'
import type { BuildAsarOption } from './option'

function gzipFile(filePath: string) {
  return new Promise((resolve, reject) => {
    const gzip = zlib.createGzip()
    const input = createReadStream(filePath)
    const output = createWriteStream(`${filePath}.gz`)

    input
      .pipe(gzip)
      .pipe(output)
      .on('finish', () => resolve(null))
      .on('error', err => reject(err))
  })
}
function generateSignature(buffer: Buffer, privateKey: string) {
  return createSign('RSA-SHA256')
    .update(buffer)
    .sign({
      key: privateKey,
      padding: constants.RSA_PKCS1_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    }, 'base64')
}
async function pack(dir: string, target: string) {
  let asar: null | { createPackage: any } = null
  try {
    asar = await import('asar')
  } catch (ignore) { }
  if (!asar) {
    try {
      asar = await import('@electron/asar')
    } catch (ignore) { }
  }
  if (!asar) {
    throw new Error('no asar, please install @electron/asar')
  }
  await asar.createPackage(dir, target)
}
export async function buildAsar({
  version,
  asarOutputPath,
  privateKeyPath,
  electronDistPath,
  rendererDistPath,
  versionPath,
}: BuildAsarOption) {
  await rename(rendererDistPath, `${electronDistPath}/renderer`)
  await writeFile(`${electronDistPath}/version`, version)
  await pack(electronDistPath, asarOutputPath)
  await gzipFile(asarOutputPath)
  if (isCI) {
    return
  }
  const buffer = await readFile(`${asarOutputPath}.gz`)
  const signature = generateSignature(buffer, await readFile(privateKeyPath, 'utf-8'))
  await writeFile(versionPath, JSON.stringify({
    signature,
    version,
    size: buffer.length,
  }, null, 2))
}
