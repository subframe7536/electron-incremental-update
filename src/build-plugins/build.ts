import { readFile, rename, writeFile } from 'node:fs/promises'
import { cpSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import Asar from '@electron/asar'
import { build } from 'esbuild'
import { signature } from '../crypto'
import { isUpdateJSON, parseVersion } from '../utils/noDep'
import { zipFile } from '../utils/zip'
import type { UpdateJSON } from '../utils'
import { log } from '../vite'
import type { BuildAsarOption, BuildEntryOption, BuildVersionOption } from './option'

export async function buildAsar({
  version,
  asarOutputPath,
  gzipPath,
  electronDistPath,
  rendererDistPath,
}: BuildAsarOption) {
  await rename(rendererDistPath, join(electronDistPath, 'renderer'))
  await writeFile(join(electronDistPath, 'version'), version)
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
      const oldVersionJson = JSON.parse(await readFile(versionPath, 'utf-8'))
      if (isUpdateJSON(oldVersionJson)) {
        _json = oldVersionJson
      } else {
        log.warn('old version json is invalid, ignore it')
      }
    } catch (error) {}
  }

  const buffer = await readFile(gzipPath)

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

  await writeFile(versionPath, JSON.stringify(_json, null, 2))
}

export async function buildEntry({
  sourcemap,
  minify,
  appEntryPath,
  entryOutputDirPath,
  nativeModuleEntryMap,
  overrideEsbuildOptions,
  postBuild,
}: BuildEntryOption) {
  await build({
    entryPoints: {
      entry: appEntryPath,
      ...nativeModuleEntryMap,
    },
    bundle: true,
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
    ...overrideEsbuildOptions,
  })
  await postBuild?.({
    getPathFromEntryOutputDir(...paths) {
      return join(entryOutputDirPath, ...paths)
    },
    existsAndCopyToEntryOutputDir({ from, to, skipIfExist = true }) {
      if (existsSync(from)) {
        const target = join(entryOutputDirPath, to ?? basename(from))
        if (!skipIfExist || !existsSync(target)) {
          try {
            cpSync(from, target)
          } catch (ignore) {
            log.warn(`copy failed: ${ignore}`)
          }
        }
      }
    },
  })
}
