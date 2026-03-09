import type { DetectionManager } from '../managers/DetectionManager'
import type { DetectionState } from '../managers/DetectionManager'
import { OverlayWindow } from './OverlayWindow'
import path from 'path'
import fs from 'fs'

const HIDE_DELAY_MS = 2000

/**
 * Connects overlay window to detection state: show when email app detected or analyzing,
 * hide with delay when idle to avoid flickering.
 */
export class OverlayController {
  private overlayWindow: OverlayWindow
  private hideTimeout: ReturnType<typeof setTimeout> | null = null
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly detectionManager: DetectionManager,
    overlayWindow?: OverlayWindow
  ) {
    this.overlayWindow = overlayWindow ?? new OverlayWindow()
  }

  /**
   * Initialize: create overlay window, load UI, and subscribe to detection state.
   */
  initialize(): void {
    const preloadPath = path.join(__dirname, '../preload/overlay.js')
    const usePreload = fs.existsSync(preloadPath)
    this.overlayWindow.create(usePreload ? preloadPath : undefined)
    this.overlayWindow.loadGreenCorner()
    this.unsubscribe = this.detectionManager.onStateChange((state) => this.onStateChange(state))
  }

  /**
   * Show overlay (and cancel any pending hide).
   */
  showOverlay(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }
    this.overlayWindow.show()
    const state = this.detectionManager.getState()
    this.overlayWindow.sendState(state.status === 'analyzing' ? 'processing' : 'monitoring')
    if (state.bounds) {
      this.overlayWindow.sendBounds(state.bounds)
    }
  }

  /**
   * Hide overlay (optionally delayed).
   */
  hideOverlay(delayed = true): void {
    if (delayed) {
      if (this.hideTimeout) return
      this.hideTimeout = setTimeout(() => {
        this.hideTimeout = null
        this.overlayWindow.hide()
      }, HIDE_DELAY_MS)
    } else {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout)
        this.hideTimeout = null
      }
      this.overlayWindow.hide()
    }
  }

  getOverlayWindow(): OverlayWindow {
    return this.overlayWindow
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }
    this.overlayWindow.destroy()
  }

  private onStateChange(state: DetectionState): void {
    if (state.status === 'detected' || state.status === 'analyzing') {
      this.showOverlay()
      this.overlayWindow.sendState(state.status === 'analyzing' ? 'processing' : 'monitoring')
      if (state.bounds) this.overlayWindow.sendBounds(state.bounds)
    } else if (state.status === 'idle') {
      this.hideOverlay(true)
    }
  }
}
