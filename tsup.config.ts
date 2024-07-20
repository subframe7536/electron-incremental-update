import { rmSync } from 'node:fs'
import { defineConfig } from 'tsup'

rmSync('./dist', { recursive: true, force: true })

export default defineConfig([
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
])
