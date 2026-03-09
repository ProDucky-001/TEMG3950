import type { ActiveWindowMonitor } from '../detection/ActiveWindowMonitor'
import type { ActiveWindowInfo } from '../detection/ActiveWindowInfo'
import type { PlatformSpecificManager } from '../integration/PlatformSpecificManager'
import { isEmailApplication } from '../detection/EmailPatterns'
import type { WindowTrackerSnapshot } from '../../shared/detection-types'

const POLLING_INTERVAL_MS = 100
const DEBOUNCE_MS = 80

/** Browser process name patterns (lowercase substring match). */
const BROWSER_PATTERNS = [
  'chrome',
  'safari',
  'firefox',
  'edge',
  'brave',
  'chromium',
  'microsoft edge',
  'google chrome',
]

function isBrowserApp(info: ActiveWindowInfo): boolean {
  const name = (info.owner?.name ?? '').toLowerCase()
  return BROWSER_PATTERNS.some((p) => name.includes(p))
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const t = url.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (/^[a-z0-9][\w.-]*\.[a-z]{2,}/i.test(t)) return 'https://' + t
  return null
}

/**
 * Robust active window tracker using active-win with platform URL enrichment.
 * - Uses ActiveWindowMonitor (active-win binary on macOS, fallback to AppleScript).
 * - When the front app is a browser but active-win doesn't provide a URL (e.g. Firefox),
 *   calls PlatformSpecificManager.getCurrentBrowserUrl() to get the address bar URL.
 * - Returns a unified snapshot: appName, windowTitle, url, bounds, isEmail.
 */
export class WindowTrackerService {
  private lastSnapshot: WindowTrackerSnapshot | null = null
  private listeners = new Set<(snapshot: WindowTrackerSnapshot | null) => void>()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingInfo: ActiveWindowInfo | null = null

  constructor(
    private readonly activeWindowMonitor: ActiveWindowMonitor,
    private readonly platform: PlatformSpecificManager
  ) {}

  /**
   * Start tracking. Starts the underlying ActiveWindowMonitor and subscribes to changes.
   */
  start(): void {
    this.activeWindowMonitor.start()
    this.activeWindowMonitor.onWindowChange((info) => {
      this.pendingInfo = info
      this.scheduleDebouncedEnrichAndNotify()
    })
    this.scheduleDebouncedEnrichAndNotify()
  }

  /**
   * Stop tracking. Unsubscribes; does not stop the ActiveWindowMonitor (caller owns it).
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingInfo = null
    this.lastSnapshot = null
  }

  /**
   * Get the current window snapshot (cached). Enriches URL for browsers if missing.
   */
  getCurrentSnapshot(): WindowTrackerSnapshot | null {
    return this.lastSnapshot
  }

  /**
   * Get current snapshot synchronously from last known window; may not have enriched URL yet.
   */
  getCurrentSnapshotSync(): WindowTrackerSnapshot | null {
    const info = this.activeWindowMonitor.getCurrentWindow()
    if (!info) return null
    return this.infoToSnapshot(info, null)
  }

  onWindowChange(callback: (snapshot: WindowTrackerSnapshot | null) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  private scheduleDebouncedEnrichAndNotify(): void {
    if (this.debounceTimer) return
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      const info = this.pendingInfo ?? this.activeWindowMonitor.getCurrentWindow()
      this.pendingInfo = null
      this.enrichAndNotify(info).catch(() => {})
    }, DEBOUNCE_MS)
  }

  private async enrichAndNotify(info: ActiveWindowInfo | null): Promise<void> {
    if (!info) {
      if (this.lastSnapshot !== null) {
        this.lastSnapshot = null
        for (const cb of this.listeners) cb(null)
      }
      return
    }

    let url: string | null = normalizeUrl(info.url)
    if (isBrowserApp(info) && !url) {
      try {
        const platformUrl = await this.platform.getCurrentBrowserUrl()
        url = normalizeUrl(platformUrl)
      } catch {
        // keep url null
      }
    }

    const snapshot = this.infoToSnapshot(info, url)
    const changed = this.snapshotChanged(this.lastSnapshot, snapshot)
    if (changed) {
      this.lastSnapshot = snapshot
      for (const cb of this.listeners) cb(snapshot)
    }
  }

  private infoToSnapshot(info: ActiveWindowInfo, enrichedUrl: string | null): WindowTrackerSnapshot {
    const url = enrichedUrl ?? normalizeUrl(info.url)
    const check = isEmailApplication(info)
    const isEmail = check.isEmail
    return {
      appName: info.owner?.name ?? '',
      windowTitle: info.title ?? '',
      url,
      bounds: info.bounds
        ? { ...info.bounds }
        : { x: 0, y: 0, width: 800, height: 600 },
      isEmail,
    }
  }

  private snapshotChanged(
    a: WindowTrackerSnapshot | null,
    b: WindowTrackerSnapshot | null
  ): boolean {
    if (a === b) return false
    if (!a || !b) return true
    return (
      a.appName !== b.appName ||
      a.windowTitle !== b.windowTitle ||
      (a.url ?? '') !== (b.url ?? '') ||
      a.isEmail !== b.isEmail ||
      a.bounds.x !== b.bounds.x ||
      a.bounds.y !== b.bounds.y ||
      a.bounds.width !== b.bounds.width ||
      a.bounds.height !== b.bounds.height
    )
  }
}
