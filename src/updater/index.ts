import { EventEmitter } from 'node:events'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { verify } from '../crypto'
import { getEntryVersion, getProductAsarPath, getProductVersion, unzipFile } from '../utils'
import type { UpdateJSON } from '../updateJson'
import { isUpdateJSON } from '../updateJson'
import { compareVersionDefault, downloadBufferDefault, downloadJSONDefault } from './defaultFunctions'
import type { CheckResultType, DownloadResult, Updater, UpdaterOption } from './types'

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
/**
 * Creates an updater based on the provided options
 */
export function createUpdater(updaterOptions: UpdaterOption): Updater {
  const {
    SIGNATURE_CERT,
    repository,
    productName,
    releaseAsarURL: _release,
    updateJsonURL: _update,
    debug = false,
    receiveBeta = false,
    downloadConfig: { extraHeader, userAgent } = {},
    overrideFunctions: {
      compareVersion,
      verifySignaure,
      downloadBuffer,
      downloadJSON,
    } = {},
  } = updaterOptions

  // hack to make typesafe
  const updater = new EventEmitter() as unknown as Updater

  let signature: string | undefined
  let version: string | undefined

  const asarPath = getProductAsarPath(productName)
  const gzipPath = `${asarPath}.gz`
  const tmpFilePath = `${asarPath}.tmp`

  function log(msg: string | Error) {
    debug && updater.emit('debug', msg)
  }

  async function needUpdate(version: string, minVersion: string) {
    const compare = compareVersion ?? compareVersionDefault
    const productVersion = getProductVersion(productName)
    const entryVersion = getEntryVersion()
    if (await compare(entryVersion, minVersion)) {
      throw new MinimumVersionError(entryVersion, minVersion)
    }
    log(`check update: current version is ${productVersion}, new version is ${version}`)

    return await compare(productVersion, version)
  }

  async function parseData(format: 'json', data?: string | UpdateJSON): Promise<UpdateJSON>
  async function parseData(format: 'buffer', data?: string | Buffer, version?: string): Promise<Buffer>
  async function parseData(format: 'json' | 'buffer', data?: string | Buffer | UpdateJSON, version?: string) {
    // remove tmp file
    if (existsSync(tmpFilePath)) {
      log(`remove tmp file: ${tmpFilePath}`)
      await rm(tmpFilePath)
    }

    if (existsSync(gzipPath)) {
      log(`remove .gz file: ${gzipPath}`)
      await rm(gzipPath)
    }
    if (typeof data === 'object') {
      if ((format === 'json' && isUpdateJSON(data)) || (format === 'buffer' && Buffer.isBuffer(data))) {
        return data
      } else {
        throw new TypeError(`invalid type at format '${format}': ${data}`)
      }
    } else if (['string', 'undefined'].includes(typeof data)) {
      const ua = userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'
      const headers = {
        Accept: `application/${format === 'json' ? 'json' : 'octet-stream'}`,
        UserAgent: ua,
        ...extraHeader,
      }

      log(`download headers: ${JSON.stringify(headers, null, 2)}`)

      const info = format === 'json'
        ? {
            name: 'updateJsonURL',
            url: _update,
            repoFallback: `${repository!.replace('github.com', 'raw.githubusercontent.com')}/master/version.json`,
            fn: downloadJSON ?? downloadJSONDefault,
          }
        : {
            name: 'releaseAsarURL',
            url: _release,
            repoFallback: `${repository}/releases/download/v${version}/${productName}-${version}.asar.gz`,
            fn: downloadBuffer ?? downloadBufferDefault,
          }
      data ??= info.url
      if (!data) {
        log(`no ${info.name}, fallback to use repository`)
        if (!repository) {
          throw new Error(`${info.name} or repository are not set`)
        }
        if (format === 'buffer' && !version) {
          throw new Error('version are not set')
        }
        data = info.repoFallback
      }
      // fetch data from remote
      log(`download ${format} from ${data}`)
      const ret = await info.fn(data, updater, headers)
      log(`download ${format} success${format === 'buffer' ? `, file size: ${(ret as Buffer).length}` : ''}`)
      if (format === 'buffer') {
        updater.emit('downloadBuffer', ret as Buffer)
      }
      return ret
    } else {
      throw new TypeError(`invalid type at format '${format}': ${data}`)
    }
  }
  updater.productName = productName
  updater.debug = debug
  updater.receiveBeta = receiveBeta
  updater.checkUpdate = async (data?: string | UpdateJSON): Promise<CheckResultType> => {
    try {
      let {
        signature: _sig,
        size,
        version: _ver,
        minimumVersion,
        beta,
      } = await parseData('json', data)
      if (receiveBeta) {
        _ver = beta.version
        _sig = beta.signature
        minimumVersion = beta.minimumVersion
        size = beta.size
      }
      log(`checked version: ${_ver}, size: ${size}, signature: ${_sig}`)

      // if not need update, return
      if (!await needUpdate(_ver, minimumVersion)) {
        log(`update unavailable: ${_ver}`)
        return undefined
      } else {
        log(`update available: ${_ver}`)
        signature = _sig
        version = _ver
        return { size, version: _ver }
      }
    } catch (error) {
      log(error as Error)
      return error as Error
    }
  }
  updater.download = async (data?: string | Buffer, sig?: string): Promise<DownloadResult> => {
    try {
      const _sig = sig ?? signature
      if (!_sig) {
        throw new Error('signature are not set, please checkUpdate first or set the second parameter')
      }

      // if typeof data is Buffer, the version will not be used
      const buffer = await parseData('buffer', data, version)

      // verify update file
      log('verify start')
      const _verify = verifySignaure ?? verify
      const _ver = await _verify(buffer, _sig, SIGNATURE_CERT)
      if (!_ver) {
        throw new VerifyFailedError(_sig, SIGNATURE_CERT)
      }
      log('verify success')

      // write file
      log(`write to ${gzipPath}`)
      await writeFile(gzipPath, buffer)
      // extract file to tmp path
      log(`extract to ${tmpFilePath}`)
      await unzipFile(gzipPath, tmpFilePath)

      log(`download success, version: ${_ver}`)
      signature = ''
      return true
    } catch (error) {
      log(error as Error)
      return error as Error
    }
  }
  return updater
}

export type { FunctionCompareVersion, FunctionVerifySignature, Updater, UpdaterOption } from './types'
