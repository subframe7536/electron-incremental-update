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
  electronVersion: string
  appVersion: (name?: string) => string
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
  electronVersion: getElectronVersion(),
  appVersion: getAppVersion,
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
  return !app.isPackaged ? 'DEV.asar' : join(dirname(app.getAppPath()), `${name}.asar`)
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path)
  } catch (error) {
    return new NoSuchNativeModuleError(packageName)
  }
}

/**
 * parse Github CDN URL for accelerating the speed of downloading
 *
 * {@link https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L34 some public CDN links}
 */
export function parseGithubCdnURL(originRepoURL: string, cdnPrefix: string, relativeFilePath: string) {
  if (!originRepoURL.startsWith('https://github.com/')) {
    throw new Error('origin url must start with https://github.com/')
  }

  originRepoURL = originRepoURL.trim().replace(/\/?$/, '/').trim()
  relativeFilePath = relativeFilePath.trim().replace(/^\/|\/?$/g, '').trim()
  cdnPrefix = cdnPrefix.trim().replace(/^\/?|\/?$/g, '').trim()

  return originRepoURL.replace('github.com', cdnPrefix) + relativeFilePath
}

/**
 * Restarts the Electron app.
 */
export function restartApp() {
  app.relaunch()
  app.quit()
}
/**
 * ensure app is ready.
 */
export function waitAppReady(duration = 1000): Promise<void> {
  if (app.isReady()) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('app is not ready'))
    }, duration)

    app.whenReady().then(() => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

export function handleUnexpectedErrors(callback: (err: unknown) => void) {
  process.on('uncaughtException', callback)
  process.on('unhandledRejection', callback)
}
