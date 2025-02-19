import { app, BrowserWindow, ipcMain, IpcMainEvent } from 'electron'
import { buildFileUrl } from '../application-manager/helpers'
import { buildPreloadPath } from '../common/preload'
import { IFlowrStore, ModifiableConfig } from '../frontend/src/interfaces/flowrStore'
import { Store } from '../frontend/src/store'

export type ConfigWindowProps = {
    flowrStore: Store<IFlowrStore>
    debugMode: boolean
    lastError: string | undefined
    isLaunchedUrlCorrect: boolean
    parent: BrowserWindow
    done(shouldRelaunch: boolean): void
}

export function openConfigWindow({ flowrStore, debugMode, lastError, isLaunchedUrlCorrect, parent, done }: ConfigWindowProps): Promise<void> {
    const configWindow = new BrowserWindow({
        parent,
        autoHideMenuBar: true,
        webPreferences: {
            preload: buildPreloadPath('config-preload.js'),
        }
    })
    const _ipcEvents: { [key: string]: (...args: any[]) => void } = {
        getAppConfig: (evt: IpcMainEvent) => {
            const config: ModifiableConfig = {
                debugMode,
                deinterlacing: flowrStore.get('deinterlacing'),
                extUrl: flowrStore.get('extUrl'),
                flowrMonitoringTime: flowrStore.get('flowrMonitoringTime'),
                isKiosk: flowrStore.get('isKiosk'),
                clearAppDataOnStart: flowrStore.get('clearAppDataOnStart'),
                applications: flowrStore.get('applications'),
                enableVirtualKeyboard: flowrStore.get('enableVirtualKeyboard'),
                virtualKeyboardConfig: flowrStore.get('virtualKeyboardConfig'),
            }

            const storedConfig = flowrStore.get('flowrConfig')
            // no need to expose the complete config
            if (storedConfig?.ozoneApi) {
                const ozoneApi = storedConfig.ozoneApi.hostProxy || ''
                const flowrApi = storedConfig.flowrApi?.hostProxy || ''
                const socketApi = storedConfig.socketApi?.host || ''
                const pushVodSocketApi = storedConfig.pushVodSocketApi?.host || ''
                const aneviaVodSocketApi = storedConfig.aneviaVodSocketApi?.host || ''

                config.flowrConfig = {
                    ozoneApi: {
                        hostProxy: ozoneApi,
                    },
                    flowrApi: {
                        hostProxy: flowrApi,
                    },
                    socketApi: {
                        host: socketApi,
                    },
                    pushVodSocketApi: {
                        host: pushVodSocketApi,
                    },
                    aneviaVodSocketApi: {
                        host: aneviaVodSocketApi,
                    },
                }
            }

            evt.sender.send('receiveConfig', { lastError, isLaunchedUrlCorrect, config })
        },
        setAppConfig(_: IpcMainEvent, config: ModifiableConfig) {
            /**
             * relaunch if changes in
             *  - flowrConfig
             *  - enableVirtualKeyboard
             *  - isKiosk
            */
            const reloadKeys: (keyof ModifiableConfig)[] = [
                'flowrConfig', // TODO: QUITE SURE THIS VALUE IS NEVER USED FROM THE STORE
                'enableVirtualKeyboard',
                'isKiosk',
            ]
            const shouldRelaunch = reloadKeys.some(prop => {
                const prev = flowrStore.get(prop)

                return prop === 'flowrConfig'
                    ? false
                    : prev !== config[prop]
            })

            flowrStore.bulkSet(config)

            if (shouldRelaunch) {
                app.relaunch()
                app.quit()
            } else {
                done(true)
                configWindow.close()
            }
        },
        close() {
            done(false)
            configWindow.close()
        }
    }

    Object.entries(_ipcEvents).forEach(event => ipcMain.on(...event))
    configWindow.on('close', () => Object.entries(_ipcEvents).forEach(event => ipcMain.removeListener(...event)))

    return configWindow.loadURL(buildFileUrl('config.html'))
}
