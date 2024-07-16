import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import { type UpdateInfo, type UpdateJSON, isUpdateJSON } from '../utils/version'
import type { IProvider, OnDownloading, URLHandler } from '../provider'
import { getAppVersion, getEntryVersion, getPathFromAppNameAsar, isDev, restartApp } from '../utils/electron'
import { unzipFile } from '../utils/unzip'
import type { CheckResult, DownloadResult, Logger, UpdaterOption } from './types'
import { ErrorInfo, UpdaterError } from './types'

/**
 * type only signature cert, transformed by esbuild's define
 */
declare const __EIU_SIGNATURE_CERT__: string
/**
 * type only version json path, transformed by esbuild's define
 */
declare const __EIU_VERSION_PATH__: string

export class Updater {
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
   * downloading progress hook
   * @param progress download progress
   * @example
   * updater.onDownloading = ({ percent, total, current }) => {
   *   console.log(`download progress: ${percent}, total: ${total}, current: ${current}`)
   * }
   */
  public onDownloading?: OnDownloading
  /**
   * URL handler hook
   *
   * for Github, there are some {@link https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L34 public CDN links}
   * @param url source url
   * @param isDownloadAsar whether is download asar
   */
  public handleURL?: URLHandler

  /**
   * whether receive beta version
   */
  get receiveBeta() {
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
    this.provider = provider
    this.options = option
    if (option.SIGNATURE_CERT) {
      this.CERT = option.SIGNATURE_CERT
    }
    if (option.logger) {
      this.logger = option.logger
    }
    this.asarPath = getPathFromAppNameAsar()
    this.gzipPath = `${this.asarPath}.gz`
    this.tmpFilePath = `${this.asarPath}.tmp`
  }

  private async needUpdate(version: string, minVersion: string) {
    if (isDev) {
      this.logger?.warn(`in dev mode, skip check update`)
      return false
    }
    const isLowerVersion = this.provider.isLowerVersion
    const entryVersion = getEntryVersion()
    const appVersion = getAppVersion()

    if (await isLowerVersion(entryVersion, minVersion)) {
      throw new UpdaterError(ErrorInfo.version, `entry version (${entryVersion}) < minimumVersion (${minVersion})`)
    }

    this.logger?.info(`check update: current version is ${appVersion}, new version is ${version}`)

    return await isLowerVersion(appVersion, version)
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
  private async parseData(format: 'json', data?: string | UpdateJSON): Promise<UpdateJSON>
  private async parseData(format: 'buffer', data?: string | Buffer): Promise<Buffer>
  private async parseData(format: 'json' | 'buffer', data?: string | Buffer | UpdateJSON) {
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
        throw new UpdaterError(ErrorInfo.param, `invalid type at format '${format}': ${JSON.stringify(data)}`)
      }
    }

    // fetch data from remote
    this.logger?.debug(`download from ${this.provider.name}`)
    try {
      const result = format === 'json'
        ? await this.provider.downloadJSON(data ?? __EIU_VERSION_PATH__)
        : await this.provider.downloadBuffer(app.name, this.info!, this.onDownloading)

      this.logger?.debug(`download ${format} success${format === 'buffer' ? `, file size: ${(result as Buffer).length}` : ''}`)

      return result
    } catch (e) {
      this.logger?.warn(`download ${format} failed: ${e}`)
      throw new UpdaterError(ErrorInfo.download, `download ${format} failed: ${e}`)
    }
  }

  /**
   * check update info using default options
   */
  public async checkUpdate<T extends UpdateJSON>(): Promise<CheckResult<T>>
  /**
   * check update info using custom url
   * @param url custom download URL of `updatejson`
   */
  public async checkUpdate<T extends UpdateJSON>(url: string): Promise<CheckResult<T>>
  /**
   * check update info using existing update json
   * @param data existing update json
   */
  public async checkUpdate<T extends UpdateJSON>(data: T): Promise<CheckResult<T>>
  public async checkUpdate<T extends UpdateJSON>(data?: string | T): Promise<CheckResult<T>> {
    try {
      let { signature, size, version, minimumVersion, beta } = await this.parseData('json', data)
      if (this.receiveBeta) {
        version = beta.version
        signature = beta.signature
        minimumVersion = beta.minimumVersion
        size = beta.size
      }
      this.logger?.debug(`checked update, version: ${version}, size: ${size}, signature: ${signature}`)

      // if not need update, return
      if (!await this.needUpdate(version, minimumVersion)) {
        this.logger?.info(`update unavailable: ${version} is the latest version`)
        return { success: false, data: version }
      } else {
        this.logger?.info(`update available: ${version}`)
        this.info = { signature, minimumVersion, version, size }
        return { success: true, data: this.info as any }
      }
    } catch (error) {
      this.logger?.error('check update failed', error)
      return {
        success: false,
        data: error instanceof UpdaterError
          ? error
          : new UpdaterError(ErrorInfo.download, (error as any).toString()),
      }
    }
  }

  /**
   * download update using default options
   */
  public async download(): Promise<DownloadResult>
  /**
   * download update using custom url
   * @param url custom download URL
   */
  public async download(url: string): Promise<DownloadResult>
  /**
   * download update using existing `asar.gz` buffer and signature
   * @param data existing `asar.gz` buffer
   * @param sig signature
   */
  public async download(data: Buffer, sig: string): Promise<DownloadResult>
  public async download(data?: string | Buffer, sig?: string): Promise<DownloadResult> {
    try {
      if (!this.info) {
        throw new UpdaterError(ErrorInfo.param, 'no update info')
      }
      const _sig = sig ?? this.info.signature

      // if typeof data is Buffer, the version will not be used
      const buffer = await this.parseData('buffer', data)

      // verify update file
      this.logger?.debug('verify start')
      const _ver = await this.provider.verifySignaure(buffer, _sig, this.CERT)
      if (!_ver) {
        throw new UpdaterError(ErrorInfo.validate, 'invalid signature or certificate')
      }
      this.logger?.debug('verify success')

      // write file
      this.logger?.debug(`write to ${this.gzipPath}`)
      writeFileSync(this.gzipPath, buffer)
      // extract file to tmp path
      this.logger?.debug(`extract to ${this.tmpFilePath}`)
      await unzipFile(this.gzipPath, this.tmpFilePath)

      this.logger?.info(`download success, version: ${_ver}`)
      this.info = undefined
      return { success: true }
    } catch (error) {
      this.logger?.error('download asar failed', error)
      return {
        success: false,
        data: error instanceof UpdaterError
          ? error
          : new UpdaterError(ErrorInfo.download, (error as any).toString()),
      }
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
