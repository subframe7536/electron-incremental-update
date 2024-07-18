import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:stream'
import { app } from 'electron'
import { type UpdateInfo, type UpdateJSON, isUpdateJSON } from '../utils/version'
import type { DownloadingInfo, IProvider, URLHandler } from '../provider'
import { getAppVersion, getEntryVersion, getPathFromAppNameAsar, isDev, restartApp } from '../utils/electron'
import { unzipFile } from '../utils/unzip'
import type { ErrorInfo, Logger, UpdaterOption } from './types'
import { UpdaterError } from './types'

/**
 * type only signature cert, transformed by esbuild's define
 */
declare const __EIU_SIGNATURE_CERT__: string
/**
 * type only version json path, transformed by esbuild's define
 */
declare const __EIU_VERSION_PATH__: string

export class Updater extends EventEmitter<{
  'checking': any
  'update-available': [data: UpdateInfo]
  'update-unavailable': [reason: string]
  'error': [error: UpdaterError]
  'download-progress': [info: DownloadingInfo]
  'update-downloaded': any
}> {
  private CERT = __EIU_SIGNATURE_CERT__
  private info?: UpdateInfo
  private options: UpdaterOption
  private asarPath: string
  private gzipPath: string
  private tmpFilePath: string
  private provider: IProvider
  /**
   * updater logger
   */
  public logger?: Logger
  /**
   * URL handler hook
   *
   * for Github, there are some {@link https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L34 public CDNs}
   * @param url source url
   * @param isDownloadAsar whether is download asar
   */
  public handleURL?: URLHandler

  /**
   * whether receive beta version
   */
  get receiveBeta(): boolean {
    return !!this.options.receiveBeta
  }

  set receiveBeta(receiveBeta: boolean) {
    this.options.receiveBeta = receiveBeta
  }

  /**
   * initialize incremental updater
   * @param provider update provider
   * @param option UpdaterOption
   */
  constructor(provider: IProvider, option: UpdaterOption = {}) {
    super()
    this.provider = provider
    this.options = option
    if (option.SIGNATURE_CERT) {
      this.CERT = option.SIGNATURE_CERT
    }
    if (option.logger) {
      this.logger = option.logger
    }

    if (isDev && !this.logger) {
      this.logger = {
        info: (...args) => console.log('[EIU-INFO ]', ...args),
        debug: (...args) => console.log('[EIU-DEBUG]', ...args),
        warn: (...args) => console.log('[EIU-WARN ]', ...args),
        error: (...args) => console.error('[EIU-ERROR]', ...args),
      }
      this.logger.info('no logger set, enable dev-only logger')
    }

    this.asarPath = getPathFromAppNameAsar()
    this.gzipPath = `${this.asarPath}.gz`
    this.tmpFilePath = `${this.asarPath}.tmp`
  }

  /**
   * this function is used to parse download data.
   * - if format is `'json'`
   *   - if data is `UpdateJSON`, return it
   *   - if data is string or absent, download URL data and return it
   * - if format is `'buffer'`
   *   - if data is `Buffer`, return it
   *   - if data is string or absent, download URL data and return it
   * @param format 'json' or 'buffer'
   * @param data download URL or update json or buffer
   */
  private async fetch(format: 'json', data?: UpdateJSON): Promise<UpdateJSON | undefined>
  private async fetch(format: 'buffer', data?: Buffer): Promise<Buffer | undefined>
  private async fetch(format: 'json' | 'buffer', data?: Uint8Array | UpdateJSON): Promise<any> {
    if (existsSync(this.tmpFilePath)) {
      this.logger?.warn(`remove tmp file: ${this.tmpFilePath}`)
      rmSync(this.tmpFilePath)
    }

    if (existsSync(this.gzipPath)) {
      this.logger?.warn(`remove .gz file: ${this.gzipPath}`)
      rmSync(this.gzipPath)
    }

    if (typeof data === 'object') {
      if ((format === 'json' && isUpdateJSON(data)) || (format === 'buffer' && Buffer.isBuffer(data))) {
        return data
      } else {
        this.err('invalid type', 'param', `invalid type at format '${format}': ${JSON.stringify(data)}`)
        return
      }
    }

    // fetch data from remote
    this.logger?.debug(`download from ${this.provider.name}`)
    try {
      const result = format === 'json'
        ? await this.provider.downloadJSON(data ?? __EIU_VERSION_PATH__)
        : await this.provider.downloadAsar(app.name, this.info!, data => this.emit('download-progress', data))

      this.logger?.debug(`download ${format} success${format === 'buffer' ? `, file size: ${(result as Buffer).length}` : ''}`)

      return result
    } catch (e) {
      this.err(`download ${format} failed`, 'download', `download ${format} failed: ${e}`)
    }
  }

  /**
   * handle error message and emit error event
   */
  private err(msg: string, code: keyof typeof ErrorInfo, errorInfo: string): void {
    const err = new UpdaterError(code, errorInfo)
    this.logger?.error(msg, err)
    this.emit('error', err)
  }

  /**
   * check update info using default options
   */
  public async checkUpdate(): Promise<boolean>
  /**
   * check update info using existing update json
   * @param data existing update json
   */
  public async checkUpdate(data: UpdateJSON): Promise<boolean>
  public async checkUpdate(data?: UpdateJSON): Promise<boolean> {
    const emitUnavailable = (msg: string): void => {
      this.logger?.info(msg)
      this.emit('update-unavailable', msg)
    }
    const _data = await this.fetch('json', data)
    if (!_data) {
      emitUnavailable('failed to get update info')
      return false
    }
    let { signature, size, version, minimumVersion, beta } = _data
    if (this.receiveBeta) {
      version = beta.version
      signature = beta.signature
      minimumVersion = beta.minimumVersion
      size = beta.size
    }
    this.logger?.debug(`checked update, version: ${version}, size: ${size}, signature: ${signature}`)

    if (isDev) {
      emitUnavailable('in dev mode, skip check update')
      return false
    }
    const isLowerVersion = this.provider.isLowerVersion
    const entryVersion = getEntryVersion()
    const appVersion = getAppVersion()

    if (isLowerVersion(entryVersion, minimumVersion)) {
      emitUnavailable(`entry version (${entryVersion}) < minimumVersion (${minimumVersion})`)
      return false
    }

    this.logger?.info(`check update: current version is ${appVersion}, new version is ${version}`)

    if (!isLowerVersion(appVersion, version)) {
      emitUnavailable(`current version (${appVersion}) < new version (${version})`)
      return false
    }
    this.logger?.info(`update available: ${version}`)
    this.info = { signature, minimumVersion, version, size }
    this.emit('update-available', this.info)
    return true
  }

  /**
   * download update using default options
   */
  public async download(): Promise<boolean>
  /**
   * download update using existing `asar.gz` buffer and signature
   * @param data existing `asar.gz` buffer
   * @param sig signature
   */
  public async download(data: Uint8Array, sig: string): Promise<boolean>
  public async download(data?: Uint8Array, sig?: string): Promise<boolean> {
    if (!this.info) {
      this.err('download failed', 'param', 'no update info, call `checkUpdate` first')
      return false
    }
    const _sig = sig ?? this.info.signature

    // if typeof data is Buffer, the version will not be used
    const buffer = await this.fetch('buffer', data ? Buffer.from(data) : undefined)

    if (!buffer) {
      this.err('download failed', 'param', 'no update asar file buffer')
      return false
    }

    // verify update file
    this.logger?.debug('verify start')
    const _ver = await this.provider.verifySignaure(buffer, _sig, this.CERT)
    if (!_ver) {
      this.err('verify failed', 'validate', 'invalid signature / certificate pair')
      return false
    }
    this.logger?.debug('verify success')

    try {
      // write file
      this.logger?.debug(`write to ${this.gzipPath}`)
      writeFileSync(this.gzipPath, buffer)
      // extract file to tmp path
      this.logger?.debug(`extract to ${this.tmpFilePath}`)
      await unzipFile(this.gzipPath, this.tmpFilePath)

      this.logger?.info(`download success, version: ${_ver}`)
      this.info = undefined
      this.emit('update-downloaded')
      return true
    } catch (error) {
      this.err('unwrap asar failed', 'download', `fail to unwrap asar file, ${error}`)
      return false
    }
  }

  /**
   * quit App and install
   */
  public quitAndInstall(): void {
    this.logger?.info('quit and install')
    restartApp()
  }
}
