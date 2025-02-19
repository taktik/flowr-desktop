import { ipcMain, app, BrowserWindowConstructorOptions } from 'electron'
import { extend } from 'lodash'
import { networkEverywhere } from 'network-everywhere'
import { homedir, platform } from 'os'
import { resolve, join } from 'path'
import { URL } from 'url'

import { initConfigData, Store } from './src/store'
import { DeviceDetailHelper } from './src/deviceDetail'
import { FlowrWindow } from './flowr-window'
import defaultBrowserWindowOptions from './defaultBrowserWindowOptions'
import { IFlowrStore, VirtualKeyboardMode } from './src/interfaces/flowrStore'
import { buildPreloadPath } from '../common/preload'
import { initializeIpcLogging } from './src/logging'
import { LogSeverity } from './src/logging/types'
import { buildFileUrl, monitorActivity } from '../application-manager/helpers'
import { Timer } from '../common/timer'
import { IPlayerStore, PlayerPosition } from "./src/interfaces/playerStore";
import { storeManager } from "../launcher";
import { DEFAULT_PLAYER_STORE } from "./src/players/playerStore";
import { openConfigWindow } from '../config/configWindow'
import { getLogger } from './src/logging/loggers'
import { FLOWR_PARTITION } from '../common/partitions'

const FlowrDataDir = resolve(homedir(), '.flowr')
const log = getLogger('Frontend index')

export const FRONTEND_CONFIG_NAME = 'user-preferences'
export const DEFAULT_FRONTEND_STORE: IFlowrStore = {
  debugMode: false,
  // 800x600 is the default size of our window
  windowBounds: { width: 1280, height: 720 },
  isMaximized: false,
  clearAppDataOnStart: false,
  applications: { 'FlowrPhone': { clearAppDataOnStart: false } },
  flowrMonitoringTime: 1000,
  extUrl: '',
  isKiosk: false,
  deinterlacing: false,
  enableVirtualKeyboard: false,
  logLevel: LogSeverity.INFO,
  virtualKeyboardConfig: {
      mode: VirtualKeyboardMode.INTERNAL,
  },
}
export async function initFlowrConfig(data: IFlowrStore | null): Promise<void> {
  await initConfigData(join(FlowrDataDir, `${FRONTEND_CONFIG_NAME}.json`), data)
}
const DEVICE_DETAIL_PATH = join(FlowrDataDir, 'device.json')
const devicesDetailsHelper = new DeviceDetailHelper(DEVICE_DETAIL_PATH)
const RELOAD_TIMEOUT = 60000 // 1min

let isLaunchedUrlCorrect = true
let lastError = ''

export function buildBrowserWindowConfig(flowrStore: Store<IFlowrStore>, options: BrowserWindowConstructorOptions): BrowserWindowConstructorOptions {
  return extend(options, defaultBrowserWindowOptions(flowrStore))
}

