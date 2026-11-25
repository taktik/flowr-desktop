import { session } from 'electron'
import { WEXOND_PARTITION, WEXOND_UI_PARTITION } from '../../common/partitions'
import { getLogger } from '../../frontend/src/logging/loggers'

const log = getLogger('Browsing data')

const STORAGES: Electron.ClearStorageDataOptions['storages'] = [
  'cookies',
  'filesystem',
  'indexdb',
  'localstorage',
  'shadercache',
  'serviceworkers',
  'cachestorage',
]

/**
 * Clear browsing data.
 *
 * Both sessions hold some: the tabs' one what they browsed, the UI's one the
 * history, favicons and bookmarks. Those are nedb databases, and although
 * they are declared with a file name, webpack resolves nedb's `browser` field
 * for the renderer, so they are really stored through localforage — in the UI
 * session's IndexedDB, not on disk.
 *
 * @param includeInterface also clear the UI session. Callers must pass true
 *                         only once no browser window is left: clearing
 *                         storage under a live window breaks its rendering.
 */
export const clearBrowsingData = async (includeInterface = false): Promise<void> => {
  const partitions = includeInterface
    ? [WEXOND_PARTITION, WEXOND_UI_PARTITION]
    : [WEXOND_PARTITION]

  for (const partition of partitions) {
    log.info('clear browsing data', partition)
    const ses = session.fromPartition(partition)
    try {
      await ses.clearCache()
      await ses.clearStorageData({ storages: STORAGES })
    } catch (err) {
      log.error(err)
    }
  }
}
