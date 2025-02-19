import { ApplicationConfig, FlowrApplication } from '@taktik/flowr-common-js'
import { ipcMain, BrowserWindow, IpcMainEvent } from 'electron'
import { storeManager } from '../launcher'
import { Store } from '../frontend/src/store'
import { readdir, readFile } from 'fs/promises'
import { FlowrWindow } from '../frontend/flowr-window'
import { buildApplicationPreloadPath, buildFilePath, getApplicationIndexUrl } from './helpers'
import { getLogger } from '../frontend/src/logging/loggers'
import { IFlowrStore } from '../frontend/src/interfaces/flowrStore'
import { ApplicationInitConfig, ApplicationInitError, ApplicationInitializer, ApplicationOpenConfig, FlowrApplicationInitializer, FlowrApplicationWindow, WindowTypes } from './types'
import { openDevTools } from '../common/devTools'

export class ApplicationManager {
  private logger = getLogger('Applications manager')
  private applications: {[key: string]: FlowrApplicationInitializer} = {}
  private activeWindows: {[key: string]: FlowrApplicationWindow} = {}
  flowrStore?: Store<IFlowrStore>

  // Temp properties while waiting to find a better way to handle windows
  private _flowrWindow: FlowrWindow | null = null
  get flowrWindow(): FlowrWindow | null {
    return this._flowrWindow
  }
  set flowrWindow(flowrWindow: FlowrWindow) {
    this._flowrWindow = flowrWindow
    flowrWindow.on('close', () => this._flowrWindow = null)
  }
  private _browserWindow: BrowserWindow | null = null
  get browserWindow(): BrowserWindow | null{
    return this._browserWindow
  }
  set browserWindow(browserWindow: BrowserWindow) {
    this._browserWindow = browserWindow
    browserWindow.on('close', () => this._browserWindow = null)
  }
  // end

  constructor() {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    this.processApplicationsConfigs = this.processApplicationsConfigs.bind(this)
    this.openApplication = this.openApplication.bind(this)
    this.canOpenApplication = this.canOpenApplication.bind(this)
    this.executeOnWindows = this.executeOnWindows.bind(this)
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/unbound-method */
    ipcMain.handle('initializeApplications', this.processApplicationsConfigs)
    ipcMain.handle('open-application', this.openApplication)
    ipcMain.handle('can-open-application', this.canOpenApplication)
    /* eslint-enable @typescript-eslint/unbound-method */
  }
  
