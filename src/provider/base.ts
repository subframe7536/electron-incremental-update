import { defaultVerifySignature } from '../utils/crypto'
import { defaultUnzipFile } from '../utils/zip'
import { defaultIsLowerVersion } from '../utils/version'
import type { DownloadingInfo, IProvider, UpdateInfoWithURL, UpdateJSONWithURL } from './types'

export abstract class BaseProvider implements IProvider {
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
  public abstract downloadJSON(name: string, versionPath: string, signal: AbortSignal): Promise<UpdateJSONWithURL>

  /**
   * @inheritdoc
   */
  public abstract downloadAsar(info: UpdateInfoWithURL, signal: AbortSignal, onDownloading?: (info: DownloadingInfo) => void,): Promise<Buffer>
}
