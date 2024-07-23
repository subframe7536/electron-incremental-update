import { URL } from 'node:url'
import type { UpdateInfo, UpdateJSON } from '../utils/version'
import type { DownloadingInfo, URLHandler } from './types'
import { defaultDownloadAsar, defaultDownloadUpdateJSON } from './download'
import { BaseProvider } from './base'

export interface GitHubProviderOptions {
  /**
   * github user name
   */
  username: string
  /**
   * github repo name
   */
  repo: string
  /**
   * github branch name that fetch version
   * @default 'HEAD'
   */
  branch?: string
  /**
   * extra headers
   */
  extraHeaders?: Record<string, string>
  /**
   * custom url handler
   *
   * for Github, there are some {@link https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L40 public CDN links}
   * @example
   * (url, isDownloadAsar) => {
   *   if (isDownloadAsar) {
   *     url.hostname = 'mirror.ghproxy.com'
   *     url.pathname = 'https://github.com' + url.pathname
   *     return url
   *   }
   * }
   */
  urlHandler?: URLHandler
}

export class GitHubProvider extends BaseProvider {
  public name = 'GithubProvider'
  private options: GitHubProviderOptions
  /**
   * Update Provider for Github repo
   * - download update json from `https://raw.githubusercontent.com/{user}/{repo}/HEAD/{versionPath}`
   * - download update asar from `https://github.com/{user}/{repo}/releases/download/v{version}/{name}-{version}.asar.gz`
   *
   * you can setup `urlHandler` in {@link GitHubProviderOptions} or `Updater` to modify url before request
   * @param options provider options
   */
  constructor(options: GitHubProviderOptions) {
    super()
    this.options = options
    if (!options.branch) {
      this.options.branch = 'HEAD'
    }
  }

  get urlHandler(): URLHandler | undefined {
    return this.options.urlHandler
  }

  set urlHandler(handler: URLHandler) {
    this.options.urlHandler = handler
  }

  private async parseURL(isDownloadAsar: boolean, extraPath: string): Promise<string> {
    const url = new URL(
      `/${this.options.username}/${this.options.repo}/${extraPath}`,
      'https://' + (isDownloadAsar ? 'github.com' : 'raw.githubusercontent.com'),
    )
    return (await this.urlHandler?.(url, isDownloadAsar) || url).toString()
  }

  public async downloadJSON(versionPath: string): Promise<UpdateJSON> {
    return await defaultDownloadUpdateJSON(
      await this.parseURL(false, `${this.options.branch}/${versionPath}`),
      { Accept: 'application/json', ...this.options.extraHeaders },
    )
  }

  public async downloadAsar(
    name: string,
    info: UpdateInfo,
    onDownloading?: (info: DownloadingInfo) => void,
  ): Promise<Buffer> {
    return await defaultDownloadAsar(
      await this.parseURL(true, `releases/download/v${info.version}/${name}-${info.version}.asar.gz`),
      { Accept: 'application/octet-stream', ...this.options.extraHeaders },
      onDownloading,
    )
  }
}
