import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { release } from 'node:os'
import { app } from 'electron'

export const DEFAULT_APP_NAME = 'product'

type Info = {
  dev: boolean
  win: boolean
  mac: boolean
  linux: boolean
  /**
   * `os.release()`
   */
  systemVersion: string
}

/**
 * get app info
 */
export const appInfo: Info = {
  dev: !app.isPackaged,
  win: process.platform === 'win32',
  mac: process.platform === 'darwin',
  linux: process.platform === 'linux',
  systemVersion: release(),
}

export function getLocale() {
  return app.isReady() ? app.getLocale() : undefined
}

/**
 * get the application asar absolute path (not `app.asar`),
 * if is in dev, return `'DEV.asar'`
 * @param name The name of the application
 */
export function getProductAsarPath(name = DEFAULT_APP_NAME) {
  return !app.isPackaged ? join(dirname(app.getAppPath()), `${name}.asar`) : 'DEV.asar'
}

/**
 * get the version of Electron runtime
 */
export function getElectronVersion() {
  return app.getVersion()
}

/**
 * get the version of application (name.asar)
 *
 * if is dev, return {@link getElectronVersion}
 * @param name - The name of the application
 */
export function getAppVersion(name = DEFAULT_APP_NAME) {
  return app.isPackaged
    ? readFileSync(join(getProductAsarPath(name), 'version'), 'utf-8')
    : getElectronVersion()
}

export class NoSuchNativeModuleError extends Error {
  moduleName: string
  constructor(moduleName: string) {
    super(`no such native module: ${moduleName}`)
    this.moduleName = moduleName
  }
}

export function isNoSuchNativeModuleError(e: unknown): e is NoSuchNativeModuleError {
  return e instanceof NoSuchNativeModuleError
}

/**
 * require native package, if not found, return {@link NoSuchNativeModuleError}
 * @param packageName native package name
 */
export function requireNative<T = any>(packageName: string): T | NoSuchNativeModuleError {
  const path = app.isPackaged
    ? join(app.getAppPath(), 'node_modules', packageName)
    : packageName
  try {
    // eslint-disable-next-line ts/no-require-imports
    return require(path)
  } catch (error) {
    return new NoSuchNativeModuleError(packageName)
  }
}
