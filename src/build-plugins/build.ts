import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import Asar from '@electron/asar'
import { type BuildOptions, build } from 'esbuild'
import { mergeConfig } from 'vite'
import { signature } from '../crypto'
import { isUpdateJSON, parseVersion } from '../utils/pure'
import { zipFile } from '../utils/zip'
import type { UpdateJSON } from '../utils'
import { bytecodeLog, log } from './log'
import { bytecodeModuleLoaderCode } from './bytecode/code'
import {
  compileToBytecode,
  convertArrowToFunction,
  convertString,
  useStrict,
} from './bytecode/utils'
import type { BuildAsarOption, BuildEntryOption, BuildVersionOption } from './option'

export async function buildAsar({
  version,
  asarOutputPath,
  gzipPath,
  electronDistPath,
  rendererDistPath,
}: BuildAsarOption) {
  renameSync(rendererDistPath, join(electronDistPath, 'renderer'))
  writeFileSync(join(electronDistPath, 'version'), version)
  await Asar.createPackage(electronDistPath, asarOutputPath)
  await zipFile(asarOutputPath, gzipPath)
}

export async function buildVersion({
  gzipPath,
  versionPath,
  privateKey,
  cert,
  version,
  minimumVersion,
  generateSignature,
  generateVersionJson,
}: BuildVersionOption) {
  let _json: UpdateJSON = {
    beta: {
      minimumVersion: version,
      signature: '',
      size: 0,
      version,
    },
    minimumVersion: version,
    signature: '',
    size: 0,
    version,
  }
  if (existsSync(versionPath)) {
    try {
      const oldVersionJson = JSON.parse(readFileSync(versionPath, 'utf-8'))
      if (isUpdateJSON(oldVersionJson)) {
        _json = oldVersionJson
      } else {
        log.warn('old version json is invalid, ignore it')
      }
    } catch (error) {}
  }

  const buffer = readFileSync(gzipPath)

  const sig = await (generateSignature ?? signature)(buffer, privateKey, cert, version)

  if (generateVersionJson) {
    _json = await generateVersionJson(_json, buffer, sig, version, minimumVersion)
    if (!isUpdateJSON(_json)) {
      throw new Error('invalid version info')
    }
  } else {
    _json.beta = {
      version,
      minimumVersion,
      signature: sig,
      size: buffer.length,
    }
    if (!parseVersion(version).stage) {
      _json.version = version
      _json.minimumVersion = minimumVersion
      _json.signature = sig
      _json.size = buffer.length
    }
  }

  writeFileSync(versionPath, JSON.stringify(_json, null, 2))
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
) {
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
      `${filePath} => ${(buffer.byteLength / 1000).toFixed(2)} kB`,
      { timestamp: true },
    )
  }
  bytecodeLog.info(`${filePaths.length} bundles compiled into bytecode`, { timestamp: true })
}

function getCert(code: string) {
  const cert = code.match(/-----BEGIN CERTIFICATE-----[\s\S]*-----END CERTIFICATE-----\\n/)?.[0]
  return cert ? [cert] : []
}
