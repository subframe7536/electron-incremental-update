import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { type UpdateInfo, type UpdateJSON, isUpdateJSON } from '../utils/version'
import type { DownloadingInfo, IProvider, UpdateJSONWithURL } from '../provider'
import { getAppVersion, getEntryVersion, getPathFromAppNameAsar, isDev, restartApp } from '../utils/electron'
import type { ErrorInfo, Logger, UnavailableInfo, UpdateInfoWithExtraVersion, UpdateInfoWithURL, UpdaterOption } from './types'
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
  'update-available': [data: UpdateInfoWithExtraVersion]
  'update-not-available': [code: UnavailableInfo, msg: string, info?: UpdateInfoWithExtraVersion]
  'error': [error: UpdaterError]
  'download-progress': [info: DownloadingInfo]
  'update-downloaded': any
  'update-cancelled': any
}> {
  private CERT: string
  private controller: AbortController
  private info?: UpdateInfoWithURL
  public provider?: IProvider
  /**
   * Updater logger
   */
  public logger?: Logger
  /**
   * Whether to receive beta update
   */
  public receiveBeta?: boolean
  /**
   * Whether force update in DEV
   */
  public forceUpdate?: boolean
  /**
   * Initialize incremental updater
   * @param options UpdaterOption
   */
  constructor(options: UpdaterOption = {}) {
    super()
    this.provider = options.provider
    this.receiveBeta = options.receiveBeta
    this.CERT = options.SIGNATURE_CERT || __EIU_SIGNATURE_CERT__
    this.logger = options.logger
    this.controller = new AbortController()

    if (isDev && !this.logger) {
      this.logger = {
        info: (...args) => console.log('[EIU-INFO ]', ...args),
        debug: (...args) => console.log('[EIU-DEBUG]', ...args),
        warn: (...args) => console.log('[EIU-WARN ]', ...args),
        error: (...args) => console.error('[EIU-ERROR]', ...args),
      }
      this.logger.info('No logger set, enable dev-only logger')
    }

    if (!this.provider) {
      this.logger?.debug('WARN: No update provider')
    }
  }

  /**
   * This function is used to parse download data.
   *
   * if data is absent, download URL from provider and return it,
   * else if data is `UpdateJSON`, return it
   */
  private async fetch(format: 'json', data?: UpdateJSONWithURL): Promise<UpdateJSONWithURL | undefined>
  /**
   * This function is used to parse download data.
   *
   * if data is absent, download URL from provider and return it,
   * else if data is `Buffer`, return it
   * @param format 'json' or 'buffer'
   * @param data download URL or update json or buffer
   */
  private async fetch(format: 'buffer', data?: Buffer): Promise<Buffer | undefined>
  private async fetch(format: 'json' | 'buffer', data?: Buffer | UpdateJSONWithURL): Promise<any> {
    if (typeof data === 'object') {
      if ((format === 'json' && isUpdateJSON(data)) || (format === 'buffer' && Buffer.isBuffer(data))) {
        return data
      } else {
        this.err('Invalid type', 'ERR_PARAM', `Invalid type at format '${format}': ${JSON.stringify(data)}`)
        return
      }
    }

    // fetch data from remote
    this.logger?.debug(`Download from \`${this.provider!.name}\``)
    try {
      const result = format === 'json'
        ? await this.provider!.downloadJSON(app.name, __EIU_VERSION_PATH__, this.controller.signal)
        : await this.provider!.downloadAsar(this.info!, this.controller.signal, info => this.emit('download-progress', info))

      this.logger?.debug(`Download ${format} success${format === 'buffer' ? `, file size: ${(result as Buffer).length}` : ''}`)

      return result
    } catch (e) {
      this.err(`Fetch ${format} failed`, 'ERR_NETWORK', e instanceof Error ? e.message : (e as any).toString())
    }
  }

  /**
   * Handle error message and emit error event
   */
  private err(msg: string, code: ErrorInfo, errorInfo: string): void {
    const err = new UpdaterError(code, errorInfo)
    this.logger?.error(`[${code}] ${msg}`, err)
    this.emit('error', err)
  }

  /**
   * Check update info using default options
   */
  public async checkForUpdates(): Promise<boolean>
  /**
   * Check update info using existing update json
   * @param data existing update json
   */
  public async checkForUpdates(data: UpdateJSON | UpdateJSONWithURL): Promise<boolean>
  public async checkForUpdates(data?: UpdateJSON | UpdateJSONWithURL): Promise<boolean> {
    const emitUnavailable = (msg: string, code: UnavailableInfo, info?: UpdateInfoWithExtraVersion): false => {
      this.logger?.info(`[${code}] ${msg}`)
      this.emit('update-not-available', code, msg, info)
      return false
    }

    if (!data && !this.provider) {
      const msg = 'No update json or provider'
      this.err('Check update failed', 'ERR_PARAM', msg)
      return emitUnavailable(msg, 'UNAVAILABLE_ERROR')
    }

    const _data = await this.fetch('json', data as any)
    if (!_data) {
      return emitUnavailable('Failed to get update info', 'UNAVAILABLE_ERROR')
    }
    const { signature, version, minimumVersion, url = '' } = this.receiveBeta ? _data.beta : _data
    const info = { signature, minimumVersion, version, url }
    const extraVersionInfo = {
      signature,
      minimumVersion,
      version,
      appVersion: getAppVersion(),
      entryVersion: getEntryVersion(),
    }
    this.logger?.debug(`Checked update, version: ${version}, signature: ${signature}`)

    if (isDev && !this.forceUpdate && !data) {
      return emitUnavailable('Skip check update in dev mode. To force update, set `updater.forceUpdate` to true or call checkUpdate with UpdateJSON', 'UNAVAILABLE_DEV', extraVersionInfo)
    }
    const isLowerVersion = this.provider!.isLowerVersion
    try {
      if (isLowerVersion(extraVersionInfo.entryVersion, minimumVersion)) {
        return emitUnavailable(`Entry Version (${extraVersionInfo.entryVersion}) < MinimumVersion (${minimumVersion})`, 'UNAVAILABLE_VERSION', extraVersionInfo)
      }

      this.logger?.info(`Current version is ${extraVersionInfo.appVersion}, new version is ${version}`)

      if (!isLowerVersion(extraVersionInfo.appVersion, version)) {
        return emitUnavailable(`Current version (${extraVersionInfo.appVersion}) > New version (${version})`, 'UNAVAILABLE_VERSION', extraVersionInfo)
      }
      this.logger?.info(`Update available: ${version}`)
      this.emit('update-available', extraVersionInfo)
      this.info = info
      return true
    } catch {
      const msg = 'Fail to parse version string'
      this.err('Check update failed', 'ERR_VALIDATE', msg)
      return emitUnavailable(msg, 'UNAVAILABLE_ERROR', extraVersionInfo)
    }
  }

  /**
   * Download update using default options
   */
  public async downloadUpdate(): Promise<boolean>
  /**
   * Download update using existing `asar.gz` buffer and signature
   * @param data existing `asar.gz` buffer
   * @param info update info
   */
  public async downloadUpdate(data: Uint8Array, info: Omit<UpdateInfo, 'minimumVersion'>): Promise<boolean>
  public async downloadUpdate(data?: Uint8Array, info?: Omit<UpdateInfo, 'minimumVersion'>): Promise<boolean> {
    const _sig = info?.signature ?? this.info?.signature
    const _version = info?.version ?? this.info?.version

    if (!_sig || !_version) {
      this.err('Download failed', 'ERR_PARAM', 'No update signature, please call `checkUpdate` first or manually setup params')
      return false
    }

    if (!data && !this.provider) {
      this.err('Download failed', 'ERR_PARAM', 'No update asar buffer and provider')
      return false
    }

    // if typeof data is Buffer, the version will not be used
    const buffer = await this.fetch('buffer', data ? Buffer.from(data) : undefined)

    if (!buffer) {
      this.err('Download failed', 'ERR_PARAM', 'No update asar file buffer')
      return false
    }

    // verify update file
    this.logger?.debug('verify start')
    if (!await this.provider!.verifySignaure(buffer, _version, _sig, this.CERT)) {
      this.err('Download failed', 'ERR_VALIDATE', 'Invalid update asar file')
      return false
    }
    this.logger?.debug('Verify success')

    try {
      const tmpFilePath = `${getPathFromAppNameAsar()}.tmp`
      // write file to tmp path
      this.logger?.debug(`Install to ${tmpFilePath}`)
      fs.writeFileSync(tmpFilePath, await this.provider!.unzipFile(buffer))

      this.logger?.info(`Download success, version: ${_version}`)
      this.info = undefined
      this.emit('update-downloaded')
      return true
    } catch (error) {
      this.err('Download failed', 'ERR_DOWNLOAD', `Fail to unwrap asar file, ${error}`)
      return false
    }
  }

  /**
   * quit App and install
   */
  public quitAndInstall(): void {
    this.logger?.info('Quit and install')
    restartApp()
  }

  public cancel(): void {
    if (this.controller.signal.aborted) {
      return
    }
    this.controller.abort()
    this.logger?.info('Cancel update')
    this.emit('update-cancelled')
    this.controller = new AbortController()
  }
}

/**
 * Auto check update, download and install
 */
export async function autoUpdate(updater: Updater): Promise<void> {
  if (await updater.checkForUpdates() && await updater.downloadUpdate()) {
    updater.quitAndInstall()
  }
}
