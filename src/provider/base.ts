import type { UpdateInfo, UpdateJSON } from '../utils'
import { defaultIsLowerVersion, defaultUnzipFile, defaultVerify } from '../utils'
import type { DownloadingInfo, IProvider } from './types'

export abstract class BaseProvider implements IProvider {
  public name = 'BaseProvider'

  public isLowerVersion = defaultIsLowerVersion
  public verifySignaure = defaultVerify
  public unzipFile = defaultUnzipFile

  public abstract downloadJSON(versionPath: string): Promise<UpdateJSON>

  public abstract downloadAsar(name: string, info: UpdateInfo, onDownloading?: (info: DownloadingInfo) => void,): Promise<Buffer>
}
