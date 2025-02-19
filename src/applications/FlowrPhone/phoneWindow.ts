import { BrowserWindow, Rectangle, ipcMain } from 'electron'
import { WindowModes } from './WindowModes'
import { Store } from '../../frontend/src/store'
import { KeyboardMixin } from '../../keyboard/keyboardMixin'
import type { RegisterProps } from './views/phone'
import { getLogger } from '../../frontend/src/logging/loggers'

interface PhoneAppProps {
  phoneMessagingNumber?: string,
  phoneServer?: string
  registerProps?: RegisterProps
  lang?: string
  capabilities?: {[key: string]: boolean}
  history: boolean
  favorites: boolean
  currentUser: string
  applyExternalPhoneNumberPrefix: boolean
}

function buildPositionFromParents(parentRectangle: Rectangle) {
  return {
    width: parentRectangle.width,
    height: parentRectangle.height,
    x: 0,
    y: 0,
  }
}

export class PhoneWindow extends KeyboardMixin(BrowserWindow) {
  _mode: WindowModes | undefined
  _registerProps: RegisterProps | undefined
  private _capabilities: {[key: string]: boolean} | undefined
  private _lang: string | undefined
  private _currentUser: string | undefined
  private _history: boolean | undefined
  private logger = getLogger('Phone window')

  constructor(parent: BrowserWindow, preload: string | undefined, index: string, props: PhoneAppProps, private store?: Store<Record<string, any>> | undefined) {
    super(Object.assign({
      frame: false,
      transparent: true,
      show: false,
      parent,
      backgroundColor: '#00000000',
      webPreferences: {
        plugins: true,
        nodeIntegration: false,
        contextIsolation: false,
        experimentalFeatures: true,
        preload,
      },
    }, buildPositionFromParents(parent.getContentBounds())))

    const pageUrl = new URL(index)

    /* eslint-disable @typescript-eslint/no-floating-promises */
    this.loadURL(pageUrl.href)

    this.mode = WindowModes.WIDGET
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const ipcEvents = {
      'phone-maximize': () => this.mode = WindowModes.FULLSCREEN,
      'phone-reduce': () => this.mode = WindowModes.WIDGET,
      'phone-show': this.show.bind(this),
      'phone-hide': this.hide.bind(this),
      'register-props': this.updateRegisterProps.bind(this),
      'phone-mute': this.mute.bind(this),
      'update-phone-store': this.updateStore.bind(this),
      'phone-error': (error: Error) => {
        this.logger.warn('Error in phone application', error)
      }
    }
    const ipcHandles = {
      initProps: () => {
        const { username, host } =  props.registerProps
        this._history = props.history
        this._currentUser = props.currentUser

        return {
          phoneMessagingNumber: props.phoneMessagingNumber,
          phoneServer: props.phoneServer,
          capabilities: props.capabilities,
          currentUser: props.currentUser || '',
          favorites: !!props.favorites,
          history: !!props.history,
          lang: props.lang,
          registerProps: username && host ? { username, host } : null,
          applyExternalPhoneNumberPrefix: props.applyExternalPhoneNumberPrefix,
        }
      }
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */

    Object.entries(ipcEvents).forEach(event => ipcMain.on(...event))
    Object.entries(ipcHandles).forEach(event => ipcMain.handle(...event))
    this.on('close', () => {
      Object.entries(ipcEvents).forEach(event => ipcMain.removeListener(...event))
      Object.keys(ipcHandles).forEach(eventName => ipcMain.removeHandler(eventName))
    })
  }

  get _widgetPosition(): Rectangle {
    const contentBounds = this.getParentWindow().getBounds()
    return buildPositionFromParents(contentBounds)
  }

  get mode(): WindowModes | undefined {
    return this._mode
  }

  set mode(value: WindowModes | undefined) {
    this._mode = value
    if (value === WindowModes.WIDGET) {
      this.setBounds(this._widgetPosition, true)
    } else {
      this.setBounds(this.getParentWindow().getBounds(), true)
    }
    this.webContents.send('window-mode-changed', value)
  }

  set registerProps(value: RegisterProps) {
    this.webContents.send('register-props', value)
    this._registerProps = value
  }

  get lang(): string | undefined {
    return this._lang
  }

  set lang(lang: string) {
    this.webContents.send('change-language', lang)
    this._lang = lang
  }

  get capabilities(): {[key: string]: boolean} | undefined {
    return this._capabilities
  }

  set capabilities(capabilities: {[key: string]: boolean}) {
    this.webContents.send('capabilities-changed', capabilities)
    this._capabilities = capabilities
  }

  get currentUser(): string | undefined {
    return this._currentUser
  }
  set currentUser(currentUser: string) {
    if (currentUser !== this.currentUser) {
      this.webContents.send('current-user-changed', currentUser)
      this._currentUser = currentUser
    }
  }

  get history(): boolean | undefined {
    return this._history
  }
  set history(history: boolean) {
    if (history !== this.history) {
      this.webContents.send('history-changed', history)
      this._history = history
    }
  }

  private updateRegisterProps(e: Event, registerProps: RegisterProps) {
    this.logger.info('Received register props', registerProps)
    this.registerProps = registerProps
  }

  open(mode: WindowModes = WindowModes.WIDGET): void {
    this.mode = mode
    this.show()
  }

  mute(e: Event, mute: boolean): void {
    this.webContents.setAudioMuted(mute)
    this.webContents.send('mute-changed', this.webContents.isAudioMuted())
  }

  updateStore(e: Event, data: {[key: string]: any} = {}): void {
    if (this.store) {
      if (Object.keys(data).length) {
        this.store.bulkSet(data)
      }
      this.webContents.send('store-updated', this.store.data)
    } else {
      console.warn('No available store to save data')
    }
  }
}
