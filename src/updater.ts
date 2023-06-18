import { EventEmitter } from 'node:events'
import { Buffer } from 'node:buffer'
import { createVerify } from 'node:crypto'
import { createGunzip } from 'node:zlib'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import https from 'node:https'
import { app } from 'electron'

type CheckResultType = 'success' | 'fail' | 'unavailable'
type UpdateEvents = {
  check: null
  checkResult: [data: CheckResultType, err?: unknown]
  downloadStart: [size: number]
  downloading: [current: number]
  downloadEnd: [success: boolean]
  donwnloadError: [error: unknown]
}

export type UpdateJSON = {
  signature: string
  version: string
  size: number
}

type MaybeArray<T> = T extends undefined | null | never
  ? []
  : T extends any[]
    ? T['length'] extends 1
      ? [data: T[0]]
      : T
    : [data: T]

interface UpdateOption {
  /**
   * URL of version info json
   * @default `${repository.replace('github.com', 'raw.githubusercontent.com')}/version.json`
   * @throws if `updateJsonURL` and `repository` are all not set
   */
  updateJsonURL?: string
  /**
   * URL of release asar.gz
   * @default `${repository}/releases/download/latest/${productName}.asar.gz`
   * @throws if `releaseAsarURL` and `repository` are all not set
   */
  releaseAsarURL?: string
}
interface TypedUpdater<
  T extends Record<string | symbol, MaybeArray<any>>,
  Event extends Exclude<keyof T, number> = Exclude<keyof T, number>,
> {
  removeAllListeners<E extends Event> (event?: E): this
  listeners<E extends Event> (eventName: E): Function[]
  eventNames(): (Event)[]
  on<E extends Event>(eventName: E, listener: (...data: MaybeArray<T[E]>) => void): this
  once<E extends Event>(eventName: E, listener: (...args: MaybeArray<T[E]>) => void): this
  emit<E extends Event>(eventName: E, ...args: MaybeArray<T[E]>): boolean
  off<E extends Event>(eventName: E, listener: (...args: MaybeArray<T[E]>) => void): this
  checkUpdate(options?: UpdateOption): Promise<void>
}

export type Updater = TypedUpdater<UpdateEvents>
export interface Options extends UpdateOption {
  /**
   * public key of signature
   *
   * it will be auto generated by plugin
   * @example
   * ```ts
   * // auto filled by plugin
   * const SIGNATURE_PUB = ''
   *
   * const updater = createUpdater({
   *   SIGNATURE_PUB,
   *   ...
   * })
   * ```
   */
  SIGNATURE_PUB: string
  /**
   * product name
   *
   * you can use the `name` in `package.json`
   */
  productName: string
  /**
   * repository url, e.g. `https://github.com/electron/electron`
   *
   * you can use the `repository` in `package.json`
   *
   * if `updateJsonURL` or `releaseAsarURL` are absent,
   * `repository` will be used to determine the url
   */
  repository?: string
  downloadConfig?: {
    /**
     * download user agent
   * @default 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'
    */
    userAgent?: string
    /**
    * extra download header, `accept` and `user-agent` is set by default
   */
    extraHeader?: Record<string, string>
    /**
     * download JSON function
     * @param url download url
     * @param updater updater, emit events
     * @param header download header
     * @returns `UpdateJSON`
     */
    downloadJSON?: (url: string, updater: Updater, headers: Record<string, any>) => Promise<UpdateJSON>
    /**
     * download buffer function
     * @param url download url
     * @param updater updater, emit events
     * @param header download header
     * @returns `Buffer`
     */
    downloadBuffer?: (url: string, updater: Updater, headers: Record<string, any>) => Promise<Buffer>
  }
}

function downloadJSONDefault(url: string, updater: Updater, headers: Record<string, any>) {
  return new Promise<UpdateJSON>((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.headers = headers
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        updater.emit('downloadEnd', true)
        const json = JSON.parse(data)
        if ('signature' in json && 'version' in json && 'size' in json) {
          resolve(json)
        } else {
          throw new Error('invalid update json')
        }
      })
    }).on('error', (e) => {
      e && updater.emit('donwnloadError', e)
      updater.emit('downloadEnd', false)
      reject(e)
    })
  })
}

function downloadBufferDefault(url: string, updater: Updater, headers: Record<string, any>) {
  return new Promise<Buffer>((resolve, reject) => {
    https.get(url, (res) => {
      let data: any[] = []
      res.headers = headers
      res.on('data', (chunk) => {
        updater.emit('downloading', chunk.length)
        data.push(chunk)
      })
      res.on('end', () => {
        updater.emit('downloadEnd', true)
        resolve(Buffer.concat(data))
      })
    }).on('error', (e) => {
      e && updater.emit('donwnloadError', e)
      updater.emit('downloadEnd', false)
      reject(e)
    })
  })
}

export function createUpdater({
  SIGNATURE_PUB,
  repository,
  productName,
  releaseAsarURL: _release,
  updateJsonURL: _update,
  downloadConfig,
}: Options): Updater {
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

  async function checkUpdate(option?: UpdateOption): Promise<CheckResultType> {
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
  const onCheck = async (option?: UpdateOption) => {
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
