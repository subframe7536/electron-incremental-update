import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { release } from 'node:os'
import type { BrowserWindow } from 'electron'
import { app } from 'electron'

/**
 * app info
 */
export const is = {
  dev: !app.isPackaged,
  win: process.platform === 'win32',
  mac: process.platform === 'darwin',
  linux: process.platform === 'linux',
} as const

/**
 * get the absolute path of `${electron.app.name}.asar` (not `app.asar`)
 *
 * if is in dev, return `'DEV.asar'`
 */
export function getPathFromAppNameAsar(...path: string[]) {
  return is.dev ? 'DEV.asar' : join(dirname(app.getAppPath()), `${app.name}.asar`, ...path)
}

/**
 * get versions of App, Entry, Electron, Node and System
 *
 * App version is read from `version` file in `${app.name}.asar`
 *
 * Entry version is read from `package.json`
 *
 * SystemVersion: `${platform} ${os.release()}`
 */
export function getVersions() {
  const platform = is.win
    ? 'Windows'
    : is.mac
      ? 'MacOS'
      : process.platform.toUpperCase()

  return {
    appVersion: is.dev
      ? app.getVersion()
      : readFileSync(getPathFromAppNameAsar('version'), 'utf-8'),
    entryVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    systemVersion: `${platform} ${release()}`,
  }
}

/**
 * load native module from entry
 * @param moduleName file name in entry
 */
type RequireNative = <T = any>(moduleName: string) => T

/**
 * load module from entry, **only for main and preload**
 * @remark use `require`, only support **CommonJS**
 * @param devEntryDirPath entry directory path when dev, default `../../dist-entry`
 * @param entryDirPath entry directory path when not dev, default `join(app.getAppPath(), basename(devEntryDirPath))`
 * @example
 * const requireNative = loadNativeModuleFromEntry()
 * const db = requireNative<typeof import('../native/db')>('db')
 * db.test()
 */
export function loadNativeModuleFromEntry(
  devEntryDirPath = '../../dist-entry',
  entryDirPath = join(app.getAppPath(), basename(devEntryDirPath)),
): RequireNative {
  const path = is.dev ? devEntryDirPath : entryDirPath
  return (moduleName) => {
    try {
      // eslint-disable-next-line ts/no-require-imports
      return require(join(path, moduleName))
    } catch (error) {
      console.error('fail to load module', error)
    }
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
 * @param id app id @default `org.${app.name}`
 */
export function setAppUserModelId(id?: string) {
  app.setAppUserModelId(is.dev ? process.execPath : id ?? `org.${app.name}`)
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
 * keep single electron instance and auto restore window on `second-instance` event
 * @param window brwoser window to show
 * @returns `false` if the app is running
 */
export function singleInstance(window?: BrowserWindow) {
  const result = app.requestSingleInstanceLock()
  result
    ? app.on('second-instance', () => {
      if (window) {
        window.show()
        if (window.isMinimized()) {
          window.restore()
        }
        window.focus()
      }
    })
    : app.quit()

  return result
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

/**
 * get paths, **only for main and preload**
 * @param entryDirName entry dir name, default to `dist-entry`
 */
export function getPaths(entryDirName = 'dist-entry') {
  const root = join(__dirname, '..')
  const mainDirPath = join(root, 'main')
  const preloadDirPath = join(root, 'preload')
  const rendererDirPath = join(root, 'renderer')
  const devServerURL = process.env.VITE_DEV_SERVER_URL
  const indexHTMLPath = join(rendererDirPath, 'index.html')
  const publicDirPath = devServerURL ? join(root, '../public') : rendererDirPath

  return {
    /**
     * @example
     * ```ts
     * devServerURL && win.loadURL(devServerURL)
     * ```
     */
    devServerURL,
    /**
     * @example
     * ```ts
     * win.loadFile(indexHTMLPath)
     * ```
     */
    indexHTMLPath,
    /**
     * get path inside entry asar
     * @param paths joined path
     */
    getPathFromEntryAsar(...paths: string[]) {
      return join(app.getAppPath(), entryDirName, ...paths)
    },
    /**
     * get path inside `${app.name}.asar/main`
     * @param paths joined path
     */
    getPathFromMain(...paths: string[]) {
      return join(mainDirPath, ...paths)
    },
    /**
     * get path inside `${app.name}.asar/preload`
     * @param paths joined path
     */
    getPathFromPreload(...paths: string[]) {
      return join(preloadDirPath, ...paths)
    },
    /**
     * get path inside public dir
     * @param paths joined path
     */
    getPathFromPublic(...paths: string[]) {
      return join(publicDirPath, ...paths)
    },
  }
}
