import { resolve } from 'node:path'
import { app } from 'electron'
import type { Updater } from './updater'

export * from './utils'
export { createUpdater } from './updater'
export type { Options, Updater } from './updater'

interface PathConfig {
  /**
   * path of electron output dist
   * @default 'dist-electron'
   */
  electronDistPath?: string
  /**
   * relative path of main entry in electron dist
   * @default 'main/index.js'
   */
  mainPath?: string

}
/**
 * Initialize application
 * @param productName name of your application
 * @param updater updater
 * @param option options for entry, will be used to generate electron main path, default: `dist-electron/main/index.js`
 * @returns a function to init your application with a updater
 */
export function initApp(
  productName: string,
  updater: Updater,
  option?: PathConfig,
) {
  const {
    electronDistPath = 'dist-electron',
    mainPath = 'main/index.js',
  } = option ?? {}

  const mainDir = app.isPackaged
    ? `../${productName}.asar`
    : electronDistPath

  const entry = resolve(__dirname, mainDir, mainPath)

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require(entry)(updater)
}
