import type { Promisable } from '@subframe7536/type-utils'
import type { InlineConfig } from 'vite'
import { defaultSignature } from '../utils/crypto'
import { defaultVersionJsonGenerator, type UpdateJSON } from '../utils/version'
import { defaultZipFile } from '../utils/zip'
import { type DistinguishedName, parseKeys } from './key'

export interface PKG {
  name: string
  version: string
  main: string
  type: 'commonjs' | 'module'
}

export interface BuildAsarOption {
  version: string
  asarOutputPath: string
  gzipPath: string
  electronDistPath: string
  rendererDistPath: string
  generateGzipFile: Exclude<GeneratorOverrideFunctions['generateGzipFile'], undefined>
}

export interface BuildVersionOption {
  version: string
  minimumVersion: string
  privateKey: string
  cert: string
  versionPath: string
  generateSignature: Exclude<GeneratorOverrideFunctions['generateSignature'], undefined>
  generateUpdateJson: Exclude<GeneratorOverrideFunctions['generateUpdateJson'], undefined>
}

export interface BuildEntryOption {
  /**
   * Override to minify on entry
   * @default isBuild
   */
  minify?: boolean
  /**
   * Override to generate sourcemap on entry
   */
  sourcemap?: boolean
  /**
   * Path to app entry output file
   * @default 'dist-entry'
   */
  entryOutputDirPath?: string
  /**
   * Path to app entry file
   * @default 'electron/entry.ts'
   */
  appEntryPath?: string
  /**
   * Esbuild path map of native modules in entry directory
   *
   * @default {}
   * @example
   * { db: './electron/native/db.ts' }
   */
  nativeModuleEntryMap?: Record<string, string>
  /**
   * Skip process dynamic require
   *
   * Useful for `better-sqlite3` and other old packages
   */
  ignoreDynamicRequires?: boolean
  /**
   * `external` option in `build.rollupOptions`, external `.node` by default
   */
  external?: string | string[] | ((source: string, importer: string | undefined, isResolved: boolean) => boolean | null | undefined | void)
  /**
   * Custom options for `vite` build
   * ```ts
   * const options = {
   *   plugins: [esm(), bytecodePlugin()], // load on needed
   *   build: {
   *     sourcemap,
   *     minify,
   *     outDir: entryOutputDirPath,
   *     commonjsOptions: { ignoreDynamicRequires },
   *     rollupOptions: { external },
   *   },
   *   define,
   * }
   * ```
   */
  overrideViteOptions?: InlineConfig
  /**
   * Resolve extra files on startup, such as `.node`
   * @remark won't trigger will reload
   */
  postBuild?: (args: {
    /**
     * Get path from `entryOutputDirPath`
     */
    getPathFromEntryOutputDir: (...paths: string[]) => string
    /**
     * Check exist and copy file to `entryOutputDirPath`
     *
     * If `to` absent, set to `basename(from)`
     *
     * If `skipIfExist` absent, skip copy if `to` exist
     */
    copyToEntryOutputDir: (options: {
      from: string
      to?: string
      /**
       * Skip copy if `to` exist
       * @default true
       */
      skipIfExist?: boolean
    }) => void
    /**
     * Copy specified modules to entry output dir, just like `external` option in rollup
     */
    copyModules: (options: {
      /**
       * External Modules
       */
      modules: string[]
      /**
       * Skip copy if `to` exist
       * @default true
       */
      skipIfExist?: boolean
    }) => void
  }) => Promisable<void>
}

export interface GeneratorOverrideFunctions {
  /**
   * Custom signature generate function
   * @param buffer file buffer
   * @param privateKey private key
   * @param cert certificate string, **EOL must be `\n`**
   * @param version current version
   */
  generateSignature?: (
    buffer: Buffer,
    privateKey: string,
    cert: string,
    version: string
  ) => Promisable<string>
  /**
   * Custom generate update json function
   * @param existingJson The existing JSON object.
   * @param buffer file buffer
   * @param signature generated signature
   * @param version current version
   * @param minVersion The minimum version
   */
  generateUpdateJson?: (
    existingJson: UpdateJSON,
    signature: string,
    version: string,
    minVersion: string
  ) => Promisable<UpdateJSON>
  /**
   * Custom generate zip file buffer
   * @param buffer source buffer
   */
  generateGzipFile?: (buffer: Buffer) => Promisable<Buffer>
}

