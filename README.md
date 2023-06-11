## electron incremental updater

inspired by Obsidian's update strategy, using RSA + Signature to sign the update asar and replace the old one when verified

develop with [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron), and may be effect in other electron vite frameworks

### install

#### npm
```bash
npm install electron-incremental-update
```
#### yarn
```bash
yarn add electron-incremental-update
```
#### pnpm
```bash
pnpm add electron-incremental-update
```

### usage

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

#### setup app

```ts
// electron/app.ts
import { createUpdater, initApp } from 'electron-incremental-update'
import { name, repository } from '../package.json'

const SIGNATURE_PUB = '' // auto generate RSA public key when start app

const updater = createUpdater({
  SIGNATURE_PUB,
  githubRepository: repository,
  productName: name,
})
initApp(name, updater)
```

#### setup main

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

#### use native modules

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

#### setup vite.config.ts

```ts
import { rmSync } from 'node:fs'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import updater from 'electron-incremental-update/vite'
import pkg from './package.json'

// https://vitejs.dev/config/

export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    plugins: [
      electron([
        {
          // Main-Process entry file of the Electron App.
          entry: ['electron/main/index.ts'],
          onstart(options) {
            if (process.env.VSCODE_DEBUG) {
              console.log(/* For `.vscode/.debug.script.mjs` */'[startup] Electron App')
            } else {
              options.startup()
            }
          },
          vite: {
            plugins: [
              updater({ // options see below
                productName: pkg.name,
                version: pkg.version,
                isBuild,
              }),
            ],
            build: {
              sourcemap,
              minify: false,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
                treeshake: true,
              },
            },
          },
        },
        {
          // ...preload
        },
      ]),
      // ... other plugins
    ],
    // ... other config
  }
})
```

##### option

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
     * Path to app entry file
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
  }
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