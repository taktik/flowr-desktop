import { session } from 'electron'
import { WEXOND_PARTITION } from '../../common/partitions'
import { getLogger } from '../../frontend/src/logging/loggers'

const log = getLogger('Browsing data')

export const clearBrowsingData = async (): Promise<void> => {
  log.info('clear browsing data')
  const ses = session.fromPartition(WEXOND_PARTITION)
  try {
    await ses.clearCache()
    await ses.clearStorageData({
      storages: [
        'cookies',
        'filesystem',
        'indexdb',
        'localstorage',
        'shadercache',
        'serviceworkers',
        'cachestorage',
      ],
    })
  } catch (err) {
    log.error(err)
  }
}
