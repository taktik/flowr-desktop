import { initialize } from '@electron/remote/main'
import {app, BrowserWindow, ipcMain, IpcMainEvent, protocol, Session, net} from 'electron'
import * as log from 'electron-log'
import { cloneDeep, mergeWith } from 'lodash'
import { homedir } from 'os'
import { resolve, join } from 'path'
import { FlowrWindow } from 'src/frontend/flowr-window'
import { createWexondWindow, setWexondLog } from '~/main'
import { clearBrowsingData } from '~/main/clearBrowsingData'
import { ApplicationManager } from '../application-manager/application-manager'
import { openDevTools } from '../common/devTools'
import { FullScreenManager } from '../common/fullscreen'
import { existsSync } from 'fs';

import {
  buildBrowserWindowConfig,
  createFlowrWindow,
  DEFAULT_FRONTEND_STORE,
  FRONTEND_CONFIG_NAME,
  initFlowrConfig
} from '../frontend'
import defaultBrowserWindowOptions from '../frontend/defaultBrowserWindowOptions'
import { IFlowrStore } from '../frontend/src/interfaces/flowrStore'
import { IFlowrDesktopConfig } from '../frontend/src/interfaces/IFlowrDesktopConfig'
import { initializeLogging } from '../frontend/src/logging'
import { getLogger } from '../frontend/src/logging/loggers'
import { Store, StoreManager } from '../frontend/src/store'
import { keyboard } from '../keyboard/keyboardController'
import initComponents from '../wexond/extensions/components'
import { WexondOptions } from '../wexond/main/app-window'
import { getMigrateUserPreferences } from './migration/fromFlowrClientToFlowrPcClient'
import {init as initBeiReader} from "../beidReader/beid";
import { ThermalPrinterProcess} from "../printer/thermal-printer-process";
initializeLogging()

const FlowrDataDir = resolve(homedir(), '.flowr')

export const storeManager = new StoreManager(FlowrDataDir)
const applicationManager = new ApplicationManager()

// https://www.npmjs.com/package/@electron/remote
let remoteModuleInitialized = false

const mainLogger = getLogger('Launcher')

app.on('render-process-gone', (_, webContents, details) => {
  const windowTitle = webContents.getTitle()

  if (
    details.reason === 'clean-exit' ||
    windowTitle === 'DevTools'
  ) return

  mainLogger.warn(`A render process (${windowTitle}) has disappeared: ${JSON.stringify(details)}`)
})

app.on('child-process-gone', (_, details) => {
  if (details.reason === 'clean-exit') return
  mainLogger.warn(`A child process has disappeared: ${JSON.stringify(details)}`)
})

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { stream: true }}
]);

