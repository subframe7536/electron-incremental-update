import { build } from 'esbuild'
import type { BuildEntryOption } from './option'

export async function buildEntry({
  entryPath,
  entryOutputPath: outfile,
  minify,
}: BuildEntryOption) {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: 'node',
    outfile,
    minify,
    external: ['electron'],
  })
}
