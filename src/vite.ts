import type { Plugin as VitePlugin } from 'vite'
import { createLogger } from 'vite'
import { buildEntry } from './build-entry'
import { buildAsar } from './build-asar'
import type { Options } from './option'
import { parseOptions } from './option'

export default function (options: Options): VitePlugin[] {
  const { isBuild, buildAsarOption, buildEntryOption } = parseOptions(options)
  const { entryPath, entryOutputPath } = buildEntryOption
  const { asarOutputPath } = buildAsarOption

  const id = 'electron-incremental-updater'
  const log = createLogger('info', { prefix: `[${id}]` })

  return [
    {
      name: `vite-plugin-${id}-entry`,
      async buildStart() {
        log.info('build entry start')
        await buildEntry(buildEntryOption)
        log.info(`build entry end, ${entryPath} -> ${entryOutputPath}`)
      },
    },
    {
      name: `vite-plugin-${id}-asar`,
      async closeBundle() {
        if (!isBuild) {
          return
        }
        log.info('build asar start')
        await buildAsar(buildAsarOption)
        log.info(`build asar end, output to ${asarOutputPath}`)
      },
    },
  ]
}
