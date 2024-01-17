import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { release } from 'node:os'
import { app } from 'electron'

export const DEFAULT_APP_NAME = 'ElectronApp'

type Is = {
  dev: boolean
  win: boolean
  mac: boolean
  linux: boolean
}

/**
 * get app info
 */
export const is: Is = {
  dev: !app.isPackaged,
  win: process.platform === 'win32',
  mac: process.platform === 'darwin',
  linux: process.platform === 'linux',
}

export function getLocale() {
  return app.isReady() ? app.getLocale() : undefined
}

/**
 * get the absolute path of `APP_NAME.asar` (not `app.asar`),
 * if is in dev, return `'DEV.asar'`
 * @param name The name of the application
 */
export function getAppAsarPath(name = DEFAULT_APP_NAME) {
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
    ? readFileSync(join(getAppAsarPath(name), 'version'), 'utf-8')
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

/**
 * Restarts the Electron app.
 */
export function restartApp() {
  app.relaunch()
  app.quit()
}

/**
 * fix app use model id, only for Windows
 * @param id app id
 */
export function setAppUserModelId(id: string): void {
  is.win && app.setAppUserModelId(is.dev ? process.execPath : id)
}

/**
 * disable hardware acceleration for Windows 7
 */
export function disableHWAccForWin7() {
  if (release().startsWith('6.1')) {
    app.disableHardwareAcceleration()
  }
}

/**
 * keep single electron instance
 */
export function singleInstance() {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
  }
}

/**
 * set `AppData` dir to the dir of .exe file
 *
 * useful for portable Windows app
 * @param dirName dir name, default to `data`
 */
export function setPortableAppDataPath(dirName = 'data') {
  const portablePath = join(dirname(app.getPath('exe')), dirName)

  if (!existsSync(portablePath)) {
    mkdirSync(portablePath)
  }

  app.setPath('appData', portablePath)
}

/**
 * ensure app is ready.
 * @param timeout wait timeout, @default 1000
 */
export function waitAppReady(timeout = 1000): Promise<void> {
  return app.isReady()
    ? Promise.resolve()
    : new Promise((resolve, reject) => {
      const _ = setTimeout(() => {
        reject(new Error('app is not ready'))
      }, timeout)

      app.whenReady().then(() => {
        clearTimeout(_)
        resolve()
      })
    })
}
