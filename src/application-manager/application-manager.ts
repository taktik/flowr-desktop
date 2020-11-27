import { ApplicationConfig, FlowrApplication } from '@taktik/flowr-common-js'
import { ipcMain, BrowserWindow, app, IpcMainEvent } from 'electron'
import { join } from 'path'
import { storeManager } from '../launcher'
import { Store } from '../frontend/src/store'
import * as fs from 'fs'
import { FlowrWindow } from '../frontend/flowr-window'
import { create, packageJSON, canOpen } from '../applications/FlowrPhone'
import { buildApplicationPreloadPath, buildFileUrl } from './helpers'

interface ApplicationInitConfig {
  application: FlowrApplication
  capabilities?: {[key: string]: boolean}
  config?: ApplicationConfig
}

interface ApplicationCanOpenConfig {
  application: FlowrApplication
  config?: {[key: string]: any}
}

interface ApplicationOpenConfig {
  application: FlowrApplication
  config?: {[key: string]: any}
}

export interface FlowrApplicationWindow extends BrowserWindow {
  capabilities?: {[key: string]: boolean}
  props?: {[key: string]: any}
}

interface ApplicationInitResults {
  initialized: FlowrApplication[],
  errors: ApplicationInitError[]
}

interface ApplicationInitError {
  application: FlowrApplication
  reason: string
}

interface FlowrApplicationInitializer {
  create: (options: ApplicationOptions) => FlowrApplicationWindow
  canOpen: (capabilities?: {[key: string]: boolean}, props?: any) => boolean
  index: string
  package: ApplicationConfig
  preload?: string
  store?: Store<Object>
  config?: {[key: string]: any}
  capabilities?: {[key: string]: boolean}
}

export interface ApplicationOptions {
  config: {[key: string]: any},
  preload?: string,
  index: string,
  store?: Store<Object>,
  capabilities?: {[key: string]: boolean},
  flowrWindow?: FlowrWindow | null,
  browserWindow?: BrowserWindow | null,
}

export class ApplicationManager {
  private applications: {[key: string]: FlowrApplicationInitializer} = {}
  private activeWindows: {[key: string]: FlowrApplicationWindow} = {}

  // Temp properties while waiting to find a better way to handle windows
  private _flowrWindow: FlowrWindow | null = null
  get flowrWindow() {
    return this._flowrWindow
  }
  set flowrWindow(flowrWindow: FlowrWindow) {
    this._flowrWindow = flowrWindow
    flowrWindow.on('close', () => this._flowrWindow = null)
  }
  private _browserWindow: BrowserWindow | null = null
  get browserWindow() {
    return this._browserWindow
  }
  set browserWindow(browserWindow: BrowserWindow) {
    this._browserWindow = browserWindow
    browserWindow.on('close', () => this._browserWindow = null)
  }
  // end

  constructor() {
    this.processApplicationsConfigs = this.processApplicationsConfigs.bind(this)
    this.openApplication = this.openApplication.bind(this)
    this.canOpenApplication = this.canOpenApplication.bind(this)
    ipcMain.on('initialize-applications-sync', this.processApplicationsConfigs)
    ipcMain.on('open-application', this.openApplication)
    ipcMain.on('can-open-application', this.canOpenApplication)
  }

  initLocalApps(clearStore: boolean = false): Promise<void[]> {
    return new Promise((resolve, reject) => {
      // Potential caveats of "withFileTypes" option with asar archives: https://github.com/electron/electron/issues/25349
      fs.readdir(join(app.getAppPath(), 'build'), { withFileTypes: true }, (err, files) => {
        if (err) {
          reject(err)
          return
        }
        const registeringPromises: Promise<void>[] = files
          .filter(file => file.isDirectory())
          // Register applications
          .map(file => this.registerApp(file.name, clearStore))

        Promise.all(registeringPromises)
          .then(resolve)
          .catch(reject)
      })
    })
  }

  isRegistered(applicationTitle: string): boolean {
    return !!this.applications[applicationTitle]
  }

