import { resolve } from 'node:path'
import { app } from 'electron'
import type { Updater, UpdaterOption } from './updater/types'
import { createUpdater } from './updater'

export * from './updater'

interface AppOption {
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
 * @param updater updater instance or options
 * @param option options for entry, will be used to generate electron main path, default target path: `dist-electron/main/index.js`
 * @returns a function to init your application with a updater
*/
export function initApp(
  productName: string,
  updater: Updater | UpdaterOption & { productName?: string },
  option?: AppOption,
) {
  const {
    electronDistPath = 'dist-electron',
    mainPath = 'main/index.js',
  } = option ?? { }

  const mainDir = app.isPackaged
    ? `../${productName}.asar`
    : electronDistPath

  const entry = resolve(__dirname, mainDir, mainPath)

  let _updater: Updater | undefined

  if ('SIGNATURE_PUB' in updater) {
    _updater = createUpdater({ ...updater, productName })
  } else {
    _updater = updater
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require(entry)(_updater)
}
