import type { Promisable } from '@subframe7536/type-utils'
import type { Plugin, ResolvedConfig } from 'vite'

import fs from 'node:fs'
import path from 'node:path'

import MagicString from 'magic-string'
import { createFilter, normalizePath } from 'vite'

import { bytecodeId, bytecodeLog } from '../constant'
import { readableSize } from '../utils'
import { bytecodeModuleLoaderCode } from './code'
import {
  bytecodeModuleLoader,
  compileToBytecode,
  convertArrowFunctionAndTemplate,
  convertLiteral,
  toRelativePath,
  useStrict,
} from './utils'

export interface BytecodeOptions {
  enable: boolean
  /**
   * Enable in preload script. Remember to set `sandbox: false` when creating window
   */
  preload?: boolean
  /**
   * Custom electron binary path
   */
  electronPath?: string
  /**
   * Before transformed code compile function. If return `Falsy` value, it will be ignored
   * @param code transformed code
   * @param id file path
   */
  beforeCompile?: (code: string, id: string) => Promisable<string | null | undefined | void>
}

function getBytecodeLoaderBlock(chunkFileName: string): string {
  return `require("${toRelativePath(bytecodeModuleLoader, normalizePath(chunkFileName))}");`
}

/**
 * Compile to v8 bytecode to protect source code.
 */
export function bytecodePlugin(
  env: 'preload' | 'main',
  options: BytecodeOptions,
): Plugin | null {
  const {
    enable,
    preload = false,
    electronPath,
    beforeCompile,
  } = options

  if (!enable) {
    return null
  }

  if (!preload && env === 'preload') {
    bytecodeLog.warn('`bytecodePlugin` is skiped in preload. To enable in preload, please manually set the "enablePreload" option to true and set `sandbox: false` when creating the window', { timestamp: true })
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
      if (!filter(id)) {
        return convertLiteral(code, !!config.build.sourcemap)
      }
    },
    generateBundle(options): void {
      if (options.format !== 'es' && bytecodeRequired) {
        this.emitFile({
          type: 'asset',
          source: `${bytecodeModuleLoaderCode}\n`,
          name: 'Bytecode Loader File',
          fileName: bytecodeModuleLoader,
        })
      }
    },
    renderChunk(code, chunk, options) {
      if (options.format === 'es') {
        bytecodeLog.warn(
          '`bytecodePlugin` does not support ES module, please set "build.rollupOptions.output.format" option to "cjs"',
          { timestamp: true },
        )
        return null
      }
      if (chunk.type === 'chunk') {
        bytecodeRequired = true
        return convertArrowFunctionAndTemplate(code)
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

      await Promise.all(
        bundles.map(async (name) => {
          const chunk = output[name]
          if (chunk.type === 'chunk') {
            let _code = chunk.code
            const chunkFilePath = path.resolve(outDir, name)

            if (beforeCompile) {
              const cbResult = await beforeCompile(_code, chunkFilePath)
              if (cbResult) {
                _code = cbResult
              }
            }

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

            if (bytecodeChunks.includes(name)) {
              const bytecodeBuffer = await compileToBytecode(_code, electronPath)
              fs.writeFileSync(`${chunkFilePath}c`, bytecodeBuffer)

              if (chunk.isEntry) {
                const bytecodeLoaderBlock = getBytecodeLoaderBlock(chunk.fileName)
                const bytecodeModuleBlock = `require("./${`${path.basename(name)}c`}");`
                const code = `${useStrict}\n${bytecodeLoaderBlock}\nmodule.exports=${bytecodeModuleBlock}\n`
                fs.writeFileSync(chunkFilePath, code)
              } else {
                fs.unlinkSync(chunkFilePath)
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
                _code = hasBytecodeMoudle
                  ? _code.replace(
                      new RegExp(`(${useStrict})|("use strict";)`),
                      `${useStrict}\n${bytecodeLoaderBlock}`,
                    )
                  : _code
              }
              fs.writeFileSync(chunkFilePath, _code)
            }
          }
        }),
      )
    },
    closeBundle() {
      const outDir = `${normalizePath(path.relative(config.root, path.resolve(config.root, config.build.outDir)))}/`
      bytecodeFiles.forEach((file) => {
        bytecodeLog.info(
          `${outDir}${file.name} [${readableSize(file.size)}]`,
          { timestamp: true },
        )
      })
      bytecodeLog.info(`${bytecodeFiles.length} bundles compiled into bytecode.`, { timestamp: true })
      bytecodeFiles = []
    },
  }
}
