import { app, BrowserWindow, screen } from 'electron'
import path from 'path'
import type { SettingsManager } from './SettingsManager'
import type { WindowStateStore } from './WindowStateStore'

const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_VITE_DEV_SERVER_URL

export class WindowManager {
  private dashboardWindow: BrowserWindow | null = null
  private settingsWindow: BrowserWindow | null = null
  private settingsManager: SettingsManager
  private windowState: WindowStateStore

  constructor(settingsManager: SettingsManager, windowState: WindowStateStore) {
    this.settingsManager = settingsManager
    this.windowState = windowState
  }

  openDashboard(): void {
    if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
      this.dashboardWindow.focus()
      return
    }

    const workArea = screen.getPrimaryDisplay().workAreaSize
    const saved = this.windowState.getDashboardBounds()
    const width = saved?.width ?? Math.min(900, workArea.width)
    const height = saved?.height ?? Math.min(700, workArea.height)
    const x = saved?.x ?? Math.floor((workArea.width - width) / 2)
    const y = saved?.y ?? Math.floor((workArea.height - height) / 2)
    const alwaysOnTop = this.windowState.getDashboardAlwaysOnTop()

    this.dashboardWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      minWidth: 600,
      minHeight: 400,
      title: 'ScamShield Dashboard',
      alwaysOnTop,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      show: false,
    })

    this.saveBoundsWhenResize(this.dashboardWindow, 'dashboard')
    this.setupWindowLifecycle(this.dashboardWindow, 'dashboard')
    this.loadWindow(this.dashboardWindow, 'dashboard')
  }

  openSettings(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus()
      return
    }

    const workArea = screen.getPrimaryDisplay().workAreaSize
    const saved = this.windowState.getSettingsBounds()
    const width = saved?.width ?? 500
    const height = saved?.height ?? 600
    const x = saved?.x ?? Math.floor((workArea.width - width) / 2)
    const y = saved?.y ?? Math.floor((workArea.height - height) / 2)

    this.settingsWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      minWidth: 400,
      minHeight: 500,
      title: 'ScamShield Settings',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      show: false,
    })

    this.saveBoundsWhenResize(this.settingsWindow, 'settings')
    this.setupWindowLifecycle(this.settingsWindow, 'settings')
    this.loadWindow(this.settingsWindow, 'settings')
  }

  setDashboardAlwaysOnTop(value: boolean): void {
    this.windowState.setDashboardAlwaysOnTop(value)
    if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
      this.dashboardWindow.setAlwaysOnTop(value)
    }
  }

  getDashboardAlwaysOnTop(): boolean {
    return this.windowState.getDashboardAlwaysOnTop()
  }

  private setupWindowLifecycle(
    win: BrowserWindow,
    type: 'dashboard' | 'settings'
  ): void {
    win.on('close', (e) => {
      if (type !== 'dashboard') return
      const settings = this.settingsManager.getSettings()
      if (settings.closeToTray) {
        e.preventDefault()
        win.hide()
      }
    })

    win.on('minimize', (e) => {
      if (type !== 'dashboard') return
      const settings = this.settingsManager.getSettings()
      if (settings.minimizeToTray) {
        e.preventDefault()
        win.hide()
      }
    })

    win.on('closed', () => {
      if (type === 'dashboard') {
        this.dashboardWindow = null
      } else {
        this.settingsWindow = null
      }
    })

    win.once('ready-to-show', () => win.show())
  }

  private saveBoundsWhenResize(win: BrowserWindow, type: 'dashboard' | 'settings'): void {
    const save = () => {
      const bounds = win.getBounds()
      if (type === 'dashboard') {
        this.windowState.setDashboardBounds(bounds)
      } else {
        this.windowState.setSettingsBounds(bounds)
      }
    }
    win.on('resize', save)
    win.on('move', save)
  }

  private loadWindow(win: BrowserWindow, page: string): void {
    const hash = page === 'dashboard' ? '' : `#/${page}`
    if (isDev && process.env.ELECTRON_VITE_DEV_SERVER_URL) {
      const url = `${process.env.ELECTRON_VITE_DEV_SERVER_URL}${hash}`
      win.loadURL(url)
      win.webContents.openDevTools()
    } else {
      const filePath = path.join(__dirname, '../renderer/index.html')
      win.loadURL(`file://${filePath}${hash}`)
    }
  }

  closeAll(): void {
    if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
      this.dashboardWindow.close()
    }
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.close()
    }
  }

  getDashboardWindow(): BrowserWindow | null {
    return this.dashboardWindow
  }
}
