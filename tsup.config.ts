import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    vite: './src/vite.ts',
    utils: './src/utils/index.ts',
  },
  dts: true,
  clean: true,
  format: ['esm', 'cjs'],
  external: ['electron', 'esbuild'],
  outDir: 'dist',
})
