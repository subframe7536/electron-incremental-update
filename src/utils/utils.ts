import { dirname, join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { app } from 'electron'
import { is } from './core'

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
 * fix app use model id, only for Windows
 * @param id app id
 */
export function setAppUserModelId(id: string): void {
  is.win && app.setAppUserModelId(is.dev ? process.execPath : id)
}

/**
 * set AppData dir for portable Windows app
 */
export function setPortableAppDataPath(dirName = 'data', create?: boolean) {
  if (!is.win) {
    return
  }
  const portablePath = join(dirname(app.getPath('exe')), dirName)
  let exists = existsSync(portablePath)
  if (create && !exists) {
    mkdirSync(portablePath)
    exists = true
  }
  if (exists) {
    app.setPath('appData', portablePath)
  }
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
 * handle all unhandled error
 * @param callback callback function
 */
export function handleUnexpectedErrors(callback: (err: unknown) => void) {
  process.on('uncaughtException', callback)
  process.on('unhandledRejection', callback)
}
