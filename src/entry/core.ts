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
 * Hooks on rename temp asar path to `${app.name}.asar`
 * @param install `() => renameSync(tempAsarPath, appNameAsarPath)`
 * @param tempAsarPath temp(updated) asar path
 * @param appNameAsarPath `${app.name}.asar` path
 * @param logger logger
 * @default install(); logger.info(`update success!`)
 */
type OnInstallFunction = (install: VoidFunction, tempAsarPath: string, appNameAsarPath: string, logger?: Logger) => Promisable<void>

export interface AppOption {
  /**
   * Updater options
   */
  updater?: (() => Promisable<Updater>) | UpdaterOption
  /**
   * Hooks on rename temp asar path to `${app.name}.asar`
   */
  onInstall?: OnInstallFunction
  /**
   * Hooks before app start up
   * @param mainFilePath main file path of `${app.name}.asar`
   * @param logger logger
   */
  beforeStart?: (mainFilePath: string, logger?: Logger) => Promisable<void>
  /**
   * Hooks on app start up error
   * @param err installing or startup error
   * @param logger logger
   */
  onStartError?: (err: unknown, logger?: Logger) => void
}

/**
 * Utils to startup with updater
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
 * initApp({
 *   updater: {
 *     provider: new GitHubProvider({
 *       username: 'jerry7536',
 *       repo: 'electron2',
 *     }),
 *   },
 *   beforeStart(mainFilePath, logger) {
 *     logger?.debug(mainFilePath)
 *   },
 * })
 */
export async function initApp(
  appOptions: AppOption = {},
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