  private async registerApp(name: string): Promise<void> {
    try {

      this.logger.info('Registering app', name)

      const { create, packageJSON, canOpen } = (await import(`../applications/${name}/index.ts`)) as ApplicationInitializer
      const preload = buildApplicationPreloadPath(name)
      const index = getApplicationIndexUrl(name)
      const store = storeManager.createStore<Record<string, any>>(name, { defaults: {} })
      let clearStore = false
      const applicationsOptions = this.flowrStore?.get('applications')

      switch (name) {
        case 'FlowrPhone': {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const appOptions = (applicationsOptions ?? { 'FlowrPhone': { clearAppDataOnStart: false } })['FlowrPhone']
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          clearStore = appOptions.clearAppDataOnStart ?? false
          break
        }
      }

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
        config: (this.flowrStore?.get('applications')?.[name] ?? {}) as { [key:string]: any },
      }
      this.logger.info('Successfully registered app', name)
    } catch (e) {
      this.logger.warn('Cannot register application:', e)
    }
  }

  private async findApp(applicationName: string): Promise<string | void> {
    const files = await readdir(buildFilePath(''), { withFileTypes: true })

    for (const file of files) {
      if (file.isDirectory()) {
        try {
          const packageJSON = JSON.parse((await readFile(buildFilePath(`${file.name}/package.json`), { encoding: 'utf8' }))) as ApplicationConfig

          if (packageJSON.title === applicationName) {
            return file.name
          }
        } catch (e) {
          this.logger.debug(`No package.json in folder "${file.name}"`)
        }
      }
    }

    this.logger.warn(`No package.json for application "${applicationName}"`)
  }

  private isRegistered(applicationTitle: string): boolean {
    return !!this.applications[applicationTitle]
  }

  private executeOnWindows(windows: WindowTypes[], fun: (win: BrowserWindow) => void): void {
    windows
      .flatMap(windowType => {
        switch (windowType) {
          case WindowTypes.FLOWR:
            return this.flowrWindow
          case WindowTypes.WEXOND:
            return this.browserWindow
          case WindowTypes.APPLICATIONS:
            return Object.values(this.activeWindows)
        }
      })
      .filter((winOrNull: BrowserWindow | null): winOrNull is BrowserWindow => !!winOrNull)
      .forEach(fun)
  }

  unregisterApp(name: string): boolean {
    if (this.isRegistered(name)) {
      return delete this.applications[name]
    }
    this.logger.warn(`Could not unregister application ${name}: it was not registered in the first place.`)
    return false
  }

  async processApplicationsConfigs(event: IpcMainEvent, applicationConfigs: ApplicationInitConfig[]): Promise<{ errors: ApplicationInitError[], initialized: FlowrApplication[] }> {
    const errors: ApplicationInitError[] = []
    const initialized: FlowrApplication[] = []

    const processConfig = (applicationName: string, config: ApplicationInitConfig) => {
      this.applications[applicationName].capabilities = config.capabilities || {}
      this.applications[applicationName].config = { ...this.applications[applicationName].config, ...config.config } || {}
      initialized.push(config.application)
    }

    for (const applicationConfig of applicationConfigs) {
      const applicationName = applicationConfig.application.name

      try {
        if (this.isRegistered(applicationName)) {
          processConfig(applicationName, applicationConfig)
        } else {
          const appFolder = await this.findApp(applicationName)
  
          if (appFolder) {
            await this.registerApp(appFolder)
            processConfig(applicationName, applicationConfig)
          } else {
            const reason = `Cannot open application ${applicationName}, it is not available.`
            errors.push({ application: applicationConfig.application, reason })
          }
        }
      } catch (e) {
        const reason = (e as Error).message ?? `Failed to initialize application "${applicationName}"`
        errors.push({ application: applicationConfig.application, reason })
      }
    }

    return { errors, initialized }
  }

  openApplication(event: IpcMainEvent, openAppConfig: ApplicationOpenConfig): { err: string | null } {
    let err: string | null = null

    try {
      const appName = openAppConfig.application?.name ?? ''

      if (this.isRegistered(appName)) {
        const application = this.applications[appName]
        const openConfig = { ...application.config, ...(openAppConfig.config || {}) }
        let applicationWindow = this.activeWindows[appName]

        if (!applicationWindow) {
          const config = { ...openConfig }
          applicationWindow = this.activeWindows[appName] = application.create({
            config,
            preload: application.preload,
            index: application.index,
            store: application.store,
            capabilities: application.capabilities,
            flowrWindow: this._flowrWindow,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            executeOnWindows: this.executeOnWindows,
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
      this.logger.warn('Error opening app', e)
      err = (e as Error).message
    }
    return { err }
  }

  canOpenApplication(event: IpcMainEvent, openConfig: ApplicationOpenConfig): boolean {
    const appName = openConfig.application?.name ?? ''
    const application = this.applications[appName]
    let returnValue = false
    try {
      returnValue = !!application && application.canOpen(application.capabilities, openConfig.config)
    } catch (e) {
      this.logger.warn('Error retrieving open capabilities', e)
    }
    return returnValue
  }

  languageChanged(lang: string): void {
    Object.values(this.activeWindows).forEach(activeWindow => {
      this.setProperty(activeWindow, 'lang', lang)
    })
  }

  setProperties(appWindow: BrowserWindow, props: {[key: string]: any}): void {
    Object.entries(props).forEach(prop => {
      this.setProperty(appWindow, prop[0], prop[1])
    })
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  setProperty(appWindow: BrowserWindow, name: string, value: any): void {
    const propertyDescriptor = Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(appWindow), name)
    if (propertyDescriptor?.set) {
      Reflect.set(appWindow, name, value)
    }
  }

  setDebugMode(debugMode: boolean): void {
    Object.values(this.activeWindows).forEach(browserWindow => openDevTools(browserWindow.webContents, debugMode))
  }

  destroy(): void {
    ipcMain.removeHandler('initializeApplications')
    ipcMain.removeHandler('open-application')
    ipcMain.removeHandler('can-open-application')
  }

  hideAllApplications(): void {
    Object.values(this.activeWindows)
      .forEach(win => win.hide())
  }

  closeAllApplications(): void {
    Object.values(this.activeWindows)
      .forEach(win => win.close())
  }
}
