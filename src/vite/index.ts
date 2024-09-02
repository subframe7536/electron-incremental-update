import path from 'node:path'
import fs from 'node:fs'
import type { BuildOptions, InlineConfig, Plugin, PluginOption } from 'vite'
import { mergeConfig, normalizePath } from 'vite'
import ElectronSimple from 'vite-plugin-electron/simple'
import { startup } from 'vite-plugin-electron'
import type { ElectronSimpleOptions } from 'vite-plugin-electron/simple'
import { notBundle } from 'vite-plugin-electron/plugin'
import { loadPackageJSON } from 'local-pkg'
import { isCI } from 'ci-info'
import { buildAsar, buildEntry, buildVersion } from './build'
import type { ElectronUpdaterOptions, PKG } from './option'
import { parseOptions } from './option'
import { id, log } from './constant'
import type { BytecodeOptions } from './bytecode'

export { isCI } from 'ci-info'

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

/**
 * startup function for debug (see {@link https://github.com/electron-vite/electron-vite-vue/blob/main/vite.config.ts electron-vite-vue template})
 * @example
 * import { debugStartup, buildElectronPluginOptions } from 'electron-incremental-update/vite'
 * const options = buildElectronPluginOptions({
 *   // ...
 *   main: {
 *     // ...
 *     startup: debugStartup
 *   },
 * })
 */
export function debugStartup(args: {
  startup: (argv?: string[]) => Promise<void>
  reload: () => void
}): void {
  if (process.env.VSCODE_DEBUG) {
    // For `.vscode/.debug.script.mjs`
    console.log('[startup] Electron App')
  } else {
    args.startup()
  }
}

function getMainFileBaseName(options: ElectronWithUpdaterOptions['main']['files']): string {
  let mainFilePath
  if (typeof options === 'string') {
    mainFilePath = path.basename(options)
  } else if (Array.isArray(options)) {
    mainFilePath = path.basename(options[0])
  } else {
    const name = options?.index ?? options?.main
    if (!name) {
      throw new Error(`\`options.main.files\` (${options}) must have "index" or "main" key, like \`{ index: "./electron/main/index.ts" }\``)
    }
    mainFilePath = options?.index ? 'index.js' : 'main.js'
  }
  log.info(`Using "${mainFilePath}" as main file`, { timestamp: true })
  return mainFilePath.replace(/\.[cm]?ts$/, '.js')
}

function parseVersionPath(versionPath: string): string {
  versionPath = normalizePath(versionPath)
  if (!versionPath.startsWith('./')) {
    versionPath = `./${versionPath}`
  }
  return new URL(versionPath, 'file://').pathname.slice(1)
}

type ExcludeOutputDirOptions = {
  vite?: {
    build?: {
      outDir: never
      rollupOptions?: {
        output?: {
          dir: never
        }
      }
    }
  }
}

export interface ElectronWithUpdaterOptions {
  /**
   * Whether is in build mode
   * ```ts
   * export default defineConfig(({ command }) => {
   *   const isBuild = command === 'build'
   * })
   * ```
   */
  isBuild: boolean
  /**
   * Manually setup package.json, read name, version and main,
   * use `local-pkg` of `loadPackageJSON()` to load package.json by default
   * ```ts
   * import pkg from './package.json'
   * ```
   */
  pkg?: PKG
  /**
   * Whether to generate sourcemap
   * @default !isBuild
   */
  sourcemap?: boolean
  /**
   * Whether to minify the code
   * @default isBuild
   */
  minify?: boolean
  /**
   * Whether to generate bytecode
   *
   * **Only support CommonJS**
   *
   * Only main process by default, if you want to use in preload script, please use `electronWithUpdater({ bytecode: { enablePreload: true } })` and set `sandbox: false` when creating window
   */
  bytecode?: boolean | BytecodeOptions
  /**
   * Use `NotBundle()` plugin in main
   * @default true
   */
  useNotBundle?: boolean
  /**
   * Whether to generate version json
   * @default isCI
   */
  buildVersionJson?: boolean
  /**
   * Whether to log parsed options
   *
   * To show certificate and private keys, set `logParsedOptions: { showKeys: true }`
   */
  logParsedOptions?: boolean | { showKeys: boolean }
  /**
   * Main process options
   *
   * To change output directories, use `options.updater.paths.electronDistPath` instead
   */
  main: MakeRequiredAndReplaceKey<ElectronSimpleOptions['main'], 'entry', 'files'> & ExcludeOutputDirOptions
  /**
   * Preload process options
   *
   * To change output directories, use `options.updater.paths.electronDistPath` instead
   */
  preload: MakeRequiredAndReplaceKey<Exclude<ElectronSimpleOptions['preload'], undefined>, 'input', 'files'> & ExcludeOutputDirOptions
  /**
   * Updater options
   */
  updater?: ElectronUpdaterOptions
}

