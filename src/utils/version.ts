/**
 * handle all unhandled error
 * @param callback callback function
 */
export function handleUnexpectedErrors(callback: (err: unknown) => void): void {
  process.on('uncaughtException', callback)
  process.on('unhandledRejection', callback)
}

export interface Version {
  major: number
  minor: number
  patch: number
  stage: string
  stageVersion: number
}

export function parseVersion(version: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z0-9.-]+))?/i.exec(version)
  if (!match) {
    throw new TypeError(`invalid version: ${version}`)
  }
  const [major, minor, patch] = match.slice(1, 4).map(Number)
  const ret = {
    major,
    minor,
    patch,
    stage: '',
    stageVersion: -1,
  }
  if (match[4]) {
    let [stage, _v] = match[4].split('.')
    ret.stage = stage
    ret.stageVersion = Number(_v) || -1
  }
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch) || Number.isNaN(ret.stageVersion)) {
    throw new TypeError(`invalid version: ${version}`)
  }
  return ret
}

export function isLowerVersionDefault(oldVer: string, newVer: string): boolean {
  const oldV = parseVersion(oldVer)
  const newV = parseVersion(newVer)

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

/**
 * update info json
 */
export type UpdateInfo = {
  signature: string
  minimumVersion: string
  version: string
  size: number
}

/**
 * {@link UpdateInfo} with beta
 */
export type UpdateJSON = UpdateInfo & {
  beta: UpdateInfo
}

export function isUpdateJSON(json: any): json is UpdateJSON {
  const is = (j: any): boolean => !!(j && j.minimumVersion && j.signature && j.size && j.version)
  return is(json) && is(json?.beta)
}
