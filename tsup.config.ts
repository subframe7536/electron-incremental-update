import { rmSync } from 'node:fs'
import { type Options, defineConfig } from 'tsup'

function getConfig(): Options[] {
  rmSync('./dist', { recursive: true, force: true })
  return [
    {
      entry: {
        index: './src/entry.ts',
        utils: './src/utils/index.ts',
        provider: './src/provider/index.ts',
      },
      format: ['esm', 'cjs'],
      dts: true,
      treeshake: true,
      external: ['electron', 'esbuild', 'vite'],
    },
    {
      entry: {
        vite: './src/vite.ts',
      },
      format: 'esm',
      dts: true,
      treeshake: true,
      external: ['electron', 'esbuild', 'vite'],
    },
  ]
}

export default defineConfig(getConfig())
