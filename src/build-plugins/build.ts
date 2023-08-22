import { readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import Asar from '@electron/asar'

// import { build } from 'esbuild'
import { build } from 'vite'
import { signature } from '../crypto'
import { parseVersion, zipFile } from '../utils'
import { type UpdateJSON, isUpdateJSON } from '../updateJson'
import type { BuildAsarOption, BuildEntryOption, BuildVersionOption } from './option'

export async function buildAsar({
  version,
  asarOutputPath,
  gzipPath,
  electronDistPath,
  rendererDistPath,
}: BuildAsarOption) {
  await rename(rendererDistPath, `${electronDistPath}/renderer`)
  await writeFile(`${electronDistPath}/version`, version)
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
      _json = JSON.parse(await readFile(versionPath, 'utf-8'))
    } catch (error) {}
  }
  if (!isUpdateJSON(_json)) {
    throw new Error('invalid version file')
  }
  const buffer = await readFile(gzipPath)

  const sig = await (generateSignature ?? signature)(buffer, privateKey, cert, version)

  if (generateVersionJson) {
    _json = await generateVersionJson(_json, buffer, sig, version, minimumVersion)
    if (!isUpdateJSON(_json)) {
      throw new Error('invalid version info')
    }
  } else {
    _json.beta.version = version
    _json.beta.minimumVersion = minimumVersion
    _json.beta.signature = sig
    _json.beta.size = buffer.length
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
  entryPath,
  entryOutputPath: outfile,
  minify,
}: BuildEntryOption) {
  await build({
    build: {
      lib: {
        entry: entryPath,
        formats: ['cjs'],
      },
      minify,
      rollupOptions: {
        treeshake: true,
        external: ['electron', 'original-fs'],
        output: {
          file: outfile,
        },
      },
    },
  })
}
