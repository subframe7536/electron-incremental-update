import { resolve } from 'node:path'
import { existsSync, renameSync } from 'node:fs'
import { app } from 'electron'
import type { Updater, UpdaterOption } from './updater/types'
import { createUpdater } from './updater'
import { getProductAsarPath } from './utils'

export * from './updater'

type Promisable<T> = T | Promise<T>

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
  hooks?: {
    /**
     * hooks before replace the old asar is replaced by the new asar
     *
     * @param oldAsarPath old asar path
     * @param updateTempAsarPath new asar path, end with .tmp
     */
    beforeDoUpdate?: (oldAsarPath: string, updateTempAsarPath: string) => Promisable<void>
    /**
     * hooks before start up
     */
    beforeStart?: (productAsarPath: string) => Promisable<void>
    /**
     * hooks on start up error
     */
    onStartError?: (err: unknown) => void
  }
}
export type StartupWithUpdater = (updater: Updater) => void
type SetUpdater = {
  /**
   * set updater option or create function
   */
  setUpdater: (updater: (() => Promisable<Updater>) | UpdaterOption) => void
}

/**
 * initialize app
 * @example
 * ```ts
 * import { getGithubReleaseCdnGroup, initApp, parseGithubCdnURL } from 'electron-incremental-update'
 * import { name, repository } from '../package.json'
 *
 * const SIGNATURE_CERT = '' // auto generate certificate when start app
 * const { cdnPrefix: asarPrefix } = getGithubReleaseCdnGroup()[0]
 * const { cdnPrefix: jsonPrefix } = getGithubFileCdnGroup()[0]
 * initApp({ onStart: console.log })
 *   // can be updater option or function that return updater
 *   .setUpdater({
 *     SIGNATURE_CERT,
 *     productName: name,
 *     repository,
 *     updateJsonURL: parseGithubCdnURL(repository, jsonPrefix, 'version.json'),
 *     releaseAsarURL: parseGithubCdnURL(repository, asarPrefix, `download/latest/${name}.asar.gz`),
 *     receiveBeta: true,
 *   })
 * ```
 */
export function initApp(
  appOptions?: AppOption,
): SetUpdater {
  const {
    electronDevDistPath = 'dist-electron',
    mainPath = 'main/index.js',
    hooks,
  } = appOptions || {}
  const {
    beforeDoUpdate,
    beforeStart,
    onStartError,
  } = hooks || {}
  function handleError(msg: string) {
    onStartError?.(new Error(msg))
    app.quit()
  }
  async function startup(updater: Updater) {
    try {
      const asarPath = getProductAsarPath(updater.productName)

      // apply updated asar
      const updateAsarPath = `${asarPath}.tmp`
      if (existsSync(updateAsarPath)) {
        await beforeDoUpdate?.(asarPath, updateAsarPath)
        renameSync(updateAsarPath, asarPath)
      }

      const mainDir = app.isPackaged
        ? asarPath
        : electronDevDistPath

      const entry = resolve(__dirname, mainDir, mainPath)
      await beforeStart?.(entry)
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
    async setUpdater(updater) {
      clearTimeout(timer)
      if (typeof updater === 'object') {
        await startup(createUpdater(updater))
      } else if (typeof updater === 'function') {
        await startup(await updater())
      } else {
        handleError('invalid updater option or updater is not a function')
      }
    },
  }
}
