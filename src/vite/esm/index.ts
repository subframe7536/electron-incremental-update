import type { Plugin } from 'vite'

import { esmId } from '../constant'
import { findStaticImports, insertCJSShim } from './utils'

export function esm(): Plugin {
  let sourcemap: string | boolean
  return {
    name: esmId,
    enforce: 'post',
    configResolved(config) {
      sourcemap = config.build.sourcemap
    },
    renderChunk(code, _chunk, options) {
      if (options.format === 'es') {
        const lastESMImport = findStaticImports(code).pop()
        const pos = lastESMImport ? lastESMImport.end : 0
        return insertCJSShim(code, sourcemap, pos)
      }
    },
  }
}
