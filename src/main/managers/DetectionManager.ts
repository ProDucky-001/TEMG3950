import { ActiveWindowMonitor } from '../detection/ActiveWindowMonitor'
import { BrowserMonitor } from '../detection/BrowserMonitor'
import { EmailContentExtractor } from '../detection/EmailContentExtractor'
import { EmailDetector } from '../detection/EmailDetector'
import type { ActiveWindowInfo } from '../detection/ActiveWindowInfo'
import { PlatformSpecificManager } from '../integration/PlatformSpecificManager'
import { WindowTrackerService } from '../services/WindowTrackerService'

export type EmailAppStatus = 'idle' | 'detected' | 'analyzing' | 'threat-found'

export interface DetectionSettings {
  pollingIntervalMs?: number
}

export interface DetectionState {
  status: EmailAppStatus
  activeApp: string | null
  appType: 'webmail' | 'desktop' | null
  url?: string
  lastChecked: Date
  threatLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical'
  bounds?: { x: number; y: number; width: number; height: number }
  windowTitle?: string
}

/**
 * Central coordinator for email detection: active window, browser URL, and content extraction.
 * Starts/stops all monitors and notifies listeners of state changes.
 */
export class DetectionManager {
  private readonly activeWindowMonitor: ActiveWindowMonitor
  private readonly browserMonitor: BrowserMonitor
  private readonly windowTracker: WindowTrackerService
  private readonly contentExtractor: EmailContentExtractor
  private readonly emailDetector: EmailDetector
  private state: DetectionState = {
    status: 'idle',
    activeApp: null,
    appType: null,
    lastChecked: new Date(0),
  }
  private listeners = new Set<(state: DetectionState) => void>()
  private unsubscribeWindow: (() => void) | null = null
  private unsubscribeTracker: (() => void) | null = null
  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private lastCaptureUrl: string | null = null

  constructor() {
    const platform = new PlatformSpecificManager()
    this.activeWindowMonitor = new ActiveWindowMonitor()
    this.browserMonitor = new BrowserMonitor(this.activeWindowMonitor, platform)
    this.windowTracker = new WindowTrackerService(this.activeWindowMonitor, platform)
    this.contentExtractor = new EmailContentExtractor()
    this.emailDetector = new EmailDetector(this.activeWindowMonitor)
  }

  /**
   * Start all detection (active window polling and browser URL tracking).
   */
  start(): void {
    this.activeWindowMonitor.start()
    this.browserMonitor.start()
    this.windowTracker.start()
    this.unsubscribeWindow = this.emailDetector.onStateChange((result) => {
      this.updateStateFromResult(result)
    })
    this.unsubscribeTracker = this.windowTracker.onWindowChange((snapshot) => {
      const currentOwner = this.activeWindowMonitor.getCurrentWindow()?.owner?.name ?? ''
      if (snapshot && currentOwner && snapshot.appName === currentOwner) {
        const next: DetectionState = {
          ...this.state,
          url: snapshot.url ?? this.state.url ?? this.lastCaptureUrl ?? undefined,
          bounds: snapshot.bounds,
          windowTitle: snapshot.windowTitle || this.state.windowTitle,
          lastChecked: new Date(),
        }
        this.state = next
        this.notifyListeners()
      }
    })
    this.refreshTimer = setInterval(() => this.refreshState(), 150)
    setTimeout(() => this.refreshState(), 200)
  }

  /**
   * Stop all detection.
   */
  stop(): void {
    if (this.unsubscribeWindow) {
      this.unsubscribeWindow()
      this.unsubscribeWindow = null
    }
    if (this.unsubscribeTracker) {
      this.unsubscribeTracker()
      this.unsubscribeTracker = null
    }
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
    this.windowTracker.stop()
    this.activeWindowMonitor.stop()
    this.state = {
      status: 'idle',
      activeApp: null,
      appType: null,
      lastChecked: new Date(),
    }
    this.lastCaptureUrl = null
    this.notifyListeners()
  }

  /**
   * Get current detection state.
   */
  getState(): DetectionState {
    const url = this.state.url ?? this.lastCaptureUrl ?? undefined
    return { ...this.state, url }
  }

