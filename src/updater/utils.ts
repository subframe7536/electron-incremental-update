import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/**
 * get the application asar absolute path
 * @param name The name of the application
 */
export function getAppAsarPath(name: string) {
  return app.isPackaged ? join(dirname(app.getAppPath()), `${name}.asar`) : 'dev'
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
export function getAppVersion(name: string) {
  return app.isPackaged
    ? readFileSync(join(getAppAsarPath(name), 'version'), 'utf-8').trim()
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

  repository = repository.trim().replace(/\/?$/, '/')
  relativeFilePath = relativeFilePath.trim().replace(/^\/*/, '')
  cdnPrefix = cdnPrefix.trim().replace(/^\/?|\/?$/g, '')

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
