import { existsSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { rm, writeFile } from 'node:fs/promises'
import { getEntryVersion, getProductAsarPath, getProductVersion, unzipFile } from '../utils'
import { verify } from '../crypto'
import type { UpdateInfo, UpdateJSON } from '../updateJson'
import { isUpdateJSON } from '../updateJson'
import type { CheckResultType, DownloadResult, DownloadingInfo, Logger } from './types'
import { compareVersionDefault, downloadBufferDefault, downloadJSONDefault } from './defaultFunctions'

import type { Updater, UpdaterOption } from '.'

export class MinimumVersionError extends Error {
  currentVersion: string
  minVersion: string
  constructor(version: string, minimumVersion: string) {
    super(`current entry version is ${version}, less than the minimumVersion ${minimumVersion}`)
    this.currentVersion = version
    this.minVersion = minimumVersion
  }
}
export class VerifyFailedError extends Error {
  signature: string
  cert: string
  constructor(signature: string, cert: string) {
    super('verify failed, invalid signature or certificate')
    this.signature = signature
    this.cert = cert
  }
}
export class IncrementalUpdater implements Updater {
  private info?: UpdateInfo
  private option: UpdaterOption
  private asarPath: string
  private gzipPath: string
  private tmpFilePath: string
  public logger?: Logger

  public onDownloading?: (progress: DownloadingInfo) => void
  get productName() {
    return this.option.productName
  }

  set productName(name: string) {
    this.option.productName = name
  }

  get receiveBeta() {
    return !!this.option.receiveBeta
  }

  set receiveBeta(receiveBeta: boolean) {
    this.option.receiveBeta = receiveBeta
  }

  constructor(option: UpdaterOption) {
    this.option = option
    this.asarPath = getProductAsarPath(this.productName)
    this.gzipPath = `${this.asarPath}.gz`
    this.tmpFilePath = `${this.asarPath}.tmp`
  }

  private async needUpdate(version: string, minVersion: string) {
    const compare = this.option.overrideFunctions?.compareVersion ?? compareVersionDefault
    const productVersion = getProductVersion(this.option.productName)
    const entryVersion = getEntryVersion()
    if (await compare(entryVersion, minVersion)) {
      throw new MinimumVersionError(entryVersion, minVersion)
    }
    this.logger?.info(`check update: current version is ${productVersion}, new version is ${version}`)

    return await compare(productVersion, version)
  }

  private async parseData(format: 'json', data?: string | UpdateJSON): Promise<UpdateJSON>
  private async parseData(format: 'buffer', data?: string | Buffer): Promise<Buffer>
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

    if (typeof data === 'object' && ((format === 'json' && isUpdateJSON(data)) || (format === 'buffer' && Buffer.isBuffer(data)))) {
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
          repoFallback: `${this.option.repository}/releases/download/v${this.info?.version}/${this.productName}-${this.info?.version}.asar.gz`,
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
    const ret = format === 'json'
      ? await (config.fn as typeof downloadJSONDefault)(data, headers)
      : await (config.fn as typeof downloadBufferDefault)(data, headers, this.info!.size, this.onDownloading)
    this.logger?.info(`download ${format} success${format === 'buffer' ? `, file size: ${(ret as Buffer).length}` : ''}`)
    return ret
  }

  public async checkUpdate(data?: string | UpdateJSON): Promise<CheckResultType> {
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
        return { size, version }
      }
    } catch (error) {
      this.logger?.error('check update failed', error as Error)
      return error as Error
    }
  }

  public async download(data?: string | Buffer, sig?: string): Promise<DownloadResult> {
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

      this.logger?.info(`download success${typeof _ver === 'string' ? `, version: ${_ver}` : ''}`)
      this.info = undefined
      return true
    } catch (error) {
      this.logger?.error('download asar failed', error as Error)
      return error as Error
    }
  }
}
/**
 * create updater instance
 * @param option updater option
 * @returns updater
 */
export function createUpdater(option: UpdaterOption) {
  return new IncrementalUpdater(option)
}

export type { Updater, UpdaterOption } from './types'
