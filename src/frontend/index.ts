import { resolve, join } from 'path'
import { homedir } from 'os'
import { ipcMain, Menu, app, BrowserWindowConstructorOptions } from 'electron'
import { initConfigData, Store } from './src/store'
import { FlowrWindow } from './flowr-window'
import { extend } from 'lodash'
import { URL } from 'url'
const network = require('network')
const deepExtend = require('deep-extend')
import defaultBrowserWindowOptions from './defaultBrowserWindowOptions'
const FlowrDataDir = resolve(homedir(), '.flowr')
export const FRONTEND_CONFIG_NAME = 'user-preferences'
export const DEFAULT_FRONTEND_STORE = {
  // 800x600 is the default size of our window
  windowBounds: { width: 1280, height: 720 },
  channelData: {},
  isMaximized: false,
  clearAppDataOnStart: false,
}
type NetworkInteface = {
  name: string,
  type:string,
  ip_address: string,
  mac_address: string,
}
export function initFlowrConfig(data: object) {
  initConfigData(join(FlowrDataDir, `${FRONTEND_CONFIG_NAME}.json`), data)
}

const RELOAD_INTERVAL = 120000 // 2min

let isDebugMode: boolean
let isHiddenMenuDisplayed = false
let isLaunchedUrlCorrect = true
let reloadTimeout: number | undefined

export function buildBrowserWindowConfig(flowrStore: Store, options: BrowserWindowConstructorOptions): BrowserWindowConstructorOptions {
  return extend(options, defaultBrowserWindowOptions(flowrStore))
}

