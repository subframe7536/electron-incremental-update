import type { Updater } from '../updater'

/**
 * auto check update, download and install
 */
export async function autoUpdate(updater: Updater): Promise<void> {
  if (await updater.checkUpdate() && await updater.downloadUpdate()) {
    updater.quitAndInstall()
  }
}
