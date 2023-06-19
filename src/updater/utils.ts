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
 * get group of parsed github release CDN links for accelerating the speed of downloading release
 */
export function getReleaseCdnLink(url: string) {
  const hub = 'https://github.com/'
  if (!url.startsWith(hub)) {
    throw new Error('URL must start with \'https://github.com/\'')
  }
  if (url.endsWith('/')) {
    url = url.slice(0, -1)
  }
  const _url = url.replace(hub, '')
  return [
    { url: `https://gh.gh2233.ml/${url}`, maintainer: '@X.I.U/XIU2' },
    { url: `https://ghproxy.com/${url}`, maintainer: 'gh-proxy' },
    { url: `https://gh.ddlc.top/${url}`, maintainer: '@mtr-static-official' },
    { url: `https://ghdl.feizhuqwq.cf/${url}`, maintainer: 'feizhuqwq.com' },
    { url: `https://slink.ltd/${url}`, maintainer: '知了小站' },
    { url: `https://git.xfj0.cn/${url}`, maintainer: 'anonymous1' },
    { url: `https://gh.con.sh/${url}`, maintainer: 'anonymous2' },
    { url: `https://ghps.cc/${url}`, maintainer: 'anonymous3' },
    { url: `https://cors.isteed.cc/github.com/${_url}`, maintainer: 'Lufs\'s' },
    { url: `https://hub.gitmirror.com/${url}`, maintainer: 'GitMirror' },
    { url: `https://js.xxooo.ml/${url}`, maintainer: '饭太硬' },
    { url: `https://proxy.freecdn.ml/?url=${url}`, maintainer: 'anonymous4' },
    { url: `https://download.njuu.cf/${_url}`, maintainer: 'LibraryCloud-njuu' },
    { url: `https://download.yzuu.cf/${_url}`, maintainer: 'LibraryCloud-yzuu' },
    { url: `https://download.nuaa.cf/${_url}`, maintainer: 'LibraryCloud-nuaa' },
  ]
}