export interface ElectronUpdaterOptions {
  /**
   * Minimum version of entry
   * @default '0.0.0'
   */
  minimumVersion?: string
  /**
   * Options for entry (app.asar)
   */
  entry?: BuildEntryOption
  /**
   * Options for paths
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
     * Path to the pem file that contains private key
     * If not ended with .pem, it will be appended
     *
     * **If `UPDATER_PK` is set, will read it instead of read from `privateKeyPath`**
     * @default 'keys/private.pem'
     */
    privateKeyPath?: string
    /**
     * Path to the pem file that contains public key
     * If not ended with .pem, it will be appended
     *
     * **If `UPDATER_CERT` is set, will read it instead of read from `certPath`**
     * @default 'keys/cert.pem'
     */
    certPath?: string
    /**
     * Length of the key
     * @default 2048
     */
    keyLength?: number
    /**
     * X509 certificate info
     *
     * Only generate simple **self-signed** certificate **without extensions**
     */
    certInfo?: {
      /**
       * The subject of the certificate
       *
       * @default { commonName: `${app.name}`, organizationName: `org.${app.name}` }
       */
      subject?: DistinguishedName
      /**
       * Expire days of the certificate
       *
       * @default 3650
       */
      days?: number
    }
  }
  overrideGenerator?: GeneratorOverrideFunctions
}

type ParseOptionReturn = {
  buildAsarOption: BuildAsarOption
  buildEntryOption: Required<Omit<BuildEntryOption, 'postBuild'>>
  buildVersionOption: BuildVersionOption
  postBuild: BuildEntryOption['postBuild']
  cert: string
}

export function parseOptions(
  pkg: PKG,
  sourcemap = false,
  minify = false,
  options: ElectronUpdaterOptions = {},
): ParseOptionReturn {
  const {
    minimumVersion = '0.0.0',
    entry: {
      minify: entryMinify,
      sourcemap: entrySourcemap,
      entryOutputDirPath = 'dist-entry',
      appEntryPath = 'electron/entry.ts',
      nativeModuleEntryMap = {},
      postBuild,
      ignoreDynamicRequires = false,
      external,
      overrideViteOptions = {},
    } = {},
    paths: {
      asarOutputPath = `release/${pkg.name}.asar`,
      gzipPath = `release/${pkg.name}-${pkg.version}.asar.gz`,
      electronDistPath = 'dist-electron',
      rendererDistPath = 'dist',
      versionPath = 'version.json',
    } = {},
    keys: {
      privateKeyPath = 'keys/private.pem',
      certPath = 'keys/cert.pem',
      keyLength = 2048,
      certInfo: {
        subject = {
          commonName: pkg.name,
          organizationName: `org.${pkg.name}`,
        },
        days = 3650,
      } = {},
    } = {},
    overrideGenerator: {
      generateGzipFile = defaultZipFile,
      generateSignature = defaultSignature,
      generateUpdateJson: generateVersionJson = defaultVersionJsonGenerator,
    } = {},
  } = options
  const buildAsarOption: BuildAsarOption = {
    version: pkg.version,
    asarOutputPath,
    gzipPath,
    electronDistPath,
    rendererDistPath,
    generateGzipFile,
  }
  const buildEntryOption: Required<Omit<BuildEntryOption, 'postBuild'>> = {
    minify: entryMinify ?? minify,
    sourcemap: entrySourcemap ?? sourcemap,
    entryOutputDirPath,
    appEntryPath,
    nativeModuleEntryMap,
    overrideViteOptions,
    ignoreDynamicRequires,
    external: (source, importer, isResolved) => {
      if (source.endsWith('.node')) {
        return false
      }
      if (!external) {
        return undefined
      }
      if (typeof external === 'string') {
        return source === external
      }
      if (Array.isArray(external)) {
        return external.includes(source)
      }
      return external(source, importer, isResolved)
    },
  }
  // generate keys or get from file
  const { privateKey, cert } = parseKeys({
    keyLength,
    privateKeyPath,
    certPath,
    subject,
    days,
  })
  const buildVersionOption: BuildVersionOption = {
    version: pkg.version,
    minimumVersion,
    privateKey,
    cert,
    versionPath,
    generateSignature,
    generateUpdateJson: generateVersionJson,
  }

  return { buildAsarOption, buildEntryOption, buildVersionOption, postBuild, cert }
}
