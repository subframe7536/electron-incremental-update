import type { DownloadingInfo, IProvider, UpdateInfoWithURL } from './types'

import { defaultVerifySignature } from '../utils/crypto'
import { defaultIsLowerVersion } from '../utils/version'
import { defaultUnzipFile } from '../utils/zip'

export abstract class BaseProvider<T extends UpdateInfoWithURL = UpdateInfoWithURL> implements IProvider<T> {
  public name = 'BaseProvider'
  /**
   * @inheritdoc
   */
  public isLowerVersion = defaultIsLowerVersion
  /**
   * @inheritdoc
   */
  public verifySignaure = defaultVerifySignature
  /**
   * @inheritdoc
   */
  public unzipFile = defaultUnzipFile

  /**
   * @inheritdoc
   */
  public abstract downloadJSON(name: string, versionPath: string, signal: AbortSignal): Promise<T>

  /**
   * @inheritdoc
   */
  public abstract downloadAsar(info: UpdateInfoWithURL, signal: AbortSignal, onDownloading?: (info: DownloadingInfo) => void,): Promise<Buffer>
}
