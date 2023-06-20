import { EventEmitter } from 'node:events'
import type { Buffer } from 'node:buffer'
import { createVerify } from 'node:crypto'
import { createGunzip } from 'node:zlib'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { app } from 'electron'
import { compareVersionDefault, downloadBufferDefault, downloadJSONDefault } from './defaultFunctions'
import type { CheckResultType, UpdateJSON, Updater, UpdaterOption } from './types'
import { getEntryVersion } from './utils'

export function createUpdater({
  SIGNATURE_PUB,
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
  let version = ''
  const gzipPath = `../${productName}.asar.gz`
  const tmpFile = gzipPath.replace('.asar.gz', '.tmp.gz')

  const { downloadBuffer, downloadJSON, extraHeader, userAgent } = downloadConfig || {}

  function log(msg: string | Error) {
    debug && updater.emit('debug', msg)
  }

  async function download(
    url: string,
    format: 'json',
  ): Promise<UpdateJSON>
  async function download(
    url: string,
    format: 'buffer',
  ): Promise<Buffer>
  async function download(
    url: string,
    format: 'json' | 'buffer',
  ): Promise<UpdateJSON | Buffer> {
    const ua = userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'
    const headers = {
      Accept: `application/${format === 'json' ? 'json' : 'octet-stream'}`,
      UserAgent: ua,
      ...extraHeader,
    }

    log(`download headers: ${JSON.stringify(headers, null, 2)}`)

    const downloadFn = format === 'json'
      ? downloadJSON ?? downloadJSONDefault
      : downloadBuffer ?? downloadBufferDefault

    log(`download ${format} from ${url}`)
    const ret = await downloadFn(url, updater, headers)
    log(`download ${format} success`)

    return ret
  }

  async function extractFile(gzipFilePath: string) {
    if (!gzipFilePath.endsWith('.asar.gz') || !existsSync(gzipFilePath)) {
      log('update .asar.gz file not exist')
      return
    }
    gzipFilePath = gzipFilePath.replace('.asar.gz', '.tmp.gz')
    return new Promise((resolve, reject) => {
      const gunzip = createGunzip()
      const input = createReadStream(gzipFilePath)
      const outputFilePath = gzipFilePath.replace('.tmp.gz', '.asar')
      const output = createWriteStream(outputFilePath)

      log(`outputFilePath: ${outputFilePath}`)

      input
        .pipe(gunzip)
        .pipe(output)
        .on('finish', async () => {
          await rm(gzipFilePath)
          log(`${gzipFilePath} unzipped`)
          resolve(outputFilePath)
        })
        .on('error', async (err) => {
          await rm(gzipFilePath)
          output.destroy(err)
          reject(err)
        })
    })
  }

  function verify(buffer: Buffer, signature: string): boolean {
    return createVerify('RSA-SHA256')
      .update(buffer)
      .verify(SIGNATURE_PUB, signature, 'base64')
  }

  function needUpdate(version: string) {
    if (!app.isPackaged) {
      log('in dev mode, no need to update')
      return false
    }

    const currentVersion = getEntryVersion()

    log(`check update:
    current version is ${currentVersion},
    new version is ${version}`)

    const _compare = compareVersion ?? compareVersionDefault

    return _compare(currentVersion, version)
  }

  async function checkUpdate(url?: string): Promise<CheckResultType> {
    url ??= _update
    if (!url) {
      log('no updateJsonURL, fallback to use repository')
      if (!repository) {
        throw new Error('updateJsonURL or repository are not set')
      }
      url = `${repository.replace('github.com', 'raw.githubusercontent.com')}/version.json`
    }

    // remove temp file
    if (existsSync(tmpFile)) {
      log(`remove tmp file: ${tmpFile}`)
      await rm(tmpFile)
    }

    if (existsSync(gzipPath)) {
      log(`remove .gz file: ${gzipPath}`)
      await rm(gzipPath)
    }

    // fetch update json
    const json = await download(url, 'json')

    const {
      signature: _sig,
      version: _v,
      size,
    } = json

    log(`update info: ${JSON.stringify(json, null, 2)}`)

    // if not need update, return
    if (!needUpdate(_v)) {
      log(`update unavailable: ${_v}`)
      return false
    } else {
      log(`update available: ${_v}`)
      signature = _sig
      version = _v
      return { size, version }
    }
  }
  async function downloadUpdate(src?: string | Buffer): Promise<void> {
    if (typeof src !== 'object') {
      let _url = src ?? _release
      if (!_url) {
        log('no releaseAsarURL, fallback to use repository')
        if (!repository) {
          throw new Error('releaseAsarURL or repository are not set')
        }
        _url = `${repository}/releases/download/latest/${productName}.asar.gz`
      }
      // download update file buffer
      src = await download(_url, 'buffer')
    }

    // verify update file
    log('verify start')
    if (!verify(src, signature)) {
      log('verify failed')
      throw new Error('invalid signature')
    }
    log('verify success')

    // replace old file with new file
    log(`write file: ${gzipPath}`)
    await writeFile(gzipPath, src)
    log(`extract file: ${gzipPath}`)
    await extractFile(gzipPath)

    log(`update success, version: ${version}`)
    updater.emit('downloaded')
  }
  const onCheck = async (url?: string) => {
    try {
      const result = await checkUpdate(url)
      updater.emit('checkResult', result)
    } catch (error) {
      log(error as Error)
      updater.emit('checkResult', error as Error)
    }
  }
  updater.on('check', onCheck)
  updater.checkUpdate = onCheck
  const onDownload = async (src?: string | Buffer) => {
    try {
      await downloadUpdate(src)
    } catch (error) {
      log(error as Error)
      updater.emit('donwnloadError', error)
    }
  }
  updater.on('download', onDownload)
  updater.downloadUpdate = onDownload
  return updater
}

export * from './types'
export * from './utils'
