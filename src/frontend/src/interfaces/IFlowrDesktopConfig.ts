import { IPlayerStore } from './playerStore'

interface IFlowrDesktopConfigWindowDimensions {
  width?: number | null,
  height?: number | null
}

interface IFlowrDesktopConfigUserPreferences {
  isMaximized?: boolean | null
  clearAppDataOnStart?: boolean | null
  applications: { [key:string]: any }
  extUrl?: string | null,
  isKiosk?: boolean | null
  deinterlacing?: boolean | null
  logLevel?: string | null
  windowBounds?: IFlowrDesktopConfigWindowDimensions
  flowrMonitoringTime?: number
  enableVirtualKeyboard: boolean
}

export interface IFlowrDesktopConfig {
  userPreferences?: IFlowrDesktopConfigUserPreferences
  player?: IPlayerStore
}