export function createFlowrWindow(flowrStore: Store<IFlowrStore>, isDebugMode: () => boolean, setDebugMode: (debugMode: boolean) => void): FlowrWindow {
  let reloadTimer: Timer | undefined
  let cancelActivityMonitor: (() => void) | undefined

  // Pre instantiate the player store to check if we have a stored value for player position
  const playerStore = storeManager.createStore<IPlayerStore>('player', { defaults: DEFAULT_PLAYER_STORE})
  const position: PlayerPosition = playerStore.get('position')
  const isPlayerInBackground = position === PlayerPosition.BACKGROUND

  // Create the browser window.
  const opts = buildBrowserWindowConfig(flowrStore, {
    icon: resolve(app.getAppPath(), 'static/app-icons/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      sandbox: false,
      partition: FLOWR_PARTITION, // needed to display webcam image
      preload: buildPreloadPath('exportNode.js'),
    },
    transparent: isPlayerInBackground,
    frame: !isPlayerInBackground,
  })

  const mainWindow = new FlowrWindow(flowrStore, opts)

  if (platform() === 'win32' && isPlayerInBackground) {
    // Workaround because some versions of Windows handles transparent background as click through by default
    // This allows for the main window to remain clickable
    mainWindow.setBackgroundColor('#01ffffff')
  }

  function loadOtherPage(name: string, loader: () => Promise<void>) {
    return (): Promise<void> => {
      reloadTimer?.clear()
      cancelActivityMonitor?.()
      return loader()
        .catch(e => {
          log.error(`Failed to load ${name} page.... sorry but can't do anything else for you`, e)
        })
    }
  }

  async function closeConfigPageCallback(shouldReloadFlowr: boolean): Promise<void> {
    if (shouldReloadFlowr) {
      await loadFlowr()
    }
    setDebugMode(flowrStore.get('debugMode'))
  }

  const loadConfigPage = loadOtherPage('configuration', () => openConfigWindow({
    flowrStore,
    debugMode: isDebugMode(),
    lastError,
    isLaunchedUrlCorrect,
    parent: mainWindow,
    done: closeConfigPageCallback,
  }))

  const loadRedirectPage = loadOtherPage('redirect', () => {
    const url = buildFileUrl('redirect.html')
    return mainWindow.loadURL(url)
  })

  async function loadFlowr(): Promise<void> {
    const storedUrl = flowrStore.get('extUrl')

    try {
      // Ensure validity of stored URL
      const url = new URL(storedUrl)
    
      try {
        const mac = await getActiveMacAddress()
        // set mac address in the URL to ensure backward compatibility with Flowr 5.1
        url.searchParams.set('mac', mac)
      } catch (error) {
        log.warn('Failed to retrieve/set active mac address', error)
      }
  
      try {
        await mainWindow.loadURL(url.href)
      } catch (untypedError) {
        const e = untypedError as NodeJS.ErrnoException
  
        if (e.code === 'ERR_ABORTED') {
          // ignore => it means the page changed its hash in the meantime
          return
        }
        log.warn('Error loading flowr window', e)
        lastError = e.message
        await loadRedirectPage()
        reloadTimer = new Timer(() => void loadFlowr(), RELOAD_TIMEOUT)
      }
    } catch (e) {
      isLaunchedUrlCorrect = false
      log.error(`Invalid FlowR URL: ${storedUrl}. Display config page.`)
      await loadConfigPage()
    }
  }

  async function getActiveMacAddress(): Promise<string> {
    if (flowrStore.get('useRealMacAddress')) {
      return (await networkEverywhere.getActiveInterface()).mac
    }
    return (await devicesDetailsHelper.getDeviceDetails()).uuid
  }

  async function getAllMacAddresses(): Promise<string[]> {
    const activeMac = await getActiveMacAddress()
    const allMac = await networkEverywhere.getAllMacAddresses()
    return [activeMac, ...allMac]
  }

  function getIpAddress(): Promise<string> {
    return networkEverywhere.getIpAddress()
  }

  function reload() {
    reloadTimer?.clear()
    cancelActivityMonitor?.()
    void loadFlowr()
  }

  const _ipcEvents: { [key: string]: (...args: any[]) => void } = {
    FlowrIsInitializing: () => {
      reloadTimer?.clear()
      isLaunchedUrlCorrect = true
      cancelActivityMonitor?.()
      cancelActivityMonitor = monitorActivity(mainWindow, flowrStore.get('flowrMonitoringTime'), reload)
    },
    reload,
    openConfigMode: loadConfigPage,
  }
  const _ipcHandles = {
    getMacAddress: () => getActiveMacAddress(),
    getActiveMacAddress: () => getActiveMacAddress(),
    getAllMacAddresses: () => getAllMacAddresses(),
    getIpAddress: () => getIpAddress(),
    getClientMetadata: () => ({
      name: app.getName(),
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
    }),
    captureScreen: async () => {
      const image = await mainWindow.capturePage()
      return image.toDataURL()
    },
    getAudioDevicesPreferences: () => {
      return flowrStore.get('audioDevices')
    },
    getErrorLoadingFlowr: () => ({
      remainingTime: reloadTimer?.remainingTime,
      url: flowrStore.get('extUrl') || 'Flowr URL has not been configured !',
      lastError,
    }),
  }
  Object.entries(_ipcEvents).forEach(event => ipcMain.on(...event))
  Object.entries(_ipcHandles).forEach(event => ipcMain.handle(...event))
  mainWindow.on('close', () => {
    Object.entries(_ipcEvents).forEach(event => ipcMain.removeListener(...event))
    Object.keys(_ipcHandles).forEach(eventChannel => ipcMain.removeHandler(eventChannel))
  })

  mainWindow.setMenuBarVisibility(false)
  void loadFlowr()

  // Open the DevTools.
  if (isDebugMode()) {
    mainWindow.webContents.openDevTools()
  }

  initializeIpcLogging(mainWindow.webContents)

  return mainWindow
}
