import { Buffer } from 'node:buffer'
import { net } from 'electron'
import { parseVersion, waitAppReady } from '../utils'
import { isUpdateJSON } from '../updateJson'
import type { UpdaterOverrideFunctions } from './types'

type Func = Required<UpdaterOverrideFunctions>

export const downloadJSONDefault: Func['downloadJSON'] = async (url, headers) => {
  await waitAppReady()
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method: 'GET',
      redirect: 'follow',
    })
    Object.keys(headers).forEach((key) => {
      request.setHeader(key, headers[key])
    })
    request.on('response', (res) => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (isUpdateJSON(json)) {
            resolve(json)
          } else {
            throw Error
          }
        } catch (e) {
          reject(new Error('invalid json'))
        }
      })
    })
    request.on('error', (e) => {
      reject(e)
    })
    request.end()
  })
}

export const downloadBufferDefault: Func['downloadBuffer'] = async (url, headers, total, onDownloading) => {
  await waitAppReady()
  let current = 0
  return new Promise<Buffer>((resolve, reject) => {
    const request = net.request({
      url,
      method: 'GET',
      redirect: 'follow',
    })
    Object.keys(headers).forEach((key) => {
      request.setHeader(key, headers[key])
    })
    request.on('response', (res) => {
      let data: any[] = []
      res.on('data', (chunk) => {
        current += chunk.length
        onDownloading?.({
          percent: `${+((current / total).toFixed(2)) * 100}%`,
          total,
          current,
        })
        data.push(chunk)
      })
      res.on('end', () => {
        resolve(Buffer.concat(data))
      })
    }).on('error', (e) => {
      reject(e)
    })
    request.end()
  })
}
export const compareVersionDefault: Func['compareVersion'] = (oldVersion, newVersion) => {
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
