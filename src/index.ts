import { resolve } from 'node:path'
import { existsSync, renameSync } from 'node:fs'
import { app } from 'electron'
import type { Updater, UpdaterOption } from './updater/types'
import { createUpdater } from './updater'
import { getProductAsarPath } from './utils'

export * from './updater'

export type AppOption = {
  /**
   * path of electron output dist when in development
   * @default 'dist-electron'
   */
  electronDevDistPath?: string
  /**
   * relative path of main entry in electron dist
   * @default 'main/index.js'
   */
  mainPath?: string
  onStart?: (entryPath: string) => void
  onStartError?: (err: unknown) => void
}
export type StartupWithUpdater = (updater: Updater) => void
/**
 * create updater manually
 * @example
 * ```ts
 * import { createUpdater, getGithubReleaseCdnGroup, initApp, parseGithubCdnURL } from 'electron-incremental-update'
 * import { name, repository } from '../package.json'
 *
 * const SIGNATURE_CERT = '' // auto generate
 *
 * const { cdnPrefix } = getGithubReleaseCdnGroup()[0]
 * const updater = createUpdater({
 *   SIGNATURE_CERT,
 *   productName: name,
 *   repository,
 *   updateJsonURL: parseGithubCdnURL(repository, 'fastly.jsdelivr.net/gh', 'version.json'),
 *   releaseAsarURL: parseGithubCdnURL(repository, cdnPrefix, `download/latest/${name}.asar.gz`),
 *   debug: true,
 * })
 * initApp().setUpdater(updater)
 * ```
 */
export function initApp(
  appOptions: AppOption,
): { setUpdater: (updater: Updater) => void }
/**
 * create updater when init, no need to set productName
 *
 * @example
 * ```ts
 * import { initApp } from 'electron-incremental-update'
 * import { name, repository } from '../package.json'
 *
 * const SIGNATURE_CERT = '' // auto generate
 *
 * initApp({ productName: name, SIGNATURE_CERT, repository })
 * ```
 */
export function initApp(
  appOptions: AppOption,
  updaterOptions: UpdaterOption,
): undefined
export function initApp(
  {
    electronDevDistPath = 'dist-electron',
    mainPath = 'main/index.js',
    onStart,
    onStartError,
  }: AppOption,
  updaterOptions?: UpdaterOption,
) {
  function startup(updater: Updater) {
    try {
      const asarPath = getProductAsarPath(updater.productName)

      if (existsSync(`${asarPath}.tmp`)) {
        renameSync(`${asarPath}.tmp`, asarPath)
      }

      const mainDir = app.isPackaged
        ? asarPath
        : electronDevDistPath

      const entry = resolve(__dirname, mainDir, mainPath)
      onStart?.(entry)
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      require(entry)(updater)
    } catch (error) {
      if (onStartError) {
        onStartError(error)
      } else {
        console.error('fail to start app,', error)
        app.quit()
        process.exit(1)
      }
    }
  }
  if (updaterOptions) {
    startup(createUpdater(updaterOptions))
  } else {
    let timer = setTimeout(() => {
      console.error('start app timeout, please call .setUpdater() to set updater and start')
      app.quit()
      process.exit(1)
    }, 3000)
    return {
      setUpdater(updater: Updater) {
        clearTimeout(timer)
        startup(updater)
      },
    }
  }
}
