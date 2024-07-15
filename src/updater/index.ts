import type { UpdaterOption } from './types'
import { Updater } from './core'

export * from './core'
export * from './types'
export * from './defaultFunctions/compareVersion'
export * from './defaultFunctions/download'

/**
 * create updater instance
 * @param option updater option
 * @returns updater
 */
export function createUpdater(option?: UpdaterOption) {
  return new Updater(option)
}