export async function createFlowrWindow(flowrStore: Store): Promise<FlowrWindow> {
  const mac = await getMacAddress()

  const defaultUrl = buildFileUrl('config.html')
  const kiosk = flowrStore.get('isKiosk') || false
  const url = new URL(flowrStore.get('extUrl') || defaultUrl)
  // Create the browser window.
  const opts = buildBrowserWindowConfig(flowrStore, {
    icon: resolve(app.getAppPath(), 'static/app-icons/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      partition: 'persist:view', // needed to display webcame image
      preload: buildExportPath('exportNode.js'),
    },
  })

  const mainWindow = new FlowrWindow(flowrStore, opts)

  if (kiosk) {
    // No menu is kiosk mode
    const appMenu = Menu.buildFromTemplate([])
    Menu.setApplicationMenu(appMenu)
  }

  if (flowrStore.get('isMaximized')) {
    mainWindow.maximize()
  }
  // mainWindow.setAspectRatio(16/9)
  mainWindow.setMenuBarVisibility(false)
  // mainWindow.setAlwaysOnTop(true, 'floating', 0)

  url.searchParams.set('mac', mac)
  mainWindow.loadURL(url.href)
  reloadTimeout = setInterval(reload, RELOAD_INTERVAL)

  // Open the DevTools.
  if (process.env.ENV === 'dev') {
    mainWindow.webContents.openDevTools()
    isDebugMode = true
  }

  function displayHiddenMenu(): void {
    const flowrUrl = flowrStore.get('extUrl') || buildFileUrl('config.html')
    const template: any = [
      { label: 'Menu',
        submenu: [
          { label: 'Config',
            click() {
              const formattedPath = buildFileUrl('config.html')
              console.log('formattedPath', formattedPath)
              mainWindow.loadURL(formattedPath)
              isHiddenMenuDisplayed = true
            },
          },
          {
            label: 'Flowr',
            click() {
              isHiddenMenuDisplayed = false
              mainWindow.loadURL(flowrUrl)
            },
          },
          {
            label: 'Hide Menu',
            click() {
              mainWindow.setMenuBarVisibility(false)
              if (isHiddenMenuDisplayed) {
                mainWindow.loadURL(flowrUrl)
              }
            },
          },
        ]},
    ]

    const appMenu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(appMenu)
    mainWindow.setMenuBarVisibility(true)
  }

  const _ipcEvents: {[key: string]: (...args: any[]) => void} = {
    FlowrIsInitializing: () => {
      clearInterval(reloadTimeout)
      isLaunchedUrlCorrect = true
    },
    getAppConfig: (evt: any) => {
      const storedConfig =  flowrStore.get('flowrConfig')
      const  config: any =  {
        debugMode : isDebugMode,
        isLaunchedUrlCorrect,
        deinterlacing: flowrStore.get('deinterlacing'),
      }
      // no need to expose the complete config
      if (storedConfig && storedConfig.ozoneApi) {
        const ozoneApi = storedConfig.ozoneApi.hostProxy || ''
        const flowrApi = (storedConfig.flowrApi && storedConfig.flowrApi.hostProxy) || ''
        const socketApi = (storedConfig.socketApi && storedConfig.socketApi.host) || ''
        const pushVodSocketApi = (storedConfig.pushVodSocketApi && storedConfig.pushVodSocketApi.host) || ''
        const aneviaVodSocketApi = (storedConfig.aneviaVodSocketApi && storedConfig.aneviaVodSocketApi.host) || ''

        config.appConfig = {
          ozoneApi: {
            hostProxy: ozoneApi,
          },
          flowrApi: {
            hostProxy: flowrApi,
          },
          socketApi: {
            host: socketApi,
          },
          pushVodSocketApi:{
            host: pushVodSocketApi,
          },
          aneviaVodSocketApi:{
            host: aneviaVodSocketApi,
          },
        }
      }

      config.extUrl = flowrStore.get('extUrl')
      config.isKiosk = flowrStore.get('isKiosk')
      config.clearAppDataOnStart = flowrStore.get('clearAppDataOnStart')

      evt.sender.send('receiveConfig', config)
    },
    getMacAddress: async (evt: any) => {
      const usedMacAddress = await getMacAddress()
      evt.sender.send('receiveMacAddress', usedMacAddress)
    },
    updateAppConfig: (evt: any, data: any) => {
      const currentConfig = flowrStore.get('flowrConfig')
      const newConfig =  deepExtend(currentConfig, data)
      console.log(JSON.stringify(data))
      flowrStore.set('flowrConfig', newConfig)
      app.relaunch()
      app.quit()
    },
    setDebugMode: (evt: any, debugMode: boolean) => {
      isDebugMode = debugMode
      if (isDebugMode) {
        mainWindow.webContents.openDevTools()
      } else {
        mainWindow.webContents.closeDevTools()
      }
    },
    setDeinterlacingMode: (evt: any, deinterlacingMode: any) => {
      flowrStore.set('deinterlacing', deinterlacingMode)
    },
    setClearAppDataOnStart: (evt: any, clearAppDataOnStart: any) => {
      flowrStore.set('clearAppDataOnStart', clearAppDataOnStart)
    },
    setKioskMode: (evt: any, isKiosk: boolean) => {
      flowrStore.set('isKiosk', isKiosk)
      app.relaunch()
      app.quit()
    },
    setExtUrl: (evt: any, newExtURl: string) => {
      console.log('set new ext url', newExtURl)
      flowrStore.set('extUrl', newExtURl)
      app.relaunch()
      app.quit()
    },
    openConfigMode: displayHiddenMenu,
  }
  Object.entries(_ipcEvents).forEach(event => ipcMain.on(...event))
  mainWindow.on('close', () => Object.entries(_ipcEvents).forEach(event => ipcMain.removeListener(...event)))

  function buildFileUrl(fileName: string): string {
    let result: string
    if (process.env.ENV === 'dev') {
      result = `http://localhost:4444/${fileName}`
    } else {
      result = join('file://', app.getAppPath(), 'build', fileName)
    }
    return result
  }

  function buildExportPath(fileName: string): string {
    let result: string = resolve(app.getAppPath(), `build/${fileName}`)
    if (process.env.ENV !== 'dev') {
      result = join(app.getAppPath(), `/build/${fileName}`)
    }
    return result
  }

  function getMacAddress(): Promise<string> {
    return new Promise(((resolve, reject) => {
      network.get_active_interface((err: Error, obj: any) => {
        if (err) {
          console.warn('No active network interface found')
          network.get_interfaces_list((interfaces: NetworkInteface[]) => {
            if (interfaces.length > 0) {
              resolve(interfaces[0].mac_address)
            } else {
              reject('No network interface found')
            }
          })
        }
        if (obj && obj.mac_address) {
          resolve(obj.mac_address)
        } else {
          reject(Error('no Mac Address Found'))
        }
      })
    }))
  }

  function reload() {
    if (mainWindow) {
      mainWindow.reload()
    }
  }

  return mainWindow
}
