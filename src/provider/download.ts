import { type IncomingMessage, app, net } from 'electron'
import type { Arrayable } from '@subframe7536/type-utils'
import { type UpdateJSON, isUpdateJSON } from '../utils/version'
import type { OnDownloading } from './types'

export function getHeader(response: Record<string, Arrayable<string>>, headerKey: any): any {
  const value = response.headers[headerKey]
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
    const request = net.request({ url, method: 'GET', redirect: 'follow' })
    Object.keys(headers).forEach(key => request.setHeader(key, headers[key]))
    request.on('response', (resp) => {
      resp.on('aborted', () => reject(new Error('aborted')))
      resp.on('error', () => reject(new Error('download error')))
      onResponse(resp, resolve, reject)
    })
    request.on('error', reject)
    request.end()
  })
}
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
      transferred += chunk.length
      const current = Date.now()
      onDownloading?.({
        percent: +(transferred / total).toFixed(2) * 100,
        total,
        transferred,
        delta: chunk.length,
        bps: chunk.length / ((current - time) * 1e3),
      })
      time = current
      data.push(chunk)
    })
    resp.on('end', () => resolve(Buffer.concat(data)))
  })
}
