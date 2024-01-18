import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { release } from 'node:os'
import { app } from 'electron'

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

/**
 * get the absolute path of `${app.name}.asar` (not `app.asar`),
 * if is in dev, return `'DEV.asar'`
 */
export function getAppAsarPath() {
  return is.dev ? join(dirname(app.getAppPath()), `${app.name}.asar`) : 'DEV.asar'
}

/**
 * get versions of App, Installer, Electron, Node and System version
 *
 * App version is read from `version` file in `${app.name}.asar`
 *
 * Installer version is read from `package.json`
 */
export function getVersions() {
  const platform = is.win
    ? 'Windows'
    : is.mac
      ? 'Mac'
      : process.platform.toLocaleUpperCase()

  return {
    app: is.dev
      ? app.getVersion()
      : readFileSync(join(getAppAsarPath(), 'version'), 'utf-8'),
    installer: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    system: `${platform} ${release()}`,
  }
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
  const path = is.dev
    ? packageName
    : join(app.getAppPath(), 'node_modules', packageName)
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
