import { defaultVerifySignature } from '../utils/crypto'
import { defaultUnzipFile } from '../utils/zip'
import { type UpdateInfo, type UpdateJSON, defaultIsLowerVersion } from '../utils/version'
import type { DownloadingInfo, IProvider } from './types'

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
  public abstract downloadJSON(versionPath: string): Promise<UpdateJSON>

  /**
   * @inheritdoc
   */
  public abstract downloadAsar(name: string, info: UpdateInfo, onDownloading?: (info: DownloadingInfo) => void,): Promise<Buffer>
}
