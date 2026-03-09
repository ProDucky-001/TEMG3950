import { BrowserWindow, ipcMain, screen, desktopCapturer, app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { SettingsManager } from '../managers/SettingsManager'
import type { AlertManager } from '../managers/AlertManager'
import type { LinkScanner } from '../services/LinkScanner'
import type { ContentScanner } from '../services/ai-detection/ContentScanner'
import { PlatformSpecificManager } from '../integration/PlatformSpecificManager'
import { OverlayManager } from '../windows/OverlayManager'
import { AppContextDetector } from '../integration/AppContextDetector'
import { ContentExtractor } from '../integration/ContentExtractor'
import { ApplicationIntegrator } from '../integration/ApplicationIntegrator'
import { EmailDetectionPipeline } from '../detection/EmailDetectionPipeline'
import { TieredDetectionSystem } from '../detection/TieredDetectionSystem'
import { PriorityManager } from '../detection/PriorityManager'
import type { WindowInfo } from '../detection/types'
import { DetectionCache } from '../utils/DetectionCache'
import { PrivacyManager } from '../integration/PrivacyManager'
import { OCRProcessor } from '../services/OCRProcessor'
import { preprocessForOCR, preprocessForOCRFirefox, cleanOCRText } from '../detection/imagePreprocess'
import { getContentSourceType, getAppIdFromProcessName } from '../integration/appMapping'
import type { ContentContext } from '../../shared/integration-types'
import { logger } from '../services/logger'
import { isRealUrl } from '../utils/urlUtils'

const devServerUrl = process.env.ELECTRON_RENDERER_URL || process.env.ELECTRON_VITE_DEV_SERVER_URL
const isDev = process.env.NODE_ENV === 'development' || !!devServerUrl
const DEFAULT_POLL_INTERVAL_MS = 3000
const DEBUG_LOG_PATH = '/Users/symok/Desktop/UST1-2/Anti Scam/.cursor/debug-2b6709.log'
/** Show grey overlay on app window within this time when app is determined (ms).
 * Budget: 100ms poll + 80ms debounce + this delay < 200ms total. */
const OVERLAY_APP_DETERMINED_DELAY_MS = 10
/** Structured debug log interval (ms). */
const DEBUG_LOG_INTERVAL_MS = 2000

function getDebugLogPath(): string {
  try {
    const workspaceLog = path.join(process.cwd(), '.cursor', 'debug-detection.log')
    const dir = path.dirname(workspaceLog)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return workspaceLog
  } catch {
    return path.join(app.getPath('userData'), 'debug-detection.log')
  }
}

export interface ScreenCaptureManagerOptions {
  settingsManager: SettingsManager
  alertManager: AlertManager
  linkScanner: LinkScanner
  contentScanner: ContentScanner
  onLinkScanned?: (riskScore: number) => void
  /** When set, active window detection uses DetectionManager (active-win) instead of platform/OverlayManager. */
  detectionManager?: import('./DetectionManager').DetectionManager
}

export type ScreenCapturePermissionStatus = 'granted' | 'denied' | 'unknown'

/**
 * Captures screen content when user is viewing an email client, runs local OCR,
 * and analyzes text for suspicious content. Works alongside clipboard and browser URL monitoring.
 * Screenshots are processed locally and never stored.
 */
export class ScreenCaptureManager {
  private readonly settingsManager: SettingsManager
  private readonly alertManager: AlertManager
  private readonly onLinkScanned?: (riskScore: number) => void
  private readonly platform: PlatformSpecificManager
  private readonly contextDetector: AppContextDetector
  private readonly extractor: ContentExtractor
  private readonly emailPipeline: EmailDetectionPipeline
  private readonly tieredDetection: TieredDetectionSystem
  private readonly detectionCache: DetectionCache
  private readonly priorityManager: PriorityManager
  private readonly integrator: ApplicationIntegrator
  private readonly privacy: PrivacyManager
  private readonly ocr: OCRProcessor
  private readonly overlayManager: OverlayManager
  private readonly detectionManager?: import('./DetectionManager').DetectionManager

  private captureWindow: BrowserWindow | null = null
  private overlayWindow: BrowserWindow | null = null
  private overlayCheckTimer: ReturnType<typeof setInterval> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  /** Debounce: show overlay after 200ms of email active; hide after 400ms of inactive. */
  private overlayShowTimeout: ReturnType<typeof setTimeout> | null = null
  private overlayHideTimeout: ReturnType<typeof setTimeout> | null = null
  private pendingOverlayShow: { state: 'monitoring' | 'processing'; bounds: { x: number; y: number; width: number; height: number } | undefined; windowName: string } | null = null
  private permissionStatus: ScreenCapturePermissionStatus = 'unknown'
  private captureInProgress = false
  private lastOverlayVisible = false
  private lastOverlayState: 'monitoring' | 'processing' = 'monitoring'
  /** When we detected "inbox" or "mail.google"/"gmail.com" in OCR, treat as email until this time. */
  private lastInboxHintUntil = 0
  /** When we detected Outlook in OCR, treat as email until this time. */
  private lastOutlookHintUntil = 0
  private static readonly EMAIL_HINT_MS = 5000
  private lastOverlayBounds: { x: number; y: number; width: number; height: number } | null = null
  private lastFrontmostAppName = ''
  private lastValidBounds: { x: number; y: number; width: number; height: number } | null = null
  private lastValidBoundsApp = ''
  private cachedBrowserUrl: string | null = null
  private cachedBrowserUrlTime = 0
  private static readonly URL_CACHE_TTL_MS = 800
  private nextPollTimeout: ReturnType<typeof setTimeout> | null = null
  /** Set when we request capture so handleCaptureResult can update cache. */
  private lastCacheKey: string | null = null
  private _overlayLogOnce = false

  // --- Structured debug log state ---
  private debugLogTimer: ReturnType<typeof setInterval> | null = null
  private lastDebugLogLine: string | null = null
  private debugState = {
    application: '' as string,
    tabDetected: '' as string,
    isEmail: false as boolean,
    url: '' as string,
    contentPreview: '' as string,
    overlayColor: 'none' as 'none' | 'grey' | 'green',
    hoverLink: '' as string,
  }

  constructor(options: ScreenCaptureManagerOptions) {
    this.settingsManager = options.settingsManager
    this.alertManager = options.alertManager
    this.onLinkScanned = options.onLinkScanned
    this.platform = new PlatformSpecificManager()
    this.contextDetector = new AppContextDetector(this.platform)
    this.extractor = new ContentExtractor()
    this.emailPipeline = new EmailDetectionPipeline()
    this.integrator = new ApplicationIntegrator(options.linkScanner, options.contentScanner)
    this.ocr = new OCRProcessor()
    this.tieredDetection = new TieredDetectionSystem(this.ocr, this.extractor, this.integrator)
    this.detectionCache = new DetectionCache(30_000)
    this.priorityManager = new PriorityManager()
    this.privacy = new PrivacyManager(options.settingsManager)
    this.overlayManager = new OverlayManager(this.platform)
    this.detectionManager = options.detectionManager
  }

  getPermissionStatus(): ScreenCapturePermissionStatus {
    return this.permissionStatus
  }

  /** Instructions for granting screen recording (macOS) or equivalent (Windows). */
  getPermissionInstructions(): { platform: string; steps: string } {
    if (process.platform === 'darwin') {
      return {
        platform: 'macOS',
        steps:
          'Open System Settings > Privacy & Security > Screen Recording, add ScamShield, then restart the app.',
      }
    }
    if (process.platform === 'win32') {
      return {
        platform: 'Windows',
        steps: 'Ensure ScamShield is allowed to capture the screen in Settings > Privacy > Screen capture (or equivalent).',
      }
    }
    return { platform: 'Linux', steps: 'Screen capture may require additional permissions depending on your environment.' }
  }

  start(): void {
    if (this.pollTimer) return
    this.ensureCaptureWindow()
    this.overlayCheckTimer = setInterval(() => this.updateOverlayVisibility(), 100)
    ipcMain.on('capture-result', this.handleCaptureResult)
    ipcMain.handle('capture-get-sources', async (_e, opts: { types: ('window' | 'screen')[] }) => {
      const sources = await desktopCapturer.getSources(opts)
      return sources.map((s) => ({ id: s.id, name: s.name }))
    })
    const pollIntervalMs = this.getPollIntervalMs()
    setTimeout(() => {
      this.poll()
      this.scheduleNextPoll()
    }, Math.min(5000, pollIntervalMs))
    setTimeout(() => this.probeCaptureCapability(), 4500)
    this.startDebugLog()
    logger.info('ScreenCaptureManager: started')
  }

  stop(): void {
    if (this.nextPollTimeout) {
      clearTimeout(this.nextPollTimeout)
      this.nextPollTimeout = null
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.overlayCheckTimer) {
      clearInterval(this.overlayCheckTimer)
      this.overlayCheckTimer = null
    }
    if (this.overlayShowTimeout) {
      clearTimeout(this.overlayShowTimeout)
      this.overlayShowTimeout = null
    }
    if (this.overlayHideTimeout) {
      clearTimeout(this.overlayHideTimeout)
      this.overlayHideTimeout = null
    }
    this.pendingOverlayShow = null
    ipcMain.removeListener('capture-result', this.handleCaptureResult)
    ipcMain.removeHandler('capture-get-sources')
    this.setOverlayVisible(false)
    this.destroyOverlayWindow()
    this.destroyCaptureWindow()
    this.detectionCache.clear()
    this.priorityManager.reset()
    this.stopDebugLog()
    this.ocr.terminate()
    logger.info('ScreenCaptureManager: stopped')
  }

  private getPollIntervalMs(): number {
    const ms = this.settingsManager.getSettings().screenCapturePollIntervalMs
    return typeof ms === 'number' && ms >= 1000 ? ms : DEFAULT_POLL_INTERVAL_MS
  }

  /**
   * Get current context and window bounds. Uses DetectionManager (active-win) when provided, else AppContextDetector + OverlayManager.
   * When DetectionManager does not provide bounds, falls back to OverlayManager (platform frontmost window) so overlay uses window bounds, not desktop.
   */
  private async getContextAndBounds(): Promise<{
    context: {
      isEmailClientActive: boolean
      appId: import('../../shared/integration-types').SupportedAppId | null
      context: 'inbox' | 'reading' | 'composing' | 'unknown'
      browserUrl: string | null
      windowName: string
    }
    rawResult: { bounds: { x: number; y: number; width: number; height: number }; primaryDisplay: Electron.Display } | null
  }> {
    if (this.detectionManager) {
      const state = this.detectionManager.getState()
      const info = this.detectionManager.getActiveWindowInfo()

      // If active-win returned data, use it directly
      if (info && info.owner?.name) {
        const primary = screen.getPrimaryDisplay()
        const windowName = info.owner.name
        let bounds = info.bounds ?? state.bounds ?? null
        const minW = Math.max(400, primary.bounds.width * 0.5)
        const minH = Math.max(300, primary.bounds.height * 0.4)
        const isMainWindow = bounds != null && bounds.width >= minW && bounds.height >= minH
        if (!isMainWindow) {
          if (this.lastValidBounds && this.lastValidBoundsApp === windowName) {
            bounds = this.lastValidBounds
          } else {
            try {
              const fallback = await this.overlayManager.getRawWindowBounds()
              if (fallback && fallback.bounds.width >= minW && fallback.bounds.height >= minH) {
                bounds = fallback.bounds
              }
            } catch { /* AppleScript fallback failed */ }
          }
        }
        if (bounds && bounds.width >= minW && bounds.height >= minH) {
          this.lastValidBounds = bounds
          this.lastValidBoundsApp = windowName
        }
        const appId = this.detectionStateToAppId(state.activeApp) ?? getAppIdFromProcessName(windowName)
        let browserUrl = state.url ?? info.url ?? null
        if (!browserUrl) {
          const isBrowser = ['chrome', 'safari', 'firefox'].includes(appId ?? '')
            || /chrome|safari|firefox|brave|edge|browser/i.test(windowName)
          // #region agent log
          try {
            const now = Date.now()
            const cached = this.cachedBrowserUrl && now - this.cachedBrowserUrlTime < ScreenCaptureManager.URL_CACHE_TTL_MS
            fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ sessionId: '2b6709', location: 'ScreenCaptureManager:getContextAndBounds', message: 'browser url path', data: { ownerName: windowName, appId, isBrowser, browserUrlEmpty: true, willFetchUrl: isBrowser && !cached }, timestamp: Date.now(), hypothesisId: 'S1' }) + '\n')
          } catch (_) {}
          // #endregion
          if (isBrowser) {
            const now = Date.now()
            if (this.cachedBrowserUrl && now - this.cachedBrowserUrlTime < ScreenCaptureManager.URL_CACHE_TTL_MS) {
              browserUrl = this.cachedBrowserUrl
            } else {
              try {
                browserUrl = await this.platform.getCurrentBrowserUrl()
                this.cachedBrowserUrl = browserUrl
                this.cachedBrowserUrlTime = now
              } catch { /* AppleScript URL fallback failed */ }
            }
          } else {
            this.cachedBrowserUrl = null
          }
        } else {
          this.cachedBrowserUrl = browserUrl
          this.cachedBrowserUrlTime = Date.now()
        }
        let isEmail = state.status === 'detected' && state.activeApp != null
        if (!isEmail && browserUrl) {
          isEmail = this.isEmailUrl(browserUrl)
        }
        const resolvedAppId = isEmail && browserUrl
          ? (this.emailUrlToAppId(browserUrl) ?? appId)
          : appId
        return {
          context: {
            isEmailClientActive: isEmail,
            appId: resolvedAppId,
            context: isEmail ? 'reading' : 'unknown',
            browserUrl,
            windowName: windowName || info.title || '',
          },
          rawResult: bounds && bounds.width >= minW && bounds.height >= minH ? { bounds, primaryDisplay: primary } : null,
        }
      }
      // active-win unavailable — fall through to AppleScript path below
    }
    // AppleScript-based detection: works without native modules
    const [context, rawResult] = await Promise.all([
      this.contextDetector.getContext(),
      this.overlayManager.getRawWindowBounds(),
    ])
    return {
      context: {
        isEmailClientActive: context.isEmailClientActive,
        appId: context.appId,
        context: context.context,
        browserUrl: context.browserUrl,
        windowName: context.windowName,
      },
      rawResult,
    }
  }

  private isEmailUrl(url: string | null | undefined): boolean {
    if (!url) return false
    const lower = url.trim().toLowerCase()
    const withScheme = /^https?:\/\//i.test(lower) ? lower : 'https://' + lower
    if (/mail\.google\.com|gmail\.com/.test(withScheme)) return true
    const emailDomains = [
      'outlook.live.com', 'outlook.office.com', 'outlook.com',
      'outlook.office365.com', 'outlook.cloud.microsoft.com',
      'mail.yahoo.com', 'mail.protonmail.com', 'protonmail.com', 'proton.me',
    ]
    if (emailDomains.some((d) => withScheme.includes(d))) return true
    return false
  }

  private emailUrlToAppId(url: string | null | undefined): import('../../shared/integration-types').SupportedAppId | null {
    if (!url) return null
    const lower = url.trim().toLowerCase()
    if (/mail\.google\.com|gmail\.com/.test(lower)) return 'gmail'
    if (/outlook\.(live|office|office365|cloud\.microsoft)\.com|outlook\.com/.test(lower)) return 'outlook'
    if (/mail\.yahoo\.com/.test(lower)) return 'generic'
    if (/protonmail\.com|proton\.me/.test(lower)) return 'generic'
    return null
  }

  private detectionStateToAppId(activeApp: string | null): import('../../shared/integration-types').SupportedAppId | null {
    if (!activeApp) return null
    const app = activeApp.toLowerCase()
    if (app.includes('gmail')) return 'gmail'
    if (app.includes('outlook') || app.includes('microsoft')) return 'outlook'
    if (app.includes('apple') || app.includes('mail')) return 'generic'
    return getAppIdFromProcessName(activeApp)
  }

  /** Schedule next poll using priority-based interval (high=500ms, medium=2s, low=5s). */
  private scheduleNextPoll(): void {
    if (this.nextPollTimeout) return
    const run = async () => {
      try {
        const { context, rawResult } = await this.getContextAndBounds()
        const bounds = rawResult?.bounds ?? { x: 0, y: 0, width: 100, height: 100 }
        const windowInfo: WindowInfo = {
          owner: { name: context.windowName ?? '' },
          bounds,
          appType: context.appId ?? 'unknown',
          browserUrl: context.browserUrl,
        }
        const interval = this.priorityManager.getPollingInterval(this.priorityManager.getPriority(windowInfo))
        const baseInterval = this.getPollIntervalMs()
        const intervalMs = Math.min(interval, baseInterval)
        this.nextPollTimeout = setTimeout(() => {
          this.nextPollTimeout = null
          this.poll()
          this.scheduleNextPoll()
        }, intervalMs)
      } catch (err) {
        logger.debug('ScreenCaptureManager: scheduleNextPoll failed', err)
        this.nextPollTimeout = setTimeout(() => {
          this.nextPollTimeout = null
          this.poll()
          this.scheduleNextPoll()
        }, this.getPollIntervalMs())
      }
    }
    run()
  }

  private get enabled(): boolean {
    const s = this.settingsManager.getSettings()
    return s.monitoringEnabled && (s.screenCaptureEnabled !== false) && this.permissionStatus !== 'denied'
  }

  /** Resolve capture preload path so it works in dev and production. Returns '' if not found. */
  private resolveCapturePreloadPath(): string {
    const candidates = [
      path.join(__dirname, '../preload/capture.js'),
      path.join(process.cwd(), 'out/preload/capture.js'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
    return ''
  }

  /** Resolve overlay preload path so overlayAPI is exposed and corners receive bounds/state. */
  private resolveOverlayPreloadPath(): string {
    const candidates = [
      path.join(__dirname, '../preload/overlay.js'),
      path.join(process.cwd(), 'out/preload/overlay.js'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
    return ''
  }

  private ensureCaptureWindow(): void {
    if (this.captureWindow && !this.captureWindow.isDestroyed()) return
    const preloadPath = this.resolveCapturePreloadPath()
    this.captureWindow = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      webPreferences: {
        ...(preloadPath ? { preload: preloadPath } : {}),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    if (!preloadPath) {
      logger.warn('ScreenCaptureManager: capture preload not found; screen capture will fail until preload is built')
    }
    this.captureWindow.setMenuBarVisibility(false)
    if (devServerUrl) {
      this.captureWindow.loadURL(`${devServerUrl}/capture.html`)
    } else {
      this.captureWindow.loadFile(path.join(__dirname, '../renderer/capture.html'))
    }
  }

  private destroyCaptureWindow(): void {
    if (this.captureWindow && !this.captureWindow.isDestroyed()) {
      this.captureWindow.destroy()
    }
    this.captureWindow = null
  }

  private async updateOverlayVisibility(): Promise<void> {
    try {
      const settings = this.settingsManager.getSettings()
      const enabled = this.enabled
      if (!enabled) {
        this.clearOverlayShowTimeout()
        this.setOverlayVisible(false)
        return
      }
      if (settings.showRecordingIndicator === false) {
        this.clearOverlayShowTimeout()
        this.setOverlayVisible(false)
        return
      }
      const { context, rawResult } = await this.getContextAndBounds()
      const primaryDisplay = rawResult?.primaryDisplay ?? screen.getPrimaryDisplay()
      let bounds: { x: number; y: number; width: number; height: number } | null = null
      if (rawResult) {
        const { bounds: raw } = rawResult
        const pr = primaryDisplay.bounds
        const relX = raw.x - pr.x
        const relY = raw.y - pr.y
        const visibleRight = Math.min(relX + raw.width, pr.width)
        const visibleBottom = Math.min(relY + raw.height, pr.height)
        const clampedX = Math.max(0, relX)
        const clampedY = Math.max(0, relY)
        const visW = visibleRight - clampedX
        const visH = visibleBottom - clampedY
        if (visW > 200 && visH > 200) {
          bounds = { x: clampedX, y: clampedY, width: visW, height: visH }
        }
      }
      const minW = Math.max(400, primaryDisplay.bounds.width * 0.5)
      const minH = Math.max(300, primaryDisplay.bounds.height * 0.4)
      const hasWindowBounds = bounds != null && bounds.width >= minW && bounds.height >= minH
      const hasApp = !!(context.windowName)

      const urlIsEmail = this.isEmailUrl(context.browserUrl)
      const isEmailTab =
        context.isEmailClientActive ||
        urlIsEmail ||
        ((context.appId === 'chrome' || context.appId === 'safari' || context.appId === 'firefox') &&
          (this.lastInboxHintUntil > Date.now() || this.lastOutlookHintUntil > Date.now()))

      // Show grey brackets for ANY application with valid bounds, green for email
      const show = hasWindowBounds && (hasApp || this.captureInProgress)

      // Grey = any app determined. Green = email tab confirmed.
      const state: 'monitoring' | 'processing' =
        this.captureInProgress ? 'processing' : isEmailTab ? 'monitoring' : 'processing'

      const currentApp = context.windowName || ''
      if (currentApp !== this.debugState.application) {
        this.debugState.contentPreview = ''
        this.debugState.url = ''
      }
      this.debugState.application = currentApp
      this.debugState.tabDetected = context.appId || currentApp
      this.debugState.isEmail = isEmailTab
      if (context.browserUrl) this.debugState.url = context.browserUrl

      if (show) {
        this.clearOverlayHideTimeout()
        const boundsToUse = bounds ?? undefined
        if (this.lastOverlayVisible) {
          this.setOverlayVisible(true, state, boundsToUse, context.windowName)
        } else if (this.captureInProgress || isEmailTab) {
          this.setOverlayVisible(true, state, boundsToUse, context.windowName)
        } else {
          this.pendingOverlayShow = { state, bounds: boundsToUse, windowName: context.windowName }
          if (!this.overlayShowTimeout) {
            this.overlayShowTimeout = setTimeout(() => {
              this.overlayShowTimeout = null
              const p = this.pendingOverlayShow
              this.pendingOverlayShow = null
              if (p) this.setOverlayVisible(true, p.state, p.bounds, p.windowName)
            }, OVERLAY_APP_DETERMINED_DELAY_MS)
          }
        }
      } else {
        this.clearOverlayShowTimeout()
        this.pendingOverlayShow = null
        this.scheduleOverlayHide()
      }
    } catch (err) {
      logger.warn('ScreenCaptureManager: updateOverlayVisibility failed', err)
      this.setOverlayVisible(false)
    }
  }

  private clearOverlayShowTimeout(): void {
    if (this.overlayShowTimeout) {
      clearTimeout(this.overlayShowTimeout)
      this.overlayShowTimeout = null
    }
    this.pendingOverlayShow = null
  }

  private clearOverlayHideTimeout(): void {
    if (this.overlayHideTimeout) {
      clearTimeout(this.overlayHideTimeout)
      this.overlayHideTimeout = null
    }
  }

  private scheduleOverlayHide(): void {
    if (!this.lastOverlayVisible) return
    if (this.overlayHideTimeout) return
    this.overlayHideTimeout = setTimeout(() => {
      this.overlayHideTimeout = null
      this.setOverlayVisible(false)
    }, 400)
  }

  private sendOverlayState(state: 'monitoring' | 'processing'): void {
    const win = this.overlayWindow
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('overlay-state', state)
    }
  }

  private sendOverlayBounds(bounds: { x: number; y: number; width: number; height: number } | null): void {
    this.lastOverlayBounds = bounds
    const win = this.overlayWindow
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('overlay-bounds', bounds)
    }
  }

  private sendOverlayWindowData(
    bounds: { x: number; y: number; width: number; height: number } | null,
    state: 'monitoring' | 'processing',
    appName: string,
    windowTitle: string
  ): void {
    const win = this.overlayWindow
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('overlay-window-data', { bounds, state, appName, windowTitle })
    }
  }

  private setOverlayVisible(
    visible: boolean,
    state?: 'monitoring' | 'processing',
    frontmostBounds?: { x: number; y: number; width: number; height: number },
    frontmostAppName?: string
  ): void {
    const newState = state ?? 'monitoring'
    if (frontmostAppName) this.lastFrontmostAppName = frontmostAppName
    const windowTitle = this.detectionManager?.getActiveWindowInfo()?.title ?? ''
    if (!visible) {
      if (this.lastOverlayVisible) {
        this.lastOverlayVisible = false
        this.sendOverlayBounds(null)
        this.sendOverlayWindowData(null, newState, this.lastFrontmostAppName, windowTitle)
        const win = this.overlayWindow
        if (win && !win.isDestroyed()) win.hide()
      }
      return
    }
    this.ensureOverlayWindow()
    const win = this.overlayWindow
    if (win && !win.isDestroyed()) {
      if (!this.lastOverlayVisible) {
        this.lastOverlayVisible = true
        if (typeof win.showInactive === 'function') {
          win.showInactive()
        } else {
          win.show()
        }
        if (frontmostAppName && this.platform.restoreFrontmost) {
          setTimeout(() => this.platform.restoreFrontmost(frontmostAppName), 50)
        }
      }
      this.sendOverlayState(newState)
      this.sendOverlayBounds(frontmostBounds ?? null)
      this.sendOverlayWindowData(frontmostBounds ?? null, newState, this.lastFrontmostAppName, windowTitle)
    } else if (!this.lastOverlayVisible) {
      this.lastOverlayVisible = true
    }
    this.lastOverlayState = newState
    this.sendOverlayState(newState)
  }

  private ensureOverlayWindow(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) return
    const primary = screen.getPrimaryDisplay()
    const { x, y, width, height } = primary.bounds
    const preloadPath = this.resolveOverlayPreloadPath()
    const usePreload = !!preloadPath
    this.overlayWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      resizable: false,
      hasShadow: false,
      show: false,
      focusable: false,
      webPreferences: {
        ...(usePreload ? { preload: preloadPath } : {}),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    this.overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    if (process.platform === 'darwin') {
      this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
    this.overlayWindow.setMenuBarVisibility(false)
    this.overlayWindow.webContents.once('did-finish-load', () => {
      this.sendOverlayState(this.lastOverlayState)
      if (this.lastOverlayBounds) this.sendOverlayBounds(this.lastOverlayBounds)
      // Re-send after a short delay so the overlay page's IPC listeners are definitely registered (avoids race)
      setTimeout(() => {
        this.sendOverlayState(this.lastOverlayState)
        if (this.lastOverlayBounds) this.sendOverlayBounds(this.lastOverlayBounds)
      }, 100)
      if (this.lastOverlayVisible) {
        const w = this.overlayWindow
        if (w && !w.isDestroyed()) {
          if (typeof w.showInactive === 'function') {
            w.showInactive()
          } else {
            w.show()
          }
          if (this.lastFrontmostAppName && this.platform.restoreFrontmost) {
            setTimeout(() => this.platform.restoreFrontmost(this.lastFrontmostAppName), 80)
          }
        }
      }
    })
    if (devServerUrl) {
      this.overlayWindow.loadURL(`${devServerUrl}/recording-overlay.html`)
    } else {
      const toLoad = fs.existsSync(path.join(__dirname, '../renderer/recording-overlay.html'))
        ? path.join(__dirname, '../renderer/recording-overlay.html')
        : path.join(process.cwd(), 'out/renderer/recording-overlay.html')
      this.overlayWindow.loadFile(toLoad)
    }
  }

  private destroyOverlayWindow(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.destroy()
    }
    this.overlayWindow = null
    this.lastOverlayVisible = false
    this.lastOverlayState = 'monitoring'
  }

  /** One-time probe to verify we can capture and read from the screen; sets permissionStatus. */
  private probeCaptureCapability(): void {
    if (this.permissionStatus === 'denied' || this.captureInProgress) return
    const s = this.settingsManager.getSettings()
    if (!s.monitoringEnabled || s.screenCaptureEnabled === false) return
    this.ensureCaptureWindow()
    const win = this.captureWindow
    if (!win || win.isDestroyed()) return
    this.captureInProgress = true
    this.updateOverlayVisibility()
    win.webContents.send('capture-request')
  }

  /**
   * Poll: optionally skip via tier1/cache/shouldScan, then request one capture.
   */
  private async poll(): Promise<void> {
    if (!this.enabled || this.captureInProgress) return
    const { context, rawResult } = await this.getContextAndBounds()
    const bounds = rawResult?.bounds ?? { x: 0, y: 0, width: 100, height: 100 }
    const windowInfo: WindowInfo = {
      owner: { name: context.windowName ?? '' },
      bounds,
      appType: context.appId ?? 'unknown',
      browserUrl: context.browserUrl,
    }
    const tier1 = await this.tieredDetection.tier1QuickCheck(context)
    const cacheKey = DetectionCache.windowKey(windowInfo.owner.name, bounds)
    const cached = this.detectionCache.get<{ isEmail: boolean }>(cacheKey)
    // When not on email app: skip if window unchanged or cache says not email. When on email: always poll for higher refresh.
    if (!tier1.isEmail) {
      if (!this.priorityManager.shouldScan(windowInfo)) return
      if (cached?.isEmail === false) return
    }
    this.lastCacheKey = cacheKey
    this.ensureCaptureWindow()
    const win = this.captureWindow
    if (!win || win.isDestroyed()) return
    this.captureInProgress = true
    this.updateOverlayVisibility()
    win.webContents.send('capture-request')
  }

  private handleCaptureResult = async (_: Electron.IpcMainEvent, buffer: Buffer, error?: string): Promise<void> => {
    this.captureInProgress = false
    this.updateOverlayVisibility()
    if (error) {
      if (/denied|permission|not allowed|screen recording/i.test(error)) {
        this.permissionStatus = 'denied'
      }
      logger.debug('ScreenCaptureManager: capture error', error)
      return
    }
    if (!buffer || buffer.length < 100) return
    this.permissionStatus = 'granted'

    try {
      const { context } = await this.getContextAndBounds()
      const isFirefox =
        context?.appId === 'firefox' || (context?.windowName ?? '').toLowerCase().includes('firefox')
      const preprocessed = isFirefox
        ? await preprocessForOCRFirefox(Buffer.from(buffer))
        : await preprocessForOCR(Buffer.from(buffer))
      const rawText = await this.ocr.recognize(preprocessed)
      const text = cleanOCRText(rawText || '')
      if (!text || text.length < 20) return
      // #region agent log
      try {
        fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ sessionId: '2b6709', location: 'ScreenCaptureManager:handleCaptureResult', message: 'OCR result', data: { textLength: text.length, preview: text.slice(0, 80).replace(/\s+/g, ' ') }, timestamp: Date.now(), hypothesisId: 'O1' }) + '\n')
      } catch (_) {}
      // #endregion

      this.privacy.requireNoStorage(text)

      const ocrStart = text.slice(0, 800).toLowerCase()
      const ocrExtended = text.slice(0, 1200).toLowerCase()
      const isBrowser = context.appId === 'chrome' || context.appId === 'safari' || context.appId === 'firefox'

      const inboxInOCR = ocrStart.includes('inbox') && (ocrStart.includes('mail') || ocrStart.includes('gmail'))
      const gmailInOCR = (ocrStart.includes('mail.google') || ocrStart.includes('gmail.com')) && isBrowser
      if ((inboxInOCR || gmailInOCR) && isBrowser) {
        this.lastInboxHintUntil = Date.now() + ScreenCaptureManager.EMAIL_HINT_MS
      }

      const outlookInOCR =
        ocrStart.includes('outlook') &&
        (ocrStart.includes('mail') || ocrStart.includes('cloud') || ocrStart.includes('microsoft') || ocrStart.includes('inbox') || ocrStart.includes('office') || ocrStart.includes('live'))
      const outlookInOCRExtended =
        ocrExtended.includes('outlook') &&
        (ocrExtended.includes('cloud') || ocrExtended.includes('office') || ocrExtended.includes('microsoft') || ocrExtended.includes('mail') || ocrExtended.includes('live'))
      const outlookOnlyInOCR = ocrExtended.includes('outlook') && isBrowser
      if ((outlookInOCR || outlookInOCRExtended || outlookOnlyInOCR) && isBrowser) {
        this.lastOutlookHintUntil = Math.max(this.lastOutlookHintUntil, Date.now() + ScreenCaptureManager.EMAIL_HINT_MS)
      }

      const effectiveIsEmailClient =
        context.isEmailClientActive ||
        (inboxInOCR && !!context.appId) ||
        (gmailInOCR && !!context.appId) ||
        (outlookInOCR && !!context.appId) ||
        (outlookInOCRExtended && !!context.appId) ||
        (outlookOnlyInOCR && !!context.appId)
      const effectiveAppId = context.isEmailClientActive
        ? context.appId
        : outlookInOCR || outlookInOCRExtended || outlookOnlyInOCR
          ? (context.appId ? 'outlook' : null)
          : inboxInOCR || gmailInOCR
            ? (context.appId ? 'gmail' : null)
            : null
      const pipelineResult = this.emailPipeline.processFromOCR(context, text, 0)
      let link: string | null = context.browserUrl && isRealUrl(context.browserUrl) ? context.browserUrl : null
      if (!link && pipelineResult.detectedURL && isRealUrl(pipelineResult.detectedURL)) {
        link = pipelineResult.detectedURL
      }
      if (!link && text) {
        link = this.extractor.getFirstLinkForLog(text, 1200) ?? null
      }
      const linkForLog = link ?? (context.browserUrl && context.browserUrl.trim().length > 0 ? context.browserUrl.trim() : null)

      if (isBrowser && link) this.detectionManager.setLastCaptureUrl(link)
      else if (!isBrowser) this.detectionManager.setLastCaptureUrl(null)
      if (context.browserUrl) this.debugState.url = context.browserUrl
      else if (isBrowser && link) this.debugState.url = link

      this.debugState.contentPreview = text.replace(/[\r\n]+/g, ' ').slice(0, 100)
      this.debugState.hoverLink = linkForLog ?? ''

      if (!effectiveIsEmailClient || !effectiveAppId || !this.privacy.isMonitoringAllowed(effectiveAppId)) {
        if (this.lastCacheKey) {
          this.detectionCache.set(this.lastCacheKey, { isEmail: effectiveIsEmailClient })
        }
        return
      }
      const appId = effectiveAppId
      const sourceType = getContentSourceType(appId)
      const content = this.extractor.extractFromText(text, sourceType === 'email' ? 'email' : 'clipboard', appId)
      if (content.urls.length === 0 && (!content.snippet || content.snippet.length < 30)) return

      const ctx: ContentContext =
        sourceType === 'email'
          ? { type: 'email', email: {} }
          : { type: 'browser', browser: { url: context.browserUrl ?? undefined } }

      const result = await this.integrator.analyzeContent(content, ctx)
      result.linkResults?.forEach((r) => this.onLinkScanned?.(r.riskScore))
      if (this.lastCacheKey) {
        this.detectionCache.set(this.lastCacheKey, { isEmail: true })
      }
      if (!result.threatDetected) return

      const settings = this.settingsManager.getSettings()
      const firstBad = result.linkResults?.find((r) => r.riskScore >= 50)
      const riskScore = firstBad?.riskScore ?? result.riskScore ?? 60
      this.onLinkScanned?.(riskScore)
      this.alertManager.addAlert(
        {
          type: 'suspicious_link',
          severity: result.riskScore >= 80 ? 'high' : result.riskScore >= 60 ? 'medium' : 'low',
          source: 'Screen (email)',
          message: result.reasons[0] ?? 'Suspicious content detected',
          link: firstBad?.url,
          appId,
          riskScore,
        },
        settings.alertPreferences
      )
      if (this.lastCacheKey) {
        this.detectionCache.set(this.lastCacheKey, { isEmail: true })
      }
    } catch (err) {
      logger.warn('ScreenCaptureManager: analysis failed', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Structured debug log: Application | Tab detected | Email or Not | URL | First 100 chars
  // Written every 2s, skipped if exactly the same as previous line.
  // ---------------------------------------------------------------------------
  private startDebugLog(): void {
    if (this.debugLogTimer) return
    this.debugLogTimer = setInterval(() => this.writeDebugLog(), DEBUG_LOG_INTERVAL_MS)
  }

  private stopDebugLog(): void {
    if (this.debugLogTimer) {
      clearInterval(this.debugLogTimer)
      this.debugLogTimer = null
    }
  }

  private writeDebugLog(): void {
    try {
      const application = this.debugState.application || 'unknown'
      const tabDetected = this.debugState.tabDetected || application
      const emailOrNot = this.debugState.isEmail ? 'Email' : 'Not Email'
      const url = this.debugState.url || 'N/A'
      const content = (this.debugState.contentPreview || '').slice(0, 100) || 'N/A'
      const overlayColor = this.lastOverlayVisible
        ? (this.lastOverlayState === 'monitoring' ? 'green' : 'grey')
        : 'none'
      const boundsInfo = this.lastOverlayBounds
        ? `${this.lastOverlayBounds.x},${this.lastOverlayBounds.y},${this.lastOverlayBounds.width}x${this.lastOverlayBounds.height}`
        : 'none'

      const data =
        `Application: ${application} | ` +
        `Tab: ${tabDetected} | ` +
        `${emailOrNot} | ` +
        `URL: ${url} | ` +
        `Content: ${content} | ` +
        `Overlay: ${overlayColor} | ` +
        `Bounds: ${boundsInfo}`

      if (data === this.lastDebugLogLine) return
      this.lastDebugLogLine = data

      const logPath = getDebugLogPath()
      if (!logPath) return
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${data}\n`)
    } catch {
      // ignore log failures
    }
  }
}
