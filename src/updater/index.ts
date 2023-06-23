import { EventEmitter } from 'node:events'
import { Buffer } from 'node:buffer'
import { createGunzip } from 'node:zlib'
import { createReadStream, createWriteStream, existsSync, rmSync } from 'node:fs'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app } from 'electron'
import { verify } from '../crypto'
import { compareVersionDefault, downloadBufferDefault, downloadJSONDefault } from './defaultFunctions'
import type { CheckResultType, InstallResult, UpdateJSON, Updater, UpdaterOption } from './types'
import { isUpdateJSON } from './types'
import { getEntryVersion, getProductAsarPath } from './utils'

export function createUpdater({
  SIGNATURE_CERT,
  repository,
  productName,
  releaseAsarURL: _release,
  updateJsonURL: _update,
  debug = false,
  downloadConfig,
  compareVersion,
}: UpdaterOption): Updater {
  // hack to make typesafe
  const updater = new EventEmitter() as unknown as Updater

  let signature = ''
  // asar path will not be used until in production mode, so the path will always correct
  const asarPath = getProductAsarPath(productName)
  const gzipPath = `${asarPath}.gz`
  const tmpFilePath = gzipPath.replace('.asar.gz', '.tmp.asar')

  const { downloadBuffer, downloadJSON, extraHeader, userAgent } = downloadConfig || {}

  function log(msg: string | Error) {
    debug && updater.emit('debug', msg)
  }

  async function extractFile() {
    if (!gzipPath.endsWith('.asar.gz') || !existsSync(gzipPath)) {
      throw new Error('.asar.gz file not exist')
    }

    return new Promise((resolve, reject) => {
      const gunzip = createGunzip()
      const input = createReadStream(gzipPath)
      const output = createWriteStream(tmpFilePath)

      log(`outputFilePath: ${tmpFilePath}`)

      input
        .pipe(gunzip)
        .pipe(output)
        .on('finish', async () => {
          await rm(gzipPath)
          log(`${gzipPath} unzipped`)
          resolve(null)
        })
        .on('error', async (err) => {
          await rm(gzipPath)
          output.destroy(err)
          reject(err)
        })
    })
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
  ): Promise<Buffer>
  async function parseData(
    format: 'json' | 'buffer',
    data?: string | Buffer | UpdateJSON,
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
            repoFallback: `${repository}/releases/download/latest/${productName}.asar.gz`,
            fn: downloadBuffer ?? downloadBufferDefault,
          }
      data ??= info.url
      if (!data) {
        log(`no ${info.name}, fallback to use repository`)
        if (!repository) {
          throw new Error(`${info.name} or repository are not set`)
        }
        data = info.repoFallback
      }
      // fetch data from remote
      log(`download ${format} from ${data}`)
      const ret = await info.fn(data, updater, headers)
      log(`download ${format} success`)
      return ret
    } else {
      throw new Error(`invalid type at format '${format}': ${data}`)
    }
  }

  updater.checkUpdate = async (data?: string | UpdateJSON): Promise<CheckResultType> => {
    try {
      const { signature: _sig, size, version } = await parseData('json', data)
      log(`checked version: ${version}, size: ${size}, signature: ${_sig}`)

      // if not need update, return
      if (!needUpdate(version)) {
        log(`update unavailable: ${version}`)
        return undefined
      } else {
        log(`update available: ${version}`)
        signature = _sig
        return { size, version }
      }
    } catch (error) {
      log(error as Error)
      return error as Error
    }
  }
  updater.downloadAndInstall = async (data?: string | Buffer, sig?: string): Promise<InstallResult> => {
    try {
      const _sig = sig ?? signature
      if (!_sig) {
        throw new Error('signature are not set, please checkUpdate first or set the second parameter')
      }
      const buffer = await parseData('buffer', data)

      // verify update file
      log('verify start')
      const version = verify(buffer, _sig, SIGNATURE_CERT)
      if (!version) {
        throw new Error('verify failed, invalid signature')
      }
      log('verify success')
      if (!needUpdate(version)) {
        throw new Error(`update unavailable: ${version}`)
      }

      // write file
      log(`write file: ${gzipPath}`)
      await writeFile(gzipPath, buffer)
      // extract file to tmp path
      log(`extract file: ${gzipPath}`)
      await extractFile()

      // check asar version
      const asarVersion = await readFile(resolve(tmpFilePath, 'version'), 'utf8')

      if (asarVersion !== version) {
        rmSync(tmpFilePath)
        throw new Error(`update failed: asar version is ${asarVersion}, but it should be ${version}`)
      } else {
        await rename(tmpFilePath, asarPath)
      }

      log(`update success, version: ${version}`)
      signature = ''
      return true
    } catch (error) {
      log(error as Error)
      return error as Error
    }
  }
  return updater
}

export * from './types'
export * from './utils'
