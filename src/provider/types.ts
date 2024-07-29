import type { Promisable } from '@subframe7536/type-utils'
import type { UpdateInfo, UpdateJSON } from '../utils/version'

export type OnDownloading = (progress: DownloadingInfo) => void

export interface DownloadingInfo {
  /**
   * Download buffer delta
   */
  delta: number
  /**
   * Downloaded percent, 0 ~ 100
   *
   * If no `Content-Length` header, will be -1
   */
  percent: number
  /**
   * Total size
   *
   * If not `Content-Length` header, will be -1
   */
  total: number
  /**
   * Downloaded size
   */
  transferred: number
  /**
   * Download speed, bytes per second
   */
  bps: number
}

export interface IProvider {
  /**
   * Provider name
   */
  name: string
  onDownloading?: OnDownloading
  /**
   * Download update json
   * @param versionPath parsed version path in project
   * @param signal abort signal
   */
  downloadJSON: (versionPath: string, signal: AbortSignal) => Promise<UpdateJSON>
  /**
   * Download update asar
   * @param name app name
   * @param updateInfo existing update info
   * @param signal abort signal
   * @param onDownloading hook for on downloading
   */
  downloadAsar: (
    name: string,
    updateInfo: UpdateInfo,
    signal: AbortSignal,
    onDownloading?: (info: DownloadingInfo) => void
  ) => Promise<Buffer>
  /**
   * Check the old version is less than new version
   * @param oldVer old version string
   * @param newVer new version string
   */
  isLowerVersion: (oldVer: string, newVer: string) => boolean
  /**
   * Function to decompress file using brotli
   * @param buffer compressed file buffer
   */
  unzipFile: (buffer: Buffer) => Promise<Buffer>
  /**
   * Verify asar signature,
   * if signature is valid, returns the version, otherwise returns `undefined`
   * @param buffer file buffer
   * @param version target version
   * @param signature signature
   * @param cert certificate
   */
  verifySignaure: (buffer: Buffer, version: string, signature: string, cert: string) => Promisable<boolean>
}
