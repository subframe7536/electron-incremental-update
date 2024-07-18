import type { UpdateInfo, UpdateJSON } from '../utils'
import { isLowerVersionDefault, verifySignatureDefault } from '../utils'
import type { DownloadingInfo, IProvider, URLHandler } from './types'
import { downloadAsarBufferDefault, downloadUpdateJSONDefault } from './download'

export interface GitHubProviderOptions {
  /**
   * github repo root url
   * @example 'https://github.com/electron/electron'
   */
  url: string
  extraHeaders?: Record<string, string>
  /**
   * custom url handler
   *
   * for Github, there are some {@link https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L34 public CDN links}
   */
  urlHandler?: URLHandler
}

export class GitHubProvider implements IProvider {
  private ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36'
  public name = 'GithubProvider'
  public urlHandler?: URLHandler
  private url: URL
  private extraHeaders?: Record<string, string>
  constructor(options: GitHubProviderOptions) {
    this.url = new URL(options.url)
    this.extraHeaders = options.extraHeaders
    this.urlHandler = options.urlHandler

    if (this.url.host !== 'github.com') {
      throw new Error(`${this.name}: invalid github url: ${options.url}`)
    }

    if (!this.url.pathname.endsWith('/')) {
      this.url.pathname += '/'
    }
  }

  private parseURL(isDownloadAsar: boolean, path: string): string {
    const url = this.url.href + path
    return this.urlHandler ? this.urlHandler(url, isDownloadAsar) : url
  }

  public isLowerVersion = isLowerVersionDefault
  public verifySignaure = verifySignatureDefault

  public async downloadJSON(versionPath: string): Promise<UpdateJSON> {
    return await downloadUpdateJSONDefault(
      this.parseURL(false, `HEAD/${versionPath}`),
      { userAgent: this.ua, accept: 'application/json', ...this.extraHeaders },
    )
  }

  public async downloadAsar(
    name: string,
    { version, size }: UpdateInfo,
    onDownloading?: (info: DownloadingInfo) => void,
  ): Promise<Buffer> {
    return await downloadAsarBufferDefault(
      this.parseURL(true, `releases/download/v${version}/${name}-${version}.asar.gz`),
      { userAgent: this.ua, accept: 'application/octet-stream', ...this.extraHeaders },
      size,
      onDownloading,
    )
  }
}
