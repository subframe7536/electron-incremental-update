import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import Asar from '@electron/asar'
import { type BuildOptions, build } from 'esbuild'
import { mergeConfig } from 'vite'
import { type UpdateJSON, isUpdateJSON } from '../utils/version'
import { bytecodeLog, log } from './constant'
import { bytecodeModuleLoaderCode } from './bytecode/code'
import {
  compileToBytecode,
  convertArrowToFunction,
  convertString,
  useStrict,
} from './bytecode/utils'
import type { BuildAsarOption, BuildEntryOption, BuildVersionOption } from './option'
import { readableSize } from './utils'

export async function buildAsar({
  version,
  asarOutputPath,
  gzipPath,
  electronDistPath,
  rendererDistPath,
  generateGzipFile,
}: BuildAsarOption): Promise<Buffer> {
  renameSync(rendererDistPath, join(electronDistPath, 'renderer'))
  writeFileSync(join(electronDistPath, 'version'), version)
  await Asar.createPackage(electronDistPath, asarOutputPath)
  const buf = await generateGzipFile(readFileSync(asarOutputPath))
  writeFileSync(gzipPath, buf)
  log.info(`build update asar to '${gzipPath}' [${readableSize(buf.length)}]`, { timestamp: true })
  return buf
}

export async function buildVersion(
  {
    versionPath,
    privateKey,
    cert,
    version,
    minimumVersion,
    generateSignature,
    generateVersionJson,
  }: BuildVersionOption,
  asarBuffer: Buffer,
): Promise<void> {
  let _json: UpdateJSON = {
    beta: {
      minimumVersion: version,
      signature: '',
      version,
    },
    minimumVersion: version,
    signature: '',
    version,
  }
  if (existsSync(versionPath)) {
    try {
      const oldVersionJson = JSON.parse(readFileSync(versionPath, 'utf-8'))
      if (isUpdateJSON(oldVersionJson)) {
        _json = oldVersionJson
      } else {
        log.warn('old version json is invalid, ignore it', { timestamp: true })
      }
    } catch {}
  }

  const sig = await generateSignature(asarBuffer, privateKey, cert, version)

  _json = await generateVersionJson(_json, sig, version, minimumVersion)
  if (!isUpdateJSON(_json)) {
    throw new Error('invalid version info')
  }

  writeFileSync(versionPath, JSON.stringify(_json, null, 2))
  log.info(`build version info to '${versionPath}'`, { timestamp: true })
}

export async function buildEntry(
  {
    sourcemap,
    minify,
    appEntryPath,
    entryOutputDirPath,
    nativeModuleEntryMap,
    overrideEsbuildOptions,
  }: Required<Omit<BuildEntryOption, 'postBuild'>>,
  define: Record<string, string>,
  protectedStrings?: string[],
): Promise<void> {
  const option: BuildOptions = mergeConfig(
    {
      entryPoints: {
        entry: appEntryPath,
        ...nativeModuleEntryMap,
      },
      bundle: true,
      metafile: true,
      platform: 'node',
      outdir: entryOutputDirPath,
      minify,
      sourcemap,
      entryNames: '[dir]/[name]',
      assetNames: '[dir]/[name]',
      external: ['electron', 'original-fs'],
      treeShaking: true,
      loader: {
        '.node': 'empty',
      },
      define,
    } satisfies BuildOptions,
    overrideEsbuildOptions ?? {},
  )
  const { metafile } = await build(option)

  if (protectedStrings === undefined) {
    return
  }
  const filePaths = Object.keys(metafile?.outputs ?? [])
  for (const filePath of filePaths) {
    let code = readFileSync(filePath, 'utf-8')
    const fileName = basename(filePath)
    const isEntry = fileName.endsWith('entry.js')

    if (isEntry) {
      code = code.replace(
        /(`-----BEGIN CERTIFICATE-----[\s\S]*-----END CERTIFICATE-----\n`)/,
        (_, cert: string) => `"${cert.slice(1, -1).replace(/\n/g, '\\n')}"`,
      )
    }

    const transformedCode = convertString(
      convertArrowToFunction(code).code,
      [...protectedStrings, ...(isEntry ? getCert(code) : [])],
    ).code
    const buffer = await compileToBytecode(transformedCode)
    writeFileSync(`${filePath}c`, buffer)
    writeFileSync(
      filePath,
      `${isEntry ? bytecodeModuleLoaderCode : useStrict}${isEntry ? '' : 'module.exports = '}require("./${fileName}c")`,
    )
    bytecodeLog.info(
      `${filePath} [${(buffer.byteLength / 1000).toFixed(2)} kB]`,
      { timestamp: true },
    )
  }
  bytecodeLog.info(`${filePaths.length} file${filePaths.length > 1 ? 's' : ''} compiled into bytecode`, { timestamp: true })
}

function getCert(code: string): string[] {
  const cert = code.match(/-----BEGIN CERTIFICATE-----[\s\S]*-----END CERTIFICATE-----\\n/)?.[0]
  return cert ? [cert] : []
}
