import { Buffer } from 'node:buffer'
import https from 'node:https'
import type { UpdateJSON, Updater } from './types'

export function downloadJSONDefault(url: string, updater: Updater, headers: Record<string, any>) {
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
export function downloadBufferDefault(url: string, updater: Updater, headers: Record<string, any>) {
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
