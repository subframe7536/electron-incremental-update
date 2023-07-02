import { EventEmitter } from 'node:events'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { app } from 'electron'
import { verify } from '../crypto'
import { getEntryVersion, getProductAsarPath, unzipFile } from '../utils'
import { compareVersionDefault, downloadBufferDefault, downloadJSONDefault } from './defaultFunctions'
import type { CheckResultType, InstallResult, UpdateJSON, Updater, UpdaterOption } from './types'
import { isUpdateJSON } from './types'

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
  let _debug = debug

  const asarPath = getProductAsarPath(productName)
  const gzipPath = `${asarPath}.gz`
  const tmpFilePath = `${asarPath}.tmp`

  function log(msg: string | Error) {
    _debug && updater.emit('debug', msg)
  }

  function needUpdate(version: string) {
    if (!app.isPackaged) {
      log('in dev mode, no need to update')
      return false
    }

    const currentVersion = getEntryVersion()
    log(`check update: current version is ${currentVersion}, new version is ${version}`)

    const _compare = compareVersion ?? compareVersionDefault
    return _compare(currentVersion, version)
  }

  async function parseData(
    format: 'json',
    data?: string | UpdateJSON,
  ): Promise<UpdateJSON>
  async function parseData(
    format: 'buffer',
    data?: string | Buffer,
    version?: string
  ): Promise<Buffer>
  async function parseData(
    format: 'json' | 'buffer',
    data?: string | Buffer | UpdateJSON,
    version?: string,
  ) {
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
        throw new Error(`invalid type at format '${format}': ${data}`)
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
      return ret
    } else {
      throw new Error(`invalid type at format '${format}': ${data}`)
    }
  }
  updater.productName = productName
  updater.setDebugMode = (isDebug: boolean) => _debug = isDebug
  updater.checkUpdate = async (data?: string | UpdateJSON): Promise<CheckResultType> => {
    try {
      const { signature: _sig, size, version: _ver } = await parseData('json', data)
      log(`checked version: ${_ver}, size: ${size}, signature: ${_sig}`)

      // if not need update, return
      if (!needUpdate(_ver)) {
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
  updater.download = async (data?: string | Buffer, sig?: string): Promise<InstallResult> => {
    try {
      const _sig = sig ?? signature
      if (!_sig) {
        throw new Error('signature are not set, please checkUpdate first or set the second parameter')
      }
      const buffer = await parseData('buffer', data, version)

      // verify update file
      log('verify start')
      const _verify = verifySignaure ?? verify
      const _ver = _verify(buffer, _sig, SIGNATURE_CERT)
      if (!_ver) {
        throw new Error('verify failed, invalid signature')
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

export type { FunctionCompareVersion, FunctionVerifySignature, UpdateJSON, Updater, UpdaterOption } from './types'