  /**
   * Set URL from capture/OCR when platform URL is unavailable (e.g. Firefox with AppleScript failing).
   * Used so dashboard and debug log show OCR-derived URL instead of N/A.
   */
  setLastCaptureUrl(url: string | null): void {
    if (this.lastCaptureUrl === url) return
    this.lastCaptureUrl = url ?? null
    this.notifyListeners()
  }

  /**
   * Subscribe to state changes.
   */
  onStateChange(callback: (state: DetectionState) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Whether an email app is currently active (frontmost window).
   */
  isEmailAppActive(): boolean {
    return this.emailDetector.isEmailAppActive()
  }

  /**
   * Get current active window info (for overlay bounds, etc.).
   */
  getActiveWindowInfo(): ActiveWindowInfo | null {
    return this.activeWindowMonitor.getCurrentWindow()
  }

  /**
   * Whether the active-win binary has ever returned null or thrown on macOS (for showing accessibility dialog).
   */
  hasActiveWindowBinaryEverFailed(): boolean {
    return this.activeWindowMonitor.hasEverSeenBinaryFailure()
  }

  /**
   * Set a one-shot callback when the active-win binary first fails on macOS (for showing accessibility dialog).
   */
  setOnAccessibilityBinaryFailed(callback: () => void): void {
    this.activeWindowMonitor.setOnBinaryFailure(callback)
  }

  /**
   * Get current browser URL when the active window is a browser (e.g. webmail tab).
   */
  getCurrentBrowserUrl(): string | null {
    return this.browserMonitor.getCurrentBrowserUrl()
  }

  /**
   * Extract content from current email context, optionally with OCR/body text.
   */
  extractEmailContent(ocrOrBodyText?: string): ReturnType<EmailContentExtractor['extract']> {
    const info = this.activeWindowMonitor.getCurrentWindow()
    return this.contentExtractor.extract(info, ocrOrBodyText)
  }

  /** Expose the active window monitor for polling interval etc. */
  getActiveWindowMonitor(): ActiveWindowMonitor {
    return this.activeWindowMonitor
  }

  /** Expose the window tracker (enriched snapshot with browser URL). */
  getWindowTracker(): WindowTrackerService {
    return this.windowTracker
  }

  getDetectionSettings(): DetectionSettings {
    return { pollingIntervalMs: 100 }
  }

  updateDetectionSettings(settings: Partial<DetectionSettings>): void {
    if (typeof settings.pollingIntervalMs === 'number' && settings.pollingIntervalMs >= 50) {
      this.activeWindowMonitor.setPollingInterval(settings.pollingIntervalMs)
    }
  }

  private refreshState(): void {
    const result = this.emailDetector.getCurrentState()
    this.updateStateFromResult(result)
  }

  private updateStateFromResult(result: {
    isEmailApp: boolean
    appType: 'webmail' | 'desktop' | null
    appName: string | null
    url: string | null | undefined
    windowInfo: ActiveWindowInfo | null
  }): void {
    const status: EmailAppStatus = result.isEmailApp ? 'detected' : 'idle'
    const appName = result.appName || result.windowInfo?.owner?.name || null
    const next: DetectionState = {
      status,
      activeApp: appName,
      appType: result.appType,
      url: result.url ?? undefined,
      lastChecked: new Date(),
      bounds: result.windowInfo?.bounds,
      windowTitle: result.windowInfo?.title,
    }
    const prev = this.state
    const changed =
      prev.status !== next.status ||
      prev.activeApp !== next.activeApp ||
      prev.windowTitle !== next.windowTitle ||
      prev.url !== next.url ||
      prev.bounds?.x !== next.bounds?.x ||
      prev.bounds?.y !== next.bounds?.y ||
      prev.bounds?.width !== next.bounds?.width ||
      prev.bounds?.height !== next.bounds?.height
    if (changed) {
      this.state = next
      this.notifyListeners()
    }
  }

  private notifyListeners(): void {
    const state = this.getState()
    for (const cb of this.listeners) cb(state)
  }
}
