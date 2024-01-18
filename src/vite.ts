import { resolve } from 'node:path'
import { rmSync } from 'node:fs'
import type { InlineConfig, Plugin as VitePlugin } from 'vite'
import { createLogger, mergeConfig, normalizePath } from 'vite'
import type { ElectronSimpleOptions } from 'vite-plugin-electron/simple'
import type { Prettify } from '@subframe7536/type-utils'
import { notBundle } from 'vite-plugin-electron/plugin'
import { buildAsar, buildEntry, buildVersion } from './build-plugins/build'
import type { ElectronUpdaterOptions } from './build-plugins/option'
import { parseOptions } from './build-plugins/option'

export type { ElectronUpdaterOptions }

function pluginUsingParsedOptions(options: ReturnType<typeof parseOptions>, pkg: any): VitePlugin {
  const { isBuild, buildAsarOption, buildEntryOption, buildVersionOption, logParsedOptions } = options
  const { entryPath, entryOutputPath } = buildEntryOption
  const { asarOutputPath } = buildAsarOption

  if (resolve(normalizePath(pkg.main)) !== resolve(normalizePath(entryOutputPath))) {
    throw new Error(`wrong entry path: \nin package.json: "${pkg.main}"\nin vite config: "${entryOutputPath}"`)
  }

  const id = 'electron-incremental-updater'
  const log = createLogger('info', { prefix: `[${id}]` })
  logParsedOptions && log.info(
    JSON.stringify(options, (key, value) => ((key === 'privateKey' || key === 'cert') ? '***' : value), 2),
    { timestamp: true },
  )

  return {
    name: `vite-plugin-${id}`,
    enforce: 'post',
    async closeBundle() {
      await buildEntry(buildEntryOption)

      log.info(`build entry from '${entryPath}' to '${entryOutputPath}'`, { timestamp: true })

      if (!isBuild) {
        return
      }

      await buildAsar(buildAsarOption)

      await buildVersion(buildVersionOption)
      log.info(`build asar to '${asarOutputPath}'`, { timestamp: true })
    },
  }
}

/**
 * create updater plugin
 */
export function ElectronUpdater(options: ElectronUpdaterOptions): VitePlugin {
  return pluginUsingParsedOptions(parseOptions(options), options.pkg)
}

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

export type CombinedOptions = {
  isBuild: boolean
  pkg: ElectronUpdaterOptions['pkg']
  main: Prettify<
    MakeRequiredAndReplaceKey<ElectronSimpleOptions['main'], 'entry', 'files'>
  >
  preload: Prettify<
    MakeRequiredAndReplaceKey<Exclude<ElectronSimpleOptions['preload'], undefined>, 'input', 'files'>
  >
  /**
   * use debug helper in main
   * @default true
   * ```ts
   * onstart({ startup }) {
   *   process.env.VSCODE_DEBUG
   *     // For `.vscode/.debug.script.mjs`
   *     ? console.log('[startup] Electron App')
   *     : startup()
   *}
   * ```
   */
  useDebugOnStart?: boolean
  /**
   * use NotBundle() plugin in main
   * @default true
   */
  useNotBundle?: boolean
  updater?: Prettify<Omit<ElectronUpdaterOptions, 'isBuild' | 'pkg'>>
}

function _mergeConfig(baseConfig: InlineConfig, customConfig?: InlineConfig) {
  return customConfig
    ? mergeConfig<InlineConfig, InlineConfig>(baseConfig, customConfig)
    : baseConfig
}

/**
 * build options for `vite-plugin-electron/simple`
 * - integrate with {@link ElectronUpdater}
 * - only contains `main` and `preload` configs
 * - remove old electron files
 * - externalize dependencies
 * - other configs of {@link https://github.com/electron-vite/electron-vite-vue/blob/main/vite.config.ts electron-vite-vue template}
 * - no `vite-plugin-electron-renderer` config
 *
 * you can override all the configs
 */
export function buildElectronPluginOptions(options: CombinedOptions): ElectronSimpleOptions {
  const updaterOptions = (options.updater ?? {}) as ElectronUpdaterOptions
  updaterOptions.isBuild = options.isBuild
  updaterOptions.pkg = options.pkg

  const _options = parseOptions(updaterOptions)
  rmSync(_options.buildAsarOption.electronDistPath, { recursive: true, force: true })
  console.log(`remove old electron files in '${_options.buildAsarOption.electronDistPath}'`)

  const sourcemap = _options.isBuild || !!process.env.VSCODE_DEBUG
  const pkg = options.pkg

  return {
    main: {
      entry: options.main.files,
      ...((options.useDebugOnStart ?? true)
        ? {
            onstart({ startup }) {
              process.env.VSCODE_DEBUG
                // For `.vscode/.debug.script.mjs`
                ? console.log('[startup] Electron App')
                : startup()
            },
          }
        : options.main.onstart
      ),
      vite: _mergeConfig(
        {
          plugins: (options.useNotBundle ?? true) ? [notBundle()] : undefined,
          build: {
            sourcemap,
            minify: _options.isBuild,
            outDir: `${_options.buildAsarOption.electronDistPath}/main`,
            rollupOptions: {
              external: Object.keys('dependencies' in pkg ? pkg.dependencies as object : {}),
            },
          },
        },
        options.main.vite,
      ),
    },
    preload: {
      input: options.preload.files,
      onstart: options.preload.onstart,
      vite: _mergeConfig(
        {
          plugins: [pluginUsingParsedOptions(_options, pkg)],
          build: {
            sourcemap: sourcemap ? 'inline' : undefined,
            minify: _options.isBuild,
            outDir: `${_options.buildAsarOption.electronDistPath}/preload`,
            rollupOptions: {
              external: Object.keys('dependencies' in pkg ? pkg.dependencies as object : {}),
            },
          },
        },
        options.preload.vite,
      ),
    },
  }
}
