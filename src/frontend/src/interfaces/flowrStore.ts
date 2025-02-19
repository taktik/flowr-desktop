import { FlowrConfig } from './flowrConfig'
import { LogSeverity } from '../logging/types'
import { AudioStorePreferences } from './audioStore'

export enum VirtualKeyboardMode {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
}

export type VirtualKeyboardConfig = {
  urls?: {
    toggle: string
    open: string
    close: string
  }
  method?: 'GET' | 'POST' | 'PUT'
  mode: VirtualKeyboardMode
}

export interface IFlowrStore {
  windowBounds: { width: number; height: number }
  isMaximized: boolean
  clearAppDataOnStart: boolean
  applications: { [key:string]: any }
  extUrl: string
  isKiosk: boolean
  flowrMonitoringTime?: number
  deinterlacing: boolean
  flowrConfig?: FlowrConfig
  enableVirtualKeyboard: boolean
  virtualKeyboardConfig: VirtualKeyboardConfig
  useRealMacAddress?: boolean
  phoneServer?: string
  messagingNumber?: string
  logLevel: LogSeverity
  audioDevices?: AudioStorePreferences
  debugMode?: boolean
}

export type ModifiableConfig = Pick<IFlowrStore, 'debugMode' |  'deinterlacing' |  'extUrl' |  'flowrMonitoringTime' |  'isKiosk' |  'clearAppDataOnStart' | 'applications' |  'enableVirtualKeyboard' |  'flowrConfig' | 'virtualKeyboardConfig'>
