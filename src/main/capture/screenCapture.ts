/**
 * Local screen capture system: active-window-only capture for OCR.
 * - Uses desktopCapturer with active window bounds (via provided getBounds).
 * - Throttles captures to every 2 seconds (configurable).
 * - Cross-platform (macOS/Windows); color accuracy and high-DPI handled in renderer.
 * - Image preprocessing: grayscale, contrast (delegate to imagePreprocess).
 * - Avoids capturing when active window has not changed (cache key).
 * - PNG compression; permission and memory errors handled without stopping.
 * No network calls; entirely local.
 */

import { logger } from '../services/logger'

export interface CaptureBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ActiveWindowContext {
  appName: string
  windowTitle: string
  bounds: CaptureBounds
}

/** Default throttle: 2 seconds between captures (per debug log requirement). */
const DEFAULT_THROTTLE_MS = 2000
/** Max capture dimension to avoid memory issues; fall back to smaller if needed. */
const MAX_CAPTURE_WIDTH = 1920
const MAX_CAPTURE_HEIGHT = 1080
const MIN_BOUNDS_WIDTH = 200
const MIN_BOUNDS_HEIGHT = 150

export interface ScreenCaptureOptions {
  /** Minimum interval between captures (ms). Default 2000. */
  throttleMs?: number
  /** Callback to get current active window context. Return null to skip capture. */
  getActiveContext: () => Promise<ActiveWindowContext | null>
  /** Perform the actual capture (e.g. send request to capture window). Call with optional sourceId. */
  requestCapture: (sourceId?: string, bounds?: CaptureBounds) => void
  /** Called when capture result is available (buffer) or failed (error). */
  onCaptureResult: (buffer: Buffer | null, error?: string) => void
}

/**
 * Generates a stable key for "same window" to avoid redundant captures.
 */
function contextKey(ctx: ActiveWindowContext | null): string {
  if (!ctx) return ''
  const b = ctx.bounds
  return `${ctx.appName}|${ctx.windowTitle}|${b.x},${b.y},${b.width},${b.height}`
}

/**
 * Screen capture coordinator: throttles to throttleMs, skips when context unchanged,
 * handles permission/memory errors without stopping the service.
 */
export class ScreenCaptureService {
  private readonly throttleMs: number
  private readonly getActiveContext: () => Promise<ActiveWindowContext | null>
  private readonly requestCapture: (sourceId?: string, bounds?: CaptureBounds) => void
  private lastCaptureTime = 0
  private lastContextKey = ''
  private captureInProgress = false
  private permissionDenied = false

  constructor(private readonly options: ScreenCaptureOptions) {
    this.throttleMs = Math.max(1000, options.throttleMs ?? DEFAULT_THROTTLE_MS)
    this.getActiveContext = options.getActiveContext
    this.requestCapture = options.requestCapture
  }

  /**
   * Request a capture if throttle allows and context changed.
   * Call this from your poll loop; actual capture is done by requestCapture (e.g. renderer).
   */
  async requestCaptureIfNeeded(): Promise<boolean> {
    if (this.captureInProgress || this.permissionDenied) return false
    const now = Date.now()
    if (now - this.lastCaptureTime < this.throttleMs) return false

    let context: ActiveWindowContext | null = null
    try {
      context = await this.getActiveContext()
    } catch (err) {
      logger.debug('ScreenCaptureService: getActiveContext failed', err)
      return false
    }

    if (!context) return false
    const b = context.bounds
    if (b.width < MIN_BOUNDS_WIDTH || b.height < MIN_BOUNDS_HEIGHT) return false

    const key = contextKey(context)
    if (key === this.lastContextKey) return false

    this.lastContextKey = key
    this.lastCaptureTime = now
    this.captureInProgress = true
    this.requestCapture(undefined, this.normalizeBounds(b))
    return true
  }

  /**
   * Call when capture result is received (from main process handler).
   * Pass through to onCaptureResult and clear inProgress; handle permission errors.
   */
  handleResult(buffer: Buffer | null, error?: string): void {
    this.captureInProgress = false
    if (error && /denied|permission|not allowed|screen recording/i.test(error)) {
      this.permissionDenied = true
      logger.warn('ScreenCaptureService: screen recording permission denied')
    }
    if (error && !this.permissionDenied) {
      logger.debug('ScreenCaptureService: capture error', error)
    }
    try {
      this.options.onCaptureResult(buffer ?? null, error)
    } catch (err) {
      logger.warn('ScreenCaptureService: onCaptureResult threw', err)
    }
  }

  /**
   * If memory issues occur (e.g. very large image), caller can request a smaller capture next time.
   * This just resets the context key so the next request will capture again with potentially smaller bounds.
   */
  resetContextKey(): void {
    this.lastContextKey = ''
  }

  getCaptureInProgress(): boolean {
    return this.captureInProgress
  }

  getPermissionDenied(): boolean {
    return this.permissionDenied
  }

  private normalizeBounds(b: CaptureBounds): CaptureBounds {
    let { width, height } = b
    if (width > MAX_CAPTURE_WIDTH || height > MAX_CAPTURE_HEIGHT) {
      const r = Math.min(MAX_CAPTURE_WIDTH / width, MAX_CAPTURE_HEIGHT / height)
      width = Math.round(width * r)
      height = Math.round(height * r)
    }
    return { ...b, width, height }
  }
}
