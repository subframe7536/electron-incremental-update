import { type IncomingMessage, net } from 'electron'
import { type UpdateJSON, isUpdateJSON, waitAppReady } from '../../utils'
import type { UpdaterOverrideFunctions } from '../types'

export type Func = Required<UpdaterOverrideFunctions>

async function downlaodFn<T>(
  url: string,
  headers: Record<string, any>,
  onResponse: (resp: IncomingMessage, resolve: (data: T) => void, reject: (e: any) => void) => void,
): Promise<T> {
  await waitAppReady()
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'follow' })
    Object.keys(headers).forEach(key => request.setHeader(key, headers[key]))
    request.on('response', res => onResponse(res, resolve, reject))
    request.on('error', reject)
    request.end()
  })
}
export const downloadJSONDefault: Func['downloadJSON'] = async (url, headers) => {
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
      } catch (ignore) {
        reject(new Error('invalid update json'))
      }
    })
    resp.on('aborted', () => reject(new Error('aborted')))
    resp.on('error', () => reject(new Error('download error')))
  })
}

export const downloadBufferDefault: Func['downloadBuffer'] = async (url, headers, total, onDownloading) => {
  let current = 0
  return await downlaodFn<Buffer>(url, headers, (resp, resolve, reject) => {
    let data: any[] = []
    resp.on('data', (chunk) => {
      current += chunk.length
      onDownloading?.({ percent: `${+((current / total).toFixed(2)) * 100}%`, total, current })
      data.push(chunk)
    })
    resp.on('end', () => resolve(Buffer.concat(data)))
    resp.on('aborted', () => reject(new Error('aborted')))
    resp.on('error', () => reject(new Error('download error')))
  })
}
