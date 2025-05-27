import type { DownloadingInfo, UpdateInfoWithURL, URLHandler } from '../types'
import type { BaseGitHubProviderOptions } from './base'

import { URL } from 'node:url'

import { defaultDownloadAsar, defaultDownloadUpdateJSON } from '../../utils/download'
import { BaseProvider } from '../base'
import { BaseGitHubProvider } from './base'

export interface GitHubProviderOptions extends BaseGitHubProviderOptions {
  /**
   * Github branch name that fetch version
   * @default 'HEAD'
   */
  branch?: string
}

export class GitHubProvider extends BaseGitHubProvider<GitHubProviderOptions> {
  public name = 'GithubProvider'
  /**
   * Update Provider for Github repo
   * - download update json from `https://github.com/{user}/{repo}/raw/HEAD/{versionPath}`
   * - download update asar from `https://github.com/{user}/{repo}/releases/download/v{version}/{name}-{version}.asar.gz`
   *
   * you can setup `urlHandler` in options to modify url before request
   * @param options provider options
   */
  constructor(options: GitHubProviderOptions) {
    super(options)
    if (!options.branch) {
      this.options.branch = 'HEAD'
    }
  }

  protected getHeaders(accept: string): Record<string, string> {
    return { Accept: `application/${accept}`, ...this.options.extraHeaders }
  }

  protected getVersionURL(versionPath: string): string {
    return `raw/${this.options.branch}/${versionPath}`
  }
}
