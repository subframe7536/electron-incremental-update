## electron incremental updater

This project provide a vite plugin, `Updater` class and some useful functions to generate incremental update.

There will be two asar in production, `app.asar` and `main.asar` (if "main" is your app's name).

The `app.asar` is used to load `main.asar` and initialize the `updater`. Also, all the **native modules**, which are set as `dependencies` in `package.json`, will be packaged into `app.asar` by `electron-builder`, [see usage](#use-native-modules).

The new `main.asar` downloaded from remote will be verified by presigned RSA + Signature. When pass the check and restart, the old `main.asar` will be replaced by the new one. Hooks like `beforeDoUpdate` are provided.

- inspired by Obsidian's update strategy

### notice

- this plugin is developed with [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron), and may be effect in other electron vite frameworks
- **all options are documented in the jsdoc**

## install

### npm
```bash
npm install electron-incremental-update
```
### yarn
```bash
yarn add electron-incremental-update
```
### pnpm
```bash
pnpm add electron-incremental-update
```

## setup

base on [electron-vite-vue](https://github.com/electron-vite/electron-vite-vue)

```
electron
├── app.ts // <- add app entry file
├── electron-env.d.ts
├── main
│   ├── db.ts
│   ├── index.ts
└── preload
    └── index.ts
src
└── ...
```

### setup app

```ts
// electron/app.ts
import { getGithubReleaseCdnGroup, initApp, parseGithubCdnURL } from 'electron-incremental-update'
import { name, repository } from '../package.json'

const SIGNATURE_CERT = '' // auto generate certificate when start app

const { cdnPrefix: asarPrefix } = getGithubReleaseCdnGroup()[0]
const { cdnPrefix: jsonPrefix } = getGithubFileCdnGroup()[0]
initApp({ onStart: console.log })
  // can be updater option or function that return updater
  .setUpdater({
    SIGNATURE_CERT,
    productName: name,
    repository,
    updateJsonURL: parseGithubCdnURL(repository, jsonPrefix, 'version.json'),
    releaseAsarURL: parseGithubCdnURL(repository, asarPrefix, `download/latest/${name}.asar.gz`),
    receiveBeta: true
  })
```

### setup vite.config.ts

make sure the plugin is set in the **last** build task

- for `vite-plugin-electron`, set it to `preload` (the second object in the plugin option array)

```ts
// vite.config.ts
export default defineConfig(({ command }) => {

  const isBuild = command === 'build'
  // ...

  return {
    plugins: [
      electron([
        // main
        {
          // ...
        },
        // preload
        {
          // ...
          vite: {
            plugins: [
              updater({
                productName: pkg.name,
                version: pkg.version,
                isBuild,
              }),
            ],
            // ...
          }
        },
        // when using vite-plugin-electron-renderer
        {
          // ...
        }
      ]),
      // ...
    ],
    // ...
  }
})
```

### modify package.json

```json
{
  // ...
  "main": "app.js" // <- app entry file path
}
```

### config electron-builder

```js
const { name } = require('./package.json')

const target = `${name}.asar`
/**
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'YourAppID',
  productName: name,
  files: [
    'app.js', // <- app entry file
    '!**/{.eslintignore,.eslintrc.cjs,.editorconfig,.prettierignore,.prettierrc.yaml,dev-app-update.yml,LICENSE,.nvmrc,.npmrc}',
    '!**/{tsconfig.json,tsconfig.node.json,tsconfig.web.json}',
    '!**/*debug*.*',
    '!**/*.{md,zip,map}',
    '!**/*.{c,cpp,h,hpp,cc,hh,cxx,hxx,gypi,gyp,sh}',
    '!**/.{github,vscode}',
    '!node_modules/**/better-sqlite3/deps/**',
  ],
  asarUnpack: [
    '**/*.{node,dll}',
  ],
  directories: {
    output: 'release',
  },
  extraResources: [
    { from: `release/${target}`, to: target }, // <- asar file
  ],
  publish: null, // <- disable publish
  // ...
}
```

## Usage

### use in main process

To use electron's `net` module for updating, the `checkUpdate` and `download` functions must be called after the app is ready by default.

However, you have the option to customize the download function when creating the updater.

**NOTE: There can only be one function and should be default export in the entry file**

```ts
// electron/main/index.ts
import type { StartupWithUpdater, Updater } from 'electron-incremental-update'
import { getAppVersion, getElectronVersion, getProductAsarPath } from 'electron-incremental-update/utils'
import { app } from 'electron'
import { name } from '../../package.json'

const startup: StartupWithUpdater = (updater: Updater) => {
  await app.whenReady()
  console.log('\ncurrent:')
  console.log(`\tasar path: ${getProductAsarPath(name)}`)
  console.log(`\tapp:       ${getAppVersion(name)}`)
  console.log(`\telectron:  ${getElectronVersion()}`)
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
      response === 0 && console.log(await updater.download())
    }
  })
}
export default startup
```

### use native modules

the native modules is packed in `app.asar`, so you cannot directly access it when in production

to use it, you can prebundle native modules, or use `requireNative` to load.

```ts
// db.ts
import { isNoSuchNativeModuleError, requireNative } from 'electron-incremental-update/utils'

const Database = requireNative<typeof import('better-sqlite3')>('better-sqlite3')
if (isNoSuchNativeModuleError(Database)) {
  // ...
}
const db = new Database(':memory:')
db.exec(
  'DROP TABLE IF EXISTS employees; '
    + 'CREATE TABLE IF NOT EXISTS employees (name TEXT, salary INTEGER)',
)

db.prepare('INSERT INTO employees VALUES (:n, :s)').run({
  n: 'James',
  s: 50000,
})

const r = db.prepare('SELECT * from employees').all()
console.log(r)
// [ { name: 'James', salary: 50000 } ]

db.close()
```
