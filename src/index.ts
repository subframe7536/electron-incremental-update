import { resolve } from 'node:path'
import { existsSync, renameSync } from 'node:fs'
import { app } from 'electron'
import type { Logger, Updater, UpdaterOption } from './updater/types'
import { createUpdater } from './updater'
import { getProductAsarPath } from './utils'

export * from './updater'

type Promisable<T> = T | Promise<T>

type OnInstallFunction = (
  install: VoidFunction,
  tempAsarPath: string,
  productAsarPath: string,
  logger?: Logger
) => Promisable<void>

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
   * update hooks
   */
  hooks?: {
    /**
     * hooks on rename temp asar path to product asar path
     * @param install `() => renameSync(tempAsarPath, productAsarPath)`
     * @param tempAsarPath temp(updated) asar path
     * @param productAsarPath product asar path
     * @param logger logger
     * @default install(); logger?.info(`update success!`)
     */
    onInstall?: OnInstallFunction
    /**
     * hooks before start
     * @param productAsarPath path of product asar
     * @param logger logger
     */
    beforeStart?: (productAsarPath: string, logger?: Logger) => Promisable<void>
    /**
     * hooks on start up error
     * @param err installing or startup error
     * @param logger logger
     */
    onStartError?: (err: unknown, logger?: Logger) => void
  }
}
export type StartupWithUpdater = (updater: Updater) => void

type SetUpdater = {
  /**
   * set updater option or create function
   */
  setUpdater: (updater: (() => Promisable<Updater>) | UpdaterOption) => void
}

const defaultOnInstall: OnInstallFunction = (install, _, __, logger) => {
  install()
  logger?.info(`update success!`)
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
    onInstall = defaultOnInstall,
    beforeStart,
    onStartError,
  } = hooks || {}
  function handleError(err: unknown, logger?: Logger) {
    onStartError?.(err, logger)
    app.quit()
  }
  async function startup(updater: Updater) {
    const logger = updater.logger
    try {
      const productAsarPath = getProductAsarPath(updater.productName)

      // apply updated asar
      const tempAsarPath = `${productAsarPath}.tmp`
      if (existsSync(tempAsarPath)) {
        logger?.info(`installing new asar: ${tempAsarPath}`)
        await onInstall(() => renameSync(tempAsarPath, productAsarPath), tempAsarPath, productAsarPath, logger)
      }

      const mainDir = app.isPackaged
        ? productAsarPath
        : electronDevDistPath

      const entry = resolve(__dirname, mainDir, mainPath)
      await beforeStart?.(entry, logger)
      // eslint-disable-next-line ts/no-require-imports, ts/no-var-requires
      require(entry)(updater)
    } catch (error) {
      handleError(error, logger)
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
