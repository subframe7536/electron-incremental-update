export interface Version {
  /**
   * `2` of `2.1.0-beta.10`
   */
  major: number
  /**
   * `1` of `2.1.0-beta.10`
   */
  minor: number
  /**
   * `0` of `2.1.0-beta.10`
   */
  patch: number
  /**
   * `beta` of `2.1.0-beta.10`
   */
  stage: string
  /**
   * `10` of `2.1.0-beta.10`
   */
  stageVersion: number
}

/**
 * Parse version string to {@link Version}, like `0.2.0-beta.1`
 * @param version version string
 */
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

/**
 * Default function to check the old version is less than new version
 * @param oldVer old version string
 * @param newVer new version string
 */
export function defaultIsLowerVersion(oldVer: string, newVer: string): boolean {
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
 * Update info json
 */
export type UpdateInfo = {
  signature: string
  minimumVersion: string
  version: string
}

/**
 * {@link UpdateInfo} with beta
 */
export type UpdateJSON = UpdateInfo & {
  beta: UpdateInfo
}

/**
 * Check is `UpdateJSON`
 * @param json any variable
 */
export function isUpdateJSON(json: any): json is UpdateJSON {
  const is = (j: any): boolean => !!(j && j.minimumVersion && j.signature && j.version)
  return is(json) && is(json?.beta)
}

/**
 * Default function to generate `UpdateJSON`
 * @param existingJson exising update json
 * @param signature sigature
 * @param version target version
 * @param minimumVersion minimum version
 */
export function defaultVersionJsonGenerator(existingJson: UpdateJSON, signature: string, version: string, minimumVersion: string): UpdateJSON {
  existingJson.beta = {
    version,
    minimumVersion,
    signature,
  }
  if (!parseVersion(version).stage) {
    existingJson.version = version
    existingJson.minimumVersion = minimumVersion
    existingJson.signature = signature
  }

  return existingJson
}
