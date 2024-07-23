import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { type UpdateInfo, type UpdateJSON, isUpdateJSON } from '../utils/version'
import type { DownloadingInfo, IProvider } from '../provider'
import { getAppVersion, getEntryVersion, getPathFromAppNameAsar, isDev, restartApp } from '../utils/electron'
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
  public provider?: IProvider
  /**
   * updater logger
   */
  public logger?: Logger
  /**
   * whether to receive beta update
   */
  public receiveBeta?: boolean
  /**
   * whether force update in DEV
   */
  public forceUpdate?: boolean
  /**
   * initialize incremental updater
   * @param options UpdaterOption
   */
  constructor(options: UpdaterOption = {}) {
    super()
    this.provider = options.provider
    this.receiveBeta = options.receiveBeta
    this.CERT = options.SIGNATURE_CERT || __EIU_SIGNATURE_CERT__
    this.logger = options.logger

    if (isDev && !this.logger) {
      this.logger = {
        info: (...args) => console.log('[EIU-INFO ]', ...args),
        debug: (...args) => console.log('[EIU-DEBUG]', ...args),
        warn: (...args) => console.log('[EIU-WARN ]', ...args),
        error: (...args) => console.error('[EIU-ERROR]', ...args),
      }
      this.logger.info('no logger set, enable dev-only logger')
    }

    if (!this.provider) {
      this.logger?.debug('No update provider, please setup provider before checking update')
    }
  }

  private checkProvider(): void {
    if (!this.provider) {
      throw new UpdaterError('param', 'missing update provider')
    }
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
    if (typeof data === 'object') {
      if ((format === 'json' && isUpdateJSON(data)) || (format === 'buffer' && Buffer.isBuffer(data))) {
        return data
      } else {
        this.err('invalid type', 'param', `invalid type at format '${format}': ${JSON.stringify(data)}`)
        return
      }
    }

    // fetch data from remote
    this.logger?.debug(`download from ${this.provider!.name}`)
    try {
      const result = format === 'json'
        ? await this.provider!.downloadJSON(data ?? __EIU_VERSION_PATH__)
        : await this.provider!.downloadAsar(app.name, this.info!, data => this.emit('download-progress', data))

      this.logger?.debug(`download ${format} success${format === 'buffer' ? `, file size: ${(result as Buffer).length}` : ''}`)

      return result
    } catch (e) {
      this.err(`fetch ${format} failed`, 'network', `download ${format} failed: ${e}`)
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
    this.checkProvider()
    const emitUnavailable = (msg: string): false => {
      this.logger?.info(msg)
      this.emit('update-unavailable', msg)
      return false
    }
    const _data = await this.fetch('json', data)
    if (!_data) {
      return emitUnavailable('failed to get update info')
    }
    let { signature, version, minimumVersion, beta } = _data
    if (this.receiveBeta) {
      version = beta.version
      signature = beta.signature
      minimumVersion = beta.minimumVersion
    }
    this.logger?.debug(`checked update, version: ${version}, signature: ${signature}`)

    if (isDev && !this.forceUpdate && !data) {
      return emitUnavailable('skip check update in dev mode, to force update, set `updater.forceUpdate` to true or call checkUpdate with UpdateJSON')
    }
    const isLowerVersion = this.provider!.isLowerVersion
    const entryVersion = getEntryVersion()
    const appVersion = getAppVersion()

    if (isLowerVersion(entryVersion, minimumVersion)) {
      return emitUnavailable(`entry version (${entryVersion}) < minimumVersion (${minimumVersion})`)
    }

    this.logger?.info(`check update: current version is ${appVersion}, new version is ${version}`)

    if (!isLowerVersion(appVersion, version)) {
      return emitUnavailable(`current version (${appVersion}) < new version (${version})`)
    }
    this.logger?.info(`update available: ${version}`)
    this.info = { signature, minimumVersion, version }
    this.emit('update-available', this.info)
    return true
  }

  /**
   * download update using default options
   */
  public async downloadUpdate(): Promise<boolean>
  /**
   * download update using existing `asar.gz` buffer and signature
   * @param data existing `asar.gz` buffer
   * @param info update info
   */
  public async downloadUpdate(data: Uint8Array, info: Omit<UpdateInfo, 'minimumVersion'>): Promise<boolean>
  public async downloadUpdate(data?: Uint8Array, info?: Omit<UpdateInfo, 'minimumVersion'>): Promise<boolean> {
    this.checkProvider()
    const _sig = info?.signature ?? this.info?.signature
    const _version = info?.version ?? this.info?.version

    if (!_sig || !_version) {
      this.err('download failed', 'param', 'no update signature, please call `checkUpdate` first or manually setup params')
      return false
    }

    // if typeof data is Buffer, the version will not be used
    const buffer = await this.fetch('buffer', data ? Buffer.from(data) : undefined)

    if (!buffer) {
      this.err('download failed', 'param', 'no update asar file buffer')
      return false
    }

    // verify update file
    this.logger?.debug('verify start')
    if (!await this.provider!.verifySignaure(buffer, _version, _sig, this.CERT)) {
      this.err('download failed', 'validate', 'invalid update asar file')
      return false
    }
    this.logger?.debug('verify success')

    try {
      const tmpFilePath = getPathFromAppNameAsar() + '.tmp'
      // write file to tmp path
      this.logger?.debug(`install to ${tmpFilePath}`)
      fs.writeFileSync(tmpFilePath, await this.provider!.unzipFile(buffer))

      this.logger?.info(`download success, version: ${_version}`)
      this.info = undefined
      this.emit('update-downloaded')
      return true
    } catch (error) {
      this.err('download failed', 'download', `fail to unwrap asar file, ${error}`)
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

/**
 * auto check update, download and install
 */
export async function autoUpdate(updater: Updater): Promise<void> {
  if (await updater.checkUpdate() && await updater.downloadUpdate()) {
    updater.quitAndInstall()
  }
}
