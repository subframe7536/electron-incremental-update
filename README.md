## electron incremental updater

provider a vite plugin and useful functions to generate updater and split entry file and real app

### principle

using two asar, `app.asar` and `main.asar` (if "main" is your app's name)

the `app.asar` is used to load `main.asar` and initialize the updater

using RSA + Signature to sign the new `main.asar` downloaded from remote and replace the old one when verified

- inspired by Obsidian's update strategy

### notice

develop with [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron), and may be effect in other electron vite frameworks

**all options are documented in the jsdoc**

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

## usage

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

### usage in main process

To utilize the electron `net` module for requesting update information, the `checkUpdate` and `download` functions must be called after the app is ready by default.

However, you have the option to customize the download function when creating the updater.

**NOTE: There can only be one function and should be default export in the entry file**

```ts
// electron/main/index.ts
import type { StartupWithUpdater, Updater } from 'electron-incremental-update'
import { getEntryVersion, getProductAsarPath, getProductVersion } from 'electron-incremental-update'
import { app } from 'electron'
import { name } from '../../package.json'

const startup: StartupWithUpdater = (updater: Updater) => {
  await app.whenReady()
  console.log('\ncurrent:')
  console.log(`\tasar path: ${getProductAsarPath(name)}`)
  console.log(`\tentry:     ${getEntryVersion()}`)
  console.log(`\tapp:       ${getProductVersion(name)}`)
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

```ts
// db.ts
import { requireNative } from 'electron-incremental-update'

const Database = requireNative<typeof import('better-sqlite3')>('better-sqlite3')
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

### setup vite.config.ts

make sure the plugin is set in the **last** build task plugin option

- set it to preload task plugin, as the end of build task

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
      ]),
      // ... other plugins
    ],
    // ... other config
  }
})
```

### modify package.json

```json
{
  // ...
  "main": "app.js" // <- app entry file
}
```

### electron-builder config

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
  publish: null,
  // ...
}
```