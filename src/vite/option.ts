import type { Promisable } from '@subframe7536/type-utils'
import type { BuildOptions } from 'esbuild'
import { type UpdateJSON, defaultVersionJsonGenerator } from '../utils/version'
import { defaultZipFile } from '../utils/zip'
import { defaultSignature } from '../utils/crypto'
import { parseKeys } from './key'

export interface PKG {
  name: string
  version: string
  main: string
  type: 'commonjs' | 'module'
}

export interface DistinguishedName {
  countryName?: string
  stateOrProvinceName?: string
  localityName?: string
  organizationName?: string
  organizationalUnitName?: string
  commonName?: string
  serialNumber?: string
  title?: string
  description?: string
  businessCategory?: string
  emailAddress?: string
}
export type CertSubject = {
  name: string
  value: string
}[]

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
  generateVersionJson: Exclude<GeneratorOverrideFunctions['generateVersionJson'], undefined>
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
   * Custom options for esbuild
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
   *   define,
   * }
   * ```
   */
  overrideEsbuildOptions?: BuildOptions
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
  }) => Promisable<void>
}

export interface GeneratorOverrideFunctions {
  /**
   * Custom signature generate function
   * @param buffer file buffer
   * @param privateKey private key
   * @param cert certificate string, **EOL must be '\n'**
   * @param version current version
   */
  generateSignature?: (
    buffer: Buffer,
    privateKey: string,
    cert: string,
    version: string
  ) => Promisable<string>
  /**
   * Custom generate version json function
   * @param existingJson The existing JSON object.
   * @param buffer file buffer
   * @param signature generated signature
   * @param version current version
   * @param minVersion The minimum version
   * @returns The updated version json
   */
  generateVersionJson?: (
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
  postBuild: ((args: {
    getPathFromEntryOutputDir: (...paths: string[]) => string
    copyToEntryOutputDir: (options: {
      from: string
      to?: string
      skipIfExist?: boolean
    }) => void
  }) => Promisable<void>) | undefined
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
      overrideEsbuildOptions = {},
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
      generateVersionJson = defaultVersionJsonGenerator,
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
    overrideEsbuildOptions,
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
    generateVersionJson,
  }

  return { buildAsarOption, buildEntryOption, buildVersionOption, postBuild, cert }
}
