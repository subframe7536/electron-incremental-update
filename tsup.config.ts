import type { Options } from 'tsup'

import { readFileSync, rmSync } from 'node:fs'

import { transformSync } from 'esbuild'
import { defineConfig } from 'tsup'

function getConfig(): Options[] {
  rmSync('./dist', { recursive: true, force: true })
  const fontCSS = transformSync(
    readFileSync('./src/utils/devtools/font.css', 'utf-8'),
    { minify: true, loader: 'css' },
  )
  const scrollbarCSS = transformSync(
    readFileSync('./src/utils/devtools/scrollbar.css', 'utf-8'),
    { minify: true, loader: 'css' },
  )
  const JS = transformSync(
    readFileSync('./src/utils/devtools/js.ts', 'utf-8'),
    { minify: true, loader: 'ts' },
  )
  return [
    {
      entry: {
        index: './src/entry/index.ts',
        utils: './src/utils/index.ts',
        provider: './src/provider/index.ts',
      },
      format: ['esm', 'cjs'],
      dts: true,
      treeshake: true,
      external: ['electron', 'vite'],
      define: {
        __FONT_CSS__: JSON.stringify(fontCSS?.code.replace(/\n/g, '') || ''),
        __SCROLLBAR_CSS__: JSON.stringify(scrollbarCSS?.code.replace(/\n/g, '') || ''),
        __JS__: JSON.stringify(JS?.code.replace(/\n/g, '') || ''),
      },
    },
    {
      entry: {
        vite: './src/vite/index.ts',
      },
      format: 'esm',
      dts: true,
      treeshake: true,
      external: ['electron', 'vite'],
    },
  ]
}

export default defineConfig(getConfig())
