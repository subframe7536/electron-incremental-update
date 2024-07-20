import { defaultVerify } from '../utils/crypto'
import { defaultUnzipFile } from '../utils/zip'
import { type UpdateInfo, type UpdateJSON, defaultIsLowerVersion } from '../utils/version'
import type { DownloadingInfo, IProvider, URLHandler } from './types'

export abstract class BaseProvider implements IProvider {
  public name = 'BaseProvider'
  public isLowerVersion = defaultIsLowerVersion
  public verifySignaure = defaultVerify
  public unzipFile = defaultUnzipFile

  public abstract downloadJSON(versionPath: string): Promise<UpdateJSON>

  public abstract downloadAsar(name: string, info: UpdateInfo, onDownloading?: (info: DownloadingInfo) => void,): Promise<Buffer>
}
