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
import { preprocessForOCR, cleanOCRText } from '../detection/imagePreprocess'
import { isEmailUrl as isEmailUrlFromPatterns } from '../detection/EmailPatterns'
import { getContentSourceType, getAppIdFromProcessName } from '../integration/appMapping'
import type { ContentContext } from '../../shared/integration-types'
import { logger } from '../services/logger'
import { isRealUrl } from '../utils/urlUtils'
import { writePageContentLog } from '../services/pageContentDebugLog'

const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_VITE_DEV_SERVER_URL
const devServerUrl = process.env.ELECTRON_RENDERER_URL || process.env.ELECTRON_VITE_DEV_SERVER_URL
const DEFAULT_POLL_INTERVAL_MS = 3000
/** TTL for per-app "last email URL" cache when tab has no URL (ms). */
const LAST_EMAIL_URL_TTL_MS = 8_000
/** TTL for extension-reported tab state (URL + isEmail) used for overlay (ms). */
const EXTENSION_TAB_STATE_TTL_MS = 3_000
/** Timeout when fetching browser URL via native bridge (ms). */
const BROWSER_URL_FETCH_TIMEOUT_MS = 2_500
/** Debounce: only send overlay state after it persists this long (ms). */
const OVERLAY_STATE_DEBOUNCE_MS = 200

