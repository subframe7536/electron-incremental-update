import type { UpdateJSON } from '../updateJson'

export class MinimumVersionError extends Error {
  currentVersion: string
  minVersion: string
  constructor(version: string, minimumVersion: string) {
    super(`current entry version is ${version}, less than the minimumVersion ${minimumVersion}`)
    this.currentVersion = version
    this.minVersion = minimumVersion
  }
}
export class VerifyFailedError extends Error {
  signature: string
  cert: string
  constructor(signature: string, cert: string) {
    super('verify failed, invalid signature or certificate')
    this.signature = signature
    this.cert = cert
  }
}

export class DownloadError extends Error {
  constructor(msg: string) {
    super(`download update error, ${msg}`)
  }
}

type CheckResultError = MinimumVersionError | DownloadError | TypeError | Error
type DownloadResultError = DownloadError | VerifyFailedError | TypeError | Error

export type CheckResultType = {
  size: number
  version: string
} | undefined | CheckResultError
export type DownloadResult = true | DownloadResultError
export type DownloadingInfo = {
  /**
   * downloaded percent, 0% - 100%
   */
  percent: string
  /**
   * total size
   */
  total: number
  /**
   * downloaded size
   */
  current: number
}
export type Logger = {
  info: (msg: string) => void
  debug: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string, e?: Error) => void
}
export interface Updater {
  /**
   * the name of the product, also the basename of the asar
   */
  productName: string
  /**
   * whether receive beta version
   */
  receiveBeta: boolean
  /**
   * check update info
   * @param data update json url or object
   * @returns
   * - `{size: number, version: string}`: available
   * - `undefined`: unavailable
   * - `CheckResultError`: fail
   */
  checkUpdate: (data?: string | UpdateJSON) => Promise<CheckResultType>
  /**
   * download update
   *
   * if you want to update **offline**, you can set both `src` and `sig` to verify and install
   * @param data asar download url or buffer
   * @param sig signature
   * @returns
   * - `true`: success
   * - `DownloadResultError`: fail
   */
  download: (data?: string | Buffer, sig?: string) => Promise<DownloadResult>
  /**
   * log function
   * @param data log info
   */
  logger?: Logger
  /**
   * download progress function
   * @param progress download progress info
   * @returns void
   */
  onDownloading?: (progress: DownloadingInfo) => void
}
export type UpdaterOverrideFunctions = {
  /**
   * custom version compare function
   * @param version1 old version string
   * @param version2 new version string
   * @returns whether version1 < version2
   */
  compareVersion?: (version1: string, version2: string) => boolean | Promise<boolean>
  /**
   * custom verify signature function
   * @param buffer file buffer
   * @param signature signature
   * @param cert certificate
   * @returns if signature is valid, returns the version or `true` , otherwise returns `false`
   */
  verifySignaure?: (buffer: Buffer, signature: string, cert: string) => string | false | Promise<string | false>
  /**
   * custom download JSON function
   * @param url download url
   * @param header download header
   * @returns `UpdateJSON`
   */
  downloadJSON?: (url: string, headers: Record<string, any>) => Promise<UpdateJSON>
  /**
   * custom download buffer function
   * @param url download url
   * @param headers download header
   * @param total precaculated file total size
   * @param onDownloading on downloading callback
   * @returns `Buffer`
   */
  downloadBuffer?: (url: string, headers: Record<string, any>, total: number, onDownloading?: (progress: DownloadingInfo) => void) => Promise<Buffer>
}

export type UpdaterDownloadConfig = {
  /**
   * download user agent
   * @default 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'
   */
  userAgent?: string
  /**
   * extra download header, `accept` and `user-agent` is set by default
   */
  extraHeader?: Record<string, string>
}

export interface UpdaterOption {
  /**
   * public key of signature, which will be auto generated by plugin
   * @example
   * ```ts
   * // auto filled by plugin
   * const SIGNATURE_CERT = ''
   *
   * const updater = createUpdater({
   *   SIGNATURE_CERT,
   *   ...
   * })
   * ```
   */
  SIGNATURE_CERT: string
  /**
   * name of your application, you can use the `name` in `package.json`
   *
   * @default DEFAULT_APP_NAME
   */
  productName?: string
  /**
   * repository url, e.g. `https://github.com/electron/electron`
   *
   * you can use the `repository` in `package.json`
   *
   * if `updateJsonURL` or `releaseAsarURL` are absent,
   * `repository` will be used to determine the url
   */
  repository?: string
  /**
   * URL of version info json
   * @default `${repository.replace('github.com', 'raw.githubusercontent.com')}/master/version.json`
   * @throws if `updateJsonURL` and `repository` are all not set
   */
  updateJsonURL?: string
  /**
   * URL of release asar.gz
   * @default `${repository}/releases/download/v${version}/${productName}-${version}.asar.gz`
   * @throws if `releaseAsarURL` and `repository` are all not set
   */
  releaseAsarURL?: string
  /**
   * whether to receive beta update
   */
  receiveBeta?: boolean
  overrideFunctions?: UpdaterOverrideFunctions
  downloadConfig?: UpdaterDownloadConfig
}
