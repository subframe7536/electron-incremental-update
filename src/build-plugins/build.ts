import { readFile, rename, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { signature } from '../crypto'
import { zipFile } from '../utils'
import type { BuildAsarOption, BuildEntryOption, BuildVersionOption } from './option'

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
  gzipPath,
  electronDistPath,
  rendererDistPath,
}: BuildAsarOption) {
  await rename(rendererDistPath, `${electronDistPath}/renderer`)
  await writeFile(`${electronDistPath}/version`, version)
  await pack(electronDistPath, asarOutputPath)
  await zipFile(asarOutputPath, gzipPath)
}
export async function buildVersion({
  gzipPath,
  versionPath,
  privateKey,
  cert,
  version,
  generateSignature,
}: BuildVersionOption) {
  const buffer = await readFile(gzipPath)
  const _func = generateSignature ?? signature
  await writeFile(versionPath, JSON.stringify({
    signature: _func(buffer, privateKey, cert, version),
    version,
    size: buffer.length,
  }, null, 2))
}

export async function buildEntry({
  entryPath,
  entryOutputPath: outfile,
  minify,
}: BuildEntryOption) {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: 'node',
    outfile,
    minify,
    external: ['electron'],
  })
}
