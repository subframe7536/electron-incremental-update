import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gunzip, gzip } from 'node:zlib'
import { app } from 'electron'

/**
 * get the application asar absolute path
 * @param name The name of the application
 */
export function getProductAsarPath(name: string) {
  return app.isPackaged ? join(dirname(app.getAppPath()), `${name}.asar`) : 'dev.asar'
}

/**
 * get the version of entry (app.asar)
 */
export function getEntryVersion() {
  return app.getVersion()
}
/**
 * get the version of application (name.asar)
 * @param name - The name of the application
 */
export function getProductVersion(name: string) {
  return app.isPackaged
    ? readFileSync(join(getProductAsarPath(name), 'version'), 'utf-8')
    : getEntryVersion()
}

/**
 * require native package from app.asar
 * @param packageName native package name
 */
export function requireNative<T = any>(packageName: string): T {
  const path = app.isPackaged
    ? join(app.getAppPath(), 'node_modules', packageName)
    : packageName
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path)
}

/**
 * get github version.json CDN URL for accelerating the speed of downloading version info
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
 * get group of github release CDN prefix for accelerating the speed of downloading release
 */
export function getGithubReleaseCdnGroup() {
  return [
    { cdnPrefix: 'gh.gh2233.ml', maintainer: '@X.I.U/XIU2' },
    { cdnPrefix: 'ghproxy.com', maintainer: 'gh-proxy' },
    { cdnPrefix: 'gh.ddlc.top', maintainer: '@mtr-static-official' },
    { cdnPrefix: 'ghdl.feizhuqwq.cf', maintainer: 'feizhuqwq.com' },
    { cdnPrefix: 'slink.ltd', maintainer: '知了小站' },
    { cdnPrefix: 'git.xfj0.cn', maintainer: 'anonymous1' },
    { cdnPrefix: 'gh.con.sh', maintainer: 'anonymous2' },
    { cdnPrefix: 'ghps.cc', maintainer: 'anonymous3' },
    { cdnPrefix: 'cors.isteed.cc/github.com', maintainer: 'Lufs\'s' },
    { cdnPrefix: 'hub.gitmirror.com', maintainer: 'GitMirror' },
    { cdnPrefix: 'js.xxooo.ml', maintainer: '饭太硬' },
    { cdnPrefix: 'download.njuu.cf', maintainer: 'LibraryCloud-njuu' },
    { cdnPrefix: 'download.yzuu.cf', maintainer: 'LibraryCloud-yzuu' },
    { cdnPrefix: 'download.nuaa.cf', maintainer: 'LibraryCloud-nuaa' },
  ]
}

export function restartApp() {
  app.relaunch()
  app.quit()
}

export function waitAppReady(duration = 1000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('app is not ready'))
    }, duration)

    app.whenReady().then(() => {
      clearTimeout(timeout)
      resolve(null)
    })
  })
}

export async function unzipFile(gzipPath: string, targetFilePath: string) {
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
