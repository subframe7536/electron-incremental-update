import { type IncomingMessage, net } from 'electron'
import { type UpdateJSON, isUpdateJSON } from '../utils/version'
import { waitAppReady } from '../utils/electron'
import type { OnDownloading } from './types'

async function downlaodFn<T>(
  url: string,
  headers: Record<string, any>,
  onResponse: (resp: IncomingMessage, resolve: (data: T) => void, reject: (e: any) => void) => void,
): Promise<T> {
  await waitAppReady()
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
export async function downloadUpdateJSONDefault(url: string, headers: Record<string, any>): Promise<UpdateJSON> {
  return await downlaodFn<UpdateJSON>(url, headers, (resp, resolve, reject) => {
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

export async function downloadAsarBufferDefault(
  url: string,
  headers: Record<string, any>,
  total: number,
  onDownloading?: OnDownloading,
): Promise<Buffer> {
  let transferred = 0
  let time = Date.now()
  return await downlaodFn<Buffer>(url, headers, (resp, resolve) => {
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
