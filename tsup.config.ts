import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: './src/entry.ts',
      utils: './src/utils/index.ts',
      provider: './src/provider/index.ts',
    },
    format: ['esm', 'cjs'],
    clean: true,
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