/**
 * Base on `vite-plugin-electron/simple`
 * - integrate with updater
 * - no `renderer` config
 * - remove old output file
 * - externalize dependencies
 * - auto restart when entry file changes
 * - other configs in {@link https://github.com/electron-vite/electron-vite-vue/blob/main/vite.config.ts electron-vite-vue template}
 *
 * You can override all the vite configs, except output directories (use `options.updater.paths.electronDistPath` instead)
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite'
 * import { debugStartup, electronWithUpdater } from 'electron-incremental-update/vite'
 *
 * export default defineConfig(async ({ command }) => {
 *   const isBuild = command === 'build'
 *   return {
 *     plugins: [
 *       electronWithUpdater({
 *         isBuild,
 *         logParsedOptions: true,
 *         main: {
 *           files: ['./electron/main/index.ts', './electron/main/worker.ts'],
 *           // see https://github.com/electron-vite/electron-vite-vue/blob/85ed267c4851bf59f32888d766c0071661d4b94c/vite.config.ts#L22-L28
 *           onstart: debugStartup,
 *         },
 *         preload: {
 *           files: './electron/preload/index.ts',
 *         },
 *         updater: {
 *           // options
 *         }
 *       }),
 *     ],
 *     server: process.env.VSCODE_DEBUG && (() => {
 *       const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
 *       return {
 *         host: url.hostname,
 *         port: +url.port,
 *       }
 *     })(),
 *   }
 * })
 * ```
 */
