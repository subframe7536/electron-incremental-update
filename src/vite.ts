import type { Plugin as VitePlugin } from 'vite'
import { createLogger } from 'vite'
import { buildAsar, buildEntry, buildVersion } from './build-plugins/build'
import type { Options } from './build-plugins/option'
import { parseOptions } from './build-plugins/option'

export type { Options }
export function ElectronUpdater(options: Options): VitePlugin {
  const { isBuild, buildAsarOption, buildEntryOption, buildVersionOption } = parseOptions(options)
  const { entryPath, entryOutputPath } = buildEntryOption
  const { asarOutputPath } = buildAsarOption

  const id = 'electron-incremental-updater'
  const log = createLogger('info', { prefix: `[${id}]` })

  return {
    name: `vite-plugin-${id}`,
    enforce: 'post',
    async closeBundle() {
      log.info('build entry start', { timestamp: true })
      await buildEntry(buildEntryOption)

      log.info(`build entry end, ${entryPath} -> ${entryOutputPath}`, { timestamp: true })

      if (!isBuild) {
        return
      }

      log.info('build asar start', { timestamp: true })
      await buildAsar(buildAsarOption)

      await buildVersion(buildVersionOption)
      log.info(`build asar end, output to ${asarOutputPath}`, { timestamp: true })
    },
  }
}
