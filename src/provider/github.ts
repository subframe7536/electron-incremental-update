import type { UpdateInfo, UpdateJSON } from '../utils'
import type { DownloadingInfo, URLHandler } from './types'
import { defaultDownloadAsar, defaultDownloadUpdateJSON } from './download'
import { BaseProvider } from './base'

export interface GitHubProviderOptions {
  /**
   * github repo root url
   * @example 'https://github.com/electron/electron/'
   */
  url: string
  /**
   * extra headers
   */
  extraHeaders?: Record<string, string>
  /**
   * custom url handler
   *
   * for Github, there are some {@link https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L34 public CDN links}
   * @example
   * urlHandler: (url, isDownloadAsar) => {
   *   if (isDownloadAsar) {
   *     return url.replace('github.com', 'raw.githubusercontent.com')
   *   }
   *   return url
   * }
   */
  urlHandler?: URLHandler
}

export class GitHubProvider extends BaseProvider {
  private ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'
  public name = 'GithubProvider'
  public urlHandler?: URLHandler
  private url: string
  private extraHeaders?: Record<string, string>
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
    this.extraHeaders = options.extraHeaders
    this.urlHandler = options.urlHandler

    if (!options.url.startsWith('https://github.com')) {
      throw new Error(`${this.name}: invalid github url: ${options.url}`)
    }

    this.url = options.url
    if (!this.url.endsWith('/')) {
      this.url += '/'
    }
  }

  private async parseURL(isDownloadAsar: boolean, extraPath: string): Promise<string> {
    const _url = new URL(this.url)
    _url.hostname = isDownloadAsar ? 'github.com' : 'raw.githubusercontent.com'
    _url.pathname += extraPath
    return (await this.urlHandler?.(_url, isDownloadAsar) || _url).toString()
  }

  public async downloadJSON(versionPath: string): Promise<UpdateJSON> {
    return await defaultDownloadUpdateJSON(
      await this.parseURL(false, `HEAD/${versionPath}`),
      { userAgent: this.ua, accept: 'application/json', ...this.extraHeaders },
    )
  }

  public async downloadAsar(
    name: string,
    { version, size }: UpdateInfo,
    onDownloading?: (info: DownloadingInfo) => void,
  ): Promise<Buffer> {
    return await defaultDownloadAsar(
      await this.parseURL(true, `releases/download/v${version}/${name}-${version}.asar.gz`),
      { userAgent: this.ua, accept: 'application/octet-stream', ...this.extraHeaders },
      size,
      onDownloading,
    )
  }
}
