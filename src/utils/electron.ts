import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { release } from 'node:os'
import type { BrowserWindow } from 'electron'
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
 * @todo change a better function name
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
      : readFileSync(getPathFromAppNameAsar('version'), 'utf-8'),
    entry: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    system: `${platform} ${release()}`,
  }
}

/**
 * load module from entry
 * @param devEntryDirPath entry directory path when dev, default `../../dist-entry`
 * @param entryDirPath entry directory path when not dev, default `join(app.getAppPath(), basename(devEntryDirPath))`
 */
export function loadModuleFromEntry(
  devEntryDirPath = '../../dist-entry',
  entryDirPath = join(app.getAppPath(), basename(devEntryDirPath)),
): <T = any>(moduleName: string) => T {
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
 * get paths
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
    getPathFromEntryAsar(...path: string[]) {
      return join(app.getAppPath(), entryDirName, ...path)
    },
    getPathFromMain(...path: string[]) {
      return join(mainDirPath, ...path)
    },
    getPathFromPreload(...path: string[]) {
      return join(preloadDirPath, ...path)
    },
    getPathFromPublic(...path: string[]) {
      return join(publicDirPath, ...path)
    },
  }
}
