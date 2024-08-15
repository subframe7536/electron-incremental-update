import { readFileSync, rmSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { type Options, defineConfig } from 'tsup'

function getConfig(): Options[] {
  rmSync('./dist', { recursive: true, force: true })
  const fontCSS = transformSync(
    readFileSync('./src/utils/devtoolsCSS/font.css', 'utf-8'),
    { minify: true, loader: 'css' },
  )
  const scrollbarCSS = transformSync(
    readFileSync('./src/utils/devtoolsCSS/scrollbar.css', 'utf-8'),
    { minify: true, loader: 'css' },
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
      external: ['electron', 'esbuild', 'vite'],
      define: {
        __FONT_CSS__: JSON.stringify(fontCSS?.code.replace(/\n/g, '') || ''),
        __SCROLLBAR_CSS__: JSON.stringify(scrollbarCSS?.code.replace(/\n/g, '') || ''),
      },
    },
    {
      entry: {
        vite: './src/vite/index.ts',
      },
      format: 'esm',
      dts: true,
      treeshake: true,
      external: ['electron', 'esbuild', 'vite'],
    },
  ]
}

export default defineConfig(getConfig())
