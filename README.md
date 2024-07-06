## Electron Incremental Updater

This project is based on [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron), provide a plugin that build on top of `ElectronSimple`, an `Updater` class and some useful utils for Electron.

There will be two asar in production, `app.asar` and `${electron.app.name}.asar` (also as the `name` field in `package.json`).

The `app.asar` is used to load `${electron.app.name}.asar` and initialize the `Updater`.

The new `${electron.app.name}.asar`, which can download from remote or load from buffer, will be verified by `Updater` using presigned RSA + Signature. While passing the check and restart, the old `${electron.app.name}.asar` will be replaced by the new one. Hooks like `beforeDoUpdate` are provided.

All **native modules** should be packaged into `app.asar` to reduce `${electron.app.name}.asar` file size, [see usage](#use-native-modules). Therefore, auto upgrade of portable app is possible.

No `vite-plugin-electron-renderer` config

- inspired by [Obsidian](https://obsidian.md/)'s upgrade strategy

## Install

### npm
```bash
npm install -D vite-plugin-electron electron-incremental-update
```
### yarn
```bash
yarn add -D vite-plugin-electron electron-incremental-update
```
### pnpm
```bash
pnpm add -D vite-plugin-electron electron-incremental-update
```

## Getting started

### Project structure

base on [electron-vite-vue](https://github.com/electron-vite/electron-vite-vue)

```
electron
├── entry.ts // <- entry file
├── main
│   └── index.ts
├── preload
│   └── index.ts
└── native // <- possible native modules
    └── index.ts
src
└── ...
```

### Setup entry

in `electron/entry.ts` (build by `Esbuild`)

```ts
import { initApp } from 'electron-incremental-update'
import { parseGithubCdnURL } from 'electron-incremental-update/utils'
import { repository } from '../package.json'

initApp({
  // can be updater option or function that return updater
  updater: {
    SIGNATURE_CERT: 'custom certificate',
    repository,
    updateJsonURL: parseGithubCdnURL(repository, jsonPrefix, 'version.json'),
    releaseAsarURL: parseGithubCdnURL(repository, asarPrefix, `download/latest/${app.name}.asar.gz`),
    receiveBeta: true,
  },
  onStart: console.log
})
```

- [some CDN resources](https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L34):

### Setup `vite.config.ts`

All options are documented with JSDoc

- certificate will read from `process.env.UPDATER_CERT` first, if absend, read config
- privatekey will read from `process.env.UPDATER_PK` first, if absend, read config

in `vite.config.mts`

```ts
import { defineConfig } from 'vite'
import { debugStartup, electronWithUpdater } from 'electron-incremental-update/vite'

export default defineConfig(async ({ command }) => {
  const isBuild = command === 'build'
  return {
    plugins: [
      electronWithUpdater({
        isBuild,
        logParsedOptions: true,
        main: {
          files: ['./electron/main/index.ts', './electron/main/worker.ts'],
          // see https://github.com/electron-vite/electron-vite-vue/blob/85ed267c4851bf59f32888d766c0071661d4b94c/vite.config.ts#L22-L28
          onstart: debugStartup,
        },
        preload: {
          files: './electron/preload/index.ts',
        },
        updater: {
          // options
        }
      }),
    ],
    server: process.env.VSCODE_DEBUG && (() => {
      const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
      return {
        host: url.hostname,
        port: +url.port,
      }
    })(),
  }
})
```

### Modify package.json

```json
{
  "main": "dist-entry/entry.js" // <- entry file path
}
```

### Config electron-builder

```js
const { name } = require('./package.json')

const targetFile = `${name}.asar`
/**
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'YourAppID',
  productName: name,
  files: [
    // entry files
    'dist-entry',
  ],
  npmRebuild: false,
  asarUnpack: [
    '**/*.{node,dll,dylib,so}',
  ],
  directories: {
    output: 'release',
  },
  extraResources: [
    { from: `release/${targetFile}`, to: targetFile }, // <- asar file
  ],
  // disable publish
  publish: null,
}
```

## Usage

### Use in main process

To use electron's `net` module for updating, the `checkUpdate` and `download` functions must be called after the app is ready by default. You have the option to customize the download function when creating the updater.

**NOTE: There should only one function and should be default export in the entry file**

in `electron/entry.ts`

```ts
initApp({
  updater: {
    overrideFunctions: {
      downloadJSON: (url: string, headers: Record<string, any>) => {}
      // ...
    }
  },
})
```

in `electron/main/index.ts`

```ts
import { startupWithUpdater } from 'electron-incremental-update'
import { getPathFromAppNameAsar, getVersions } from 'electron-incremental-update/utils'
import { app } from 'electron'

export default startupWithUpdater((updater) => {
  await app.whenReady()

  const { appVersion, electronVersion, entryVersion } = getVersions()
  console.log(`${app.name}.asar path`, getPathFromAppNameAsar())
  console.log('app version:', appVersion)
  console.log('entry (installer) version', entryVersion)
  console.log('electron version', electronVersion)

  updater.onDownloading = ({ percent }) => {
    console.log(percent)
  }
  updater.logger = console
  updater.checkUpdate().then(async (result) => {
    if (result === undefined) {
      console.log('Update Unavailable')
    } else if (result instanceof Error) {
      console.error(result)
    } else {
      console.log('new version: ', result.version)
      const { response } = await dialog.showMessageBox({
        type: 'info',
        buttons: ['Download', 'Later'],
        message: 'Application update available!',
      })
      if (response !== 0) {
        return
      }
      const downloadResult = await updater.download()
      if (downloadResult) {
        updater.quitAndInstall()
      }
    }
  })
})
```

### Use native modules

All the **native modules** should be set as `dependency` in `package.json`. `electron-rebuild` only check dependencies inside `dependency` field.

If you are using `electron-builder` to build distributions, all the native modules with its **large relavent `node_modiles`** will be packaged into `app.asar` by default.

Luckily, `Esbuild` can bundle all the dependencies. Just follow the steps:

1. setup `nativeModuleEntryMap` option
2. Manually copy the native binaries in `postBuild` callback
3. Exclude all the dependencies in `electron-builder`'s config
4. call the native functions with `loadNativeModuleFromEntry` in your code

#### Example

in `vite.config.ts`

```ts
const plugin = electronWithUpdater({
  // options...
  updater: {
    entry: {
      nativeModuleEntryMap: {
        db: './electron/native/db.ts',
        img: './electron/native/img.ts',
      },
      postBuild: async ({ copyToEntryOutputDir }) => {
        // for better-sqlite3
        copyToEntryOutputDir({
          from: './node_modules/better-sqlite3/build/Release/better_sqlite3.node',
          skipIfExist: false,
        })
        // for @napi-rs/image
        const startStr = '@napi-rs+image-'
        const fileName = (await readdir('./node_modules/.pnpm')).filter(p => p.startsWith(startStr))[0]
        const archName = fileName.substring(startStr.length).split('@')[0]
        copyToEntryOutputDir({
          from: `./node_modules/.pnpm/${fileName}/node_modules/@napi-rs/image-${archName}/image.${archName}.node`,
        })
      },
    },
  },
})
```

in `electron/native/db.ts`

```ts
import Database from 'better-sqlite3'

const db = new Database(':memory:', { nativeBinding: './better_sqlite3.node' })

export function test() {
  db.exec(
    'DROP TABLE IF EXISTS employees; '
    + 'CREATE TABLE IF NOT EXISTS employees (name TEXT, salary INTEGER)',
  )

  db.prepare('INSERT INTO employees VALUES (:n, :s)').run({
    n: 'James',
    s: 5000,
  })

  const r = db.prepare('SELECT * from employees').all()
  console.log(r)
  // [ { name: 'James', salary: 50000 } ]

  db.close()
}
```

in `electron/main/service.ts`

```ts
import { loadNativeModuleFromEntry } from 'electron-incremental-update/utils'

const requireNative = loadNativeModuleFromEntry()

requireNative<typeof import('../native/db')>('db').test()
```

in `electron-builder.config.js`

```js
module.exports = {
  files: [
    'dist-entry',
    // exclude dependencies in electron-builder config
    '!node_modules/**',
  ]
}
```

### Bytecode protection

From v1.2, the vite plugin is able to generate bytecode to protect your application.

It will automatically protect your `SIGNATURE_CERT` by default.

credit to [electron-vite](https://github.com/alex8088/electron-vite/blob/master/src/plugins/bytecode.ts), and improve the string protection (see [original issue](https://github.com/alex8088/electron-vite/issues/552))

```ts
electronWithUpdater({
  // ...
  bytecode: true,
})
```

#### Limitation

- only support commonjs
- only for main process by default, if you want to use in preload script, please use `electronWithUpdater({ bytecode: { enablePreload: true } })` and set `sandbox: false` when creating window

### Types

#### Updater

```ts
export interface UpdaterOption {
  /**
   * public key of signature, which will be auto generated by plugin,
   * generate by `selfsigned` if not set
   */
  SIGNATURE_CERT?: string
  /**
   * repository url, e.g. `https://github.com/electron/electron`
   *
   * you can use the `repository` in `package.json`
   *
   * if `updateJsonURL` or `releaseAsarURL` are absent,
   * `repository` will be used to determine the url
   */
  repository?: string
  /**
   * URL of version info json
   * @default `${repository.replace('github.com', 'raw.githubusercontent.com')}/master/version.json`
   * @throws if `updateJsonURL` and `repository` are all not set
   */
  updateJsonURL?: string
  /**
   * URL of release asar.gz
   * @default `${repository}/releases/download/v${version}/${app.name}-${version}.asar.gz`
   * @throws if `releaseAsarURL` and `repository` are all not set
   */
  releaseAsarURL?: string
  /**
   * whether to receive beta update
   */
  receiveBeta?: boolean
  overrideFunctions?: UpdaterOverrideFunctions
  downloadConfig?: UpdaterDownloadConfig
}
export type Logger = {
  info: (msg: string) => void
  debug: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string, e?: Error) => void
}

export type UpdaterOverrideFunctions = {
  /**
   * custom version compare function
   * @param version1 old version string
   * @param version2 new version string
   * @returns if version1 < version2
   */
  isLowerVersion?: (version1: string, version2: string) => boolean | Promise<boolean>
  /**
   * custom verify signature function
   * @param buffer file buffer
   * @param signature signature
   * @param cert certificate
   * @returns if signature is valid, returns the version or `true` , otherwise returns `false`
   */
  verifySignaure?: (buffer: Buffer, signature: string, cert: string) => string | false | Promise<string | false>
  /**
   * custom download JSON function
   * @param url download url
   * @param header download header
   * @returns `UpdateJSON`
   */
  downloadJSON?: (url: string, headers: Record<string, any>) => Promise<UpdateJSON>
  /**
   * custom download buffer function
   * @param url download url
   * @param headers download header
   * @param total precaculated file total size
   * @param onDownloading on downloading callback
   * @returns `Buffer`
   */
  downloadBuffer?: (url: string, headers: Record<string, any>, total: number, onDownloading?: (progress: DownloadingInfo) => void) => Promise<Buffer>
}

export type UpdaterDownloadConfig = {
  /**
   * download user agent
   * @default 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'
   */
  userAgent?: string
  /**
   * extra download header, `accept` and `user-agent` is set by default
   */
  extraHeader?: Record<string, string>
}
```

#### Plugin

```ts
type ElectronWithUpdaterOptions = {
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
   */
  sourcemap?: boolean
  /**
   * whether to minify the code
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

type ElectronUpdaterOptions = {
  /**
   * mini version of entry
   * @default '0.0.0'
   */
  minimumVersion?: string
  /**
   * config for entry (app.asar)
   */
  entry?: BuildEntryOption
  /**
   * paths config
   */
  paths?: {
    /**
     * Path to asar file
     * @default `release/${app.name}.asar`
     */
    asarOutputPath?: string
    /**
     * Path to version info output, content is {@link UpdateJSON}
     * @default `version.json`
     */
    versionPath?: string
    /**
     * Path to gzipped asar file
     * @default `release/${app.name}-${version}.asar.gz`
     */
    gzipPath?: string
    /**
     * Path to electron build output
     * @default `dist-electron`
     */
    electronDistPath?: string
    /**
     * Path to renderer build output
     * @default `dist`
     */
    rendererDistPath?: string
  }
  /**
   * signature config
   */
  keys?: {
    /**
     * path to the pem file that contains private key
     * if not ended with .pem, it will be appended
     *
     * **if `UPDATER_PK` is set, will read it instead of read from `privateKeyPath`**
     * @default 'keys/private.pem'
     */
    privateKeyPath?: string
    /**
     * path to the pem file that contains public key
     * if not ended with .pem, it will be appended
     *
     * **if `UPDATER_CERT` is set, will read it instead of read from `certPath`**
     * @default 'keys/cert.pem'
     */
    certPath?: string
    /**
     * length of the key
     * @default 2048
     */
    keyLength?: number
    /**
     * X509 certificate info
     *
     * only generate simple **self-signed** certificate **without extensions**
     */
    certInfo?: {
      /**
       * the subject of the certificate
       *
       * @default { commonName: `${app.name}`, organizationName: `org.${app.name}` }
       */
      subject?: DistinguishedName
      /**
       * expire days of the certificate
       *
       * @default 3650
       */
      days?: number
    }
    overrideGenerator?: GeneratorOverrideFunctions
  }
}

type BuildEntryOption = {
  /**
   * whether to minify
   * @default isBuild
   */
  minify?: boolean
  /**
   * whether to generate sourcemap
   * @default isBuild
   */
  sourcemap?: boolean
  /**
   * path to app entry output file
   * @default 'dist-entry'
   */
  entryOutputDirPath?: string
  /**
   * path to app entry file
   * @default 'electron/entry.ts'
   */
  appEntryPath?: string
  /**
   * esbuild path map of native modules in entry directory
   *
   * @default {}
   * @example
   * { db: './electron/native/db.ts' }
   */
  nativeModuleEntryMap?: Record<string, string>
  /**
   * override options for esbuild
   * ```ts
   * // default options
   * const options = {
   *   entryPoints: {
   *     entry: appEntryPath,
   *     ...moduleEntryMap,
   *   },
   *   bundle: true,
   *   platform: 'node',
   *   outdir: entryOutputDirPath,
   *   minify,
   *   sourcemap,
   *   entryNames: '[dir]/[name]',
   *   assetNames: '[dir]/[name]',
   *   external: ['electron', 'original-fs'],
   *   loader: {
   *     '.node': 'empty',
   *   },
   *   define: {
   *     __SIGNATURE_CERT__: JSON.stringify(cert),
   *   },
   * }
   * ```
   */
  overrideEsbuildOptions?: BuildOptions
  /**
   * resolve extra files on startup, such as `.node`
   * @remark won't trigger will reload
   */
  postBuild?: (args: {
    /**
     * get path from `entryOutputDirPath`
     */
    getPathFromEntryOutputDir: (...paths: string[]) => string
    /**
     * check exist and copy file to `entryOutputDirPath`
     *
     * if `to` absent, set to `basename(from)`
     *
     * if `skipIfExist` absent, skip copy if `to` exist
     */
    copyToEntryOutputDir: (options: {
      from: string
      to?: string
      /**
       * skip copy if `to` exist
       * @default true
       */
      skipIfExist?: boolean
    }) => void
  }) => Promisable<void>
}

type GeneratorOverrideFunctions = {
  /**
   * custom signature generate function
   * @param buffer file buffer
   * @param privateKey private key
   * @param cert certificate string, **EOL must be '\n'**
   * @param version current version
   */
  generateSignature?: (buffer: Buffer, privateKey: string, cert: string, version: string) => string | Promise<string>
  /**
   * custom generate version json function
   * @param existingJson The existing JSON object.
   * @param buffer file buffer
   * @param signature generated signature
   * @param version current version
   * @param minVersion The minimum version
   * @returns The updated version json
   */
  generateVersionJson?: (existingJson: UpdateJSON, buffer: Buffer, signature: string, version: string, minVersion: string) => UpdateJSON | Promise<UpdateJSON>
}
```

## License

MIT
