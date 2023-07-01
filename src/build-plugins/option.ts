import type { Buffer } from 'node:buffer'
import { isCI } from 'ci-info'
import { parseKeys } from './key'

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
}

export type BuildVersionOption = {
  gzipPath: string
  version: string
  privateKey: string
  cert: string
  versionPath: string
  generateSignature?: FunctionGenerateSignature
}

export type BuildEntryOption = {
  entryPath: string
  entryOutputPath: string
  minify: boolean
}

export type GetKeysOption = {
  entryPath: string
  privateKeyPath: string
  certPath: string
  keyLength: number
  subject: DistinguishedName
  days: number
}

export type FunctionGenerateSignature = (buffer: Buffer, privateKey: string, cert: string, version: string) => string

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
     * Path to gzipped asar file
     * @default `release/${productName}-${version}.asar.gz`
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
       * @default { commonName: productName, organizationName: `org.${productName}` }
       */
      subject?: DistinguishedName
      /**
       * expire days of the certificate
       *
       * @default 365
       */
      days?: number
    }
    overrideFunctions?: {
      /**
       * custom signature generate function {@link FunctionGenerateSignature}
       * @param buffer file buffer
       * @param privateKey private key
       * @param cert certificate
       */
      generateSignature?: FunctionGenerateSignature
    }
  }
}

export function parseOptions(options: Options) {
  const {
    isBuild,
    productName,
    version,
    minify = false,
    paths: {
      entryPath = 'electron/app.ts',
      entryOutputPath = 'app.js',
      asarOutputPath = `release/${productName}.asar`,
      gzipPath = `release/${productName}-${version}.asar.gz`,
      electronDistPath = 'dist-electron',
      rendererDistPath = 'dist',
      versionPath = 'version.json',
    } = {},
    keys: {
      privateKeyPath = 'keys/private.pem',
      certPath = 'keys/cert.pem',
      keyLength = 2048,
      certInfo = {},
      overrideFunctions = {},
    } = {},
  } = options
  const { generateSignature } = overrideFunctions
  let {
    subject = {
      commonName: productName,
      organizationName: `org.${productName}`,
    },
    days = 365,
  } = certInfo
  const buildAsarOption: BuildAsarOption = {
    version,
    asarOutputPath,
    gzipPath,
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
    // generate keys or get from file
    const { privateKey, cert } = parseKeys({
      keyLength,
      privateKeyPath,
      certPath,
      entryPath,
      subject,
      days,
    })
    buildVersionOption = {
      version,
      gzipPath,
      privateKey,
      cert,
      versionPath,
      generateSignature,
    }
  }

  return { isBuild, buildAsarOption, buildEntryOption, buildVersionOption }
}
