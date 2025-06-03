/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { IpcRenderer } from 'electron'
import { debounce } from 'lodash'
import { VirtualKeyboardEvent } from '../../keyboard/events'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      nodeRequire: any
      ipc: IpcRenderer
      electronKeyboard: { toggle: () => void }
    }
  }
}

const nodeRequire: {[key: string]: any} = {
  fs: require('fs'),
  os: require('os'),
  https: require('https'),
  http: require('http'),
  path: require('path'),
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ipcRenderer = require('electron').ipcRenderer
const hiddenMenuCode = 'configtaktik'

let codeClearingTimeout: number
let hiddenMenuCodeIndex = 0

function handleHiddenMenuCode(event: KeyboardEvent): any {
  const char = event.key
  if (codeClearingTimeout) {
    clearTimeout(codeClearingTimeout)
  }

  codeClearingTimeout = setTimeout(() => {
    hiddenMenuCodeIndex = 0
  }, 3500)

  if (hiddenMenuCode[hiddenMenuCodeIndex++] !== char) {
    return hiddenMenuCodeIndex = 0
  }

  if (hiddenMenuCodeIndex === hiddenMenuCode.length) {
    ipcRenderer.send('openConfigMode')
  }
}

function actionKeyboard(keyboardEvent: VirtualKeyboardEvent) {
  ipcRenderer.send(keyboardEvent)
}

const actionKeyboardDebounced = debounce(actionKeyboard, 50)

function shouldActionKeyboard(event: Event) {
  const element = event.target as HTMLElement
  if (element.tagName === 'INPUT') {
    const inputElement = element as HTMLInputElement
    if (inputElement.type === 'text' || inputElement.type === 'password' || inputElement.type === 'number') {
      return true
    }
  }
  return false
}

function openKeyboard(event: Event): void {
  if (shouldActionKeyboard(event)) {
    actionKeyboardDebounced(VirtualKeyboardEvent.OPEN)
  }
}
function closeKeyboard(event: Event): void {
  if (shouldActionKeyboard(event)) {
    actionKeyboardDebounced(VirtualKeyboardEvent.CLOSE)
  }
}

function onClick(event: Event) {
  const action = shouldActionKeyboard(event)
    ? VirtualKeyboardEvent.OPEN
    : VirtualKeyboardEvent.CLOSE
  actionKeyboardDebounced(action)
}

window.addEventListener('focus', openKeyboard, true)
window.addEventListener('blur', closeKeyboard, true)
window.addEventListener('click', onClick)
window.addEventListener('keydown', handleHiddenMenuCode, true)

process.once('loaded', () => {
  global.nodeRequire = (moduleName: string): any => {
    const requiredModule = nodeRequire[moduleName]

    if (!requiredModule) {
      throw Error(`Cannot find module ${moduleName}. It must be explicitely exported from the desktop client.`)
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return requiredModule
  }
  global.ipc = ipcRenderer
  global.electronKeyboard = {
    toggle: () => ipcRenderer.send(VirtualKeyboardEvent.TOGGLE)
  }
})
