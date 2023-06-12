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

interface CheckUpdateOption {
  updateJsonURL?: string
  releaseCdnPrefix?: string
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
  checkUpdate(options?: CheckUpdateOption): Promise<void>
}

export type Updater = TypedUpdater<UpdateEvents>
export interface Options extends CheckUpdateOption {
  SIGNATURE_PUB: string
  productName: string
  githubRepository: string
}

export function createUpdater({
  SIGNATURE_PUB,
  githubRepository,
  productName,
  releaseCdnPrefix: _release,
  updateJsonURL: _update,
}: Options): Updater {
  // hack to make typesafe
  const updater = new EventEmitter() as unknown as Updater

  async function download<T>(
    url: string,
    format: 'json',
  ): Promise<T>
  async function download(
    url: string,
    format: 'buffer',
  ): Promise<Buffer>
  async function download<T>(
    url: string,
    format: 'json' | 'buffer',
  ): Promise<T | Buffer> {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'

    return await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (format === 'json') {
          let data = ''
          res.setEncoding('utf8')
          res.headers = {
            Accept: 'application/json',
            UserAgent: ua,
          }
          res.on('data', chunk => (data += chunk))
          res.on('end', () => {
            resolve(JSON.parse(data))
          })
        } else if (format === 'buffer') {
          let data: any[] = []
          res.headers = {
            Accept: 'application/octet-stream',
            UserAgent: ua,
          }
          res.on('data', (chunk) => {
            updater.emit('downloading', chunk.length)
            data.push(chunk)
          })
          res.on('end', () => {
            updater.emit('downloadEnd', true)
            resolve(Buffer.concat(data))
          })
        }
      }).on('error', (e) => {
        e && updater.emit('donwnloadError', e)
        reject(e)
      })
    })
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

  async function checkUpdate(option?: CheckUpdateOption): Promise<CheckResultType> {
    const { releaseCdnPrefix, updateJsonURL } = option || {}

    const gzipPath = `../${productName}.asar.gz`
    const tmpFile = gzipPath.replace('.asar.gz', '.tmp.gz')
    const base = githubRepository.replace('https://github.com', '')

    const updateJSONUrl = updateJsonURL ?? _update ?? `https://cdn.jsdelivr.net/gh/${base}/version.json`

    const prefix = releaseCdnPrefix ?? _release
    const downloadUrl = `${prefix ? `${prefix}/${base}` : githubRepository}/releases/download/latest/${productName}.asar.gz`

    // remove temp file
    if (existsSync(tmpFile)) {
      await rm(tmpFile)
    }

    // fetch update json
    const json = await download<UpdateJSON>(updateJSONUrl, 'json')

    if (!json) {
      throw new Error('fetch update json failed')
    }

    const {
      signature,
      version,
      size,
    } = json

    console.log(version, size, signature)

    // if not need update, return
    if (!needUpdate(version)) {
      return 'unavailable'
    }

    updater.emit('downloadStart', size)

    // download update file buffer
    const buffer = await download(downloadUrl, 'buffer')

    // verify update file
    if (!verify(buffer, signature)) {
      throw new Error('file broken, invalid signature!')
    }

    // replace old file with new file
    await writeFile(gzipPath, buffer)
    await extractFile(gzipPath)

    return 'success'
  }
  const onCheck = async (option?: CheckUpdateOption) => {
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
