import { resolve } from 'node:path'
import { app } from 'electron'
import type { Updater, UpdaterOption } from './updater/types'
import { createUpdater } from './updater'

export * from './updater'

export type AppOption = {
  /**
   * name of your application
  *
   * you can use the `name` in `package.json`
  */
  name: string
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
type OptionalProperty<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type InitUpdaterOptions = OptionalProperty<UpdaterOption, 'productName'>

/**
 * create updater manually
 * @example
 * ```ts
 * import { createUpdater, getGithubReleaseCdnGroup, initApp, parseGithubCdnURL } from 'electron-incremental-update'
 * import { name, repository } from '../package.json'
 *
 * const SIGNATURE_PUB = '' // auto generate
 *
 * const { cdnPrefix } = getGithubReleaseCdnGroup()[0]
 * const updater = createUpdater({
 *   SIGNATURE_PUB,
 *   productName: name,
 *   repository,
 *   updateJsonURL: parseGithubCdnURL(repository, 'fastly.jsdelivr.net/gh', 'version.json'),
 *   releaseAsarURL: parseGithubCdnURL(repository, cdnPrefix, `download/latest/${name}.asar.gz`),
 *   debug: true,
 * })
 * initApp({ name }).setUpdater(updater)
 * ```
 */
export function initApp(
  appOptions: AppOption,
): { setUpdater: (updater: Updater) => void }
/**
 * create updater when init, no need to set productName
 *
 * @example
 * ```ts
 * import { initApp } from 'electron-incremental-update'
 * import { name, repository } from '../package.json'
 *
 * const SIGNATURE_PUB = '' // auto generate
 *
 * initApp({ name }, { SIGNATURE_PUB, repository })
 * ```
 */
export function initApp(
  appOptions: AppOption,
  updaterOptions: InitUpdaterOptions,
): undefined
export function initApp(
  appOptions: AppOption,
  updaterOptions?: InitUpdaterOptions,
) {
  const {
    name: productName,
    electronDistPath = 'dist-electron',
    mainPath = 'main/index.js',
  } = appOptions ?? { }

  const mainDir = app.isPackaged
    ? `../${productName}.asar`
    : electronDistPath

  const entry = resolve(__dirname, mainDir, mainPath)

  if (updaterOptions) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    require(entry)(
      createUpdater({ ...updaterOptions, productName }),
    )
  } else {
    return {
      setUpdater(updater: Updater) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        require(entry)(updater)
      },
    }
  }
}
