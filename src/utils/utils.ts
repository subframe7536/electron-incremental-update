/**
 * parse Github CDN URL for accelerating the speed of downloading
 *
 * {@link https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L34 some public CDN links}
 */
export function parseGithubCdnURL(originRepoURL: string, cdnPrefix: string, relativeFilePath: string) {
  if (!originRepoURL.startsWith('https://github.com/')) {
    throw new Error('origin url must start with https://github.com/')
  }

  originRepoURL = originRepoURL.trim().replace(/\/?$/, '/').trim()
  relativeFilePath = relativeFilePath.trim().replace(/^\/|\/?$/g, '').trim()
  cdnPrefix = cdnPrefix.trim().replace(/^\/?|\/?$/g, '').trim()

  return originRepoURL.replace('github.com', cdnPrefix) + relativeFilePath
}

/**
 * handle all unhandled error
 * @param callback callback function
 */
export function handleUnexpectedErrors(callback: (err: unknown) => void) {
  process.on('uncaughtException', callback)
  process.on('unhandledRejection', callback)
}
