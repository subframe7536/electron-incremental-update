import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

export function getAppAsarPath(name: string) {
  return app.isPackaged ? join(dirname(app.getAppPath()), `${name}.asar`) : 'dev'
}

export function getElectronVersion() {
  return app.getVersion()
}

export function getAppVersion(name: string) {
  return app.isPackaged
    ? readFileSync(join(getAppAsarPath(name), 'version'), 'utf-8').trim()
    : getElectronVersion()
}

export function requireNative<T = any>(packageName: string): T {
  const path = app.isPackaged
    ? join(app.getAppPath(), 'node_modules', packageName)
    : packageName
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path)
}

export function getReleaseDnsPrefix() {
  const hub = 'https://github.com'
  return [
    { urlPrefix: `https://gh.gh2233.ml/${hub}`, maintainer: '@X.I.U/XIU2' },
    { urlPrefix: `https://ghproxy.com/${hub}`, maintainer: 'gh-proxy' },
    { urlPrefix: `https://gh.ddlc.top/${hub}`, maintainer: '@mtr-static-official' },
    { urlPrefix: `https://ghdl.feizhuqwq.cf/${hub}`, maintainer: 'feizhuqwq.com' },
    { urlPrefix: `https://slink.ltd/${hub}`, maintainer: '知了小站' },
    { urlPrefix: `https://git.xfj0.cn/${hub}`, maintainer: 'anonymous1' },
    { urlPrefix: `https://gh.con.sh/${hub}`, maintainer: 'anonymous2' },
    { urlPrefix: `https://ghps.cc/${hub}`, maintainer: 'anonymous3' },
    { urlPrefix: 'https://cors.isteed.cc/github.com', maintainer: 'Lufs\'s' },
    { urlPrefix: `https://hub.gitmirror.com/${hub}`, maintainer: 'GitMirror' },
    { urlPrefix: `https://js.xxooo.ml/${hub}`, maintainer: '饭太硬' },
    { urlPrefix: `https://proxy.freecdn.ml/?url=${hub}`, maintainer: 'anonymous4' },
    { urlPrefix: 'https://download.njuu.cf', maintainer: 'LibraryCloud-njuu' },
    { urlPrefix: 'https://download.yzuu.cf', maintainer: 'LibraryCloud-yzuu' },
    { urlPrefix: 'https://download.nuaa.cf', maintainer: 'LibraryCloud-nuaa' },
  ]
}
