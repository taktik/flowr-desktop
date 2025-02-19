import type { RegisterProps } from './views/phone'
import { PhoneWindow } from './phoneWindow'
import { BrowserWindow, ipcMain } from 'electron'
import * as pkgJSON from './package.json'
import { ApplicationOptions, WindowTypes } from '../../application-manager/types'

export type OpenPhoneProps = {
  registerProps: RegisterProps,
  history?: boolean,
  favorites?: boolean,
  currentUser?: string,
  show?: boolean,
  lang?: string,
  clearAppDataOnStart?: boolean,
  applyExternalPhoneNumberPrefix?: boolean,
}

interface PhoneOptions extends ApplicationOptions {
  config: OpenPhoneProps,
}

export function create(options: PhoneOptions): PhoneWindow {
  function mute() {
    options.executeOnWindows(
      [WindowTypes.FLOWR, WindowTypes.WEXOND],
      muteWindow
    )
  }

  function unmute() {
    options.executeOnWindows(
      [WindowTypes.FLOWR, WindowTypes.WEXOND],
      unmuteWindow
    )
  }

  function muteWindow(windowToMute: BrowserWindow) {
    if (!windowToMute.webContents.isAudioMuted()) {
      windowToMute.webContents.setAudioMuted(true)
      windowToMute.getBrowserView()?.webContents?.setAudioMuted(true)
    }
  }

  function unmuteWindow(windowToUnMute: BrowserWindow) {
    if (windowToUnMute.webContents.isAudioMuted()) {
      windowToUnMute.webContents.setAudioMuted(false)
      windowToUnMute.getBrowserView()?.webContents?.setAudioMuted(false)
    }
  }

  function keepFocus(win: BrowserWindow) {
    if (win) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      win.on('blur', win.focus)
      win.focus()
    }
  }

  function releaseFocus(win: BrowserWindow) {
    if (win) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      win.removeListener('blur', win.focus)
    }
  }
  const { registerProps, lang, history, favorites, currentUser, clearAppDataOnStart, applyExternalPhoneNumberPrefix } = options.config
  const phoneAppProps = {
    phoneServer: options.flowrWindow.phoneServerUrl,
    capabilities: options.capabilities,
    phoneMessagingNumber: options.flowrWindow.phoneMessagingNumber,
    registerProps,
    lang,
    history,
    favorites,
    currentUser,
    clearAppDataOnStart,
    applyExternalPhoneNumberPrefix,
  }
  ipcMain.on('phone.incoming-call', (() => {
    options.flowrWindow.webContents.send('send-statistic-report', {
      type: 'counter',
      count: 1,
      name: 'flowr-desktop.phoneApp.incoming-call',
    },
      {
        type: 'counter',
        valueFieldName: 'count',
        aggregationType: 'sum',
      })
  }))
  ipcMain.on('phone.outgoing-call', (() => {
    options.flowrWindow.webContents.send('send-statistic-report', {
      type: 'counter',
      count: 1,
      name: 'flowr-desktop.phoneApp.outgoing-call',
    },
      {
        type: 'counter',
        valueFieldName: 'count',
        aggregationType: 'sum',
      })
  }))
  ipcMain.on('phone.call-ended', (event, callDuration: number, origin: 'incoming-call' | 'outgoing-call') => {
    options.flowrWindow.webContents.send('send-statistic-report', {
      type: 'timeGauge',
      value: callDuration,
      name: 'flowr-desktop.phoneApp.call-duration',
      tag: [origin],
    })
  })

  const phoneWindow = new PhoneWindow(
    options.flowrWindow,
    options.preload,
    options.index,
    phoneAppProps,
    options.store,
  )
  phoneWindow.on('show', () => {
    mute()
    keepFocus(phoneWindow)
  })
  phoneWindow.on('hide', () => {
    unmute()
    releaseFocus(phoneWindow)
  })
  phoneWindow.on('close', () => {
    unmute()
    releaseFocus(phoneWindow)
  })

  return phoneWindow
}

export const packageJSON = pkgJSON

export function canOpen(capabilities?: {[key: string]: boolean}, props?: OpenPhoneProps): boolean {
  const canEmit = !capabilities || capabilities.emit
  const requiredPropsAvailable = !!props &&
      !!props.registerProps &&
      !!props.registerProps.host &&
      !!props.registerProps.username
  return canEmit && requiredPropsAvailable
}
