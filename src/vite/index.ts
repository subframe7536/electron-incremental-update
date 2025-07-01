export { convertLiteral } from './bytecode/utils'
export {
  debugStartup,
  electronWithUpdater,
  filterErrorMessageStartup,
  fixWinCharEncoding,
} from './core'
export { electronWithUpdater as default } from './core'
export { defineElectronConfig } from './define'
export type { ElectronViteHelperOptions } from './define'
export type { ElectronWithUpdaterOptions } from './option'
export { isCI } from 'ci-info'

export {
  getPackageInfo,
  getPackageInfoSync,
  loadPackageJSON,
  resolveModule,
} from 'local-pkg'
