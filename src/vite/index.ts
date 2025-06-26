export { convertLiteral } from './bytecode/utils'
export * from './core'
export { electronWithUpdater as default } from './core'
export type { ElectronWithUpdaterOptions } from './option'
export { isCI } from 'ci-info'

export { getPackageInfo, getPackageInfoSync, loadPackageJSON, resolveModule } from 'local-pkg'
