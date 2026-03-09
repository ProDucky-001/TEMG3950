import { screen } from 'electron'
import type { PlatformSpecificManager } from '../integration/PlatformSpecificManager'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Provides window bounds for the green corner overlay and optional tracking.
 * Uses platform APIs (getFrontmostWindowBounds) so the overlay matches the exact frontmost window.
 */
export class OverlayManager {
  private updateInterval: ReturnType<typeof setInterval> | null = null
  private lastBounds: WindowBounds | null = null

  constructor(private readonly platform: PlatformSpecificManager) {}

  /**
   * Get the exact frontmost window bounds in screen coordinates.
   * Returns primary-relative bounds when the window is on the primary display; otherwise null.
   */
  async getWindowBounds(): Promise<WindowBounds | null> {
    const primary = screen.getPrimaryDisplay()
    const raw = await this.platform.getFrontmostWindowBounds(primary.bounds.height)
    if (!raw || raw.width < 50 || raw.height < 50) return null
    const pr = primary.bounds
    const inPrimary =
      raw.x >= pr.x &&
      raw.y >= pr.y &&
      raw.x + raw.width <= pr.x + pr.width &&
      raw.y + raw.height <= pr.y + pr.height
    if (!inPrimary) return null
    return {
      x: raw.x - pr.x,
      y: raw.y - pr.y,
      width: raw.width,
      height: raw.height,
    }
  }

  /**
   * Get raw frontmost window bounds (screen coordinates) and primary display for conversion.
   */
  async getRawWindowBounds(): Promise<{ bounds: WindowBounds; primaryDisplay: Electron.Display } | null> {
    const primary = screen.getPrimaryDisplay()
    const bounds = await this.platform.getFrontmostWindowBounds(primary.bounds.height)
    if (!bounds || bounds.width < 50 || bounds.height < 50) return null
    return { bounds, primaryDisplay: primary }
  }

  /**
   * Start polling window bounds and invoke callback when bounds change.
   */
  startBoundsTracking(
    callback: (bounds: WindowBounds | null) => void,
    intervalMs: number = 500
  ): void {
    this.stopBoundsTracking()
    this.updateInterval = setInterval(async () => {
      const next = await this.getWindowBounds()
      if (this.boundsChanged(this.lastBounds, next)) {
        this.lastBounds = next
        callback(next)
      }
    }, intervalMs)
  }

  stopBoundsTracking(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
    this.lastBounds = null
  }

  private boundsChanged(
    a: WindowBounds | null,
    b: WindowBounds | null
  ): boolean {
    if (a === b) return false
    if (!a || !b) return true
    return a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height
  }
}
