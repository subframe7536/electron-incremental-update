import { defineConfig } from 'tsup'

export default defineConfig({
  dts: true,
  clean: true,
  format: ['esm', 'cjs'],
  entry: [
    'src/plugin.ts',
    'src/index.ts',
  ],
  external: ['electron', 'asar', '@electron/asar', 'vite', 'esbuild'],
  outDir: 'dist',
  outExtension(ctx) {
    return {
      js: ctx.format === 'esm' ? '.mjs' : '.cjs',
    }
  },
})
