## electron incremental updater

provider a vite plugin and useful functions to generate updater and split entry file and real app

### principle

using two asar, `app.asar` and `main.asar` (if "main" is your app's name)

the `app.asar` is used to load `main.asar` and initialize the updater

using RSA + Signature to sign the new `main.asar` downloaded from remote and replace the old one when verified

- inspired by Obsidian's update strategy

### notice

develop with [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron), and may be effect in other electron vite frameworks

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

more example see comment on `initApp()`

```ts
// electron/app.ts
import { createUpdater, initApp } from 'electron-incremental-update'
import { name, repository } from '../package.json'

const SIGNATURE_PUB = '' // auto generate RSA public key when start app

const updater = createUpdater({
  SIGNATURE_PUB,
  repository,
  productName: name,
})
initApp(name, updater)
```

### setup main

```ts
// electron/main/index.ts
import type { Updater } from 'electron-incremental-update'
import { getAppAsarPath, getAppVersion, getElectronVersion } from 'electron-incremental-update'
import { app } from 'electron'
import { name } from '../../package.json'

export default function (updater: Updater) {
  console.log('\ncurrent:')
  console.log(`\telectron:  ${getElectronVersion()}`)
  console.log(`\tasar path: ${getAppAsarPath(name)}`)
  console.log(`\tapp:       ${getAppVersion(name)}`)

  updater.checkUpdate()
  updater.on('checkResult', async (result, err) => {
    switch (result) {
      case 'success':
        await dialog.showMessageBox({
          type: 'info',
          buttons: ['Restart', 'Later'],
          message: 'Application successfully updated!',
        }).then(({ response }) => {
          if (response === 0) {
            app.relaunch()
            app.quit()
          }
        })
        break
      case 'unavailable':
        console.log('Update Unavailable')
        break
      case 'fail':
        console.error(err)
        break
    }
  })
  updater.on('downloadStart', console.log)
  updater.on('downloading', console.log)
  updater.on('downloadEnd', console.log)
  updater.on('donwnloadError', console.error)

  // app logics
  app.whenReady().then(() => {
    // ...
  })
}
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

```ts
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
              updater({ // !make sure the plugin run pack asar after all build finish
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

#### plugin options

```ts
type Options = {
  /**
   * whether is in build mode
   */
  isBuild: boolean
  /**
   * the name of you application
   *
   * you can set as 'name' in package.json
  */
  productName: string
  /**
   * the version of you application
   *
   * you can set as 'version' in package.json
   */
  version: string
  /**
   * Whether to minify
   */
  minify?: boolean
  /**
   * path config
   */
  paths?: {
    /**
     * Path to app entry file
     * @default 'electron/app.ts'
     */
    entryPath?: string
    /**
     * Path to app entry output file
     * @default 'app.js'
     */
    entryOutputPath?: string
    /**
     * Path to asar file
     * @default `release/${ProductName}.asar`
     */
    asarOutputPath?: string
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
    /**
     * Path to version info output
     * @default `version.json`
     */
    versionPath?: string
  }
  /**
   * signature config
   */
  keys?: {
    /**
     * Path to the pem file that contains private key
     * if not ended with .pem, it will be appended
     * @default 'public/private.pem'
     */
    privateKeyPath?: string
    /**
     * Path to the pem file that contains public key
     * if not ended with .pem, it will be appended
     * @default 'public/public.pem'
     */
    publicKeyPath?: string
    /**
     * Length of the key
     * @default 2048
     */
    keyLength?: number
  }
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