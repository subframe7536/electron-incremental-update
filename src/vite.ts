import { basename, join, resolve } from 'node:path'
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import type { InlineConfig, Plugin } from 'vite'
import { createLogger, mergeConfig, normalizePath } from 'vite'
import ElectronSimple from 'vite-plugin-electron/simple'
import { startup } from 'vite-plugin-electron'
import type { ElectronSimpleOptions } from 'vite-plugin-electron/simple'
import { notBundle } from 'vite-plugin-electron/plugin'
import { buildAsar, buildEntry, buildVersion } from './build-plugins/build'
import type { ElectronUpdaterOptions, PKG } from './build-plugins/option'
import { parseOptions } from './build-plugins/option'
import { id } from './constant'

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

function resolvePackageJson(root = process.cwd()) {
  const packageJsonPath = join(root, 'package.json')
  const packageJsonStr = readFileSync(packageJsonPath, 'utf8')
  try {
    return JSON.parse(packageJsonStr)
  } catch {
    return null
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
   * manullay setup package.json, read name, version and main
   * ```ts
   * import pkg from './package.json'
   * ```
   */
  pkg?: PKG
  /**
   * whether to generate sourcemap
   */
  sourcemap?: boolean
  /**
   * whether to minify the code
   */
  minify?: boolean
  /**
   * use NotBundle() plugin in main
   * @default true
   */
  useNotBundle?: boolean
  /**
   * Whether to log parsed options
   */
  logParsedOptions?: boolean
  /**
   * main options
   */
  main: MakeRequiredAndReplaceKey<ElectronSimpleOptions['main'], 'entry', 'files'>
  /**
   * preload options
   */
  preload: MakeRequiredAndReplaceKey<Exclude<ElectronSimpleOptions['preload'], undefined>, 'input', 'files'>
  /**
   * updater options
   */
  updater?: ElectronUpdaterOptions
}

export const log = createLogger('info', { prefix: `[${id}]` })

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
 * you can override all the configs
 *
 * **Limitation**: entry file change cannot trigger auto restart
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
export function electronWithUpdater(options: ElectronWithUpdaterOptions) {
  let {
    isBuild,
    pkg = resolvePackageJson() as PKG,
    main: _main,
    preload: _preload,
    sourcemap,
    minify,
    updater,
    useNotBundle = true,
    logParsedOptions,
  } = options
  if (!pkg) {
    log.error(`package.json not found`, { timestamp: true })
    return null
  }
  const _options = parseOptions(pkg, sourcemap, minify, updater)

  try {
    rmSync(_options.buildAsarOption.electronDistPath, { recursive: true, force: true })
    rmSync(_options.buildEntryOption.entryOutputDirPath, { recursive: true, force: true })
  } catch (ignore) { }
  log.info(`remove old files`, { timestamp: true })

  const { buildAsarOption, buildEntryOption, buildVersionOption, postBuild } = _options
  const { entryOutputDirPath, nativeModuleEntryMap, appEntryPath } = buildEntryOption

  sourcemap ??= (isBuild || !!process.env.VSCODE_DEBUG)

  const _appPath = normalizePath(join(entryOutputDirPath, 'entry.js'))
  if (resolve(normalizePath(pkg.main)) !== resolve(_appPath)) {
    throw new Error(`wrong "main" field in package.json: "${pkg.main}", it should be "${_appPath}"`)
  }

  const _buildEntry = async () => {
    await buildEntry(buildEntryOption)
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
          plugins: [!isBuild && useNotBundle ? notBundle() : undefined],
          build: {
            sourcemap,
            minify,
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
          plugins: [
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
        ...electronPluginOptions,
        updater: { buildAsarOption, buildEntryOption, buildVersionOption },
      },
      (key, value) => ((key === 'privateKey' || key === 'cert') ? '***' : value),
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
