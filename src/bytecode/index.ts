import path from 'node:path'
import fs from 'node:fs'
import { type Plugin, type ResolvedConfig, createFilter, normalizePath } from 'vite'
import MagicString from 'magic-string'
import { bytecodeId } from '../constant'
import { bytecodeModuleLoaderCode } from './staticCode'
import {
  bytecodeModuleLoader,
  compileToBytecode,
  convertArrowToFunction,
  convertStringToAscii,
  log,
  toRelativePath,
  useStrict,
} from './utils'

export type BytecodeOptions = {
  chunkAlias?: string | string[]
  protectedStrings?: string[]
}

/**
 * Compile to v8 bytecode to protect source code.
 */
export function bytecodePlugin(
  isBuild: boolean,
  env: string,
  options: BytecodeOptions = {},
): Plugin | null {
  if (!isBuild) {
    return null
  }

  const {
    chunkAlias = [],
    protectedStrings = [],
  } = options
  const _chunkAlias = Array.isArray(chunkAlias) ? chunkAlias : [chunkAlias]

  const filter = createFilter(/\.(m?[jt]s|[jt]sx)$/)

  const isBytecodeChunk = (chunkName: string): boolean => {
    return _chunkAlias.length === 0 || _chunkAlias.includes(chunkName)
  }

  let config: ResolvedConfig
  let bytecodeRequired = false
  let bytecodeFiles: { name: string, size: number }[] = []

  return {
    name: `${bytecodeId}-${env}`,
    apply: 'build',
    enforce: 'post',
    configResolved(resolvedConfig) {
      config = resolvedConfig
      if (resolvedConfig.build.minify && protectedStrings.length > 0) {
        log.warn('Strings cannot be protected when minification is enabled.', { timestamp: true })
      }
    },
    transform(code, id) {
      if (config.build.minify || protectedStrings.length === 0 || !filter(id)) {
        return
      }

      return convertStringToAscii(code, protectedStrings, !!config.build.sourcemap)
    },
    renderChunk(code, chunk, options) {
      if (options.format === 'es') {
        log.warn(
          'bytecodePlugin does not support ES module, please remove "type": "module" in package.json or set the "build.rollupOptions.output.format" option to "cjs".',
          { timestamp: true },
        )
        return null
      }
      if (chunk.type === 'chunk' && isBytecodeChunk(chunk.name)) {
        bytecodeRequired = true
        return convertArrowToFunction(code)
      }
      return null
    },
    generateBundle(options) {
      if (options.format !== 'es' && bytecodeRequired) {
        this.emitFile({
          type: 'asset',
          source: bytecodeModuleLoaderCode,
          name: 'Bytecode Loader File',
          fileName: bytecodeModuleLoader,
        })
      }
    },
    async writeBundle(options, output) {
      if (options.format === 'es' || !bytecodeRequired) {
        return
      }

      const outDir = options.dir!

      bytecodeFiles = []

      const bundles = Object.keys(output)
      const chunks = Object.values(output).filter(
        chunk => chunk.type === 'chunk' && isBytecodeChunk(chunk.name) && chunk.fileName !== bytecodeModuleLoader,
      ) as any[]
      const bytecodeChunks = chunks.map(chunk => chunk.fileName)
      const nonEntryChunks = chunks.filter(chunk => !chunk.isEntry).map(chunk => path.basename(chunk.fileName))

      const pattern = nonEntryChunks.map(chunk => `(${chunk})`).join('|')
      const bytecodeRE = pattern ? new RegExp(`require\\(\\S*(?=(${pattern})\\S*\\))`, 'g') : null

      const getBytecodeLoaderBlock = (chunkFileName: string): string => {
        return `require("${toRelativePath(bytecodeModuleLoader, normalizePath(chunkFileName))}");`
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
                s.overwrite(match.index, match.index + len, `${prefix + chunkName}c`, {
                  contentOnly: true,
                })
              }
              _code = s.toString()
            }
            const chunkFileName = path.resolve(outDir, name)
            if (bytecodeChunks.includes(name)) {
              const bytecodeBuffer = await compileToBytecode(_code)
              fs.writeFileSync(path.resolve(outDir, `${name}c`), bytecodeBuffer)
              if (chunk.isEntry) {
                const bytecodeLoaderBlock = getBytecodeLoaderBlock(chunk.fileName)
                const bytecodeModuleBlock = `require("./${`${path.basename(name)}c`}");`
                const code = `${useStrict}\n${bytecodeLoaderBlock}\n${bytecodeModuleBlock}\n`
                fs.writeFileSync(chunkFileName, code)
              } else {
                fs.unlinkSync(chunkFileName)
              }
              bytecodeFiles.push({ name: `${name}c`, size: bytecodeBuffer.length })
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
        log.info(
          `${outDir}${file.name} => ${kbs.toFixed(2)} kB`,
          { timestamp: true },
        )
      })
      log.info(`${bytecodeFiles.length} bundles compiled into bytecode.`, { timestamp: true })
      bytecodeFiles = []
    },
  }
}
