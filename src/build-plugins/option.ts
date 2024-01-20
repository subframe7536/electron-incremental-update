import type { Prettify, Promisable } from '@subframe7536/type-utils'
import type { BuildOptions } from 'esbuild'
import type { UpdateJSON } from '../utils/noDep'
import { parseKeys } from './key'

export type PKG = {
  name: string
  version: string
  main: string
}

export type DistinguishedName = {
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
export type BuildAsarOption = {
  version: string
  asarOutputPath: string
  gzipPath: string
  electronDistPath: string
  rendererDistPath: string
  extraFiles?: string | string[]
}

export type BuildVersionOption = {
  gzipPath: string
  version: string
  minimumVersion: string
  privateKey: string
  cert: string
  versionPath: string
  generateSignature?: GeneratorOverrideFunctions['generateSignature']
  generateVersionJson?: GeneratorOverrideFunctions['generateVersionJson']
}

export type BuildEntryOption = {
  /**
   * whether to minify
   * @default isBuild
   */
  minify: boolean
  /**
   * Whether to generate sourcemap
   * @default isBuild
   */
  sourcemap: boolean
  /**
   * path to app entry output file
   * @default 'dist-entry'
   */
  entryOutputDirPath: string
  /**
   * path to app entry file
   * @default 'electron/entry.ts'
   */
  appEntryPath: string
  /**
   * esbuild path map of modules in entry directory
   *
   * **All Native Modules** should be in `moduleMap`
   * @default {}
   * @example
   * { db: './electron/native/db.ts' }
   */
  moduleEntryMap?: Record<string, string>
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
   * resolve extra files, such as `.node`
   */
  postBuild?: (args: {
    /**
     * get path from `entryOutputDirPath`
     */
    getPathFromEntryOutputDir: (...paths: string[]) => string
    /**
     * copy file to `entryOutputDirPath`, if second param absent, set to `basename(from)`
     */
    existsAndCopyToEntryOutputDir: (from: string, to?: string) => void
  }) => Promisable<void>
}

export type GetKeysOption = {
  entryPath: string
  privateKeyPath: string
  certPath: string
  keyLength: number
  subject: DistinguishedName
  days: number
}

export type FunctionGenerateSignature = (buffer: Buffer, privateKey: string, cert: string, version: string) => string | Promise<string>

export type GeneratorOverrideFunctions = {
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

export type ElectronUpdaterOptions = {
  /**
   * mini version of entry
   * @default '0.0.0'
   */
  minimumVersion?: string
  /**
   * config for entry (app.asar)
   */
  entry?: Partial<BuildEntryOption>
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
     * Path to the pem file that contains private key
     * if not ended with .pem, it will be appended
     * @default 'keys/private.pem'
     */
    privateKeyPath?: string
    /**
     * Path to the pem file that contains public key
     * if not ended with .pem, it will be appended
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

export function parseOptions(options: ElectronUpdaterOptions, isBuild: boolean, pkg: PKG) {
  const {
    minimumVersion = '0.0.0',
    entry: {
      minify = isBuild,
      sourcemap = isBuild,
      entryOutputDirPath = 'dist-entry',
      appEntryPath = 'electron/entry.ts',
      moduleEntryMap = {},
      postBuild: resolveFiles,
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
      certInfo = {},
      overrideGenerator = {},
    } = {},
  } = options
  const { generateSignature, generateVersionJson } = overrideGenerator
  let {
    subject = {
      commonName: pkg.name,
      organizationName: `org.${pkg.name}`,
    },
    days = 3650,
  } = certInfo
  const buildAsarOption: BuildAsarOption = {
    version: pkg.version,
    asarOutputPath,
    gzipPath,
    electronDistPath,
    rendererDistPath,
  }
  const buildEntryOption: BuildEntryOption = {
    minify,
    sourcemap,
    entryOutputDirPath,
    appEntryPath,
    moduleEntryMap,
    postBuild: resolveFiles,
  }
  // generate keys or get from file
  const { privateKey, cert } = parseKeys({
    keyLength,
    privateKeyPath,
    certPath,
    entryPath: appEntryPath,
    subject,
    days,
  })
  const buildVersionOption: BuildVersionOption = {
    version: pkg.version,
    minimumVersion,
    gzipPath,
    privateKey,
    cert,
    versionPath,
    generateSignature,
    generateVersionJson,
  }

  return { buildAsarOption, buildEntryOption, buildVersionOption }
}
