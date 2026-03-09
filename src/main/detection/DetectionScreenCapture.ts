/**
 * Screen capture as fallback detection and for extracting email content when other methods aren't available.
 * Only captures when an email app is detected. Uses desktopCapturer (via injectable performCapture).
 */

import { desktopCapturer } from 'electron'
import { logger } from '../services/logger'

export interface CaptureBounds {
  x: number
  y: number
  width: number
  height: number
}

export type PerformCaptureFn = (sourceId?: string, bounds?: CaptureBounds) => Promise<Buffer | null>

/**
 * Screen capture service optimized for email content: periodic capture when email app is active,
 * with optional region capture. Requires a performCapture implementation (e.g. from main capture window).
 */
export class DetectionScreenCapture {
  private isCapturing = false
  private captureIntervalMs = 5000
  private lastCaptureHash: string | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private performCapture: PerformCaptureFn | null = null

  /**
   * Set the function that performs the actual capture (e.g. requests frame from capture window).
   * Must be set before startCapture().
   */
  setCaptureProvider(fn: PerformCaptureFn): void {
    this.performCapture = fn
  }

  /**
   * Set interval in ms between captures when email app is active. Min 2000.
   */
  setCaptureInterval(ms: number): void {
    this.captureIntervalMs = Math.max(2000, ms)
    if (this.isCapturing && this.intervalId) {
      this.stopCapture()
      this.startCapture(this._isEmailActive!, this._onCapture!)
    }
  }

  private _isEmailActive: (() => boolean) | null = null
  private _onCapture: ((buffer: Buffer) => void) | null = null

  /**
   * Start periodic screen capture. Only runs when isEmailActive() returns true.
   * onCapture is called with each captured image buffer.
   */
  startCapture(isEmailActive: () => boolean, onCapture: (buffer: Buffer) => void): void {
    if (this.isCapturing) return
    this._isEmailActive = isEmailActive
    this._onCapture = onCapture
    this.isCapturing = true
    const tick = async () => {
      if (!this._isEmailActive?.() || !this.performCapture) return
      try {
        const buffer = await this.captureScreen()
        if (buffer && buffer.length > 0) {
          const hash = this.hashBuffer(buffer)
          if (hash !== this.lastCaptureHash) {
            this.lastCaptureHash = hash
            this._onCapture?.(buffer)
          }
        }
      } catch (err) {
        logger.debug('DetectionScreenCapture: tick failed', err)
      }
    }
    tick()
    this.intervalId = setInterval(tick, this.captureIntervalMs)
    logger.debug('DetectionScreenCapture: started')
  }

  /**
   * Stop periodic capture and release resources.
   */
  stopCapture(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isCapturing = false
    this._isEmailActive = null
    this._onCapture = null
    this.lastCaptureHash = null
    logger.debug('DetectionScreenCapture: stopped')
  }

  /**
   * Capture screen (active window or full screen). Returns image buffer or null.
   * Uses desktopCapturer.getSources() and the configured performCapture to obtain the frame.
   */
  async captureScreen(sourceId?: string): Promise<Buffer | null> {
    if (this.performCapture) {
      return this.performCapture(sourceId)
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false,
      })
      const windowSources = sources.filter(
        (s) => s.name && s.name !== 'Entire Screen' && !/^Screen \d+$/.test(s.name)
      )
      const chosen = sourceId
        ? sources.find((s) => s.id === sourceId) ?? windowSources[0] ?? sources[0]
        : windowSources[0] ?? sources[0]
      if (!chosen) return null
      const thumb = chosen.thumbnail
      if (!thumb || !thumb.toPNG) return null
      return Buffer.from(thumb.toPNG())
    } catch (err) {
      logger.warn('DetectionScreenCapture: captureScreen failed', err)
      return null
    }
  }

  /**
   * Capture only the email content region using window bounds.
   * Returns full capture then caller can crop via extractTextRegion; or performCapture can accept bounds.
   */
  async captureEmailRegion(bounds: CaptureBounds): Promise<Buffer | null> {
    if (this.performCapture) {
      return this.performCapture(undefined, bounds)
    }
    const full = await this.captureScreen()
    if (!full || full.length < 100) return null
    try {
      const { extractTextRegion } = await import('./imagePreprocess')
      return extractTextRegion(full, bounds)
    } catch {
      return full
    }
  }

  isRunning(): boolean {
    return this.isCapturing
  }

  private hashBuffer(buf: Buffer): string {
    let h = 0
    const step = Math.max(1, Math.floor(buf.length / 500))
    for (let i = 0; i < buf.length; i += step) {
      h = ((h << 5) - h + buf[i]) | 0
    }
    return String(h)
  }
}
