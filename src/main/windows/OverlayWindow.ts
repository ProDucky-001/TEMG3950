import { BrowserWindow, screen } from 'electron'
import path from 'path'
import fs from 'fs'

const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_VITE_DEV_SERVER_URL

/**
 * Transparent overlay window for green-corner UI when an email application is detected.
 * Single window over primary display; mouse events pass through.
 *
 * On macOS, BrowserWindow.setBounds() already works in DIP (logical points).
 * AppleScript returns DIP coordinates. No scaling is needed.
 * On Windows, screen.dipToScreenRect() converts DIP to physical if needed.
 */
export class OverlayWindow {
  private window: BrowserWindow | null = null

  create(preloadPath?: string): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size
    const usePreload = preloadPath && fs.existsSync(preloadPath)
    this.window = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      skipTaskbar: true,
      fullscreenable: false,
      resizable: false,
      show: false,
      focusable: false,
      webPreferences: {
        ...(usePreload ? { preload: preloadPath } : {}),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    this.window.setIgnoreMouseEvents(true)
    if (process.platform === 'darwin') {
      this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
    this.window.setMenuBarVisibility(false)
    return this.window
  }

  getWindow(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null
  }

  show(): void {
    const win = this.getWindow()
    if (!win) return
    if (typeof win.showInactive === 'function') {
      win.showInactive()
    } else {
      win.show()
    }
  }

  hide(): void {
    const win = this.getWindow()
    if (win) win.hide()
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    const win = this.getWindow()
    if (win) win.setBounds(bounds)
  }

  loadGreenCorner(): void {
    const win = this.getWindow()
    if (!win) return
    if (isDev && process.env.ELECTRON_VITE_DEV_SERVER_URL) {
      win.loadURL(`${process.env.ELECTRON_VITE_DEV_SERVER_URL}/recording-overlay.html`)
    } else {
      win.loadFile(path.join(__dirname, '../renderer/recording-overlay.html'))
    }
  }

  sendState(state: 'monitoring' | 'processing'): void {
    const win = this.getWindow()
    if (win && !win.webContents.isDestroyed()) {
      win.webContents.send('overlay-state', state)
    }
  }

  sendBounds(bounds: { x: number; y: number; width: number; height: number } | null): void {
    const win = this.getWindow()
    if (win && !win.webContents.isDestroyed()) {
      win.webContents.send('overlay-bounds', bounds)
    }
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }
}
