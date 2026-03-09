import type { ActiveWindowMonitor } from './ActiveWindowMonitor'
import { EMAIL_APPLICATIONS } from './EmailPatterns'
import { extractEmailContext, type EmailUrlContext } from './EmailUrlContext'
import type { PlatformSpecificManager } from '../integration/PlatformSpecificManager'

const DEFAULT_POLLING_INTERVAL_MS = 2000

export interface IsWebmailResult {
  isWebmail: boolean
  service: string | null
}

/**
 * Monitors browser windows and extracts URLs to detect webmail access.
 * Uses platform-specific methods (macOS AppleScript, Windows PowerShell) first, then falls back to active-win.
 */
export class BrowserMonitor {
  private readonly supportedBrowsers = ['chrome', 'safari', 'firefox', 'msedge', 'brave', 'google chrome', 'microsoft edge']
  private pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS
  private isRunning = false
  private lastUrl: string | null = null
  private listeners = new Set<(url: string | null) => void>()
  private pollTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly activeWindowMonitor: ActiveWindowMonitor,
    private readonly platform?: PlatformSpecificManager
  ) {}

  /**
   * Get the active browser tab URL. Tries platform-specific methods first (AppleScript/PowerShell), then active-win.
   */
  async getBrowserUrl(): Promise<string | null> {
    if (this.platform) {
      try {
        const url = await this.platform.getCurrentBrowserUrl()
        if (url && /^https?:\/\//i.test(url)) return url
      } catch {
        // fall through to active-win
      }
    }
    const info = this.activeWindowMonitor.getCurrentWindow()
    return info ? this.getUrlFromWindow(info) : null
  }

  /**
   * Synchronous get: returns last known URL from cache (e.g. from last poll or window change).
   */
  getCurrentBrowserUrl(): string | null {
    if (this.lastUrl) return this.lastUrl
    const info = this.activeWindowMonitor.getCurrentWindow()
    this.lastUrl = info ? this.getUrlFromWindow(info) : null
    return this.lastUrl
  }

  /**
   * Check if a URL is a known webmail service. Returns service name when matched.
   */
  isWebmailUrl(url: string): IsWebmailResult {
    if (!url || typeof url !== 'string') return { isWebmail: false, service: null }
    const u = url.trim()
    const withScheme = /^https?:\/\//i.test(u) ? u : 'https://' + u
    const lower = withScheme.toLowerCase()
    for (const app of EMAIL_APPLICATIONS.webmail) {
      const matches = app.domains.some((d) => lower.includes(d))
      if (matches) return { isWebmail: true, service: app.name }
    }
    return { isWebmail: false, service: null }
  }

  /**
   * Parse URL to determine what the user is doing (inbox, compose, reading email, settings, etc.).
   */
  extractEmailContext(url: string): EmailUrlContext {
    return extractEmailContext(url)
  }

  /**
   * Start monitoring: poll for browser URL at pollingInterval and notify on change.
   */
  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.tick()
    this.pollTimer = setInterval(() => this.tick(), this.pollingIntervalMs)
    this.activeWindowMonitor.onWindowChange((info) => {
      const url = info ? this.getUrlFromWindow(info) : null
      if (url !== this.lastUrl) {
        this.lastUrl = url
        for (const cb of this.listeners) cb(url)
      }
    })
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    this.isRunning = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.lastUrl = null
  }

  /**
   * Set polling interval in milliseconds (min 500).
   */
  setPollingInterval(ms: number): void {
    this.pollingIntervalMs = Math.max(500, ms)
    if (this.isRunning && this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = setInterval(() => this.tick(), this.pollingIntervalMs)
    }
  }

  /**
   * Register for URL change events.
   */
  onUrlChange(callback: (url: string | null) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Check if the current active window is a supported browser (by process name).
   */
  isBrowserActive(): boolean {
    const info = this.activeWindowMonitor.getCurrentWindow()
    if (!info) return false
    const nameLower = (info.owner?.name ?? '').toLowerCase()
    return this.supportedBrowsers.some(
      (b) => nameLower === b || nameLower.includes(b)
    ) || EMAIL_APPLICATIONS.browsers.some((b) =>
      b.processNames.some((p) => nameLower === p.toLowerCase() || nameLower.includes(p.toLowerCase()))
    )
  }

  private async tick(): Promise<void> {
    if (!this.isBrowserActive()) return
    const url = await this.getBrowserUrl()
    if (url !== this.lastUrl) {
      this.lastUrl = url
      for (const cb of this.listeners) cb(url)
    }
  }

  private getUrlFromWindow(info: { owner?: { name?: string }; url?: string }): string | null {
    const url = info?.url?.trim()
    if (!url) return null
    if (/^https?:\/\//i.test(url)) return url
    if (/^[a-z0-9][\w.-]+\.[a-z]{2,}/i.test(url)) return 'https://' + url
    return null
  }
}
