
import { debounce } from 'lodash'
import { VirtualKeyboardEvent } from '../../keyboard/events'

declare global {
  namespace NodeJS {
    interface Global {
      nodeRequire: any
      nodeProcess: any
      process: Process // ensure compatibility with flow < 5.2.6
      ipc: any // ensure compatibility with flow < 5.2.6
    }
  }
}

const nodeRequire: {[key: string]: any} = {
  electron: require('electron'),
  fs: require('fs'),
  os: require('os'),
  path: require('path'),
}
const nodeProcess = process

const ipcRenderer = nodeRequire['electron'].ipcRenderer
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

window.addEventListener('focus', openKeyboard, true)
window.addEventListener('blur', closeKeyboard, true)
window.addEventListener('click', openKeyboard)
window.addEventListener('keydown', handleHiddenMenuCode, true)

process.once('loaded', () => {
  global.nodeRequire = (moduleName: string): any => {
    const requiredModule = nodeRequire[moduleName]

    if (!requiredModule) {
      throw Error(`Cannot find module ${moduleName}. It must be explicitely exported from the client.`)
    }

    return requiredModule
  }
  global.nodeProcess = nodeProcess
  global.process = nodeProcess // ensure compatibility with flow < 5.2.6
  global.ipc = ipcRenderer // ensure compatibility with flow < 5.2.6
})

export {}
