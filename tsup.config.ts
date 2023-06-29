import { defineConfig } from 'tsup'

export default defineConfig({
  dts: true,
  clean: true,
  format: ['esm', 'cjs'],
  entry: [
    'src/vite.ts',
    'src/index.ts',
    'src/utils.ts',
  ],
  external: ['electron', 'asar', '@electron/asar', 'vite', 'esbuild'],
  outDir: 'dist',
})
