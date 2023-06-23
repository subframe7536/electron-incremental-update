import { isCI } from 'ci-info'
import type { DistinguishedName } from '@cyyynthia/jscert'
import { getKeys } from './key'

export type BuildAsarOption = {
  version: string
  asarOutputPath: string
  electronDistPath: string
  rendererDistPath: string
}

export type BuildVersionOption = {
  asarOutputPath: string
  version: string
  privateKey: string
  cert: string
  versionPath: string
}

export type BuildEntryOption = {
  entryPath: string
  entryOutputPath: string
  minify: boolean
}

export type BuildKeysOption = {
  entryPath: string
  privateKeyPath: string
  certPath: string
  keyLength: number
  subject: DistinguishedName
  expires: Date
}

export type Options = {
  /**
   * whether is in build mode
   */
  isBuild: boolean
  /**
   * the name of you application
   *
   * you can set as 'name' in `package.json`
  */
  productName: string
  /**
   * the version of you application
   *
   * you can set as 'version' in `package.json`
   */
  version: string
  /**
   * Whether to minify entry file
   */
  minify?: boolean
  /**
   * paths config
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
     * @default `release/${productName}.asar`
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
       * @default { commonName: productName, organization: `org.${productName}` }
       */
      subject?: DistinguishedName
      /**
       * expires of the certificate
       * - `Date`: expire date
       * - `number`: expire duration in seconds
       *
       * @default Date.now() + 365 * 864e5 (1 year)
       */
      expires?: Date | number
    }
  }
}

export function parseOptions(options: Options) {
  const { isBuild, productName, version, minify = false, paths = {}, keys = {} } = options
  const {
    entryPath = 'electron/app.ts',
    entryOutputPath = 'app.js',
    asarOutputPath = `release/${productName}-${version}.asar`,
    electronDistPath = 'dist-electron',
    rendererDistPath = 'dist',
    versionPath = 'version.json',
  } = paths
  const {
    privateKeyPath = 'keys/private.pem',
    certPath = 'keys/cert.pem',
    keyLength = 2048,
    certInfo,
  } = keys
  let {
    subject = {
      commonName: productName,
      organization: `org.${productName}`,
    },
    expires = Date.now() + 365 * 864e5,
  } = certInfo || {}
  const buildAsarOption: BuildAsarOption = {
    version,
    asarOutputPath,
    electronDistPath,
    rendererDistPath,
  }
  const buildEntryOption: BuildEntryOption = {
    entryPath,
    entryOutputPath,
    minify,
  }
  let buildVersionOption: BuildVersionOption | undefined
  if (!isCI) {
    if (typeof expires === 'number') {
      expires = new Date(Date.now() + expires)
    }
    // generate keys or get from file
    const { privateKey, cert } = getKeys({
      keyLength, privateKeyPath, certPath, entryPath, subject, expires,
    })
    buildVersionOption = {
      version,
      asarOutputPath,
      privateKey,
      cert,
      versionPath,
    }
  }

  return { isBuild, buildAsarOption, buildEntryOption, buildVersionOption }
}
