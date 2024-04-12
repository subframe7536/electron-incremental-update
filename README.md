## Electron Incremental Updater

This project is based on [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron), provide a plugin that build on top of `ElectronSimple`, an `Updater` class and some useful utils for Electron.

There will be two asar in production, `app.asar` and `${name}.asar` (`electron.app.name`, also as the `name` field in `package.json`).

The `app.asar` is used to load `${name}.asar` and initialize the `Updater`.

The new `${name}.asar`, which can download from remote or load from buffer, will be verified by `Updater` using presigned RSA + Signature. While passing the check and restart, the old `${name}.asar` will be replaced by the new one. Hooks like `beforeDoUpdate` are provided.

All **native modules** should be packaged into `app.asar` to reduce `${name}.asar` file size, [see usage](#use-native-modules)

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

initApp({ onStart: console.log })
  .setUpdater({
    SIGNATURE_CERT,
    // repository,
    // updateJsonURL: parseGithubCdnURL(repository, 'https://your.cdn.url/', 'version.json'),
    // releaseAsarURL: parseGithubCdnURL(repository, 'https://your.cdn.url/', `download/latest/${name}.asar.gz`),
    // receiveBeta: true
  })
```

- [some CDN resources](https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L34):

### Setup `vite.config.ts`

All options are documented with JSDoc

- cert will read from `process.env.UPDATER_CERT` first, if absend, read config
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

### use in main process

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

### use native modules

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
      postBuild: async ({ existsAndCopyToEntryOutputDir }) => {
        // for better-sqlite3
        existsAndCopyToEntryOutputDir({
          from: './node_modules/better-sqlite3/build/Release/better_sqlite3.node',
          skipIfExist: false,
        })
        // for @napi-rs/image
        const startStr = '@napi-rs+image-'
        const fileName = (await readdir('./node_modules/.pnpm')).filter(p => p.startsWith(startStr))[0]
        const archName = fileName.substring(startStr.length).split('@')[0]
        existsAndCopyToEntryOutputDir({
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
    // exclude better-sqlite3 from electron-builder
    '!node_modules/better-sqlite3/**',
    // exclude @napi-rs/image from electron-builder
    '!node_modules/@napi-rs*/**',
  ]
}
```

## License

MIT