  async registerApp(name: string, clearStore: boolean = false): Promise<void> {
    try {
      console.log('Registering app', name)
      // Can't easily rename fusebox output, so we'll leave the ${name}/${name} folder/file structure for now
      // const { create, packageJSON, canOpen } = await import(`./applications/${name}`)
      // const app = (await import(`./applications/${name}/${name}-loader.js`))[name]
      // const { create, packageJSON } = app
      const preload = buildApplicationPreloadPath(name)
      const index = buildFileUrl(name)
      const store = storeManager.createStore<Object>(name, {})

      if (clearStore) {
        // Clear application storage on client start
        store.reset({})
      }

      if (!packageJSON || !packageJSON.title) {
        throw Error('Invalid app: no title defined in app\'s package')
      }

      this.applications[packageJSON.title] = {
        create,
        package: packageJSON,
        preload,
        index,
        store,
        canOpen,
      }
      console.log('Successfully registered app', name)
    } catch (e) {
      console.error('Cannot register application:', e)
    }
  }

  unregisterApp(name: string): boolean {
    if (this.isRegistered(name)) {
      return delete this.applications[name]
    }
    console.warn(`Could not unregister application ${name}: it was not registered in the first place.`)
    return false
  }

  processApplicationsConfigs(e: IpcMainEvent, applicationConfigs: ApplicationInitConfig[]): void {
    const applicationInitDefault: ApplicationInitResults = { initialized: [], errors: [] }
    const applicationsInit: ApplicationInitResults = applicationConfigs.reduce((statuses, applicationConfig) => {
      const applicationName = applicationConfig.application.name
      const errors = [...statuses.errors]
      const initialized = [...statuses.initialized]
      if (this.isRegistered(applicationName)) {
        this.applications[applicationName].capabilities = applicationConfig.capabilities || {}
        this.applications[applicationName].config = applicationConfig.config || {}
        initialized.push(applicationConfig.application)
      } else {
        const reason = 'Application not registered'
        errors.push({ application: applicationConfig.application, reason })
      }
      return { initialized, errors }
    }, applicationInitDefault)
    e.returnValue = applicationsInit
  }

  openApplication(e: IpcMainEvent, openAppConfig: ApplicationOpenConfig): void {
    let err: string | null = null

    try {
      const appName = openAppConfig.application ? openAppConfig.application.name : ''

      if (this.isRegistered(appName)) {
        const application = this.applications[appName]
        const openConfig = openAppConfig.config || {}
        let applicationWindow = this.activeWindows[appName]

        if (!applicationWindow) {
          const config = { ...application.config, ...openConfig }
          applicationWindow = this.activeWindows[appName] = application.create({
            config,
            preload: application.preload,
            index: application.index,
            store: application.store,
            capabilities: application.capabilities,
            flowrWindow: this._flowrWindow,
            browserWindow: this._browserWindow,
          })
          applicationWindow.on('close', () => delete this.activeWindows[appName])
        } else {
          this.setProperty(applicationWindow, 'capabilities', application.capabilities)
          this.setProperties(applicationWindow, openConfig)
        }
        if (openConfig.show) {
          applicationWindow.show()
        }
      } else {
        if (appName) {
          err = `Cannot open application ${appName}, it is not registered.`
        } else {
          err = 'No application provided.'
        }
      }
    } catch (e) {
      console.error('Error opening app', e)
      err = e.message
    }
    e.returnValue = { err }
  }

  canOpenApplication(e: IpcMainEvent, openConfig: ApplicationCanOpenConfig) {
    const appName = openConfig.application ? openConfig.application.name : ''
    const application = this.applications[appName]
    let returnValue = false
    try {
      returnValue = !!application && application.canOpen(application.capabilities, openConfig.config)
    } catch (e) {
      console.error('Error retrieving open capabilities', e)
    }
    e.returnValue = returnValue
  }

  languageChanged(lang: string) {
    Object.values(this.activeWindows).forEach(activeWindow => {
      this.setProperty(activeWindow, 'lang', lang)
    })
  }

  setProperties(appWindow: BrowserWindow, props: {[key: string]: any}) {
    Object.entries(props).forEach(prop => {
      this.setProperty(appWindow, prop[0], prop[1])
    })
  }

  setProperty(appWindow: BrowserWindow, name: string, value: any) {
    const propertyDescriptor = Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(appWindow), name)
    if (propertyDescriptor && propertyDescriptor.set) {
      Reflect.set(appWindow, name, value)
    }
  }

  destroy(): void {
    ipcMain.removeListener('initialize-applications-sync', this.processApplicationsConfigs)
    ipcMain.removeListener('open-application', this.openApplication)
    ipcMain.removeListener('can-open-application', this.canOpenApplication)
  }

  hideAllApplications() {
    Object.values(this.activeWindows)
      .forEach(win => win.hide())
  }

  closeAllApplications() {
    Object.values(this.activeWindows)
      .forEach(win => win.close())
  }
}
