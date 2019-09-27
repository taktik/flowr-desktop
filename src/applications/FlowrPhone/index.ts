import { RegisterProps } from './views/phone'
import { PhoneWindow } from './phoneWindow'
import { FlowrWindow } from '../../frontend/flowr-window'
import { BrowserWindow } from 'electron'
import { ApplicationOptions } from '../../application-manager/application-manager'
import * as pkgJSON from './package.json'

export type OpenPhoneProps = { registerProps: RegisterProps, show?: boolean, lang?: string }

interface PhoneOptions extends ApplicationOptions {
  props: OpenPhoneProps,
  flowrWindow: FlowrWindow,
  wexondWindow: BrowserWindow,
}

export function create(options: PhoneOptions): PhoneWindow {
  // Most of these functions are to be moved outside...
  // ...applications should not have control over other windows, they should request it
  function mute() {
    if (options.flowrWindow) {
      muteWindow(options.flowrWindow)
    }
    if (options.wexondWindow) {
      muteWindow(options.wexondWindow)
    }
  }

  function unmute() {
    if (options.flowrWindow) {
      unmuteWindow(options.flowrWindow)
    }
    if (options.wexondWindow) {
      unmuteWindow(options.wexondWindow)
    }
  }

  function muteWindow(windowToMute: BrowserWindow) {
    if (!windowToMute.webContents.isAudioMuted()) {
      windowToMute.webContents.setAudioMuted(true)
    }
  }

  function unmuteWindow(windowToMute: BrowserWindow) {
    if (windowToMute.webContents.isAudioMuted()) {
      windowToMute.webContents.setAudioMuted(false)
    }
  }

  function keepFocus(win: BrowserWindow) {
    if (win) {
      win.focus()
      win.on('blur', win.focus)
    }
  }

  function releaseFocus(win: BrowserWindow) {
    if (win) {
      win.removeListener('blur', win.focus)
    }
  }

  const phoneAppProps = {
    phoneServer: options.flowrWindow.phoneServerUrl,
    registerProps: options.props.registerProps,
    lang: options.props.lang,
    capabilities: options.capabilities,
  }

  const phoneWindow = new PhoneWindow(
    options.flowrWindow,
    options.store,
    options.preload,
    options.index,
    phoneAppProps,
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

export const packageJSON: JSON = pkgJSON

export function canOpen(capabilities?: {[key: string]: boolean}, props?: OpenPhoneProps) {
  const canEmit = !capabilities || capabilities.emit
  const requiredPropsAvailable = !!props &&
      !!props.registerProps &&
      !!props.registerProps.host &&
      !!props.registerProps.username
  return canEmit && requiredPropsAvailable
}
