import type { DownloadingInfo, UpdateInfoWithURL, URLHandler } from './types'

import { URL } from 'node:url'

import { defaultDownloadAsar, defaultDownloadUpdateJSON } from '../utils/download'
import { BaseProvider } from './base'

export interface GitHubProviderOptions {
  /**
   * Github user name
   */
  user: string
  /**
   * Github repo name
   */
  repo: string
  /**
   * Github branch name that fetch version
   * @default 'HEAD'
   */
  branch?: string
  /**
   * Extra headers
   */
  extraHeaders?: Record<string, string>
  /**
   * Custom url handler ({@link https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L40 some public CDN links})
   * @example
   * (url) => {
   *   url.hostname = 'mirror.ghproxy.com'
   *   url.pathname = 'https://github.com' + url.pathname
   *   return url
   * }
   */
  urlHandler?: URLHandler
}

export class GitHubProvider<T extends UpdateInfoWithURL = UpdateInfoWithURL> extends BaseProvider<T> {
  public name = 'GithubProvider'
  private options: GitHubProviderOptions
  /**
   * Update Provider for Github repo
   * - download update json from `https://github.com/{user}/{repo}/raw/HEAD/{versionPath}`
   * - download update asar from `https://github.com/{user}/{repo}/releases/download/v{version}/{name}-{version}.asar.gz`
   *
   * you can setup `urlHandler` in {@link GitHubProviderOptions} to modify url before request
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

  private async parseURL(extraPath: string): Promise<string> {
    const url = new URL(
      `/${this.options.user}/${this.options.repo}/${extraPath}`,
      'https://github.com',
    )
    return (await this.urlHandler?.(url) || url).toString()
  }

  private getHeaders(accept: string): Record<string, string> {
    return { Accept: `application/${accept}`, ...this.options.extraHeaders }
  }

  /**
   * @inheritdoc
   */
  public async downloadJSON(name: string, versionPath: string, signal: AbortSignal): Promise<T> {
    const { beta, version, ...info } = await defaultDownloadUpdateJSON(
      await this.parseURL(`raw/${this.options.branch}/${versionPath}`),
      this.getHeaders('json'),
      signal,
    )
    const getURL = (ver: string): Promise<string> => this.parseURL(`releases/download/v${ver}/${name}-${ver}.asar.gz`)

    return {
      ...info,
      version,
      url: await getURL(version),
      beta: {
        ...beta,
        url: await getURL(beta.version),
      },
    } as unknown as T
  }

  /**
   * @inheritdoc
   */
  public async downloadAsar(
    info: UpdateInfoWithURL,
    signal: AbortSignal,
    onDownloading?: (info: DownloadingInfo) => void,
  ): Promise<Buffer> {
    return await defaultDownloadAsar(
      info.url,
      this.getHeaders('octet-stream'),
      signal,
      onDownloading,
    )
  }
}
