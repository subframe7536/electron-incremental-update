import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { release } from 'node:os'
import { app } from 'electron'

type Info = {
  dev: boolean
  win: boolean
  mac: boolean
  linux: boolean
  electronVersion: string
  system: string
}
export const info: Info = {
  dev: !app.isPackaged,
  win: process.platform === 'win32',
  mac: process.platform === 'darwin',
  linux: process.platform === 'linux',
  electronVersion: getElectronVersion(),
  system: release(),
}

/**
 * get the application asar absolute path (not `app.asar`),
 * if is in dev, return `'DEV.asar'`
 * @param name The name of the application
 */
export function getProductAsarPath(name: string) {
  return info.dev ? 'DEV.asar' : join(dirname(app.getAppPath()), `${name}.asar`)
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
export function getAppVersion(name: string) {
  return info.dev
    ? getElectronVersion()
    : readFileSync(join(getProductAsarPath(name), 'version'), 'utf-8')
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
  const path = info.dev
    ? packageName
    : join(app.getAppPath(), 'node_modules', packageName)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path)
  } catch (error) {
    return new NoSuchNativeModuleError(packageName)
  }
}

/**
 * parse Github CDN URL for accelerating the speed of downloading
 */
export function parseGithubCdnURL(repository: string, cdnPrefix: string, relativeFilePath: string) {
  if (!repository.startsWith('https://github.com/')) {
    throw new Error('url must start with https://github.com/')
  }

  repository = repository.trim().replace(/\/?$/, '/').trim()
  relativeFilePath = relativeFilePath.trim().replace(/^\/|\/?$/g, '').trim()
  cdnPrefix = cdnPrefix.trim().replace(/^\/?|\/?$/g, '').trim()

  return repository.replace('github.com', cdnPrefix) + relativeFilePath
}

/**
 * get group of Github file CDN prefix for accelerating the speed of downloading project files
 */
export function getGithubFileCdnGroup() {
  return [
    { cdnPrefix: 'cdn.jsdelivr.net/gh', source: 'jsdelivr' },
    { cdnPrefix: 'fastly.jsdelivr.net/gh', source: 'jsdelivr-fastly' },
    { cdnPrefix: 'cdn.statically.io/gh', source: 'statically' },
    { cdnPrefix: 'rawcdn.githack.com/gh', source: 'githack' },
    { cdnPrefix: 'raw.githack.com/gh', source: 'githack-dev' },
  ]
}
/**
 * get group of github release CDN prefix for accelerating the speed of downloading release
 */
export function getGithubReleaseCdnGroup() {
  return [
    { cdnPrefix: 'gh.gh2233.ml', source: '@X.I.U/XIU2' },
    { cdnPrefix: 'ghproxy.com', source: 'gh-proxy' },
    { cdnPrefix: 'gh.ddlc.top', source: '@mtr-static-official' },
    { cdnPrefix: 'ghdl.feizhuqwq.cf', source: 'feizhuqwq.com' },
    { cdnPrefix: 'slink.ltd', source: '知了小站' },
    { cdnPrefix: 'git.xfj0.cn', source: 'anonymous1' },
    { cdnPrefix: 'gh.con.sh', source: 'anonymous2' },
    { cdnPrefix: 'ghps.cc', source: 'anonymous3' },
    { cdnPrefix: 'cors.isteed.cc/github.com', source: 'Lufs\'s' },
    { cdnPrefix: 'hub.gitmirror.com', source: 'GitMirror' },
    { cdnPrefix: 'js.xxooo.ml', source: '饭太硬' },
    { cdnPrefix: 'download.njuu.cf', source: 'LibraryCloud-njuu' },
    { cdnPrefix: 'download.yzuu.cf', source: 'LibraryCloud-yzuu' },
    { cdnPrefix: 'download.nuaa.cf', source: 'LibraryCloud-nuaa' },
  ]
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

export function handleUnexpectedErrors(callback: (err: Error) => void) {
  const listener = (err: unknown) => {
    const e = err instanceof Error
      ? err
      : new Error(typeof err === 'string' ? err : JSON.stringify(err))
    callback(e)
  }
  process.on('uncaughtException', listener)
  process.on('unhandledRejection', listener)
}
