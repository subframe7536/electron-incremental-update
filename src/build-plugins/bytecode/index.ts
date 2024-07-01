import path from 'node:path'
import fs from 'node:fs'
import { type Plugin, type ResolvedConfig, createFilter, normalizePath } from 'vite'
import MagicString from 'magic-string'
import { bytecodeId } from '../constant'
import { bytecodeLog } from '../log'
import {
  bytecodeModuleLoader,
  compileToBytecode,
  convertArrowToFunction,
  convertStringToAscii,
  isMagicStringInstalled,
  toRelativePath,
  useStrict,
} from './utils'
import { bytecodeModuleLoaderCode } from './code'

export type BytecodeOptions = {
  /**
   * strings that should be transformed
   */
  protectedStrings?: string[]
  /**
   * Remember to set `sandbox: false` when creating window
   */
  enablePreload?: boolean
}

/**
 * Compile to v8 bytecode to protect source code.
 */
export function bytecodePlugin(
  isBuild: boolean,
  env: 'preload' | 'main',
  options: BytecodeOptions = {},
): Plugin | null {
  if (!isBuild) {
    return null
  }

  const {
    protectedStrings = [],
    enablePreload = false,
  } = options

  if (!enablePreload && env === 'preload') {
    bytecodeLog.warn('bytecodePlugin is skiped in preload. To enable in preload, please manually set the "enablePreload" option to true and set `sandbox: false` when creating the window', { timestamp: true })
    return null
  }

  const filter = createFilter(/\.(m?[jt]s|[jt]sx)$/)

  let config: ResolvedConfig
  let bytecodeRequired = false
  let bytecodeFiles: { name: string, size: number }[] = []

  return {
    name: `${bytecodeId}-${env}`,
    apply: 'build',
    enforce: 'post',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    transform(code, id) {
      if (config.build.minify || protectedStrings.length === 0 || !filter(id)) {
        return
      }
      return convertStringToAscii(code, protectedStrings, !!config.build.sourcemap)
    },
    generateBundle(options): void {
      if (options.format !== 'es' && bytecodeRequired) {
        this.emitFile({
          type: 'asset',
          source: bytecodeModuleLoaderCode + '\n',
          name: 'Bytecode Loader File',
          fileName: bytecodeModuleLoader,
        })
      }
    },
    renderChunk(code, chunk, options) {
      if (options.format === 'es') {
        bytecodeLog.warn(
          'bytecodePlugin does not support ES module, please remove "type": "module" in package.json or set the "build.rollupOptions.output.format" option to "cjs".',
          { timestamp: true },
        )
        return null
      }
      if (chunk.type === 'chunk') {
        bytecodeRequired = true
        return convertArrowToFunction(code)
      }
      return null
    },
    async writeBundle(options, output) {
      if (options.format === 'es' || !bytecodeRequired) {
        return
      }

      const outDir = options.dir!

      bytecodeFiles = []

      const bundles = Object.keys(output)
      const chunks = Object.values(output).filter(
        chunk => chunk.type === 'chunk' && chunk.fileName !== bytecodeModuleLoader,
      ) as any[]
      const bytecodeChunks = chunks.map(chunk => chunk.fileName)
      const nonEntryChunks = chunks.filter(chunk => !chunk.isEntry).map(chunk => path.basename(chunk.fileName))

      const pattern = nonEntryChunks.map(chunk => `(${chunk})`).join('|')
      const bytecodeRE = pattern ? new RegExp(`require\\(\\S*(?=(${pattern})\\S*\\))`, 'g') : null

      const getBytecodeLoaderBlock = (chunkFileName: string): string => {
        return `require("${toRelativePath(bytecodeModuleLoader, normalizePath(chunkFileName))}");`
      }

      if (!isMagicStringInstalled()) {
        throw new Error('Please make sure `magic-string` installed')
      }

      await Promise.all(
        bundles.map(async (name) => {
          const chunk = output[name]
          if (chunk.type === 'chunk') {
            let _code = chunk.code
            if (bytecodeRE && _code.match(bytecodeRE)) {
              let match: RegExpExecArray | null
              const s = new MagicString(_code)
              // eslint-disable-next-line no-cond-assign
              while ((match = bytecodeRE.exec(_code))) {
                const [prefix, chunkName] = match
                const len = prefix.length + chunkName.length
                s.overwrite(match.index, match.index + len, prefix + chunkName + 'c', {
                  contentOnly: true,
                })
              }
              _code = s.toString()
            }
            const chunkFileName = path.resolve(outDir, name)
            if (bytecodeChunks.includes(name)) {
              const bytecodeBuffer = await compileToBytecode(_code)
              fs.writeFileSync(path.resolve(outDir, name + 'c'), bytecodeBuffer)
              if (chunk.isEntry) {
                const bytecodeLoaderBlock = getBytecodeLoaderBlock(chunk.fileName)
                const bytecodeModuleBlock = `require("./${path.basename(name) + 'c'}");`
                const code = `${useStrict}\n${bytecodeLoaderBlock}\nmodule.exports=${bytecodeModuleBlock}\n`
                fs.writeFileSync(chunkFileName, code)
              } else {
                fs.unlinkSync(chunkFileName)
              }
              bytecodeFiles.push({ name: name + 'c', size: bytecodeBuffer.length })
            } else {
              if (chunk.isEntry) {
                let hasBytecodeMoudle = false
                const idsToHandle = new Set([...chunk.imports, ...chunk.dynamicImports])
                for (const moduleId of idsToHandle) {
                  if (bytecodeChunks.includes(moduleId)) {
                    hasBytecodeMoudle = true
                    break
                  }
                  const moduleInfo = this.getModuleInfo(moduleId)
                  if (moduleInfo && !moduleInfo.isExternal) {
                    const { importers, dynamicImporters } = moduleInfo
                    for (const importerId of importers) {
                      idsToHandle.add(importerId)
                    }
                    for (const importerId of dynamicImporters) {
                      idsToHandle.add(importerId)
                    }
                  }
                }
                const bytecodeLoaderBlock = getBytecodeLoaderBlock(chunk.fileName)
                _code = hasBytecodeMoudle ? _code.replace(useStrict, `${useStrict}\n${bytecodeLoaderBlock}`) : _code
              }
              fs.writeFileSync(chunkFileName, _code)
            }
          }
        }),
      )
    },
    closeBundle() {
      const outDir = `${normalizePath(path.relative(config.root, path.resolve(config.root, config.build.outDir)))}/`
      bytecodeFiles.forEach((file) => {
        const kbs = file.size / 1000
        bytecodeLog.info(
          `${outDir}${file.name} => ${kbs.toFixed(2)} kB`,
          { timestamp: true },
        )
      })
      bytecodeLog.info(`${bytecodeFiles.length} bundles compiled into bytecode.`, { timestamp: true })
      bytecodeFiles = []
    },
  }
}
