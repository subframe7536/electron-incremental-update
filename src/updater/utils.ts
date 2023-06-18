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
 * get the version of electron
 */
export function getElectronVersion() {
  return app.getVersion()
}
/**
 * get the version of application
 * @param name - The name of the application
 */
export function getAppVersion(name: string) {
  return app.isPackaged
    ? readFileSync(join(getAppAsarPath(name), 'version'), 'utf-8').trim()
    : getElectronVersion()
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
    { urlPrefix: `https://gh.gh2233.ml/${url}`, maintainer: '@X.I.U/XIU2' },
    { urlPrefix: `https://ghproxy.com/${url}`, maintainer: 'gh-proxy' },
    { urlPrefix: `https://gh.ddlc.top/${url}`, maintainer: '@mtr-static-official' },
    { urlPrefix: `https://ghdl.feizhuqwq.cf/${url}`, maintainer: 'feizhuqwq.com' },
    { urlPrefix: `https://slink.ltd/${url}`, maintainer: '知了小站' },
    { urlPrefix: `https://git.xfj0.cn/${url}`, maintainer: 'anonymous1' },
    { urlPrefix: `https://gh.con.sh/${url}`, maintainer: 'anonymous2' },
    { urlPrefix: `https://ghps.cc/${url}`, maintainer: 'anonymous3' },
    { urlPrefix: `https://cors.isteed.cc/github.com/${_url}`, maintainer: 'Lufs\'s' },
    { urlPrefix: `https://hub.gitmirror.com/${url}`, maintainer: 'GitMirror' },
    { urlPrefix: `https://js.xxooo.ml/${url}`, maintainer: '饭太硬' },
    { urlPrefix: `https://proxy.freecdn.ml/?url=${url}`, maintainer: 'anonymous4' },
    { urlPrefix: `https://download.njuu.cf/${_url}`, maintainer: 'LibraryCloud-njuu' },
    { urlPrefix: `https://download.yzuu.cf/${_url}`, maintainer: 'LibraryCloud-yzuu' },
    { urlPrefix: `https://download.nuaa.cf/${_url}`, maintainer: 'LibraryCloud-nuaa' },
  ]
}
