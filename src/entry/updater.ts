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
  'update-not-available': [reason: string, data?: UpdateInfo]
  'error': [error: UpdaterError]
  'download-progress': [info: DownloadingInfo]
  'update-downloaded': any
  'update-cancelled': any
}> {
  private CERT: string
  private controller: AbortController
  private info?: UpdateInfo
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
  private async fetch(format: 'json', data?: UpdateJSON): Promise<UpdateJSON | undefined>
  /**
   * This function is used to parse download data.
   *
   * if data is absent, download URL from provider and return it,
   * else if data is `Buffer`, return it
   * @param format 'json' or 'buffer'
   * @param data download URL or update json or buffer
   */
  private async fetch(format: 'buffer', data?: Buffer): Promise<Buffer | undefined>
  private async fetch(format: 'json' | 'buffer', data?: Uint8Array | UpdateJSON): Promise<any> {
    if (typeof data === 'object') {
      if ((format === 'json' && isUpdateJSON(data)) || (format === 'buffer' && Buffer.isBuffer(data))) {
        return data
      } else {
        this.err('Invalid type', 'param', `Invalid type at format '${format}': ${JSON.stringify(data)}`)
        return
      }
    }

    // fetch data from remote
    this.logger?.debug(`Download from \`${this.provider!.name}\``)
    try {
      const result = format === 'json'
        ? await this.provider!.downloadJSON(__EIU_VERSION_PATH__, this.controller.signal)
        : await this.provider!.downloadAsar(app.name, this.info!, this.controller.signal, info => this.emit('download-progress', info))

      this.logger?.debug(`Download ${format} success${format === 'buffer' ? `, file size: ${(result as Buffer).length}` : ''}`)

      return result
    } catch (e) {
      this.err(`Fetch ${format} failed`, 'network', `Download ${format} failed: ${e}`)
    }
  }

  /**
   * Handle error message and emit error event
   */
  private err(msg: string, code: keyof typeof ErrorInfo, errorInfo: string): void {
    const err = new UpdaterError(code, errorInfo)
    this.logger?.error(msg, err)
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
  public async checkForUpdates(data: UpdateJSON): Promise<boolean>
  public async checkForUpdates(data?: UpdateJSON): Promise<boolean> {
    const emitUnavailable = (msg: string, info?: UpdateInfo): false => {
      this.logger?.info(msg)
      this.emit('update-not-available', msg, info)
      return false
    }

    if (!data && !this.provider) {
      this.err('Check update failed', 'param', 'No update json or provider')
      return false
    }

    const _data = await this.fetch('json', data)
    if (!_data) {
      return emitUnavailable('Failed to get update info')
    }
    const { signature, version, minimumVersion } = this.receiveBeta ? _data.beta : _data
    const info = { signature, minimumVersion, version }
    this.logger?.debug(`Checked update, version: ${version}, signature: ${signature}`)

    if (isDev && !this.forceUpdate && !data) {
      return emitUnavailable('Skip check update in dev mode. To force update, set `updater.forceUpdate` to true or call checkUpdate with UpdateJSON', info)
    }
    const isLowerVersion = this.provider!.isLowerVersion
    const entryVersion = getEntryVersion()
    const appVersion = getAppVersion()
    try {
      if (isLowerVersion(entryVersion, minimumVersion)) {
        return emitUnavailable(`Entry Version (${entryVersion}) < MinimumVersion (${minimumVersion})`, info)
      }

      this.logger?.info(`Check update: current version is ${appVersion}, new version is ${version}`)

      if (!isLowerVersion(appVersion, version)) {
        return emitUnavailable(`Current version (${appVersion}) < New version (${version})`, info)
      }
      this.logger?.info(`Update available: ${version}`)
      this.emit('update-available', info)
      this.info = info
      return true
    } catch {
      this.err('Fail to parse version', 'validate', 'Fail to parse version string')
      return false
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
      this.err('Download failed', 'param', 'No update signature, please call `checkUpdate` first or manually setup params')
      return false
    }

    if (!data && !this.provider) {
      this.err('Download failed', 'param', 'No update asar buffer and provider')
      return false
    }

    // if typeof data is Buffer, the version will not be used
    const buffer = await this.fetch('buffer', data ? Buffer.from(data) : undefined)

    if (!buffer) {
      this.err('Download failed', 'param', 'No update asar file buffer')
      return false
    }

    // verify update file
    this.logger?.debug('verify start')
    if (!await this.provider!.verifySignaure(buffer, _version, _sig, this.CERT)) {
      this.err('Download failed', 'validate', 'Invalid update asar file')
      return false
    }
    this.logger?.debug('Verify success')

    try {
      const tmpFilePath = getPathFromAppNameAsar() + '.tmp'
      // write file to tmp path
      this.logger?.debug(`Install to ${tmpFilePath}`)
      fs.writeFileSync(tmpFilePath, await this.provider!.unzipFile(buffer))

      this.logger?.info(`Download success, version: ${_version}`)
      this.info = undefined
      this.emit('update-downloaded')
      return true
    } catch (error) {
      this.err('Download failed', 'download', `Fail to unwrap asar file, ${error}`)
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
