import type { Version } from '../../utils/version'
import { parseVersion } from '../../utils/version'
import type { Func } from './download'

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
