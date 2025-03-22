import type { DownloadingInfo } from '../provider/types'
import type { UpdateJSON } from './version'
import type { Arrayable } from '@subframe7536/type-utils'
import type { IncomingMessage } from 'electron'

import electron from 'electron'

import { isUpdateJSON } from './version'

/**
 * Safe get value from header
 * @param headers response header
 * @param key target header key
 */
export function getHeader(headers: Record<string, Arrayable<string>>, key: any): any {
  const value = headers[key]
  if (Array.isArray(value)) {
    return value.length === 0 ? null : value[value.length - 1]
  } else {
    return value
  }
}

export async function downloadUtil<T>(
  url: string,
  headers: Record<string, any>,
  onResponse: (req: Electron.ClientRequest, resp: IncomingMessage, resolve: (data: T) => void, reject: (e: any) => void) => void,
): Promise<T> {
  await electron.app.whenReady()
  return new Promise((resolve, reject) => {
    /// keep-sorted
    const request = electron.net.request({
      cache: 'no-cache',
      headers,
      method: 'GET',
      redirect: 'follow',
      url,
    })
    request.on('response', (resp) => {
      resp.on('aborted', () => reject(new Error('Aborted')))
      resp.on('error', reject)
      onResponse(request, resp, resolve, reject)
    })
    request.on('error', reject)
    request.end()
  })
}

type ResolveDataFn = (data: string, resolve: (data: any) => void, reject: (e: any) => void) => void

/**
 * trim length to 5000
 */
function trimData(data: string): string {
  return data.trim().slice(0, 5e3).replace(/\s+/g, ' ')
}

const defaultResolveDataFn: ResolveDataFn = (data, resolve, reject) => {
  try {
    resolve(JSON.parse(data))
  } catch {
    reject(new Error(`Invalid json, "${trimData(data)}"`))
  }
}

/**
 * Default function to download json and parse to UpdateJson
 * @param url target url
 * @param headers extra headers
 * @param signal abort signal
 * @param resolveData on resolve
 */
export async function defaultDownloadJSON<T>(
  url: string,
  headers: Record<string, any>,
  signal: AbortSignal,
  resolveData: ResolveDataFn = defaultResolveDataFn,
): Promise<T> {
  return await downloadUtil<T>(
    url,
    headers,
    (request, resp, resolve, reject) => {
      let data = ''
      resp.on('data', chunk => (data += chunk))
      resp.on('end', () => resolveData(data, resolve, reject))
      signal.addEventListener('abort', () => {
        request.abort()
        data = null!
      }, { once: true })
    },
  )
}
/**
 * Default function to download json and parse to UpdateJson
 * @param url target url
 * @param headers extra headers
 * @param signal abort signal
 */
export async function defaultDownloadUpdateJSON(url: string, headers: Record<string, any>, signal: AbortSignal): Promise<UpdateJSON> {
  return await defaultDownloadJSON<UpdateJSON>(
    url,
    headers,
    signal,
    (data, resolve, reject) => {
      try {
        const json = JSON.parse(data)
        if (isUpdateJSON(json)) {
          resolve(json)
        } else {
          throw Error
        }
      } catch {
        reject(new Error(`Invalid update json, "${trimData(data)}"`))
      }
    },
  )
}

/**
 * Default function to download asar buffer,
 * get total size from `Content-Length` header
 * @param url target url
 * @param headers extra headers
 * @param signal abort signal
 * @param onDownloading on downloading callback
 */
export async function defaultDownloadAsar(
  url: string,
  headers: Record<string, any>,
  signal: AbortSignal,
  onDownloading?: (progress: DownloadingInfo) => void,
): Promise<Buffer> {
  let transferred = 0
  let time = Date.now()
  return await downloadUtil<Buffer>(
    url,
    headers,
    (request, resp, resolve) => {
      const total = +getHeader(resp.headers, 'content-length') || -1
      let data: Buffer[] = []
      resp.on('data', (chunk) => {
        const delta = chunk.length
        transferred += delta
        const current = Date.now()
        /// keep-sorted
        onDownloading?.({
          bps: delta / (current - time),
          delta,
          percent: total > 0 ? +(transferred / total).toFixed(2) * 100 : -1,
          total,
          transferred,
        })
        time = current
        data.push(chunk)
      })
      resp.on('end', () => resolve(Buffer.concat(data)))
      signal.addEventListener('abort', () => {
        request.abort()
        data.length = 0
        data = null!
      }, { once: true })
    },
  )
}
