import type { ActiveWindowMonitor } from '../detection/ActiveWindowMonitor'
import type { ActiveWindowInfo } from '../detection/ActiveWindowInfo'
import type { PlatformSpecificManager } from '../integration/PlatformSpecificManager'
import { isEmailApplication } from '../detection/EmailPatterns'
import type { WindowTrackerSnapshot } from '../../shared/detection-types'

const POLLING_INTERVAL_MS = 2000
const DEBOUNCE_MS = 50

/** Max wait for browser URL so detection stays under 1.5s. */
const BROWSER_URL_TIMEOUT_MS = 500

/** Browser process name patterns (lowercase substring match). */
const BROWSER_PATTERNS = [
  'chrome',
  'safari',
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
 * - When the front app is a browser, calls PlatformSpecificManager.getCurrentBrowserUrl() for Safari/Chrome URL.
 * - Returns a unified snapshot: appName, windowTitle, url, bounds, isEmail.
 */
export class WindowTrackerService {
  private lastSnapshot: WindowTrackerSnapshot | null = null
  private listeners = new Set<(snapshot: WindowTrackerSnapshot | null) => void>()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingInfo: ActiveWindowInfo | null = null
  /** Cache to skip heavy URL extraction when app/title unchanged (sub-1.5s detection). */
  private lastUrlFetchKey: string | null = null
  private lastUrlFetchResult: string | null = null
  private static readonly URL_CACHE_TTL_MS = 2000
  private lastUrlFetchTime = 0

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
    this.lastUrlFetchKey = null
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
        this.lastUrlFetchKey = null
        for (const cb of this.listeners) cb(null)
      }
      return
    }

    const appName = info.owner?.name ?? ''
    const windowTitle = info.title ?? ''
    const fetchKey = `${appName}\n${windowTitle}`

    let url: string | null = normalizeUrl(info.url)
    const useCachedUrl =
      this.lastUrlFetchKey === fetchKey &&
      Date.now() - this.lastUrlFetchTime < WindowTrackerService.URL_CACHE_TTL_MS

    if (useCachedUrl && this.lastUrlFetchResult !== undefined) {
      url = this.lastUrlFetchResult
    } else if (isBrowserApp(info) && !url) {
      this.lastUrlFetchKey = fetchKey
      try {
        const platformUrl = await this.getCurrentBrowserUrlWithTimeout()
        url = normalizeUrl(platformUrl)
        this.lastUrlFetchResult = url
        this.lastUrlFetchTime = Date.now()
      } catch {
        this.lastUrlFetchResult = null
        this.lastUrlFetchTime = Date.now()
      }
    } else if (isBrowserApp(info) && url) {
      this.lastUrlFetchKey = fetchKey
      this.lastUrlFetchResult = url
      this.lastUrlFetchTime = Date.now()
    } else {
      this.lastUrlFetchKey = fetchKey
      this.lastUrlFetchResult = url
      this.lastUrlFetchTime = Date.now()
    }

    const snapshot = this.infoToSnapshot(info, url)
    const changed = this.snapshotChanged(this.lastSnapshot, snapshot)
    if (changed) {
      this.lastSnapshot = snapshot
      for (const cb of this.listeners) cb(snapshot)
    }
  }

  private getCurrentBrowserUrlWithTimeout(): Promise<string | null> {
    return Promise.race([
      this.platform.getCurrentBrowserUrl(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), BROWSER_URL_TIMEOUT_MS)
      ),
    ])
  }

  private infoToSnapshot(info: ActiveWindowInfo, enrichedUrl: string | null): WindowTrackerSnapshot {
    const url = enrichedUrl ?? normalizeUrl(info.url)
    const infoForEmailCheck = url != null ? { ...info, url } : info
    const check = isEmailApplication(infoForEmailCheck)
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