function emailCacheKey(appName: string): string {
  return (appName ?? '').trim().toLowerCase() || 'unknown'
}
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
  private pollTimer: ReturnType<typeof setInterval> | null = null
  /** Prevents overlapping overlay updates (getContextAndBounds can be slow). */
  private overlayUpdateInProgress = false
  /** Debounce: show overlay after 200ms of email active; hide after 400ms of inactive. */
  private overlayShowTimeout: ReturnType<typeof setTimeout> | null = null
  private overlayHideTimeout: ReturnType<typeof setTimeout> | null = null
  /** Hysteresis: stable email state to prevent green/grey flicker. */
  private currentEmailState = false
  private lastEmailStateChangeTime = 0
  private negativeDetectionCount = 0
  private pendingOverlayShow: { state: 'monitoring' | 'processing'; bounds: { x: number; y: number; width: number; height: number } | undefined; windowName: string } | null = null
  private permissionStatus: ScreenCapturePermissionStatus = 'unknown'
  private captureInProgress = false
  private lastOverlayVisible = false
  private lastOverlayState: 'monitoring' | 'processing' = 'monitoring'
  /** Last state actually sent to overlay (for debouncer). 'NONE' when overlay hidden. */
  private lastRenderedOverlayState: 'monitoring' | 'processing' | 'NONE' = 'NONE'
  /** Debounce timer: only send state to overlay after it persists OVERLAY_STATE_DEBOUNCE_MS. */
  private overlayStateDebounceTimer: ReturnType<typeof setTimeout> | null = null
  /** When we detected "inbox" or "mail.google"/"gmail.com" in OCR, treat as email until this time. */
  private lastInboxHintUntil = 0
  /** When we detected Outlook in OCR, treat as email until this time. */
  private lastOutlookHintUntil = 0
  private static readonly EMAIL_HINT_MS = 5000
  /** Last bounds and app when we were on email (for sticky green overlay). */
  private lastEmailOverlayBounds: { x: number; y: number; width: number; height: number } | null = null
  private lastEmailOverlayWindowName = ''
  private lastTimeWeWentGreen = 0
  private lastOverlayBounds: { x: number; y: number; width: number; height: number } | null = null
  private lastFrontmostAppName = ''
  private lastValidBounds: { x: number; y: number; width: number; height: number } | null = null
  private lastValidBoundsApp = ''
  private cachedBrowserUrl: string | null = null
  private displayChangeUnsubscribe: (() => void) | null = null
  private cachedBrowserUrlTime = 0
  private static readonly URL_CACHE_TTL_MS = 800
  /** Per-app cache: when we have no URL after a tab switch, treat as email if we recently saw an email URL for this app. */
  private lastEmailUrlByApp = new Map<string, { url: string; timestamp: number }>()
  private nextPollTimeout: ReturnType<typeof setTimeout> | null = null
  /** Set when we request capture so handleCaptureResult can update cache. */
  private lastCacheKey: string | null = null
  private _overlayLogOnce = false
  private unsubscribeDetectionState: (() => void) | null = null
  /** When extension reports current tab URL + isEmail, use this for overlay when app URL detection is unreliable. */
  private lastExtensionTabState: { url: string; isEmail: boolean; timestamp: number } | null = null

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

  /**
   * Called when the extension reports the current tab URL and whether it is an email tab.
   * Used as source of truth for overlay (green/grey) when app URL detection is slow or flickers.
   */
  setExtensionTabState(url: string | null, isEmail: boolean): void {
    const now = Date.now()
    this.lastExtensionTabState =
      url != null && url.trim() !== ''
        ? { url: url.trim(), isEmail: !!isEmail, timestamp: now }
        : { url: '', isEmail: false, timestamp: now }
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

  /**
   * Request one immediate capture (e.g. from renderer via capture:start IPC).
   * No-op if capture already in progress or permission denied. Returns true if request was sent.
   */
  requestCaptureOnce(): boolean {
    if (this.captureInProgress || this.permissionStatus === 'denied') return false
    this.ensureCaptureWindow()
    const win = this.captureWindow
    if (!win || win.isDestroyed()) return false
    try {
      this.captureInProgress = true
      this.updateOverlayVisibility()
      win.webContents.send('capture-request')
      return true
    } catch {
      this.captureInProgress = false
      return false
    }
  }

  start(): void {
    if (this.pollTimer) return
    this.ensureCaptureWindow()
    // Overlay is updated only after full URL detection (in poll() and on detection state change), not on a timer
    if (this.enabled) {
      const s = this.settingsManager.getSettings()
      if (s.showRecordingIndicator !== false) this.ensureOverlayWindow()
    }
    // One initial overlay update so state is correct before first poll runs
    this.updateOverlayVisibility()
    this.subscribeDisplayChanges()
    if (this.detectionManager) {
      this.unsubscribeDetectionState = this.detectionManager.onStateChange(() => {
        this.updateOverlayVisibility()
      })
    }
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
    if (this.unsubscribeDetectionState) {
      this.unsubscribeDetectionState()
      this.unsubscribeDetectionState = null
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
    this.unsubscribeDisplayChanges()
    ipcMain.removeListener('capture-result', this.handleCaptureResult)
    ipcMain.removeHandler('capture-get-sources')
    this.setOverlayVisible(false)
    this.destroyOverlayWindow()
    this.destroyCaptureWindow()
    this.detectionCache.clear()
    this.priorityManager.reset()
    this.ocr.terminate()
    logger.info('ScreenCaptureManager: stopped')
  }

  private subscribeDisplayChanges(): void {
    this.unsubscribeDisplayChanges()
    const onDisplayChange = (): void => {
      this.reapplyOverlayBounds()
      this.updateOverlayVisibility()
    }
    screen.on('display-metrics-changed', onDisplayChange)
    screen.on('display-added', onDisplayChange)
    screen.on('display-removed', onDisplayChange)
    this.displayChangeUnsubscribe = () => {
      screen.removeListener('display-metrics-changed', onDisplayChange)
      screen.removeListener('display-added', onDisplayChange)
      screen.removeListener('display-removed', onDisplayChange)
      this.displayChangeUnsubscribe = null
    }
  }

  private unsubscribeDisplayChanges(): void {
    if (this.displayChangeUnsubscribe) {
      this.displayChangeUnsubscribe()
    }
  }

  /** Re-calculate overlay after display config change: re-fetch window bounds and update. */
  private reapplyOverlayBounds(): void {
    this.updateOverlayVisibility()
  }

  private getPollIntervalMs(): number {
    const ms = this.settingsManager.getSettings().screenCapturePollIntervalMs
    const fromSettings = typeof ms === 'number' && ms >= 500 ? ms : DEFAULT_POLL_INTERVAL_MS
    return Math.max(DEFAULT_POLL_INTERVAL_MS, fromSettings)
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
        // Prefer DetectionManager state, then WindowTracker enriched snapshot (avoids extra AppleScript when tracker already has URL)
        const trackerSnapshot = this.detectionManager?.getWindowTracker?.()?.getCurrentSnapshot?.() ?? null
        let browserUrl = state.url ?? trackerSnapshot?.url ?? info.url ?? null
        if (!browserUrl) {
          const isBrowser = ['chrome', 'safari'].includes(appId ?? '')
            || /chrome|safari|brave|edge|browser/i.test(windowName)
          if (isBrowser) {
            const now = Date.now()
            if (this.cachedBrowserUrl && now - this.cachedBrowserUrlTime < ScreenCaptureManager.URL_CACHE_TTL_MS) {
              browserUrl = this.cachedBrowserUrl
            } else {
              try {
                browserUrl = await this.getCurrentBrowserUrlWithTimeout()
                this.cachedBrowserUrl = browserUrl
                this.cachedBrowserUrlTime = now
              } catch { /* AppleScript URL fallback failed */ }
            }
          } else {
            this.cachedBrowserUrl = null
          }
        } else {
          const isBrowser = ['chrome', 'safari'].includes(appId ?? '')
            || /chrome|safari|brave|edge|browser/i.test(windowName)
          if (isBrowser && !this.isEmailUrl(browserUrl)) {
            const recent = this.lastEmailUrlByApp.get(emailCacheKey(windowName))
            if (recent != null && (Date.now() - recent.timestamp) < LAST_EMAIL_URL_TTL_MS) {
              this.cachedBrowserUrl = null
              try {
                const fresh = await this.getCurrentBrowserUrlWithTimeout()
                if (fresh && this.isEmailUrl(fresh)) {
                  browserUrl = fresh
                  this.cachedBrowserUrl = fresh
                  this.cachedBrowserUrlTime = Date.now()
                } else {
                  browserUrl = recent.url
                }
              } catch {
                browserUrl = recent.url
              }
            }
          }
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
          rawResult: bounds ? { bounds, primaryDisplay: primary } : null,
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
    return isEmailUrlFromPatterns(url)
  }

  /** Call platform.getCurrentBrowserUrl() with a timeout so detection never blocks >1.5s. */
  private getCurrentBrowserUrlWithTimeout(): Promise<string | null> {
    return Promise.race([
      this.platform.getCurrentBrowserUrl(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('browser URL timeout')), BROWSER_URL_FETCH_TIMEOUT_MS)
      ),
    ])
  }

  private emailUrlToAppId(url: string | null | undefined): import('../../shared/integration-types').SupportedAppId | null {
    if (!url) return null
    const lower = url.trim().toLowerCase()
    if (/mail\.google\.com|gmail\.com/.test(lower)) return 'gmail'
    if (/outlook\.(live|office|office365|cloud\.microsoft)(\.com)?|outlook\.com/.test(lower)) return 'outlook'
    if (/mail\.yahoo\.com|yahoo\.com/.test(lower)) return 'generic'
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
    if (this.overlayUpdateInProgress) return
    this.overlayUpdateInProgress = true
    try {
      const settings = this.settingsManager.getSettings()
      const enabled = this.enabled
      if (!enabled) {
        this.clearOverlayShowTimeout()
        this.setOverlayVisible(false)
        this.currentEmailState = false
        this.negativeDetectionCount = 0
        this.lastEmailUrlByApp.clear()
        return
      }
      if (settings.showRecordingIndicator === false) {
        this.clearOverlayShowTimeout()
        this.setOverlayVisible(false)
        this.currentEmailState = false
        this.negativeDetectionCount = 0
        this.lastEmailUrlByApp.clear()
        return
      }

      // Get window bounds: prefer getContextAndBounds() (DetectionManager or AppleScript), then direct AppleScript.
      const { context, rawResult } = await this.getContextAndBounds()
      let windowBounds = rawResult?.bounds ?? (await this.getWindowBoundsFromAppleScript())
      const minOverlaySize = 50
      if (!windowBounds || windowBounds.width < minOverlaySize || windowBounds.height < minOverlaySize) {
        this.clearOverlayShowTimeout()
        this.pendingOverlayShow = null
        this.setOverlayVisible(false)
        return
      }
      const now = Date.now()
      const urlIsEmail = this.isEmailUrl(context.browserUrl)
      const currentApp = context.windowName || ''
      const isBrowser = (context.appId === 'chrome' || context.appId === 'safari') ||
        /chrome|safari|brave|edge|browser/i.test(currentApp)

      if (urlIsEmail && context.browserUrl) {
        this.lastEmailUrlByApp.set(emailCacheKey(currentApp), { url: context.browserUrl, timestamp: now })
      }

      const cachedEmailForApp = isBrowser && !context.browserUrl?.trim()
        ? this.lastEmailUrlByApp.get(emailCacheKey(currentApp))
        : null

      if (cachedEmailForApp != null && (now - cachedEmailForApp.timestamp) >= LAST_EMAIL_URL_TTL_MS) {
        this.lastEmailUrlByApp.delete(emailCacheKey(currentApp))
      }

      // Prefer extension-reported tab state when recent (reduces flicker; extension sees tab switches immediately)
      const extensionStateRecent =
        this.lastExtensionTabState != null &&
        now - this.lastExtensionTabState.timestamp < EXTENSION_TAB_STATE_TTL_MS
      const useExtensionForEmail =
        isBrowser && extensionStateRecent && this.lastExtensionTabState != null

      // Full non-email URL: we have a real URL and it is not an email domain (so we can leave green)
      const hasFullNonEmailUrl =
        isBrowser &&
        context.browserUrl != null &&
        context.browserUrl.trim() !== '' &&
        isRealUrl(context.browserUrl) &&
        !this.isEmailUrl(context.browserUrl)

      // Green when email URL or extension says email; persist green until we see a full non-email URL
      let isEmailTab: boolean
      if (isBrowser) {
        if (useExtensionForEmail) {
          isEmailTab = this.lastExtensionTabState!.isEmail
        } else if (urlIsEmail) {
          isEmailTab = true
        } else if (hasFullNonEmailUrl) {
          isEmailTab = false
        } else {
          // No definitive URL or empty/stale: persist previous state (stay green until we get a non-email URL)
          isEmailTab = this.currentEmailState
        }
      } else {
        isEmailTab = context.isEmailClientActive
      }

      if (isEmailTab) {
        this.currentEmailState = true
        this.negativeDetectionCount = 0
        this.lastEmailStateChangeTime = now
        this.lastTimeWeWentGreen = now
        this.lastEmailOverlayBounds = { ...windowBounds }
        this.lastEmailOverlayWindowName = context.windowName || ''
      } else {
        // Only false when we have a full non-email URL or extension said not email; go grey immediately
        this.currentEmailState = false
        this.negativeDetectionCount = 0
        this.lastEmailStateChangeTime = now
      }
      const stableEmailState = this.currentEmailState
      // No sticky green: overlay bounds always follow current window
      const boundsForOverlay = windowBounds
      const windowNameForOverlay = context.windowName

      const OVERLAY_BOUNDS_SCALE = 1.8
      const OVERLAY_H_SCALE = 1.35
      const OVERLAY_OFFSET_X = 0
      const OVERLAY_OFFSET_Y = 25
      const scaledBoundsForOverlay: { x: number; y: number; width: number; height: number } = {
        x: boundsForOverlay.x + OVERLAY_OFFSET_X,
        y: boundsForOverlay.y + OVERLAY_OFFSET_Y,
        width: Math.round(boundsForOverlay.width * OVERLAY_BOUNDS_SCALE),
        height: Math.round(boundsForOverlay.height * OVERLAY_H_SCALE),
      }

      const state: 'monitoring' | 'processing' =
        stableEmailState ? 'monitoring' : 'processing'

      this.clearOverlayHideTimeout()
      this.setOverlayVisible(true, state, scaledBoundsForOverlay, windowNameForOverlay)
    } catch (err) {
      logger.warn('ScreenCaptureManager: updateOverlayVisibility failed', err)
      this.setOverlayVisible(false)
    } finally {
      this.overlayUpdateInProgress = false
    }
  }

  /**
   * Get frontmost window bounds from AppleScript (screen coordinates). Used only for overlay positioning.
   * No fallback to primaryDisplay.bounds — if this returns null, overlay is hidden.
   */
  private async getWindowBoundsFromAppleScript(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      const raw = await this.overlayManager.getRawWindowBounds()
      if (!raw || !raw.bounds || raw.bounds.width < 50 || raw.bounds.height < 50) {
        return null
      }
      return raw.bounds
    } catch {
      return null
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
      win.webContents.send('render-state', state)
    }
  }

  /**
   * Debounced overlay state update: only send state to overlay if it persists for OVERLAY_STATE_DEBOUNCE_MS.
   * Prevents flickering between Grey (processing) and Green (monitoring).
   */
  private updateOverlayState(newState: 'monitoring' | 'processing'): void {
    if (newState === this.lastRenderedOverlayState) return
    if (this.overlayStateDebounceTimer) {
      clearTimeout(this.overlayStateDebounceTimer)
      this.overlayStateDebounceTimer = null
    }
    if (this.lastRenderedOverlayState === 'NONE') {
      this.lastRenderedOverlayState = newState
      this.sendOverlayState(newState)
      return
    }
    this.overlayStateDebounceTimer = setTimeout(() => {
      this.overlayStateDebounceTimer = null
      this.lastRenderedOverlayState = newState
      this.sendOverlayState(newState)
      logger.debug(`[Overlay] Transitioned to: ${newState}`)
    }, OVERLAY_STATE_DEBOUNCE_MS)
  }

  private clearOverlayStateDebounce(): void {
    if (this.overlayStateDebounceTimer) {
      clearTimeout(this.overlayStateDebounceTimer)
      this.overlayStateDebounceTimer = null
    }
    this.lastRenderedOverlayState = 'NONE'
  }

  private sendOverlayBounds(bounds: { x: number; y: number; width: number; height: number } | null): void {
    this.lastOverlayBounds = bounds
    const win = this.overlayWindow
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      const payload = this.normalizeBoundsForOverlay(bounds)
      win.webContents.send('overlay-bounds', payload)
    }
  }

  /** Attach pixelRatio so overlay can scale logical (DIP) bounds to viewport if needed (Windows only; macOS is 1:1). */
  private normalizeBoundsForOverlay(bounds: { x: number; y: number; width: number; height: number } | null): { x: number; y: number; width: number; height: number; pixelRatio: number } | null {
    if (!bounds) return null
    return { ...bounds, pixelRatio: 1 }
  }

  private sendOverlayWindowData(
    bounds: { x: number; y: number; width: number; height: number } | null,
    state: 'monitoring' | 'processing',
    appName: string,
    windowTitle: string
  ): void {
    const win = this.overlayWindow
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('overlay-window-data', {
        bounds: this.normalizeBoundsForOverlay(bounds),
        state,
        appName,
        windowTitle,
      })
    }
  }

  /**
   * Send a line to the overlay's debug log (last 3 actions). Used when DATA_RECORDED is received from the extension.
   */
  sendDebugLogEntry(line: string): void {
    const win = this.overlayWindow
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('debug-log-entry', line)
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
      this.clearOverlayStateDebounce()
      if (this.lastOverlayVisible) {
        this.lastOverlayVisible = false
        this.sendOverlayBounds(null)
        this.sendOverlayWindowData(null, newState, this.lastFrontmostAppName, windowTitle)
        const win = this.overlayWindow
        if (win && !win.isDestroyed()) win.hide()
      }
      return
    }
    if (!frontmostBounds || frontmostBounds.width < 50 || frontmostBounds.height < 50) {
      const win = this.overlayWindow
      if (win && !win.isDestroyed()) win.hide()
      return
    }
    this.ensureOverlayWindow()
    const win = this.overlayWindow
    if (win && !win.isDestroyed()) {
      win.setBounds(frontmostBounds)
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
      this.updateOverlayState(newState)
      const boundsForContent = { x: 0, y: 0, width: frontmostBounds.width, height: frontmostBounds.height }
      this.sendOverlayBounds(boundsForContent)
      this.sendOverlayWindowData(boundsForContent, newState, this.lastFrontmostAppName, windowTitle)
    } else if (!this.lastOverlayVisible) {
      this.lastOverlayVisible = true
    }
    this.lastOverlayState = newState
  }

  private ensureOverlayWindow(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) return
    const preloadPath = this.resolveOverlayPreloadPath()
    const usePreload = !!preloadPath
    this.overlayWindow = new BrowserWindow({
      width: 400,
      height: 300,
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
    this.overlayWindow.setIgnoreMouseEvents(true)
    if (process.platform === 'darwin') {
      this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
    this.overlayWindow.setMenuBarVisibility(false)
    this.overlayWindow.webContents.once('did-finish-load', () => {
      const stateToSend = this.lastRenderedOverlayState !== 'NONE' ? this.lastRenderedOverlayState : this.lastOverlayState
      this.sendOverlayState(stateToSend)
      if (this.lastOverlayBounds) this.sendOverlayBounds(this.lastOverlayBounds)
      const windowTitle = this.detectionManager?.getActiveWindowInfo()?.title ?? ''
      this.sendOverlayWindowData(this.lastOverlayBounds, this.lastOverlayState, this.lastFrontmostAppName, windowTitle)
      // Re-send after a short delay so the overlay page's IPC listeners are definitely registered (avoids race)
      setTimeout(() => {
        this.sendOverlayState(stateToSend)
        if (this.lastOverlayBounds) this.sendOverlayBounds(this.lastOverlayBounds)
        this.sendOverlayWindowData(this.lastOverlayBounds, this.lastOverlayState, this.lastFrontmostAppName, windowTitle)
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
      try {
        this.overlayWindow.hide()
      } catch {
        // ignore
      }
      this.overlayWindow.destroy()
    }
    this.overlayWindow = null
    this.lastOverlayVisible = false
    this.lastOverlayState = 'monitoring'
    this.clearOverlayStateDebounce()
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
      if (!this.priorityManager.shouldScan(windowInfo)) {
        this.updateOverlayVisibility()
        return
      }
      if (cached?.isEmail === false) {
        this.updateOverlayVisibility()
        return
      }
    }
    this.lastCacheKey = cacheKey
    this.ensureCaptureWindow()
    const win = this.captureWindow
    if (!win || win.isDestroyed()) {
      this.updateOverlayVisibility()
      return
    }
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
      const preprocessed = await preprocessForOCR(Buffer.from(buffer))
      const rawText = await this.ocr.recognize(preprocessed)
      const text = cleanOCRText(rawText || '')
      if (!text || text.length < 20) return

      this.privacy.requireNoStorage(text)

      const ocrStart = text.slice(0, 800).toLowerCase()
      const ocrExtended = text.slice(0, 1200).toLowerCase()
      const isBrowser = context.appId === 'chrome' || context.appId === 'safari'

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

      if (isBrowser && link) this.detectionManager?.setLastCaptureUrl(link)
      else if (!isBrowser) this.detectionManager?.setLastCaptureUrl(null)

      if (!effectiveIsEmailClient || !effectiveAppId || !this.privacy.isMonitoringAllowed(effectiveAppId)) {
        if (this.lastCacheKey) {
          this.detectionCache.set(this.lastCacheKey, { isEmail: effectiveIsEmailClient })
        }
        return
      }
      const appId = effectiveAppId
      // Page content debug only on URL-confirmed email tabs; extension is preferred, OCR as fallback
      const isEmailTabByUrl = context.isEmailClientActive || this.isEmailUrl(context.browserUrl)
      if (isEmailTabByUrl) {
        writePageContentLog({
          source: 'ocr',
          url: context.browserUrl ?? undefined,
          timestamp: Date.now(),
          content: text,
        })
      }
      const sourceType = getContentSourceType(appId)
      // OCR image is composite: URL bar first, then email body (40–90% width, 30–80% height). Prioritise URLs then scam patterns.
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
          triggers: result.reasons?.length ? result.reasons : undefined,
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
}
