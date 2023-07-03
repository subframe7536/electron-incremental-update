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
  /**
   * hooks for start up
   */
  onStart?: (productAsarPath: string) => void
  /**
   * hooks for start up error
   */
  onStartError?: (err: unknown) => void
}
export type StartupWithUpdater = (updater: Updater) => void
type SetUpdater = {
  /**
   * set updater option or create function
   */
  setUpdater: (updater: (() => Updater | Promise<Updater>) | UpdaterOption) => void
}

/**
 * create updater manually
 * @example
 * ```ts
 * import { getGithubReleaseCdnGroup, initApp, parseGithubCdnURL } from 'electron-incremental-update'
 * import { name, repository } from '../package.json'
 *
 * const SIGNATURE_CERT = '' // auto generate certificate when start app
 *
 * const { cdnPrefix } = getGithubReleaseCdnGroup()[0]
 * initApp({ onStart: console.log })
 *   // can be updater option or function that return updater
 *   .setUpdater({
 *     SIGNATURE_CERT,
 *     productName: name,
 *     repository,
 *     updateJsonURL: parseGithubCdnURL(repository, 'fastly.jsdelivr.net/gh', 'version.json'),
 *     releaseAsarURL: parseGithubCdnURL(repository, cdnPrefix, `download/latest/${name}.asar.gz`),
 *     debug: true,
 *   })
 * ```
 */
export function initApp(
  appOptions?: AppOption,
): SetUpdater {
  const {
    electronDevDistPath = 'dist-electron',
    mainPath = 'main/index.js',
    onStart,
    onStartError,
  } = appOptions || {}
  function handleError(msg: string) {
    onStartError?.(new Error(msg))
    app.quit()
  }
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
      handleError(`failed to start app, ${error}`)
    }
  }
  let timer = setTimeout(() => {
    handleError('start app timeout, please call .setUpdater() to set updater and start')
  }, 3000)
  return {
    async setUpdater(updater: (() => Updater | Promise<Updater>) | UpdaterOption) {
      clearTimeout(timer)
      if (typeof updater === 'object') {
        startup(createUpdater(updater))
      } else if (typeof updater === 'function') {
        startup(await updater())
      } else {
        handleError('invalid updater option or updater is not a function')
      }
    },
  }
}
