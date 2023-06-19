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
    log(`headers: ${headers}`)
    const downloadFn = format === 'json'
      ? downloadJSON ?? downloadJSONDefault
      : downloadBuffer ?? downloadBufferDefault
    return await downloadFn(url, updater, headers)
  }

  async function extractFile(gzipFilePath: string) {
    if (!gzipFilePath.endsWith('.asar.gz') || !existsSync(gzipFilePath)) {
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
          log('finish')
          resolve(outputFilePath)
        })
        .on('error', async (err) => {
          await rm(gzipFilePath)
          log(`error: ${err}`)
          output.destroy(err)
          reject(err)
        })
    })
  }

  function verify(buffer: Buffer, signature: string): boolean {
    log(`signature: ${signature}`)
    return createVerify('RSA-SHA256')
      .update(buffer)
      .verify(SIGNATURE_PUB, signature, 'base64')
  }

  function needUpdate(version: string) {
    if (!version || !app.isPackaged) {
      return false
    }

    const currentVersion = getEntryVersion()

    log(`currentVersion: ${currentVersion}`)
    log(`newVersion: ${version}`)

    const _compare = compareVersion ?? compareVersionDefault

    return _compare(currentVersion, version)
  }

  async function checkUpdate(url?: string): Promise<CheckResultType> {
    url ??= _update
    if (!url) {
      log('no updateJsonURL, use repository')
      if (!repository) {
        throw new Error('updateJsonURL or repository are not set')
      }
      url = `${repository.replace('github.com', 'raw.githubusercontent.com')}/version.json`
    }

    log(`updateJsonURL: ${url}`)

    // remove temp file
    if (existsSync(tmpFile)) {
      log(`remove tmp file: ${tmpFile}`)
      await rm(tmpFile)
    }

    // fetch update json
    const json = await download(url, 'json')

    const {
      signature: _sig,
      version,
      size,
    } = json

    log(`UpdateJSON: ${JSON.stringify(json, null, 2)}`)

    // if not need update, return
    if (!needUpdate(version)) {
      return false
    } else {
      signature = _sig
      return { size, version }
    }
  }
  async function downloadUpdate(src?: string | Buffer): Promise<void> {
    if (typeof src !== 'object') {
      let _url = src ?? _release
      if (!_url) {
        log('no releaseAsarURL, use repository')
        if (!repository) {
          throw new Error('releaseAsarURL or repository are not set')
        }
        _url = `${repository}/releases/download/latest/${productName}.asar.gz`
      }

      log(`releaseAsarURL: ${_url}`)

      // download update file buffer
      src = await download(_url, 'buffer')
    }

    // verify update file
    log('start verify')
    if (!verify(src, signature)) {
      throw new Error('file broken, invalid signature!')
    }

    // replace old file with new file
    log(`write file: ${gzipPath}`)
    await writeFile(gzipPath, src)
    log(`extract file: ${gzipPath}`)
    await extractFile(gzipPath)

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
