import { app, BrowserWindow, screen } from 'electron'
import type { Event } from 'electron'
import path from 'path'
import fs from 'fs'
import type { SettingsManager } from './SettingsManager'
import type { WindowStateStore } from './WindowStateStore'

const devServerUrl = process.env.ELECTRON_RENDERER_URL || process.env.ELECTRON_VITE_DEV_SERVER_URL
const isDev = process.env.NODE_ENV === 'development' || !!devServerUrl

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

    const preloadPath = path.join(app.getAppPath(), 'out', 'preload', 'index.js')
    const preloadExists = fs.existsSync(preloadPath)
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
        preload: preloadExists ? preloadPath : path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
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

    const preloadPath = path.join(app.getAppPath(), 'out', 'preload', 'index.js')
    this.settingsWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      minWidth: 400,
      minHeight: 500,
      title: 'ScamShield Settings',
      webPreferences: {
        preload: fs.existsSync(preloadPath) ? preloadPath : path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
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
    win.on('close', (e: Event) => {
      if (type !== 'dashboard') return
      const settings = this.settingsManager.getSettings()
      if (settings.closeToTray) {
        e.preventDefault()
        win.hide()
      }
    })

    // Electron v33 typings omit 'minimize'; event exists at runtime
    ;(win as BrowserWindow & { on(event: 'minimize', listener: (e: Event) => void): void }).on('minimize', (e: Event) => {
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
    if (isDev && devServerUrl) {
      const url = `${devServerUrl}${hash}`
      win.loadURL(url)
      // DevTools: open manually via Ctrl+Shift+I. Auto-open triggers Autofill.enable
      // CDP errors in Electron's Chromium (known upstream bug, harmless but noisy).
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
