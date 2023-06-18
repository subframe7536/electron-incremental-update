import { EventEmitter } from 'node:events'
import type { Buffer } from 'node:buffer'
import { createVerify } from 'node:crypto'
import { createGunzip } from 'node:zlib'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { app } from 'electron'
import { downloadBufferDefault, downloadJSONDefault } from './download'
import type { BaseOption, CheckResultType, UpdateJSON, Updater, UpdaterOption } from './types'

export * from './types'
export * from './utils'

export function createUpdater({
  SIGNATURE_PUB,
  repository,
  productName,
  releaseAsarURL: _release,
  updateJsonURL: _update,
  downloadConfig,
}: UpdaterOption): Updater {
  // hack to make typesafe
  const updater = new EventEmitter() as unknown as Updater

  const { downloadBuffer, downloadJSON, extraHeader, userAgent } = downloadConfig || {}

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

      input
        .pipe(gunzip)
        .pipe(output)
        .on('finish', async () => {
          await rm(gzipFilePath)
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
    const parseVersion = (version: string) => {
      const [major, minor, patch] = version.split('.')
      return ~~major * 100 + ~~minor * 10 + ~~patch
    }
    return app.isPackaged
    && parseVersion(app.getVersion()) < parseVersion(version)
  }

  async function checkUpdate(option?: BaseOption): Promise<CheckResultType> {
    let {
      updateJsonURL = _update,
      releaseAsarURL = _release,
    } = option || {}

    if (!updateJsonURL || !releaseAsarURL) {
      if (!repository) {
        throw new Error('updateJsonURL or releaseAsarURL are not set')
      }
      updateJsonURL = `${repository.replace('github.com', 'raw.githubusercontent.com')}/version.json`
      releaseAsarURL = `${repository}/releases/download/latest/${productName}.asar.gz`
    }

    const gzipPath = `../${productName}.asar.gz`
    const tmpFile = gzipPath.replace('.asar.gz', '.tmp.gz')

    // remove temp file
    if (existsSync(tmpFile)) {
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

    // if not need update, return
    if (!needUpdate(version)) {
      return 'unavailable'
    }

    updater.emit('downloadStart', size)

    // download update file buffer
    const buffer = await download(releaseAsarURL, 'buffer')

    // verify update file
    if (!verify(buffer, signature)) {
      throw new Error('file broken, invalid signature!')
    }

    // replace old file with new file
    await writeFile(gzipPath, buffer)
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
