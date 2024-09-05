import fs from 'node:fs'
import path from 'node:path'
import Asar from '@electron/asar'
import { build } from 'vite-plugin-electron'
import { type InlineConfig, mergeConfig } from 'vite'
import { type UpdateJSON, isUpdateJSON } from '../utils/version'
import { log } from './constant'
import type { BuildAsarOption, BuildEntryOption, BuildVersionOption } from './option'
import { readableSize } from './utils'
import type { BytecodeOptions } from './bytecode'

export async function buildAsar({
  version,
  asarOutputPath,
  gzipPath,
  electronDistPath,
  rendererDistPath,
  generateGzipFile,
}: BuildAsarOption): Promise<Buffer> {
  fs.renameSync(rendererDistPath, path.join(electronDistPath, 'renderer'))
  fs.writeFileSync(path.join(electronDistPath, 'version'), version)
  await Asar.createPackage(electronDistPath, asarOutputPath)
  const buf = await generateGzipFile(fs.readFileSync(asarOutputPath))
  fs.writeFileSync(gzipPath, buf)
  log.info(`Build update asar to '${gzipPath}' [${readableSize(buf.length)}]`, { timestamp: true })
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
  if (fs.existsSync(versionPath)) {
    try {
      const oldVersionJson = JSON.parse(fs.readFileSync(versionPath, 'utf-8'))
      if (isUpdateJSON(oldVersionJson)) {
        _json = oldVersionJson
      } else {
        log.warn('Old version json is invalid, ignore it', { timestamp: true })
      }
    } catch {}
  }

  const sig = await generateSignature(asarBuffer, privateKey, cert, version)

  _json = await generateVersionJson(_json, sig, version, minimumVersion)
  if (!isUpdateJSON(_json)) {
    throw new Error('Invalid version info')
  }

  fs.writeFileSync(versionPath, JSON.stringify(_json, null, 2))
  log.info(`build version info to '${versionPath}'`, { timestamp: true })
}

export async function buildEntry(
  {
    sourcemap,
    minify,
    appEntryPath,
    entryOutputDirPath,
    nativeModuleEntryMap,
    ignoreDynamicRequires,
    external,
    overrideViteOptions,
  }: Required<Omit<BuildEntryOption, 'postBuild'>>,
  isESM: boolean,
  define: Record<string, string>,
  bytecodeOptions: BytecodeOptions | undefined,
): Promise<void> {
  await build({
    entry: {
      entry: appEntryPath,
      ...nativeModuleEntryMap,
    },
    vite: mergeConfig<InlineConfig, InlineConfig>({
      plugins: [
        isESM && await import('./esm').then(m => m.esm()),
        bytecodeOptions && await import('./bytecode').then(m => m.bytecodePlugin('main', bytecodeOptions)),
      ],
      build: {
        sourcemap,
        minify,
        outDir: entryOutputDirPath,
        commonjsOptions: { ignoreDynamicRequires },
        rollupOptions: { external },
      },
      define,
    }, overrideViteOptions ?? {}),
  })
}
