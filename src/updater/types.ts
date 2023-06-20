import type { Buffer } from 'node:buffer'

export type CheckResultType = Error | false | Omit<UpdateJSON, 'signature'>
type UpdateEvents = {
  check: [url?: string]
  checkResult: [data: CheckResultType]
  download: [src?: string | Buffer]
  downloading: [current: number]
  downloaded: null
  donwnloadError: [error: unknown]
  debug: [msg: string | Error]
}

export type UpdateJSON = {
  signature: string
  version: string
  size: number
}
type MaybeArray<T> = T extends undefined | null | never ? [] : T extends any[] ? T['length'] extends 1 ? [data: T[0]] : T : [data: T]
export interface BaseOption {
  /**
   * URL of version info json
   * @default `${repository.replace('github.com', 'raw.githubusercontent.com')}/version.json`
   * @throws if `updateJsonURL` and `repository` are all not set
   */
  updateJsonURL?: string
  /**
   * URL of release asar.gz
   * @default `${repository}/releases/download/latest/${productName}.asar.gz`
   * @throws if `releaseAsarURL` and `repository` are all not set
   */
  releaseAsarURL?: string
}
interface TypedUpdater<
  T extends Record<string | symbol, MaybeArray<any>>,
  Event extends Exclude<keyof T, number> = Exclude<keyof T, number>,
> {
  removeAllListeners<E extends Event>(event?: E): this
  listeners<E extends Event>(eventName: E): Function[]
  eventNames(): (Event)[]
  on<E extends Event>(eventName: E, listener: (...data: MaybeArray<T[E]>) => void): this
  once<E extends Event>(eventName: E, listener: (...args: MaybeArray<T[E]>) => void): this
  emit<E extends Event>(eventName: E, ...args: MaybeArray<T[E]>): boolean
  off<E extends Event>(eventName: E, listener: (...args: MaybeArray<T[E]>) => void): this
  /**
   * - `undefined`: errror
   * - `false`: unavailable
   * - `{size: number, version: string}`: success
   */
  checkUpdate(url?: BaseOption['updateJsonURL']): Promise<void>
  downloadUpdate(url?: BaseOption['releaseAsarURL'] | Buffer): Promise<void>
}

export type Updater = TypedUpdater<UpdateEvents>
export interface UpdaterOption extends BaseOption {
  /**
   * public key of signature
   *
   * it will be auto generated by plugin
   * @example
   * ```ts
   * // auto filled by plugin
   * const SIGNATURE_PUB = ''
   *
   * const updater = createUpdater({
   *   SIGNATURE_PUB,
   *   ...
   * })
   * ```
   */
  SIGNATURE_PUB: string
  /**
   * product name
   *
   * you can use the `name` in `package.json`
   */
  productName: string
  /**
   * repository url, e.g. `https://github.com/electron/electron`
   *
   * you can use the `repository` in `package.json`
   *
   * if `updateJsonURL` or `releaseAsarURL` are absent,
   * `repository` will be used to determine the url
   */
  repository?: string
  debug?: boolean
  compareVersion?: (
    oldVersion: string,
    newVersion: string,
  ) => boolean
  downloadConfig?: {
    /**
     * download user agent
   * @default 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'
    */
    userAgent?: string
    /**
    * extra download header, `accept` and `user-agent` is set by default
   */
    extraHeader?: Record<string, string>
    /**
     * download JSON function
     * @param url download url
     * @param updater updater, emit events
     * @param header download header
     * @returns `UpdateJSON`
     */
    downloadJSON?: (url: string, updater: Updater, headers: Record<string, any>) => Promise<UpdateJSON>
    /**
     * download buffer function
     * @param url download url
     * @param updater updater, emit events
     * @param header download header
     * @returns `Buffer`
     */
    downloadBuffer?: (url: string, updater: Updater, headers: Record<string, any>) => Promise<Buffer>
  }
}
