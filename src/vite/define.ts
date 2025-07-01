import type { ElectronWithUpdaterOptions } from './option'
import type { UserConfig, UserConfigFn } from 'vite'

import { electronWithUpdater } from './core'

type MakeOptional<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>

export interface ElectronViteHelperOptions extends MakeOptional<ElectronWithUpdaterOptions, 'isBuild'> {
  /**
   * Config for renderer process
   */
  renderer?: UserConfig
}

export function defineElectronConfig(
  options: ElectronViteHelperOptions,
): UserConfigFn {
  return ({ command }) => {
    options.isBuild ??= command === 'build'
    const electronPlugin = electronWithUpdater(options as ElectronWithUpdaterOptions)
    const result = options.renderer ?? {}
    result.plugins ??= []
    result.plugins.push(electronPlugin)
    return result
  }
}
