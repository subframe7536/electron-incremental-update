import { resolve } from 'node:path'
import { existsSync, renameSync } from 'node:fs'
import { app } from 'electron'
import type { Logger, Updater, UpdaterOption } from './updater'
import { createUpdater } from './updater'
import { getPathFromAppNameAsar, is } from './utils'

export * from './updater'

type Promisable<T> = T | Promise<T>

type OnInstallFunction = (
  install: VoidFunction,
  tempAsarPath: string,
  appNameAsarPath: string,
  logger?: Logger
) => Promisable<void>

export type AppOption = {
  /**
   * updater options
   */
  updater: (() => Promisable<Updater>) | UpdaterOption
  /**
   * path of electron output dist when in development
   * @default '../dist-electron'
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
     * hooks on rename temp asar path to `${app.name}.asar`
     * @param install `() => renameSync(tempAsarPath, appNameAsarPath)`
     * @param tempAsarPath temp(updated) asar path
     * @param appNameAsarPath `${app.name}.asar` path
     * @param logger logger
     * @default install(); logger?.info(`update success!`)
     */
    onInstall?: OnInstallFunction
    /**
     * hooks before start
     * @param appNameAsarPath path of `${app.name}.asar`
     * @param logger logger
     */
    beforeStart?: (appNameAsarPath: string, logger?: Logger) => Promisable<void>
    /**
     * hooks on start up error
     * @param err installing or startup error
     * @param logger logger
     */
    onStartError?: (err: unknown, logger?: Logger) => void
  }
}

/**
 * utils for startuping with updater
 * @param fn startup function
 * @example
 * // in electron/main/index.ts
 * export default startupWithUpdater((updater) => {
 *   updater.checkUpdate()
 * })
 */
export function startupWithUpdater(fn: (updater: Updater) => Promisable<void>) {
  return fn
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
 * import { repository } from '../package.json'
 *
 * const SIGNATURE_CERT = '' // auto generate certificate when start app
 * const { cdnPrefix: asarPrefix } = getGithubReleaseCdnGroup()[0]
 * const { cdnPrefix: jsonPrefix } = getGithubFileCdnGroup()[0]
 *
 * initApp({
 *   // can be updater option or function that return updater
 *   updater: {
 *     SIGNATURE_CERT,
 *     repository,
 *     updateJsonURL: parseGithubCdnURL(repository, jsonPrefix, 'version.json'),
 *     releaseAsarURL: parseGithubCdnURL(repository, asarPrefix, `download/latest/${app.name}.asar.gz`),
 *     receiveBeta: true,
 *   },
 *   onStart: console.log
 * })
 * ```
 */
export async function initApp(
  appOptions: AppOption,
): Promise<void> {
  const {
    updater,
    electronDevDistPath = '../dist-electron',
    mainPath = 'main/index.js',
    hooks,
  } = appOptions || {}
  const {
    onInstall = defaultOnInstall,
    beforeStart,
    onStartError,
  } = hooks || {}
  function handleError(err: unknown, logger?: Logger) {
    console.error(err)
    onStartError?.(err, logger)
    app.quit()
  }
  let updaterInstance
  if (typeof updater === 'object') {
    updaterInstance = createUpdater(updater)
  } else {
    updaterInstance = await updater()
  }

  const logger = updaterInstance.logger
  try {
    const appNameAsarPath = getPathFromAppNameAsar()

    // do update: replace the old asar with new asar
    const tempAsarPath = `${appNameAsarPath}.tmp`
    if (existsSync(tempAsarPath)) {
      logger?.info(`installing new asar: ${tempAsarPath}`)
      await onInstall(() => renameSync(tempAsarPath, appNameAsarPath), tempAsarPath, appNameAsarPath, logger)
    }

    const mainDir = is.dev ? electronDevDistPath : appNameAsarPath

    const entry = resolve(__dirname, mainDir, mainPath)
    await beforeStart?.(entry, logger)
    // eslint-disable-next-line ts/no-require-imports, ts/no-var-requires
    require(entry)(updaterInstance)
  } catch (error) {
    handleError(error, logger)
  }
}
