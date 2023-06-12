export type BuildAsarOption = {
  version: string
  asarOutputPath: string
  privateKeyPath: string
  electronDistPath: string
  rendererDistPath: string
  versionPath: string
}

export type BuildEntryOption = {
  privateKeyPath: string
  publicKeyPath: string
  entryPath: string
  entryOutputPath: string
  minify: boolean
  keyLength: number
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

export function parseOptions(options: Options) {
  const { isBuild, productName, version, minify = false, paths = {}, keys = {} } = options
  const {
    entryPath = 'electron/app.ts',
    entryOutputPath = 'app.js',
    asarOutputPath = `release/${productName}.asar`,
    electronDistPath = 'dist-electron',
    rendererDistPath = 'dist',
    versionPath = 'version.json',
  } = paths
  const {
    privateKeyPath = 'public/private.pem',
    publicKeyPath = 'public/public.pem',
    keyLength = 2048,
  } = keys

  const buildAsarOption: BuildAsarOption = {
    version,
    asarOutputPath,
    privateKeyPath,
    electronDistPath,
    rendererDistPath,
    versionPath,
  }
  const buildEntryOption: BuildEntryOption = {
    privateKeyPath,
    publicKeyPath,
    entryPath,
    entryOutputPath,
    minify,
    keyLength,
  }

  return { isBuild, buildAsarOption, buildEntryOption }
}
