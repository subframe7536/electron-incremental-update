import type { UpdaterOption } from './types'
import { Updater } from './core'

/**
 * create updater instance
 * @param option updater option
 * @returns updater
 */
export function createUpdater(option?: UpdaterOption) {
  return new Updater(option)
}

export * from './core'
export * from './types'
