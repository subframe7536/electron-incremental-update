import type { Promisable } from '@subframe7536/type-utils'
import type { UpdateInfo, UpdateJSON } from '../utils/version'

export type URLHandler = (url: URL, isDownloadAsar: boolean) => Promisable<URL | string | undefined | null>
export type OnDownloading = (progress: DownloadingInfo) => void

export interface DownloadingInfo {
  /**
   * download delta
   */
  delta: number
  /**
   * downloaded percent, 0 ~ 100
   *
   * If not `Content-Length` header, will be nagative
   */
  percent: number
  /**
   * total size
   *
   * If not `Content-Length` header, will be -1
   */
  total: number
  /**
   * downloaded size
   */
  transferred: number
  /**
   * download speed, bytes per second
   */
  bps: number
}

export interface IProvider {
  /**
   * provider name
   */
  name: string
  /**
   * custom url handler
   *
   * for Github, there are some {@link https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L34 public CDN links}
   */
  urlHandler?: URLHandler
  onDownloading?: OnDownloading
  /**
   * download update json
   * @param versionPath parsed version path
   */
  downloadJSON: (versionPath: string) => Promise<UpdateJSON>
  /**
   * download update asar
   * @param name app name
   * @param updateInfo existing update info
   * @param onDownloading hook for on downloading
   */
  downloadAsar: (
    name: string,
    updateInfo: UpdateInfo,
    onDownloading?: (info: DownloadingInfo) => void
  ) => Promise<Buffer>
  /**
   * compare version
   * @param oldVer old version string
   * @param newVer new version string
   * @returns if version1 < version2
   */
  isLowerVersion: (oldVer: string, newVer: string) => boolean
  /**
   * unzip file buffer
   * @param buffer source buffer
   */
  unzipFile: (buffer: Buffer) => Promise<Buffer>
  /**
   * verify asar signature
   * @param buffer file buffer
   * @param version target version
   * @param signature signature
   * @param cert certificate
   * @returns if signature is valid, returns the version, otherwise returns `undefined`
   */
  verifySignaure: (buffer: Buffer, version: string, signature: string, cert: string) => Promisable<boolean>
}
