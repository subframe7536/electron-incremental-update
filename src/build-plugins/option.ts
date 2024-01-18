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
   * Whether to minify entry file
   * @default isBuild
   */
  minifyEntry?: boolean
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
     * @default `release/${Electron.app.name}.asar`
     */
    asarOutputPath?: string
    /**
     * Path to version info output, content is {@link UpdateJSON}
     * @default `version.json`
     */
    versionPath?: string
    /**
     * Path to gzipped asar file
     * @default `release/${Electron.app.name}-${version}.asar.gz`
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
       * @default { commonName: `${Electron.app.name}`, organizationName: `org.${Electron.app.name}` }
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
    minifyEntry = isBuild,
    paths: {
      entryPath = 'electron/app.ts',
      entryOutputPath = 'app.js',
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
    entryPath,
    entryOutputPath,
    minify: minifyEntry,
  }
  // generate keys or get from file
  const { privateKey, cert } = parseKeys({
    keyLength,
    privateKeyPath,
    certPath,
    entryPath,
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
