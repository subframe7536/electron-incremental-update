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
        try {
          const json = JSON.parse(data)
          if ('signature' in json && 'version' in json && 'size' in json) {
            resolve(json)
          } else {
            throw new Error('invalid json')
          }
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', (e) => {
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
        resolve(Buffer.concat(data))
      })
    }).on('error', (e) => {
      reject(e)
    })
  })
}
export function compareVersionDefault(oldVersion: string, newVersion: string): boolean {
  if (!oldVersion || !newVersion) {
    throw new TypeError('invalid version')
  }

  const parseVersion = (version: string) => {
    const [versionNumber, stage] = version.split('-')
    const [major, minor, patch] = versionNumber.split('.').map(Number)

    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
      throw new TypeError('invalid version')
    }

    return { major, minor, patch, stage }
  }

  const oldV = parseVersion(oldVersion)
  const newV = parseVersion(newVersion)

  if (
    oldV.major < newV.major
    || (oldV.major === newV.major && oldV.minor < newV.minor)
    || (oldV.major === newV.major && oldV.minor === newV.minor && oldV.patch < newV.patch)
  ) {
    return true
  }

  if (oldV.stage < newV.stage || (!newV.stage && oldV.stage)) {
    return true
  }

  return false
}
