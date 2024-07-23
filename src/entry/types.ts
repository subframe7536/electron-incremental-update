import type { IProvider } from '../provider'
import type { UpdateJSON } from '../utils'

export const ErrorInfo = {
  download: 'Download Failed',
  validate: 'Validate Failed',
  param: 'Missing Params',
  network: 'Network Error',
} as const

export class UpdaterError extends Error {
  public code: keyof typeof ErrorInfo
  constructor(msg: keyof typeof ErrorInfo, info: string) {
    super('[' + ErrorInfo[msg] + '] ' + info)
    this.code = msg
  }
}

export type CheckResult<T extends UpdateJSON> = {
  success: true
  data: Omit<T, 'beta'>
} | {
  success: false
  /**
   * minimal version that can update
   */
  data: string
} | {
  success: false
  data: UpdaterError
}

export type DownloadResult = {
  success: true
} | {
  success: false
  data: UpdaterError
}

export interface Logger {
  info: (msg: string) => void
  debug: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string, e?: unknown) => void
}

export interface UpdaterOption {
  /**
   * update provider
   */
  provider?: IProvider
  /**
   * public key of signature, which will be auto generated by plugin,
   * generate by `selfsigned` if not set
   */
  SIGNATURE_CERT?: string
  /**
   * whether to receive beta update
   */
  receiveBeta?: boolean
  logger?: Logger
}
