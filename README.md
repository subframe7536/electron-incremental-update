## Electron Incremental Updater

This project is based on [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron), provide a plugin that build on top of `ElectronSimple`, an `Updater` class and some useful utils for Electron.

There will be two asar in production, `app.asar` and `${electron.app.name}.asar` (also as the `name` field in `package.json`).

The `app.asar` is used to load `${electron.app.name}.asar` and initialize the `Updater`.

The new `${electron.app.name}.asar`, which can download from remote or load from buffer, will be verified by `Updater` using presigned RSA + Signature. While passing the check and restart, the old `${electron.app.name}.asar` will be replaced by the new one. Hooks like `beforeDoUpdate` are provided.

All **native modules** should be packaged into `app.asar` to reduce `${electron.app.name}.asar` file size, [see usage](#use-native-modules). Therefore, auto upgrade of portable app is possible.

no `vite-plugin-electron-renderer` config

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

const SIGNATURE_CERT = '' // auto generate certificate when start app

initApp({
  // can be updater option or function that return updater
  updater: {
    SIGNATURE_CERT,
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
import pkg from './package.json'

export default defineConfig(async ({ command }) => {
  const isBuild = command === 'build'
  return {
    plugins: [
      electronWithUpdater({
        pkg,
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

To use electron's `net` module for updating, the `checkUpdate` and `download` functions must be called after the app is ready by default.

However, you have the option to customize the download function when creating the updater.

**NOTE: There should only one function and should be default export in the entry file**

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

If you are using `electron-builder` to build distributions, all the native modules with its **large relavent `node_modiles`** will be packaged into `app.asar` by default. You can setup `nativeModuleEntryMap` option to prebundle all the native modules and skip bundled by `electron-builder`

in `vite.config.ts`

```ts
const plugin = electronWithUpdater({
  // options...
  updater: {
    entry: {
      nativeModuleEntryMap: {
        db: './electron/native/db.ts',
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
import { getPaths } from 'electron-incremental-update/utils'

const db = new Database(':memory:', { nativeBinding: getPaths().getPathFromEntryAsar('better_sqlite3.node') })

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

WIP

plan to use [electron-vite](https://github.com/alex8088/electron-vite/blob/master/src/plugins/bytecode.ts), but fail to load the default function in `${electron.app.name}.asar/dist-electron/index.js`.

try to wrap with [`Module.wrap`](https://github.com/bytenode/bytenode?tab=readme-ov-file#bytenodecompileelectroncodejavascriptcode-options--promisebuffer), but still fail.

### Types

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
   * custom options for esbuild
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
