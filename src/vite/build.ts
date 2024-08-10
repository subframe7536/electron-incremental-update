import fs from 'node:fs'
import path from 'node:path'
import Asar from '@electron/asar'
import { type BuildOptions, build } from 'esbuild'
import { mergeConfig } from 'vite'
import { type UpdateJSON, isUpdateJSON } from '../utils/version'
import { bytecodeLog, log } from './constant'
import { bytecodeModuleLoaderCode } from './bytecode/code'
import {
  compileToBytecode,
  convertArrowFunctionAndTemplate,
  convertLiteral,
  useStrict,
} from './bytecode/utils'
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
    overrideEsbuildOptions,
  }: Required<Omit<BuildEntryOption, 'postBuild'>>,
  isESM: boolean,
  define: Record<string, string>,
  bytecodeOptions: BytecodeOptions | undefined,
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
      format: isESM ? 'esm' : 'cjs',
    } satisfies BuildOptions,
    overrideEsbuildOptions ?? {},
  )
  const { metafile } = await build(option)

  if (!bytecodeOptions?.enable) {
    return
  }

  const filePaths = Object.keys(metafile?.outputs ?? []).filter(filePath => filePath.endsWith('js'))
  for (const filePath of filePaths) {
    let code = fs.readFileSync(filePath, 'utf-8')
    const fileName = path.basename(filePath)
    const isEntry = fileName.endsWith('entry.js')

    let transformedCode = convertLiteral(convertArrowFunctionAndTemplate(code).code).code
    if (bytecodeOptions.beforeCompile) {
      const result = await bytecodeOptions.beforeCompile(transformedCode, filePath)
      if (result) {
        transformedCode = result
      }
    }
    const buffer = await compileToBytecode(transformedCode, bytecodeOptions.electronPath)
    fs.writeFileSync(
      filePath,
      `${isEntry ? bytecodeModuleLoaderCode : useStrict}${isEntry ? '' : 'module.exports = '}require("./${fileName}c")`,
    )
    fs.writeFileSync(`${filePath}c`, buffer)
    bytecodeLog.info(
      `${filePath} [${(buffer.byteLength / 1000).toFixed(2)} kB]`,
      { timestamp: true },
    )
  }
  bytecodeLog.info(`${filePaths.length} file${filePaths.length > 1 ? 's' : ''} compiled into bytecode`, { timestamp: true })
}
