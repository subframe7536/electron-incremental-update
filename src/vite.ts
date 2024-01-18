import { resolve } from 'node:path'
import { rmSync } from 'node:fs'
import { type InlineConfig, createLogger, mergeConfig, normalizePath } from 'vite'
import type { ElectronSimpleOptions } from 'vite-plugin-electron/simple'
import type { Prettify } from '@subframe7536/type-utils'
import { notBundle } from 'vite-plugin-electron/plugin'
import { buildAsar, buildEntry, buildVersion } from './build-plugins/build'
import type { ElectronUpdaterOptions, PKG } from './build-plugins/option'
import { parseOptions } from './build-plugins/option'

type MakeRequired<T, K extends keyof T> = Exclude<T, undefined> & { [P in K]-?: T[P] }
type ReplaceKey<
  T,
  Key extends keyof T,
  NewKey extends string,
> = Omit<T, Key> & { [P in NewKey]: T[Key] }

type MakeRequiredAndReplaceKey<
  T,
  K extends keyof T,
  NewKey extends string,
> = MakeRequired<ReplaceKey<T, K, NewKey>, NewKey>

export type BuildElectronPluginOptions = {
  /**
   * whether is in build mode
   * ```ts
   * export default defineConfig(({ command }) => {
   *   const isBuild = command === 'build'
   * })
   * ```
   */
  isBuild: boolean
  /**
   * name, version and main in `package.json`
   * ```ts
   * import pkg from './package.json'
   * ```
   */
  pkg: PKG
  /**
   * main options
   */
  main: Prettify<
    MakeRequiredAndReplaceKey<ElectronSimpleOptions['main'], 'entry', 'files'>
  >
  /**
   * preload options
   */
  preload: Prettify<
    MakeRequiredAndReplaceKey<Exclude<ElectronSimpleOptions['preload'], undefined>, 'input', 'files'>
  >
  /**
   * updater options
   */
  updater?: ElectronUpdaterOptions
  /**
   * use debug helper in main, for `.vscode/.debug.script.mjs`, call after custom `onstart`
   * @default true
   */
  useDebugOnStart?: boolean
  /**
   * use NotBundle() plugin in main
   * @default true
   */
  useNotBundle?: boolean
  /**
   * Whether to log parsed options
   */
  logParsedOptions?: boolean
}

const id = 'electron-incremental-updater'

/**
 * build options for `vite-plugin-electron/simple`
 * - integrate with updater
 * - only contains `main` and `preload` configs
 * - remove old electron files
 * - externalize dependencies
 * - other configs of {@link https://github.com/electron-vite/electron-vite-vue/blob/main/vite.config.ts electron-vite-vue template}
 * - no `vite-plugin-electron-renderer` config
 *
 * you can override all the configs
 *
 * Limitation: entry file change cannot trigger auto restart
 *
 * @example
 * import { defineConfig } from 'vite'
 * import electronSimple from 'vite-plugin-electron/simple'
 * import { buildElectronPluginOptions } from 'electron-incremental-update/vite'
 * import pkg from './package.json'
 *
 * export default defineConfig(({ command }) => {
 *   const electronOptions = buildElectronPluginOptions({
 *     isBuild: command === 'build',
 *     pkg,
 *     main: {
 *       files: ['./electron/main/index.ts', './electron/main/worker.ts'],
 *     },
 *     preload: {
 *       files: './electron/preload/index.ts',
 *     },
 *   })
 *   return {
 *     plugins: [electronSimple(electronOptions)],
 *     server: process.env.VSCODE_DEBUG && (() => {
 *       const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
 *       return { host: url.hostname, port: +url.port }
 *     })()
 *   }
 * })
 */
export function buildElectronPluginOptions(options: BuildElectronPluginOptions): ElectronSimpleOptions {
  const log = createLogger('info', { prefix: `[${id}]` })
  const {
    isBuild,
    pkg,
    main: _main,
    preload: _preload,
    updater = {},
    useDebugOnStart = true,
    useNotBundle = true,
    logParsedOptions = false,
  } = options
  const _options = parseOptions(updater, isBuild, pkg)

  rmSync(_options.buildAsarOption.electronDistPath, { recursive: true, force: true })
  log.info(`remove old electron files in '${_options.buildAsarOption.electronDistPath}'`)

  const { buildAsarOption, buildEntryOption, buildVersionOption } = _options
  const { entryPath, entryOutputPath } = buildEntryOption

  const sourcemap = isBuild || !!process.env.VSCODE_DEBUG

  if (resolve(normalizePath(pkg.main)) !== resolve(normalizePath(entryOutputPath))) {
    throw new Error(`wrong entry path: \nin package.json: "${pkg.main}"\nin vite config: "${entryOutputPath}"`)
  }

  // todo: reload when `entryPath` changes
  let isInit = false
  const _buildEntry = async () => {
    if (!isInit) {
      isInit = true
      await buildEntry(buildEntryOption)
      log.info(`build entry from '${entryPath}' to '${entryOutputPath}'`, { timestamp: true })
    }
  }

  const result: ElectronSimpleOptions = {
    main: {
      entry: _main.files,
      onstart: async (args) => {
        _buildEntry()
        _main.onstart?.(args)

        if (useDebugOnStart) {
          process.env.VSCODE_DEBUG
            // For `.vscode/.debug.script.mjs`
            ? console.log('[startup] Electron App')
            : args.startup()
        }
      },
      vite: mergeConfig<InlineConfig, InlineConfig>(
        {
          plugins: useNotBundle
            ? [notBundle()]
            : [],
          build: {
            sourcemap,
            minify: isBuild,
            outDir: `${buildAsarOption.electronDistPath}/main`,
            rollupOptions: {
              external: Object.keys('dependencies' in pkg ? pkg.dependencies as object : {}),
            },
          },
        },
        _main.vite ?? {},
      ),
    },
    preload: {
      input: _preload.files,
      onstart: _preload.onstart,
      vite: mergeConfig<InlineConfig, InlineConfig>(
        {
          plugins: [{
            name: `${id}-build`,
            enforce: 'post',
            apply() {
              return isBuild
            },
            async closeBundle() {
              await buildAsar(buildAsarOption)
              log.info(`build asar to '${buildAsarOption.asarOutputPath}'`, { timestamp: true })

              await buildVersion(buildVersionOption)
              log.info(`build version info to '${buildVersionOption.versionPath}'`, { timestamp: true })
            },
          }],
          build: {
            sourcemap: sourcemap ? 'inline' : undefined,
            minify: isBuild,
            outDir: `${buildAsarOption.electronDistPath}/preload`,
            rollupOptions: {
              external: Object.keys('dependencies' in pkg ? pkg.dependencies as object : {}),
            },
          },
        },
        _preload.vite ?? {},
      ),
    },
  }

  logParsedOptions && log.info(
    JSON.stringify(
      {
        ...result,
        updater: { buildAsarOption, buildEntryOption, buildVersionOption },
      },
      (key, value) => ((key === 'privateKey' || key === 'cert') ? '***' : value),
      2,
    ),
    { timestamp: true },
  )

  return result
}
