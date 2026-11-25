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
 * Clear browsing data. The UI session holds the history, favicons and bookmarks
 * (nedb keeps them in its IndexedDB), so pass includeInterface to clear it too —
 * only once no browser window is left, as clearing under a live one breaks it.
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
