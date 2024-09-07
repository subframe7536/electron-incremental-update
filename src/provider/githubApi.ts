import { URL } from 'node:url'
import type { DownloadingInfo, URLHandler, UpdateInfoWithURL, UpdateJSONWithURL } from './types'
import { defaultDownloadAsar, defaultDownloadJSON, defaultDownloadUpdateJSON } from './download'
import { BaseProvider } from './base'

export interface GitHubApiProviderOptions {
  /**
   * Github user name
   */
  user: string
  /**
   * Github repo name
   */
  repo: string
  /**
   * Github access token
   */
  token?: string
  /**
   * Extra headers
   */
  extraHeaders?: Record<string, string>
  /**
   * Custom url handler
   */
  urlHandler?: URLHandler
}

type ReleaseApiResult = {
  tag_name: string
  assets: {
    name: string
    browser_download_url: string
  }[]
}[]
const ERROR_MSG = 'Cannot find UpdateJSON in latest release'
export class GitHubApiProvider extends BaseProvider {
  public name = 'GithubApiProvider'
  private options: GitHubApiProviderOptions
  /**
   * Update Provider for Github API, you need to upload `version.json` to release as well
   * - check update from `https://api.github.com/repos/{user}/{repo}/releases?per_page=1`
   * - download update json and get version and download url
   * - download update asar from update info
   *
   * you can setup `urlHandler` in {@link GitHubApiProviderOptions} to modify url before request
   * @param options provider options
   */
  constructor(options: GitHubApiProviderOptions) {
    super()
    this.options = options
  }

  get urlHandler(): URLHandler | undefined {
    return this.options.urlHandler
  }

  set urlHandler(handler: URLHandler) {
    this.options.urlHandler = handler
  }

  private async parseURL(url: string): Promise<string> {
    const _url = new URL(url)
    return (await this.urlHandler?.(_url) || _url).toString()
  }

  private getHeaders(accept: string): Record<string, string> {
    return {
      Accept: `application/${accept}`,
      ...this.options.token ? { Authorization: `token ${this.options.token}` } : {},
      ...this.options.extraHeaders,
    }
  }

  /**
   * @inheritdoc
   */
  public async downloadJSON(name: string, versionPath: string, signal: AbortSignal): Promise<UpdateJSONWithURL> {
    const basename = versionPath.slice(versionPath.lastIndexOf('/') + 1)
    const data = await defaultDownloadJSON<ReleaseApiResult>(
      await this.parseURL(`https://api.github.com/repos/${this.options.user}/${this.options.repo}/releases?per_page=1`),
      this.getHeaders('vnd.github.v3+json'),
      signal,
    )
    const versionAssets = data[0]?.assets.find(asset => asset.name === basename)
    if (!versionAssets) {
      throw new Error(`${ERROR_MSG}, ${'message' in data ? data.message : 'please check the release assets'}`)
    }
    const { beta, version, ...info } = await defaultDownloadUpdateJSON(
      versionAssets.browser_download_url,
      this.getHeaders('json'),
      signal,
    )
    const getURL = (ver: string): Promise<string> => {
      const _ver = data.find(r => r.tag_name === ver)
      if (!_ver) {
        throw new Error(ERROR_MSG)
      }
      const asset = _ver.assets.find(a => a.name === `${name}-${ver}.asar.gz`)
      if (!asset) {
        throw new Error(ERROR_MSG)
      }
      return this.parseURL(asset.browser_download_url)
    }
    return {
      ...info,
      version,
      url: await getURL(version),
      beta: {
        ...beta,
        url: await getURL(beta.version),
      },
    }
  }

  /**
   * @inheritdoc
   */
  public async downloadAsar(
    info: UpdateInfoWithURL,
    signal: AbortSignal,
    onDownloading?: (info: DownloadingInfo) => void,
  ): Promise<Buffer> {
    if (!info.url) {
      throw new Error('Cannot download asar without url')
    }
    return await defaultDownloadAsar(
      info.url,
      this.getHeaders('octet-stream'),
      signal,
      onDownloading,
    )
  }
}
