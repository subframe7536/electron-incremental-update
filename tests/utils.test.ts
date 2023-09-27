import { describe, expect, it } from 'vitest'
import { parseGithubCdnURL } from '../src/utils/utils'

describe('parseGithubCdnURL', () => {
  it('should throw an error if url does not start with https://github.com/', () => {
    const repository = 'http://notgithub.com/owner/repo'
    const cdnPrefix = 'cdn.example.com'
    const relativeFilePath = 'path/to/file'

    expect(() =>
      parseGithubCdnURL(repository, cdnPrefix, relativeFilePath),
    ).toThrowError('url must start with https://github.com/')
  })

  it('should return the correct URL with the given parameters', () => {
    const repository = 'https://github.com/owner/repo'
    const cdnPrefix = 'cdn.example.com'
    const relativeFilePath = 'path/to/file'

    expect(
      parseGithubCdnURL(repository, cdnPrefix, relativeFilePath),
    ).toEqual('https://cdn.example.com/owner/repo/path/to/file')
  })

  it('should handle trailing slashes and leading slashes in cdnPrefix and relativeFilePath', () => {
    const repository = 'https://github.com/owner/repo/'
    const cdnPrefix = '/cdn.example.com/ '
    const relativeFilePath = '/path/to/file /'

    expect(
      parseGithubCdnURL(repository, cdnPrefix, relativeFilePath),
    ).toEqual('https://cdn.example.com/owner/repo/path/to/file')
  })
})
