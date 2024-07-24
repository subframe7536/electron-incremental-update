import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import type { Promisable } from '@subframe7536/type-utils'
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

/**
 * Hooks on rename temp asar path to `${app.name}.asar`
 * @param install `() => renameSync(tempAsarPath, appNameAsarPath)`
 * @param tempAsarPath temp(updated) asar path
 * @param appNameAsarPath `${app.name}.asar` path
 * @param logger logger
 * @default install(); logger.info(`update success!`)
 */
type OnInstallFunction = (
  install: VoidFunction,
  tempAsarPath: string,
  appNameAsarPath: string,
  logger?: Logger
) => Promisable<void>

export interface AppOption {
  /**
   * Path to index file that make {@link startupWithUpdater} as default export
   *
   * Generate from plugin configuration by default
   */
  mainPath?: string
  /**
   * Updater options
   */
  updater?: (() => Promisable<Updater>) | UpdaterOption
  /**
   * Hooks on rename temp asar path to `${app.name}.asar`
   */
  onInstall?: OnInstallFunction
  /**
   * Hooks before app startup
   * @param mainFilePath main file path of `${app.name}.asar`
   * @param logger logger
   */
  beforeStart?: (mainFilePath: string, logger?: Logger) => Promisable<void>
  /**
   * Hooks on app startup error
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
 * Initialize Electron with updater
 * @example
 * createElectronApp({
 *   updater: {
 *     provider: new GitHubProvider({
 *       username: 'yourname',
 *       repo: 'electron',
 *     }),
 *   },
 *   beforeStart(mainFilePath, logger) {
 *     logger?.debug(mainFilePath)
 *   },
 * })
 */
export async function createElectronApp(
  appOptions: AppOption = {},
): Promise<void> {
  const appNameAsarPath = getPathFromAppNameAsar()

  const {
    mainPath = path.join(
      isDev
        ? path.join(app.getAppPath(), __EIU_MAIN_DEV_DIR__)
        : appNameAsarPath,
      'main',
      __EIU_MAIN_FILE__,
    ),
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
    // do update: replace the old asar with new asar
    const tempAsarPath = `${appNameAsarPath}.tmp`
    if (fs.existsSync(tempAsarPath)) {
      logger?.info(`Installing new asar from ${tempAsarPath}`)
      await onInstall(() => fs.renameSync(tempAsarPath, appNameAsarPath), tempAsarPath, appNameAsarPath, logger)
    }

    // logger.debug(`app.getAppPath(): ${app.getAppPath()}`)
    // logger.debug(`appNameAsar: ${appNameAsarPath}`)
    // logger.debug(`__EIU_MAIN_FILE__: ${__EIU_MAIN_FILE__}`)
    // logger.debug(`__EIU_MAIN_DEV_DIR__: ${__EIU_MAIN_DEV_DIR__}`)
    // logger.debug(`mainFilePath: ${mainFilePath}`)
    await beforeStart?.(mainPath, logger)
    // eslint-disable-next-line ts/no-require-imports
    require(mainPath)(updaterInstance)
  } catch (error) {
    logger?.error('startup error', error)
    onStartError?.(error, logger)
    app.quit()
  }
}

/**
 * @alias {@link createElectronApp}
 */
export const initApp = createElectronApp