export async function electronWithUpdater(
  options: ElectronWithUpdaterOptions,
): Promise<PluginOption[] | undefined> {
  let {
    isBuild,
    pkg = await loadPackageJSON() as PKG | null,
    main: _main,
    preload: _preload,
    sourcemap = !isBuild,
    minify = isBuild,
    buildVersionJson,
    updater,
    bytecode,
    useNotBundle = true,
    logParsedOptions,
  } = options
  if (!pkg || !pkg.version || !pkg.name || !pkg.main) {
    log.error('package.json not found or invalid', { timestamp: true })
    return undefined
  }
  const isESM = pkg.type === 'module'

  let bytecodeOptions = typeof bytecode === 'object'
    ? bytecode
    : bytecode === true
      ? { enable: true }
      : undefined

  if (isESM && bytecodeOptions?.enable) {
    (await import('./constant')).bytecodeLog.warn(
      '`bytecodePlugin` does not support ES module, please remove "type": "module" in package.json',
      { timestamp: true },
    )
    bytecodeOptions = undefined
  }

  const {
    buildAsarOption,
    buildEntryOption,
    buildVersionOption,
    postBuild,
    cert,
  } = parseOptions(pkg, sourcemap, minify, updater)
  const { entryOutputDirPath, nativeModuleEntryMap, appEntryPath } = buildEntryOption

  try {
    fs.rmSync(buildAsarOption.electronDistPath, { recursive: true, force: true })
    fs.rmSync(entryOutputDirPath, { recursive: true, force: true })
  } catch { }
  log.info(`Clear cache files`, { timestamp: true })

  sourcemap ??= (isBuild || !!process.env.VSCODE_DEBUG)

  const _appPath = normalizePath(path.join(entryOutputDirPath, 'entry.js'))
  if (path.resolve(normalizePath(pkg.main)) !== path.resolve(_appPath)) {
    throw new Error(`Wrong "main" field in package.json: "${pkg.main}", it should be "${_appPath}"`)
  }

  /// keep-sorted
  const define = {
    __EIU_ELECTRON_DIST_PATH__: JSON.stringify(normalizePath(buildAsarOption.electronDistPath)),
    __EIU_ENTRY_DIST_PATH__: JSON.stringify(normalizePath(buildEntryOption.entryOutputDirPath)),
    __EIU_IS_DEV__: JSON.stringify(!isBuild),
    __EIU_IS_ESM__: JSON.stringify(isESM),
    __EIU_MAIN_FILE__: JSON.stringify(getMainFileBaseName(_main.files)),
    __EIU_SIGNATURE_CERT__: JSON.stringify(cert),
    __EIU_VERSION_PATH__: JSON.stringify(parseVersionPath(normalizePath(buildVersionOption.versionPath))),
  }

  const _buildEntry = async (): Promise<void> => {
    await buildEntry(
      buildEntryOption,
      isESM,
      define,
      bytecodeOptions,
    )
    log.info(`Build entry to '${entryOutputDirPath}'`, { timestamp: true })
  }

  const _postBuild = postBuild
    ? async () => await postBuild({
      getPathFromEntryOutputDir(...paths) {
        return path.join(entryOutputDirPath, ...paths)
      },
      copyToEntryOutputDir({ from, to, skipIfExist = true }) {
        if (fs.existsSync(from)) {
          const target = path.join(entryOutputDirPath, to ?? path.basename(from))
          if (!skipIfExist || !fs.existsSync(target)) {
            try {
              fs.cpSync(from, target)
            } catch (error) {
              log.warn(`Copy failed: ${error}`, { timestamp: true })
            }
          }
        }
      },
    })
    : async () => { }

  let isInit = false

  const rollupOptions: BuildOptions['rollupOptions'] = {
    external: src => src.startsWith('node:') || Object.keys('dependencies' in pkg ? pkg.dependencies as object : {}).includes(src) || src === 'original-fs',
    treeshake: true,
  }

  const esmShimPlugin = isESM ? (await import('./esm/index')).esm() : undefined

  const electronPluginOptions: ElectronSimpleOptions = {
    main: {
      entry: _main.files,
      onstart: async (args) => {
        if (!isInit) {
          isInit = true
          await _buildEntry()
          await _postBuild()
        }
        if (_main.onstart) {
          _main.onstart(args)
        } else {
          args.startup()
        }
      },
      vite: mergeConfig<InlineConfig, InlineConfig>(
        {
          plugins: [
            !isBuild && useNotBundle ? notBundle() : undefined,
            bytecodeOptions && await import('./bytecode').then(m => m.bytecodePlugin('main', bytecodeOptions)),
            esmShimPlugin,
          ],
          build: {
            sourcemap,
            minify,
            outDir: `${buildAsarOption.electronDistPath}/main`,
            rollupOptions,
          },
          define,
        },
        _main.vite ?? {},
      ),
    },
    preload: {
      input: _preload.files,
      onstart: _preload.onstart,
      vite: mergeConfig<InlineConfig, InlineConfig>(
        {
          plugins: [
            bytecodeOptions && ((await import('./bytecode/index')).bytecodePlugin)('preload', bytecodeOptions),
            esmShimPlugin,
            {
              name: `${id}-build`,
              enforce: 'post',
              apply() {
                return isBuild
              },
              async closeBundle() {
                await _buildEntry()
                await _postBuild()
                const buffer = await buildAsar(buildAsarOption)
                if (!buildVersionJson && !isCI) {
                  log.warn('No `buildVersionJson` option setup, skip build version json. Only build in CI by default', { timestamp: true })
                } else {
                  await buildVersion(buildVersionOption, buffer)
                }
              },
            },
          ],
          build: {
            sourcemap: sourcemap ? 'inline' : undefined,
            minify,
            outDir: `${buildAsarOption.electronDistPath}/preload`,
            rollupOptions,
          },
          define,
        },
        _preload.vite ?? {},
      ),
    },
  }

  if (logParsedOptions) {
    log.info(
      JSON.stringify(
        {
          ...electronPluginOptions,
          updater: { buildAsarOption, buildEntryOption, buildVersionOption },
        },
        (key, value) => (((['privateKey', 'cert', 'define'].includes(key)) && !(typeof logParsedOptions === 'object' && logParsedOptions.showKeys === true)) ? '***' : value),
        2,
      ),
      { timestamp: true },
    )
  }

  let extraHmrPlugin: Plugin | undefined

  if (nativeModuleEntryMap) {
    const files = [
      ...Object.values(nativeModuleEntryMap),
      appEntryPath,
    ].map(file => path.resolve(normalizePath(file)))

    extraHmrPlugin = {
      name: `${id}-dev`,
      apply() {
        return !isBuild
      },
      configureServer: (server) => {
        server.watcher
          .add(files)
          .on(
            'change',
            p => files.includes(p) && _buildEntry()
              .then(async () => {
                await startup.exit()
                await _postBuild()
                await startup()
              }),
          )
      },
    }
  }

  return [ElectronSimple(electronPluginOptions), extraHmrPlugin]
}

export default electronWithUpdater
