import { net } from 'electron'
import type { Version } from '../utils/version'
import { parseVersion } from '../utils/version'
import { isUpdateJSON } from '../updateJson'
import { waitAppReady } from '../utils/utils'
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
export const compareVersionDefault: Func['compareVersion'] = (version1, version2) => {
  const oldV = parseVersion(version1)
  const newV = parseVersion(version2)

  function compareStrings(str1: string, str2: string): boolean {
    if (str1 === '') {
      return str2 !== ''
    } else if (str2 === '') {
      return true
    }
    return str1 < str2
  }

  for (let key of Object.keys(oldV) as Extract<keyof Version, string>[]) {
    if (key === 'stage' && compareStrings(oldV[key], newV[key])) {
      return true
    } else if (oldV[key] !== newV[key]) {
      return oldV[key] < newV[key]
    }
  }

  return false
}
