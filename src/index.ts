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
 * @param updater updater instance or updater options
 * @param option options for entry, will be used to generate electron main path, default target path: `dist-electron/main/index.js`
 * @returns a function to init your application with a updater
 *
 * @example
 * **manual** generate updater
 * ```ts
 * import { initApp } from 'electron-incremental-updater'
 * import { name, repository } from '../package.json'
 *
 * const SIGNATURE_PUB = '' // auto generate RSA public key when start app
 * const updater = createUpdater({
 *   SIGNATURE_PUB,
 *   productName: name,
 *   repository,
 * })
 * initApp(name, updater)
 * ```
 * @example
 * **auto** generate updater and set update URL
 *
 * ```ts
 * import { getReleaseDnsPrefix, initApp } from 'electron-incremental-update'
 * import { name, repository } from '../package.json'
 *
 * const SIGNATURE_PUB = '' // auto generate RSA public key when start app
 *
 * const { urlPrefix } = getReleaseCdnPrefix()[0]
 * initApp(name, {
 *   SIGNATURE_PUB,
 *   repository,
 *   updateJsonURL: `https://cdn.jsdelivr.net/gh/${repository.replace('https://github.com', '')}/version.json`,
 *   releaseAsarURL: `${urlPrefix}/download/latest/${name}.asar.gz`,
 * }, {
 *  // options for main entry
 * })
 * ```
*/
export function initApp(
  productName: string,
  updater: Updater | Omit<UpdaterOption, 'productName'> & { productName?: string },
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
    const _option = updater.productName ? updater as UpdaterOption : { ...updater, productName }
    _updater = createUpdater(_option)
  } else {
    _updater = updater
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require(entry)(_updater)
}
