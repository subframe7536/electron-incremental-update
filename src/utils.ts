import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gunzip, gzip } from 'node:zlib'
import Electron from 'electron'

type Info = {
  dev: boolean
  platform: 'win' | 'mac' | 'linux'
  appPath: string
}
export const info: Info = {
  dev: !Electron.app?.isPackaged,
  platform: process.platform === 'win32'
    ? 'win'
    : process.platform === 'darwin'
      ? 'mac'
      : 'linux',
  appPath: Electron.app?.getAppPath(),
}

/**
 * get the application asar absolute path
 * @param name The name of the application
 * @todo support v8 bytecode
 */
export function getProductAsarPath(name: string) {
  return info.dev ? join(dirname(info.appPath), `${name}.asar`) : 'dev.asar'
}

/**
 * get the version of entry (app.asar)
 */
export function getEntryVersion() {
  return Electron.app.getVersion()
}
/**
 * get the version of application (name.asar)
 *
 * if is dev, return {@link getEntryVersion}
 * @param name - The name of the application
 */
export function getProductVersion(name: string) {
  return info.dev
    ? readFileSync(join(getProductAsarPath(name), 'version'), 'utf-8')
    : getEntryVersion()
}
export class NoSuchNativeModuleError extends Error {
  moduleName: string
  constructor(moduleName: string) {
    super(`no such native module: ${moduleName}`)
    this.moduleName = moduleName
  }
}
/**
 * require native package from app.asar
 * @param packageName native package name
 * @throws error: {@link NoSuchNativeModuleError}
 */
export function requireNative<T = any>(packageName: string): T {
  const path = info.dev
    ? join(info.appPath, 'node_modules', packageName)
    : packageName
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path)
  } catch (error) {
    throw new NoSuchNativeModuleError(packageName)
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
  Electron.app.relaunch()
  Electron.app.quit()
}
/**
 * ensure app is ready.
 */
export function waitAppReady(duration = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('app is not ready'))
    }, duration)

    Electron.app.whenReady().then(() => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

export async function unzipFile(gzipPath: string, targetFilePath = gzipPath.slice(0, -3)) {
  if (!existsSync(gzipPath)) {
    throw new Error(`path to zipped file not exist: ${gzipPath}`)
  }

  const compressedBuffer = readFileSync(gzipPath)

  return new Promise((resolve, reject) => {
    gunzip(compressedBuffer, (err, buffer) => {
      rmSync(gzipPath)
      if (err) {
        reject(err)
      }
      writeFileSync(targetFilePath, buffer)
      resolve(null)
    })
  })
}

export async function zipFile(filePath: string, targetFilePath = `${filePath}.gz`) {
  if (!existsSync(filePath)) {
    throw new Error(`path to be zipped not exist: ${filePath}`)
  }
  const buffer = readFileSync(filePath)
  return new Promise((resolve, reject) => {
    gzip(buffer, (err, buffer) => {
      if (err) {
        reject(err)
      }
      writeFileSync(targetFilePath, buffer)
      resolve(null)
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

export interface Version {
  major: number
  minor: number
  patch: number
  stage: string
  stageVersion: number
}
export function parseVersion(version: string): Version {
  const semver = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9\.-]+))?/i
  const match = semver.exec(version)
  if (!match) {
    throw new TypeError(`invalid version: ${version}`)
  }
  const [major, minor, patch] = match.slice(1, 4).map(Number)
  const ret = {
    major,
    minor,
    patch,
    stage: '',
    stageVersion: -1,
  }
  if (match[4]) {
    let [stage, _v] = match[4].split('.')
    ret.stage = stage
    ret.stageVersion = Number(_v) || -1
  }
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch) || Number.isNaN(ret.stageVersion)) {
    throw new TypeError(`invalid version: ${version}`)
  }
  return ret
}
