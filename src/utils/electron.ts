import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { app } from 'electron'

/**
 * type only entry dir path, transformed by esbuild's define
 */
declare const __EIU_ENTRY_DIST_PATH__: string
/**
 * type only electron dist path, transformed by esbuild's define
 */
declare const __EIU_ELECTRON_DIST_PATH__: string
/**
 * type only is dev, transformed by esbuild's define
 */
declare const __EIU_IS_DEV__: boolean

/**
 * compile time dev check
 */
export const isDev = __EIU_IS_DEV__

export const isWin = process.platform === 'win32'

export const isMac = process.platform === 'darwin'

export const isLinux = process.platform === 'linux'

/**
 * get the absolute path of `${electron.app.name}.asar` (not `app.asar`)
 *
 * if is in dev, **always** return `'DEV.asar'`
 */
export function getPathFromAppNameAsar(...path: string[]): string {
  return isDev ? 'DEV.asar' : join(dirname(app.getAppPath()), `${app.name}.asar`, ...path)
}

/**
 * get app version, if is in dev, return `getEntryVersion()`
 */
export function getAppVersion(): string {
  return isDev ? getEntryVersion() : readFileSync(getPathFromAppNameAsar('version'), 'utf-8')
}

/**
 * get entry version
 */
export function getEntryVersion(): string {
  return app.getVersion()
}

/**
 * use `require` to load native module from entry
 * @param moduleName file name in entry
 */
export function requireNative<T = any>(moduleName: string): T {
  // eslint-disable-next-line ts/no-require-imports
  return require(join(app.getAppPath(), __EIU_ENTRY_DIST_PATH__, moduleName))
}

/**
 * Restarts the Electron app.
 */
export function restartApp(): void {
  app.relaunch()
  app.quit()
}

/**
 * fix app use model id, only for Windows
 * @param id app id, default is `org.${electron.app.name}`
 */
export function setAppUserModelId(id?: string): void {
  if (isWin) {
    app.setAppUserModelId(id ?? `org.${app.name}`)
  }
}

/**
 * disable hardware acceleration for Windows 7
 */
export function disableHWAccForWin7(): void {
  // eslint-disable-next-line ts/no-require-imports
  if (require('node:os').release().startsWith('6.1')) {
    app.disableHardwareAcceleration()
  }
}

/**
 * keep single electron instance and auto restore window on `second-instance` event
 * @param window brwoser window to show
 * @returns `false` if the app is running
 */
export function singleInstance(window?: BrowserWindow): boolean {
  const result = app.requestSingleInstanceLock()
  if (result) {
    app.on('second-instance', () => {
      if (window) {
        window.show()
        if (window.isMinimized()) {
          window.restore()
        }
        window.focus()
      }
    })
  } else {
    app.quit()
  }

  return result
}

/**
 * set `AppData` dir to the dir of .exe file
 *
 * useful for portable Windows app
 * @param dirName dir name, default to `data`
 */
export function setPortableAppDataPath(dirName = 'data'): void {
  const portablePath = join(dirname(app.getPath('exe')), dirName)

  if (!existsSync(portablePath)) {
    mkdirSync(portablePath)
  }

  app.setPath('appData', portablePath)
}

/**
 * load `process.env.VITE_DEV_SERVER_URL` when dev, else load html file
 * @param win window
 * @param htmlFilePath html file path, default is `index.html`
 */
export function loadPage(win: BrowserWindow, htmlFilePath = 'index.html'): void {
  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL! + htmlFilePath)
  } else {
    win.loadFile(getPathFromAppNameAsar('renderer', htmlFilePath))
  }
}

export function getPathFromPreload(...paths: string[]): string {
  return isDev
    ? join(app.getAppPath(), __EIU_ELECTRON_DIST_PATH__, 'preload', ...paths)
    : getPathFromAppNameAsar('preload', ...paths)
}

export function getPathFromPublic(...paths: string[]): string {
  return isDev
    ? join(app.getAppPath(), 'public', ...paths)
    : getPathFromAppNameAsar('renderer', ...paths)
}

export function getPathFromEntryAsar(...paths: string[]): string {
  return join(app.getAppPath(), __EIU_ENTRY_DIST_PATH__, ...paths)
}
