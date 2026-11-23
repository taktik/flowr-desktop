import { app, BrowserWindow, BrowserWindowConstructorOptions, globalShortcut, ipcMain, screen } from 'electron'
import { Point, Rectangle } from 'electron/main'
import { Window, windowManager } from 'node-window-manager'
import { platform } from 'os'
import { resolve } from 'path'
import { buildFileUrl } from '../../application-manager/helpers'
import { WEXOND_UI_PARTITION } from '../../common/partitions'
import { buildPreloadPath } from '../../common/preload'
import { watchForInactivity } from '../../inactivity/window'
import { KeyboardMixin } from '../../keyboard/keyboardMixin'
import { TOOLBAR_HEIGHT } from '../renderer/app/constants'
import { ProcessWindow } from './models/process-window'
import { ViewManager } from './view-manager'


const containsPoint = (bounds: Rectangle, point: Point) => {
  return (
    point.x >= bounds.x &&
    point.y >= bounds.y &&
    point.x <= bounds.x + bounds.width &&
    point.y <= bounds.y + bounds.height
  )
}
export interface WexondOptions {
  clearBrowsingDataAtClose: boolean,
  openUrl: string
  maxTab : number
  enableVirtualKeyboard: boolean
  closeAfterInactivity?: boolean
  inactivityTimeout?: number
}
export class AppWindow extends KeyboardMixin(BrowserWindow) {
  public viewManager: ViewManager

  public windows: ProcessWindow[] = []
  public selectedWindow: ProcessWindow

  public window: Window
  public draggedWindow: ProcessWindow

  public draggedIn = false
  public detached = false
  public isMoving = false
  public isUpdatingContentBounds = false
  public willAttachWindow = false
  public isWindowHidden = false

  public interval: number | null = null

  constructor(options: WexondOptions, parent?: BrowserWindow, defaultBrowserWindow: BrowserWindowConstructorOptions = {}) {
    super({
      ...defaultBrowserWindow,
      frame: platform() === 'darwin',
      show: false,
      parent,
      fullscreen: false,
      webPreferences: {
        plugins: true,
        nodeIntegration: true,
        contextIsolation: false,
        experimentalFeatures: false,
        preload: buildPreloadPath('inactivity-preload.js'),
        partition: WEXOND_UI_PARTITION,
      },
      icon: resolve(app.getAppPath(), 'static/app-icons/icon-wexond.png'),
    })

    const resize = () => {
      this.viewManager.fixBounds()
      this.webContents.send('tabs-resize')
    }

    this.on('maximize', resize)
    this.on('restore', resize)
    this.on('unmaximize', resize)

    const urlString = buildFileUrl('app.html')

    const url = new URL(urlString)
    Object.entries(options).forEach(([key, value]) => {
      if (typeof value !== 'boolean' || value) {
        url.searchParams.set(key, value)
      }
    })
    void this.loadURL(url.toString())

    this.once('ready-to-show', () => {
      this.show()
    })

    this.on('enter-full-screen', () => {
      this.webContents.send('fullscreen', true)
      this.viewManager.fixBounds()
    })

    this.on('leave-full-screen', () => {
      this.webContents.send('fullscreen', false)
      this.viewManager.fixBounds()
    })

    this.on('enter-html-full-screen', () => {
      this.viewManager.fullscreen = true
      this.webContents.send('html-fullscreen', true)
    })

    this.on('leave-html-full-screen', () => {
      this.viewManager.fullscreen = false
      this.webContents.send('html-fullscreen', false)
    })

    this.webContents.on('input-event', (_, event: Electron.InputEvent) => {
      if (event.type === 'gestureScrollBegin') {
          this.webContents.send('scroll-touch-begin')
      } else if (event.type === 'gestureScrollEnd') {
        this.viewManager.selected?.webContents.send('scroll-touch-end')
        this.webContents.send('scroll-touch-end')
      }
    })

    if (platform() === 'win32') {
      const ipcEvents = {
        'select-window': (e: any, id: number) => {
          this.selectWindow(this.windows.find(x => x.id === id))
        },
        'detach-window': (e: any, id: number) => {
          this.detachWindow(this.windows.find(x => x.id === id))
        },
        'hide-window': () => {
          if (this.selectedWindow) {
            this.selectedWindow.hide()
            this.isWindowHidden = true
          }
        },
      }
      this.activateWindowCapturing(ipcEvents)
    }

    if (options.closeAfterInactivity) {
      const timeout = options.inactivityTimeout ?? 5 // default to 5 minutes
      this.viewManager = new ViewManager({
        timeout,
        callback: () => {
          // Only close if inactivity occurs on "nested" views
          if (this.getBrowserView()) {
            this.close()
          }
        },
      })
      void watchForInactivity(this, timeout, () => {
        // Only close if inactivity occurs on "main" view
        if (!this.getBrowserView()) {
          this.close()
        }
      })
    } else {
      this.viewManager = new ViewManager()
    }
  }