async function main() {
  const migrateUserPreferences = getMigrateUserPreferences(`${FRONTEND_CONFIG_NAME}.json`)
  await initFlowrConfig(migrateUserPreferences)

  const userAppData = resolve(homedir(), '.flowr-electron')

  app.setPath('userData', userAppData)
  app.on('session-created', (sess: Session) => {
    sess.protocol.handle('local-file', (request: { url: string }) => {
      const requestedPath = new URL(request.url).pathname;
      const decodedUrl = decodeURIComponent(requestedPath);
      if (decodedUrl.includes('../')) {
        return new Response('Forbidden', { status: 403 });
      }
      const absoluteFilePath = join(homedir(), '.flowr', requestedPath);
      try {
        // CHECK IF FILE EXISTS
        if (!existsSync(absoluteFilePath)) {
          return new Response('File not found', { status: 404 });
        }
        return net.fetch(`file://${absoluteFilePath}`);
      } catch (err) {
        return new Response('Internal Server Error', { status: 500 });
      }
    })
  })
  log.transports.file.level = 'verbose'
  log.transports.file.file = resolve(app.getPath('userData'), 'log.log')
  setWexondLog(log)
  ipcMain.setMaxListeners(0)

  let flowrWindow: FlowrWindow | undefined = undefined
  let browserWindow: BrowserWindow | undefined = undefined

  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (flowrWindow) {
        if (flowrWindow.isMinimized()) flowrWindow.restore()
        flowrWindow.focus()
      }
    })
  }

  process.on('uncaughtException', error => {
    log.error(error)
  })

  const openBrowserWindow = async (
    flowrStore: Store<IFlowrStore>,
    debugMode: boolean,
    options: Omit<WexondOptions, 'enableVirtualKeyboard'>,
  ): Promise<void> => {

    browserWindow?.close()
    if (!remoteModuleInitialized) {
      initialize()
      remoteModuleInitialized = true
    }

    const wexondOptions = {
      ...options,
      enableVirtualKeyboard: flowrStore.get('enableVirtualKeyboard'),
    }

    browserWindow = await createWexondWindow(wexondOptions, flowrWindow || undefined, buildBrowserWindowConfig(flowrStore, {}))
    openDevTools(browserWindow.webContents, debugMode)
    if (browserWindow && flowrWindow) {
      FullScreenManager.applySameWindowState(flowrWindow, browserWindow)
    }
    applicationManager.browserWindow = browserWindow

    flowrWindow.webContents.setAudioMuted(true)
    browserWindow.webContents.focus()

    flowrWindow?.hide()

    browserWindow.on('close', () => {
      if (browserWindow && flowrWindow) {
        FullScreenManager.applySameWindowState(browserWindow, flowrWindow)
      }
      browserWindow = undefined
      flowrWindow?.webContents.setAudioMuted(false)
      flowrWindow?.show()
    })
  }

  function onReady() {
    /*
      start the initialization of components (e.g. Widevine) in the background
      The Promise will be awaited before loading Wexond
    */
    void initComponents()
    const flowrStore = initFlowrStore()

    keyboard.flowrStore = flowrStore

    function isDebugMode(): boolean {
      return process.env.ENV === 'dev' || flowrStore.get('debugMode')
    }

    app.on('activate', () => {
      if (flowrWindow === null) {
        initFlowr(flowrStore, isDebugMode)
      }
    })
    initFlowr(flowrStore, isDebugMode)

    ipcMain.on('window-focus', () => {
      if (flowrWindow) {
        flowrWindow.webContents.focus()
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    ipcMain.on('flowr-desktop-config', async (event: IpcMainEvent, desktopConfig?: IFlowrDesktopConfig) => {
      const currentFlowrStore = cloneDeep(flowrStore.data)

      if (desktopConfig) {
        /**
         * Merge config from ozone over default one
         * For empty values (null or '') coming from ozone, use the default value
         * If customizer function returns undefined, merging is handled by the method instead
         */
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        const userPreferencesMerged = mergeWith({}, DEFAULT_FRONTEND_STORE, currentFlowrStore, desktopConfig.userPreferences, (a, b) => b === null || b === '' ? a : undefined)
        flowrWindow.initStore(userPreferencesMerged, desktopConfig.player)
        if (flowrWindow.store.get('clearAppDataOnStart')) {
          await clearBrowsingData()
        }
        if (flowrWindow.store.get('enableIdCardReader')) {
          initBeiReader(flowrWindow.webContents)
        }
        if (flowrWindow.store.get('enableThermalPrinter')) {
          ThermalPrinterProcess.init(flowrWindow.webContents)
        }
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    ipcMain.on('open-browser', async (event: Event, options: Omit<WexondOptions, 'enableVirtualKeyboard'>) => {
      await openBrowserWindow(flowrStore, isDebugMode(), options)
    })

    ipcMain.on('close-browser', () => {
      if (browserWindow !== null) {
        browserWindow.close()
      }
    })
    ipcMain.on('hide-applications', () => {
      applicationManager.hideAllApplications()
    })
    ipcMain.on('close-applications', () => {
      if (browserWindow !== null) {
        browserWindow.close()
      }
      applicationManager.closeAllApplications()
    })
    ipcMain.on('open-flowr', () => {
      if (browserWindow !== null) {
        browserWindow.close()
      }
    })
  }

  await app.whenReady()
  void onReady()

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  ipcMain.on('clear-application-data', clearBrowsingData)

  app.on('window-all-closed', () => {
    applicationManager.destroy()
    app.quit()
  })

  function initFlowr(store: Store<IFlowrStore>, isDebugMode: () => boolean) {
    applicationManager.flowrStore = store

    function setDebugMode(debugMode: boolean) {
      applicationManager.setDebugMode(debugMode)

      if (flowrWindow) {
        openDevTools(flowrWindow.webContents, debugMode)
      }
      if (browserWindow) {
        openDevTools(browserWindow.webContents, debugMode)
      }
    }

    try {
      flowrWindow = createFlowrWindow(store, isDebugMode, setDebugMode)
      keyboard.setParentWindow(flowrWindow)
      if (!defaultBrowserWindowOptions(store).kiosk) {
        FullScreenManager.applyDefaultActionOnWindow(flowrWindow)
      }

      applicationManager.flowrWindow = flowrWindow

      flowrWindow.on('close', () => {
        flowrWindow = undefined
      })

      flowrWindow.webContents.setWindowOpenHandler(({ url }) => {
        openBrowserWindow(store, isDebugMode(), {
          clearBrowsingDataAtClose: false,
          openUrl: url,
          maxTab : 0,
        }).catch(e => {
          log.error('Failed to open window at url', url, ':', e)
        })
        return { action: 'deny' }
      })

      ipcMain.on('flowrLanguageChanged', (e: Event, lang: string) => applicationManager.languageChanged(lang))
    } catch (e) {
      console.error('Error in init', e)
    }
  }

  function initFlowrStore(): Store<IFlowrStore> {
    return storeManager.createStore(FRONTEND_CONFIG_NAME, { defaults: DEFAULT_FRONTEND_STORE })
  }
}

void main()
