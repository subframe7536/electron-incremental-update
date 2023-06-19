import { EventEmitter } from 'node:events'
import type { Buffer } from 'node:buffer'
import { createVerify } from 'node:crypto'
import { createGunzip } from 'node:zlib'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { app } from 'electron'
import { compareVersionDefault, downloadBufferDefault, downloadJSONDefault } from './defaultFunctions'
import type { BaseOption, CheckResultType, UpdateJSON, Updater, UpdaterOption } from './types'
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

  const { downloadBuffer, downloadJSON, extraHeader, userAgent } = downloadConfig || {}

  function log(...args: any[]) {
    debug && console.log(...args)
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
    log('[updater] headers', headers)
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

      log('[updater] outputFilePath', outputFilePath)

      input
        .pipe(gunzip)
        .pipe(output)
        .on('finish', async () => {
          await rm(gzipFilePath)
          log('[updater] finish')
          resolve(outputFilePath)
        })
        .on('error', async (err) => {
          await rm(gzipFilePath)
          log('[updater] error', err)
          output.destroy(err)
          reject(err)
        })
    })
  }

  function verify(buffer: Buffer, signature: string): boolean {
    log('[updater] signature', signature)
    return createVerify('RSA-SHA256')
      .update(buffer)
      .verify(SIGNATURE_PUB, signature, 'base64')
  }
  function needUpdate(version: string) {
    if (!version || !app.isPackaged) {
      return false
    }

    const currentVersion = getEntryVersion()

    log('[updater] currentVersion', currentVersion)
    log('[updater] newVersion', version)

    const _compare = compareVersion ?? compareVersionDefault

    return _compare(currentVersion, version)
  }
  async function checkUpdate(option?: BaseOption): Promise<CheckResultType> {
    let {
      updateJsonURL = _update,
      releaseAsarURL = _release,
    } = option || {}

    if (!updateJsonURL || !releaseAsarURL) {
      log('[updater] no updateJsonURL or releaseAsarURL, use repository')
      if (!repository) {
        throw new Error('updateJsonURL or releaseAsarURL are not set')
      }
      updateJsonURL = `${repository.replace('github.com', 'raw.githubusercontent.com')}/version.json`
      releaseAsarURL = `${repository}/releases/download/latest/${productName}.asar.gz`
    }

    log('[updater] updateJsonURL', updateJsonURL)
    log('[updater] releaseAsarURL', releaseAsarURL)

    const gzipPath = `../${productName}.asar.gz`
    const tmpFile = gzipPath.replace('.asar.gz', '.tmp.gz')

    // remove temp file
    if (existsSync(tmpFile)) {
      log('[updater] remove tmp file', tmpFile)
      await rm(tmpFile)
    }

    // fetch update json
    const json = await download(updateJsonURL, 'json')

    if (!json) {
      throw new Error('fetch update json failed')
    }

    const {
      signature,
      version,
      size,
    } = json

    log('[updater] UpdateJSON', json)

    // if not need update, return
    if (!needUpdate(version)) {
      return 'unavailable'
    }

    updater.emit('downloadStart', size)

    // download update file buffer
    const buffer = await download(releaseAsarURL, 'buffer')

    // verify update file
    log('[updater] start verify')
    if (!verify(buffer, signature)) {
      throw new Error('file broken, invalid signature!')
    }

    // replace old file with new file
    log('[updater] write file', gzipPath)
    await writeFile(gzipPath, buffer)
    log('[updater] extract file', gzipPath)
    await extractFile(gzipPath)

    return 'success'
  }
  const onCheck = async (option?: BaseOption) => {
    try {
      const result = await checkUpdate(option)
      updater.emit('checkResult', result)
    } catch (error) {
      updater.emit('checkResult', 'fail', error)
    }
  }
  updater.on('check', onCheck)
  updater.checkUpdate = onCheck
  return updater
}

export * from './types'
export * from './utils'