  private activateWindowCapturing(ipcEvents: {[key: string]: (...args: any[]) => void}) {
    const updateBounds = () => {
      this.isMoving = true

      if (!this.isUpdatingContentBounds) {
        this.resizeWindow(this.selectedWindow)
      }
    }

    const handle = this.getNativeWindowHandle().readInt32LE(0)
    this.window = new Window(handle)

    this.on('move', updateBounds)
    this.on('resize', updateBounds)

    this.on('close', () => {
      Object.entries(ipcEvents).forEach(event => ipcMain.off(...event))
      for (const window of this.windows) {
        this.detachWindow(window)
      }

      if (this.interval) {
        clearInterval(this.interval)
        this.interval = null
      }

      windowManager.removeAllListeners('window-activated')
    })

    this.interval = setInterval(() => void this.intervalCallback(), 100)

    Object.entries(ipcEvents).forEach(event => ipcMain.on(...event))

    windowManager.on('window-activated', (window: Window) => {
      this.webContents.send('select-tab', window.id)

      if (
        window.id === handle ||
        (this.selectedWindow && window.id === this.selectedWindow.id)
      ) {
        if (!globalShortcut.isRegistered('CmdOrCtrl+Tab')) {
          globalShortcut.register('CmdOrCtrl+Tab', () => {
            this.webContents.send('next-tab')
          })
        }
      } else if (globalShortcut.isRegistered('CmdOrCtrl+Tab')) {
        globalShortcut.unregister('CmdOrCtrl+Tab')
      }
    })
  }

  intervalCallback = async (): Promise<void> => {
    if (this.isMoving) return

    if (!this.isMinimized()) {
      for (const window of this.windows) {
        const title = window.getTitle()
        if (window.lastTitle !== title) {
          this.webContents.send('update-tab-title', {
            id: window.id,
            title,
          })
          window.lastTitle = title
        }

        if (!window.isWindow()) {
          this.detachWindow(window)
          this.webContents.send('remove-tab', window.id)
        }
      }

      if (this.selectedWindow) {
        const contentBounds = this.getContentArea()
        const bounds = this.selectedWindow.getBounds()
        const { lastBounds } = this.selectedWindow

        if (
          (contentBounds.x !== bounds.x || contentBounds.y !== bounds.y) &&
          (bounds.width === lastBounds.width &&
            bounds.height === lastBounds.height)
        ) {
          const window = this.selectedWindow
          this.detachWindow(window)
          this.detached = true
        }
      }
    }

    const draggedWindow = this.draggedWindow

    if (
      !this.isMinimized() &&
      draggedWindow &&
      draggedWindow.getOwner().id === 0 &&
      !this.windows.find(x => x.id === draggedWindow.id)
    ) {
      const winBounds = draggedWindow.getBounds()
      const { lastBounds } = draggedWindow
      const contentBounds = this.getContentArea()
      const cursor = screen.getCursorScreenPoint()

      cursor.y = winBounds.y

      contentBounds.y -= TOOLBAR_HEIGHT
      contentBounds.height = 2 * TOOLBAR_HEIGHT

      if (
        !this.detached &&
        containsPoint(contentBounds, cursor) &&
        (winBounds.x !== lastBounds.x || winBounds.y !== lastBounds.y)
      ) {
        if (!this.draggedIn) {
          const title = draggedWindow.getTitle()

          try {
            const icon = await app.getFileIcon(draggedWindow.path)
            draggedWindow.lastTitle = title

            this.webContents.send('add-tab', {
              id: draggedWindow.id,
              title,
              icon: icon.toPNG(),
            })

            this.draggedIn = true
            this.willAttachWindow = true
          } catch (e) {
            console.error(e)
          }
        }
      } else if (this.draggedIn && !this.detached) {
        this.webContents.send('remove-tab', draggedWindow.id)

        this.draggedIn = false
        this.willAttachWindow = false
      }
    }
  }

  getContentArea(): Rectangle {
    const bounds = this.getContentBounds()

    bounds.y += TOOLBAR_HEIGHT
    bounds.height -= TOOLBAR_HEIGHT

    return bounds
  }

  selectWindow(window: ProcessWindow): void {
    if (!window) return

    if (this.selectedWindow) {
      if (
        window.id === this.selectedWindow.id &&
        !this.isWindowHidden
      ) {
        return
      }

      this.selectedWindow.hide()
    }

    window.show()

    this.selectedWindow = window
    this.isWindowHidden = false

    this.resizeWindow(window)
  }

  resizeWindow(window: ProcessWindow): void {
    if (!window || this.isMinimized()) return

    const newBounds = this.getContentArea()

    window.setBounds(newBounds)
    window.lastBounds = newBounds

    const bounds = window.getBounds()

    if (bounds.width > newBounds.width || bounds.height > newBounds.height) {
      this.setContentSize(bounds.width, bounds.height + TOOLBAR_HEIGHT)
      this.setMinimumSize(bounds.width, bounds.height + TOOLBAR_HEIGHT)
    }
  }

  detachWindow(window: ProcessWindow): void {
    if (!window) return

    if (this.selectedWindow === window) {
      this.selectedWindow = null
    }

    window.detach()

    this.windows = this.windows.filter(x => x.id !== window.id)
  }

  close(): void {
    this.viewManager.close()
    super.close()
  }
}
