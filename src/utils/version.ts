export interface Version {
  major: number
  minor: number
  patch: number
  stage: string
  stageVersion: number
}
export function parseVersion(version: string): Version {
  const semver = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9\.-]+))?/i
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
