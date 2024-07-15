import { basename, join, resolve } from 'node:path'
import { cpSync, existsSync, rmSync } from 'node:fs'
import type { BuildOptions, InlineConfig, Plugin } from 'vite'
import { mergeConfig, normalizePath } from 'vite'
import ElectronSimple from 'vite-plugin-electron/simple'
import { startup } from 'vite-plugin-electron'
import type { ElectronSimpleOptions } from 'vite-plugin-electron/simple'
import { notBundle } from 'vite-plugin-electron/plugin'
import { loadPackageJSON } from 'local-pkg'
import { buildAsar, buildEntry, buildVersion } from './build-plugins/build'
import type { ElectronUpdaterOptions, PKG } from './build-plugins/option'
import { parseOptions } from './build-plugins/option'
import { id } from './build-plugins/constant'
import { type BytecodeOptions, bytecodePlugin } from './build-plugins/bytecode'
import { log } from './build-plugins/log'

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
}) {
  process.env.VSCODE_DEBUG
    // For `.vscode/.debug.script.mjs`
    ? console.log('[startup] Electron App')
    : args.startup()
}

function getMainFilePath(options: ElectronWithUpdaterOptions['main']['files'], isBuild: boolean) {
  let mainFilePath
  if (typeof options === 'string') {
    mainFilePath = basename(options)
  } else if (Array.isArray(options)) {
    mainFilePath = basename(options[0])
  } else {
    const name = options?.index ?? options?.main
    if (!name) {
      throw new Error(`\`options.main.files\` (${options}) must have "index" or "main" key, like \`{ index: "..." }\``)
    }
    mainFilePath = options?.index ? 'index.js' : 'main.js'
  }
  mainFilePath = mainFilePath.replace(/\.[cm]?ts$/, '.js')
  return isBuild ? join('main', mainFilePath) : mainFilePath
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

export type ElectronWithUpdaterOptions = {
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
   * manually setup package.json, read name, version and main
   * ```ts
   * import pkg from './package.json'
   * ```
   */
  pkg?: PKG
  /**
   * whether to generate sourcemap
   * @default !isBuild
   */
  sourcemap?: boolean
  /**
   * whether to minify the code
   * @default isBuild
   */
  minify?: boolean
  /**
   * whether to generate bytecode
   *
   * **only support commonjs**
   *
   * only main process by default, if you want to use in preload script, please use `electronWithUpdater({ bytecode: { enablePreload: true } })` and set `sandbox: false` when creating window
   */
  bytecode?: boolean | BytecodeOptions
  /**
   * use NotBundle() plugin in main
   * @default true
   */
  useNotBundle?: boolean
  /**
   * Whether to log parsed options
   *
   * to show certificate and private keys, set `logParsedOptions: { showKeys: true }`
   */
  logParsedOptions?: boolean | { showKeys: boolean }
  /**
   * main process options
   *
   * to change output directories, use `options.updater.paths.electronDistPath` instead
   */
  main: MakeRequiredAndReplaceKey<ElectronSimpleOptions['main'], 'entry', 'files'> & ExcludeOutputDirOptions
  /**
   * preload process options
   *
   * to change output directories, use `options.updater.paths.electronDistPath` instead
   */
  preload: MakeRequiredAndReplaceKey<Exclude<ElectronSimpleOptions['preload'], undefined>, 'input', 'files'> & ExcludeOutputDirOptions
  /**
   * updater options
   */
  updater?: ElectronUpdaterOptions
}

/**
 * build options for `vite-plugin-electron/simple`
 * - integrate with updater
 * - only contains `main` and `preload` configs
 * - remove old electron files
 * - externalize dependencies
 * - auto restart when entry file changes
 * - other configs in {@link https://github.com/electron-vite/electron-vite-vue/blob/main/vite.config.ts electron-vite-vue template}
 * - no `vite-plugin-electron-renderer` config
 *
 * you can override all the vite configs, except output directories (use `options.updater.paths.electronDistPath` instead)
 *
 * @example
 * import { defineConfig } from 'vite'
 * import { debugStartup, electronWithUpdater } from 'electron-incremental-update/vite'
 * import pkg from './package.json'
 *
 * export default defineConfig(async ({ command }) => {
 *   const isBuild = command === 'build'
 *   return {
 *     plugins: [
 *       electronWithUpdater({
 *         pkg,
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
 */
export async function electronWithUpdater(options: ElectronWithUpdaterOptions) {
  let {
    isBuild,
    pkg = await loadPackageJSON() as PKG,
    main: _main,
    preload: _preload,
    sourcemap = !isBuild,
    minify = isBuild,
    updater,
    bytecode,
    useNotBundle = true,
    logParsedOptions,
  } = options
  if (!pkg) {
    log.error(`package.json not found`, { timestamp: true })
    return null
  }
  if (!pkg.version || !pkg.name || !pkg.main) {
    log.error(`package.json not valid`, { timestamp: true })
    return null
  }
  const _options = parseOptions(pkg, sourcemap, minify, updater)
  const bytecodeOptions = typeof bytecode === 'object'
    ? bytecode
    : bytecode === true
      ? { protectedStrings: [] }
      : undefined
  if (bytecodeOptions) {
    minify = false
  }
  try {
    rmSync(_options.buildAsarOption.electronDistPath, { recursive: true, force: true })
    rmSync(_options.buildEntryOption.entryOutputDirPath, { recursive: true, force: true })
  } catch (ignore) { }
  log.info(`remove old files`, { timestamp: true })

  const { buildAsarOption, buildEntryOption, buildVersionOption, postBuild, cert } = _options
  const { entryOutputDirPath, nativeModuleEntryMap, appEntryPath } = buildEntryOption

  sourcemap ??= (isBuild || !!process.env.VSCODE_DEBUG)

  const _appPath = normalizePath(join(entryOutputDirPath, 'entry.js'))
  if (resolve(normalizePath(pkg.main)) !== resolve(_appPath)) {
    throw new Error(`wrong "main" field in package.json: "${pkg.main}", it should be "${_appPath}"`)
  }

  /// keep-sorted
  const define = {
    __EIU_ELECTRON_DIST_PATH__: JSON.stringify(buildAsarOption.electronDistPath),
    __EIU_ENTRY_DIST_PATH__: JSON.stringify(buildEntryOption.entryOutputDirPath),
    __EIU_IS_DEV__: JSON.stringify(!isBuild),
    __EIU_MAIN_DEV_DIR__: JSON.stringify(`${buildAsarOption.electronDistPath}/main`),
    __EIU_MAIN_FILE__: JSON.stringify(getMainFilePath(_main.files, isBuild)),
    __EIU_SIGNATURE_CERT__: JSON.stringify(cert),
  }

  const _buildEntry = async () => {
    await buildEntry(
      buildEntryOption,
      define,
      isBuild ? bytecodeOptions?.protectedStrings : undefined,
    )
    log.info(`vite build entry to '${entryOutputDirPath}'`, { timestamp: true })
  }

  const _postBuild = postBuild
    ? async () => await postBuild({
      getPathFromEntryOutputDir(...paths) {
        return join(entryOutputDirPath, ...paths)
      },
      copyToEntryOutputDir({ from, to, skipIfExist = true }) {
        if (existsSync(from)) {
          const target = join(entryOutputDirPath, to ?? basename(from))
          if (!skipIfExist || !existsSync(target)) {
            try {
              cpSync(from, target)
            } catch (error) {
              log.warn(`copy failed: ${error}`)
            }
          }
        }
      },
    })
    : async () => { }

  let isInit = false

  const rollupOptions: BuildOptions['rollupOptions'] = {
    external: src => src.startsWith('node:') || Object.keys('dependencies' in pkg ? pkg.dependencies as object : {}).includes(src),
  }

  const electronPluginOptions: ElectronSimpleOptions = {
    main: {
      entry: _main.files,
      onstart: async (args) => {
        if (!isInit) {
          isInit = true
          await _buildEntry()
          await _postBuild()
        }
        _main.onstart ? _main.onstart(args) : args.startup()
      },
      vite: mergeConfig<InlineConfig, InlineConfig>(
        {
          plugins: [
            !isBuild && useNotBundle ? notBundle() : undefined,
            bytecodeOptions && bytecodePlugin(isBuild, 'main', bytecodeOptions),
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
            bytecodeOptions && bytecodePlugin(isBuild, 'preload', bytecodeOptions),
            {
              name: `${id}-build`,
              enforce: 'post',
              apply() {
                return isBuild
              },
              async closeBundle() {
                await _buildEntry()
                await _postBuild()

                await buildAsar(buildAsarOption)
                log.info(`build asar to '${buildAsarOption.asarOutputPath}'`, { timestamp: true })

                await buildVersion(buildVersionOption)
                log.info(`build version info to '${buildVersionOption.versionPath}'`, { timestamp: true })
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

  logParsedOptions && log.info(
    JSON.stringify(
      {
        ...electronPluginOptions,
        updater: { buildAsarOption, buildEntryOption, buildVersionOption },
      },
      (key, value) => (((key === 'privateKey' || key === 'cert') && !(typeof logParsedOptions === 'object' && logParsedOptions.showKeys === true)) ? '***' : value),
      2,
    ),
    { timestamp: true },
  )

  let extraHmrPlugin: Plugin | undefined

  if (nativeModuleEntryMap) {
    const files = [...Object.values(nativeModuleEntryMap), appEntryPath].map(file => resolve(normalizePath(file)))

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
