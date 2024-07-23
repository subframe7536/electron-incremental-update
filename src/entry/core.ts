import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { getPathFromAppNameAsar, isDev } from '../utils/electron'
import type { Logger, UpdaterOption } from './types'
import { Updater } from './updater'

/**
 * type only electron main file path, transformed by esbuild's define
 */
declare const __EIU_MAIN_FILE__: string
/**
 * type only electron main dir path when dev, transformed by esbuild's define
 */
declare const __EIU_MAIN_DEV_DIR__: string

type Promisable<T> = T | Promise<T>

/**
 * hooks on rename temp asar path to `${app.name}.asar`
 * @param install `() => renameSync(tempAsarPath, appNameAsarPath)`
 * @param tempAsarPath temp(updated) asar path
 * @param appNameAsarPath `${app.name}.asar` path
 * @param logger logger
 * @default install(); logger.info(`update success!`)
 */
type OnInstallFunction = (install: VoidFunction, tempAsarPath: string, appNameAsarPath: string, logger?: Logger) => Promisable<void>

export interface AppOption {
  /**
   * updater options
   */
  updater?: (() => Promisable<Updater>) | UpdaterOption
  /**
   * hooks on rename temp asar path to `${app.name}.asar`
   */
  onInstall?: OnInstallFunction
  /**
   * hooks before app start up
   * @param mainFilePath main file path of `${app.name}.asar`
   * @param logger logger
   */
  beforeStart?: (mainFilePath: string, logger?: Logger) => Promisable<void>
  /**
   * hooks on app start up error
   * @param err installing or startup error
   * @param logger logger
   */
  onStartError?: (err: unknown, logger?: Logger) => void
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
export function startupWithUpdater(
  fn: (updater: Updater) => Promisable<void>,
): (updater: Updater) => Promisable<void> {
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
 * const { cdnPrefix: asarPrefix } = getGithubReleaseCdnGroup()[0]
 * const { cdnPrefix: jsonPrefix } = getGithubFileCdnGroup()[0]
 *
 * initApp({
 *   // can be updater option or function that return updater
 *   updater: {
 *     SIGNATURE_CERT: 'custom certificate',
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
    onInstall = defaultOnInstall,
    beforeStart,
    onStartError,
  } = appOptions

  let updaterInstance
  if (typeof updater === 'object' || !updater) {
    updaterInstance = new Updater(updater)
  } else {
    updaterInstance = await updater()
  }

  const logger = updaterInstance.logger
  try {
    const appNameAsarPath = getPathFromAppNameAsar()

    // do update: replace the old asar with new asar
    const tempAsarPath = `${appNameAsarPath}.tmp`
    if (fs.existsSync(tempAsarPath)) {
      logger?.info(`installing new asar: ${tempAsarPath}`)
      await onInstall(() => fs.renameSync(tempAsarPath, appNameAsarPath), tempAsarPath, appNameAsarPath, logger)
    }

    // logger.debug(`app.getAppPath(): ${app.getAppPath()}`)
    // logger.debug(`appNameAsar: ${appNameAsarPath}`)
    // logger.debug(`__EIU_MAIN_FILE__: ${__EIU_MAIN_FILE__}`)
    // logger.debug(`__EIU_MAIN_DEV_DIR__: ${__EIU_MAIN_DEV_DIR__}`)
    // logger.debug(`mainFilePath: ${mainFilePath}`)
    const mainFilePath = path.join(
      isDev
        ? path.join(app.getAppPath(), __EIU_MAIN_DEV_DIR__)
        : appNameAsarPath,
      'main',
      __EIU_MAIN_FILE__,
    )
    await beforeStart?.(mainFilePath, logger)
    // eslint-disable-next-line ts/no-require-imports
    require(mainFilePath)(updaterInstance)
  } catch (error) {
    logger?.error('startup error', error)
    onStartError?.(error, logger)
    app.quit()
  }
}
