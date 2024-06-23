/**
 * parse Github CDN URL for accelerating the speed of downloading
 *
 * {@link https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L34 some public CDN links}
 */
export function parseGithubCdnURL(originRepoURL: string, cdnPrefix: string, relativeFilePath: string) {
  if (!originRepoURL.startsWith('https://github.com/')) {
    throw new Error('origin url must start with https://github.com/')
  }

  originRepoURL = originRepoURL.trim().replace(/\/?$/, '/').trim()
  relativeFilePath = relativeFilePath.trim().replace(/^\/|\/?$/g, '').trim()
  cdnPrefix = cdnPrefix.trim().replace(/^\/?|\/?$/g, '').trim()

  return originRepoURL.replace('github.com', cdnPrefix) + relativeFilePath
}

/**
 * handle all unhandled error
 * @param callback callback function
 */
export function handleUnexpectedErrors(callback: (err: unknown) => void) {
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
  const semver = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z0-9.-]+))?/i
  const match = semver.exec(version)
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

export type UpdateInfo = {
  signature: string
  minimumVersion: string
  version: string
  size: number
}

export type UpdateJSON = UpdateInfo & {
  beta: UpdateInfo
}

export function isUpdateJSON(json: any): json is UpdateJSON {
  const is = (j: any) => !!(j && j.minimumVersion && j.signature && j.size && j.version)
  return is(json) && is(json?.beta)
}
