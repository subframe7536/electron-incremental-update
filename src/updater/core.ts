import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import { getPathFromAppNameAsar, getVersions, isUpdateJSON, restartApp, unzipFile } from '../utils'
import { verify } from '../crypto'
import type { UpdateInfo, UpdateJSON } from '../utils'
import type { CheckResult, DownloadResult, DownloadingInfo, Logger, UpdaterOption } from './types'
import { ErrorInfo, UpdaterError } from './types'
import { downloadBufferDefault, downloadJSONDefault } from './defaultFunctions/download'
import { isLowerVersionDefault } from './defaultFunctions/compareVersion'

/**
 * type only signature cert, used for verify, transformed by esbuild's define
 */
declare const __SIGNATURE_CERT__: string

export class Updater {
  private CERT = __SIGNATURE_CERT__
  private info?: UpdateInfo
  private option: UpdaterOption
  private asarPath: string
  private gzipPath: string
  private tmpFilePath: string
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
  public onDownloading?: (progress: DownloadingInfo) => void

  /**
   * whether receive beta version
   */
  get receiveBeta() {
    return !!this.option.receiveBeta
  }

  set receiveBeta(receiveBeta: boolean) {
    this.option.receiveBeta = receiveBeta
  }

  /**
   * initialize incremental updater
   * @param option UpdaterOption
   */
  constructor(option: UpdaterOption = {}) {
    this.option = option
    if (option.SIGNATURE_CERT) {
      this.CERT = option.SIGNATURE_CERT
    }
    this.asarPath = getPathFromAppNameAsar()
    this.gzipPath = `${this.asarPath}.gz`
    this.tmpFilePath = `${this.asarPath}.tmp`
  }

  private async needUpdate(version: string, minVersion: string) {
    const isLowerVersion = this.option.overrideFunctions?.isLowerVersion ?? isLowerVersionDefault
    const { appVersion, entryVersion } = getVersions()

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

    const ua = this.option.downloadConfig?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'
    const headers = {
      Accept: `application/${format === 'json' ? 'json' : 'octet-stream'}`,
      UserAgent: ua,
      ...this.option.downloadConfig?.extraHeader,
    }

    this.logger?.debug(`download headers: ${JSON.stringify(headers)}`)

    const config = format === 'json'
      ? {
          name: 'updateJsonURL',
          url: this.option.updateJsonURL,
          repoFallback: `${this.option.repository?.replace('github.com', 'raw.githubusercontent.com')}/master/version.json`,
          fn: this.option.overrideFunctions?.downloadJSON ?? downloadJSONDefault,
        }
      : {
          name: 'releaseAsarURL',
          url: this.option.releaseAsarURL,
          repoFallback: `${this.option.repository}/releases/download/v${this.info?.version}/${app.name}-${this.info?.version}.asar.gz`,
          fn: this.option.overrideFunctions?.downloadBuffer ?? downloadBufferDefault,
        }

    data ??= config.url
    if (!data) {
      this.logger?.debug(`no ${config.name}, fallback to use repository`)
      if (!this.option.repository) {
        throw new UpdaterError(ErrorInfo.param, `${config.name} or repository is not set`)
      }
      if (format === 'buffer' && !this.info?.version) {
        throw new UpdaterError(ErrorInfo.param, 'version is not set')
      }
      data = config.repoFallback
    }

    // fetch data from remote
    this.logger?.debug(`download ${format} from ${data}`)
    try {
      const ret = format === 'json'
        ? await (config.fn as typeof downloadJSONDefault)(data, headers)
        : await (config.fn as typeof downloadBufferDefault)(data, headers, this.info!.size, this.onDownloading)
      this.logger?.debug(`download ${format} success${format === 'buffer' ? `, file size: ${(ret as Buffer).length}` : ''}`)
      return ret
    } catch (e) {
      throw new UpdaterError(ErrorInfo.downlaod, (e as object).toString())
    }
  }

  /**
   * check update info using default options
   * @returns
   * - Available: `{size: number, version: string}`
   * - Unavailable: `undefined`
   * - Fail: `UpdaterError`
   */
  public async checkUpdate(): Promise<CheckResult>
  /**
   * check update info using custom url
   * @param url custom download URL of `updatejson`
   * @returns
   * - Available:`{size: number, version: string}`
   * - Unavailable: `undefined`
   * - Fail: `UpdaterError`
   */
  public async checkUpdate(url: string): Promise<CheckResult>
  /**
   * check update info using existing update json
   * @param data existing update json
   * @returns
   * - Available:`{size: number, version: string}`
   * - Unavailable: `undefined`
   * - Fail: `UpdaterError`
   */
  public async checkUpdate(data: UpdateJSON): Promise<CheckResult>
  public async checkUpdate(data?: string | UpdateJSON): Promise<CheckResult> {
    try {
      let { signature, size, version, minimumVersion, beta } = await this.parseData('json', data)
      if (this.receiveBeta) {
        version = beta.version
        signature = beta.signature
        minimumVersion = beta.minimumVersion
        size = beta.size
      }
      this.logger?.debug(`checked version: ${version}, size: ${size}, signature: ${signature}`)

      // if not need update, return
      if (!await this.needUpdate(version, minimumVersion)) {
        this.logger?.info(`update unavailable: ${version} is the latest version`)
        return undefined
      } else {
        this.logger?.info(`update available: ${version}`)
        this.info = {
          signature,
          minimumVersion,
          version,
          size,
        }
        return this.info
      }
    } catch (error) {
      this.logger?.error('check update failed', error as Error)
      return error as Error
    }
  }

  /**
   * download update using default options
   * @returns
   * - Success: `true`
   * - Fail: `UpdaterError`
   */
  public async download(): Promise<DownloadResult>
  /**
   * download update using custom url
   * @param url custom download URL
   * @returns
   * - Success: `true`
   * - Fail: `UpdaterError`
   */
  public async download(url: string): Promise<DownloadResult>
  /**
   * download update using existing `asar.gz` buffer and signature
   * @param data existing `asar.gz` buffer
   * @param sig signature
   * @returns
   * - Success: `true`
   * - Fail: `UpdaterError`
   */
  public async download(data: Buffer, sig: string): Promise<DownloadResult>
  public async download(data?: string | Buffer, sig?: string): Promise<DownloadResult> {
    try {
      const _sig = sig ?? this.info?.signature
      if (!_sig) {
        throw new UpdaterError(ErrorInfo.param, 'signature is empty')
      }

      // if typeof data is Buffer, the version will not be used
      const buffer = await this.parseData('buffer', data)

      // verify update file
      this.logger?.debug('verify start')
      const _verify = this.option.overrideFunctions?.verifySignaure ?? verify
      const _ver = await _verify(buffer, _sig, this.CERT)
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
      return true
    } catch (error) {
      this.logger?.error('download asar failed', error as Error)
      return error as Error
    }
  }

  /**
   * quit App and install
   */
  public quitAndInstall() {
    this.logger?.info('quit and install')
    restartApp()
  }
}
