import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: './src/index.ts',
      utils: './src/utils/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    external: ['electron', 'esbuild', 'vite'],
  },
  {
    entry: {
      vite: './src/vite.ts',
    },
    format: 'esm',
    dts: true,
    external: ['electron', 'esbuild', 'vite'],
  },
])
