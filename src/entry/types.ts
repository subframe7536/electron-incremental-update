import type { IProvider } from '../provider/types'
import type { UpdateInfo } from '../utils/version'

export type UpdaterErrorCode =
  | 'ERR_DOWNLOAD'
  | 'ERR_VALIDATE'
  | 'ERR_PARAM'
  | 'ERR_NETWORK'

export type UpdaterUnavailableCode =
  | 'UNAVAILABLE_ERROR'
  | 'UNAVAILABLE_DEV'
  | 'UNAVAILABLE_VERSION'

export class UpdaterError extends Error {
  public code: UpdaterErrorCode
  constructor(code: UpdaterErrorCode, info: string) {
    super(`[${code}] ${info}`)
    this.code = code
  }
}

export interface Logger {
  info: (msg: string) => void
  debug: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string, e?: unknown) => void
}

export interface UpdaterOption {
  /**
   * Update provider
   *
   * If you will not setup `UpdateJSON` or `Buffer` in params when checking update or download, this option is **required**
   */
  provider?: IProvider
  /**
   * Certifaction key of signature, which will be auto generated by plugin,
   * generate by `selfsigned` if not set
   */
  SIGNATURE_CERT?: string
  /**
   * Whether to receive beta update
   */
  receiveBeta?: boolean
  /**
   * Updater logger
   */
  logger?: Logger
}

/**
 * Update info with current app version and entry version
 */
export type UpdateInfoWithExtraVersion = UpdateInfo & {
  /**
   * Current app version
   */
  appVersion: string
  /**
   * Current entry version
   */
  entryVersion: string
}
