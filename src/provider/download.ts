import { type IncomingMessage, app, net } from 'electron'
import type { Arrayable } from '@subframe7536/type-utils'
import { type UpdateJSON, isUpdateJSON } from '../utils/version'
import type { OnDownloading } from './types'

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

async function downloadFn<T>(
  url: string,
  headers: Record<string, any>,
  onResponse: (resp: IncomingMessage, resolve: (data: T) => void, reject: (e: any) => void) => void,
): Promise<T> {
  await app.whenReady()
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'follow', headers })
    request.on('response', (resp) => {
      resp.on('aborted', () => reject(new Error('aborted')))
      resp.on('error', () => reject(new Error('download error')))
      onResponse(resp, resolve, reject)
    })
    request.on('error', reject)
    request.end()
  })
}

/**
 * Default function to download json and parse to UpdateJson
 * @param url target url
 * @param headers extra headers
 */
export async function defaultDownloadUpdateJSON(url: string, headers: Record<string, any>): Promise<UpdateJSON> {
  return await downloadFn<UpdateJSON>(url, headers, (resp, resolve, reject) => {
    let data = ''
    resp.on('data', chunk => (data += chunk))
    resp.on('end', () => {
      try {
        const json = JSON.parse(data)
        if (isUpdateJSON(json)) {
          resolve(json)
        } else {
          throw Error
        }
      } catch {
        reject(new Error('invalid update json'))
      }
    })
  })
}

/**
 * Default function to download asar buffer,
 * get total size from `Content-Length` header
 * @param url target url
 * @param headers extra headers
 * @param onDownloading on downloading callback
 */
export async function defaultDownloadAsar(
  url: string,
  headers: Record<string, any>,
  onDownloading?: OnDownloading,
): Promise<Buffer> {
  let transferred = 0
  let time = Date.now()
  return await downloadFn<Buffer>(url, headers, (resp, resolve) => {
    const total = getHeader(resp.headers, 'content-length') || -1
    let data: Buffer[] = []
    resp.on('data', (chunk) => {
      const delta = chunk.length
      transferred += delta
      const current = Date.now()
      onDownloading?.({
        percent: +(transferred / total).toFixed(2) * 100,
        total,
        transferred,
        delta,
        bps: delta / ((current - time) * 1e3),
      })
      time = current
      data.push(chunk)
    })
    resp.on('end', () => resolve(Buffer.concat(data)))
  })
}
