import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { app } from 'electron'
import { getPathFromAppNameAsar, getVersions, isUpdateJSON, restartApp, unzipFile } from '../utils'
import { verify } from '../crypto'
import type { UpdateInfo, UpdateJSON } from '../utils'
import type { CheckResult, DownloadResult, DownloadingInfo, Logger, UpdaterOption } from './types'
import { DownloadError, MinimumVersionError, VerifyFailedError } from './types'
import { downloadBufferDefault, downloadJSONDefault } from './defaultFunctions/download'
import { compareVersionDefault } from './defaultFunctions/compareVersion'

export class Updater {
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
  constructor(option: UpdaterOption) {
    this.option = option
    this.asarPath = getPathFromAppNameAsar()
    this.gzipPath = `${this.asarPath}.gz`
    this.tmpFilePath = `${this.asarPath}.tmp`
  }

  private async needUpdate(version: string, minVersion: string) {
    const compare = this.option.overrideFunctions?.compareVersion ?? compareVersionDefault
    const { app: appVersion, entry: entryVersion } = getVersions()
    if (await compare(entryVersion, minVersion)) {
      throw new MinimumVersionError(entryVersion, minVersion)
    }
    this.logger?.info(`check update: current version is ${appVersion}, new version is ${version}`)

    return await compare(appVersion, version)
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
  private async parseData(format: 'buffer', data?: Buffer): Promise<Buffer>
  private async parseData(format: 'json' | 'buffer', data?: string | Buffer | UpdateJSON) {
    if (existsSync(this.tmpFilePath)) {
      this.logger?.warn(`remove tmp file: ${this.tmpFilePath}`)
      await rm(this.tmpFilePath)
    }

    if (existsSync(this.gzipPath)) {
      this.logger?.warn(`remove .gz file: ${this.gzipPath}`)
      await rm(this.gzipPath)
    }

    if (!['string', 'object', 'undefined'].includes(typeof data)) {
      throw new TypeError(`invalid type at format '${format}': ${data}`)
    }

    if (typeof data === 'object' && ((format === 'json' && isUpdateJSON(data))
      || (format === 'buffer' && Buffer.isBuffer(data)))) {
      return data
    }

    if (typeof data === 'object') {
      throw new TypeError(`invalid type at format '${format}': ${data}`)
    }

    const ua = this.option.downloadConfig?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'
    const headers = {
      Accept: `application/${format === 'json' ? 'json' : 'octet-stream'}`,
      UserAgent: ua,
      ...this.option.downloadConfig?.extraHeader,
    }

    this.logger?.info(`download headers: ${JSON.stringify(headers, null, 2)}`)

    const config = format === 'json'
      ? {
          name: 'updateJsonURL',
          url: this.option.updateJsonURL,
          repoFallback: `${this.option.repository!.replace('github.com', 'raw.githubusercontent.com')}/master/version.json`,
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
        throw new Error(`${config.name} or repository are not set`)
      }
      if (format === 'buffer' && !this.info?.version) {
        throw new Error('version are not set')
      }
      data = config.repoFallback
    }

    // fetch data from remote
    this.logger?.info(`download ${format} from ${data}`)
    try {
      const ret = format === 'json'
        ? await (config.fn as typeof downloadJSONDefault)(data, headers)
        : await (config.fn as typeof downloadBufferDefault)(data, headers, this.info!.size, this.onDownloading)
      this.logger?.info(`download ${format} success${format === 'buffer' ? `, file size: ${(ret as Buffer).length}` : ''}`)
      return ret
    } catch (e) {
      throw new DownloadError((e as object).toString())
    }
  }

  /**
   * check update info
   *
   * if you want to update **offline**, you can set `data` and `sig` add update info
   * @param data custom download URL of `updatejson` or existing update json
   * @returns
   * - Available:`{size: number, version: string}`
   * - Unavailable: `undefined`
   * - Fail: `CheckResultError`
   */
  public async checkUpdate(data?: string | UpdateJSON): Promise<CheckResult> {
    try {
      let { signature, size, version, minimumVersion, beta } = await this.parseData('json', data)
      if (this.receiveBeta) {
        version = beta.version
        signature = beta.signature
        minimumVersion = beta.minimumVersion
        size = beta.size
      }
      this.logger?.info(`checked version: ${version}, size: ${size}, signature: ${signature}`)

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
   * download update
   *
   * if you want to update **offline**, you can set both `data` and `sig` to verify and install
   * @param data custom download URL of `asar.gz` or existing `asar.gz` buffer
   * @param sig signature
   * @returns
   * - `true`: success
   * - `DownloadResultError`: fail
   */
  public async download(data?: Buffer, sig?: string): Promise<DownloadResult> {
    try {
      const _sig = sig ?? this.info?.signature
      if (!_sig) {
        throw new Error('signature are not set, please checkUpdate first or set the second parameter')
      }

      // if typeof data is Buffer, the version will not be used
      const buffer = await this.parseData('buffer', data)

      // verify update file
      this.logger?.info('verify start')
      const _verify = this.option.overrideFunctions?.verifySignaure ?? verify
      const _ver = await _verify(buffer, _sig, this.option.SIGNATURE_CERT)
      if (!_ver) {
        throw new VerifyFailedError(_sig, this.option.SIGNATURE_CERT)
      }
      this.logger?.info('verify success')

      // write file
      this.logger?.info(`write to ${this.gzipPath}`)
      await writeFile(this.gzipPath, buffer)
      // extract file to tmp path
      this.logger?.info(`extract to ${this.tmpFilePath}`)
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
