import { ipcMain, session } from 'electron'
import { TOOLBAR_HEIGHT } from '~/renderer/app/constants/design'
import { enable } from '@electron/remote/main'
import { appWindow } from '.'
import { View } from './view'
import { clearBrowsingData } from '~/main/clearBrowsingData'
import { watchForInactivity } from '../../inactivity/window'
import { IInactivityConfig } from '../../inactivity/utils'
import { getValue } from '../../common/getValue'
import { WEXOND_PARTITION } from '../../common/partitions'

export class ViewManager {
  public views: { [key: number]: View } = {}
  public selectedId = 0
  public _fullscreen = false

  public isHidden = false

  public get fullscreen(): boolean {
    return this._fullscreen
  }

  public set fullscreen(val: boolean) {
    this._fullscreen = val
    this.fixBounds()
  }

  private readonly _ipcEvents: {[key: string]: (...args: any[]) => void}

  constructor(private inactivityConfig?: IInactivityConfig) {
    this._ipcEvents = {
      'browserview-create': (e: Electron.IpcMessageEvent, { tabId, url }: { tabId: number, url: string }) => {
        this.create(tabId, url)

        const webContents = this.views[tabId].webContents
        if (webContents) {
          appWindow.webContents.send(
            `browserview-created-${tabId}`,
            webContents.id,
          )
        }
      },
      'browserview-select': (e: Electron.IpcMessageEvent, id: number, force: boolean) => {
        const view = this.views[id]
        this.select(id)
        view.updateNavigationState()

        if (force) this.isHidden = false
      },
      'clear-browsing-data': () => void clearBrowsingData(),
      'browserview-destroy': (e: Electron.IpcMessageEvent, id: number) => {
        this.destroy(id)
      },
      'browserview-call': async (e: any, data: { tabId: number, scope?: string, args: any[], callId?: string }) => {
        const view = this.views[data.tabId]
        if (!view) return
        const scope: unknown = getValue(view, data.scope)

        if (!scope || typeof scope !== 'function') return

        let result = scope?.apply(view.webContents, data.args) as unknown

        if (result instanceof Promise) {
          result = await result
        }

        if (data.callId) {
          appWindow.webContents.send(
            `browserview-call-result-${data.callId}`,
            result,
          )
        }
      },
      'browserview-hide': () => this.hideView(),
      'browserview-show': () => this.showView(),
      'browserview-clear': () => this.clear(),
    }
    Object.entries(this._ipcEvents).forEach(event => ipcMain.on(event[0], event[1]))

    session.fromPartition(WEXOND_PARTITION).on('will-download', (event) => {
      event.preventDefault()
    })
  }

  public get selected(): View | undefined {
    return this.views[this.selectedId]
  }

  public create(tabId: number, url: string): void {
    const view = new View(tabId, url)
    enable(view.webContents)
    this.views[tabId] = view

    if (this.inactivityConfig) {
      const { timeout, callback } = this.inactivityConfig
      try {
        watchForInactivity(view.browserView, timeout, (browserView) => {
          const selectedView = this.views[this.selectedId]
          if (selectedView && selectedView.webContents.id === browserView.webContents.id) {
            callback()
          }
        })
      } catch (e) {
        console.error(e)
      }
    }
  }

  public clear(): void {
    if (appWindow) {
      appWindow.setBrowserView(null)
    }
    for (const key in this.views) {
      this.destroy(parseInt(key, 10))
    }
  }

  public select(tabId: number): void {
    const view = this.views[tabId]
    this.selectedId = tabId

    if (!view || view.webContents.isDestroyed()) {
      this.destroy(tabId)
      appWindow.setBrowserView(null)
      return
    }

    if (this.isHidden) return

    appWindow.setBrowserView(view.browserView)

    const currUrl = view.webContents.getURL()

    if (
      (currUrl === '' && view.homeUrl === 'about:blank') ||
      currUrl === 'about:blank'
    ) {
      appWindow.webContents.focus()
    } else {
      view.webContents.focus()
    }

    this.fixBounds()
  }

  public fixBounds(): void {
    const view = this.views[this.selectedId]

    if (!view) return

    const { width, height } = appWindow.getContentBounds()
    view.browserView.setBounds({
      x: 0,
      y: this.fullscreen ? 0 : TOOLBAR_HEIGHT + 1,
      width,
      height: this.fullscreen ? height : height - TOOLBAR_HEIGHT,
    })
    view.browserView.setAutoResize({
      width: true,
      height: true,
    })
  }

  public hideView(): void {
    this.isHidden = true
    appWindow.setBrowserView(null)
  }

  public showView(): void {
    this.isHidden = false
    this.select(this.selectedId)
  }

  public destroy(tabId: number): void {
    const view = this.views[tabId]

    if (!view || view.webContents?.isDestroyed()) {
      delete this.views[tabId]
      return
    }

    if (appWindow && appWindow.getBrowserView() === view.browserView) {
      appWindow.setBrowserView(null)
    }

    // Undocumented electron API: https://github.com/electron/electron/issues/26929#issuecomment-754294324
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    (view.webContents as any)?.destroy()

    delete this.views[tabId]
  }

  sendToAll(name: string, ...args: any[]): void {
    for (const key in this.views) {
      const view = this.views[key]
      view.webContents.send(name, ...args)
    }
  }

  close(): void {
    this.clear()
    Object.entries(this._ipcEvents).forEach(event => ipcMain.removeListener(event[0], event[1]))
  }
}
